import unittest
import cv2 as cv
import numpy as np
from calibrate import board_points, detect, solve


class CalibrationTests(unittest.TestCase):
    def test_recovers_synthetic_camera_and_held_out_error(self):
        points = board_points(9, 6, 25)
        matrix = np.array([[620., 0, 320], [0, 610, 240], [0, 0, 1]])
        distortion = np.array([-0.18, 0.045, 0.001, -0.002, 0.005])
        observations = []
        rng = np.random.default_rng(7)
        for i in range(20):
            rotation = rng.uniform(-0.4, 0.4, 3)
            translation = np.array([-100 + rng.uniform(-80, 80), -60 + rng.uniform(-60, 60), 500 + 15 * i])
            corners, _ = cv.projectPoints(points, rotation, translation, matrix, distortion)
            observations.append(corners.astype(np.float32))
        profile = solve(points, observations, (640, 480))
        np.testing.assert_allclose(profile['cameraMatrix'], matrix, atol=0.05)
        np.testing.assert_allclose(profile['distortion'], distortion, atol=0.01)
        self.assertLess(profile['validationRmsPx'], 0.001)
        self.assertEqual(profile['trainingViews'], 16)
        self.assertEqual(profile['validationViews'], 4)

    def test_rejects_insufficient_views(self):
        with self.assertRaises(ValueError):
            solve(board_points(9, 6, 25), [], (640, 480))

    def test_checkerboard_detection_and_blank_rejection(self):
        board = np.full((480, 640, 3), 255, np.uint8)
        for y in range(7):
            for x in range(10):
                if (x+y) % 2 == 0:
                    board[80+y*40:80+(y+1)*40, 100+x*40:100+(x+1)*40] = 0
        corners = detect(board, (9, 6))
        self.assertIsNotNone(corners)
        self.assertEqual(len(corners), 54)
        self.assertIsNone(detect(np.full_like(board, 255), (9, 6)))


if __name__ == '__main__':
    unittest.main()
