import Main from '../util/main'
import { join, parse } from 'path'
import Common from '../util/common'
import { Upload } from '../types/config'
import { readFileSync, readdirSync } from 'fs'
import { upload } from 'youtube-videos-uploader'
import { VideoProgress, Video } from 'youtube-videos-uploader/dist/types'

function getLiveList(listPath: string) {
  try {
    const streamList = readFileSync(listPath)

    return JSON.parse(streamList.toString()) as { ids: string[] }
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

async function handleUpload(videos: string[], thumbnails: string[]) {
  try {
    checkInternetUsage()

    const payload = videos.map((fileFullPath) => getPayload(fileFullPath, thumbnails))

    await upload(credentials, payload, puppeteerSetting).catch((e) => {
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
    ? (progress: VideoProgress) => {
        Common.msg(`upload file: ${source}, progress: ${progress.progress}`)
      }
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
    title: name,
    uploadAsDraft,
    skipProcessingWait: true,
    description: new Date().toJSON()
  }
}

async function startUpload(source: string, thumbnailSource: string[]) {
  try {
    checkInternetUsage()

    const { name } = parse(source)

    const thumbnails = thumbnailSource.filter((filename) => filename.includes(name))

    const thumbnail = addThumbnail ? thumbnails[0] : undefined

    const onProgress = showProgress
      ? (progress: VideoProgress) => {
          Common.msg(`upload file: ${source}, progress: ${progress.progress}`)
        }
      : undefined

    const onSuccess = (videoUrl: string) => {
      Common.msg(`upload file: ${source}, success: ${videoUrl}`, 'success')
    }

    const videoInfo: Video = {
      thumbnail,
      onSuccess,
      onProgress,
      path: source,
      title: name,
      uploadAsDraft,
      skipProcessingWait: true,
      description: new Date().toJSON()
    }

    const isUploadSuccess = await upload(credentials, [videoInfo], puppeteerSetting)

    await Common.wait(0.5)

    if (isUploadSuccess[0].length === 0) return failUpload(source)

    const resources = thumbnails.concat(source)

    if (keepFiles) return await Common.checkMoveFullPathFiles(resources, outputFolder)

    Common.deleteFullPathFiles(resources)
  } catch (error: any) {
    Common.msg(error.message, 'error')

    Common.errorHandler(error)
  }
}

function failUpload(source: string) {
  const message = `Fail to upload video : ${source}`

  Common.msg(message, 'warn')

  Common.errorHandler({ message })

  stopUpload()

  process.exit(0)
}

function stopUpload() {
  const config = Main.getConfig()

  config.tasks.forEach((task) => {
    if (task.type === 'upload') task.skip = true
  })

  Common.saveFile(Main.configPath, 'configure', config)
}

function checkInternetUsage() {
  const liveList = getLiveList(streamLisPath)

  if (!liveList) return Common.msg('no liveList available')

  if (skipWhenDownloadReach && liveList.ids.length >= skipWhenDownloadReach) {
    Common.msg('Busy internet usage, skip upload')

    process.exit(0)
  } else {
    Common.msg(`Internet usage is ${liveList.ids.length}, limit is ${skipWhenDownloadReach}`)
  }
}

const payload = process.argv.splice(2)

const task = JSON.parse(payload[0]) as Upload

const { credentials, puppeteerSetting, streamLisPath, skipWhenDownloadReach, showProgress } = Main.getConfig().upload

const { handleFolder, keepFiles, outputFolder, addThumbnail, uploadAsDraft } = task

const { videosToUpload, imagesToUpload } = getUploadList(handleFolder)

if (videosToUpload.length === 0) {
  Common.msg('No videos to upload, end process')

  process.exit(0)
}

// videosToUpload
//   .reduce((acc, cur) => acc.then(() => startUpload(cur, imagesToUpload)), Promise.resolve())
//   .finally(() => process.exit(0))

Common.msg('Start to upload videos')

handleUpload(videosToUpload, imagesToUpload).then(() => {
  Common.msg('Upload complete', 'success')

  process.exit(0)
})
