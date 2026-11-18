# Changelog

## [0.1.1]

### Fixed

- Windows: while several callers replace the same invalid folder, a file in the folder being replaced can refuse to open for a moment. `stagedCache` reported that as a verify error to one caller. It now looks again, a bounded number of times, and succeeds once the valid folder is in place.

- `renameInto` removes the source file with `fs-remove-compat`'s `safeRm`, which retries a file Windows still holds for a moment, instead of a single `unlink`.

## [0.1.0] - 2026-11-17

### Added

- `stagedCache(dest, { verify, build }, [callback])` returns a valid file or folder at `dest`: it reuses a valid one, otherwise builds under a temporary name, verifies it and swaps it into place. It handles processes racing on the same entry, and a failed or unverifiable build leaves nothing behind.
- `verifySha256(expected)`, a `verify` for files.
- `renameInto(from, to, [callback])`, the same rename rule for code that always replaces a file. It never removes the destination.
- Named exports only. Callback and Promise forms, ESM and CommonJS builds, Node 0.8 and newer.
