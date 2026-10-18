// The curated rankings' structure (sections and the questions in them), read from /api/curated.
// Sections, their order and their questions all come from the server; nothing here names one.
import { api } from './platform.js';

let cache = null;
let task = null;

export function curatedInfo({ fresh = false } = {}) {
  if (!fresh && cache && Date.now() - cache.at < 60_000) return Promise.resolve(cache.data);
  task ??= api('curated').then((data) => {
    const sections = (data.sections ?? []).slice().sort((a, b) => a.order - b.order);
    cache = { at: Date.now(), data: { ...data, sections, taskIds: new Set(sections.flatMap((section) => section.taskIds ?? [])) } };
    return cache.data;
  }).finally(() => { task = null; });
  return task;
}
// What has been read so far, for drawing before the read finishes.
export const curatedKnown = () => cache?.data ?? null;
