
import {Argv} from 'yargs/yargs'

export const command = 'dev'
export const aliases = ['develop']
export const describe = 'Link local packages in current project'

export function builder(y: Argv) {
  return y
}

export interface Args {

}

export function handler(argv: Args) {

}

export default class DevCommand {

}
