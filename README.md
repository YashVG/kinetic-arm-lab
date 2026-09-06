# Kinetic — Arm Teleoperation Lab

Use webcam pose estimation to control the position of a simulated robot arm. Built as a small perception-to-control project for a university robotics software team.

The club’s [Haptic Exoskeleton and Teleoperated Robot Arm proposal](https://docs.google.com/document/d/1Hh4xdT5gJDzg3a_FM85K4VE34kCcIacLYuR_FwNp8EM/edit) identifies ML pose estimation, coordinate transformations, inverse kinematics, and telemetry as relevant software work. This prototype connects those pieces without requiring robot hardware.

## Run locally

This is a standalone React + Vite app. It runs on localhost with no ChatGPT login, hosting account, or API key. The pose model, runtime, and fonts are served from this project.

Requires Node.js 22.13+ and npm. Use Chrome or Edge with WebGL enabled.

```sh
npm ci
npm start
```

Open [localhost:3000](http://localhost:3000). `npm start` checks the local model assets and starts Vite; `npm run dev` does the same. Leave the terminal running and press Ctrl+C to stop it. After dependencies are installed, startup does not need internet access while the bundled assets are present.

Select **Enable camera**, allow access, and keep your shoulders, hips, and right arm visible. Hold still and select **Calibrate**. Then select **Engage control** and move your right hand. **Hold** or **Escape** stops following. Re-engaging rebases the input at the current hand position.

**Try sample motion** runs synthetic landmarks through the same transform and control logic. It automatically calibrates, then moves. **Test tracking loss** removes input for two seconds; the arm must remain held after input returns until you engage again. This mode does not run ML or measure inference performance.

## How it works

```text
Webcam → MediaPipe worker → body-relative wrist displacement
       → calibration + smoothing → bounded target → analytic IK
       → joint speed limit → Three.js simulation + telemetry
```

- `public/pose-worker.js`: pretrained MediaPipe Pose Landmarker Lite v1; one frame in flight, GPU with CPU fallback. Assets are served locally. The app does not upload or save camera frames.
- `index.html` and `app/main.tsx`: the browser entry point. Vite serves files and reloads the app during development; there is no application backend.
- `lib/controller.ts`: right-shoulder origin; orthonormal axes from shoulders and hips; shoulder-width normalization; calibration; a 120 ms smoothing time constant; tracking gates and a clutch.
- `lib/kinematics.ts`: base yaw and a two-link planar solution; bounded workspace; maximum joint speed of 90°/s.
- `hooks/use-teleop.ts`: camera lifecycle, timestamps, sample input, and telemetry. Visibility below 0.65 or frame age above 300 ms holds the arm.

## Verify

```sh
npm test
npm run typecheck
npm run lint
npm run build
```

The production build creates a static `dist/` folder. Run `npm run preview` to serve that build at [localhost:4173](http://localhost:4173).

Thirteen control tests cover 1,331 requested targets, rigid-transform invariance, calibration, occlusion, stale and reordered frames, re-engagement, and joint speed limits. Lint checks application code; unmodified generated UI primitives and vendor runtimes are excluded.

The localhost app and synthetic sample start/stop flow have been checked in a browser, including the robot animation and motion trail, with no console warnings or errors. Live webcam inference and performance on the user’s laptop have **not yet been verified**. Follow the [demo guide](DEMO.md) to collect that evidence.

## Boundaries

This is a **three-joint, position-only simulation** using a pretrained model. Monocular depth is inferred, not calibrated metric measurement. It does not implement wrist orientation, six-DOF manipulation, sensor fusion, force feedback, ROS 2, collision checking, or hardware control. It is not a haptic control loop.

See [MediaPipe’s documentation](https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker) and [third-party notices](THIRD_PARTY.md).
