import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BASE_HEIGHT,
  FOREARM,
  forward,
  HOME,
  inverse,
  JOINT_SPEED,
  length,
  stepJoints,
  sub,
  UPPER_ARM,
  type Vec3,
} from '../lib/kinematics.ts';
import {
  bodyWrist,
  MAX_AGE_MS,
  REQUIRED,
  TeleopController,
  type Landmark,
} from '../lib/controller.ts';
import { samplePose } from '../lib/sample-pose.ts';

const near = (a: Vec3, b: Vec3, tolerance = 1e-8) =>
  assert.ok(
    length(sub(a, b)) < tolerance,
    'Expected vectors to agree: ' + JSON.stringify({ a, b }),
  );
function upperBodyPose(time: number, capturedAt: number) {
  const frame = samplePose(time, capturedAt);
  // A cropped observation can have no lower-body entries at all.
  frame.world = frame.world.slice(0, 17);
  frame.landmarks = frame.landmarks.slice(0, 17);
  return frame;
}
function calibrated(pose = samplePose) {
  const c = new TeleopController();
  c.ingest(pose(0, 1000), 1000);
  assert.equal(c.calibrate(1000), true);
  for (let i = 1; i <= 30; i++) c.ingest(pose(0, 1000 + i * 50), 1000 + i * 50);
  assert.ok(c.baseline);
  assert.equal(c.calibrating, false);
  return c;
}

