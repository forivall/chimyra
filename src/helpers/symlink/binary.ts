import * as path from 'path'

import * as fs from 'fs-extra'
import pMap from 'p-map'
import * as readPkg from 'read-pkg'

import Package from '../../model/package'
import createSymlink from './create'
import {PackageJson} from '@npm/types'
import {tuple} from '../types';

/**
 * Symlink bins of srcPackage to node_modules/.bin in destPackage
 */
export default async function symlinkBinary(srcPackageRef: Package | string, destPackageRef: Package | string): Promise<void> {
  const [srcPackage, destPackage] = await Promise.all(tuple([
    resolvePackageRef(srcPackageRef),
    resolvePackageRef(destPackageRef),
  ]))

  const actions = Object.keys(srcPackage.bin).map(async (name) => {
    const src = path.join(srcPackage.location, srcPackage.bin[name])
    const dst = path.join(destPackage.binLocation, name)

    if (await fs.pathExists(src)) {
      return {src, dst}
    }
  })

  if (actions.length === 0) {
    return Promise.resolve()
  }

  await fs.mkdirp(destPackage.binLocation)
  await pMap(actions, async (meta) => {
    if (meta) {
      await createSymlink(meta.src, meta.dst, 'exec')
      await fs.chmod(meta.src, '755')
    }
  })
}

async function resolvePackageRef(pkgRef: string | Package): Promise<Package> {
  // don't use instanceof because it fails across nested module boundaries
  if (typeof pkgRef !== 'string') {
    if (pkgRef.location) {
      return pkgRef
    }
    throw new Error('Invalid pkgRef')
  }

  return readPkg({cwd: pkgRef, normalize: false}).then(
    (json) => new Package(json as PackageJson, pkgRef),
  )
}
