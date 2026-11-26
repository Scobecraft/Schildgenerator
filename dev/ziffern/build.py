# Baut public/js/price-glyphs.js aus den nachgezeichneten Ziffern
import json, os, re

g = json.load(open('glyphs.json'))
meta = json.load(open('meta.json'))
CAP = meta['bottom'] + 1 - meta['top']
U = 1000 / CAP
order = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0']
ink0 = {n: meta['glyphs'][n]['ink'][0] for n in meta['glyphs']}

def rnd(d):
    return re.sub(r'-?\d+\.\d+', lambda m: str(round(float(m.group()))), d)

out = {'cap': 1000, 'g': {}}
for i, n in enumerate(order):
    # Schrittweite = Abstand der linken Tintenkanten zum nächsten Zeichen im Bild
    nxt = order[i + 1] if i + 1 < len(order) else 'dot'
    adv = (ink0[nxt] - ink0[n]) * U
    out['g'][n] = {'d': rnd(g['glyphs'][n]['d']), 'adv': round(adv), 'w': g['glyphs'][n]['w']}
out['dot'] = {'d': rnd(g['glyphs']['dot']['d']), 'w': g['glyphs']['dot']['w']}
out['dash'] = {'d': rnd(g['glyphs']['dash']['d']), 'dx': round((ink0['dash'] - ink0['dot']) * U), 'w': g['glyphs']['dash']['w']}

js = ('/* Preis-Ziffern, nachgezeichnet aus der Vorlage "1234567890.-" (dev/ziffern-vorlage.png).\n'
      ' * Einheiten: 1000 = Ziffernhöhe, y = 0 auf der Grundlinie, x = 0 an der linken Kante des Zeichens.\n'
      ' * adv = Schrittweite bis zum nächsten Zeichen (aus dem Bild), w = sichtbare Breite. */\n'
      'window.PT_PRICE_GLYPHS = ' + json.dumps(out, separators=(',', ':')) + ';\n')
open(os.path.join(os.path.dirname(__file__), '..', '..', 'public', 'js', 'price-glyphs.js'), 'w').write(js)
print('Größe', len(js), 'Bytes; Schrittweiten:', {n: out['g'][n]['adv'] for n in order}, 'dash.dx', out['dash']['dx'])
