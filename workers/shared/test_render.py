import unittest
from render import _safe_name, _shift_srt, _srt_timestamp


class RenderHelperTests(unittest.TestCase):
    def test_safe_name_removes_path_and_unsafe_characters(self):
        self.assertEqual(_safe_name("../../Hello: Episode #1"), "Hello_Episode_1")

    def test_srt_timestamp_formats_milliseconds(self):
        self.assertEqual(_srt_timestamp(3661.234), "01:01:01,234")

    def test_shift_srt_offsets_and_reindexes(self):
        sample = "1\n00:00:00,000 --> 00:00:01,250\nHello there\n\n2\n00:00:01,300 --> 00:00:02,000\nHow are you?"
        shifted, last_index = _shift_srt(sample, 3.5, 4)
        self.assertIn("5\n00:00:03,500 --> 00:00:04,750\nHello there", shifted)
        self.assertIn("6\n00:00:04,800 --> 00:00:05,500\nHow are you?", shifted)
        self.assertEqual(last_index, 6)


if __name__ == "__main__":
    unittest.main()
