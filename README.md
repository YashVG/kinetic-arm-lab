# Kinetic

Control a simulated robot arm with your webcam. Only both shoulders, your right elbow, and wrist need to be visible. Kinetic connects human pose estimation, coordinate transforms, and inverse kinematics to turn wrist movement into robot motion.

## How it works

```text
Webcam → pose landmarks → body-relative wrist motion
       → target position → inverse kinematics → robot arm
```

- **Pose estimation:** A pretrained MediaPipe Pose Landmarker Lite model estimates body landmarks locally in a worker.
- **Coordinate transforms:** The shoulder line and camera-up direction define local axes. Wrist displacement is measured from the right shoulder and normalized by shoulder width.
- **Motion control:** Neutral-pose calibration and a clutch let the operator reposition their hand. Exponential smoothing uses a 120 ms time constant.
- **Robot kinematics:** Analytic inverse kinematics computes base, shoulder, and elbow angles within a bounded workspace. Joint speed is limited to 90°/s.
- **Tracking loss:** Visibility below 0.65 or frames older than 300 ms hold the arm. Resuming requires explicit engagement.

Three.js renders the arm, target, and motion trail. Telemetry shows pose rate, inference latency, landmark visibility, and frame age.

Tests cover calibration with hips missing, coordinate transforms, tracking loss, joint speed limits, and kinematics across 1,331 requested targets. Run them with `npm test`.

## Assumptions and limitations

- **Operator:** Assumes one person facing a level camera, staying upright, with both shoulders, the right elbow, and wrist visible. Calibration requires a still hand.
- **Reference frame:** Vertical motion uses camera-up. Torso pitch is not tracked, so leaning forward can change the control input.
- **Depth and confidence:** Monocular depth is an estimate, not a calibrated distance measurement. Landmark visibility scores do not measure positional accuracy.
- **Robot scope:** Controls end-effector position in a three-joint simulation. Wrist orientation, force feedback, and physical robot integration are not implemented.
- **Learning:** Uses a fixed pretrained pose model. Calibration sets a neutral position; it does not train the model or improve it from camera data.
- **Validation:** Tests and the browser sample use synthetic landmarks. Live webcam accuracy, latency, and reliability remain unverified.

## Try it

Requires Node.js 22.13+ and Chrome or Edge with WebGL.

```sh
npm ci
npm start
```

Open [localhost:3000](http://localhost:3000), enable the camera, calibrate, and engage control. **Try sample motion** runs the control loop with synthetic landmarks.

[Demo guide](DEMO.md) · [Third-party notices](THIRD_PARTY.md) · [Automated checks](https://github.com/YashVG/kinetic-arm-lab/actions/workflows/ci.yml)

GitHub Actions runs the control/remapping tests, TypeScript and production build,
and synthetic OpenCV calibration tests on pushes and pull requests. These checks
do not establish live-camera accuracy or physical-robot safety.

## Camera calibration with OpenCV

Optional lens correction runs before pose inference. A local Python utility detects
checkerboard corners, estimates camera intrinsics and five distortion coefficients,
and exports a profile plus an original/undistorted comparison. Every fifth view is
held out from intrinsic fitting; both training and held-out reprojection RMS are reported.

In the website, expand **Lens correction** for profile import, error metrics, the
original feed, and per-frame correction time. Profiles remain in tab memory.
Changing correction settings stops control and requires a fresh neutral pose.

See the [camera calibration guide](public/camera-calibration-guide.html) (also linked
inside the running app) for capture commands and a printable checkerboard. Requires
Python 3.11+; the Python environment is separate from the website.

The browser uses a bilinear CPU remap of the OpenCV pinhole model, preserving the
original camera matrix and resolution without cropping. It does not load OpenCV.js.
Use the same camera, resolution, zoom and focus; mismatched resolutions are rejected.
Black borders can appear. Reprojection error measures checkerboard fit, not wrist
accuracy, and does not establish better tracking or metric monocular depth.

Verification: `npm test` checks the remap against OpenCV-generated coordinates,
identity images, border interpolation, invalid profiles and resolution mismatches.
Run `.venv-calibration/bin/python -m unittest discover -s tools/calibration` to check
checkerboard detection and recovery of known synthetic camera parameters. Physical
checkerboard calibration and live-camera accuracy improvements remain unmeasured.
