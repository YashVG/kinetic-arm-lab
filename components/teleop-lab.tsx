import { useState } from 'react';
import {
  ArrowUpRight,
  Camera,
  CameraOff,
  ChevronDown,
  CircleHelp,
  Crosshair,
  Hand,
  Move3D,
  Play,
  Radio,
  RotateCcw,
  Square,
  Unplug,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import ArmScene from '@/components/arm-scene';
import { useTeleop } from '@/hooks/use-teleop';
export default function TeleopLab() {
  const { video, overlay, corrected, original, scene, ...t } = useTeleop();
  const [profileError, setProfileError] = useState('');
  const s = t.snapshot;
  const active = t.source !== 'none';
  const stateLabel = s.engaged
    ? 'FOLLOWING'
    : s.calibrating
      ? 'CALIBRATING'
      : s.calibrated
        ? 'HELD'
        : 'IDLE';
  const number = (value: number | null, digits = 0) =>
    value === null ? '—' : value.toFixed(digits);
  const metrics = [
    ['Pose rate', active ? number(s.fps) : '—', 'fps'],
    ['Inference p95', t.source === 'camera' ? number(s.p95) : '—', 'ms'],
    [
      'Arm visibility',
      active && s.tracking ? number(s.visibility * 100) : '—',
      '%',
    ],
    ['Frame age', active ? number(s.age) : '—', 'ms'],
  ];
  return (
    <main className="lab">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Kinetic home">
          <Move3D size={25} />
          <span>
            KINETIC<span className="brand-dot">.</span>
          </span>
        </a>
        <span className="topbar-caption">ARM TELEOPERATION LAB</span>
        <span className="local-badge">
          <span />
          LOCAL INFERENCE
        </span>
      </header>
      <section className="intro">
        <div>
          <div className="eyebrow">PERCEPTION → CONTROL</div>
          <h1>
            Your movement.
            <br />
            <span>A robot’s next move.</span>
          </h1>
        </div>
        <p>
          Control a simulated arm with your webcam.
          <br />
          Track your pose, calibrate, then reach.
        </p>
      </section>
      <div className="workspace">
        <section className="simulation-panel">
          <div className="panel-heading">
            <span>
              <span className={'status-dot ' + (s.engaged ? 'on' : '')} /> ROBOT
              WORKSPACE
            </span>
            <span className="tag">3 JOINTS · SIMULATION</span>
          </div>
          <ArmScene state={scene} />
          <div className="scene-label">
            <span className="eyebrow">BASE COORDINATES</span>
            <span>
              <b className="axis-x">X</b> lateral <b className="axis-y">Y</b> up{' '}
              <b className="axis-z">Z</b> depth
            </span>
          </div>
          <div className={'scene-status ' + (s.engaged ? 'live' : '')}>
            {stateLabel}
          </div>
          <div className="scene-hint">Drag to orbit · Scroll to zoom</div>
          <div className="joint-readout">
            {['Base', 'Shoulder', 'Elbow'].map((label, i) => (
              <div key={label}>
                <span>{label}</span>
                <strong>
                  {((s.joints[i] * 180) / Math.PI).toFixed(1)}
                  <small>°</small>
                </strong>
              </div>
            ))}
          </div>
          <div className="robot-toolbar">
            <div>
              <span className={'status-dot ' + (s.engaged ? 'on' : '')} />
              {s.engaged ? 'Following right hand' : 'Holding position'}
            </div>
            <div className="toolbar-actions">
              <Button
                onClick={t.reset}
                variant="ghost"
                aria-label="Reset the simulated arm to its home pose"
              >
                <RotateCcw /> Reset arm
              </Button>
              <Button onClick={t.hold} variant="outline" disabled={!s.engaged}>
                <Square /> Hold <kbd>Esc</kbd>
              </Button>
            </div>
          </div>
        </section>
        <aside className="tracking-panel">
          <div className="panel-heading">
            <span>
              <Camera size={15} /> OPERATOR VIEW
            </span>
            <span
              className={'tag ' + (t.source === 'sample' ? 'sample-tag' : '')}
            >
              {t.source === 'camera'
                ? t.delegate + ' · ON DEVICE'
                : t.source === 'sample'
                  ? 'SYNTHETIC INPUT'
                  : 'CAMERA OFF'}
            </span>
          </div>
          <div className={'camera-preview ' + (active ? 'active-preview' : '')}>
            <video
              ref={video}
              className="camera-feed"
              autoPlay
              playsInline
              muted
              style={{
                visibility:
                  t.source === 'camera' && !t.correction ? 'visible' : 'hidden',
              }}
              aria-label="Mirrored webcam feed"
            />
            <canvas
              ref={corrected}
              className="camera-feed"
              style={{
                visibility:
                  t.source === 'camera' && t.correction ? 'visible' : 'hidden',
              }}
              aria-label="Undistorted webcam feed used for pose estimation"
            />
            <canvas
              ref={overlay}
              className="pose-overlay"
              aria-label="Tracked shoulders and right arm; highlighted right wrist"
            />
            {!active && (
              <div className="camera-empty">
                <div className="camera-icon">
                  <Hand size={32} strokeWidth={1.2} />
                </div>
                <h2>You are the input.</h2>
                <p>
                  Keep both shoulders, your right elbow,
                  <br />
                  and wrist in the camera frame.
                </p>
                <Button
                  className="primary-action"
                  onClick={() => void t.startCamera()}
                  disabled={!!t.loading}
                >
                  <Camera />
                  {t.loading || 'Enable camera'}
                </Button>
                {t.loading ? (
                  <Button onClick={t.stop} variant="ghost">
                    Cancel
                  </Button>
                ) : (
                  <Button onClick={t.startSample} variant="ghost">
                    Try sample motion <ArrowUpRight />
                  </Button>
                )}
              </div>
            )}
            {active && (
              <>
                <span className="camera-corner">
                  {t.source === 'sample'
                    ? 'SAMPLE · NO CAMERA'
                    : t.correction
                      ? 'UNDISTORTED · MIRRORED'
                      : 'RIGHT ARM · MIRRORED'}
                </span>
                <div className="camera-bottom">
                  <span className={'status-dot ' + (s.tracking ? 'on' : '')} />
                  {s.tracking ? 'Pose detected' : 'Waiting for a clear pose'}
                </div>
              </>
            )}
          </div>
          {t.error && (
            <p className="error-message" role="alert">
              {t.error}
            </p>
          )}
          <details className="lens-panel">
            <summary>
              Lens correction {t.profile ? '· Profile loaded' : '· Optional'}
            </summary>
            <p>
              Import a checkerboard camera profile. This is separate from the
              neutral-pose calibration.
            </p>
            <label className="profile-upload">
              Camera profile (.json)
              <input
                type="file"
                accept=".json,application/json"
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  if (!file) return;
                  try {
                    if (file.size > 100_000)
                      throw new Error('Profile is too large (maximum 100 KB).');
                    t.loadProfile(JSON.parse(await file.text()));
                    setProfileError('');
                  } catch (error) {
                    setProfileError(
                      error instanceof Error
                        ? error.message
                        : 'Could not load profile.',
                    );
                  }
                }}
              />
            </label>
            {profileError && (
              <p role="alert" className="error-message">
                {profileError}
              </p>
            )}
            {t.profile && (
              <>
                <p>
                  <strong>{t.profile.name}</strong> · {t.profile.width} ×{' '}
                  {t.profile.height}
                </p>
                <dl className="lens-metrics">
                  <div>
                    <dt>Training RMS</dt>
                    <dd>
                      {t.profile.rmsPx.toFixed(3)} px ·{' '}
                      {t.profile.trainingViews} views
                    </dd>
                  </div>
                  <div>
                    <dt>Held-out RMS</dt>
                    <dd>
                      {t.profile.validationRmsPx.toFixed(3)} px ·{' '}
                      {t.profile.validationViews} views
                    </dd>
                  </div>
                  <div>
                    <dt>Correction time</dt>
                    <dd>
                      {t.source === 'camera' && t.correctionMs !== null
                        ? t.correctionMs.toFixed(1) + ' ms / frame'
                        : '—'}
                    </dd>
                  </div>
                </dl>
                <label className="lens-toggle">
                  <input
                    type="checkbox"
                    checked={t.correction}
                    onChange={(event) =>
                      t.toggleCorrection(event.target.checked)
                    }
                  />{' '}
                  Correct lens distortion before pose estimation
                </label>
                <p>
                  Use the same camera, resolution, zoom and focus as
                  calibration. Changing this setting stops the camera; enable it
                  and calibrate your neutral pose again.
                </p>
                <p>
                  Reprojection error measures checkerboard fit, not wrist or
                  depth accuracy. Black borders are expected; no cropping is
                  applied.
                </p>
              </>
            )}
            <figure
              style={{
                display:
                  t.source === 'camera' && t.correction ? 'block' : 'none',
              }}
            >
              <canvas
                ref={original}
                className="original-comparison"
                aria-label="Original webcam image before lens correction"
              />
              <figcaption>
                Original · compare with the undistorted operator view above.
                Both views are mirrored.
              </figcaption>
            </figure>
            <a
              href="/camera-calibration-guide.html"
              target="_blank"
              rel="noreferrer"
            >
              Create a camera profile →
            </a>
          </details>
          {!active ? (
            <div className="tracking-instructions">
              <div>
                <span className="step-number">01</span>
                <span>Enable your webcam</span>
              </div>
              <div>
                <span className="step-number">02</span>
                <span>Hold still and calibrate</span>
              </div>
              <div>
                <span className="step-number">03</span>
                <span>Engage, then move your right hand</span>
              </div>
            </div>
          ) : (
            <div className="control-panel">
              <output
                className={
                  'control-status ' + (s.limited ? 'warning-text' : '')
                }
              >
                {s.status}
              </output>
              {s.calibrating && (
                <Progress
                  value={s.progress}
                  aria-label="Neutral pose calibration"
                  className="calibration-progress"
                />
              )}
              <div className="control-buttons">
                <Button
                  variant="outline"
                  onClick={t.calibrate}
                  disabled={!s.tracking || s.calibrating}
                >
                  <Crosshair />
                  {s.calibrated ? 'Recalibrate' : 'Calibrate'}
                </Button>
                <Button
                  onClick={s.engaged ? t.hold : t.engage}
                  disabled={
                    !s.engaged &&
                    (!s.calibrated || !s.tracking || s.calibrating)
                  }
                >
                  {s.engaged ? <Square /> : <Play />}
                  {s.engaged ? 'Hold control' : 'Engage control'}
                </Button>
              </div>
              <div className="source-controls">
                <Button variant="ghost" onClick={t.stop}>
                  <CameraOff />
                  {t.source === 'camera' ? 'Camera off' : 'Stop sample'}
                </Button>
                {t.source === 'sample' && (
                  <Button variant="ghost" onClick={t.testLoss}>
                    <Unplug /> Test tracking loss
                  </Button>
                )}
              </div>
            </div>
          )}
        </aside>
      </div>
      <section className="telemetry" aria-label="Tracking telemetry">
        <div className="telemetry-title">
          <Radio size={18} />
          <span>
            {t.source === 'sample' ? 'SAMPLE TELEMETRY' : 'LIVE TELEMETRY'}
          </span>
        </div>
        {metrics.map(([label, value, unit]) => (
          <div className="metric" key={label}>
            <span>{label}</span>
            <strong>
              {value}
              <small>{unit}</small>
            </strong>
          </div>
        ))}
      </section>
      <Collapsible className="pipeline">
        <CollapsibleTrigger className="pipeline-toggle">
          <span>
            <CircleHelp size={16} /> How the control works
          </span>
          <ChevronDown size={16} />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="pipeline-grid">
            <div>
              <span className="stage-number">01 / PERCEPTION</span>
              <h3>Estimate the body</h3>
              <p>
                MediaPipe’s pretrained Pose Landmarker estimates 33 landmarks.
                The highlighted point is your right wrist. Camera frames stay in
                this browser.
              </p>
            </div>
            <div>
              <span className="stage-number">02 / TRANSFORM</span>
              <h3>Find a body frame</h3>
              <p>
                Your shoulder line and camera-up direction define local axes.
                Keep the camera level and stay upright. Wrist displacement is
                normalized by shoulder width, then mapped from your neutral pose
                into the robot’s workspace.
              </p>
            </div>
            <div>
              <span className="stage-number">03 / CONTROL</span>
              <h3>Reach the target</h3>
              <p>
                A smoothing filter reduces jitter. Analytic inverse kinematics
                solves base, shoulder, and elbow angles. Motion is limited to
                90°/s per joint.
              </p>
            </div>
            <div>
              <span className="stage-number">04 / TRACKING LOSS</span>
              <h3>Hold, then re-engage</h3>
              <p>
                Low visibility or a frame older than 300 ms holds the arm.
                Re-engaging sets a new neutral point so repositioning does not
                cause a target jump.
              </p>
            </div>
          </div>
          <div className="scope-note">
            <strong>Prototype scope</strong>
            <span>
              Three simulated joints, end-effector position only. Monocular
              depth is an estimate. No wrist orientation, force feedback,
              hardware control, or custom-trained model. Sample mode uses
              synthetic landmarks and does not run ML.
            </span>
          </div>
        </CollapsibleContent>
      </Collapsible>
      <footer>
        <span>Position only · No physical robot connected</span>
        <span>Built for exploring perception, transforms, and control.</span>
      </footer>
    </main>
  );
}
