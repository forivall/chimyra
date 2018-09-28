import * as os from 'os'

export function compact(p: string) {
  const homedir = os.homedir()

  if (homedir && p.startsWith(homedir)) {
    return `~${p.slice(homedir.length)}`
  }

  return p
}
