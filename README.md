# Chimer

_/kai'mir,/kai'mɘr//_

A tool for managing JavaScript projects with bundled internal dependencies.

## About

Similar to [Lerna](https://github.com/lerna/lerna), Chimer helps manage a [monorepo](https://github.com/babel/babel/blob/master/doc/design/monorepo.md) based project. However, it's geared towards being independent of a registry without resorting to git subtree branching. It does this by generating local tarballs with `npm package` on the fly when installing dependencies for production deployment. This way, the package can be distributed without needing to copy the entire monorepo.

### What a monorepo using Chimer will look like:

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

There are 4 major chimer commands:

_Note: `chi` and `chimer` are interchangeable_

`chi dev` - bootstrap local packages by linking them together, and install foreign packages, for development.

`chi prepare` - when run inside of an app folder, prepare an app for deployment, by packaging the dependencies at the defined version. Can be used as `prepare` in `package.json` `scripts`.
  * TODO: also update the `package-lock.json` or `npm-shrinkwrap.json` to manually dedupe our local packages, and then run `npm i` again which will remove the duplicate once it's been removed from the shrinkwrap or lock. Or just manually remove the folder, as once the lock/shrinkwrap has been updated, it won't try to add it back until deps change in some other way.

`chi update` - Interactively update dependency versions. Automatically runs `chi prepare` after dependencies are up to date.

`chi version` - bump the version of an application or library, and tags the release. If the dependency versions defined in the package.json aren't at the current version as the packages in the repo, fails, and requires `chi update` or re-run using a flag to continue.

## Details

In the `package.json`, instead of defining the version of the package in `dependencies` / `devDependencies`, chimer introduces a `localDependencies` field. `d(evD)?ependencies` will use a path to a tarball, and localDependencies specifies the version identifier according to semver.
