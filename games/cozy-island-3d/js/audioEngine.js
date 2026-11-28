// Pure Web Audio API cozy soundscape (Week 7: 24-Hour 6-Mood Variations + Nature Ambience + Shutter SFX):
// - 6 hourly musical moods (dawn / morning / afternoon / sunset / night / midnight) + rain ballad
// - Procedural ocean-breeze / rain pink-noise bed + daytime birdsong & nighttime cricket trills
// - Animalese-style cute syllable voice synthesis & island interaction SFX

const HOURLY_MOODS = {
  dawn: {
    label: '🌅 晨露木琴',
    tempoMs: 440,
    wave: 'triangle',
    octave: 1.0,
    dur: 0.36,
    vol: 0.17,
    pattern: [0, 2, 3, 1, 2, -1, 3, 0],
    chords: [
      [261.63, 329.63, 392.00, 493.88], // Cmaj7
      [220.00, 261.63, 329.63, 392.00], // Am7
      [174.61, 220.00, 261.63, 329.63], // Fmaj7
      [196.00, 246.94, 293.66, 392.00]  // G6
    ]
  },
  morning: {
    label: '☀️ 活力吉他',
    tempoMs: 380,
    wave: 'triangle',
    octave: 1.0,
    dur: 0.28,
    vol: 0.19,
    pattern: [0, 1, 2, 3, 1, 2, 3, -1],
    chords: [
      [293.66, 369.99, 440.00, 554.37], // Dmaj7
      [246.94, 293.66, 369.99, 440.00], // Bm7
      [196.00, 246.94, 293.66, 369.99], // Gmaj7
      [220.00, 277.18, 329.63, 392.00]  // A7
    ]
  },
  afternoon: {
    label: '🏖️ 慵懶烏克',
    tempoMs: 430,
    wave: 'triangle',
    octave: 1.0,
    dur: 0.34,
    vol: 0.18,
    pattern: [0, 2, 1, 3, 2, -1, 3, 1],
    chords: [
      [349.23, 440.00, 523.25, 659.25], // Fmaj7
      [329.63, 392.00, 493.88, 587.33], // Em7
      [293.66, 349.23, 440.00, 523.25], // Dm7
      [261.63, 329.63, 392.00, 493.88]  // Cmaj7
    ]
  },
  sunset: {
    label: '🌇 夕陽電鋼琴',
    tempoMs: 480,
    wave: 'sine',
    octave: 1.0,
    dur: 0.52,
    vol: 0.17,
    pattern: [0, 3, 2, 1, -1, 2, 3, 1],
    chords: [
      [220.00, 261.63, 329.63, 392.00], // Am7
      [174.61, 220.00, 261.63, 329.63], // Fmaj7
      [261.63, 329.63, 392.00, 493.88], // Cmaj7
      [196.00, 246.94, 293.66, 392.00]  // G6
    ]
  },
  night: {
    label: '🌌 星空音樂盒',
    tempoMs: 560,
    wave: 'sine',
    octave: 2.0,
    dur: 0.68,
    vol: 0.13,
    pattern: [0, 2, -1, 3, 1, -1, 2, 0],
    chords: [
      [196.00, 246.94, 293.66, 369.99], // Gmaj7
      [164.81, 196.00, 246.94, 293.66], // Em7
      [261.63, 329.63, 392.00, 493.88], // Cmaj7
      [220.00, 261.63, 329.63, 392.00]  // Am7
    ]
  },
  midnight: {
    label: '🌙 深夜搖籃曲',
    tempoMs: 650,
    wave: 'sine',
    octave: 2.0,
    dur: 0.85,
    vol: 0.11,
    pattern: [0, -1, 2, -1, 3, -1, 1, -1],
    chords: [
      [174.61, 220.00, 261.63, 329.63], // Fmaj7
      [164.81, 196.00, 246.94, 293.66], // Em7
      [146.83, 174.61, 220.00, 261.63], // Dm7
      [130.81, 164.81, 196.00, 246.94]  // Cmaj7
    ]
  },
  rain: {
    label: '🌧️ 細雨爵士',
    tempoMs: 550,
    wave: 'sine',
    octave: 1.0,
    dur: 0.60,
    vol: 0.15,
    pattern: [0, 2, 1, -1, 3, 2, -1, 1],
    chords: [
      [293.66, 349.23, 440.00, 523.25], // Dm7
      [196.00, 246.94, 293.66, 349.23], // G7
      [261.63, 329.63, 392.00, 493.88], // Cmaj7
      [220.00, 261.63, 329.63, 392.00]  // Am7
    ]
  }
};

export function resolveHourlyMoodKey(hour, isRain = false, fallbackPhase = 'afternoon') {
  if (isRain) return 'rain';
  if (Number.isFinite(hour)) {
    const h = ((hour % 24) + 24) % 24;
    if (h >= 5 && h < 8) return 'dawn';
    if (h >= 8 && h < 12) return 'morning';
    if (h >= 12 && h < 16.5) return 'afternoon';
    if (h >= 16.5 && h < 19.5) return 'sunset';
    if (h >= 19.5 && h < 23) return 'night';
    return 'midnight';
  }
  if (fallbackPhase === 'morning') return 'morning';
  if (fallbackPhase === 'sunset') return 'sunset';
  if (fallbackPhase === 'night') return 'night';
  return 'afternoon';
}

