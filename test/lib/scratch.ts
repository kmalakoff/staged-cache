import fs from 'fs';
import { safeRmSync } from 'fs-remove-compat';
import mkdirp from 'mkdirp-classic';
import path from 'path';
import { TMP_DIR } from './constants.ts';

// One scratch root per suite and process, so concurrent suites never share entries.
export default function createScratch(suite: string) {
  const root = path.join(TMP_DIR, `${suite}-${process.pid}`);
  let count = 0;
  return {
    setup: () => {
      safeRmSync(root, { recursive: true, force: true });
      mkdirp.sync(root);
    },
    clean: () => safeRmSync(root, { recursive: true, force: true }),
    // empties a folder between rounds of one test
    reset: (dir: string) => safeRmSync(dir, { recursive: true, force: true }),
    dir: (name: string) => {
      const dir = path.join(root, `${name}-${++count}`);
      fs.mkdirSync(dir);
      return dir;
    },
  };
}

// Names beside `dest` that begin with its name: staging leftovers.
export function leftovers(dest: string): string[] {
  const base = path.basename(dest);
  return fs.readdirSync(path.dirname(dest)).filter((name) => name !== base && name.indexOf(base) === 0);
}

export function readFolder(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  fs.readdirSync(dir)
    .sort()
    .forEach((name) => {
      out[name] = fs.readFileSync(path.join(dir, name), 'utf8');
    });
  return out;
}
