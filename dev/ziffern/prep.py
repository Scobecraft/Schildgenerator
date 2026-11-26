# Zerlegt das Ziffern-Bild in einzelne Zeichen und erzeugt geglättete, vergrößerte Masken zum Nachzeichnen.
import json
from collections import deque
from PIL import Image, ImageFilter

import os
SRC = os.path.join(os.path.dirname(__file__), '..', 'ziffern-vorlage.png')
UP = 10  # Vergrößerung vor dem Nachzeichnen

im = Image.open(SRC).convert('RGBA')
bg = Image.new('RGBA', im.size, (255, 255, 255, 255))
bg.alpha_composite(im)
im = bg.convert('RGB')
W, H = im.size
px = im.load()

def is_blue(p):
    r, g, b = p
    return b > 120 and r < 80 and g < 140 and b - r > 80

# Deckung (0..1) aus dem Rotkanal: Blau hat R≈0, Weiß R=255 -> weiche Kanten bleiben erhalten
cov = [[0.0] * W for _ in range(H)]
for y in range(H):
    for x in range(W):
        r, g, b = px[x, y]
        if b > r + 30:  # bläulich (Kante zwischen Blau und Weiß)
            cov[y][x] = max(0.0, min(1.0, (255 - r) / 255))

# zusammenhängende blaue Kerne
label = [[-1] * W for _ in range(H)]
comps = []
for y in range(H):
    for x in range(W):
        if label[y][x] == -1 and is_blue(px[x, y]):
            q = deque([(x, y)]); label[y][x] = len(comps); pts = []
            while q:
                cx, cy = q.popleft(); pts.append((cx, cy))
                for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                    if 0 <= nx < W and 0 <= ny < H and label[ny][nx] == -1 and is_blue(px[nx, ny]):
                        label[ny][nx] = len(comps); q.append((nx, ny))
            comps.append(pts)
comps = [c for c in comps if len(c) > 30]
comps.sort(key=lambda c: min(p[0] for p in c))
names = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', 'dot', 'dash']
assert len(comps) == 12, len(comps)

# Kantenpixel (teilweise Deckung) dem nächstgelegenen Kern zuordnen (Abstand <= 3)
owner = {}
for i, c in enumerate(comps):
    for (x, y) in c:
        owner[(x, y)] = i
frontier = deque(owner.keys())
dist = {k: 0 for k in owner}
while frontier:
    x, y = frontier.popleft()
    d = dist[(x, y)]
    if d >= 3:
        continue
    for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
        if 0 <= nx < W and 0 <= ny < H and (nx, ny) not in owner and cov[ny][nx] > 0.02:
            owner[(nx, ny)] = owner[(x, y)]
            dist[(nx, ny)] = d + 1
            frontier.append((nx, ny))

top = min(min(p[1] for p in comps[i]) for i in range(10))
bottom = max(max(p[1] for p in comps[i]) for i in range(10))
meta = {'top': top, 'bottom': bottom, 'up': UP, 'glyphs': {}}
for i, name in enumerate(names):
    xs = [p[0] for p in comps[i]]; ys = [p[1] for p in comps[i]]
    x0, y0, x1, y1 = min(xs) - 4, min(ys) - 4, max(xs) + 4, max(ys) + 4
    w, h = x1 - x0 + 1, y1 - y0 + 1
    g = Image.new('L', (w, h), 255)
    gp = g.load()
    for (x, y), o in owner.items():
        if o == i and x0 <= x <= x1 and y0 <= y <= y1:
            gp[x - x0, y - y0] = int(255 * (1 - max(cov[y][x], 1.0 if is_blue(px[x, y]) else 0)))
    big = g.resize((w * UP, h * UP), Image.BICUBIC).filter(ImageFilter.GaussianBlur(UP * 0.35))
    big = big.point(lambda v: 0 if v < 128 else 255)
    big.save(f'g_{name}.png')
    # Tinten-Profil (links/rechts je Zeile) für den optischen Abstand, in Original-Pixeln
    rows = {}
    for (x, y), o in owner.items():
        if o == i and (cov[y][x] > 0.5 or is_blue(px[x, y])):
            l, r = rows.get(y, (x, x))
            rows[y] = (min(l, x), max(r, x + 1))
    meta['glyphs'][name] = {'x0': x0, 'y0': y0, 'w': w, 'h': h,
                            'ink': [min(xs), min(ys), max(xs) + 1, max(ys) + 1],
                            'rows': {str(k): v for k, v in rows.items()}}
json.dump(meta, open('meta.json', 'w'))
print('top', top, 'bottom', bottom, 'Zeichen:', ', '.join(f"{n}:{meta['glyphs'][n]['ink']}" for n in names))
