import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'node_modules/@mediapipe/tasks-vision');
const destination = path.join(root, 'public/vendor/mediapipe');
await fs.mkdir(destination, { recursive: true });
await fs.copyFile(
  path.join(source, 'vision_bundle.js'),
  path.join(destination, 'vision_bundle.js'),
);
await fs.cp(path.join(source, 'wasm'), path.join(destination, 'wasm'), {
  recursive: true,
});
await fs.mkdir(path.join(root, 'public/models'), { recursive: true });
const model = path.join(root, 'public/models/pose_landmarker_lite.task');
try {
  await fs.access(model);
} catch {
  const response = await fetch(
    'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
  );
  if (!response.ok)
    throw new Error(
      'Could not download the pinned Pose Landmarker model: ' + response.status,
    );
  const bytes = new Uint8Array(await response.arrayBuffer());
  await fs.writeFile(model, bytes);
}
const expected =
  '59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a';
const actual = createHash('sha256')
  .update(await fs.readFile(model))
  .digest('hex');
if (actual !== expected)
  throw new Error('The pose model checksum does not match the pinned model.');
console.log(
  'MediaPipe runtime and the pinned pose model are available locally.',
);
