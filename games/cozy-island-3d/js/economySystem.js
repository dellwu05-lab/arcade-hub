/**
 * Week 4: Cozy General Store (Daily Rotation + Hot Item x1.5 + Batch Sell),
 * Batch DIY Workbench (x1 / x3 / x5 / MAX), and 3-Stage House Expansion.
 */
export class EconomySystem {
  constructor(recipesData, inventory, saveManager) {
    this.data = recipesData;
    this.inventory = inventory;
    this.saveManager = saveManager;
    this.recipes = recipesData.recipes || [];
    this.shopPool = recipesData.shopPool || [];
    this.houseStages = recipesData.houseStages || [];

    this._refreshDailySeed();
  }

  _refreshDailySeed() {
    const now = new Date();
    const key = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
    let hash = 2166136261;
    for (let i = 0; i < key.length; i++) {
      hash ^= key.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    this.dayKey = key;
    this.daySeed = Math.abs(hash);

    // Pick 4 unique daily featured furniture items
    const pool = [...this.shopPool];
    const picked = [];
    let s = this.daySeed || 1337;
    while (picked.length < 4 && pool.length) {
      s = (s * 1664525 + 1013904223) >>> 0;
      const idx = s % pool.length;
      picked.push(pool.splice(idx, 1)[0]);
    }
    // Always guarantee at least 1 indoor cozy item in today's stock
    const indoorMust = ['cozy_bed', 'bookshelf', 'round_rug', 'tea_table'];
    if (!picked.some((id) => indoorMust.includes(id))) {
      picked[0] = indoorMust[this.daySeed % indoorMust.length];
    }
    this.dailyStock = picked;

    // Daily Hot Category (1.5x sell bonus!)
    const hotCats = [
      { category: 'fish', label: '🐟 今日高價收購：所有魚類 ×1.5 倍！' },
      { category: 'bug', label: '🦋 今日高價收購：所有昆蟲 ×1.5 倍！' },
      { category: 'fossil', label: '🦴 今日高價收購：所有化石 ×1.5 倍！' }
    ];
    this.hotBonus = hotCats[this.daySeed % hotCats.length];
  }

  getSellPrice(itemId) {
    const def = this.inventory.getDef(itemId);
    if (!def) return 0;
    const base = def.sellPrice || 50;
    return def.category === this.hotBonus.category ? Math.round(base * 1.5) : base;
  }

  isHotItem(itemId) {
    const def = this.inventory.getDef(itemId);
    return Boolean(def && def.category === this.hotBonus.category);
  }

  buyItem(itemId) {
    const def = this.inventory.getDef(itemId);
    if (!def) return { ok: false, reason: '找不到商品' };
    const price = def.buyPrice || Math.max(200, (def.sellPrice || 100) * 3);
    if (this.saveManager.data.bells < price) {
      return { ok: false, reason: `鈴錢不足（需要 ${price.toLocaleString()} 鈴錢）` };
    }
    if (!this.inventory.addItem(itemId, 1)) {
      return { ok: false, reason: '背包已滿（20 格）！請先售出部分物品' };
    }
    this.saveManager.data.bells -= price;
    this.saveManager.data.miles += 15;
    this.saveManager.scheduleSave();
    return { ok: true, def, price };
  }

  sellSlotOne(slotIdx) {
    const slot = this.inventory.getSlots()[slotIdx];
    if (!slot) return { ok: false };
    const def = this.inventory.getDef(slot.itemId);
    if (!def) return { ok: false };
    const gain = this.getSellPrice(slot.itemId);
    slot.count -= 1;
    if (slot.count <= 0) this.inventory.getSlots()[slotIdx] = null;
    this.saveManager.data.bells += gain;
    this.saveManager.scheduleSave();
    return { ok: true, def, gain, isHot: this.isHotItem(def.id) };
  }

  sellAllHarvests() {
    let totalGain = 0;
    let totalItems = 0;
    for (let i = 0; i < this.inventory.getSlots().length; i++) {
      const sl = this.inventory.getSlots()[i];
      if (!sl) continue;
      const def = this.inventory.getDef(sl.itemId);
      if (!def) continue;
      if (def.category === 'fish' || def.category === 'bug' || def.category === 'fossil' || sl.itemId === 'island_fruit') {
        totalGain += this.getSellPrice(sl.itemId) * sl.count;
        totalItems += sl.count;
        this.inventory.getSlots()[i] = null;
      }
    }
    if (totalItems > 0) {
      this.saveManager.data.bells += totalGain;
      this.saveManager.data.miles += 25;
      this.saveManager.scheduleSave();
    }
    return { totalItems, totalGain };
  }

  isRecipeUnlocked(recipe) {
    if (!recipe || !recipe.rare) return true;
    const list = this.saveManager.data.unlockedRecipes || [];
    return list.includes(recipe.id);
  }

  getMaxCraftable(recipe) {
    if (!recipe || !recipe.ingredients?.length || !this.isRecipeUnlocked(recipe)) return 0;
    let maxN = 99;
    for (const ing of recipe.ingredients) {
      const owned = this.inventory.countItem(ing.itemId);
      maxN = Math.min(maxN, Math.floor(owned / ing.count));
    }
    return Math.max(0, maxN);
  }

  craftBatch(recipeId, requestedQty = 1) {
    const recipe = this.recipes.find((r) => r.id === recipeId);
    if (!recipe) return { ok: false, reason: '找不到藍圖' };
    if (!this.isRecipeUnlocked(recipe)) return { ok: false, reason: recipe.unlockHint || '尚未解鎖此稀有藍圖' };
    const maxN = this.getMaxCraftable(recipe);
    const qty = Math.min(requestedQty, maxN);
    if (qty <= 0) return { ok: false, reason: '材料不足！用斧頭伐木或鏟子敲石收集素材吧' };

    // Verify bag capacity by trying addItem after removing ingredients (or rollback)
    const totalOut = qty * (recipe.yield || 1);
    for (const ing of recipe.ingredients) {
      this.inventory.removeItem(ing.itemId, ing.count * qty);
    }
    const added = this.inventory.addItem(recipe.outputId, totalOut);
    if (!added) {
      // Rollback materials if bag completely full
      for (const ing of recipe.ingredients) {
        this.inventory.addItem(ing.itemId, ing.count * qty);
      }
      return { ok: false, reason: '背包空間不足！請先清出空位' };
    }

    this.saveManager.data.miles += 20 * qty;
    this.saveManager.scheduleSave();
    const def = this.inventory.getDef(recipe.outputId);
    return { ok: true, def, craftedCount: totalOut, batches: qty };
  }

  getHouseStageInfo(stage = this.saveManager.data.houseStage || 0) {
    return this.houseStages[Math.max(0, Math.min(this.houseStages.length - 1, stage))] || {
      stage: 0, name: '黃頂露營帳篷', icon: '⛺', gridSize: 6, upgradeCost: 0
    };
  }

  getNextHouseStageInfo() {
    const cur = this.saveManager.data.houseStage || 0;
    if (cur >= this.houseStages.length - 1) return null;
    return this.houseStages[cur + 1];
  }

  upgradeHouse() {
    const next = this.getNextHouseStageInfo();
    if (!next) return { ok: false, reason: '小屋已達最高擴建階段！' };
    if (this.saveManager.data.bells < next.upgradeCost) {
      return { ok: false, reason: `鈴錢不足（需要 ${next.upgradeCost.toLocaleString()} 鈴錢）` };
    }
    this.saveManager.data.bells -= next.upgradeCost;
    this.saveManager.data.houseStage = next.stage;
    this.saveManager.data.upgrades.house = next.stage;
    this.saveManager.data.miles += 150;
    this.saveManager.saveNow();
    return { ok: true, stageInfo: next };
  }
}
