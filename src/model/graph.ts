import * as npa from 'npm-package-arg'
import * as log from 'npmlog'
import iterate from 'iterare'

import {Dependencies} from '@npm/types'

import ValidationError from '../errors/validation'
import {NpaResultExt, fromPackTarget} from '../helpers/package-arg'
import {tuple} from '../helpers/types'
import PackageGraphNode from './graph-node'
import Package from './package'
import Project from './project'

type MapKeys<T> = NonNullable<
  {[K in keyof T]: T[K] extends Map<any, any> ? K : never}[keyof T]
>

export type PackageGraphType = 'dependencies' | 'allDependencies'

export interface PackageGraphOptions {
  graphType?: PackageGraphType
  forceLocal?: boolean
  project?: Project
}

function isProject(p: Package[] | Project): p is Project {
  return typeof (p as any).getPackages === 'function'
}

/**
 * A PackageGraph.
 * @param packages An array of Packages to build the graph out of.
 * @param graphType ("allDependencies" or "dependencies")
 *    Pass "dependencies" to create a graph of only dependencies,
 *    excluding the devDependencies that would normally be included.
 * @param forceLocal Force all local dependencies to be linked.
 */
export default class PackageGraph extends Map<string, PackageGraphNode> {
  constructor(
    packages: Package[],
    {graphType = 'allDependencies', forceLocal, project}: PackageGraphOptions = {},
  ) {
    super(packages.map((pkg) => tuple([pkg.name, new PackageGraphNode(pkg)])))

    if (packages.length !== this.size) {
      // weed out the duplicates
      const seen = new Map<string, string[]>()

      for (const {name, location} of packages) {
        if (seen.has(name)) {
          seen.get(name)!.push(location)
        } else {
          seen.set(name, [location])
        }
      }

      for (const [name, locations] of seen) {
        if (locations.length > 1) {
          throw new ValidationError(
            'ENAME',
            [`Package name "${name}" used in multiple packages:`, ...locations].join(
              '\n\t',
            ),
          )
        }
      }
    }

    this.forEach((currentNode, currentName) => {
      const graphDependencies: Dependencies = {
        ...(graphType === 'dependencies' ? {} : currentNode.pkg.devDependencies),
        ...currentNode.pkg.optionalDependencies,
        ...currentNode.pkg.dependencies,
      }
      const chiDependencies = currentNode.pkg.chimerDependencies || {}

      Object.keys(graphDependencies).forEach((depName) => {
        const depNode = this.get(depName)
        // Yarn decided to ignore https://github.com/npm/npm/pull/15900 and implemented "link:"
        // As they apparently have no intention of being compatible, we have to do it for them.
        // @see https://github.com/yarnpkg/yarn/issues/4212
        const spec = graphDependencies[depName].replace(/^link:/, 'file:')
        const resolved: NpaResultExt = npa.resolve(depName, spec, currentNode.location)

        const chiSpec = chiDependencies[depName]
        if (chiSpec) {
          resolved.chi = npa.resolve(depName, chiSpec, currentNode.location)
        }

        const fileSpec = fromPackTarget(project, resolved)
        if (fileSpec) {
          resolved.file = fileSpec
        }

        if (!depNode) {
          // it's an external dependency, store the resolution and bail
          return currentNode.externalDependencies.set(depName, resolved)
        }

        log.silly(
          'PACKAGE_GRAPH',
          'Checking if %s@%s satisfies %j',
          depName,
          depNode.version,
          resolved,
        )

        if (
          forceLocal ||
          resolved.fetchSpec === depNode.location ||
          depNode.satisfies(resolved)
        ) {
          // a local file: specifier OR a matching semver
          currentNode.localDependencies.set(depName, resolved)
          depNode.localDependents.set(currentName, currentNode)
        } else {
          // non-matching semver of a local dependency
          currentNode.externalDependencies.set(depName, resolved)
        }
      })
    })
  }

  get rawPackageList() {
    return iterate(this.values()).map((node) => node.pkg).toArray()
  }

