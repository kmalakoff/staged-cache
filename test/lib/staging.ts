import fs from 'fs';
import path from 'path';
import { stagedCache } from 'staged-cache';

export interface Label {
  base: string;
  tag: string;
  pid: string;
  suffix: string;
}

// Splits a staging path built for `dest` into the parts after `.<basename of dest>-`; the parts are dash-free, so the split is unambiguous.
export function labelOf(staging: string, dest: string): Label {
  const prefix = `.${path.basename(dest)}-`;
  const name = path.basename(staging);
  assertPrefix(name, prefix);
  const parts = name.slice(prefix.length).split('-');
  return { base: path.basename(dest), tag: parts[0], pid: parts[1], suffix: parts[2] };
}

function assertPrefix(name: string, prefix: string): void {
  if (name.indexOf(prefix) !== 0) throw new Error(`${name} does not start with ${prefix}`);
}

// Runs a real stagedCache build and reports the staging path that `build` was given.
export function captureStaging(dest: string, callback: (err: Error | null | undefined, staging?: string) => void): void {
  let seen: string | undefined;
  stagedCache(
    dest,
    {
      verify: (p, cb) => fs.readFile(p, 'utf8', (err, text) => cb(null, !err && text === 'ok')),
      build: (staging, cb) => {
        seen = staging;
        fs.writeFile(staging, 'ok', cb);
      },
    },
    (err) => callback(err, seen)
  );
}

export const stagingName = (base: string, tag: string, pid: number | string, suffix: string | number = '1234567'): string => `.${base}-${tag}-${pid}-${suffix}`;
