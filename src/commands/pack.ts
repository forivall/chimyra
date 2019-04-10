import * as path from 'path'

import {ExecaReturns} from 'execa'
import * as fs from 'fs-extra'
import {iterate} from 'iterare'
import * as semver from 'semver'
import {Argv} from 'yargs'
import {cloneDeep} from 'lodash'

import {GlobalOptions} from '../command'
import ValidationError, {NoCurrentPackage} from '../errors/validation'
import {getBuildDir, getBuildFile} from '../helpers/build-paths'
import * as childProcess from '../helpers/child-process'
import describeRef, {GitRef} from '../helpers/git/describe-ref'
import hasDirectoryChanged from '../helpers/git/has-directory-changed'
import * as homedir from '../helpers/homedir'
import isSubdir from '../helpers/is-subdir'
import getExecOpts from '../helpers/npm-exec-opts'
import Package from '../model/package'
import SetAbsPathCommand from './set-absolute-path'
import {promptVersion} from './version'

export const command = 'pack'
export const describe = 'Run `npm pack`, on current package with preprocessing & reset'
const prefix = 'PACK'

export function builder(y: Argv) {
  return y.options({
    force: {
      type: 'boolean',
      default: false,
      description: 'Overwrite package file, even if it already exists',
    },
    dirty: {
      type: 'boolean',
      default: false,
      description: 'allow packaging when directory is dirty'
    }
  })
}

// tslint:disable-next-line:no-empty-interface
export interface Options extends GlobalOptions {
  force?: boolean
  dirty?: boolean
}

export type FilterKeys<T, U> = {
  [K in keyof T]: NonNullable<T[K]> extends U ? K : never
}[keyof T]

export async function exists(file: string) {
  return !(await fs
    .access(file, fs.constants.F_OK)
    .catch((err: NodeJS.ErrnoException) => {
      if (err.code === 'ENOENT') return true
      throw err
    }))
}

export function formatVersionWithBuild(v: semver.SemVer): string {
  let out = `${v.major}.${v.minor}.${v.patch}`
  if (v.prerelease.length) {
    out += '-' + v.prerelease.join('.')
  }
  if (v.build.length) {
    out += '+' + v.build.join('.')
  }
  return out
}

export async function makeGitSemver(pkg: {name: string, version: string | semver.SemVer}, ref: GitRef) {
  let version
  if (typeof pkg.version === 'string') {
    version = semver.parse(pkg.version)
    if (!version) throw new Error('Invalid current version: ' + pkg.version)
  } else {
    version = cloneDeep(pkg.version)
  }

  if (version.prerelease.length === 0) {
    const versionBase = await promptVersion(pkg.version, pkg.name, {
      bumps: ['patch', 'minor', 'major'],
      message: 'Select version base for prerelease package:',
    })
    version = semver.parse(versionBase)
    if (!version) throw new Error(`Invalid prompted version ${version}`)
  }

  version.prerelease = version.prerelease.concat(String((ref.refCount || 1) - 1))
  version.build = version.build.concat(ref.sha)

  return version
}
export async function makeGitVersion(pkg: Package, ref: GitRef) {
  return formatVersionWithBuild(await makeGitSemver(pkg, ref))
}

export default class PackCommand extends SetAbsPathCommand {
  // Override to change ? to !
  currentPackage!: Package
  originalPackage!: Package

  options!: Options

