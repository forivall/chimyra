import * as fs from 'fs-extra'
import pMap from 'p-map'
import * as path from 'path'
import Package from '../../model/package'
import PackageGraph from '../../model/graph'
import {LogTrackerGroup} from 'npmlog'

import createSymlink from './create'
import resolveSymlink from './resolve'
import symlinkBinary from './binary'

/**
 * Symlink all packages to the packages/node_modules directory
 * Symlink package binaries to dependent packages' node_modules/.bin directory
 */
export default async function symlinkDependencies(
  packages: Package[],
  packageGraph: PackageGraph,
  logger: LogTrackerGroup,
) {
  const tracker = logger.newItem('symlink packages')

  tracker.info('', 'Symlinking packages and binaries')
  tracker.addWork(packages.length)

  const nodes =
    packageGraph.size === packages.length
      ? packageGraph.values()
      : new Set(packages.map(({name}) => packageGraph.get(name)!))

  try {
    for (const currentNode of nodes) {
      const currentName = currentNode.name
      const currentNodeModules = currentNode.pkg.nodeModulesLocation

      await pMap(currentNode.localDependencies, async ([dependencyName, resolved]) => {
        if (resolved.type === 'directory') {
          // a local file: specifier is already a symlink
          return
        }

        // get PackageGraphNode of dependency
        // const dependencyName = resolved.name
        const dependencyNode = packageGraph.get(dependencyName)!
        const targetDirectory = path.join(currentNodeModules, dependencyName)

        // check if dependency is already installed
        const dirExists = await fs.pathExists(targetDirectory)
        if (dirExists) {
          const isDepSymlink = resolveSymlink(targetDirectory)

          if (isDepSymlink !== false && isDepSymlink !== dependencyNode.location) {
            // installed dependency is a symlink pointing to a different location
            tracker.warn(
              'EREPLACE_OTHER',
              `Symlink already exists for ${dependencyName} dependency of ${currentName}, ` +
                'but links to different location. Replacing with updated symlink...',
            )
          } else if (isDepSymlink === false) {
            // installed dependency is not a symlink
            tracker.warn(
              'EREPLACE_EXIST',
              `${dependencyName} is already installed for ${currentName}. Replacing with symlink...`,
            )

            // remove installed dependency
            await fs.remove(targetDirectory)
          }
        } else {
          // ensure destination directory exists (dealing with scoped subdirs)
          await fs.ensureDir(path.dirname(targetDirectory))
        }

        // create package symlink
        await createSymlink(dependencyNode.location, targetDirectory, 'junction')

        // TODO: pass PackageGraphNodes directly instead of Packages
        await symlinkBinary(dependencyNode.pkg, currentNode.pkg)
      })
      tracker.silly('actions', 'finished', currentName)
      tracker.completeWork(1)
    }
  } finally {
    tracker.finish()
  }
}
