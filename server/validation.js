export class RequestError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new RequestError(`${label} must be an object.`);
  return value;
}

function text(value, label, max, min = 1) {
  if (typeof value !== 'string' || value.length < min || value.length > max || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new RequestError(`${label} must be ${min}–${max} characters.`);
  }
  return value;
}

function array(value, label, max) {
  if (!Array.isArray(value) || value.length > max) throw new RequestError(`${label} must be a list with at most ${max} items.`);
  return value;
}

function integer(value, label, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) throw new RequestError(`${label} must be an integer from ${min} to ${max}.`);
  return value;
}

function date(value, label) {
  text(value, label, 40);
  if (!/^\d{4}-\d{2}-\d{2}T/.test(value) || !Number.isFinite(Date.parse(value))) throw new RequestError(`${label} must be an ISO date.`);
  return new Date(value).toISOString();
}

function identifier(value, label) {
  return text(value, label, 120);
}

export function credentials(body, registration = false) {
  object(body, 'Request');
  const email = text(typeof body.email === 'string' ? body.email.trim().toLowerCase() : body.email, 'Email', 254);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new RequestError('Enter a valid email address.');
  const password = text(body.password, 'Password', 128, 8);
  const result = { email, password };
  if (registration) result.name = text(typeof body.name === 'string' ? body.name.trim() : body.name, 'Name', 60);
  return result;
}

function ids(value, label, max) {
  return [...new Set(array(value ?? [], label, max).map((id) => identifier(id, label)))];
}

export function progressPayload(body) {
  object(body, 'Request');
  const source = object(body.progress, 'Progress');
  const progress = {
    attempts: array(source.attempts ?? [], 'Attempts', 50000).map((raw) => {
      const entry = object(raw, 'Attempt');
      if (typeof entry.correct !== 'boolean') throw new RequestError('Attempt correctness must be true or false.');
      if (!['practice', 'rush'].includes(entry.mode)) throw new RequestError('Attempt mode must be practice or rush.');
      return {
        id: identifier(entry.id, 'Attempt ID'),
        questionId: identifier(entry.questionId, 'Question ID'),
        choice: integer(entry.choice, 'Choice', 0, 3),
        correct: entry.correct,
        mode: entry.mode,
        answeredAt: date(entry.answeredAt, 'Answer time'),
      };
    }),
    completedLessons: ids(source.completedLessons, 'Completed lessons', 100),
    bookmarks: ids(source.bookmarks, 'Bookmarks', 1000),
    rushRuns: array(source.rushRuns ?? [], 'Rush runs', 10000).map((raw) => {
      const entry = object(raw, 'Rush run');
      const total = integer(entry.total, 'Rush total', 1, 250);
      return {
        id: identifier(entry.id, 'Rush ID'),
        score: integer(entry.score, 'Rush score', 0, total),
        total,
        duration: integer(entry.duration, 'Rush duration', 0, 86400),
        finishedAt: date(entry.finishedAt, 'Finish time'),
      };
    }),
  };
  return {
    progress,
    removedBookmarks: ids(body.removedBookmarks, 'Removed bookmarks', 1000),
    addedBookmarks: body.addedBookmarks === undefined ? undefined : ids(body.addedBookmarks, 'Added bookmarks', 1000),
  };
}
