Vorlagen aus dem PDF des bisherigen Schild-Systems
==================================================

  pip install pymupdf
  python3 gen.py /pfad/zu/preisschild.pdf

Für jedes Schild (Liste SIGNS in gen.py: Seite, id, Ecke links oben und Größe in mm):
  1. Felder auslesen: Logo, QR, Warengruppe, Name, Art.Nr., Eigenschaften, UVP-Box, Preis
     (Position, Grundlinie, Schriftgröße, Farbe, Zeilenabstand) -> public/js/tpl-specs.js
  2. veränderliche Inhalte entfernen (Bilder, Texte, Preis-Formular, UVP-Kästen)
  3. Rest als Hintergrund speichern -> public/tpl/<id>.svg (Text als Pfade, keine Schriftdateien)
     bzw. <id>.jpg (300 dpi) bei Fotohintergründen ("-bild"), weil Browser deren Masken im SVG falsch zeigen

Neue Schilder: Eintrag in SIGNS ergänzen (Format-/Kopf-Kürzel in FORMATS/VARIANTS), Skript erneut laufen lassen.
Das PDF selbst gehört nicht ins Repository.
