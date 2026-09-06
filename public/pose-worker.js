/* Classic worker: MediaPipe's WASM loader uses importScripts. */
/* global Vision */
let landmarker = null;
let initializing = false;
self.onmessage = async ({ data }) => {
  if (data.type === 'init' && !landmarker && !initializing) {
    initializing = true;
    try {
      importScripts('/vendor/mediapipe/vision_bundle.js');
      const files = await Vision.FilesetResolver.forVisionTasks(
        '/vendor/mediapipe/wasm',
      );
      let delegate = 'GPU';
      const create = (device) =>
        Vision.PoseLandmarker.createFromOptions(files, {
          baseOptions: {
            modelAssetPath: '/models/pose_landmarker_lite.task',
            delegate: device,
          },
          runningMode: 'VIDEO',
          numPoses: 1,
          minPoseDetectionConfidence: 0.6,
          minPosePresenceConfidence: 0.6,
          minTrackingConfidence: 0.6,
          outputSegmentationMasks: false,
        });
      try {
        landmarker = await create('GPU');
      } catch {
        delegate = 'CPU';
        landmarker = await create('CPU');
      }
      self.postMessage({ type: 'ready', delegate });
    } catch (error) {
      self.postMessage({
        type: 'error',
        message: String(error?.message || error),
      });
    } finally {
      initializing = false;
    }
  } else if (data.type === 'frame') {
    try {
      if (!landmarker) throw new Error('Pose model is not ready.');
      const start = performance.now();
      const result = landmarker.detectForVideo(data.bitmap, data.capturedAt);
      self.postMessage({
        type: 'result',
        landmarks: result.landmarks[0] || [],
        world: result.worldLandmarks[0] || [],
        capturedAt: data.capturedAt,
        inferenceMs: performance.now() - start,
      });
    } catch (error) {
      self.postMessage({
        type: 'error',
        message: String(error?.message || error),
      });
    } finally {
      data.bitmap?.close();
    }
  }
};
