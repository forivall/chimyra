import * as log from 'npmlog'
import * as os from 'os'
import * as path from 'path'
import * as writeFileAtomic from 'write-file-atomic'

export default function writeLogFile(cwd: string) {
  let logOutput = ''

  log.record.forEach((m) => {
    const pref = [m.id, m.level]
    if (m.prefix) {
      pref.push(m.prefix)
    }
    const prefix = pref.join(' ')

    m.message
      .trim()
      .split(/\r?\n/)
      .map((line) => `${prefix} ${line}`.trim())
      .forEach((line) => {
        logOutput += line + os.EOL
      })
  })

  // this must be synchronous because it is called before process exit
  writeFileAtomic.sync(path.join(cwd, 'lerna-debug.log'), logOutput)

  // truncate log after writing
  log.record.length = 0
}
