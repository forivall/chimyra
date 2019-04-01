import Command, {CommandConstructorParams} from '../command'
import {NoCurrentPackage} from '../errors/validation'
import PackageGraphNode from '../model/graph-node'
import Package from '../model/package'

function fail(): never {
  throw new NoCurrentPackage()
}

interface Context {
  packageGraph: Command['packageGraph']
  currentPackageNode?: Command['currentPackageNode']
}

// tslint:disable-next-line: variable-name
const mixin = <T extends new (...args: any[]) => Command>(Ctor: T) =>
// tslint:disable-next-line: no-shadowed-variable
class ResolveTransitiveDependencies extends (Ctor as new (...args: ConstructorParameters<T>) => Context) {
  transDeps?: Map<string, Package>

  _initTransDeps() {
    if (this.transDeps) return this.transDeps
    this.transDeps = new Map()
    return this.transDeps
  }

  resolveTransitiveDependencies(
    parent = this.currentPackageNode || fail(),
    graph = this.packageGraph,
    transDeps = this._initTransDeps(),
    depth = 0
  ) {
    // See also: @lerna/collect-updates:lib/collect-dependents

    // walk through dependencies of dependencies, until we have the full tree
    if (depth > 100) {
      throw new Error('infinite recursion probably')
    }

    const next: PackageGraphNode[] = []

    // TODO: resolve transitive dependencies at all versions -- update
    // packageGraph to resolve out-of-version local dependencies (into nearbyDependencies)
    // TODO: will require building of package at that version, will need to read
    // package.json from that git commit, index git commits for versions, etc.

    for (const depName of parent.localDependencies.keys()) {
      const node = graph.get(depName)!

      if (transDeps.has(depName)) continue

      transDeps.set(depName, node.pkg)
      // breadth first search
      next.push(node)
    }
    // traverse
    next.forEach((node) => this.resolveTransitiveDependencies(node, graph, transDeps, depth + 1))

    return transDeps
  }
}

interface ResolveTransitiveDependencies extends InstanceType<ReturnType<typeof mixin>> {}
// tslint:disable-next-line: variable-name
const ResolveTransitiveDependencies = mixin as <T extends typeof Command>(Ctor: T) => (
  new (...args: CommandConstructorParameters<T>) => ResolveTransitiveDependencies & AbstractInstanceType<Command, T>
)
type AbstractInstanceType<A, C> = C extends (new(...args: any[]) => infer T) ? T : A
type CommandConstructorParameters<T> = T extends new (...args: infer P) => any ? P : CommandConstructorParams
export default ResolveTransitiveDependencies
