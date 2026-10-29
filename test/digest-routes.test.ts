import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { Night } from '../src/digest/types.js';

// A temp runs dir with its own small fixtures. runs/ is never read or written here.
const runsDir = mkdtempSync(join(tmpdir(), 'rig-digest-routes-'));
afterAll(() => rmSync(runsDir, { recursive: true, force: true }));

const config = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir };

const GOOD_NIGHT = '2026-10-28';
const EMPTY_NIGHT = '2026-10-29';
const BAD_LINE_NIGHT = '2026-10-30';
const MISSING_NIGHT = '2026-11-01';

const JOBS = ['digest/render', 'fixtures/refresh', 'lane/sync', 'notes/backup'];

// Lines are written out of order on purpose: the page and the JSON must sort by job.
writeFileSync(
  join(runsDir, `${GOOD_NIGHT}.jsonl`),
  [
    '{"at":"2026-10-28T02:00:00+01:00","job":"notes/backup","status":"fail","owner":"rook","error":"quota exceeded"}',
    '{"at":"2026-10-28T01:30:00+01:00","job":"fixtures/refresh","status":"retry","owner":"rook","error":"upstream 503"}',
    '{"at":"2026-10-28T01:31:00+01:00","job":"fixtures/refresh","status":"ok","owner":"rook"}',
    '{"at":"2026-10-28T00:10:00+01:00","job":"digest/render","status":"ok","owner":null}',
    '{"at":"2026-10-28T03:00:00+01:00","job":"lane/sync","status":"ok","owner":"rook"}',
    '',
  ].join('\n'),
);
writeFileSync(join(runsDir, `${EMPTY_NIGHT}.jsonl`), '');
writeFileSync(
  join(runsDir, `${BAD_LINE_NIGHT}.jsonl`),
  [
    'not json at all',
    '{"at":"2026-10-30T01:05:00+01:00","job":"lane/sync","status":"ok","owner":"rook"}',
    '{"at":"2026-10-30T01:00:00+01:00","job":"digest/render","status":"ok","owner":null}',
    '',
  ].join('\n'),
);

describe('GET /digest/:night', () => {
  it('answers 200 with every job of the night', async () => {
    const res = await createApp(config).request(`/digest/${GOOD_NIGHT}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    for (const job of JOBS) expect(html).toContain(job);
  });

  it('answers 404 for a night with no file', async () => {
    const res = await createApp(config).request(`/digest/${MISSING_NIGHT}`);
    expect(res.status).toBe(404);
  });

  it('answers 200 and says nothing ran for an empty night', async () => {
    const res = await createApp(config).request(`/digest/${EMPTY_NIGHT}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('nothing ran');
  });

  it('answers 200 with the good rows when a line does not parse', async () => {
    const res = await createApp(config).request(`/digest/${BAD_LINE_NIGHT}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('digest/render');
    expect(html).toContain('lane/sync');
  });
});

describe('GET /api/digest/:night', () => {
  it('answers 200 with night, rows, badLines and counts', async () => {
    const res = await createApp(config).request(`/api/digest/${GOOD_NIGHT}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Night;
    expect(Object.keys(body).sort()).toEqual(['badLines', 'counts', 'night', 'rows']);
    expect(body.night).toBe(GOOD_NIGHT);
    expect(body.badLines).toBe(0);
    expect(body.counts).toEqual({ ok: 3, retry: 1, fail: 1 });
  });

  it('lists the rows sorted by job, with the DigestRow fields', async () => {
    const res = await createApp(config).request(`/api/digest/${GOOD_NIGHT}`);
    const body = (await res.json()) as Night;
    expect(body.rows.map((r) => r.job)).toEqual(JOBS);
    expect(body.rows.find((r) => r.job === 'fixtures/refresh')).toEqual({
      job: 'fixtures/refresh',
      owner: 'rook',
      runs: 2,
      retries: 1,
      lastStatus: 'ok',
      lastError: 'upstream 503',
      firstAt: '2026-10-28T01:30:00+01:00',
      lastAt: '2026-10-28T01:31:00+01:00',
    });
    expect(body.rows.find((r) => r.job === 'digest/render')).toMatchObject({ owner: null, runs: 1 });
  });

  it('answers 404 with the error and the night for a night with no file', async () => {
    const res = await createApp(config).request(`/api/digest/${MISSING_NIGHT}`);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'no such night', night: MISSING_NIGHT });
  });

  it('answers 200 with no rows and no bad lines for an empty night', async () => {
    const res = await createApp(config).request(`/api/digest/${EMPTY_NIGHT}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Night;
    expect(body).toMatchObject({ night: EMPTY_NIGHT, rows: [], badLines: 0 });
  });

  it('answers 200 with badLines counted and the good rows kept', async () => {
    const res = await createApp(config).request(`/api/digest/${BAD_LINE_NIGHT}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Night;
    expect(body.badLines).toBe(1);
    expect(body.rows.map((r) => r.job)).toEqual(['digest/render', 'lane/sync']);
  });
});

describe('page and JSON agree', () => {
  it('list the same jobs in the same order', async () => {
    const app = createApp(config);
    const html = await (await app.request(`/digest/${GOOD_NIGHT}`)).text();
    const body = (await (await app.request(`/api/digest/${GOOD_NIGHT}`)).json()) as Night;
    const jsonJobs = body.rows.map((r) => r.job);
    const positions = jsonJobs.map((job) => html.indexOf(job));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it('agree on a night with a bad line', async () => {
    const app = createApp(config);
    const html = await (await app.request(`/digest/${BAD_LINE_NIGHT}`)).text();
    const body = (await (await app.request(`/api/digest/${BAD_LINE_NIGHT}`)).json()) as Night;
    for (const row of body.rows) expect(html).toContain(row.job);
    const positions = body.rows.map((r) => html.indexOf(r.job));
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });
});
