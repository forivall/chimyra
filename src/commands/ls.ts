import * as path from 'path'

import chalk from 'chalk'
import {iterate} from 'iterare'
import * as _ from 'lodash'
import reversed from 'reversed'
import {Argv} from 'yargs/yargs'

import Command, {GlobalOptions} from '../command'
import batchPackages from '../helpers/batch-packages'

export const command = 'ls'
export const describe = 'list packages'

export function builder(y: Argv) {
  return y.options({
    sort: {
      desc: 'sort by',
      default: 'topo',
      choices: ['topo', 'dir'],
    },
  })
}

const sortByName = _.partial(_.sortBy, _, 'name') as <T>(v: T[]) => T[]

export interface Options extends GlobalOptions {
  sort: 'topo' | 'dir'
}

export default class LsCommand extends Command {
  sort!: Options['sort']
  options!: Options
  initialize() {
    const pkgs =
      this.sort === 'topo'
        ? iterate(reversed(batchPackages(this.packageGraph.rawPackageList)))
            .map(sortByName)
            .flatten()
        : _.sortBy([...this.packageGraph.rawPackageList], 'location')
    for (const pkg of pkgs) {
      const {name} = pkg
      const dir = path.relative('.', path.dirname(pkg.location))
      const g = this.packageGraph.get(name)!
      const localDepsDesc = iterate(g.localDependencies.keys())
        .filter((depName) => Boolean((pkg.dependencies || {})[depName]))
        .join(' ')

      console.log(chalk`{grey ${dir}/}${name} {green ${localDepsDesc}}`)
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
