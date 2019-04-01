import * as util from 'util'

import {Argv} from 'yargs'

import Command, {GlobalOptions} from '../command'

// tslint:disable-next-line:no-require-imports
import indent = require('indent-string')
import ValidationError from '../errors/validation';

export const command = 'debug'
export const describe = 'Internal debugging command'

export function builder(y: Argv) {
  return y.options({
    'current-only': {
      type: 'boolean'
    }
  })
}

const formatIndent = (o: any) =>
  indent(util.inspect(o, {colors: true, compact: false}), 4)

export interface Options extends GlobalOptions {
  currentOnly?: boolean
}

export default class DevCommand extends Command {
  options!: Options
  initialize() {
    if (this.options.currentOnly) {
      const pkg = this.currentPackage
      if (!pkg) throw new ValidationError('debug', 'must be in package')
      const g = this.packageGraph.get(pkg.name)!
      console.log(pkg)
      console.log('version:', pkg.version)
      console.log('prereleaseId:', g.prereleaseId)
      return
    }

    for (const [n, p] of this.packageGraph) {
      console.log(`${n}:`)
      console.log(`  localDependencies:`)
      for (const [d, s] of p.localDependencies) {
        console.log(`    ${d}:`)
        console.log(formatIndent(s))
      }
      console.log(`  externalDependencies:`)
      for (const [d, s] of p.externalDependencies) {
        console.log(`    ${d}:`)
        console.log(formatIndent(s))
      }
      console.log(`  localDependents:`)
      for (const [d, s] of p.localDependents) {
        console.log(`    ${d}:`)
        console.log(formatIndent(s))
      }
    }
  }
  dryRun: undefined
  execute() {
    /* empty */
  }
}

export function handler(argv: Options) {
  return new DevCommand(argv)
}
