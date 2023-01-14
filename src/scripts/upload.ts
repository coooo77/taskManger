import Main from '../util/main'
import { join, parse } from 'path'
import Common from '../util/common'
import { Upload } from '../types/config'
import { readFileSync, readdirSync } from 'fs'
import { upload } from 'youtube-videos-uploader'
import { VideoProgress, Video, MessageTransport } from 'youtube-videos-uploader/dist/types'

function getLiveList(listPath: string) {
  try {
    const streamList = readFileSync(listPath)

    return JSON.parse(streamList.toString()) as { liveStreams: { [key: string]: any } }
  } catch (error) {
    return
  }
}

function getUploadList(source: string) {
  const files = readdirSync(source)

  return {
    imagesToUpload: files.filter((i) => RegExp(/.(png|jpg|jpeg)$/gi).test(i)).map((i) => join(handleFolder, i)),
    videosToUpload: files.filter((i) => RegExp(/.(ts|mp4|flv|mpeg)$/gi).test(i)).map((i) => join(handleFolder, i))
  }
}

async function handleUpload(videos: string[], thumbnails: string[], messageTransport?: MessageTransport) {
  try {
    checkInternetUsage()

    const payload = videos.map((fileFullPath) => getPayload(fileFullPath, thumbnails))

    await upload(credentials, payload, puppeteerSetting, messageTransport).catch((e) => {
      // FIXME: upload ERROR: TimeoutError: waiting for waiting for file chooser failed: timeout 60000ms exceeded
      console.log('upload ERROR:', e)
    })
  } catch (error: any) {
    Common.msg(error.message, 'error')

    Common.errorHandler(error)

    stopUpload()

    process.exit(1)
  }
}

function getPayload(source: string, thumbnailSource: string[]): Video {
  const { name } = parse(source)

  const thumbnails = thumbnailSource.filter((filename) => filename.includes(name))

  const onProgress = showProgress
    ? (videoProgress: VideoProgress) => Common.msg(`upload file: ${source}, progress: ${videoProgress.progress}`)
    : undefined

  const onSuccess = async (videoUrl: string) => {
    await Common.wait(0.5)

    Common.msg(`upload file: ${source}, success: ${videoUrl}`, 'success')

    const resources = thumbnails.concat(source)

    if (keepFiles) {
      await Common.checkMoveFullPathFiles(resources, outputFolder)
    } else {
      Common.deleteFullPathFiles(resources)
    }

    checkInternetUsage()
  }

  const thumbnail = addThumbnail ? thumbnails[0] : undefined

  return {
    thumbnail,
    onSuccess,
    onProgress,
    path: source,
    title: name.replaceAll('_', ' '),
    uploadAsDraft,
    skipProcessingWait: true,
    description: new Date().toJSON()
  }
}

function stopUpload() {
  const config = Main.getConfig()

  config.tasks.forEach((task) => {
    if (task.type === 'upload') task.skip = true
  })

  Common.saveFile(Main.configPath, 'configure', config)
}

function checkInternetUsage() {
  const liveList = getLiveList(streamListPath)

  if (!liveList) return Common.msg('no liveList available')

  const liveListLength = Object.keys(liveList.liveStreams)

  if (skipWhenDownloadReach && liveListLength.length >= skipWhenDownloadReach) {
    Common.msg('Busy internet usage, skip upload')

    process.exit(0)
  } else {
    Common.msg(`Internet usage is ${liveListLength.length}, limit is ${skipWhenDownloadReach}`)
  }
}

function groupVideos(source: string[], unit = 10) {
  const group = []

  for (let i = 0; i < source.length; i += 10) {
    group.push(source.slice(i, i + 10))
  }

  return group
}

const payload = process.argv.splice(2)

const task = JSON.parse(payload[0]) as Upload

const { credentials, puppeteerSetting, streamListPath, skipWhenDownloadReach, showProgress } = Main.getConfig().upload

const { handleFolder, keepFiles, outputFolder, addThumbnail, uploadAsDraft } = task

const { videosToUpload, imagesToUpload } = getUploadList(handleFolder)

if (videosToUpload.length === 0) {
  Common.msg('No videos to upload, end process')

  process.exit(0)
}

const messageTransport: MessageTransport = {
  log: console.log,
  userAction: console.log,
  onSmsVerificationCodeSent: Common.getPromptFn('Enter the code that was sent to you via SMS: ')
}

const videoGroup = groupVideos(videosToUpload)

Common.msg('Start to upload videos')

videoGroup
  .reduce((acc, cur) => acc.then(() => handleUpload(cur, imagesToUpload, messageTransport)), Promise.resolve())
  .then(Common.msg.bind(Common, 'Upload complete', 'success'))
  .catch(Common.errorHandler)
  .finally(async () => {
    await Common.wait(5)

    process.exit(0)
  })
