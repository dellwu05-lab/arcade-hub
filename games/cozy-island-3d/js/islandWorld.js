import * as THREE from '../vendor/three.module.min.js';
import { GRID_SIZE, TILE_SIZE, HALF_WORLD, GROUND_Y, SEASON_PALETTES } from './config.js';
import { makeCozyMaterial } from './rollingShader.js';
import {
  createFruitTree,
  createPineTree,
  createCozyTent,
  createCottage,
  createPlayerHomeMesh,
  createMuseumMesh,
  createStreetLamp,
  createCampfire,
  createBulletinBoard,
  createWoodenBridge,
  createCoastalRock,
  createVillagerModel
} from './proceduralAssets.js';

export const TILE_TYPE = {
  WATER: 0,
  SAND: 1,
  GRASS: 2,
  PLAZA: 3,
  RIVER: 4,
  BRIDGE: 5,
  CLIFF: 6,
  RAMP: 7
};

export class IslandWorld {
  constructor(scene, seasonKey = 'spring', villagerDefs = []) {
    this.scene = scene;
    this.season = seasonKey;
    this.grid = new Uint8Array(GRID_SIZE * GRID_SIZE);
    this.colliders = []; // { x, z, r }
    this.interactables = []; // { id, type, label, x, z, radius, data }
    this.glowMaterials = [];
    this.trees = [];
    this.droppedFruits = [];
    this.villagers = [];

    this._initSeasonMaterials();
    this._generateTileMap();
    this._buildTerrainMeshes();
    this._buildLandmarks();
    this._buildTreesAndRocks();
    this._buildInstancedFlowers();
    this._buildVillagers(villagerDefs);
    this._buildTileCursor();
  }

  _initSeasonMaterials() {
    const pal = SEASON_PALETTES[this.season] || SEASON_PALETTES.spring;
    this.mats = {
      grassA: makeCozyMaterial(pal.grass, { textureKind: 'grass', roughness: 0.98 }),
      grassB: makeCozyMaterial(pal.grass, { textureKind: 'grass', roughness: 0.98 }),
      cliffTop: makeCozyMaterial(pal.cliff, { textureKind: 'grass', roughness: 0.98 }),
      cliffSide: makeCozyMaterial(pal.cliffSide, { textureKind: 'matte', roughness: 0.97 }),
      sand: makeCozyMaterial(pal.sand, { textureKind: 'matte', roughness: 0.98 }),
      plaza: makeCozyMaterial(0xd8cfc0, { textureKind: 'plaza', roughness: 0.96 }),
      ramp: makeCozyMaterial(0xa87d56, { textureKind: 'matte', roughness: 0.95 }),
      treeLeaf: makeCozyMaterial(pal.treeLeaf, { textureKind: 'matte', roughness: 0.95 }),
      cherryLeaf: makeCozyMaterial(pal.cherryLeaf, { textureKind: 'matte', roughness: 0.95 }),
      pineLeaf: makeCozyMaterial(pal.pineLeaf, { textureKind: 'matte', roughness: 0.95 }),
      fruit: makeCozyMaterial(pal.fruit, { textureKind: 'cloth', roughness: 0.9 }),
      water: makeCozyMaterial(0x45a9d6, { transparent: true, opacity: 0.88, roughness: 0.55, noGrain: true }),
      foam: makeCozyMaterial(0xe0f7ff, { transparent: true, opacity: 0.72, noGrain: true })
    };
  }

  setSeason(seasonKey) {
    this.season = seasonKey;
    const pal = SEASON_PALETTES[seasonKey] || SEASON_PALETTES.spring;
    this.mats.grassA.color.setHex(pal.grass);
    this.mats.grassB.color.setHex(pal.grassAlt);
    this.mats.cliffTop.color.setHex(pal.cliff);
    this.mats.cliffSide.color.setHex(pal.cliffSide);
    this.mats.sand.color.setHex(pal.sand);
    this.mats.treeLeaf.color.setHex(pal.treeLeaf);
    this.mats.cherryLeaf.color.setHex(pal.cherryLeaf);
    this.mats.pineLeaf.color.setHex(pal.pineLeaf);
    this.mats.fruit.color.setHex(pal.fruit);

    if (this.flowerPetalMesh) {
      const c = new THREE.Color();
      for (let i = 0; i < this.flowerCount; i++) {
        c.setHex(pal.flowers[i % pal.flowers.length]);
        this.flowerPetalMesh.setColorAt(i, c);
      }
      this.flowerPetalMesh.instanceColor.needsUpdate = true;
    }
  }

  gridToWorld(gx, gz) {
    return {
      x: (gx + 0.5) * TILE_SIZE - HALF_WORLD,
      z: (gz + 0.5) * TILE_SIZE - HALF_WORLD
    };
  }

  worldToGrid(wx, wz) {
    return {
      gx: Math.floor((wx + HALF_WORLD) / TILE_SIZE),
      gz: Math.floor((wz + HALF_WORLD) / TILE_SIZE)
    };
  }

