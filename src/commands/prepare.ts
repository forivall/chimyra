import * as fs from 'fs-extra'
import iterate from 'iterare'
import * as _ from 'lodash'
import pMap from 'p-map'
import {Argv} from 'yargs/yargs'

import Command, {CommandArgs} from '../command'
import {name} from '../constants'
import ValidationError from '../errors/validation'
import batchPackages from '../helpers/batch-packages'
import {getBuildFile} from '../helpers/build-paths'
import * as homedir from '../helpers/homedir'
import {tuple} from '../helpers/types'
import PackageGraph from '../model/graph'
import PackageGraphNode from '../model/graph-node'
import Package from '../model/package'

export const command = 'prepare'
export const aliases = ['prep']
export const describe = 'Normalize package.json and generate tarballs for dependencies'

export function builder(y: Argv) {
  return y
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

// tslint:disable-next-line:no-empty-interface
export interface Args extends CommandArgs {}

export default class PrepareCommand extends Command {
  transDeps!: Map<string, Package>
  batchedDeps!: Package[][]
  batchedUpdates!: Package[][]

  async initialize() {
    // TODO: check that versions are compatible

    if (!this.currentPackage || !this.currentPackageNode) {
      throw new ValidationError('PREPARE', 'Must be run from a package folder')
    }

    // update representation of package.json replacing directory based file:
    // specifiers with tarballs

    this.resolveTransitiveDependencies(this.currentPackageNode)
    this.batchedDeps = batchPackages(
      iterate(this.transDeps.values()).concat([this.currentPackage]),
      {
        project: this.project,
      },
    )

    // TODO: check if packages can be packaged at defined versions using current git state
    // allow flag to override, as long as version range matches current dev state

    this.batchedUpdates = iterate(this.batchedDeps)
      .map((batch) => {
        this.logger.verbose(name, 'Will update batch from', batch.map(simplifyPkg))
        const batchUpdates = batch.filter((pkg) => this.resolveLocalDependencyLinks(pkg))
        this.logger.verbose(
          name,
          batchUpdates.length > 0 ? 'will update batch to  ' : 'no updates in batch',
          batchUpdates.map(simplifyPkg),
        )
        return batchUpdates
      })
      .filter((batch) => batch.length > 0)
      .toArray()

    if (this.batchedUpdates.length === 0) {
      this.logger.info(name, 'Nothing to do!')
    }

    // ensure that the pack files exist
    const updates = new Map<string, Package[]>()
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
        } else {
          updates.set(tgzPath, [pkg])
        }
      }
    }

    // TODO: add option to pack instead of just failing if it doesn't exist
    // use this access check to see which ones need to be
    const accessForPackages = await pMap(updates, async (pathAndDependents) => {
      const [tgzPath] = pathAndDependents
      this.logger.verbose(name, 'Checking access to %s', tgzPath)
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
      throw new ValidationError('ENOPKGFILE', 'Missing tarballs:%s', `\n${msg}`)
    }

    // if packages need to be created at other git versions, fail
  }

  resolveTransitiveDependencies(parent: PackageGraphNode, depth = 0) {
    // See also: @lerna/collect-updates:lib/collect-dependents

    // walk through dependencies of dependencies, until we have the full tree
    if (depth > 100) {
      throw new Error('infinite recursion probably')
    }
    if (!this.transDeps) this.transDeps = new Map()

    const next: PackageGraphNode[] = []

    // TODO: resolve transitive dependencies at all versions -- update
    // packageGraph to resolve out-of-version local dependencies (into nearbyDependencies)
    // TODO: will require building of package at that version, will need to read
    // package.json from that git commit, index git commits for versions, etc.

    for (const depName of parent.localDependencies.keys()) {
      const node = this.packageGraph.get(depName)!

      if (this.transDeps.has(depName)) continue

      this.transDeps.set(depName, node.pkg)
      // breadth first search
      next.push(node)
    }
    // traverse
    next.forEach((node) => this.resolveTransitiveDependencies(node, depth + 1))
  }

  /**
   * Side Effect: mutates the packages in memory
   */
  resolveLocalDependencyLinks(pkg: Package, pkgNode = this.packageGraph.get(pkg.name)) {
    const depNode = this.packageGraph.get(pkg.name)!

    const dirDependencies = iterate(depNode.localDependencies)
      .filter(([, resolved]) => resolved.type === 'directory')
      .toMap()

    if (dirDependencies.size === 0) {
      return false
    }
    this.logger.info(name, 'Resolving links for %s', pkg.name)

    for (const [depName, resolved] of dirDependencies) {
      if (resolved.type !== 'directory') continue

      // regardless of where the version comes from, we can't publish "file:../sibling-pkg" specs
      const dep = this.packageGraph.get(depName)!.pkg

      // TODO: add git ref
      const tgz = getBuildFile(this.project, dep)

      // it no longer matters if we mutate the shared Package instance
      pkg.updateLocalDependency(resolved, tgz, dep.version, '^')
    }

    return true
  }

  async execute() {
    // TODO: add option to package all unpacked deps
    for (const batch of this.batchedDeps) {
      // update package.json to point to package
      this.logger.verbose(name, 'Updating %s...', batch.map((p) => p.name))
      await pMap(batch, (pkg) => pkg.serialize())
    }
  }
}

export function handler(argv: Args) {
  return new PrepareCommand(argv)
}
