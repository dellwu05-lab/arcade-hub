import * as THREE from '../vendor/three.module.min.js';
import { TILE_SIZE, GRID_SIZE } from './config.js';
import { makeCozyMaterial } from './rollingShader.js';
import { createFurnitureMesh } from './proceduralAssets.js';
import { TILE_TYPE } from './islandWorld.js';

/**
 * Dual-mode Outdoor Building System (Week 2):
 * 1. Character-facing quick placement & pickup
 * 2. One-click Top-Down 3D Grid Edit Mode with raycasted ghost preview, 90° rotation, path painting, and undo/pickup
 */
export class BuildSystem {
  constructor(scene, world, inventory, saveManager, catalog) {
    this.scene = scene;
    this.world = world;
    this.inventory = inventory;
    this.saveManager = saveManager;
    this.catalog = catalog;

    this.placedMeshes = new Map(); // "gx,gz" -> { entry, mesh }
    this.pathMeshes = new Map();   // "gx,gz" -> { pathId, mesh }

    this.editMode = false;
    this.toolType = 'furniture'; // 'furniture' | 'path' | 'remove'
    this.selectedItemId = 'wood_bench';
    this.selectedPathId = 'path_stone';
    this.rotation = 0; // 0, 1, 2, 3 -> 0°, 90°, 180°, 270°
    this.hoverGrid = null; // { gx, gz }

    this._raycaster = new THREE.Raycaster();
    this._groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.36);
    this._hitVec = new THREE.Vector3();

