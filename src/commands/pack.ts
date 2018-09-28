import * as childProcess from '../helpers/child-process'
import * as fs from 'fs-extra'
import * as homedir from '../helpers/homedir'
import * as npa from 'npm-package-arg'
import * as path from 'path'

import Command, {CommandArgs} from '../command'

import {Argv} from 'yargs/yargs'
import {Dependencies} from '@npm/types'
import Package from '../model/package'
import ValidationError from '../errors/validation'
import {getBuildDir} from '../helpers/build-paths'
import getExecOpts from '../helpers/npm-exec-opts'

export const command = 'pack'
export const describe = 'Run `npm pack`, on current package with preprocessing & reset'

export function builder(y: Argv) {
  return y
}

// tslint:disable-next-line:no-empty-interface
export interface Args extends CommandArgs {}

const prefix = 'PACK'

export type FilterKeys<T, U> = {
  [K in keyof T]: NonNullable<T[K]> extends U ? K : never
}[keyof T]

export default class PackCommand extends Command {
  // Override to change ? to !
  currentPackage!: Package

  originalPackage!: Package
  initialize() {
    if (!this.currentPackage || !this.currentPackageNode) {
      throw new ValidationError(prefix, 'Must be run from a package folder')
    }

    // TODO: update version based on git sha & dirty, optional to turn off

    const curPkg = this.currentPackage
    this.originalPackage = new Package(curPkg.toJSON(), curPkg.location, curPkg.rootPath)
    this.setAbsolutePath('dependencies')
    // TODO: these two can probably be optional
    this.setAbsolutePath('optionalDependencies')
    this.setAbsolutePath('devDependencies')
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
    const curPkg = this.currentPackage

    const buildDir = getBuildDir(this.project, curPkg)
    this.logger.verbose(prefix, 'mkdirp %s', buildDir)
    await fs.mkdirp(buildDir)

    const maniBackup = `${curPkg.manifestLocation}.orig`

    this.logger.verbose(prefix, 'mv %s %s', curPkg.manifestLocation, maniBackup)
    await fs.rename(curPkg.manifestLocation, maniBackup)

    this.logger.verbose(prefix, 'update package.json')
    await curPkg.serialize()

    const target = curPkg.packTarget

    this.logger.verbose(prefix, 'npm pack')
    const packReturn = await childProcess.spawnStreaming(
      'npm',
      ['pack'],
      getExecOpts(curPkg),
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
    await fs.rename(path.join(curPkg.location, tgz), buildFile)

    this.logger.verbose(prefix, 'mv %s %s', curPkg.manifestLocation, maniBackup)
    await fs.rename(maniBackup, curPkg.manifestLocation)

    const absPath = homedir.compact(buildFile)
    const relPath = path.relative(process.cwd(), buildFile)
    this.logger.info(prefix, 'Wrote package to %s', minLength(absPath, relPath))
  }
}

function minLength(a: string, b: string) {
  return a.length <= b.length ? a : b
}

export function handler(argv: Args) {
  return new PackCommand(argv)
}
