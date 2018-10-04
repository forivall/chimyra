import * as log from 'npmlog'
import * as path from 'path'
import slash = require('slash')
import * as childProcess from '../child-process'

interface GitAddOptions extends childProcess.ChildProcessOptions {
  cwd: string
}

export default function gitAdd(files: string[], opts: GitAddOptions) {
  log.silly('gitAdd', '', files)

  const filePaths = files.map((file) =>
    slash(path.relative(opts.cwd, path.resolve(opts.cwd, file))),
  )

  return childProcess.exec('git', ['add', '--', ...filePaths], opts)
}
