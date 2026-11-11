import type { Presence } from "./voice";

/**
 * Browser-side face analysis for the voice interview, with MediaPipe's Face
 * Landmarker running on the candidate's own device (wasm + model served from
 * /mediapipe). Nothing visual leaves the browser: per answer we keep a handful
 * of numbers — how often the face was in frame, how often the candidate looked
 * at the camera, smiled, frowned, and how much the head moved — the same way
 * ProsodyMeter keeps numbers about the voice.
 */
type Landmarker = {
  detectForVideo: (video: HTMLVideoElement, ts: number) => { faceLandmarks?: unknown[]; faceBlendshapes?: { categories: { categoryName: string; score: number }[] }[]; facialTransformationMatrixes?: { data: number[] }[] };
  close: () => void;
};

type Frame = { visible: boolean; yaw: number; pitch: number; gaze: number; smile: number; furrow: number };

const SAMPLE_MS = 250; // 4 frames/s is plenty for posture and expression

export class FaceMeter {
  private video: HTMLVideoElement;
  private landmarker: Landmarker | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private frames: Frame[] = [];
  private recording = false;
  private failed = false;
  ready = false;

  constructor(video: HTMLVideoElement) {
    this.video = video;
  }

  /** Load the model (once). Resolves false when the device can't run it; the interview goes on without face analysis. */
  async init(): Promise<boolean> {
    if (this.ready || this.failed) return this.ready;
    try {
      const vision = await import("@mediapipe/tasks-vision");
      const files = await vision.FilesetResolver.forVisionTasks("/mediapipe");
      this.landmarker = (await vision.FaceLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: "/mediapipe/face_landmarker.task" },
        runningMode: "VIDEO",
        numFaces: 1,
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: true,
      })) as unknown as Landmarker;
      this.ready = true;
      this.timer = setInterval(() => this.sample(), SAMPLE_MS);
      return true;
    } catch (e) {
      console.warn("[face] analysis unavailable:", (e as Error)?.message);
      this.failed = true;
      return false;
    }
  }

  private sample() {
    if (!this.recording || !this.landmarker || this.video.readyState < 2 || this.video.videoWidth === 0) return;
    try {
      const r = this.landmarker.detectForVideo(this.video, performance.now());
      const face = r.faceLandmarks?.[0];
      if (!face) {
        this.frames.push({ visible: false, yaw: 0, pitch: 0, gaze: 0, smile: 0, furrow: 0 });
        return;
      }
      const shapes = new Map((r.faceBlendshapes?.[0]?.categories || []).map((c) => [c.categoryName, c.score]));
      const m = r.facialTransformationMatrixes?.[0]?.data;
      // Head pose from the 4x4 transformation matrix (column-major): yaw around Y, pitch around X, in degrees.
      let yaw = 0;
      let pitch = 0;
      if (m && m.length >= 16) {
        yaw = (Math.atan2(-m[8], Math.hypot(m[0], m[4])) * 180) / Math.PI;
        pitch = (Math.atan2(m[9], m[10]) * 180) / Math.PI;
      }
      const g = (k: string) => shapes.get(k) || 0;
      // Eye gaze away from the camera: the larger of the four look directions (0–1).
      const gaze = Math.max(g("eyeLookOutLeft"), g("eyeLookInLeft"), g("eyeLookOutRight"), g("eyeLookInRight"), g("eyeLookUpLeft"), g("eyeLookUpRight"), g("eyeLookDownLeft"), g("eyeLookDownRight"));
      const smile = (g("mouthSmileLeft") + g("mouthSmileRight")) / 2;
      const furrow = (g("browDownLeft") + g("browDownRight")) / 2;
      this.frames.push({ visible: true, yaw, pitch, gaze, smile, furrow });
    } catch {
      /* a dropped frame is fine */
    }
  }

  /** Call when the candidate starts speaking. */
  start() {
    this.frames = [];
    this.recording = true;
  }

  /** Call when the answer ends: the presence profile of that answer, or null when nothing was measured. */
  stop(): Presence | null {
    this.recording = false;
    const all = this.frames;
    this.frames = [];
    if (all.length < 3) return null;
    const vis = all.filter((f) => f.visible);
    const ratio = (n: number) => Math.round((n / all.length) * 100) / 100;
    const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
    const std = (xs: number[]) => {
      const mu = mean(xs);
      return Math.sqrt(mean(xs.map((x) => (x - mu) ** 2)));
    };
    const eyeContact = vis.filter((f) => Math.abs(f.yaw) < 18 && Math.abs(f.pitch) < 15 && f.gaze < 0.45).length;
    return {
      frames: all.length,
      faceVisibleRatio: ratio(vis.length),
      eyeContactRatio: vis.length ? Math.round((eyeContact / vis.length) * 100) / 100 : 0,
      smileRatio: vis.length ? Math.round((vis.filter((f) => f.smile > 0.35).length / vis.length) * 100) / 100 : 0,
      furrowRatio: vis.length ? Math.round((vis.filter((f) => f.furrow > 0.4).length / vis.length) * 100) / 100 : 0,
      headMovementDeg: Math.round(((std(vis.map((f) => f.yaw)) + std(vis.map((f) => f.pitch))) / 2) * 10) / 10,
      avgYawDeg: Math.round(mean(vis.map((f) => f.yaw))),
      avgPitchDeg: Math.round(mean(vis.map((f) => f.pitch))),
    };
  }

  dispose() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    try {
      this.landmarker?.close();
    } catch {}
    this.landmarker = null;
  }
}
