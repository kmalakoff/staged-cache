import fs from 'fs';
import path from 'path';
import { ownerPid } from './lib/staging.ts';
import type { StaleStagingCallback } from './types.ts';

// `process.kill(pid, 0)` sends no signal: it only reports whether the process exists. EPERM means it exists and is not ours.
function isGone(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return false;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'ESRCH';
  }
}

function worker(dir: string, callback: StaleStagingCallback): void {
  fs.readdir(dir, (err, names) => {
    if (err) return (err as NodeJS.ErrnoException).code === 'ENOENT' ? callback(null, []) : callback(err);
    const stale = names.filter((name) => {
      const pid = ownerPid(name);
      return pid !== null && isGone(pid);
    });
    callback(
      null,
      stale.sort().map((name) => path.join(dir, name))
    );
  });
}

/** Lists the staging files and folders in `dir` that were left by a process on this machine that no longer exists. Removes nothing; the caller decides. Takes a callback or returns a Promise. */
export default function staleStaging(dir: string): Promise<string[]>;
export default function staleStaging(dir: string, callback: StaleStagingCallback): void;
export default function staleStaging(dir: string, callback?: StaleStagingCallback): void | Promise<string[]> {
  if (typeof callback === 'function') return worker(dir, callback);
  return new Promise((resolve, reject) => worker(dir, (err, list) => (err ? reject(err) : resolve(list as string[]))));
}
