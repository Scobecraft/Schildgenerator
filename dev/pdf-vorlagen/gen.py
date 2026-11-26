# Erzeugt Vorlagen aus dem PDF des bisherigen Preisschild-Systems.
#
# Für jedes Schild im PDF:
#  1. Felder auslesen (Position, Grundlinie, Schriftgröße, Farbe, Zeilenabstand) – alle Maße in mm
#  2. veränderliche Inhalte (Texte, Logo, QR, UVP-Box, Preis) aus der Seite entfernen
#  3. den Rest (Kopf, Balken, Farbverläufe, Grafiken) als SVG-Hintergrund speichern (Text als Pfade)
#  4. alles als public/js/templates-pdf.js schreiben
#
# Aufruf:  python3 gen.py <pfad-zum-pdf>
import json, os, re, sys
import pymupdf

PDF = sys.argv[1]
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, '..', '..')
BG_DIR = os.path.join(ROOT, 'public', 'tpl')
OUT_JS = os.path.join(ROOT, 'public', 'js', 'tpl-specs.js')
MM = 25.4 / 72
PADZ = float(os.environ.get('PADZ', '8.5'))  # pt

FORMATS = {
    'a4h': ('A4 hoch', 'A4h'), 'a4q': ('A4 quer', 'A4q'), 'a5h': ('A5 hoch', 'A5h'), 'a5q': ('A5 quer', 'A5q'),
    'a6h': ('A6 hoch', 'A6h'), 'm': ('Mittel hoch', 'Mh'), 'a7q': ('A7 quer', 'A7q'),
}
VARIANTS = {
    'expert': ('expert', 'E', 'Weißer Kopf mit expert-Logo'),
    'werbung': ('Werbung', 'W', 'Oranger Kopf „Aus unserer Werbung“'),
    'preishammer': ('Preishammer', 'PH', 'Oranger Hintergrund mit „% PREIS-HAMMER“'),
    'preishammer-bild': ('Preishammer Bild', 'PB', 'Hintergrundbild mit „PREIS-HAMMER“-Grafik'),
    'bware': ('B-Ware', 'B', 'Oranger Kopf „B-WARE“'),
}
VARIANT_ORDER = ['expert', 'werbung', 'preishammer', 'preishammer-bild', 'bware']
FORMAT_ORDER = ['a4h', 'a4q', 'a5h', 'a5q', 'm', 'a6h', 'a7q']

SIGNS = [
    (1, 'a6h-expert', 5, 5, 105, 148), (1, 'a6h-werbung', 110, 5, 105, 148),
    (2, 'a7q-expert', 5, 5, 105, 77), (2, 'a7q-werbung', 5, 82, 105, 77),
    (3, 'a7q-preishammer', 5, 5, 105, 77), (3, 'a7q-preishammer-bild', 5, 82, 105, 77),
    (4, 'm-werbung', 5, 5, 115, 152),
    (5, 'm-expert', 5, 5, 115, 152), (5, 'm-preishammer', 120, 5, 115, 152),
    (6, 'm-preishammer-bild', 120, 5, 115, 152),
    (7, 'a5q-preishammer', 5, 5, 210, 148), (8, 'a5q-expert', 5, 5, 210, 148),
    (9, 'a5q-bware', 5, 5, 210, 148), (10, 'a5q-werbung', 5, 5, 210, 148),
    (11, 'a4q-expert', 5, 5, 287, 199), (12, 'a4q-werbung', 5, 5, 287, 199),
    (13, 'a5h-werbung', 5, 5, 148.5, 210.7), (14, 'a5h-expert', 5, 5, 148.5, 210.7),
    (15, 'a4h-werbung', 5, 5, 199, 286.8), (16, 'a4h-expert', 5, 5, 199, 286.8),
]

