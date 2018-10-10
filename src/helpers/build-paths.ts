import Project from '../model/project'
import Package from '../model/package'
import * as path from 'path'
import {getPackTarget} from './package-arg';

export function getBuildDir(project: Project, pkg: {name: string}) {
  return path.join(project.buildRoot, pkg.name)
}

export function getBuildFile(project: Project, pkg: {name: string, version: string}) {
  return path.join(project.buildRoot, pkg.name, getPackTarget(pkg))
}
