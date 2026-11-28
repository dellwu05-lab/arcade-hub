import * as THREE from '../vendor/three.module.min.js';
import { makeCozyMaterial } from './rollingShader.js';

function shadow(mesh, cast = true, receive = true) {
  mesh.castShadow = cast;
  mesh.receiveShadow = receive;
  return mesh;
}

/**
 * Cute chibi Animal Crossing-style player character with articulated limbs
 * for squash-and-stretch bouncy walking animation (no skeleton rig needed).
 */
export function createPlayerModel() {
  const root = new THREE.Group();
  const bodyRig = new THREE.Group();
  root.add(bodyRig);

  const skinMat = makeCozyMaterial(0xf2d1b8, { textureKind: 'cloth', roughness: 0.97 });
  const hairMat = makeCozyMaterial(0x614029, { textureKind: 'cloth', roughness: 0.96 });
  const shirtMat = makeCozyMaterial(0x52a89c, { textureKind: 'cloth', roughness: 0.98 });
  const collarMat = makeCozyMaterial(0xf5eed6, { textureKind: 'cloth', roughness: 0.98 });
  const shortsMat = makeCozyMaterial(0x4a637d, { textureKind: 'cloth', roughness: 0.98 });
  const shoeMat = makeCozyMaterial(0x7f5638, { textureKind: 'cloth', roughness: 0.96 });
  const eyeMat = makeCozyMaterial(0x2e241e, { noGrain: true, roughness: 0.9 });
  const cheekMat = makeCozyMaterial(0xf08fa3, { textureKind: 'cloth', roughness: 0.98 });
  const leafHatMat = makeCozyMaterial(0x6eb861, { textureKind: 'matte', roughness: 0.95 });

  // Legs
  const legGeo = new THREE.CapsuleGeometry(0.11, 0.22, 6, 10);
  const leftLeg = shadow(new THREE.Mesh(legGeo, shoeMat));
  leftLeg.position.set(-0.14, 0.22, 0);
  const rightLeg = shadow(new THREE.Mesh(legGeo, shoeMat));
  rightLeg.position.set(0.14, 0.22, 0);
  bodyRig.add(leftLeg, rightLeg);

  // Torso (rounded sweater + shorts)
  const shorts = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.26, 0.22, 12), shortsMat));
  shorts.position.y = 0.42;
  bodyRig.add(shorts);

  const torso = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.27, 0.44, 12), shirtMat));
  torso.position.y = 0.7;
  bodyRig.add(torso);

  const collar = shadow(new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.045, 8, 14), collarMat), false, true);
  collar.rotation.x = Math.PI / 2;
  collar.position.y = 0.91;
  bodyRig.add(collar);

  // Arms
  const armGeo = new THREE.CapsuleGeometry(0.085, 0.26, 6, 10);
  const leftArm = shadow(new THREE.Mesh(armGeo, shirtMat));
  leftArm.position.set(-0.31, 0.72, 0);
  leftArm.rotation.z = 0.25;
  const rightArm = shadow(new THREE.Mesh(armGeo, shirtMat));
  rightArm.position.set(0.31, 0.72, 0);
  rightArm.rotation.z = -0.25;
  bodyRig.add(leftArm, rightArm);

  // Big cute chibi head
  const headGroup = new THREE.Group();
  headGroup.position.y = 1.24;
  bodyRig.add(headGroup);

  const head = shadow(new THREE.Mesh(new THREE.SphereGeometry(0.38, 16, 14), skinMat));
  head.scale.set(1.04, 0.96, 1.0);
  headGroup.add(head);

  // Hair cap + bangs
  const hairCap = shadow(new THREE.Mesh(
    new THREE.SphereGeometry(0.4, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.58),
    hairMat
  ));
  hairCap.position.y = 0.03;
  hairCap.rotation.x = -0.22;
  headGroup.add(hairCap);

  // Cute signature sprout leaf on top of head
  const leaf = shadow(new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8), leafHatMat));
  leaf.scale.set(1.3, 0.3, 0.75);
  leaf.position.set(0.06, 0.43, 0.02);
  leaf.rotation.z = -0.35;
  headGroup.add(leaf);

  // Soft matte espresso eyes (+Z is forward)
  const eyeGeo = new THREE.SphereGeometry(0.055, 10, 10);
  [-0.13, 0.13].forEach((ex) => {
    const eye = new THREE.Mesh(eyeGeo, eyeMat);
    eye.position.set(ex, -0.02, 0.34);
    eye.scale.set(0.9, 1.15, 0.6);
    headGroup.add(eye);
  });

  // Rosy cheeks
  const cheekGeo = new THREE.SphereGeometry(0.06, 8, 8);
  [-0.22, 0.22].forEach((cx) => {
    const cheek = new THREE.Mesh(cheekGeo, cheekMat);
    cheek.position.set(cx, -0.09, 0.30);
    cheek.scale.set(1.1, 0.6, 0.45);
    headGroup.add(cheek);
  });

  return { root, bodyRig, headGroup, leftArm, rightArm, leftLeg, rightLeg };
}

/**
 * Modular cute animal villager builder (cat / shiba / bunny).
 */
