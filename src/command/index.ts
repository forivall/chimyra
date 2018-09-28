import * as _ from 'lodash'
import * as execa from 'execa'
import * as npmlog from 'npmlog'

import PackageGraph, {PackageGraphNode} from '../model/package-graph'

import Package from '../model/package'
import Project from '../model/project'
import ValidationError from '../errors/validation'
import cleanStack from './helpers/clean-stack'
import isSubdir from '../helpers/is-subdir'
import logPackageError from './helpers/log-package-error'
import warnIfHanging from './helpers/warn-if-hanging'
import writeLogFile from '../helpers/write-log-file'

const DEFAULT_CONCURRENCY = 4

export interface CommandArgs {
  chimerVersion?: string
  cwd?: string
  composed?: string
  ci?: boolean
  progress?: boolean
  loglevel?: npmlog.LogLevel
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

interface CommandContext {
  project?: Project
  packageGraph?: PackageGraph
  currentPackageNode?: PackageGraphNode
  currentPackage?: Package
  /** @internal */
  onResolved?(): any
  /** @internal */
  onRejected?(reason: any): any
}

type Resolve<T> = T extends PromiseLike<infer U> ? U : T
type CommandResult<T extends Command> = Resolve<ReturnType<T['execute']>>

export default abstract class Command {
  // "FooCommand" => "foo"
  name = this.constructor.name.replace(/Command$/, '').toLowerCase()
  composed: boolean
  project: Project
  protected _env: CommandEnv = {
    ci: false /* require('is-ci') */,
  }
  protected _args: CommandArgs
  options: GlobalOptions = {}
  concurrency = DEFAULT_CONCURRENCY
  toposort = true
  execOpts: execa.Options = {}
  logger!: npmlog.LogTrackerGroup
  packageGraph!: PackageGraph
  currentPackageNode?: PackageGraphNode
  currentPackage?: Package

  then: Promise<CommandResult<this>>['then']
  catch: Promise<CommandResult<this>>['catch']

  constructor(args: CommandArgs, context: CommandContext = {}) {
    this._args = args

    // composed commands are called from other commands, like publish -> version
    this.composed = typeof args.composed === 'string' && args.composed !== this.name

    if (!this.composed) {
      // composed commands have already logged the version
      log.notice('cli', `v${args.chimerVersion}`)
    }

    this.project = context.project || new Project(args.cwd)

    if (context.packageGraph) this.packageGraph = context.packageGraph

    this.currentPackageNode = context.currentPackageNode
    this.currentPackage = context.currentPackage
    if (!this.currentPackage && this.currentPackageNode) {
      this.currentPackage = this.currentPackageNode.pkg
    }

    // Run command
    let runner = this.run()

    // passed via yargs context in tests, never actual CLI
    /* istanbul ignore else */
    if (context.onResolved || context.onRejected) {
      runner = runner.then(context.onResolved, context.onRejected)
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

  async run() {
    let result: CommandResult<this>
    // launch the command
    try {
      await this.configureEnvironment()
      await this.configureOptions()
      await this.configureProperties()
      await this.configureLogging()
      await this.runValidations()
      await this.runPreparations()
      result = await this.runCommand()
    } catch (err) {
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
      throw err
    }
    warnIfHanging()

    return result
  }

  configureEnvironment() {
    /* istanbul ignore next */
    if (this._env.ci || !process.stderr.isTTY) {
      log.disableColor()
      this._env.progress = false
    } else if (!process.stdout.isTTY) {
      // stdout is being piped, don't log non-errors or progress bars
      this._env.progress = false
      this._env.loglevel = 'error'
    } else if (process.stderr.isTTY) {
      log.enableColor()
      log.enableUnicode()
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
    const concurrency = Number(this.options.concurrency)
    if (concurrency && concurrency >= 1) this.concurrency = concurrency

    const {sort, maxBuffer} = this.options
    if (sort !== undefined) this.toposort = sort

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
    if (!this.packageGraph) {
      const project = this.project
      const packages = await project.getPackages()

      this.packageGraph = new PackageGraph(packages, {project})
    }

    if (!this.currentPackageNode) {
      for (const pkgNode of this.packageGraph.values()) {
        if (!isSubdir(pkgNode.location, '.')) continue

        if (this.currentPackageNode) {
          throw new ValidationError(
            'COMMAND',
            'Found two possible packages in current directory',
          )
        }

        if (!this.currentPackage) {
          this.currentPackage = pkgNode.pkg
        }
        this.currentPackageNode = pkgNode
      }
    }
  }

  async runCommand() {
    const proceed = (await Promise.resolve(this.initialize())) as boolean | undefined
    if (proceed !== false) {
      return this.execute()
    }
  }

  abstract initialize(): void | boolean | Promise<void | boolean>

  abstract execute(): any | Promise<any>
}
