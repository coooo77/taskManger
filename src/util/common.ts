import fs from 'fs'
import path from 'path'
import chalk from 'chalk'
import * as url from 'url'
import readline from 'readline'

const __dirname = url.fileURLToPath(new URL('.', import.meta.url))

interface TargetFilesOptions {
  includes?: string[]
  exceptions?: string[]
}

type FolderPath = string

type Filename = string

export interface FilesToHandle {
  [key: FolderPath]: Filename[]
}

export default class Common {
  static errorLogPath = path.join(__dirname, '../log')

  static uploadLogPath = path.join(__dirname, '../uploadLog')

  static msg(msg: string, msgType: 'debug' | 'warn' | 'info' | 'success' | 'fail' | 'error' = 'info') {
    const { log } = console

    const type = ` ${msgType.toUpperCase()} `

    switch (msgType) {
      case 'warn':
        log(chalk.bgYellow(type), chalk.yellow(msg))
        break
      case 'info':
        log(chalk.bgBlue(type), chalk.blue(msg))
        break
      case 'success':
        log(chalk.bgGreen(type), chalk.green(msg))
        break
      case 'fail':
        log(chalk.bgRed(type), chalk.red(msg))
        break
      case 'error':
        log(chalk.bgRed(type), chalk.bgRed.yellow(msg))
        break
      case 'debug':
        log(chalk.bgCyan(type), chalk.bgRed.yellow(msg))
      default:
        break
    }
  }

  static wait(seconds: number) {
    return new Promise((resolve) => setTimeout(resolve, seconds * 1000))
  }

  /** @see https://stackoverflow.com/questions/14390930/how-to-check-if-an-arbitrary-pid-is-running-using-node-js */
  static isProcessRunning(pid: number) {
    try {
      process.kill(pid, 0)
      return true
    } catch {
      return false
    }
  }

  static killProcessIfAlive(pid?: number) {
    if (typeof pid === 'undefined') return

    if (!Common.isProcessRunning(pid)) return

    process.kill(pid, 'SIGTERM')

    console.log(chalk.bgRed.yellow(`pid: ${pid} killed`))
  }

  static makeDirIfNotExist(fileLocation?: string) {
    if (!fileLocation) throw new Error(`Invalid file location`)
    if (fs.existsSync(fileLocation)) return
    fs.mkdirSync(fileLocation, { recursive: true })
  }

  /**
   * @param fileLocation path of file ex: './model'
   * @param fileName name of file ex: 'user'
   * @param data
   */
  static saveFile(fileLocation: string, fileName: string, data: any) {
    try {
      Common.makeDirIfNotExist(fileLocation)

      fs.writeFileSync(`${fileLocation}/${fileName}.json`, JSON.stringify(data), 'utf8')
    } catch (error) {
      const err = error as { message: string }

      Common.msg(err.message, 'error')

      Common.errorHandler(error)
    }
  }

  static saveUploadLog(log: Record<PropertyKey, any>) {
    log.date = new Date().toLocaleString()

    Common.saveFile(Common.uploadLogPath, `${new Date().getTime()}`, log)
  }

  static errorHandler(error: any) {
    const log = JSON.parse(JSON.stringify(error || {}))

    log.date = new Date().toLocaleString()

    log.message = error?.message || 'no error message'

    Common.saveFile(Common.errorLogPath, `${new Date().getTime()}`, log)
  }

  static getFile(fileLocation: string, fileName: string) {
    try {
      const result = fs.readFileSync(`${fileLocation}\\${fileName}.json`, 'utf8')

      return JSON.parse(result)
    } catch (error) {
      const err = error as { message: string }

      Common.msg(err.message, 'error')

      Common.errorHandler(error)
    }
  }

  static getOrCreateFile<T>(fileLocation: string, fileName: string, defaultData: T): T {
    if (fs.existsSync(`${fileLocation}/${fileName}.json`)) {
      return Common.getFile(fileLocation, fileName)
    }

    Common.saveFile(fileLocation, fileName, defaultData)

    return defaultData
  }

