import assert from 'assert';
import spawn from 'cross-spawn-cb';
import fs from 'fs';
import path from 'path';
import { staleStaging } from 'staged-cache';
import { canJudge, fnv1a, ownerTag } from '../../src/lib/staging.ts';
import createScratch from '../lib/scratch.ts';
import { captureStaging, labelOf, stagingName } from '../lib/staging.ts';

const scratch = createScratch('staleStaging');

function snapshot(dir: string): string[] {
  return fs
    .readdirSync(dir)
    .sort()
    .map((name) => `${name}:${fs.statSync(path.join(dir, name)).isDirectory() ? 'dir' : fs.readFileSync(path.join(dir, name), 'utf8')}`);
}

// A process that has started and exited: its pid is gone now.
function exitedPid(callback: (err: Error | null | undefined, pid?: number) => void): void {
  spawn(process.execPath, ['-e', '0'], { encoding: 'utf8' }, (err, res) => callback(err, res && res.pid));
}

describe('staleStaging', () => {
  let tag = '';
  let otherTag = '';
  let gonePid = 0;

  before((done) => {
    scratch.setup();
    const dir = scratch.dir('probe');
    const dest = path.join(dir, 'probe.bin');
    captureStaging(dest, (err, staging) => {
      if (err) return done(err);
      tag = labelOf(staging as string, dest).tag;
      otherTag = tag.charAt(0) === 'a' ? `b${tag.slice(1)}` : `a${tag.slice(1)}`;
      exitedPid((err, pid) => {
        if (err) return done(err);
        gonePid = pid as number;
        done();
      });
    });
  });
  after(scratch.clean);

  it('does not return a staging folder labelled with the current process', (done) => {
    const dir = scratch.dir('own');
    fs.mkdirSync(path.join(dir, stagingName('corpus', tag, process.pid)));
    staleStaging(dir, (err, list) => {
      if (err) return done(err);
      assert.deepEqual(list, []);
      done();
    });
  });

  it('returns a staging folder labelled with a process that has exited', (done) => {
    const dir = scratch.dir('gone');
    const name = stagingName('corpus', tag, gonePid);
    fs.mkdirSync(path.join(dir, name));
    staleStaging(dir, (err, list) => {
      if (err) return done(err);
      assert.deepEqual(list, [path.join(dir, name)]);
      done();
    });
  });

  it('returns files as well as folders, sorted, as full paths', (done) => {
    const dir = scratch.dir('sorted');
    const b = stagingName('b.bin', tag, gonePid, 22);
    const a = stagingName('a.bin', tag, gonePid, 11);
    fs.writeFileSync(path.join(dir, b), 'x');
    fs.mkdirSync(path.join(dir, a));
    staleStaging(dir, (err, list) => {
      if (err) return done(err);
      assert.deepEqual(list, [path.join(dir, a), path.join(dir, b)]);
      done();
    });
  });

  it('does not return a folder labelled with another host, whatever its pid', (done) => {
    const dir = scratch.dir('other-host');
    fs.mkdirSync(path.join(dir, stagingName('corpus', otherTag, gonePid)));
    fs.mkdirSync(path.join(dir, stagingName('corpus', otherTag, process.pid)));
    staleStaging(dir, (err, list) => {
      if (err) return done(err);
      assert.deepEqual(list, []);
      done();
    });
  });

  (process.platform === 'win32' || (process.getuid && process.getuid() === 0) ? it.skip : it)('does not return a folder labelled with a process that exists but is not ours (pid 1)', (done) => {
    const dir = scratch.dir('pid-one');
    fs.mkdirSync(path.join(dir, stagingName('corpus', tag, 1)));
    staleStaging(dir, (err, list) => {
      if (err) return done(err);
      assert.deepEqual(list, []);
      done();
    });
  });

  it('does not return a folder labelled with a pid above 2147483647', (done) => {
    const dir = scratch.dir('huge-pid');
    ['2147483648', '4294967297', '99999999999'].forEach((pid) => fs.mkdirSync(path.join(dir, stagingName('corpus', tag, pid))));
    staleStaging(dir, (err, list) => {
      if (err) return done(err);
      assert.deepEqual(list, []);
      done();
    });
  });

  it('does not return entries outside the staging pattern', (done) => {
    const dir = scratch.dir('ordinary');
    [
      'corpus', // an ordinary entry
      `corpus-${tag}-${gonePid}-1234567`, // not hidden
      '.cache', // another dot name
      '.corpus-1234567', // the 0.1.2 staging name
      `.corpus-${tag}-notapid-1234567`, // non-numeric pid
      `.corpus-${tag}-${gonePid}`, // no suffix
      `.corpus-${tag}-${gonePid}-abc`, // non-numeric suffix
      `.corpus-${tag}-${gonePid}-1234567-extra`, // trailing part
      `.-${tag}-${gonePid}-1234567`, // no name
    ].forEach((name) => fs.mkdirSync(path.join(dir, name)));
    staleStaging(dir, (err, list) => {
      if (err) return done(err);
      assert.deepEqual(list, []);
      done();
    });
  });

  it('round-trips a dest name with dashes and one with a leading dot', (done) => {
    const dir = scratch.dir('names');
    const dashed = path.join(dir, 'project-abc-123-deadbeef');
    const dotted = path.join(dir, '.cache-file');
    captureStaging(dashed, (err, one) => {
      if (err) return done(err);
      captureStaging(dotted, (err, two) => {
        if (err) return done(err);
        // relabel both as a process that has exited, keeping the parsed name part
        const relabelled = [dashed, dotted].map((dest, i) => {
          const label = labelOf(i === 0 ? (one as string) : (two as string), dest);
          return path.join(dir, stagingName(label.base, label.tag, gonePid, label.suffix));
        });
        relabelled.forEach((p) => fs.mkdirSync(p));
        staleStaging(dir, (err, list) => {
          if (err) return done(err);
          assert.deepEqual(list, relabelled.sort());
          done();
        });
      });
    });
  });

  it('removes and changes nothing', (done) => {
    const dir = scratch.dir('readonly');
    fs.mkdirSync(path.join(dir, stagingName('corpus', tag, gonePid)));
    fs.writeFileSync(path.join(dir, stagingName('file.bin', tag, gonePid)), 'partial');
    fs.writeFileSync(path.join(dir, 'corpus'), 'entry');
    const before = snapshot(dir);
    staleStaging(dir, (err, list) => {
      if (err) return done(err);
      assert.equal((list as string[]).length, 2);
      assert.deepEqual(snapshot(dir), before);
      done();
    });
  });

  it('gives an empty list for a missing directory', (done) => {
    staleStaging(path.join(scratch.dir('missing'), 'nope'), (err, list) => {
      if (err) return done(err);
      assert.deepEqual(list, []);
      done();
    });
  });

  it('fails when dir is not a directory', (done) => {
    const dir = scratch.dir('not-a-dir');
    const file = path.join(dir, 'file');
    fs.writeFileSync(file, 'x');
    staleStaging(file, (err) => {
      assert.ok(err);
      done();
    });
  });

  (typeof Promise === 'undefined' ? it.skip : it)('returns a Promise without a callback', (done) => {
    const dir = scratch.dir('promise');
    const name = stagingName('corpus', tag, gonePid);
    fs.mkdirSync(path.join(dir, name));
    staleStaging(dir).then((list) => {
      assert.deepEqual(list, [path.join(dir, name)]);
      staleStaging(path.join(dir, 'nope')).then((empty) => {
        assert.deepEqual(empty, []);
        done();
      }, done);
    }, done);
  });
});

