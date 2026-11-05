import { spawn } from 'node:child_process';
const [, , cmd, ...args] = process.argv;
const c = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'] });
let out = '', err = '';
c.stdout.on('data', (d) => (out += d));
c.stderr.on('data', (d) => (err += d));
setTimeout(() => c.stdin.write('ping\n'), 3000);
setTimeout(() => c.stdin.end(), 6000);
c.on('close', (code) => { console.log(`--- exit ${code}\nSTDOUT: ${JSON.stringify(out)}\nSTDERR:\n${err.split('\n').filter((l) => l.includes('[probe]')).join('\n')}`); });
