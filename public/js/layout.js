/* Ordnet Schilder platzsparend auf Druckbögen an (MaxRects, mit Drehen).
 * Pro Bogen wird Hoch- und Querformat probiert und das genommen, auf das mehr Schilder passen.
 */
(function () {
  const PAPER = {
    A4: { w: 210, h: 297, label: 'A4' },
    A3: { w: 297, h: 420, label: 'A3' },
  };

  function packOne(sheetW, sheetH, items, opt) {
    const gap = opt.gap || 0;
    const m = opt.margin || 0;
    // Freie Rechtecke (mit Abstand: jedes Teil "reserviert" w+gap/h+gap)
    let free = [{ x: m, y: m, w: sheetW - 2 * m + gap, h: sheetH - 2 * m + gap }];
    const placed = [];
    const rest = [];
    const EPS = 1e-6;

    for (const it of items) {
      let best = null;
      const variants = [{ w: it.w, h: it.h, rot: false }];
      if (opt.rotate && Math.abs(it.w - it.h) > EPS) variants.push({ w: it.h, h: it.w, rot: true });
      for (const fr of free) {
        for (const v of variants) {
          const W = v.w + gap, H = v.h + gap;
          if (W <= fr.w + EPS && H <= fr.h + EPS) {
            const shortSide = Math.min(fr.w - W, fr.h - H);
            const longSide = Math.max(fr.w - W, fr.h - H);
            // Bevorzugt oben-links, dann beste Passform -> ordentliches Raster
            const score = [fr.y, fr.x, shortSide, longSide];
            if (!best || cmp(score, best.score) < 0) best = { x: fr.x, y: fr.y, v, score };
          }
        }
      }
      if (!best) { rest.push(it); continue; }
      const r = { x: best.x, y: best.y, w: best.v.w + gap, h: best.v.h + gap };
      placed.push({ item: it, x: best.x, y: best.y, w: best.v.w, h: best.v.h, rot: best.v.rot });
      // Freie Rechtecke aufteilen
      const next = [];
      for (const fr of free) {
        if (r.x >= fr.x + fr.w - EPS || r.x + r.w <= fr.x + EPS || r.y >= fr.y + fr.h - EPS || r.y + r.h <= fr.y + EPS) { next.push(fr); continue; }
        if (r.x > fr.x + EPS) next.push({ x: fr.x, y: fr.y, w: r.x - fr.x, h: fr.h });
        if (r.x + r.w < fr.x + fr.w - EPS) next.push({ x: r.x + r.w, y: fr.y, w: fr.x + fr.w - (r.x + r.w), h: fr.h });
        if (r.y > fr.y + EPS) next.push({ x: fr.x, y: fr.y, w: fr.w, h: r.y - fr.y });
        if (r.y + r.h < fr.y + fr.h - EPS) next.push({ x: fr.x, y: r.y + r.h, w: fr.w, h: fr.y + fr.h - (r.y + r.h) });
      }
      // Enthaltene Rechtecke entfernen
      free = next.filter((a, i) => !next.some((b, j) => j !== i && a.x >= b.x - EPS && a.y >= b.y - EPS && a.x + a.w <= b.x + b.w + EPS && a.y + a.h <= b.y + b.h + EPS && (j < i || a.w !== b.w || a.h !== b.h || a.x !== b.x || a.y !== b.y)));
    }
    return { placed, rest };
  }

  function cmp(a, b) {
    for (let i = 0; i < a.length; i++) { if (Math.abs(a[i] - b[i]) > 1e-6) return a[i] - b[i]; }
    return 0;
  }

  // Zentriert die belegte Fläche auf dem Bogen (sieht ordentlicher aus, gleichmäßiger Rand)
  function center(page, opt) {
    if (!page.items.length) return;
    const minX = Math.min(...page.items.map((p) => p.x)), minY = Math.min(...page.items.map((p) => p.y));
    const maxX = Math.max(...page.items.map((p) => p.x + p.w)), maxY = Math.max(...page.items.map((p) => p.y + p.h));
    const dx = (page.w - (maxX - minX)) / 2 - minX;
    const dy = (page.h - (maxY - minY)) / 2 - minY;
    page.items.forEach((p) => { p.x += dx; p.y += dy; });
  }

  /**
   * items: [{ id, w, h }] (bereits nach Menge vervielfacht)
   * opt: { paper: 'A4'|'A3', margin, gap, rotate }
   */
  function arrange(items, opt) {
    const paper = PAPER[opt.paper] || PAPER.A4;
    const sorted = items.map((it, i) => ({ ...it, _i: i }))
      .sort((a, b) => (b.w * b.h - a.w * a.h) || (a._i - b._i));
    const pages = [];
    const tooBig = [];
    let remaining = sorted;
    let guard = 0;
    while (remaining.length && guard++ < 1000) {
      const portrait = packOne(paper.w, paper.h, remaining, opt);
      const landscape = packOne(paper.h, paper.w, remaining, opt);
      const rots = (r) => r.placed.filter((x) => x.rot).length;
      const useL = landscape.placed.length > portrait.placed.length ||
        (landscape.placed.length === portrait.placed.length && rots(landscape) < rots(portrait));
      const res = useL ? landscape : portrait;
      if (!res.placed.length) { tooBig.push(...remaining); break; }
      // innerhalb der Seite in Originalreihenfolge lesen
      res.placed.sort((a, b) => (a.y - b.y) || (a.x - b.x));
      const page = { w: useL ? paper.h : paper.w, h: useL ? paper.w : paper.h, landscape: useL, items: res.placed.map((p) => ({ id: p.item.id, tag: p.item.tag, x: p.x, y: p.y, w: p.w, h: p.h, rot: p.rot, tw: p.item.w, th: p.item.h })) };
      center(page, opt);
      pages.push(page);
      remaining = res.rest;
    }
    return { pages, tooBig, paper };
  }

  window.SheetLayout = { arrange, PAPER };
})();
