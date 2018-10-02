import * as path from 'path'

import * as npa from 'npm-package-arg'
import * as log from 'npmlog'
import * as writePkg from 'write-pkg'

import {Dependencies, PackageJson} from '@npm/types'

import ValidationError from '../errors/validation'
import {getPackTarget} from '../helpers/package-arg'
import shallowCopy from '../helpers/shallow-copy'

function binSafeName(result: npa.Result) {
  const {name, scope} = result
  if (name === null) {
    throw new ValidationError('binSafeName', 'Could not get name from %O', result)
  }
  return scope ? name.substring(scope.length + 1) : name
}

export interface ChimerPackageJson extends PackageJson {
  optionalDependencies?: Dependencies
  chimerDependencies?: Dependencies
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
  readonly scripts: ChimerPackageJson['scripts']
  readonly manifestLocation!: string
  readonly nodeModulesLocation!: string
  readonly binLocation!: string

  private readonly _pkg!: ChimerPackageJson

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
  get chimerDependencies() {
    return this._pkg.chimerDependencies
  }
  get bundleDependencies() {
    return this._pkg.bundleDependencies || this._pkg.bundledDependencies
  }
  get packTarget() {
    return getPackTarget(this)
  }
  get buildFile() {
    return path.join(this.name, this.packTarget)
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
  async serialize() {
    return writePkg(this.manifestLocation, this._pkg, {detectIndent: true})
  }

  // TODO: update to set up local dependencies
  updateLocalDependency(
    resolved: npa.Result,
    tarball: string,
    depVersion: string,
    savePrefix: string,
  ) {
    const depName = resolved.name

    if (depName === null) {
      throw new ValidationError('ENAME', 'Could not get name from %O', resolved)
    }

    const depCollection = this.getDependencyCollection(depName)

    if (!depCollection) {
      log.info(
        'PACKAGE',
        'Requested update for unknown dependency %O to %s%s',
        resolved,
        depVersion,
        savePrefix,
      )
      return
    }

    let chiDependencies = this.chimerDependencies
    if (!chiDependencies) {
      chiDependencies = {}
      this.set('chimerDependencies', chiDependencies)
    }

    if (resolved.registry || resolved.type === 'directory') {
      // a version (1.2.3) OR range (^1.2.3) OR directory (file:../foo-pkg)
      chiDependencies[depName] = `${savePrefix}${depVersion}`
      depCollection[depName] = `file:${path.relative(this.location, tarball)}`
    } else {
      console.log('TODO: handle tarball dep, read from `localDependencies`', resolved)
    }
  }

  getDependencyCollection(depName: string) {
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
    return depCollection
  }

  getPath(file: string) {
    return path.join(this.location, file)
  }
}
