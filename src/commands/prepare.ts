import * as fs from 'fs-extra'
import iterate from 'iterare'
import * as _ from 'lodash'
import pMap from 'p-map'
import {Argv} from 'yargs'

import Command, {CommandArgs} from '../command'
import {name as prefix} from '../constants'
import ValidationError, {NoCurrentPackage} from '../errors/validation'
import batchPackages from '../helpers/batch-packages'
import {getBuildFile} from '../helpers/build-paths'
import describeRef from '../helpers/git/describe-ref'
import hasDirectoryChanged from '../helpers/git/has-directory-changed'
import * as homedir from '../helpers/homedir'
import resolveTransitiveDependencies from '../helpers/resolve-transitive-deps'
import {tuple} from '../helpers/types'
import PackageGraph from '../model/graph'
import Package from '../model/package'
import {makeGitVersion} from './pack'

export const command = 'prepare'
export const aliases = ['prep']
export const describe = 'Normalize package.json and generate tarballs for dependencies'

export function builder(y: Argv) {
  return y.options({
    'dev-deps': {
      desc: 'Also prepare dev dependencies',
      type: 'boolean',
      default: false
    }
  })
}

const omitUndefined = _.partial(_.omitBy, _, _.isUndefined)
const simplifyPkg = (p: Package) =>
  omitUndefined({
    name: p.name,
    version: p.version,
    dependencies: p.dependencies,
    devDependencies: p.devDependencies,
    optionalDependencies: p.optionalDependencies,
    peerDependencies: p.peerDependencies,
    bundleDependencies: p.bundleDependencies,
    chimerDependencies: p.chimerDependencies,
  })

export interface Args extends CommandArgs {
  devDeps?: boolean
}

export default class PrepareCommand extends resolveTransitiveDependencies(Command) {
  options!: Args
  batchedDeps!: Package[][]
  batchedUpdates!: Package[][]

  async initialize() {
    // TODO: check that versions are compatible

    if (!this.currentPackage) {
      throw new NoCurrentPackage()
    }

    if (!this.options.devDeps) {
      this.logger.verbose(prefix, 'Rebuilding package graph...')
      this.packageGraph = this.packageGraph.rebuild({project: this.project, graphType: 'dependencies'})
      this.currentPackageNode = this.packageGraph.get(this.currentPackage.name)
    }

    if (!this.currentPackageNode) {
      throw new NoCurrentPackage()
    }

    // update representation of package.json replacing directory based file:
    // specifiers with tarballs

    const transDeps = this.resolveTransitiveDependencies(this.currentPackageNode)
    this.batchedDeps = batchPackages(
      iterate(transDeps.values()).concat([this.currentPackage]),
      {
        project: this.project,
      },
    )

    // TODO: check if packages can be packaged at defined versions using current git state
    // allow flag to override, as long as version range matches current dev state

    this.batchedUpdates = []
    for (const batch of this.batchedDeps) {
      const batchUpdates: Package[] = []
      for (const pkg of batch) {
        if (await this.resolveLocalDependencyLinks(pkg)) {
          batchUpdates.push(pkg)
        }
      }
      this.logger.verbose(
        prefix,
        batchUpdates.length > 0 ? 'will update batch to  ' : 'no updates in batch',
        batchUpdates.map(simplifyPkg),
      )
      if (batchUpdates.length > 0) {
        this.batchedUpdates.push(batchUpdates)
      }
    }

    if (this.batchedUpdates.length === 0) {
      this.logger.info(prefix, 'Nothing to do!')
    }

    // ensure that the pack files exist
    const updates = new Map<string, Package[]>()
    const pkgName = new Map<string, string>()

    // rebuild graph with packages updated to point to tgz files
    const graph = new PackageGraph(iterate(this.batchedDeps).flatten(), {
      project: this.project,
    })
    for (const pkg of iterate(this.batchedUpdates).flatten()) {
      const pkgNode = graph.get(pkg.name)!
      for (const mani of pkgNode.localDependencies.values()) {
        if (mani.type !== 'file' || !mani.fetchSpec) {
          throw new Error(
            "all local dependencies should be files... this shouldn't happen",
          )
        }
        const tgzPath = mani.fetchSpec
        if (updates.has(tgzPath)) {
          updates.get(tgzPath)!.push(pkg)
          if (pkgName.get(tgzPath) !== mani.name) {
            throw new Error('wtf')
          }
        } else {
          updates.set(tgzPath, [pkg])
          pkgName.set(tgzPath, mani.name!)
        }
      }
    }

    // TODO: add option to pack instead of just failing if it doesn't exist
    // use this access check to see which ones need to be
    const accessForPackages = await pMap(updates, async (pathAndDependents) => {
      const [tgzPath] = pathAndDependents
      this.logger.verbose(prefix, 'Checking access to %s', tgzPath)
      const hasAccess = await fs
        .access(tgzPath, fs.constants.R_OK)
        .then(() => true, () => false)
      return tuple([hasAccess, pathAndDependents])
    })
    const missingPackages = iterate(accessForPackages)
      .filter(([hasAccess]) => !hasAccess)
      .map(([, pair]) => pair)
      .toMap()

    if (missingPackages.size > 0) {
      const msg = iterate(missingPackages)
        .map(
          ([tgzPath, dependents]) =>
            `${homedir.minimize(tgzPath)} (required by ${dependents
              // tslint:disable-next-line:no-shadowed-variable
              .map(({name}) => name)
              .join(',')})`,
        )
        .join('\n')
      const missingPackageNames = iterate(missingPackages.keys()).map((k) => pkgName.get(k)).toSet()
      const hasProductionDep = iterate(missingPackages).some(([tgzPath, dependents]) =>
        dependents.some((pkg) => {
          return Object.keys(pkg.dependencies || {}).some((name) => missingPackageNames.has(name))
        })
      )
      if (hasProductionDep) {
        throw new ValidationError('ENOPKGFILE', 'Missing tarballs:%s', `\n${msg}`)
      }
      this.logger.warn(prefix, 'Missing tarballs:%s', `\n${msg}`)
    }

    // if packages need to be created at other git versions, fail
  }

