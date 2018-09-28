declare module 'write-pkg' {

// Type definitions for write-pkg 3.2
// Project: https://github.com/sindresorhus/write-pkg#readme
// Definitions by: Aleh Zasypkin <https://github.com/azasypkin>, Emily Marigold Klassen <https://github.com/forivall>
// Definitions: https://github.com/DefinitelyTyped/DefinitelyTyped

import {Options as JsonOptions} from 'write-json-file'

interface Options extends JsonOptions {
  normalize?: boolean
}

interface WritePkg {
  (path: string, data: { [k: string]: any }, options?: Options): Promise<void>;
  (data: { [k: string]: any }, options?: Options): Promise<void>;
  sync(path: string, data: { [k: string]: any }): void;
  sync(data: { [k: string]: any }): void;
}

const writePkg: WritePkg;

export = writePkg;

//
}