  getTile(gx, gz) {
    if (gx < 0 || gz < 0 || gx >= GRID_SIZE || gz >= GRID_SIZE) return TILE_TYPE.WATER;
    return this.grid[gz * GRID_SIZE + gx];
  }

  _setTile(gx, gz, type) {
    if (gx < 0 || gz < 0 || gx >= GRID_SIZE || gz >= GRID_SIZE) return;
    this.grid[gz * GRID_SIZE + gx] = type;
  }

  _generateTileMap() {
    const cx = GRID_SIZE / 2;
    const cz = GRID_SIZE / 2;

    for (let gz = 0; gz < GRID_SIZE; gz++) {
      for (let gx = 0; gx < GRID_SIZE; gx++) {
        const nx = (gx - cx) / (GRID_SIZE * 0.42);
        const nz = (gz - cz) / (GRID_SIZE * 0.42);
        // Squircle cozy island silhouette with gentle organic wobble
        const wobble = Math.sin(gx * 0.35) * 0.045 + Math.cos(gz * 0.31) * 0.045;
        const r4 = Math.pow(Math.abs(nx), 3.4) + Math.pow(Math.abs(nz), 3.4) + wobble;

        if (r4 > 1.02) {
          this._setTile(gx, gz, TILE_TYPE.WATER);
        } else if (r4 > 0.74) {
          this._setTile(gx, gz, TILE_TYPE.SAND);
        } else {
          this._setTile(gx, gz, TILE_TYPE.GRASS);
        }
      }
    }

    // Elevated Level-2 North-West Cliff Plateau (x: 11..23, z: 10..17)
    for (let gz = 10; gz <= 17; gz++) {
      for (let gx = 11; gx <= 23; gx++) {
        if (this.getTile(gx, gz) === TILE_TYPE.GRASS) {
          this._setTile(gx, gz, TILE_TYPE.CLIFF);
        }
      }
    }

    // Walkable Wooden Ramp ascending north to Cliff (x: 17..18, z: 18..20)
    for (let gz = 18; gz <= 20; gz++) {
      this._setTile(17, gz, TILE_TYPE.RAMP);
      this._setTile(18, gz, TILE_TYPE.RAMP);
    }

    // Winding River from North-East cliff down & across South-East to ocean
    for (let gz = 11; gz <= 32; gz++) {
      const rx = Math.round(31 + Math.sin(gz * 0.25) * 2.2);
      for (let dx = -1; dx <= 0; dx++) {
        const cur = this.getTile(rx + dx, gz);
        if (cur !== TILE_TYPE.WATER) this._setTile(rx + dx, gz, TILE_TYPE.RIVER);
      }
    }
    for (let gx = 30; gx <= 43; gx++) {
      const rz = Math.round(31 + Math.sin(gx * 0.3) * 1.1);
      this._setTile(gx, rz, TILE_TYPE.RIVER);
      this._setTile(gx, rz + 1, TILE_TYPE.RIVER);
    }

    // Wooden Bridge across the river at gz = 24..25, gx = 29..33
    for (let gz = 24; gz <= 25; gz++) {
      for (let gx = 29; gx <= 33; gx++) {
        this._setTile(gx, gz, TILE_TYPE.BRIDGE);
      }
    }

    // Central Cobblestone Service Plaza (gx: 21..26, gz: 21..26)
    for (let gz = 21; gz <= 26; gz++) {
      for (let gx = 21; gx <= 26; gx++) {
        this._setTile(gx, gz, TILE_TYPE.PLAZA);
      }
    }
  }

