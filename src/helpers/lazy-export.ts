export default function lazyExport<T>(
  m: NodeModule,
  name: string,
  create: () => T,
) {
  let value: undefined | T
  Object.defineProperty(m.exports, name, {
    enumerable: true,
    get() {
      if (value === undefined) value = create()

      return value
    },
  })
}
