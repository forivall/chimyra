import Command, {CommandArgs} from '../command'

import {Argv} from 'yargs/yargs'

export const command = 'update'
export const describe = 'Bump the version of dependencies changed since last release'

export function builder(y: Argv) {
  return y
}

// tslint:disable-next-line:no-empty-interface
export interface Args extends CommandArgs {}

export default class UpdateCommand extends Command {
  initialize() {
    throw new Error('Method not implemented.')
  }
  execute() {
    throw new Error('Method not implemented.')
  }
  dryRun: undefined
}

export function handler(argv: Args) {
  return new UpdateCommand(argv)
}
