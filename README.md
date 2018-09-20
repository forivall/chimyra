# Elaius

A tool for managing JavaScript projects with bundled internal dependencies.

## About

Similar to [Lerna](https://github.com/lerna/lerna), helps manage a [monorepo](https://github.com/babel/babel/blob/master/doc/design/monorepo.md) based project. However, it's geared towards being independent of a registry without resorting to git subtree branching. It does this by generating local tarballs with `npm package` on the fly when installing dependencies for production deployment. This way, the package can be distributed without needing to copy the entire monorepo.

### What a monorepo using Elaius will look like:

```
my-project-repo/
  package.json
  apps/
    app-1/
      package.json
    app-2/
      package.json
  packages/
    library-1/
      package.json
    library-2/
      package.jon
```

The apps can depend on packages and use them as bundled dependencies.

There are 4 major elaius commands:

_Note: `ela` and `elaius` are interchangeable_

`ela dev` - bootstrap local packages by linking them together, and install foreign packages, for development.

`ela prepare` - when run inside of an app folder, prepare an app for deployment, by packaging the dependencies at the defined version. Can be used as `prepare` in `package.json` `scripts`.

`ela update` - Interactively update dependency versions. Automatically runs `ela prepare` after dependencies are up to date.

`ela version` - bump the version of an application or library, and tags the release. If the dependency versions defined in the package.json aren't at the current version as the packages in the repo, fails, and requires `ela update` or re-run using a flag to continue.

## Details

In the `package.json`, instead of defining the version of the package in `dependencies` / `devDependencies`, elaius introduces a `localDependencies` field. `d(evD)?ependencies` will use a path to a tarball, and localDependencies specifies the version identifier according to semver.
