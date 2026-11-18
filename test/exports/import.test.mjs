import assert from 'assert';
import * as stagedCacheModule from 'staged-cache';
import { renameInto, stagedCache, staleStaging, verifySha256 } from 'staged-cache';

describe('exports .mjs', () => {
  it('stagedCache', () => {
    assert.equal(typeof stagedCache, 'function');
  });
  it('renameInto', () => {
    assert.equal(typeof renameInto, 'function');
  });
  it('staleStaging', () => {
    assert.equal(typeof staleStaging, 'function');
  });
  it('verifySha256', () => {
    assert.equal(typeof verifySha256, 'function');
  });
  it('has no default export', () => {
    assert.equal(stagedCacheModule.default, undefined);
  });
});