  /**
   * check if a file is busy and move to location specified
   * @param {string[]} fileNames filenames
   * @param {string} from original root path
   * @param {string} to target path
   */
  static async checkMoveFiles(fileNames: string[], from: string, to: string) {
    for (const fileName of fileNames) {
      const fromPath = path.join(from, fileName)

      if (fs.existsSync(fromPath)) {
        const toPath = path.join(to, fileName)

        await Common.moveFile(fromPath, toPath)
      } else {
        Common.msg(`Can not find file at: ${fromPath}`, 'fail')
      }
    }
  }

  static async moveFullPathFiles(filesWithFullPath: string[], to: string) {
    if (filesWithFullPath.length === 0) return

    for (const file of filesWithFullPath) {
      const { base } = path.parse(file)
      const toPath = path.join(to, base)
      Common.moveFile(file, toPath)
    }
  }

  static async moveFile(fromPath: string, toPath: string) {
    const from = path.parse(path.resolve(fromPath))

    const to = path.parse(path.resolve(toPath))

    const isSameRoot = from.root === to.root

    const moveFn = isSameRoot
      ? fs.renameSync.bind(fs, fromPath, toPath)
      : Common.moveFileCrossDevice.bind(Common, fromPath, toPath)

    try {
      await Common.reTry(moveFn)
    } catch (error: any) {
      Common.errorHandler(error)

      Common.msg(`Can not move file at: ${fromPath}, \r\nreason: ${error.message}`, 'fail')
    }
  }

  static moveFileCrossDevice(fromPath: string, toPath: string) {
    try {
      fs.copyFileSync(fromPath, toPath)

      const { base, dir } = path.parse(fromPath)

      Common.deleteFile(dir, base)
    } catch (error) {
      Common.errorHandler(error)

      Common.msg(`Error occurred when move file: ${fromPath}, to: ${toPath}`)
    }
  }

  static async reTry(fn: Function, maximum: number = 3, interval: number = 0.5) {
    return new Promise<void>(async (resolve, reject) => {
      try {
        const res = await fn()

        resolve(res)
      } catch (error: any) {
        if (maximum <= 0) {
          console.error(error.message)

          return resolve()
        }

        await Common.wait(interval)

        await Common.reTry(fn, --maximum)

        resolve()
      }
    })
  }

  static deleteFile(filePath: string, fileName: string) {
    try {
      const source = path.join(filePath, fileName)

      fs.unlinkSync(source)

      Common.msg(`Delete file: ${source}`, 'success')
    } catch (error) {
      Common.errorHandler(error)

      Common.msg(`Can not delete file ${fileName}`, 'fail')
    }
  }

  static deleteFullPathFiles(filesWithFullPath: string[]) {
    for (const file of filesWithFullPath) {
      const { dir, base } = path.parse(file)

      Common.deleteFile(dir, base)
    }
  }

  static getTargetFiles(source: string[], includeExt: string[], options: TargetFilesOptions) {
    const { exceptions = [], includes = [] } = options

    return source.reduce((acc, sourcePath) => {
      const files = fs
        .readdirSync(sourcePath)
        .filter((filename) => Common.isTargetFile(filename, includeExt, { exceptions, includes }))

      if (files.length !== 0) acc[sourcePath] = files

      return acc
    }, {} as FilesToHandle)
  }

  static isTargetFile(filename: string, includeExt: string[], options: TargetFilesOptions) {
    const { exceptions = [], includes = [] } = options

    const isIncluded = includes.length ? includes.some((i) => filename.includes(i)) : true

    const isValidExtName = includeExt.length ? Common.isValidExtName(filename, includeExt) : false

    const isNotInExceptions = exceptions.length ? Common.isNotInExceptions(filename, exceptions) : true

    return isIncluded && isValidExtName && isNotInExceptions
  }

  static isValidExtName(filename: string, checkList: string[]) {
    return checkList.includes(path.extname(filename).slice(1))
  }

  static isNotInExceptions(filename: string, checkList: string[]) {
    return checkList.every((world) => !filename.includes(world))
  }

  static getDirectories(source: string, withSource = true) {
    return fs
      .readdirSync(source, { withFileTypes: true })
      .filter((dirent) => dirent.isDirectory())
      .map(({ name }) => (withSource ? path.join(source, name) : name))
  }

  static getPromptFn(msg: string) {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false
    })

    return () =>
      new Promise<string>((resolve) => {
        rl.question(msg, (reply) => {
          rl.close()
          resolve(reply)
        })
      })
  }
}
