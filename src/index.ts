import * as yargs from 'yargs/yargs'

import * as log from 'npmlog'
import {name} from './constants'
import {PackageJson} from '@npm/types'

// tslint:disable-next-line:no-var-requires no-require-imports
const pkg: PackageJson = require('../package.json')

export function cli(argv?: string[], cwd?: string) {
  const y = yargs(argv, cwd, require)
  return y
    .usage('Usage: $0 <command> [options]')
    .demandCommand()
    .recommendCommands()
    .strict()
    .fail((msg, err) => {
      // some yargs validations throw strings :P
      const actual: Error & {code?: number} = err || new Error(msg)

      if (/Did you mean/.test(actual.message)) {
        log.error(
          name,
          `Unknown command "${(y.parsed as yargs.Detailed).argv._[0]}"`,
        )
      }

      log.error(name, actual.message)

      // exit non-zero so the CLI can be usefully chained
      y.exit(actual.code || 1, actual)
    })
    .alias('h', 'help')
    .alias('V', 'version')
}

export default function main(argv: string[]) {
  const ctx = {
    chimerVersion: pkg.version,
  }

  return cli()
    .commandDir('./commands')
    .parse(argv, ctx)
}

import lazyExport from './helpers/lazy-export'
declare const DevCommand: typeof import('./commands/dev').default
// tslint:disable-next-line:no-require-imports
lazyExport(module, 'DevCommand', () => require('./commands/dev').default)

export {DevCommand}

if (require.main === module) main(process.argv.slice(2))
