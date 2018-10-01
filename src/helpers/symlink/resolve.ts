import * as readCmdShim from 'read-cmd-shim'
import * as fs from 'fs-extra'
import * as log from 'npmlog'
import * as path from 'path'

export default function resolveSymlink(filePath: string) {
  log.silly('resolveSymlink', filePath)

  const result =
    process.platform === 'win32'
      ? resolveWindowsSymlink(filePath)
      : resolvePosixSymlink(filePath)

  log.verbose('resolveSymlink', '%j', [filePath, result])

  return result
}

interface ResolvedLink {
  resolvedPath: string | false
  lstat: fs.Stats
}

function resolveSymbolicLink(filePath: string): ResolvedLink {
  const lstat = fs.lstatSync(filePath)
  const resolvedPath = lstat.isSymbolicLink()
    ? path.resolve(path.dirname(filePath), fs.readlinkSync(filePath))
    : false

  return {
    resolvedPath,
    lstat,
  }
}

function resolvePosixSymlink(filePath: string) {
  return resolveSymbolicLink(filePath).resolvedPath
}

function resolveWindowsSymlink(filePath: string) {
  const {resolvedPath, lstat} = resolveSymbolicLink(filePath)

  if (lstat.isFile() && !resolvedPath) {
    try {
      return path.resolve(path.dirname(filePath), readCmdShim.sync(filePath))
    } catch (e) {
      return false
    }
  }

  return resolvedPath && path.resolve(resolvedPath)
}
