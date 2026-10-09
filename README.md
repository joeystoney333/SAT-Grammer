# Clause — SAT Grammar Studio

A blue-and-white SAT grammar practice app with **250 original difficult questions**, **25 teaching modules**, a **timed 20-question Question Rush**, and real accounts with synced progress.

The repository also supports a static Sites build. It keeps practice, lessons, Question Rush, bookmarks, and progress, storing progress in the current browser instead of using accounts.

## Run locally

Requires Node.js **24+** (the server uses Node's built-in SQLite module).

```bash
npm ci
npm run dev
```

Vite serves the interface on port **5173** and proxies `/api` to the account server on **3001**. One command starts and stops both processes. No external API key is required. Fonts are included in the installation and served locally.

For a static host such as Sites, build and publish the generated `dist` directory:

```bash
npm ci
npm run build:static
```

The static build makes no `/api` requests and shows browser-local progress controls instead of account controls.

## What you can do

- Practice all 250 questions, filter by any of the 25 topics, or select unanswered, bookmarked, or previously missed questions.
- Check an answer to see the correct choice, a full explanation, and reasoning for each distractor.
- Learn sentence boundaries, conjunctions, semicolons, colons, lists, essential/nonessential information, dashes, possessives, agreement, pronouns, tense, verb forms, modifiers, parallelism, comparisons, transitions, and rhetorical synthesis. Idioms and concision are identified as supporting writing skills.
- Mark lessons complete and see actual accuracy, topic performance, and personal rush bests.
- Play a randomized 20-question rush with a 10-, 15-, or 20-minute limit. The clock continues during explanations and when you leave the rush screen. At zero the round ends; unanswered questions count toward the 20-question total. Review every question after the round.
- Register or sign in with email and password. Guest work is imported on sign-in. Account work is saved to SQLite and restored on other browsers using this server. Local changes are retained when offline and retried when connectivity returns. Active clients refresh remote progress every 20 seconds and when focused.

Active rush rounds are kept in memory and end if the page is reloaded. Completed rounds are saved. Accounts use password hashing and HttpOnly sessions. This first draft has no email verification or password reset.

## Validation

```bash
npm test
npm run test:browser
```

`npm test` checks the question-bank invariants and runs HTTP account/persistence/isolation/sync tests against isolated SQLite databases. The browser suite builds and serves the production app with an in-memory test database, then exercises practice, explanations, bookmarks, lessons, registration, second-browser progress restoration, rush navigation, timer expiry, a full perfect-score round, and mobile layout. It expects Chromium at `/usr/bin/chromium`; set `CHROMIUM_PATH` if yours is elsewhere. Test users never enter the development database.

Question-bank schema: `src/data/content-{a,b,c,d,e}.json`. Each topic has ten questions. Every question has four choices, one answer index, an explanation, four option explanations, and a lesson tip. All passages are original; these are independent SAT-style practice materials, not official College Board questions.

## Production

```bash
npm run build
HOST=0.0.0.0 PORT=3001 npm start
```

The Express server serves `dist` and the account API from one origin. Deploy it behind HTTPS with a persistent disk for `.data/sat-grammar.sqlite`. Set `TRUST_PROXY=1` only when using a trusted single reverse proxy. Configure `APP_ORIGIN` if the external origin differs from the forwarded request origin. Back up the SQLite database with a SQLite-aware backup process. A static-only host cannot provide accounts or synced progress; public hosting is a separate deployment step.

See [server/README.md](server/README.md) for the API and runtime settings. Never commit `.data`, environment secrets, or generated build outputs.
