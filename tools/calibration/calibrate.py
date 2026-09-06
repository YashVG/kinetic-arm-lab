"""Local checkerboard calibration; no images leave this computer."""
import argparse
import json
from pathlib import Path
import cv2 as cv
import numpy as np


def board_points(columns, rows, square_mm):
    points = np.zeros((columns * rows, 3), np.float32)
    points[:, :2] = np.mgrid[0:columns, 0:rows].T.reshape(-1, 2) * square_mm
    return points


def detect(image, board):
    gray = cv.cvtColor(image, cv.COLOR_BGR2GRAY)
    found, corners = cv.findChessboardCorners(gray, board)
    if not found:
        return None
    return cv.cornerSubPix(gray, corners, (11, 11), (-1, -1),
                           (cv.TERM_CRITERIA_EPS + cv.TERM_CRITERIA_MAX_ITER, 40, 0.001))


def solve(points, observations, size):
    if len(observations) < 12:
        raise ValueError('Need at least 12 detected views; aim for 20 varied views.')
    # Hold out every fifth view; its extrinsic pose is fitted, intrinsics stay fixed.
    held = list(range(4, len(observations), 5))
    train = [i for i in range(len(observations)) if i not in held]
    if len(train) < 10:
        raise ValueError('Need at least 10 training views plus held-out views.')
    rms, matrix, distortion, rotations, translations = cv.calibrateCamera(
        [points] * len(train), [observations[i] for i in train], size, None, None)
    errors = []
    for i, corners in enumerate(observations):
        if i in train:
            j = train.index(i)
            rotation, translation = rotations[j], translations[j]
        else:
            ok, rotation, translation = cv.solvePnP(points, corners, matrix, distortion)
            if not ok:
                raise ValueError('Could not estimate held-out board pose.')
        projected, _ = cv.projectPoints(points, rotation, translation, matrix, distortion)
        error = float(np.sqrt(np.mean(np.sum((projected - corners) ** 2, axis=2))))
        errors.append({'view': i + 1, 'split': 'validation' if i in held else 'training', 'rmsPx': error})
    values = np.concatenate([matrix.ravel(), distortion.ravel(), [rms]])
    if not np.isfinite(values).all() or min(matrix[0, 0], matrix[1, 1]) <= 0:
        raise ValueError('Calibration produced invalid parameters; capture more varied views.')
    return {
        'version': 1, 'model': 'opencv-pinhole-5', 'width': size[0], 'height': size[1],
        'cameraMatrix': matrix.tolist(), 'distortion': distortion.ravel().tolist(),
        'rmsPx': float(rms),
        'validationRmsPx': float(np.sqrt(np.mean([errors[i]['rmsPx'] ** 2 for i in held]))),
        'trainingViews': len(train), 'validationViews': len(held), 'perViewErrors': errors,
    }


