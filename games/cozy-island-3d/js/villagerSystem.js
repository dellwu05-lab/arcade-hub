/**
 * Week 5: 4-Villager Deepening System
 * - Daily schedule lookup (morning / day / sunset / night / rain)
 * - Friendship levels (Lv.1 -> Lv.5) & daily gifting with favorite categories
 * - Daily mini-requests (quests) & unlockable rare DIY blueprints
 */

const LEVEL_THRESHOLDS = [0, 30, 70, 120, 180];

export class VillagerSystem {
  constructor(villagerDefs, inventory, saveManager) {
    this.defs = villagerDefs || [];
    this.inventory = inventory;
    this.saveManager = saveManager;
    this._initDaySeed();
  }

  _initDaySeed() {
    const now = new Date();
    this.dayKey = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
    let h = 2166136261;
    for (let i = 0; i < this.dayKey.length; i++) {
      h ^= this.dayKey.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    this.daySeed = Math.abs(h) || 42;
    this._ensureDailyQuestBucket();
  }

  _ensureDailyQuestBucket() {
    const dq = this.saveManager.data.dailyQuests || {};
    if (dq.dayKey !== this.dayKey || !dq.states) {
      this.saveManager.data.dailyQuests = { dayKey: this.dayKey, states: {} };
    }
  }

  getScheduleSlot(vDef, phaseKey) {
    if (!vDef?.schedule) {
      return { center: vDef?.wanderCenter || [0, 4], activity: '🌿 小島漫步中' };
    }
    return vDef.schedule[phaseKey] || vDef.schedule.day || { center: vDef.wanderCenter, activity: '🌿 小島漫步中' };
  }

  getFriendship(villagerId) {
    const map = this.saveManager.data.villagerFriendship || {};
    const rec = map[villagerId] || { xp: 0, giftedDay: '' };
    const xp = Number(rec.xp) || 0;
    let level = 1;
    for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
      if (xp >= LEVEL_THRESHOLDS[i]) {
        level = i + 1;
        break;
      }
    }
    const nextNeed = level < 5 ? LEVEL_THRESHOLDS[level] : LEVEL_THRESHOLDS[4];
    const prevBase = LEVEL_THRESHOLDS[level - 1];
    const pct = level >= 5 ? 100 : Math.min(100, Math.round(((xp - prevBase) / Math.max(1, nextNeed - prevBase)) * 100));
    return {
      xp,
      level,
      nextNeed,
      pct,
      giftedToday: rec.giftedDay === this.dayKey
    };
  }

  addFriendship(villagerId, delta, markGifted = false) {
    if (!this.saveManager.data.villagerFriendship) this.saveManager.data.villagerFriendship = {};
    const prev = this.saveManager.data.villagerFriendship[villagerId] || { xp: 0, giftedDay: '' };
    const before = this.getFriendship(villagerId).level;
    prev.xp = (Number(prev.xp) || 0) + delta;
    if (markGifted) prev.giftedDay = this.dayKey;
    this.saveManager.data.villagerFriendship[villagerId] = prev;

    const after = this.getFriendship(villagerId).level;
    const def = this.defs.find((d) => d.id === villagerId);
    let unlockedRare = null;
    if (after >= 3 && def?.rareRecipeId) {
      if (this.unlockRareRecipe(def.rareRecipeId)) {
        unlockedRare = def.rareName || def.rareRecipeId;
      }
    }
    this.saveManager.scheduleSave();
    return { leveledUp: after > before, level: after, unlockedRare };
  }

  unlockRareRecipe(recipeId) {
    if (!recipeId) return false;
    if (!Array.isArray(this.saveManager.data.unlockedRecipes)) {
      this.saveManager.data.unlockedRecipes = [];
    }
    if (this.saveManager.data.unlockedRecipes.includes(recipeId)) return false;
    this.saveManager.data.unlockedRecipes.push(recipeId);
    this.saveManager.scheduleSave();
    return true;
  }

  getUnlockedRareCount() {
    return (this.saveManager.data.unlockedRecipes || []).length;
  }

  getContextualDialogue(vDef, phaseKey, equippedTool, playerName) {
    const replace = (s) => s.replace(/\{player\}/g, playerName);
    if (equippedTool && equippedTool !== 'hand' && vDef.toolLines?.[equippedTool] && Math.random() < 0.48) {
      return replace(vDef.toolLines[equippedTool]);
    }
    const pool = vDef.dialogues?.[phaseKey] || vDef.dialogues?.day || ['今天的小島風好舒服喔！'];
    return replace(pool[Math.floor(Math.random() * pool.length)]);
  }

