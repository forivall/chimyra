import iterate from 'iterare'
import * as _ from 'lodash'
import pMap from 'p-map'
import {Argv} from 'yargs/yargs'

import Command, {CommandArgs} from '../command'
import {name} from '../constants'
import ValidationError from '../errors/validation'
import batchPackages from '../helpers/batch-packages'
import {getBuildFile} from '../helpers/build-paths'
import PackageGraphNode from '../model/graph-node'
import Package from '../model/package'

export const command = 'prepare'
export const aliases = ['prep']
export const describe = 'Normalize package.json and generate tarballs for dependencies'

export function builder(y: Argv) {
  return y
}

const omitUndefined = _.partial(_.omitBy, _, _.isUndefined)
const simplifyPkg = (p: Package) => omitUndefined({
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

  async initialize() {
    // TODO: check that versions are compatible

    if (!this.currentPackage || !this.currentPackageNode) {
      throw new ValidationError('PREPARE', 'Must be run from a package folder')
    }

    // update representation of package.json replacing directory based file:
    // specifiers with tarballs

    this.resolveTransitiveDependencies(this.currentPackageNode)
    this.batchedDeps = batchPackages([...this.transDeps.values(), this.currentPackage])

    // TODO: check if packages can be packaged at defined versions using current git state
    // allow flag to override, as long as version range matches current dev state

    for (const batch of this.batchedDeps) {
      this.logger.verbose(name, 'will update batch from', batch.map(simplifyPkg))
      await pMap(batch, (pkg) => this.resolveLocalDependencyLinks(pkg))
      // TODO: ensure that the pack files exist
      this.logger.verbose(name, 'will update batch to  ', batch.map(simplifyPkg))
    }
    // if packages need to be created at other git versions, fail
  }

  resolveTransitiveDependencies(parent: PackageGraphNode, depth = 0) {
    // walk through dependencies of dependencies, until we have the full tree
    if (depth > 100) {
      throw new Error('infinite recursion probably')
    }
    if (!this.transDeps) this.transDeps = new Map()

    const next: PackageGraphNode[] = []

    // TODO: resolve transitive dependencies at all versions -- update
    // packageGraph to resolve out-of-version local dependencies
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

  async resolveLocalDependencyLinks(
    pkg: Package,
    pkgNode = this.packageGraph.get(pkg.name),
  ) {
    this.logger.info(name, 'resolving links for %s', pkg.name)
    const depNode = this.packageGraph.get(pkg.name)!

    const dirDependencies = iterate(depNode.localDependencies)
      .filter(([, resolved]) => resolved.type === 'directory')
      .toMap()

    for (const [depName, resolved] of depNode.localDependencies) {
      if (resolved.type !== 'directory') continue

      // regardless of where the version comes from, we can't publish "file:../sibling-pkg" specs
      const dep = this.packageGraph.get(depName)!.pkg

      // TODO: add git ref
      const tgz = getBuildFile(this.project, dep)

      // it no longer matters if we mutate the shared Package instance
      pkg.updateLocalDependency(resolved, tgz, dep.version, '^')
    }

    // TODO: write changes to disk, only if (depNode.localDependencies where type === directory).length > 0
  }

  async execute() {
    for (const batch of this.batchedDeps) {
      // package at defined version
      this.logger.error(name, 'TODO: package the dependencies if needed (run pack)!!')
      // update package.json to point to package
      this.logger.verbose(name, 'Updating %s...', batch.map((p) => p.name))
      await pMap(batch, (pkg) => pkg.serialize())
    }
  }
}

export function handler(argv: Args) {
  return new PrepareCommand(argv)
}
