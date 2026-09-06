import {
  add,
  clamp,
  cross,
  dot,
  forward,
  HOME,
  HOME_JOINTS,
  inverse,
  length,
  scale,
  stepJoints,
  sub,
  unit,
  type Joints,
  type Vec3,
} from './kinematics.ts';

export type Landmark = {
  x: number;
  y: number;
  z: number;
  visibility?: number;
  presence?: number;
};
export type PoseFrame = {
  landmarks: Landmark[];
  world: Landmark[];
  capturedAt: number;
  inferenceMs: number | null;
};
// Both shoulders and the controlling arm's elbow and wrist.
export const REQUIRED = [11, 12, 14, 16] as const;
export const MAX_AGE_MS = 300;
export const MIN_VISIBILITY = 0.65;
export const MAX_TRAIL_POINTS = 160;
const vec = (p: Landmark): Vec3 => [p.x, p.y, p.z];

/** Express the right wrist in shoulder-span units, relative to the right shoulder.
 * x = anatomical right, y = camera up projected perpendicular to x, z = x cross y.
 * This needs no torso landmarks, but assumes an upright operator and level camera;
 * shoulder yaw is compensated, while torso pitch cannot be recovered from two points.
 * No metric camera calibration is implied.
 */
export function bodyWrist(
  frame: PoseFrame,
): { wrist: Vec3; visibility: number } | null {
  if (
    !REQUIRED.every(
      (i) =>
        frame.world[i] &&
        frame.landmarks[i] &&
        [...vec(frame.world[i]), ...vec(frame.landmarks[i])].every(
          Number.isFinite,
        ) &&
        frame.landmarks[i].x >= 0 &&
        frame.landmarks[i].x <= 1 &&
        frame.landmarks[i].y >= 0 &&
        frame.landmarks[i].y <= 1,
    )
  )
    return null;
  const visibility = Math.min(
    ...REQUIRED.map((i) =>
      Math.min(
        frame.landmarks[i].visibility ?? 0,
        frame.landmarks[i].presence ?? 1,
      ),
    ),
  );
  if (
    !Number.isFinite(visibility) ||
    visibility < MIN_VISIBILITY ||
    visibility > 1
  )
    return null;
  const [left, right] = [11, 12].map((i) => vec(frame.world[i]));
  const shoulder = sub(right, left);
  const span = length(shoulder);
  if (span < 0.08 || span > 1.0) return null;
  const x = unit(shoulder)!;
  const cameraUp: Vec3 = [0, -1, 0];
  const up = sub(cameraUp, scale(x, dot(cameraUp, x)));
  // Avoid an unstable frame when the shoulder line is almost vertical.
  if (length(up) < 0.2) return null;
  const y = unit(up)!;
  const z = cross(x, y);
  const relative = sub(vec(frame.world[16]), right);
  return {
    wrist: [
      dot(relative, x) / span,
      dot(relative, y) / span,
      dot(relative, z) / span,
    ],
    visibility,
  };
}

/** Pure control state. All times are monotonic milliseconds supplied by the caller. */
export class TeleopController {
  joints: Joints = [...HOME_JOINTS];
  target: Vec3 = [...HOME];
  baseline: Vec3 | null = null;
  anchor: Vec3 = [...HOME];
  wrist: Vec3 | null = null;
  engaged = false;
  tracking = false;
  calibrating = false;
  samples: Vec3[] = [];
  visibility = 0;
  lastCapture = -Infinity;
  lastSeen = -Infinity;
  lastAccepted = -Infinity;
  limited = false;
  gain = 0.4;
  status = 'Choose a camera or sample motion.';
  arrivalTimes: number[] = [];
  inferenceTimes: number[] = [];
  trail: Vec3[] = [];

