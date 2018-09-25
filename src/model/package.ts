import * as npa from 'npm-package-arg'
import * as path from 'path'
import * as writePkg from 'write-pkg'

import {Dependencies, PackageJson} from '@npm/types'

import ValidationError from '../errors/validation'

function binSafeName(result: npa.Result) {
  const {name, scope} = result
  if (name === null) {
    throw new ValidationError(
      'binSafeName',
      'Could not get name from %O',
      result,
    )
  }
  return scope ? name.substring(scope.length + 1) : name
}

// package.json files are not that complicated, so this is intentionally naïve
function shallowCopy(json: any) {
  return Object.keys(json).reduce((obj: any, key) => {
    const val = json[key]

    /* istanbul ignore if */
    if (Array.isArray(val)) {
      obj[key] = val.slice()
    } else if (val && typeof val === 'object') {
      obj[key] = {...val}
    } else {
      obj[key] = val
    }

    return obj
  }, {})
}

export interface AnyPackageJson extends PackageJson {
  optionalDependencies?: Dependencies
  [key: string]: any
}

export default class Package {
  readonly name!: string
  readonly location!: string
  readonly private!: boolean
  readonly resolved!: npa.Result
  readonly rootPath!: string
  readonly bin!: {
    [name: string]: string
  }
  readonly scripts: PackageJson['scripts']
  readonly manifestLocation!: string
  readonly nodeModulesLocation!: string
  readonly binLocation!: string

  private readonly _pkg!: AnyPackageJson

  constructor(pkg: PackageJson, location: string, rootPath = location) {
    // npa will throw an error if the name is invalid
    const resolved = npa.resolve(
      pkg.name,
      `file:${path.relative(rootPath, location)}`,
      rootPath,
    )

    Object.defineProperties(this, {
      _pkg: {
        value: pkg,
      },
      // read-only
      name: {
        enumerable: true,
        value: pkg.name,
      },
      location: {
        value: location,
      },
      private: {
        value: Boolean(pkg.private),
      },
      resolved: {
        value: resolved,
      },
      rootPath: {
        value: rootPath,
      },
      // immutable
      bin: {
        value:
          typeof pkg.bin === 'string' && typeof resolved.name === 'string'
            ? {
                [binSafeName(resolved)]: pkg.bin,
              }
            : {...pkg.bin},
      },
      scripts: {
        value: {...pkg.scripts},
      },
      manifestLocation: {
        value: path.join(location, 'package.json'),
      },
      nodeModulesLocation: {
        value: path.join(location, 'node_modules'),
      },
      binLocation: {
        value: path.join(location, 'node_modules', '.bin'),
      },
    })
  }
  // mutable
  get version() {
    return this._pkg.version
  }
  set version(version) {
    this._pkg.version = version
  }
  // collections
  get dependencies() {
    return this._pkg.dependencies
  }
  get devDependencies() {
    return this._pkg.devDependencies
  }
  get optionalDependencies() {
    return this._pkg.optionalDependencies
  }
  get peerDependencies() {
    return this._pkg.peerDependencies
  }
  // Map-like retrieval and storage of arbitrary values
  get(key: string) {
    return this._pkg[key]
  }
  set(key: string, val: any) {
    this._pkg[key] = val

    return this
  }
  // provide copy of internal pkg for munging
  toJSON() {
    return shallowCopy(this._pkg)
  }
  // write changes to disk
  serialize() {
    writePkg(this.manifestLocation, this._pkg)
  }

  // TODO: update to set up local dependencies
  updateLocalDependency(
    resolved: npa.Result,
    depVersion: string,
    savePrefix: string,
  ) {
    const depName = resolved.name

    if (depName === null) {
      throw new ValidationError(
        'updateLocalDependency',
        'Could not get name from %O',
        resolved,
      )
    }

    // first, try runtime dependencies
    let depCollection = this.dependencies

    // try optionalDependencies if that didn't work
    if (!depCollection || !depCollection[depName]) {
      depCollection = this.optionalDependencies
    }

    // fall back to devDependencies
    if (!depCollection || !depCollection[depName]) {
      depCollection = this.devDependencies
    }

    if (!depCollection) {
      depCollection = {}
    }

    if (resolved.registry || resolved.type === 'directory') {
      // a version (1.2.3) OR range (^1.2.3) OR directory (file:../foo-pkg)
      depCollection[depName] = `${savePrefix}${depVersion}`
    } else if (resolved.gitCommittish) {
      // a git url with matching committish (#v1.2.3 or #1.2.3)
      const match = /^\D*/.exec(resolved.gitCommittish)
      const [tagPrefix] = match!

      // update committish
      const {hosted} = resolved
      hosted.committish = `${tagPrefix}${depVersion}`

      // always serialize the full url (identical to previous resolved.saveSpec)
      depCollection[depName] = hosted.toString({
        noGitPlus: false,
        noCommittish: false,
      })
    } else if (resolved.gitRange) {
      // a git url with matching gitRange (#semver:^1.2.3)
      const {hosted} = resolved // take that, lint!
      hosted.committish = `semver:${savePrefix}${depVersion}`

      // always serialize the full url (identical to previous resolved.saveSpec)
      depCollection[depName] = hosted.toString({
        noGitPlus: false,
        noCommittish: false,
      })
    } else {
      console.log('TODO: handle tarball dep, read from `localDependencies`')
    }
  }
}
