import * as THREE from '../vendor/three.module.min.js';
import { SEASON_PALETTES } from './config.js';

const TIME_KEYFRAMES = [
  { h: 0,  top: 0x0d1a40, hor: 0x24366b, sun: 0xa6bff5, ambSky: 0x4b649e, ambGnd: 0x293552, sunInt: 0.55, ambInt: 0.74, lamp: 1.0, stars: 1.0 },
  { h: 5,  top: 0x1e2d5c, hor: 0x6b5b95, sun: 0xffb38a, ambSky: 0x5c5b8c, ambGnd: 0x2f334a, sunInt: 0.58, ambInt: 0.72, lamp: 0.85, stars: 0.65 },
  { h: 7,  top: 0x5ba8e6, hor: 0xffd2a6, sun: 0xffe4b5, ambSky: 0xaad9ff, ambGnd: 0x87a878, sunInt: 1.05, ambInt: 0.85, lamp: 0.15, stars: 0.0 },
  { h: 12, top: 0x4ca9f0, hor: 0xc8edff, sun: 0xfffaf0, ambSky: 0xdaf2ff, ambGnd: 0x7cb874, sunInt: 1.35, ambInt: 0.95, lamp: 0.0,  stars: 0.0 },
  { h: 16, top: 0x5ca4e0, hor: 0xe6e9c8, sun: 0xffe8bd, ambSky: 0xcde7ff, ambGnd: 0x8db072, sunInt: 1.2,  ambInt: 0.9,  lamp: 0.0,  stars: 0.0 },
  { h: 18, top: 0x435399, hor: 0xff8f6b, sun: 0xff9e64, ambSky: 0xffb899, ambGnd: 0x6e5c6b, sunInt: 0.9,  ambInt: 0.82, lamp: 0.65, stars: 0.15 },
  { h: 20, top: 0x16244f, hor: 0x3b4478, sun: 0xa9c2f5, ambSky: 0x4c5e94, ambGnd: 0x2c3652, sunInt: 0.58, ambInt: 0.75, lamp: 1.0,  stars: 0.85 },
  { h: 24, top: 0x0d1a40, hor: 0x24366b, sun: 0xa6bff5, ambSky: 0x4b649e, ambGnd: 0x293552, sunInt: 0.55, ambInt: 0.74, lamp: 1.0, stars: 1.0 }
];

const WEATHER_ORDER = ['sunny', 'breeze', 'rain'];

export class TimeWeatherSystem {
  constructor(scene, initialSettings = {}) {
    this.scene = scene;
    this.clockMode = initialSettings.clockMode || 'realtime';
    this.weather = WEATHER_ORDER.includes(initialSettings.weather) ? initialSettings.weather : 'breeze';
    this.season = initialSettings.season || 'spring';

    const now = new Date();
    this.virtualHour = now.getHours() + now.getMinutes() / 60;
    this.lampFactor = 0;

    this._cTop = new THREE.Color();
    this._cHor = new THREE.Color();
    this._cSun = new THREE.Color();
    this._cAmbSky = new THREE.Color();
    this._cAmbGnd = new THREE.Color();
    this._tmpA = new THREE.Color();
    this._tmpB = new THREE.Color();

    this._initLighting();
    this._initSkyDome();
    this._initStars();
    this._initSunMoon();
    this._initWeatherParticles();
  }

  _initLighting() {
    this.hemiLight = new THREE.HemisphereLight(0xdaf2ff, 0x7cb874, 0.95);
    this.scene.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight(0xfffaf0, 1.3);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(1024, 1024);
    const d = 24;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.camera.near = 2;
    this.sunLight.shadow.camera.far = 75;
    this.sunLight.shadow.bias = -0.0012;
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    this.scene.fog = new THREE.FogExp2(0xc8edff, 0.0115);
  }

