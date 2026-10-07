import express from 'express';
import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { credentials, progressPayload, RequestError } from './validation.js';
import { mergeProgress, readProgress } from './database.js';

const deriveKey = promisify(scrypt);
const SESSION_COOKIE = 'sat_session';
const SESSION_SECONDS = 60 * 60 * 24 * 30;
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const publicUser = (user) => ({ id: user.id, email: user.email, name: user.name });

async function passwordHash(password, salt) {
  return Buffer.from(await deriveKey(password, salt, 64, { N: 16384, r: 8, p: 1 })).toString('hex');
}

function sessionToken(request) {
  const cookie = (request.headers.cookie ?? '').split(';').find((part) => part.trim().startsWith(`${SESSION_COOKIE}=`));
  if (!cookie) return null;
  const value = cookie.trim().slice(SESSION_COOKIE.length + 1);
  return /^[a-f0-9]{64}$/.test(value) ? value : null;
}

/** The application factory takes an explicit database, making account isolation easy to test. */
export function createApp({ database, distDir, allowedOrigins = [], trustProxy = false, rateLimitEnabled = true }) {
  if (!database) throw new Error('A database is required.');
  const app = express();
  app.disable('x-powered-by');
  if (trustProxy) app.set('trust proxy', trustProxy);
  const origins = new Set(allowedOrigins.map((origin) => new URL(origin).origin));
  const authLimits = new Map();

  app.use((_request, response, next) => {
    response.set('X-Content-Type-Options', 'nosniff');
    response.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  app.use('/api', (request, response, next) => {
    response.set('Cache-Control', 'no-store');
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) {
      const origin = request.get('origin');
      if (origin) {
        let valid = false;
        try {
          const parsed = new URL(origin);
          valid = parsed.origin === `${request.protocol}://${request.get('host')}` || origins.has(parsed.origin);
        } catch { /* A malformed Origin is rejected below. */ }
        if (!valid) return next(new RequestError('This request came from an unrecognized origin.', 403));
      }
      if (request.headers['content-length'] && request.headers['content-length'] !== '0' && !request.is('application/json')) {
        return next(new RequestError('Send request data as JSON.', 415));
      }
    }
    next();
  });
  app.use(express.json({ limit: '12mb', strict: true }));

  function limitAuthentication(request, response, next) {
    if (!rateLimitEnabled) return next();
    const now = Date.now();
    const email = typeof request.body?.email === 'string' ? request.body.email.trim().toLowerCase().slice(0, 254) : '';
    const keys = [{ key: `ip:${request.ip}`, maximum: 60 }, { key: `email:${email}`, maximum: 8 }];
    // Reject new buckets before adding them when the map is full.
    if (authLimits.size > 10000) {
      for (const [key, counter] of authLimits) if (counter.resetAt <= now) authLimits.delete(key);
      if (authLimits.size >= 20000 && keys.some(({ key }) => !authLimits.has(key))) {
        response.set('Retry-After', '900');
        return next(new RequestError('Sign-in is busy. Please try again later.', 429));
      }
    }
    for (const { key, maximum } of keys) {
      const previous = authLimits.get(key);
      const counter = previous && previous.resetAt > now ? previous : { count: 0, resetAt: now + 15 * 60 * 1000 };
      if (counter.count >= maximum) {
        response.set('Retry-After', String(Math.ceil((counter.resetAt - now) / 1000)));
        return next(new RequestError('Too many sign-in attempts. Please try again in a few minutes.', 429));
      }
      counter.count += 1;
      authLimits.set(key, counter);
    }
    next();
  }

  function currentUser(request) {
    const token = sessionToken(request);
    if (!token) return null;
    return database.prepare(`SELECT users.id, users.email, users.name FROM sessions
      JOIN users ON users.id = sessions.user_id
      WHERE sessions.token_hash = ? AND sessions.expires_at > ?`).get(sha256(token), Date.now()) ?? null;
  }

  function requireUser(request, _response, next) {
    const user = currentUser(request);
    if (!user) return next(new RequestError('Sign in to sync your progress.', 401));
    const expectedAccount = request.get('x-account-id');
    if (expectedAccount && expectedAccount !== user.id) {
      return next(new RequestError('Account changed in another tab. Please reload before syncing.', 409));
    }
    request.user = user;
    next();
  }

  function createSession(request, response, userId) {
    const existing = sessionToken(request);
    if (existing) database.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(existing));
    database.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now());
    const token = randomBytes(32).toString('hex');
    database.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
      .run(sha256(token), userId, Date.now() + SESSION_SECONDS * 1000);
    response.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: request.secure,
      path: '/',
      maxAge: SESSION_SECONDS * 1000,
    });
  }

  app.get('/api/health', (_request, response) => response.json({ status: 'ok', storage: 'sqlite' }));
  app.get('/api/auth/me', (request, response) => {
    const user = currentUser(request);
    response.json({ user: user ? publicUser(user) : null });
  });

  app.post('/api/auth/register', limitAuthentication, async (request, response, next) => {
    try {
      const { email, name, password } = credentials(request.body, true);
      const salt = randomBytes(16).toString('hex');
      const hash = await passwordHash(password, salt);
      const user = { id: randomUUID(), email, name };
      try {
        database.prepare(`INSERT INTO users (id, email, name, password_hash, password_salt, created_at)
          VALUES (?, ?, ?, ?, ?, ?)`).run(user.id, email, name, hash, salt, Date.now());
      } catch (error) {
        if (error.message.includes('UNIQUE constraint failed: users.email')) throw new RequestError('An account with this email already exists. Try signing in.', 409);
        throw error;
      }
      createSession(request, response, user.id);
      response.status(201).json({ user: publicUser(user) });
    } catch (error) { next(error); }
  });

  app.post('/api/auth/login', limitAuthentication, async (request, response, next) => {
    try {
      const { email, password } = credentials(request.body);
      const user = database.prepare('SELECT * FROM users WHERE email = ?').get(email);
      // Unknown accounts still perform the same expensive derivation before returning a generic error.
      const candidate = await passwordHash(password, user?.password_salt ?? 'sat-grammar-unknown-account');
      const expected = user?.password_hash ?? '0'.repeat(128);
      const matches = timingSafeEqual(Buffer.from(candidate, 'hex'), Buffer.from(expected, 'hex'));
      if (!user || !matches) throw new RequestError('The email or password is incorrect.', 401);
      createSession(request, response, user.id);
      response.json({ user: publicUser(user) });
    } catch (error) { next(error); }
  });

  app.post('/api/auth/logout', (request, response) => {
    const token = sessionToken(request);
    if (token) database.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
    response.clearCookie(SESSION_COOKIE, { httpOnly: true, sameSite: 'lax', secure: request.secure, path: '/' });
    response.json({ user: null });
  });

  app.get('/api/progress', requireUser, (request, response) => {
    response.json({ progress: readProgress(database, request.user.id) });
  });
  app.put('/api/progress', requireUser, (request, response, next) => {
    try {
      const { progress, removedBookmarks, addedBookmarks } = progressPayload(request.body);
      response.json({ progress: mergeProgress(database, request.user.id, progress, removedBookmarks, addedBookmarks) });
    } catch (error) { next(error); }
  });

  app.use('/api', (_request, response) => response.status(404).json({ error: 'API route not found.' }));

  if (distDir && existsSync(resolve(distDir, 'index.html'))) {
    app.use(express.static(distDir, { index: false }));
    app.use((request, response, next) => {
      if (!['GET', 'HEAD'].includes(request.method)) return next();
      response.sendFile(resolve(distDir, 'index.html'));
    });
  }

  app.use((error, _request, response, _next) => {
    if (response.headersSent) return _next(error);
    if (error.type === 'entity.too.large') return response.status(413).json({ error: 'This progress update is too large.' });
    if (error instanceof SyntaxError && 'body' in error) return response.status(400).json({ error: 'The request contains invalid JSON.' });
    const status = Number.isInteger(error.status) && error.status >= 400 && error.status < 600 ? error.status : 500;
    if (status === 500) console.error('Unexpected server error:', error.name);
    response.status(status).json({ error: status === 500 ? 'Something went wrong. Please try again.' : error.message });
  });
  return app;
}
