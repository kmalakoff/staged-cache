import crypto from 'crypto';
import fs from 'fs';
import type { VerifyCallback } from './types.ts';

/** A `verify` for a file: true when its sha256 (hex) equals `expected`. A folder in the way is not a match. */
export default function verifySha256(expected: string) {
  return function verify(path: string, callback: VerifyCallback): void {
    let called = false;
    const done = (err: Error | null, valid?: boolean) => {
      if (called) return;
      called = true;
      callback(err, valid);
    };
    // stat first: reading a folder as a file reports EISDIR on most systems but UNKNOWN on Windows with Node 0.8
    fs.stat(path, (err, stats) => {
      if (err) return done(err);
      if (!stats.isFile()) return done(null, false);
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(path);
      stream.on('data', (chunk) => hash.update(chunk));
      stream.on('error', (err) => done(err));
      stream.on('end', () => done(null, hash.digest('hex') === expected.toLowerCase()));
    });
  };
}
