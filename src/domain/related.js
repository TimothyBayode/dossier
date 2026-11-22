// What else is about this.
//
// Teamwork Graph answers "what is formally linked". It cannot answer "what is
// about the same thing but was never linked", which is where most duplicated
// work hides. So the ranking blends two kinds of evidence and says which one
// fired, per candidate, in the output. An agent that can see why a ticket was
// surfaced can judge whether to trust it.

const STOPWORDS = new Set(
  `the a an and or of to in for on with is are was were be been it its this that these those from by as
   at into if then than not no you your we our they their he she his her but so do does did can could
   should would will just also more most other some such only own same too very via per out up down
   when what which who whom whose why how all any both each few many new now old one two get got`
    .split(/\s+/)
    .filter(Boolean),
);

export function keywords(text, { min = 3, max = 24 } = {}) {
  const seen = new Set();
  const out = [];
  for (const raw of String(text ?? '').toLowerCase().split(/[^a-z0-9]+/)) {
    if (raw.length < min || STOPWORDS.has(raw) || seen.has(raw)) continue;
    seen.add(raw);
    out.push(raw);
    if (out.length >= max) break;
  }
  return out;
}

const PARENT_BONUS = 3;
// A link the platform recorded is evidence in itself, stronger than two words
// that happen to collide. Candidates that arrive from the Teamwork Graph carry
// `linked`, and the reason is shown so a reader can weigh it.
const LINKED_BONUS = 2.5;
const LABEL_BONUS = 1.5;
const LABEL_CAP = 4.5;
const OVERLAP_BONUS = 5;
const KIND_BONUS = { pull: 0.5, goal: 0.5 };

export function rankRelated({ subject = {}, candidates = [], limit = 8 } = {}) {
  const subjectTokens = new Set(
    Array.isArray(subject.tokens) ? subject.tokens : keywords(subject.title ?? ''),
  );
  const subjectLabels = new Set((subject.labels ?? []).map((label) => String(label).toLowerCase()));
  const seen = new Set();
  const scored = [];

  for (const candidate of Array.isArray(candidates) ? candidates : []) {
    if (!candidate || !candidate.id) continue;
    if (subject.id && candidate.id === subject.id) continue;
    if (seen.has(candidate.id)) continue;
    seen.add(candidate.id);

    const why = [];
    let score = 0;

    if (candidate.linked) {
      score += LINKED_BONUS;
      why.push('linked in the graph');
    }

    if (subject.parent && candidate.parent && subject.parent === candidate.parent) {
      score += PARENT_BONUS;
      why.push('same parent');
    }

    const shared = (candidate.labels ?? [])
      .map((label) => String(label).toLowerCase())
      .filter((label) => subjectLabels.has(label));
    if (shared.length) {
      score += Math.min(LABEL_CAP, shared.length * LABEL_BONUS);
      why.push(`${shared.length} shared label${shared.length === 1 ? '' : 's'}`);
    }

    // Only the title is tokenised, never the key: every issue in a project
    // shares the project prefix, so including it would hand every candidate in
    // the same project a small unearned overlap score.
    const tokens = Array.isArray(candidate.tokens) ? candidate.tokens : keywords(candidate.title ?? '');
    const overlap = tokens.filter((token) => subjectTokens.has(token));
    if (overlap.length) {
      const union = new Set([...tokens, ...subjectTokens]).size || 1;
      score += (overlap.length / union) * OVERLAP_BONUS;
      why.push(`shares ${overlap.slice(0, 3).join(', ')}`);
    }

    const kindBonus = KIND_BONUS[candidate.kind] ?? 0;
    score += kindBonus;

    if (score <= 0) continue;
    scored.push({ ...candidate, score: Math.round(score * 100) / 100, why });
  }

  return scored
    .sort((a, b) => b.score - a.score || String(a.id).localeCompare(String(b.id)))
    .slice(0, Math.max(0, Number(limit) || 8));
}

export function renderRelated(rows) {
  if (!rows.length) return 'Nothing else looks related.';
  return rows
    .map((row) => {
      const label = row.kind === 'pull' ? 'PR' : row.kind === 'goal' ? 'Goal' : 'Issue';
      const link = row.url ? ` ([${row.key ?? row.id}](${row.url}))` : row.key ? ` (${row.key})` : '';
      const why = row.why?.length ? ` (${row.why.join('; ')})` : '';
      return `- ${label} **${row.title ?? row.key ?? row.id}**${link}${why}`;
    })
    .join('\n');
}
