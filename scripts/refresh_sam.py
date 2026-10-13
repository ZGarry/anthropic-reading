"""Index every public Sam Altman blog page. Store metadata, never article bodies.

Stable Posthaven IDs keep progress independent of title/slug changes. Abort
before replacing the catalogue on incomplete pagination, bad dates or shrinkage.
"""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin, urlsplit, parse_qs
import json
import os
import re
import sys

import requests
from bs4 import BeautifulSoup

from refresh_catalog import CHINA, atomic_json

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'data' / 'sam'
DIST = ROOT / 'dist' / 'sam'
BASE = 'https://blog.samaltman.com'
TOPICS = {
    'ai': r'\b(ai|agi|intelligence|superintelligence|machine learning|openai|chatgpt|gpt|sora|compute|moore|merge|singularity|deep learning)\b',
    'startups': r'\b(startup|startups|founder|founders|company|companies|business|entrepreneur|entrepreneurs|yc|y combinator|incorporate|hire|hiring|employee|employees|equity|cofounder|co-founder|management|managing|board|growth|grow|customers|product|ceo|revenue)\b',
    'career': r'\b(successful|success|productive|productivity|advice|career|work|hard|learn|learning|ambition|idea|ideas|talent|happiness|turning|regret|regrets|school|college|life|wisdom|focus|decision|value|values|principles)\b',
    'investing': r'\b(invest|investing|investors|investor|investment|fund|funding|fundraising|capital|money|valuation|valuations|stock|stocks|equity|bubble|bitcoin|crypto|currency|financial|rounds|term sheet)\b',
    'society': r'\b(politic|politics|political|election|president|democracy|democratic|trump|clinton|government|governance|policy|american|america|united states|society|basic income|ubi|inequality|housing|distribution|economy|economic|progress|future|abundance|abundant|wealth|inequality|immigration|china|regulation)\b',
    'science': r'\b(energy|fusion|nuclear|science|scientific|research|researchers|technology|technologies|technological|tech|innovation|hardware|software|universe|electrons|atoms|virus|h5n1|covid-19)\b',
}
TITLE_TOPICS = {
    'DALL•E 2': ['ai'],
    'Reflections': ['ai', 'startups'],
    'Three Observations': ['ai', 'society'],
    'Reinforcement Learning Progress': ['ai', 'science'],
    'Jakub and Szymon': ['ai', 'startups'],
    'Helion': ['science', 'startups'],
    'Helion Needs You': ['science', 'startups'],
    'What I Wish Someone Had Told Me': ['career', 'startups'],
    'The days are long but the decades are short': ['career'],
    'How things get done': ['career'],
    'By endurance we conquer': ['career'],
    'The Strength of Being Misunderstood': ['career'],
    'Idea Generation': ['career', 'startups'],
    'The U.S. Digital Service': ['society', 'science'],
    'Keep the Internet Open': ['society'],
    'Net neutrality': ['society'],
    'US Digital Currency': ['society', 'investing'],
}


def fetch(url):
    for attempt in range(3):
        try:
            r = requests.get(url, timeout=40, headers={'User-Agent': 'ReadingArchive/1.0 (public blog metadata index)'})
            r.raise_for_status()
            if urlsplit(r.url).hostname != 'blog.samaltman.com':
                raise ValueError('Unexpected redirect')
            return r.text
        except requests.RequestException:
            if attempt == 2:
                raise


def page_number(href):
    parsed = urlsplit(urljoin(BASE, href))
    if parsed.hostname != 'blog.samaltman.com' or parsed.path not in ('', '/'):
        return None
    value = parse_qs(parsed.query).get('page', ['1'])[0]
    return int(value) if value.isdigit() else None


def pagination(html):
    soup = BeautifulSoup(html, 'html.parser')
    numbers = [page_number(a.get('href', '')) for a in soup.select('.pagination a[href]')]
    if not numbers:
        # Posthaven may omit pagination on a one-page blog.
        numbers = [page_number(a.get('href', '')) for a in soup.select('a[href]') if a.get_text(strip=True) in ('Last', 'Next')]
    return max([n for n in numbers if n is not None] or [1])


def parse_page(html):
    soup = BeautifulSoup(html, 'html.parser')
    records = []
    for post in soup.select('article.post'):
        link = post.select_one('.post-title h2 a[href]')
        body = post.select_one('.post-body[id]')
        date = post.select_one('footer [data-unix-time]')
        if not link or not body or not date:
            raise ValueError('Post is missing title, stable ID, or publication timestamp')
        match = re.fullmatch(r'post_body_(\d+)', body['id'])
        url = urljoin(BASE, link['href']).rstrip('/')
        if not match or urlsplit(url).hostname != 'blog.samaltman.com' or urlsplit(url).query:
            raise ValueError('Invalid article ID or URL')
        timestamp = int(date['data-unix-time'])
        published = datetime.fromtimestamp(timestamp, timezone.utc)
        if not 2000 <= published.year <= datetime.now(timezone.utc).year + 1:
            raise ValueError('Invalid publication date')
        title = link.get_text(' ', strip=True) or '（无标题）'
        categories = TITLE_TOPICS.get(title) or [name for name, pattern in TOPICS.items() if re.search(pattern, title, re.I)] or ['essays']
        records.append(dict(id='sam-post-' + match[1], postId=match[1], title=title,
                            date=published.date().isoformat(), publishedAt=published.isoformat(),
                            url=url, categories=categories, sources=['Blog'], source='Blog', defaultRead=False))
    if not records:
        raise ValueError('No public posts found on a blog page')
    return records


