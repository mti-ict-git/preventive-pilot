import importlib.util
import pathlib
import tempfile
import unittest
from unittest.mock import patch, Mock

spec = importlib.util.spec_from_file_location('share', pathlib.Path(__file__).parents[1] / 'deploy/check-share.py')
share = importlib.util.module_from_spec(spec)
spec.loader.exec_module(share)

class ShareChecks(unittest.TestCase):
    def test_mount_boundaries(self):
        with tempfile.TemporaryDirectory() as directory:
            target = str(pathlib.Path(directory).resolve())
            config = {'services': {'api': {'environment': {'CIFS_SHARE_PATH': '//server/evidence'}, 'volumes': [{'type': 'bind', 'source': target, 'target': '/app/shared-documents'}]}}}
            entry = {'fstype': 'cifs', 'source': '//server/evidence', 'target': target}
            with patch.object(share.platform, 'system', return_value='Linux'), patch.object(share, 'filesystem') as find, patch.object(share.subprocess, 'run') as run:
                find.return_value = None
                with self.assertRaisesRegex(RuntimeError, 'not mounted'): share.check(config, '--check')
                run.assert_not_called()
                find.return_value = {**entry, 'source': '//wrong/share'}
                with self.assertRaisesRegex(RuntimeError, 'differs'): share.check(config, '--deploy')
                run.assert_not_called()
                find.side_effect = [None, entry, entry]
                run.return_value = Mock(returncode=0)
                share.check(config, '--deploy')
                self.assertEqual(list(pathlib.Path(directory).iterdir()), [])
                self.assertIn(target, run.call_args.args[0])
                find.side_effect = [None, entry]
                run.return_value = Mock(returncode=1)
                with self.assertRaisesRegex(RuntimeError, 'Mount failed'): share.check(config, '--deploy')
                find.side_effect = None
                find.return_value = entry
                with patch.object(share.tempfile, 'NamedTemporaryFile', side_effect=PermissionError):
                    with self.assertRaises(PermissionError): share.check(config, '--deploy')

if __name__ == '__main__': unittest.main()
