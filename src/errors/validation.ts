import * as log from 'npmlog'

export default class ValidationError extends Error {
  prefix: string
  constructor(prefix: string, message: string, ...rest: any[]) {
    super(message)
    this.name = 'ValidationError'
    this.prefix = prefix
    log.resume() // might be paused, noop otherwise
    log.error(prefix, message, ...rest)
  }
}

export class NoCurrentPackage extends ValidationError {
  constructor() {
    super('ENOTPKGDIR', 'Must be run from a package folder')
  }
}
