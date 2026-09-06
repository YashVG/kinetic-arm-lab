# Kinetic

Control a simulated robot arm with your webcam. Kinetic connects human pose estimation, coordinate transforms, and inverse kinematics to turn wrist movement into robot motion.

## How it works

```text
Webcam → pose landmarks → body-relative wrist motion
       → target position → inverse kinematics → robot arm
```

- **Pose estimation:** A pretrained MediaPipe Pose Landmarker Lite model estimates body landmarks locally in a worker.
- **Coordinate transforms:** Shoulder and hip landmarks define a body coordinate frame. Wrist displacement is normalized by shoulder width.
- **Motion control:** Neutral-pose calibration and a clutch let the operator reposition their hand. Exponential smoothing uses a 120 ms time constant.
- **Robot kinematics:** Analytic inverse kinematics computes base, shoulder, and elbow angles within a bounded workspace. Joint speed is limited to 90°/s.
- **Tracking loss:** Visibility below 0.65 or frames older than 300 ms hold the arm. Resuming requires explicit engagement.

Three.js renders the arm, target, and motion trail. Telemetry shows pose rate, inference latency, landmark visibility, and frame age.

The current system controls end-effector position in a three-joint simulation. Depth is inferred from a single camera; it is not a calibrated distance measurement.

Thirteen tests cover calibration, coordinate invariance, tracking loss, joint speed limits, and kinematics across 1,331 requested targets. Run them with `npm test`. The synthetic demo has been browser-tested; live webcam inference and performance remain unverified.

## Try it

Requires Node.js 22.13+ and Chrome or Edge with WebGL.

```sh
npm ci
npm start
```

Open [localhost:3000](http://localhost:3000), enable the camera, calibrate, and engage control. **Try sample motion** runs the control loop with synthetic landmarks.

[Demo guide](DEMO.md) · [Third-party notices](THIRD_PARTY.md)
