import fs from 'fs';
import type { Callback } from './types.ts';

// Another process may have won the rename (Windows reports EPERM when the destination is held open): that is success only
// when a file is at `to`. The destination is never removed, and any other error is the caller's.
const LOST_RACE_CODES: Record<string, boolean> = { EPERM: true, EEXIST: true, ENOTEMPTY: true };

function worker(from: string, to: string, callback: Callback): void {
  const finish = (err: Error | null) =>
    fs.unlink(from, (unlinkErr) => {
      if (err) return callback(err);
      callback(unlinkErr && (unlinkErr as NodeJS.ErrnoException).code !== 'ENOENT' ? unlinkErr : null);
    });

  fs.rename(from, to, (err) => {
    if (!err) return callback(null);
    if (!LOST_RACE_CODES[(err as NodeJS.ErrnoException).code as string]) return finish(err);
    fs.stat(to, (statErr, stats) => finish(statErr || !stats.isFile() ? err : null));
  });
}

export default function renameInto(from: string, to: string): Promise<void>;
export default function renameInto(from: string, to: string, callback: Callback): void;
export default function renameInto(from: string, to: string, callback?: Callback): void | Promise<void> {
  if (typeof callback === 'function') return worker(from, to, callback);
  return new Promise((resolve, reject) => worker(from, to, (err) => (err ? reject(err) : resolve())));
}
