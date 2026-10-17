/* Editor grafico SVG dello schema unifilare. */
(function () {
  'use strict';
  const M = window.Model, G = M.G;
  const DARK = { bg: '#0f1419', grid: '#1b242e', fg: '#d5dde6', mut: '#8b9aab', acc: '#4da3ff', bar: '#e6edf3', wire: '#9fb3c8', ok: '#2fb86b', warn: '#e8b021', res: '#7fd1a0' };
  const LIGHT = { bg: '#ffffff', grid: '#ffffff', fg: '#1a2733', mut: '#55636f', acc: '#1f6fc5', bar: '#111111', wire: '#333333', ok: '#2a9d5c', warn: '#c98a00', res: '#0b6b3a' };
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  let svg, world, wiresL, elsL, ovL, gridRect, model, hooks = {};
  let view = { x: 60, y: 60, k: 1 };
  const selE = new Set(), selW = new Set();
  let place = null, locked = false, overlay = {}, showRes = false, undoS = [], redoS = [], clip = null, raf = 0;
  let drag = null, space = false, ghost = null;
  const byId = () => { const m = {}; model.elements.forEach(e => m[e.id] = e); return m; };

  /* ---------- geometria ---------- */
  function endPoint(w, end, other, map) {
    const e = map[end.el]; if (!e) return null;
    if (e.type === 'barra') {
      const [x0, y0, x1, y1] = M.barEnds(e), horiz = y0 === y1, len = +e.p.len || 8, u = Math.min(Math.max(end.u || 0, 0), len);
      const x = horiz ? x0 + u : x0, y = horiz ? y0 : y0 + u;
      let d;
      if (horiz) d = [0, (other && !other.bar && other.dy) ? -other.dy : ((other && other.y < y) ? -1 : 1)];
      else d = [(other && !other.bar && other.dx) ? -other.dx : ((other && other.x < x) ? -1 : 1), 0];
      return { x, y, dx: d[0], dy: d[1], bar: true };
    }
    const t = M.terminals(e).find(t => t.k === end.t); return t ? { x: t.x, y: t.y, dx: t.dx, dy: t.dy } : null;
  }
  function route(p, q) {
    if (p.x === q.x && p.y === q.y) return [[p.x, p.y], [q.x, q.y]];
    const S = 1, pts = [[p.x, p.y]];
    const vert = d => d.dx === 0;
    if (vert(p) && vert(q)) {
      const m = (p.y + q.y) / 2;
      if (p.dy * (m - p.y) > 0 && q.dy * (m - q.y) > 0) pts.push([p.x, m], [q.x, m]);
      else {
        const y1 = p.y + p.dy * S, y2 = q.y + q.dy * S, xm = p.x === q.x ? p.x + 2 : (p.x + q.x) / 2;
        pts.push([p.x, y1], [xm, y1], [xm, y2], [q.x, y2]);
      }
    } else if (!vert(p) && !vert(q)) {
      const m = (p.x + q.x) / 2;
      if (p.dx * (m - p.x) > 0 && q.dx * (m - q.x) > 0) pts.push([m, p.y], [m, q.y]);
      else {
        const x1 = p.x + p.dx * S, x2 = q.x + q.dx * S, ym = p.y === q.y ? p.y + 2 : (p.y + q.y) / 2;
        pts.push([x1, p.y], [x1, ym], [x2, ym], [x2, q.y]);
      }
    } else if (vert(p)) {
      if (p.dy * (q.y - p.y) > 0 && q.dx * (p.x - q.x) > 0) pts.push([p.x, q.y]);
      else pts.push([p.x, p.y + p.dy * S], [q.x + q.dx * S, p.y + p.dy * S], [q.x + q.dx * S, q.y]);
    } else {
      if (p.dx * (q.x - p.x) > 0 && q.dy * (p.y - q.y) > 0) pts.push([q.x, p.y]);
      else pts.push([p.x + p.dx * S, p.y], [p.x + p.dx * S, q.y + q.dy * S], [q.x, q.y + q.dy * S]);
    }
    pts.push([q.x, q.y]);
    return pts;
  }

  /* ---------- disegno ---------- */
  function elSvg(e, C, selected, connected) {
    const p = e.p, f = C.fg, act = !(e.type === 'gen' && p.attivo === '0');
    const st = `stroke="${f}" stroke-width="1.6" fill="none"`;
    let s = '', lab = '';
    const rot = e.rot || 0;
    const txt = (x, y, t, o) => `<text x="${x}" y="${y}" transform="rotate(${-rot} ${x} ${y})" font-size="${o && o.s || 11}" fill="${o && o.c || f}" ${o && o.b ? 'font-weight="600"' : ''} text-anchor="${o && o.a || 'start'}">${esc(t)}</text>`;
    switch (e.type) {
      case 'rete':
        s = `<line x1="0" y1="0" x2="0" y2="${-G}" ${st}/><rect x="${-1.5 * G}" y="${-3.5 * G}" width="${3 * G}" height="${2.5 * G}" ${st}/>` +
          `<path d="M${-0.9 * G} ${-2.2 * G} l${0.4 * G} ${-0.6 * G} l${0.4 * G} ${1.2 * G} l${0.4 * G} ${-1.2 * G} l${0.4 * G} ${0.6 * G}" ${st}/>`;
        lab = txt(1.9 * G, -2.6 * G, p.name, { b: 1 }) + txt(1.9 * G, -2.6 * G + 13, M.summary(e), { c: C.mut, s: 10 });
        break;
      case 'gen': {
        const ch = p.tipo === 'sinc' ? 'G' : p.tipo === 'asinc' ? 'M' : '≈';
        s = `<line x1="0" y1="0" x2="0" y2="${G}" ${st}/>`;
        if (p.tipo === 'stat') s += `<rect x="${-1.4 * G}" y="${G}" width="${2.8 * G}" height="${2.8 * G}" ${st}/><line x1="${-1.4 * G}" y1="${3.8 * G}" x2="${1.4 * G}" y2="${G}" ${st}/>` + txt(-0.5 * G, 2.2 * G + 6, '≈', { s: 12 }) + txt(0.3 * G, 3.3 * G, '=', { s: 12 });
        else s += `<circle cx="0" cy="${2.5 * G}" r="${1.5 * G}" ${st}/>` + txt(0, 2.5 * G + 5, ch, { s: 15, b: 1, a: 'middle' }) + (p.tipo === 'sinc' ? txt(0, 2.5 * G + 17, '~', { s: 11, a: 'middle', c: C.mut }) : '');
        lab = txt(1.9 * G, 2 * G, p.name, { b: 1 }) + txt(1.9 * G, 2 * G + 13, M.summary(e), { c: C.mut, s: 10 });
        break;
      }
      case 'trasf':
        s = `<line x1="0" y1="0" x2="0" y2="${0.3 * G}" ${st}/><circle cx="0" cy="${1.4 * G}" r="${1.1 * G}" ${st}/><circle cx="0" cy="${2.6 * G}" r="${1.1 * G}" ${st}/><line x1="0" y1="${3.7 * G}" x2="0" y2="${4 * G}" ${st}/>`;
        lab = txt(1.9 * G, 1.7 * G, p.name, { b: 1 }) + txt(1.9 * G, 1.7 * G + 13, M.summary(e), { c: C.mut, s: 10 });
        break;
      case 'cavo':
        s = `<line x1="0" y1="0" x2="0" y2="${4 * G}" ${st}/><rect x="${-0.45 * G}" y="${G}" width="${0.9 * G}" height="${2 * G}" fill="${C.bg}" stroke="${f}" stroke-width="1.6"/>`;
        lab = txt(1.2 * G, 1.7 * G, p.name, { b: 1 }) + txt(1.2 * G, 1.7 * G + 13, M.summary(e), { c: C.mut, s: 10 });
        break;
      case 'int': {
        const closed = p.stato !== 'a';
        s = `<line x1="0" y1="0" x2="0" y2="${3 * G}" ${st}/><rect x="${-0.5 * G}" y="${G}" width="${G}" height="${G}" fill="${closed ? f : C.bg}" stroke="${f}" stroke-width="1.6"/>` + (closed ? '' : `<line x1="${-0.5 * G}" y1="${2 * G}" x2="${0.5 * G}" y2="${G}" ${st}/>`);
        lab = txt(1.2 * G, 1.4 * G, p.name, { b: 1 }) + txt(1.2 * G, 1.4 * G + 13, M.summary(e), { c: C.mut, s: 10 });
        break;
      }
      case 'barra': {
        const len = (+p.len || 8) * G;
        s = `<line x1="0" y1="0" x2="${len}" y2="0" stroke="${C.bar}" stroke-width="6" stroke-linecap="butt"/>`;
        const rs = overlay[e.id];
        lab = txt(0, -12, p.name + (p.Un ? '  ' + p.Un + ' kV' : ''), { b: 1 });
        if (showRes && rs) rs.forEach((l, i) => { lab += txt(0, 18 + i * 12, l, { c: C.res, s: 10 }); });
        if (selected) s += `<rect x="${len - 5}" y="-5" width="10" height="10" fill="${C.acc}" data-handle="len" style="cursor:ew-resize"/>`;
        break;
      }
    }
    let hit = '';
    if (e.type === 'barra') hit = `<rect x="-6" y="-9" width="${(+p.len || 8) * G + 12}" height="18" fill="transparent"/>`;
    else { const b = { rete: [-1.6, -3.6, 1.6, 0], gen: [-1.6, 0, 1.6, 4.1], trasf: [-1.6, 0, 1.6, 4], cavo: [-0.9, 0, 0.9, 4], int: [-0.9, 0, 0.9, 3] }[e.type]; hit = `<rect x="${b[0] * G}" y="${b[1] * G}" width="${(b[2] - b[0]) * G}" height="${(b[3] - b[1]) * G}" fill="transparent"/>`; }
    const selr = selected && e.type !== 'barra' ? (() => { const b = { rete: [-1.6, -3.6, 1.6, 0], gen: [-1.6, 0, 1.6, 4.1], trasf: [-1.6, 0, 1.6, 4], cavo: [-0.9, 0, 0.9, 4], int: [-0.9, 0, 0.9, 3] }[e.type]; return `<rect x="${b[0] * G}" y="${b[1] * G}" width="${(b[2] - b[0]) * G}" height="${(b[3] - b[1]) * G}" fill="none" stroke="${C.acc}" stroke-dasharray="4 3"/>`; })() : '';
    const selbar = selected && e.type === 'barra' ? `<rect x="-6" y="-9" width="${(+p.len || 8) * G + 12}" height="18" fill="none" stroke="${C.acc}" stroke-dasharray="4 3"/>` : '';
    let terms = '';
    if (connected !== null) M.terminals(e).forEach(t => {
      const lx = (t.x - e.x) * G, ly = (t.y - e.y) * G; // coordinate nel gruppo non ruotato -> riconvertiamo nel locale
      const [ux, uy] = M.rotv(lx / G, ly / G, (360 - (e.rot || 0)) % 360);
      terms += `<circle cx="${ux * G}" cy="${uy * G}" r="5" fill="${connected.has(e.id + ':' + t.k) ? C.ok : C.warn}" stroke="${C.bg}" stroke-width="1" pointer-events="none"/><circle cx="${ux * G}" cy="${uy * G}" r="11" data-term="${t.k}" fill="transparent" style="cursor:crosshair"/>`;
    });
    return `<g class="el" data-id="${e.id}" data-type="${e.type}" opacity="${act ? 1 : 0.4}" transform="translate(${e.x * G} ${e.y * G}) rotate(${e.rot || 0})">${hit}${selr}${selbar}${s}${lab}${terms}</g>`;
  }
  function content(C, forExport) {
    const map = byId(), conn = new Set();
    const wsvg = model.wires.map(w => {
      const a0 = map[w.a.el], b0 = map[w.b.el]; if (!a0 || !b0) return '';
      const pa = endPoint(w, w.a, null, map), pb = endPoint(w, w.b, null, map); if (!pa || !pb) return '';
      const a = endPoint(w, w.a, pb, map), b = endPoint(w, w.b, pa, map);
      if (a0.type !== 'barra') conn.add(w.a.el + ':' + w.a.t); if (b0.type !== 'barra') conn.add(w.b.el + ':' + w.b.t);
      const pts = route(a, b).map(q => (q[0] * G) + ',' + (q[1] * G)).join(' '), sel = selW.has(w.id);
      return `<g class="wire" data-wid="${w.id}"><polyline points="${pts}" fill="none" stroke="${sel ? C.acc : C.wire}" stroke-width="${sel ? 2.4 : 1.6}"/>` +
        (forExport ? '' : `<polyline class="wirehit" points="${pts}" fill="none" stroke="transparent" stroke-width="10" style="cursor:pointer"/>`) +
        (a.bar ? `<circle cx="${a.x * G}" cy="${a.y * G}" r="3" fill="${C.wire}"/>` : '') + (b.bar ? `<circle cx="${b.x * G}" cy="${b.y * G}" r="3" fill="${C.wire}"/>` : '') + '</g>';
    }).join('');
    const esvg = model.elements.map(e => elSvg(e, C, !forExport && selE.has(e.id), forExport ? null : conn)).join('');
    return { wsvg, esvg };
  }
  function render() {
    if (raf) return; raf = requestAnimationFrame(() => { raf = 0; renderNow(); });
  }
  function renderNow() {
    if (!svg) return;
    const r = svg.getBoundingClientRect();
    world.setAttribute('transform', `translate(${view.x} ${view.y}) scale(${view.k})`);
    gridRect.setAttribute('x', -view.x / view.k); gridRect.setAttribute('y', -view.y / view.k);
    gridRect.setAttribute('width', r.width / view.k); gridRect.setAttribute('height', r.height / view.k);
    const c = content(DARK, false);
    wiresL.innerHTML = c.wsvg; elsL.innerHTML = c.esvg;
  }

  /* ---------- coordinate ---------- */
  function toWorld(ev) { const r = svg.getBoundingClientRect(); return { x: (ev.clientX - r.left - view.x) / view.k, y: (ev.clientY - r.top - view.y) / view.k }; }
  const snap = v => Math.round(v / G);

  /* ---------- storia ---------- */
  const snapshot = () => JSON.stringify({ e: model.elements, w: model.wires, n: model.nextId });
  function pushUndo() { undoS.push(snapshot()); if (undoS.length > 120) undoS.shift(); redoS = []; }
  function restore(s) { const o = JSON.parse(s); model.elements = o.e; model.wires = o.w; model.nextId = o.n; selE.clear(); selW.clear(); changed(true); }
  function undo() { if (locked || !undoS.length) return; redoS.push(snapshot()); restore(undoS.pop()); }
  function redo() { if (locked || !redoS.length) return; undoS.push(snapshot()); restore(redoS.pop()); }
  function changed(structural) { render(); hooks.onChange && hooks.onChange(structural); hooks.onSelect && hooks.onSelect(getSel()); }
  function getSel() { return { els: [...selE].map(id => model.elements.find(e => e.id === id)).filter(Boolean), wires: [...selW] }; }

  /* ---------- azioni ---------- */
  function addEl(type, x, y) {
    const e = M.create(model, type, x, y); if (type === 'barra') e.rot = 0;
    model.elements.push(e); return e;
  }
  function removeSel() {
    if (locked) return;
    if (!selE.size && !selW.size) return;
    pushUndo();
    model.wires = model.wires.filter(w => !selW.has(w.id) && !selE.has(w.a.el) && !selE.has(w.b.el));
    model.elements = model.elements.filter(e => !selE.has(e.id));
    selE.clear(); selW.clear(); changed(true);
  }
  function rotateSel() {
    if (locked || !selE.size) return; pushUndo();
    model.elements.forEach(e => { if (!selE.has(e.id)) return; e.rot = e.type === 'barra' ? (e.rot === 90 ? 0 : 90) : ((e.rot || 0) + 90) % 360; });
    changed(true);
  }
  function copySel() {
    if (!selE.size) return;
    clip = { e: model.elements.filter(e => selE.has(e.id)).map(e => JSON.parse(JSON.stringify(e))), w: model.wires.filter(w => selE.has(w.a.el) && selE.has(w.b.el)).map(w => JSON.parse(JSON.stringify(w))) };
  }
  function paste() {
    if (locked || !clip) return; pushUndo();
    const map = {}; selE.clear(); selW.clear();
    clip.e.forEach(o => {
      const e = JSON.parse(JSON.stringify(o)); map[o.id] = e.id = M.newId(model); e.x += 2; e.y += 2;
      e.p.name = M.TYPES[e.type].prefix + ' ' + (model.elements.filter(x => x.type === e.type).length + 1);
      let n = model.elements.filter(x => x.type === e.type).length + 1; while (model.elements.some(x => x.p.name === e.p.name)) e.p.name = M.TYPES[e.type].prefix + ' ' + (++n);
      model.elements.push(e); selE.add(e.id);
    });
    clip.w.forEach(w => { const c = JSON.parse(JSON.stringify(w)); c.id = M.newId(model); c.a.el = map[c.a.el]; c.b.el = map[c.b.el]; model.wires.push(c); });
    clip = { e: clip.e.map(e => Object.assign({}, e, { x: e.x + 2, y: e.y + 2 })), w: clip.w };
    changed(true);
  }
  function selectAll() { model.elements.forEach(e => selE.add(e.id)); changed(false); }
  function fit() {
    const r = svg.getBoundingClientRect();
    if (!model.elements.length) { view = { x: 60, y: 60, k: 1 }; render(); return; }
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    model.elements.forEach(e => { const b = M.bbox(e); x0 = Math.min(x0, b[0]); y0 = Math.min(y0, b[1]); x1 = Math.max(x1, b[2] + 10); y1 = Math.max(y1, b[3] + 2); });
    const k = Math.min(1.5, Math.max(0.12, Math.min((r.width - 40) / ((x1 - x0) * G), (r.height - 40) / ((y1 - y0) * G))));
    view = { k, x: 20 - x0 * G * k, y: 20 - y0 * G * k }; render();
  }
  function zoom(f, cx, cy) {
    const r = svg.getBoundingClientRect(); cx = cx == null ? r.width / 2 : cx; cy = cy == null ? r.height / 2 : cy;
    const k = Math.min(3, Math.max(0.1, view.k * f)), wx = (cx - view.x) / view.k, wy = (cy - view.y) / view.k;
    view = { k, x: cx - wx * k, y: cy - wy * k }; render();
  }

  /* ---------- eventi ---------- */
  function hitBar(ev) {
    const els = document.elementsFromPoint(ev.clientX, ev.clientY);
    for (const n of els) { const g = n.closest && n.closest('.el'); if (g && g.dataset.type === 'barra') return model.elements.find(e => e.id === g.dataset.id); }
    return null;
  }
  function endFromEvent(ev, selfEnd) {
    const els = document.elementsFromPoint(ev.clientX, ev.clientY);
    for (const n of els) {
      if (n.dataset && n.dataset.term) { const g = n.closest('.el'); return { el: g.dataset.id, t: n.dataset.term }; }
    }
    const b = hitBar(ev);
    if (b) {
      const w = toWorld(ev), horiz = (b.rot || 0) % 180 === 0, u = Math.min(Math.max(Math.round(horiz ? w.x / G - b.x : w.y / G - b.y), 0), +b.p.len || 8);
      return { el: b.id, t: 'b', u };
    }
    return null;
  }
  function onDown(ev) {
    svg.focus();
    const t = ev.target;
    if (ev.button === 1 || ev.button === 2 || space) { drag = { type: 'pan', sx: ev.clientX, sy: ev.clientY, vx: view.x, vy: view.y }; ev.preventDefault(); return; }
    if (ev.button !== 0) return;
    const w = toWorld(ev);
    if (place) {
      if (locked) return;
      pushUndo(); const e = addEl(place, snap(w.x), snap(w.y)); selE.clear(); selW.clear(); selE.add(e.id); changed(true); return;
    }
    if (t.dataset && t.dataset.term && !locked) {
      const g = t.closest('.el'); drag = { type: 'wire', from: { el: g.dataset.id, t: t.dataset.term }, w }; ev.preventDefault(); return;
    }
    if (t.dataset && t.dataset.handle && !locked) { const g = t.closest('.el'); pushUndo(); drag = { type: 'len', id: g.dataset.id }; return; }
    const g = t.closest && t.closest('.el');
    if (g) {
      const id = g.dataset.id, e = model.elements.find(x => x.id === id);
      if (ev.shiftKey && !locked && e.type === 'barra' && ev.altKey) { // connessione da barra
        const horiz = (e.rot || 0) % 180 === 0, u = Math.min(Math.max(Math.round(horiz ? w.x / G - e.x : w.y / G - e.y), 0), +e.p.len || 8);
        drag = { type: 'wire', from: { el: id, t: 'b', u }, w }; return;
      }
      if (ev.shiftKey) { selE.has(id) ? selE.delete(id) : selE.add(id); }
      else if (!selE.has(id)) { selE.clear(); selW.clear(); selE.add(id); }
      changed(false);
      if (!locked) drag = { type: 'move', sx: w.x, sy: w.y, orig: model.elements.filter(x => selE.has(x.id)).map(x => [x.id, x.x, x.y]), moved: false };
      return;
    }
    const wh = t.closest && t.closest('.wire');
    if (wh) { if (!ev.shiftKey) { selE.clear(); selW.clear(); } selW.add(wh.dataset.wid); changed(false); return; }
    if (!ev.shiftKey) { selE.clear(); selW.clear(); changed(false); }
    drag = { type: 'band', sx: w.x, sy: w.y, w, base: ev.shiftKey };
  }
  function onMove(ev) {
    if (place && !drag) { const w = toWorld(ev); ghost = { x: snap(w.x), y: snap(w.y) }; }
    if (!drag) return;
    if (drag.type === 'pan') { view.x = drag.vx + ev.clientX - drag.sx; view.y = drag.vy + ev.clientY - drag.sy; render(); return; }
    const w = toWorld(ev);
    if (drag.type === 'move') {
      const dx = snap(w.x - drag.sx), dy = snap(w.y - drag.sy);
      if (!drag.moved && (dx || dy)) { pushUndo(); drag.moved = true; }
      drag.orig.forEach(([id, x, y]) => { const e = model.elements.find(q => q.id === id); e.x = x + dx; e.y = y + dy; });
      render(); return;
    }
    if (drag.type === 'len') {
      const e = model.elements.find(q => q.id === drag.id), horiz = (e.rot || 0) % 180 === 0;
      e.p.len = Math.max(2, Math.round(horiz ? w.x / G - e.x : w.y / G - e.y)); render(); hooks.onChange && hooks.onChange(true); return;
    }
    if (drag.type === 'wire' || drag.type === 'band') { drag.w = w; drawOverlay(); }
  }
  function drawOverlay() {
    if (!drag) { ovL.innerHTML = ''; return; }
    if (drag.type === 'wire') {
      const map = byId(), a = endPoint(null, drag.from, { x: drag.w.x / G, y: drag.w.y / G }, map);
      if (a) ovL.innerHTML = `<line x1="${a.x * G}" y1="${a.y * G}" x2="${drag.w.x}" y2="${drag.w.y}" stroke="${DARK.acc}" stroke-width="2" stroke-dasharray="5 4" pointer-events="none"/>`;
    } else if (drag.type === 'band') {
      const x = Math.min(drag.sx, drag.w.x), y = Math.min(drag.sy, drag.w.y), w = Math.abs(drag.w.x - drag.sx), h = Math.abs(drag.w.y - drag.sy);
      ovL.innerHTML = `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="rgba(77,163,255,.12)" stroke="${DARK.acc}" pointer-events="none"/>`;
    }
  }
  function onUp(ev) {
    if (!drag) return; const d = drag; drag = null; ovL.innerHTML = '';
    if (d.type === 'move') { if (d.moved) changed(true); return; }
    if (d.type === 'len') { changed(true); return; }
    if (d.type === 'wire') {
      const to = endFromEvent(ev);
      if (!to || (to.el === d.from.el && to.t === d.from.t)) return;
      if (to.el === d.from.el) return;
      if (model.wires.some(w => (w.a.el === d.from.el && w.a.t === d.from.t && w.b.el === to.el && w.b.t === to.t && (w.b.u || 0) === (to.u || 0)) || (w.b.el === d.from.el && w.b.t === d.from.t && w.a.el === to.el && w.a.t === to.t))) return;
      pushUndo(); model.wires.push({ id: M.newId(model), a: d.from, b: to }); changed(true); return;
    }
    if (d.type === 'band') {
      const x0 = Math.min(d.sx, d.w.x) / G, x1 = Math.max(d.sx, d.w.x) / G, y0 = Math.min(d.sy, d.w.y) / G, y1 = Math.max(d.sy, d.w.y) / G;
      if (x1 - x0 < 0.3 && y1 - y0 < 0.3) return;
      model.elements.forEach(e => { const b = M.bbox(e); if (b[0] >= x0 && b[2] <= x1 && b[1] >= y0 && b[3] <= y1) selE.add(e.id); });
      changed(false);
    }
  }
  function onKey(ev) {
    const tg = ev.target.tagName; if (tg === 'INPUT' || tg === 'SELECT' || tg === 'TEXTAREA') return;
    const k = ev.key.toLowerCase(), ctrl = ev.ctrlKey || ev.metaKey;
    if (k === ' ') { space = true; ev.preventDefault(); return; }
    if (k === 'escape') { place = null; hooks.onPlace && hooks.onPlace(null); selE.clear(); selW.clear(); changed(false); }
    else if (k === 'delete' || k === 'backspace') { removeSel(); ev.preventDefault(); }
    else if (k === 'r' && !ctrl) rotateSel();
    else if (ctrl && k === 'z') { ev.shiftKey ? redo() : undo(); ev.preventDefault(); }
    else if (ctrl && k === 'y') { redo(); ev.preventDefault(); }
    else if (ctrl && k === 'c') copySel();
    else if (ctrl && k === 'x') { copySel(); removeSel(); }
    else if (ctrl && k === 'v') { paste(); ev.preventDefault(); }
    else if (ctrl && k === 'a') { selectAll(); ev.preventDefault(); }
    else if (k.startsWith('arrow') && selE.size && !locked) {
      pushUndo(); const d = { arrowleft: [-1, 0], arrowright: [1, 0], arrowup: [0, -1], arrowdown: [0, 1] }[k];
      model.elements.forEach(e => { if (selE.has(e.id)) { e.x += d[0]; e.y += d[1]; } }); changed(true); ev.preventDefault();
    }
  }

  /* ---------- API ---------- */
  function init(root, h) {
    hooks = h || {};
    root.innerHTML = `<svg tabindex="0" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;display:block;background:${DARK.bg};outline:none;touch-action:none;user-select:none"><defs><pattern id="gpat" width="${G}" height="${G}" patternUnits="userSpaceOnUse"><circle cx="0" cy="0" r="1" fill="#2b3845"/></pattern></defs><g id="world"><rect id="grect" fill="url(#gpat)" pointer-events="none"/><g id="wl"></g><g id="el"></g><g id="ov"></g></g></svg>`;
    svg = root.firstChild; world = svg.querySelector('#world'); gridRect = svg.querySelector('#grect'); wiresL = svg.querySelector('#wl'); elsL = svg.querySelector('#el'); ovL = svg.querySelector('#ov');
    svg.addEventListener('pointerdown', onDown); window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp);
    svg.addEventListener('contextmenu', e => e.preventDefault());
    svg.addEventListener('wheel', ev => { ev.preventDefault(); const r = svg.getBoundingClientRect(); zoom(Math.pow(1.0015, -ev.deltaY), ev.clientX - r.left, ev.clientY - r.top); }, { passive: false });
    svg.addEventListener('keydown', onKey); window.addEventListener('keyup', e => { if (e.key === ' ') space = false; });
    document.addEventListener('keydown', e => { if (!svg.isConnected || svg.offsetParent === null) return; if (document.activeElement === document.body) onKey(e); });
    new ResizeObserver(render).observe(root);
  }
  function setModel(m) { model = m; selE.clear(); selW.clear(); undoS = []; redoS = []; overlay = {}; render(); hooks.onSelect && hooks.onSelect(getSel()); }
  function setPlace(t) { place = t; svg && (svg.style.cursor = t ? 'copy' : 'default'); }

  /* esportazione immagine (sfondo bianco) */
  function exportSvg(withResults) {
    const sv = showRes; showRes = !!withResults;
    const c = content(LIGHT, true); showRes = sv;
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    model.elements.forEach(e => { const b = M.bbox(e); x0 = Math.min(x0, b[0] - 1); y0 = Math.min(y0, b[1] - 2); x1 = Math.max(x1, b[2] + 12); y1 = Math.max(y1, b[3] + 5); });
    if (x0 > x1) { x0 = 0; y0 = 0; x1 = 10; y1 = 10; }
    const w = (x1 - x0) * G, h = (y1 - y0) * G;
    return { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${x0 * G} ${y0 * G} ${w} ${h}" font-family="Arial, Helvetica, sans-serif"><rect x="${x0 * G}" y="${y0 * G}" width="${w}" height="${h}" fill="#fff"/>${c.wsvg}${c.esvg}</svg>`, w, h };
  }
  function exportImage(type, withResults, maxW) {
    return new Promise((res, rej) => {
      const o = exportSvg(withResults), k = Math.min(3, (maxW || 2400) / o.w), img = new Image();
      img.onload = () => {
        const cv = document.createElement('canvas'); cv.width = Math.round(o.w * k); cv.height = Math.round(o.h * k);
        const cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height); cx.drawImage(img, 0, 0, cv.width, cv.height);
        cv.toBlob(b => b.arrayBuffer().then(buf => res({ bytes: new Uint8Array(buf), w: cv.width, h: cv.height, type })), type === 'png' ? 'image/png' : 'image/jpeg', 0.92);
      };
      img.onerror = () => rej(new Error('Impossibile generare l\'immagine dello schema'));
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(o.svg);
    });
  }
  window.Editor = {
    init, setModel, render, renderNow, setPlace, undo, redo, rotateSel, removeSel, copySel, paste, selectAll, fit, zoom,
    setLocked: v => { locked = v; render(); }, setOverlay: (o, show) => { overlay = o || {}; showRes = show; render(); }, setShowRes: v => { showRes = v; render(); },
    select: ids => { selE.clear(); selW.clear(); ids.forEach(i => selE.add(i)); changed(false); },
    centerOn(id) { const e = model.elements.find(x => x.id === id); if (!e || !svg) return; const r = svg.getBoundingClientRect(); view.x = r.width / 2 - e.x * G * view.k; view.y = r.height / 2 - e.y * G * view.k; render(); },
    changed, pushUndo, exportImage, exportSvg, getSel, canUndo: () => undoS.length, canRedo: () => redoS.length
  };
})();
