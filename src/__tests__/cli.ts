
import * as path from 'path'
import test from 'ava'
import findRoot = require('find-root')

import * as childProcess from '../helpers/child-process'

const root = findRoot(__dirname)

test('chi --help', async (t) => {
  const result = await childProcess.exec(process.execPath, [path.resolve(root, 'lib/cli.js'), '--help'])
  t.is(result.code, 0)
})
