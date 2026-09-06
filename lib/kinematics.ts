export type Vec3 = [number, number, number];
export type Joints = [number, number, number];
export const BASE_HEIGHT = 0.16;
export const UPPER_ARM = 0.43;
export const FOREARM = 0.38;
export const HOME: Vec3 = [0.38, 0.46, 0.1];
export const JOINT_SPEED = Math.PI / 2;
export const clamp = (n: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, n));
export const add = (a: Vec3, b: Vec3): Vec3 => [
  a[0] + b[0],
  a[1] + b[1],
  a[2] + b[2],
];
export const sub = (a: Vec3, b: Vec3): Vec3 => [
  a[0] - b[0],
  a[1] - b[1],
  a[2] - b[2],
];
export const scale = (a: Vec3, k: number): Vec3 => [
  a[0] * k,
  a[1] * k,
  a[2] * k,
];
export const dot = (a: Vec3, b: Vec3) =>
  a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const length = (a: Vec3) => Math.hypot(...a);
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const unit = (a: Vec3): Vec3 | null =>
  length(a) < 1e-6 ? null : scale(a, 1 / length(a));
export function forward(joints: Joints): [Vec3, Vec3, Vec3] {
  const [yaw, shoulder, elbow] = joints;
  const point = (r: number, h: number): Vec3 => [
    Math.cos(yaw) * r,
    BASE_HEIGHT + h,
    Math.sin(yaw) * r,
  ];
  return [
    [0, BASE_HEIGHT, 0],
    point(UPPER_ARM * Math.cos(shoulder), UPPER_ARM * Math.sin(shoulder)),
    point(
      UPPER_ARM * Math.cos(shoulder) + FOREARM * Math.cos(shoulder + elbow),
      UPPER_ARM * Math.sin(shoulder) + FOREARM * Math.sin(shoulder + elbow),
    ),
  ];
}
export function inverse(request: Vec3): {
  joints: Joints;
  target: Vec3;
  limited: boolean;
} {
  if (!request.every(Number.isFinite))
    throw new Error('Target coordinates must be finite.');
  let target: Vec3 = [
    clamp(request[0], 0.12, 0.7),
    clamp(request[1], 0.2, 0.8),
    clamp(request[2], -0.4, 0.4),
  ];
  const offset = sub(target, [0, BASE_HEIGHT, 0]);
  const distance = length(offset);
  const maxReach = UPPER_ARM + FOREARM - 0.015;
  if (distance > maxReach) {
    const ratio =
      Math.sqrt(maxReach ** 2 - offset[1] ** 2) /
      Math.hypot(target[0], target[2]);
    target = [target[0] * ratio, target[1], target[2] * ratio];
  }
  const radius = Math.hypot(target[0], target[2]);
  const height = target[1] - BASE_HEIGHT;
  const cosElbow = clamp(
    (radius * radius + height * height - UPPER_ARM ** 2 - FOREARM ** 2) /
      (2 * UPPER_ARM * FOREARM),
    -1,
    1,
  );
  const elbow = -Math.acos(cosElbow);
  const shoulder =
    Math.atan2(height, radius) -
    Math.atan2(
      FOREARM * Math.sin(elbow),
      UPPER_ARM + FOREARM * Math.cos(elbow),
    );
  return {
    joints: [Math.atan2(target[2], target[0]), shoulder, elbow],
    target,
    limited: length(sub(request, target)) > 1e-6,
  };
}
export function stepJoints(current: Joints, goal: Joints, dt: number): Joints {
  const step = JOINT_SPEED * clamp(dt, 0, 0.05);
  return current.map((q, i) => q + clamp(goal[i] - q, -step, step)) as Joints;
}
export const HOME_JOINTS = inverse(HOME).joints;
