# Account and progress API

Requires Node.js 24 or newer. Run `node server/index.js` from the project root. The API listens on `127.0.0.1:3001` by default and serves the built `dist` directory when present.

| Method | Path | Request | Response |
| --- | --- | --- | --- |
| GET | `/api/health` | — | `{status: "ok", storage: "sqlite"}` |
| GET | `/api/auth/me` | — | `{user: {id, email, name}}` or `{user: null}` |
| POST | `/api/auth/register` | `{name, email, password}` | `{user}`; establishes session |
| POST | `/api/auth/login` | `{email, password}` | `{user}`; establishes session |
| POST | `/api/auth/logout` | — | `{user: null}`; revokes session |
| GET | `/api/progress` | — | `{progress}`; requires session |
| PUT | `/api/progress` | `{progress, addedBookmarks?: string[], removedBookmarks?: string[]}` | `{progress}` after merging; requires session |

Every error is JSON with an `error` string and an appropriate HTTP status. Passwords require 8–128 characters; email addresses are normalized. Cookies are HttpOnly, SameSite=Lax, valid for 30 days, and Secure on HTTPS. Passwords use scrypt with a random salt; session tokens are random and only their SHA-256 hashes are stored.

Progress clients should send the current user's ID in `X-Account-ID` on both GET and PUT. If the browser's shared session cookie now belongs to a different account, the API rejects the request with status 409, protecting against an old tab uploading one user's history into another user's account. The header is optional for backwards compatibility.

Progress contains `attempts`, `completedLessons`, `bookmarks`, and `rushRuns`. Attempts have `{id, questionId, choice, correct, mode, answeredAt}`, where `choice` is 0–3 and `mode` is `practice` or `rush`. Rush runs have `{id, score, total, duration, finishedAt}`; duration is elapsed seconds. Date fields are ISO timestamps. Event IDs are immutable and deduplicated atomically, so retrying an upload or syncing a stale device preserves earlier events. Lesson IDs are merged. Send bookmark changes in `addedBookmarks` and `removedBookmarks`; when `addedBookmarks` is supplied, the full `progress.bookmarks` snapshot is ignored, preventing stale snapshots from restoring removed bookmarks. If `addedBookmarks` is omitted, the full bookmark snapshot is merged for compatibility and initial account import. Removals take priority if an ID appears in both delta lists.

The database defaults to `.data/sat-grammar.sqlite`. Keep that directory on persistent storage for hosted use and include it in backups. It contains account and progress data; do not commit it. Accounts sync across devices using this running server. This first version does not send email, verify email ownership, or provide password recovery.

Optional runtime variables:

- `PORT`: server port, default `3001`.
- `HOST`: bind address, default `127.0.0.1`; use `0.0.0.0` for a hosted service.
- `DB_PATH`: SQLite file location.
- `APP_ORIGIN`: comma-separated exact allowed frontend origins; otherwise mutations must match the request's origin.
- `TRUST_PROXY=1`: trust one reverse proxy when HTTPS terminates there. Enable only behind a trusted proxy so HTTPS cookies and rate-limit IPs reflect the original request.

In development, proxy `/api` from Vite with `changeOrigin: false`. API requests should use JSON and session cookies; no browser authentication token is stored in local storage.

Run the integration checks with `node --test server/app.test.js`. They exercise actual HTTP requests against isolated SQLite stores.
