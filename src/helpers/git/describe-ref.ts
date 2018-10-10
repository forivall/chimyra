import * as log from 'npmlog'

import * as childProcess from '../child-process'
import Package from '../../model/package';
import {never} from '../types';

export type DescribeRefPkgMatch = 'name' | 'name-@'
export interface DescribeRefOptions extends childProcess.ChildProcessOptions {
  match?: string
  matchPkg?: DescribeRefPkgMatch
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

  const match = options.match || matchPackage(options.matchPkg, options.pkg)

  if (match) {
    args.push('--match', match)
  }

  return args
}

function matchPackage(on?: DescribeRefPkgMatch, pkg?: Package): string | undefined {
  if (!on || !pkg) return

  switch (on) {
    case 'name': return `${pkg.name}-*`
    // This is the lerna format
    case 'name-@': return `${pkg.name}@*`

    default: never(on)
  }
}

export interface GitRef {
  refCount: number
  sha: string
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

export function sync(options: DescribeRefOptions = {}) {
  const {stdout} = childProcess.execSync('git', getArgs(options), options)
  const result = parse(stdout, options)

  // only called by collect-updates with no matcher
  log.silly('git-describe.sync', '%j => %j', stdout, result)

  return result
}

export function parse(stdout: string, options: DescribeRefOptions = {}): GitRef {
  // when git describe fails to locate tags, it returns only the minimal sha
  if (/^[0-9a-f]{7,40}/.test(stdout)) {
    // repo might still be dirty
    // tslint:disable-next-line:no-shadowed-variable
    const [, sha = null, isDirty = null] =
      /^([0-9a-f]{7,40})(-dirty)?/.exec(stdout) || []

    if (!sha) throw new Error('Parsing failed')

    // count number of commits since beginning of time
    // tslint:disable-next-line:no-shadowed-variable
    const {stdout: refCount} = childProcess.execSync('git', ['rev-list', '--count', sha], options)

    if (!/^\d+$/.test(refCount)) {
      throw new Error('Invalid ref count ' + refCount)
    }

    return {refCount: Number(refCount), sha, isDirty: Boolean(isDirty)}
  }

  const re = options.matchPkg === 'name-@'
    ? /^((?:.*@)?(.*))-(\d+)-g([0-9a-f]+)(-dirty)?$/
    // 'name' is the default
    : /^((?:.*-v)?(.*))-(\d+)-g([0-9a-f]+)(-dirty)?$/

  const [, lastTagName, lastVersion, refCount, sha, isDirty] =
    re.exec(stdout) || ([] as (string | undefined)[])

  if (!refCount || !sha) throw new Error('Parsing failed')

  return {lastTagName, lastVersion, refCount: Number(refCount), sha, isDirty: Boolean(isDirty)}
}