export function createVillagerModel(spec) {
  const root = new THREE.Group();
  const bodyRig = new THREE.Group();
  root.add(bodyRig);

  const furMat = makeCozyMaterial(spec.colors.fur);
  const accentMat = makeCozyMaterial(spec.colors.accent);
  const shirtMat = makeCozyMaterial(spec.colors.shirt);
  const cheekMat = makeCozyMaterial(spec.colors.cheek);
  const eyeMat = makeCozyMaterial(0x1f2421);
  const noseMat = makeCozyMaterial(0x3a2618);

  // Legs
  const legGeo = new THREE.CapsuleGeometry(0.1, 0.18, 6, 8);
  const leftLeg = shadow(new THREE.Mesh(legGeo, furMat));
  leftLeg.position.set(-0.13, 0.18, 0);
  const rightLeg = shadow(new THREE.Mesh(legGeo, furMat));
  rightLeg.position.set(0.13, 0.18, 0);
  bodyRig.add(leftLeg, rightLeg);

  // Body / Sweater
  const body = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.28, 0.5, 12), shirtMat));
  body.position.y = 0.56;
  bodyRig.add(body);

  // Arms
  const armGeo = new THREE.CapsuleGeometry(0.08, 0.22, 6, 8);
  const leftArm = shadow(new THREE.Mesh(armGeo, furMat));
  leftArm.position.set(-0.3, 0.6, 0);
  leftArm.rotation.z = 0.3;
  const rightArm = shadow(new THREE.Mesh(armGeo, furMat));
  rightArm.position.set(0.3, 0.6, 0);
  rightArm.rotation.z = -0.3;
  bodyRig.add(leftArm, rightArm);

  // Tail
  const tail = shadow(new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.24, 6, 8), furMat));
  tail.position.set(0, 0.45, -0.28);
  tail.rotation.x = -0.85;
  bodyRig.add(tail);

  // Head
  const headGroup = new THREE.Group();
  headGroup.position.y = 1.12;
  bodyRig.add(headGroup);

  const head = shadow(new THREE.Mesh(new THREE.SphereGeometry(0.37, 14, 12), furMat));
  head.scale.set(1.06, 0.94, 1.0);
  headGroup.add(head);

  // Cute muzzle
  const muzzle = shadow(new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 10), accentMat), false, true);
  muzzle.position.set(0, -0.07, 0.31);
  muzzle.scale.set(1.25, 0.8, 0.72);
  headGroup.add(muzzle);

  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.042, 8, 8), noseMat);
  nose.position.set(0, -0.03, 0.41);
  headGroup.add(nose);

  // Species ears
  if (spec.species === 'cat') {
    const earGeo = new THREE.ConeGeometry(0.13, 0.28, 4);
    [-0.22, 0.22].forEach((ex) => {
      const ear = shadow(new THREE.Mesh(earGeo, furMat));
      ear.position.set(ex, 0.33, 0.02);
      ear.rotation.z = ex < 0 ? 0.25 : -0.25;
      ear.rotation.y = Math.PI / 4;
      headGroup.add(ear);
    });
  } else if (spec.species === 'bunny') {
    const earGeo = new THREE.CapsuleGeometry(0.085, 0.34, 6, 8);
    [-0.16, 0.16].forEach((ex) => {
      const ear = shadow(new THREE.Mesh(earGeo, furMat));
      ear.position.set(ex, 0.48, -0.02);
      ear.rotation.z = ex < 0 ? 0.14 : -0.14;
      const inner = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.24, 4, 6), accentMat);
      inner.position.set(0, 0, 0.055);
      ear.add(inner);
      headGroup.add(ear);
    });
  } else if (spec.species === 'bear') {
    const earGeo = new THREE.SphereGeometry(0.14, 10, 8);
    [-0.26, 0.26].forEach((ex) => {
      const ear = shadow(new THREE.Mesh(earGeo, furMat));
      ear.position.set(ex, 0.3, 0.0);
      const inner = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 6), accentMat);
      inner.position.set(0, 0, 0.09);
      ear.add(inner);
      headGroup.add(ear);
    });
  } else {
    // Shiba upright rounded triangular ears
    const earGeo = new THREE.ConeGeometry(0.14, 0.26, 6);
    [-0.23, 0.23].forEach((ex) => {
      const ear = shadow(new THREE.Mesh(earGeo, furMat));
      ear.position.set(ex, 0.32, 0.04);
      ear.rotation.z = ex < 0 ? 0.34 : -0.34;
      headGroup.add(ear);
    });
  }

  // Eyes & Cheeks
  [-0.13, 0.13].forEach((ex) => {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), eyeMat);
    eye.position.set(ex, 0.02, 0.33);
    headGroup.add(eye);

    const cheek = new THREE.Mesh(new THREE.SphereGeometry(0.058, 8, 8), cheekMat);
    cheek.position.set(ex * 1.65, -0.06, 0.28);
    cheek.scale.set(1.1, 0.6, 0.45);
    headGroup.add(cheek);
  });

  // Floating friendly bubble indicator (shown when player approaches)
  const bubbleMat = makeCozyMaterial(0xfffdf5, { emissive: 0xfff5d6, emissiveIntensity: 0.3 });
  const bubble = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 10), bubbleMat);
  bubble.position.y = 1.85;
  bubble.scale.set(1.25, 0.9, 0.65);
  bubble.visible = false;
  root.add(bubble);

  return { root, bodyRig, headGroup, leftArm, rightArm, leftLeg, rightLeg, tail, bubble };
}

/**
 * Stylized fluffy round Fruit Tree with shakeable fruit orbs.
 */
