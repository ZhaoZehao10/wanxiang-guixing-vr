// 程序化音效 — 纯 WebAudio 合成，无外部素材文件
// 短促音效：抓取/放下/落地/吸附/胜利/界面点击。
// 背景音乐：缓慢和弦 Pad（Am-F-C-G 循环），由 WebAudio 实时合成。
// AudioContext 需要在用户手势内创建或恢复（浏览器自动播放策略），
// VR 中 selectstart 也算手势，onGrab 里会先 unlock。

let ctx = null;

function ac() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone(freq, dur, { type = 'sine', gain = 0.12, delay = 0, slide = 0 } = {}) {
  const a = ac();
  const t0 = a.currentTime + delay;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t0 + dur);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(a.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

export const sfx = {
  unlock() { try { ac(); } catch { /* 无音频设备时静默 */ } },
  grab() { tone(520, 0.07, { type: 'triangle', gain: 0.10 }); },
  drop() { tone(300, 0.09, { type: 'triangle', gain: 0.08 }); },
  land() { tone(140, 0.06, { gain: 0.05 }); },
  snap() { tone(660, 0.10, { gain: 0.12 }); tone(990, 0.14, { gain: 0.10, delay: 0.07 }); },
  win() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, { gain: 0.12, delay: i * 0.13 })); },
  ui() { tone(880, 0.05, { type: 'square', gain: 0.05 }); },
};

// ---------------- 背景音乐：Am - F - C - G 缓慢和弦 Pad ----------------
const CHORDS = [
  [110.00, 130.81, 164.81], // Am
  [87.31, 110.00, 130.81],  // F
  [130.81, 164.81, 196.00], // C
  [98.00, 123.47, 146.83],  // G
];
const BGM_VOL_KEY = 'pico3d.bgmVolume';
const BGM_ON_KEY = 'pico3d.bgmOn';

export const music = {
  playing: false,
  volume: 0.22,
  _nodes: null,
  _timer: null,
  _chord: 0,

  init() {
    try {
      const v = parseFloat(localStorage.getItem(BGM_VOL_KEY));
      if (Number.isFinite(v) && v >= 0 && v <= 1) this.volume = v;
    } catch (e) { /* ignore */ }
    return this;
  },

  isEnabled() {
    try { return localStorage.getItem(BGM_ON_KEY) !== '0'; } catch (e) { return true; }
  },

  setEnabled(on) {
    try { localStorage.setItem(BGM_ON_KEY, on ? '1' : '0'); } catch (e) { /* ignore */ }
    if (on) this.start(); else this.stop();
  },

  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v));
    try { localStorage.setItem(BGM_VOL_KEY, String(this.volume)); } catch (e) { /* ignore */ }
    if (this._nodes) this._nodes.master.gain.setTargetAtTime(this.volume, ac().currentTime, 0.2);
  },

  start() {
    if (this.playing) return;
    let a;
    try { a = ac(); } catch (e) { return; }
    const master = a.createGain();
    master.gain.setValueAtTime(0, a.currentTime);
    master.gain.linearRampToValueAtTime(this.volume, a.currentTime + 2.5); // 淡入
    const filter = a.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 900;
    filter.Q.value = 0.6;
    filter.connect(master);
    master.connect(a.destination);

    const gains = [];
    const oscs = [];
    for (let i = 0; i < 3; i++) {
      const o = a.createOscillator();
      o.type = i === 0 ? 'sine' : 'triangle';
      o.frequency.value = CHORDS[0][i];
      o.detune.value = (i - 1) * 4; // 轻微失谐，声音更厚
      const g = a.createGain();
      g.gain.value = 0.30 - i * 0.06;
      o.connect(g).connect(filter);
      o.start();
      oscs.push(o);
      gains.push(g);
    }
    // 缓慢呼吸 LFO
    const lfo = a.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = a.createGain();
    lfoGain.gain.value = 0.10;
    lfo.connect(lfoGain).connect(master.gain);
    lfo.start();

    this._nodes = { master, filter, oscs, gains, lfo, lfoGain };
    this.playing = true;
    this._chord = 0;
    this._timer = setInterval(() => {
      if (!this.playing) return;
      this._chord = (this._chord + 1) % CHORDS.length;
      const chord = CHORDS[this._chord];
      const t = a.currentTime;
      for (let i = 0; i < 3; i++) this._nodes.oscs[i].frequency.setTargetAtTime(chord[i], t, 1.2);
    }, 6500);
  },

  stop() {
    if (!this.playing || !this._nodes) return;
    this.playing = false;
    clearInterval(this._timer);
    const a = ac();
    const { master, oscs, lfo } = this._nodes;
    try {
      master.gain.setTargetAtTime(0, a.currentTime, 0.4); // 淡出
      setTimeout(() => {
        try { oscs.forEach((o) => o.stop()); lfo.stop(); master.disconnect(); } catch (e) { /* ignore */ }
      }, 1200);
    } catch (e) { /* ignore */ }
    this._nodes = null;
  },

  toggle() {
    if (this.playing) { this.setEnabled(false); return false; }
    this.setEnabled(true);
    return true;
  },
};

music.init();
