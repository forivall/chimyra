// package.json files are not that complicated, so this is intentionally naïve
export default function shallowCopy<T = any>(json: T): T {
  return (Object.keys(json) as (keyof T)[]).reduce((obj: any, key) => {
    const val = json[key]

    /* istanbul ignore if */
    if (Array.isArray(val)) {
      obj[key] = val.slice()
    } else if (val && typeof val === 'object') {
      obj[key] = {...(val as any)}
    } else {
      obj[key] = val
    }

    return obj
  }, {} as T)
}
