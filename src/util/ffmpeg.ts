import fs from 'fs'
import path from 'path'
import Main from './main'
import Common from './common'
import cp from 'child_process'

export default class FFmpeg {
  static getMediaDuration(videoPath: string, showInSeconds = true): Promise<number> {
    return new Promise((resolve, reject) => {
      try {
        const options = `-v error${
          showInSeconds ? ' ' : ' -sexagesimal '
        }-show_entries format=duration -of default=noprint_wrappers=1:nokey=1 ${videoPath}`

        const task = cp.spawn('ffprobe', options.split(' '))

        task.stdout.on('data', (msg) => {
          resolve(Number(msg.toString()))
        })
      } catch (error) {
        Common.errorHandler(error)

        reject(error)
      }
    })
  }

  static spawnSplit(command: string, cwd: string) {
    return new Promise((resolve, reject) => {
      try {
        const task = cp.spawn('ffmpeg', command.split(' '), { cwd })

        task.stderr.on('data', (data) => console.log('stderr', data.toString()))

        task.on('close', resolve)
      } catch (error) {
        Common.errorHandler(error)

        reject()
      }
    })
  }

  /**
   * check duration of source video is less than length of split, if it is than split it and return splitted filenames, or return empty array.
   * @param videoPath path of video to handle
   * @param splitLength length of split
   * @param exportPath path to export video, optional
   * @returns {string[]} splitted filenames with full path
   */
  static async checkAndSplitVideo(videoPath: string, splitLength: number, exportPath?: string): Promise<string[]> {
    const videoDuration = await FFmpeg.getMediaDuration(videoPath)

    if (Number.isNaN(videoDuration) || videoDuration <= splitLength) return []

    const { name, ext, dir } = path.parse(videoPath)

    const originDir = path.dirname(videoPath)

    const exportFilePath = exportPath || originDir

    const options = `-i ${videoPath} -ss 0 -f segment -segment_start_number 1 -segment_time ${splitLength} -vcodec copy -individual_header_trailer 1 -break_non_keyframes 1 -reset_timestamps 1 ${exportFilePath}\\${name}_%03d${ext}`

    const command = `ffmpeg ${options}`

    const config = Main.getConfig()

    if (config.split.showSplitCmd) {
      cp.execSync(`start ${command}`, { cwd: dir })
    } else {
      await FFmpeg.spawnSplit(options, dir)
    }

    return Array(Math.ceil(videoDuration / splitLength))
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

  static timestampScreenshot(videoPath: string, timestamp: (number | string)[], exportPath?: string) {
    const times = timestamp.map((i) => String(i))

    const command = FFmpeg.getScreenshotCmd(times, videoPath, 'timestamp', exportPath)

    cp.execSync(command)
  }

  static async intervalScreenshot(videoPath: string, interval: number, exportPath?: string) {
    const videoDuration = await FFmpeg.getMediaDuration(videoPath)

    const times = Array(Math.floor(videoDuration / interval))
      .fill(null)
      .map((v, i) => `${interval * i}`)

    const command = FFmpeg.getScreenshotCmd(times, videoPath, 'interval', exportPath)

    cp.execSync(command)
  }

  static async countScreenshot(videoPath: string, count: number, exportPath?: string) {
    const videoDuration = await FFmpeg.getMediaDuration(videoPath)

    const interval = Number((videoDuration / count).toFixed(2))

    const times = Array(Math.floor(count))
      .fill(null)
      .map((v, i) => `${interval * i}`)

    const command = FFmpeg.getScreenshotCmd(times, videoPath, 'count', exportPath)

    cp.execSync(command)
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

    const cmd = `-f concat -safe 0 -i ${listPath} -c copy ${outPut}`

    if (showCombineCmd) {
      cp.execSync(`start ffmpeg ${cmd}`, { cwd: dir })
    } else {
      await FFmpeg.spawnCombine(cmd.split(' '), dir)
    }

    FFmpeg.deleteCombineList(listPath)

    return outPut
  }

  static spawnCombine(command: string[], cwd: string) {
    return new Promise((resolve, reject) => {
      try {
        const task = cp.spawn('ffmpeg', command, { cwd })

        task.stderr.on('data', (msg) => console.log(msg.toString()))

        task.on('close', resolve)
      } catch (error) {
        Common.errorHandler(error)

        reject()
      }
    })
  }
}
