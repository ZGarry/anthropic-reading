"""Refresh official listing snapshots without changing any reading state.

Run from any directory: python scripts/refresh_catalog.py
Fails before writing if a source cannot be parsed or loses a substantial number
of records. Existing records and IDs are retained, including removed listings.
"""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone, timedelta
from urllib.parse import urljoin, urlsplit
from collections import Counter
import json, re, os
import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'data'
DIST = ROOT / 'dist'
BASE = 'https://www.anthropic.com'
CHINA = timezone(timedelta(hours=8))
URLS = {
    'News': BASE + '/news', 'Research': BASE + '/research',
    'Engineering': BASE + '/engineering',
    **{name: BASE + '/research/team/' + name for name in
       ['alignment', 'economics', 'interpretability', 'societal-impacts', 'frontier-red-team']},
    'science': BASE + '/science',
}
RENAMES = {'economic-research': 'economics', 'event': 'events', 'case-study': 'case-studies'}

def category(value):
    value = value.strip().lower().replace(' ', '-')
    return RENAMES.get(value, value)

def request(url):
    for attempt in range(3):
        try:
            response = requests.get(url, headers={'User-Agent': 'Mozilla/5.0'}, timeout=45)
            response.raise_for_status()
            if urlsplit(response.url).hostname not in ('www.anthropic.com', 'anthropic.com', 'claude.com', 'www.claude.com'):
                raise ValueError('Unexpected redirect: ' + response.url)
            return response
        except requests.RequestException:
            if attempt == 2: raise

def post_slug(post):
    slug = (post.get('slug') or {}).get('current')
    link = post.get('linkedUrl') or post.get('url')
    return slug or (urlsplit(link).path.rstrip('/').split('/')[-1] if link else None)


def paginated_posts(decoded):
    """Follow the same public listing pages as the website's Load more button."""
    decoder = json.JSONDecoder()
    def field(name):
        match = re.search(r'"' + name + r'":', decoded)
        if not match:
            raise ValueError('Missing listing field: ' + name)
        return decoder.raw_decode(decoded[match.end():])[0]

    if not re.search(r'"initialPage":', decoded):
        return None  # Older pages embed the complete posts array.
    door, page, expected = field('door'), field('initialPage'), field('articleCount')
    kind, slug = door.get('kind'), door.get('slug')
    if kind not in ('news', 'research', 'team', 'newsCategory', 'collection'):
        raise ValueError('Unsupported listing door')
    if slug is not None and not re.fullmatch(r'[a-z0-9-]+', slug):
        raise ValueError('Invalid listing slug')
    endpoint = kind + ('-' + slug if slug else '')
    posts, seen = [], set()
    for number in range(1, 51):
        if not isinstance(page, dict) or not isinstance(page.get('posts'), list) or type(page.get('hasNextPage')) is not bool:
            raise ValueError('Invalid listing page: ' + endpoint)
        batch = page['posts']
        keys = [p.get('_id') or post_slug(p) for p in batch if isinstance(p, dict)]
        if len(keys) != len(batch) or any(not k for k in keys) or len(set(keys)) != len(keys) or seen.intersection(keys):
            raise ValueError('Duplicate or invalid listing records: ' + endpoint)
        if page['hasNextPage'] and not batch:
            raise ValueError('Empty unfinished listing page: ' + endpoint)
        seen.update(keys)
        posts.extend(batch)
        if not page['hasNextPage']:
            if type(expected) is not int or len(posts) != expected:
                raise ValueError(f'Listing count mismatch: {endpoint} ({expected} -> {len(posts)})')
            return posts
        if number < 50:
            page = request(f'{BASE}/listing/{endpoint}/default/{number + 1}').json()
    raise ValueError('Listing exceeded 50 pages: ' + endpoint)


