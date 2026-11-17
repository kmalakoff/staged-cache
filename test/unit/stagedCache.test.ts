import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { stagedCache, verifySha256 } from 'staged-cache';
import { CONTENT, FOLDER_FILES, fileSteps, folderSteps, sha } from '../lib/fixtures.cjs';
import { holdNoShare, settle } from '../lib/handles.ts';
import createScratch, { leftovers, readFolder } from '../lib/scratch.ts';

const scratch = createScratch('stagedCache');

function fsError(message: string, code: string, errPath: string): Error {
  const err = new Error(message) as NodeJS.ErrnoException;
  err.code = code;
  err.path = errPath;
  return err;
}

describe('stagedCache', () => {
  before(scratch.setup);
  after(scratch.clean);

  it('file miss builds once, then a hit does not build', (done) => {
    const dest = path.join(scratch.dir('file-miss'), 'a', 'artifact.bin');
    const counter = { builds: 0 };
    stagedCache(dest, fileSteps(counter), (err, result) => {
      if (err) return done(err);
      assert.equal(result, dest);
      assert.equal(fs.readFileSync(dest, 'utf8'), CONTENT);
      stagedCache(dest, fileSteps(counter), (err) => {
        if (err) return done(err);
        assert.equal(counter.builds, 1);
        assert.deepEqual(leftovers(dest), []);
        done();
      });
    });
  });

  it('folder miss builds once, then a hit does not build', (done) => {
    const dest = path.join(scratch.dir('folder-miss'), 'corpus');
    const counter = { builds: 0 };
    stagedCache(dest, folderSteps(counter), (err) => {
      if (err) return done(err);
      assert.deepEqual(readFolder(dest), FOLDER_FILES);
      stagedCache(dest, folderSteps(counter), (err) => {
        if (err) return done(err);
        assert.equal(counter.builds, 1);
        assert.deepEqual(leftovers(dest), []);
        done();
      });
    });
  });

  it('rebuilds an invalid file', (done) => {
    const dest = path.join(scratch.dir('file-invalid'), 'artifact.bin');
    fs.writeFileSync(dest, 'truncated');
    const counter = { builds: 0 };
    stagedCache(dest, fileSteps(counter), (err) => {
      if (err) return done(err);
      assert.equal(counter.builds, 1);
      assert.equal(fs.readFileSync(dest, 'utf8'), CONTENT);
      assert.deepEqual(leftovers(dest), []);
      done();
    });
  });

  it('rebuilds an invalid folder', (done) => {
    const dest = path.join(scratch.dir('folder-invalid'), 'corpus');
    fs.mkdirSync(dest);
    fs.writeFileSync(path.join(dest, 'a.txt'), 'stale\n');
    fs.writeFileSync(path.join(dest, 'leftover.txt'), 'x');
    stagedCache(dest, folderSteps({ builds: 0 }), (err) => {
      if (err) return done(err);
      assert.deepEqual(readFolder(dest), FOLDER_FILES);
      assert.deepEqual(leftovers(dest), []);
      done();
    });
  });

  it('replaces a folder sitting where a file belongs', (done) => {
    const dest = path.join(scratch.dir('folder-in-way'), 'artifact.bin');
    fs.mkdirSync(dest);
    fs.writeFileSync(path.join(dest, 'x'), 'x');
    stagedCache(dest, fileSteps({ builds: 0 }), (err) => {
      if (err) return done(err);
      assert.equal(fs.readFileSync(dest, 'utf8'), CONTENT);
      assert.deepEqual(leftovers(dest), []);
      done();
    });
  });

  it('replaces a file sitting where a folder belongs', (done) => {
    const dest = path.join(scratch.dir('file-in-way'), 'corpus');
    fs.writeFileSync(dest, 'x');
    stagedCache(dest, folderSteps({ builds: 0 }), (err) => {
      if (err) return done(err);
      assert.deepEqual(readFolder(dest), FOLDER_FILES);
      assert.deepEqual(leftovers(dest), []);
      done();
    });
  });

  it('a failed build leaves nothing, for a file and a folder', (done) => {
    const base = scratch.dir('build-fails');
    const file = fileSteps({ builds: 0 });
    file.build = (staging, cb) => {
      fs.writeFileSync(staging, 'part');
      cb(new Error('network cut'));
    };
    const folder = folderSteps({ builds: 0 });
    folder.build = (staging, cb) => {
      fs.mkdirSync(staging);
      fs.writeFileSync(path.join(staging, 'a.txt'), 'x');
      cb(new Error('clone failed'));
    };
    stagedCache(path.join(base, 'artifact.bin'), file, (err) => {
      assert.equal(err && err.message, 'network cut');
      stagedCache(path.join(base, 'corpus'), folder, (err) => {
        assert.equal(err && err.message, 'clone failed');
        assert.deepEqual(fs.readdirSync(base), []);
        done();
      });
    });
  });

  it('a build that throws leaves nothing', (done) => {
    const base = scratch.dir('build-throws');
    const steps = fileSteps({ builds: 0 });
    steps.build = () => {
      throw new Error('boom');
    };
    stagedCache(path.join(base, 'artifact.bin'), steps, (err) => {
      assert.equal(err && err.message, 'boom');
      assert.deepEqual(fs.readdirSync(base), []);
      done();
    });
  });

  it('a build whose result does not verify fails and leaves nothing', (done) => {
    const base = scratch.dir('build-unverifiable');
    const dest = path.join(base, 'artifact.bin');
    const steps = { verify: verifySha256(sha(CONTENT)), build: (staging: string, cb: (err?: Error | null) => void) => fs.writeFile(staging, '<html>404</html>', cb) };
    stagedCache(dest, steps, (err) => {
      assert.ok(err && /does not verify/.test(err.message));
      assert.deepEqual(fs.readdirSync(base), []);
      done();
    });
  });

  it('a verify error other than a missing path is reported', (done) => {
    const base = scratch.dir('verify-fails');
    const steps = fileSteps({ builds: 0 });
    steps.verify = (_p, cb) => cb(new Error('cannot verify'));
    stagedCache(path.join(base, 'artifact.bin'), steps, (err) => {
      assert.equal(err && err.message, 'cannot verify');
      assert.deepEqual(fs.readdirSync(base), []);
      done();
    });
  });

  (typeof Promise === 'undefined' ? it.skip : it)('returns a Promise without a callback and accepts Promise steps', (done) => {
    const dest = path.join(scratch.dir('promise'), 'artifact.bin');
    const steps = {
      verify: (p: string) =>
        new Promise<boolean>((resolve, reject) => {
          verifySha256(sha(CONTENT))(p, (err, valid) => (err ? reject(err) : resolve(!!valid)));
        }),
      build: (staging: string) =>
        new Promise<void>((resolve, reject) => {
          fs.writeFile(staging, CONTENT, (err) => (err ? reject(err) : resolve()));
        }),
    };
    stagedCache(dest, steps).then((result) => {
      assert.equal(result, dest);
      assert.equal(fs.readFileSync(dest, 'utf8'), CONTENT);
      done();
    }, done);
  });

  (typeof Promise === 'undefined' ? it.skip : it)('the Promise form rejects when the build fails', (done) => {
    const steps = fileSteps({ builds: 0 });
    steps.build = (_s, cb) => cb(new Error('network cut'));
    stagedCache(path.join(scratch.dir('promise-fail'), 'artifact.bin'), steps).then(
      () => done(new Error('expected a rejection')),
      (err) => {
        assert.equal(err.message, 'network cut');
        done();
      }
    );
  });

  // Four concurrent calls in this process race the same way four processes do: each call has its own staging name
  // (temp-suffix) and the file operations interleave. `stale` puts an invalid result at dest before every round.
  function race(kind: 'file' | 'folder', stale: boolean, done: (err?: Error) => void) {
    const dest = path.join(scratch.dir(`race-${kind}${stale ? '-stale' : ''}`), kind === 'folder' ? 'corpus' : 'artifact.bin');
    const counter = { builds: 0 };
    const ROUNDS = 20;
    let round = 0;
    (function next() {
      if (round++ >= ROUNDS) {
        // more builds than rounds: callers really did build at the same time
        return done(counter.builds > ROUNDS ? undefined : new Error(`no race happened: ${counter.builds} builds in ${ROUNDS} rounds`));
      }
      scratch.reset(dest);
      if (stale && kind === 'folder') {
        fs.mkdirSync(dest);
        fs.writeFileSync(path.join(dest, 'a.txt'), 'stale\n');
        fs.writeFileSync(path.join(dest, 'stale.txt'), 'x');
      } else if (stale) fs.writeFileSync(dest, 'truncated');
      const errors: string[] = [];
      let pending = 4;
      for (let i = 0; i < 4; i++) {
        stagedCache(dest, kind === 'folder' ? folderSteps(counter, 20) : fileSteps(counter, 20), (err) => {
          if (err) errors.push(`${(err as NodeJS.ErrnoException).code || ''} ${err.message}`);
          if (--pending) return;
          try {
            assert.deepEqual(errors, [], `round ${round}`);
            if (kind === 'folder') assert.deepEqual(readFolder(dest), FOLDER_FILES);
            else assert.equal(fs.readFileSync(dest, 'utf8'), CONTENT);
            assert.deepEqual(leftovers(dest), []);
          } catch (e) {
            return done(e as Error);
          }
          next();
        });
      }
    })();
  }
  it("an error thrown by the caller's callback is not swallowed (synchronous verify)", () => {
    const dest = path.join(scratch.dir('callback-throws'), 'artifact.bin');
    fs.writeFileSync(dest, CONTENT);
    const steps = {
      verify: (_p: string, cb: (err?: Error | null, valid?: boolean) => void) => cb(null, true),
      build: (_s: string, cb: (err?: Error | null) => void) => cb(),
    };
    assert.throws(
      () =>
        stagedCache(dest, steps, () => {
          throw new Error('from the callback');
        }),
      /from the callback/
    );
  });

  it('keeps a valid result another process put in place while building (folder), and removes staging', (done) => {
    const dest = path.join(scratch.dir('winner'), 'corpus');
    const steps = folderSteps({ builds: 0 });
    const build = steps.build;
    steps.build = (staging, cb) =>
      build(staging, (err) => {
        // another process finishes first: a valid folder, with a mark only it carries
        fs.mkdirSync(dest);
        Object.keys(FOLDER_FILES).forEach((name) => fs.writeFileSync(path.join(dest, name), FOLDER_FILES[name]));
        fs.writeFileSync(path.join(dest, 'winner.txt'), 'x');
        cb(err);
      });
    stagedCache(dest, steps, (err) => {
      if (err) return done(err);
      assert.equal(fs.existsSync(path.join(dest, 'winner.txt')), true);
      assert.deepEqual(leftovers(dest), []);
      done();
    });
  });

  it('keeps a valid file another process put in place while building', (done) => {
    const dest = path.join(scratch.dir('winner-file'), 'artifact.bin');
    const steps = fileSteps({ builds: 0 });
    const build = steps.build;
    steps.build = (staging, cb) =>
      build(staging, (err) => {
        fs.writeFileSync(dest, CONTENT);
        cb(err);
      });
    stagedCache(dest, steps, (err) => {
      if (err) return done(err);
      assert.equal(fs.readFileSync(dest, 'utf8'), CONTENT);
      assert.deepEqual(leftovers(dest), []);
      done();
    });
  });

  it('a verify error about another path (a missing program) is reported, not read as invalid', (done) => {
    const base = scratch.dir('verify-enoent');
    const steps = fileSteps({ builds: 0 });
    steps.verify = (_p, cb) => cb(fsError('spawn git ENOENT', 'ENOENT', 'git'));
    stagedCache(path.join(base, 'artifact.bin'), steps, (err) => {
      assert.equal(err && err.message, 'spawn git ENOENT');
      assert.deepEqual(fs.readdirSync(base), []);
      done();
    });
  });

  it('a verify error about the checked path counts as not valid', (done) => {
    const dest = path.join(scratch.dir('verify-own-path'), 'artifact.bin');
    const steps = fileSteps({ builds: 0 });
    const verify = steps.verify;
    steps.verify = (p, cb) => (p === dest ? cb(fsError('gone', 'ENOENT', p)) : verify(p, cb));
    stagedCache(dest, steps, (err) => {
      if (err) return done(err);
      assert.equal(fs.readFileSync(dest, 'utf8'), CONTENT);
      done();
    });
  });

  (process.platform === 'win32' || (process.getuid && process.getuid() === 0) ? it.skip : it)('posix: a staging folder that cannot be removed is reported when the build succeeded', (done) => {
    const dest = path.join(scratch.dir('staging-stuck'), 'corpus');
    const steps = folderSteps({ builds: 0 });
    const build = steps.build;
    let stuck = '';
    steps.build = (staging, cb) =>
      build(staging, (err) => {
        stuck = staging;
        fs.mkdirSync(dest); // another process wins, so staging stays behind
        Object.keys(FOLDER_FILES).forEach((name) => fs.writeFileSync(path.join(dest, name), FOLDER_FILES[name]));
        fs.chmodSync(staging, 0o555); // its files cannot be unlinked
        cb(err);
      });
    stagedCache(dest, steps, (err) => {
      fs.chmodSync(stuck, 0o755);
      try {
        assert.ok(err);
        assert.equal((err as NodeJS.ErrnoException).code, 'EACCES');
        done();
      } catch (e) {
        done(e as Error);
      }
    });
  });

  it('4 concurrent calls on one file: all succeed, one valid file, no leftovers', (done) => race('file', false, done));
  it('4 concurrent calls on one folder: all succeed, one valid folder, no leftovers', (done) => race('folder', false, done));
  it('4 concurrent calls replacing the same invalid file: all succeed, one valid file, no leftovers', (done) => race('file', true, done));
  it('4 concurrent calls replacing the same invalid folder: all succeed, one valid folder, no leftovers', (done) => race('folder', true, done));

  it('over an invalid file held open: replaced, or fails leaving the file untouched', (done) => {
    const dest = path.join(scratch.dir('held-invalid'), 'artifact.bin');
    fs.writeFileSync(dest, 'truncated');
    // an open handle has the same effect on a rename or a remove whichever process holds it
    const fd = fs.openSync(dest, 'r');
    stagedCache(dest, fileSteps({ builds: 0 }), (err) => {
      fs.closeSync(fd);
      // Windows may leave a failed-over file delete-pending: it is gone once the handle closes
      settle(dest, (left) => {
        try {
          if (err) assert.ok(left === 'truncated' || left === '(gone)', left);
          else assert.equal(left, CONTENT);
          assert.deepEqual(leftovers(dest), []);
          done();
        } catch (e) {
          done(e as Error);
        }
      });
    });
  });

  (process.platform === 'win32' ? it : it.skip)('win32: over an invalid file held without delete sharing fails and leaves it untouched', (done) => {
    const dest = path.join(scratch.dir('noshare-invalid'), 'artifact.bin');
    fs.writeFileSync(dest, 'truncated');
    holdNoShare(dest, (holder) => {
      stagedCache(dest, fileSteps({ builds: 0 }), (err) => {
        holder.on('exit', () => {
          settle(dest, (left) => {
            try {
              assert.ok(err);
              assert.ok(left === 'truncated' || left === '(gone)', left);
              assert.deepEqual(leftovers(dest), []);
              done();
            } catch (e) {
              done(e as Error);
            }
          });
        });
        holder.kill();
      });
    });
  });
});
