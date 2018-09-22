
import importLocal = require('import-local')

if (importLocal(__filename)) {
  (require('npmlog') as typeof import('npmlog')).info('cli', 'using local version of elaius')
} else {
  (require('.') as typeof import('.')).default(process.argv.slice(2))
}
