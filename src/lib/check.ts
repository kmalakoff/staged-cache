import { sep } from 'path';
import type { Verify } from '../types.ts';
import step from './step.ts';

// A missing path is invalid, not an error, but only when the error is about the checked path (or something inside it):
// the same code from elsewhere, such as a program that is not installed, is a real failure.
function isAboutPath(err: NodeJS.ErrnoException, path: string): boolean {
  return typeof err.path === 'string' && (err.path === path || err.path.indexOf(path + sep) === 0);
}

export default function check(verify: Verify, path: string, callback: (err: Error | null | undefined, valid?: boolean) => void): void {
  step<boolean>(verify, path, (err, valid) => {
    const code = err && (err as NodeJS.ErrnoException).code;
    if ((code === 'ENOENT' || code === 'ENOTDIR') && isAboutPath(err as NodeJS.ErrnoException, path)) return callback(null, false);
    callback(err || null, !!valid);
  });
}
