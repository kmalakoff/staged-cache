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
import { createWriteStream } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { stagedCache, verifySha256 } from 'staged-cache';

const url = 'https://nodejs.org/dist/v22.12.0/node-v22.12.0.tar.gz';
const dest = path.join(import.meta.dirname, '.cache', 'node-v22.12.0.tar.gz');
const sha256 = '<the published sha256 of the file>';

const file = await stagedCache(dest, {
  verify: verifySha256(sha256),
  build: async (staging) => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await pipeline(Readable.fromWeb(res.body), createWriteStream(staging));
  },
});
console.log(file); // dest: downloaded and verified on the first run, only hashed on later runs
```

Any code that writes the file to `staging` works. On a later run the existing file is hashed, found valid and returned without a download.

### A folder built by git

```js
import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { stagedCache } from 'staged-cache';

const COMMIT = '<a full commit sha>';
const REPO = 'https://github.com/example/project.git';
const dest = path.join(import.meta.dirname, '.cache', `project-${COMMIT}`);

const run = promisify(execFile);
const git = (args, cwd) => run('git', args, { cwd });

const dir = await stagedCache(dest, {
  verify: async (dir) => {
    try {
      const { stdout } = await git(['rev-parse', 'HEAD'], dir);
      return stdout.trim() === COMMIT;
    } catch {
      return false;
    }
  },
  build: async (staging) => {
    await git(['init', staging]);
    await git(['fetch', '--depth', '1', REPO, COMMIT], staging);
    await git(['checkout', '--detach', 'FETCH_HEAD'], staging);
  },
});
console.log(dir);
```

When the folder is missing, `git rev-parse` fails and `verify` answers `false`, which triggers the build.

### Callbacks and old Node

Every function also takes a Node-style callback as its last argument, and `verify` and `build` may take one instead of returning a Promise. The package runs on Node 0.8 and later, where it is loaded with `require`:

```js
var stagedCache = require('staged-cache').stagedCache;

stagedCache(dest, { verify: verify, build: build }, function (err, file) {
  if (err) throw err;
  console.log(file);
});
```

## API

```ts
import { renameInto, stagedCache, staleStaging, verifySha256 } from 'staged-cache';
```

### `stagedCache(dest, { verify, build }, [callback])`

Returns `dest` (through the callback, or a Promise when no callback is passed).

1. If `verify(dest)` is true, return `dest`. Nothing is built.
2. Otherwise create `dest`'s parent folder, call `build(staging)` with a unique hidden name beside `dest` (`.<name of dest>-<host>-<pid>-<suffix>`), and `verify(staging)`. The name starts with a dot so that code listing the folder, and any walker that skips dot names, never sees a build in progress. `<host>` is a short tag of this machine's process-id space and `<pid>` is the building process, so [`staleStaging`](#stalestagingdir-callback) can tell a killed build from a running one.
3. Rename `staging` to `dest`. If another process won the race and `verify(dest)` is now true, that result is used.
4. If an invalid file or folder is in the way, remove it and rename again.
5. Always remove `staging`. A failed or unverifiable build leaves nothing behind, and the error reaches the caller.

`staged-cache` removes only the staging file or folder that the same call created. It never sweeps, expires or prunes anything else.

- Code that lists a cache folder (a version list, a prune step) must skip names that start with a dot: those are builds in progress, not entries.
- A process that is killed outright (`SIGKILL`, power loss) during a build leaves its hidden staging file or folder behind. It is never taken for an entry, and it stays until you delete it. [`staleStaging`](#stalestagingdir-callback) finds these leftovers.

`verify(path, callback)` and `build(staging, callback)` take Node-style callbacks (`callback(err, valid)` and `callback(err)`), or return a Promise instead. `verify` answers `false` for a result that is missing or wrong, and reports an error only when it could not decide. An `ENOENT` or `ENOTDIR` error counts as `false` only when its `path` is the checked path or inside it; the same code from elsewhere (for example `spawn git ENOENT`) fails the call. A `verify` or `build` that never calls back and never returns a Promise makes the call hang.

### `staleStaging(dir, [callback])`

Lists the staging files and folders in `dir` that a killed build left behind, as full paths, sorted (through the callback, or a Promise when no callback is passed). It lists only: nothing is removed, and `stagedCache` never calls it. You decide when, and whether, to delete.

```js
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { staleStaging } from 'staged-cache';

for (const leftover of await staleStaging(path.join(import.meta.dirname, '.cache'))) {
  await rm(leftover, { recursive: true, force: true });
}
```

A name counts as a leftover when it has the staging form, was made on this machine, and its process no longer exists. A missing `dir` gives an empty list.

- A pid means something only inside one process-id space, so the `<host>` tag is a hash of the platform and hostname, and on Linux also of the PID namespace and the machine id. A name made on another machine or in another container therefore carries another tag and is never listed. The tag does not change across a reboot, so leftovers from before one are still listed.
- On Linux where the PID namespace cannot be read (a sandbox without `/proc/self/ns`), no pid can be judged, so `staleStaging` lists nothing there.
- The remaining limit: two systems that share a folder and cannot be told apart by those values must not use `staleStaging` on that folder, because a build running on the other system would look gone. That is two macOS or Windows machines with the same name on a network share, and Linux machines with the same hostname and the same or no `/etc/machine-id` (virtual machines cloned from one image).
- Some leftovers are never listed and stay until you delete them: those from a previous run of a container (each run is a new PID namespace), and those made before the machine's hostname changed.
- A pid that another live process has since reused looks alive, so that leftover is not listed until the pid is free.
- A leftover from 0.1.2 (`.<name>-<suffix>`, with no host or pid) cannot be attributed to a process and is never listed. Delete those by hand.

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
