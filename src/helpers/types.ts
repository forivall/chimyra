export type Argument1<T> = T extends (a1: infer A) => any ? A : never
export type Argument2<T> = T extends (a1: any, a2: infer A) => any ? A : never
