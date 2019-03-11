import PackageGraphNode from '../model/graph-node'
import PackageGraph from '../model/graph'
import Package from '../model/package'
import {NoCurrentPackage} from '../errors/validation'

interface Context {
    packageGraph: PackageGraph
    transDeps: Map<string, Package>
    currentPackageNode?: PackageGraphNode
    resolveTransitiveDependencies: typeof resolveTransitiveDependencies
}
function fail(): never {
  throw new NoCurrentPackage()
}
function resolveTransitiveDependencies(this: Context,
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
}
type resolveTransitiveDependencies = Context

export default resolveTransitiveDependencies
