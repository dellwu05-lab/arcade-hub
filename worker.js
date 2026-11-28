/**
 * Arcade Hub Cloudflare Worker API (worker.js)
 * ------------------------------------------------------------
 * - POST /api/play               : Records global play count & player (never returns counts)
 * - POST /api/score              : Submits player's high score to global leaderboard
 * - GET  /api/leaderboard        : Public global score leaderboard (no emails / no play counts)
 * - GET  /api/economy            : Public global coin economy multipliers & caps per game
 * - GET  /api/wallet/pending     : Fetch unclaimed cloud coin grants for a signed-in email
 * - POST /api/wallet/claim       : Mark cloud coin grants as claimed
 * - GET  /api/admin/stats        : Admin-only global cross-device play counts & player roster
 * - POST /api/admin/economy      : Admin-only update game multipliers, presets, or reset defaults
 * - POST /api/admin/wallet-grant : Admin-only queue cross-device coin grant/adjust for a player
 * - GET  /api/admin/audit        : Admin-only economy & wallet change audit log
 *
 * Storage:
 *   Uses Cloudflare KV binding `ARCADE_KV` when configured in Workers Settings -> Bindings.
 *   Falls back gracefully to Worker isolate memory so deployments never fail without KV.
 */

const DEFAULT_ADMINS = ['dellwu05@gmail.com'];
const KV_PLAYS_KEY = 'arcade:global_plays_v1';
const KV_SCORES_KEY = 'arcade:global_scores_v1';
const KV_ECONOMY_KEY = 'arcade:economy_v1';
const KV_GRANTS_KEY = 'arcade:wallet_grants_v1';
const KV_AUDIT_KEY = 'arcade:audit_log_v1';

const KNOWN_GAME_IDS = [
  'canyon_parkour_3d',
  'star_blaster_3d',
  'canyon_drift_3d',
  'neon_blocks_3d',
  'hero_arena_3d',
  'brick_breaker_3d',
  'hero_slash_3d',
  'neon_snake_3d',
  'cozy_island_3d'
];

const DEFAULT_GAME_ECONOMY = {
  coinMultiplier: 1.0,
  normalDropMult: 1.0,
  bonusDropMult: 1.0,
  maxCoinsPerRun: 0
};

if (!globalThis.__ARCADE_MEM) {
  globalThis.__ARCADE_MEM = {
    plays: {},
    scores: {},
    economy: null,
    grants: {},
    audit: [],
    cloudSaves: {}
  };
}
if (!globalThis.__ARCADE_MEM.cloudSaves) globalThis.__ARCADE_MEM.cloudSaves = {};

const MAX_NUM_FIELDS = ['bestScore', 'bestWave', 'bestLen', 'bestKills', 'bestSlices', 'bossesDefeated', 'maxStage', 'totalCoins', 'totalPlays', 'miles'];
const UNION_ARR_FIELDS = ['ownedHeroes', 'ownedShips', 'ownedCars', 'ownedThemes', 'unlockedChars', 'unlockedStages', 'unlockedRecipes', 'claimed', 'notified'];

function mergeGameSave(existing, incoming, incomingIsFresher) {
  if (!existing || typeof existing !== 'object') return incoming && typeof incoming === 'object' ? Object.assign({}, incoming) : {};
  if (!incoming || typeof incoming !== 'object') return Object.assign({}, existing);
  const base = incomingIsFresher ? Object.assign({}, existing, incoming) : Object.assign({}, incoming, existing);

  MAX_NUM_FIELDS.forEach((k) => {
    const a = Number(existing[k]);
    const b = Number(incoming[k]);
    if (Number.isFinite(a) || Number.isFinite(b)) {
      base[k] = Math.max(Number.isFinite(a) ? a : 0, Number.isFinite(b) ? b : 0);
    }
  });

  UNION_ARR_FIELDS.forEach((k) => {
    if (Array.isArray(existing[k]) || Array.isArray(incoming[k])) {
      const set = new Set([...(Array.isArray(existing[k]) ? existing[k] : []), ...(Array.isArray(incoming[k]) ? incoming[k] : [])]);
      base[k] = Array.from(set).slice(0, 120);
    }
  });

  ['upgrades', 'stageStars'].forEach((mapKey) => {
    if ((existing[mapKey] && typeof existing[mapKey] === 'object') || (incoming[mapKey] && typeof incoming[mapKey] === 'object')) {
      const mergedMap = Object.assign({}, existing[mapKey] || {});
      const incMap = incoming[mapKey] || {};
      Object.keys(incMap).forEach((k) => {
        mergedMap[k] = Math.max(Number(mergedMap[k]) || 0, Number(incMap[k]) || 0);
      });
      base[mapKey] = mergedMap;
    }
  });

  return base;
}

