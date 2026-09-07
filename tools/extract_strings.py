"""Extract every user-visible string in the explorer, with a stable id per string.

Run it to produce editing/strings.json. The ids are positional, so they stay put as
long as only the wording changes. apply_strings.py reads an edited workbook back and
writes the new wording into index.html, data.js and build_explorer_data.py.

    python3 tools/extract_strings.py
"""
import json, os, re
from html.parser import HTMLParser

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
P = lambda *a: os.path.join(ROOT, *a)

# ── index.html ────────────────────────────────────────────────────────────────
# Capture whole blocks, not raw text nodes: inline <strong>/<em> otherwise shred a
# sentence into unreadable fragments. A block is captured as one editable unit when
# it holds no nested block and no form control; otherwise its own text nodes are
# emitted separately (that keeps <label>Group A…<input></label> editable).
BLOCK = {'p', 'h1', 'h2', 'h3', 'h4', 'li', 'summary', 'button', 'label', 'th', 'td',
         'option', 'footer', 'div'}
# <a>, <strong>, <em>, <span> stay inline so a sentence containing one is still one row.
# These only disqualify a block from counting as a leaf.
CONTAINER = BLOCK | {'table', 'thead', 'tbody', 'tr', 'ul', 'ol', 'nav', 'section', 'details'}
CONTROL = {'input', 'select', 'textarea'}
SKIP_TAGS = {'script', 'style'}
TEXT_ATTRS = {'placeholder', 'value', 'title'}

class Walk(HTMLParser):
    def __init__(self, src):
        super().__init__(convert_charrefs=False)
        self.src = src
        self.lines = [0]
        for ln in src.split('\n')[:-1]:
            self.lines.append(self.lines[-1] + len(ln) + 1)
        self.open, self.blocks, self.texts, self.attrs = [], [], [], []
        self.skip, self.section = 0, ''
    def off(self):
        ln, col = self.getpos(); return self.lines[ln - 1] + col
    def handle_starttag(self, tag, attrs):
        d = dict(attrs)
        if tag == 'section' and d.get('id'): self.section = d['id']
        if tag in SKIP_TAGS: self.skip += 1; return
        if self.skip: return
        for a in TEXT_ATTRS:
            v = d.get(a)
            if not v or not v.strip(): continue
            if a == 'value' and d.get('type') not in (None, 'text'): continue
            if a == 'title' and len(v.strip()) < 12: continue
            st = self.get_starttag_text() or ''
            m = re.search(r'\b' + re.escape(a) + r'\s*=\s*(["\'])(.*?)\1', st, re.S)
            if m:
                vs = self.off() + m.start(2)
                self.attrs.append((vs, vs + len(m.group(2)), tag, a, d.get('id', ''), self.section, v))
        if tag in BLOCK:
            st = self.get_starttag_text() or ''
            self.open.append((tag, self.off() + len(st), d.get('id', ''), self.section))
    def handle_startendtag(self, tag, attrs): self.handle_starttag(tag, attrs)
    def handle_endtag(self, tag):
        if tag in SKIP_TAGS:
            if self.skip: self.skip -= 1
            return
        if self.skip: return
        for k in range(len(self.open) - 1, -1, -1):
            if self.open[k][0] == tag:
                t, start, eid, sec = self.open.pop(k)
                self.blocks.append((start, self.off(), t, eid, sec))
                break
    def handle_data(self, data):
        if self.skip or not data.strip(): return
        self.texts.append((self.off(), data, self.section))

def html_rows():
    src = open(P('index.html'), encoding='utf-8').read()
    w = Walk(src); w.feed(src)
    keep = []
    for start, end, tag, eid, sec in w.blocks:
        inner = src[start:end]
        if not re.search(r'[A-Za-z]{2}', inner): continue
        names = set(re.findall(r'<\s*([a-zA-Z0-9]+)', inner))
        if names & CONTAINER or names & CONTROL: continue  # container, not a leaf
        keep.append((start, end, tag, eid, sec, inner))
    covered = [(s, e) for s, e, *_ in keep]
    inside = lambda p: any(s <= p < e for s, e in covered)
    rows = []
    for start, end, tag, eid, sec, inner in keep:
        rows.append((start, dict(kind='block', file='index.html', start=start, end=end,
                                 where=f'<{tag}>' + (f' #{eid}' if eid else ''),
                                 section=sec or 'header/nav', current=inner.strip(), raw=inner)))
    for pos, data, sec in w.texts:                        # loose text (e.g. label + input)
        if inside(pos) or not re.search(r'[A-Za-z]{2}', data): continue
        rows.append((pos, dict(kind='text', file='index.html', start=pos, end=pos + len(data),
                               where='text', section=sec or 'header/nav',
                               current=data.strip(), raw=data)))
    for pos, end, tag, a, eid, sec, v in w.attrs:
        rows.append((pos, dict(kind='attr', file='index.html', start=pos, end=end,
                               where=f'<{tag}> {a}' + (f' #{eid}' if eid else ''),
                               section=sec or 'header/nav', current=v.strip(), raw=v)))
    rows.sort(key=lambda r: r[0])
    out = []
    for n, (pos, r) in enumerate(rows, 1):
        r = dict(r); r['id'] = f'H{n:03d}'; r['placeholders'] = ''
        out.append(r)
    return out

