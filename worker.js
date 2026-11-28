/**
 * Arcade Hub Cloudflare Worker API (worker.js)
 * ------------------------------------------------------------
 * - POST /api/play          : Records global play count & player (never returns counts)
 * - POST /api/score         : Submits player's high score to global leaderboard
 * - GET  /api/leaderboard   : Public global score leaderboard (no emails / no play counts)
 * - GET  /api/admin/stats   : Admin-only global cross-device play counts & player roster
 *
 * Storage:
 *   Uses Cloudflare KV binding `ARCADE_KV` when configured in Workers Settings -> Bindings.
 *   Falls back gracefully to Worker isolate memory so deployments never fail without KV.
 */

const DEFAULT_ADMINS = ['dellwu05@gmail.com'];
const KV_PLAYS_KEY = 'arcade:global_plays_v1';
const KV_SCORES_KEY = 'arcade:global_scores_v1';

if (!globalThis.__ARCADE_MEM) {
  globalThis.__ARCADE_MEM = { plays: {}, scores: {} };
}

function jsonRes(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });
}

function getAdminEmails(env) {
  const raw = env && typeof env.ADMIN_EMAILS === 'string' ? env.ADMIN_EMAILS : '';
  const extra = raw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  return new Set([...DEFAULT_ADMINS, ...extra]);
}

function decodeJwtPayload(token) {
  try {
    const part = String(token || '').split('.')[1];
    if (!part) return null;
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '==='.slice((b64.length + 3) % 4);
    const bin = atob(padded);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return JSON.parse(new TextDecoder('utf-8').decode(bytes));
  } catch {
    return null;
  }
}

function isAuthorizedAdmin(request, env) {
  const admins = getAdminEmails(env);
  const authHeader = request.headers.get('Authorization') || '';
  if (authHeader.startsWith('Bearer ')) {
    const payload = decodeJwtPayload(authHeader.slice(7).trim());
    if (payload && payload.email && admins.has(String(payload.email).toLowerCase())) {
      return true;
    }
  }
  const emailHdr = (request.headers.get('X-Arcade-Admin-Email') || '').trim().toLowerCase();
  return !!(emailHdr && admins.has(emailHdr));
}

async function readStore(env, key, memField) {
  if (env && env.ARCADE_KV) {
    try {
      const raw = await env.ARCADE_KV.get(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') return parsed;
      }
    } catch { /* fall through */ }
    return {};
  }
  return globalThis.__ARCADE_MEM[memField] || {};
}

async function writeStore(env, key, memField, obj) {
  globalThis.__ARCADE_MEM[memField] = obj;
  if (env && env.ARCADE_KV) {
    try {
      await env.ARCADE_KV.put(key, JSON.stringify(obj));
    } catch { /* ignore KV quota errors */ }
  }
}

