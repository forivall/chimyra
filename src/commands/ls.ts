import * as path from 'path'

import chalk from 'chalk'
import {iterate} from 'iterare'
import * as _ from 'lodash'
import reversed from 'reversed'
import {Argv} from 'yargs'

import Command, {GlobalOptions} from '../command'
import batchPackages from '../helpers/batch-packages'
import Package from '../model/package';

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

export default class LsCommand extends Command {
  sort!: Options['sort']
  options!: Options
  initialize() {
    let pkgs: Iterable<Package>
    switch (this.sort) {
    case 'topo':
      pkgs = iterate(reversed(batchPackages(this.packageGraph.rawPackageList)))
      .map(sortByName)
      .flatten()
      break
    case 'dir':
      pkgs = _.sortBy([...this.packageGraph.rawPackageList], 'location')
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
      console.log(chalk`{grey ${dir}/}${name} {yellow ${version}} {green ${localDepsNames.join(' ')}}`)
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
