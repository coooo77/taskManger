'use strict'
import { join, parse } from 'path'
import { readFileSync, readdirSync } from 'fs'

import clipboard from 'clipboardy'
import { mouse, keyboard, Key, Point, Button } from '@nut-tree/nut-js'

import Main from '../util/main.js'
import Common from '../util/common.js'
import HandleTime from '../util/handleTime.js'

import type { Upload } from '../types/config.js'

const { upload } = Main.getConfig()
const { streamListPath, skipWhenDownloadReach, executableTime } = upload

/** desktop automatic actions */
const positions = {
  ytBrowser: { x: 721, y: 468 },
  uploadBtn: { x: 1758, y: 100 },
  uploadVideo: { x: 1720, y: 138 },
  selectFile: { x: 940, y: 665 },
  videoFileToUpload: { x: 229, y: 188 },
  modalCloseBtn: { x: 1383, y: 147 },
  dragFrom: { x: 1429, y: 709 },
  dragTo: { x: 1805, y: 961 },
  miniBrowser: { x: 1811, y: 20 }
} as const

const locations = Object.entries(positions).reduce((acc, [key, { x, y }]) => {
  const k = key as keyof typeof positions
  acc[k] = new Point(x, y)
  return acc
}, {} as Record<keyof typeof positions, Point>)

const keyPressRelease = async (...key: Key[]) => {
  await keyboard.pressKey(...key)
  await keyboard.releaseKey(...key)
}

interface MouseMoveToClickOptions {
  preWait?: number
  postWait?: number
}

const mouseMoveToClick = async (points: Point, options: MouseMoveToClickOptions = {}) => {
  const { preWait, postWait = 1 } = options

  if (preWait) await Common.wait(preWait)
  await mouse.move([points])
  await mouse.click(Button.LEFT)
  if (postWait) await Common.wait(postWait)
}

/** upload process */
const openYtBrowser = async () => {
  // await keyPressRelease(Key.LeftWin, Key.D)
  await keyPressRelease(Key.LeftWin)
  await mouseMoveToClick(locations.ytBrowser, { preWait: 2, postWait: 8 })
  await keyPressRelease(Key.LeftControl, Key.W)
}

const getStatusString = async () => {
  await mouse.move([locations.dragFrom])
  await mouse.pressButton(Button.LEFT)
  await mouse.move([locations.dragTo])
  await mouse.releaseButton(Button.LEFT)
  await keyPressRelease(Key.LeftControl, Key.C)
  return clipboard.readSync()
}

const uploadVideoAction = async () => {
  await mouseMoveToClick(locations.uploadBtn, { postWait: 0.5 })
  await mouseMoveToClick(locations.uploadVideo)
  await mouseMoveToClick(locations.selectFile, { postWait: 1 })
  await mouseMoveToClick(locations.videoFileToUpload)
  await keyPressRelease(Key.Enter)
  await mouseMoveToClick(locations.modalCloseBtn, { preWait: 10 })
  await mouse.move([locations.dragTo])
  await mouse.scrollDown(10000)
}

/* should abort upload progress */
const getLiveList = (listPath: string): { liveStreams: Record<string, any> } => {
  try {
    const streamList = readFileSync(listPath, 'utf8')
    return JSON.parse(streamList)
  } catch {
    return { liveStreams: {} }
  }
}

const isReachDownloadLimit = () => {
  if (!streamListPath || !skipWhenDownloadReach) return false

  const list = getLiveList(streamListPath)
  const liveListLength = Object.keys(list?.liveStreams).length

  const isOverLimit = skipWhenDownloadReach < liveListLength
  if (isOverLimit) {
    Common.msg('Busy internet usage, skip upload')
  } else {
    Common.msg(`Internet usage: ${liveListLength}, limit ${skipWhenDownloadReach}`)
  }

  return isOverLimit
}