def collect():
    first = fetch(BASE + '/')
    last = pagination(first)
    if not 1 <= last <= 200:
        raise ValueError('Unexpected pagination limit')
    first_records = parse_page(first)
    with ThreadPoolExecutor(max_workers=4) as pool:
        rest = list(pool.map(fetch, [BASE + '/?page=' + str(i) for i in range(2, last + 1)]))
    pages = [first_records] + [parse_page(html) for html in rest]
    for i, page in enumerate(pages):
        if len(page) > 10 or (i < len(pages) - 1 and len(page) != 10):
            raise ValueError('Incomplete or changed pagination; previous catalogue preserved')
    if rest and pagination(rest[-1]) > last:
        raise ValueError('Final page points to more pages')
    records = [a for page in pages for a in page]
    if len({a['id'] for a in records}) != len(records) or len({a['url'] for a in records}) != len(records):
        raise ValueError('Duplicate post across pages; retry when pagination is stable')
    if [a['id'] for a in parse_page(fetch(BASE + '/'))] != [a['id'] for a in first_records]:
        raise ValueError('Blog changed during crawl; retry')
    return records, last


def merge_catalog(old, incoming, day):
    if old and len(incoming) < len(old) * .85:
        raise ValueError('Public post count shrank unexpectedly; previous catalogue preserved')
    records = {a['id']: dict(a) for a in old}
    new, changed = [], []
    for item in incoming:
        previous = records.get(item['id'])
        if previous:
            value = {**previous, **item}
            if any(previous.get(k) != item.get(k) for k in ('title', 'url', 'date', 'categories')):
                changed.append(item['id'])
        else:
            value = dict(item)
            # The first full import is a baseline, not a batch of new releases.
            if old:
                value['addedOn'] = day
            new.append(item['id'])
        records[item['id']] = value
    articles = sorted(records.values(), key=lambda a: (a['publishedAt'], int(a['postId'])))
    for i, a in enumerate(articles, 1):
        a['number'] = i
    if len({a['url'] for a in articles}) != len(articles):
        raise ValueError('Duplicate canonical article URL')
    return articles, new, changed


def record_check(report):
    day = datetime.fromisoformat(report['checkedAt']).astimezone(CHINA).date().isoformat()
    path = DATA / 'checks' / (day + '.json')
    daily = json.loads(path.read_text(encoding='utf-8')) if path.exists() else {'date': day, 'timezone': 'Asia/Shanghai', 'attempts': []}
    daily['attempts'].append(report)
    atomic_json(path, daily)
    checks = []
    for p in sorted((DATA / 'checks').glob('*.json'), reverse=True):
        item = json.loads(p.read_text(encoding='utf-8'))
        last = item['attempts'][-1]
        checks.append(dict(date=item['date'], status=last['status'], checkedAt=last['checkedAt'],
                           attempts=len(item['attempts']), total=last.get('total'), error=last.get('error'),
                           newIds=sorted({i for attempt in item['attempts'] for i in attempt.get('newIds', [])})))
    atomic_json(DIST / 'checks.json', checks)
    (DIST / 'checks.js').write_text('window.DAILY_CHECKS = ' + json.dumps(checks, ensure_ascii=False) + ';\n', encoding='utf-8')


def main():
    old = json.loads((DATA / 'catalog.json').read_text(encoding='utf-8')) if (DATA / 'catalog.json').exists() else []
    incoming, pages = collect()
    now = datetime.now(timezone.utc).isoformat(timespec='seconds')
    day = datetime.now(CHINA).date().isoformat()
    articles, new, changed = merge_catalog(old, incoming, day)
    meta = dict(total=len(articles), pageCount=pages, livePostCount=len(incoming),
                readBatch='sam-public-catalog-v1', checkedAt=now, lastSuccessfulDay=day,
                dateTimezone='UTC', firstDate=articles[0]['date'], lastDate=articles[-1]['date'])
    report = dict(status='success', checkedAt=now, total=len(articles), pages=pages, livePostCount=len(incoming),
                  newIds=new if old else [], baseline=not bool(old), changedIds=changed,
                  noLongerListed=sorted({a['id'] for a in old} - {a['id'] for a in incoming}))
    atomic_json(DATA / 'catalog.json', articles)
    atomic_json(DATA / 'last-check.json', report)
    atomic_json(DIST / 'catalog-meta.json', meta)
    payload = 'window.ARTICLES = ' + json.dumps(articles, ensure_ascii=False, separators=(',', ':')) + ';\n'
    payload += 'window.CATALOG_META = ' + json.dumps(meta, ensure_ascii=False, separators=(',', ':')) + ';\n'
    temporary = DIST / 'catalog.js.tmp'
    temporary.write_text(payload, encoding='utf-8')
    os.replace(temporary, DIST / 'catalog.js')
    record_check(report)
    print(json.dumps(report, ensure_ascii=True))


if __name__ == '__main__':
    DIST.mkdir(parents=True, exist_ok=True)
    try:
        main()
    except Exception as exc:
        record_check(dict(status='failed', checkedAt=datetime.now(timezone.utc).isoformat(timespec='seconds'),
                          error=str(exc), newIds=[], changedIds=[]))
        print('Sam catalogue check failed; the previous catalogue is preserved: ' + str(exc), file=sys.stderr)
        raise
