import { hasModelPreview, screenshotOf } from './work-preview-media.js';

// Which work leads: one per model on the task page, one for the task card.
// The server sends the vote-based picks (platform.featured[task] = { cover, models }); until a
// work has enough blind votes, the fixed fallbacks below decide.

// Only single-turn works without human intervention enter the blind test. Curated works
// that predate these fields count as standard.
export const standard = (r) => (!r.generationMode || r.generationMode === 'single-turn')
  && (!r.humanIntervention || r.humanIntervention === 'none');

const EFFORT_RANK = { ultracode: 7, ultra: 6, max: 5, xhigh: 4, high: 3, medium: 2, low: 1 };
export const effortRank = (r) => EFFORT_RANK[String(r.effort ?? '').trim().toLowerCase()] ?? 0;
const added = (r) => Date.parse(r.addedAt) || Infinity;

// Standard works first, then the highest effort, then the earliest collected.
export const fallbackOrder = (a, b) => Number(standard(b)) - Number(standard(a))
  || effortRank(b) - effortRank(a) || added(a) - added(b);

const byId = (results, id) => (id ? results.find((r) => r.id === id) : undefined);

// Map of model key → the work shown for that model.
export function representatives(results, keyOf, picks = {}) {
  const groups = new Map();
  for (const r of results) {
    const key = keyOf(r);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }
  return new Map([...groups].map(([key, works]) => [key, byId(works, picks[key]) ?? [...works].sort(fallbackOrder)[0]]));
}

// A model preview can supply the card visual itself; otherwise use an available screenshot.
const hasCoverMedia = (r) => hasModelPreview(r) || Boolean(screenshotOf(r));

// Prefer the admin's cover, then the vote-based pick, then Opus 5.5 Max and Astra Max.
// If those works have no card media, fall back to the best media-bearing public work.
const COVER_FALLBACKS = [['claude-opus-5.5', 'max'], ['gpt-6-astra', 'max']];
export function taskCover(task, pick = null) {
  const works = task.results.filter((r) => r.status !== 'questioned' && hasCoverMedia(r));
  const selected = byId(works, task.cover);
  if (selected) return selected;
  const voted = byId(works, pick);
  if (voted) return voted;
  for (const [model, effort] of COVER_FALLBACKS) {
    const match = works.filter((r) => r.model === model && String(r.effort ?? '').toLowerCase() === effort).sort(fallbackOrder)[0];
    if (match) return match;
  }
  return [...works].sort(fallbackOrder)[0] ?? null;
}