def capture(args, folder):
    camera = cv.VideoCapture(args.camera)
    camera.set(cv.CAP_PROP_FRAME_WIDTH, args.width)
    camera.set(cv.CAP_PROP_FRAME_HEIGHT, args.height)
    if not camera.isOpened():
        raise ValueError('Cannot open camera. Close Kinetic camera first and allow camera access.')
    print('SPACE: save detected board. ENTER: finish. ESC: cancel. Move/tilt the board between captures.')
    count = 0
    try:
        while True:
            ok, frame = camera.read()
            if not ok:
                raise ValueError('Camera stopped returning frames.')
            corners = detect(frame, (args.columns, args.rows))
            display = frame.copy()
            if corners is not None:
                cv.drawChessboardCorners(display, (args.columns, args.rows), corners, True)
            cv.putText(display, f'{count} views | SPACE save | ENTER solve | ESC cancel', (10, 25),
                       cv.FONT_HERSHEY_SIMPLEX, 0.5, (0, 220, 0), 1)
            cv.imshow('Kinetic camera calibration', display)
            key = cv.waitKey(20) & 0xff
            if key == 27:
                raise ValueError('Capture cancelled; saved images remain local.')
            if key in (10, 13):
                break
            if key == 32 and corners is not None:
                count += 1
                if not cv.imwrite(str(folder / f'view-{count:03d}.png'), frame):
                    raise ValueError('Could not save camera frame.')
    finally:
        camera.release()
        cv.destroyAllWindows()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument('--camera', type=int, help='Camera index, usually 0')
    source.add_argument('--images', type=Path, help='Folder of existing checkerboard JPG/PNG images')
    parser.add_argument('--columns', type=int, default=9, help='Inner corners across (not squares)')
    parser.add_argument('--rows', type=int, default=6, help='Inner corners down')
    parser.add_argument('--square-mm', type=float, default=25)
    parser.add_argument('--width', type=int, default=640)
    parser.add_argument('--height', type=int, default=480)
    parser.add_argument('--name', default='Laptop webcam')
    parser.add_argument('--output', type=Path, default=Path('outputs/camera-calibration'))
    args = parser.parse_args()
    if not (3 <= args.columns <= 30 and 3 <= args.rows <= 30 and np.isfinite(args.square_mm) and args.square_mm > 0):
        parser.error('Use 3–30 inner corners in each direction and a positive square size.')
    if args.output.exists() and any(args.output.iterdir()):
        parser.error('Output folder is not empty. Choose a new --output folder to preserve prior captures.')
    args.output.mkdir(parents=True, exist_ok=True)
    try:
        folder = args.images
        if args.camera is not None:
            folder = args.output / 'captures'
            folder.mkdir()
            capture(args, folder)
        paths = sorted(p for p in folder.iterdir() if p.suffix.lower() in ('.png', '.jpg', '.jpeg'))
        observations, accepted, size = [], [], None
        for path in paths:
            frame = cv.imread(str(path))
            if frame is None:
                print(f'Skipping unreadable {path.name}')
                continue
            current_size = (frame.shape[1], frame.shape[0])
            if size is not None and size != current_size:
                raise ValueError('All images must have the same resolution and come from the same camera mode.')
            if min(current_size) < 32 or max(current_size) > 1920 or current_size[0] * current_size[1] > 1920 * 1080:
                raise ValueError('Use a resolution from 32 pixels up to 1920x1080; 640x480 is recommended.')
            size = current_size
            corners = detect(frame, (args.columns, args.rows))
            if corners is None:
                print(f'Skipping {path.name}: checkerboard not detected')
                continue
            observations.append(corners)
            accepted.append(path)
        result = solve(board_points(args.columns, args.rows, args.square_mm), observations, size)
        result.update({'name': args.name[:100], 'board': {'columns': args.columns, 'rows': args.rows,
                       'squareMm': args.square_mm}, 'opencvVersion': cv.__version__})
        for error, path in zip(result['perViewErrors'], accepted):
            error['file'] = path.name
        (args.output / 'camera-profile.json').write_text(json.dumps(result, indent=2, allow_nan=False) + '\n')
        frame = cv.imread(str(accepted[0]))
        matrix, dist = np.array(result['cameraMatrix']), np.array(result['distortion'])
        corrected = cv.undistort(frame, matrix, dist, None, matrix)
        comparison = np.hstack([frame, corrected])
        cv.putText(comparison, 'Original', (12, 25), cv.FONT_HERSHEY_SIMPLEX, 0.6, (0, 200, 0), 2)
        cv.putText(comparison, 'Undistorted (same K, no crop)', (size[0] + 12, 25), cv.FONT_HERSHEY_SIMPLEX, 0.6, (0, 200, 0), 2)
        cv.imwrite(str(args.output / 'comparison.jpg'), comparison)
        print(f'Training RMS: {result["rmsPx"]:.3f} px; held-out RMS: {result["validationRmsPx"]:.3f} px')
        print(f'Import {args.output / "camera-profile.json"} into Kinetic. Review comparison.jpg and per-view errors.')
        print('Low reprojection error alone does not validate tracking accuracy or calibration coverage.')
    except (ValueError, OSError, cv.error) as error:
        parser.exit(1, f'Calibration failed: {error}\n')


if __name__ == '__main__':
    main()
