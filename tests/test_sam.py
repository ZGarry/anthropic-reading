import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

SCRIPTS = Path(__file__).resolve().parents[1] / 'scripts'
sys.path.insert(0, str(SCRIPTS))
spec = importlib.util.spec_from_file_location('sam', SCRIPTS / 'refresh_sam.py')
sam = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sam)


def post(id='123', title='How To Be Successful', slug='success', timestamp='1548363667'):
    return f'<article class="post"><div class="post-title"><h2><a href="/{slug}">{title}</a></h2></div><div class="post-body" id="post_body_{id}"></div><footer><span data-unix-time="{timestamp}"></span></footer></article>'


class SamTests(unittest.TestCase):
    def test_source_timestamp_and_stable_id(self):
        a = sam.parse_page(post())[0]
        self.assertEqual(a['id'], 'sam-post-123')
        self.assertEqual(a['date'], '2019-01-24')
        self.assertIn('career', a['categories'])
        self.assertEqual(sam.parse_page(post(slug='renamed'))[0]['id'], a['id'])

    def test_malformed_post_and_foreign_link_rejected(self):
        with self.assertRaises(ValueError): sam.parse_page(post(timestamp='not-a-date'))
        with self.assertRaises(ValueError): sam.parse_page(post().replace('href="/success"', 'href="https://example.org/post"'))
        with self.assertRaises(ValueError): sam.parse_page(post().replace('data-unix-time', 'missing-date'))

    def test_baseline_and_late_old_post_preserve_ids(self):
        original = sam.parse_page(post())
        first, _, _ = sam.merge_catalog([], original, '2026-10-13')
        self.assertNotIn('addedOn', first[0])
        newer_url = sam.parse_page(post(slug='new-url'))
        early = sam.parse_page(post(id='122', title='AI', slug='early', timestamp='1362441600'))
        result, new, changed = sam.merge_catalog(first, newer_url + early, '2026-10-14')
        self.assertEqual(result[1]['id'], 'sam-post-123')
        self.assertEqual(result[0]['addedOn'], '2026-10-14')
        self.assertEqual(new, ['sam-post-122'])
        self.assertEqual(changed, ['sam-post-123'])
        self.assertTrue(all(not a['defaultRead'] for a in result))

    def test_failure_does_not_replace_working_catalogue(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); (root/'data').mkdir(); (root/'dist').mkdir()
            (root/'data/catalog.json').write_text('[]')
            (root/'dist/catalog.js').write_text('working catalogue')
            with patch.object(sam, 'DATA', root/'data'), patch.object(sam, 'DIST', root/'dist'), patch.object(sam, 'collect', side_effect=RuntimeError('timeout')):
                with self.assertRaises(RuntimeError): sam.main()
            self.assertEqual((root/'dist/catalog.js').read_text(), 'working catalogue')

    def test_shrink_is_rejected_and_removed_post_retained(self):
        old = sam.parse_page(post())
        with self.assertRaises(ValueError): sam.merge_catalog(old, [], '2026-10-14')
        other = sam.parse_page(post(id='124', slug='other'))
        articles, _, _ = sam.merge_catalog(old, other, '2026-10-14')
        self.assertEqual({a['id'] for a in articles}, {'sam-post-123','sam-post-124'})

    def test_incomplete_pagination_cannot_silently_drop_posts(self):
        html = post() + '<div class="pagination"><a href="/?page=2">Last</a></div>'
        with patch.object(sam, 'fetch', return_value=html):
            with self.assertRaises(ValueError): sam.collect()

    def test_published_catalogue_has_unique_safe_ids_and_complete_numbering(self):
        articles = json.loads((SCRIPTS.parent/'data/sam/catalog.json').read_text(encoding='utf8'))
        self.assertGreaterEqual(len(articles), 121)
        self.assertEqual(len(articles), len({a['id'] for a in articles}))
        self.assertEqual(len(articles), len({a['url'] for a in articles}))
        self.assertTrue(all(a['id'].startswith('sam-post-') and a['url'].startswith(sam.BASE+'/') for a in articles))
        self.assertEqual([a['number'] for a in articles], list(range(1,len(articles)+1)))
        self.assertEqual(articles, sorted(articles,key=lambda a:(a['publishedAt'],int(a['postId']))))


if __name__ == '__main__': unittest.main()