  /**
   * Side Effect: mutates the packages in memory
   */
  async resolveLocalDependencyLinks(pkg: Package, pkgNode = this.packageGraph.get(pkg.name)) {
    const depNode = this.packageGraph.get(pkg.name)!

    const dirDependencies = iterate(depNode.localDependencies)
      .filter(([, resolved]) => resolved.type === 'directory')
      .toMap()

    if (dirDependencies.size === 0) {
      return false
    }
    this.logger.info(prefix, 'Resolving links for %s', pkg.name)

    for (const [depName, resolved] of dirDependencies) {
      if (resolved.type !== 'directory') continue

      // regardless of where the version comes from, we can't publish "file:../sibling-pkg" specs
      const dep = this.packageGraph.get(depName)!.pkg

      // TODO: cache
      const ref = await describeRef({pkg: dep, matchPkg: 'name'})
      let version = dep.version
      const dirChanged = !ref.lastTagName || await hasDirectoryChanged({
        cwd: dep.location,
        ref: ref.lastTagName
      })
      if (dirChanged) {
        this.logger.verbose(prefix, 'creating git version for dep %s of %s', dep.name, pkg.name, ref, dirChanged)
        version = await makeGitVersion(dep, ref)
      }

      // TODO: add git ref
      const tgz = getBuildFile(this.project, {name: dep.name, version})

      // it no longer matters if we mutate the shared Package instance
      pkg.updateLocalDependency(resolved, tgz, version, '^')
    }

    return true
  }

  dryRun() {
    console.log(this.batchedDeps)
  }
  async execute() {
    // TODO: add option to package all unpacked deps
    for (const batch of this.batchedDeps) {
      // update package.json to point to package
      this.logger.verbose(prefix, 'Updating %s...', batch.map((p) => p.name))
      await pMap(batch, async (pkg) => pkg.serialize())
    }
  }
}

export function handler(argv: Args) {
  return new PrepareCommand(argv)
}
