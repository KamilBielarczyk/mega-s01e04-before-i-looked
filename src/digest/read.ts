import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, Night, ReadNight, RunLine, RunStatus } from './types.js';

const NIGHT = /^\d{4}-\d{2}-\d{2}$/;
const STATUSES: readonly RunStatus[] = ['ok', 'retry', 'fail'];

export function isNight(s: string): boolean {
  return NIGHT.test(s);
}

// Parse at the edge: anything that isn't a whole, well-typed line is null and gets counted.
export function parseLine(text: string): RunLine | null {
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  if (typeof o.at !== 'string' || Number.isNaN(Date.parse(o.at))) return null;
  if (typeof o.job !== 'string' || o.job === '') return null;
  if (!STATUSES.includes(o.status as RunStatus)) return null;
  if (o.owner !== undefined && o.owner !== null && typeof o.owner !== 'string') return null;
  if (o.error !== undefined && typeof o.error !== 'string') return null;
  return {
    at: o.at,
    job: o.job,
    status: o.status as RunStatus,
    owner: (o.owner as string | null | undefined) ?? null,
    ...(o.error !== undefined ? { error: o.error as string } : {}),
  };
}

export const readNight: ReadNight = (runsDir, night) => {
  if (!isNight(night)) return null;
  let text: string;
  try {
    text = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch {
    return null;
  }

  const lines: RunLine[] = [];
  let badLines = 0;
  for (const raw of text.split('\n')) {
    if (raw.trim() === '') continue;
    const line = parseLine(raw);
    if (line) lines.push(line);
    else badLines++;
  }

  // Order by time, not by file order; the strings themselves are kept as logged.
  lines.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));

  const counts: Record<RunStatus, number> = { ok: 0, retry: 0, fail: 0 };
  const byJob = new Map<string, DigestRow>();
  for (const l of lines) {
    counts[l.status]++;
    const row = byJob.get(l.job);
    if (!row) {
      byJob.set(l.job, {
        job: l.job,
        owner: l.owner,
        runs: 1,
        retries: l.status === 'retry' ? 1 : 0,
        lastStatus: l.status,
        lastError: l.error ?? null,
        firstAt: l.at,
        lastAt: l.at,
      });
      continue;
    }
    row.runs++;
    if (l.status === 'retry') row.retries++;
    row.lastStatus = l.status;
    if (l.error !== undefined) row.lastError = l.error;
    if (l.owner !== null) row.owner = l.owner;
    row.lastAt = l.at;
  }

  const rows = [...byJob.values()].sort((a, b) => (a.job < b.job ? -1 : a.job > b.job ? 1 : 0));
  return { night, rows, badLines, counts } satisfies Night;
};
