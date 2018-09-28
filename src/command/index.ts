import * as _ from 'lodash'
import * as execa from 'execa'
import * as npmlog from 'npmlog'
import * as path from 'path'

import PackageGraph, {PackageGraphNode} from '../model/package-graph'

import Package from '../model/package'
import Project from '../model/project'
import ValidationError from '../errors/validation'
import cleanStack from './helpers/clean-stack'
import logPackageError from './helpers/log-package-error'
import {name} from '../constants'
import warnIfHanging from './helpers/warn-if-hanging'
import writeLogFile from '../helpers/write-log-file'
import isSubdir from '../helpers/is-subdir';

const DEFAULT_CONCURRENCY = 4

export interface CommandArgs {
  chimerVersion: string
  cwd?: string
  composed?: string
  ci?: boolean
  progress?: boolean
  loglevel?: npmlog.LogLevel
  /** @internal */
  onResolved?(): void
  /** @internal */
  onRejected?(reason: any): void
}

export interface CommandEnv {
  ci: boolean
  progress?: boolean
  loglevel?: npmlog.LogLevel
}

export interface GlobalOptions extends CommandArgs {
  concurrency?: number | string
  sort?: boolean
  maxBuffer?: number
  since?: string
}

export type StdIOOptions =
  | 'pipe'
  | 'ignore'
  | 'inherit'
  | ReadonlyArray<execa.StdIOOption>

// stop typescript from complaining about read only fields
const log = npmlog

export default abstract class Command {
  // "FooCommand" => "foo"
  name = this.constructor.name.replace(/Command$/, '').toLowerCase()
  composed: boolean
  protected _args: CommandArgs
  protected _env!: CommandEnv
  options!: GlobalOptions
  project: Project
  concurrency!: number
  toposort!: boolean
  execOpts!: execa.Options
  logger!: npmlog.LogTrackerGroup
  packageGraph!: PackageGraph
  currentPackageNode?: PackageGraphNode
  currentPackage?: Package

  then: (
    onResolved: CommandArgs['onResolved'],
    onRejected: CommandArgs['onRejected'],
  ) => Promise<void>
  catch: (onRejected: CommandArgs['onRejected']) => Promise<void>

  constructor(args: CommandArgs) {
    log.pause()
    log.heading = name

    this._args = args
    log.silly('argv', '%O', args)

    // composed commands are called from other commands, like publish -> version
    this.composed = typeof args.composed === 'string' && args.composed !== this.name

    if (!this.composed) {
      // composed commands have already logged the version
      log.notice('cli', `v${args.chimerVersion}`)
    }

    this.project = new Project(args.cwd)

    // launch the command
    // TODO: convert to an async function
    let runner = new Promise<void>((resolve, reject) => {
      // run everything inside a Promise chain
      let chain = Promise.resolve()

      chain = chain.then(() => this.configureEnvironment())
      chain = chain.then(() => this.configureOptions())
      chain = chain.then(() => this.configureProperties())
      chain = chain.then(() => this.configureLogging())
      chain = chain.then(() => this.runValidations())
      chain = chain.then(() => this.runPreparations())
      chain = chain.then(() => this.runCommand())

      chain.then(
        (result) => {
          warnIfHanging()

          resolve(result)
        },
        (err) => {
          if (err.pkg) {
            // Cleanly log specific package error details
            logPackageError(err)
          } else if (err.name !== 'ValidationError') {
            // npmlog does some funny stuff to the stack by default,
            // so pass it directly to avoid duplication.
            log.error('', '%s', cleanStack(err, this.constructor.name))
          }

          // ValidationError does not trigger a log dump, nor do external package errors
          if (err.name !== 'ValidationError' && !err.pkg) {
            writeLogFile(this.project.rootPath)
          }

          warnIfHanging()

          // error code is handled by cli.fail()
          reject(err)
        },
      )
    })

    // passed via yargs context in tests, never actual CLI
    /* istanbul ignore else */
    if (args.onResolved || args.onRejected) {
      runner = runner.then(args.onResolved, args.onRejected)

      // when nested, never resolve inner with outer callbacks
      delete args.onResolved // eslint-disable-line no-param-reassign
      delete args.onRejected // eslint-disable-line no-param-reassign
    }

    // proxy "Promise" methods to "private" instance
    this.then = (onResolved, onRejected) => runner.then(onResolved, onRejected)
    /* istanbul ignore next */
    this.catch = (onRejected) => runner.catch(onRejected)
  }

