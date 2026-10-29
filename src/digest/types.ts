// Plan morning-digest § 1. The contract every part of § 2 builds against: commit this first.

export type RunStatus = 'ok' | 'retry' | 'fail';

// One line of runs/<night>.jsonl, after parsing at the edge.
export type RunLine = {
  at: string;
  job: string;
  status: RunStatus;
  owner: string | null;
  error?: string;
};

// One row per job, as the page and the JSON show it.
export type DigestRow = {
  job: string;
  owner: string | null; // null renders as '—'
  runs: number; // lines for this job
  retries: number; // lines with status 'retry'
  lastStatus: RunStatus;
  lastError: string | null; // the latest error this job logged, even if a later run was ok
  firstAt: string; // as logged, offset kept (styleguide: never convert to UTC)
  lastAt: string;
};

export type Night = {
  night: string; // YYYY-MM-DD
  rows: DigestRow[]; // sorted by job; empty file: []
  badLines: number; // lines that didn't parse: counted, never thrown
  counts: Record<RunStatus, number>; // lines per status, for the board link (§ 2c)
};

// null when the night has no file (the routes answer 404) or the night isn't YYYY-MM-DD.
export type ReadNight = (runsDir: string, night: string) => Night | null;
