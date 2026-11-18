# staged-cache

Use a file or folder that is already in place if it is valid. Otherwise build it under a temporary name, verify it and swap it into place, so a reader never sees a partial result, even when several processes build the same entry at once.

`staged-cache` does no downloading, hashing policy or git of its own. You supply `build` (a download, a `git clone`, a corpus build) and `verify` (a sha256, a commit check); it supplies the safe order, the temporary name and the lost-race handling.

## Install

```sh
npm install staged-cache
```

## Use

### A downloaded file, checked by sha256

```js
var path = require('path');
var getFile = require('get-file-compat');
var stagedCache = require('staged-cache').stagedCache;
var verifySha256 = require('staged-cache').verifySha256;

var dest = path.join(__dirname, '.cache', 'node-v22.12.0.tar.gz');
var sha256 = '<the published sha256 of the file>';

stagedCache(
  dest,
  {
    verify: verifySha256(sha256),
    build: function (staging, callback) {
      getFile('https://nodejs.org/dist/v22.12.0/node-v22.12.0.tar.gz', staging, function (err, res) {
        callback(err || (res.statusCode === 200 ? null : new Error('HTTP ' + res.statusCode)));
      });
    },
  },
  function (err, file) {
    if (err) throw err;
    console.log(file); // dest: downloaded and verified on the first run, only hashed on later runs
  }
);
```

`getFile` is [get-file-compat](https://www.npmjs.com/package/get-file-compat); any code that writes the file to `staging` works. On a later run the existing file is hashed, found valid and returned without a download.

### A folder built by git

```js
var path = require('path');
var execFile = require('child_process').execFile;
var stagedCache = require('staged-cache').stagedCache;

var COMMIT = '<a full commit sha>';
var REPO = 'https://github.com/example/project.git';
var dest = path.join(__dirname, '.cache', 'project-' + COMMIT);

function git(args, cwd, callback) {
  execFile('git', args, { cwd: cwd }, function (err, stdout) {
    callback(err, stdout);
  });
}

stagedCache(
  dest,
  {
    verify: function (dir, callback) {
      git(['rev-parse', 'HEAD'], dir, function (err, stdout) {
        callback(null, !err && stdout.trim() === COMMIT);
      });
    },
    build: function (staging, callback) {
      git(['init', staging], undefined, function (err) {
        if (err) return callback(err);
        git(['fetch', '--depth', '1', REPO, COMMIT], staging, function (err) {
          if (err) return callback(err);
          git(['checkout', '--detach', 'FETCH_HEAD'], staging, callback);
        });
      });
    },
  },
  function (err, dir) {
    if (err) throw err;
    console.log(dir);
  }
);
```

When the folder is missing, `git rev-parse` fails and `verify` answers `false`, which triggers the build.

## API

```ts
import { renameInto, stagedCache, verifySha256 } from 'staged-cache';
```

### `stagedCache(dest, { verify, build }, [callback])`

Returns `dest` (through the callback, or a Promise when no callback is passed).

1. If `verify(dest)` is true, return `dest`. Nothing is built.
2. Otherwise create `dest`'s parent folder, call `build(staging)` with a unique hidden name beside `dest` (`.<name of dest>-<suffix>`), and `verify(staging)`. The name starts with a dot so that code listing the folder, and any walker that skips dot names, never sees a build in progress.
3. Rename `staging` to `dest`. If another process won the race and `verify(dest)` is now true, that result is used.
4. If an invalid file or folder is in the way, remove it and rename again.
5. Always remove `staging`. A failed or unverifiable build leaves nothing behind, and the error reaches the caller.

`staged-cache` removes only the staging file or folder that the same call created. It never sweeps, expires or prunes anything else.

- Code that lists a cache folder (a version list, a prune step) must skip names that start with a dot: those are builds in progress, not entries.
- A process that is killed outright (`SIGKILL`, power loss) during a build leaves its hidden staging file or folder behind. It is never taken for an entry, and it stays until you delete it.

`verify(path, callback)` and `build(staging, callback)` take Node-style callbacks (`callback(err, valid)` and `callback(err)`), or return a Promise instead. `verify` answers `false` for a result that is missing or wrong, and reports an error only when it could not decide. An `ENOENT` or `ENOTDIR` error counts as `false` only when its `path` is the checked path or inside it; the same code from elsewhere (for example `spawn git ENOENT`) fails the call. A `verify` or `build` that never calls back and never returns a Promise makes the call hang.

### `verifySha256(expected)`

A ready-made `verify` for a file: true when the file's sha256 (hex) equals `expected`. A folder in the way is `false`. A missing file is an `ENOENT` error about that path, which `stagedCache` treats as `false`.

### `renameInto(from, to, [callback])`

For code that always writes a fresh file and wants the same rename rule, with no verify step. It renames `from` to `to` and removes `from` afterwards. If the rename is refused with `EPERM`, `EEXIST` or `ENOTEMPTY` and a file is at `to`, another process won the race and the call succeeds. Any other outcome fails with the rename's error. `to` is never removed.

## When processes race, and the folder gap

- **Files:** every racing process builds its own copy, one rename wins, and the others find a valid file and finish. Each caller gets a valid result. On POSIX a reader sees the old file or the new one, never nothing.
- **Folders:** a folder cannot be renamed over another folder (`ENOTEMPTY` on POSIX, `EPERM` on Windows, even when the folder is empty). If the first rename is refused and the folder in place is valid, it is kept. If it is invalid it is removed and the rename is retried. When two processes replace the *same invalid folder*, one can remove the other's fresh folder before renaming its own in, so a reader can briefly find nothing. Each caller re-checks and retries a few times and succeeds whenever a valid folder ends up in place. This only happens when an invalid folder was already there.
- **A file held open on Windows** by antivirus or an editor can refuse the rename. A valid file already in place is kept. An invalid held file cannot be removed: after the retries of `fs-remove-compat` (about 5 seconds) `stagedCache` fails with the removal error and leaves it untouched; the next run rebuilds it.
- **Hashing on every hit:** `verifySha256` reads the whole file each time. For large files use a cheaper `verify` of your own.

## Node support

Node 0.8 and newer, on Linux, macOS and Windows. It never downloads, so it needs no newer Node, and callbacks work everywhere; the Promise forms need a runtime where `Promise` is global.

## License

MIT
