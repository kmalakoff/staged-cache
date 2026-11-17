import { type ChildProcess, spawn } from 'child_process';
import { readFileSync } from 'fs';

// Windows only: a handle opened without FILE_SHARE_DELETE (antivirus, editors). Node's own handles always share delete,
// so this is the one case that needs another program (as fs-remove-compat's test/lib/lock.ts does).
export function holdNoShare(path: string, callback: (holder: ChildProcess) => void): void {
  const script = `$f=[System.IO.File]::Open('${path}','Open','Read','Read'); Write-Output ready; Start-Sleep 60`;
  const holder = spawn('powershell.exe', ['-NoProfile', '-Command', script]);
  holder.stdout.once('data', () => callback(holder));
}

// Polls until the file at `path` can be read (its text) or is gone ('(gone)'): a file Windows marked for deletion
// stays unreadable until its last handle closes.
export function settle(path: string, callback: (state: string) => void, deadline = Date.now() + 10000): void {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return callback('(gone)');
    if (Date.now() > deadline) return callback(`(unreadable: ${(err as NodeJS.ErrnoException).code})`);
    return void setTimeout(() => settle(path, callback, deadline), 50);
  }
  callback(text);
}
