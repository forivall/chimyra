import * as path from 'path'

export default function isSubdir(parent: string, child: string) {
  return isSubdirPath(path.relative(parent, child))
}

export function isSubdirPath(rel: string) {
  return rel === '' || (rel && !rel.startsWith('..') && !path.isAbsolute(rel))
}