export function createFruitTree(leafMat, fruitMat, hasFruits = true) {
  const group = new THREE.Group();
  const trunkMat = makeCozyMaterial(0x8d6346);

  const trunk = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.36, 1.85, 8), trunkMat));
  trunk.position.y = 0.92;
  group.add(trunk);

  const canopy = new THREE.Group();
  canopy.position.y = 2.25;
  group.add(canopy);

  const puffs = [
    [0, 0.32, 0, 1.15],
    [-0.68, -0.1, 0.32, 0.82],
    [0.68, -0.08, 0.28, 0.85],
    [0.05, -0.1, -0.64, 0.86]
  ];
  puffs.forEach(([x, y, z, r]) => {
    const sphere = shadow(new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), leafMat));
    sphere.position.set(x, y, z);
    canopy.add(sphere);
  });

  const fruitMeshes = [];
  if (hasFruits) {
    const fGeo = new THREE.SphereGeometry(0.2, 10, 10);
    const fOffsets = [
      [-0.65, -0.25, 0.72],
      [0.62, -0.18, 0.74],
      [0.02, 0.22, 0.96]
    ];
    fOffsets.forEach(([x, y, z]) => {
      const f = shadow(new THREE.Mesh(fGeo, fruitMat), true, false);
      f.position.set(x, y, z);
      canopy.add(f);
      fruitMeshes.push(f);
    });
  }

  return { group, canopy, fruitMeshes };
}

/**
 * Tiered stylized Pine Tree for upper cliff areas.
 */
export function createPineTree(pineLeafMat) {
  const group = new THREE.Group();
  const trunk = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.32, 1.3, 8), makeCozyMaterial(0x734f38)));
  trunk.position.y = 0.65;
  group.add(trunk);

  const tiers = [
    [1.65, 1.35, 1.6],
    [2.55, 1.08, 1.45],
    [3.35, 0.76, 1.2]
  ];
  tiers.forEach(([y, r, h]) => {
    const cone = shadow(new THREE.Mesh(new THREE.ConeGeometry(r, h, 8), pineLeafMat));
    cone.position.y = y;
    group.add(cone);
  });

  return group;
}

/**
 * Cozy Player / Museum pitched tent with warm night-glowing entrance.
 */
export function createCozyTent(mainColor, stripeColor, glowRegistry) {
  const group = new THREE.Group();
  const mainMat = makeCozyMaterial(mainColor);
  const trimMat = makeCozyMaterial(stripeColor);
  const woodMat = makeCozyMaterial(0x8d6346);
  const glowMat = makeCozyMaterial(0xffe08a, { emissive: 0xffb703, emissiveIntensity: 0.0 });
  glowRegistry.push(glowMat);

  // Upright A-frame triangular tent body
  const shape = new THREE.Shape();
  shape.moveTo(-1.55, 0);
  shape.lineTo(1.55, 0);
  shape.lineTo(0, 2.35);
  shape.closePath();

  const extrudeGeo = new THREE.ExtrudeGeometry(shape, { depth: 2.8, bevelEnabled: false });
  extrudeGeo.translate(0, 0, -1.4);
  const body = shadow(new THREE.Mesh(extrudeGeo, mainMat));
  group.add(body);

  // Decorative top ridge & banner stripe
  const ridge = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3.05, 8), woodMat));
  ridge.rotation.x = Math.PI / 2;
  ridge.position.y = 2.38;
  group.add(ridge);

  const trim = shadow(new THREE.Mesh(new THREE.BoxGeometry(3.14, 0.24, 2.86), trimMat), false, true);
  trim.position.y = 0.14;
  group.add(trim);

  // Warm glowing tent entrance
  const door = new THREE.Mesh(new THREE.PlaneGeometry(0.96, 1.28), glowMat);
  door.position.set(0, 0.68, 1.42);
  group.add(door);

  return group;
}

/**
 * Cute wooden island cottage / shop / service hall with pitched roof & glowing windows.
 */
export function createCottage({ wallColor, roofColor, awningColor, scale = 1.0, glowRegistry }) {
  const group = new THREE.Group();
  const wallMat = makeCozyMaterial(wallColor);
  const roofMat = makeCozyMaterial(roofColor);
  const woodMat = makeCozyMaterial(0x7f5539);
  const winMat = makeCozyMaterial(0xfff1b8, { emissive: 0xffb703, emissiveIntensity: 0.0 });
  glowRegistry.push(winMat);

  const wall = shadow(new THREE.Mesh(new THREE.BoxGeometry(3.4, 2.2, 2.8), wallMat));
  wall.position.y = 1.1;
  group.add(wall);

  // Pitched roof (4-sided cone rotated 45 deg)
  const roof = shadow(new THREE.Mesh(new THREE.ConeGeometry(2.85, 1.7, 4), roofMat));
  roof.position.y = 2.95;
  roof.rotation.y = Math.PI / 4;
  roof.scale.set(1.08, 1, 0.92);
  group.add(roof);

  // Chimney
  const chimney = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.45, 1.1, 0.45), makeCozyMaterial(0xb56557)));
  chimney.position.set(1.0, 3.25, -0.4);
  group.add(chimney);

  // Wooden door
  const door = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.82, 1.35, 0.1), woodMat));
  door.position.set(0, 0.68, 1.41);
  group.add(door);

  // Glowing side windows
  [-1.08, 1.08].forEach((wx) => {
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.72, 0.08), woodMat);
    frame.position.set(wx, 1.25, 1.4);
    group.add(frame);

    const glass = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.56, 0.1), winMat);
    glass.position.set(wx, 1.25, 1.42);
    group.add(glass);
  });

  if (awningColor) {
    const awning = shadow(new THREE.Mesh(new THREE.BoxGeometry(3.55, 0.16, 0.9), makeCozyMaterial(awningColor)));
    awning.position.set(0, 1.98, 1.65);
    awning.rotation.x = 0.28;
    group.add(awning);
  }

  group.scale.setScalar(scale);
  return group;
}

