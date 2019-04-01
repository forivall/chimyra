import * as path from 'path'
import * as globby from 'globby'
import {Argv} from 'yargs'

import Command, {GlobalOptions} from '../command'
import ValidationError, {NoCurrentPackage} from '../errors/validation'
import {confirm} from '../helpers/prompt'
import {Argument2} from '../helpers/types'

export const command = 'force-dedupe [names..]'
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
  names?: string[]
}

const NOT_TYPES = 'You are deduping a non-@types package. Are you sure you want to continue?'

export default class ForceDedupeCommand extends Command {
  options!: Options
  trashPaths?: string[]
  async initialize() {
    if (!this.currentPackage || !this.currentPackageNode) {
      throw new NoCurrentPackage()
    }
    const packages = (this.options.names || []).length > 0 ? this.options.names! : ['@types/node']
    if (
      !this.options.dryRun &&
      packages.some((name) => !name.startsWith('@types/')) &&
      !(await confirm(NOT_TYPES))
    ) {
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

    this.trashPaths = await packages.reduce<Promise<string[]>>(async (trashPaths, name) => {
      this.logger.info('force-dedupe', `finding children of ${name}`)
      const paths = await globby(path.join('node_modules', '**', name), globOptions)
      const root = path.join('node_modules', name)
      const rootIndex = paths.findIndex((p) => p === root)
      this.logger.verbose(prefix, 'Found %j', paths)
      if (rootIndex < 0) {
        throw new ValidationError('EDEDUPENOROOT', 'Dependency not found')
      }

      paths.splice(rootIndex, 1)
      return (await trashPaths).concat(paths)
    }, Promise.resolve([]))
  }
  dryRun: undefined
  async execute() {
    if (this.trashPaths && this.trashPaths.length > 0) {
      this.logger.info(prefix, 'Trashing paths:\n%s', this.trashPaths.join('\n'))
      await trash(this.trashPaths)
    }
  }
}

export function handler(argv: Options) {
  return new ForceDedupeCommand(argv)
}
