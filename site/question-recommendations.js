const DAY = 86_400_000;
const ROTATION = 6 * 3_600_000;
const SLOTS = ['popular', 'unanswered', 'popular', 'recent', 'popular', 'explore'];
const timestamp = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? Date.parse(value) : null;
const hash = value => {
  let result = 2166136261;
  for (const character of String(value)) result = Math.imul(result ^ character.charCodeAt(0), 16777619);
  return result >>> 0;
};
const byId = (a, b) => hash(a.task.id) - hash(b.task.id) || String(a.task.id).localeCompare(String(b.task.id), 'en');
const rotate = (rows, turn) => {
  if (!rows.length) return rows;
  const offset = ((turn % rows.length) + rows.length) % rows.length;
  return [...rows.slice(offset), ...rows.slice(0, offset)];
};

// Use public participation signals, without pretending to know impressions or clicks.
// A fixed six-hour turn keeps refreshes stable; an explicit batch changes exploration.
export function recommendQuestions(tasks, { now = Date.now(), batch = 0, modelKey = work => work.model ?? work.modelName ?? 'unknown' } = {}) {
  const day = Math.floor(now / DAY);
  const turn = Math.floor(now / ROTATION) + batch;
  const rows = tasks.map(task => {
    const answers = (task.results ?? []).filter(work => work.status !== 'questioned');
    const verified = answers.filter(work => work.status === 'verified');
    const models = new Map(), activity = new Map();
    for (const work of verified) {
      const key = modelKey(work) ?? 'unknown';
      models.set(key, Math.min(2, (models.get(key) ?? 0) + 1));
      const added = timestamp(work.addedAt);
      if (added === null || added > now) continue;
      const age = Math.max(0, day - Math.floor(added / DAY));
      if (age >= 28) continue;
      // One model contributes at most once to recent activity, regardless of variants.
      activity.set(key, Math.max(activity.get(key) ?? 0, 2 ** (-age / 7)));
    }
    const published = timestamp(task.createdAt) ?? timestamp(task.date);
    const age = published === null ? Infinity : day - Math.floor(published / DAY);
    const open = task.acceptsUploads !== false && !task.promptPending;
    return { task, answers: answers.length, models: models.size, open,
      recent: open && published !== null && published <= now && age >= 0 && age < 7,
      score: 2 * Math.log1p(models.size) + Math.log1p([...models.values()].reduce((sum, value) => sum + value, 0))
        + 4 * Math.log1p([...activity.values()].reduce((sum, value) => sum + value, 0)) };
  });
  const ranked = [...rows].sort((a, b) => b.score - a.score || byId(a, b));
  const pools = {
    popular: ranked.filter(row => row.models >= 4),
    unanswered: rotate(rows.filter(row => row.open && row.answers === 0).sort(byId), turn),
    explore: rotate(rows.filter(row => row.open && row.answers > 0 && row.models < 4).sort(byId), turn),
    recent: rotate(rows.filter(row => row.recent).sort(byId), turn),
    fallback: ranked,
  };
  const selected = [], used = new Set();
  const take = (pool, diversify = false) => {
    const previous = selected.slice(-2);
    const category = diversify && previous.length === 2 && previous[0].task.category === previous[1].task.category ? previous[0].task.category : null;
    // Diversify popular slots, without skipping the turn of an under-tested question.
    return (category && pool.find(row => !used.has(row.task.id) && row.task.category !== category))
      || pool.find(row => !used.has(row.task.id));
  };
  for (let index = 0; index < rows.length; index++) {
    const lane = SLOTS[index % SLOTS.length];
    const row = take(pools[lane], lane === 'popular') ?? take(pools.popular, true) ?? take(pools.unanswered)
      ?? take(pools.explore) ?? take(pools.recent) ?? take(pools.fallback);
    if (!row) break;
    used.add(row.task.id);
    const reason = lane === 'recent' && row.recent ? 'recent'
      : row.open && row.answers === 0 ? 'unanswered'
      : row.open && row.models < 4 ? 'explore'
      : row.models >= 4 ? 'popular' : null;
    selected.push({ task: row.task, reason });
  }
  return selected;
}