function cleanStr(v, maxLen = 40) {
  return String(v || '').trim().slice(0, maxLen);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // 1. Record Play Event (Public write-only; never exposes counts)
    if (url.pathname === '/api/play' && request.method === 'POST') {
      try {
        const body = await request.json();
        const gameId = cleanStr(body.gameId, 40);
        if (!gameId) return jsonRes({ ok: false, error: 'missing gameId' }, 400);

        const uid = cleanStr(body.uid || 'guest', 64);
        const name = cleanStr(body.name || (uid === 'guest' ? '訪客玩家' : 'Google 玩家'), 24);
        const email = cleanStr(body.email || '', 64).toLowerCase();
        const picture = /^https?:\/\//i.test(String(body.picture || '')) ? String(body.picture).slice(0, 260) : '';
        const color = /^#[0-9a-f]{3,8}$/i.test(String(body.color || '')) ? String(body.color) : '#64748b';
        const now = Date.now();

        const plays = await readStore(env, KV_PLAYS_KEY, 'plays');
        if (!plays[gameId] || typeof plays[gameId] !== 'object') {
          plays[gameId] = { totalPlays: 0, lastPlayedAt: 0, players: {} };
        }
        const entry = plays[gameId];
        if (!entry.players || typeof entry.players !== 'object') entry.players = {};
        entry.totalPlays = (Number(entry.totalPlays) || 0) + 1;
        entry.lastPlayedAt = now;

        const prev = entry.players[uid] || { uid, count: 0 };
        entry.players[uid] = {
          uid,
          name,
          email,
          picture,
          color,
          count: (Number(prev.count) || 0) + 1,
          lastPlayedAt: now
        };

        await writeStore(env, KV_PLAYS_KEY, 'plays', plays);
        return jsonRes({ ok: true });
      } catch {
        return jsonRes({ ok: false, error: 'invalid payload' }, 400);
      }
    }

    // 2. Submit High Score (Public — updates global score leaderboard)
    if (url.pathname === '/api/score' && request.method === 'POST') {
      try {
        const body = await request.json();
        const gameId = cleanStr(body.gameId, 40);
        const score = Math.floor(Number(body.score) || 0);
        if (!gameId || score <= 0) return jsonRes({ ok: true, skipped: true });

        const uid = cleanStr(body.uid || 'guest', 64);
        const name = cleanStr(body.name || (uid === 'guest' ? '訪客玩家' : 'Google 玩家'), 24);
        const picture = /^https?:\/\//i.test(String(body.picture || '')) ? String(body.picture).slice(0, 260) : '';
        const color = /^#[0-9a-f]{3,8}$/i.test(String(body.color || '')) ? String(body.color) : '#38bdf8';
        const title = cleanStr(body.title || '', 24);
        const now = Date.now();

        const scores = await readStore(env, KV_SCORES_KEY, 'scores');
        if (!scores[gameId] || typeof scores[gameId] !== 'object') scores[gameId] = {};
        const prev = scores[gameId][uid];
        if (!prev || score >= (Number(prev.score) || 0)) {
          scores[gameId][uid] = {
            uid,
            name,
            picture,
            color,
            title,
            score: Math.max(score, Number(prev && prev.score) || 0),
            updatedAt: now
          };
          // Keep top 60 entries per game to keep KV compact
          const sorted = Object.values(scores[gameId])
            .sort((a, b) => (b.score - a.score) || ((b.updatedAt || 0) - (a.updatedAt || 0)))
            .slice(0, 60);
          const trimmed = {};
          sorted.forEach(item => { trimmed[item.uid] = item; });
          scores[gameId] = trimmed;
          await writeStore(env, KV_SCORES_KEY, 'scores', scores);
        }
        return jsonRes({ ok: true });
      } catch {
        return jsonRes({ ok: false, error: 'invalid payload' }, 400);
      }
    }

    // 3. Public Global Score Leaderboard (NO emails, NO play counts!)
    if (url.pathname === '/api/leaderboard' && request.method === 'GET') {
      const gameId = cleanStr(url.searchParams.get('gameId') || '', 40);
      const scores = await readStore(env, KV_SCORES_KEY, 'scores');
      const storage = env && env.ARCADE_KV ? 'kv' : 'memory';

      const formatList = (mapObj) => Object.values(mapObj || {})
        .filter(x => x && Number(x.score) > 0)
        .sort((a, b) => (b.score - a.score) || ((b.updatedAt || 0) - (a.updatedAt || 0)))
        .slice(0, 30)
        .map(x => ({
          name: x.name,
          picture: x.picture || '',
          color: x.color || '#38bdf8',
          title: x.title || '',
          score: Number(x.score) || 0,
          updatedAt: Number(x.updatedAt) || 0
        }));

      if (gameId) {
        return jsonRes({ ok: true, storage, gameId, entries: formatList(scores[gameId]) });
      }
      const all = {};
      Object.keys(scores).forEach(gid => { all[gid] = formatList(scores[gid]); });
      return jsonRes({ ok: true, storage, games: all });
    }

    // 4. Admin-Only Global Play Counts & Players Analytics
    if (url.pathname === '/api/admin/stats' && request.method === 'GET') {
      if (!isAuthorizedAdmin(request, env)) {
        return jsonRes({ ok: false, error: 'Forbidden: Admin access only' }, 403);
      }
      const plays = await readStore(env, KV_PLAYS_KEY, 'plays');
      const storage = env && env.ARCADE_KV ? 'kv' : 'memory';
      return jsonRes({ ok: true, storage, plays });
    }

    // Serve static assets for all non-API routes
    if (env && env.ASSETS) {
      return env.ASSETS.fetch(request);
    }
    return new Response('Not Found', { status: 404 });
  }
};
