// A step is a function that takes (arg, callback) or returns a Promise; either way the outcome reaches `callback` once.
export default function step<T>(fn: (arg: string, callback: (err?: Error | null, value?: T) => void) => unknown, arg: string, callback: (err?: Error | null, value?: T) => void): void {
  let called = false;
  const once = (err?: Error | null, value?: T) => {
    if (called) return;
    called = true;
    callback(err, value);
  };
  let result: unknown;
  try {
    result = fn(arg, once);
  } catch (err) {
    // a step that called back synchronously runs the rest of the chain inside this try: that throw is the caller's, not the step's
    if (called) throw err;
    return once(err as Error);
  }
  const promise = result as { then?: (ok: (value: T) => void, fail: (err?: Error) => void) => void } | undefined;
  if (promise && typeof promise.then === 'function') {
    promise.then(
      (value) => once(null, value),
      (err) => once(err || new Error('rejected'))
    );
  }
}
