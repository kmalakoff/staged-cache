import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { renameInto } from 'staged-cache';
import { CONTENT } from '../lib/fixtures.cjs';
import { holdNoShare } from '../lib/handles.ts';
import createScratch, { leftovers } from '../lib/scratch.ts';

const scratch = createScratch('renameInto');

describe('renameInto', () => {
  before(scratch.setup);
  after(scratch.clean);

  it('moves a file into place', (done) => {
    const base = scratch.dir('move');
    const from = path.join(base, 'incoming');
    const to = path.join(base, 'artifact.bin');
    fs.writeFileSync(from, CONTENT);
    renameInto(from, to, (err) => {
      if (err) return done(err);
      assert.equal(fs.readFileSync(to, 'utf8'), CONTENT);
      assert.equal(fs.existsSync(from), false);
      done();
    });
  });

  it('replaces an existing file', (done) => {
    const base = scratch.dir('replace');
    const from = path.join(base, 'incoming');
    const to = path.join(base, 'artifact.bin');
    fs.writeFileSync(to, 'old');
    fs.writeFileSync(from, CONTENT);
    renameInto(from, to, (err) => {
      if (err) return done(err);
      assert.equal(fs.readFileSync(to, 'utf8'), CONTENT);
      assert.deepEqual(leftovers(to), []);
      done();
    });
  });

  it('fails and removes the source when the destination folder is missing', (done) => {
    const base = scratch.dir('missing');
    const from = path.join(base, 'incoming');
    fs.writeFileSync(from, CONTENT);
    renameInto(from, path.join(base, 'nope', 'artifact.bin'), (err) => {
      assert.ok(err);
      assert.equal(fs.existsSync(from), false);
      done();
    });
  });

  it('never removes a folder at the destination', (done) => {
    const base = scratch.dir('folder-dest');
    const from = path.join(base, 'incoming');
    const to = path.join(base, 'artifact.bin');
    fs.writeFileSync(from, CONTENT);
    fs.mkdirSync(to);
    fs.writeFileSync(path.join(to, 'precious'), 'keep');
    renameInto(from, to, (err) => {
      assert.ok(err);
      assert.equal(fs.readFileSync(path.join(to, 'precious'), 'utf8'), 'keep');
      assert.equal(fs.existsSync(from), false);
      done();
    });
  });

  it('a refused rename with no file at the destination is an error (a folder moved onto a non-empty folder)', (done) => {
    const base = scratch.dir('folder-onto-folder');
    const from = path.join(base, 'incoming');
    const to = path.join(base, 'existing');
    fs.mkdirSync(from);
    fs.mkdirSync(to);
    fs.writeFileSync(path.join(to, 'precious'), 'keep');
    renameInto(from, to, (err) => {
      assert.ok(err);
      // the rename's own error, not a later one from removing the source folder
      if (process.platform !== 'win32') assert.ok((err as NodeJS.ErrnoException).code === 'ENOTEMPTY' || (err as NodeJS.ErrnoException).code === 'EEXIST', String(err));
      assert.equal(fs.readFileSync(path.join(to, 'precious'), 'utf8'), 'keep');
      done();
    });
  });

  (process.platform === 'win32' || (process.getuid && process.getuid() === 0) ? it.skip : it)('posix: reports a permission error and keeps the old file', (done) => {
    const base = scratch.dir('read-only');
    const locked = path.join(base, 'locked');
    const to = path.join(locked, 'artifact.bin');
    const from = path.join(base, 'incoming');
    fs.mkdirSync(locked);
    fs.writeFileSync(to, 'OLD');
    fs.writeFileSync(from, CONTENT);
    fs.chmodSync(locked, 0o555);
    renameInto(from, to, (err) => {
      fs.chmodSync(locked, 0o755);
      try {
        assert.ok(err);
        assert.equal((err as NodeJS.ErrnoException).code, 'EACCES');
        assert.equal(fs.readFileSync(to, 'utf8'), 'OLD');
        assert.equal(fs.existsSync(from), false);
        done();
      } catch (e) {
        done(e as Error);
      }
    });
  });

  (typeof Promise === 'undefined' ? it.skip : it)('returns a Promise without a callback', (done) => {
    const base = scratch.dir('promise');
    const from = path.join(base, 'incoming');
    const to = path.join(base, 'artifact.bin');
    fs.writeFileSync(from, CONTENT);
    renameInto(from, to).then(() => {
      assert.equal(fs.readFileSync(to, 'utf8'), CONTENT);
      done();
    }, done);
  });

  it('onto a file held open succeeds', (done) => {
    const base = scratch.dir('held');
    const to = path.join(base, 'artifact.bin');
    const from = path.join(base, 'incoming');
    fs.writeFileSync(to, CONTENT);
    fs.writeFileSync(from, CONTENT);
    // an open handle has the same effect whichever process holds it: a plain rename succeeds on POSIX and gives
    // EPERM on Windows; renameInto succeeds on both
    const fd = fs.openSync(to, 'r');
    renameInto(from, to, (err) => {
      fs.closeSync(fd);
      if (err) return done(err);
      assert.equal(fs.readFileSync(to, 'utf8'), CONTENT);
      assert.equal(fs.existsSync(from), false);
      done();
    });
  });

  (process.platform === 'win32' ? it : it.skip)('win32: onto a valid file held without delete sharing succeeds as a lost race', (done) => {
    const base = scratch.dir('noshare');
    const to = path.join(base, 'artifact.bin');
    const from = path.join(base, 'incoming');
    fs.writeFileSync(to, CONTENT);
    fs.writeFileSync(from, CONTENT);
    holdNoShare(to, (holder) => {
      renameInto(from, to, (err) => {
        holder.kill();
        if (err) return done(err);
        assert.equal(fs.readFileSync(to, 'utf8'), CONTENT);
        assert.equal(fs.existsSync(from), false);
        done();
      });
    });
  });
});
