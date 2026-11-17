"""
dist/ → 단일 HTML 미리보기 페이지 (claude.ai 아티팩트용)
- 서비스워커·매니페스트·외부 폰트 CDN 제거 (아티팩트 환경에서 차단됨)
- CSS·JS 인라인
실행: python3 scripts/build-artifact.py apps/voice-coach/dist out/voice-coach-preview.html
"""
import re, sys, pathlib

dist = pathlib.Path(sys.argv[1])
out = pathlib.Path(sys.argv[2])
html = (dist / 'index.html').read_text()
js_path = re.search(r'src="\./(assets/[^"]+\.js)"', html).group(1)
css_path = re.search(r'href="\./(assets/[^"]+\.css)"', html).group(1)
js = (dist / js_path).read_text().replace('</script', '<\\/script')
css = (dist / css_path).read_text()

page = f'''<title>보이스 헬스코치</title>
<meta name="theme-color" content="#1A1917">
<style>{css}</style>
<div id="root"></div>
<script type="module">{js}</script>
'''
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(page)
print(out, f'{len(page) / 1024:.0f} KB')
