import * as os from 'os'
import * as path from 'path'

export function compact(p: string) {
  const homedir = os.homedir()

  if (homedir && p.startsWith(homedir)) {
    return `~${p.slice(homedir.length)}`
  }

  return p
}

export function minimize(p: string, cwd = '.') {
  const absPath = compact(p)
  const relPath = path.relative(cwd, p)
  return minLength(absPath, relPath)
}

export function minLength(a: string, b: string) {
  return a.length <= b.length ? a : b
}
