import mkdirp from 'mkdirp-classic';
import path from 'path';
import tempSuffix from 'temp-suffix';
import check from './lib/check.ts';
import moveInto, { remove } from './lib/moveInto.ts';
import step from './lib/step.ts';
import type { StagedCacheCallback, StagedCacheSteps } from './types.ts';

export default function worker(dest: string, steps: StagedCacheSteps, callback: StagedCacheCallback): void {
  const accept = (p: string, cb: (err: Error | null | undefined, ok?: boolean) => void) => check(steps.verify, p, cb);

  accept(dest, (err, valid) => {
    if (err) return callback(err);
    if (valid) return callback(null, dest);

    mkdirp(path.dirname(dest), (err) => {
      if (err && (err as NodeJS.ErrnoException).code !== 'EEXIST') return callback(err);

      // same folder, same disk: the final rename never crosses a device
      const staging = tempSuffix(dest);
      // the build's own error comes first; a staging folder that cannot be removed is reported when the build succeeded
      const finish = (err?: Error | null) => remove(staging, (removeErr) => (err ? callback(err) : removeErr ? callback(removeErr) : callback(null, dest)));

      step<void>(steps.build, staging, (err) => {
        if (err) return finish(err);
        accept(staging, (err, ok) => {
          if (err) return finish(err);
          if (!ok) return finish(new Error(`build produced a result that does not verify: ${dest}`));
          moveInto(staging, dest, accept, finish);
        });
      });
    });
  });
}
