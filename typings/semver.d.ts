import * as semver from 'semver'

declare module 'semver' {
  /**
   * Return the version incremented by the release type (major, minor, patch, or prerelease), or null if it's not valid.
   */
  export function inc(v: string | SemVer, release: ReleaseType, identifier?: string): string | null;
  export function inc(v: string | SemVer, release: ReleaseType, loose?: boolean, identifier?: string): string | null;
}
