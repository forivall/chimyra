import Project from '../model/project'
import Package from '../model/package'
import * as path from 'path'

export function getBuildDir(project: Project, pkg: Package) {
  return path.join(project.buildRoot, pkg.name)
}

// unused
export function getBuildFile(project: Project, pkg: Package) {
  return path.join(project.buildRoot, pkg.buildFile)
}