DYN_IMAGES = {(1000, 327): 'logo', (348, 348): 'qr', (583, 819): 'price', (580, 819): 'price', (508, 523): 'price'}
UVP_TEXTS = {'UVP': 'label', '999,-': 'value', '10%': 'pct', 'SPAREN': 'static', 'sparen!': 'static'}
FONT_STYLE = {  # PDF-Schrift -> Stil auf der Webseite
    'HelveticaNeueLTStd-BlkCn': 'bc', 'HelveticaNeueLTStd-MdCn': 'mc', 'Helvetica': 'sans',
    'HelveticaNeueLTStd-BlkCnO': 'bco',
}
r2 = lambda v: round(v, 2)


def hexcol(c):
    return '#%06x' % c if isinstance(c, int) else '#%02x%02x%02x' % tuple(int(round(v * 255)) for v in c[:3])


def near(a, b, tol=6):
    if not a:
        return False
    return all(abs(int(a[i:i + 2], 16) - int(b[i:i + 2], 16)) <= tol for i in (1, 3, 5))


def font_style(name):
    n = name.split('+')[-1]
    return FONT_STYLE.get(n, 'bc')



PRICE_SIZES = {k for k, v in DYN_IMAGES.items() if v == 'price'}


def strip_forms(t, f):
    """Preis-Formular (enthält die Preis-Bilder samt Kontur) leeren und UVP-Kästen aus den Inhalten entfernen."""
    cells = [(c['w'] / MM, c['h'] / MM) for c in f.get('uvp', {}).get('cells', [])]
    for x in range(1, t.xref_length()):
        try:
            if not t.xref_is_stream(x):
                continue
        except Exception:
            continue
        sub = t.xref_get_key(x, 'Subtype')[1]
        if sub == '/Form':
            res = t.xref_get_key(x, 'Resources/XObject')
            refs = [int(r) for r in re.findall(r'(\d+) 0 R', res[1])]
            if res[0] == 'xref':  # indirektes Wörterbuch
                refs = [int(r) for r in re.findall(r'(\d+) 0 R', t.xref_object(refs[0]))]
            for r in refs:
                w, h = t.xref_get_key(r, 'Width')[1], t.xref_get_key(r, 'Height')[1]
                if w.isdigit() and h.isdigit() and (int(w), int(h)) in PRICE_SIZES:
                    t.update_stream(x, b' ')
                    break
            else:
                pass
        if sub in ('/Form', 'null') and cells:
            st = t.xref_stream(x)
            if not st or b' re' not in st:
                continue
            def kill(m):
                w, h = abs(float(m.group(3))), abs(float(m.group(4)))
                return b'' if any(abs(w - cw) < 0.4 and abs(h - ch) < 0.4 for cw, ch in cells) else m.group(0)
            new = re.sub(rb'(-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) re', kill, st)
            if new != st:
                t.update_stream(x, new)


