import * as path from 'path'

import * as semver from 'semver'
import {Argv} from 'yargs/yargs'

import Command, {GlobalOptions} from '../command'
import {NoCurrentPackage} from '../errors/validation'
import {getBuildFile} from '../helpers/build-paths'
import {minimize} from '../helpers/homedir'
import resolveTransitiveDependencies from '../helpers/resolve-transitive-deps'
import {tuple} from '../helpers/types'
import Package from '../model/package'

export const command = 'update [deps..]'
export const describe = 'Bump the version of dependencies changed since last release'

export function builder(y: Argv) {
  return y
}

export interface Options extends GlobalOptions {
  deps?: string[]
}

export default class UpdateCommand extends Command {
  options!: Options
  modifiedPackages!: Package[]
  initialize() {
    if (!this.currentPackage || !this.currentPackageNode) {
      throw new NoCurrentPackage()
    }

    const deps = this.options.deps || [...this.currentPackageNode.localDependencies.keys()]

    const depManifests = deps.map((depId) => {
      const [name, requestedVersion = '*'] = depId.split('@')
      const version = requestedVersion === '*'
        ? this.packageGraph.get(name)!.version
        : requestedVersion
      return tuple([depId, {name, version}])
    })

    this.modifiedPackages = []

    const cpn = this.currentPackageNode
    console.log('thqis.packageGraph:', [...this.packageGraph.keys()].join(' '))
    console.log('cpn.externalDependencies:', [...cpn.externalDependencies.keys()].join(' '))
    console.log('cpn.localDependencies:', [...cpn.localDependencies.keys()].join(' '))
    this.resolveTransitiveDependencies()
    console.log('this.transDeps:', [...this.transDeps.keys()].join(' '))

    for (const p of this.transDeps.values()) {
      const n = this.packageGraph.get(p.name)!
      for (const [depId, depMani] of depManifests) {
        const localDep = n.localDependencies.get(depMani.name!)
        if (!localDep) continue
        if (!localDep.file) continue

        const buildFile = getBuildFile(this.project, depMani)
        const buildSpec = `file:${path.relative(p.location, buildFile)}`
        if (
          semver.lte(depMani.version, localDep.file.version) ||
          buildSpec === localDep.rawSpec
        ) {
          console.log('local', depMani.name, 'is up to date', localDep.file.version, depMani.version)
          continue
        }
        console.log(
          p.name, '->', depId, ':', localDep.file!.version, '->', depMani.version, ':', buildSpec
        )
        n.pkg.dependencies![depMani.name] = buildSpec
        this.modifiedPackages.push(n.pkg)
      }
    }
  }
  async execute() {
    if (!this.modifiedPackages || this.modifiedPackages.length === 0) {
      console.log('Nothing to do')
      return
    }
    for (const pkg of this.modifiedPackages) {
      console.log('Update', minimize(pkg.manifestLocation))
      await pkg.serialize()
    }
  }
  dryRun: undefined

}
// tslint:disable-next-line: no-empty-interface
export default interface UpdateCommand extends resolveTransitiveDependencies {}
UpdateCommand.prototype.resolveTransitiveDependencies = resolveTransitiveDependencies


export function handler(argv: Options) {
  return new UpdateCommand(argv)
}