  get requiresGit() {
    return true
  }

  // Override this to inherit config from another command.
  // For example `changed` inherits config from `publish`.
  get otherCommandConfigs() {
    return []
  }

  configureEnvironment() {
    // eslint-disable-next-line global-require
    // const ci: typeof import('is-ci') = require("is-ci");
    const ci = false
    let loglevel: npmlog.LogLevel | undefined
    let progress

    /* istanbul ignore next */
    if (ci || !process.stderr.isTTY) {
      log.disableColor()
      progress = false
    } else if (!process.stdout.isTTY) {
      // stdout is being piped, don't log non-errors or progress bars
      progress = false
      loglevel = 'error'
    } else if (process.stderr.isTTY) {
      log.enableColor()
      log.enableUnicode()
    }

    this._env = {
      ci,
      progress,
      loglevel,
    }
  }

  configureOptions() {
    // Command config object normalized to "command" namespace
    const commandConfig = this.project.config.command || {}

    // The current command always overrides otherCommandConfigs
    const overrides = [this.name, ...this.otherCommandConfigs].map(
      (key) => commandConfig[key],
    )

    this.options = _.defaults(
      {},
      // CLI flags, which if defined overrule subsequent values
      this._args,
      // Namespaced command options from `${configFile}`
      ...overrides,
      // Global options from `${configFile}`
      this.project.config,
      // Environmental defaults prepared in previous step
      this._env,
    )
  }

  configureProperties() {
    const {concurrency, sort, maxBuffer} = this.options

    this.concurrency = Math.max(1, Number(concurrency) || DEFAULT_CONCURRENCY)
    this.toposort = sort === undefined || sort
    this.execOpts = {
      cwd: this.project.rootPath,
      maxBuffer,
    }
  }

  configureLogging() {
    const {loglevel} = this.options

    if (loglevel) {
      log.level = loglevel
    }

    // handle log.success()
    log.addLevel('success', 3001, {fg: 'green', bold: true})

    // create logger that subclasses use
    this.logger = log.newGroup(this.name)

    // emit all buffered logs at configured level and higher
    log.resume()
  }

  enableProgressBar() {
    /* istanbul ignore next */
    if (this.options.progress) {
      this.logger.enableProgress()
    }
  }

  gitInitialized() {
    const opts = {
      cwd: this.project.rootPath,
      // don't throw, just want boolean
      reject: false,
      // only return code, no stdio needed
      stdio: 'ignore' as StdIOOptions,
    }

    return execa.sync('git', ['rev-parse'], opts).code === 0
  }

  runValidations() {
    if (
      (this.options.since !== undefined || this.requiresGit) &&
      !this.gitInitialized()
    ) {
      throw new ValidationError(
        'ENOGIT',
        'The git binary was not found, or this is not a git repository.',
      )
    }

    if (!this.project.manifest) {
      throw new ValidationError(
        'ENOPKG',
        '`package.json` does not exist, have you run `lerna init`?',
      )
    }
  }

  async runPreparations() {
    const project = this.project
    const packages = await project.getPackages()
    this.packageGraph = new PackageGraph(packages, {project})

    for (const pkgNode of this.packageGraph.values()) {
      if (!isSubdir(pkgNode.location, '.')) continue

      if (this.currentPackage) {
        throw new ValidationError(
          'COMMAND',
          'Found two possible packages in current directory',
        )
      }

      this.currentPackage = pkgNode.pkg
      this.currentPackageNode = pkgNode
    }
  }

  runCommand() {
    return Promise.resolve()
      .then(() => this.initialize())
      .then((proceed) => {
        if (proceed !== false) {
          return this.execute()
        }
        // early exits set their own exitCode (if non-zero)
      })
  }

  abstract initialize(): void | boolean | Promise<void | boolean>

  abstract execute(): void | Promise<void>
}
