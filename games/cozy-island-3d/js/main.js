import * as THREE from '../vendor/three.module.min.js';
import { CAMERA_PRESETS, SEASON_ORDER, SEASON_PALETTES, ROLLING_CURVE_STRENGTH } from './config.js';
import { rollingUniforms } from './rollingShader.js';
import { TimeWeatherSystem } from './timeWeather.js';
import { createPlayerModel, createHeldTools } from './proceduralAssets.js';
import { IslandWorld } from './islandWorld.js';
import { InputManager } from './inputManager.js';
import { CozyAudioEngine } from './audioEngine.js';
import { SaveManager } from './saveManager.js';
import { InventorySystem } from './inventorySystem.js';
import { BuildSystem } from './buildSystem.js';
import { GatheringSystem, TOOLS } from './gatheringSystem.js';
import { EconomySystem } from './economySystem.js';
import { IndoorSceneManager } from './indoorScene.js';
import { VillagerSystem } from './villagerSystem.js';
import { CollectionSystem } from './collectionSystem.js';

class CozyIslandApp {
  constructor() {
    this.saveManager = new SaveManager((user, data) => this._onAccountSwitched(user, data));
    this.save = this.saveManager.data;

    this.cameraPresetIdx = this.save.settings.cameraPreset ?? 1;
    this.rollingEnabled = this.save.settings.rollingCurve ?? true;
    rollingUniforms.uCurveStrength.value = this.rollingEnabled ? ROLLING_CURVE_STRENGTH : 0;

    this.audio = new CozyAudioEngine(this.save.settings.muted);
    this.islandData = null;
    this.itemCatalog = null;
    this.creaturesData = null;
    this.recipesData = null;

    this.playerState = {
      x: this.save.playerPos?.[0] ?? 0,
      y: this.save.playerPos?.[1] ?? 0.36,
      z: this.save.playerPos?.[2] ?? 5.8,
      yaw: 0,
      walkPhase: 0,
      stepAccum: 0
    };

    this.dialogueState = {
      open: false, speaker: '', tag: '', fullText: '',
      shownCount: 0, charTimer: 0, voicePitch: 480, activeVillager: null
    };

    this.bagOpen = false;
    this.shopOpen = false;
    this.shopTab = 'buy';
    this.diyOpen = false;
    this.villagersOpen = false;
    this.critterOpen = false;
    this.critterTab = 'fish';
    this.museumOpen = false;
    this.sceneMode = 'island';
    this.transitioning = false;
    this._savedOutdoorPos = null;

    this.selectedBagSlot = -1;
    this.nearestInteract = null;
    this.toastTimer = null;
    this.catchTimer = null;
    this._hudClockAccum = 0;

    this._init().catch((err) => {
      console.error('Cozy Island init failed:', err);
      this._showToast('載入小島時發生錯誤，請重新整理頁面。');
    });
  }

  async _init() {
    const [islandRes, itemsRes, creaturesRes, recipesRes] = await Promise.all([
      fetch('./data/island-data.json'),
      fetch('./data/items.json'),
      fetch('./data/creatures.json'),
      fetch('./data/recipes.json')
    ]);
    this.islandData = await islandRes.json();
    this.itemCatalog = await itemsRes.json();
    this.creaturesData = await creaturesRes.json();
    this.recipesData = await recipesRes.json();

    this._initRenderer();
    this._initWorld();
    this._initInput();
    this._bindUI();
    this._refreshHudAll();

    const unlockOnce = () => {
      this.audio.unlock();
      window.removeEventListener('pointerdown', unlockOnce);
      window.removeEventListener('keydown', unlockOnce);
    };
    window.addEventListener('pointerdown', unlockOnce);
    window.addEventListener('keydown', unlockOnce);

    window.addEventListener('beforeunload', () => {
      if (this.sceneMode === 'island') {
        this.save.playerPos = [
          Number(this.playerState.x.toFixed(2)),
          Number(this.playerState.y.toFixed(2)),
          Number(this.playerState.z.toFixed(2))
        ];
      }
      this.saveManager.saveNow();
    });

    this.clock = new THREE.Clock();
    this._animate();
  }

  _initRenderer() {
    const container = document.getElementById('canvasHost');
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.02;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    const preset = CAMERA_PRESETS[this.cameraPresetIdx] || CAMERA_PRESETS[1];
    this.camera = new THREE.PerspectiveCamera(preset.fov, window.innerWidth / window.innerHeight, 0.3, 180);

    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  _initWorld() {
    this.timeWeather = new TimeWeatherSystem(this.scene, this.save.settings);
    this.world = new IslandWorld(this.scene, this.save.settings.season, this.islandData.villagers || []);
    this.world.setHouseStage(this.save.houseStage || 0);
    this.inventory = new InventorySystem(this.itemCatalog, this.save);
    this.inventory.registerCreatures(this.creaturesData);
    this.builder = new BuildSystem(this.scene, this.world, this.inventory, this.saveManager, this.itemCatalog);
    this.economy = new EconomySystem(this.recipesData, this.inventory, this.saveManager);
    this.villagerSystem = new VillagerSystem(this.islandData.villagers || [], this.inventory, this.saveManager);
    this.collection = new CollectionSystem(this.creaturesData, this.inventory, this.saveManager);
    this.world.setMuseumStage(this.collection.getMuseumStage());
    this.indoor = new IndoorSceneManager(this.inventory, this.saveManager, this.itemCatalog);
    this.gathering = new GatheringSystem(
      this.scene, this.world, this.creaturesData, this.inventory, this.saveManager, this.audio,
      {
        onToast: (msg) => this._showToast(msg),
        onCatch: (payload) => this._showCatchBanner(payload)
      }
    );

    this.playerModel = createPlayerModel();
    this.heldTools = createHeldTools();
    this.playerModel.bodyRig.add(this.heldTools.holder);
    this._syncHeldToolMesh();

    if (!this._canPlayerWalk(this.playerState.x, this.playerState.z)) {
      this.playerState.x = 0;
      this.playerState.z = 5.8;
    }
    this.playerState.y = this.world.getGroundHeight(this.playerState.x, this.playerState.z);
    this.playerModel.root.position.set(this.playerState.x, this.playerState.y, this.playerState.z);
    this.scene.add(this.playerModel.root);

    const p = CAMERA_PRESETS[this.cameraPresetIdx];
    this.camera.position.set(this.playerState.x, this.playerState.y + p.height, this.playerState.z + p.dist);
    this.camera.lookAt(this.playerState.x, this.playerState.y + p.lookY, this.playerState.z);
    this._renderToolHotbar();
  }

  _isEditMode() {
    return this.sceneMode === 'indoor' ? Boolean(this.indoor?.editMode) : Boolean(this.builder?.editMode);
  }

  _anyModalOpen() {
    return this.bagOpen || this.shopOpen || this.diyOpen || this.villagersOpen || this.critterOpen || this.museumOpen;
  }

  _closeAllModals(except = '') {
    if (except !== 'bag' && this.bagOpen) this._toggleBag(false);
    if (except !== 'shop' && this.shopOpen) this._toggleShop(false);
    if (except !== 'diy' && this.diyOpen) this._toggleDiy(false);
    if (except !== 'villagers' && this.villagersOpen) this._toggleVillagers(false);
    if (except !== 'critter' && this.critterOpen) this._toggleCritterpedia(false);
    if (except !== 'museum' && this.museumOpen) this._toggleMuseum(false);
  }

  _recordMiles(metric, amount = 1) {
    if (!this.collection) return;
    const completed = this.collection.recordProgress(metric, amount);
    if (completed.length > 0) {
      this.audio.playChime();
      this._showToast(`🎫 每日里程達成「${completed[0].title}」！按 M 領取 +${completed[0].rewardMiles} 里程`);
    }
    this._refreshHudAll();
  }

  _canPlayerWalk(wx, wz, curY = null) {
    if (this.sceneMode === 'indoor') return this.indoor.canWalk(wx, wz, 0.4);
    return this.world.canWalk(wx, wz, 0.42, curY) && !this.builder.isTileBlockedForWalk(wx, wz, 0.42);
  }

  _syncHeldToolMesh() {
    if (!this.heldTools || !this.gathering) return;
    const eq = this.sceneMode === 'indoor' ? 'hand' : this.gathering.equippedTool;
    Object.entries(this.heldTools.tools).forEach(([id, mesh]) => {
      mesh.visible = id === eq;
    });
  }

  _selectTool(toolId) {
    if (!this.gathering || this.sceneMode === 'indoor') return;
    this.audio.unlock();
    this.audio.playUiPop();
    this.gathering.setTool(toolId);
    this._syncHeldToolMesh();
    this._renderToolHotbar();
    const def = TOOLS.find((t) => t.id === toolId);
    if (def) this._showToast(`${def.icon} 已切換工具：${def.name}`);
  }

  _renderToolHotbar() {
    const bar = document.getElementById('toolHotbar');
    if (!bar || !this.gathering) return;
    bar.innerHTML = '';
    TOOLS.forEach((t) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tool-btn' + (this.gathering.equippedTool === t.id ? ' active' : '');
      btn.innerHTML = `<span>${t.icon}</span><span class="tn">${t.name}</span><span class="tk">${t.key}</span>`;
      btn.title = `${t.name} (快捷鍵 ${t.key})`;
      btn.addEventListener('click', () => this._selectTool(t.id));
      bar.appendChild(btn);
    });
  }

  _showCatchBanner({ kind, creature, detail, isNew }) {
    const el = document.getElementById('catchBanner');
    if (!el) return;
    const verb = kind === 'fish' ? '釣到' : (kind === 'bug' ? '捕獲' : '挖出');
    document.getElementById('catchIco').textContent = creature.icon || '✨';
    document.getElementById('catchTitle').innerHTML = `${verb} ${creature.name}！${isNew ? '<span class="catch-new">NEW 圖鑑!</span>' : ''}`;
    document.getElementById('catchSub').textContent = detail;
    el.classList.add('show');
    clearTimeout(this.catchTimer);
    this.catchTimer = setTimeout(() => el.classList.remove('show'), 3200);
    const metric = kind === 'fish' ? 'fishCaught' : (kind === 'bug' ? 'bugsCaught' : 'fossilsDug');
    this._recordMiles(metric, 1);
    this._refreshHudAll();
  }

