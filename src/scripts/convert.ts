import { join } from 'path'
import FFmpeg from '../util/ffmpeg'
import Common from '../util/common'
import { Convert } from '../types/config'

const payload = process.argv.splice(2)

const task = JSON.parse(payload[0]) as Convert

const { exceptions, handleFolder, includeExt, keepFiles, outputFolder, screenshot, split } = task

const target = Common.getTargetFiles([handleFolder], includeExt, exceptions)

const files = Object.values(target)[0]

if (files.length === 0) process.exit(0)

files
  .map((filename) => join(handleFolder, filename))
  .reduce((acc, filename) => acc.then(() => starConvert(filename)), Promise.resolve())
  .finally(() => process.exit(0))

async function starConvert(source: string) {
  try {
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
  if (!convertFilePath?.length) return

  if (keepFiles) {
    Common.checkMoveFullPathFiles(sourceFilesPath, outputFolder)
  } else {
    Common.deleteFullPathFiles(sourceFilesPath)
  }

  Common.checkMoveFullPathFiles(convertFilePath, outputFolder)

  if (!screenshot) return

  for (const files of convertFilePath) {
    await FFmpeg.screenshot(files)
  }
}