  _buildTerrainMeshes() {
    // Broad animated ocean surface
    const oceanGeo = new THREE.PlaneGeometry(180, 180, 36, 36);
    oceanGeo.rotateX(-Math.PI / 2);
    this.oceanMesh = new THREE.Mesh(oceanGeo, this.mats.water);
    this.oceanMesh.position.y = GROUND_Y.WATER;
    this.oceanMesh.receiveShadow = true;
    this.scene.add(this.oceanMesh);

    // Subtle deep seabed beneath translucent water
    const seabed = new THREE.Mesh(
      new THREE.PlaneGeometry(180, 180).rotateX(-Math.PI / 2),
      makeCozyMaterial(0x0c749b)
    );
    seabed.position.y = -1.2;
    this.scene.add(seabed);

    // Batch tile blocks with InstancedMesh per surface type (fast & crisp!)
    const buckets = {
      sand: [],
      grassA: [],
      grassB: [],
      plaza: [],
      cliff: []
    };

    for (let gz = 0; gz < GRID_SIZE; gz++) {
      for (let gx = 0; gx < GRID_SIZE; gx++) {
        const t = this.getTile(gx, gz);
        if (t === TILE_TYPE.WATER || t === TILE_TYPE.RIVER) continue;
        const pos = this.gridToWorld(gx, gz);
        if (t === TILE_TYPE.SAND) {
          buckets.sand.push(pos);
        } else if (t === TILE_TYPE.PLAZA) {
          buckets.plaza.push(pos);
        } else if (t === TILE_TYPE.CLIFF) {
          buckets.cliff.push(pos);
        } else if (t === TILE_TYPE.GRASS || t === TILE_TYPE.RAMP) {
          if ((gx + gz) % 2 === 0) buckets.grassA.push(pos);
          else buckets.grassB.push(pos);
        }
      }
    }

    const dummy = new THREE.Object3D();
    const buildInstancedTiles = (list, geo, mat, yCenter) => {
      if (!list.length) return;
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      im.receiveShadow = true;
      im.castShadow = false;
      list.forEach((p, idx) => {
        dummy.position.set(p.x, yCenter, p.z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        im.setMatrixAt(idx, dummy.matrix);
      });
      im.instanceMatrix.needsUpdate = true;
      this.scene.add(im);
    };

    const sandGeo = new THREE.BoxGeometry(TILE_SIZE + 0.004, 1.0, TILE_SIZE + 0.004);
    const grassGeo = new THREE.BoxGeometry(TILE_SIZE + 0.004, 1.28, TILE_SIZE + 0.004);
    const cliffSideGeo = new THREE.BoxGeometry(TILE_SIZE + 0.004, 1.52, TILE_SIZE + 0.004);
    const cliffCapGeo = new THREE.BoxGeometry(TILE_SIZE + 0.004, 0.24, TILE_SIZE + 0.004);

    buildInstancedTiles(buckets.sand, sandGeo, this.mats.sand, GROUND_Y.SAND - 0.5);
    buildInstancedTiles(buckets.grassA, grassGeo, this.mats.grassA, GROUND_Y.GRASS - 0.64);
    buildInstancedTiles(buckets.grassB, grassGeo, this.mats.grassB, GROUND_Y.GRASS - 0.64);
    buildInstancedTiles(buckets.plaza, grassGeo, this.mats.plaza, GROUND_Y.GRASS - 0.63);
    buildInstancedTiles(buckets.cliff, cliffSideGeo, this.mats.cliffSide, GROUND_Y.CLIFF - 0.88);
    buildInstancedTiles(buckets.cliff, cliffCapGeo, this.mats.cliffTop, GROUND_Y.CLIFF - 0.12);

    // Build visual Sloped Wooden Ramp at gx=17..18, gz=18..20
    const rampCenter = this.gridToWorld(17.5, 19);
    const rampLength = TILE_SIZE * 3.15;
    const dy = GROUND_Y.CLIFF - GROUND_Y.GRASS;
    const hyp = Math.hypot(rampLength, dy);
    const slopeAngle = Math.atan2(dy, rampLength);

    const rampMesh = new THREE.Mesh(
      new THREE.BoxGeometry(TILE_SIZE * 2.0, 0.22, hyp),
      this.mats.ramp
    );
    rampMesh.position.set(rampCenter.x, (GROUND_Y.GRASS + GROUND_Y.CLIFF) / 2 - 0.05, rampCenter.z);
    rampMesh.rotation.x = slopeAngle;
    rampMesh.receiveShadow = true;
    rampMesh.castShadow = true;
    this.scene.add(rampMesh);

    // Wooden Arch Bridge across the river (horizontal along X at gz = 24.5, gx = 31)
    const bridgePos = this.gridToWorld(30.5, 24.5);
    const bridge = createWoodenBridge(TILE_SIZE * 4.4, TILE_SIZE * 1.9);
    bridge.rotation.y = Math.PI / 2;
    bridge.position.set(bridgePos.x, GROUND_Y.GRASS + 0.02, bridgePos.z);
    this.scene.add(bridge);
  }

  _addCollider(x, z, r) {
    this.colliders.push({ x, z, r });
  }

  _buildLandmarks() {
    // 1. Service Hall at North edge of Plaza
    const hallPos = this.gridToWorld(23.5, 20.5);
    const serviceHall = createCottage({
      wallColor: 0xfff5e4,
      roofColor: 0x4ca973,
      awningColor: 0xf4a261,
      scale: 1.15,
      glowRegistry: this.glowMaterials
    });
    serviceHall.position.set(hallPos.x, GROUND_Y.GRASS, hallPos.z);
    this.scene.add(serviceHall);
    this._addCollider(hallPos.x, hallPos.z, 2.35);
    this.interactables.push({
      id: 'service_diy',
      type: 'diy',
      label: '🔨 廣場 DIY 工作台 & 擴建',
      x: hallPos.x,
      z: hallPos.z + 2.1,
      radius: 2.5
    });

    // 2. Bulletin Board next to Service Hall
    const boardPos = this.gridToWorld(26.2, 22.0);
    const board = createBulletinBoard();
    board.position.set(boardPos.x, GROUND_Y.GRASS, boardPos.z);
    board.rotation.y = -0.25;
    this.scene.add(board);
    this._addCollider(boardPos.x, boardPos.z, 0.9);
    this.interactables.push({
      id: 'plaza_board',
      type: 'bulletin',
      label: '📋 閱讀島嶼佈告欄',
      x: boardPos.x,
      z: boardPos.z + 0.9,
      radius: 2.2
    });

    // 3. Plaza Campfire with warm dynamic PointLight
    const firePos = this.gridToWorld(23.5, 25.0);
    this.campfire = createCampfire(this.glowMaterials);
    this.campfire.group.position.set(firePos.x, GROUND_Y.GRASS, firePos.z);
    this.campfireLight = new THREE.PointLight(0xff9f43, 1.8, 12, 1.5);
    this.campfireLight.position.set(0, 1.15, 0);
    this.campfire.group.add(this.campfireLight);
    this.scene.add(this.campfire.group);
    this._addCollider(firePos.x, firePos.z, 0.95);

    // 4. Player Cozy Home (West meadow near beach — dynamically upgrades Stage 0 -> 1 -> 2!)
    const tentPos = this.gridToWorld(14.5, 27.5);
    this.playerHomePos = { x: tentPos.x, y: GROUND_Y.GRASS, z: tentPos.z };
    this.playerHomeAnchor = new THREE.Group();
    this.playerHomeAnchor.position.set(tentPos.x, GROUND_Y.GRASS, tentPos.z);
    this.scene.add(this.playerHomeAnchor);
    this._addCollider(tentPos.x, tentPos.z, 2.0);
    this.homeInteractable = {
      id: 'player_tent',
      type: 'home',
      label: '⛺ 進入我的露營帳篷',
      x: tentPos.x,
      z: tentPos.z + 1.9,
      radius: 2.5
    };
    this.interactables.push(this.homeInteractable);
    this.setHouseStage(0);

    // 5. Nook-style Cozy Shop (East across bridge)
    const shopPos = this.gridToWorld(35.5, 23.5);
    const shop = createCottage({
      wallColor: 0xffe8c2,
      roofColor: 0x3a86ff,
      awningColor: 0xe63946,
      scale: 1.05,
      glowRegistry: this.glowMaterials
    });
    shop.position.set(shopPos.x, GROUND_Y.GRASS, shopPos.z);
    this.scene.add(shop);
    this._addCollider(shopPos.x, shopPos.z, 2.2);
    this.interactables.push({
      id: 'island_shop',
      type: 'shop',
      label: '🏪 進入森友雜貨店（買賣／今日高價）',
      x: shopPos.x,
      z: shopPos.z + 2.0,
      radius: 2.6
    });

    // 6. Museum Building Anchor (On the Level-2 Cliff — evolves with Week 6 donations!)
    const museumPos = this.gridToWorld(14.5, 13.5);
    this.museumAnchor = new THREE.Group();
    this.museumAnchor.position.set(museumPos.x, GROUND_Y.CLIFF, museumPos.z);
    this.scene.add(this.museumAnchor);
    this._addCollider(museumPos.x, museumPos.z, 2.3);
    this.museumInteractable = {
      id: 'island_museum',
      type: 'museum',
      label: '🦉 進入高地博物館（捐贈／展廳）',
      x: museumPos.x,
      z: museumPos.z + 2.0,
      radius: 2.7
    };
    this.interactables.push(this.museumInteractable);
    this.setMuseumStage(0);

    // 7. Two Villager Cottages
    const vHome1 = this.gridToWorld(18.5, 32.5);
    const house1 = createCottage({
      wallColor: 0xffd6e0,
      roofColor: 0xf07167,
      scale: 0.88,
      glowRegistry: this.glowMaterials
    });
    house1.position.set(vHome1.x, GROUND_Y.GRASS, vHome1.z);
    this.scene.add(house1);
    this._addCollider(vHome1.x, vHome1.z, 1.9);

    const vHome2 = this.gridToWorld(27.0, 14.5);
    const house2 = createCottage({
      wallColor: 0xfff3d6,
      roofColor: 0xe9a825,
      scale: 0.88,
      glowRegistry: this.glowMaterials
    });
    house2.position.set(vHome2.x, GROUND_Y.GRASS, vHome2.z);
    this.scene.add(house2);
    this._addCollider(vHome2.x, vHome2.z, 1.9);

    // Week 5: Cottages for Ruby (Normal Bunny) & Baloo (Jock Bear)
    const vHome3 = this.gridToWorld(15.2, 21.8);
    const house3 = createCottage({
      wallColor: 0xf4ecf8,
      roofColor: 0xb17acc,
      scale: 0.86,
      glowRegistry: this.glowMaterials
    });
    house3.position.set(vHome3.x, GROUND_Y.GRASS, vHome3.z);
    this.scene.add(house3);
    this._addCollider(vHome3.x, vHome3.z, 1.9);

    const vHome4 = this.gridToWorld(35.8, 30.2);
    const house4 = createCottage({
      wallColor: 0xffe9dc,
      roofColor: 0xd95d4c,
      scale: 0.88,
      glowRegistry: this.glowMaterials
    });
    house4.position.set(vHome4.x, GROUND_Y.GRASS, vHome4.z);
    this.scene.add(house4);
    this._addCollider(vHome4.x, vHome4.z, 1.9);

    // 8. Streetlamps around Plaza, Bridge, and Camp
    const lampCoords = [
      [20.5, 21.5], [26.8, 21.5], [20.5, 26.5], [26.8, 26.5],
      [16.2, 28.5], [28.6, 23.2], [33.5, 25.8], [16.5, 17.2]
    ];
    lampCoords.forEach(([gx, gz]) => {
      const p = this.gridToWorld(gx, gz);
      const tile = this.getTile(Math.round(gx), Math.round(gz));
      const y = tile === TILE_TYPE.CLIFF ? GROUND_Y.CLIFF : GROUND_Y.GRASS;
      const lamp = createStreetLamp(this.glowMaterials);
      lamp.position.set(p.x, y, p.z);
      this.scene.add(lamp);
      this._addCollider(p.x, p.z, 0.35);
    });
  }

  _buildTreesAndRocks() {
    // Deterministic curated tree spots across meadow and upper cliff
    const treeSpots = [
      [11, 22, 'fruit'], [12, 26, 'cherry'], [11, 31, 'fruit'], [15, 34, 'cherry'],
      [22, 34, 'fruit'], [26, 35, 'cherry'], [28, 30, 'fruit'], [19, 25, 'cherry'],
      [35, 18, 'fruit'], [37, 27, 'cherry'], [35, 35, 'fruit'], [38, 21, 'fruit'],
      [25, 12, 'cherry'], [29, 17, 'fruit'], [10, 18, 'fruit'], [13, 21, 'fruit'],
      // Upper cliff pines & cherry
      [12, 11, 'pine'], [15, 11, 'pine'], [20, 11, 'pine'], [22, 12, 'pine'],
      [21, 15, 'cherry'], [12, 16, 'pine']
    ];

    treeSpots.forEach(([gx, gz, kind], idx) => {
      const t = this.getTile(gx, gz);
      if (t !== TILE_TYPE.GRASS && t !== TILE_TYPE.CLIFF) return;
      const p = this.gridToWorld(gx, gz);
      const y = t === TILE_TYPE.CLIFF ? GROUND_Y.CLIFF : GROUND_Y.GRASS;

      if (kind === 'pine') {
        const pine = createPineTree(this.mats.pineLeaf);
        pine.position.set(p.x, y, p.z);
        this.scene.add(pine);
        this._addCollider(p.x, p.z, 0.6);
      } else {
        const leafMat = kind === 'cherry' ? this.mats.cherryLeaf : this.mats.treeLeaf;
        const treeObj = createFruitTree(leafMat, this.mats.fruit, true);
        treeObj.group.position.set(p.x, y, p.z);
        treeObj.group.rotation.y = (idx * 1.37) % (Math.PI * 2);
        this.scene.add(treeObj.group);
        this._addCollider(p.x, p.z, 0.62);

        const treeState = {
          id: `tree_${idx}`,
          x: p.x,
          y,
          z: p.z,
          hasFruits: true,
          shakeTime: 0,
          ...treeObj
        };
        this.trees.push(treeState);
        this.interactables.push({
          id: treeState.id,
          type: 'tree',
          label: '🌳 搖一搖果樹',
          x: p.x,
          z: p.z,
          radius: 2.3,
          treeState
        });
      }
    });

    // Coastal decorative rocks on sand ring
    const rockCoords = [
      [7, 17], [8, 34], [18, 40], [34, 40], [40, 29], [39, 14], [25, 7], [12, 8]
    ];
    rockCoords.forEach(([gx, gz], idx) => {
      const p = this.gridToWorld(gx, gz);
      const rock = createCoastalRock(0.9 + (idx % 3) * 0.22);
      rock.position.set(p.x, GROUND_Y.SAND, p.z);
      rock.rotation.y = idx * 0.9;
      this.scene.add(rock);
      this._addCollider(p.x, p.z, 0.8);
    });
  }

  _buildInstancedFlowers() {
    const pal = SEASON_PALETTES[this.season] || SEASON_PALETTES.spring;
    const spots = [];

    // Deterministic scatter on open grass & cliff tiles
    let seed = 4219;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };

    for (let i = 0; i < 150; i++) {
      const gx = 9 + Math.floor(rand() * 30);
      const gz = 9 + Math.floor(rand() * 30);
      const t = this.getTile(gx, gz);
      if (t !== TILE_TYPE.GRASS && t !== TILE_TYPE.CLIFF) continue;
      const p = this.gridToWorld(gx, gz);
      const wx = p.x + (rand() - 0.5) * 1.1;
      const wz = p.z + (rand() - 0.5) * 1.1;
      if (this.colliders.some((c) => Math.hypot(c.x - wx, c.z - wz) < c.r + 0.5)) continue;
      spots.push({
        x: wx,
        y: t === TILE_TYPE.CLIFF ? GROUND_Y.CLIFF : GROUND_Y.GRASS,
        z: wz,
        scale: 0.75 + rand() * 0.45
      });
    }

    this.flowerCount = spots.length;
    const stemGeo = new THREE.CylinderGeometry(0.03, 0.04, 0.26, 5);
    const petalGeo = new THREE.DodecahedronGeometry(0.14, 0);
    const stemMat = makeCozyMaterial(0x4ea854);
    const petalMat = makeCozyMaterial(0xffffff);

    const stems = new THREE.InstancedMesh(stemGeo, stemMat, this.flowerCount);
    this.flowerPetalMesh = new THREE.InstancedMesh(petalGeo, petalMat, this.flowerCount);
    const dummy = new THREE.Object3D();
    const c = new THREE.Color();

    spots.forEach((s, i) => {
      dummy.position.set(s.x, s.y + 0.12, s.z);
      dummy.scale.setScalar(s.scale);
      dummy.updateMatrix();
      stems.setMatrixAt(i, dummy.matrix);

      dummy.position.set(s.x, s.y + 0.27, s.z);
      dummy.scale.set(s.scale * 1.15, s.scale * 0.65, s.scale * 1.15);
      dummy.updateMatrix();
      this.flowerPetalMesh.setMatrixAt(i, dummy.matrix);

      c.setHex(pal.flowers[i % pal.flowers.length]);
      this.flowerPetalMesh.setColorAt(i, c);
    });
    stems.instanceMatrix.needsUpdate = true;
    this.flowerPetalMesh.instanceMatrix.needsUpdate = true;
    this.flowerPetalMesh.instanceColor.needsUpdate = true;
    this.scene.add(stems, this.flowerPetalMesh);
  }

