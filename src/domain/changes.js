// What moved while the agent was away.
//
// This module deliberately does not read Jira. It takes normalised events and
// stale rows, because the interesting logic, windowing, ordering, grouping,
// and the wording, is the part worth testing, and the extraction is the part
// worth keeping thin.

const KIND_ORDER = ['moved', 'created', 'resolved'];

function byAtDesc(a, b) {
  return String(b.at ?? '').localeCompare(String(a.at ?? ''));
}

function windowed(events, cutoff) {
  return events.filter((event) => {
    if (!event || !event.kind) return false;
    if (cutoff === null) return true;
    const at = new Date(event.at ?? '').getTime();
    return Number.isFinite(at) && at > cutoff;
  });
}

function render({ since, counts, moves, created, resolved, stale }) {
  const scope = since ? `since ${String(since).slice(0, 10)}` : 'in the current snapshot';
  const lines = [`# Changes ${scope}`];

  if (!counts.moved && !counts.created && !counts.resolved && !counts.stale) {
    lines.push('', 'Nothing moved.');
    return lines.join('\n');
  }

  if (moves.length) {
    lines.push('', '## Status moves');
    for (const move of moves) {
      const who = move.author ? `, ${move.author}` : '';
      lines.push(`- **${move.key}** ${move.from ?? '?'} → ${move.to ?? '?'}${who} (${String(move.at).slice(0, 10)})`);
    }
  }
  if (created.length) {
    lines.push('', '## Opened');
    for (const item of created) {
      lines.push(`- **${item.key}** ${item.summary ?? ''} (${String(item.at).slice(0, 10)})`);
    }
  }
  if (resolved.length) {
    lines.push('', '## Resolved');
    for (const item of resolved) {
      lines.push(`- **${item.key}** ${item.summary ?? ''} (${String(item.at).slice(0, 10)})`);
    }
  }
  if (stale.length) {
    lines.push('', '## Stale');
    for (const item of stale) {
      lines.push(`- **${item.key}** ${item.summary ?? ''}: ${item.status ?? 'unknown'}, untouched ${item.days ?? '?'} days`);
    }
  }
  return lines.join('\n');
}

export function summariseChanges({ events = [], stale = [], since = null, limit = 40 } = {}) {
  const cutoff = since ? new Date(since).getTime() : null;
  const fresh = windowed(Array.isArray(events) ? events : [], Number.isFinite(cutoff) ? cutoff : null);
  const cap = Math.max(1, Number(limit) || 40);

  const moves = fresh.filter((event) => event.kind === 'status').sort(byAtDesc).slice(0, cap);
  const created = fresh.filter((event) => event.kind === 'created').sort(byAtDesc).slice(0, cap);
  const resolved = fresh.filter((event) => event.kind === 'resolved').sort(byAtDesc).slice(0, cap);
  const staleRows = [...(Array.isArray(stale) ? stale : [])]
    .sort((a, b) => (Number(b?.days) || 0) - (Number(a?.days) || 0))
    .slice(0, cap);

  const counts = {
    moved: moves.length,
    created: created.length,
    resolved: resolved.length,
    stale: staleRows.length,
  };

  return {
    since: since ?? null,
    counts,
    moves,
    created,
    resolved,
    stale: staleRows,
    markdown: render({ since, counts, moves, created, resolved, stale: staleRows }),
  };
}

export { KIND_ORDER };
