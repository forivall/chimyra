import * as log from 'npmlog'
import * as path from 'path'
// tslint:disable-next-line: no-require-imports
import slash = require('slash')
import * as childProcess from '../child-process'

interface GitAddOptions extends childProcess.ChildProcessOptions {
  cwd: string
  update?: boolean
}

// tslint:disable-next-line: promise-function-async
export default function gitAdd(files: string[], opts: GitAddOptions) {
  log.silly('gitAdd', '', files)

  const filePaths = files.map((file) =>
    slash(path.relative(opts.cwd, path.resolve(opts.cwd, file))),
  )

  const options = []
  if (opts.update) options.push('--update')

  return childProcess.exec('git', ['add', ...options, '--', ...filePaths], opts)
}