def build(doc, pno, sid, X, Y, W, H):
    page = doc[pno - 1]
    inside = lambda x, y: -0.5 <= x - X <= W + 0.5 and -0.5 <= y - Y <= H + 0.5
    rel = lambda x, y: (r2(x * MM - X), r2(y * MM - Y))

    # ---------- Texte ----------
    spans = []
    for b in page.get_text('dict')['blocks']:
        if b['type'] != 0:
            continue
        for l in b['lines']:
            for s in l['spans']:
                ox, oy = s['origin'][0] * MM, s['origin'][1] * MM
                if inside(ox, oy):
                    spans.append({**s, 'ox': r2(ox - X), 'oy': r2(oy - Y), 'x1': r2(s['bbox'][2] * MM - X), 'bb': s['bbox']})
    dyn_spans, f = [], {}

    def take(s):
        dyn_spans.append(s)

    def tstyle(s):
        return {'size': r2(s['size'] * MM), 'style': font_style(s['font']), 'color': hexcol(s['color'])}

    grp = [s for s in spans if s['text'].strip() == 'Smartwatch']
    nam = [s for s in spans if s['text'].strip().startswith('APP W')]
    if grp:
        s = grp[0]; take(s)
        f['group'] = {'x': s['ox'], 'base': s['oy'], **tstyle(s)}
    if nam:
        s = nam[0]; take(s)
        f['name'] = {'x': s['ox'], 'base': s['oy'], **tstyle(s)}
    art = [s for s in spans if s['text'].strip().startswith('Art.Nr')]
    num = [s for s in spans if s['text'].strip() == '15260421001']
    blank = [s for s in spans if s['font'].endswith('Helvetica') and s['text'].strip() == '']
    for s in art + num + blank:
        take(s)
    if art:
        a = art[0]
        numx = num[0]['ox'] if num and num[0] is not a else None
        f['artnr'] = {'x': a['ox'], 'base': a['oy'], 'numx': r2(numx - a['ox']) if numx is not None else None, **tstyle(a)}
    bl = [s for s in spans if s['font'].endswith('MdCn')]
    for s in bl:
        take(s)
    # ---------- UVP-Texte ----------
    uvp_t = []
    for s in spans:
        t = s['text'].strip()
        if t in UVP_TEXTS and s not in dyn_spans:
            take(s)
            cx = (s['bb'][0] + s['bb'][2]) / 2 * MM - X
            uvp_t.append({'role': UVP_TEXTS[t], 'text': t, 'cx': r2(cx), 'base': s['oy'], **tstyle(s)})

    # ---------- Bilder ----------
    imgs = []
    for im in page.get_image_info(xrefs=True):
        x0, y0, x1, y1 = [v * MM for v in im['bbox']]
        if inside((x0 + x1) / 2, (y0 + y1) / 2):
            imgs.append({**im, 'r': (r2(x0 - X), r2(y0 - Y), r2(x1 - X), r2(y1 - Y))})
    dyn_imgs = [im for im in imgs if (im['width'], im['height']) in DYN_IMAGES]
    for im in dyn_imgs:
        kind = DYN_IMAGES[(im['width'], im['height'])]
        x0, y0, x1, y1 = im['r']
        if kind in ('logo', 'qr'):
            f[kind] = {'x': x0, 'y': y0, 'w': r2(x1 - x0), 'h': r2(y1 - y0)}
    price_imgs = [im for im in dyn_imgs if DYN_IMAGES[(im['width'], im['height'])] == 'price']

    # ---------- Zeichnungen: Preis-Ziffern, UVP-Kästen ----------
    drawings = page.get_drawings()
    pr = None
    if price_imgs:
        pr = [min(im['r'][0] for im in price_imgs), min(im['r'][1] for im in price_imgs),
              max(im['r'][2] for im in price_imgs), max(im['r'][3] for im in price_imgs)]
    price_ink = None
    uvp_rects = []
    dyn_draw_rects = []
    for d in drawings:
        r = d['rect']
        x0, y0, x1, y1 = r.x0 * MM - X, r.y0 * MM - Y, r.x1 * MM - X, r.y1 * MM - Y
        if not (-0.5 <= (x0 + x1) / 2 <= W + 0.5 and -0.5 <= (y0 + y1) / 2 <= H + 0.5):
            continue
        fill = d.get('fill')
        fc = hexcol(fill) if fill else None
        if pr and pr[0] - 2 <= x0 and x1 <= pr[2] + 2 and pr[1] - 2 <= y0 and y1 <= pr[3] + 2:
            dyn_draw_rects.append(r)
            if near(fc, '#005da9'):
                price_ink = [min(price_ink[0], x0), min(price_ink[1], y0), max(price_ink[2], x1), max(price_ink[3], y1)] if price_ink else [x0, y0, x1, y1]
            continue
        if fc and (near(fc, '#005bab') or near(fc, '#ff7320')) and d['type'] == 'f' and len(d['items']) == 1 and uvp_t:
            # nur Kästen in der Nähe der UVP-Texte
            if any(x0 - 1 <= t['cx'] <= x1 + 1 and y0 - 1 <= t['base'] <= y1 + 1 for t in uvp_t):
                uvp_rects.append({'x': r2(x0), 'y': r2(y0), 'w': r2(x1 - x0), 'h': r2(y1 - y0), 'color': fc})
                dyn_draw_rects.append(r)

    # ---------- Felder ableiten ----------
    if price_ink:
        x0, y0, x1, y1 = price_ink
        # Ziffernhöhe: höchstes Ziffern-Element (ohne ",-")
        digit_h = max(r.y1 - r.y0 for r in [pymupdf.Rect(d['rect']) for d in drawings
                      if d.get('fill') and near(hexcol(d['fill']), '#005da9') and pr and pr[0] * 0 + True] ) * MM if False else None
        digits = [d for d in drawings if d.get('fill') and near(hexcol(d['fill']), '#005da9') and d['type'] == 'f']
        digs = []
        for d in digits:
            r = d['rect']
            rx0, ry0, rx1, ry1 = r.x0 * MM - X, r.y0 * MM - Y, r.x1 * MM - X, r.y1 * MM - Y
            if pr and pr[0] - 2 <= rx0 and rx1 <= pr[2] + 2 and pr[1] - 2 <= ry0 and ry1 <= pr[3] + 2:
                digs.append((rx0, ry0, rx1, ry1))
        cap = max(r[3] - r[1] for r in digs)
        base = max(r[3] for r in digs if (r[3] - r[1]) > cap * 0.9)
        pad = cap * 0.25
        bx, by = r2(x0 - pad), r2(y0 - pad)
        bw, bh = r2(x1 - x0 + 2 * pad), r2(base - y0 + 2 * pad)
        f['price'] = {'x': bx, 'y': by, 'w': bw, 'h': bh, 'cap': r2(cap), 'cx': r2((x0 + x1) / 2 - bx), 'base': r2(base - by),
                      'ink': [r2(x0), r2(y0), r2(x1), r2(y1)]}
    if uvp_rects:
        ux0 = min(r['x'] for r in uvp_rects); uy0 = min(r['y'] for r in uvp_rects)
        ux1 = max(r['x'] + r['w'] for r in uvp_rects); uy1 = max(r['y'] + r['h'] for r in uvp_rects)
        cells = [{**r, 'x': r2(r['x'] - ux0), 'y': r2(r['y'] - uy0)} for r in uvp_rects]
        texts = []
        for t in uvp_t:
            cell = next((c for c in uvp_rects if c['x'] - 0.5 <= t['cx'] <= c['x'] + c['w'] + 0.5 and c['y'] - 0.5 <= t['base'] <= c['y'] + c['h'] + 0.5), None)
            texts.append({**t, 'cx': r2(t['cx'] - ux0), 'base': r2(t['base'] - uy0),
                          'maxw': r2((cell['w'] if cell else (ux1 - ux0)) - 1.2)})
        f['uvp'] = {'x': r2(ux0), 'y': r2(uy0), 'w': r2(ux1 - ux0), 'h': r2(uy1 - uy0), 'cells': cells, 'texts': texts,
                    'comma': any(t['text'] == '999,-' for t in uvp_t)}
    if bl:
        starts = [s for s in bl if s['text'].lstrip().startswith('•')]
        conts = [s for s in bl if not s['text'].lstrip().startswith('•')]
        bases = sorted(set(s['oy'] for s in bl))
        pitch = sorted(b2 - b1 for b1, b2 in zip(bases, bases[1:]))
        pitch = pitch[len(pitch) // 2] if pitch else bl[0]['size'] * MM * 1.2
        bx = min(s['ox'] for s in starts) if starts else min(s['ox'] for s in bl)
        indent = r2(min(s['ox'] for s in conts) - bx) if conts else r2(bl[0]['size'] * MM * 1.3)
        right = max(s['x1'] for s in bl) + 1.0
        top = min(s['oy'] for s in bl)
        # unteres Ende: nächstes Element darunter, das die Spalte überlappt (Preis, UVP, Balken, Kante)
        bottom = H - 1.5
        for o in ([f['price']] if 'price' in f else []) + ([f['uvp']] if 'uvp' in f else []):
            if o['x'] < right and o['x'] + o['w'] > bx and o['y'] > top:
                bottom = min(bottom, o['y'] - 1)
        for d in drawings:
            fill = d.get('fill')
            if fill and near(hexcol(fill), '#f47920') and d['type'] == 'f':
                r = d['rect']; y0 = r.y0 * MM - Y; x0 = r.x0 * MM - X; x1 = r.x1 * MM - X
                if y0 > top and x0 < right and x1 > bx and (r.x1 - r.x0) * MM > W * 0.5:
                    bottom = min(bottom, y0 - 1.5)
        s0 = bl[0]
        f['bullets'] = {'x': r2(bx), 'top': r2(top), 'w': r2(right - bx), 'bottom': r2(bottom), 'indent': indent,
                        'pitch': r2(pitch), **tstyle(s0)}

    # ---------- Hintergrund: Seite ohne veränderliche Inhalte ----------
    tmp = pymupdf.open()
    tmp.insert_pdf(doc, from_page=pno - 1, to_page=pno - 1)
    p2 = tmp[0]
    strip_forms(tmp, f)
    dyn_boxes = [tuple(round(v, 1) for v in im['bbox']) for im in dyn_imgs]
    for im in p2.get_image_info(xrefs=True):
        if (im['width'], im['height']) in DYN_IMAGES and tuple(round(v, 1) for v in im['bbox']) in dyn_boxes and im['xref']:
            p2.delete_image(im['xref'])
    # Preis- und UVP-Bereich komplett leeren (Ziffern, Kontur, Kästen) – große Hintergründe bleiben
    zones = []
    if price_imgs:
        zones.append(pymupdf.Rect(*[v / MM for v in (pr[0] + X - 1, pr[1] + Y - 1, pr[2] + X + 1, pr[3] + Y + 1)]))
    if 'price' in f:
        p = f['price']; zones.append(pymupdf.Rect((p['x'] + X) / MM, (p['y'] + Y) / MM, (p['x'] + p['w'] + X) / MM, (p['y'] + p['h'] + Y) / MM))
    if 'uvp' in f:
        u = f['uvp']; zones.append(pymupdf.Rect((u['x'] + X - 0.5) / MM, (u['y'] + Y - 0.5) / MM, (u['x'] + u['w'] + X + 0.5) / MM, (u['y'] + u['h'] + Y + 0.5) / MM))
    for s in dyn_spans:
        p2.add_redact_annot(pymupdf.Rect(s['bb']), fill=False)
    p2.apply_redactions(images=pymupdf.PDF_REDACT_IMAGE_NONE, graphics=pymupdf.PDF_REDACT_LINE_ART_NONE, text=pymupdf.PDF_REDACT_TEXT_REMOVE)
    # mehrfach, weil MuPDF bei verschachtelten Formularen pro Durchgang nicht alles erwischt
    for _ in range(4):
        for r in [z + (-PADZ, -PADZ, PADZ, PADZ) for z in zones] + [pymupdf.Rect(r) + (-1, -1, 1, 1) for r in dyn_draw_rects]:
            p2.add_redact_annot(pymupdf.Rect(r), fill=False)
        p2.apply_redactions(images=pymupdf.PDF_REDACT_IMAGE_NONE, graphics=pymupdf.PDF_REDACT_LINE_ART_REMOVE_IF_COVERED, text=pymupdf.PDF_REDACT_TEXT_NONE)
    if os.environ.get('DBG') == sid:
        for z in zones: print('zone', [round(v * MM, 1) for v in z])
        for d in p2.get_drawings():
            r = d['rect']
            if any(z.intersects(r) for z in zones) and r.width * MM < 60:
                print('rest', d['type'], d.get('fill'), [round(v * MM, 1) for v in r])
    out = pymupdf.open()
    op = out.new_page(width=W / MM, height=H / MM)
    clip = pymupdf.Rect(X / MM, Y / MM, (X + W) / MM, (Y + H) / MM)
    op.show_pdf_page(op.rect, tmp, 0, clip=clip)
    svg = op.get_svg_image(text_as_path=True)
    svg = re.sub(r'<svg ([^>]*?)width="[^"]*" height="[^"]*"', r'<svg \1width="%smm" height="%smm"' % (W, H), svg, count=1)
    # Reste, die MuPDF in verschachtelten Formularen nicht entfernt: UVP-Kästen (einfache Rechtecke) und Preis-Kontur
    def drop(m):
        el = m.group(0)
        if re.search(r'fill="#(005bab|005bac|ff7320|ff7321)"', el) and re.search(r'd="M[-\d. ]+H[-\d.]+V[-\d.]+H[-\d.]+Z"', el):
            return ''
        sw = re.search(r'stroke-width="([\d.]+)"', el)
        if 'stroke="#ffffff"' in el and 'fill="none"' in el and sw and float(sw.group(1)) > 100:
            return ''
        return el
    svg = re.sub(r'<path [^>]*?/>', drop, svg)
    os.makedirs(BG_DIR, exist_ok=True)
    for ext in ('svg', 'jpg'):
        if os.path.exists(os.path.join(BG_DIR, sid + '.' + ext)):
            os.remove(os.path.join(BG_DIR, sid + '.' + ext))
    if sid.endswith('-bild'):
        # Fotohintergrund mit Masken/Überblendungen: Browser stellen das SVG falsch dar -> Rasterbild in Druckqualität
        bgext = 'jpg'
        op.get_pixmap(dpi=300).pil_save(os.path.join(BG_DIR, sid + '.jpg'), quality=88, optimize=True)
    else:
        bgext = 'svg'
        with open(os.path.join(BG_DIR, sid + '.svg'), 'w') as fh:
            fh.write(svg)
    # Kontrollbild des Hintergrunds
    pymupdf.open(stream=svg.encode(), filetype='svg')[0].get_pixmap(dpi=72).save(os.path.join(HERE, 'bg_' + sid + '.png'))

    fmt, var = sid.split('-', 1)
    fname, fshort = FORMATS[fmt]
    vname, vshort, vdesc = VARIANTS[var]
    return {
        'id': sid, 'name': f'{fname} · {vname}', 'short': f'{fshort}-{vshort}', 'group': fname, 'variant': vname,
        'format': f'{fname}', 'width': W, 'height': H, 'description': vdesc, 'bg': f'/tpl/{sid}.{bgext}', 'fields': f,
        'order': FORMAT_ORDER.index(fmt) * 10 + VARIANT_ORDER.index(var),
    }


doc = pymupdf.open(PDF)
specs = [build(doc, *s) for s in SIGNS]
specs.sort(key=lambda s: s['order'])
for s in specs:
    miss = [k for k in ('group', 'name', 'artnr', 'bullets', 'logo', 'qr', 'uvp', 'price') if k not in s['fields']]
    print(f"{s['id']:22s} {s['name']:32s} {s['width']}×{s['height']}  fehlt: {miss or '-'}  SVG {os.path.getsize(os.path.join(ROOT, 'public', s['bg'][1:])) // 1024} KB")
with open(OUT_JS, 'w') as fh:
    fh.write('/* Vorlagen aus dem PDF des bisherigen Systems – erzeugt mit dev/pdf-vorlagen/gen.py, nicht von Hand ändern. */\n')
    fh.write('window.PT_PDF_SPECS = ' + json.dumps(specs, ensure_ascii=False, separators=(',', ':')) + ';\n')
print('geschrieben:', OUT_JS)