def read_listing(item):
    name, url = item
    response = request(url)
    soup = BeautifulSoup(response.content, 'html.parser')
    chunks = []
    for script in soup.find_all('script'):
        raw = script.string or ''
        if raw.startswith('self.__next_f.push('):
            try:
                chunk = json.loads(raw[len('self.__next_f.push('):-1])
                if len(chunk) > 1 and isinstance(chunk[1], str): chunks.append(chunk[1])
            except (ValueError, TypeError): pass
    decoded = ''.join(chunks)
    decoder = json.JSONDecoder()
    posts = {}
    paged = paginated_posts(decoded)
    if paged is not None:
        for post in paged:
            slug = post_slug(post)
            if not slug:
                raise ValueError('Missing listing article link: ' + name)
            posts[slug] = post
    else:
        for match in re.finditer(r'"posts":\[', decoded):
            value, _ = decoder.raw_decode(decoded[match.end()-1:])
            for post in value:
                if isinstance(post, dict) and post_slug(post): posts[post_slug(post)] = post
        for match in re.finditer(r'\{(?=[^{}]{0,200}"_type":"(?:post|featuredGridLink)")', decoded):
            try:
                post, _ = decoder.raw_decode(decoded[match.start():])
                if post_slug(post): posts.setdefault(post_slug(post), post)
            except (ValueError, TypeError): pass
    records = {}
    source = name if name in ('News', 'Research', 'Engineering') else 'Research'
    for slug, post in posts.items():
        date = (post.get('publishedOn') or post.get('date') or '')[:10]
        if not date: continue
        article_source = post.get('articleType') or source.lower()
        url = urljoin(BASE, post.get('linkedUrl') or post.get('url') or '/' + article_source + '/' + slug)
        if urlsplit(url).hostname not in ('www.anthropic.com', 'anthropic.com', 'claude.com', 'www.claude.com'): continue
        cats = [category(x['value']) for x in post.get('subjects') or []]
        cats.extend(category(x) for x in post.get('newsCategories') or [])
        cats.extend(category(x['slug']) for x in post.get('cardTeams') or [] if x.get('slug'))
        if post.get('subject'): cats.append(category(post['subject']))
        if name not in ('News', 'Research', 'Engineering'): cats.append(name)
        if source == 'Engineering': cats.append('engineering')
        records[slug] = dict(id=slug, title=post['title'].strip(), date=date,
                             url=url, categories=sorted(set(cats)), sources=[source])
    if name == 'Engineering':
        for link in soup.select('main a[href^="/engineering/"]'):
            heading = link.find(['h2', 'h3'])
            if not heading: continue
            slug = link['href'].rstrip('/').split('/')[-1]
            date_node = link.find(class_=lambda c: c and '__date' in c)
            date = datetime.strptime(date_node.get_text(strip=True), '%b %d, %Y').date().isoformat() if date_node else None
            records[slug] = dict(id=slug, title=heading.get_text(' ', strip=True), date=date,
                                 url=urljoin(BASE, link['href']), categories=['engineering'], sources=['Engineering'])
    if not records: raise ValueError('No articles parsed: ' + name)
    return name, records

def verify_new(article):
    response = request(article['url'])
    soup = BeautifulSoup(response.content, 'html.parser')
    if not soup.find('h1'): raise ValueError('Missing article heading: ' + article['url'])
    article['url'] = response.url.rstrip('/')
    if not article['date']:
        tag = soup.find('meta', attrs={'property': 'article:published_time'})
        if tag: article['date'] = tag['content'][:10]
        if not article['date']:
            match = re.search(r'"datePublished"\s*:\s*"([0-9-]{10})', str(soup))
            if match: article['date'] = match[1]
        if not article['date']:
            match = re.search(r'Published\s+([A-Z][a-z]{2}\s+\d{1,2},\s+\d{4})', soup.get_text(' ', strip=True))
            if match: article['date'] = datetime.strptime(match[1], '%b %d, %Y').date().isoformat()
    if not article['date']: raise ValueError('Missing date: ' + article['url'])
    return article

def atomic_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + '.tmp')
    tmp.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    os.replace(tmp, path)

def record_check(report):
    """Keep every attempt under its China calendar day, including failures."""
    day = datetime.fromisoformat(report['checkedAt']).astimezone(CHINA).date().isoformat()
    path = DATA / 'checks' / (day + '.json')
    daily = json.loads(path.read_text(encoding='utf-8')) if path.exists() else {'date': day, 'timezone': 'Asia/Shanghai', 'attempts': []}
    daily['attempts'].append(report)
    atomic_json(path, daily)
    summaries = []
    for p in sorted((DATA / 'checks').glob('*.json'), reverse=True):
        item = json.loads(p.read_text(encoding='utf-8'))
        last = item['attempts'][-1]
        summaries.append({'date': item['date'], 'status': last['status'], 'checkedAt': last['checkedAt'],
                          'attempts': len(item['attempts']),
                          'newIds': sorted({i for a in item['attempts'] for i in a.get('newIds', [])}),
                          'total': last.get('total'), 'error': last.get('error')})
    atomic_json(DIST / 'checks.json', summaries)
    (DIST / 'checks.js').write_text('window.DAILY_CHECKS = '+json.dumps(summaries, ensure_ascii=False, separators=(',', ':'))+';\n', encoding='utf-8')

