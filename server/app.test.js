import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { openDatabase, emptyProgress } from './database.js';
import { createApp } from './app.js';

async function harness(t, { filename = ':memory:', ...options } = {}) {
  const database = openDatabase(filename);
  const app = createApp({ database, ...options });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    database.close();
  });
  return {
    database,
    origin,
    async request(path, { method = 'GET', body, cookie, headers = {} } = {}) {
      const response = await fetch(`${origin}${path}`, {
        method,
        headers: {
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...(cookie ? { Cookie: cookie } : {}),
          ...headers,
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      return { status: response.status, body: await response.json(), headers: response.headers, cookie: response.headers.get('set-cookie')?.split(';')[0] };
    },
  };
}

const account = (email = 'student@example.com') => ({ name: 'Student', email, password: 'a secure password' });
const attempt = (id, questionId = 'q001') => ({ id, questionId, choice: 2, correct: true, mode: 'practice', answeredAt: '2026-01-01T00:00:00.000Z' });

test('accounts hash passwords, use cookie sessions, authenticate, and revoke logout sessions', async (t) => {
  const api = await harness(t);
  assert.deepEqual((await api.request('/api/auth/me')).body, { user: null });
  assert.equal((await api.request('/api/progress')).status, 401);

  const registered = await api.request('/api/auth/register', { method: 'POST', body: account('  STUDENT@example.com  ') });
  assert.equal(registered.status, 201);
  assert.deepEqual(Object.keys(registered.body.user).sort(), ['email', 'id', 'name']);
  assert.equal(registered.body.user.email, 'student@example.com');
  assert.match(registered.headers.get('set-cookie'), /HttpOnly/);
  assert.match(registered.headers.get('set-cookie'), /SameSite=Lax/);
  const stored = api.database.prepare('SELECT * FROM users').get();
  assert.notEqual(stored.password_hash, account().password);
  assert.equal(stored.password_hash.length, 128);
  const storedSession = api.database.prepare('SELECT * FROM sessions').get();
  assert.notEqual(storedSession.token_hash, registered.cookie.split('=')[1]);
  assert.equal((await api.request('/api/auth/me', { cookie: registered.cookie })).body.user.id, registered.body.user.id);
  assert.deepEqual((await api.request('/api/progress', { cookie: registered.cookie })).body.progress, emptyProgress());

  const duplicate = await api.request('/api/auth/register', { method: 'POST', body: account() });
  assert.equal(duplicate.status, 409);
  const badLogin = await api.request('/api/auth/login', { method: 'POST', body: { email: account().email, password: 'incorrect password' } });
  assert.equal(badLogin.status, 401);
  const login = await api.request('/api/auth/login', { method: 'POST', body: account() });
  assert.equal(login.status, 200);
  assert.equal(login.body.user.id, registered.body.user.id);
  assert.notEqual(login.cookie, registered.cookie);
  assert.equal((await api.request('/api/auth/logout', { method: 'POST', cookie: login.cookie })).status, 200);
  assert.deepEqual((await api.request('/api/auth/me', { cookie: login.cookie })).body, { user: null });
  assert.equal((await api.request('/api/progress', { cookie: login.cookie })).status, 401);
});

test('progress is isolated by account and stale devices merge immutable events without losing history', async (t) => {
  const api = await harness(t);
  const first = await api.request('/api/auth/register', { method: 'POST', body: account('one@example.com') });
  const second = await api.request('/api/auth/register', { method: 'POST', body: account('two@example.com') });
  const run = { id: 'rush-1', score: 16, total: 20, duration: 480, finishedAt: '2026-01-01T00:10:00.000Z' };
  const firstUpload = await api.request('/api/progress', {
    method: 'PUT', cookie: first.cookie,
    body: { progress: { attempts: [attempt('a1')], completedLessons: ['boundaries'], bookmarks: ['q001'], rushRuns: [run] } },
  });
  assert.equal(firstUpload.status, 200);
  const staleUpload = await api.request('/api/progress', {
    method: 'PUT', cookie: first.cookie,
    body: { progress: { attempts: [attempt('a2', 'q002'), { ...attempt('a1'), correct: false }], completedLessons: ['transitions'], bookmarks: ['q002'], rushRuns: [run] } },
  });
  assert.deepEqual(staleUpload.body.progress.attempts.map((entry) => entry.id), ['a1', 'a2']);
  assert.equal(staleUpload.body.progress.attempts[0].correct, true, 'Existing event IDs are immutable');
  assert.deepEqual(staleUpload.body.progress.completedLessons, ['boundaries', 'transitions']);
  assert.deepEqual(staleUpload.body.progress.bookmarks, ['q001', 'q002']);
  assert.equal(staleUpload.body.progress.rushRuns.length, 1, 'Retrying the same run is idempotent');
  const removal = await api.request('/api/progress', { method: 'PUT', cookie: first.cookie, body: { progress: {}, removedBookmarks: ['q001'] } });
  assert.deepEqual(removal.body.progress.bookmarks, ['q002']);
  assert.deepEqual((await api.request('/api/progress', { cookie: second.cookie })).body.progress, emptyProgress());
});

test('stored progress survives closing and reopening the SQLite database', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'sat-grammar-db-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const filename = join(directory, 'store.sqlite');
  let userId;
  await t.test('save an account and progress', async (subtest) => {
    const api = await harness(subtest, { filename });
    const user = await api.request('/api/auth/register', { method: 'POST', body: account() });
    userId = user.body.user.id;
    assert.equal((await api.request('/api/progress', { method: 'PUT', cookie: user.cookie, body: { progress: { attempts: [attempt('persisted')] } } })).status, 200);
  });
  await t.test('reopen and sign in', async (subtest) => {
    const api = await harness(subtest, { filename });
    const login = await api.request('/api/auth/login', { method: 'POST', body: account() });
    assert.equal(login.body.user.id, userId);
    assert.equal((await api.request('/api/progress', { cookie: login.cookie })).body.progress.attempts[0].id, 'persisted');
  });
});

test('explicit bookmark deltas keep stale device snapshots from restoring removed bookmarks', async (t) => {
  const api = await harness(t);
  const user = await api.request('/api/auth/register', { method: 'POST', body: account() });
  const staleSnapshot = { bookmarks: ['q001', 'q002'] };
  await api.request('/api/progress', { method: 'PUT', cookie: user.cookie, body: { progress: staleSnapshot } });
  const removed = await api.request('/api/progress', {
    method: 'PUT', cookie: user.cookie,
    body: { progress: { bookmarks: ['q002'] }, addedBookmarks: [], removedBookmarks: ['q001'] },
  });
  assert.deepEqual(removed.body.progress.bookmarks, ['q002']);
  const staleUpload = await api.request('/api/progress', {
    method: 'PUT', cookie: user.cookie,
    body: { progress: staleSnapshot, addedBookmarks: [], removedBookmarks: [] },
  });
  assert.deepEqual(staleUpload.body.progress.bookmarks, ['q002']);
  const intentionalAddition = await api.request('/api/progress', {
    method: 'PUT', cookie: user.cookie,
    body: { progress: {}, addedBookmarks: ['q001'], removedBookmarks: [] },
  });
  assert.deepEqual(intentionalAddition.body.progress.bookmarks, ['q002', 'q001']);
});

test('an expected account header prevents a stale browser tab from uploading into a different account', async (t) => {
  const api = await harness(t);
  const first = await api.request('/api/auth/register', { method: 'POST', body: account('first@example.com') });
  const second = await api.request('/api/auth/register', { method: 'POST', body: account('second@example.com') });
  const staleHeaders = { 'X-Account-ID': first.body.user.id };
  const rejected = await api.request('/api/progress', {
    method: 'PUT', cookie: second.cookie, headers: staleHeaders,
    body: { progress: { attempts: [attempt('belongs-to-first')] } },
  });
  assert.equal(rejected.status, 409);
  assert.equal(rejected.body.error, 'Account changed in another tab. Please reload before syncing.');
  assert.equal((await api.request('/api/progress', { cookie: second.cookie, headers: staleHeaders })).status, 409);
  const correctAccount = await api.request('/api/progress', {
    cookie: second.cookie, headers: { 'X-Account-ID': second.body.user.id },
  });
  assert.equal(correctAccount.status, 200);
  assert.deepEqual(correctAccount.body.progress, emptyProgress());
});

test('invalid progress, cross-origin writes, and wrong content types are rejected without altering data', async (t) => {
  const api = await harness(t);
  const user = await api.request('/api/auth/register', { method: 'POST', body: account() });
  const invalid = await api.request('/api/progress', { method: 'PUT', cookie: user.cookie, body: { progress: { attempts: [{ ...attempt('a1'), choice: 9 }] } } });
  assert.equal(invalid.status, 400);
  assert.deepEqual((await api.request('/api/progress', { cookie: user.cookie })).body.progress, emptyProgress());
  const csrf = await api.request('/api/progress', { method: 'PUT', cookie: user.cookie, body: { progress: {} }, headers: { Origin: 'https://unrelated.example' } });
  assert.equal(csrf.status, 403);
  const sameOrigin = await api.request('/api/progress', { method: 'PUT', cookie: user.cookie, body: { progress: {} }, headers: { Origin: api.origin } });
  assert.equal(sameOrigin.status, 200);
  const wrongType = await api.request('/api/auth/login', { method: 'POST', body: account(), headers: { 'Content-Type': 'text/plain' } });
  assert.equal(wrongType.status, 415);
  const malformed = await fetch(`${api.origin}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{bad json' });
  assert.equal(malformed.status, 400);
  assert.deepEqual(await malformed.json(), { error: 'The request contains invalid JSON.' });
  const unknown = await api.request('/api/not-a-route');
  assert.equal(unknown.status, 404);
  assert.equal((await api.request('/api/health')).body.status, 'ok');
});

test('repeated authentication attempts are limited', async (t) => {
  const api = await harness(t);
  for (let index = 0; index < 8; index += 1) {
    const result = await api.request('/api/auth/login', { method: 'POST', body: { email: 'missing@example.com', password: 'wrongpassword' } });
    assert.equal(result.status, 401);
  }
  const limited = await api.request('/api/auth/login', { method: 'POST', body: { email: 'missing@example.com', password: 'wrongpassword' } });
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers.get('retry-after')) > 0);
});

test('explicit HTTPS proxy configuration produces Secure session cookies', async (t) => {
  const api = await harness(t, { trustProxy: 1, allowedOrigins: ['https://grammar.example'] });
  const registered = await api.request('/api/auth/register', {
    method: 'POST', body: account(),
    headers: { 'X-Forwarded-Proto': 'https', Origin: 'https://grammar.example' },
  });
  assert.equal(registered.status, 201);
  assert.match(registered.headers.get('set-cookie'), /; Secure/);
});
