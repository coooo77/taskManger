import fs from 'fs'
import { join, parse } from 'path'
import FFmpeg from '../util/ffmpeg.js'
import Common from '../util/common.js'
import { Convert } from '../types/config.js'

process.once('message', (task: Convert) => {
  /** init */
  Common.msg('Start to convert videos')

  const { exceptions, handleFolder, includeExt, keepFiles, outputFolder, screenshot, split, includes } = task

  const target = Common.getTargetFiles([handleFolder], includeExt, { includes, exceptions })

  const files = Object.values(target)[0]

  if (!files || files.length === 0) {
    Common.msg('No files to convert. stop task')

    process.exit(0)
  }

  /** functions */
  async function starConvert(source: string) {
    try {
      if (!fs.existsSync(source)) return Common.msg(`Can not find source: ${source} for convert`, 'warn')

      const convertFilePath = await FFmpeg.convert(source, task, outputFolder)

      if (!split) return await handleConvertEnd([source], [convertFilePath])

      const splitOutPut = await FFmpeg.checkAndSplitVideo(convertFilePath, outputFolder)

      const isSplitSuccess = splitOutPut.length !== 0

      if (isSplitSuccess) {
        await handleConvertEnd([source, convertFilePath], splitOutPut)
      } else {
        await handleConvertEnd([source], [convertFilePath])
      }
    } catch (error) {
      Common.msg(`Failed to convert file: ${source}`, 'error')

      Common.errorHandler(error)
    }
  }

  async function handleConvertEnd(sourceFilesPath: string[], convertFilePath?: string[]) {
    await Common.wait(5)

    if (!convertFilePath?.length) return

    if (keepFiles) {
      await Common.moveFullPathFiles(sourceFilesPath, outputFolder)
    } else {
      Common.deleteFullPathFiles(sourceFilesPath)
    }

    await Common.moveFullPathFiles(convertFilePath, outputFolder)

    if (!screenshot) return

    for (const files of convertFilePath) {
      const { base } = parse(files)

      const outPutFilePath = join(outputFolder, base)

      await FFmpeg.screenshot(outPutFilePath)
    }
  }

  function handleTaskClose() {
    Common.msg('Convert files done', 'success')

    process.exit(0)
  }

  /** task content */
  files
    .map((filename) => join(handleFolder, filename))
    .reduce((acc, filename) => acc.then(() => starConvert(filename)), Promise.resolve())
    .finally(handleTaskClose)
})
