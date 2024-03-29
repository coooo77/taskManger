import Main from '../util/main.js'
import { join, parse } from 'path'
import FFmpeg from '../util/ffmpeg.js'
import Common from '../util/common.js'
import { Combine } from '../types/config.js'

type FilePath = string

interface ListToHandle {
  [userID: string]: FilePath[]
}

process.once('message', (task: Combine) => {
  /** init */
  const { handleFolder, outputFolder, includeExt, exceptions, split, keepFiles, screenshot, includes } = task

  const config = Main.getConfig()

  const { fileNameClipper } = config.combine

  /* functions */
  function getCombineList(source: string) {
    const target = Common.getTargetFiles([source], includeExt, { includes, exceptions })

    const files = Object.values(target)[0]

    if (files.length === 0) return {}

    return files.reduce((acc, cur) => {
      const isPixivDefaultAccount = cur.includes('user_')

      const words = cur.split(fileNameClipper)

      const userID = isPixivDefaultAccount ? `user_${words[1]}` : words[0]

      acc[userID] = (acc[userID] || []).concat(join(source, cur))

      return acc
    }, {} as ListToHandle)
  }

  function startToCombine(resolve: Promise<void>, handleList: [string, string[]]) {
    return resolve.then(() => combine(handleList[0], handleList[1]))
  }

  async function combine(userID: string, filesPath: string[]) {
    try {
      if (filesPath.length < 2) return await handleCombineEnd(filesPath)

      const outPut = await FFmpeg.combine(userID, filesPath)

      if (!split) return await handleCombineEnd(filesPath, [outPut])

      const splitOutPut = await FFmpeg.checkAndSplitVideo(outPut, outputFolder)

      const isSplitSuccess = splitOutPut.length !== 0

      if (isSplitSuccess) {
        await handleCombineEnd(filesPath.concat(outPut), splitOutPut)
      } else {
        await handleCombineEnd(filesPath, [outPut])
      }
    } catch (error) {
      Common.msg(`Failed to combine ${userID}`, 'error')

      Common.errorHandler(error)
    }
  }

  /**
   * @param sourceFilesPath paths of videos which are for combine
   * @param combinedFilePath videos combined, may have been splitted
   */
  async function handleCombineEnd(sourceFilesPath: string[], combinedFilePath?: string[]) {
    await Common.wait(5)

    const isCombined = combinedFilePath?.length !== 0

    if (!isCombined) {
      await Common.moveFullPathFiles(sourceFilesPath, outputFolder)
    } else {
      if (!combinedFilePath?.length) return

      if (keepFiles) {
        await Common.moveFullPathFiles(sourceFilesPath, outputFolder)
      } else {
        Common.deleteFullPathFiles(sourceFilesPath)
      }

      await Common.moveFullPathFiles(combinedFilePath, outputFolder)

      if (!screenshot) return

      for (const files of combinedFilePath) {
        const { base } = parse(files)

        const outPutFilePath = join(outputFolder, base)

        await FFmpeg.screenshot(outPutFilePath)
      }
    }
  }

  /** task content */
  Common.msg('Start to combine videos')

  Object.entries(getCombineList(handleFolder))
    .reduce(startToCombine, Promise.resolve())
    .finally(() => {
      Common.msg('Combine files done', 'success')

      process.exit(0)
    })
})