export class CozyAudioEngine {
  constructor(initialMuted = false) {
    this.ctx = null;
    this.masterGain = null;
    this.bgmGain = null;
    this.rainGain = null;
    this.rainFilter = null;
    this.muted = initialMuted;
    this.unlocked = false;

    this._moodKey = 'afternoon';
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

    this._initAmbienceBed();
    this.unlocked = true;
    this._startBgmLoop();
  }

  _initAmbienceBed() {
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

    this.rainFilter = this.ctx.createBiquadFilter();
    this.rainFilter.type = 'lowpass';
    this.rainFilter.frequency.value = this._isRain ? 1250 : 420;

    this.rainGain = this.ctx.createGain();
    this.rainGain.gain.value = this._isRain ? 0.16 : 0.022;

    src.connect(this.rainFilter);
    this.rainFilter.connect(this.rainGain);
    this.rainGain.connect(this.masterGain);
    src.start();
  }

  setMuted(muted) {
    this.muted = !!muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.muted ? 0 : 0.72, this.ctx.currentTime, 0.06);
    }
  }

  setMood(phaseKey, isRain, virtualHour = null) {
    this._isRain = !!isRain;
    this._moodKey = resolveHourlyMoodKey(virtualHour, this._isRain, phaseKey);
    if (this.rainGain && this.rainFilter && this.ctx) {
      this.rainGain.gain.setTargetAtTime(this._isRain ? 0.16 : 0.022, this.ctx.currentTime, 0.35);
      this.rainFilter.frequency.setTargetAtTime(this._isRain ? 1250 : 420, this.ctx.currentTime, 0.35);
    }
  }

  getMoodLabel() {
    return (HOURLY_MOODS[this._moodKey] || HOURLY_MOODS.afternoon).label;
  }

  _startBgmLoop() {
    const tick = () => {
      if (this.ctx && this.ctx.state === 'running' && !this.muted) {
        this._playBgmStep();
      }
      const mood = HOURLY_MOODS[this._moodKey] || HOURLY_MOODS.afternoon;
      this._bgmTimer = setTimeout(tick, mood.tempoMs);
    };
    tick();
  }

  _playBgmStep() {
    const mood = HOURLY_MOODS[this._moodKey] || HOURLY_MOODS.afternoon;
    const bar = Math.floor(this._step / 8) % mood.chords.length;
    const beat = this._step % 8;
    const chord = mood.chords[bar];
    const now = this.ctx.currentTime;

    // Warm root/fifth bass on beat 0 and 4
    if (beat === 0 || beat === 4) {
      const bassFreq = chord[0] * (beat === 0 ? 0.5 : 0.75);
      this._pluck(bassFreq, now, mood.tempoMs * 0.0012, 0.21, 'sine', this.bgmGain);
    }

    // Main hourly arpeggio / melody
    const noteIdx = mood.pattern[beat];
    if (noteIdx >= 0) {
      const freq = chord[noteIdx % chord.length] * mood.octave;
      this._pluck(freq, now, mood.dur, mood.vol, mood.wave, this.bgmGain);
      // Soft bell shimmer on beat 6 for dawn/sunset/night
      if (beat === 6 && (this._moodKey === 'dawn' || this._moodKey === 'sunset' || this._moodKey === 'night')) {
        this._pluck(chord[3] * 2.0, now + 0.04, 0.45, 0.06, 'sine', this.bgmGain);
      }
    }

    // Subtle nature ambience accents: daytime birdsong / nighttime crickets
    if (beat === 7 && !this._isRain && Math.random() < 0.16) {
      if (this._moodKey === 'dawn' || this._moodKey === 'morning' || this._moodKey === 'afternoon') {
        this._playBirdChirp(now + 0.05);
      } else if (this._moodKey === 'night' || this._moodKey === 'midnight') {
        this._playCricketTrill(now + 0.06);
      }
    }

    this._step++;
  }

  _playBirdChirp(startTime) {
    const base = 1850 + Math.random() * 550;
    this._pluck(base, startTime, 0.06, 0.032, 'sine', this.masterGain);
    this._pluck(base * 1.24, startTime + 0.07, 0.08, 0.028, 'sine', this.masterGain);
  }

  _playCricketTrill(startTime) {
    for (let i = 0; i < 3; i++) {
      this._pluck(3450, startTime + i * 0.055, 0.03, 0.018, 'sine', this.masterGain);
    }
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

  playShutter() {
    if (!this.ctx || this.muted || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    this._pluck(1240, now, 0.032, 0.22, 'triangle', this.masterGain);
    this._pluck(460, now + 0.038, 0.045, 0.18, 'sine', this.masterGain);
    this._pluck(980, now + 0.075, 0.08, 0.12, 'sine', this.masterGain);
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
