import * as ChildProcessUtilities from '../../helpers/child-process'
import * as log from 'npmlog'

export default function warnIfHanging() {
  const childProcessCount = ChildProcessUtilities.getChildProcessCount()

  if (childProcessCount > 0) {
    log.warn(
      'complete',
      `Waiting for ${childProcessCount} child ` +
        `process${childProcessCount === 1 ? '' : 'es'} to exit. ` +
        'CTRL-C to exit immediately.',
    )
  }
}
