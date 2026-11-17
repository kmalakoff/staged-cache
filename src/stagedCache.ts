import type { StagedCacheCallback, StagedCacheSteps } from './types.ts';
import worker from './worker.ts';

export default function stagedCache(dest: string, steps: StagedCacheSteps): Promise<string>;
export default function stagedCache(dest: string, steps: StagedCacheSteps, callback: StagedCacheCallback): void;
export default function stagedCache(dest: string, steps: StagedCacheSteps, callback?: StagedCacheCallback): void | Promise<string> {
  if (typeof callback === 'function') return worker(dest, steps, callback);
  return new Promise((resolve, reject) => worker(dest, steps, (err, result) => (err ? reject(err) : resolve(result as string))));
}
