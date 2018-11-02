import * as path from 'path'

import {Dependencies} from '@npm/types'
import * as fs from 'fs-extra'
import * as npa from 'npm-package-arg'
import {Argv} from 'yargs'

import Command, {GlobalOptions} from '../command'
import ValidationError, {NoCurrentPackage} from '../errors/validation'
import * as homedir from '../helpers/homedir'
import Package from '../model/package'

export const command = 'set-absolute-path'
export const describe = 'Change from relative to absolute paths for tgz in package.json'

export function builder(y: Argv) {
  return y.options({})
}

// tslint:disable-next-line:no-empty-interface
export interface Options extends GlobalOptions {}

const prefix = 'ABSPATH'

type FilterKeys<T, U> = {
  [K in keyof T]: NonNullable<T[K]> extends U ? K : never
}[keyof T]

export default class SetAbsPathCommand extends Command {
  // Override to change ? to !
  currentPackage!: Package
  originalPackage!: Package

  options!: Options

  async initialize() {
    if (!this.currentPackage || !this.currentPackageNode) {
      throw new NoCurrentPackage()
    }
    this.setAbsolutePath('dependencies')
    // TODO: these two can probably be optional
    this.setAbsolutePath('optionalDependencies')
    this.setAbsolutePath('devDependencies')
  }

  setAbsolutePath(
    depsArg: Dependencies | FilterKeys<Package, Dependencies> | undefined,
  ) {
    this.logger.info(prefix, 'Setting abs path', depsArg)
    const deps = typeof depsArg === 'string' ? this.currentPackage[depsArg] : depsArg
    if (!deps) {
      if (typeof depsArg === 'string') {
        this.logger.silly(prefix, 'Package has no %s', depsArg)
      }
      return deps
    }

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

  // tslint:disable-next-line:no-empty
  async dryRun() {}
  async execute() {
    const pkg = this.currentPackage

    const maniBackup = `${pkg.manifestLocation}.orig`

    this.logger.verbose(prefix, 'mv %s %s', pkg.manifestLocation, maniBackup)
    await fs.copy(pkg.manifestLocation, maniBackup)

    this.logger.verbose(prefix, 'update package.json')
    await pkg.serialize()

    return maniBackup
  }
}

export function handler(argv: Options) {
  return new SetAbsPathCommand(argv)
}
