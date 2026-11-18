export type Callback = (err?: Error | null) => void;
export type StaleStagingCallback = (err?: Error | null, paths?: string[]) => void;
export type StagedCacheCallback = (err?: Error | null, path?: string) => void;
export type VerifyCallback = (err?: Error | null, valid?: boolean) => void;

/** Answers whether a complete, valid result is at `path`. A missing path is false: an `ENOENT` or `ENOTDIR` error whose `path` is `path` or inside it counts as false, any other error fails the call. Takes a callback or returns a Promise. */
export type Verify = (path: string, callback: VerifyCallback) => void | Promise<boolean>;

/** Writes the result (a file or a folder) at `staging`. Takes a callback or returns a Promise. */
export type Build = (staging: string, callback: Callback) => void | Promise<void>;

export interface StagedCacheSteps {
  verify: Verify;
  build: Build;
}