  /**
   * Takes a list of Packages and returns a list of those same Packages with any Packages
   * they depend on. i.e if packageA depended on packageB `graph.addDependencies([packageA])`
   * would return [packageA, packageB].
   *
   * @param filteredPackages The packages to include dependencies for.
   * @return  The packages with any dependencies that weren't already included.
   */
  addDependencies(filteredPackages: Package[]) {
    return this.extendList(filteredPackages, 'localDependencies')
  }

  /**
   * Takes a list of Packages and returns a list of those same Packages with any Packages
   * that depend on them. i.e if packageC depended on packageD `graph.addDependents([packageD])`
   * would return [packageD, packageC].
   *
   * @param filteredPackages The packages to include dependents for.
   * @return The packages with any dependents that weren't already included.
   */
  addDependents(filteredPackages: Package[]) {
    return this.extendList(filteredPackages, 'localDependents')
  }

  /**
   * Extends a list of packages by traversing on a given property, which must refer to a
   * `PackageGraphNode` property that is a collection of `PackageGraphNode`s
   *
   * @param packageList The list of packages to extend
   * @param nodeProp The property on `PackageGraphNode` used to traverse
   * @return The packages with any additional packages found by traversing
   *                           nodeProp
   */
  extendList(packageList: Package[], nodeProp: MapKeys<PackageGraphNode>) {
    // the current list of packages we are expanding using breadth-first-search
    const search = new Set(packageList.map(({name}) => this.get(name)!))

    // an intermediate list of matched PackageGraphNodes
    const result: PackageGraphNode[] = []

    search.forEach((currentNode) => {
      // anything searched for is always a result
      result.push(currentNode)
      ;(currentNode[nodeProp] as Map<string, any>).forEach((meta, depName) => {
        const depNode = this.get(depName)!

        if (depNode !== currentNode && !search.has(depNode)) {
          search.add(depNode)
        }
      })
    })

    // actual Package instances, not PackageGraphNodes
    return result.map((node) => node.pkg)
  }

  /**
   * Return a tuple of cycle paths and nodes, which have been removed from the graph.
   * @returns [Set<String[]>, Set<PackageGraphNode>]
   */
  partitionCycles() {
    const cyclePaths = new Set<string[]>()
    const cycleNodes = new Set<PackageGraphNode>()

    this.forEach((currentNode, currentName) => {
      const seen = new Set<PackageGraphNode>()

      const visits = (walk: string[]) => (
        dependentNode: PackageGraphNode,
        dependentName: string,
        siblingDependents: Map<string, PackageGraphNode>,
      ) => {
        const step = walk.concat(dependentName)

        if (seen.has(dependentNode)) {
          return
        }

        seen.add(dependentNode)

        if (dependentNode === currentNode) {
          // a direct cycle
          cycleNodes.add(currentNode)
          cyclePaths.add(step)

          return
        }

        if (siblingDependents.has(currentName)) {
          // a transitive cycle
          const cycleDependentName = [...dependentNode.localDependencies.keys()].find(
            ([key]) => currentNode.localDependents.has(key),
          )
          const pathToCycle = step
            .slice()
            .reverse()
            .concat(cycleDependentName!)

          cycleNodes.add(dependentNode)
          cyclePaths.add(pathToCycle)
        }

        dependentNode.localDependents.forEach(visits(step))
      }

      currentNode.localDependents.forEach(visits([currentName]))
    })

    if (cycleNodes.size) {
      this.prune(...cycleNodes)
    }

    return tuple([cyclePaths, cycleNodes])
  }

  /**
   * Remove all candidate nodes.
   */
  prune(...candidates: PackageGraphNode[]) {
    if (candidates.length === this.size) {
      return this.clear()
    }

    candidates.forEach((node) => this.remove(node))
  }

  /**
   * Delete by value (instead of key), as well as removing pointers
   * to itself in the other node's internal collections.
   * @param candidateNode instance to remove
   */
  remove(candidateNode: PackageGraphNode) {
    this.delete(candidateNode.name)

    this.forEach((node) => {
      // remove incoming edges ("indegree")
      node.localDependencies.delete(candidateNode.name)

      // remove outgoing edges ("outdegree")
      node.localDependents.delete(candidateNode.name)
    })
  }
}
