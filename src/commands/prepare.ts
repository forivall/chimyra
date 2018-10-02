import iterate from 'iterare'
import {Argv} from 'yargs/yargs'

import Command, {CommandArgs} from '../command'
import ValidationError from '../errors/validation'
import batchPackages from '../helpers/batch-packages'
import {getBuildFile} from '../helpers/build-paths'
import PackageGraphNode from '../model/graph-node'
import Package from '../model/package';

export const command = 'prepare'
export const aliases = ['prep']
export const describe = 'Normalize package.json and generate tarballs for dependencies'

export function builder(y: Argv) {
  return y
}

// tslint:disable-next-line:no-empty-interface
export interface Args extends CommandArgs {}

export default class PrepareCommand extends Command {
  transDeps!: Map<string, Package>
  batchedDeps!: Package[][]

  initialize() {
    // TODO: check that versions are compatible

    if (!this.currentPackage || !this.currentPackageNode) {
      throw new ValidationError('PREPARE', 'Must be run from a package folder')
    }

    console.log(this.currentPackageNode.localDependencies)
    console.log(this.currentPackage.toJSON())

    // update representation of package.json replacing directory based file:
    // specifiers with tarballs


    this.resolveTransitiveDependencies(this.currentPackageNode)
    this.batchedDeps = batchPackages([...this.transDeps.values()])
    console.log('all local', this.transDeps)
    console.log('batched', this.batchedDeps)
    // TODO: check if packages can be packaged at defined versions using current git state
    // allow flag to override, as long as version range matches current dev state

    // TODO: for each this.batchedDeps
    this.resolveLocalDependencyLinks(this.currentPackage)

    // if packages need to be created at other git versions, fail

    throw new Error('Method not implemented.')
  }

  resolveTransitiveDependencies(parent: PackageGraphNode, depth = 0) {
    if (depth > 100) {
      throw new Error('infinite recursion probably')
    }
    if (!this.transDeps) this.transDeps = new Map()

    const next: PackageGraphNode[] = []

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

  resolveLocalDependencyLinks(pkg: Package, pkgNode = this.packageGraph.get(pkg.name)) {
    // walk through dependencies of dependencies, until we have the full tree
    const depNode = this.packageGraph.get(pkg.name)!

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

  execute() {
    // package all local dependencies at defined versions

    // update package.json to

    throw new Error('Method not implemented.')
  }
}

export function handler(argv: Args) {
  return new PrepareCommand(argv)
}
