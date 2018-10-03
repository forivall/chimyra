import {IteratorWithOperators} from 'iterare/lib/iterate'

declare module 'iterare/lib/iterate' {
  interface IteratorWithOperators<T> {
    flatten<R>(this: IteratorWithOperators<R | Iterable<R> | Iterator<R>>): IteratorWithOperators<R>;
    toMap<K, V>(this: IteratorWithOperators<[K, V]>): Map<K, V>;
  }
}
