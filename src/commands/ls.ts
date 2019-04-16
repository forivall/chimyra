import * as path from 'path'

import chalk from 'chalk'
import D from 'debug'
import {iterate} from 'iterare'
import * as _ from 'lodash'
import reversed from 'reversed'
import * as treeify from 'treeify'
import {Argv} from 'yargs'

import Command, {GlobalOptions} from '../command'
import batchPackages from '../helpers/batch-packages'
import {BuildFile, NpaResultExt} from '../helpers/package-arg'
import resolveTransitiveDeps from '../helpers/resolve-transitive-deps'
import PackageGraphNode from '../model/graph-node'
import Package from '../model/package'

const debug = D('ledis:commands:ls')

export const command = 'ls [names..]'
export const describe = 'list packages'

export function builder(y: Argv) {
  return y.options({
    sort: {
      alias: 's',
      desc: 'sort by',
      default: 'topo',
      choices: ['topo', 'dir'],
    },
    'max-depth': {
      alias: 'd',
      desc: 'Include local dependencies of named packages',
      defaultDescription: '1 if names includes ".", 0 otherwise',
      type: 'number'
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
  maxDepth: number
  dev: boolean
}

class Unexpected extends Error { constructor(value: never) { super(`Unexpected value ${value}`) }}
function unexpected(value: never) {throw new Unexpected(value)}

interface PackageArg extends Pick<NpaResultExt, Exclude<keyof NpaResultExt, 'type'>> {
  name: string
  version?: string
  type: NpaResultExt['type'] | 'toplevel'
  pkg: Package
  g?: PackageGraphNode
}

export default class LsCommand extends resolveTransitiveDeps(Command) {
  sort!: Options['sort']
  options!: Options
  initialize(): void {
    let rawPackageList = this.packageGraph.rawPackageList
    const {names} = this.options
    const namesIncludesDot = names && names.indexOf('.') >= 0
    if (names) {
      const basePaths = new Set(names.map((p) => path.resolve(p)))
      if (namesIncludesDot) {
        const transDeps = this.resolveTransitiveDependencies()
        rawPackageList = rawPackageList.filter((p) => transDeps.has(p.name) || basePaths.has(p.location))
      } else {
        rawPackageList = rawPackageList.filter((p) => basePaths.has(p.location))
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

    let depth = 0
    if (this.options.tree) {
      if (this.options.maxDepth > 0) {
        depth = this.options.maxDepth
      } else if (namesIncludesDot) {
        depth = 1
      }
    }

    const pkgNodes = iterate(pkgs).map((pkg) => ({
      pkg,
      g: this.packageGraph.get(pkg.name),
      name: pkg.name,
      version: pkg.version,
      type: 'toplevel' as const,
      registry: false,
      scope: null,
      escapedName: null,
      rawSpec: pkg.location,
      saveSpec: null,
      fetchSpec: null,
      raw: pkg.location,
    }))

    const tree = this.toTree(pkgNodes, depth)

    if (this.options.tree) {
      treeify.asLines(tree, false, console.log)
    } else {
      Object.keys(tree).forEach((s) => {
        console.log(s)
      })
    }
  }
  // tslint:disable-next-line: member-ordering
  dryRun: undefined
  execute(): void {
    /* empty */
  }
  toTree(pkgs: Iterable<PackageArg>, depth = 0): treeify.TreeObject {
    const tree: treeify.TreeObject = {}
    for (const pkgArg of pkgs) {
      const {pkg, name, file, chi, g, type: argType} = pkgArg
      const version = pkgArg.version || file && file.version || chi && (chi.saveSpec || chi.fetchSpec)
      if (!version) console.log(pkgArg)
      let localDepsNames = iterate(g ? g.localDependencies.keys() : [])
      if (!this.options.dev) {
        localDepsNames = localDepsNames.filter((depName) => Boolean((pkg.dependencies || {})[depName]))
      }
      let k
      if (pkg.location.endsWith(name)) {
        const dir = path.relative('.', pkg.location.slice(0, -name.length)) || '.'
        // tslint:disable-next-line: prefer-conditional-expression
        if (argType === 'directory') {
          k = chalk`{grey ${dir}/}{cyan ${name}}${version ? ' ' : ''}${version || ''}`
        } else {
          k = chalk`{grey ${dir}/}${name} {yellow ${version || '?'}}`
        }
      } else {
        const dir = path.relative('.', pkg.location) || '.'
        // tslint:disable-next-line: prefer-conditional-expression
        if (argType === 'directory') {
          k = chalk`{grey ${dir}/}{cyan ${name}}${version ? '@' : ''}${version || ''}`
        } else {
          k = chalk`{grey ${dir}} ${name}@{yellow ${version || '?'}}`
        }

      }
      if (g && !this.options.tree) {
        const localDepsWithVersions = localDepsNames.map((n) => {
          const v = ((g.localDependencies.get(n) || ({} as Partial<NpaResultExt>))
          .file || ({} as Partial<BuildFile>)).version || (pkg.chimerDependencies || {})[n]
          return v ? `${chalk.green(n)}@${chalk.yellowBright(v)}` : chalk.cyan(n)
        })
        k += ' ' + localDepsWithVersions.join(' ')
      }
      if (!g || depth <= 0) {
        tree[k] = {}
        continue
      }
      const next = iterate(g.localDependencies.values())
      .filter<NpaResultExt & {name: string}>((d): d is NpaResultExt & {name: string} => Boolean(d.name))
      .map((d): Partial<PackageArg> => {
        // tslint:disable-next-line: no-shadowed-variable
        const g = this.packageGraph.get(d.name)
        return {
          ...d,
          g,
          pkg: g && g.pkg
        }
      })
      .filter<PackageArg>((p): p is PackageArg => Boolean(p.pkg))
      tree[k] = this.toTree(next, depth - 1)
    }
    return tree
  }
}

// tslint:disable-next-line: typedef
export function handler(argv: Options) {
  return new LsCommand(argv)
}
