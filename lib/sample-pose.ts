import { type Landmark, type PoseFrame } from './controller.ts';
/** Synthetic landmarks for a reproducible control demo; this does not run ML. */
export function samplePose(time: number, capturedAt: number): PoseFrame {
  const t = Math.max(0, time - 3);
  const motion = t > 0 ? Math.min(t / 1.5, 1) : 0;
  const world: Landmark[] = Array.from({ length: 33 }, () => ({
    x: 0,
    y: 0,
    z: 0,
    visibility: 0.99,
    presence: 1,
  }));
  const set = (i: number, x: number, y: number, z = 0) => {
    world[i] = { x, y, z, visibility: 0.99, presence: 1 };
  };
  set(0, 0, -0.72);
  set(11, 0.18, -0.5);
  set(12, -0.18, -0.5);
  set(13, 0.29, -0.27);
  set(15, 0.25, -0.04);
  set(23, 0.13, 0);
  set(24, -0.13, 0);
  set(25, 0.13, 0.36);
  set(26, -0.13, 0.36);
  set(27, 0.13, 0.72);
  set(28, -0.13, 0.72);
  const wx = -0.4 - motion * 0.14 * Math.sin(t * 0.7);
  const wy = -0.27 - motion * 0.15 * Math.sin(t * 0.5);
  const wz = -0.08 + motion * 0.16 * Math.sin(t * 0.4);
  set(14, (-0.18 + wx) / 2, -0.24 + motion * 0.03 * Math.sin(t), wz / 2);
  set(16, wx, wy, wz);
  return {
    world,
    landmarks: world.map((p) => ({
      ...p,
      x: 0.5 + p.x * 0.8,
      y: 0.62 + p.y * 0.65,
    })),
    capturedAt,
    inferenceMs: null,
  };
}