def main():
    old = json.loads((DATA / 'catalog.json').read_text(encoding='utf-8'))
    previous = json.loads((DIST / 'catalog-meta.json').read_text(encoding='utf-8')) if (DIST / 'catalog-meta.json').exists() else {}
    with ThreadPoolExecutor(max_workers=6) as pool:
        sections = dict(pool.map(read_listing, URLS.items()))
    counts = {name: len(items) for name, items in sections.items()}
    for name, count in counts.items():
        baseline = previous.get('sourceCounts', {}).get(name, 0)
        if name in ('News', 'Research', 'Engineering'):
            baseline = max(baseline, sum(name in a['sources'] for a in old))
        if baseline and count < baseline * .85:
            raise ValueError(f'{name} shrank unexpectedly ({baseline} -> {count}); original catalogue preserved')
    incoming = {}
    for name, records in sections.items():
        for slug, a in records.items():
            if slug not in incoming: incoming[slug] = a.copy()
            else:
                item = incoming[slug]
                item['categories'] = sorted(set(item['categories'] + a['categories']))
                item['sources'] = sorted(set(item['sources'] + a['sources']))
                if name == 'Engineering': item['url'] = a['url']
    fresh = [a for slug, a in incoming.items() if slug not in {x['id'] for x in old}]
    with ThreadPoolExecutor(max_workers=6) as pool:
        list(pool.map(verify_new, fresh))
    now = datetime.now(timezone.utc).isoformat(timespec='seconds')
    day = datetime.now(CHINA).date().isoformat()
    records = {a['id']: dict(a) for a in old}
    by_url = {a['url'].rstrip('/'): a['id'] for a in old}
    new_ids, changed_ids = [], []
    for slug, item in incoming.items():
        existing_id = slug if slug in records else by_url.get(item['url'].rstrip('/'))
        if existing_id:
            a = records[existing_id]
            before = json.dumps(a, sort_keys=True)
            a['categories'] = sorted(set(a['categories'] + item['categories']) - {'other'}) or ['other']
            a['sources'] = sorted(set(a['sources'] + item['sources']))
            a['title'] = item['title']
            if json.dumps(a, sort_keys=True) != before: changed_ids.append(existing_id)
        else:
            a = dict(item, defaultRead=False, addedOn=day)
            a['categories'] = a['categories'] or ['other']
            records[slug] = a
            by_url[a['url'].rstrip('/')] = slug
            new_ids.append(slug)
    articles = sorted(records.values(), key=lambda a: (a['date'], a['id']))
    for i, a in enumerate(articles, 1):
        a['number'] = i
        a['source'] = ' / '.join(a['sources'])
        datetime.strptime(a['date'], '%Y-%m-%d')
    assert len({a['url'].rstrip('/') for a in articles}) == len(articles), 'Duplicate canonical URL'
    assert {a['id'] for a in old} <= {a['id'] for a in articles}, 'Lost existing IDs'
    news = sum('News' in a['sources'] for a in articles)
    meta = dict(total=len(articles), newsCount=news,
                researchCount=sum('Research' in a['sources'] for a in articles),
                engineeringCount=sum('Engineering' in a['sources'] for a in articles),
                readBatch='public-catalog-v1', checkedAt=now, lastSuccessfulDay=day,
                newsSnapshot=day, researchSnapshot=day, sourceCounts=counts,
                baselineDate='2026-09-28', baselineTotal=443,
                latestNewIds=new_ids or previous.get('latestNewIds', []))
    history_path = DATA / 'updates.json'
    history = json.loads(history_path.read_text(encoding='utf-8')) if history_path.exists() else []
    if new_ids or changed_ids:
        history.append(dict(checkedAt=now, newIds=new_ids, changedIds=changed_ids))
    report = dict(status='success', checkedAt=now, total=len(articles), newIds=new_ids, changedIds=changed_ids,
                  sourceCounts=counts, noLongerListed=sorted(set(records) - set(incoming)))
    # All network and validation work is complete before any catalogue is written.
    atomic_json(DATA / 'catalog.json', articles)
    atomic_json(DIST / 'catalog-meta.json', meta)
    atomic_json(DATA / 'updates.json', history)
    atomic_json(DATA / 'last-check.json', report)
    content = 'window.ARTICLES = ' + json.dumps(articles, ensure_ascii=False, separators=(',', ':')) + ';\n'
    content += 'window.CATALOG_META = ' + json.dumps(meta, ensure_ascii=False, separators=(',', ':')) + ';\n'
    tmp = DIST / 'catalog.js.tmp'
    tmp.write_text(content, encoding='utf-8')
    os.replace(tmp, DIST / 'catalog.js')
    record_check(report)
    print(json.dumps(report, ensure_ascii=True))

if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        report = {'status': 'failed', 'checkedAt': datetime.now(timezone.utc).isoformat(timespec='seconds'),
                  'error': str(exc), 'newIds': [], 'changedIds': []}
        record_check(report)
        raise
