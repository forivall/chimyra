import * as log from 'npmlog'
import {Argv, DetailedArguments, Options as YargsOptions} from 'yargs'

import {CommandArgs} from './command'
import {PackageJson} from '@npm/types'
import lazyExport from './helpers/lazy-export'
import {name} from './constants'

// tslint:disable-next-line:no-require-imports
import yargs = require('yargs/yargs')

// tslint:disable-next-line:no-var-requires no-require-imports
const pkg: PackageJson = require('../package.json')

export function globalOptions(y: yargs.Argv) {
  const opts: {[key: string]: yargs.Options} = {
    loglevel: {
      defaultDescription: 'info',
      describe: 'What level of logs to report.',
      type: 'string',
    },
    progress: {
      defaultDescription: 'true',
      describe:
        'Enable progress bars. (Always off in CI)\nPass --no-progress to disable.',
      type: 'boolean',
    },
    'dry-run': {
      describe:
        'Run only the `initialize()` stage of the command, and describe command state',
      type: 'boolean',
    },
  }

  return y
    .options(opts)
    .group(Object.keys(opts).concat(['help', 'version']), 'Global Options:')
}

export function cli(argv?: string[], cwd?: string) {
  const y = yargs(argv, cwd, require)
  return globalOptions(y)
    .usage('Usage: $0 <command> [options]')
    .demandCommand()
    .recommendCommands()
    .strict()
    .fail((msg, err) => {
      // some yargs validations throw strings :P
      const actual: Error & {code?: number} = err || new Error(msg)

      if (/Did you mean/.test(actual.message)) {
        log.error(name, `Unknown command "${(y.parsed as yargs.Detailed).argv._[0]}"`)
      }

      log.error(name, actual.message)

      // exit non-zero so the CLI can be usefully chained
      y.exit(actual.code || 1, actual)
    })
    .alias('h', 'help')
    .alias('V', 'version')
}

export default function main(argv: string[]) {
  const ctx: CommandArgs = {
    chimerVersion: pkg.version,
  }

  return cli()
    // TODO: explicitly list commands with imports
    .commandDir('./commands')
    .parse(argv, ctx)
}

// typecheck command modules

declare const DevCommand: typeof import('./commands/dev').default
// tslint:disable-next-line:no-require-imports
lazyExport(module, 'DevCommand', () => require('./commands/dev').default as typeof DevCommand)

export {DevCommand}

if (require.main === module) main(process.argv.slice(2))
