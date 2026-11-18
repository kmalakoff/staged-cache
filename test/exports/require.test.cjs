const assert = require('assert');
const { renameInto, stagedCache, staleStaging, verifySha256 } = require('staged-cache');

describe('exports .cjs', () => {
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
    assert.equal(require('staged-cache').default, undefined);
  });
});
