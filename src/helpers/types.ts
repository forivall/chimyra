export type Argument1<T> = T extends (a1: infer A) => any ? A : never
export type Argument2<T> = T extends (a1: any, a2: infer A) => any ? A : never

export type Resolve<T> = T extends PromiseLike<infer U> ? U : T

export function tuple<A extends string, B extends string, C extends string, D extends string, E extends string, F extends string>(v: [A, B, C, D, E, F]): [A, B, C, D, E, F]
export function tuple<A, B, C, D, E, F>(v: [A, B, C, D, E, F]): [A, B, C, D, E, F]
export function tuple<A extends string, B extends string, C extends string, D extends string, E extends string>(v: [A, B, C, D, E]): [A, B, C, D, E]
export function tuple<A, B, C, D, E>(v: [A, B, C, D, E]): [A, B, C, D, E]
export function tuple<A extends string, B extends string, C extends string, D extends string>(v: [A, B, C, D]): [A, B, C, D]
export function tuple<A, B, C, D>(v: [A, B, C, D]): [A, B, C, D]
export function tuple<A extends string, B extends string, C extends string>(v: [A, B, C]): [A, B, C]
export function tuple<A, B, C>(v: [A, B, C]): [A, B, C]
export function tuple<A extends string, B extends string>(v: [A, B]): [A, B]
export function tuple<A, B>(v: [A, B]): [A, B]
export function tuple<A extends string>(v: [A]): [A]
export function tuple<A>(v: [A]): [A]
export function tuple(v: any[]) {
  return v
}

export type IterableOrIterator<T> = Iterable<T> | Iterator<T>

export const roArray = <T>() => <U extends T>(v: U[]): ReadonlyArray<U> => v
export const roObj = <T>() => <U extends T>(v: U): Readonly<U> => v

export function never(val: never): never {
  throw new Error('Invalid')
}
