import fs from 'fs'
import path from 'path'
import chalk from 'chalk'

type FolderPath = string

type Filename = string

export interface FilesToHandle {
  [key: FolderPath]: Filename[]
}

export default class Common {
  static errorLogPath = path.join(__dirname, '../log')

  static msg(msg: string, msgType: 'warn' | 'info' | 'success' | 'fail' | 'error' = 'info') {
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

  static makeDirIfNotExist(fileLocation: string) {
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
  static checkMoveFiles(fileNames: string[], from: string, to: string) {
    for (const fileName of fileNames) {
      const fromPath = `${from}\\${fileName}`

      if (fs.existsSync(fromPath)) {
        const toPath = `${to}\\${fileName}`

        Common.moveFile(fromPath, toPath)
      } else {
        Common.msg(`Can not find file at: ${fromPath}`, 'fail')
      }
    }
  }

  static checkMoveFullPathFiles(fileWithFullPath: string[], to: string) {
    if (fileWithFullPath.length === 0) return

    const filenames = fileWithFullPath.map((i) => path.parse(i).base)

    const from = path.parse(fileWithFullPath[0]).dir

    Common.checkMoveFiles(filenames, from, to)
  }

  static moveFile(fromPath: string, toPath: string) {
    const from = path.parse(fromPath)

    const to = path.parse(toPath)

    const isSameRoot = from.root === to.root

    const moveFn = isSameRoot
      ? fs.renameSync.bind(fs, fromPath, toPath)
      : Common.moveFileCrossDevice.bind(Common, fromPath, toPath)

    try {
      Common.reTry(moveFn)
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

  static reTry(fn: Function, maximum: number = 5, interval: number = 1) {
    try {
      fn()
    } catch (error) {
      console.log('reTry', maximum, error)

      if (maximum <= 0) throw error

      setTimeout(Common.reTry.bind(Common, fn, --maximum), interval * 1000)
    }
  }

  static deleteFile(filePath: string, fileName: string) {
    try {
      fs.unlinkSync(`${filePath}\\${fileName}`)
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

  static getTargetFiles(source: string[], includeExt: string[], exceptions: string[] = []) {
    return source.reduce((acc, sourcePath) => {
      const files = fs
        .readdirSync(sourcePath)
        .filter((filename) => Common.isTargetFile(filename, includeExt, exceptions))

      if (files.length !== 0) acc[sourcePath] = files

      return acc
    }, {} as FilesToHandle)
  }

  static isTargetFile(filename: string, includeExt: string[], exceptions: string[]) {
    return Common.isValidExtName(filename, includeExt) && Common.isValidTarget(filename, exceptions)
  }

  static isValidExtName(filename: string, checkList: string[]) {
    return checkList.includes(path.extname(filename).slice(1))
  }

  static isValidTarget(filename: string, checkList: string[]) {
    for (const world of checkList) {
      if (filename.includes(world)) return false
    }

    return true
  }

  static getDirectories(source: string, withSource = true) {
    return fs
      .readdirSync(source, { withFileTypes: true })
      .filter((dirent) => dirent.isDirectory())
      .map(({ name }) => (withSource ? path.join(source, name) : name))
  }
}
