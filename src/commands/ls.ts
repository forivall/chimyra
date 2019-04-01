import * as path from 'path'

import chalk from 'chalk'
import {iterate} from 'iterare'
import * as _ from 'lodash'
import reversed from 'reversed'
import {Argv} from 'yargs'

import Command, {GlobalOptions} from '../command'
import batchPackages from '../helpers/batch-packages'
import {BuildFile, NpaResultExt} from '../helpers/package-arg'
import resolveTransitiveDeps from '../helpers/resolve-transitive-deps'
import Package from '../model/package'

export const command = 'ls [names..]'
export const describe = 'list packages'

export function builder(y: Argv) {
  return y.options({
    sort: {
      desc: 'sort by',
      default: 'topo',
      choices: ['topo', 'dir'],
    },
    tree: {
      type: 'boolean',
      desc: 'Display topographically in tree'
    },
    dev: {
      desc: 'include dev dependencies'
    }
  })
}

const sortByName = _.partial(_.sortBy, _, 'name') as <T>(v: T[]) => T[]

export interface Options extends GlobalOptions {
  names?: string[]
  sort: 'topo' | 'dir'
  tree: boolean
  dev: boolean
}

class Unexpected extends Error { constructor(value: never) { super(`Unexpected value ${value}`) }}

export default class LsCommand extends resolveTransitiveDeps(Command) {
  sort!: Options['sort']
  options!: Options
  initialize() {
    let rawPackageList = this.packageGraph.rawPackageList
    const {names} = this.options
    if (names) {
      const baseNames = names.map((p) => path.basename(path.resolve(p)))
      if (names.indexOf('.') >= 0) {
        const transDeps = this.resolveTransitiveDependencies()
        rawPackageList = rawPackageList.filter((p) => transDeps.has(p.name) || baseNames.indexOf(p.name) >= 0)
      } else {
        rawPackageList = rawPackageList.filter((p) => baseNames.indexOf(p.name) >= 0)
      }
    }
    let pkgs: Iterable<Package>
    switch (this.sort) {
    case 'topo':
      pkgs = iterate(reversed(batchPackages(rawPackageList)))
      .map(sortByName)
      .flatten()
      break
    case 'dir':
      pkgs = _.sortBy([...rawPackageList], 'location')
      break
    default: throw new Unexpected(this.sort)
    }

    for (const pkg of pkgs) {
      const {name, version} = pkg
      const dir = path.relative('.', path.dirname(pkg.location))
      const g = this.packageGraph.get(name)!
      let localDepsNames = iterate(g.localDependencies.keys())
      if (!this.options.dev) {
        localDepsNames = localDepsNames.filter((depName) => Boolean((pkg.dependencies || {})[depName]))
      }
      const localDepsWithVersions = localDepsNames.map((n) => {
        const v = ((g.localDependencies.get(n) || ({} as Partial<NpaResultExt>))
        .file || ({} as Partial<BuildFile>)).version || (pkg.chimerDependencies || {})[n]
        return v ? `${chalk.green(n)}@${chalk.yellowBright(v)}` : n
      })
      console.log(chalk`{grey ${dir}/}${name} {yellow ${version}} ${localDepsWithVersions.join(' ')}`)
    }
  }
  dryRun: undefined
  execute() {
    /* empty */
  }
}

export function handler(argv: Options) {
  return new LsCommand(argv)
}
