import tempfile
import unittest
import wave
from pathlib import Path

from lipsync import validate_talking_shot_duration, _audio_duration


class MuseTalkDurationTests(unittest.TestCase):
    def test_accepts_short_dialogue_line(self):
        self.assertEqual(validate_talking_shot_duration(8.5), 8.5)

    def test_rejects_audio_that_is_too_short(self):
        with self.assertRaises(ValueError):
            validate_talking_shot_duration(0.2)

    def test_rejects_full_episode_as_one_lipsync_job(self):
        with self.assertRaises(ValueError):
            validate_talking_shot_duration(480)

    def test_reads_wav_duration_without_model_dependencies(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "dialogue.wav"
            with wave.open(str(path), "wb") as wav:
                wav.setnchannels(1)
                wav.setsampwidth(2)
                wav.setframerate(16000)
                wav.writeframes(b"\x00\x00" * 16000 * 2)
            self.assertAlmostEqual(_audio_duration(path), 2.0, places=2)


if __name__ == "__main__":
    unittest.main()
