import * as THREE from '../vendor/three.module.min.js';
import { GROUND_Y, TILE_SIZE, GRID_SIZE } from './config.js';
import { makeCozyMaterial } from './rollingShader.js';
import { TILE_TYPE } from './islandWorld.js';

export const TOOLS = [
  { id: 'hand',   key: '1', icon: '✋', name: '徒手' },
  { id: 'rod',    key: '2', icon: '🎣', name: '釣竿' },
  { id: 'net',    key: '3', icon: '🥅', name: '捕蟲網' },
  { id: 'axe',    key: '4', icon: '🪓', name: '輕巧斧' },
  { id: 'shovel', key: '5', icon: '⛏️', name: '鏟子' },
  { id: 'water',  key: '6', icon: '🚿', name: '澆花壺' }
];

export class GatheringSystem {
  constructor(scene, world, creatures, inventory, saveManager, audio, callbacks = {}) {
    this.scene = scene;
    this.world = world;
    this.creatures = creatures;
    this.inventory = inventory;
    this.saveManager = saveManager;
    this.audio = audio;
    this.callbacks = callbacks;

    this.equippedTool = saveManager.data.equippedTool || 'hand';
    this.swingAnim = 0;

    // 1. Fishing state machine
    this.fishShadows = [];
    this.fishing = {
      state: 'idle', // idle | waiting | nibbling | bite
      bobberX: 0, bobberZ: 0,
      habitat: 'river',
      targetFish: null,
      nibblesLeft: 0,
      timer: 0,
      rippleT: 0
    };

    // 2. Bugs
    this.bugs = [];
    // 3. Fossil star spots & strikeable rocks
    this.fossilSpots = [];
    this.rockHits = new Map();
    this.treeChops = new Map();
    // 4. Watering / dig burst droplets
    this.bursts = [];

    this._initFishingVisuals();
    this._spawnFishShadows();
    this._spawnBugs();
    this._spawnFossilSpots();
  }

  setTool(toolId) {
    if (!TOOLS.some((t) => t.id === toolId)) return;
    if (this.fishing.state !== 'idle') this.cancelFishing();
    this.equippedTool = toolId;
    this.saveManager.data.equippedTool = toolId;
    this.saveManager.scheduleSave();
  }

