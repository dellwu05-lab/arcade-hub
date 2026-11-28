import * as THREE from '../vendor/three.module.min.js';
import { TILE_SIZE } from './config.js';
import { makeCozyMaterial } from './rollingShader.js';
import { createFurnitureMesh } from './proceduralAssets.js';

/**
 * Week 4: Standalone Cozy Indoor Scene with 3-stage expansion (6x6 -> 8x8 -> 10x10)
 * and full 3D grid furniture placement/rotation/removal.
 */
export class IndoorSceneManager {
  constructor(inventory, saveManager, itemCatalog) {
    this.inventory = inventory;
    this.saveManager = saveManager;
    this.itemCatalog = itemCatalog;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x2d241e);

    this.roomGroup = new THREE.Group();
    this.furnitureGroup = new THREE.Group();
    this.scene.add(this.roomGroup, this.furnitureGroup);

    this.glowMaterials = [];
    this.placedMeshes = new Map();
    this.gridSize = 6;
    this.editMode = false;
    this.selectedItemId = 'cozy_bed';
    this.toolType = 'furniture'; // 'furniture' | 'remove'
    this.rotationIndex = 0;
    this.hoverGrid = null;

    this._raycaster = new THREE.Raycaster();
    this._groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this._hitPt = new THREE.Vector3();

