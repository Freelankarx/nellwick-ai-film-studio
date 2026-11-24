import unittest
from audio import normalise_segments


class AudioManifestTests(unittest.TestCase):
    def test_valid_american_voice(self):
        result = normalise_segments([{
            "id": "line-1", "speaker": "Grace",
            "text": "I thought you were coming home tonight.",
            "voice_id": "af_heart", "speed": 1.0,
        }])
        self.assertEqual(result[0]["language"], "a")
        self.assertEqual(result[0]["speaker"], "Grace")

    def test_valid_british_voice(self):
        result = normalise_segments([{
            "speaker": "Narrator", "text": "The house was quiet.", "voice_id": "bf_emma",
        }])
        self.assertEqual(result[0]["language"], "b")

    def test_unknown_voice_is_rejected(self):
        with self.assertRaises(ValueError):
            normalise_segments([{"text": "Do not run.", "voice_id": "unknown_voice"}])

    def test_invalid_speed_is_rejected(self):
        with self.assertRaises(ValueError):
            normalise_segments([{"text": "Too fast.", "voice_id": "af_heart", "speed": 2.0}])

    def test_empty_job_is_rejected(self):
        with self.assertRaises(ValueError):
            normalise_segments([])


if __name__ == "__main__":
    unittest.main()