const isExceedExecuteTime = () => {
  if (!executableTime) return false

  const { from, to } = executableTime
  const currentTime = HandleTime.getUTCPlus8TimeNow()
  const toTime = HandleTime.getSpecifiedTimeOfDay(currentTime, to.hour, to.min)
  const fromTime = HandleTime.getSpecifiedTimeOfDay(currentTime, from.hour, from.min)
  const isExecutableTime = HandleTime.isBetween(currentTime, fromTime, toTime)

  if (isExecutableTime) {
    Common.msg(
      `\r\nNow: ${HandleTime.getFullTimeString(currentTime)}
      \rFrom: ${HandleTime.getFullTimeString(fromTime)}
      \rTo: ${HandleTime.getFullTimeString(toTime)}`
    )
  } else {
    Common.msg('Time exceed, skip upload')
  }

  return !isExecutableTime
}

const checkShouldAbortUploadProgress = async (closeBrowser: boolean = false) => {
  const shouldAbort = isReachDownloadLimit() || isExceedExecuteTime()
  if (!shouldAbort) return

  if (closeBrowser) await mouseMoveToClick(locations.miniBrowser)
  process.exit(0)
}

/** handle files */
const getResource = (sourceDir: string) => {
  const files = readdirSync(sourceDir)

  return {
    imagesToUpload: files.filter((i) => RegExp(/.(png|jpg|jpeg)$/gi).test(i)),
    videosToUpload: files.filter((i) => RegExp(/.(ts|mp4|flv|mpeg)$/gi).test(i))
  }
}

const clearOldFiles = async (uploadingDir: string, sourceDir: string) => {
  const { videosToUpload, imagesToUpload } = getResource(uploadingDir)
  await Common.checkMoveFiles(videosToUpload, uploadingDir, sourceDir)
  await Common.checkMoveFiles(imagesToUpload, uploadingDir, sourceDir)
}

const status = {
  uploading: '上傳中',
  uploadDone: '上傳完畢',
  reachLimit: '已達每日上傳'
}

const ERROR_LIMIT = 200

process.once('message', async (task: Upload) => {
  const { handleFolder, outputFolder, keepFiles } = task
  const { videosToUpload, imagesToUpload } = getResource(handleFolder)

  if (videosToUpload.length === 0) {
    Common.msg('No videos to upload, end process')
    process.exit(0)
  } else {
    Common.msg('Start uploading videos ...')
  }

  await checkShouldAbortUploadProgress()

  const uploadingFolder = join(handleFolder, 'uploading')
  Common.makeDirIfNotExist(uploadingFolder)
  await clearOldFiles(uploadingFolder, handleFolder)

  await openYtBrowser()

  let isAbortUpload = false
  for (const video of videosToUpload) {
    await Common.checkMoveFiles([video], handleFolder, uploadingFolder)
    await uploadVideoAction()

    let errorCount = 0
    let statusString = ''
    let isUploading = true

    do {
      statusString = await getStatusString()

      if (!statusString.includes(status.uploading) || (statusString && !statusString.includes(video))) {
        errorCount++
      }

      isUploading = !statusString.includes(status.uploadDone)

      if (statusString.includes(status.reachLimit) || errorCount >= ERROR_LIMIT) {
        isAbortUpload = true
        await Common.checkMoveFiles([video], uploadingFolder, handleFolder)
        break
      }

      console.log('====== [statusString] ======\r\n', statusString)
      if (isUploading) await Common.wait(10)
    } while (isUploading)

    if (isAbortUpload) break

    const { name } = parse(video)
    const screenshots = imagesToUpload.filter((f) => f.includes(name)).map((f) => join(handleFolder, f))
    const videoPath = join(uploadingFolder, video)
    const resources = screenshots.concat(videoPath)

    if (keepFiles) {
      await Common.moveFullPathFiles(resources, outputFolder)
    } else {
      Common.deleteFullPathFiles(resources)
    }

    await checkShouldAbortUploadProgress(true)
  }

  Common.msg('Upload complete', isAbortUpload ? 'error' : 'success')
  await mouseMoveToClick(locations.miniBrowser)
  process.exit(0)
})
