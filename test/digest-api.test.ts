import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { readNight } from '../src/digest/read.js';

const config = { adapter: 'shim', installed: 'x', beatEverySeconds: 60, runsDir: 'runs' };

describe('GET /api/digest/:night', () => {
  it('returns readNight for 2026-10-28, same jobs in the same order', async () => {
    const res = await createApp(config).request('/api/digest/2026-10-28');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(readNight('runs', '2026-10-28'));
  });

  it('404s for a night with no file', async () => {
    const res = await createApp(config).request('/api/digest/2020-01-01');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'no such night', night: '2020-01-01' });
  });
});
