declare module 'yargs/yargs' {
  import * as yargs from 'yargs'

  function Yargs(
    processArgs?: string[],
    cwd?: string,
    parentRequire?: NodeRequireFunction,
  ): Yargs.Argv

  namespace Yargs {
    // reexport for simplicity
    type Options = yargs.Options
    type Arguments = yargs.Arguments

    // patch with `detailed`
    interface Argv extends yargs.Argv {
      parsed: Detailed | false
      exit(code: number, err: Error): void
    }
    // As described at https://github.com/yargs/yargs-parser#requireyargs-parserdetailedargs-opts
    interface Detailed {
      argv: {
        _: string[]
        [argName: string]: any
      }
      error: null | Error
      aliases: {
        [argName: string]: string[]
      }
      newAliases: {
        [argName: string]: true
      }
      configuration: {
        [config: string]: any
      }
    }
  }

  export = Yargs
}
