import fs from 'fs'
import path from 'path'
import * as url from 'url'
import { ChildProcess, fork } from 'child_process'

import Common from './common.js'
import { Config, Move, Upload, Combine, Convert, Task } from '../types/config.js'

const __dirname = url.fileURLToPath(new URL('.', import.meta.url))

export default class Main {
  static currentProcess: ChildProcess | null = null

  static checkTimer: NodeJS.Timeout | null = null

  static _config: Config[] = []

  static timesOfCheck = 0

  static isHandling: boolean = false

  static isUploading: boolean = false

  static isMovingFiles: boolean = false

  static get config() {
    return Main._config[0]
  }

  static configPath = path.join(__dirname, '..', '..')

  static getTasks() {
    const { tasks } = Main.config

    if (tasks.length === 0) {
      Main.setError('no tasks available', Main.getTasks)

      process.exit(1)
    }

    return tasks
  }

  static getConfig() {
    try {
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

    if (Main.config.pause) {
      Common.msg('task paused due to config', 'warn')

      Main.setTimer()
    } else {
      Main.handleTask()
    }
  }

  static handleTask() {
    const order = {
      convert: 1,
      combine: 2,
      upload: 3,
      move: 3
    }

    const tasks = Main.getTasks()
      .filter((i) => {
        if (i.skip) Common.msg(`Task: ${i.type} skipped due to config`, 'warn')

        return !i.skip
      })
      .sort((a, b) => order[a.type] - order[b.type])

    Main.startTask(tasks, ['convert', 'combine'], 'isHandling')

    Main.startTask(tasks, ['upload'], 'isUploading')

    Main.startTask(tasks, ['move'], 'isMovingFiles')

    Main.setTimer()
  }

  static async startTask(
    taskList: Task[],
    targetTaskTypes: Task['type'][],
    checkKey: 'isHandling' | 'isUploading' | 'isMovingFiles'
  ) {
    if (Main[checkKey]) {
      Common.msg(`${targetTaskTypes.join(' ')} task is on going, stop new task`)
      return
    }

    Main[checkKey] = true

    const target = taskList.filter((t) => targetTaskTypes.includes(t.type))

    if (target.length === 0) return

    try {
      await Main.taskWrapper(() =>
        target.reduce((acc, cur) => acc.then(() => Main.taskSelector(cur)), Promise.resolve())
      )
    } catch (error) {
      Main.setError(error, `startTask ${targetTaskTypes.join(' ')}`)
    } finally {
      Main[checkKey] = false
    }
  }

  static taskSelector(task: Task): Promise<any> {
    switch (task.type) {
      case 'combine':
      case 'convert':
      case 'upload':
        return Main.scriptHandler(task, task.type, task.type)
      case 'move':
        return Main.handleMove(task)
      default:
        throw new Error(`Invalid task type at taskSelector: ${task}`)
    }
  }

  static async taskWrapper(callback: Function): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const res = callback()

        resolve(res)
      } catch (error: any) {
        Main.setError(error, Main.taskWrapper)

        reject(true)
      }
    })
  }

  static async scriptHandler(task: Exclude<Task, Move>, type: 'upload' | 'convert' | 'combine', fn: Function | string) {
    const isAbleRunTask = await Main.isAbleRunTask(task)

    if (!isAbleRunTask) return Common.msg(`no files at: ${task.handleFolder}, stop ${type}`)

    Common.msg(`Start to ${type} files at： ${task.handleFolder}`)

    await Main.runScript(task, `${type}.js`, fn)
  }

  static async isAbleRunTask(task: Exclude<Task, Move>) {
    await Main.handleMove(task)

    const { handleFolder, includeExt, exceptions, includes } = task

    const files = Common.getTargetFiles([handleFolder], includeExt, { includes, exceptions })

    return Object.values(files).length !== 0
  }

  static async handleMove(task: Task) {
    const { sourceFolder, includeExt, exceptions, type, includes } = task

    if (sourceFolder.length === 0) {
      return Common.msg(`Task: ${type} skipped moving files due to no files at source folder`)
    }

    const files = Common.getTargetFiles(sourceFolder, includeExt, { includes, exceptions })

    if (Object.keys(files).length === 0) {
      return Common.msg(`Task: ${type} skipped moving files due to no target files`)
    }

    const destination = type === 'move' ? task.targetFolder : task.handleFolder

    Common.msg(`Start to move files to： ${destination}`)

    const jobs = Object.entries(files).map(([source, filenames]) =>
      Common.checkMoveFiles(filenames, source, destination)
    )

    await Promise.all(jobs)
  }

  static runScript(task: Task, scriptName: string, fn: Function | string): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const child_process = fork(path.join(__dirname, '..', 'scripts', scriptName))

        child_process.on('error', (error: any) => {
          Main.setError(error, fn)

          reject()
        })

        child_process.on('close', (code) => {
          child_process.off('close', () => {})

          child_process.off('error', () => {})

          resolve()
        })

        child_process.send(task)
      } catch (error: any) {
        Main.setError(error, fn)

        reject()
      }
    })
  }

  static setError(error: any, errorPlace: Function | string) {
    const message = error.message || 'unknown error'

    const place = typeof errorPlace === 'function' ? ` at function: ${errorPlace.name}` : `at ${errorPlace}`

    Common.msg(message + place, 'error')

    Common.errorHandler(message)
  }

  static setTimer() {
    const { checkInterval } = Main.config

    Main.checkTimer = setTimeout(Main.checkTask, checkInterval * 1000)
  }
}
