type Preset =
  | 'ultrafast'
  | 'superfast'
  | 'veryfast'
  | 'faster'
  | 'fast'
  | 'medium'
  | 'slow'
  | 'slower'
  | 'veryslow'
  | 'placebo'

export interface CustomSetting {
  ffmpegSetting: string
  suffix: string
}

interface ConvertOption {
  ext: string
  defaultSuffix: string
  showConvertCmd?: boolean
  defaultFFmpegSetting: string
  customSetting: Record<string, CustomSetting>
}

interface ScreenshotOption {
  outputFolder?: string
  count?: number
  timestamp?: (number | string)[]
  interval?: number
}

interface CombineOption {
  suffixForCombine: string
  fileNameClipper: string
  showCombineCmd?: boolean
}

interface SplitOption {
  splitIntervalInSec: number
  invalidMaximumDuration?: number
  showSplitCmd?: boolean
}

interface PuppeteerSetting {
  executablePath: string
  headless: boolean
}

interface Credentials {
  email: string
  pass: string
  recoveryemail: string
}

interface Time {
  hour: number
  min?: number
}

interface ExecutableTime {
  to: Time
  from: Time
}

interface UploadOption {
  showProgress?: boolean
  credentials: Credentials
  puppeteerSetting: PuppeteerSetting
  streamListPath?: string
  skipWhenDownloadReach?: number
  executableTime?: ExecutableTime
}

interface TaskCommonSetting {
  sourceFolder: string[]
  includeExt: string[]
  exceptions?: string[]
  /** specify some files only */
  includes?: string[]
}

export interface Convert extends TaskCommonSetting {
  type: 'convert'
  handleFolder: string
  outputFolder: string
  screenshot: boolean
  ffmpegSetting?: string
  suffix?: string
  split?: boolean
  skip?: boolean
  keepFiles?: boolean
}

export interface Combine extends TaskCommonSetting {
  type: 'combine'
  handleFolder: string
  outputFolder: string
  screenshot: boolean
  split?: boolean
  skip?: boolean
  keepFiles?: boolean
}

export interface Upload extends TaskCommonSetting {
  type: 'upload'
  handleFolder: string
  outputFolder: string
  skip?: boolean
  keepFiles?: boolean
}

export interface Move extends TaskCommonSetting {
  type: 'move'
  targetFolder: string
  skip?: boolean
}

export type Task = Convert | Combine | Upload | Move

export interface Config {
  pause: boolean
  checkInterval: number
  tasks: Task[]
  screenshot: ScreenshotOption
  convert: ConvertOption
  combine: CombineOption
  split: SplitOption
  upload: UploadOption
}
