from pathlib import Path
import os, json

root = Path(__file__).resolve().parents[1]
checks = json.loads((root / 'dist/checks.json').read_text(encoding='utf-8'))
last = checks[0]
articles = {a['id']: a for a in json.loads((root / 'data/catalog.json').read_text(encoding='utf-8'))}
lines = [f"## {last['date']} source check", '', f"Status: {last['status']}",
         f"Newly collected: {len(last['newIds'])}", '', 'No AI service or model API is used.', '']
for article in sorted((articles[i] for i in last['newIds'] if i in articles), key=lambda a: (a['categories'], a['date'])):
    lines.append(f"- {', '.join(article['categories'])} | {article['date']} | [{article['title']}]({article['url']})")
if last.get('error'): lines += ['', 'Error: ' + last['error']]
sam_checks_path = root / 'dist/sam/checks.json'
if sam_checks_path.exists():
    sam = json.loads(sam_checks_path.read_text(encoding='utf-8'))[0]
    lines += ['', '## Sam Altman blog', '', f"Status: {sam['status']}",
              f"Public posts in catalogue: {sam.get('total')}", f"Newly collected: {len(sam['newIds'])}"]
    if sam.get('error'): lines += ['Error: ' + sam['error']]
text = '\n'.join(lines) + '\n'
if os.environ.get('GITHUB_STEP_SUMMARY'):
    with open(os.environ['GITHUB_STEP_SUMMARY'], 'a', encoding='utf-8') as f: f.write(text)
print(text)
