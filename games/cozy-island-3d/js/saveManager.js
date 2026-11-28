import { GAME_ID, detectRealSeason } from './config.js';

const SSO = window.ArcadeSSO || null;

function createDefaultSave() {
  return {
    schemaVersion: 1,
    savedAt: Date.now(),
    // Top-level mirrors for Arcade Hub stats card & lucky wheel compatibility
    coins: 500,
    bestScore: 100,
    islandStars: 1,
    ownedItems: ['camping_tent', 'island_map', 'lantern'],
    upgrades: { house: 0, tools: 0, plaza: 1 },
    // Detailed Cozy Island state
    islandName: '微風森友島',
    bells: 500,
    miles: 100,
    fruitsCollected: 0,
    villagerTalks: {},
    villagerFriendship: {},
    dailyQuests: {},
    unlockedRecipes: [],
    shakenTrees: {},
    starterGranted: false,
    equippedTool: 'hand',
    houseStage: 0,
    inventory: null,
    placedOutdoor: [],
    placedIndoor: [],
    paths: {},
    encyclopedia: { fish: {}, bugs: {}, fossils: {} },
    museum: { fish: [], bugs: [], fossils: [] },
    dailyMiles: {},
    playerPos: [0, 0.36, 5.8],
    settings: {
      clockMode: 'realtime',
      season: detectRealSeason(),
      weather: 'breeze',
      cameraPreset: 1,
      rollingCurve: true,
      muted: false
    }
  };
}

export class SaveManager {
  constructor(onAuthChange) {
    this.onAuthChange = onAuthChange;
    this.auth = SSO ? SSO.loadAuth() : { currentUser: null, savedAccounts: [] };
    this.data = this.load();
    this._saveTimer = null;

    // Listen to Arcade Hub SSO updates when running inside iframe or other tab
    window.addEventListener('message', (ev) => {
      if (ev.data && ev.data.type === 'ARCADE_SSO_SYNC' && ev.data.auth) {
        const nextAuth = SSO ? SSO.sanitizeAuth(ev.data.auth) : ev.data.auth;
        const prevUid = this.auth.currentUser?.uid || null;
        const nextUid = nextAuth.currentUser?.uid || null;
        this.auth = nextAuth;
        if (prevUid !== nextUid) {
          this.data = this.load();
          if (this.onAuthChange) this.onAuthChange(this.getUser(), this.data);
        }
      }
    });

    window.addEventListener('storage', (ev) => {
      if (SSO && ev.key === SSO.SSO_STORAGE_KEY) {
        this.auth = SSO.loadAuth();
        this.data = this.load();
        if (this.onAuthChange) this.onAuthChange(this.getUser(), this.data);
      }
    });
  }

  getUser() {
    return this.auth?.currentUser || null;
  }

  getDisplayName() {
    const u = this.getUser();
    return u ? (u.name || u.email || '島民') : '旅人訪客';
  }

  load() {
    const def = createDefaultSave();
    let raw = null;
    try {
      if (SSO) {
        raw = SSO.readGameSave(GAME_ID, this.getUser());
      } else {
        const str = localStorage.getItem(`arcade_save_${GAME_ID}_guest`);
        raw = str ? JSON.parse(str) : null;
      }
    } catch {
      raw = null;
    }
    if (!raw || typeof raw !== 'object') return def;

    // Sync bells if Arcade Hub lucky wheel added to `raw.coins`
    const coinsFromHub = Number(raw.coins);
    const bellsSaved = Number(raw.bells);
    const syncedBells = Number.isFinite(coinsFromHub) && coinsFromHub > (Number.isFinite(bellsSaved) ? bellsSaved : 0)
      ? coinsFromHub
      : (Number.isFinite(bellsSaved) ? bellsSaved : def.bells);

    const rawMus = raw.museum && typeof raw.museum === 'object' ? raw.museum : {};
    return {
      ...def,
      ...raw,
      bells: syncedBells,
      coins: syncedBells,
      houseStage: Number.isFinite(Number(raw.houseStage)) ? Math.max(0, Math.min(2, Number(raw.houseStage))) : 0,
      placedIndoor: Array.isArray(raw.placedIndoor) ? raw.placedIndoor : [],
      villagerFriendship: raw.villagerFriendship && typeof raw.villagerFriendship === 'object' ? { ...raw.villagerFriendship } : {},
      dailyQuests: raw.dailyQuests && typeof raw.dailyQuests === 'object' ? { ...raw.dailyQuests } : {},
      unlockedRecipes: Array.isArray(raw.unlockedRecipes) ? [...raw.unlockedRecipes] : [],
      museum: {
        fish: Array.isArray(rawMus.fish) ? [...rawMus.fish] : [],
        bugs: Array.isArray(rawMus.bugs) ? [...rawMus.bugs] : [],
        fossils: Array.isArray(rawMus.fossils) ? [...rawMus.fossils] : []
      },
      dailyMiles: raw.dailyMiles && typeof raw.dailyMiles === 'object' ? { ...raw.dailyMiles } : {},
      settings: { ...def.settings, ...(raw.settings || {}) },
      villagerTalks: { ...(raw.villagerTalks || {}) },
      shakenTrees: { ...(raw.shakenTrees || {}) },
      upgrades: { ...def.upgrades, ...(raw.upgrades || {}) }
    };
  }

  saveNow() {
    this.data.savedAt = Date.now();
    this.data.coins = this.data.bells;
    this.data.bestScore = this.data.miles;
    this.data.upgrades.house = this.data.houseStage || 0;
    const talkCount = Object.values(this.data.villagerTalks || {}).reduce((a, b) => a + (Number(b) || 0), 0);
    const rareCount = (this.data.unlockedRecipes || []).length;
    const enc = this.data.encyclopedia || {};
    const encCount = Object.keys(enc.fish || {}).length + Object.keys(enc.bugs || {}).length + Object.keys(enc.fossils || {}).length;
    const mus = this.data.museum || {};
    const musCount = (mus.fish?.length || 0) + (mus.bugs?.length || 0) + (mus.fossils?.length || 0);
    this.data.islandStars = Math.min(
      15,
      1 + (this.data.houseStage || 0) * 2 + rareCount + Math.floor(musCount / 3) + Math.floor((this.data.fruitsCollected || 0) / 3) + Math.floor(talkCount / 2)
    );

    try {
      if (SSO) {
        SSO.writeGameSave(GAME_ID, this.getUser(), this.data);
      } else {
        localStorage.setItem(`arcade_save_${GAME_ID}_guest`, JSON.stringify(this.data));
      }
    } catch {
      // Ignore quota errors gracefully
    }

    // Notify parent Arcade Hub iframe if embedded
    if (window.parent && window.parent !== window) {
      try {
        window.parent.postMessage({
          type: 'ARCADE_GAME_STATS',
          gameId: GAME_ID,
          stats: {
            coins: this.data.bells,
            bestScore: this.data.miles,
            stars: this.data.islandStars,
            maxStars: 15,
            charsUnlocked: Math.max((this.data.ownedItems || []).length, encCount),
            charsTotal: 32,
            upgradeLevel: Object.values(this.data.upgrades || {}).reduce((a, b) => a + (Number(b) || 0), 0),
            upgradeMax: 15
          }
        }, '*');
      } catch {
        // Ignore cross-origin postMessage errors
      }
    }
  }

  scheduleSave() {
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => this.saveNow(), 450);
  }
}
