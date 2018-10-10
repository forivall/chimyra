import {Argv} from 'yargs/yargs'

import Command, {GlobalOptions} from '../command'

export const command = 'example'
export const aliases = []
export const describe = ''

export function builder(y: Argv) {
  return y.options({
  })
}

// tslint:disable-next-line:no-empty-interface
export interface Options extends GlobalOptions {
}

/* tslint:disable:no-empty class-name */
export default class _Command extends Command {
  options!: Options
  initialize() {
  }
  dryRun: undefined
  execute() {
  }
}

export function handler(argv: Options) {
  return new _Command(argv)
}
