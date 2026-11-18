# Changelog

## [0.2.1] - 2026-11-18

Documentation only: the README examples are written in modern JavaScript (`import`, `async`/`await`), with the callback form shown once. No code change.

## [0.2.0] - 2026-11-18

### Added

- `staleStaging(dir, [callback])` lists the staging files and folders that killed builds left in `dir`: names in the staging form, made on this machine, whose process no longer exists. It removes nothing, and `stagedCache` never calls it.

### Changed

- The staging name is now `.<name of dest>-<host>-<pid>-<suffix>`, labelled with the building process and a short tag of its process-id space (the platform and hostname, and on Linux the PID namespace and machine id). The tag does not change across a reboot. Leftovers named by 0.1.2 (`.<name of dest>-<suffix>`) are not listed by `staleStaging`.
- The staging name is 13 to 17 characters longer than in 0.1.2, so the longest usable `dest` name is shorter by that much (about 228 characters where the limit is 255).

## [0.1.2] - 2026-11-18

### Fixed

- The staging file or folder is now hidden: `.<name of dest>-<suffix>` beside `dest`, where it used to be `<name of dest>-<suffix>`. Code that lists a cache folder (a version list, a prune step) could see a build in progress, or one left by a killed process, and take it for an entry.

## [0.1.1] - 2026-11-18

### Fixed

- Windows: while several callers replace the same invalid folder, a file in the folder being replaced can refuse to open for a moment. `stagedCache` reported that as a verify error to one caller. It now looks again, a bounded number of times, and succeeds once the valid folder is in place.

- `renameInto` removes the source file with `fs-remove-compat`'s `safeRm`, which retries a file Windows still holds for a moment, instead of a single `unlink`.

## [0.1.0] - 2026-11-17

### Added

- `stagedCache(dest, { verify, build }, [callback])` returns a valid file or folder at `dest`: it reuses a valid one, otherwise builds under a temporary name, verifies it and swaps it into place. It handles processes racing on the same entry, and a failed or unverifiable build leaves nothing behind.
- `verifySha256(expected)`, a `verify` for files.
- `renameInto(from, to, [callback])`, the same rename rule for code that always replaces a file. It never removes the destination.
- Named exports only. Callback and Promise forms, ESM and CommonJS builds, Node 0.8 and newer.
