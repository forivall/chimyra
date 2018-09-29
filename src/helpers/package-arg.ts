import * as path from 'path'

import * as npa from 'npm-package-arg'

import Project from '../model/project'
import {isSubdirPath} from './is-subdir'
export interface NpaResultExt extends npa.Result {
  chi?: npa.Result
  file?: BuildFile
}

export interface BuildFile {
  name: string
  version: string
  buildPath: string
  basename: string
}

export function escapeScoped(name: string) {
  // see https://github.com/npm/cli/blob/1bc5b8c/lib/pack.js#L65
  return name[0] === '@' ? name.substr(1).replace(/\//g, '-') : name
}

export function getPackTarget(mani: {name: string; version: string}) {
  return `${escapeScoped(mani.name)}-${mani.version}.tgz`
}

export function fromPackTarget(
  project: Project | undefined,
  mani: npa.Result,
): BuildFile | undefined {
  if (!project || !npaResultIs('file', mani)) return
  if (!mani.fetchSpec) throw new Error('TODO')

  const buildPath = path.relative(project.buildRoot, mani.fetchSpec)

  if (!isSubdirPath(buildPath)) return

  const name = path.dirname(buildPath)

  if (name === '.') return

  const basename = path.basename(buildPath, '.tgz')
  const prefix = escapeScoped(name)
  const version = basename.startsWith(`${prefix}-`)
    ? basename.slice(prefix.length + 1)
    : basename

  return {name, version, buildPath, basename}
}

function npaResultIs<T extends npa.Result['type']>(
  type: T,
  r: npa.Result,
): r is npa.Result & {type: T} {
  return r.type === type
}
