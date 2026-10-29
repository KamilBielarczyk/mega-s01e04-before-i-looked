import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const config = { adapter: 'shim', installed: 'x', beatEverySeconds: 60, runsDir: 'runs' };

describe('digest page', () => {
  it('renders 2026-10-28 and 404s a night with no file', async () => {
    const app = createApp(config);
    const ok = await app.request('/digest/2026-10-28');
    const html = await ok.text();
    expect(ok.status).toBe(200);
    expect(html).toContain('<th>last status</th>');
    const missing = await app.request('/digest/1999-01-01');
    expect(missing.status).toBe(404);
  });
});
