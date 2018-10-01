import * as cmdShim from 'cmd-shim'
import * as fs from 'fs-extra'
import * as log from 'npmlog'
import * as path from 'path'

export type SymlinkType = fs.FsSymlinkType | 'exec'

export default async function createSymlink(src: string, dest: string, type: SymlinkType) {
  log.silly('createSymlink', '%j', [src, dest, type])

  if (process.platform === 'win32') {
    return createWindowsSymlink(src, dest, type)
  }

  return createPosixSymlink(src, dest, type)
}

async function createSymbolicLink(src: string, dest: string, type: fs.FsSymlinkType) {
  log.silly('createSymbolicLink', '%j', [src, dest, type])

  try {
    await fs.lstat(dest)
    await fs.unlink(dest)
  } catch {
    /* nothing exists at destination */
  }
  return fs.symlink(src, dest, type)
}

function createPosixSymlink(origin: string, dest: string, _type: SymlinkType) {
  const type = _type === 'exec' ? 'file' : _type
  const src = path.relative(path.dirname(dest), origin)

  return createSymbolicLink(src, dest, type)
}

function createWindowsSymlink(src: string, dest: string, type: SymlinkType) {
  if (type === 'exec') {
    return new Promise<void>((resolve, reject) => {
      cmdShim(src, dest, (err) => {
        if (err) {
          reject(err)
        } else {
          resolve()
        }
      })
    })
  }

  return createSymbolicLink(src, dest, type)
}