/**
 * Vintage Island Streetlamp with auto-glowing warm lantern globe at dusk/night.
 */
export function createStreetLamp(glowRegistry) {
  const group = new THREE.Group();
  const ironMat = makeCozyMaterial(0x3a4a4d);
  const bulbMat = makeCozyMaterial(0xfff3c4, { emissive: 0xffc857, emissiveIntensity: 0.0 });
  glowRegistry.push(bulbMat);

  const base = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.28, 0.35, 8), ironMat));
  base.position.y = 0.17;
  group.add(base);

  const pole = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.1, 2.7, 8), ironMat));
  pole.position.y = 1.5;
  group.add(pole);

  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 10), bulbMat);
  bulb.position.y = 2.95;
  group.add(bulb);

  const cap = shadow(new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.22, 8), ironMat));
  cap.position.y = 3.22;
  group.add(cap);

  return group;
}

/**
 * Cozy Plaza Campfire with animated flickering glow flame.
 */
export function createCampfire(glowRegistry) {
  const group = new THREE.Group();
  const stoneMat = makeCozyMaterial(0x9aa5b1);
  const logMat = makeCozyMaterial(0x7c4d32);
  const flameMat = makeCozyMaterial(0xff9f1c, { emissive: 0xff6b00, emissiveIntensity: 0.9 });
  glowRegistry.push(flameMat);

  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const s = shadow(new THREE.Mesh(new THREE.DodecahedronGeometry(0.22, 0), stoneMat));
    s.position.set(Math.cos(a) * 0.72, 0.14, Math.sin(a) * 0.72);
    group.add(s);
  }
  for (let i = 0; i < 3; i++) {
    const log = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.95, 6), logMat));
    log.position.y = 0.2;
    log.rotation.z = Math.PI / 2.2;
    log.rotation.y = (i / 3) * Math.PI;
    group.add(log);
  }

  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.85, 7), flameMat);
  flame.position.y = 0.52;
  group.add(flame);

  return { group, flame };
}

/**
 * Wooden Bulletin Board in the plaza.
 */
export function createBulletinBoard() {
  const group = new THREE.Group();
  const woodMat = makeCozyMaterial(0x8d5b3a);
  const corkMat = makeCozyMaterial(0xe0c097);
  const noteMat = makeCozyMaterial(0xfff9db);

  [-0.7, 0.7].forEach((px) => {
    const post = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 2.0, 8), woodMat));
    post.position.set(px, 1.0, 0);
    group.add(post);
  });

  const board = shadow(new THREE.Mesh(new THREE.BoxGeometry(1.75, 1.1, 0.14), woodMat));
  board.position.y = 1.5;
  group.add(board);

  const cork = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.9, 0.16), corkMat);
  cork.position.y = 1.5;
  group.add(cork);

  const note1 = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.5, 0.18), noteMat);
  note1.position.set(-0.32, 1.52, 0);
  note1.rotation.z = 0.06;
  const note2 = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.44, 0.18), makeCozyMaterial(0xcaf0f8));
  note2.position.set(0.32, 1.48, 0);
  note2.rotation.z = -0.05;
  group.add(note1, note2);

  return group;
}

/**
 * Walkable Wooden Arch Bridge spanning the river.
 */
export function createWoodenBridge(spanZ = 5.4, widthX = 3.2) {
  const group = new THREE.Group();
  const plankMat = makeCozyMaterial(0xb07d52);
  const postMat = makeCozyMaterial(0x7c5233);

  const plankCount = 9;
  for (let i = 0; i < plankCount; i++) {
    const t = i / (plankCount - 1) - 0.5;
    const archY = Math.cos(t * Math.PI) * 0.28;
    const plank = shadow(new THREE.Mesh(new THREE.BoxGeometry(widthX, 0.16, spanZ / plankCount - 0.06), plankMat));
    plank.position.set(0, archY, t * spanZ);
    group.add(plank);
  }

  // Side handrails
  [-widthX / 2 + 0.15, widthX / 2 - 0.15].forEach((rx) => {
    [-spanZ * 0.45, 0, spanZ * 0.45].forEach((rz) => {
      const post = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.12, 1.05, 8), postMat));
      post.position.set(rx, 0.55 + (rz === 0 ? 0.26 : 0.04), rz);
      group.add(post);
    });
    const rail = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, spanZ * 0.94), postMat));
    rail.position.set(rx, 1.02, 0);
    group.add(rail);
  });

  return group;
}

/**
 * Stylized smooth coastal boulder.
 */
export function createCoastalRock(scale = 1.0) {
  const mat = makeCozyMaterial(0x9ca7b5, { flatShading: true });
  const rock = shadow(new THREE.Mesh(new THREE.DodecahedronGeometry(0.75 * scale, 1), mat));
  rock.scale.set(1.2, 0.72, 1.0);
  rock.position.y = 0.25 * scale;
  return rock;
}

/**
 * Procedural stylized matte 3D outdoor furniture factory (Week 2).
 */
