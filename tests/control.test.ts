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
import { bodyWrist, MAX_AGE_MS, TeleopController } from '../lib/controller.ts';
import { samplePose } from '../lib/sample-pose.ts';

const near = (a: Vec3, b: Vec3, tolerance = 1e-8) =>
  assert.ok(
    length(sub(a, b)) < tolerance,
    'Expected vectors to agree: ' + JSON.stringify({ a, b }),
  );
function calibrated() {
  const c = new TeleopController();
  c.ingest(samplePose(0, 1000), 1000);
  assert.equal(c.calibrate(1000), true);
  for (let i = 1; i <= 30; i++)
    c.ingest(samplePose(0, 1000 + i * 50), 1000 + i * 50);
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
void test('body mapping is invariant to rigid rotation, translation, and uniform scale', () => {
  const frame = samplePose(0, 1000);
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
void test('a deterministic 20-second pose sequence moves the arm and stays bounded', () => {
  const c = calibrated();
  c.engage(2500);
  let maxTravel = 0;
  for (let i = 1; i <= 400; i++) {
    const now = 2500 + i * 50;
    c.ingest(samplePose(i * 0.05, now), now);
    const before: [number, number, number] = [...c.joints];
    c.tick(now, 0.05);
    for (let j = 0; j < 3; j++)
      assert.ok(Math.abs(c.joints[j] - before[j]) <= JOINT_SPEED * 0.05 + 1e-9);
    maxTravel = Math.max(maxTravel, length(sub(forward(c.joints)[2], HOME)));
  }
  assert.ok(maxTravel > 0.12);
  assert.ok(c.trail.length <= 160);
  assert.equal(c.metrics(22500).p95, null);
});
