import ValidationError from '../errors/validation'
import describeRef, {DescribeRefOptions, GitRef} from './describe-ref'

export default async function checkWorkingTree(options: DescribeRefOptions) {
  const result = describeRef(options)

  // wrap each test separately to allow all applicable errors to be reported
  await Promise.all([
    // prevent duplicate versioning
    result.then(throwIfReleased),
    // prevent publish of uncommitted changes
    result.then(throwIfUncommitted),
  ])

  return result
}

export function isReleased({refCount}: GitRef) {
  return refCount === '0'
}

export function throwIfReleased(ref: GitRef) {
  if (isReleased(ref)) {
    throw new ValidationError(
      'ERELEASED',
      'The current commit has already been released. Please make new commits before continuing.',
    )
  }
}

export function throwIfUncommitted({isDirty}: GitRef) {
  if (isDirty) {
    throw new ValidationError(
      'EUNCOMMIT',
      'Working tree has uncommitted changes, please commit or remove changes before continuing.',
    )
  }
}
