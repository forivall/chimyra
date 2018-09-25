import * as log from 'npmlog'

import {ChildProcessError} from '../../helpers/child-process'

export default function logPackageError(err: ChildProcessError) {
  const pkg = err.pkg || ({} as {name: undefined})
  log.error(err.cmd, `exited ${err.code} in '${pkg.name}'`)

  if (err.stdout) {
    log.error(err.cmd, 'stdout:')
    directLog(err.stdout)
  }

  if (err.stderr) {
    log.error(err.cmd, 'stderr:')
    directLog(err.stderr)
  }

  // Below is just to ensure something sensible is printed after the long stream of logs
  log.error(err.cmd, `exited ${err.code} in '${pkg.name}'`)
}

function directLog(message: string) {
  log.pause()
  console.error(message) // eslint-disable-line no-console
  log.resume()
}
