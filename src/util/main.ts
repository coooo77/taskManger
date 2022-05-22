import fs from 'fs'
import path from 'path'
import Common from './common'
import { ChildProcess, fork } from 'child_process'
import { Config, Move, Upload, Combine, Convert, Task } from '../types/config'

export default class Main {
  static currentProcess: ChildProcess | null = null

  static checkTimer: NodeJS.Timeout | null = null

  static _config: Config[] = []

  static timesOfCheck = 0

  static isHandling: boolean = false

  static isUploading: boolean = false

  static get config() {
    return Main._config[0]
  }

  static configPath = path.join(__dirname, '..', '..')

  static getConfig() {
    try {
      console.log()
      return Common.getFile(Main.configPath, 'configure') as Config
    } catch (e) {
      Main.setError('can not find configure.json', Main.getConfig)
      process.exit(1)
    }
  }

  static upDateConfig() {
    Main._config = [Main.getConfig()]
  }

  static async checkTask() {
    const timeNow = new Date().toLocaleString()

    Common.msg(`[${Main.timesOfCheck++}] Start to check at ${timeNow}`)

    Main.upDateConfig()

    Main.handleTask()
  }

  static handleTask() {
    const tasks = Main.getTasks()

    Main.multiTask(tasks)

    Main.uploadTask(tasks)

    Main.setTimer()
  }

  static async multiTask(tasks: Task[]) {
    if (Main.isHandling) return

    Main.isHandling = true

    const target = Main.getTargetTasks(tasks)

    await Main.taskWrapper(() => target.reduce((acc, cur) => acc.then(() => Main.taskSelector(cur)), Promise.resolve()))

    Main.isHandling = false
  }

  static getTargetTasks(tasks: Task[]) {
    const target = tasks.filter((t) => t.type !== 'upload') as Exclude<Task, Upload>[]

    const order = {
      move: 1,
      convert: 2,
      combine: 3
    }

    return target.sort((a, b) => order[a.type] - order[b.type])
  }

  static taskSelector(tasks: Task) {
    switch (tasks.type) {
      case 'move':
        return Main.handleMove(tasks)
      case 'combine':
        return Main.handleCombine(tasks)
      case 'convert':
        return Main.handleConvert(tasks)
      default:
        throw new Error(`Invalid task type：${tasks.type}`)
    }
  }

  static taskWrapper(callback: Function): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        resolve(callback())
      } catch (error: any) {
        Main.setError(error, Main.taskWrapper)

        reject(true)
      }
    })
  }

  static async uploadTask(tasks: Task[]) {
    if (Main.isUploading) return

    const target = tasks.filter((t) => t.type === 'upload') as Upload[]

    Main.isUploading = true

    await Main.taskWrapper(() => target.reduce((acc, cur) => acc.then(() => Main.handleUpload(cur)), Promise.resolve()))

    Main.isUploading = false
  }

  static async scriptHandler(task: Exclude<Task, Move>, type: 'upload' | 'convert' | 'combine', fn: Function) {
    if (!Main.isAbleRunTask(task)) return Common.msg(`no files at: ${task.handleFolder}, stop ${type}`)

    Common.msg(`Start to ${type} files at： ${task.handleFolder}`)

    await Main.runScript(task, `${type}.js`, fn)
  }

  static handleUpload(task: Upload) {
    Main.scriptHandler(task, 'upload', Main.handleUpload)
  }

  static handleConvert(task: Convert) {
    Main.scriptHandler(task, 'convert', Main.handleConvert)
  }

  static handleCombine(task: Combine) {
    Main.scriptHandler(task, 'combine', Main.handleCombine)
  }

  static handleMove(task: Task) {
    const { sourceFolder, includeExt, exceptions, skip, type } = task

    if (skip || sourceFolder.length === 0) return

    const files = Common.getTargetFiles(sourceFolder, includeExt, exceptions)

    if (Object.keys(files).length === 0) return

    const destination = type === 'move' ? task.targetFolder : task.handleFolder

    Common.msg(`Start to move files to： ${destination}`)

    // TODO: 檢查會不會造成同步進行，是的話要改成逐步
    Object.entries(files).forEach(([source, filenames]) => Common.checkMoveFiles(filenames, source, destination))
  }

  private static isAbleRunTask(task: Exclude<Task, Move>) {
    Main.handleMove(task)

    const targetFiles = fs.readdirSync(task.handleFolder)

    return targetFiles.length !== 0
  }

  static runScript(task: Task, scriptName: string, fn: Function): Promise<void> {
    return new Promise((resolve, reject) => {
      const payload = [JSON.stringify(task)]

      const child_process = fork(path.join(__dirname, '..', 'scripts', scriptName), payload)

      child_process.on('error', (error: any) => {
        Main.setError(error, fn)

        reject()
      })

      child_process.on('close', (code) => {
        child_process.off('close', () => {})

        child_process.off('error', () => {})

        resolve()
      })
      try {
      } catch (error: any) {
        Main.setError(error, fn)

        reject()
      }
    })
  }

  static getTasks() {
    const { tasks } = Main.config

    if (tasks.length === 0) {
      Main.setError('no tasks available', Main.getTasks)

      process.exit(1)
    }

    return tasks
  }

  static setError(error: any, fn: Function) {
    const message = error.message || 'unknown error'

    const place = ` at function: ${fn.name}`

    Common.msg(message + place, 'error')

    Common.errorHandler(message)
  }

  static setTimer() {
    const { checkInterval } = Main.config

    Main.checkTimer = setTimeout(Main.checkTask, checkInterval * 1000)
  }
}
