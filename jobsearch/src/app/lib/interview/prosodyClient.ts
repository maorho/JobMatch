import type { Prosody } from "./voice";

/**
 * Browser-side voice-tone measurement. Runs on the microphone stream during
 * each spoken answer and produces a compact prosody profile: pitch (via
 * autocorrelation), pitch variability, loudness and its variability, pause
 * ratio, and whether the voice trailed off at the end. Pure DSP, no network.
 */
export class ProsodyMeter {
  private ctx: AudioContext;
  private analyser: AnalyserNode;
  private buf: Float32Array;
  private raf = 0;
  private frames: { f0: number; db: number }[] = [];
  private recording = false;
  /** Latest loudness (0–1) for a level meter. */
  level = 0;

  constructor(stream: MediaStream) {
    this.ctx = new AudioContext();
    const src = this.ctx.createMediaStreamSource(stream);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0;
    src.connect(this.analyser);
    this.buf = new Float32Array(this.analyser.fftSize);
    const tick = () => {
      this.analyser.getFloatTimeDomainData(this.buf);
      const { rms, db } = loudness(this.buf);
      this.level = Math.min(1, rms * 8);
      if (this.recording) this.frames.push({ f0: db > -45 ? pitchHz(this.buf, this.ctx.sampleRate) : 0, db });
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  /** Call when the candidate starts speaking (speech_started). */
  start() {
    this.frames = [];
    this.recording = true;
  }

  /** Call when their answer is done; returns the profile (or null if too little voiced audio). */
  stop(): Prosody | null {
    this.recording = false;
    const all = this.frames;
    this.frames = [];
    if (all.length < 10) return null;
    const voiced = all.filter((f) => f.f0 > 60 && f.f0 < 500);
    const pitches = voiced.map((f) => f.f0).sort((a, b) => a - b);
    const median = pitches.length ? pitches[Math.floor(pitches.length / 2)] : 0;
    // Semitones relative to the median — scale-free variability.
    const semis = voiced.map((f) => 12 * Math.log2(f.f0 / (median || 1)));
    const pitchVar = std(semis);
    const dbs = all.map((f) => f.db);
    const spoken = all.filter((f) => f.db > -45);
    const n = Math.max(1, Math.floor(all.length / 5));
    const startDb = mean(spoken.slice(0, n).map((f) => f.db));
    const endDb = mean(spoken.slice(-n).map((f) => f.db));
    return {
      pitchMedianHz: Math.round(median),
      pitchVarSemitones: Math.round(pitchVar * 10) / 10,
      loudnessDb: Math.round(mean(spoken.map((f) => f.db))),
      loudnessVarDb: Math.round(std(dbs.filter((d) => d > -45)) * 10) / 10,
      pauseRatio: Math.round(((all.length - spoken.length) / all.length) * 100) / 100,
      endTrendDb: Math.round(endDb - startDb),
      voicedFrames: voiced.length,
    };
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.ctx.close().catch(() => {});
  }
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const std = (xs: number[]) => {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
};

function loudness(buf: Float32Array): { rms: number; db: number } {
  let sum = 0;
  for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
  const rms = Math.sqrt(sum / buf.length);
  return { rms, db: 20 * Math.log10(rms || 1e-6) };
}

/** Fundamental frequency by normalized autocorrelation (good enough for speech, 60–500 Hz). */
function pitchHz(buf: Float32Array, sampleRate: number): number {
  const minLag = Math.floor(sampleRate / 500);
  const maxLag = Math.floor(sampleRate / 60);
  let bestLag = 0;
  let best = 0;
  let energy = 0;
  for (let i = 0; i < buf.length; i++) energy += buf[i] * buf[i];
  if (energy < 1e-4) return 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let c = 0;
    for (let i = 0; i + lag < buf.length; i++) c += buf[i] * buf[i + lag];
    c /= energy;
    if (c > best) {
      best = c;
      bestLag = lag;
    }
  }
  return best > 0.3 && bestLag ? sampleRate / bestLag : 0;
}
