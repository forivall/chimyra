import * as path from 'path'
import * as util from 'util'

import chalk from 'chalk'
import {iterate} from 'iterare'
import * as _ from 'lodash'
import reversed from 'reversed'
import {Argv} from 'yargs/yargs'

import Command, {CommandArgs} from '../command'
import batchPackages from '../helpers/batch-packages'

// tslint:disable-next-line:no-require-imports
import indent = require('indent-string')

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

// tslint:disable-next-line:no-empty-interface
export interface Args extends CommandArgs {
  sort: 'topo' | 'dir'
}

export default class LsCommand extends Command {
  _args!: Args
  initialize() {
    const pkgs =
      this._args.sort === 'topo'
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
  execute() {
    /* empty */
  }
}

export function handler(argv: Args) {
  return new LsCommand(argv)
}
