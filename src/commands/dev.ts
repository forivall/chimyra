import * as path from 'path'

import {LinkOptions, linkIfExists as linkIfExists_} from 'gentle-fs'
import * as rpt from 'read-package-tree'
import {Argv} from 'yargs/yargs'

import Command, {GlobalOptions} from '../command'
import ValidationError, {NoCurrentPackage} from '../errors/validation'

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
    this.targets = (await Promise.all(
      targetRoots.map(async (d) => {
        const t = await readPackageTree(d.location)
        const pt = await ptP
        const opts = {prefix: d.location}
        return t.children.map((n): Partial<Action> => {
          const match = pt.children.find((o) => o.name === n.name && o.package.version === n.package.version)
          return {
            opts,
            to: n.path,
            from: match && match.path,
          }
        })
        .filter((pair): pair is Action => Boolean(pair.from))

        // return Promise.all(t.children.map(async (c) => {

        //   c.path
        // }))
    }))).reduce((l, r) => l.concat(r))
    .concat(
      await ptP.then((pt) => targetRoots.map((d): Partial<Action> => {
        const match = pt.children.find((o) => o.name === d.name && o.package.version === d.version)
        return {
          to: match && match.path,
          from: d.location,
        }
      }).filter((pair): pair is Action => Boolean(pair.to)))
    )

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
