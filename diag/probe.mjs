// Electron main probe: reports (on stderr) what the stdio looks like and echoes stdin to stdout.
import { app } from 'electron';
import fs from 'node:fs';
const say = (m) => fs.writeSync(2, `[probe] ${m}\n`);
say(`platform=${process.platform} stdin.isTTY=${process.stdin?.isTTY} stdout.isTTY=${process.stdout?.isTTY}`);
say(`stdin.constructor=${process.stdin?.constructor?.name} stdout.constructor=${process.stdout?.constructor?.name}`);
for (const fd of [0, 1, 2]) {
  try { say(`fstat(${fd}) isFIFO=${fs.fstatSync(fd).isFIFO()} isFile=${fs.fstatSync(fd).isFile()} isCharDev=${fs.fstatSync(fd).isCharacterDevice()}`); } catch (e) { say(`fstat(${fd}) failed: ${e.message}`); }
}
process.stdin.on('data', (d) => { say(`stdin data ${d.length} bytes`); const ok = process.stdout.write(`echo:${d}`); say(`stdout.write -> ${ok}`); });
process.stdin.on('end', () => { say('stdin end'); app.exit(0); });
process.stdin.on('error', (e) => say(`stdin error ${e.message}`));
process.stdout.on('error', (e) => say(`stdout error ${e.message}`));
setTimeout(() => { say('timeout'); app.exit(2); }, 15000);
