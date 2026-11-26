/**
 * Arcade Hub Unified SSO & Cross-Game Save SDK (arcade-sso.js)
 * ------------------------------------------------------------
 * 供「遊戲綜合區」與底下所有遊戲共用，實現「全站只需登入一次」：
 * - 統一 Google 帳號工作階段（支援真實 Google Identity Services OAuth 2.0 與本機快速帳號）
 * - 透過 localStorage + storage 事件 + iframe postMessage 即時雙向同步
 * - 各款遊戲依 (gameId + user.uid) 自動隔離存檔，互不覆蓋
 */
(function (global) {
  'use strict';

  const SSO_STORAGE_KEY = 'arcade_hub_sso_v1';
  const LEGACY_CANYON_AUTH_KEY = 'canyon_parkour_3d_google_auth_v1';
  const AVATAR_PALETTE = ['#4285f4', '#ea4335', '#34a853', '#fbbc05', '#8b5cf6', '#0ea5e9', '#ec4899', '#f97316'];

  function pickAvatarColor(seed) {
    let h = 0;
    const s = String(seed || 'G');
    for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    return AVATAR_PALETTE[Math.abs(h) % AVATAR_PALETTE.length];
  }

  function hashUid(str) {
    let h1 = 0x811c9dc5;
    const s = String(str || '').toLowerCase().trim();
    for (let i = 0; i < s.length; i++) {
      h1 ^= s.charCodeAt(i);
      h1 = Math.imul(h1, 0x01000193);
    }
    return 'u_' + (h1 >>> 0).toString(36);
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
      const jsonStr = new TextDecoder('utf-8').decode(bytes);
      return JSON.parse(jsonStr);
    } catch (e) {
      return null;
    }
  }

  function sanitizeAuth(p) {
    const def = { currentUser: null, savedAccounts: [], clientId: '' };
    if (!p || typeof p !== 'object') return def;
    return {
      currentUser: p.currentUser && p.currentUser.uid ? p.currentUser : null,
      savedAccounts: Array.isArray(p.savedAccounts)
        ? p.savedAccounts.filter(a => a && a.uid && a.email).slice(0, 8)
        : [],
      clientId: typeof p.clientId === 'string' ? p.clientId.trim() : ''
    };
  }

  function loadAuth() {
    try {
      const raw = localStorage.getItem(SSO_STORAGE_KEY);
      if (raw) return sanitizeAuth(JSON.parse(raw));
      // Migrate legacy Game #1 auth seamlessly if present
      const legacy = localStorage.getItem(LEGACY_CANYON_AUTH_KEY);
      if (legacy) {
        const migrated = sanitizeAuth(JSON.parse(legacy));
        localStorage.setItem(SSO_STORAGE_KEY, JSON.stringify(migrated));
        return migrated;
      }
    } catch (e) { /* storage fallback */ }
    return sanitizeAuth(null);
  }

  function saveAuth(authObj) {
    const clean = sanitizeAuth(authObj);
    try {
      localStorage.setItem(SSO_STORAGE_KEY, JSON.stringify(clean));
      localStorage.setItem(LEGACY_CANYON_AUTH_KEY, JSON.stringify(clean));
    } catch (e) { /* storage fallback */ }
    return clean;
  }

  function getGameSaveKey(gameId, user) {
    if (gameId === 'canyon_parkour_3d') {
      return user && user.uid
        ? `canyon_parkour_3d_save_v1_acct_${user.uid}`
        : 'canyon_parkour_3d_save_v1';
    }
    return user && user.uid
      ? `arcade_save_${gameId}_acct_${user.uid}`
      : `arcade_save_${gameId}_guest`;
  }

  function readGameSave(gameId, user) {
    try {
      const raw = localStorage.getItem(getGameSaveKey(gameId, user));
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function writeGameSave(gameId, user, data) {
    try {
      localStorage.setItem(getGameSaveKey(gameId, user), JSON.stringify(data));
      return true;
    } catch (e) {
      return false;
    }
  }

  function isHttpOriginForOAuth() {
    try {
      return window.location.protocol === 'https:' ||
        (window.location.protocol === 'http:' &&
          (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'));
    } catch (e) {
      return false;
    }
  }

  function getClientId(authObj, defaultId = '') {
    try {
      const qp = new URLSearchParams(window.location.search).get('google_client_id');
      if (qp && qp.trim()) return qp.trim();
    } catch (e) { /* ignore */ }
    return ((authObj && authObj.clientId) || defaultId || '').trim();
  }

  global.ArcadeSSO = {
    SSO_STORAGE_KEY,
    LEGACY_CANYON_AUTH_KEY,
    AVATAR_PALETTE,
    pickAvatarColor,
    hashUid,
    decodeJwtPayload,
    sanitizeAuth,
    loadAuth,
    saveAuth,
    getGameSaveKey,
    readGameSave,
    writeGameSave,
    isHttpOriginForOAuth,
    getClientId
  };
})(window);