# ── data.js (mirrored into build_explorer_data.py) ────────────────────────────
DATA_KEYS = {'title', 'tagline', 'intro', 'chipLabel', 'desc', 'label', 'short',
             'upLabel', 'dnLabel', 'unit', 'statsNote', 'numShort', 'denShort'}

def data_rows():
    raw = open(P('data.js'), encoding='utf-8').read()
    payload = json.loads(raw[len('window.CAD='):-2])
    out = []
    def walk(o, path):
        if isinstance(o, dict):
            for k, v in o.items():
                if isinstance(v, str) and k in DATA_KEYS and re.search(r'[A-Za-z]{2}', v):
                    out.append((f'{path}.{k}', v))
                else: walk(v, f'{path}.{k}')
        elif isinstance(o, list):
            for i, v in enumerate(o): walk(v, f'{path}[{i}]')
    for i, d in enumerate(payload['datasets']):
        walk(d, d['id'])
    rows = []
    for n, (path, v) in enumerate(out, 1):
        rows.append(dict(id=f'D{n:03d}', file='data.js', where=path,
                         section=path.split('.')[0], current=v, raw=v, placeholders=''))
    return rows

# ── app.js: only self-contained sentences ────────────────────────────────────
# Most prose in app.js is assembled at runtime from pieces with live numbers spliced
# in (`...${cc.rSig.toFixed(2)}...`). Those pieces are not safely editable in a
# spreadsheet, so only complete standalone sentences are offered here; anything else
# is changed by describing what you want on the Requests sheet.
def app_rows():
    src = open(P('app.js'), encoding='utf-8').read()
    # template literals first, so the single-quote scan cannot match inside one
    tmpl = [(m.start(), m.end()) for m in re.finditer(r'`(?:[^`\\]|\\.)*`', src, re.S)]
    in_tmpl = lambda p: any(a <= p < b for a, b in tmpl)
    found = []
    for m in re.finditer(r"'((?:[^'\\\n]|\\.)*)'", src):
        if not in_tmpl(m.start()): found.append((m.start(1), m.group(1), 'quote'))
    for a, b in tmpl:                       # static runs between the ${...} holes
        body = src[a + 1:b - 1]
        for seg in re.finditer(r'(?:(?!\$\{).)+', body, re.S):
            found.append((a + 1 + seg.start(), seg.group(0), 'template'))
    rows, seen, n = [], set(), 0
    for pos, raw, style in sorted(found):
        t = raw.strip()
        if len(t) < 25 or t in seen: continue
        if t.startswith('</'): continue                                # tail of a bigger sentence
        if not re.match(r'^[A-Z\u26a0\u2713\u2717<]', t): continue     # must open a sentence
        if not re.search(r'[.?!]$', t): continue                          # and close one
        if not re.search(r'[A-Za-z]{3}\s+[A-Za-z]{2}', t): continue      # real words
        if t.count('<') > 6: continue                                     # markup blob
        seen.add(t); n += 1
        rows.append(dict(id=f'A{n:03d}', file='app.js', where=f'char {pos}',
                         section='app messages', current=t, raw=raw, style=style,
                         start=pos, end=pos + len(raw), placeholders=''))
    return rows

def main():
    rows = html_rows() + data_rows() + app_rows()
    os.makedirs(P('editing'), exist_ok=True)
    with open(P('editing', 'strings.json'), 'w', encoding='utf-8') as f:
        json.dump(rows, f, indent=1, ensure_ascii=False)
    for pre, name in (('H', 'index.html'), ('D', 'data.js'), ('A', 'app.js')):
        print(f'  {name:16} {sum(1 for r in rows if r["id"].startswith(pre)):4} strings')
    print(f'  {"TOTAL":16} {len(rows):4}')

if __name__ == '__main__':
    main()
