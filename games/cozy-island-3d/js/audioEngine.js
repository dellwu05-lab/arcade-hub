// Pure Web Audio API cozy soundscape:
// - Dynamic day/night/rain procedural BGM (marimba / warm Rhodes / celesta)
// - Animalese-style cute syllable voice synthesis
// - Surface-aware footsteps & island interaction SFX

const CHORD_PROGRESSIONS = {
  morning: [
    [261.63, 329.63, 392.0, 493.88], // Cmaj7
    [293.66, 349.23, 440.0, 523.25], // Dm7
    [329.63, 392.0, 493.88, 587.33], // Em7
    [261.63, 329.63, 392.0, 440.0]   // C6
  ],
  day: [
    [349.23, 440.0, 523.25, 659.25], // Fmaj7
    [329.63, 392.0, 493.88, 587.33], // Em7
    [293.66, 349.23, 440.0, 523.25], // Dm7
    [261.63, 329.63, 392.0, 493.88]  // Cmaj7
  ],
  sunset: [
    [220.0, 261.63, 329.63, 392.0],  // Am7
    [174.61, 220.0, 261.63, 329.63], // Fmaj7
    [261.63, 329.63, 392.0, 493.88], // Cmaj7
    [196.0, 246.94, 293.66, 392.0]   // G6
  ],
  night: [
    [196.0, 246.94, 293.66, 369.99], // Gmaj7
    [164.81, 196.0, 246.94, 293.66], // Em7
    [261.63, 329.63, 392.0, 493.88], // Cmaj7
    [220.0, 261.63, 329.63, 392.0]   // Am7
  ],
  rain: [
    [293.66, 349.23, 440.0, 523.25], // Dm7
    [196.0, 246.94, 293.66, 349.23], // G7
    [261.63, 329.63, 392.0, 493.88], // Cmaj7
    [220.0, 261.63, 329.63, 392.0]   // Am7
  ]
};

export class CozyAudioEngine {
  constructor(initialMuted = false) {
    this.ctx = null;
    this.masterGain = null;
    this.bgmGain = null;
    this.rainGain = null;
    this.muted = initialMuted;
    this.unlocked = false;

    this._phase = 'day';
    this._isRain = false;
    this._step = 0;
    this._bgmTimer = null;
  }

  unlock() {
    if (this.unlocked) {
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;

    this.ctx = new AudioCtx();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = this.muted ? 0 : 0.72;
    this.masterGain.connect(this.ctx.destination);

    this.bgmGain = this.ctx.createGain();
    this.bgmGain.gain.value = 0.24;
    this.bgmGain.connect(this.masterGain);

    this._initRainBed();
    this.unlocked = true;
    this._startBgmLoop();
  }

  _initRainBed() {
    const bufferSize = this.ctx.sampleRate * 2;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.997 * b0 + white * 0.029;
      b1 = 0.985 * b1 + white * 0.032;
      b2 = 0.950 * b2 + white * 0.048;
      data[i] = (b0 + b1 + b2 + white * 0.015) * 0.4;
    }

    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1150;

    this.rainGain = this.ctx.createGain();
    this.rainGain.gain.value = this._isRain ? 0.16 : 0.0001;

    src.connect(filter);
    filter.connect(this.rainGain);
    this.rainGain.connect(this.masterGain);
    src.start();
  }

