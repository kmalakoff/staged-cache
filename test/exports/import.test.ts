import assert from 'assert';
import * as stagedCacheModule from 'staged-cache';
import { renameInto, stagedCache, verifySha256 } from 'staged-cache';

describe('exports .ts', () => {
  it('stagedCache', () => {
    assert.equal(typeof stagedCache, 'function');
  });
  it('renameInto', () => {
    assert.equal(typeof renameInto, 'function');
  });
  it('verifySha256', () => {
    assert.equal(typeof verifySha256, 'function');
  });
  it('has no default export', () => {
    assert.equal((stagedCacheModule as Record<string, unknown>).default, undefined);
  });
});