    this._initGhostAndCursor();
    this._restoreFromSave();
  }

  _initGhostAndCursor() {
    this.cursorMatOk = makeCozyMaterial(0x6ee7b7, { transparent: true, opacity: 0.45, noGrain: true, emissive: 0x10b981, emissiveIntensity: 0.3 });
    this.cursorMatBad = makeCozyMaterial(0xfca5a5, { transparent: true, opacity: 0.45, noGrain: true, emissive: 0xef4444, emissiveIntensity: 0.3 });
    this.cursorMatDel = makeCozyMaterial(0xfde68a, { transparent: true, opacity: 0.5, noGrain: true, emissive: 0xf59e0b, emissiveIntensity: 0.35 });

    this.tileHighlight = new THREE.Mesh(
      new THREE.BoxGeometry(TILE_SIZE - 0.08, 0.06, TILE_SIZE - 0.08),
      this.cursorMatOk
    );
    this.tileHighlight.visible = false;
    this.scene.add(this.tileHighlight);

    this.ghostGroup = new THREE.Group();
    this.ghostGroup.visible = false;
    this.scene.add(this.ghostGroup);
    this._ghostItemId = null;
  }

  _key(gx, gz) {
    return `${gx},${gz}`;
  }

  _restoreFromSave() {
    const save = this.saveManager.data;
    if (!Array.isArray(save.placedOutdoor)) save.placedOutdoor = [];
    if (!save.paths || typeof save.paths !== 'object') save.paths = {};

    save.placedOutdoor.forEach((entry) => this._spawnFurnitureMesh(entry));
    Object.entries(save.paths).forEach(([k, pathId]) => {
      const [gx, gz] = k.split(',').map(Number);
      if (Number.isFinite(gx) && Number.isFinite(gz)) this._spawnPathMesh(gx, gz, pathId);
    });
  }

  _spawnFurnitureMesh(entry) {
    const k = this._key(entry.gx, entry.gz);
    if (this.placedMeshes.has(k)) return;
    const p = this.world.gridToWorld(entry.gx, entry.gz);
    const y = this.world.getGroundHeight(p.x, p.z);
    const mesh = createFurnitureMesh(entry.itemId, this.world.glowMaterials);
    mesh.position.set(p.x, y, p.z);
    mesh.rotation.y = (entry.rotation || 0) * (Math.PI / 2);
    this.scene.add(mesh);
    this.placedMeshes.set(k, { entry, mesh, popT: 0 });
  }

  _spawnPathMesh(gx, gz, pathId) {
    const k = this._key(gx, gz);
    if (this.pathMeshes.has(k)) {
      this.scene.remove(this.pathMeshes.get(k).mesh);
      this.pathMeshes.delete(k);
    }
    const def = (this.catalog.paths || []).find((p) => p.id === pathId);
    if (!def) return;
    const p = this.world.gridToWorld(gx, gz);
    const y = this.world.getGroundHeight(p.x, p.z);
    const texKind = pathId === 'path_stone' ? 'plaza' : 'matte';
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(TILE_SIZE - 0.04, 0.05, TILE_SIZE - 0.04),
      makeCozyMaterial(def.color, { textureKind: texKind, roughness: 0.96 })
    );
    mesh.position.set(p.x, y + 0.02, p.z);
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    this.pathMeshes.set(k, { pathId, mesh });
  }

  isTileBlockedForWalk(wx, wz, radius = 0.42) {
    for (const { entry } of this.placedMeshes.values()) {
      const def = this.inventory.getDef(entry.itemId);
      if (def && def.walkable) continue;
      const p = this.world.gridToWorld(entry.gx, entry.gz);
      if (Math.hypot(wx - p.x, wz - p.z) < 0.62 + radius) return true;
    }
    return false;
  }

  canPlaceAt(gx, gz, mode = this.toolType) {
    if (gx < 0 || gz < 0 || gx >= GRID_SIZE || gz >= GRID_SIZE) return false;
    const tile = this.world.getTile(gx, gz);
    if (tile !== TILE_TYPE.GRASS && tile !== TILE_TYPE.SAND && tile !== TILE_TYPE.CLIFF && tile !== TILE_TYPE.PLAZA) {
      return false;
    }
    const p = this.world.gridToWorld(gx, gz);
    if (this.world.colliders.some((c) => Math.hypot(p.x - c.x, p.z - c.z) < c.r + 0.65)) {
      return false;
    }
    if (mode === 'furniture') {
      if (this.placedMeshes.has(this._key(gx, gz))) return false;
      return this.inventory.countItem(this.selectedItemId) > 0;
    }
    return true;
  }

  placeFurnitureAt(gx, gz, itemId = this.selectedItemId, rot = this.rotation) {
    if (!this.canPlaceAt(gx, gz, 'furniture')) return false;
    if (!this.inventory.removeItem(itemId, 1)) return false;

    const entry = { uid: `f_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, itemId, gx, gz, rotation: rot };
    this.saveManager.data.placedOutdoor.push(entry);
    this._spawnFurnitureMesh(entry);
    this.saveManager.data.miles += 10;
    this.saveManager.scheduleSave();
    return true;
  }

  removeAt(gx, gz) {
    const k = this._key(gx, gz);
    if (this.placedMeshes.has(k)) {
      const rec = this.placedMeshes.get(k);
      this.scene.remove(rec.mesh);
      this.placedMeshes.delete(k);
      this.saveManager.data.placedOutdoor = this.saveManager.data.placedOutdoor.filter((e) => e.uid !== rec.entry.uid);
      this.inventory.addItem(rec.entry.itemId, 1);
      this.saveManager.scheduleSave();
      return { removed: 'furniture', itemId: rec.entry.itemId };
    }
    if (this.pathMeshes.has(k)) {
      this.scene.remove(this.pathMeshes.get(k).mesh);
      this.pathMeshes.delete(k);
      delete this.saveManager.data.paths[k];
      this.saveManager.scheduleSave();
      return { removed: 'path' };
    }
    return null;
  }

  paintPathAt(gx, gz, pathId = this.selectedPathId) {
    if (!this.canPlaceAt(gx, gz, 'path')) return false;
    const k = this._key(gx, gz);
    this.saveManager.data.paths[k] = pathId;
    this._spawnPathMesh(gx, gz, pathId);
    this.saveManager.scheduleSave();
    return true;
  }

  rotate() {
    this.rotation = (this.rotation + 1) % 4;
    return this.rotation;
  }

  setEditMode(enabled) {
    this.editMode = !!enabled;
    this.tileHighlight.visible = this.editMode;
    this.ghostGroup.visible = false;
  }

  updateHoverFromNDC(ndcX, ndcY, camera, playerY = 0.36) {
    if (!this.editMode) return null;
    this._groundPlane.constant = -playerY;
    this._raycaster.setFromCamera({ x: ndcX, y: ndcY }, camera);
    if (!this._raycaster.ray.intersectPlane(this._groundPlane, this._hitVec)) return null;
    const { gx, gz } = this.world.worldToGrid(this._hitVec.x, this._hitVec.z);
    if (gx < 0 || gz < 0 || gx >= GRID_SIZE || gz >= GRID_SIZE) {
      this.hoverGrid = null;
      return null;
    }
    this.hoverGrid = { gx, gz };
    return this.hoverGrid;
  }

  _rebuildGhostIfNeeded() {
    if (this._ghostItemId === this.selectedItemId) return;
    this._ghostItemId = this.selectedItemId;
    while (this.ghostGroup.children.length) this.ghostGroup.remove(this.ghostGroup.children[0]);
    const mesh = createFurnitureMesh(this.selectedItemId, []);
    mesh.traverse((o) => {
      if (o.isMesh && o.material) {
        o.material = o.material.clone();
        o.material.transparent = true;
        o.material.opacity = 0.62;
      }
    });
    this.ghostGroup.add(mesh);
  }

  update(dt) {
    // Cute pop-in spring scale for newly placed furniture
    for (const rec of this.placedMeshes.values()) {
      if (rec.popT < 1) {
        rec.popT = Math.min(1, rec.popT + dt * 5.5);
        const s = 0.4 + Math.sin(rec.popT * Math.PI * 0.65) * 0.72;
        rec.mesh.scale.setScalar(rec.popT >= 1 ? 1 : s);
      }
    }

    if (!this.editMode || !this.hoverGrid) {
      this.tileHighlight.visible = false;
      this.ghostGroup.visible = false;
      return;
    }

    const { gx, gz } = this.hoverGrid;
    const p = this.world.gridToWorld(gx, gz);
    const y = this.world.getGroundHeight(p.x, p.z);

    this.tileHighlight.visible = true;
    this.tileHighlight.position.set(p.x, y + 0.06, p.z);

    if (this.toolType === 'remove') {
      const hasAny = this.placedMeshes.has(this._key(gx, gz)) || this.pathMeshes.has(this._key(gx, gz));
      this.tileHighlight.material = hasAny ? this.cursorMatDel : this.cursorMatBad;
      this.ghostGroup.visible = false;
    } else if (this.toolType === 'path') {
      const ok = this.canPlaceAt(gx, gz, 'path');
      this.tileHighlight.material = ok ? this.cursorMatOk : this.cursorMatBad;
      this.ghostGroup.visible = false;
    } else {
      const ok = this.canPlaceAt(gx, gz, 'furniture');
      this.tileHighlight.material = ok ? this.cursorMatOk : this.cursorMatBad;
      this._rebuildGhostIfNeeded();
      this.ghostGroup.visible = true;
      this.ghostGroup.position.set(p.x, y, p.z);
      this.ghostGroup.rotation.y = this.rotation * (Math.PI / 2);
    }
  }
}
