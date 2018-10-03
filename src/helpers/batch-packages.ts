import * as log from 'npmlog'

import ValidationError from '../errors/validation'
import PackageGraph, {PackageGraphOptions} from '../model/graph'
import Package from '../model/package'
import {IterableOrIterator} from './types'

export interface BatchPackagesOptions extends PackageGraphOptions {
  rejectCycles?: boolean
}

export default function batchPackages(
  packagesToBatch: IterableOrIterator<Package>,
  options: BatchPackagesOptions = {},
) {
  // create a new graph because we will be mutating it
  const graph = new PackageGraph(packagesToBatch, options)
  const [cyclePaths, cycleNodes] = graph.partitionCycles()
  const batches = []

  if (cyclePaths.size) {
    const cycleMessage = ['Dependency cycles detected, you should fix these!']
      .concat([...cyclePaths].map((cycle) => cycle.join(' -> ')))
      .join('\n')

    const {rejectCycles = false} = options
    if (rejectCycles) {
      throw new ValidationError('ECYCLE', cycleMessage)
    }

    log.warn('ECYCLE', cycleMessage)
  }

  while (graph.size) {
    // pick the current set of nodes _without_ localDependencies (aka it is a "source" node)
    const batch = Array.from(graph.values()).filter(
      (node) => node.localDependencies.size === 0,
    )

    log.silly('batched', '%O', batch)
    // batches are composed of Package instances, not PackageGraphNodes
    batches.push(batch.map((node) => node.pkg))

    // pruning the graph changes the node.localDependencies.size test
    graph.prune(...batch)
  }

  if (cycleNodes.size) {
    // isolate cycles behind a single-package batch of the cyclical package with the most dependents
    const [king, ...rats] = [...cycleNodes]
      .sort((a, b) => b.localDependents.size - a.localDependents.size)
      .map((node) => node.pkg)

    batches.push([king])
    batches.push(rats)
  }

  return batches
}
