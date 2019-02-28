declare module 'gentle-fs' {
  interface RmOptions {
    /** base path when checking prefixes */
    prefix: string
    /** the target must not be one of these values */
    prefixes: string[]
    /** current npm package name */
    name: string
    base?: string
    force?: boolean
    /** perform checks to see if it's safe to rm */
    gently?: boolean
    /** technically only necessary if gently = true */
    log: Pick<typeof import('npmlog'), import('npmlog').LogLevel>
  }
  /**
   * Will delete all directories between `target` and `opts.base`, as long as they are empty.
   * That is, if `target` is `/a/b/c/d/e` and `base` is `/a/b`, but `/a/b/c` has other files
   * besides the `d` directory inside of it, `/a/b/c` will remain.
   */
  function rm(target: string, opts: RmOptions, cb: Cb): unknown

  interface LinkOptions extends RmOptions {
    absolute?: boolean
  }
  /**
   * If `from` is a real directory, and `from` is not the same directory as `to`, will
   * symlink `from` to `to`, while also gently [`rm`](#rm)ing the `to` directory,
   * and then call the callback. Otherwise, will call callback with an `Error`.
   */
  function link(from: string, to: string, opts: LinkOptions, cb: Cb): unknown

  /**
   * Performs the same operation as [`link`](#link), except does nothing when `from` is the
   * same as `to`, and calls the callback.
   */
  function linkIfExists(from: string, to: string, opts: LinkOptions, cb: Cb): unknown

  type Cb = (err?: Error) => unknown
}
