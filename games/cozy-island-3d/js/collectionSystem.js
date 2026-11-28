/**
 * Week 6: Critterpedia (12 Fish / 12 Bugs / 8 Fossils),
 * Highland Museum Donation & Wing Evolution,
 * and Daily 4 Miles Goals + Miles Point Redemption Store.
 */

const DAILY_GOAL_POOL = [
  { id: 'g_talk',     metric: 'villagerTalks',   target: 2, icon: '💬', title: '森友日常問候',   desc: '與島上動物住民聊天 2 次',       rewardMiles: 120 },
  { id: 'g_place',    metric: 'furniturePlaced', target: 2, icon: '🪑', title: '小島美學佈置',   desc: '在室內或戶外擺放 2 件家具',     rewardMiles: 150 },
  { id: 'g_craft',    metric: 'itemsCrafted',    target: 2, icon: '🔨', title: '手作 DIY 達人',  desc: '使用 DIY 工作台製作 2 件物品',  rewardMiles: 150 },
  { id: 'g_gift',     metric: 'giftsGiven',      target: 1, icon: '🎁', title: '暖心送禮傳情',   desc: '送給任意動物住民 1 份禮物',     rewardMiles: 150 },
  { id: 'g_fruit',    metric: 'fruitsPicked',    target: 3, icon: '🍎', title: '現摘鮮果採收',   desc: '搖樹並撿起 3 顆島嶼鮮果',       rewardMiles: 120 },
  { id: 'g_fish',     metric: 'fishCaught',      target: 2, icon: '🎣', title: '悠閒河海垂釣',   desc: '在河流或海邊成功釣起 2 條魚',   rewardMiles: 180 },
  { id: 'g_bug',      metric: 'bugsCaught',      target: 2, icon: '🦋', title: '草地昆蟲觀察',   desc: '使用捕蟲網捕獲 2 隻昆蟲',       rewardMiles: 180 },
  { id: 'g_fossil',   metric: 'fossilsDug',      target: 1, icon: '🦴', title: '地底考古發掘',   desc: '用鏟子挖出 1 顆星星裂縫化石',   rewardMiles: 180 },
  { id: 'g_donate',   metric: 'museumDonated',   target: 1, icon: '🦉', title: '博物館學術貢獻', desc: '向高地博物館捐贈 1 件新標本',   rewardMiles: 200 },
  { id: 'g_shop',     metric: 'shopTrades',      target: 1, icon: '🏪', title: '雜貨店逛街趣',   desc: '在森友雜貨店購買或出售 1 次',   rewardMiles: 120 }
];

const MILES_REWARDS = [
  { id: 'm_bells_ticket', icon: '🎟️', name: '鈴錢兌換券',       cost: 250, kind: 'bells',  amount: 1500, desc: '立即兌換 1,500 鈴錢，擴建小屋與逛街超實用！' },
  { id: 'm_mat_pack',     icon: '🪵', name: '綜合建材補給包',   cost: 180, kind: 'bundle', items: [['softwood', 4], ['hardwood', 4], ['stone', 4], ['clay', 3]], desc: '一次補齊軟木×4、硬木×4、石頭×4、黏土×3！' },
  { id: 'm_owl_statue',   icon: '🦉', name: '博物館貓頭鷹雕像', cost: 400, kind: 'item',   itemId: 'owl_statue', count: 1, desc: '霧面砂岩雕塑的可愛貓頭鷹雕像（可室內外擺放）。' },
  { id: 'm_wish_pond',    icon: '⛲', name: '庭園許願池',       cost: 550, kind: 'item',   itemId: 'wish_pond',  count: 1, desc: '點綴蓮葉與小石燈的庭院許願水池（可室內外擺放）。' },
  { id: 'm_gold_nugget',  icon: '✨', name: '稀有金礦石',       cost: 750, kind: 'item',   itemId: 'gold_nugget', count: 1, desc: '閃亮稀有金礦石 ×1，可直接鍛造黃金森友獎盃！' }
];

export const MUSEUM_STAGES = [
  { stage: 0, need: 0,  icon: '⛺', name: '高地博物館帳篷',   desc: '剛起步的野外採集研究帳篷，累積 3 件館藏即可升級為磚瓦博物館！' },
  { stage: 1, need: 3,  icon: '🏛️', name: '溫馨磚瓦博物館',   desc: '設有專屬水族／昆蟲／化石展櫃！累積 10 件館藏可升級為圓頂大博物館！' },
  { stage: 2, need: 10, icon: '👑', name: '典雅圓頂大博物館', desc: '微風森友島最高榮耀文化地標！收藏全島自然奧秘的宏偉殿堂！' }
];

export class CollectionSystem {
  constructor(creatures, inventory, saveManager) {
    this.creatures = creatures || { fish: [], bugs: [], fossils: [] };
    this.inventory = inventory;
    this.saveManager = saveManager;
    this._initDaySeed();
    this._ensureBuckets();
  }