  _initInput() {
    this.input = new InputManager({
      onInteract: () => this._handleInteract(),
      onCameraCycle: () => this._cycleCamera()
    });

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      if (e.code === 'KeyI') {
        this._toggleBag();
      } else if (e.code === 'KeyK') {
        this._toggleDiy();
      } else if (e.code === 'KeyV') {
        this._toggleVillagers();
      } else if (e.code === 'KeyM') {
        this._toggleCritterpedia();
      } else if (e.code === 'KeyH') {
        this._toggleIndoorScene();
      } else if (e.code === 'KeyB') {
        this._toggleBuildMode();
      } else if (e.code === 'KeyR' && this._isEditMode()) {
        this._rotateGhost();
      } else if (e.code === 'Escape') {
        if (this.bagOpen) this._toggleBag(false);
        else if (this.shopOpen) this._toggleShop(false);
        else if (this.diyOpen) this._toggleDiy(false);
        else if (this.villagersOpen) this._toggleVillagers(false);
        else if (this.critterOpen) this._toggleCritterpedia(false);
        else if (this.museumOpen) this._toggleMuseum(false);
        else if (this._isEditMode()) this._toggleBuildMode(false);
      } else if (!this._anyModalOpen() && !this._isEditMode() && this.sceneMode === 'island' && e.code.startsWith('Digit')) {
        const idx = Number(e.code.slice(5)) - 1;
        if (idx >= 0 && idx < TOOLS.length) this._selectTool(TOOLS[idx].id);
      }
    });

    // Top-Down Grid Edit Mode pointer raycasting (works outdoors & indoors!)
    const dom = this.renderer.domElement;
    const toNdc = (ev) => ({
      x: (ev.clientX / window.innerWidth) * 2 - 1,
      y: -(ev.clientY / window.innerHeight) * 2 + 1
    });

    dom.addEventListener('pointermove', (ev) => {
      if (!this._isEditMode()) return;
      const ndc = toNdc(ev);
      if (this.sceneMode === 'indoor') {
        this.indoor.updateHoverFromNDC(ndc.x, ndc.y, this.camera);
      } else {
        this.builder.updateHoverFromNDC(ndc.x, ndc.y, this.camera, this.playerState.y);
      }
    });

    dom.addEventListener('contextmenu', (ev) => {
      if (this._isEditMode()) ev.preventDefault();
    });

    dom.addEventListener('pointerdown', (ev) => {
      if (!this._isEditMode()) return;
      this.audio.unlock();
      const ndc = toNdc(ev);

      if (this.sceneMode === 'indoor') {
        const cell = this.indoor.updateHoverFromNDC(ndc.x, ndc.y, this.camera);
        if (!cell) return;
        if (ev.button === 2 || this.indoor.toolType === 'remove') {
          if (this.indoor.removeAt(cell.gx, cell.gz)) {
            this.audio.playPickupPop();
            this._renderBuildPalette();
            this._refreshHudAll();
            this._showToast('🧹 已將室內家具收回背包！');
          }
          return;
        }
        if (this.indoor.placeAt(cell.gx, cell.gz)) {
          this.audio.playPlaceWood();
          this._renderBuildPalette();
          this._refreshHudAll();
          this._showToast('✨ 室內家具擺放成功！(+10 里程)');
        } else {
          this._showToast('⚠️ 此格無法擺放（門口地墊需留空）或家具數量不足');
        }
        return;
      }

      const cell = this.builder.updateHoverFromNDC(ndc.x, ndc.y, this.camera, this.playerState.y);
      if (!cell) return;

      if (ev.button === 2 || this.builder.toolType === 'remove') {
        const res = this.builder.removeAt(cell.gx, cell.gz);
        if (res) {
          this.audio.playPickupPop();
          this._renderBuildPalette();
          this._refreshHudAll();
          this._showToast(res.removed === 'furniture' ? '🧹 已將家具收回背包！' : '🧹 已清除小徑地磚');
        }
        return;
      }

      if (this.builder.toolType === 'path') {
        if (this.builder.paintPathAt(cell.gx, cell.gz)) {
          this.audio.playPlaceWood();
        }
      } else if (this.builder.toolType === 'furniture') {
        if (this.builder.placeFurnitureAt(cell.gx, cell.gz)) {
          this.audio.playPlaceWood();
          this._recordMiles('furniturePlaced', 1);
          this._renderBuildPalette();
          this._refreshHudAll();
          this._showToast('✨ 家具擺放成功！(+10 里程)');
        } else {
          this._showToast('⚠️ 此格無法擺放或該家具數量不足');
        }
      }
    });
  }

  _bindUI() {
    const byId = (id) => document.getElementById(id);

    byId('btnBuildMode')?.addEventListener('click', () => this._toggleBuildMode());
    byId('btnExitBuild')?.addEventListener('click', () => this._toggleBuildMode(false));
    byId('btnHomeToggle')?.addEventListener('click', () => this._toggleIndoorScene());
    byId('btnShop')?.addEventListener('click', () => this._toggleShop());
    byId('btnCloseShop')?.addEventListener('click', () => this._toggleShop(false));
    byId('shopModal')?.addEventListener('click', (e) => { if (e.target.id === 'shopModal') this._toggleShop(false); });
    byId('tabShopBuy')?.addEventListener('click', () => { this.audio.playUiPop(); this.shopTab = 'buy'; this._renderShop(); });
    byId('tabShopSell')?.addEventListener('click', () => { this.audio.playUiPop(); this.shopTab = 'sell'; this._renderShop(); });

    byId('btnDiy')?.addEventListener('click', () => this._toggleDiy());
    byId('btnCloseDiy')?.addEventListener('click', () => this._toggleDiy(false));
    byId('diyModal')?.addEventListener('click', (e) => { if (e.target.id === 'diyModal') this._toggleDiy(false); });

    byId('btnVillagers')?.addEventListener('click', () => this._toggleVillagers());
    byId('btnCloseVillagers')?.addEventListener('click', () => this._toggleVillagers(false));
    byId('villagersModal')?.addEventListener('click', (e) => { if (e.target.id === 'villagersModal') this._toggleVillagers(false); });

    byId('btnCritterpedia')?.addEventListener('click', () => this._toggleCritterpedia());
    byId('btnCloseCritter')?.addEventListener('click', () => this._toggleCritterpedia(false));
    byId('critterModal')?.addEventListener('click', (e) => { if (e.target.id === 'critterModal') this._toggleCritterpedia(false); });
    byId('tabCritFish')?.addEventListener('click', () => { this.audio.playUiPop(); this.critterTab = 'fish'; this._renderCritterpedia(); });
    byId('tabCritBug')?.addEventListener('click', () => { this.audio.playUiPop(); this.critterTab = 'bugs'; this._renderCritterpedia(); });
    byId('tabCritFossil')?.addEventListener('click', () => { this.audio.playUiPop(); this.critterTab = 'fossils'; this._renderCritterpedia(); });
    byId('tabCritMiles')?.addEventListener('click', () => { this.audio.playUiPop(); this.critterTab = 'miles'; this._renderCritterpedia(); });

    byId('btnMuseum')?.addEventListener('click', () => this._toggleMuseum());
    byId('btnCloseMuseum')?.addEventListener('click', () => this._toggleMuseum(false));
    byId('museumModal')?.addEventListener('click', (e) => { if (e.target.id === 'museumModal') this._toggleMuseum(false); });

    byId('btnBag')?.addEventListener('click', () => this._toggleBag());
    byId('btnCloseBag')?.addEventListener('click', () => this._toggleBag(false));
    byId('bagModal')?.addEventListener('click', (e) => {
      if (e.target.id === 'bagModal') this._toggleBag(false);
    });

    byId('tabFurniture')?.addEventListener('click', () => this._setBuildTab('furniture'));
    byId('tabPath')?.addEventListener('click', () => this._setBuildTab('path'));
    byId('tabRemove')?.addEventListener('click', () => this._setBuildTab('remove'));
    byId('btnRotateGhost')?.addEventListener('click', () => this._rotateGhost());

    byId('btnExportJson')?.addEventListener('click', () => this._exportSaveJson());
    byId('btnImportJson')?.addEventListener('click', () => byId('importFileInput')?.click());
    byId('importFileInput')?.addEventListener('change', (e) => this._importSaveJson(e));

    byId('btnCam')?.addEventListener('click', () => this._cycleCamera());
    byId('btnClockMode')?.addEventListener('click', () => {
      this.audio.unlock(); this.audio.playUiPop();
      const mode = this.timeWeather.toggleClockMode();
      this.save.settings.clockMode = mode; this.saveManager.scheduleSave();
      this._refreshHudAll();
      this._showToast(mode === 'realtime' ? '🕒 已切回同步現實時間' : '⏩ 已切換為加速日夜（24分鐘＝一天）');
    });
    byId('btnPhaseJump')?.addEventListener('click', () => {
      this.audio.unlock(); this.audio.playUiPop();
      this.timeWeather.jumpNextPhase();
      this.save.settings.clockMode = this.timeWeather.clockMode; this.saveManager.scheduleSave();
      this._refreshHudAll();
      this._showToast(`✨ 預覽時段：${this.timeWeather.getPhaseLabel()}（${this.timeWeather.getFormattedClock()}）`);
    });
    byId('btnWeather')?.addEventListener('click', () => {
      this.audio.unlock(); this.audio.playUiPop();
      const w = this.timeWeather.cycleWeather();
      this.save.settings.weather = w; this.saveManager.scheduleSave();
      this._refreshHudAll();
      this._showToast(`天氣已切換：${this.timeWeather.getWeatherLabel()}`);
    });
    byId('btnSeason')?.addEventListener('click', () => {
      this.audio.unlock(); this.audio.playUiPop();
      const next = SEASON_ORDER[(SEASON_ORDER.indexOf(this.save.settings.season) + 1) % SEASON_ORDER.length];
      this.save.settings.season = next;
      this.world.setSeason(next); this.timeWeather.setSeason(next);
      this.saveManager.scheduleSave(); this._refreshHudAll();
      this._showToast(`季節預覽：${SEASON_PALETTES[next].label}`);
    });
    byId('btnCurve')?.addEventListener('click', () => {
      this.audio.unlock(); this.audio.playUiPop();
      this.rollingEnabled = !this.rollingEnabled;
      this.save.settings.rollingCurve = this.rollingEnabled; this.saveManager.scheduleSave();
      this._refreshHudAll();
      this._showToast(this.rollingEnabled ? '🌍 圓筒弧面地表：開啟' : '📐 圓筒弧面地表：平坦模式');
    });
    byId('btnMute')?.addEventListener('click', () => {
      this.audio.unlock();
      const nextMuted = !this.audio.muted;
      this.audio.setMuted(nextMuted);
      this.save.settings.muted = nextMuted; this.saveManager.scheduleSave();
      this._refreshHudAll();
    });

    byId('dlgActions')?.addEventListener('click', (e) => e.stopPropagation());
    byId('dlgGiftBar')?.addEventListener('click', (e) => e.stopPropagation());
    byId('btnDlgGift')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.audio.playUiPop();
      const bar = byId('dlgGiftBar');
      if (!bar) return;
      const open = bar.style.display === 'flex';
      if (open) { bar.style.display = 'none'; }
      else { this._renderDialogueGiftBar(); bar.style.display = 'flex'; }
    });
    byId('btnDlgQuest')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this._handleDialogueQuestClick();
    });
    byId('btnDlgBye')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.audio.playUiPop();
      this._closeDialogue();
    });

    byId('dialogueBox')?.addEventListener('click', () => { if (this.dialogueState.open) this._handleInteract(); });
    byId('interactPill')?.addEventListener('click', () => this._handleInteract());
  }

  _toggleIndoorScene(forceMode = null) {
    if (this.transitioning) return;
    this.audio.unlock();
    const target = forceMode || (this.sceneMode === 'island' ? 'indoor' : 'island');
    if (target === this.sceneMode) return;

    this._closeAllModals();
    if (this._isEditMode()) this._toggleBuildMode(false);
    if (this.dialogueState.open) this._closeDialogue();
    if (this.gathering && this.gathering.fishing.state !== 'idle') this.gathering.cancelFishing();

    this.transitioning = true;
    this.audio.playDoorTransition();
    const fade = document.getElementById('sceneFade');
    fade?.classList.add('show');

    setTimeout(() => {
      if (target === 'indoor') {
        this._savedOutdoorPos = { x: this.playerState.x, y: this.playerState.y, z: this.playerState.z, yaw: this.playerState.yaw };
        this.scene.remove(this.playerModel.root);
        this.indoor.scene.add(this.playerModel.root);
        this.sceneMode = 'indoor';
        this.playerState.x = this.indoor.spawnPos.x;
        this.playerState.y = 0;
        this.playerState.z = this.indoor.spawnPos.z;
        this.playerState.yaw = Math.PI;
        rollingUniforms.uCurveStrength.value = 0;
      } else {
        this.indoor.scene.remove(this.playerModel.root);
        this.scene.add(this.playerModel.root);
        this.sceneMode = 'island';
        const back = this._savedOutdoorPos || { x: this.world.playerHomePos.x, y: this.world.playerHomePos.y, z: this.world.playerHomePos.z + 2.4, yaw: 0 };
        this.playerState.x = back.x;
        this.playerState.y = this.world.getGroundHeight(back.x, back.z);
        this.playerState.z = back.z;
        this.playerState.yaw = 0;
      }
      this._syncHeldToolMesh();
      this._refreshHudAll();
      fade?.classList.remove('show');
      setTimeout(() => { this.transitioning = false; }, 220);

      const st = this.economy.getHouseStageInfo();
      this._showToast(target === 'indoor'
        ? `${st.icon} 歡迎回到「${st.name}」（${st.gridSize}×${st.gridSize}）！按 B 可自由室內裝潢`
        : '🏝️ 已走出小屋，回到微風森友島！');
    }, 260);
  }

  _toggleShop(force) {
    this.audio.unlock(); this.audio.playUiPop();
    const next = typeof force === 'boolean' ? force : !this.shopOpen;
    if (next) {
      this._closeAllModals('shop');
      if (this._isEditMode()) this._toggleBuildMode(false);
    }
    this.shopOpen = next;
    document.getElementById('shopModal')?.classList.toggle('open', next);
    if (next) this._renderShop();
  }

  _renderShop() {
    document.getElementById('tabShopBuy')?.classList.toggle('active', this.shopTab === 'buy');
    document.getElementById('tabShopSell')?.classList.toggle('active', this.shopTab === 'sell');
    document.getElementById('shopHotLabel').textContent = this.economy.hotBonus.label;
    document.getElementById('shopBellsBadge').textContent = `🪙 ${this.save.bells.toLocaleString()} 鈴錢`;

    const body = document.getElementById('shopBody');
    body.innerHTML = '';

    if (this.shopTab === 'buy') {
      const grid = document.createElement('div');
      grid.className = 'w4-grid';
      this.economy.dailyStock.forEach((itemId) => {
        const def = this.inventory.getDef(itemId);
        if (!def) return;
        const price = def.buyPrice || 600;
        const owned = this.inventory.countItem(itemId);
        const card = document.createElement('div');
        card.className = 'w4-card';
        card.innerHTML = `
          <div class="w4-card-head">
            <span class="w4-card-ico">${def.icon}</span>
            <div>
              <div class="w4-card-title">${def.name}</div>
              <div class="w4-card-sub">持有 ${owned} · ${def.desc}</div>
            </div>
          </div>
          <div class="w4-btn-row">
            <button type="button" class="w4-mini-btn" ${this.save.bells < price ? 'disabled' : ''}>🪙 ${price.toLocaleString()} 購買</button>
          </div>`;
        card.querySelector('button').addEventListener('click', () => {
          const res = this.economy.buyItem(itemId);
          if (res.ok) {
            this.audio.playChime();
            this._recordMiles('shopTrades', 1);
            this._refreshHudAll();
            this._renderShop();
            this._showToast(`🛍️ 購入 ${def.icon} ${def.name}！已收入背包`);
          } else {
            this._showToast(`⚠️ ${res.reason}`);
          }
        });
        grid.appendChild(card);
      });
      body.appendChild(grid);
      return;
    }

    // Sell Counter Tab
    const topBar = document.createElement('div');
    topBar.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;gap:8px;flex-wrap:wrap;';
    topBar.innerHTML = '<span style="font-size:12px;font-weight:800;color:#6c5340;">符合「今日高價」的物品自動享有 1.5 倍收購價！</span>';
    const sellAllBtn = document.createElement('button');
    sellAllBtn.type = 'button';
    sellAllBtn.className = 'pill-btn accent';
    sellAllBtn.textContent = '💰 一鍵售出全部漁獲／昆蟲／化石／鮮果';
    sellAllBtn.addEventListener('click', () => {
      const res = this.economy.sellAllHarvests();
      if (res.totalItems > 0) {
        this.audio.playUpgradeFanfare();
        this._recordMiles('shopTrades', 1);
        this._refreshHudAll();
        this._renderShop();
        this._showToast(`💰 批量售出 ${res.totalItems} 件採集品，大豐收 +${res.totalGain.toLocaleString()} 鈴錢！`);
      } else {
        this._showToast('📦 背包裡目前沒有可批量售出的漁獲、昆蟲或化石');
      }
    });
    topBar.appendChild(sellAllBtn);
    body.appendChild(topBar);

    const grid = document.createElement('div');
    grid.className = 'w4-grid';
    let any = false;
    this.inventory.getSlots().forEach((sl, idx) => {
      if (!sl) return;
      const def = this.inventory.getDef(sl.itemId);
      if (!def) return;
      any = true;
      const price = this.economy.getSellPrice(sl.itemId);
      const hot = this.economy.isHotItem(sl.itemId);
      const card = document.createElement('div');
      card.className = 'w4-card';
      card.innerHTML = `
        <div class="w4-card-head">
          <span class="w4-card-ico">${def.icon}</span>
          <div>
            <div class="w4-card-title">${def.name} ×${sl.count} ${hot ? '<span class="catch-new">🔥×1.5</span>' : ''}</div>
            <div class="w4-card-sub">單價 ${price.toLocaleString()} 鈴錢</div>
          </div>
        </div>
        <div class="w4-btn-row">
          <button type="button" class="w4-mini-btn">🪙 售出 1 個 (+${price.toLocaleString()})</button>
        </div>`;
      card.querySelector('button').addEventListener('click', () => {
        const res = this.economy.sellSlotOne(idx);
        if (res.ok) {
          this.audio.playChime();
          this._recordMiles('shopTrades', 1);
          this._refreshHudAll();
          this._renderShop();
          this._showToast(`🪙 售出 ${def.name}，獲得 +${res.gain.toLocaleString()} 鈴錢！`);
        }
      });
      grid.appendChild(card);
    });
    if (!any) {
      body.innerHTML += '<div style="font-size:13px;font-weight:800;color:#8a6f5c;padding:12px 4px;">背包空空的，先去海邊釣魚或草地捉蟲再來變現吧！</div>';
    } else {
      body.appendChild(grid);
    }
  }

  _toggleDiy(force) {
    this.audio.unlock(); this.audio.playUiPop();
    const next = typeof force === 'boolean' ? force : !this.diyOpen;
    if (next) {
      this._closeAllModals('diy');
      if (this._isEditMode()) this._toggleBuildMode(false);
    }
    this.diyOpen = next;
    document.getElementById('diyModal')?.classList.toggle('open', next);
    if (next) this._renderDiy();
  }

  _renderDiy() {
    // 1. 3-Stage House Expansion Card
    const cur = this.economy.getHouseStageInfo();
    const next = this.economy.getNextHouseStageInfo();
    const houseCard = document.getElementById('houseUpgradeCard');
    if (next) {
      const canAfford = this.save.bells >= next.upgradeCost;
      houseCard.innerHTML = `
        <div>
          <div style="font-size:15px;font-weight:900;color:#22643a;">${cur.icon} 目前居所：${cur.name}（室內 ${cur.gridSize}×${cur.gridSize}）</div>
          <div style="font-size:12px;font-weight:700;color:#6c5340;margin-top:3px;">下一階段：${next.icon} <strong>${next.name}</strong> — ${next.desc}</div>
        </div>
        <button id="btnDoHouseUpgrade" type="button" class="pill-btn accent" ${canAfford ? '' : 'disabled'}>
          ✨ 擴建房屋（🪙 ${next.upgradeCost.toLocaleString()}）
        </button>`;
      houseCard.querySelector('#btnDoHouseUpgrade')?.addEventListener('click', () => {
        const res = this.economy.upgradeHouse();
        if (res.ok) {
          this.world.setHouseStage(res.stageInfo.stage);
          this.indoor.rebuildRoom(res.stageInfo.stage);
          this.audio.playUpgradeFanfare();
          this._refreshHudAll();
          this._renderDiy();
          this._showToast(`🎉 恭喜擴建為「${res.stageInfo.icon} ${res.stageInfo.name}」！室內擴大至 ${res.stageInfo.gridSize}×${res.stageInfo.gridSize}！`);
        } else {
          this._showToast(`⚠️ ${res.reason}`);
        }
      });
    } else {
      houseCard.innerHTML = `
        <div>
          <div style="font-size:15px;font-weight:900;color:#22643a;">${cur.icon} 已達最高階段：${cur.name}（室內 ${cur.gridSize}×${cur.gridSize} ＋ 溫暖壁爐）</div>
          <div style="font-size:12px;font-weight:700;color:#6c5340;margin-top:3px;">按 H 鍵隨時進入小屋佈置專屬居家空間！</div>
        </div>`;
    }

    // 2. Batch DIY Recipes Grid (with Week 5 Rare Blueprint lock/unlock)
    const grid = document.getElementById('diyGrid');
    grid.innerHTML = '';
    this.economy.recipes.forEach((rec) => {
      const out = this.inventory.getDef(rec.outputId);
      if (!out) return;
      const unlocked = this.economy.isRecipeUnlocked(rec);
      const maxN = unlocked ? this.economy.getMaxCraftable(rec) : 0;
      const ingHtml = rec.ingredients.map((ing) => {
        const idf = this.inventory.getDef(ing.itemId);
        const have = this.inventory.countItem(ing.itemId);
        return `<span class="w4-ing ${have < ing.count ? 'lack' : ''}">${idf?.icon || ''} ${idf?.name || ing.itemId} ${have}/${ing.count}</span>`;
      }).join('');

      const card = document.createElement('div');
      card.className = 'w4-card';
      if (!unlocked) card.style.opacity = '0.72';
      const badge = rec.rare ? (unlocked ? '<span class="rare-tag">✨ 稀有藍圖</span>' : '<span class="rare-tag" style="background:#efe3d4;color:#8a6b52;">🔒 未解鎖稀有藍圖</span>') : '';
      card.innerHTML = `
        <div class="w4-card-head">
          <span class="w4-card-ico">${out.icon}</span>
          <div>
            <div class="w4-card-title">${out.name} ${rec.yield > 1 ? `×${rec.yield}` : ''} ${badge}</div>
            <div class="w4-card-sub">${unlocked ? `持有 ${this.inventory.countItem(rec.outputId)} · 最多可做 ${maxN} 批` : `解鎖條件：${rec.unlockHint || '完成住民委託或好感度 Lv.3'}`}</div>
          </div>
        </div>
        <div class="w4-ing-row">${ingHtml}</div>
        <div class="w4-btn-row">
          ${unlocked ? `
          <button type="button" class="w4-mini-btn" data-q="1" ${maxN < 1 ? 'disabled' : ''}>🔨 做 ×1</button>
          <button type="button" class="w4-mini-btn alt" data-q="3" ${maxN < 3 ? 'disabled' : ''}>×3</button>
          <button type="button" class="w4-mini-btn alt" data-q="5" ${maxN < 5 ? 'disabled' : ''}>×5</button>
          <button type="button" class="w4-mini-btn alt" data-q="99" ${maxN < 1 ? 'disabled' : ''}>MAX (${maxN})</button>
          ` : `<button type="button" class="w4-mini-btn alt" disabled>🔒 ${rec.unlockHint || '尚未解鎖'}</button>`}
        </div>`;

      if (unlocked) {
        card.querySelectorAll('button[data-q]').forEach((b) => {
          b.addEventListener('click', () => {
            const q = Number(b.dataset.q);
            const res = this.economy.craftBatch(rec.id, q);
            if (res.ok) {
              this.audio.playCraftHammer();
              this._recordMiles('itemsCrafted', res.craftedCount || 1);
              this._refreshHudAll();
              this._renderDiy();
              this._showToast(`🔨 叮叮噹！批量製作完成：${res.def.icon} ${res.def.name} ×${res.craftedCount}！`);
            } else {
              this._showToast(`⚠️ ${res.reason}`);
            }
          });
        });
      }
      grid.appendChild(card);
    });
  }

  _toggleVillagers(force) {
    this.audio.unlock(); this.audio.playUiPop();
    const next = typeof force === 'boolean' ? force : !this.villagersOpen;
    if (next) {
      this._closeAllModals('villagers');
      if (this._isEditMode()) this._toggleBuildMode(false);
    }
    this.villagersOpen = next;
    document.getElementById('villagersModal')?.classList.toggle('open', next);
    if (next) this._renderVillagers();
  }

  _toggleCritterpedia(force, tab = null) {
    this.audio.unlock(); this.audio.playUiPop();
    const next = typeof force === 'boolean' ? force : !this.critterOpen;
    if (next) {
      this._closeAllModals('critter');
      if (this._isEditMode()) this._toggleBuildMode(false);
      if (tab) this.critterTab = tab;
    }
    this.critterOpen = next;
    document.getElementById('critterModal')?.classList.toggle('open', next);
    if (next) this._renderCritterpedia();
  }

  _renderCritterpedia() {
    const sum = this.collection.getEncyclopediaSummary();
    const byId = (id) => document.getElementById(id);
    byId('tabCritFish').textContent = `🐟 魚類 (${sum.fishFound}/${sum.fishTotal})`;
    byId('tabCritBug').textContent = `🦋 昆蟲 (${sum.bugsFound}/${sum.bugsTotal})`;
    byId('tabCritFossil').textContent = `🦴 化石 (${sum.fossilsFound}/${sum.fossilsTotal})`;
    const unclaimed = this.collection.getUnclaimedGoalCount();
    byId('tabCritMiles').innerHTML = `🎫 每日里程 &amp; 兌換${unclaimed > 0 ? `<span class="pill-badge">${unclaimed}</span>` : ''}`;

    byId('tabCritFish')?.classList.toggle('active', this.critterTab === 'fish');
    byId('tabCritBug')?.classList.toggle('active', this.critterTab === 'bugs');
    byId('tabCritFossil')?.classList.toggle('active', this.critterTab === 'fossils');
    byId('tabCritMiles')?.classList.toggle('active', this.critterTab === 'miles');

    byId('critterSummary').textContent = `📖 總圖鑑進度：${sum.totalFound} / ${sum.totalSpecies} · 🦉 博物館館藏：${sum.totalDonated} / ${sum.totalSpecies}`;
    byId('critterMilesBadge').textContent = `🎫 ${this.save.miles.toLocaleString()} 里程`;

    const body = byId('critterBody');
    body.innerHTML = '';

    if (this.critterTab === 'miles') {
      // 1. Daily 4 Miles Goals
      const title1 = document.createElement('div');
      title1.className = 'miles-sec-title';
      title1.textContent = '✨ 今日 4 項里程目標（每日自動刷新）';
      body.appendChild(title1);

      const gGrid = document.createElement('div');
      gGrid.className = 'w4-grid';
      this.collection.getDailyGoals().forEach((g) => {
        const pct = Math.min(100, Math.round((g.progress / Math.max(1, g.target)) * 100));
        const card = document.createElement('div');
        card.className = 'w4-card';
        card.innerHTML = `
          <div class="w4-card-head">
            <span class="w4-card-ico">${g.icon}</span>
            <div style="flex:1;">
              <div class="w4-card-title">${g.title} <span class="rare-tag">+🎫${g.rewardMiles}</span></div>
              <div class="w4-card-sub">${g.desc}（${Math.min(g.progress, g.target)}/${g.target}）</div>
            </div>
          </div>
          <div class="wing-track"><div class="wing-fill" style="width:${pct}%"></div></div>
          <div class="w4-btn-row">
            ${g.claimed
              ? '<button type="button" class="w4-mini-btn alt" disabled>✅ 今日已領取</button>'
              : g.completed
                ? `<button type="button" class="w4-mini-btn" data-claim="${g.id}">🎁 領取 +${g.rewardMiles} 里程</button>`
                : `<button type="button" class="w4-mini-btn alt" disabled>⏳ 進行中 (${g.progress}/${g.target})</button>`}
          </div>`;
        card.querySelector('[data-claim]')?.addEventListener('click', () => {
          const res = this.collection.claimGoal(g.id);
          if (res.ok) {
            this.audio.playUpgradeFanfare();
            this._refreshHudAll();
            this._renderCritterpedia();
            this._showToast(`🎫 領取每日里程「${res.goal.title}」＋${res.rewardMiles} 里程！`);
          }
        });
        gGrid.appendChild(card);
      });
      body.appendChild(gGrid);

      // 2. Miles Point Redemption Store
      const title2 = document.createElement('div');
      title2.className = 'miles-sec-title';
      title2.textContent = '🛍️ 里程點數兌換商店（限定家具與補給）';
      body.appendChild(title2);

      const rGrid = document.createElement('div');
      rGrid.className = 'w4-grid';
      this.collection.getMilesCatalog().forEach((rw) => {
        const canAfford = this.save.miles >= rw.cost;
        const card = document.createElement('div');
        card.className = 'w4-card';
        card.innerHTML = `
          <div class="w4-card-head">
            <span class="w4-card-ico">${rw.icon}</span>
            <div>
              <div class="w4-card-title">${rw.name}</div>
              <div class="w4-card-sub">${rw.desc}</div>
            </div>
          </div>
          <div class="w4-btn-row">
            <button type="button" class="w4-mini-btn" data-redeem="${rw.id}" ${canAfford ? '' : 'disabled'}>🎫 ${rw.cost} 立即兌換</button>
          </div>`;
        card.querySelector('[data-redeem]')?.addEventListener('click', () => {
          const res = this.collection.redeemReward(rw.id);
          if (res.ok) {
            this.audio.playUpgradeFanfare();
            this._refreshHudAll();
            this._renderCritterpedia();
            this._showToast(res.message);
          } else {
            this._showToast(`⚠️ ${res.reason}`);
          }
        });
        rGrid.appendChild(card);
      });
      body.appendChild(rGrid);
      return;
    }

    // Species Grid (Fish / Bugs / Fossils)
    const bucket = this.critterTab;
    const list = this.creaturesData[bucket] || [];
    const encBucket = this.save.encyclopedia?.[bucket] || {};
    const timeLabels = { all: '全天', day: '白天', night: '夜晚', rain: '雨天' };
    const habLabels = { river: '河流', sea: '海岸' };

    const grid = document.createElement('div');
    grid.className = 'critter-grid';
    list.forEach((c) => {
      const rec = encBucket[c.id];
      const discovered = Boolean(rec);
      const donated = this.collection.isDonated(bucket, c.id);
      const inBag = this.inventory.countItem(c.id) > 0;
      const hint = bucket === 'fish'
        ? `${habLabels[c.habitat] || '水域'} · ${timeLabels[c.time] || '全天'}`
        : bucket === 'bugs'
          ? `${c.behavior === 'fly' ? '空中飛舞' : '草地棲息'} · ${timeLabels[c.time] || '全天'}`
          : '地底星星裂縫挖掘';

      const card = document.createElement('div');
      card.className = `critter-card ${discovered ? '' : 'undiscovered'}`;
      card.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;gap:4px;">
          <span class="c-ico">${c.icon}</span>
          ${donated ? '<span class="owl-badge">🦉 已館藏</span>' : (inBag ? '<span class="rare-tag">可捐贈</span>' : '')}
        </div>
        <div class="c-name">${discovered ? c.name : '？？？'}</div>
        <div class="c-meta">${hint}</div>
        <div class="c-meta">${discovered
          ? (bucket === 'fish' && rec.maxCm ? `紀錄 ${rec.maxCm} cm · 🪙${c.price.toLocaleString()}` : `捕獲 ${rec.count} 次 · 🪙${c.price.toLocaleString()}`)
          : '尚未發現'}</div>`;
      grid.appendChild(card);
    });
    body.appendChild(grid);
  }

  _toggleMuseum(force) {
    this.audio.unlock(); this.audio.playUiPop();
    const next = typeof force === 'boolean' ? force : !this.museumOpen;
    if (next) {
      this._closeAllModals('museum');
      if (this._isEditMode()) this._toggleBuildMode(false);
    }
    this.museumOpen = next;
    document.getElementById('museumModal')?.classList.toggle('open', next);
    if (next) this._renderMuseum();
  }

  _renderMuseum() {
    const sum = this.collection.getEncyclopediaSummary();
    const st = this.collection.getMuseumStageInfo();
    const donatable = this.collection.getDonatableBagSlots();

    // 1. Museum Stage Banner + One-Click Batch Donate
    const stageCard = document.getElementById('museumStageCard');
    stageCard.innerHTML = `
      <div>
        <div style="font-size:15px;font-weight:900;color:#22643a;">${st.icon} ${st.name}（總館藏 ${sum.totalDonated} / ${sum.totalSpecies}）</div>
        <div style="font-size:12px;font-weight:700;color:#6c5340;margin-top:3px;">${st.desc}</div>
      </div>
      <button id="btnDonateAllMuseum" type="button" class="pill-btn accent" ${donatable.length ? '' : 'disabled'}>
        ✨ 一鍵捐贈全部新標本 (${donatable.length})
      </button>`;
    stageCard.querySelector('#btnDonateAllMuseum')?.addEventListener('click', () => {
      const res = this.collection.donateAllFromBag();
      if (res.ok) {
        this.audio.playUpgradeFanfare();
        if (res.stageUpgraded) this.world.setMuseumStage(res.stageUpgraded.stage);
        this._refreshHudAll();
        this._renderMuseum();
        const upMsg = res.stageUpgraded ? ` 🏛️ 博物館升級為「${res.stageUpgraded.icon} ${res.stageUpgraded.name}」並獲得紀念獎勵！` : '';
        this._showToast(`🦉 捐贈 ${res.count} 件標本成功！＋🪙${res.totalBells} ＋🎫${res.totalMiles}${upMsg}`);
      } else {
        this._showToast(`📦 ${res.reason}`);
      }
    });

    // 2. Three Wings Progress Bars
    const wings = [
      { title: '🌊 水族館展廳', cur: sum.fishDonated, max: sum.fishTotal },
      { title: '🌿 昆蟲溫室廳', cur: sum.bugsDonated, max: sum.bugsTotal },
      { title: '🦴 遠古化石廳', cur: sum.fossilsDonated, max: sum.fossilsTotal }
    ];
    const wingEl = document.getElementById('museumWings');
    wingEl.innerHTML = wings.map((w) => {
      const pct = Math.round((w.cur / Math.max(1, w.max)) * 100);
      return `<div class="wing-box"><div class="w-title">${w.title}</div><div class="w-sub">${w.cur} / ${w.max} 件館藏</div><div class="wing-track"><div class="wing-fill" style="width:${pct}%"></div></div></div>`;
    }).join('');

    // 3. Individual Donatable Bag Specimens
    const dBox = document.getElementById('museumDonateBox');
    if (donatable.length) {
      dBox.innerHTML = '<div class="miles-sec-title">🎒 背包內可捐贈的新標本（每件 ＋🪙200 ＋🎫120）</div>';
      const row = document.createElement('div');
      row.className = 'w4-grid';
      donatable.forEach(({ slotIdx, def }) => {
        const card = document.createElement('div');
        card.className = 'w4-card';
        card.innerHTML = `
          <div class="w4-card-head">
            <span class="w4-card-ico">${def.icon}</span>
            <div>
              <div class="w4-card-title">${def.name}</div>
              <div class="w4-card-sub">尚未館藏 · 捐贈贈 🪙200 ＋ 🎫120</div>
            </div>
          </div>
          <div class="w4-btn-row"><button type="button" class="w4-mini-btn">🦉 捐贈給博物館</button></div>`;
        card.querySelector('button').addEventListener('click', () => {
          const res = this.collection.donateSlot(slotIdx);
          if (res.ok) {
            this.audio.playUpgradeFanfare();
            if (res.stageUpgraded) this.world.setMuseumStage(res.stageUpgraded.stage);
            this._refreshHudAll();
            this._renderMuseum();
            const upMsg = res.stageUpgraded ? ` 🏛️ 博物館華麗升級為「${res.stageUpgraded.icon} ${res.stageUpgraded.name}」！` : '';
            this._showToast(`🦉 感謝捐贈「${res.def.icon} ${res.def.name}」！＋🪙${res.bells} ＋🎫${res.miles}${upMsg}`);
          }
        });
        row.appendChild(card);
      });
      dBox.appendChild(row);
    } else {
      dBox.innerHTML = '<div style="font-size:12px;font-weight:800;color:#7a604d;padding:6px 2px;">🎒 背包內目前沒有尚未捐贈的新標本，快去釣魚、捕蟲或挖星星化石再帶回高地博物館吧！</div>';
    }

    // 4. Donated Specimens Exhibition Gallery
    const gal = document.getElementById('museumGallery');
    gal.innerHTML = '';
    const allDonated = [
      ...(this.save.museum?.fish || []).map((id) => ({ id, wing: '🌊 水族館' })),
      ...(this.save.museum?.bugs || []).map((id) => ({ id, wing: '🌿 昆蟲園' })),
      ...(this.save.museum?.fossils || []).map((id) => ({ id, wing: '🦴 化石廳' }))
    ];
    if (!allDonated.length) {
      gal.innerHTML = '<div style="grid-column:1/-1;font-size:12px;font-weight:700;color:#8a6f5c;padding:8px 2px;">展廳目前還在等待你的第一件珍貴自然標本！</div>';
    } else {
      allDonated.forEach(({ id, wing }) => {
        const def = this.collection.getCreatureDef(id);
        if (!def) return;
        const card = document.createElement('div');
        card.className = 'critter-card';
        card.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;"><span class="c-ico">${def.icon}</span><span class="owl-badge">${wing}</span></div><div class="c-name">${def.name}</div><div class="c-meta">✨ 永久館藏展示中</div>`;
        gal.appendChild(card);
      });
    }
  }

  _renderVillagers() {
    const phaseKey = this.timeWeather.weather === 'rain' ? 'rain' : this.timeWeather.getPhaseKey();
    const summaryEl = document.getElementById('villagerScheduleSummary');
    const rareEl = document.getElementById('villagerRareCount');
    const grid = document.getElementById('villagersGrid');
    if (!grid) return;

    if (summaryEl) {
      summaryEl.textContent = `目前時段：${this.timeWeather.getPhaseLabel()}（${this.timeWeather.getFormattedClock()} · ${this.timeWeather.getWeatherLabel()}）`;
    }
    if (rareEl) {
      rareEl.textContent = `✨ 已解鎖稀有藍圖：${this.villagerSystem.getUnlockedRareCount()} / 4`;
    }

    const speciesIcon = { cat: '🐱', dog: '🐶', shiba: '🐶', bunny: '🐰', bear: '🐻' };
    grid.innerHTML = '';

    (this.islandData.villagers || []).forEach((vDef) => {
      const fs = this.villagerSystem.getFriendship(vDef.id);
      const slot = this.villagerSystem.getScheduleSlot(vDef, phaseKey);
      const q = this.villagerSystem.getDailyQuest(vDef);
      const unlocked = (this.save.unlockedRecipes || []).includes(vDef.rareRecipeId);
      const hearts = '♥'.repeat(fs.level) + '♡'.repeat(Math.max(0, 5 - fs.level));

      const card = document.createElement('div');
      card.className = 'w4-card';
      card.innerHTML = `
        <div class="w4-card-head">
          <span class="w4-card-ico">${speciesIcon[vDef.species] || '🐾'}</span>
          <div style="flex:1;">
            <div class="w4-card-title">${vDef.name} <span style="font-size:11px;font-weight:800;color:#7a604d;">· ${vDef.personalityLabel}</span></div>
            <div class="w4-card-sub">${slot.activity}</div>
          </div>
          <span class="dlg-heart-pill">Lv.${fs.level} ${hearts}</span>
        </div>
        <div class="heart-track"><div class="heart-fill" style="width:${fs.pct}%"></div></div>
        <div style="font-size:11px;font-weight:700;color:#7b5e4a;">
          💖 偏好禮物：${vDef.favoriteHint || '各式小島好物'} · ${fs.giftedToday ? '✅ 今日已送禮' : '🎁 今日可享首次送禮加倍'}
        </div>
        <div style="font-size:11px;font-weight:800;color:${unlocked ? '#8a468c' : '#6e5846'};">
          ${unlocked ? `✨ 稀有藍圖已解鎖：${vDef.rareName}` : `🔒 專屬稀有藍圖：${vDef.rareName}（完成委託或好感 Lv.3 解鎖）`}
        </div>
        ${q ? `
        <div style="background:#fff;border:1.5px solid #edd9c0;border-radius:11px;padding:7px 9px;font-size:12px;">
          <div style="font-weight:900;color:#4a3425;">📜 今日委託：${q.title}</div>
          <div style="font-size:11px;font-weight:700;color:#7a604d;margin:2px 0 6px;">${q.desc ? `${q.desc} · ` : ''}進度 ${Math.min(q.have, q.count)}/${q.count} · 獎勵 🪙${q.bells} ＋ 🎫${q.miles}</div>
          <div class="w4-btn-row">
            ${q.status === 'done'
              ? '<button type="button" class="w4-mini-btn alt" disabled>✅ 今日委託已完成</button>'
              : q.status === 'available'
                ? '<button type="button" class="w4-mini-btn" data-act="accept">📜 接取今日委託</button>'
                : `<button type="button" class="w4-mini-btn" data-act="complete" ${q.ready ? '' : 'disabled'}>${q.ready ? '🎁 交付物品領取獎勵' : `⏳ 尚缺物品 (${q.have}/${q.count})`}</button>`}
          </div>
        </div>` : ''}`;

      card.querySelector('[data-act="accept"]')?.addEventListener('click', () => {
        const res = this.villagerSystem.acceptQuest(vDef);
        if (res.ok) {
          this.audio.playChime();
          this._renderVillagers();
          this._showToast(`📜 已接取 ${vDef.name} 的委託「${res.quest.title}」！`);
        }
      });

      card.querySelector('[data-act="complete"]')?.addEventListener('click', () => {
        const res = this.villagerSystem.completeQuest(vDef);
        if (res.ok) {
          this.audio.playUpgradeFanfare();
          this._refreshHudAll();
          this._renderVillagers();
          if (res.unlockedRare) {
            this._showToast(`🎉 完成委託！＋🪙${res.bells} ＋🎫${res.miles}，並解鎖稀有藍圖「${res.unlockedRare}」！`);
          } else {
            this._showToast(`🎉 完成 ${vDef.name} 的委託！獲得 🪙${res.bells} ＋ 🎫${res.miles} ＋ 好感度 Lv.${res.level}！`);
          }
        } else {
          this._showToast(`⚠️ ${res.reason}`);
        }
      });

      grid.appendChild(card);
    });
  }

  _renderDialogueGiftBar() {
    const bar = document.getElementById('dlgGiftBar');
    const v = this.dialogueState.activeVillager;
    if (!bar || !v) return;
    bar.innerHTML = '';

    const slots = this.inventory.getSlots();
    let count = 0;
    slots.forEach((slot, idx) => {
      if (!slot) return;
      const def = this.inventory.getDef(slot.itemId);
      if (!def) return;
      count++;
      const isFav = (v.def.favoriteCats || []).includes(def.category);
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'gift-chip';
      chip.innerHTML = `${def.icon} ${def.name} ×${slot.count}${isFav ? ' 💖' : ''}`;
      chip.addEventListener('click', (e) => {
        e.stopPropagation();
        const res = this.villagerSystem.giveGift(v.def, idx);
        if (res.ok) {
          if (res.leveledUp || res.unlockedRare) this.audio.playUpgradeFanfare();
          else this.audio.playChime();
          this._recordMiles('giftsGiven', 1);
          this._refreshHudAll();
          bar.style.display = 'none';
          this._openDialogue(v.def.name, v.def.personalityLabel, res.reactionText, v.def.voicePitch, v);
          this._showToast(`🎁 送出 ${res.itemDef.name}！好感 +${res.xpGain}（Lv.${res.level}）＋ 回禮 🪙${res.returnBells}`);
        } else {
          this._showToast(`⚠️ ${res.reason}`);
        }
      });
      bar.appendChild(chip);
    });

    if (!count) {
      bar.innerHTML = '<span style="font-size:12px;font-weight:700;color:#8a6f5c;">背包裡目前沒有可送出的物品，先去採集或商店逛逛吧！</span>';
    }
  }

  _handleDialogueQuestClick() {
    const v = this.dialogueState.activeVillager;
    if (!v) return;
    const q = this.villagerSystem.getDailyQuest(v.def);
    if (!q) return;
    if (q.status === 'done') {
      this.audio.playUiPop();
      this._openDialogue(v.def.name, v.def.personalityLabel, '今天的委託你已經幫大忙囉！明天再來找我聊聊吧～💕', v.def.voicePitch, v);
      return;
    }
    if (q.status === 'available') {
      const res = this.villagerSystem.acceptQuest(v.def);
      if (res.ok) {
        this.audio.playChime();
        const msg = `太好了！今天想拜託你「${q.title}」！完成後除了 🪙${q.bells} 鈴錢，還會把珍藏的「${v.def.rareName}」稀有藍圖送給你喔！`;
        this._openDialogue(v.def.name, v.def.personalityLabel, msg, v.def.voicePitch, v);
        this._showToast(`📜 已接取 ${v.def.name} 的每日委託！`);
      }
      return;
    }
    if (q.status === 'active') {
      if (q.ready) {
        const res = this.villagerSystem.completeQuest(v.def);
        if (res.ok) {
          this.audio.playUpgradeFanfare();
          this._refreshHudAll();
          const msg = res.unlockedRare
            ? `哇～真的集齊了！！太感謝你了！這是說好的 🪙${res.bells} 鈴錢，還有我最珍貴的稀有藍圖「✨ ${res.unlockedRare}」，快去 DIY 工作台做做看吧！`
            : `太感謝你幫忙完成「${q.title}」啦！這 🪙${res.bells} 鈴錢請收下，我們感情又更好囉（好感度 Lv.${res.level}）！`;
          this._openDialogue(v.def.name, v.def.personalityLabel, msg, v.def.voicePitch, v);
          this._showToast(`🎉 委託完成！＋🪙${res.bells} ＋🎫${res.miles}`);
        }
      } else {
        this.audio.playUiPop();
        this._openDialogue(v.def.name, v.def.personalityLabel, `「${q.title}」目前進度 ${q.have}/${q.count} 囉！慢慢收集沒關係～`, v.def.voicePitch, v);
      }
    }
  }

  _toggleBuildMode(force) {
    this.audio.unlock(); this.audio.playUiPop();
    const curEdit = this._isEditMode();
    const next = typeof force === 'boolean' ? force : !curEdit;
    if (next) {
      this._closeAllModals();
      if (this.dialogueState.open) this._closeDialogue();
    }

    if (this.sceneMode === 'indoor') {
      this.indoor.setEditMode(next);
      document.getElementById('tabPath').style.display = 'none';
      if (this.indoor.toolType === 'path') this.indoor.toolType = 'furniture';
    } else {
      this.builder.setEditMode(next);
      document.getElementById('tabPath').style.display = '';
    }

    document.getElementById('buildDock')?.classList.toggle('open', next);
    document.getElementById('mobileControls').style.display = next ? 'none' : '';
    document.getElementById('desktopHint').style.opacity = next ? '0' : '1';
    if (next) this._renderBuildPalette();
    this._refreshHudAll();
    this._showToast(next
      ? (this.sceneMode === 'indoor' ? '🏡 進入室內上帝視角佈置模式！點地板擺放家具' : '🏗️ 已進入上帝視角 3D 網格佈置模式！點擊地面即可擺放')
      : '✓ 已返回漫步模式並自動存檔');
  }

  _setBuildTab(tab) {
    this.audio.playUiPop();
    if (this.sceneMode === 'indoor') {
      this.indoor.setTool(tab === 'remove' ? 'remove' : 'furniture');
    } else {
      this.builder.toolType = tab;
    }
    document.getElementById('tabFurniture')?.classList.toggle('active', tab === 'furniture');
    document.getElementById('tabPath')?.classList.toggle('active', tab === 'path');
    document.getElementById('tabRemove')?.classList.toggle('active', tab === 'remove');
    this._renderBuildPalette();
  }

  _rotateGhost() {
    this.audio.playUiPop();
    if (this.sceneMode === 'indoor') {
      this.indoor.rotateGhost();
      this._showToast(`🔄 室內家具方向：${this.indoor.rotationIndex * 90}°`);
    } else {
      const r = this.builder.rotate();
      this._showToast(`🔄 家具方向：${r * 90}°`);
    }
  }

  _renderBuildPalette() {
    const el = document.getElementById('buildPalette');
    if (!el) return;
    el.innerHTML = '';

    const activeTool = this.sceneMode === 'indoor' ? this.indoor.toolType : this.builder.toolType;
    if (activeTool === 'remove') {
      el.innerHTML = '<div style="font-size:12px;font-weight:700;color:#8a6f5c;padding:6px;">點選任何已擺放的家具即可收回背包（也可隨時按滑鼠右鍵收回）。</div>';
      return;
    }

    if (this.sceneMode === 'island' && activeTool === 'path') {
      (this.itemCatalog.paths || []).forEach((p) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'bp-item' + (this.builder.selectedPathId === p.id ? ' active' : '');
        btn.innerHTML = `<span class="ico">${p.icon}</span><span class="nm">${p.name}</span><span class="qt">無限鋪設</span>`;
        btn.addEventListener('click', () => {
          this.audio.playUiPop();
          this.builder.selectedPathId = p.id;
          this._renderBuildPalette();
        });
        el.appendChild(btn);
      });
      return;
    }

    const items = this.inventory.getPlaceableItems();
    if (!items.length) {
      el.innerHTML = '<div style="font-size:12px;font-weight:700;color:#8a6f5c;padding:6px;">背包裡目前沒有可擺放的家具，可到商店購買或用 DIY 工作台製作！</div>';
      return;
    }
    const targetObj = this.sceneMode === 'indoor' ? this.indoor : this.builder;
    if (!items.some((it) => it.id === targetObj.selectedItemId)) {
      targetObj.selectedItemId = items[0].id;
    }
    items.forEach((it) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'bp-item' + (targetObj.selectedItemId === it.id ? ' active' : '');
      btn.innerHTML = `<span class="ico">${it.icon}</span><span class="nm">${it.name}</span><span class="qt">×${it.count}</span>`;
      btn.addEventListener('click', () => {
        this.audio.playUiPop();
        if (this.sceneMode === 'indoor') this.indoor.setTool('furniture', it.id);
        else this.builder.selectedItemId = it.id;
        this._renderBuildPalette();
      });
      el.appendChild(btn);
    });
  }

  _toggleBag(force) {
    this.audio.unlock(); this.audio.playUiPop();
    const next = typeof force === 'boolean' ? force : !this.bagOpen;
    if (next) {
      if (this._isEditMode()) this._toggleBuildMode(false);
      this._closeAllModals('bag');
    }
    this.bagOpen = next;
    document.getElementById('bagModal')?.classList.toggle('open', next);
    if (next) this._renderBag();
  }

  _renderBag() {
    const grid = document.getElementById('bagGrid');
    const slots = this.inventory.getSlots();
    grid.innerHTML = '';

    slots.forEach((slot, idx) => {
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'bag-slot' + (!slot ? ' empty' : '') + (idx === this.selectedBagSlot ? ' selected' : '');
      if (slot) {
        const def = this.inventory.getDef(slot.itemId);
        cell.innerHTML = `<span class="ico">${def?.icon || '📦'}</span><span class="cnt">×${slot.count}</span>`;
        cell.title = def?.name || slot.itemId;
        cell.addEventListener('click', () => {
          this.audio.playUiPop();
          this.selectedBagSlot = idx;
          this._renderBag();
        });
      }
      grid.appendChild(cell);
    });

    const titleEl = document.getElementById('bagSelTitle');
    const descEl = document.getElementById('bagSelDesc');
    const actsEl = document.getElementById('bagActions');
    actsEl.innerHTML = '';

    const selSlot = this.selectedBagSlot >= 0 ? slots[this.selectedBagSlot] : null;
    if (selSlot) {
      const def = this.inventory.getDef(selSlot.itemId);
      titleEl.textContent = `${def.icon} ${def.name}（持有 ${selSlot.count} 個）`;
      descEl.textContent = def.desc;

      if (def.category === 'furniture') {
        const placeBtn = document.createElement('button');
        placeBtn.type = 'button';
        placeBtn.className = 'pill-btn accent';
        placeBtn.textContent = '📍 擺在角色面前';
        placeBtn.addEventListener('click', () => this._placeInFrontOfPlayer(def.id));
        actsEl.appendChild(placeBtn);

        const editBtn = document.createElement('button');
        editBtn.type = 'button';
        editBtn.className = 'pill-btn';
        editBtn.textContent = '🏗️ 上帝視角擺放';
        editBtn.addEventListener('click', () => {
          if (this.sceneMode === 'indoor') this.indoor.setTool('furniture', def.id);
          else { this.builder.selectedItemId = def.id; this.builder.toolType = 'furniture'; }
          this._toggleBag(false);
          this._toggleBuildMode(true);
        });
        actsEl.appendChild(editBtn);
      }

      const sellBtn = document.createElement('button');
      sellBtn.type = 'button';
      sellBtn.className = 'pill-btn';
      sellBtn.textContent = `🪙 售出 1 個 (+${def.sellPrice})`;
      sellBtn.addEventListener('click', () => {
        if (this.inventory.removeAtSlot(this.selectedBagSlot, 1)) {
          this.save.bells += def.sellPrice;
          this.saveManager.scheduleSave();
          this.audio.playChime();
          this._refreshHudAll();
          this._renderBag();
          this._showToast(`🪙 售出 ${def.name}，獲得 +${def.sellPrice} 鈴錢！`);
        }
      });
      actsEl.appendChild(sellBtn);
    } else {
      titleEl.textContent = '點選格子查看物品';
      descEl.textContent = '家具可「擺在角色面前」或切換「上帝視角 3D 佈置模式」自由排列！';
    }

    const placedCnt = (this.save.placedOutdoor || []).length + (this.save.placedIndoor || []).length;
    const pathCnt = Object.keys(this.save.paths || {}).length;
    document.getElementById('bagStatsTxt').textContent = `室內外已擺家具：${placedCnt} · 鋪設小徑：${pathCnt}`;
  }

  _placeInFrontOfPlayer(itemId) {
    const aheadX = this.playerState.x + Math.sin(this.playerState.yaw) * 1.65;
    const aheadZ = this.playerState.z + Math.cos(this.playerState.yaw) * 1.65;
    const rot = Math.round(((this.playerState.yaw % (Math.PI * 2)) + Math.PI * 2) / (Math.PI / 2)) % 4;

    if (this.sceneMode === 'indoor') {
      const { gx, gz } = this.indoor.worldToGrid(aheadX, aheadZ);
      if (this.indoor.placeAt(gx, gz, itemId, rot)) {
        this.audio.playPlaceWood();
        this._recordMiles('furniturePlaced', 1);
        this._toggleBag(false);
        this._refreshHudAll();
        this._showToast('✨ 已在室內擺好家具！(+10 里程)');
      } else {
        this._showToast('⚠️ 角色前方空間不足（不能擋住大門地墊或重疊家具）');
      }
      return;
    }

    const { gx, gz } = this.world.worldToGrid(aheadX, aheadZ);
    if (this.builder.placeFurnitureAt(gx, gz, itemId, rot)) {
      this.audio.playPlaceWood();
      this._recordMiles('furniturePlaced', 1);
      this._toggleBag(false);
      this._refreshHudAll();
      this._showToast('✨ 已在角色面前擺好家具！(+10 里程)');
    } else {
      this._showToast('⚠️ 角色前方空間不足（不能放在水面、樹或建築上）');
    }
  }

  _exportSaveJson() {
    this.saveManager.saveNow();
    const blob = new Blob([JSON.stringify(this.save, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cozy-island-save-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    this._showToast('📤 已匯出小島 JSON 存檔備份！');
  }

  _importSaveJson(ev) {
    const file = ev.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result || '{}'));
        if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.inventory)) {
          throw new Error('Invalid format');
        }
        this.saveManager.data = parsed;
        this.saveManager.saveNow();
        this._showToast('📥 存檔匯入成功，即將重新載入小島！');
        setTimeout(() => window.location.reload(), 650);
      } catch {
        this._showToast('⚠️ 存檔檔案格式不正確');
      }
    };
    reader.readAsText(file);
  }

  _onAccountSwitched(_user, newData) {
    this.save = newData;
    this.world.setSeason(this.save.settings.season);
    this.world.setHouseStage(this.save.houseStage || 0);
    if (this.collection) this.world.setMuseumStage(this.collection.getMuseumStage());
    this.indoor.rebuildRoom(this.save.houseStage || 0);
    this.indoor.restorePlaced();
    this.timeWeather.setSeason(this.save.settings.season);
    this._refreshHudAll();
    this._showToast(`已切換帳號存檔：${this.saveManager.getDisplayName()}`);
  }

  _cycleCamera() {
    if (this._isEditMode()) return;
    this.audio.unlock(); this.audio.playUiPop();
    this.cameraPresetIdx = (this.cameraPresetIdx + 1) % CAMERA_PRESETS.length;
    this.save.settings.cameraPreset = this.cameraPresetIdx;
    this.saveManager.scheduleSave();
    this._refreshHudAll();
    this._showToast(`📷 視角：${CAMERA_PRESETS[this.cameraPresetIdx].label}`);
  }

  _openDialogue(speaker, tag, text, voicePitch = 480, villager = null) {
    this.dialogueState = { open: true, speaker, tag, fullText: text, shownCount: 0, charTimer: 0, voicePitch, activeVillager: villager };
    if (villager) villager.talking = true;
    document.getElementById('dlgSpeaker').textContent = speaker;
    document.getElementById('dlgTag').textContent = tag;
    document.getElementById('dlgText').textContent = '';
    document.getElementById('dlgNext').style.opacity = '0';

    const heartEl = document.getElementById('dlgHeart');
    const actsEl = document.getElementById('dlgActions');
    const giftBar = document.getElementById('dlgGiftBar');
    const qBtn = document.getElementById('btnDlgQuest');
    if (giftBar) giftBar.style.display = 'none';

    if (villager && this.villagerSystem) {
      const fs = this.villagerSystem.getFriendship(villager.def.id);
      const hearts = '♥'.repeat(fs.level) + '♡'.repeat(Math.max(0, 5 - fs.level));
      if (heartEl) {
        heartEl.textContent = `Lv.${fs.level} ${hearts}`;
        heartEl.style.display = 'inline-block';
      }
      if (actsEl) actsEl.style.display = 'flex';
      if (qBtn) {
        const q = this.villagerSystem.getDailyQuest(villager.def);
        if (!q || q.status === 'done') qBtn.textContent = '✅ 今日委託已完成';
        else if (q.status === 'available') qBtn.textContent = '📜 今日小委託';
        else qBtn.textContent = q.ready ? '🎁 交付委託領獎' : `📜 委託中 (${q.have}/${q.count})`;
      }
    } else {
      if (heartEl) heartEl.style.display = 'none';
      if (actsEl) actsEl.style.display = 'none';
    }

    document.getElementById('dialogueBox').classList.add('show');
  }

  _closeDialogue() {
    if (this.dialogueState.activeVillager) this.dialogueState.activeVillager.talking = false;
    this.dialogueState.open = false;
    this.dialogueState.activeVillager = null;
    const giftBar = document.getElementById('dlgGiftBar');
    if (giftBar) giftBar.style.display = 'none';
    document.getElementById('dialogueBox').classList.remove('show');
  }

  _handleInteract() {
    this.audio.unlock();
    if (this._anyModalOpen() || this._isEditMode() || this.transitioning) return;

    if (this.dialogueState.open) {
      if (this.dialogueState.shownCount < this.dialogueState.fullText.length) {
        this.dialogueState.shownCount = this.dialogueState.fullText.length;
        document.getElementById('dlgText').textContent = this.dialogueState.fullText;
        document.getElementById('dlgNext').style.opacity = '1';
      } else {
        this.audio.playUiPop();
        this._closeDialogue();
      }
      return;
    }

    // Active fishing or equipped gathering tool takes priority outdoors unless talking/picking fruit/entering door
    if (this.sceneMode === 'island' && this.gathering && (
      this.gathering.fishing.state !== 'idle' ||
      (this.gathering.equippedTool !== 'hand' && (!this.nearestInteract || !['villager', 'fruit', 'home', 'shop', 'diy', 'museum'].includes(this.nearestInteract.type)))
    )) {
      const handled = this.gathering.useTool(
        this.playerState,
        this.timeWeather.getPhaseKey(),
        this.timeWeather.weather === 'rain'
      );
      if (handled) {
        this._refreshHudAll();
        return;
      }
    }

    if (!this.nearestInteract) return;
    const item = this.nearestInteract;

    if (item.type === 'home') { this._toggleIndoorScene('indoor'); return; }
    if (item.type === 'exit_door') { this._toggleIndoorScene('island'); return; }
    if (item.type === 'shop') { this._toggleShop(true); return; }
    if (item.type === 'diy') { this._toggleDiy(true); return; }
    if (item.type === 'museum') { this._toggleMuseum(true); return; }

    if (item.type === 'indoor_placed') {
      if (this.indoor.removeAt(item.gx, item.gz)) {
        this.audio.playPickupPop();
        this._refreshHudAll();
        this._showToast('🎒 已將面前的室內家具收回背包！');
      }
      return;
    }

    if (item.type === 'fruit') {
      this.world.collectFruit(item.fruitItem);
      const gotWood = Math.random() < 0.25;
      this.inventory.addItem('island_fruit', 1);
      if (gotWood) this.inventory.addItem('softwood', 1);
      this.save.miles += 15;
      this.save.fruitsCollected = (this.save.fruitsCollected || 0) + 1;
      this.saveManager.scheduleSave();
      this.audio.playChime();
      this._recordMiles('fruitsPicked', 1);
      this._refreshHudAll();
      this._showToast(gotWood ? '🍎 收進背包：島嶼鮮果 ×1、柔軟木材 ×1！' : '🍎 收進背包：島嶼鮮果 ×1（+15 里程）');
      return;
    }

    if (item.type === 'placed') {
      const res = this.builder.removeAt(item.gx, item.gz);
      if (res) {
        this.audio.playPickupPop();
        this._refreshHudAll();
        this._showToast('🎒 已將面前的家具收回背包！');
      }
      return;
    }

    if (item.type === 'tree') {
      this.audio.playTreeShake();
      const dropped = this.world.shakeTree(item.treeState);
      this._showToast(dropped > 0 ? `🌳 沙沙沙～掉下了 ${dropped} 顆果實！靠近撿進背包` : '🌳 樹葉沙沙作響，果實已經摘完囉！');
      return;
    }

    if (item.type === 'villager') {
      const v = item.villager;
      const phaseKey = this.timeWeather.weather === 'rain' ? 'rain' : this.timeWeather.getPhaseKey();
      const line = this.villagerSystem.getContextualDialogue(
        v.def,
        phaseKey,
        this.gathering?.equippedTool || 'hand',
        this.saveManager.getDisplayName()
      );
      this.save.villagerTalks[v.def.id] = (this.save.villagerTalks[v.def.id] || 0) + 1;
      this.save.miles += 20;
      const prog = this.villagerSystem.addFriendship(v.def.id, 5, false);
      this.saveManager.scheduleSave();
      this._recordMiles('villagerTalks', 1);
      this._refreshHudAll();
      const finalLine = prog.unlockedRare
        ? `${line}\n✨ 好感度達到 Lv.${prog.level}！解鎖了專屬稀有藍圖「${prog.unlockedRare}」！`
        : line;
      this._openDialogue(v.def.name, v.def.personalityLabel, finalLine, v.def.voicePitch, v);
      return;
    }

    if (item.type === 'bulletin') {
      const text = (this.islandData.bulletinNotes || []).join('\n');
      this.audio.playUiPop();
      this._openDialogue('島嶼佈告欄', '公告', text, 520, null);
      return;
    }

    if (item.type === 'landmark') {
      this.audio.playUiPop();
      this._openDialogue(item.label.replace(/^[^\s]+\s/, ''), '島嶼設施', item.message, 440, null);
    }
  }

  _refreshHudAll() {
    const byId = (id) => document.getElementById(id);
    const preset = CAMERA_PRESETS[this.cameraPresetIdx];
    const pal = SEASON_PALETTES[this.save.settings.season] || SEASON_PALETTES.spring;
    const st = this.economy ? this.economy.getHouseStageInfo() : { icon: '⛺', name: '露營帳篷' };

    byId('hudLocationTitle').textContent = this.sceneMode === 'indoor' ? `${st.icon} ${st.name}（室內）` : '🏝️ 微風森友島';
    byId('hudUser').textContent = `👤 ${this.saveManager.getDisplayName()}`;
    byId('hudBells').textContent = `🪙 ${this.save.bells.toLocaleString()}`;
    byId('hudMiles').textContent = `🎫 ${this.save.miles.toLocaleString()}`;
    byId('hudClock').textContent = `${this.timeWeather.getFormattedClock()} · ${this.timeWeather.getPhaseLabel()}`;
    byId('hudWeatherBadge').textContent = this.timeWeather.getWeatherLabel();

    byId('btnBuildMode').textContent = this._isEditMode() ? '✓ 退出佈置' : (this.sceneMode === 'indoor' ? '🏡 室內佈置' : '🏗️ 佈置模式');
    byId('btnHomeToggle').textContent = this.sceneMode === 'indoor' ? '🏝️ 回小島' : `${st.icon} 進小屋`;
    if (this.collection) {
      const uncl = this.collection.getUnclaimedGoalCount();
      const don = this.collection.getDonatableBagSlots().length;
      const critBtn = byId('btnCritterpedia');
      const musBtn = byId('btnMuseum');
      if (critBtn) critBtn.innerHTML = `📖 圖鑑${uncl > 0 ? `<span class="pill-badge">${uncl}</span>` : ''}`;
      if (musBtn) musBtn.innerHTML = `🦉 博物館${don > 0 ? `<span class="pill-badge">${don}</span>` : ''}`;
    }
    byId('btnCam').textContent = `📷 ${preset.label}`;
    byId('btnClockMode').textContent = this.timeWeather.clockMode === 'realtime' ? '🕒 現實時間' : '⏩ 加速日夜';
    byId('btnWeather').textContent = this.timeWeather.getWeatherLabel();
    byId('btnSeason').textContent = pal.label;
    byId('btnCurve').textContent = this.rollingEnabled ? '🌍 弧面：開' : '📐 弧面：平';
    byId('btnMute').textContent = this.audio.muted ? '🔇 靜音' : '🎵 音效開';
  }

  _showToast(msg) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
  }

  _updatePlayer(dt, elapsed) {
    const move = (this.dialogueState.open || this._anyModalOpen() || this.transitioning)
      ? { x: 0, z: 0, mag: 0, sprint: false }
      : this.input.getMoveVector();

    if (move.mag > 0.05) {
      const speed = this._isEditMode() ? 9.2 : (move.sprint ? 7.2 : 4.9);
      const dx = move.x * speed * dt;
      const dz = move.z * speed * dt;

      let moved = false;
      if (this._canPlayerWalk(this.playerState.x + dx, this.playerState.z, this.playerState.y)) {
        this.playerState.x += dx; moved = true;
      }
      if (this._canPlayerWalk(this.playerState.x, this.playerState.z + dz, this.playerState.y)) {
        this.playerState.z += dz; moved = true;
      }

      const targetYaw = Math.atan2(move.x, move.z);
      let diff = ((targetYaw - this.playerState.yaw + Math.PI) % (Math.PI * 2)) - Math.PI;
      if (diff < -Math.PI) diff += Math.PI * 2;
      this.playerState.yaw += diff * Math.min(1, dt * 13);

      const rate = move.sprint ? 15 : 11;
      this.playerState.walkPhase += dt * rate;
      const s = Math.sin(this.playerState.walkPhase);

      this.playerModel.bodyRig.position.y = Math.abs(s) * 0.16;
      this.playerModel.bodyRig.rotation.z = s * 0.08;
      this.playerModel.bodyRig.scale.set(1 + Math.abs(s) * 0.04, 1 - Math.abs(s) * 0.04, 1);
      this.playerModel.leftLeg.rotation.x = s * 0.65;
      this.playerModel.rightLeg.rotation.x = -s * 0.65;
      this.playerModel.leftArm.rotation.x = -s * 0.55;
      this.playerModel.rightArm.rotation.x = s * 0.55;

      if (moved && !this._isEditMode()) {
        this.playerState.stepAccum += dt * (move.sprint ? 3.2 : 2.3);
        if (this.playerState.stepAccum >= 1) {
          this.playerState.stepAccum = 0;
          this.audio.playFootstep(this.sceneMode === 'indoor' ? 'wood' : this.world.getSurfaceType(this.playerState.x, this.playerState.z));
        }
      }
    } else {
      const breathe = Math.sin(elapsed * 2.6) * 0.02;
      this.playerModel.bodyRig.position.y *= 0.82;
      this.playerModel.bodyRig.rotation.z *= 0.82;
      this.playerModel.bodyRig.scale.set(1 + breathe, 1 - breathe, 1);
      this.playerModel.leftLeg.rotation.x *= 0.82;
      this.playerModel.rightLeg.rotation.x *= 0.82;
      this.playerModel.leftArm.rotation.x *= 0.82;
      this.playerModel.rightArm.rotation.x *= 0.82;
    }

    const groundY = this.sceneMode === 'indoor' ? 0 : this.world.getGroundHeight(this.playerState.x, this.playerState.z);
    this.playerState.y += (groundY - this.playerState.y) * Math.min(1, dt * 16);

    this.playerModel.root.position.set(this.playerState.x, this.playerState.y, this.playerState.z);
    this.playerModel.root.rotation.y = this.playerState.yaw;

    if (this.sceneMode === 'island') {
      rollingUniforms.uPlayerPos.value.set(this.playerState.x, this.playerState.y, this.playerState.z);
      const targetCurve = (this.rollingEnabled && !this.builder.editMode) ? ROLLING_CURVE_STRENGTH : 0;
      rollingUniforms.uCurveStrength.value += (targetCurve - rollingUniforms.uCurveStrength.value) * Math.min(1, dt * 8);
    } else {
      rollingUniforms.uCurveStrength.value = 0;
    }
  }

  _updateCamera(dt) {
    let preset;
    let targetX = this.playerState.x;
    let targetY = this.playerState.y;
    let targetZ = this.playerState.z;

    if (this.sceneMode === 'indoor') {
      const span = this.indoor.gridSize;
      preset = this.indoor.editMode
        ? { dist: span * 1.15, height: span * 1.95, fov: 40, lookY: 0 }
        : { dist: span * 1.35 + 3.2, height: span * 0.78 + 2.2, fov: 42, lookY: 1.05 };
      if (this.indoor.editMode) { targetX = 0; targetY = 0; targetZ = 0; }
      else { targetX = this.playerState.x * 0.45; targetZ = this.playerState.z * 0.35 - 0.65; }
    } else {
      preset = this.builder.editMode
        ? { dist: 14.5, height: 22.5, fov: 40, lookY: 0.0 }
        : (CAMERA_PRESETS[this.cameraPresetIdx] || CAMERA_PRESETS[1]);
    }

    const k = Math.min(1, dt * 6.5);
    this.camera.position.x += (targetX - this.camera.position.x) * k;
    this.camera.position.y += (targetY + preset.height - this.camera.position.y) * k;
    this.camera.position.z += (targetZ + preset.dist - this.camera.position.z) * k;

    if (Math.abs(this.camera.fov - preset.fov) > 0.05) {
      this.camera.fov += (preset.fov - this.camera.fov) * k;
      this.camera.updateProjectionMatrix();
    }
    this.camera.lookAt(targetX, targetY + preset.lookY, targetZ);
  }

  _updateDialogueTypewriter(dt) {
    if (!this.dialogueState.open || this.dialogueState.shownCount >= this.dialogueState.fullText.length) return;
    this.dialogueState.charTimer += dt;
    while (this.dialogueState.charTimer >= 0.036 && this.dialogueState.shownCount < this.dialogueState.fullText.length) {
      this.dialogueState.charTimer -= 0.036;
      this.dialogueState.shownCount++;
      const ch = this.dialogueState.fullText[this.dialogueState.shownCount - 1];
      document.getElementById('dlgText').textContent = this.dialogueState.fullText.slice(0, this.dialogueState.shownCount);
      if (this.dialogueState.shownCount % 2 === 1 && ch && !/[\s，。！？、～…]/.test(ch)) {
        this.audio.playVoiceSyllable(this.dialogueState.voicePitch);
      }
    }
    if (this.dialogueState.shownCount >= this.dialogueState.fullText.length) {
      document.getElementById('dlgNext').style.opacity = '1';
    }
  }

  _updateInteractionPrompt() {
    const pill = document.getElementById('interactPill');
    const mobBtn = document.getElementById('mobileActionBtn');
    if (this.dialogueState.open || this._anyModalOpen() || this._isEditMode()) {
      pill.classList.remove('show');
      if (mobBtn && this.dialogueState.open) mobBtn.textContent = '▶ 繼續';
      return;
    }

    if (this.sceneMode === 'indoor') {
      let nearest = null;
      const dExit = Math.hypot(this.playerState.x - this.indoor.exitPos.x, this.playerState.z - this.indoor.exitPos.z);
      if (dExit < 1.55) {
        nearest = { type: 'exit_door', label: '🚪 走出小屋回到微風森友島' };
      } else {
        const ax = this.playerState.x + Math.sin(this.playerState.yaw) * 1.55;
        const az = this.playerState.z + Math.cos(this.playerState.yaw) * 1.55;
        const { gx, gz } = this.indoor.worldToGrid(ax, az);
        const rec = (this.save.placedIndoor || []).find((p) => p.gx === gx && p.gz === gz);
        if (rec) {
          const def = this.inventory.getDef(rec.itemId);
          nearest = { type: 'indoor_placed', gx, gz, label: `🎒 收回 ${def?.name || '家具'}` };
        }
      }
      this.nearestInteract = nearest;
      if (nearest) {
        pill.textContent = `[空白鍵 / 點擊] ${nearest.label}`;
        pill.classList.add('show');
        if (mobBtn) { mobBtn.textContent = nearest.label.split(' ')[0]; mobBtn.classList.add('active'); }
      } else {
        pill.classList.remove('show');
        if (mobBtn) { mobBtn.textContent = '✨ 互動'; mobBtn.classList.remove('active'); }
      }
      return;
    }

    let nearest = this.world.findNearestInteraction(this.playerState.x, this.playerState.z, this.playerState.y);

    // Allow facing pickup of placed outdoor furniture when nothing higher-priority is closer
    if (!nearest) {
      const ax = this.playerState.x + Math.sin(this.playerState.yaw) * 1.65;
      const az = this.playerState.z + Math.cos(this.playerState.yaw) * 1.65;
      const { gx, gz } = this.world.worldToGrid(ax, az);
      const rec = this.builder.placedMeshes.get(`${gx},${gz}`);
      if (rec) {
        const def = this.inventory.getDef(rec.entry.itemId);
        nearest = { type: 'placed', gx, gz, label: `🎒 收回 ${def?.name || '家具'}` };
      }
    }
    this.nearestInteract = nearest;

    const toolHint = this.gathering ? this.gathering.getContextHint(this.playerState) : null;
    const isFishingActive = this.gathering && this.gathering.fishing.state !== 'idle';

    if (isFishingActive && toolHint) {
      pill.textContent = `[空白鍵 / 點擊] ${toolHint}`;
      pill.classList.add('show');
      if (mobBtn) { mobBtn.textContent = this.gathering.fishing.state === 'bite' ? '❗ 拉竿' : '🎣 收竿'; mobBtn.classList.add('active'); }
      return;
    }

    if (nearest && (this.gathering?.equippedTool === 'hand' || ['villager', 'fruit', 'home', 'shop', 'diy', 'museum'].includes(nearest.type))) {
      pill.textContent = `[空白鍵 / 點擊] ${nearest.label}`;
      pill.classList.add('show');
      if (mobBtn) { mobBtn.textContent = nearest.label.split(' ')[0]; mobBtn.classList.add('active'); }
    } else if (toolHint) {
      pill.textContent = `[空白鍵 / 點擊] ${toolHint}`;
      pill.classList.add('show');
      if (mobBtn) { mobBtn.textContent = toolHint.split(' ')[0]; mobBtn.classList.add('active'); }
    } else if (nearest) {
      pill.textContent = `[空白鍵 / 點擊] ${nearest.label}`;
      pill.classList.add('show');
      if (mobBtn) { mobBtn.textContent = nearest.label.split(' ')[0]; mobBtn.classList.add('active'); }
    } else {
      pill.classList.remove('show');
      if (mobBtn) { mobBtn.textContent = '✨ 互動'; mobBtn.classList.remove('active'); }
    }
  }

  _animate() {
    requestAnimationFrame(() => this._animate());
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const elapsed = this.clock.elapsedTime;

    this._updatePlayer(dt, elapsed);
    if (this.sceneMode === 'island') {
      this.timeWeather.update(dt, elapsed, this.playerModel.root.position);
      const schedPhase = this.timeWeather.weather === 'rain' ? 'rain' : this.timeWeather.getPhaseKey();
      this.world.update(dt, elapsed, this.playerModel.root.position, this.playerState.yaw, this.timeWeather.lampFactor, schedPhase);
      this.builder.update(dt);
      if (this.gathering) {
        this.gathering.update(dt, elapsed, this.playerModel.root.position);
        if (this.heldTools) {
          const sw = this.gathering.swingAnim > 0 ? Math.sin(this.gathering.swingAnim * 16) * 0.9 : 0;
          this.heldTools.holder.rotation.x = sw;
        }
      }
    } else {
      this.indoor.update(dt);
    }

    const bar = document.getElementById('toolHotbar');
    if (bar) bar.style.display = (this._isEditMode() || this.sceneMode === 'indoor') ? 'none' : 'flex';

    this._updateCamera(dt);
    this._updateDialogueTypewriter(dt);
    this._updateInteractionPrompt();

    this._hudClockAccum += dt;
    if (this._hudClockAccum >= 0.4) {
      this._hudClockAccum = 0;
      const clockEl = document.getElementById('hudClock');
      if (clockEl) clockEl.textContent = `${this.timeWeather.getFormattedClock()} · ${this.timeWeather.getPhaseLabel()}`;
      this.audio.setMood(this.timeWeather.getPhaseKey(), this.timeWeather.weather === 'rain');
    }

    this.renderer.render(this.sceneMode === 'indoor' ? this.indoor.scene : this.scene, this.camera);
  }
}

new CozyIslandApp();