  _initSkyDome() {
    const geo = new THREE.SphereGeometry(120, 24, 16);
    this.skyUniforms = {
      uTopColor: { value: new THREE.Color(0x4ca9f0) },
      uHorizonColor: { value: new THREE.Color(0xc8edff) }
    };
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: this.skyUniforms,
      vertexShader: `
        varying vec3 vLocalPos;
        void main() {
          vLocalPos = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uTopColor;
        uniform vec3 uHorizonColor;
        varying vec3 vLocalPos;
        void main() {
          float h = clamp(vLocalPos.y * 1.35 + 0.12, 0.0, 1.0);
          vec3 col = mix(uHorizonColor, uTopColor, pow(h, 0.65));
          gl_FragColor = vec4(col, 1.0);
        }
      `
    });
    this.skyDome = new THREE.Mesh(geo, mat);
    this.scene.add(this.skyDome);
  }

  _initStars() {
    const count = 220;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI * 0.42;
      const r = 98;
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.cos(phi) + 8;
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.starsMat = new THREE.PointsMaterial({
      color: 0xfffbe6,
      size: 1.5,
      transparent: true,
      opacity: 0,
      fog: false,
      depthWrite: false
    });
    this.stars = new THREE.Points(geo, this.starsMat);
    this.scene.add(this.stars);
  }

  _initSunMoon() {
    this.celestialMat = new THREE.MeshBasicMaterial({ color: 0xfff4b8, fog: false });
    this.celestialOrb = new THREE.Mesh(new THREE.SphereGeometry(3.2, 16, 16), this.celestialMat);
    this.scene.add(this.celestialOrb);
  }

  _initWeatherParticles() {
    // 1. Breeze petals / leaves
    const petalCount = 90;
    const pGeo = new THREE.PlaneGeometry(0.24, 0.16);
    const pal = SEASON_PALETTES[this.season] || SEASON_PALETTES.spring;
    this.petalMat = new THREE.MeshBasicMaterial({
      color: pal.petalColor,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.88
    });
    this.petalMesh = new THREE.InstancedMesh(pGeo, this.petalMat, petalCount);
    this.petalData = [];
    for (let i = 0; i < petalCount; i++) {
      this.petalData.push({
        x: (Math.random() - 0.5) * 32,
        y: Math.random() * 12 + 1,
        z: (Math.random() - 0.5) * 32,
        phase: Math.random() * Math.PI * 2,
        speed: 0.7 + Math.random() * 0.7
      });
    }
    this.scene.add(this.petalMesh);

    // 2. Rain streaks
    const rainCount = 260;
    const rGeo = new THREE.BoxGeometry(0.03, 0.75, 0.03);
    this.rainMat = new THREE.MeshBasicMaterial({
      color: 0xcbe8ff,
      transparent: true,
      opacity: 0.55
    });
    this.rainMesh = new THREE.InstancedMesh(rGeo, this.rainMat, rainCount);
    this.rainData = [];
    for (let i = 0; i < rainCount; i++) {
      this.rainData.push({
        x: (Math.random() - 0.5) * 30,
        y: Math.random() * 14,
        z: (Math.random() - 0.5) * 30,
        speed: 14 + Math.random() * 5
      });
    }
    this.scene.add(this.rainMesh);
    this._dummy = new THREE.Object3D();
  }

  setSeason(seasonKey) {
    this.season = seasonKey;
    const pal = SEASON_PALETTES[seasonKey] || SEASON_PALETTES.spring;
    this.petalMat.color.setHex(pal.petalColor);
  }

  toggleClockMode() {
    this.clockMode = this.clockMode === 'realtime' ? 'accelerated' : 'realtime';
    if (this.clockMode === 'realtime') {
      const now = new Date();
      this.virtualHour = now.getHours() + now.getMinutes() / 60;
    }
    return this.clockMode;
  }

  jumpNextPhase() {
    // Switch to accelerated preview and jump to next showcase lighting period
    this.clockMode = 'accelerated';
    const phases = [7.0, 13.0, 17.75, 21.5];
    const next = phases.find((p) => p > this.virtualHour + 0.6) ?? phases[0];
    this.virtualHour = next;
  }

  cycleWeather() {
    const idx = WEATHER_ORDER.indexOf(this.weather);
    this.weather = WEATHER_ORDER[(idx + 1) % WEATHER_ORDER.length];
    return this.weather;
  }

  getWeatherLabel() {
    if (this.weather === 'rain') return '🌧️ 細雨';
    if (this.weather === 'breeze') return this.season === 'winter' ? '❄️ 飄雪' : '🍃 微風';
    return '☀️ 晴朗';
  }

  getPhaseKey() {
    if (this.weather === 'rain') return 'rain';
    const h = this.virtualHour;
    if (h >= 5 && h < 10) return 'morning';
    if (h >= 10 && h < 16.8) return 'day';
    if (h >= 16.8 && h < 19.6) return 'sunset';
    return 'night';
  }

  getPhaseLabel() {
    const h = this.virtualHour;
    if (h >= 5 && h < 10) return '清晨';
    if (h >= 10 && h < 16.8) return '白晝';
    if (h >= 16.8 && h < 19.6) return '黃昏';
    return '星空';
  }

  getFormattedClock() {
    const totalMin = Math.floor(((this.virtualHour % 24) + 24) % 24 * 60);
    const hh = String(Math.floor(totalMin / 60)).padStart(2, '0');
    const mm = String(totalMin % 60).padStart(2, '0');
    return `${hh}:${mm}`;
  }

  update(dt, elapsed, playerPos) {
    if (this.clockMode === 'realtime') {
      const now = new Date();
      this.virtualHour = now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
    } else {
      // 24 real minutes = 24 game hours => 1 real second = 1 game minute
      this.virtualHour = (this.virtualHour + dt / 60) % 24;
    }

    const h = ((this.virtualHour % 24) + 24) % 24;
    let k0 = TIME_KEYFRAMES[0];
    let k1 = TIME_KEYFRAMES[1];
    for (let i = 0; i < TIME_KEYFRAMES.length - 1; i++) {
      if (h >= TIME_KEYFRAMES[i].h && h <= TIME_KEYFRAMES[i + 1].h) {
        k0 = TIME_KEYFRAMES[i];
        k1 = TIME_KEYFRAMES[i + 1];
        break;
      }
    }
    const span = Math.max(0.0001, k1.h - k0.h);
    const t = (h - k0.h) / span;

    const lerpHex = (out, a, b) => out.copy(this._tmpA.setHex(a)).lerp(this._tmpB.setHex(b), t);
    lerpHex(this._cTop, k0.top, k1.top);
    lerpHex(this._cHor, k0.hor, k1.hor);
    lerpHex(this._cSun, k0.sun, k1.sun);
    lerpHex(this._cAmbSky, k0.ambSky, k1.ambSky);
    lerpHex(this._cAmbGnd, k0.ambGnd, k1.ambGnd);

    let sunInt = THREE.MathUtils.lerp(k0.sunInt, k1.sunInt, t);
    let ambInt = THREE.MathUtils.lerp(k0.ambInt, k1.ambInt, t);
    this.lampFactor = THREE.MathUtils.lerp(k0.lamp, k1.lamp, t);
    let starOpacity = THREE.MathUtils.lerp(k0.stars, k1.stars, t);

    // Rainy overcast mood tint
    if (this.weather === 'rain') {
      const overcast = this._tmpA.setHex(0x6c7f99);
      this._cTop.lerp(overcast, 0.45);
      this._cHor.lerp(this._tmpB.setHex(0x9fb2c7), 0.5);
      sunInt *= 0.65;
      ambInt *= 0.92;
      starOpacity *= 0.15;
      this.lampFactor = Math.max(this.lampFactor, 0.35);
    }

    this.skyUniforms.uTopColor.value.copy(this._cTop);
    this.skyUniforms.uHorizonColor.value.copy(this._cHor);
    this.scene.fog.color.copy(this._cHor);
    this.scene.fog.density = this.weather === 'rain' ? 0.0155 : 0.0105;

    this.hemiLight.color.copy(this._cAmbSky);
    this.hemiLight.groundColor.copy(this._cAmbGnd);
    this.hemiLight.intensity = ambInt;

    this.sunLight.color.copy(this._cSun);
    this.sunLight.intensity = sunInt;

    // Arc sun (6..18) or moon (18..6) smoothly across sky
    const isDay = h >= 6 && h <= 18.5;
    const arcT = isDay ? (h - 6) / 12.5 : ((h > 18.5 ? h - 18.5 : h + 5.5) / 11.5);
    const angle = arcT * Math.PI;
    const sunDirX = Math.cos(angle) * -28;
    const sunDirY = Math.max(8, Math.sin(angle) * 32);
    const sunDirZ = -14;

    this.sunLight.position.set(playerPos.x + sunDirX, playerPos.y + sunDirY, playerPos.z + sunDirZ);
    this.sunLight.target.position.copy(playerPos);
    this.sunLight.target.updateMatrixWorld();

    this.skyDome.position.copy(playerPos);
    this.stars.position.copy(playerPos);
    this.starsMat.opacity = starOpacity * (0.85 + Math.sin(elapsed * 2.2) * 0.15);

    this.celestialOrb.position.set(
      playerPos.x + Math.cos(angle) * -76,
      Math.sin(angle) * 65 - 4,
      playerPos.z - 62
    );
    this.celestialMat.color.setHex(isDay ? 0xfff1a8 : 0xeef4ff);
    this.celestialOrb.visible = this.weather !== 'rain' && this.celestialOrb.position.y > -2;

    // Update weather particles around player
    const showPetals = this.weather === 'breeze';
    this.petalMesh.visible = showPetals;
    if (showPetals) {
      for (let i = 0; i < this.petalData.length; i++) {
        const p = this.petalData[i];
        p.x += Math.sin(elapsed * 0.9 + p.phase) * dt * 1.1 + dt * 0.85;
        p.y -= dt * p.speed * (this.season === 'winter' ? 0.75 : 1.0);
        p.z += Math.cos(elapsed * 0.7 + p.phase) * dt * 0.6;
        if (p.y < 0.2) p.y = 11.5 + Math.random() * 2;
        if (p.x > 16) p.x -= 32;
        if (p.x < -16) p.x += 32;
        if (p.z > 16) p.z -= 32;
        if (p.z < -16) p.z += 32;
        this._dummy.position.set(playerPos.x + p.x, p.y, playerPos.z + p.z);
        this._dummy.rotation.set(elapsed * 1.4 + p.phase, elapsed * 1.9 + p.phase, 0.4);
        this._dummy.scale.setScalar(this.season === 'winter' ? 0.8 : 1.0);
        this._dummy.updateMatrix();
        this.petalMesh.setMatrixAt(i, this._dummy.matrix);
      }
      this.petalMesh.instanceMatrix.needsUpdate = true;
    }

    const showRain = this.weather === 'rain';
    this.rainMesh.visible = showRain;
    if (showRain) {
      for (let i = 0; i < this.rainData.length; i++) {
        const r = this.rainData[i];
        r.y -= dt * r.speed;
        r.x -= dt * 1.8;
        if (r.y < 0) {
          r.y = 13 + Math.random() * 3;
          r.x = (Math.random() - 0.5) * 30;
          r.z = (Math.random() - 0.5) * 30;
        }
        this._dummy.position.set(playerPos.x + r.x, r.y, playerPos.z + r.z);
        this._dummy.rotation.set(0, 0, 0.14);
        this._dummy.scale.setScalar(1);
        this._dummy.updateMatrix();
        this.rainMesh.setMatrixAt(i, this._dummy.matrix);
      }
      this.rainMesh.instanceMatrix.needsUpdate = true;
    }
  }
}
