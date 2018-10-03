import * as path from 'path'

import {Dependencies} from '@npm/types'
import * as fs from 'fs-extra'
import {iterate} from 'iterare'
import * as npa from 'npm-package-arg'
import {Argv} from 'yargs/yargs'

import Command, {CommandArgs, CommandContext} from '../command'
import ValidationError from '../errors/validation'
import {getBuildDir} from '../helpers/build-paths'
import {throwIfUncommitted} from '../helpers/check-working-tree'
import * as childProcess from '../helpers/child-process'
import describeRef from '../helpers/describe-ref'
import * as homedir from '../helpers/homedir'
import isSubdir from '../helpers/is-subdir'
import getExecOpts from '../helpers/npm-exec-opts'
import Package from '../model/package'

export const command = 'pack'
export const describe = 'Run `npm pack`, on current package with preprocessing & reset'

export function builder(y: Argv) {
  return y.options({
    force: {
      type: 'boolean',
      default: true,
      description: 'Overwrite package file, even if it already exists',
    },
  })
}

// tslint:disable-next-line:no-empty-interface
export interface Args extends CommandArgs {
  force?: boolean
}

const prefix = 'PACK'

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

export default class PackCommand extends Command {
  // Override to change ? to !
  currentPackage!: Package
  originalPackage!: Package

  force: boolean

  constructor(args: Args, context?: CommandContext) {
    super(args, context)

    this.force = args.force !== false
  }

  initialize() {
    if (!this.currentPackage || !this.currentPackageNode) {
      throw new ValidationError(prefix, 'Must be run from a package folder')
    }

    // TODO: update version based on git sha & dirty, optional to turn off

    // TODO: check if any non-bundled dependencies are defined as links, fail if they are
    // and instruct the user to run `prepare`
    const unpackableLinks = iterate(this.currentPackageNode.localDependencies.values())
      .filter(
        (mani) =>
          mani.type === 'directory' &&
          !isSubdir(this.currentPackage.location, mani.fetchSpec!),
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

    const curPkg = this.currentPackage
    this.originalPackage = new Package(curPkg.toJSON(), curPkg.location, curPkg.rootPath)
    this.setAbsolutePath('dependencies')
    // TODO: these two can probably be optional
    this.setAbsolutePath('optionalDependencies')
    this.setAbsolutePath('devDependencies')
  }

  verifyWorkingTreeClean() {
    return describeRef(this.execOpts).then(throwIfUncommitted)
  }

  setAbsolutePath(
    depsArg: Dependencies | FilterKeys<Package, Dependencies> | undefined,
  ) {
    const deps = typeof depsArg === 'string' ? this.currentPackage[depsArg] : depsArg
    if (!deps) {
      if (typeof depsArg === 'string') {
        this.logger.silly(prefix, 'Package has no %s', depsArg)
      }
      return deps
    }

    // TODO: if version doesn't match current state, update version with suffix
    // of current git sha and "-DIRTY" if current directory is dirty

    const where = this.currentPackage.location
    for (const depName of Object.keys(deps)) {
      const resolved = npa.resolve(depName, deps[depName], where)
      this.logger.silly(prefix, depName, resolved)

      if (resolved.type === 'file') {
        this.logger.info(prefix, 'Updating %s dependency to absolute path', depName)

        let tgzPath = resolved.fetchSpec
        if (!tgzPath) {
          throw new ValidationError(
            prefix,
            'Could not resolve tarball location for %s',
            depName,
          )
        }

        // TODO: make this transform optional
        tgzPath = homedir.compact(tgzPath)

        deps[depName] = `file:${tgzPath}`
      }

      // TODO: check if resolved is a link that points outside of the directory,
      // and fail if so
    }
    return deps
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
    const dryTgz = dryPackReturn.stdout
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

    if (!this.force && (await exists(targetFile))) {
      this.logger.info(prefix, 'Package exists. Not overwriting')
      return targetFile
    }

    this.logger.verbose(prefix, 'mkdirp %s', buildDir)
    await fs.mkdirp(buildDir)

    const maniBackup = `${pkg.manifestLocation}.orig`

    this.logger.verbose(prefix, 'mv %s %s', pkg.manifestLocation, maniBackup)
    await fs.copy(pkg.manifestLocation, maniBackup)

    this.logger.verbose(prefix, 'update package.json')
    await pkg.serialize()

    this.logger.verbose(prefix, 'npm pack')
    const packReturn = await childProcess.spawnStreaming(
      'npm',
      ['pack'],
      getExecOpts(pkg),
      prefix,
    )

    const tgz = packReturn.stdout

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

export function handler(argv: Args) {
  return new PackCommand(argv)
}