describe('owner tag', () => {
  const parts = { platform: 'linux', hostname: 'box', pidNamespace: 'pid:[4026531836]', machineId: 'abc' };

  it('hashes with FNV-1a to 8 lowercase hex digits (fixed vectors)', () => {
    assert.equal(fnv1a(''), '811c9dc5');
    assert.equal(fnv1a('foobar'), 'bf9cf968');
    assert.equal(fnv1a('a'), 'e40c292c');
  });

  it('is stable for the same parts and 8 hex digits long', () => {
    assert.equal(ownerTag(parts), ownerTag({ ...parts }));
    assert.ok(/^[0-9a-f]{8}$/.test(ownerTag(parts)));
  });

  it('differs when the platform, hostname, PID namespace or machine id differs', () => {
    const tags = [ownerTag(parts), ownerTag({ ...parts, platform: 'win32' }), ownerTag({ ...parts, hostname: 'other' }), ownerTag({ ...parts, pidNamespace: 'pid:[4026532000]' }), ownerTag({ ...parts, machineId: 'def' })];
    tags.forEach((tag, i) => tags.slice(i + 1).forEach((other) => assert.notEqual(tag, other)));
  });

  it('cannot judge a pid on Linux when the PID namespace is unreadable, and can everywhere else', () => {
    assert.equal(canJudge(parts), true);
    assert.equal(canJudge({ ...parts, pidNamespace: '' }), false);
    assert.equal(canJudge({ platform: 'darwin', hostname: 'box', pidNamespace: '', machineId: '' }), true);
    assert.equal(canJudge({ platform: 'win32', hostname: 'box', pidNamespace: '', machineId: '' }), true);
  });
});