function mergeCloudSaveDoc(existing, incoming) {
  const now = Date.now();
  if (!existing || typeof existing !== 'object') {
    return {
      updatedAt: Number(incoming && incoming.updatedAt) || now,
      games: (incoming && incoming.games && typeof incoming.games === 'object') ? incoming.games : {},
      hub: (incoming && incoming.hub && typeof incoming.hub === 'object') ? incoming.hub : {}
    };
  }
  const exTs = Number(existing.updatedAt) || 0;
  const inTs = Number(incoming && incoming.updatedAt) || now;
  const incomingIsFresher = inTs >= exTs;

  const games = {};
  const allGameIds = new Set([
    ...Object.keys(existing.games || {}),
    ...Object.keys((incoming && incoming.games) || {})
  ]);
  allGameIds.forEach((gid) => {
    const cleanId = cleanStr(gid, 40);
    if (!cleanId) return;
    games[cleanId] = mergeGameSave(existing.games && existing.games[cleanId], incoming && incoming.games && incoming.games[cleanId], incomingIsFresher);
  });

  const exHub = existing.hub || {};
  const inHub = (incoming && incoming.hub) || {};
  const exQ = exHub.quests || {};
  const inQ = inHub.quests || {};
  const exSpin = exHub.spin || {};
  const inSpin = inHub.spin || {};

  const exDaily = exHub.daily || {};
  const inDaily = inHub.daily || {};
  const newerDaily = String(inDaily.lastCheckinDate || '') >= String(exDaily.lastCheckinDate || '') ? inDaily : exDaily;
  const sameMissionDay = String(inDaily.missionDate || '') === String(exDaily.missionDate || '') && !!inDaily.missionDate;
  const missionBase = String(inDaily.missionDate || '') >= String(exDaily.missionDate || '') ? inDaily : exDaily;
  const mergedDaily = {
    streak: Math.max(Number(newerDaily.streak) || 0, String(inDaily.lastCheckinDate || '') === String(exDaily.lastCheckinDate || '') ? (Number(exDaily.streak) || 0) : 0),
    lastCheckinDate: newerDaily.lastCheckinDate || '',
    missionDate: missionBase.missionDate || '',
    stats: sameMissionDay ? {
      plays: Math.max(Number(exDaily.stats?.plays) || 0, Number(inDaily.stats?.plays) || 0),
      games: Array.from(new Set([...(Array.isArray(exDaily.stats?.games) ? exDaily.stats.games : []), ...(Array.isArray(inDaily.stats?.games) ? inDaily.stats.games : [])])).slice(0, 20),
      spins: Math.max(Number(exDaily.stats?.spins) || 0, Number(inDaily.stats?.spins) || 0),
      topScore: Math.max(Number(exDaily.stats?.topScore) || 0, Number(inDaily.stats?.topScore) || 0),
      shares: Math.max(Number(exDaily.stats?.shares) || 0, Number(inDaily.stats?.shares) || 0),
      lbViews: Math.max(Number(exDaily.stats?.lbViews) || 0, Number(inDaily.stats?.lbViews) || 0)
    } : (missionBase.stats || {}),
    claimedMissions: sameMissionDay
      ? Array.from(new Set([...(Array.isArray(exDaily.claimedMissions) ? exDaily.claimedMissions : []), ...(Array.isArray(inDaily.claimedMissions) ? inDaily.claimedMissions : [])])).slice(0, 12)
      : (Array.isArray(missionBase.claimedMissions) ? missionBase.claimedMissions : []),
    bonusClaimed: sameMissionDay ? !!(exDaily.bonusClaimed || inDaily.bonusClaimed) : !!missionBase.bonusClaimed
  };

  const hub = {
    quests: {
      claimed: Array.from(new Set([...(Array.isArray(exQ.claimed) ? exQ.claimed : []), ...(Array.isArray(inQ.claimed) ? inQ.claimed : [])])).slice(0, 120),
      notified: Array.from(new Set([...(Array.isArray(exQ.notified) ? exQ.notified : []), ...(Array.isArray(inQ.notified) ? inQ.notified : [])])).slice(0, 120),
      equippedTitle: (incomingIsFresher ? (inQ.equippedTitle || exQ.equippedTitle) : (exQ.equippedTitle || inQ.equippedTitle)) || ''
    },
    spin: {
      totalSpins: Math.max(Number(exSpin.totalSpins) || 0, Number(inSpin.totalSpins) || 0),
      lastDate: String(inSpin.lastDate || '') >= String(exSpin.lastDate || '') ? (inSpin.lastDate || exSpin.lastDate || '') : (exSpin.lastDate || '')
    },
    daily: mergedDaily
  };

  return { updatedAt: Math.max(exTs, inTs, now), games, hub };
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

function getAdminActorEmail(request, env) {
  const admins = getAdminEmails(env);
  const authHeader = request.headers.get('Authorization') || '';
  if (authHeader.startsWith('Bearer ')) {
    const payload = decodeJwtPayload(authHeader.slice(7).trim());
    if (payload && payload.email && admins.has(String(payload.email).toLowerCase())) {
      return String(payload.email).toLowerCase();
    }
  }
  const emailHdr = (request.headers.get('X-Arcade-Admin-Email') || '').trim().toLowerCase();
  if (emailHdr && admins.has(emailHdr)) return emailHdr;
  return '';
}

function isAuthorizedAdmin(request, env) {
  return !!getAdminActorEmail(request, env);
}

async function readStore(env, key, memField, fallbackValue = {}) {
  if (env && env.ARCADE_KV) {
    try {
      const raw = await env.ARCADE_KV.get(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') return parsed;
      }
    } catch { /* fall through */ }
    return Array.isArray(fallbackValue) ? [] : Object.assign({}, fallbackValue);
  }
  const val = globalThis.__ARCADE_MEM[memField];
  if (val !== undefined && val !== null) return val;
  return Array.isArray(fallbackValue) ? [] : Object.assign({}, fallbackValue);
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

function clampMult(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 1.0;
  return Math.round(Math.max(0.1, Math.min(5.0, n)) * 100) / 100;
}

function clampCap(v) {
  const n = Math.floor(Number(v) || 0);
  if (n <= 0) return 0;
  return Math.max(50, Math.min(99999, n));
}

function sanitizeGameEconomy(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  return {
    coinMultiplier: clampMult(src.coinMultiplier !== undefined ? src.coinMultiplier : DEFAULT_GAME_ECONOMY.coinMultiplier),
    normalDropMult: clampMult(src.normalDropMult !== undefined ? src.normalDropMult : DEFAULT_GAME_ECONOMY.normalDropMult),
    bonusDropMult: clampMult(src.bonusDropMult !== undefined ? src.bonusDropMult : DEFAULT_GAME_ECONOMY.bonusDropMult),
    maxCoinsPerRun: clampCap(src.maxCoinsPerRun !== undefined ? src.maxCoinsPerRun : DEFAULT_GAME_ECONOMY.maxCoinsPerRun)
  };
}

function createDefaultEconomy() {
  const games = {};
  KNOWN_GAME_IDS.forEach((gid) => {
    games[gid] = Object.assign({}, DEFAULT_GAME_ECONOMY);
  });
  return { preset: 'normal', updatedAt: 0, games };
}

function sanitizeEconomyDoc(raw) {
  const base = createDefaultEconomy();
  if (!raw || typeof raw !== 'object') return base;
  base.preset = cleanStr(raw.preset || 'custom', 24) || 'custom';
  base.updatedAt = Number(raw.updatedAt) || 0;
  const srcGames = raw.games && typeof raw.games === 'object' ? raw.games : {};
  Object.keys(srcGames).forEach((gid) => {
    const cleanId = cleanStr(gid, 40);
    if (cleanId) base.games[cleanId] = sanitizeGameEconomy(srcGames[gid]);
  });
  return base;
}

async function appendAuditLog(env, entry) {
  const list = await readStore(env, KV_AUDIT_KEY, 'audit', []);
  const logs = Array.isArray(list) ? list : [];
  logs.unshift(Object.assign({
    id: 'aud_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
    at: Date.now()
  }, entry));
  const trimmed = logs.slice(0, 100);
  await writeStore(env, KV_AUDIT_KEY, 'audit', trimmed);
  return trimmed;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const storage = env && env.ARCADE_KV ? 'kv' : 'memory';

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

        const plays = await readStore(env, KV_PLAYS_KEY, 'plays', {});
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

        const scores = await readStore(env, KV_SCORES_KEY, 'scores', {});
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
      const scores = await readStore(env, KV_SCORES_KEY, 'scores', {});

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

    // 4. Public Global Economy Settings (multipliers & caps per game)
    if (url.pathname === '/api/economy' && request.method === 'GET') {
      const raw = await readStore(env, KV_ECONOMY_KEY, 'economy', null);
      const economy = sanitizeEconomyDoc(raw);
      return jsonRes({ ok: true, storage, economy });
    }

    // 5. Player Pending Cloud Wallet Grants (for cross-device coin grants)
    if (url.pathname === '/api/wallet/pending' && request.method === 'GET') {
      const email = cleanStr(url.searchParams.get('email') || '', 64).toLowerCase();
      if (!email) return jsonRes({ ok: true, grants: [] });
      const grantsMap = await readStore(env, KV_GRANTS_KEY, 'grants', {});
      const list = Array.isArray(grantsMap[email]) ? grantsMap[email] : [];
      const pending = list.filter(g => g && !g.claimedAt);
      return jsonRes({ ok: true, storage, grants: pending });
    }

    if (url.pathname === '/api/wallet/claim' && request.method === 'POST') {
      try {
        const body = await request.json();
        const email = cleanStr(body.email || '', 64).toLowerCase();
        const ids = Array.isArray(body.grantIds) ? new Set(body.grantIds.map(x => cleanStr(x, 48))) : new Set();
        if (!email || ids.size === 0) return jsonRes({ ok: true, claimed: 0 });
        const grantsMap = await readStore(env, KV_GRANTS_KEY, 'grants', {});
        const list = Array.isArray(grantsMap[email]) ? grantsMap[email] : [];
        let claimed = 0;
        const now = Date.now();
        list.forEach((g) => {
          if (g && !g.claimedAt && ids.has(g.id)) {
            g.claimedAt = now;
            claimed++;
          }
        });
        if (claimed > 0) {
          // Keep latest 40 grant records per email
          grantsMap[email] = list.slice(-40);
          await writeStore(env, KV_GRANTS_KEY, 'grants', grantsMap);
        }
        return jsonRes({ ok: true, claimed });
      } catch {
        return jsonRes({ ok: false, error: 'invalid payload' }, 400);
      }
    }

    // 6. Admin-Only Global Play Counts & Players Analytics
    if (url.pathname === '/api/admin/stats' && request.method === 'GET') {
      if (!isAuthorizedAdmin(request, env)) {
        return jsonRes({ ok: false, error: 'Forbidden: Admin access only' }, 403);
      }
      const plays = await readStore(env, KV_PLAYS_KEY, 'plays', {});
      return jsonRes({ ok: true, storage, plays });
    }

    // 7. Admin-Only Economy Control (update game, apply preset, or reset all)
    if (url.pathname === '/api/admin/economy' && request.method === 'POST') {
      const actor = getAdminActorEmail(request, env);
      if (!actor) return jsonRes({ ok: false, error: 'Forbidden: Admin access only' }, 403);
      try {
        const body = await request.json();
        const action = cleanStr(body.action || 'set_game', 24);
        const raw = await readStore(env, KV_ECONOMY_KEY, 'economy', null);
        const economy = sanitizeEconomyDoc(raw);
        const now = Date.now();

        if (action === 'reset_all') {
          const prevPreset = economy.preset;
          const fresh = createDefaultEconomy();
          fresh.updatedAt = now;
          await writeStore(env, KV_ECONOMY_KEY, 'economy', fresh);
          await appendAuditLog(env, {
            actor,
            type: 'economy_reset',
            gameId: 'all',
            summary: '全遊戲還原為 1.0x 預設經濟參數',
            before: { preset: prevPreset },
            after: { preset: 'normal', coinMultiplier: 1.0 }
          });
          return jsonRes({ ok: true, storage, economy: fresh });
        }

        if (action === 'preset') {
          const preset = cleanStr(body.preset || 'normal', 24);
          const multMap = { normal: 1.0, double: 2.0, hard: 0.5 };
          const mult = multMap[preset] !== undefined ? multMap[preset] : 1.0;
          const prevPreset = economy.preset;
          Object.keys(economy.games).forEach((gid) => {
            economy.games[gid] = Object.assign({}, economy.games[gid], {
              coinMultiplier: mult,
              normalDropMult: 1.0,
              bonusDropMult: 1.0
            });
          });
          economy.preset = preset;
          economy.updatedAt = now;
          await writeStore(env, KV_ECONOMY_KEY, 'economy', economy);
          const labelMap = { normal: '平日預設 1.0x', double: '週末雙倍 2.0x', hard: '嚴苛模式 0.5x' };
          await appendAuditLog(env, {
            actor,
            type: 'economy_preset',
            gameId: 'all',
            summary: `切換全站活動預設檔：${labelMap[preset] || preset}`,
            before: { preset: prevPreset },
            after: { preset, coinMultiplier: mult }
          });
          return jsonRes({ ok: true, storage, economy });
        }

        // Single game update
        const gameId = cleanStr(body.gameId || '', 40);
        if (!gameId) return jsonRes({ ok: false, error: 'missing gameId' }, 400);
        const prevCfg = sanitizeGameEconomy(economy.games[gameId]);
        const nextCfg = sanitizeGameEconomy(Object.assign({}, prevCfg, body.config || {}));
        economy.games[gameId] = nextCfg;
        economy.preset = 'custom';
        economy.updatedAt = now;
        await writeStore(env, KV_ECONOMY_KEY, 'economy', economy);
        await appendAuditLog(env, {
          actor,
          type: 'economy_game',
          gameId,
          summary: `調整 ${gameId} 倍率 ${prevCfg.coinMultiplier}x → ${nextCfg.coinMultiplier}x（一般 ${nextCfg.normalDropMult}x / 特殊 ${nextCfg.bonusDropMult}x / 上限 ${nextCfg.maxCoinsPerRun || '無'}）`,
          before: prevCfg,
          after: nextCfg
        });
        return jsonRes({ ok: true, storage, economy });
      } catch {
        return jsonRes({ ok: false, error: 'invalid payload' }, 400);
      }
    }

    // 8. Admin-Only Cross-Device Cloud Wallet Grant
    if (url.pathname === '/api/admin/wallet-grant' && request.method === 'POST') {
      const actor = getAdminActorEmail(request, env);
      if (!actor) return jsonRes({ ok: false, error: 'Forbidden: Admin access only' }, 403);
      try {
        const body = await request.json();
        const email = cleanStr(body.email || '', 64).toLowerCase();
        const gameId = cleanStr(body.gameId || '', 40);
        const mode = body.mode === 'set' ? 'set' : 'add';
        const amount = Math.floor(Number(body.amount) || 0);
        const note = cleanStr(body.note || '', 60);
        if (!email || !gameId) return jsonRes({ ok: false, error: 'missing email or gameId' }, 400);
        if (mode === 'set' && (amount < 0 || amount > 999999)) return jsonRes({ ok: false, error: 'invalid amount' }, 400);
        if (mode === 'add' && (amount === 0 || Math.abs(amount) > 999999)) return jsonRes({ ok: false, error: 'invalid delta' }, 400);

        const grant = {
          id: 'gr_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
          email,
          gameId,
          mode,
          amount,
          note,
          createdBy: actor,
          createdAt: Date.now(),
          claimedAt: 0
        };
        const grantsMap = await readStore(env, KV_GRANTS_KEY, 'grants', {});
        if (!Array.isArray(grantsMap[email])) grantsMap[email] = [];
        grantsMap[email].push(grant);
        grantsMap[email] = grantsMap[email].slice(-40);
        await writeStore(env, KV_GRANTS_KEY, 'grants', grantsMap);

        await appendAuditLog(env, {
          actor,
          type: 'wallet_grant',
          gameId,
          summary: `雲端發放給 ${email}（${gameId === 'all' ? '全遊戲' : gameId}）：${mode === 'set' ? '設為 ' + amount : (amount > 0 ? '+' + amount : amount)} 🪙${note ? ' · ' + note : ''}`,
          before: null,
          after: { email, gameId, mode, amount, note }
        });
        return jsonRes({ ok: true, storage, grant });
      } catch {
        return jsonRes({ ok: false, error: 'invalid payload' }, 400);
      }
    }

    // 9. Admin-Only Audit Log
    if (url.pathname === '/api/admin/audit' && request.method === 'GET') {
      if (!isAuthorizedAdmin(request, env)) {
        return jsonRes({ ok: false, error: 'Forbidden: Admin access only' }, 403);
      }
      const logs = await readStore(env, KV_AUDIT_KEY, 'audit', []);
      return jsonRes({ ok: true, storage, logs: Array.isArray(logs) ? logs : [] });
    }

    // 10. Cross-Device Cloud Save Sync (Per-Email KV storage with conflict-safe merge)
    if (url.pathname === '/api/cloud-save' && request.method === 'GET') {
      const email = cleanStr(url.searchParams.get('email') || '', 64).toLowerCase();
      if (!email || !email.includes('@')) return jsonRes({ ok: false, error: 'invalid email' }, 400);
      const kvKey = `arcade:cloud_save_v1:${email}`;
      let save = null;
      if (env && env.ARCADE_KV) {
        try {
          const raw = await env.ARCADE_KV.get(kvKey);
          if (raw) save = JSON.parse(raw);
        } catch { /* ignore */ }
      } else {
        save = globalThis.__ARCADE_MEM.cloudSaves[email] || null;
      }
      return jsonRes({ ok: true, storage, email, save });
    }

    if (url.pathname === '/api/cloud-save' && request.method === 'POST') {
      try {
        const body = await request.json();
        const email = cleanStr(body.email || '', 64).toLowerCase();
        if (!email || !email.includes('@')) return jsonRes({ ok: false, error: 'invalid email' }, 400);
        const kvKey = `arcade:cloud_save_v1:${email}`;
        let existing = null;
        if (env && env.ARCADE_KV) {
          try {
            const raw = await env.ARCADE_KV.get(kvKey);
            if (raw) existing = JSON.parse(raw);
          } catch { /* ignore */ }
        } else {
          existing = globalThis.__ARCADE_MEM.cloudSaves[email] || null;
        }
        const merged = mergeCloudSaveDoc(existing, {
          updatedAt: Number(body.updatedAt) || Date.now(),
          games: body.games && typeof body.games === 'object' ? body.games : {},
          hub: body.hub && typeof body.hub === 'object' ? body.hub : {}
        });
        globalThis.__ARCADE_MEM.cloudSaves[email] = merged;
        if (env && env.ARCADE_KV) {
          try {
            await env.ARCADE_KV.put(kvKey, JSON.stringify(merged));
          } catch { /* ignore KV quota errors */ }
        }
        return jsonRes({ ok: true, storage, email, save: merged });
      } catch {
        return jsonRes({ ok: false, error: 'invalid payload' }, 400);
      }
    }

    // Serve static assets for all non-API routes
    if (env && env.ASSETS) {
      return env.ASSETS.fetch(request);
    }
    return new Response('Not Found', { status: 404 });
  }
};

