import * as util from 'util'

import Command, {CommandArgs} from '../command'

import {Argv} from 'yargs/yargs'

// tslint:disable-next-line:no-require-imports
import indent = require('indent-string')

export const command = 'debug'
export const describe = 'Internal debugging command'

export function builder(y: Argv) {
  return y
}

const formatIndent = (o: any) =>
  indent(util.inspect(o, {colors: true, compact: false}), 4)

// tslint:disable-next-line:no-empty-interface
export interface Args extends CommandArgs {}

export default class DevCommand extends Command {
  initialize() {
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
  execute() {
    /* empty */
  }
}

export function handler(argv: Args) {
  return new DevCommand(argv)
}
