import fs from 'fs';
import { safeRm } from 'fs-remove-compat';

// A refused rename can mean another process won the race (Windows reports EPERM, not EEXIST, for a folder or a held file)
// or that the other kind of thing (file or folder) is in the way (EISDIR, ENOTDIR on POSIX). `verify` decides which.
const REFUSED_CODES: Record<string, boolean> = { EPERM: true, EEXIST: true, ENOTEMPTY: true, EACCES: true, EBUSY: true, EISDIR: true, ENOTDIR: true };
// A failed remove or second rename with these codes is another process replacing the same thing: look again and retry.
const CONTENDED_CODES: Record<string, boolean> = { EPERM: true, EEXIST: true, ENOTEMPTY: true };
const ATTEMPTS = 6;
// A path being replaced by another process can report these on Windows until the replacement settles.
const BUSY_CODES: Record<string, boolean> = { EPERM: true, EBUSY: true, EACCES: true };
// a random pause keeps processes doing the same replacement from colliding on every attempt
const pause = (count: number) => Math.floor(Math.random() * 15 * count);

export type Accept = (path: string, callback: (err: Error | null | undefined, ok?: boolean) => void) => void;

export function remove(path: string, callback: (err: Error | null) => void): void {
  safeRm(path, { recursive: true, force: true }, (err) => callback(err || null));
}

const codeOf = (err: Error) => (err as NodeJS.ErrnoException).code as string;

// Rename `from` to `to`. A refused rename succeeds when `accept(to)` finds a complete result there. Otherwise the
// invalid thing in the way is removed (a folder cannot be renamed over another) and the rename is tried again,
// a few times, with a short random pause, when another process is doing the same.
export default function moveInto(from: string, to: string, accept: Accept, callback: (err: Error | null) => void): void {
  function attempt(count: number) {
    fs.rename(from, to, (err) => {
      if (!err) return callback(null);
      if (!REFUSED_CODES[codeOf(err)]) return callback(err);
      retry(err, count);
    });
  }

  function retry(err: Error, count: number) {
    accept(to, (acceptErr, ok) => {
      // Windows: a file inside a folder another process is replacing can refuse to open (delete-pending) for a moment.
      // That is the same contention, not a verify failure: look again, a bounded number of times.
      if (acceptErr && BUSY_CODES[codeOf(acceptErr)] && count < ATTEMPTS) return void setTimeout(() => retry(err, count + 1), pause(count));
      if (acceptErr) return callback(acceptErr);
      if (ok) return callback(null);
      if (count >= ATTEMPTS || (count > 1 && !CONTENDED_CODES[codeOf(err)])) return callback(err);
      setTimeout(() => {
        remove(to, (removeErr) => {
          if (removeErr && !CONTENDED_CODES[codeOf(removeErr)]) return callback(removeErr);
          if (removeErr) return retry(removeErr, count + 1);
          attempt(count + 1);
        });
      }, pause(count));
    });
  }

  attempt(1);
}
