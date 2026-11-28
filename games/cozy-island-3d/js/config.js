// Core configuration & seasonal palettes for Cozy Island 3D

export const GAME_ID = 'cozy_island_3d';
export const GRID_SIZE = 48;
export const TILE_SIZE = 1.6;
export const HALF_WORLD = (GRID_SIZE * TILE_SIZE) / 2;

export const GROUND_Y = {
  WATER: -0.35,
  SAND: 0.08,
  GRASS: 0.36,
  CLIFF: 1.86
};

export const ROLLING_CURVE_STRENGTH = 0.0085;

export const CAMERA_PRESETS = [
  { id: 'close', label: '近景', dist: 9.8, height: 6.4, fov: 44, lookY: 1.05 },
  { id: 'classic', label: '標準', dist: 14.5, height: 10.4, fov: 42, lookY: 0.65 },
  { id: 'wide', label: '俯瞰', dist: 21.5, height: 17.2, fov: 40, lookY: 0.1 }
];

export const SEASON_ORDER = ['spring', 'summer', 'autumn', 'winter'];

export const SEASON_PALETTES = {
  spring: {
    label: '🌸 春季',
    grass: 0x7fd17a,
    grassAlt: 0x73c46e,
    cliff: 0x8cc87c,
    cliffSide: 0xa68966,
    sand: 0xf4e3b2,
    treeLeaf: 0x67be6b,
    cherryLeaf: 0xf8a5c2,
    pineLeaf: 0x3b8c66,
    fruit: 0xff5e6c,
    flowers: [0xff7eb3, 0xffdf6b, 0xffffff, 0x90dbf4],
    petalColor: 0xffb7d5
  },
  summer: {
    label: '☀️ 夏季',
    grass: 0x62c45e,
    grassAlt: 0x56b653,
    cliff: 0x6ec968,
    cliffSide: 0x9c7f5b,
    sand: 0xf6df9f,
    treeLeaf: 0x45a852,
    cherryLeaf: 0x52b768,
    pineLeaf: 0x2d7a53,
    fruit: 0xff9f1c,
    flowers: [0xff595e, 0xffca3a, 0x8ac926, 0x4cc9f0],
    petalColor: 0xd8f3dc
  },
  autumn: {
    label: '🍁 秋季',
    grass: 0xc2b85c,
    grassAlt: 0xb5ab52,
    cliff: 0xc9be63,
    cliffSide: 0x947050,
    sand: 0xecd9a8,
    treeLeaf: 0xd98236,
    cherryLeaf: 0xe05a47,
    pineLeaf: 0x4a7856,
    fruit: 0xe63946,
    flowers: [0xf77f00, 0xfcbf49, 0xd62828, 0xfff3b0],
    petalColor: 0xf48c06
  },
  winter: {
    label: '❄️ 冬季',
    grass: 0xeaf4f8,
    grassAlt: 0xdcebf2,
    cliff: 0xf1f8fb,
    cliffSide: 0x9ca8b8,
    sand: 0xe6dec8,
    treeLeaf: 0xdbe9f4,
    cherryLeaf: 0xcde3f0,
    pineLeaf: 0x4d7c8a,
    fruit: 0xe63946,
    flowers: [0xa2d2ff, 0xffffff, 0xffafcc, 0xcdf0ea],
    petalColor: 0xffffff
  }
};

export function detectRealSeason(date = new Date()) {
  const m = date.getMonth() + 1;
  if (m >= 3 && m <= 5) return 'spring';
  if (m >= 6 && m <= 8) return 'summer';
  if (m >= 9 && m <= 11) return 'autumn';
  return 'winter';
}
