## Config

### Config.pause

是否停止整個 APP 運行

### Config.checkInterval

APP 執行任務間隔，單位秒

### Config.screenshot

影片截圖設定，count、timestamp、interval 可以同時設定

```typescript
interface ScreenshotOption {
  // 輸出資料夾，預設截圖影片來源的位置
  outputFolder?: string
  // 截圖數量，根據影片長度截圖
  count?: number
  // 根據 timestamp 截圖
  timestamp?: (number | string)[]
  // 固定時間長度截圖，單位秒，例如 60 秒一張
  interval?: number
}
```

### Config.convert

轉換通用設定，如果 Config.tasks.Convert 找不到設定，就會從這裡取得

```typescript
interface ConvertOption {
  // 輸出 extension 類型
  ext: string
  // 輸出檔名後輟
  defaultSuffix: string
  // 處理時是否列印出處理內容
  showConvertCmd?: boolean
  // convert 任務預設 ffmpeg 設定
  defaultFFmpegSetting: string
  // 根據特定檔名處理
  customSetting?: CustomSetting[]
}
```

```typescript
interface CustomSetting {
  // 當 includes 的字串有包含在檔案名稱時，使用這個 CustomSetting 設定
  includes: string[]
  // ffmpeg 設定
  ffmpegSetting: string
  // 輸出檔名後輟
  suffix: string
}
```

### Config.combine

合併通用設定，如果 Config.tasks.Convert 找不到設定，就會從這裡取得

```typescript
interface CombineOption {
  // 輸出檔名後輟
  suffixForCombine: string
  // 根據 fileNameClipper 判斷是否為同一個合併檔案
  fileNameClipper: string
  // 處理時是否列印出處理內容
  showCombineCmd?: boolean
}
```

#### Config.combine.fileNameClipper

例如檔案名稱如下，fileNameClipper 為 "\_"

```
StreamerA_20241130_1655.mp4
StreamerA_20241130_1755.mp4
StreamerA_20241130_1855.mp4
StreamerB_20241130_1855.mp4
StreamerB_20241130_1855.mp4
```

會將檔案用 \_ 分割後取第一個文字當作合併條件，所以需要合併 StreamerA 跟 StreamerB

### Config.split

```typescript
interface SplitOption {
  // 影片超過指定時間就分割
  splitIntervalInSec: number
  // 如果影片長度超過這個設定就進行分割
  invalidMaximumDuration?: number
  // 處理時是否列印出處理內容
  showSplitCmd?: boolean
}
```

### Config.upload

```typescript
// YT 帳號、密碼、信箱
interface Credentials {
  email: string
  pass: string
  recoveryemail: string
}

interface UploadOption {
  credentials: Credentials
  puppeteerSetting: PuppeteerSetting
  streamListPath: string
  showProgress?: boolean
  skipWhenDownloadReach?: number
}
```

### Config.tasks

```typescript
interface TaskCommonSetting {
  // 來源資料夾
  sourceFolder: string[]
  // 目標檔案 extension 類型 ex: "mp4", "jpg", "mkv"
  includeExt: string[]
  // 如果檔案名稱包含 exceptions 的字串，那不會處理這個檔案
  exceptions?: string[]
  // 當設定 includes，只有檔案名稱含有 includes 字串時才會處理
  includes?: string[]
  // 是否略過該任務
  skip?: boolean
}
```

#### Config.tasks.Convert

```typescript
interface Convert extends TaskCommonSetting {
  type: 'convert'
  handleFolder: string
  outputFolder: string
  screenshot: boolean
  ffmpegSetting?: string
  suffix?: string
  split?: boolean
  keepFiles?: boolean
  defaultFFmpegSetting?: string
  customSetting?: CustomSetting[]
}
```

#### Config.tasks.Combine

```typescript
interface Combine extends TaskCommonSetting {
  type: 'combine'
  handleFolder: string
  outputFolder: string
  screenshot: boolean
  split?: boolean
  keepFiles?: boolean
}
```

#### Config.tasks.Upload

```typescript
interface Upload extends TaskCommonSetting {
  type: 'upload'
  handleFolder: string
  outputFolder: string
  addThumbnail?: boolean
  keepFiles?: boolean
  uploadAsDraft?: boolean
}
```

#### Config.tasks.Move

```typescript
export interface Move extends TaskCommonSetting {
  type: 'move'
  targetFolder: string
}
```
