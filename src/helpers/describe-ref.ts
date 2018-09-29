import * as log from 'npmlog'

import * as childProcess from './child-process'

export interface DescribeRefOptions extends childProcess.ChildProcessOptions {
  match?: string
}

function getArgs(options: DescribeRefOptions) {
  const args = [
    'describe',
    // fallback to short sha if no tags located
    '--always',
    // always return full result, helps identify existing release
    '--long',
    // annotate if uncommitted changes present
    '--dirty',
    // prefer tags originating on upstream branch
    '--first-parent',
  ]

  if (options.match) {
    args.push('--match', options.match)
  }

  return args
}

export interface GitRef {
  refCount?: string
  sha?: string
  isDirty: boolean
  lastTagName?: string
  lastVersion?: string
}

export default async function describeRef(options: DescribeRefOptions = {}) {
  const {stdout} = await childProcess.exec('git', getArgs(options), options)

  const result = parse(stdout, options)

  log.verbose('git-describe', '%j => %j', options && options.match, stdout)
  log.silly('git-describe', 'parsed => %j', result)

  return result
}

export function sync(options = {}) {
  const stdout = childProcess.execSync('git', getArgs(options), options)
  const result = parse(stdout, options)

  // only called by collect-updates with no matcher
  log.silly('git-describe.sync', '%j => %j', stdout, result)

  return result
}

export function parse(stdout: string, options = {}): GitRef {
  // when git describe fails to locate tags, it returns only the minimal sha
  if (/^[0-9a-f]{7,40}/.test(stdout)) {
    // repo might still be dirty
    // tslint:disable-next-line:no-shadowed-variable
    const [, sha, isDirty] =
      /^([0-9a-f]{7,40})(-dirty)?/.exec(stdout) || ([] as (string | undefined)[])

    if (!sha) throw new Error('Parsing failed')

    // count number of commits since beginning of time
    // tslint:disable-next-line:no-shadowed-variable
    const refCount = childProcess.execSync('git', ['rev-list', '--count', sha], options)

    return {refCount, sha, isDirty: Boolean(isDirty)}
  }

  const [, lastTagName, lastVersion, refCount, sha, isDirty] =
    /^((?:.*@)?(.*))-(\d+)-g([0-9a-f]+)(-dirty)?$/.exec(stdout) ||
    ([] as (string | undefined)[])

  return {lastTagName, lastVersion, refCount, sha, isDirty: Boolean(isDirty)}
}
