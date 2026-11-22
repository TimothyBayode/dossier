// Who to ask.
//
// The signal is not "who is assigned", that person may have been handed the
// ticket an hour ago and know nothing. The signal is who has TOUCHED the work,
// weighted by how recently. An authored change to linked code beats a comment,
// a comment beats an assignment.
//
// Decay is half-life, not a cliff. A comment from 30 days ago is worth half a
// comment from today, which is the right shape: knowledge goes stale gradually,
// not at midnight on day 31.

export const OWNER_WEIGHTS = { authored: 4, assignment: 3, comment: 2 };

// A signal with no timestamp cannot prove recency. It still counts as evidence
// that the person was involved, at a quarter weight. The alternative, treating
// undated as "now", would let a malformed payload put a stranger first.
const UNDATED_FACTOR = 0.25;
const DEFAULT_HALF_LIFE_DAYS = 30;

export function rankOwners({
  signals = [],
  now = new Date(),
  limit = 5,
  halfLifeDays = DEFAULT_HALF_LIFE_DAYS,
} = {}) {
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const halfLife = Number(halfLifeDays) > 0 ? Number(halfLifeDays) : DEFAULT_HALF_LIFE_DAYS;
  const people = new Map();

  for (const signal of Array.isArray(signals) ? signals : []) {
    if (!signal || !signal.accountId) continue;
    const weight = OWNER_WEIGHTS[signal.kind];
    if (!weight) continue;

    let factor = UNDATED_FACTOR;
    if (signal.at) {
      const at = new Date(signal.at).getTime();
      if (Number.isFinite(at)) {
        const ageDays = Math.max(0, (nowMs - at) / 86_400_000);
        factor = 0.5 ** (ageDays / halfLife);
      }
    }

    const person = people.get(signal.accountId) ?? {
      accountId: signal.accountId,
      displayName: signal.displayName || signal.accountId,
      score: 0,
      lastAt: null,
      evidence: { authored: 0, assignment: 0, comment: 0 },
    };
    person.score += weight * factor;
    person.evidence[signal.kind] += 1;
    if (signal.displayName) person.displayName = signal.displayName;
    if (signal.at && (!person.lastAt || String(signal.at) > person.lastAt)) {
      person.lastAt = String(signal.at);
    }
    people.set(signal.accountId, person);
  }

  return [...people.values()]
    .sort((a, b) => b.score - a.score || a.displayName.localeCompare(b.displayName))
    .slice(0, Math.max(0, limit))
    .map((person) => ({ ...person, score: Math.round(person.score * 100) / 100 }));
}

const EVIDENCE_LABELS = {
  authored: ['linked change', 'linked changes'],
  assignment: ['assignment', 'assignments'],
  comment: ['comment', 'comments'],
};

export function describeOwner(person) {
  const parts = [];
  for (const kind of ['authored', 'comment', 'assignment']) {
    const count = person.evidence?.[kind] ?? 0;
    if (!count) continue;
    const [one, many] = EVIDENCE_LABELS[kind];
    parts.push(`${count} ${count === 1 ? one : many}`);
  }
  const since = person.lastAt ? `, last ${String(person.lastAt).slice(0, 10)}` : '';
  return `${person.displayName}: ${parts.join(', ') || 'no evidence'}${since}`;
}
