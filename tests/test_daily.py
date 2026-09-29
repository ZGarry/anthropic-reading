import importlib.util
import tempfile
import json
import unittest
from pathlib import Path
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('refresh',Path(__file__).resolve().parents[1]/'scripts/refresh_catalog.py')
refresh=importlib.util.module_from_spec(spec)
spec.loader.exec_module(refresh)

class DailyCheckTests(unittest.TestCase):
    def test_china_day_and_multiple_attempts(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);(root/'dist').mkdir()
            with patch.object(refresh,'DATA',root/'data'),patch.object(refresh,'DIST',root/'dist'):
                refresh.record_check({'checkedAt':'2026-09-29T17:00:00+00:00','status':'success','newIds':['old-but-newly-found'],'total':1})
                refresh.record_check({'checkedAt':'2026-09-29T18:00:00+00:00','status':'failed','newIds':[],'error':'source unavailable'})
                daily=json.loads((root/'data/checks/2026-09-30.json').read_text())
                summary=json.loads((root/'dist/checks.json').read_text())
                self.assertEqual(len(daily['attempts']),2)
                self.assertEqual(summary[0]['status'],'failed')
                self.assertEqual(summary[0]['newIds'],['old-but-newly-found'])

    def test_source_failure_preserves_catalogue(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);(root/'data').mkdir();(root/'dist').mkdir()
            existing='[{"id":"kept","sources":["Research"]}]'
            (root/'data/catalog.json').write_text(existing)
            (root/'dist/catalog.js').write_text('unchanged working catalogue')
            with patch.object(refresh,'DATA',root/'data'),patch.object(refresh,'DIST',root/'dist'),patch.object(refresh,'read_listing',side_effect=RuntimeError('source failed')):
                with self.assertRaises(RuntimeError):refresh.main()
            self.assertEqual((root/'data/catalog.json').read_text(),existing)
            self.assertEqual((root/'dist/catalog.js').read_text(),'unchanged working catalogue')

if __name__=='__main__':unittest.main()
