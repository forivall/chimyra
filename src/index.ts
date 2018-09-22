
import yargs = require('yargs/yargs')

import * as log from 'npmlog'

const name = 'elaius'

export function cli(argv?: string[], cwd?: string) {
  const y = yargs(argv, cwd, require)
  return y
    .usage('Usage: $0 <command> [options]')
    .demandCommand()
    .recommendCommands()
    .strict()
    .fail((msg, err) => {
      // some yargs validations throw strings :P
      const actual: Error & {code?: number} = err || new Error(msg);

      if (/Did you mean/.test(actual.message)) {
        log.error(name, `Unknown command "${(y.parsed as yargs.Detailed).argv._[0]}"`);
      }

      log.error(name, actual.message);

      // exit non-zero so the CLI can be usefully chained
      y.exit(actual.code || 1, actual);
    })
    .alias('h', 'help')
    .alias('V', 'version')
}

export default function main(argv: string[]) {
  const ctx = {}

  return cli()
    .commandDir('./commands')
    .parse(argv, ctx)
}

// import lazyExport from './helpers/lazy-export'
// declare const DevCommand: typeof import('./commands/dev').default
// lazyExport(module, 'DevCommand', () => require('./commands/dev').default)

export {default as DevCommand} from './commands/dev'
