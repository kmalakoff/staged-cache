import fs from 'fs';
import os from 'os';
import path from 'path';
import tempSuffix from 'temp-suffix';

// A staging name is `.<basename of dest>-<host>-<pid>-<suffix>`: <host> is lowercase hex, <pid> and <suffix> are digits.
// The pattern is read from the right, so a basename with dashes (or a leading dot) still parses.
const STAGING = /^\.(.+)-([0-9a-f]{8})-(\d+)-(\d+)$/;

export interface OwnerParts {
  platform: string;
  hostname: string;
  pidNamespace: string;
  machineId: string;
}

// FNV-1a over UTF-16 code units, 8 lowercase hex digits; the same on every Node version and platform (no crypto, so FIPS mode cannot refuse it).
export function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = (hash + (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24)) >>> 0;
  }
  return `00000000${hash.toString(16)}`.slice(-8);
}

// The tag names the process-id space a pid belongs to. Boot id and uptime are left out so leftovers from before a reboot stay listable.
export function ownerTag(parts: OwnerParts): string {
  return fnv1a([parts.platform, parts.hostname, parts.pidNamespace, parts.machineId].join('\n'));
}

function tryRead(read: () => string): string {
  try {
    return read();
  } catch (_err) {
    return ''; // unreadable on this system: contributes nothing to the tag
  }
}

function readParts(): OwnerParts {
  const linux = process.platform === 'linux';
  return {
    platform: process.platform,
    hostname: tryRead(() => os.hostname()),
    pidNamespace: linux ? tryRead(() => fs.readlinkSync('/proc/self/ns/pid')) : '',
    machineId: linux ? tryRead(() => fs.readFileSync('/etc/machine-id', 'utf8').trim()) : '',
  };
}

// On Linux a pid can only be judged when the PID namespace is known. Where it cannot be read (a sandbox without /proc/self/ns),
// two systems would share a tag, so no name is ever attributed to a process there: staleStaging lists nothing.
export function canJudge(parts: OwnerParts): boolean {
  return !(parts.platform === 'linux' && parts.pidNamespace === '');
}

// Computed on first use, never at module load.
let cached: { tag: string; judge: boolean } | undefined;
function owner(): { tag: string; judge: boolean } {
  if (cached === undefined) {
    const parts = readParts();
    cached = { tag: ownerTag(parts), judge: canJudge(parts) };
  }
  return cached;
}
function hostTag(): string {
  return owner().tag;
}

// Node 0.8 wraps a pid above this, so such a value is never trusted.
const MAX_PID = 2147483647;

export function stagingPath(dest: string): string {
  return tempSuffix(path.join(path.dirname(dest), `.${path.basename(dest)}-${hostTag()}-${process.pid}`));
}

// The pid of the process that made `name`, or null when `name` is not a staging name made on this machine.
export function ownerPid(name: string): number | null {
  const match = STAGING.exec(name);
  if (!match || !owner().judge || match[2] !== hostTag()) return null;
  const pid = Number(match[3]);
  return pid > MAX_PID ? null : pid;
}
