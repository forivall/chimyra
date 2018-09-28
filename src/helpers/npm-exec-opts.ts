import * as log from 'npmlog'

import Package from '../model/package'

export default function getExecOpts(pkg: Package, registry?: string) {
  // execa automatically extends process.env
  const env: NodeJS.ProcessEnv = {}

  if (registry) {
    env.npm_config_registry = registry
  }

  log.silly('getExecOpts', pkg.location, registry)
  return {
    cwd: pkg.location,
    env,
    pkg,
  }
}
