import json
import unittest
from unittest.mock import Mock, patch
from test_daily import refresh


def post(slug, **extra):
    return dict(_id=slug, slug={'current': slug}, title=slug,
                publishedOn='2026-11-05', articleType='news', **extra)


def html(posts, more=False, count=None, door=None):
    props = dict(door=door or {'kind': 'news'}, articleCount=count if count is not None else len(posts),
                 initialPage=dict(posts=posts, hasNextPage=more))
    return ('<script>self.__next_f.push(' + json.dumps([1, json.dumps(props, separators=(',', ':'))]) + ')</script>').encode()


class ListingTests(unittest.TestCase):
    def test_pagination_linked_url_and_categories(self):
        linked = post('linked', linkedUrl='/research/real-link', newsCategories=['Announcements'])
        linked['slug'] = None
        first = Mock(content=html([post('first')], True, 2))
        last = Mock()
        last.json.return_value = dict(posts=[linked], hasNextPage=False)
        with patch.object(refresh, 'request', side_effect=[first, last]) as request:
            _, records = refresh.read_listing(('News', refresh.BASE + '/news'))
        self.assertEqual(set(records), {'first', 'real-link'})
        self.assertEqual(records['real-link']['url'], refresh.BASE + '/research/real-link')
        self.assertEqual(records['real-link']['categories'], ['announcements'])
        self.assertEqual(request.call_args_list[1].args[0], refresh.BASE + '/listing/news/default/2')

    def test_team_pagination_and_research_namespace(self):
        item = post('engineering-post', cardTeams=[{'slug': 'engineering'}])
        item['articleType'] = 'research'
        first = Mock(content=html([item], True, 2, {'kind': 'team', 'slug': 'engineering'}))
        last = Mock()
        last.json.return_value = dict(posts=[post('second')], hasNextPage=False)
        with patch.object(refresh, 'request', side_effect=[first, last]) as request:
            _, records = refresh.read_listing(('Engineering', refresh.BASE + '/engineering'))
        self.assertEqual(records['engineering-post']['url'], refresh.BASE + '/research/engineering-post')
        self.assertEqual(request.call_args_list[1].args[0], refresh.BASE + '/listing/team-engineering/default/2')

    def test_truncated_duplicate_and_malformed_pages_fail(self):
        for page in [dict(posts=[], hasNextPage=False),
                     dict(posts=[post('first')], hasNextPage=True),
                     dict(posts=[], hasNextPage=True),
                     dict(posts=[post('second')])]:
            with self.subTest(page=page), patch.object(refresh, 'request', side_effect=[
                    Mock(content=html([post('first')], True, 2)), Mock(json=Mock(return_value=page))]):
                with self.assertRaises(ValueError):
                    refresh.read_listing(('News', refresh.BASE + '/news'))

    def test_page_request_failure_is_not_silently_ignored(self):
        with patch.object(refresh, 'request', side_effect=[Mock(content=html([post('first')], True, 2)), RuntimeError('offline')]):
            with self.assertRaisesRegex(RuntimeError, 'offline'):
                refresh.read_listing(('News', refresh.BASE + '/news'))

    def test_legacy_complete_listing(self):
        payload = json.dumps({'posts': [post('legacy')]}, separators=(',', ':'))
        content = ('<script>self.__next_f.push(' + json.dumps([1, payload]) + ')</script>').encode()
        with patch.object(refresh, 'request', return_value=Mock(content=content)) as request:
            _, records = refresh.read_listing(('News', refresh.BASE + '/news'))
        self.assertEqual(set(records), {'legacy'})
        self.assertEqual(request.call_count, 1)
