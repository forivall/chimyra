import * as path from 'path'

import * as fs from 'fs-extra'
import * as _ from 'lodash'
import * as semver from 'semver'
import writeJsonFile from 'write-json-file'
import {Argv} from 'yargs/yargs'

import Command, {GlobalOptions} from '../command'
import {NoCurrentPackage} from '../errors/validation'
import gitAdd from '../helpers/git/add'
import gitCommit from '../helpers/git/commit'
import gitTag from '../helpers/git/create-tag'
import * as PromptUtilities from '../helpers/prompt'
import PackageGraphNode from '../model/graph-node'
import Package from '../model/package'
import {roArray, never} from '../helpers/types';

export const command = 'version [bump]'
export const describe = 'Update the version of the current package'
const prefix = 'VERSION'

export function builder(y: Argv) {
  return y.options({
    amend: {
      describe: 'Amend the existing commit, instead of generating a new one.',
      type: 'boolean',
    },
    'commit-hooks': {
      describe: 'Run git commit hooks when committing the version changes.',
      type: 'boolean',
      defaultDescription: 'true',
    },
    preid: {
      describe: 'Specify the prerelease identifier when versioning a prerelease',
      type: 'string',
      requiresArg: true,
      defaultDescription: 'alpha',
    },
    'sign-git-commit': {
      describe: 'Pass the `--gpg-sign` flag to `git commit`.',
      type: 'boolean',
    },
    'sign-git-tag': {
      describe: 'Pass the `--sign` flag to `git tag`.',
      type: 'boolean',
    },
    y: {
      describe: 'Skip all confirmation prompts.',
      alias: 'yes',
      type: 'boolean',
    },
  })
}

// tslint:disable-next-line:no-empty-interface
export interface Options extends GlobalOptions {
  bump?: string

  amend?: boolean
  commitHooks?: boolean
  preid?: string
  signGitCommit?: boolean
  signGitTag?: boolean
  yes?: boolean
}

export default class VersionCommand extends Command {
  options!: Options
  currentPackage!: Package
  currentPackageNode!: PackageGraphNode
  tagOnly!: boolean
  changedFiles: string[] = []

  async initialize() {
    if (!this.currentPackage || !this.currentPackageNode) {
      throw new NoCurrentPackage()
    }

    const newVersion = await this.getNewVersion()
    this.tagOnly = this.currentPackage.version === newVersion
    this.currentPackage.version = newVersion
    this.logger.info(prefix, 'Setting new version to %s', this.currentPackage.version)
  }
  async getNewVersion() {
    const {preid, bump} = this.options
    let newVersion = bump ? semver.clean(bump) : ''
    if (newVersion) {
      if (preid) {
        const s = new semver.SemVer(newVersion)
        s.prerelease.concat(preid)
        newVersion = s.format()
      }
      return newVersion
    }

    const increment = bump && !semver.valid(bump) ? bump : ''
    const isPrerelease = increment.startsWith('pre') || undefined
    const existingPreId = this.currentPackageNode.prereleaseId

    const pkg = this.currentPackage
    if (increment && isVersionBump(increment)) {
      newVersion = semver.inc(pkg.version, increment, preid || (isPrerelease && existingPreId))
      if (newVersion) {
        return newVersion
      } else {
        this.logger.info(name, 'Could not generate new version')
      }
    }

    const newPre = preid || existingPreId || 'alpha'

    return promptVersion(pkg.version, pkg.name, {
      prereleaseId: newPre
    })
  }

  async updateVersionInFile(filePath: string, version: string) {
    const filePathLocal = path.relative(this.currentPackage.location, filePath)
    try {
      const lockJson = await fs.readJson(filePath)
      lockJson.version = version
      await writeJsonFile(filePath, lockJson, {detectIndent: true})
      this.logger.info(prefix, 'Update %s', filePathLocal)
      this.changedFiles.push(filePath)
    } catch {
      this.logger.info(prefix, 'No Change %s', filePathLocal)
    }
    // TODO: show a confirmation prompt
  }