  setMuted(muted) {
    this.muted = !!muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.muted ? 0 : 0.72, this.ctx.currentTime, 0.06);
    }
  }

  setMood(phaseKey, isRain) {
    this._phase = CHORD_PROGRESSIONS[phaseKey] ? phaseKey : 'day';
    this._isRain = !!isRain;
    if (this.rainGain && this.ctx) {
      this.rainGain.gain.setTargetAtTime(this._isRain ? 0.16 : 0.0001, this.ctx.currentTime, 0.35);
    }
  }

  _startBgmLoop() {
    const tick = () => {
      if (this.ctx && this.ctx.state === 'running' && !this.muted) {
        this._playBgmStep();
      }
      const intervalMs = this._phase === 'night' || this._phase === 'rain' ? 560 : 420;
      this._bgmTimer = setTimeout(tick, intervalMs);
    };
    tick();
  }

  _playBgmStep() {
    const prog = CHORD_PROGRESSIONS[this._phase] || CHORD_PROGRESSIONS.day;
    const bar = Math.floor(this._step / 8) % prog.length;
    const beat = this._step % 8;
    const chord = prog[bar];
    const now = this.ctx.currentTime;

    // Warm root bass on beat 0 and 4
    if (beat === 0 || beat === 4) {
      const bassFreq = chord[0] * (beat === 0 ? 0.5 : 0.75);
      this._pluck(bassFreq, now, 0.55, 0.22, 'sine', this.bgmGain);
    }

    // Gentle arpeggio / marimba melody
    const pattern = [0, 2, 1, 3, 2, -1, 3, 1];
    const noteIdx = pattern[beat];
    if (noteIdx >= 0) {
      const octave = this._phase === 'night' ? 2.0 : 1.0;
      const freq = chord[noteIdx % chord.length] * octave;
      const wave = this._phase === 'night' || this._phase === 'rain' ? 'sine' : 'triangle';
      const dur = this._phase === 'night' ? 0.65 : 0.32;
      const vol = this._phase === 'night' ? 0.14 : 0.19;
      this._pluck(freq, now, dur, vol, wave, this.bgmGain);
    }

    this._step++;
  }

  _pluck(freq, startTime, duration, volume, type, dest) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, startTime);

    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.linearRampToValueAtTime(volume, startTime + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    osc.connect(gain);
    gain.connect(dest);
    osc.start(startTime);
    osc.stop(startTime + duration + 0.03);
  }

  // Cute Animalese-style syllable chirp for villager speech
  playVoiceSyllable(basePitch = 480) {
    if (!this.ctx || this.muted || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    const jitter = 0.88 + Math.random() * 0.28;
    const f0 = basePitch * jitter;
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(f0, now);
    osc.frequency.exponentialRampToValueAtTime(f0 * (1.06 + Math.random() * 0.12), now + 0.055);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.14, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.07);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.08);
  }

  playFootstep(surface = 'grass') {
    if (!this.ctx || this.muted || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const freqMap = { grass: 170, sand: 260, wood: 210, stone: 310 };
    const f = (freqMap[surface] || 180) * (0.9 + Math.random() * 0.2);
    this._pluck(f, now, 0.065, 0.075, surface === 'wood' ? 'triangle' : 'sine', this.masterGain);
  }

  playTreeShake() {
    if (!this.ctx || this.muted || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    for (let i = 0; i < 4; i++) {
      this._pluck(220 + i * 55 + Math.random() * 40, now + i * 0.055, 0.1, 0.12, 'triangle', this.masterGain);
    }
  }

  playChime() {
    if (!this.ctx || this.muted || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, idx) => {
      this._pluck(f, now + idx * 0.07, 0.28, 0.16, 'triangle', this.masterGain);
    });
  }

  playUiPop() {
    if (!this.ctx || this.muted || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    this._pluck(580, now, 0.09, 0.12, 'sine', this.masterGain);
  }

  playPlaceWood() {
    if (!this.ctx || this.muted || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    this._pluck(165, now, 0.09, 0.22, 'triangle', this.masterGain);
    this._pluck(330, now + 0.03, 0.12, 0.14, 'sine', this.masterGain);
  }

  playPickupPop() {
    if (!this.ctx || this.muted || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    this._pluck(440, now, 0.08, 0.14, 'sine', this.masterGain);
    this._pluck(660, now + 0.045, 0.11, 0.14, 'triangle', this.masterGain);
  }

  playSplash() {
    if (!this.ctx || this.muted || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    this._pluck(310, now, 0.09, 0.16, 'sine', this.masterGain);
    this._pluck(195, now + 0.04, 0.14, 0.14, 'triangle', this.masterGain);
  }

  playNibble() {
    if (!this.ctx || this.muted || this.ctx.state !== 'running') return;
    this._pluck(420, this.ctx.currentTime, 0.07, 0.14, 'sine', this.masterGain);
  }

  playBite() {
    if (!this.ctx || this.muted || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    this._pluck(260, now, 0.12, 0.25, 'triangle', this.masterGain);
    this._pluck(620, now + 0.03, 0.18, 0.22, 'sine', this.masterGain);
    this._pluck(880, now + 0.07, 0.22, 0.18, 'triangle', this.masterGain);
  }

  playNetSwoosh() {
    if (!this.ctx || this.muted || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    this._pluck(520, now, 0.08, 0.1, 'sine', this.masterGain);
    this._pluck(340, now + 0.04, 0.09, 0.09, 'sine', this.masterGain);
  }

  playDig() {
    if (!this.ctx || this.muted || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    this._pluck(140, now, 0.1, 0.2, 'triangle', this.masterGain);
    this._pluck(210, now + 0.05, 0.09, 0.14, 'sine', this.masterGain);
  }

  playRockHit() {
    if (!this.ctx || this.muted || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    this._pluck(720, now, 0.07, 0.18, 'triangle', this.masterGain);
    this._pluck(490, now + 0.025, 0.09, 0.14, 'sine', this.masterGain);
  }

  playWaterPour() {
    if (!this.ctx || this.muted || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    [520, 620, 740, 660].forEach((f, i) => this._pluck(f, now + i * 0.055, 0.1, 0.1, 'sine', this.masterGain));
  }

  playCatchFanfare() {
    if (!this.ctx || this.muted || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => {
      this._pluck(f, now + i * 0.075, 0.34, 0.18, 'triangle', this.masterGain);
    });
  }

  playCraftHammer() {
    if (!this.ctx || this.muted || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    this._pluck(260, now, 0.07, 0.2, 'triangle', this.masterGain);
    this._pluck(310, now + 0.09, 0.07, 0.2, 'triangle', this.masterGain);
    this._pluck(587.3, now + 0.19, 0.18, 0.17, 'sine', this.masterGain);
    this._pluck(880, now + 0.26, 0.24, 0.16, 'triangle', this.masterGain);
  }

  playDoorTransition() {
    if (!this.ctx || this.muted || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    this._pluck(392, now, 0.14, 0.15, 'sine', this.masterGain);
    this._pluck(523.25, now + 0.09, 0.18, 0.15, 'triangle', this.masterGain);
  }

  playUpgradeFanfare() {
    if (!this.ctx || this.muted || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    [392, 523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => {
      this._pluck(f, now + i * 0.08, 0.36, 0.18, 'triangle', this.masterGain);
    });
  }
}
