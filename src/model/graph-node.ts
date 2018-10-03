import * as semver from 'semver'

import ValidationError from '../errors/validation'
import {NpaResultExt} from '../helpers/package-arg'
import Package from './package'

/**
 * Represents a node in a PackageGraph.
 */
export default class PackageGraphNode {
  readonly name!: string
  readonly location!: string
  readonly prereleaseId?: string

  protected _pkg!: Package

  externalDependencies: Map<string, NpaResultExt>
  localDependencies: Map<string, NpaResultExt>
  localDependents: Map<string, PackageGraphNode>
  constructor(pkg: Package) {
    Object.defineProperties(this, {
      _pkg: {
        value: pkg,
      },
      // immutable properties
      name: {
        enumerable: true,
        value: pkg.name,
      },
      location: {
        value: pkg.location,
      },
      prereleaseId: {
        // an existing prerelease ID only matters at the beginning
        value: (semver.prerelease(pkg.version) || []).shift(),
      },
    })

    this.externalDependencies = new Map()
    this.localDependencies = new Map()
    this.localDependents = new Map()
  }
  // properties that might change over time
  get version() {
    return this._pkg.version
  }
  get pkg() {
    return this._pkg
  }

  /**
   * Determine if the Node satisfies a resolved semver range.
   * @see https://github.com/npm/npm-package-arg#result-object
   */
  satisfies({gitCommittish, gitRange, fetchSpec, file, chi}: NpaResultExt) {
    if (file && chi && chi.fetchSpec) {
      if (!semver.satisfies(file.version, chi.fetchSpec)) {
        throw new ValidationError(
          'EINVALIDVERSION',
          'File %s does not satisfy version %s',
        )
      }
      return semver.satisfies(this.version, chi.fetchSpec)
    }
    if (file) {
      return semver.eq(this.version, file.version)
    }
    const range = gitCommittish || gitRange || fetchSpec
    if (range == null) throw new Error('TODO: unexpected condition')
    return semver.satisfies(this.version, range)
  }
}
