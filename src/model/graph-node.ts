import * as D from 'debug'
import * as semver from 'semver'

import ValidationError from '../errors/validation'
import {NpaResultExt} from '../helpers/package-arg'
import Package from './package'

const debug = D('chimer:model:graph-node')

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
        value: (semver.prerelease(pkg.version) || []).concat().shift(),
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
  satisfies(
    {gitCommittish, gitRange, fetchSpec, file, chi, name}: NpaResultExt,
    parent?: Partial<PackageGraphNode>,
    options: semver.Options = {includePrerelease: true},
  ) {
    if (file && chi && chi.fetchSpec) {
      debug('satisfies? testing %s@%s against %s (chi) %j', this.name, this.version, chi.fetchSpec, options)
      const fileVersion = semver.coerce(file.version)
      if (!fileVersion || !semver.satisfies(fileVersion, chi.fetchSpec, options)) {
        throw new ValidationError(
          'EINVALIDVERSION',
          'File %s does not satisfy version %s in %s',
          file.buildPath, chi.fetchSpec, (parent || {}).name || '<unknown>'
        )
      }
      return semver.satisfies(this.version, chi.fetchSpec, options)
    }
    if (file) {
      return semver.eq(this.version, file.version, options)
    }
    const range = gitCommittish || gitRange || fetchSpec
    if (range == null) throw new Error('TODO: unexpected condition')
    return semver.satisfies(this.version, range, options)
  }
}
