#!/usr/bin/env node

/* tslint:disable:no-require-imports */
import importLocal = require('import-local')

if (importLocal(__filename)) {
  ;(require('npmlog') as typeof import('npmlog')).info(
    'cli',
    'using local version of chimyra',
  )
} else {
  ;(require('source-map-support') as typeof import('source-map-support')).install()
  ;(require('.') as typeof import('.')).default(process.argv.slice(2))
}
