import Command, {CommandArgs} from '../command'

import {Argv} from 'yargs/yargs'
import {PackageJson} from '@npm/types';
import ValidationError from '../errors/validation';

export const command = 'prepare'
export const aliases = ['prep']
export const describe = 'Normalize package.json and generate tarballs for dependencies'

export function builder(y: Argv) {
  return y
}

// tslint:disable-next-line:no-empty-interface
export interface Args extends CommandArgs {}

export default class PrepareCommand extends Command {
  initialize() {
    // TODO: check that versions are compatible

    if (!this.currentPackage || !this.currentPackageNode) {
      throw new ValidationError('PREPARE', 'Must be run from a package folder')
    }

    console.log(this.currentPackageNode.localDependents)

    // update representation of package.json replacing directory based file:
    // specifiers with tarballs

    // TODO: check if packages can be packaged at defined versions using current git state
    // allow flag to override, as long as version range matches current dev state

    // if packages need to be created at other git versions, fail
    // TODO: create a temporary work folder to create the packages

    throw new Error('Method not implemented.')
  }
  execute() {
    // package all local dependencies at defined versions

    // update package.json to

    throw new Error('Method not implemented.')
  }
}

export function handler(argv: Args) {
  return new PrepareCommand(argv)
}