  async initialize() {
    if (!this.currentPackage || !this.currentPackageNode) {
      throw new NoCurrentPackage()
    }
    const pkg = this.currentPackage

    const ref = await describeRef({pkg, matchPkg: 'name'})

    const isDirty = ref.isDirty && (await hasDirectoryChanged({cwd: pkg.location}))
    if (isDirty && !this.options.dirty) {
      throw new ValidationError('EDIRTY', 'Current package directory cannot be dirty')
    }

    // update version based on git sha, TODO: add option to turn off
    this.logger.verbose(
      prefix,
      'Checking version...',
      pkg.version,
      ref,
      pkg.version === ref.lastVersion,
    )
    const {name} = pkg
    let version = semver.parse(pkg.version)
    if (!version) throw new Error('Invalid current version: ' + pkg.version)

    if (
      pkg.version !== ref.lastVersion ||
      (ref.refCount !== 0 &&
        (await hasDirectoryChanged({
          ref: ref.lastTagName,
        })))
    ) {
      this.logger.verbose(prefix, 'Making git version...')
      version = await makeGitSemver({name, version}, ref)
      const gitVersion = formatVersionWithBuild(version)
      this.logger.info(prefix, 'Using git-based version %s', gitVersion)
      pkg.version = gitVersion
    }

    if (isDirty) {
      version.prerelease = version.prerelease.concat('dirty')
      const dirtyVersion = formatVersionWithBuild(version)
      this.logger.info(prefix, 'Using dirty version %s', dirtyVersion)
      if (dirtyVersion) pkg.version = dirtyVersion
    }

    let buildFile = getBuildFile(this.project, pkg)
    if (!this.options.force && (await exists(buildFile))) {
      if (!isDirty || !this.options.dirty) {
        throw new ValidationError(
          'EPKGBUILT',
          'Package %s already exists. Use --force to overwrite.',
          homedir.minimize(buildFile),
        )
      }
      let i = 0

      do {
        ++i
        const ver = cloneDeep(version)
        version.prerelease = version.prerelease.concat(`${i}`)
        pkg.version = formatVersionWithBuild(ver)
        buildFile = getBuildFile(this.project, pkg)
        this.logger.info(prefix, 'Try: %s', buildFile)
      } while (await exists(buildFile))
    }
    this.logger.info(prefix, 'Target: %s', buildFile)
    if (!this.options.force && (await exists(buildFile))) {
      throw new ValidationError(
        'EPKGBUILT',
        'Package %s already exists. Use --force to overwrite.',
        homedir.minimize(buildFile),
      )
    }

    // check if any non-bundled dependencies are defined as links, fail if they are
    // and instruct the user to run `prepare`
    const unpackableLinks = iterate(this.currentPackageNode.localDependencies.values())
      .filter(
        (mani) => mani.type === 'directory' && !isSubdir(pkg.location, mani.fetchSpec!),
      )
      .map((mani) => mani.name!)
      .toArray()
    if (unpackableLinks.length > 0) {
      throw new ValidationError(
        'ENOLINK',
        'Cannot pack symlinks to %s',
        unpackableLinks.join(', '),
      )
    }

    this.setAbsolutePath('dependencies')
    // TODO: these two can probably be optional
    this.setAbsolutePath('optionalDependencies')
    this.setAbsolutePath('devDependencies')
  }

  async dryRun() {
    const curPkg = this.currentPackage
    const target = curPkg.packTarget

    const dryPackReturn = await childProcess.spawnStreaming(
      'npm',
      ['pack', '--dry-run'],
      getExecOpts(curPkg),
      prefix,
    )
    const dryTgz = parsePackResult(dryPackReturn)
    if (dryTgz !== target) {
      this.logger.warn(
        prefix,
        'Mismatching pack target!! expected %s got %s (dry run)',
        dryTgz,
        target,
      )
    }
  }

  async execute() {
    const pkg = this.currentPackage
    const buildDir = getBuildDir(this.project, pkg)

    const target = pkg.packTarget
    const targetFile = path.join(buildDir, target)

    if (!this.options.force && (await exists(targetFile))) {
      this.logger.info(prefix, 'Package exists. Not overwriting')
      return targetFile
    }

    this.logger.verbose(prefix, 'mkdirp %s', buildDir)
    await fs.mkdirp(buildDir)

    const maniBackup = await super.execute()

    this.logger.verbose(prefix, 'npm pack')
    // TODO: use @pika/pack - and/or allow plugins for packing
    // https://www.pikapkg.com/blog/introducing-pika-pack/
    const packReturn = await childProcess.spawnStreaming(
      'npm',
      ['pack'],
      getExecOpts(pkg),
      prefix,
    )

    const tgz = parsePackResult(packReturn)

    if (tgz !== target) {
      this.logger.warn(
        prefix,
        'Mismatching pack target!! expected %s got %s',
        tgz,
        target,
      )
    }

    // TODO: should we use target here instead of tgz??
    const buildFile = path.join(buildDir, tgz)
    await fs.rename(path.join(pkg.location, tgz), buildFile)

    this.logger.verbose(prefix, 'mv %s %s', pkg.manifestLocation, maniBackup)
    await fs.rename(maniBackup, pkg.manifestLocation)

    this.logger.info(prefix, 'Wrote package to %s', homedir.minimize(buildFile))

    return buildFile
  }
}

function parsePackResult(packReturn: ExecaReturns) {
  const {stdout} = packReturn
  const match = /[^\r\n]+$/.exec(stdout)
  if (match) return match[0]
  return packReturn.stdout
}

export function handler(argv: Options) {
  return new PackCommand(argv)
}
