"""Build Bikefit Simulator from src/ into dist/bikefitsim.html: one page with everything inline,
to open straight in a browser or publish as it is.

    python3 build.py
"""
import base64
import hashlib
import os
from urllib.parse import quote

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, 'src')
DIST = os.path.join(ROOT, 'dist')


def favicon():
    with open(os.path.join(ROOT, 'assets', 'logo-retro.svg'), encoding='utf-8') as f:
        svg = ' '.join(f.read().split())
    return '<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,' + quote(svg, safe=' =:/,;()-.') + '">'


def csp(scripts):
    # only these exact scripts and the GoatCounter counter may run; the page sends only the anonymous visit count
    hashes = ' '.join("'sha256-" + base64.b64encode(hashlib.sha256(s.encode('utf-8')).digest()).decode() + "'" for s in scripts)
    return ('<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src ' + hashes + ' ' + COUNTER_JS
            + "; style-src 'unsafe-inline'; img-src data: blob: " + COUNTER + '; connect-src ' + COUNTER
            + "; base-uri 'none'; form-action 'none'\">")


SITE = 'https://bikefitsim.github.io/'
DESCRIPTION = ('Move your bike fit to another bike: enter the bike that fits you and the new frame&#39;s geometry, '
               'and get the saddle height, setback, seatpost, stem and spacers.')
COUNTER = 'https://bikefitsim.goatcounter.com'
COUNTER_JS = 'https://gc.zgo.at'

# what search engines and link previews show
META = ('<meta name="description" content="{d}"><link rel="canonical" href="{u}">'
        '<meta property="og:type" content="website"><meta property="og:site_name" content="Bikefit Simulator">'
        '<meta property="og:title" content="Bikefit Simulator"><meta property="og:description" content="{d}">'
        '<meta property="og:url" content="{u}"><meta name="twitter:card" content="summary">'
        '<meta name="twitter:title" content="Bikefit Simulator"><meta name="twitter:description" content="{d}">'
        ).format(d=DESCRIPTION, u=SITE)

# anonymous visit counts (GoatCounter); it counts nothing on localhost or a file opened from disk
ANALYTICS = '<script data-goatcounter="' + COUNTER + '/count" async src="' + COUNTER_JS + '/count.js"></script>'

# a small reset and the logo as the tab icon
HEAD = ('<!doctype html><html lang="en"><head><meta charset="utf-8">{csp}'
        '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
        '<title>Bikefit Simulator</title>' + META + favicon() + ANALYTICS +
        '<style>:root{color-scheme:dark}body{margin:0;font:14px system-ui}img{max-width:100%}'
        '[hidden]{display:none!important}</style></head><body>\n')


def read(name):
    with open(os.path.join(SRC, name), encoding='utf-8') as f:
        return f.read()


def paypal_qr():
    # the donation QR code, inline like everything else
    with open(os.path.join(ROOT, 'assets', 'paypal-qr.png'), 'rb') as f:
        return 'data:image/png;base64,' + base64.b64encode(f.read()).decode()


def build_page():
    engine = read('engine.js').replace("if (typeof module !== 'undefined') module.exports = GB;\n", '')
    scripts = ['\n' + engine + '\n' + read('draw.js') + '\n' + read('datafile.js'), '\n' + read('app.js')]
    return (HEAD.replace('{csp}', csp(scripts)) + read('base.css') + '\n' + read('body.html').replace('{paypal_qr}', paypal_qr()) + '\n' + read('retro.css') + '\n'
            + ''.join('<script>' + s + '</script>\n' for s in scripts) + '</body></html>\n')


def write(name, text):
    path = os.path.join(DIST, name)
    with open(path, 'w', encoding='utf-8', newline='\n') as f:
        f.write(text)
    print(f'wrote {os.path.relpath(path, ROOT)} ({len(text.encode("utf-8"))} bytes)')


if __name__ == '__main__':
    os.makedirs(DIST, exist_ok=True)
    write('bikefitsim.html', build_page())