  ingest(frame: PoseFrame, now: number) {
    if (!Number.isFinite(frame.capturedAt) || frame.capturedAt <= this.lastSeen)
      return;
    this.lastSeen = frame.capturedAt;
    const observation = bodyWrist(frame);
    const age = now - frame.capturedAt;
    if (!observation || age < 0 || age > MAX_AGE_MS) {
      this.tracking = false;
      this.visibility = 0;
      if (this.calibrating) this.samples = [];
      this.hold(
        age > MAX_AGE_MS
          ? 'Tracking delayed. Engage again when ready.'
          : 'Keep both shoulders, your right elbow, and wrist in view. Stay upright.',
      );
      return;
    }
    const dt = clamp((frame.capturedAt - this.lastCapture) / 1000, 0.001, 0.15);
    this.lastCapture = frame.capturedAt;
    this.lastAccepted = now;
    this.wrist = observation.wrist;
    this.visibility = observation.visibility;
    this.tracking = true;
    this.arrivalTimes = [
      ...this.arrivalTimes.filter((t) => now - t < 1500),
      now,
    ];
    if (
      frame.inferenceMs !== null &&
      Number.isFinite(frame.inferenceMs) &&
      frame.inferenceMs >= 0
    )
      this.inferenceTimes = [
        ...this.inferenceTimes.slice(-119),
        frame.inferenceMs,
      ];
    if (this.calibrating) {
      this.samples.push(this.wrist);
      this.status = 'Hold your right hand still.';
      if (this.samples.length >= 30) {
        const mean = scale(
          this.samples.reduce((a, b) => add(a, b), [0, 0, 0] as Vec3),
          1 / this.samples.length,
        );
        const spread = Math.sqrt(
          this.samples.reduce(
            (total, p) => total + length(sub(p, mean)) ** 2,
            0,
          ) / this.samples.length,
        );
        if (spread > 0.09) {
          this.samples = [];
          this.status = 'Movement detected. Hold still to calibrate.';
          return;
        }
        this.baseline = mean;
        this.anchor = forward(this.joints)[2];
        this.target = [...this.anchor];
        this.calibrating = false;
        this.status = 'Calibrated. Engage to begin.';
      }
      return;
    }
    if (this.engaged && this.baseline) {
      const request = add(
        this.anchor,
        scale(sub(this.wrist, this.baseline), this.gain),
      );
      const bounded = inverse(request);
      this.limited = bounded.limited;
      const alpha = 1 - Math.exp(-dt / 0.12);
      this.target = add(
        this.target,
        scale(sub(bounded.target, this.target), alpha),
      );
      this.status = this.limited
        ? 'At workspace boundary.'
        : 'Following your right hand.';
    } else if (!this.baseline)
      this.status = 'Pose found. Hold still, then calibrate.';
  }
  fresh(now: number) {
    return this.tracking && now - this.lastCapture <= MAX_AGE_MS;
  }
  calibrate(now: number) {
    if (!this.fresh(now)) return false;
    this.engaged = false;
    this.baseline = null;
    this.calibrating = true;
    this.samples = [];
    this.limited = false;
    this.status = 'Hold your right hand still.';
    return true;
  }
  engage(now: number) {
    if (!this.baseline || !this.wrist || !this.fresh(now) || this.calibrating)
      return false;
    // Rebase at every clutch engagement so repositioning while held cannot jump the target.
    this.baseline = [...this.wrist];
    this.anchor = forward(this.joints)[2];
    this.target = [...this.anchor];
    this.engaged = true;
    this.status = 'Following your right hand.';
    return true;
  }
  hold(reason = 'Control held. Reposition, then engage again.') {
    this.engaged = false;
    this.calibrating = false;
    this.samples = [];
    this.limited = false;
    this.target = forward(this.joints)[2];
    this.status = reason;
  }
  tick(now: number, dt: number) {
    if (!this.fresh(now)) {
      this.tracking = false;
      if (this.engaged) this.hold('Tracking lost. Engage again when ready.');
      if (this.calibrating) this.samples = [];
    }
    if (this.engaged) {
      this.joints = stepJoints(this.joints, inverse(this.target).joints, dt);
      const end = forward(this.joints)[2];
      if (
        !this.trail.length ||
        length(sub(end, this.trail[this.trail.length - 1])) > 0.003
      )
        this.trail = [...this.trail.slice(-(MAX_TRAIL_POINTS - 1)), end];
    }
  }
  disconnect() {
    this.hold('Choose a camera or sample motion.');
    this.tracking = false;
    this.baseline = null;
    this.wrist = null;
    this.calibrating = false;
    this.samples = [];
    this.visibility = 0;
    this.lastCapture = -Infinity;
    this.lastSeen = -Infinity;
    this.arrivalTimes = [];
    this.inferenceTimes = [];
  }
  reset() {
    this.hold('Arm reset. Calibrate before engaging.');
    this.joints = [...HOME_JOINTS];
    this.target = [...HOME];
    this.baseline = null;
    this.calibrating = false;
    this.samples = [];
    this.trail = [];
  }
  metrics(now: number) {
    const recent = this.arrivalTimes.filter((t) => now - t < 1500);
    const fps =
      recent.length > 1
        ? ((recent.length - 1) * 1000) / (recent[recent.length - 1] - recent[0])
        : 0;
    const times = [...this.inferenceTimes].sort((a, b) => a - b);
    return {
      fps: this.fresh(now) ? fps : 0,
      p95: times.length ? times[Math.ceil(times.length * 0.95) - 1] : null,
      age: Number.isFinite(this.lastCapture)
        ? Math.max(0, now - this.lastCapture)
        : null,
    };
  }
}
