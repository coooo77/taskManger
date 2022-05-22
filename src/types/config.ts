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

interface ConvertOption {
  ext: string
  suffixForMute: string
  suffixForCompress: string
  preset: Preset
  crf: number
  showConvertCmd?: boolean
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
  showSplitCmd?: boolean
}

interface TaskCommonSetting {
  sourceFolder: string[]
  includeExt: string[]
  exceptions?: string[]
}

export interface Convert extends TaskCommonSetting {
  type: 'convert'
  handleFolder: string
  outputFolder: string
  screenshot: boolean
  mute: boolean
  compress: boolean
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
  skipWhenDownloadReach: number
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
  pauseUpload: boolean
  checkInterval: number
  tasks: Task[]
  screenshot: ScreenshotOption
  convert: ConvertOption
  combine: CombineOption
  split: SplitOption
}