void test('IK reaches its bounded target across 1,331 requested workspace points', () => {
  for (let i = 0; i <= 10; i++)
    for (let j = 0; j <= 10; j++)
      for (let k = 0; k <= 10; k++) {
        const request: Vec3 = [
          -0.2 + i * 0.12,
          -0.1 + j * 0.12,
          -0.7 + k * 0.14,
        ];
        const solution = inverse(request);
        const points = forward(solution.joints);
        near(points[2], solution.target);
        assert.ok(
          Math.abs(length(sub(points[1], points[0])) - UPPER_ARM) < 1e-9,
        );
        assert.ok(Math.abs(length(sub(points[2], points[1])) - FOREARM) < 1e-9);
        assert.ok(
          solution.target[0] >= 0.12 - 1e-9 && solution.target[0] <= 0.7 + 1e-9,
        );
        assert.ok(
          solution.target[1] >= 0.2 - 1e-9 && solution.target[1] <= 0.8 + 1e-9,
        );
        assert.ok(
          length(sub(solution.target, [0, BASE_HEIGHT, 0])) <=
            UPPER_ARM + FOREARM - 0.015 + 1e-9,
        );
        near(inverse(solution.target).target, solution.target);
      }
});
void test('invalid target values cannot produce joint commands', () => {
  for (const n of [NaN, Infinity, -Infinity])
    assert.throws(() => inverse([n, 0.4, 0.1]));
});
void test('joint slew never exceeds 90 degrees per second and never overshoots', () => {
  const current: Vec3 = [0, 0.5, -1];
  const goal: Vec3 = [2, -0.5, -0.995];
  for (const dt of [0.001, 0.016, 0.05, 5]) {
    const next = stepJoints(current, goal, dt);
    for (let i = 0; i < 3; i++) {
      assert.ok(
        Math.abs(next[i] - current[i]) <=
          JOINT_SPEED * Math.min(dt, 0.05) + 1e-9,
      );
      assert.ok(
        next[i] >= Math.min(current[i], goal[i]) &&
          next[i] <= Math.max(current[i], goal[i]),
      );
    }
  }
});
void test('shoulder mapping is invariant to yaw, translation, and uniform scale', () => {
  const frame = upperBodyPose(0, 1000);
  const expected = bodyWrist(frame)!.wrist;
  const angle = 0.83,
    co = Math.cos(angle),
    si = Math.sin(angle);
  const moved = {
    ...frame,
    world: frame.world.map((p) => ({
      ...p,
      x: 1.3 * (co * p.x - si * p.z) + 2,
      y: 1.3 * p.y - 3,
      z: 1.3 * (si * p.x + co * p.z) + 1,
    })),
  };
  near(bodyWrist(moved)!.wrist, expected);
});
void test('missing or unreliable hips and other unused landmarks do not affect control input', () => {
  const frame = samplePose(0, 1000);
  const expected = bodyWrist(frame)!;
  const cropped = bodyWrist(upperBodyPose(0, 1000))!;
  near(cropped.wrist, expected.wrist);
  assert.equal(cropped.visibility, expected.visibility);

  // The model may hallucinate unseen landmarks, or emit non-finite values for them.
  for (let i = 0; i < frame.world.length; i++) {
    if (REQUIRED.some((required) => required === i)) continue;
    frame.world[i] = { x: NaN, y: Infinity, z: -Infinity };
    frame.landmarks[i] = {
      x: NaN,
      y: 2,
      z: Infinity,
      visibility: 0,
      presence: 0,
    };
  }
  const observation = bodyWrist(frame)!;
  near(observation.wrist, expected.wrist);
  assert.equal(observation.visibility, expected.visibility);
});
void test('lateral, upward, and depth wrist movement keep their control directions without hips', () => {
  const initial = bodyWrist(upperBodyPose(0, 1000))!.wrist;
  // With an upright, front-facing pose, anatomical right and camera up are -x and -y.
  for (const [axis, key, displacement] of [
    [0, 'x', -0.09],
    [1, 'y', -0.09],
    [2, 'z', 0.09],
  ] as const) {
    const frame = upperBodyPose(0, 1000);
    frame.world[16][key] += displacement;
    const delta = sub(bodyWrist(frame)!.wrist, initial);
    const expected: Vec3 = [0, 0, 0];
    expected[axis] = 0.25; // 9 cm divided by the fixture's 36 cm shoulder span.
    near(delta, expected);
  }
});
void test('each shoulder, right elbow, and wrist must be visible and inside the camera frame', () => {
  for (const index of REQUIRED) {
    for (const missing of ['world', 'landmarks'] as const) {
      const frame = upperBodyPose(0, 1000);
      const sparse: Landmark[] = [];
      for (const [i, landmark] of frame[missing].entries())
        if (i !== index) sparse[i] = landmark;
      frame[missing] = sparse;
      assert.equal(bodyWrist(frame), null);
    }
    for (const change of [
      { visibility: 0.2 },
      { presence: 0.2 },
      { x: -0.01 },
      { x: 1.01 },
      { y: -0.01 },
      { y: 1.01 },
    ]) {
      const frame = upperBodyPose(0, 1000);
      Object.assign(frame.landmarks[index], change);
      assert.equal(bodyWrist(frame), null);
    }
  }
});
void test('an almost vertical shoulder line is rejected instead of producing unstable axes', () => {
  const c = calibrated(upperBodyPose);
  assert.equal(c.engage(2500), true);
  const before = [...c.joints] as Vec3;
  for (const dx of [-0.01, 0, 0.01]) {
    const frame = upperBodyPose(0, 2600 + dx * 1000);
    frame.world[12] = {
      ...frame.world[11],
      x: frame.world[11].x + dx,
      y: frame.world[11].y + 0.36,
    };
    assert.equal(bodyWrist(frame), null);
    c.ingest(frame, frame.capturedAt);
    c.tick(frame.capturedAt, 0.05);
    assert.equal(c.engaged, false);
    near(c.joints, before);
  }
});
void test('occluded, missing, non-finite, and degenerate body observations are rejected', () => {
  const occluded = samplePose(0, 1000);
  occluded.landmarks[16].visibility = 0.2;
  assert.equal(bodyWrist(occluded), null);
  assert.equal(bodyWrist({ ...samplePose(0, 1000), world: [] }), null);
  const bad = samplePose(0, 1000);
  bad.world[14].x = NaN;
  assert.equal(bodyWrist(bad), null);
  const degenerate = samplePose(0, 1000);
  degenerate.world[12] = { ...degenerate.world[11] };
  assert.equal(bodyWrist(degenerate), null);
});
void test('calibration requires stable observations and resets for a moving arm', () => {
  const c = new TeleopController();
  c.ingest(samplePose(0, 1000), 1000);
  c.calibrate(1000);
  for (let i = 1; i <= 30; i++) {
    const p = samplePose(0, 1000 + i * 50);
    p.world[16].x += i % 2 ? -0.2 : 0.2;
    c.ingest(p, p.capturedAt);
  }
  assert.equal(c.baseline, null);
  assert.equal(c.samples.length, 0);
  assert.match(c.status, /Movement/);
});
void test('clutch re-engagement rebases the hand without jumping the robot target', () => {
  const c = calibrated();
  assert.equal(c.engage(2500), true);
  near(c.target, HOME);
  c.hold();
  c.ingest(samplePose(8, 2550), 2550);
  const end = forward(c.joints)[2];
  assert.equal(c.engage(2550), true);
  near(c.target, end);
  c.ingest(samplePose(8, 2600), 2600);
  near(c.target, end);
});
void test('tracking loss freezes every joint and recovery needs explicit engagement', () => {
  const c = calibrated();
  c.engage(2500);
  c.ingest(samplePose(7, 2550), 2550);
  c.tick(2550, 0.05);
  const held: [number, number, number] = [...c.joints];
  const lost = samplePose(7, 2600);
  lost.landmarks[16].visibility = 0.1;
  c.ingest(lost, 2600);
  for (let i = 0; i < 30; i++) c.tick(2600 + i * 50, 0.05);
  near(c.joints, held);
  assert.equal(c.engaged, false);
  c.ingest(samplePose(9, 4200), 4200);
  assert.equal(c.tracking, true);
  assert.equal(c.engaged, false);
});
void test('stale input holds the arm even when no new inference result arrives', () => {
  const c = calibrated();
  c.engage(2500);
  c.tick(2500 + MAX_AGE_MS + 1, 0.05);
  assert.equal(c.engaged, false);
  assert.equal(c.tracking, false);
  assert.equal(c.engage(2900), false);
});
void test('out-of-order observations cannot overwrite the current target', () => {
  const c = calibrated();
  c.engage(2500);
  c.ingest(samplePose(6, 2600), 2600);
  const target: [number, number, number] = [...c.target];
  c.ingest(samplePose(14, 2550), 2600);
  near(c.target, target);
});
void test('delayed inference results cannot re-enable motion', () => {
  const c = calibrated();
  c.engage(2500);
  c.ingest(samplePose(7, 2550), 3000);
  assert.equal(c.engaged, false);
  assert.equal(c.tracking, false);
});
void test('hold cancels an in-progress calibration', () => {
  const c = new TeleopController();
  c.ingest(samplePose(0, 1000), 1000);
  c.calibrate(1000);
  c.hold();
  assert.equal(c.calibrating, false);
});
void test('calibration and 20 seconds of bounded control work with hips missing throughout', () => {
  const c = calibrated(upperBodyPose);
  assert.equal(c.engage(2500), true);
  let maxTravel = 0;
  for (let i = 1; i <= 400; i++) {
    const now = 2500 + i * 50;
    c.ingest(upperBodyPose(i * 0.05, now), now);
    const before: [number, number, number] = [...c.joints];
    c.tick(now, 0.05);
    for (let j = 0; j < 3; j++)
      assert.ok(Math.abs(c.joints[j] - before[j]) <= JOINT_SPEED * 0.05 + 1e-9);
    maxTravel = Math.max(maxTravel, length(sub(forward(c.joints)[2], HOME)));
  }
  assert.ok(maxTravel > 0.12);
  assert.equal(c.tracking, true);
  assert.equal(c.engaged, true);
  assert.ok(c.trail.length <= 160);
  assert.equal(c.metrics(22500).p95, null);
});
