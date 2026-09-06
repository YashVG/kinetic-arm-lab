import { useEffect, useRef, useState } from 'react';
import {
  MIN_VISIBILITY,
  REQUIRED,
  TeleopController,
  type Landmark,
  type PoseFrame,
} from '@/lib/controller';
import { samplePose } from '@/lib/sample-pose';
import { HOME, HOME_JOINTS, forward } from '@/lib/kinematics';
import type { SceneState } from '@/components/arm-scene';

import {
  parseCameraProfile,
  createCameraCorrector,
  type CameraProfile,
} from '@/lib/camera-calibration';

type Source = 'none' | 'camera' | 'sample';
const CONNECTIONS = [
  [11, 12],
  [12, 14],
  [14, 16],
];
function paint(
  canvas: HTMLCanvasElement | null,
  landmarks: Landmark[],
  width = 640,
  height = 480,
) {
  if (!canvas) return;
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, width, height);
  const visible = (i: number) => {
    const p = landmarks[i];
    return (
      p &&
      Number.isFinite(p.x) &&
      Number.isFinite(p.y) &&
      p.x >= 0 &&
      p.x <= 1 &&
      p.y >= 0 &&
      p.y <= 1 &&
      (p.visibility ?? 0) >= MIN_VISIBILITY &&
      (p.presence ?? 1) >= MIN_VISIBILITY
    );
  };
  ctx.lineWidth = width / 200;
  ctx.lineCap = 'round';
  for (const [a, b] of CONNECTIONS) {
    if (!visible(a) || !visible(b)) continue;
    ctx.strokeStyle = a === 12 || a === 14 ? '#b0f2ce' : '#98b2c3';
    ctx.beginPath();
    ctx.moveTo(landmarks[a].x * width, landmarks[a].y * height);
    ctx.lineTo(landmarks[b].x * width, landmarks[b].y * height);
    ctx.stroke();
  }
  for (const i of REQUIRED) {
    if (!visible(i)) continue;
    ctx.fillStyle = i === 16 ? '#ffffff' : '#b0f2ce';
    ctx.beginPath();
    ctx.arc(
      landmarks[i].x * width,
      landmarks[i].y * height,
      i === 16 ? width / 65 : width / 110,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
  if (visible(16)) {
    const p = landmarks[16];
    ctx.strokeStyle = '#b0f2ce';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(p.x * width, p.y * height, width / 33, 0, Math.PI * 2);
    ctx.stroke();
  }
}

export function useTeleop() {
  const engine = useRef(new TeleopController());
  const video = useRef<HTMLVideoElement>(null);
  const corrected = useRef<HTMLCanvasElement>(null);
  const original = useRef<HTMLCanvasElement>(null);
  const profileRef = useRef<CameraProfile | null>(null);
  const correctionRef = useRef(false);
  const [profile, setProfile] = useState<CameraProfile | null>(null);
  const [correction, setCorrection] = useState(false);
  const [correctionMs, setCorrectionMs] = useState<number | null>(null);
  const overlay = useRef<HTMLCanvasElement>(null);
  const scene = useRef<SceneState>({
    joints: [...HOME_JOINTS],
    target: [...HOME],
    trail: [],
    engaged: false,
  });
  const generation = useRef(0);
  const sourceRef = useRef<Source>('none');
  const cleanup = useRef<() => void>(() => {});
  const sampleEpoch = useRef(0);
  const dropoutUntil = useRef(0);
  const [source, setSource] = useState<Source>('none');
  const [loading, setLoading] = useState('');
  const [error, setError] = useState('');
  const [delegate, setDelegate] = useState('');
  const [snapshot, setSnapshot] = useState(() => ({
    engaged: false,
    tracking: false,
    calibrated: false,
    calibrating: false,
    progress: 0,
    status: 'Choose a camera or sample motion.',
    visibility: 0,
    limited: false,
    joints: [...HOME_JOINTS],
    end: [...HOME],
    target: [...HOME],
    fps: 0,
    p95: null as number | null,
    age: null as number | null,
  }));

  useEffect(() => {
    let frame = 0,
      last = performance.now(),
      lastUI = 0;
    const animate = (now: number) => {
      const c = engine.current;
      c.tick(now, (now - last) / 1000);
      last = now;
      scene.current = {
        joints: [...c.joints],
        target: [...c.target],
        trail: c.trail,
        engaged: c.engaged,
      };
      if (now - lastUI > 100) {
        lastUI = now;
        setSnapshot({
          engaged: c.engaged,
          tracking: c.fresh(now),
          calibrated: !!c.baseline,
          calibrating: c.calibrating,
          progress: Math.min((c.samples.length / 30) * 100, 100),
          status: c.status,
          visibility: c.visibility,
          limited: c.limited,
          joints: [...c.joints],
          end: [...forward(c.joints)[2]],
          target: [...c.target],
          ...c.metrics(now),
        });
      }
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    const hide = () => {
      if (document.hidden)
        engine.current.hold('Tab hidden. Engage again when ready.');
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape')
        engine.current.hold('Control held with Escape.');
    };
    document.addEventListener('visibilitychange', hide);
    window.addEventListener('keydown', key);
    return () => {
      cancelAnimationFrame(frame);
      // Invalidate the latest asynchronous source, including a pending camera request.
      // oxlint-disable-next-line react-hooks/exhaustive-deps
      generation.current++;
      // The active source can change after mount; release the latest session.
      // oxlint-disable-next-line react-hooks/exhaustive-deps
      cleanup.current();
      document.removeEventListener('visibilitychange', hide);
      window.removeEventListener('keydown', key);
    };
  }, []);

  function stop() {
    generation.current++;
    cleanup.current();
    cleanup.current = () => {};
    if (video.current) {
      video.current.pause();
      video.current.srcObject = null;
    }
    paint(overlay.current, []);
    engine.current.disconnect();
    sourceRef.current = 'none';
    setSource('none');
    setLoading('');
    setDelegate('');
    setCorrectionMs(null);
  }
  function loadProfile(value: unknown) {
    const parsed = parseCameraProfile(value);
    stop();
    profileRef.current = parsed;
    setProfile(parsed);
    correctionRef.current = true;
    setCorrection(true);
  }
  function toggleCorrection(enabled: boolean) {
    stop();
    correctionRef.current = enabled && !!profileRef.current;
    setCorrection(correctionRef.current);
  }
  function consume(frame: PoseFrame) {
    engine.current.ingest(frame, performance.now());
    paint(
      overlay.current,
      frame.landmarks,
      video.current?.videoWidth || 640,
      video.current?.videoHeight || 480,
    );
  }

  async function startCamera() {
    stop();
    setError('');
    setLoading('Loading pose model…');
    const id = generation.current;
    let stream: MediaStream | null = null;
    let worker: Worker | null = null;
    let animation = 0;
    let readyTimer: ReturnType<typeof setTimeout> | undefined;
    let cancelReady: (() => void) | null = null;
    const release = () => {
      cancelAnimationFrame(animation);
      if (readyTimer) clearTimeout(readyTimer);
      cancelReady?.();
      worker?.terminate();
      stream?.getTracks().forEach((t) => t.stop());
    };
    cleanup.current = release;
    try {
      if (!navigator.mediaDevices?.getUserMedia)
        throw new Error(
          'Camera access needs HTTPS or localhost. Open this page in Chrome or Edge.',
        );
      if (
        typeof Worker === 'undefined' ||
        typeof createImageBitmap === 'undefined'
      )
        throw new Error(
          'This browser is missing the camera processing APIs. Try Chrome or Edge.',
        );
      worker = new Worker('/pose-worker.js');
      let inFlight = false,
        lastSent = 0;
      await new Promise<void>((resolve, reject) => {
        cancelReady = () => reject(new Error('Camera startup cancelled.'));
        readyTimer = setTimeout(
          () =>
            reject(
              new Error(
                'Model loading timed out. Check your connection and try again.',
              ),
            ),
          45000,
        );
        worker!.onerror = () =>
          reject(
            new Error(
              'Pose tracking could not start in this browser. Try Chrome or Edge.',
            ),
          );
        worker!.onmessage = ({ data }) => {
          if (id !== generation.current) return;
          if (data.type === 'ready') {
            clearTimeout(readyTimer);
            cancelReady = null;
            setDelegate(data.delegate);
            resolve();
          } else if (data.type === 'error')
            reject(
              new Error(
                'The pose model could not load. Try Chrome or Edge with hardware acceleration enabled.',
              ),
            );
        };
        worker!.postMessage({ type: 'init' });
      });
      if (id !== generation.current) {
        release();
        return;
      }
      setLoading('Allow camera access…');
      const cameraProfile = correctionRef.current ? profileRef.current : null;
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          width: cameraProfile
            ? { exact: cameraProfile.width }
            : { ideal: 640 },
          height: cameraProfile
            ? { exact: cameraProfile.height }
            : { ideal: 480 },
          frameRate: { ideal: 24, max: 30 },
          facingMode: 'user',
        },
      });
      if (id !== generation.current) {
        release();
        return;
      }
      const camera = video.current;
      if (!camera)
        throw new Error('Camera view is unavailable. Reload and try again.');
      camera.srcObject = stream;
      await camera.play();
      if (id !== generation.current) {
        release();
        return;
      }
      const correctFrame =
        cameraProfile && corrected.current && original.current
          ? createCameraCorrector(
              cameraProfile,
              corrected.current,
              original.current,
            )
          : null;
      const fail = (message: string) => {
        if (id === generation.current) {
          stop();
          setError(message);
        }
      };
      stream
        .getVideoTracks()
        .forEach((track) =>
          track.addEventListener('ended', () =>
            fail(
              'The camera disconnected. Reconnect it and enable the camera again.',
            ),
          ),
        );
      worker.onmessage = ({ data }) => {
        if (id !== generation.current) return;
        inFlight = false;
        if (data.type === 'result') consume(data as PoseFrame);
        else if (data.type === 'error')
          fail('Pose tracking stopped. Enable the camera to try again.');
      };
      worker.onerror = () =>
        fail(
          'The pose tracker stopped unexpectedly. Enable the camera to restart it.',
        );
      sourceRef.current = 'camera';
      setSource('camera');
      setLoading('');
      let lastVideoTime = -1;
      const capture = (now: number) => {
        if (id !== generation.current) return;
        if (inFlight && now - lastSent > 5000) {
          fail('Pose tracking timed out. Enable the camera to restart it.');
          return;
        }
        animation = requestAnimationFrame(capture);
        if (
          document.hidden ||
          inFlight ||
          camera.readyState < 2 ||
          camera.currentTime === lastVideoTime ||
          now - lastSent < 45
        )
          return;
        inFlight = true;
        lastSent = now;
        lastVideoTime = camera.currentTime;
        const capturedAt = performance.now();
        let input: HTMLVideoElement | HTMLCanvasElement = camera;
        try {
          if (correctFrame) {
            const start = performance.now();
            input = correctFrame(camera);
            setCorrectionMs(performance.now() - start);
          }
        } catch (error) {
          fail(
            error instanceof Error
              ? error.message
              : 'Camera correction failed.',
          );
          return;
        }
        createImageBitmap(input)
          .then((bitmap) => {
            if (id !== generation.current) {
              bitmap.close();
              return;
            }
            try {
              worker!.postMessage({ type: 'frame', bitmap, capturedAt }, [
                bitmap,
              ]);
            } catch {
              bitmap.close();
              fail(
                'The camera frame could not be processed. Enable the camera to retry.',
              );
            }
          })
          .catch(() => {
            inFlight = false;
          });
      };
      animation = requestAnimationFrame(capture);
    } catch (e) {
      release();
      if (id !== generation.current) return;
      stop();
      const name = e instanceof Error ? e.name : '';
      setError(
        name === 'NotAllowedError'
          ? 'Camera permission was denied. Allow camera access in your browser, then try again.'
          : name === 'OverconstrainedError'
            ? 'Camera cannot provide this profile’s resolution. Disable lens correction or recalibrate in the supported capture mode.'
            : name === 'NotFoundError'
              ? 'No webcam was found. Connect one or try sample motion.'
              : name === 'NotReadableError'
                ? 'The webcam is busy. Close another app using it, then try again.'
                : e instanceof Error
                  ? e.message
                  : 'Camera startup failed. Please try again.',
      );
    }
  }

  function startSample() {
    stop();
    setError('');
    sourceRef.current = 'sample';
    setSource('sample');
    sampleEpoch.current = performance.now();
    dropoutUntil.current = 0;
    const c = engine.current;
    c.ingest(samplePose(0, sampleEpoch.current), sampleEpoch.current);
    c.calibrate(sampleEpoch.current);
    let autoEngage = true;
    const interval = setInterval(() => {
      if (document.hidden) return;
      const now = performance.now();
      const pose = samplePose((now - sampleEpoch.current) / 1000, now);
      if (now < dropoutUntil.current) {
        pose.landmarks = [];
        pose.world = [];
      }
      c.ingest(pose, now);
      paint(overlay.current, pose.landmarks);
      if (autoEngage && c.baseline && !c.calibrating) {
        autoEngage = false;
        c.engage(now);
      }
    }, 50);
    cleanup.current = () => clearInterval(interval);
  }
  function calibrate() {
    if (sourceRef.current === 'sample') {
      sampleEpoch.current = performance.now();
      const p = samplePose(0, sampleEpoch.current);
      engine.current.ingest(p, p.capturedAt);
    }
    engine.current.calibrate(performance.now());
  }
  function testLoss() {
    dropoutUntil.current = performance.now() + 2000;
    engine.current.ingest(
      {
        landmarks: [],
        world: [],
        capturedAt: performance.now(),
        inferenceMs: null,
      },
      performance.now(),
    );
    paint(overlay.current, []);
  }
  return {
    video,
    corrected,
    original,
    profile,
    correction,
    correctionMs,
    loadProfile,
    toggleCorrection,
    overlay,
    scene,
    source,
    loading,
    error,
    delegate,
    snapshot,
    startCamera,
    startSample,
    stop,
    calibrate,
    testLoss,
    engage: () => engine.current.engage(performance.now()),
    hold: () => engine.current.hold(),
    reset: () => engine.current.reset(),
  };
}
