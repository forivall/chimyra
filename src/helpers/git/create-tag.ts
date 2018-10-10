import * as log from 'npmlog'

import * as childProcess from '../child-process'

interface Args {
  signGitTag?: boolean
}

export default function gitTag(
  pkg: {name: string, version: string},
  {signGitTag}: Args,
  opts?: childProcess.ChildProcessOptions,
) {
  const tag = gitTagName(pkg)
  const msg = `${pkg.name} v${pkg.version}`

  log.silly('gitTag', tag)

  const args = ['tag', tag, '-m', msg]

  if (signGitTag) {
    args.push('--sign')
  }

  log.verbose('git', '', args)
  return childProcess.exec('git', args, opts)
}

// TODO: it appears that lerna uses `${pkg.name}@${pkg.version}`
export function gitTagName(pkg: {name: string, version: string}) {
  return `${pkg.name}-v${pkg.version}`
}
