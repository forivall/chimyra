export type Argument1<T> = T extends (a1: infer A) => any ? A : never
export type Argument2<T> = T extends (a1: any, a2: infer A) => any ? A : never

export type Resolve<T> = T extends PromiseLike<infer U> ? U : T

export const tuple = <A, B>(v: [A, B]) => v

export type IterableOrIterator<T> = Iterable<T> | Iterator<T>
