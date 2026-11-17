import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { verifySha256 } from 'staged-cache';
import { CONTENT, sha } from '../lib/fixtures.cjs';
import createScratch from '../lib/scratch.ts';

const scratch = createScratch('verifySha256');

describe('verifySha256', () => {
  before(scratch.setup);
  after(scratch.clean);

  it('is true for a matching file, in either letter case', (done) => {
    const file = path.join(scratch.dir('match'), 'a.bin');
    fs.writeFileSync(file, CONTENT);
    verifySha256(sha(CONTENT))(file, (err, valid) => {
      if (err) return done(err);
      assert.equal(valid, true);
      verifySha256(sha(CONTENT).toUpperCase())(file, (err, valid) => {
        if (err) return done(err);
        assert.equal(valid, true);
        done();
      });
    });
  });

  it('is false for a different file', (done) => {
    const file = path.join(scratch.dir('differs'), 'a.bin');
    fs.writeFileSync(file, 'other');
    verifySha256(sha(CONTENT))(file, (err, valid) => {
      if (err) return done(err);
      assert.equal(valid, false);
      done();
    });
  });

  it('is false for a folder', (done) => {
    verifySha256(sha(CONTENT))(scratch.dir('folder'), (err, valid) => {
      if (err) return done(err);
      assert.equal(valid, false);
      done();
    });
  });

  it('reports a missing file as ENOENT', (done) => {
    verifySha256(sha(CONTENT))(path.join(scratch.dir('missing'), 'nope'), (err) => {
      assert.equal(err && (err as NodeJS.ErrnoException).code, 'ENOENT');
      done();
    });
  });
});
