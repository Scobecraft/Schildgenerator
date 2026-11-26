Preis-Ziffern aus dev/ziffern-vorlage.png nachzeichnen (im Ordner dev/ziffern ausführen):
  python3 prep.py      # Zeichen trennen, Kanten glätten, vergrößern
  npm i potrace@2.1.8  # einmalig
  node trace.js        # nachzeichnen (potrace)
  python3 build.py     # schreibt public/js/price-glyphs.js
vergleich.html legt die nachgezeichneten Ziffern wie in der Vorlage an (im Browser über den Server aufrufen).