export function createFurnitureMesh(itemId, glowRegistry = []) {
  const g = new THREE.Group();
  const wood = makeCozyMaterial(0xb28258, { textureKind: 'matte', roughness: 0.96 });
  const darkWood = makeCozyMaterial(0x7c5335, { textureKind: 'matte', roughness: 0.96 });
  const stone = makeCozyMaterial(0x9ba2a8, { textureKind: 'matte', roughness: 0.97 });
  const cream = makeCozyMaterial(0xf5eedb, { textureKind: 'cloth', roughness: 0.98 });

  if (itemId === 'wood_bench') {
    const seat = shadow(new THREE.Mesh(new THREE.BoxGeometry(1.38, 0.12, 0.56), wood));
    seat.position.y = 0.44;
    const back = shadow(new THREE.Mesh(new THREE.BoxGeometry(1.38, 0.42, 0.1), wood));
    back.position.set(0, 0.76, -0.24);
    back.rotation.x = -0.14;
    g.add(seat, back);
    [[-0.55, -0.18], [0.55, -0.18], [-0.55, 0.18], [0.55, 0.18]].forEach(([x, z]) => {
      const leg = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.44, 0.11), darkWood));
      leg.position.set(x, 0.22, z);
      g.add(leg);
    });
  } else if (itemId === 'wood_table') {
    const top = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.68, 0.12, 14), wood));
    top.position.y = 0.66;
    const post = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 0.64, 10), darkWood));
    post.position.y = 0.32;
    g.add(top, post);
  } else if (itemId === 'wooden_stool') {
    const top = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.34, 0.11, 12), wood));
    top.position.y = 0.42;
    g.add(top);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const leg = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.42, 6), darkWood));
      leg.position.set(Math.cos(a) * 0.2, 0.2, Math.sin(a) * 0.2);
      g.add(leg);
    }
  } else if (itemId === 'garden_lantern') {
    const base = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.4, 0.24, 6), stone));
    base.position.y = 0.12;
    const stem = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 0.62, 6), stone));
    stem.position.y = 0.52;
    const glowMat = makeCozyMaterial(0xffe8a3, { emissive: 0xffb703, emissiveIntensity: 0.08, noGrain: true });
    glowRegistry.push(glowMat);
    const core = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.34), glowMat);
    core.position.y = 0.98;
    const roof = shadow(new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.34, 6), stone));
    roof.position.y = 1.32;
    g.add(base, stem, core, roof);
  } else if (itemId === 'flower_pot') {
    const pot = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.25, 0.42, 10), makeCozyMaterial(0xc97455, { textureKind: 'matte' })));
    pot.position.y = 0.21;
    const bush = shadow(new THREE.Mesh(new THREE.DodecahedronGeometry(0.34, 1), makeCozyMaterial(0x52a85f, { textureKind: 'matte' })));
    bush.position.y = 0.54;
    const blossomMat = makeCozyMaterial(0xf58db2, { textureKind: 'cloth' });
    g.add(pot, bush);
    [[-0.16, 0.72, 0.14], [0.16, 0.7, -0.1], [0, 0.82, 0]].forEach(([x, y, z]) => {
      const f = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8), blossomMat);
      f.position.set(x, y, z);
      g.add(f);
    });
  } else if (itemId === 'wood_fence') {
    [-0.56, 0, 0.56].forEach((x) => {
      const post = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.92, 0.15), darkWood));
      post.position.set(x, 0.46, 0);
      g.add(post);
    });
    [0.32, 0.68].forEach((y) => {
      const rail = shadow(new THREE.Mesh(new THREE.BoxGeometry(1.54, 0.12, 0.09), wood));
      rail.position.set(0, y, 0);
      g.add(rail);
    });
  } else if (itemId === 'picnic_rug') {
    const matA = makeCozyMaterial(0xe87a7a, { textureKind: 'cloth', roughness: 0.98 });
    const rug = new THREE.Mesh(new THREE.BoxGeometry(1.48, 0.04, 1.48), cream);
    rug.position.y = 0.02;
    rug.receiveShadow = true;
    const stripe1 = new THREE.Mesh(new THREE.BoxGeometry(1.48, 0.045, 0.34), matA);
    stripe1.position.set(0, 0.022, -0.35);
    const stripe2 = new THREE.Mesh(new THREE.BoxGeometry(1.48, 0.045, 0.34), matA);
    stripe2.position.set(0, 0.022, 0.35);
    const basket = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.24, 0.28), wood));
    basket.position.set(0.38, 0.15, -0.34);
    g.add(rug, stripe1, stripe2, basket);
  } else if (itemId === 'parasol') {
    const pole = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.85, 8), cream));
    pole.position.y = 0.92;
    const canopy = shadow(new THREE.Mesh(new THREE.ConeGeometry(1.05, 0.48, 8), makeCozyMaterial(0x52a8d8, { textureKind: 'cloth' })));
    canopy.position.y = 1.82;
    const topBtn = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), makeCozyMaterial(0xf5c85b, { textureKind: 'cloth' }));
    topBtn.position.y = 2.08;
    g.add(pole, canopy, topBtn);
  } else if (itemId === 'signpost') {
    const post = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 1.35, 8), darkWood));
    post.position.y = 0.67;
    const sign = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.36, 0.09), wood));
    sign.position.set(0.12, 1.12, 0.05);
    g.add(post, sign);
  } else if (itemId === 'mailbox_deco') {
    const post = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.95, 8), darkWood));
    post.position.y = 0.47;
    const box = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.36, 0.64), makeCozyMaterial(0x4b93c9, { textureKind: 'matte' })));
    box.position.y = 1.08;
    const flag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.26, 0.08), makeCozyMaterial(0xe85d5d, { textureKind: 'matte' }));
    flag.position.set(0.26, 1.18, 0.1);
    g.add(post, box, flag);
  } else if (itemId === 'mini_campfire') {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const r = shadow(new THREE.Mesh(new THREE.DodecahedronGeometry(0.15, 0), stone));
      r.position.set(Math.cos(a) * 0.46, 0.1, Math.sin(a) * 0.46);
      g.add(r);
    }
    const fMat = makeCozyMaterial(0xf59e2d, { emissive: 0xff6b00, emissiveIntensity: 0.45, noGrain: true });
    glowRegistry.push(fMat);
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.56, 6), fMat);
    flame.position.y = 0.32;
    g.add(flame);
  } else if (itemId === 'cozy_bed') {
    const frame = shadow(new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.28, 1.48), wood));
    frame.position.y = 0.22;
    const head = shadow(new THREE.Mesh(new THREE.BoxGeometry(1.22, 0.68, 0.14), darkWood));
    head.position.set(0, 0.56, -0.68);
    const mattress = shadow(new THREE.Mesh(new THREE.BoxGeometry(1.08, 0.18, 1.34), cream));
    mattress.position.y = 0.42;
    const quilt = shadow(new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.2, 0.88), makeCozyMaterial(0x7ac79c, { textureKind: 'cloth' })));
    quilt.position.set(0, 0.44, 0.22);
    const pillow = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.14, 0.34), makeCozyMaterial(0xf7e3a1, { textureKind: 'cloth' })));
    pillow.position.set(0, 0.56, -0.42);
    g.add(frame, head, mattress, quilt, pillow);
  } else if (itemId === 'bookshelf') {
    const body = shadow(new THREE.Mesh(new THREE.BoxGeometry(1.24, 1.48, 0.44), wood));
    body.position.y = 0.74;
    const topCap = shadow(new THREE.Mesh(new THREE.BoxGeometry(1.32, 0.1, 0.5), darkWood));
    topCap.position.y = 1.5;
    g.add(body, topCap);
    const bookColors = [0xe87a7a, 0x5ba8d8, 0xf2c14e, 0x62b278, 0xc38cd4];
    [0.42, 0.86, 1.24].forEach((sy, row) => {
      for (let i = 0; i < 5; i++) {
        const bk = new THREE.Mesh(
          new THREE.BoxGeometry(0.16, 0.26, 0.32),
          makeCozyMaterial(bookColors[(i + row * 2) % bookColors.length], { textureKind: 'matte' })
        );
        bk.position.set(-0.42 + i * 0.21, sy, 0.08);
        g.add(bk);
      }
    });
  } else if (itemId === 'round_rug') {
    const outer = new THREE.Mesh(new THREE.CylinderGeometry(0.76, 0.76, 0.04, 18), cream);
    outer.position.y = 0.02;
    outer.receiveShadow = true;
    const mid = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.56, 0.045, 16), makeCozyMaterial(0x88c499, { textureKind: 'cloth' }));
    mid.position.y = 0.023;
    const center = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.05, 14), makeCozyMaterial(0xf4d284, { textureKind: 'cloth' }));
    center.position.y = 0.026;
    g.add(outer, mid, center);
  } else if (itemId === 'tea_table') {
    const top = shadow(new THREE.Mesh(new THREE.BoxGeometry(1.26, 0.1, 0.86), wood));
    top.position.y = 0.44;
    [[-0.5, -0.32], [0.5, -0.32], [-0.5, 0.32], [0.5, 0.32]].forEach(([x, z]) => {
      const leg = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.44, 0.1), darkWood));
      leg.position.set(x, 0.22, z);
      g.add(leg);
    });
    const pot = shadow(new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), makeCozyMaterial(0xe08d79, { textureKind: 'matte' })));
    pot.position.set(-0.18, 0.62, 0);
    const cup1 = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.06, 0.11, 8), cream);
    cup1.position.set(0.24, 0.54, 0.14);
    const cup2 = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.06, 0.11, 8), cream);
    cup2.position.set(0.28, 0.54, -0.14);
    g.add(top, pot, cup1, cup2);
  } else if (itemId === 'golden_trophy') {
    const plinth = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.28, 0.56), darkWood));
    plinth.position.y = 0.14;
    const goldMat = makeCozyMaterial(0xe8b948, { textureKind: 'matte', roughness: 0.72, metalness: 0.18 });
    const stem = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 0.32, 10), goldMat));
    stem.position.y = 0.44;
    const cup = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.14, 0.42, 12), goldMat));
    cup.position.y = 0.78;
    const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.16, 0), makeCozyMaterial(0xffe07d, { emissive: 0xd99b1e, emissiveIntensity: 0.25 }));
    star.position.y = 1.12;
    g.add(plinth, stem, cup, star);
  } else if (itemId === 'sakura_table') {
    const pinkWood = makeCozyMaterial(0xf2b5c4, { textureKind: 'cloth' });
    const top = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.72, 0.11, 14), pinkWood));
    top.position.y = 0.56;
    const stem = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.22, 0.54, 10), wood));
    stem.position.y = 0.27;
    const petalMat = makeCozyMaterial(0xffd6e4, { textureKind: 'cloth' });
    [[-0.25, 0.63, 0.18], [0.22, 0.63, -0.15], [0.05, 0.63, 0.24]].forEach(([x, y, z]) => {
      const p = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), petalMat);
      p.scale.set(1.2, 0.35, 1.0);
      p.position.set(x, y, z);
      g.add(p);
    });
    g.add(top, stem);
  } else if (itemId === 'moon_lamp') {
    const base = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.38, 0.16, 12), darkWood));
    base.position.y = 0.08;
    const pole = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.9, 8), darkWood));
    pole.position.y = 0.52;
    const moonMat = makeCozyMaterial(0xfff0a8, { emissive: 0xffcf56, emissiveIntensity: 0.55, noGrain: true });
    glowRegistry.push(moonMat);
    const moon = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.11, 8, 16, Math.PI * 1.35), moonMat);
    moon.position.set(0, 1.24, 0);
    moon.rotation.z = 0.65;
    g.add(base, pole, moon);
  } else if (itemId === 'plush_bear') {
    const fur = makeCozyMaterial(0xc68a59, { textureKind: 'cloth' });
    const belly = makeCozyMaterial(0xf7e6cb, { textureKind: 'cloth' });
    const body = shadow(new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 10), fur));
    body.scale.set(1, 1.1, 0.92);
    body.position.y = 0.34;
    const head = shadow(new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 10), fur));
    head.position.y = 0.82;
    const snout = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8), belly);
    snout.position.set(0, 0.78, 0.24);
    const earL = shadow(new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), fur));
    earL.position.set(-0.2, 1.05, 0);
    const earR = shadow(new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), fur));
    earR.position.set(0.2, 1.05, 0);
    const ribbon = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.08, 0.14), makeCozyMaterial(0xe86b7a, { textureKind: 'cloth' }));
    ribbon.position.set(0, 0.58, 0.22);
    g.add(body, head, snout, earL, earR, ribbon);
  } else if (itemId === 'star_fountain') {
    const basin = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.76, 0.68, 0.32, 14), stone));
    basin.position.y = 0.16;
    const water = new THREE.Mesh(new THREE.CylinderGeometry(0.66, 0.66, 0.06, 14), makeCozyMaterial(0x5ec2e6, { noGrain: true }));
    water.position.y = 0.31;
    const col = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, 0.88, 10), stone));
    col.position.y = 0.66;
    const tier = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.28, 0.16, 12), stone));
    tier.position.y = 0.92;
    const starMat = makeCozyMaterial(0xffe680, { emissive: 0xffc83d, emissiveIntensity: 0.6, noGrain: true });
    glowRegistry.push(starMat);
    const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.2, 0), starMat);
    star.position.y = 1.32;
    g.add(basin, water, col, tier, star);
  } else if (itemId === 'owl_statue') {
    const sand = makeCozyMaterial(0xd9cbb6, { textureKind: 'matte' });
    const dark = makeCozyMaterial(0x8e7c66, { textureKind: 'matte' });
    const base = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.24, 0.68), stone));
    base.position.y = 0.12;
    const body = shadow(new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 10), sand));
    body.scale.set(0.95, 1.25, 0.9);
    body.position.y = 0.58;
    const head = shadow(new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 10), sand));
    head.position.y = 1.02;
    const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 8), makeCozyMaterial(0xfff9e6, { noGrain: true }));
    eyeL.position.set(-0.09, 1.05, 0.2);
    const eyeR = eyeL.clone();
    eyeR.position.x = 0.09;
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.12, 6), makeCozyMaterial(0xd99b38, { textureKind: 'matte' }));
    beak.rotation.x = Math.PI / 2;
    beak.position.set(0, 0.98, 0.25);
    const tuftL = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.15, 5), dark);
    tuftL.position.set(-0.15, 1.24, 0.02);
    tuftL.rotation.z = 0.35;
    const tuftR = tuftL.clone();
    tuftR.position.x = 0.15;
    tuftR.rotation.z = -0.35;
    g.add(base, body, head, eyeL, eyeR, beak, tuftL, tuftR);
  } else if (itemId === 'wish_pond') {
    const rim = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.84, 0.88, 0.26, 14), stone));
    rim.position.y = 0.13;
    const pool = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.72, 0.08, 14), makeCozyMaterial(0x4cb5d8, { noGrain: true }));
    pool.position.y = 0.24;
    const pad1 = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.03, 10), makeCozyMaterial(0x4fa85b, { textureKind: 'matte' }));
    pad1.position.set(-0.24, 0.29, 0.18);
    const pad2 = pad1.clone();
    pad2.scale.setScalar(0.8);
    pad2.position.set(0.28, 0.29, -0.14);
    const lotus = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), makeCozyMaterial(0xf799b8, { textureKind: 'cloth' }));
    lotus.position.set(-0.24, 0.35, 0.18);
    const lantern = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.56, 8), stone));
    lantern.position.set(0.42, 0.42, -0.38);
    const glowMat = makeCozyMaterial(0xfff0b2, { emissive: 0xffc845, emissiveIntensity: 0.55, noGrain: true });
    glowRegistry.push(glowMat);
    const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.18), glowMat);
    bulb.position.set(0.42, 0.76, -0.38);
    const cap = shadow(new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.14, 6), stone));
    cap.position.set(0.42, 0.9, -0.38);
    g.add(rim, pool, pad1, pad2, lotus, lantern, bulb, cap);
  } else {
    const fallback = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), wood));
    fallback.position.y = 0.4;
    g.add(fallback);
  }

  return g;
}

