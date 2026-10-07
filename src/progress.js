export const emptyProgress = () => ({ attempts: [], completedLessons: [], bookmarks: [], rushRuns: [] });
export function normalizeProgress(p) {
  const empty = emptyProgress();
  for (const key of Object.keys(empty)) if (Array.isArray(p?.[key])) empty[key] = p[key];
  return empty;
}
export function mergeProgress(a, b) {
  a = normalizeProgress(a); b = normalizeProgress(b);
  return {
    attempts: [...new Map([...a.attempts, ...b.attempts].map(x => [x.id,x])).values()].sort((a,b) => a.answeredAt.localeCompare(b.answeredAt)),
    completedLessons: [...new Set([...a.completedLessons, ...b.completedLessons])],
    bookmarks: [...new Set([...a.bookmarks, ...b.bookmarks])],
    rushRuns: [...new Map([...a.rushRuns, ...b.rushRuns].map(x => [x.id,x])).values()],
  };
}
export const progressKey = user => `clause-progress-v1-${user?.id || 'guest'}`;
export function readProgress(user) {
  try { return normalizeProgress(JSON.parse(localStorage.getItem(progressKey(user)))); }
  catch { return emptyProgress(); }
}
export function latestAttempts(attempts) {
  return Object.values(Object.fromEntries([...attempts].sort((a,b) => a.answeredAt.localeCompare(b.answeredAt)).map(a => [a.questionId,a])));
}
export function shuffle(items) {
  const list = [...items];
  for (let i=list.length-1; i>0; i--) { const j=Math.floor(Math.random()*(i+1)); [list[i],list[j]]=[list[j],list[i]]; }
  return list;
}