  dryRun: undefined
  async execute() {
    // TODO: run package lifecycle, like preversion, etc.
    if (!this.tagOnly) {
      const version = this.currentPackage.version
      this.logger.info(prefix, 'Writing version %s to package files', version)
      await this.currentPackage.serialize()
      this.changedFiles.push(this.currentPackage.manifestLocation)
      this.logger.info(prefix, 'Updated package.json')

      await this.updateVersionInFile(this.currentPackage.lockfileLocation, version)
      await this.updateVersionInFile(this.currentPackage.shrinkwrapLocation, version)

      await gitAdd(this.changedFiles, {cwd: this.currentPackage.location})
      const commitResult = await gitCommit(
        `version(${this.currentPackage.name}): v${this.currentPackage.version}`,
        this.options,
      )
      this.logger.info(prefix, 'Created git commit %O', commitResult)
    }

    const tagResult = await gitTag(this.currentPackage, this.options)
    this.logger.info(prefix, 'Created git tag %O', tagResult)
  }
}

export function handler(argv: Options) {
  return new VersionCommand(argv)
}

const releaseTypes = roArray<string>()(["major", "premajor", "minor", "preminor", "patch", "prepatch", "prerelease"])
export function isVersionBump(increment: string): increment is semver.ReleaseType {
  return (releaseTypes as string[]).indexOf(increment) >= 0
}

export type VersionBump = semver.ReleaseType | 'PRERELEASE' | 'CUSTOM' | 'CURRENT'
const allBumps: VersionBump[] = [
  'patch',
  'minor',
  'major',
  'prepatch',
  'preminor',
  'premajor',
  'prerelease',
  'PRERELEASE',
  'CUSTOM',
  'CURRENT',
]
export interface PromptVersionOptions {
  bumps?: VersionBump[]
  message?: string
  prereleaseId?: string
}
/**
 * A predicate that prompts user to select/construct a version bump.
 * It can be run per-package (independent) or globally (fixed).
 *
 * @property currentVersion
 * @property name (Only used in independent mode)
 * @property prereleaseId
 */
export async function promptVersion(currentVersion: string, name: string, options: PromptVersionOptions = {}) {
  const prereleaseId = options.prereleaseId || 'pre'
  const versionChoices = (options.bumps || allBumps).map((bump) => {
    switch (bump) {
      case 'PRERELEASE': return {value: 'PRERELEASE', name: 'Custom Prerelease'}
      case 'CUSTOM': return {value: 'CUSTOM', name: 'Custom Version'}
      case 'CURRENT': return {value: 'CURRENT', name: 'Tag Only'}
      default:
      const name = _.startCase(bump)
      if (bump.startsWith('pre')) {
        return {value: semver.inc(currentVersion, bump, prereleaseId), name}
      }
      return {value: semver.inc(currentVersion, bump), name}
    }
  })

  const message = `${options.message || 'Select a new version'} ${
    name ? `for ${name} ` : ''
  }(currently ${currentVersion})`

  const choice = await PromptUtilities.select(message, {
    choices: versionChoices.filter((choice): choice is {value: string; name: string} => choice.value != null),
  })
  if (choice === 'CUSTOM') {
    return PromptUtilities.input('Enter a custom version', {
      filter: semver.valid,
      // semver.valid() always returns null with invalid input
      validate: (v) => v !== null || 'Must be a valid semver version',
    })
  }

  if (choice === 'PRERELEASE') {
    const defaultVersion = semver.inc(currentVersion, 'prerelease', prereleaseId)
    const prompt = `(default: "${prereleaseId}", yielding ${defaultVersion})`

    return PromptUtilities.input(`Enter a prerelease identifier ${prompt}`, {
      filter: (v) => semver.inc(currentVersion, 'prerelease', v || prereleaseId),
    })
  }

  if (choice === 'CURRENT') return currentVersion

  return choice
}