/**
 * 3-Stage Player Home exterior (Stage 0 Tent -> Stage 1 Cottage -> Stage 2 Grand House).
 */
export function createPlayerHomeMesh(stage = 0, glowRegistry = []) {
  if (stage <= 0) {
    return createCozyTent(0xffd166, 0xef476f, glowRegistry);
  }
  if (stage === 1) {
    return createCottage({
      wallColor: 0xfff3dd,
      roofColor: 0xe07a5f,
      awningColor: 0x52a86b,
      scale: 1.0,
      glowRegistry
    });
  }
  // Stage 2: Grand Storybook House with pastel roof, chimney, porch & flower boxes
  const g = createCottage({
    wallColor: 0xfff8eb,
    roofColor: 0x4b93c9,
    awningColor: 0xf2c14e,
    scale: 1.18,
    glowRegistry
  });
  const flowerBoxMat = makeCozyMaterial(0x7c5335, { textureKind: 'matte' });
  const leafMat = makeCozyMaterial(0x52a85f, { textureKind: 'matte' });
  const pinkMat = makeCozyMaterial(0xf58db2, { textureKind: 'cloth' });
  [-1.08, 1.08].forEach((wx) => {
    const box = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.22, 0.26), flowerBoxMat));
    box.position.set(wx, 0.92, 1.66);
    const bush = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.18, 0.22), leafMat);
    bush.position.set(wx, 1.08, 1.66);
    const fl = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8), pinkMat);
    fl.position.set(wx, 1.2, 1.68);
    g.add(box, bush, fl);
  });
  return g;
}

