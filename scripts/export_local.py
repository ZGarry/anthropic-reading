from pathlib import Path
import argparse
root=Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser();p.add_argument('--output-dir',default=str(root/'exports'));args=p.parse_args()
out=Path(args.output_dir);out.mkdir(parents=True,exist_ok=True)
dist=root/'dist';html=(dist/'index.html').read_text(encoding='utf-8')
html=html.replace('<link rel="stylesheet" href="style.css">','<style>'+(dist/'style.css').read_text(encoding='utf-8')+'</style>')
for name in ['catalog.js','checks.js','progress.js','file-backup.js','reader.js']:
    content=(dist/name).read_text(encoding='utf-8').replace('</script','<\\/script')
    html=html.replace(f'<script src="{name}"></script>','<script>'+content+'</script>')
(out/'Anthropic-reading-github-local.html').write_text(html,encoding='utf-8')
print('Standalone HTML saved')
