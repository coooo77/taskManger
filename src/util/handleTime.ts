'use strict'

export default class HandleTime {
  static getUTCPlus8TimeNow() {
    return new Date(new Date().getTime() + 8 * 60 * 60 * 1000)
  }

  static isBetween(target: Date, from: Date, to: Date) {
    return target >= from && target <= to
  }

  static getSpecifiedTimeOfDay(target: Date, hour: number, min = 0) {
    const targetTime = new Date(target)
    targetTime.setUTCHours(hour, min)
    return targetTime
  }

  static getFullTimeString(target: Date) {
    const y = target.getUTCFullYear()
    const m = String(target.getUTCMonth() + 1).padStart(2, '0')
    const d = String(target.getUTCDate()).padStart(2, '0')
    const hr = String(target.getUTCHours()).padStart(2, '0')
    const min = String(target.getUTCMinutes()).padStart(2, '0')
    return `${y}-${m}-${d} ${hr}:${min}`
  }
}
