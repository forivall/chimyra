import Command, {CommandArgs} from '../command'

import {Argv} from 'yargs/yargs'

export const command = 'version [bump]'
export const describe = 'Bump the version of the current application / package'

export function builder(y: Argv) {
  return y.options({
    // preid is copied into ./publish because a whitelist for one option isn't worth it
    preid: {
      describe: 'Specify the prerelease identifier when versioning a prerelease',
      type: 'string',
      requiresArg: true,
      defaultDescription: 'alpha',
    },
    y: {
      describe: 'Skip all confirmation prompts.',
      alias: 'yes',
      type: 'boolean',
    },
  })
}

// tslint:disable-next-line:no-empty-interface
export interface Args extends CommandArgs {}

export default class VersionCommand extends Command {
  initialize() {
    throw new Error('Method not implemented.')
  }
  execute() {
    throw new Error('Method not implemented.')
  }
}

export function handler(argv: Args) {
  return new VersionCommand(argv)
}