  _buildVillagers(villagerDefs) {
    villagerDefs.forEach((def, idx) => {
      const model = createVillagerModel(def);
      let sx = def.wanderCenter[0];
      let sz = def.wanderCenter[1];
      if (!this.canWalk(sx, sz, 0.45, GROUND_Y.GRASS)) {
        for (let r = 1; r <= 8; r += 1.2) {
          let found = false;
          for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) {
            const tx = sx + Math.cos(a) * r;
            const tz = sz + Math.sin(a) * r;
            if (this.canWalk(tx, tz, 0.45, GROUND_Y.GRASS)) {
              sx = tx;
              sz = tz;
              found = true;
              break;
            }
          }
          if (found) break;
        }
      }
      const sy = this.getGroundHeight(sx, sz);
      model.root.position.set(sx, sy, sz);
      this.scene.add(model.root);

      const villager = {
        def,
        model,
        x: sx,
        z: sz,
        yaw: idx * 1.5,
        targetX: sx,
        targetZ: sz,
        waitTimer: 1.5 + idx * 1.2,
        walkPhase: 0,
        talking: false
      };
      this.villagers.push(villager);
    });
  }

  _buildTileCursor() {
    const ringGeo = new THREE.RingGeometry(0.56, 0.72, 24);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = makeCozyMaterial(0xfff59d, {
      emissive: 0xffe066,
      emissiveIntensity: 0.45,
      transparent: true,
      opacity: 0.62,
      side: THREE.DoubleSide
    });
    this.tileCursor = new THREE.Mesh(ringGeo, ringMat);
    this.tileCursor.position.y = GROUND_Y.GRASS + 0.04;
    this.scene.add(this.tileCursor);
  }

  shakeTree(treeState) {
    treeState.shakeTime = 0.55;
    if (!treeState.hasFruits) return 0;

    treeState.hasFruits = false;
    treeState.fruitMeshes.forEach((f) => { f.visible = false; });

    // Spawn 3 collectible bouncing fruits around the tree
    let spawned = 0;
    for (let i = 0; i < 3; i++) {
      const ang = (i / 3) * Math.PI * 2 + 0.4;
      const fx = treeState.x + Math.cos(ang) * 1.45;
      const fz = treeState.z + Math.sin(ang) * 1.45;
      if (!this.canWalk(fx, fz, 0.25)) continue;

      const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 10), this.mats.fruit);
      mesh.castShadow = true;
      const groundY = this.getGroundHeight(fx, fz);
      mesh.position.set(treeState.x, treeState.y + 2.1, treeState.z);
      this.scene.add(mesh);

      this.droppedFruits.push({
        id: `fruit_${Date.now()}_${i}`,
        mesh,
        startX: treeState.x,
        startY: treeState.y + 2.1,
        startZ: treeState.z,
        targetX: fx,
        targetY: groundY + 0.24,
        targetZ: fz,
        t: 0
      });
      spawned++;
    }
    return spawned;
  }

  collectFruit(fruitItem) {
    this.scene.remove(fruitItem.mesh);
    const idx = this.droppedFruits.indexOf(fruitItem);
    if (idx >= 0) this.droppedFruits.splice(idx, 1);
  }

  getSurfaceType(wx, wz) {
    const { gx, gz } = this.worldToGrid(wx, wz);
    const t = this.getTile(gx, gz);
    if (t === TILE_TYPE.SAND) return 'sand';
    if (t === TILE_TYPE.BRIDGE || t === TILE_TYPE.RAMP) return 'wood';
    if (t === TILE_TYPE.PLAZA) return 'stone';
    return 'grass';
  }

  getGroundHeight(wx, wz) {
    const { gx, gz } = this.worldToGrid(wx, wz);
    const t = this.getTile(gx, gz);
    if (t === TILE_TYPE.SAND) return GROUND_Y.SAND;
    if (t === TILE_TYPE.CLIFF) return GROUND_Y.CLIFF;
    if (t === TILE_TYPE.BRIDGE) return GROUND_Y.GRASS + 0.22;
    if (t === TILE_TYPE.RAMP) {
      // Smooth height interpolation along gz = 18..21 (north is smaller z -> higher!)
      const zMin = 18 * TILE_SIZE - HALF_WORLD;
      const zMax = 21 * TILE_SIZE - HALF_WORLD;
      const ratio = THREE.MathUtils.clamp((zMax - wz) / (zMax - zMin), 0, 1);
      return THREE.MathUtils.lerp(GROUND_Y.GRASS, GROUND_Y.CLIFF, ratio);
    }
    return GROUND_Y.GRASS;
  }

  canWalk(wx, wz, radius = 0.42, currentY = null) {
    const { gx, gz } = this.worldToGrid(wx, wz);
    const t = this.getTile(gx, gz);
    if (t === TILE_TYPE.WATER || t === TILE_TYPE.RIVER) return false;

    // Prevent jumping straight up/down cliff walls unless using ramp
    if (currentY !== null) {
      const nextY = this.getGroundHeight(wx, wz);
      if (Math.abs(nextY - currentY) > 0.72) return false;
    }

    for (let i = 0; i < this.colliders.length; i++) {
      const c = this.colliders[i];
      if (Math.hypot(wx - c.x, wz - c.z) < c.r + radius) return false;
    }
    return true;
  }

  findNearestInteraction(px, pz, py) {
    let best = null;
    let bestDist = Infinity;

    // 1. Dropped fruits (highest priority for smooth pickup!)
    for (const f of this.droppedFruits) {
      if (f.t < 0.85) continue;
      const d = Math.hypot(px - f.targetX, pz - f.targetZ);
      if (d < 1.85 && d < bestDist) {
        bestDist = d;
        best = { type: 'fruit', label: '🍎 撿起新鮮果實 (+50 鈴錢)', fruitItem: f };
      }
    }
    if (best) return best;

    // 2. Villagers
    for (const v of this.villagers) {
      const d = Math.hypot(px - v.x, pz - v.z);
      if (d < 2.6 && d < bestDist) {
        bestDist = d;
        best = { type: 'villager', label: `💬 和 ${v.def.name} 聊天`, villager: v };
      }
    }
    if (best) return best;

    // 3. Landmarks & Trees
    for (const item of this.interactables) {
      const d = Math.hypot(px - item.x, pz - item.z);
      if (d < item.radius && d < bestDist) {
        if (item.type === 'tree' && Math.abs(py - item.treeState.y) > 0.9) continue;
        bestDist = d;
        best = item;
      }
    }
    return best;
  }

  update(dt, elapsed, playerPos, playerYaw, lampFactor, phaseKey = 'day') {
    // Gentle ocean bobbing
    this.oceanMesh.position.y = GROUND_Y.WATER + Math.sin(elapsed * 1.45) * 0.07;

    // Night-glowing windows, streetlamps & campfire (campfire light stays off in bright day)
    for (let i = 0; i < this.glowMaterials.length; i++) {
      this.glowMaterials[i].emissiveIntensity = 0.05 + lampFactor * 0.85;
    }
    if (this.campfire) {
      const flicker = 0.9 + Math.sin(elapsed * 11) * 0.12 + Math.cos(elapsed * 7.3) * 0.08;
      this.campfire.flame.scale.set(flicker, 0.85 + Math.sin(elapsed * 14) * 0.18, flicker);
    }
    if (this.campfireLight) {
      this.campfireLight.intensity = Math.max(0, (lampFactor - 0.25) / 0.75) * 1.15;
    }

    // Keep tile cursor subtle & hidden during free-roam (reserved for Week 2 Grid Edit Mode)
    this.tileCursor.visible = false;

    // Tree shake spring wobble
    for (const t of this.trees) {
      if (t.shakeTime > 0) {
        t.shakeTime = Math.max(0, t.shakeTime - dt);
        const w = Math.sin(t.shakeTime * 38) * t.shakeTime * 0.32;
        t.canopy.rotation.z = w;
        t.canopy.rotation.x = w * 0.5;
      } else {
        t.canopy.rotation.z = Math.sin(elapsed * 1.1 + t.x * 0.4) * 0.025;
      }
    }

    // Dropped fruit bounce animation
    for (const f of this.droppedFruits) {
      if (f.t < 1) {
        f.t = Math.min(1, f.t + dt * 2.4);
        const arc = Math.sin(f.t * Math.PI) * 1.15;
        f.mesh.position.set(
          THREE.MathUtils.lerp(f.startX, f.targetX, f.t),
          THREE.MathUtils.lerp(f.startY, f.targetY, f.t) + arc,
          THREE.MathUtils.lerp(f.startZ, f.targetZ, f.t)
        );
      } else {
        f.mesh.position.y = f.targetY + Math.sin(elapsed * 3.2 + f.targetX) * 0.04;
      }
    }

    // Schedule-aware Wandering Villagers AI & cute bouncy walk
    for (const v of this.villagers) {
      const distPlayer = Math.hypot(playerPos.x - v.x, playerPos.z - v.z);
      v.model.bubble.visible = distPlayer < 3.2;
      if (v.model.bubble.visible) {
        v.model.bubble.position.y = 1.85 + Math.sin(elapsed * 5) * 0.06;
      }

      if (v.talking || distPlayer < 2.2) {
        const targetYaw = Math.atan2(playerPos.x - v.x, playerPos.z - v.z);
        v.yaw = lerpAngle(v.yaw, targetYaw, dt * 6);
        v.model.root.rotation.y = v.yaw;
        v.model.bodyRig.position.y = Math.abs(Math.sin(elapsed * 3.5)) * 0.03;
        v.model.leftLeg.rotation.x *= 0.85;
        v.model.rightLeg.rotation.x *= 0.85;
        continue;
      }

      const sched = v.def.schedule?.[phaseKey] || v.def.schedule?.day;
      const center = sched?.center || v.def.wanderCenter;

      const dx = v.targetX - v.x;
      const dz = v.targetZ - v.z;
      const dist = Math.hypot(dx, dz);

      if (dist > 0.35) {
        const speed = 1.45;
        const stepX = (dx / dist) * speed * dt;
        const stepZ = (dz / dist) * speed * dt;
        const curY = this.getGroundHeight(v.x, v.z);
        if (this.canWalk(v.x + stepX, v.z + stepZ, 0.42, curY)) {
          v.x += stepX;
          v.z += stepZ;
          v.yaw = lerpAngle(v.yaw, Math.atan2(dx, dz), dt * 6);
          v.walkPhase += dt * 8;
          v.model.bodyRig.position.y = Math.abs(Math.sin(v.walkPhase)) * 0.1;
          v.model.bodyRig.rotation.z = Math.sin(v.walkPhase) * 0.06;
          v.model.leftLeg.rotation.x = Math.sin(v.walkPhase) * 0.5;
          v.model.rightLeg.rotation.x = -Math.sin(v.walkPhase) * 0.5;
          v.model.leftArm.rotation.x = -Math.sin(v.walkPhase) * 0.4;
          v.model.rightArm.rotation.x = Math.sin(v.walkPhase) * 0.4;
        } else {
          v.targetX = v.x;
          v.targetZ = v.z;
          v.waitTimer = 1.2;
        }
      } else {
        v.waitTimer -= dt;
        v.model.bodyRig.position.y *= 0.85;
        v.model.bodyRig.rotation.z *= 0.85;
        if (v.waitTimer <= 0) {
          const ang = Math.random() * Math.PI * 2;
          const r = 1.2 + Math.random() * Math.min(4.2, v.def.wanderRadius || 4);
          const nx = center[0] + Math.cos(ang) * r;
          const nz = center[1] + Math.sin(ang) * r;
          if (this.canWalk(nx, nz, 0.45, GROUND_Y.GRASS)) {
            v.targetX = nx;
            v.targetZ = nz;
          }
          v.waitTimer = 2.0 + Math.random() * 2.8;
        }
      }

      v.model.root.position.set(v.x, this.getGroundHeight(v.x, v.z), v.z);
      v.model.root.rotation.y = v.yaw;
      v.model.tail.rotation.z = Math.sin(elapsed * 6) * 0.25;
    }
  }

  setHouseStage(stage = 0) {
    if (!this.playerHomeAnchor) return;
    while (this.playerHomeAnchor.children.length) {
      this.playerHomeAnchor.remove(this.playerHomeAnchor.children[0]);
    }
    const mesh = createPlayerHomeMesh(stage, this.glowMaterials);
    this.playerHomeAnchor.add(mesh);
    if (this.homeInteractable) {
      const labels = ['⛺ 進入我的露營帳篷', '🏡 進入我的溫馨木屋', '🏰 進入我的森友大屋'];
      this.homeInteractable.label = labels[Math.max(0, Math.min(2, stage))];
    }
  }

  setMuseumStage(stage = 0) {
    if (!this.museumAnchor) return;
    while (this.museumAnchor.children.length) {
      this.museumAnchor.remove(this.museumAnchor.children[0]);
    }
    const mesh = createMuseumMesh(stage, this.glowMaterials);
    this.museumAnchor.add(mesh);
    if (this.museumInteractable) {
      const labels = ['🦉 進入高地博物館帳篷（捐贈／展廳）', '🏛️ 進入溫馨磚瓦博物館（捐贈／展廳）', '👑 進入典雅圓頂大博物館（捐贈／展廳）'];
      this.museumInteractable.label = labels[Math.max(0, Math.min(2, stage))];
    }
  }
}

function lerpAngle(a, b, t) {
  let diff = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * Math.min(1, t);
}
