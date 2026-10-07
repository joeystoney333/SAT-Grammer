import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase } from './database.js';
import { createApp } from './app.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const database = openDatabase(process.env.DB_PATH ? resolve(process.env.DB_PATH) : resolve(root, '.data', 'sat-grammar.sqlite'));
const port = Number(process.env.PORT ?? 3001);
const host = process.env.HOST ?? '127.0.0.1';
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer from 1 to 65535.');
const app = createApp({
  database,
  distDir: resolve(root, 'dist'),
  allowedOrigins: (process.env.APP_ORIGIN ?? '').split(',').map((value) => value.trim()).filter(Boolean),
  trustProxy: process.env.TRUST_PROXY === '1' ? 1 : false,
});
const server = app.listen(port, host, () => console.log(`SAT Grammar API listening at http://${host}:${port}`));

let closing = false;
function shutdown() {
  if (closing) return;
  closing = true;
  server.close(() => {
    database.close();
    process.exit(0);
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
