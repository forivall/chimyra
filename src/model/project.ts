import * as cosmiconfig from 'cosmiconfig'
import * as globby from 'globby'
import * as log from 'npmlog'
import * as npm from '@npm/types'
import * as path from 'path'

import {configFile, fallbackConfigFile, name} from '../constants'
import loadJsonFile, {sync as loadJsonFileSync} from 'load-json-file'

import {Argument2, Argument1} from '../helpers/types'
import Package from './package'
import ValidationError from '../errors/validation'
import pMap from 'p-map'
import writeJsonFile from 'write-json-file'

// tslint:disable-next-line:no-require-imports
import globParent = require('glob-parent')

export type GlobbyOptions = NonNullable<Argument2<typeof globby>>
type EntryItem = Argument1<NonNullable<GlobbyOptions['transform']>>

export default class Project {
  static readonly PACKAGE_GLOB = 'packages/*'
  static readonly LICENSE_GLOB = 'LICEN{S,C}E{,.*}'
  config: {
    packages?: string[]
    command?: {
      [key: string]: any
    }
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

    let loaded: cosmiconfig.CosmiconfigResult

    try {
      loaded = explorer.searchSync(cwd)
    } catch (err) {
      // redecorate JSON syntax errors, avoid debug dump
      if (err.name === 'JSONError') {
        throw new ValidationError(err.name, err.message)
      }

      // re-throw other errors, could be ours or third-party
      throw err
    }

    if (loaded == null) {
      throw new ValidationError('LoadFail', 'Cosmiconfig failed to load config')
    }

    this.config = loaded.config
    this.rootConfigLocation = loaded.filepath
    this.rootPath = path.dirname(loaded.filepath)

    log.verbose('rootPath', this.rootPath)
  }

  get packageConfigs(): string[] {
    return this.config.packages || [Project.PACKAGE_GLOB]
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
      const packageJson = loadJsonFileSync(manifestLocation) as npm.PackageJson

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
      // redecorate JSON syntax errors, avoid debug dump
      if (err.name === 'JSONError') {
        throw new ValidationError(err.name, err.message)
      }

      // try again next time
      console.warn(err.stack || err)
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
      throw new ValidationError(err.name, err.message)
    }

    return licensePath
  }

  protected findFilesGlobOptions(customGlobOpts = {}): GlobbyOptions {
    const globOpts: GlobbyOptions = {
      ...customGlobOpts,
      cwd: this.rootPath,
      absolute: true,
      followSymlinkedDirectories: false,
      // POSIX results always need to be normalized
      transform: fpNormalize,
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

  findFiles<T = string>(
    fileName: string,
    fileMapper?: ((fp: string[]) => T[] | PromiseLike<T[]>) | null,
    customGlobOpts?: GlobbyOptions,
  ) {
    const options = this.findFilesGlobOptions(customGlobOpts)
    return pMap(
      this.packageConfigs.sort(),
      (globPath) => {
        let chain = globby(path.join(globPath, fileName), options)

        // fast-glob does not respect pattern order, so we re-sort by absolute path
        chain = chain.then((results) => results.sort())

        if (fileMapper) {
          return chain.then(fileMapper)
        }

        return chain as Promise<(T extends string ? T : never)[]>
      },
      {concurrency: 4},
    ).then(flattenResults)
  }

  getPackages() {
    const mapper = (packageConfigPath: string) =>
      loadJsonFile(packageConfigPath).then(
        (packageJson) =>
          new Package(
            packageJson as npm.PackageJson,
            path.dirname(packageConfigPath),
            this.rootPath,
          ),
      )

    return this.findFiles('package.json', (filePaths) =>
      pMap(filePaths, mapper, {concurrency: 50}),
    )
  }

  getPackageLicensePaths() {
    return this.findFiles(Project.LICENSE_GLOB, null, {case: false})
  }

  serializeConfig() {
    // TODO: might be package.json prop
    return writeJsonFile(this.rootConfigLocation, this.config, {
      indent: 2,
      detectIndent: true,
    }).then(() => this.rootConfigLocation)
  }
}

export const getPackages = (cwd: string) => new Project(cwd).getPackages()

function flattenResults<T>(results: (T | T[])[]) {
  return results.reduce((acc: T[], result) => acc.concat(result), [])
}

function fpNormalize(fp: EntryItem) {
  const s = typeof fp === 'string' ? fp : fp.path
  return path.normalize(s)
}
