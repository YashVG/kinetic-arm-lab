import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  parseCameraProfile,
  assertProfileSize,
  sourcePixel,
  buildMap,
  remapRGBA,
} from '../lib/camera-calibration.ts';

const profile = {
  version: 1,
  model: 'opencv-pinhole-5',
  name: 'Synthetic test camera',
  width: 640,
  height: 480,
  cameraMatrix: [
    [620, 0, 320],
    [0, 610, 240],
    [0, 0, 1],
  ],
  distortion: [-0.18, 0.045, 0.001, -0.002, 0.005],
  rmsPx: 0.2,
  validationRmsPx: 0.3,
  trainingViews: 16,
  validationViews: 4,
};
void test('validates profiles and rejects unsupported models, invalid numbers, dimensions and missing validation', () => {
  assert.equal(parseCameraProfile(profile).width, 640);
  for (const patch of [
    { version: 2 },
    { width: 1e9 },
    { distortion: [0, 0] },
    { rmsPx: NaN },
    { validationViews: 0 },
    {
      cameraMatrix: [
        [0, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ],
    },
    { model: 'fisheye' },
  ])
    assert.throws(() => parseCameraProfile({ ...profile, ...patch }));
  assert.throws(() => parseCameraProfile(null));
});
void test('requires exact capture resolution', () => {
  const p = parseCameraProfile(profile);
  assert.doesNotThrow(() => assertProfileSize(p, 640, 480));
  assert.throws(() => assertProfileSize(p, 1280, 960));
  assert.throws(() => assertProfileSize(p, 480, 640));
});
void test('destination-to-source map matches independently generated OpenCV coordinates', () => {
  const reference = JSON.parse(
    readFileSync(
      new URL('./fixtures/opencv-map.json', import.meta.url),
      'utf8',
    ),
  );
  const p = parseCameraProfile(profile);
  for (const { u, v, x, y } of reference.points) {
    const point = sourcePixel(p, u, v);
    assert.ok(Math.abs(point[0] - x) < 0.00005);
    assert.ok(Math.abs(point[1] - y) < 0.00005);
  }
});
void test('zero-distortion image stays identical including corners, with opaque alpha', () => {
  const p = parseCameraProfile({
    ...profile,
    width: 32,
    height: 32,
    distortion: [0, 0, 0, 0, 0],
    cameraMatrix: [
      [30, 0, 16],
      [0, 30, 16],
      [0, 0, 1],
    ],
  });
  const input = Uint8ClampedArray.from({ length: 32 * 32 * 4 }, (_, i) =>
    i % 4 === 3 ? 255 : i % 251,
  );
  const output = new Uint8ClampedArray(input.length);
  remapRGBA(input, output, buildMap(p), 32, 32);
  assert.deepEqual(output, input);
});
void test('bilinear remap blends pixels and uses a black border', () => {
  const input = new Uint8ClampedArray([
    0, 0, 0, 255, 100, 100, 100, 255, 200, 200, 200, 255, 100, 100, 100, 255,
  ]);
  const output = new Uint8ClampedArray(16);
  remapRGBA(
    input,
    output,
    new Float32Array([0.5, 0.5, -0.5, 1, -100, 0, NaN, 0]),
    2,
    2,
  );
  assert.deepEqual(
    Array.from(output),
    [100, 100, 100, 255, 100, 100, 100, 255, 0, 0, 0, 255, 0, 0, 0, 255],
  );
});
