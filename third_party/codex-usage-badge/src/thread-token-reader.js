class ThreadTokenReader {
  constructor({ home = process.env.CODEX_HOME || require('node:path').join(require('node:os').homedir(), '.codex') } = {}) {
    this.home = home;
  }
  read(ids) {
    const checkedAt = Date.now();
    const totals = Object.create(null);
    const requested = [...new Set(ids)].filter(id => typeof id === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id)).slice(0, 2000);
    if (!requested.length) return { ok: true, totals, checkedAt };
    let db;
    try {
      const fs = require('node:fs');
      const path = require('node:path');
      // Follow the latest local state database; never fall back to an older account snapshot.
      const file = fs.readdirSync(this.home).filter(name => /^state_\d+\.sqlite$/.test(name))
        .sort((a, b) => Number(b.match(/\d+/)[0]) - Number(a.match(/\d+/)[0]))[0];
      if (!file) return { ok: false, totals, checkedAt };
      const { DatabaseSync } = require('node:sqlite');
      db = new DatabaseSync(path.join(this.home, file), { readOnly: true, timeout: 200 });
      // These are the only two fields read: no titles, messages, auth, or conversation bodies.
      for (let i = 0; i < requested.length; i += 200) {
        const chunk = requested.slice(i, i + 200);
        const rows = db.prepare(`SELECT id, tokens_used FROM threads WHERE id IN (${chunk.map(() => '?').join(',')})`).all(...chunk);
        for (const row of rows) if (Number.isSafeInteger(row.tokens_used) && row.tokens_used >= 0) totals[row.id] = row.tokens_used;
      }
      return { ok: true, totals, checkedAt };
    } catch {
      return { ok: false, totals: Object.create(null), checkedAt };
    } finally { try { db?.close(); } catch {} }
  }
}
async function refreshThreadTokens(injector, reader) {
  const sessions = [...injector.sessions.values()];
  if (!sessions.length) return;
  const requests = await Promise.all(sessions.map(async session => {
    try {
      const result = await session.evaluate('window.__codexThreadTokens?.requestedIds() ?? []');
      const ids = result?.result?.value;
      return { session, ids: Array.isArray(ids) ? ids : [] };
    } catch { return { session, ids: [] }; }
  }));
  const snapshot = reader.read(requests.flatMap(r => r.ids));
  await Promise.all(requests.map(async ({ session, ids }) => {
    const totals = Object.fromEntries(ids.filter(id => Object.hasOwn(snapshot.totals, id)).map(id => [id, snapshot.totals[id]]));
    try { await session.evaluate(`window.__codexThreadTokens?.update(${JSON.stringify({ ...snapshot, totals })})`); } catch {}
  }));
}
