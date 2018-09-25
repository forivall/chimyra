import Command, {CommandArgs} from '../command'

import {Argv} from 'yargs/yargs'

export const command = 'dev'
export const aliases = ['develop']
export const describe = 'Link local packages in current project'

export function builder(y: Argv) {
  return y
}

// tslint:disable-next-line:no-empty-interface
export interface Args extends CommandArgs {}

export function handler(argv: Args) {
  return new DevCommand(argv)
}

export default class DevCommand extends Command {
  initialize() {
    throw new Error('Method not implemented.')
  }
  execute() {
    throw new Error('Method not implemented.')
  }
}