    this._initLighting();
    this._initGhostAndHover();
    this.rebuildRoom(this.saveManager.data.houseStage || 0);
    this.restorePlaced();
  }

  _initLighting() {
    const hemi = new THREE.HemisphereLight(0xfff6e5, 0x8b6c54, 1.05);
    this.scene.add(hemi);
    const key = new THREE.DirectionalLight(0xfff1d6, 0.95);
    key.position.set(5, 11, 7);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -10;
    key.shadow.camera.right = 10;
    key.shadow.camera.top = 10;
    key.shadow.camera.bottom = -10;
    key.shadow.bias = -0.0012;
    this.scene.add(key);
  }

  _initGhostAndHover() {
    this.hoverGeo = new THREE.PlaneGeometry(TILE_SIZE - 0.08, TILE_SIZE - 0.08);
    this.hoverGeo.rotateX(-Math.PI / 2);
    this.hoverMat = new THREE.MeshBasicMaterial({
      color: 0x52b788,
      transparent: true,
      opacity: 0.45,
      depthWrite: false
    });
    this.hoverTile = new THREE.Mesh(this.hoverGeo, this.hoverMat);
    this.hoverTile.position.y = 0.03;
    this.hoverTile.visible = false;
    this.scene.add(this.hoverTile);

    this.ghostGroup = new THREE.Group();
    this.ghostGroup.visible = false;
    this.scene.add(this.ghostGroup);
    this._ghostItemId = null;
  }

  gridToWorld(gx, gz) {
    const half = (this.gridSize - 1) / 2;
    return {
      x: (gx - half) * TILE_SIZE,
      z: (gz - half) * TILE_SIZE
    };
  }

  worldToGrid(wx, wz) {
    const half = (this.gridSize - 1) / 2;
    return {
      gx: Math.round(wx / TILE_SIZE + half),
      gz: Math.round(wz / TILE_SIZE + half)
    };
  }

  rebuildRoom(stage = 0) {
    while (this.roomGroup.children.length) {
      this.roomGroup.remove(this.roomGroup.children[0]);
    }
    this.gridSize = stage <= 0 ? 6 : (stage === 1 ? 8 : 10);
    const span = this.gridSize * TILE_SIZE;
    const wallH = stage <= 0 ? 3.2 : (stage === 1 ? 3.7 : 4.2);

    // Warm matte wood plank floor
    const floorCol = stage <= 0 ? 0xd9b88c : (stage === 1 ? 0xcfa472 : 0xc69764);
    const floorMat = makeCozyMaterial(floorCol, { textureKind: 'plaza', roughness: 0.94, noRoll: true });
    const floor = new THREE.Mesh(new THREE.BoxGeometry(span + 0.4, 0.3, span + 0.4), floorMat);
    floor.position.y = -0.15;
    floor.receiveShadow = true;
    this.roomGroup.add(floor);

    // Subtle tile grid overlay inside room
    const gridHelper = new THREE.GridHelper(span, this.gridSize, 0x9c7b56, 0xb8966e);
    gridHelper.position.y = 0.012;
    gridHelper.material.transparent = true;
    gridHelper.material.opacity = 0.25;
    this.roomGroup.add(gridHelper);

    // Cozy pastel matte walls (North, West, East — South kept open for camera visibility)
    const wallCol = stage <= 0 ? 0xf6e6b8 : (stage === 1 ? 0xfff5e4 : 0xedf6f0);
    const trimCol = stage <= 0 ? 0xe07a5f : (stage === 1 ? 0x8b6240 : 0x528f72);
    const wallMat = makeCozyMaterial(wallCol, { textureKind: 'cloth', roughness: 0.97, noRoll: true });
    const trimMat = makeCozyMaterial(trimCol, { textureKind: 'matte', roughness: 0.95, noRoll: true });

    const backWall = new THREE.Mesh(new THREE.BoxGeometry(span + 0.4, wallH, 0.28), wallMat);
    backWall.position.set(0, wallH / 2, -span / 2 - 0.14);
    backWall.receiveShadow = true;
    const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.28, wallH, span + 0.4), wallMat);
    leftWall.position.set(-span / 2 - 0.14, wallH / 2, 0);
    const rightWall = new THREE.Mesh(new THREE.BoxGeometry(0.28, wallH, span + 0.4), wallMat);
    rightWall.position.set(span / 2 + 0.14, wallH / 2, 0);
    this.roomGroup.add(backWall, leftWall, rightWall);

    // Baseboard trim
    const baseBack = new THREE.Mesh(new THREE.BoxGeometry(span + 0.44, 0.28, 0.34), trimMat);
    baseBack.position.set(0, 0.14, -span / 2 - 0.14);
    this.roomGroup.add(baseBack);

    // Sunlit Cozy Windows on North Wall
    const winPositions = stage <= 0 ? [0] : (stage === 1 ? [-2.4, 2.4] : [-4.0, 4.0]);
    const winFrameMat = makeCozyMaterial(0x7c5335, { textureKind: 'matte', noRoll: true });
    const winGlassMat = makeCozyMaterial(0xfff1ba, { emissive: 0xffd166, emissiveIntensity: 0.55, noRoll: true });
    winPositions.forEach((wx) => {
      const frame = new THREE.Mesh(new THREE.BoxGeometry(1.55, 1.35, 0.12), winFrameMat);
      frame.position.set(wx, 2.05, -span / 2 + 0.02);
      const glass = new THREE.Mesh(new THREE.BoxGeometry(1.32, 1.12, 0.14), winGlassMat);
      glass.position.set(wx, 2.05, -span / 2 + 0.04);
      this.roomGroup.add(frame, glass);
    });

    // Stage 2 Bonus: Cozy Hearth Fireplace centered on back wall!
    if (stage >= 2) {
      const stoneMat = makeCozyMaterial(0x9ba2a8, { textureKind: 'matte', noRoll: true });
      const hearth = new THREE.Mesh(new THREE.BoxGeometry(2.1, 1.75, 0.72), stoneMat);
      hearth.position.set(0, 0.88, -span / 2 + 0.36);
      const mantel = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.16, 0.86), winFrameMat);
      mantel.position.set(0, 1.78, -span / 2 + 0.36);
      const firebox = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.9, 0.4), makeCozyMaterial(0x2a211c, { noRoll: true }));
      firebox.position.set(0, 0.52, -span / 2 + 0.58);
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.58, 7), makeCozyMaterial(0xff9f43, { emissive: 0xff6b00, emissiveIntensity: 0.75, noRoll: true }));
      flame.position.set(0, 0.48, -span / 2 + 0.62);
      this.roomGroup.add(hearth, mantel, firebox, flame);
    }

    // Welcome Exit Doormat at South center
    const matMesh = new THREE.Mesh(
      new THREE.BoxGeometry(1.55, 0.04, 0.9),
      makeCozyMaterial(0x52a86b, { textureKind: 'cloth', noRoll: true })
    );
    matMesh.position.set(0, 0.02, span / 2 - 0.55);
    this.roomGroup.add(matMesh);

    this.exitPos = { x: 0, z: span / 2 - 0.55 };
    this.spawnPos = { x: 0, z: span / 2 - 1.5 };
  }

  restorePlaced() {
    for (const entry of this.placedMeshes.values()) {
      this.furnitureGroup.remove(entry.mesh);
    }
    this.placedMeshes.clear();

    const list = this.saveManager.data.placedIndoor || [];
    list.forEach((rec) => this._spawnMesh(rec, false));
  }

  _spawnMesh(rec, popIn = true) {
    const pos = this.gridToWorld(rec.gx, rec.gz);
    const mesh = createFurnitureMesh(rec.itemId, this.glowMaterials);
    mesh.position.set(pos.x, 0, pos.z);
    mesh.rotation.y = (rec.rot || 0) * (Math.PI / 2);
    if (popIn) mesh.scale.setScalar(0.05);
    this.furnitureGroup.add(mesh);
    this.placedMeshes.set(rec.uid, { mesh, record: rec, pop: popIn ? 0 : 1 });
  }

  canWalk(wx, wz, radius = 0.4) {
    const limit = (this.gridSize * TILE_SIZE) / 2 - 0.52;
    if (Math.abs(wx) > limit || Math.abs(wz) > limit) return false;
    for (const { record } of this.placedMeshes.values()) {
      const def = this.inventory.getDef(record.itemId);
      if (def?.walkable) continue;
      const p = this.gridToWorld(record.gx, record.gz);
      if (Math.hypot(wx - p.x, wz - p.z) < 0.55 + radius) return false;
    }
    return true;
  }

  canPlaceAt(gx, gz) {
    if (gx < 0 || gz < 0 || gx >= this.gridSize || gz >= this.gridSize) return false;
    // Keep front exit mat tile clear
    const mid = Math.floor(this.gridSize / 2);
    if (gz === this.gridSize - 1 && (gx === mid || gx === mid - 1)) return false;
    if (this.toolType === 'remove') return true;
    const occupied = (this.saveManager.data.placedIndoor || []).some((p) => p.gx === gx && p.gz === gz);
    if (occupied) return false;
    return this.inventory.countItem(this.selectedItemId) > 0;
  }

  setEditMode(open) {
    this.editMode = open;
    this.hoverTile.visible = false;
    this.ghostGroup.visible = false;
  }

  setTool(toolType, itemId = null) {
    this.toolType = toolType === 'remove' ? 'remove' : 'furniture';
    if (itemId) this.selectedItemId = itemId;
    this._rebuildGhost();
  }

  rotateGhost() {
    this.rotationIndex = (this.rotationIndex + 1) % 4;
    this.ghostGroup.rotation.y = this.rotationIndex * (Math.PI / 2);
  }

  _rebuildGhost() {
    while (this.ghostGroup.children.length) this.ghostGroup.remove(this.ghostGroup.children[0]);
    if (this.toolType !== 'furniture' || !this.selectedItemId) {
      this._ghostItemId = null;
      return;
    }
    const mesh = createFurnitureMesh(this.selectedItemId, []);
    mesh.traverse((o) => {
      if (o.isMesh && o.material) {
        o.material = o.material.clone();
        o.material.transparent = true;
        o.material.opacity = 0.62;
      }
    });
    this.ghostGroup.add(mesh);
    this.ghostGroup.rotation.y = this.rotationIndex * (Math.PI / 2);
    this._ghostItemId = this.selectedItemId;
  }

  updateHoverFromNDC(ndcX, ndcY, camera) {
    if (!this.editMode) return null;
    this._raycaster.setFromCamera({ x: ndcX, y: ndcY }, camera);
    if (!this._raycaster.ray.intersectPlane(this._groundPlane, this._hitPt)) return null;
    const cell = this.worldToGrid(this._hitPt.x, this._hitPt.z);
    if (cell.gx < 0 || cell.gz < 0 || cell.gx >= this.gridSize || cell.gz >= this.gridSize) {
      this.hoverTile.visible = false;
      this.ghostGroup.visible = false;
      this.hoverGrid = null;
      return null;
    }
    this.hoverGrid = cell;
    const p = this.gridToWorld(cell.gx, cell.gz);
    this.hoverTile.position.set(p.x, 0.03, p.z);
    this.hoverTile.visible = true;

    if (this.toolType === 'remove') {
      const has = (this.saveManager.data.placedIndoor || []).some((x) => x.gx === cell.gx && x.gz === cell.gz);
      this.hoverMat.color.setHex(has ? 0xf59e0b : 0xef4444);
      this.ghostGroup.visible = false;
    } else {
      const ok = this.canPlaceAt(cell.gx, cell.gz);
      this.hoverMat.color.setHex(ok ? 0x52b788 : 0xef4444);
      if (this._ghostItemId !== this.selectedItemId) this._rebuildGhost();
      this.ghostGroup.position.set(p.x, 0, p.z);
      this.ghostGroup.visible = true;
    }
    return cell;
  }

  placeAt(gx, gz, itemId = this.selectedItemId, rot = this.rotationIndex) {
    const prev = this.selectedItemId;
    this.selectedItemId = itemId;
    const ok = this.canPlaceAt(gx, gz);
    this.selectedItemId = prev;
    if (!ok) return false;
    if (!this.inventory.removeItem(itemId, 1)) return false;
    const rec = {
      uid: `in_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      itemId,
      gx,
      gz,
      rot
    };
    this.saveManager.data.placedIndoor.push(rec);
    this.saveManager.data.miles += 10;
    this._spawnMesh(rec, true);
    this.saveManager.scheduleSave();
    return true;
  }

  removeAt(gx, gz) {
    const list = this.saveManager.data.placedIndoor || [];
    const idx = list.findIndex((p) => p.gx === gx && p.gz === gz);
    if (idx < 0) return null;
    const [removed] = list.splice(idx, 1);
    const entry = this.placedMeshes.get(removed.uid);
    if (entry) {
      this.furnitureGroup.remove(entry.mesh);
      this.placedMeshes.delete(removed.uid);
    }
    this.inventory.addItem(removed.itemId, 1);
    this.saveManager.scheduleSave();
    return removed;
  }

  update(dt) {
    for (const entry of this.placedMeshes.values()) {
      if (entry.pop < 1) {
        entry.pop = Math.min(1, entry.pop + dt * 5.2);
        const s = 0.4 + Math.sin(entry.pop * Math.PI * 0.65) * 0.72;
        entry.mesh.scale.setScalar(entry.pop >= 1 ? 1 : s);
      }
    }
  }
}
