"""Build Geobike from src/ into dist/.

    python3 build.py

dist/geobike.html        page body for publishing as the Claude artifact (no <html>/<head>; the host adds them)
dist/geobike-local.html  full document to open straight in a browser for local testing
"""
import os

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, 'src')
DIST = os.path.join(ROOT, 'dist')

HEAD = '''<title>Geobike</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&family=Saira+Condensed:wght@500;600;700&display=swap">
'''

# the same small reset the artifact host adds around the page
SKELETON = ('<!doctype html><html><head><meta charset="utf-8">'
            '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
            '<style>:root{color-scheme:light}body{margin:0;font:14px system-ui}img{max-width:100%}'
            '[hidden]{display:none!important}</style></head><body>')


def read(name):
    with open(os.path.join(SRC, name), encoding='utf-8') as f:
        return f.read()


def build_page():
    engine = read('engine.js').replace("if (typeof module !== 'undefined') module.exports = GB;\n", '')
    return (HEAD + read('base.css') + '\n' + read('body.html') + '\n'
            + '<script>\n' + engine + '\n' + read('draw.js') + '\n' + read('datafile.js') + '</script>\n'
            + '<script>\n' + read('app.js') + '</script>\n')


def write(name, text):
    path = os.path.join(DIST, name)
    with open(path, 'w', encoding='utf-8', newline='\n') as f:
        f.write(text)
    print(f'wrote {os.path.relpath(path, ROOT)} ({len(text.encode("utf-8"))} bytes)')


if __name__ == '__main__':
    os.makedirs(DIST, exist_ok=True)
    page = build_page()
    write('geobike.html', page)
    write('geobike-local.html', SKELETON + page + '</body></html>\n')
