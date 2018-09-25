// See https://www.typescriptlang.org/docs/handbook/declaration-merging.html#module-augmentation
import * as npmlog from 'npmlog'

import {Tracker, TrackerStream, TrackerGroup} from 'are-we-there-yet'

export type Methods<T> = {[K in keyof T]: T[K] extends Function ? K : never}

export type Values<T> = T[keyof T]

declare module 'npmlog' {
  export enum LogLevels {
    timing = 'timing',
    notice = 'notice',
    silent = 'silent',
  }

  export type LogLevel =
    | 'silly'
    | 'verbose'
    | 'timing'
    | 'info'
    | 'notice'
    | 'http'
    | 'warn'
    | 'error'
    | 'silent'

  export function timing(prefix: string, message: string, ...args: any[]): void
  export function notice(prefix: string, message: string, ...args: any[]): void
  export function silent(prefix: string, message: string, ...args: any[]): void

  export type LoggerMixin = Pick<
    typeof npmlog,
    | LogLevel
    | 'enableColor'
    | 'disableColor'
    | 'enableProgress'
    | 'disableProgress'
    | 'enableUnicode'
    | 'disableUnicode'
    | 'pause'
    | 'resume'
    | 'addLevel'
  >

  export type LogTracker = Tracker & LoggerMixin
  export type LogTrackerStream = TrackerStream & LoggerMixin
  export type LogTrackerGroup = TrackerGroup & LoggerMixin

  export function newItem(
    name?: string,
    todo?: number,
    weight?: number,
  ): LogTracker
  export function newStream(
    name?: string,
    todo?: number,
    weight?: number,
  ): LogTrackerStream
  export function newGroup(name?: string, weight?: number): LogTrackerGroup
}