  _initFishingVisuals() {
    this.bobberGroup = new THREE.Group();
    const top = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      makeCozyMaterial(0xe63946, { noGrain: true })
    );
    const bot = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 10, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
      makeCozyMaterial(0xfffdf5, { noGrain: true })
    );
    this.bobberGroup.add(top, bot);
    this.bobberGroup.visible = false;
    this.scene.add(this.bobberGroup);

    const ringGeo = new THREE.RingGeometry(0.18, 0.28, 20);
    ringGeo.rotateX(-Math.PI / 2);
    this.rippleMat = makeCozyMaterial(0xe0f7ff, { transparent: true, opacity: 0.7, noGrain: true, side: THREE.DoubleSide });
    this.rippleMesh = new THREE.Mesh(ringGeo, this.rippleMat);
    this.rippleMesh.visible = false;
    this.scene.add(this.rippleMesh);
  }

  _spawnFishShadows() {
    const shadowMat = makeCozyMaterial(0x0c344d, { transparent: true, opacity: 0.62, noGrain: true });
    const riverSpots = [[30.5, 16], [30.5, 20.5], [31.5, 28.5], [35.5, 31.5]];
    const seaSpots = [[3, 20], [16, 44], [30, 44], [44, 24]];

    const makeFish = (gx, gz, habitat) => {
      const p = this.world.gridToWorld(gx, gz);
      const grp = new THREE.Group();
      const size = ['small', 'medium', 'large'][Math.floor(Math.random() * 3)];
      const sc = size === 'small' ? 0.65 : (size === 'large' ? 1.25 : 0.92);
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), shadowMat);
      body.scale.set(0.55, 0.22, 1.45);
      const tail = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.34, 4), shadowMat);
      tail.rotation.x = Math.PI / 2;
      tail.position.z = -0.45;
      grp.add(body, tail);
      grp.scale.setScalar(sc);
      grp.position.set(p.x, GROUND_Y.WATER + 0.03, p.z);
      this.scene.add(grp);
      this.fishShadows.push({
        grp, tail, homeX: p.x, homeZ: p.z, x: p.x, z: p.z,
        yaw: Math.random() * Math.PI * 2, phase: Math.random() * 6,
        habitat, size, alive: true, respawnTimer: 0
      });
    };

    riverSpots.forEach(([gx, gz]) => makeFish(gx, gz, 'river'));
    seaSpots.forEach(([gx, gz]) => makeFish(gx, gz, 'sea'));
  }

  _spawnBugs() {
    const spots = [
      [15, 23], [24, 31], [13, 32], [28, 18], [36, 20], [18, 13], [21, 35]
    ];
    spots.forEach(([gx, gz], idx) => {
      const p = this.world.gridToWorld(gx, gz);
      const def = this.creatures.bugs[idx % this.creatures.bugs.length];
      const grp = new THREE.Group();
      const col = new THREE.Color(def.color || '#f7f7f2');
      const wingMat = makeCozyMaterial(col, { noGrain: true, emissive: def.id === 'bug_firefly' ? 0xd9f99d : 0x000000, emissiveIntensity: def.id === 'bug_firefly' ? 0.9 : 0 });
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), makeCozyMaterial(0x2b2420, { noGrain: true }));
      body.scale.set(0.7, 0.7, 1.6);
      const wL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.03, 0.18), wingMat);
      wL.position.x = -0.14;
      const wR = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.03, 0.18), wingMat);
      wR.position.x = 0.14;
      grp.add(body, wL, wR);
      const yBase = this.world.getGroundHeight(p.x, p.z) + (def.behavior === 'fly' ? 0.85 : 0.18);
      grp.position.set(p.x, yBase, p.z);
      this.scene.add(grp);
      this.bugs.push({
        grp, wL, wR, def, homeX: p.x, homeZ: p.z, x: p.x, z: p.z,
        yBase, yaw: Math.random() * 6, phase: Math.random() * 6,
        alive: true, respawnTimer: 0
      });
    });
  }

  _spawnFossilSpots() {
    const spots = [[12, 24], [25, 30], [36, 28], [18, 15]];
    const markMat = makeCozyMaterial(0x4a3525, { noGrain: true });
    spots.forEach(([gx, gz], idx) => {
      const p = this.world.gridToWorld(gx, gz);
      const y = this.world.getGroundHeight(p.x, p.z);
      const grp = new THREE.Group();
      for (let i = 0; i < 3; i++) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.035, 0.1), markMat);
        bar.rotation.y = (i * Math.PI) / 3;
        grp.add(bar);
      }
      grp.position.set(p.x, y + 0.025, p.z);
      this.scene.add(grp);
      this.fossilSpots.push({
        id: `fossil_spot_${idx}`, gx, gz, x: p.x, y, z: p.z, grp, dug: false
      });
    });
  }

  _pickCreature(list, filterFn) {
    const pool = list.filter(filterFn);
    const arr = pool.length ? pool : list;
    return arr[Math.floor(Math.random() * arr.length)];
  }

  _recordEncyclopedia(bucket, creature, extra = {}) {
    if (!this.saveManager.data.encyclopedia) {
      this.saveManager.data.encyclopedia = { fish: {}, bugs: {}, fossils: {} };
    }
    const map = this.saveManager.data.encyclopedia[bucket];
    const isNew = !map[creature.id];
    const prev = map[creature.id] || { count: 0, maxCm: 0 };
    map[creature.id] = {
      count: prev.count + 1,
      maxCm: Math.max(prev.maxCm || 0, extra.cm || 0)
    };
    return isNew;
  }

  cancelFishing() {
    this.fishing.state = 'idle';
    this.fishing.targetFish = null;
    this.bobberGroup.visible = false;
    this.rippleMesh.visible = false;
  }

  _spawnBurst(x, y, z, colorHex, count = 8) {
    const mat = makeCozyMaterial(colorHex, { noGrain: true, transparent: true, opacity: 0.85 });
    const geo = new THREE.SphereGeometry(0.08, 6, 6);
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      this.scene.add(m);
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.4;
      this.bursts.push({
        mesh: m,
        vx: Math.cos(a) * (1.2 + Math.random() * 1.2),
        vy: 2.2 + Math.random() * 1.5,
        vz: Math.sin(a) * (1.2 + Math.random() * 1.2),
        life: 0.55
      });
    }
  }

  /**
   * Executes the currently equipped tool action.
   * Returns true if the tool handled the action (preventing generic hand interaction).
   */
  useTool(playerState, phaseKey, isRain) {
    const tool = this.equippedTool;
    if (tool === 'hand') return false;

    const ax = playerState.x + Math.sin(playerState.yaw) * 1.75;
    const az = playerState.z + Math.cos(playerState.yaw) * 1.75;

    // 1. FISHING ROD
    if (tool === 'rod') {
      if (this.fishing.state === 'bite') {
        const fishObj = this.fishing.targetFish;
        const habitat = this.fishing.habitat;
        const isNight = phaseKey === 'night';
        const picked = this._pickCreature(this.creatures.fish, (f) => {
          if (f.habitat !== habitat) return false;
          if (f.time === 'rain' && !isRain) return false;
          if (f.time === 'night' && !isNight) return false;
          if (f.time === 'day' && isNight) return false;
          return true;
        });
        const cm = Math.round(picked.minCm + Math.random() * (picked.maxCm - picked.minCm));
        const isNew = this._recordEncyclopedia('fish', picked, { cm });
        this.inventory.addItem(picked.id, 1);
        this.saveManager.data.miles += isNew ? 60 : 25;
        this.saveManager.scheduleSave();

        if (fishObj) {
          fishObj.alive = false;
          fishObj.grp.visible = false;
          fishObj.respawnTimer = 14;
        }
        this.cancelFishing();
        this.swingAnim = 0.45;
        this.audio.playCatchFanfare();
        this.callbacks.onCatch?.({
          kind: 'fish', creature: picked, detail: `${cm} cm · 售價 ${picked.price.toLocaleString()} 鈴錢`, isNew
        });
        return true;
      }

      if (this.fishing.state !== 'idle') {
        const f = this.fishing.targetFish;
        this.cancelFishing();
        if (f) { f.alive = false; f.grp.visible = false; f.respawnTimer = 10; }
        this.audio.playSplash();
        this.callbacks.onToast?.('🎣 太早收竿了，魚影被嚇跑囉！等「❗ 咬鉤了！」再拉竿');
        return true;
      }

      // Cast bobber 2.8 units ahead; check if water/river
      const cx = playerState.x + Math.sin(playerState.yaw) * 2.85;
      const cz = playerState.z + Math.cos(playerState.yaw) * 2.85;
      const { gx, gz } = this.world.worldToGrid(cx, cz);
      const t = this.world.getTile(gx, gz);
      if (t !== TILE_TYPE.WATER && t !== TILE_TYPE.RIVER) {
        this.callbacks.onToast?.('🎣 請面向河邊或海岸線拋竿喔！');
        return true;
      }

      this.swingAnim = 0.35;
      this.audio.playSplash();
      this._spawnBurst(cx, GROUND_Y.WATER + 0.1, cz, 0xdcf4ff, 6);
      this.fishing.bobberX = cx;
      this.fishing.bobberZ = cz;
      this.fishing.habitat = t === TILE_TYPE.RIVER ? 'river' : 'sea';
      this.fishing.rippleT = 0.01;
      this.bobberGroup.position.set(cx, GROUND_Y.WATER + 0.06, cz);
      this.bobberGroup.visible = true;
      this.rippleMesh.position.set(cx, GROUND_Y.WATER + 0.04, cz);
      this.rippleMesh.visible = true;

      // Find nearest alive fish shadow within 6.5 units
      let nearestFish = null;
      let bestD = 6.8;
      for (const f of this.fishShadows) {
        if (!f.alive) continue;
        const d = Math.hypot(f.x - cx, f.z - cz);
        if (d < bestD) { bestD = d; nearestFish = f; }
      }
      this.fishing.targetFish = nearestFish;
      this.fishing.state = 'waiting';
      this.fishing.nibblesLeft = 1 + Math.floor(Math.random() * 3);
      this.fishing.timer = nearestFish ? (1.1 + Math.random() * 0.9) : (2.2 + Math.random() * 1.2);
      this.callbacks.onToast?.(nearestFish ? '🎣 浮標落水！有魚影靠近了，靜待咬鉤…' : '🎣 拋竿成功！靜靜等待魚兒上鉤…');
      return true;
    }

    // 2. BUG NET
    if (tool === 'net') {
      this.swingAnim = 0.38;
      this.audio.playNetSwoosh();
      let caught = null;
      let bestD = 2.4;
      for (const b of this.bugs) {
        if (!b.alive) continue;
        const d = Math.hypot(b.x - ax, b.z - az);
        if (d < bestD) { bestD = d; caught = b; }
      }
      if (caught) {
        caught.alive = false;
        caught.grp.visible = false;
        caught.respawnTimer = 16;
        const isNew = this._recordEncyclopedia('bugs', caught.def);
        this.inventory.addItem(caught.def.id, 1);
        this.saveManager.data.miles += isNew ? 55 : 20;
        this.saveManager.scheduleSave();
        this.audio.playCatchFanfare();
        this.callbacks.onCatch?.({
          kind: 'bug', creature: caught.def, detail: `售價 ${caught.def.price.toLocaleString()} 鈴錢`, isNew
        });
      } else {
        this.callbacks.onToast?.('🥅 咻！沒網到昆蟲，靠近蝴蝶或花叢小蟲再揮網吧');
      }
      return true;
    }

    // 3. AXE (gentle chop on trees for softwood / hardwood)
    if (tool === 'axe') {
      this.swingAnim = 0.36;
      const tree = this.world.trees.find((tr) => Math.hypot(tr.x - ax, tr.z - az) < 2.2);
      if (!tree) {
        this.audio.playNetSwoosh();
        this.callbacks.onToast?.('🪓 請靠近樹木揮動輕巧斧頭收集木材');
        return true;
      }
      tree.shakeTime = 0.45;
      const used = this.treeChops.get(tree.id) || 0;
      if (used >= 3) {
        this.audio.playTreeShake();
        this.callbacks.onToast?.('🪵 這棵樹今天的木材已經採集完囉（不會砍倒樹！）');
        return true;
      }
      this.treeChops.set(tree.id, used + 1);
      const woodId = Math.random() < 0.45 ? 'hardwood' : 'softwood';
      this.inventory.addItem(woodId, 1);
      this.saveManager.data.miles += 10;
      this.saveManager.scheduleSave();
      this.audio.playRockHit();
      this._spawnBurst(tree.x, tree.y + 1.0, tree.z, 0xc89b6e, 6);
      this.callbacks.onToast?.(woodId === 'hardwood' ? '🪓 獲得「硬木材 ×1」收入背包！' : '🪓 獲得「柔軟木材 ×1」收入背包！');
      return true;
    }

    // 4. SHOVEL (dig star fossil spots OR strike rocks for stone/clay/gold)
    if (tool === 'shovel') {
      this.swingAnim = 0.4;
      const fSpot = this.fossilSpots.find((s) => !s.dug && Math.hypot(s.x - ax, s.z - az) < 2.1);
      if (fSpot) {
        fSpot.dug = true;
        fSpot.grp.visible = false;
        const fossil = this.creatures.fossils[Math.floor(Math.random() * this.creatures.fossils.length)];
        const isNew = this._recordEncyclopedia('fossils', fossil);
        this.inventory.addItem(fossil.id, 1);
        this.saveManager.data.miles += isNew ? 70 : 30;
        this.saveManager.scheduleSave();
        this.audio.playDig();
        this.audio.playCatchFanfare();
        this._spawnBurst(fSpot.x, fSpot.y + 0.2, fSpot.z, 0x8d6346, 9);
        this.callbacks.onCatch?.({
          kind: 'fossil', creature: fossil, detail: `古生物化石 · 售價 ${fossil.price.toLocaleString()} 鈴錢`, isNew
        });
        return true;
      }

      // Check rock collider near target
      const rockIdx = this.world.colliders.findIndex((c) => c.r >= 0.75 && c.r <= 0.9 && Math.hypot(c.x - ax, c.z - az) < 2.2);
      if (rockIdx >= 0) {
        const rc = this.world.colliders[rockIdx];
        const hits = this.rockHits.get(rockIdx) || 0;
        if (hits >= 3) {
          this.audio.playRockHit();
          this.callbacks.onToast?.('🪨 這顆岩石今天的礦石已經敲完囉！');
          return true;
        }
        this.rockHits.set(rockIdx, hits + 1);
        const r = Math.random();
        const dropId = r < 0.08 ? 'gold_nugget' : (r < 0.42 ? 'clay' : 'stone');
        const labelMap = { gold_nugget: '✨ 稀有金礦石 ×1', clay: '🟤 黏土 ×1', stone: '🪨 石頭 ×1' };
        this.inventory.addItem(dropId, 1);
        this.saveManager.data.miles += dropId === 'gold_nugget' ? 50 : 12;
        this.saveManager.scheduleSave();
        this.audio.playRockHit();
        this._spawnBurst(rc.x, GROUND_Y.SAND + 0.5, rc.z, dropId === 'gold_nugget' ? 0xfbbf24 : 0x9ca7b5, 7);
        this.callbacks.onToast?.(`⛏️ 鏘！敲出 ${labelMap[dropId]} 收入背包！`);
        return true;
      }

      this.audio.playDig();
      this._spawnBurst(ax, playerState.y + 0.1, az, 0x8d6346, 5);
      this.callbacks.onToast?.('⛏️ 找找地面上的「星星裂縫」挖化石，或去海邊敲岩石喔！');
      return true;
    }

    // 5. WATERING CAN
    if (tool === 'water') {
      this.swingAnim = 0.42;
      this.audio.playWaterPour();
      this._spawnBurst(ax, playerState.y + 0.65, az, 0x7dd3fc, 10);
      this.saveManager.data.miles += 10;
      this.saveManager.scheduleSave();
      this.callbacks.onToast?.('🚿 嘩啦啦～幫花草澆水，小島充滿生機！(+10 里程)');
      return true;
    }

    return false;
  }

  getContextHint(playerState) {
    if (this.fishing.state === 'bite') return '❗ 咬鉤了！快按空白鍵拉竿！';
    if (this.fishing.state !== 'idle') return '🎣 靜待魚兒咬鉤…（按空白鍵可提前收竿）';
    if (this.equippedTool === 'hand') return null;

    const ax = playerState.x + Math.sin(playerState.yaw) * 1.75;
    const az = playerState.z + Math.cos(playerState.yaw) * 1.75;

    if (this.equippedTool === 'rod') {
      const cx = playerState.x + Math.sin(playerState.yaw) * 2.85;
      const cz = playerState.z + Math.cos(playerState.yaw) * 2.85;
      const { gx, gz } = this.world.worldToGrid(cx, cz);
      const t = this.world.getTile(gx, gz);
      if (t === TILE_TYPE.WATER || t === TILE_TYPE.RIVER) return '🎣 拋出浮標釣魚';
      return null;
    }
    if (this.equippedTool === 'net') {
      const b = this.bugs.find((bug) => bug.alive && Math.hypot(bug.x - ax, bug.z - az) < 2.6);
      return b ? `🥅 揮網捕捉 ${b.def.name}` : '🥅 揮動捕蟲網';
    }
    if (this.equippedTool === 'axe') {
      const tr = this.world.trees.find((t) => Math.hypot(t.x - ax, t.z - az) < 2.2);
      return tr ? '🪓 輕砍樹木採集木材' : null;
    }
    if (this.equippedTool === 'shovel') {
      const fs = this.fossilSpots.find((s) => !s.dug && Math.hypot(s.x - ax, s.z - az) < 2.1);
      if (fs) return '⛏️ 挖掘星星裂縫（化石！）';
      const rk = this.world.colliders.find((c) => c.r >= 0.75 && c.r <= 0.9 && Math.hypot(c.x - ax, c.z - az) < 2.2);
      if (rk) return '⛏️ 敲擊岩石採礦';
      return null;
    }
    if (this.equippedTool === 'water') return '🚿 澆水滋潤花草';
    return null;
  }

  update(dt, elapsed, playerPos) {
    if (this.swingAnim > 0) this.swingAnim = Math.max(0, this.swingAnim - dt);

    // Update fish shadows
    for (const f of this.fishShadows) {
      if (!f.alive) {
        f.respawnTimer -= dt;
        if (f.respawnTimer <= 0) { f.alive = true; f.grp.visible = true; f.x = f.homeX; f.z = f.homeZ; }
        continue;
      }
      if (this.fishing.state !== 'idle' && this.fishing.targetFish === f) {
        const dx = this.fishing.bobberX - f.x;
        const dz = this.fishing.bobberZ - f.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.45) {
          f.x += (dx / d) * dt * 1.45;
          f.z += (dz / d) * dt * 1.45;
        }
        f.yaw = Math.atan2(dx, dz);
      } else {
        f.phase += dt * 0.65;
        f.x = f.homeX + Math.cos(f.phase) * 1.3;
        f.z = f.homeZ + Math.sin(f.phase * 0.8) * 1.3;
        f.yaw = Math.atan2(-Math.sin(f.phase), Math.cos(f.phase * 0.8) * 0.8);
      }
      f.grp.position.set(f.x, GROUND_Y.WATER + 0.03, f.z);
      f.grp.rotation.y = f.yaw;
      f.tail.rotation.z = Math.sin(elapsed * 8 + f.phase) * 0.35;
    }

    // Update fishing state machine
    if (this.fishing.state !== 'idle') {
      // Auto-cancel if player walks too far from bobber
      if (Math.hypot(playerPos.x - this.fishing.bobberX, playerPos.z - this.fishing.bobberZ) > 5.2) {
        this.cancelFishing();
      } else {
        this.fishing.timer -= dt;
        if (this.fishing.state === 'waiting' || this.fishing.state === 'nibbling') {
          this.bobberGroup.position.y = GROUND_Y.WATER + 0.06 + Math.sin(elapsed * 4.5) * 0.03;
          if (this.fishing.timer <= 0) {
            if (this.fishing.nibblesLeft > 0) {
              this.fishing.nibblesLeft--;
              this.fishing.state = 'nibbling';
              this.fishing.timer = 0.85 + Math.random() * 0.8;
              this.fishing.rippleT = 0.01;
              this.bobberGroup.position.y = GROUND_Y.WATER - 0.05;
              this.audio.playNibble();
            } else {
              this.fishing.state = 'bite';
              this.fishing.timer = 1.2; // Generous 1.2s cozy bite window
              this.fishing.rippleT = 0.01;
              this.audio.playBite();
              this._spawnBurst(this.fishing.bobberX, GROUND_Y.WATER + 0.15, this.fishing.bobberZ, 0xffffff, 8);
              this.callbacks.onToast?.('❗ 咬鉤了！快按空白鍵或點擊拉竿！');
            }
          }
        } else if (this.fishing.state === 'bite') {
          this.bobberGroup.position.y = GROUND_Y.WATER - 0.16;
          if (this.fishing.timer <= 0) {
            const tf = this.fishing.targetFish;
            this.cancelFishing();
            if (tf) { tf.alive = false; tf.grp.visible = false; tf.respawnTimer = 10; }
            this.callbacks.onToast?.('🐟 哎呀，魚兒溜走囉！再拋一次竿試試看');
          }
        }

        if (this.fishing.rippleT > 0) {
          this.fishing.rippleT += dt * 1.8;
          const sc = 0.6 + this.fishing.rippleT * 2.4;
          this.rippleMesh.scale.setScalar(sc);
          this.rippleMat.opacity = Math.max(0, 0.72 * (1 - this.fishing.rippleT));
          if (this.fishing.rippleT >= 1) this.fishing.rippleT = 0;
        }
      }
    }

    // Update fluttering 3D bugs
    for (const b of this.bugs) {
      if (!b.alive) {
        b.respawnTimer -= dt;
        if (b.respawnTimer <= 0) { b.alive = true; b.grp.visible = true; }
        continue;
      }
      b.phase += dt * (b.def.behavior === 'fly' ? 1.4 : 0.45);
      const rad = b.def.behavior === 'fly' ? 2.1 : 0.5;
      b.x = b.homeX + Math.cos(b.phase) * rad;
      b.z = b.homeZ + Math.sin(b.phase * 1.3) * rad;
      const hover = b.def.behavior === 'fly' ? Math.sin(elapsed * 5 + b.phase) * 0.2 : 0;
      b.grp.position.set(b.x, b.yBase + hover, b.z);
      b.grp.rotation.y = b.phase + Math.PI / 2;
      const flap = b.def.behavior === 'fly' ? Math.sin(elapsed * 22 + b.phase) * 0.65 : 0.1;
      b.wL.rotation.z = flap;
      b.wR.rotation.z = -flap;
    }

    // Update particle bursts
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const p = this.bursts[i];
      p.life -= dt;
      p.vy -= 7.8 * dt;
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += p.vz * dt;
      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        this.bursts.splice(i, 1);
      }
    }
  }
}