  giveGift(vDef, slotIdx) {
    const slots = this.inventory.getSlots();
    const slot = slots[slotIdx];
    if (!slot) return { ok: false, reason: '找不到要送的禮物' };
    const itemDef = this.inventory.getDef(slot.itemId);
    if (!itemDef) return { ok: false, reason: '物品資料不存在' };

    const fs = this.getFriendship(vDef.id);
    const isFav = (vDef.favoriteCats || []).includes(itemDef.category);
    const xpGain = fs.giftedToday ? (isFav ? 8 : 4) : (isFav ? 25 : 12);
    const returnBells = isFav ? 180 : 80;

    this.inventory.removeAtSlot(slotIdx, 1);
    this.saveManager.data.bells += returnBells;
    this.saveManager.data.miles += isFav ? 35 : 20;
    const prog = this.addFriendship(vDef.id, xpGain, true);

    const react = isFav
      ? `哇！！這是我最喜歡的「${itemDef.icon} ${itemDef.name}」！太感動了，謝謝你！這一點小心意（+${returnBells} 鈴錢）請收下💖`
      : `謝謝你送我「${itemDef.icon} ${itemDef.name}」！我會好好珍惜的，也回送你 ${returnBells} 鈴錢喔💕`;

    return {
      ok: true,
      itemDef,
      isFav,
      xpGain,
      returnBells,
      leveledUp: prog.leveledUp,
      level: prog.level,
      unlockedRare: prog.unlockedRare,
      reactionText: prog.unlockedRare
        ? `${react}\n✨ 因為我們成了好朋友，把珍藏的稀有藍圖「${prog.unlockedRare}」送給你！快去 DIY 工作台看看吧！`
        : react
    };
  }

  getDailyQuest(vDef) {
    this._ensureDailyQuestBucket();
    const templates = vDef.questTemplates || [];
    if (!templates.length) return null;
    const idx = (this.daySeed + this.defs.indexOf(vDef)) % templates.length;
    const tpl = templates[idx];
    const status = this.saveManager.data.dailyQuests.states[vDef.id] || 'available'; // available | active | done
    const have = this._countQuestProgress(tpl);
    return {
      ...tpl,
      villagerId: vDef.id,
      villagerName: vDef.name,
      rareRecipeId: vDef.rareRecipeId,
      rareName: vDef.rareName,
      status,
      have,
      ready: have >= tpl.count
    };
  }

  _countQuestProgress(tpl) {
    if (tpl.kind === 'item') {
      return this.inventory.countItem(tpl.itemId);
    }
    if (tpl.kind === 'category') {
      let sum = 0;
      for (const sl of this.inventory.getSlots()) {
        if (!sl) continue;
        const def = this.inventory.getDef(sl.itemId);
        if (def && def.category === tpl.category) sum += sl.count;
      }
      return sum;
    }
    return 0;
  }

  acceptQuest(vDef) {
    this._ensureDailyQuestBucket();
    const cur = this.saveManager.data.dailyQuests.states[vDef.id] || 'available';
    if (cur === 'done') return { ok: false, reason: '今天的委託已經完成囉！' };
    this.saveManager.data.dailyQuests.states[vDef.id] = 'active';
    this.saveManager.scheduleSave();
    return { ok: true, quest: this.getDailyQuest(vDef) };
  }

  completeQuest(vDef) {
    this._ensureDailyQuestBucket();
    const q = this.getDailyQuest(vDef);
    if (!q) return { ok: false, reason: '目前沒有委託' };
    if (q.status === 'done') return { ok: false, reason: '今日委託已完成' };
    if (!q.ready) return { ok: false, reason: `物品尚不足（目前 ${q.have}/${q.count}）` };

    // Deduct required items
    if (q.kind === 'item') {
      this.inventory.removeItem(q.itemId, q.count);
    } else if (q.kind === 'category') {
      let rem = q.count;
      const slots = this.inventory.getSlots();
      for (let i = 0; i < slots.length && rem > 0; i++) {
        const sl = slots[i];
        if (!sl) continue;
        const def = this.inventory.getDef(sl.itemId);
        if (def && def.category === q.category) {
          const take = Math.min(sl.count, rem);
          sl.count -= take;
          rem -= take;
          if (sl.count <= 0) slots[i] = null;
        }
      }
    }

    this.saveManager.data.dailyQuests.states[vDef.id] = 'done';
    this.saveManager.data.bells += q.bells;
    this.saveManager.data.miles += q.miles;
    const prog = this.addFriendship(vDef.id, 30, false);
    const newlyUnlocked = this.unlockRareRecipe(vDef.rareRecipeId);
    this.saveManager.saveNow();

    return {
      ok: true,
      bells: q.bells,
      miles: q.miles,
      level: prog.level,
      leveledUp: prog.leveledUp,
      unlockedRare: newlyUnlocked ? vDef.rareName : prog.unlockedRare
    };
  }
}
