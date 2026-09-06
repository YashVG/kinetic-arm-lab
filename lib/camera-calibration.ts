export type CameraProfile = {
  version: 1;
  model: 'opencv-pinhole-5';
  name: string;
  width: number;
  height: number;
  cameraMatrix: number[][];
  distortion: number[];
  rmsPx: number;
  validationRmsPx: number;
  trainingViews: number;
  validationViews: number;
};

export function parseCameraProfile(value: unknown): CameraProfile {
  const p = value as CameraProfile;
  const finite = (x: unknown): x is number =>
    typeof x === 'number' && Number.isFinite(x);
  if (!p || p.version !== 1 || p.model !== 'opencv-pinhole-5')
    throw new Error(
      'Expected a Kinetic OpenCV pinhole camera profile (version 1).',
    );
  if (
    ![p.width, p.height].every(
      (x) => Number.isInteger(x) && x >= 32 && x <= 1920,
    ) ||
    p.width * p.height > 1920 * 1080
  )
    throw new Error(
      'Profile resolution must be between 32 pixels and 1920×1080. Use 640×480 for lower latency.',
    );
  const k = p.cameraMatrix;
  if (
    !Array.isArray(k) ||
    k.length !== 3 ||
    !k.every(
      (row) => Array.isArray(row) && row.length === 3 && row.every(finite),
    ) ||
    k[0][0] <= 0 ||
    k[1][1] <= 0 ||
    k[0][1] !== 0 ||
    k[1][0] !== 0 ||
    k[2][0] !== 0 ||
    k[2][1] !== 0 ||
    k[2][2] !== 1 ||
    k[0][2] < 0 ||
    k[0][2] >= p.width ||
    k[1][2] < 0 ||
    k[1][2] >= p.height
  )
    throw new Error(
      'Invalid camera matrix. Recalibrate with varied checkerboard views.',
    );
  if (
    !Array.isArray(p.distortion) ||
    p.distortion.length !== 5 ||
    !p.distortion.every((x) => finite(x) && Math.abs(x) < 1000)
  )
    throw new Error(
      'Expected five finite distortion coefficients: k1, k2, p1, p2, k3.',
    );
  if (
    ![p.rmsPx, p.validationRmsPx].every((x) => finite(x) && x >= 0) ||
    !Number.isInteger(p.trainingViews) ||
    p.trainingViews < 10 ||
    !Number.isInteger(p.validationViews) ||
    p.validationViews < 2
  )
    throw new Error(
      'Profile needs training and held-out reprojection errors (10+ training, 2+ validation views).',
    );
  return {
    ...p,
    name: typeof p.name === 'string' ? p.name.slice(0, 100) : 'Camera profile',
  };
}

export function assertProfileSize(
  p: CameraProfile,
  width: number,
  height: number,
) {
  if (p.width !== width || p.height !== height)
    throw new Error(
      `Profile is ${p.width}×${p.height}; camera is ${width}×${height}. Use the original camera and capture mode or recalibrate.`,
    );
}

/** OpenCV's 5-coefficient destination-to-source map, with newCameraMatrix = K.
 * Pixel coordinates are unmirrored; no resize, crop or estimated depth correction.
 */
export function sourcePixel(
  p: CameraProfile,
  u: number,
  v: number,
): [number, number] {
  const [[fx, , cx], [, fy, cy]] = p.cameraMatrix;
  const [k1, k2, p1, p2, k3] = p.distortion;
  const x = (u - cx) / fx,
    y = (v - cy) / fy;
  const r2 = x * x + y * y;
  const radial = 1 + k1 * r2 + k2 * r2 * r2 + k3 * r2 * r2 * r2;
  return [
    fx * (x * radial + 2 * p1 * x * y + p2 * (r2 + 2 * x * x)) + cx,
    fy * (y * radial + p1 * (r2 + 2 * y * y) + 2 * p2 * x * y) + cy,
  ];
}

export function buildMap(p: CameraProfile) {
  const map = new Float32Array(p.width * p.height * 2);
  for (let y = 0; y < p.height; y++)
    for (let x = 0; x < p.width; x++) {
      const i = (y * p.width + x) * 2;
      const point = sourcePixel(p, x, y);
      map[i] = point[0];
      map[i + 1] = point[1];
    }
  return map;
}

/** Bilinear sampling with a constant black border, matching cv.remap semantics.
 * OpenCV quantizes interpolation weights; sub-pixel color rounding can differ.
 */
export function remapRGBA(
  input: Uint8ClampedArray,
  output: Uint8ClampedArray,
  map: Float32Array,
  width: number,
  height: number,
) {
  for (let i = 0; i < width * height; i++) {
    const x = map[2 * i],
      y = map[2 * i + 1],
      ix = Math.floor(x),
      iy = Math.floor(y);
    const dx = x - ix,
      dy = y - iy,
      offset = 4 * i;
    output[offset + 3] = 255;
    if (
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      ix < -1 ||
      ix >= width ||
      iy < -1 ||
      iy >= height
    ) {
      output[offset] = output[offset + 1] = output[offset + 2] = 0;
      continue;
    }
    for (let c = 0; c < 3; c++) {
      const at = (xx: number, yy: number) =>
        xx < 0 || xx >= width || yy < 0 || yy >= height
          ? 0
          : input[(yy * width + xx) * 4 + c];
      output[offset + c] =
        at(ix, iy) * (1 - dx) * (1 - dy) +
        at(ix + 1, iy) * dx * (1 - dy) +
        at(ix, iy + 1) * (1 - dx) * dy +
        at(ix + 1, iy + 1) * dx * dy;
    }
  }
}

export function createCameraCorrector(
  p: CameraProfile,
  canvas: HTMLCanvasElement,
  original: HTMLCanvasElement,
) {
  canvas.width = original.width = p.width;
  canvas.height = original.height = p.height;
  const raw = original.getContext('2d', { willReadFrequently: true });
  const corrected = canvas.getContext('2d');
  if (!raw || !corrected)
    throw new Error('Camera correction needs canvas support.');
  const map = buildMap(p),
    result = corrected.createImageData(p.width, p.height);
  return (video: HTMLVideoElement) => {
    assertProfileSize(p, video.videoWidth, video.videoHeight);
    raw.drawImage(video, 0, 0);
    remapRGBA(
      raw.getImageData(0, 0, p.width, p.height).data,
      result.data,
      map,
      p.width,
      p.height,
    );
    corrected.putImageData(result, 0, 0);
    return canvas;
  };
}
