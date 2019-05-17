import * as path from 'path'

import * as semver from 'semver'
import {Argv} from 'yargs'

import Command, {GlobalOptions} from '../command'
import {NoCurrentPackage} from '../errors/validation'
import {getBuildFile} from '../helpers/build-paths'
import * as childProcess from '../helpers/child-process'
import {minimize} from '../helpers/homedir'
import ResolveTransitiveDependencies from '../helpers/resolve-transitive-deps'
import Package from '../model/package'
import PackCommand from './pack';
import getExecOpts from '../helpers/npm-exec-opts';

export const command = 'update [deps..]'
export const describe = 'Bump the version of dependencies changed since last release'

// tslint:disable-next-line: typedef
export function builder(y: Argv) {
  return y.options({
    dirty: {
      type: 'boolean',
      default: false,
      description: 'allow updating when directory is dirty'
    }
  })
}

export interface Options extends GlobalOptions {
  deps?: string[]
  dirty?: boolean
  install?: boolean
}

type DepMani = readonly [string, {
  readonly name: string;
  readonly version: string;
}]
export default class UpdateCommand extends ResolveTransitiveDependencies(Command) {
  options!: Options
  modifiedPackages!: Package[]
  deps!: string[]
  async initialize() {
    if (!this.hasCurrentPackage()) throw new NoCurrentPackage()

    this.deps = this.options.deps || [...this.currentPackageNode.localDependencies.keys()]

    this.modifiedPackages = []

    if (!this.options.dirty) {
      this.cleanUpdate()
      return
    }

    if (this.deps.length !== 1) {
      console.log('only one for now, plz')
      return
    }

    const {[0]: dep} = this.deps

    const depNode = this.packageGraph.get(dep)

    if (!depNode) throw new Error(`${dep} not found`)
  }
  cleanUpdate() {
    if (!this.hasCurrentPackage()) throw new NoCurrentPackage()

    const depManifests = this.deps.map((depId) => {
      const [name, requestedVersion = '*'] = depId.split('@')
      const version = requestedVersion === '*'
        ? this.packageGraph.get(name)!.version
        : requestedVersion
      return [depId, {name, version}] as const
    })

    const cpn = this.currentPackageNode
    console.log('this.packageGraph:', [...this.packageGraph.keys()].join(' '))
    console.log('cpn.externalDependencies:', [...cpn.externalDependencies.keys()].join(' '))
    console.log('cpn.localDependencies:', [...cpn.localDependencies.keys()].join(' '))
    const transDeps = this.resolveTransitiveDependencies()
    console.log('this.transDeps:', [...transDeps.keys()].join(' '))

    for (const p of transDeps.values()) {
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

  async execute(): Promise<void> {
    if (this.options.dirty) {
      if (!this.hasCurrentPackage()) throw new NoCurrentPackage()

      const depNode = this.packageGraph.get(this.deps[0])!

      const packFile = await Promise.resolve(new PackCommand({
        ...this._args,
        cwd: depNode.location,
        dirty: true,
      }, {
        currentPackageNode: depNode
      }))

      const pkg = this.currentPackage

      const packFileRel = path.relative(pkg.location, packFile)
      this.logger.info('UPDATE', `Installing ${packFileRel}`)

      await childProcess.spawnStreaming(
        'npm',
        ['install', packFileRel],
        getExecOpts(pkg),
        'UPDATE',
      )
      return
    }

    if (!this.modifiedPackages || this.modifiedPackages.length === 0) {
      console.log('Nothing to do')
      return
    }
    for (const pkg of this.modifiedPackages) {
      console.log('Update', minimize(pkg.manifestLocation))
      await pkg.serialize()
    }
  }
  // tslint:disable-next-line: member-ordering
  dryRun: undefined

}

// tslint:disable-next-line: typedef
export function handler(argv: Options) {
  return new UpdateCommand(argv)
}
