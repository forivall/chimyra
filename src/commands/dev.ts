import * as path from 'path'

import {LinkOptions, linkIfExists as linkIfExists_} from 'gentle-fs'
import * as rpt from 'read-package-tree'
import {Argv} from 'yargs/yargs'

import Command, {GlobalOptions} from '../command'
import ValidationError, {NoCurrentPackage} from '../errors/validation'
import {satisfies} from 'semver';

const linkIfExists = (from: string, to: string, opts: LinkOptions) => new Promise<void>(
  (resolve, reject) => linkIfExists_(from, to, opts, (err) => err ? reject(err) : resolve())
)
const readPackageTree = (root: string, filterWith?: (node: rpt.Node, kidName: string) => void | undefined | boolean) => new Promise<rpt.Node>(
  filterWith
    ? (resolve, reject) => rpt(root, filterWith, (err, data) => err ? reject(err) : resolve(data))
    : (resolve, reject) => rpt(root, (err, data) => err ? reject(err) : resolve(data))
)


export const command = 'dev [links..]'
export const aliases = ['develop']
export const describe = 'Link local packages in current project'

export function builder(y: Argv) {
  return y
}

export interface Options extends GlobalOptions {
  links?: string[]
}
interface Action {
  from: string
  to: string
  opts?: Partial<LinkOptions>
}
/**
 * `flat()` using reduce.
 *
 * Usage:
 * ```ts
 * [[1, 2, 3], [4, 5, 6]].reduce(redFlat) => [1, 2, 3, 4, 5, 6]
 * ```
 */
const redFlat = <T>(l: ReadonlyArray<T>, r: ReadonlyArray<T>) => l.concat(r)
export default class DevCommand extends Command {
  links!: string[]
  options!: Options
  targets!: Action[]
  async initialize() {
    if (!this.currentPackage || !this.currentPackageNode) {
      throw new NoCurrentPackage()
    }
    // tslint:disable-next-line:no-this-assignment
    const {currentPackageNode: pkg} = this
    this.links = this.options.links || [...pkg.localDependencies.keys()]

    const ptP = readPackageTree(pkg.location)
    const targetRoots = this.links.map((n) => this.packageGraph.get(n)!)
    this.targets =
    (await Promise.all(
      // link local dependency's dependencies in node_modules to the current package's dependency
      targetRoots.map(async (d) => {
        const t = await readPackageTree(d.location)
        const pt = await ptP
        const opts = {prefix: d.location}
        return t.children.map((n): Partial<Action> => {
          const targetMatch = targetRoots.find((o) => o !== d && o.name === n.name && o.version === n.package.version)
          if (targetMatch) {
            return {opts, to: n.path, from: targetMatch.location}
          }
          const match = pt.children.find((o) => o.name === n.name && o.package.version === n.package.version)
          return {opts, to: n.path, from: match && (match.realpath || match.path)}
        })
        .filter((pair): pair is Action => Boolean(pair.from))
      })
      // link local dependency into current package's node_modules
      .concat(ptP.then((pt) => targetRoots.map((d): Partial<Action> => {
        const candidates = pt.children.filter((o) => o.name === d.name)
        this.logger.info('check', 'matches? %s, %O', d.version, candidates.map((o) => o.package.version))
        const match = candidates.find((o) => satisfies(o.package.version, `^${d.version}`))
        return {to: match && match.path, from: d.location}
      }).filter((pair): pair is Action => Boolean(pair.to))))
    )).reduce(redFlat)


    // TODO: actually build up the full dependency tree
    // console.log(pkg.localDependencies)
  }
  dryRun() {
    console.log(this.targets.map(({from, to}) => `${
      path.relative('.', from)
    } -> ${
      path.relative('.', to)
    }`).join('\n'))
  }
  async execute() {
    if (!this.currentPackage || !this.currentPackageNode) {
      throw new NoCurrentPackage()
    }

    const linkOptions: LinkOptions = {
      name: this.currentPackage.name,
      prefix: '.',
      prefixes: [],
      log: this.logger
    }

    await Promise.all(this.targets.map(async ({from, to, opts}) => {
      await linkIfExists(from, to, {...linkOptions, ...opts})
      this.logger.info('link', `${
        path.relative('.', from)
      } -> ${
        path.relative('.', to)
      }`)
    }))
  }
}

export function handler(argv: Options) {
  return new DevCommand(argv)
}
