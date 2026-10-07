import { spawn } from 'node:child_process';
const processes = [spawn(process.execPath, ['server/index.js'], { stdio: 'inherit' }), spawn(process.execPath, ['node_modules/vite/bin/vite.js'], { stdio: 'inherit' })];
let stopping = false;
function stop(code = 0) { if (stopping) return; stopping = true; processes.forEach(p => p.kill('SIGTERM')); setTimeout(() => process.exit(code), 200).unref(); }
processes.forEach(p => p.on('exit', code => stop(code ?? 1)));
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
