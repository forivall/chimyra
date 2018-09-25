import * as execa from 'execa'
import * as logTransformer from 'strong-log-transformer'

import {Argument1} from './types'
import Package from '../model/package'
import chalk from 'chalk'

export interface ChildProcessError extends execa.ExecaError {
  pkg?: Package
}

export interface ChildProcessOptions extends execa.Options {
  pkg?: Package
}

export type LogTransformerOptions = NonNullable<
  Argument1<typeof logTransformer>
>

export type ExtChildProcess = execa.ExecaChildProcess & {
  pkg?: Package
}

// bookkeeping for spawned processes
let children = 0

const constArray = <T extends string>(a: T[]): T[] => a

// when streaming children are spawned, use this color for prefix
const colorWheel = constArray([
  'cyan',
  'magenta',
  'blue',
  'yellow',
  'green',
  'red',
])
const NUM_COLORS = colorWheel.length

export function exec(
  command: string,
  args: ReadonlyArray<string>,
  opts: ChildProcessOptions,
) {
  const options = Object.assign({stdio: 'pipe'}, opts)
  const spawned = spawnProcess(command, args, options)

  return wrapError(spawned)
}

export function execSync(
  command: string,
  args: ReadonlyArray<string>,
  opts: execa.SyncOptions,
) {
  return execa.sync(command, args, opts).stdout
}

export function spawn(
  command: string,
  args: ReadonlyArray<string>,
  opts: ChildProcessOptions,
) {
  const options = Object.assign({}, opts, {stdio: 'inherit'})
  const spawned = spawnProcess(command, args, options)

  return wrapError(spawned)
}

// istanbul ignore next
export function spawnStreaming(
  command: string,
  args: ReadonlyArray<string>,
  opts: execa.Options,
  prefix: string,
) {
  const options = Object.assign({}, opts)
  options.stdio = ['ignore', 'pipe', 'pipe']

  const colorName = colorWheel[children % NUM_COLORS]
  const color = chalk[colorName]
  const spawned = spawnProcess(command, args, options)

  const stdoutOpts: LogTransformerOptions = {}
  const stderrOpts: LogTransformerOptions = {} // mergeMultiline causes escaped newlines :P

  if (prefix) {
    stdoutOpts.tag = `${color.bold(prefix)}:`
    stderrOpts.tag = `${color(prefix)}:`
  }

  // Avoid "Possible EventEmitter memory leak detected" warning due to piped stdio
  if (children > process.stdout.listenerCount('close')) {
    process.stdout.setMaxListeners(children)
    process.stderr.setMaxListeners(children)
  }

  spawned.stdout.pipe(logTransformer(stdoutOpts)).pipe(process.stdout)
  spawned.stderr.pipe(logTransformer(stderrOpts)).pipe(process.stderr)

  return wrapError(spawned)
}

export function getChildProcessCount() {
  return children
}

function spawnProcess(
  command: string,
  args: ReadonlyArray<string>,
  opts: ChildProcessOptions,
) {
  children += 1

  const child = execa(command, args, opts) as ExtChildProcess
  const drain = (code: number, signal: string) => {
    children -= 1

    // don't run repeatedly if this is the error event
    if (signal === undefined) {
      child.removeListener('exit', drain)
    }
  }

  child.once('exit', drain)
  child.once('error', drain)

  if (opts.pkg) {
    child.pkg = opts.pkg
  }

  return child
}

function wrapError(spawned: ExtChildProcess) {
  if (spawned.pkg) {
    return spawned.catch((err: ChildProcessError) => {
      // istanbul ignore else
      if (err.code) {
        // log external error cleanly
        err.pkg = spawned.pkg
      }

      throw err
    })
  }

  return spawned
}
