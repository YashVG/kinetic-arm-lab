# Demonstrate Kinetic

The useful claim is: “I integrated pretrained pose estimation with body coordinate transforms, calibration, inverse kinematics, tracking-loss handling, and telemetry.” Be ready to explain and modify each step. Do not claim to have trained the pose model or achieved precise six-DOF tracking.

## Two-minute walkthrough

1. Enable the webcam and frame your shoulders, hips, and right arm. Explain that image landmarks draw the overlay, while inferred world landmarks feed the controller.
2. Hold still and calibrate. Thirty valid observations must have a normalized RMS spread of at most 0.09 shoulder spans.
3. Engage control and reach sideways, up, and in depth. Explain that depth is the least reliable direction with a single RGB camera.
4. Hold, reposition your hand, then engage again. The controller redefines the neutral hand position at the current robot endpoint.
5. Hide your wrist. Verify that joint motion stops and does not resume automatically when your wrist returns.
6. Open **How the control works**. Trace a wrist position through the body frame, filter, workspace bounds, inverse kinematics, and speed limit.

If you use **sample motion**, say explicitly that the input is synthetic and bypasses model inference.

## Measure before presenting

Record the laptop, browser, light level, and camera placement. After warm-up, observe pose rate, inference p95, and frame age for 60 seconds. Compare a stationary hand, deliberate movement, and partial occlusion. Repeat with a second person.

The displayed visibility value is the minimum required landmark visibility/presence score, not physical accuracy. Inference p95 uses the latest 120 valid-pose results; it excludes camera exposure and display latency. Frame age starts when the app captures an image for inference. No measured camera performance is claimed yet.

## Where this fits the club

The closest fit is the **Operator Hand Motion Tracking System**. A subsequent contribution could compare camera estimates against a reference tracker, add hand orientation, or fuse additional sensors. The simulated arm also demonstrates a small part of the **Robot 6DOF Arm** team’s inverse-kinematics work. Real ROS 2 integration should wait for the team’s robot model, frame conventions, joint limits, and control interface.
