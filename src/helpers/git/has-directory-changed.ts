import * as log from 'npmlog'

import * as childProcess from '../child-process'

export interface IsDirectoryDirtyOptions extends childProcess.ChildProcessOptions {
  ref?: string
  dir?: string
}

function getArgs(options: IsDirectoryDirtyOptions = {}) {
  const args = [
    'diff',
    // faster
    '--no-ext-diff',
    // don't actually print diff
    '--quiet',
    // return if diff in exit code
    '--exit-code',
    // the commit to compare against
    options.ref || 'HEAD',
    // the directory. defaults to using cwd, and generally, just passing cwd is better
    '--', options.dir || '.',
  ]

  // tslint:disable-next-line:no-var-before-return
  return args
}

export default async function hasDirectoryChanged(options: IsDirectoryDirtyOptions = {}) {
  const {code} = await childProcess.exec('git', getArgs(options), {...options, reject: false})

  log.silly('is-directory-dirty', '%s/%s => %j', options.cwd || '.', options.dir || '.', code)

  return code !== 0
}

export function sync(options: IsDirectoryDirtyOptions = {}) {
  const {code} = childProcess.execSync('git', getArgs(options), {...options, reject: false})

  // only called by collect-updates with no matcher
  log.silly('is-directory-dirty.sync', '%s/%s => %j', options.cwd || '.', options.dir || '.', code)

  return code !== 0
}
