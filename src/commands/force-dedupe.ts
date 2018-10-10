import * as path from 'path'
import * as globby from 'globby'
import {Argv} from 'yargs/yargs'

import Command, {GlobalOptions} from '../command'
import ValidationError, {NoCurrentPackage} from '../errors/validation'
import {confirm} from '../helpers/prompt'
import {Argument2} from '../helpers/types'

export const command = 'force-dedupe [name]'
export const describe = 'list packages'

import trash = require('trash')
import {name as prefix} from '../constants';

export function builder(y: Argv) {
  return y.options({
  })
}

type GlobbyOptions = NonNullable<Argument2<typeof globby>>

// tslint:disable-next-line:no-empty-interface
export interface Options extends GlobalOptions {
  name?: string
}

const NOT_TYPES = 'You are deduping a non-@types package. Are you sure you want to continue?'

export default class ForceDedupeCommand extends Command {
  options!: Options
  trashPaths?: string[]
  async initialize() {
    if (!this.currentPackage || !this.currentPackageNode) {
      throw new NoCurrentPackage()
    }
    const name = this.options.name || '@types/node'
    if (!name.startsWith('@types/') && !(await confirm(NOT_TYPES))) {
      return
    }
    const globOptions: GlobbyOptions = {
      cwd: this.currentPackage.location,
      // onlyFiles: false,
      onlyDirectories: true,
      // expandDirectories: true,
      // deep: true,
      // gitignore: false,
      // globstar: true
      // expandDirectories: true
    } || this.project.findFilesGlobOptions()
    const paths = await globby(path.join('node_modules', '**', name), globOptions)
    const root = path.join('node_modules', name)
    const rootIndex = paths.findIndex((p) => p === root)
    this.logger.verbose(prefix, 'Found %j', paths)
    if (rootIndex < 0) {
      throw new ValidationError('EDEDUPENOROOT', 'Dependency not found')
    }

    paths.splice(rootIndex, 1)
    this.trashPaths = paths
  }
  dryRun: undefined
  execute() {
    if (this.trashPaths) {
      this.logger.info(prefix, 'Trashing paths:\n%s', this.trashPaths.join('\n'))
      trash(this.trashPaths)
    }
  }
}

export function handler(argv: Options) {
  return new ForceDedupeCommand(argv)
}
