import * as THREE from '../vendor/three.module.min.js';
import { ROLLING_CURVE_STRENGTH } from './config.js';

export const rollingUniforms = {
  uPlayerPos: { value: new THREE.Vector3(0, 0, 0) },
  uCurveStrength: { value: ROLLING_CURVE_STRENGTH }
};

// Cached procedural matte canvas textures (zero plastic sheen, zero external downloads)
const texCache = {};

function makeCanvasTexture(key, size, drawFn, repeat = 1) {
  if (texCache[key]) return texCache[key];
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  drawFn(ctx, size);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.colorSpace = THREE.SRGBColorSpace;
  texCache[key] = tex;
  return tex;
}

export function getMatteTexture(kind = 'matte') {
  if (kind === 'grass') {
    return makeCanvasTexture('grass', 128, (ctx, s) => {
      ctx.fillStyle = '#f2f2f2';
      ctx.fillRect(0, 0, s, s);
      // Soft matte paper grain
      for (let i = 0; i < 650; i++) {
        const x = (i * 73) % s;
        const y = (i * 137) % s;
        ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.045)';
        ctx.fillRect(x, y, 2, 2);
      }
      // Signature Animal Crossing subtle rounded triangle tufts
      ctx.fillStyle = 'rgba(0, 0, 0, 0.055)';
      const pts = [[24, 28], [88, 28], [56, 84], [116, 84]];
      pts.forEach(([cx, cy]) => {
        ctx.beginPath();
        ctx.moveTo(cx, cy - 11);
        ctx.lineTo(cx + 12, cy + 9);
        ctx.lineTo(cx - 12, cy + 9);
        ctx.closePath();
        ctx.fill();
      });
    }, 1);
  }
  if (kind === 'plaza') {
    return makeCanvasTexture('plaza', 128, (ctx, s) => {
      ctx.fillStyle = '#ddd6ca';
      ctx.fillRect(0, 0, s, s);
      const cell = s / 2;
      for (let r = 0; r < 2; r++) {
        for (let c = 0; c < 2; c++) {
          ctx.fillStyle = (r + c) % 2 === 0 ? '#f0ece4' : '#eae4d8';
          ctx.fillRect(c * cell + 3, r * cell + 3, cell - 6, cell - 6);
        }
      }
      for (let i = 0; i < 400; i++) {
        ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)';
        ctx.fillRect((i * 53) % s, (i * 97) % s, 2, 2);
      }
    }, 1);
  }
  if (kind === 'cloth') {
    return makeCanvasTexture('cloth', 64, (ctx, s) => {
      ctx.fillStyle = '#efefef';
      ctx.fillRect(0, 0, s, s);
      for (let y = 0; y < s; y += 2) {
        for (let x = 0; x < s; x += 2) {
          const v = ((x + y) % 4 === 0) ? 'rgba(255,255,255,0.055)' : 'rgba(0,0,0,0.045)';
          ctx.fillStyle = v;
          ctx.fillRect(x, y, 2, 2);
        }
      }
    }, 3);
  }
  return makeCanvasTexture('matte', 64, (ctx, s) => {
    ctx.fillStyle = '#f2f2f2';
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 320; i++) {
      ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)';
      ctx.fillRect((i * 41) % s, (i * 67) % s, 2, 2);
    }
  }, 1);
}

/**
 * Injects the signature Animal Crossing "Rolling-Log" planet curvature
 * into any Three.js material. Supports both standard Meshes and InstancedMeshes.
 */
export function applyRollingWorld(material, customFactor = 1.0) {
  material.customProgramCacheKey = () => `rolling_world_v2_${customFactor.toFixed(2)}`;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uPlayerPos = rollingUniforms.uPlayerPos;
    shader.uniforms.uCurveStrength = rollingUniforms.uCurveStrength;

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform vec3 uPlayerPos;
        uniform float uCurveStrength;`
      )
      .replace(
        '#include <project_vertex>',
        `vec4 rwPos = vec4( transformed, 1.0 );
        #ifdef USE_BATCHING
          rwPos = batchingMatrix * rwPos;
        #endif
        #ifdef USE_INSTANCING
          rwPos = instanceMatrix * rwPos;
        #endif
        rwPos = modelMatrix * rwPos;
        float rwDz = rwPos.z - uPlayerPos.z;
        float rwDx = rwPos.x - uPlayerPos.x;
        float rwDistSq = rwDz * rwDz + rwDx * rwDx * 0.22;
        rwPos.y -= rwDistSq * uCurveStrength * ${customFactor.toFixed(3)};
        vec4 mvPosition = viewMatrix * rwPos;
        gl_Position = projectionMatrix * mvPosition;`
      );
  };
  return material;
}

/**
 * Storybook ultra-matte Standard material (roughness 0.96, metalness 0) with procedural grain
 * so characters and terrain feel like soft felt/paper rather than shiny plastic.
 */
export function makeCozyMaterial(color, opts = {}) {
  const mat = new THREE.MeshStandardMaterial({
    color,
    roughness: opts.roughness ?? 0.96,
    metalness: 0.0,
    map: opts.noGrain ? null : getMatteTexture(opts.textureKind || 'matte'),
    emissive: opts.emissive ?? 0x000000,
    emissiveIntensity: opts.emissiveIntensity ?? 1.0,
    transparent: opts.transparent ?? false,
    opacity: opts.opacity ?? 1.0,
    side: opts.side ?? THREE.FrontSide,
    flatShading: opts.flatShading ?? false
  });
  return applyRollingWorld(mat, opts.curveFactor ?? 1.0);
}
