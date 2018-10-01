declare module 'read-cmd-shim' {
//

function readCmdShim(path: string, cb: (err: Error | null, destination: string) => void): void

namespace readCmdShim {
  function sync(path: string): string
}

export = readCmdShim

//
}
