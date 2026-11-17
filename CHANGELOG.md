# Changelog

## [0.1.0] - 2026-11-17

### Added

- `stagedCache(dest, { verify, build }, [callback])` returns a valid file or folder at `dest`: it reuses a valid one, otherwise builds under a temporary name, verifies it and swaps it into place. It handles processes racing on the same entry, and a failed or unverifiable build leaves nothing behind.
- `verifySha256(expected)`, a `verify` for files.
- `renameInto(from, to, [callback])`, the same rename rule for code that always replaces a file. It never removes the destination.
- Named exports only. Callback and Promise forms, ESM and CommonJS builds, Node 0.8 and newer.
