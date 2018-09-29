import {Argv} from 'yargs/yargs'

import Command, {CommandArgs} from '../command'
import ValidationError from '../errors/validation'
import {getBuildFile} from '../helpers/build-paths'

export const command = 'prepare'
export const aliases = ['prep']
export const describe = 'Normalize package.json and generate tarballs for dependencies'

export function builder(y: Argv) {
  return y
}

// tslint:disable-next-line:no-empty-interface
export interface Args extends CommandArgs {}

export default class PrepareCommand extends Command {
  initialize() {
    // TODO: check that versions are compatible

    if (!this.currentPackage || !this.currentPackageNode) {
      throw new ValidationError('PREPARE', 'Must be run from a package folder')
    }

    console.log(this.currentPackageNode.localDependencies)
    console.log(this.currentPackage.toJSON())

    // update representation of package.json replacing directory based file:
    // specifiers with tarballs

    this.resolveLocalDependencyLinks()
    console.log(this.currentPackage.toJSON())

    // TODO: check if packages can be packaged at defined versions using current git state
    // allow flag to override, as long as version range matches current dev state

    // if packages need to be created at other git versions, fail

    throw new Error('Method not implemented.')
  }

  resolveLocalDependencyLinks() {
    // TODO: walk through dependencies of dependencies, until we have the full tree
    const {localDependencies} = this.currentPackageNode!
    const pkg = this.currentPackage!

    for (const [depName, resolved] of localDependencies) {
      if (resolved.type !== 'directory') continue

      // regardless of where the version comes from, we can't publish "file:../sibling-pkg" specs
      const dep = this.packageGraph.get(depName)!.pkg

      // TODO: add git ref
      const tgz = getBuildFile(this.project, dep)

      // it no longer matters if we mutate the shared Package instance
      pkg.updateLocalDependency(resolved, tgz, dep.version, '^')
    }

    // TODO: write changes to disk
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