/**
 * Week 6: 3-Stage Highland Museum exterior (Tent -> Brick Museum -> Grand Dome Museum).
 */
export function createMuseumMesh(stage = 0, glowRegistry = []) {
  if (stage <= 0) {
    const t = createCozyTent(0xe8f5e9, 0x2a9d8f, glowRegistry);
    t.scale.setScalar(1.18);
    return t;
  }
  if (stage === 1) {
    return createCottage({
      wallColor: 0xf6eedf,
      roofColor: 0x2f7d6e,
      awningColor: 0xd99b38,
      scale: 1.08,
      glowRegistry
    });
  }
  // Stage 2: Grand Dome Museum with classical columns & golden owl crest
  const g = createCottage({
    wallColor: 0xfbf6ea,
    roofColor: 0x276b63,
    awningColor: 0xe6b64c,
    scale: 1.24,
    glowRegistry
  });
  const colMat = makeCozyMaterial(0xf2e8d5, { textureKind: 'matte' });
  const domeMat = makeCozyMaterial(0x3a8d82, { textureKind: 'matte' });
  const goldMat = makeCozyMaterial(0xeab846, { textureKind: 'matte' });
  [-1.35, 1.35].forEach((cx) => {
    const pillar = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.2, 2.2, 10), colMat));
    pillar.position.set(cx, 1.1, 1.72);
    g.add(pillar);
  });
  const dome = shadow(new THREE.Mesh(new THREE.SphereGeometry(1.15, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), domeMat));
  dome.position.set(0, 3.85, 0);
  const crest = new THREE.Mesh(new THREE.OctahedronGeometry(0.28, 0), goldMat);
  crest.position.set(0, 5.12, 0);
  g.add(dome, crest);
  return g;
}

