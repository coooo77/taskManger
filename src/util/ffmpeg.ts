import fs from 'fs'
import path from 'path'
import Main from './main.js'
import Common from './common.js'
import cp from 'child_process'
import type { Convert, CustomSetting } from '../types/config.js'

type GetMediaDurationRes<T extends boolean> = T extends boolean ? number : string

export default class FFmpeg {
  static getMediaDuration<T extends boolean = true>(videoPath: string, showInSeconds = true): GetMediaDurationRes<T> {
    let command = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 `

    if (!showInSeconds) command += ' -sexagesimal'

    command += ` ${videoPath}`

    const stdout = cp.execSync(command).toString()

    return (showInSeconds ? parseFloat(stdout) : stdout) as GetMediaDurationRes<T>
  }

  static getFFmpegCmdFileName(command: string) {
    const commands = command.split(' ')
    const inputIndex = commands.indexOf('-i')
    if (inputIndex === -1 || !commands[inputIndex + 1]) return 'unknown file name'
    return path.parse(commands[inputIndex + 1]).name
  }

  static spawnFFmpeg(command: string, option: { cwd?: string; shell?: boolean } = {}) {
    return new Promise((resolve, reject) => {
      try {
        const hasOptions = Object.keys(option).length !== 0

        const task = hasOptions
          ? cp.spawn('ffmpeg', command.split(' '), option)
          : cp.spawn('ffmpeg', command.split(' '))

        const filename = FFmpeg.getFFmpegCmdFileName(command)
        const patternTime = /time=([\d:]+.\d+)/
        const patternSpeed = /speed=(.*[\d.]+x)/

        task.stderr.on('data', (data) => {
          const message = data.toString()
          const time = message.match(patternTime)
          const speed = message.match(patternSpeed)

          if (time && speed) {
            console.log(`${filename} - time: ${time[1]} - speed: ${speed[1]}`)
          } else {
            console.log(message)
          }
        })

        task.on('close', resolve)
      } catch (error) {
        Common.errorHandler(error)

        reject()
      }
    })
  }

  /**
   * check duration of source video is less than length of split, if it is then split it and return splitted filenames, or return empty array.
   * @param videoPath path of video to handle
   * @param exportPath path to export video, optional
   * @returns {string[]} splitted filenames with full path
   */
  static async checkAndSplitVideo(videoPath: string, exportPath?: string): Promise<string[]> {
    const { splitIntervalInSec, invalidMaximumDuration } = Main.getConfig().split

    const videoDuration = await FFmpeg.getMediaDuration(videoPath)

    if (
      Number.isNaN(videoDuration) ||
      videoDuration <= splitIntervalInSec ||
      (invalidMaximumDuration && videoDuration > invalidMaximumDuration)
    )
      return []

    const { name, ext, dir } = path.parse(videoPath)

    const originDir = path.dirname(videoPath)

    const exportFilePath = exportPath || originDir

    const options = `-i ${videoPath} -ss 0 -f segment -segment_start_number 1 -segment_time ${splitIntervalInSec} -vcodec copy -individual_header_trailer 1 -break_non_keyframes 1 -reset_timestamps 1 ${exportFilePath}\\${name}_%03d${ext}`

    const command = `ffmpeg ${options}`

    const config = Main.getConfig()

    if (config.split.showSplitCmd) {
      cp.execSync(`start ${command}`, { cwd: dir })
    } else {
      await FFmpeg.spawnFFmpeg(options, { cwd: dir })
    }

    return Array(Math.ceil(videoDuration / splitIntervalInSec))
      .fill(null)
      .map((v, i) => `${exportFilePath}\\${name}_${String(i + 1).padStart(3, '0')}${ext}`)
  }

  static async screenshot(videoPath: string) {
    const config = Main.getConfig()

    const { count, timestamp, interval, outputFolder } = config.screenshot

    if (count) await FFmpeg.countScreenshot(videoPath, count, outputFolder)

    if (interval) await FFmpeg.intervalScreenshot(videoPath, interval, outputFolder)

    if (timestamp) await FFmpeg.timestampScreenshot(videoPath, timestamp, outputFolder)
  }

  static async timestampScreenshot(videoPath: string, timestamp: (number | string)[], exportPath?: string) {
    const times = timestamp.map((i) => String(i))

    if (times.length === 0) return

    const command = FFmpeg.getScreenshotCmd(times, videoPath, 'timestamp', exportPath)

    cp.spawnSync(command, { shell: true })
  }

  static async intervalScreenshot(videoPath: string, interval: number, exportPath?: string) {
    const videoDuration = await FFmpeg.getMediaDuration(videoPath)

    const times = Array(Math.floor(videoDuration / interval))
      .fill(null)
      .map((v, i) => `${interval * i}`)

    if (times.length === 0) return

    const command = FFmpeg.getScreenshotCmd(times, videoPath, 'interval', exportPath)

    cp.spawnSync(command, { shell: true })
  }

  static async countScreenshot(videoPath: string, count: number, exportPath?: string) {
    const videoDuration = await FFmpeg.getMediaDuration(videoPath)

    const interval = Number((videoDuration / count).toFixed(2))

    const times = Array(Math.floor(count))
      .fill(null)
      .map((v, i) => `${interval * i}`)

    if (times.length === 0) return

    const command = FFmpeg.getScreenshotCmd(times, videoPath, 'count', exportPath)

    cp.spawnSync(command, { shell: true })
  }

  static getScreenshotCmd(
    times: string[],
    videoPath: string,
    type: 'timestamp' | 'interval' | 'count',
    exportPath?: string
  ) {
    const { dir, name } = path.parse(videoPath)

    const exportFilePath = exportPath || dir

    const exportName = `${exportFilePath}\\${name}_${type}`

    return times
      .map(
        (time, index) =>
          `ffmpeg -y -ss ${time} -i ${videoPath} -vframes 1 ${exportName}_${FFmpeg.getScreenshotNum(index + 1)}.jpg`
      )
      .join(' && ')
  }

  static getScreenshotNum(index: number) {
    return `${String(index).padStart(2, '0')}`
  }

  static makeCombineList(userID: string, filesPath: string[]) {
    const source = path.parse(filesPath[0]).dir

    const listPath = path.join(source, `${userID}.txt`)

    const txt = filesPath
      .map((filePath) => path.parse(filePath).base)
      .map((filename) => `file '${filename}'`)
      .join('\r\n')

    fs.writeFileSync(listPath, txt)

    return listPath
  }

  static deleteCombineList(listPath: string) {
    const { dir, base } = path.parse(listPath)

    Common.deleteFile(dir, base)
  }

  static async combine(userID: string, filesPath: string[]) {
    const { combine } = Main.getConfig()

    const { suffixForCombine, showCombineCmd } = combine

    const listPath = FFmpeg.makeCombineList(userID, filesPath)

    const { name, ext, dir } = path.parse(filesPath[0])

    const outPut = `${dir}\\${name}${suffixForCombine}${ext}`

    const cmd = `-f concat -safe 0 -i ${listPath} -y -c copy ${outPut}`

    if (showCombineCmd) {
      cp.execSync(`start ffmpeg ${cmd}`, { cwd: dir })
    } else {
      await FFmpeg.spawnFFmpeg(cmd, { cwd: dir })
    }

    FFmpeg.deleteCombineList(listPath)

    return outPut
  }
  static async convert(filePath: string, task: Convert, exportPath?: string) {
    const { dir, name } = path.parse(filePath)
    const { convert } = Main.getConfig()
    const { ext, showConvertCmd, defaultFFmpegSetting, defaultSuffix } = convert

    let suffix = defaultSuffix
    let ffmpegSetting = defaultFFmpegSetting
    const customSetting = task.customSetting || convert.customSetting

    if (customSetting) {
      for (const setting of customSetting) {
        const isValid = setting.includes.some((streamerName) => name.includes(streamerName))
        if (!isValid) continue

        suffix = setting.suffix
        ffmpegSetting = setting.ffmpegSetting
        break
      }
    }

    const exportFilePath = exportPath || dir
    const convertFilePath = path.join(exportFilePath, `${name}${suffix}.${ext}`)

    const cmd = `-i ${filePath} -y ${ffmpegSetting} ${convertFilePath}`

    if (showConvertCmd) {
      cp.execSync(`start ffmpeg ${cmd}`)
    } else {
      await FFmpeg.spawnFFmpeg(cmd)
    }

    return convertFilePath
  }
}