  _initDaySeed() {
    const now = new Date();
    this.dayKey = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
    let h = 2166136261;
    for (let i = 0; i < this.dayKey.length; i++) {
      h ^= this.dayKey.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    this.daySeed = Math.abs(h) || 77;
  }

  _ensureBuckets() {
    const d = this.saveManager.data;
    if (!d.encyclopedia) d.encyclopedia = { fish: {}, bugs: {}, fossils: {} };
    if (!d.encyclopedia.fish) d.encyclopedia.fish = {};
    if (!d.encyclopedia.bugs) d.encyclopedia.bugs = {};
    if (!d.encyclopedia.fossils) d.encyclopedia.fossils = {};
    if (!d.museum) d.museum = { fish: [], bugs: [], fossils: [] };
    if (!Array.isArray(d.museum.fish)) d.museum.fish = [];
    if (!Array.isArray(d.museum.bugs)) d.museum.bugs = [];
    if (!Array.isArray(d.museum.fossils)) d.museum.fossils = [];
    if (!d.dailyMiles || d.dailyMiles.dayKey !== this.dayKey) {
      d.dailyMiles = { dayKey: this.dayKey, counts: {}, claimed: [] };
    }
  }

  // ---- Critterpedia ----
  getBucketForItem(itemId) {
    if (this.creatures.fish.some((c) => c.id === itemId)) return 'fish';
    if (this.creatures.bugs.some((c) => c.id === itemId)) return 'bugs';
    if (this.creatures.fossils.some((c) => c.id === itemId)) return 'fossils';
    return null;
  }

  getCreatureDef(itemId) {
    return (
      this.creatures.fish.find((c) => c.id === itemId) ||
      this.creatures.bugs.find((c) => c.id === itemId) ||
      this.creatures.fossils.find((c) => c.id === itemId) ||
      null
    );
  }

  getEncyclopediaSummary() {
    this._ensureBuckets();
    const enc = this.saveManager.data.encyclopedia;
    const mus = this.saveManager.data.museum;
    const fishFound = Object.keys(enc.fish).length;
    const bugsFound = Object.keys(enc.bugs).length;
    const fossilsFound = Object.keys(enc.fossils).length;
    const totalFound = fishFound + bugsFound + fossilsFound;
    const totalSpecies = this.creatures.fish.length + this.creatures.bugs.length + this.creatures.fossils.length;
    const totalDonated = mus.fish.length + mus.bugs.length + mus.fossils.length;
    return {
      fishFound, fishTotal: this.creatures.fish.length, fishDonated: mus.fish.length,
      bugsFound, bugsTotal: this.creatures.bugs.length, bugsDonated: mus.bugs.length,
      fossilsFound, fossilsTotal: this.creatures.fossils.length, fossilsDonated: mus.fossils.length,
      totalFound, totalSpecies, totalDonated
    };
  }

  isDonated(bucket, id) {
    this._ensureBuckets();
    return (this.saveManager.data.museum[bucket] || []).includes(id);
  }

  getMuseumStage() {
    const { totalDonated } = this.getEncyclopediaSummary();
    if (totalDonated >= 10) return 2;
    if (totalDonated >= 3) return 1;
    return 0;
  }

  getMuseumStageInfo() {
    return MUSEUM_STAGES[this.getMuseumStage()];
  }

  // ---- Museum Donation ----
  getDonatableBagSlots() {
    this._ensureBuckets();
    const out = [];
    const seen = new Set();
    const slots = this.inventory.getSlots();
    slots.forEach((sl, idx) => {
      if (!sl) return;
      const bucket = this.getBucketForItem(sl.itemId);
      if (!bucket) return;
      if (this.isDonated(bucket, sl.itemId)) return;
      if (seen.has(sl.itemId)) return;
      seen.add(sl.itemId);
      const def = this.getCreatureDef(sl.itemId);
      if (def) out.push({ slotIdx: idx, bucket, def });
    });
    return out;
  }

  donateSlot(slotIdx) {
    this._ensureBuckets();
    const sl = this.inventory.getSlots()[slotIdx];
    if (!sl) return { ok: false, reason: '找不到要捐贈的標本' };
    const bucket = this.getBucketForItem(sl.itemId);
    if (!bucket) return { ok: false, reason: '這項物品不是博物館可收錄的標本' };
    if (this.isDonated(bucket, sl.itemId)) return { ok: false, reason: '博物館已經收藏過此標本囉！' };

    const def = this.getCreatureDef(sl.itemId);
    const prevStage = this.getMuseumStage();

    this.inventory.removeAtSlot(slotIdx, 1);
    this.saveManager.data.museum[bucket].push(sl.itemId);
    // Also ensure recorded in encyclopedia
    if (!this.saveManager.data.encyclopedia[bucket][sl.itemId]) {
      this.saveManager.data.encyclopedia[bucket][sl.itemId] = { count: 1, maxCm: 0 };
    }
    this.saveManager.data.miles += 120;
    this.saveManager.data.bells += (window.__ARCADE_ECO__ ? window.__ARCADE_ECO__.scale(200, 'bonus') : 200);
    this.recordProgress('museumDonated', 1);

    const nextStage = this.getMuseumStage();
    let stageUpgraded = null;
    if (nextStage > prevStage) {
      stageUpgraded = MUSEUM_STAGES[nextStage];
      this.saveManager.data.bells += (window.__ARCADE_ECO__ ? window.__ARCADE_ECO__.scale(500, 'bonus') : 500);
      if (nextStage === 1) this.inventory.addItem('owl_statue', 1);
    }

    this.saveManager.saveNow();
    return { ok: true, def, bucket, bells: 200, miles: 120, stageUpgraded };
  }

  donateAllFromBag() {
    const items = this.getDonatableBagSlots();
    if (!items.length) return { ok: false, count: 0, reason: '背包裡目前沒有尚未捐贈的新標本' };
    let count = 0;
    let totalBells = 0;
    let totalMiles = 0;
    let stageUpgraded = null;
    // Re-query each iteration since slot contents may shift to null
    for (const entry of items) {
      const slots = this.inventory.getSlots();
      const idx = slots.findIndex((s) => s && s.itemId === entry.def.id);
      if (idx < 0) continue;
      const res = this.donateSlot(idx);
      if (res.ok) {
        count++;
        totalBells += res.bells;
        totalMiles += res.miles;
        if (res.stageUpgraded) stageUpgraded = res.stageUpgraded;
      }
    }
    return { ok: count > 0, count, totalBells, totalMiles, stageUpgraded };
  }

  // ---- Daily 4 Miles Goals ----
  getDailyGoals() {
    this._ensureBuckets();
    // Deterministically pick 4 varied daily goals (always include at least 2 easy immediate-action goals)
    const easy = DAILY_GOAL_POOL.slice(0, 5);
    const explore = DAILY_GOAL_POOL.slice(5);
    const chosen = [
      easy[this.daySeed % easy.length],
      easy[(this.daySeed + 2) % easy.length],
      explore[this.daySeed % explore.length],
      explore[(this.daySeed + 3) % explore.length]
    ];
    const dm = this.saveManager.data.dailyMiles;
    return chosen.map((g) => {
      const progress = Number(dm.counts[g.metric]) || 0;
      const claimed = dm.claimed.includes(g.id);
      const completed = progress >= g.target;
      return { ...g, progress, claimed, completed };
    });
  }

  recordProgress(metric, amount = 1) {
    this._ensureBuckets();
    const before = this.getDailyGoals();
    const dm = this.saveManager.data.dailyMiles;
    dm.counts[metric] = (Number(dm.counts[metric]) || 0) + amount;
    this.saveManager.scheduleSave();

    const after = this.getDailyGoals();
    const newlyCompleted = after.filter((g, idx) => g.completed && !before[idx].completed && !g.claimed);
    return newlyCompleted;
  }

  claimGoal(goalId) {
    this._ensureBuckets();
    const goal = this.getDailyGoals().find((g) => g.id === goalId);
    if (!goal) return { ok: false, reason: '找不到里程目標' };
    if (goal.claimed) return { ok: false, reason: '今日已領取過此獎勵' };
    if (!goal.completed) return { ok: false, reason: `尚未達成（${goal.progress}/${goal.target}）` };

    this.saveManager.data.dailyMiles.claimed.push(goal.id);
    this.saveManager.data.miles += goal.rewardMiles;
    this.saveManager.saveNow();
    return { ok: true, goal, rewardMiles: goal.rewardMiles };
  }

  getUnclaimedGoalCount() {
    return this.getDailyGoals().filter((g) => g.completed && !g.claimed).length;
  }

  // ---- Miles Redemption Store ----
  getMilesCatalog() {
    return MILES_REWARDS;
  }

  redeemReward(rewardId) {
    const rw = MILES_REWARDS.find((r) => r.id === rewardId);
    if (!rw) return { ok: false, reason: '找不到兌換商品' };
    if (this.saveManager.data.miles < rw.cost) {
      return { ok: false, reason: `里程不足（需要 🎫 ${rw.cost}）` };
    }

    if (rw.kind === 'bells') {
      this.saveManager.data.miles -= rw.cost;
      this.saveManager.data.bells += (window.__ARCADE_ECO__ ? window.__ARCADE_ECO__.scale(rw.amount, 'bonus') : rw.amount);
      this.saveManager.saveNow();
      return { ok: true, rw, message: `🎟️ 兌換成功！獲得 +${rw.amount.toLocaleString()} 🪙 鈴錢！` };
    }

    if (rw.kind === 'bundle') {
      this.saveManager.data.miles -= rw.cost;
      rw.items.forEach(([id, c]) => this.inventory.addItem(id, c));
      this.saveManager.saveNow();
      return { ok: true, rw, message: `🪵 兌換成功！綜合建材補給包已收入背包！` };
    }

    if (rw.kind === 'item') {
      if (!this.inventory.addItem(rw.itemId, rw.count)) {
        return { ok: false, reason: '背包已滿，請先清出 1 格空間' };
      }
      this.saveManager.data.miles -= rw.cost;
      this.saveManager.saveNow();
      return { ok: true, rw, message: `${rw.icon} 兌換成功！「${rw.name}」已收入背包！` };
    }
    return { ok: false, reason: '未知兌換類型' };
  }
}