/**
 * Procedural 3D held tools attached to player's right hand (Week 3).
 */
export function createHeldTools() {
  const holder = new THREE.Group();
  holder.position.set(0.32, 0.56, 0.22);

  const wood = makeCozyMaterial(0x9a6d45, { textureKind: 'matte' });
  const metal = makeCozyMaterial(0x8c98a4, { textureKind: 'matte' });
  const netMat = makeCozyMaterial(0xf5f5ec, { textureKind: 'cloth', transparent: true, opacity: 0.78 });
  const tools = {};

  // 1. Fishing Rod
  const rod = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.04, 1.55, 6), wood);
  pole.position.set(0, 0.45, 0.52);
  pole.rotation.x = 0.85;
  rod.add(pole);
  tools.rod = rod;

  // 2. Bug Net
  const net = new THREE.Group();
  const nHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 1.15, 6), wood);
  nHandle.position.set(0, 0.3, 0.38);
  nHandle.rotation.x = 0.9;
  const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.028, 6, 12), metal);
  hoop.position.set(0, 0.72, 0.95);
  hoop.rotation.x = Math.PI / 2 - 0.35;
  const sack = new THREE.Mesh(new THREE.ConeGeometry(0.23, 0.44, 10), netMat);
  sack.position.set(0, 0.58, 1.06);
  sack.rotation.x = 0.7;
  net.add(nHandle, hoop, sack);
  tools.net = net;

  // 3. Flimsy Axe
  const axe = new THREE.Group();
  const aHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.95, 6), wood);
  aHandle.position.set(0, 0.25, 0.25);
  aHandle.rotation.x = 0.8;
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.26, 0.32), metal);
  blade.position.set(0, 0.55, 0.62);
  axe.add(aHandle, blade);
  tools.axe = axe;

  // 4. Shovel
  const shovel = new THREE.Group();
  const sHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.038, 1.1, 6), wood);
  sHandle.position.set(0, 0.25, 0.32);
  sHandle.rotation.x = 0.9;
  const scoop = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.06, 0.34), metal);
  scoop.position.set(0, 0.56, 0.8);
  scoop.rotation.x = 0.9;
  shovel.add(sHandle, scoop);
  tools.shovel = shovel;

  // 5. Watering Can
  const water = new THREE.Group();
  const can = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.2, 0.32, 10), makeCozyMaterial(0x52a8d8, { textureKind: 'matte' }));
  can.position.set(0, 0.06, 0.25);
  const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.055, 0.34, 8), makeCozyMaterial(0x52a8d8, { textureKind: 'matte' }));
  spout.position.set(0, 0.14, 0.48);
  spout.rotation.x = 1.0;
  water.add(can, spout);
  tools.water = water;

  Object.values(tools).forEach((t) => {
    t.visible = false;
    holder.add(t);
  });

  return { holder, tools };
}


