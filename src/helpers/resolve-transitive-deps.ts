import PackageGraphNode from '../model/graph-node'
import PackageGraph from '../model/graph'
import Package from '../model/package'
import {NoCurrentPackage} from '../errors/validation'
import Command, {CommandArgs, CommandContext} from '../command';

function fail(): never {
  throw new NoCurrentPackage()
}

interface Context {
  packageGraph: Command['packageGraph']
  currentPackageNode?: Command['currentPackageNode']
}

// tslint:disable-next-line: variable-name
export const resolveTransitiveDependenciesMixin = <T extends new (...args: any[]) => Command>(Ctor: T) =>
class ResolveTransitiveDependencies extends (Ctor as new (...args: ConstructorParameters<T>) => Context) {
  transDeps?: Map<string, Package>

  resolveTransitiveDependencies(
    parent = this.currentPackageNode || fail(),
    graph = this.packageGraph,
    depth = 0
  ) {
    // See also: @lerna/collect-updates:lib/collect-dependents

    // walk through dependencies of dependencies, until we have the full tree
    if (depth > 100) {
      throw new Error('infinite recursion probably')
    }
    if (!this.transDeps) this.transDeps = new Map()

    const next: PackageGraphNode[] = []

    // TODO: resolve transitive dependencies at all versions -- update
    // packageGraph to resolve out-of-version local dependencies (into nearbyDependencies)
    // TODO: will require building of package at that version, will need to read
    // package.json from that git commit, index git commits for versions, etc.

    for (const depName of parent.localDependencies.keys()) {
      const node = graph.get(depName)!

      if (this.transDeps.has(depName)) continue

      this.transDeps.set(depName, node.pkg)
      // breadth first search
      next.push(node)
    }
    // traverse
    next.forEach((node) => this.resolveTransitiveDependencies(node, graph, depth + 1))

    return this.transDeps
  }
}

type AbstractInstanceType<A, T> = T extends (new(...args: any[]) => any) ? T : A
type CommandConstructorParameters<T> = T extends new (...args: infer P) => any ? P : [CommandArgs, CommandContext?]
// tslint:disable-next-line: variable-name
export default resolveTransitiveDependenciesMixin as <T extends typeof Command>(Ctor: T) => new (...args: CommandConstructorParameters<T>) => (
  InstanceType<ReturnType<typeof resolveTransitiveDependenciesMixin>> & AbstractInstanceType<Command, T>
)
