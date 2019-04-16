import * as cosmiconfig from 'cosmiconfig'
import * as globby from 'globby'
import iterate from 'iterare'
import * as log from 'npmlog'
import * as npm from '@npm/types'
import * as path from 'path'

import {Argument1, Argument2} from '../helpers/types'
import {configFile, fallbackConfigFile, name} from '../constants'
import loadJsonFile, {sync as loadJsonFileSync} from 'load-json-file'

import Package from './package'
import ValidationError from '../errors/validation'
import pMap from 'p-map'
import writeJsonFile from 'write-json-file'

// tslint:disable-next-line:no-require-imports
import globParent = require('glob-parent')

export type GlobbyOptions = NonNullable<Argument2<typeof globby>>
type EntryItem = Argument1<NonNullable<GlobbyOptions['transform']>>

function loadConfig(explorer: cosmiconfig.Explorer, cwd?: string) {
  let loaded: cosmiconfig.CosmiconfigResult

  try {
    loaded = explorer.searchSync(cwd)
  } catch (err) {
    // redecorate JSON syntax errors, avoid debug dump
    // tslint:disable-next-line: no-unsafe-any
    if (err.name === 'JSONError') {
      // tslint:disable-next-line: no-unsafe-any
      throw new ValidationError(err.name, err.message)
    }

    // re-throw other errors, could be ours or third-party
    throw err
  }

  if (loaded == null) {
    throw new ValidationError('LoadFail', 'Cosmiconfig failed to load config')
  }

  return loaded
}

export default class Project {
  static readonly PACKAGE_GLOB = 'packages/*'
  static readonly BUILD_FOLDER = 'build'
  static readonly LICENSE_GLOB = 'LICEN{S,C}E{,.*}'
  config: {
    packages?: string[]
    buildDir?: string
    command?: {
      [key: string]: unknown
    },
    ignore?: string[]
  }
  rootConfigLocation: string
  rootPath: string

  constructor(cwd?: string) {
    const explorer = cosmiconfig(name, {
      searchPlaces: [configFile, fallbackConfigFile, 'package.json'],
      transform(obj) {
        // cosmiconfig returns null when nothing is found
        if (!obj) {
          return {
            // No need to distinguish between missing and empty,
            // saves a lot of noisy guards elsewhere
            config: {},
            // path.resolve(".", ...) starts from process.cwd()
            filepath: path.resolve(cwd || '.', configFile),
          }
        }

        return obj
      },
    })

    const loaded = loadConfig(explorer, cwd)

    this.config = loaded.config
    this.rootConfigLocation = loaded.filepath
    this.rootPath = path.dirname(loaded.filepath)

    log.verbose('rootPath', this.rootPath)
  }

  get packageConfigs(): string[] {
    return this.config.packages || [Project.PACKAGE_GLOB]
  }

  get buildRoot(): string {
    return path.join(this.rootPath, this.buildDir)
  }

  get buildDir(): string {
    return this.config.buildDir || Project.BUILD_FOLDER
  }

  get packageParentDirs() {
    return this.packageConfigs
      .map(globParent)
      .map((parentDir) => path.resolve(this.rootPath, parentDir))
  }

  get manifest() {
    let manifest: Package | undefined

    try {
      const manifestLocation = path.join(this.rootPath, 'package.json')
      const packageJson = loadJsonFileSync<npm.PackageJson>(manifestLocation)

      if (!packageJson.name) {
        // npm-lifecycle chokes if this is missing, so default like npm init does
        packageJson.name = path.basename(path.dirname(manifestLocation))
      }

      // Encapsulate raw JSON in Package instance
      manifest = new Package(packageJson, this.rootPath)

      // redefine getter to lazy-loaded value
      Object.defineProperty(this, 'manifest', {
        value: manifest,
      })
    } catch (err) {
      // tslint:disable: no-unsafe-any
      // redecorate JSON syntax errors, avoid debug dump
      if (err.name === 'JSONError') {
        throw new ValidationError(err.name, err.message)
      }

      // try again next time
      console.warn(err.stack || err)
      // tslint:enable: no-unsafe-any
    }

    return manifest
  }

  get licensePath() {
    let licensePath

    try {
      const search = globby.sync(Project.LICENSE_GLOB, {
        cwd: this.rootPath,
        absolute: true,
        case: false,
        // Project license is always a sibling of the root manifest
        deep: false,
        // POSIX results always need to be normalized
        transform: fpNormalize,
      })

      licensePath = search.shift()

      if (licensePath) {
        // redefine getter to lazy-loaded value
        Object.defineProperty(this, 'licensePath', {
          value: licensePath,
        })
      }
    } catch (err) {
      /* istanbul ignore next */
      // tslint:disable-next-line: no-unsafe-any
      throw new ValidationError(err.name, err.message)
    }

    return licensePath
  }

  findFilesGlobOptions(customGlobOpts = {}): GlobbyOptions {
    const globOpts: GlobbyOptions = {
      ...customGlobOpts,
      cwd: this.rootPath,
      absolute: true,
      followSymlinkedDirectories: false,
      // POSIX results always need to be normalized
      transform: fpNormalize,
      ignore: this.config.ignore || []
    }

    if (this.packageConfigs.some((cfg) => cfg.indexOf('**') > -1)) {
      if (this.packageConfigs.some((cfg) => cfg.indexOf('node_modules') > -1)) {
        throw new ValidationError(
          'EPKGCONFIG',
          'An explicit node_modules package path does not allow globstars (**)',
        )
      }

      globOpts.ignore = [
        // allow globs like "packages/**",
        // but avoid picking up node_modules/**/package.json
        '**/node_modules/**',
      ]
    }
    return globOpts
  }

  async findFiles<T = string>(
    fileName: string,
    fileMapper?: ((fp: string[]) => T[] | PromiseLike<T[]>) | null,
    customGlobOpts?: GlobbyOptions,
  ) {
    const options = this.findFilesGlobOptions(customGlobOpts)
    const nestedResults = await pMap(
      this.packageConfigs.sort(),
      async (globPath) => {
        const results = await globby(path.join(globPath, fileName), options)

        // fast-glob does not respect pattern order, so we re-sort by absolute path
        results.sort()

        if (fileMapper) {
          return fileMapper(results)
        }

        return results as (T extends string ? T : never)[]
      },
      {concurrency: 4},
    )
    return iterate(nestedResults).flatten().toArray()
  }

  async getPackages(): Promise<Package[]> {
    const mapper = async (packageConfigPath: string): Promise<Package> => {
      const packageJson = await loadJsonFile<npm.PackageJson>(packageConfigPath)
      return new Package(
        packageJson,
        path.dirname(packageConfigPath),
        this.rootPath,
      )
    }

    return this.findFiles('package.json', async (filePaths) =>
      pMap(filePaths, mapper, {concurrency: 50}),
    )
  }

  async getPackageLicensePaths(): Promise<string[]> {
    return this.findFiles(Project.LICENSE_GLOB, undefined, {case: false})
  }

  async serializeConfig(): Promise<string> {
    // TODO: might be package.json prop
    return writeJsonFile(this.rootConfigLocation, this.config, {
      indent: 2,
      detectIndent: true,
    }).then(() => this.rootConfigLocation)
  }
}

// tslint:disable-next-line: typedef
export const getPackages = async (cwd: string) => new Project(cwd).getPackages()

function fpNormalize(fp: EntryItem): string {
  const s = typeof fp === 'string' ? fp : fp.path
  return path.normalize(s)
}
