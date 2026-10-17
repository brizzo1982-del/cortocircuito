/* Motore di calcolo correnti di cortocircuito trifase (IEC 60909-0 / CEI EN 60909).
   Metodo: sorgente di tensione equivalente al punto di guasto, matrice delle impedenze di nodo (Zbus) in per unità
   su Sbase = 100 MVA con tensione di base = Un di ogni nodo (trasformatore ideale 1:1 in p.u.). Indipendente dal DOM. */
(function () {
  'use strict';
  const M = window.Model, num = M.num;
  const SQ3 = Math.sqrt(3), SB = 100; // MVA
  const RHO = { Cu: 1 / 56, Al: 1 / 35 }; // Ω·mm²/m a 20 °C
  const ALPHA = 0.004;
  const hyp = (a, b) => Math.hypot(a, b);

  /* ---- inversione complessa in loco (Gauss-Jordan con pivot parziale) ---- */
  function invert(re, im, n) {
    const piv = new Int32Array(n);
    for (let k = 0; k < n; k++) {
      let p = k, best = -1;
      for (let i = k; i < n; i++) { const v = re[i * n + k] * re[i * n + k] + im[i * n + k] * im[i * n + k]; if (v > best) { best = v; p = i; } }
      if (best < 1e-300) throw new Error('Matrice singolare (rete non collegata a una sorgente)');
      piv[k] = p;
      if (p !== k) for (let j = 0; j < n; j++) {
        let t = re[k * n + j]; re[k * n + j] = re[p * n + j]; re[p * n + j] = t;
        t = im[k * n + j]; im[k * n + j] = im[p * n + j]; im[p * n + j] = t;
      }
      const dr = re[k * n + k], di = im[k * n + k], dd = dr * dr + di * di, ir = dr / dd, ii = -di / dd;
      re[k * n + k] = ir; im[k * n + k] = ii;
      for (let j = 0; j < n; j++) if (j !== k) {
        const a = re[k * n + j], b = im[k * n + j];
        re[k * n + j] = a * ir - b * ii; im[k * n + j] = a * ii + b * ir;
      }
      for (let i = 0; i < n; i++) if (i !== k) {
        const fr = re[i * n + k], fi = im[i * n + k];
        if (fr === 0 && fi === 0) continue;
        re[i * n + k] = -(fr * ir - fi * ii); im[i * n + k] = -(fr * ii + fi * ir);
        const ro = i * n, rk = k * n;
        for (let j = 0; j < n; j++) if (j !== k) {
          const a = re[rk + j], b = im[rk + j];
          re[ro + j] -= fr * a - fi * b; im[ro + j] -= fr * b + fi * a;
        }
      }
    }
    for (let k = n - 1; k >= 0; k--) {
      const p = piv[k];
      if (p !== k) for (let i = 0; i < n; i++) {
        let t = re[i * n + k]; re[i * n + k] = re[i * n + p]; re[i * n + p] = t;
        t = im[i * n + k]; im[i * n + k] = im[i * n + p]; im[i * n + p] = t;
      }
    }
  }

  /* ---- valori tipici ---- */
  function cFactor(S, un, scen) {
    if (!S.useC) return 1;
    if (scen === 'max') return un <= 1 ? S.cLV : 1.10;
    return un <= 1 ? 0.95 : 1.00;
  }
  function cmaxOf(S, un) { return !S.useC ? 1 : (un <= 1 ? S.cLV : 1.10); }
  function rxGen(p, un) {
    const r = num(p.rx, 0);
    if (r > 0) return r;
    if (p.tipo === 'sinc') return un <= 1 ? 0.15 : (num(p.An, 0) < 100000 ? 0.07 : 0.05);
    const mw = num(p.Pn, 0) / 1000 / Math.max(1, num(p.pp, 1));
    return un <= 1 ? 0.42 : (mw >= 1 ? 0.10 : 0.15);
  }
  function muQ(S, ratio, motorMW) {
    const t = S.tmin, x = Math.max(ratio, 0);
    let mu;
    if (t <= 0.02) mu = 0.84 + 0.26 * Math.exp(-0.26 * x);
    else if (t <= 0.05) mu = 0.71 + 0.51 * Math.exp(-0.30 * x);
    else if (t <= 0.1) mu = 0.62 + 0.72 * Math.exp(-0.32 * x);
    else mu = 0.56 + 0.94 * Math.exp(-0.38 * x);
    mu = Math.min(mu, 1);
    if (motorMW == null) return { mu, q: 1 };
    const l = Math.log(Math.max(motorMW, 0.05));
    let q;
    if (t <= 0.02) q = 1.03 + 0.12 * l; else if (t <= 0.05) q = 0.79 + 0.12 * l; else if (t <= 0.1) q = 0.57 + 0.12 * l; else q = 0.26 + 0.10 * l;
    return { mu, q: Math.min(Math.max(q, 0), 1) };
  }

  /* ---- analisi completa ---- */
  function analyze(model) {
    const S = Object.assign({ useC: true, cLV: 1.05, tmin: 0.1, tk: 1, f: 50, thetaMin: 80 }, model.settings || {});
    ['cLV', 'tmin', 'tk', 'f', 'thetaMin'].forEach(k => S[k] = num(S[k], 0));
    const out = { errors: [], warnings: [], nodes: [], res: { max: {}, min: {} }, elems: [], grids: [], settings: S };
    const err = m => out.errors.push(m), warn = m => out.warnings.push(m);
    const E = model.elements, byId = {};
    E.forEach(e => byId[e.id] = e);
    if (!E.length) { err('Lo schema è vuoto.'); return out; }

    /* connettività */
    const parent = new Map();
    const find = k => {
      if (!parent.has(k)) parent.set(k, k);
      let r = k; while (parent.get(r) !== r) r = parent.get(r);
      let c = k; while (parent.get(c) !== r) { const n = parent.get(c); parent.set(c, r); c = n; }
      return r;
    };
    const key = (el, t) => el + ':' + t;
    const wireCount = new Map();
    model.wires.forEach(w => {
      if (!byId[w.a.el] || !byId[w.b.el]) return;
      const ka = key(w.a.el, w.a.t), kb = key(w.b.el, w.b.t);
      const ra = find(ka), rb = find(kb); if (ra !== rb) parent.set(ra, rb);
      wireCount.set(ka, (wireCount.get(ka) || 0) + 1); wireCount.set(kb, (wireCount.get(kb) || 0) + 1);
    });
    const nodeIdx = new Map(), nodes = [];
    const nodeOf = (el, t) => {
      const r = find(key(el, t)); let i = nodeIdx.get(r);
      if (i == null) { i = nodes.length; nodeIdx.set(r, i); nodes.push({ id: i, bars: [], terms: [], Un: null, comp: -1 }); }
      return i;
    };
    const reti = [], gens = [], brs = [];
    E.forEach(e => {
      if (e.type === 'barra') { nodes[nodeOf(e.id, 'b')].bars.push(e); return; }
      const ts = M.terminals(e), ni = ts.map(t => nodeOf(e.id, t.k));
      ts.forEach((t, i) => nodes[ni[i]].terms.push({ e, t: t.k }));
      if (!(wireCount.get(key(e.id, ts[0].k)) > 0) && (e.type === 'rete' || e.type === 'gen')) err(`${e.p.name}: terminale non collegato.`);
      ts.forEach(t => { if (!(wireCount.get(key(e.id, t.k)) > 0) && ni.length > 1) warn(`${e.p.name}: terminale ${t.k === 'a' ? 'alto' : 'basso'} non collegato.`); });
      if (e.type === 'rete') reti.push({ e, n: ni[0] });
      else if (e.type === 'gen') gens.push({ e, n: ni[0] });
      else brs.push({ e, a: ni[0], b: ni[1] });
    });
    const N = nodes.length;
    nodes.forEach(nd => {
      if (nd.bars.length) nd.name = nd.bars.map(b => b.p.name).join(' / ');
      else nd.name = 'Giunzione ' + nd.terms.slice(0, 3).map(t => t.e.p.name).join('-');
      nd.reported = nd.bars.length > 0 || nd.terms.length >= 2;
    });
    /* nomi duplicati */
    const seen = {};
    E.forEach(e => { const n = (e.p.name || '').trim(); if (!n) warn('Elemento senza nome (' + e.type + ').'); else if (seen[n]) warn(`Nome duplicato: "${n}".`); seen[n] = 1; });

    /* tensioni nominali */
    const Un = new Array(N).fill(null);
    const seed = (i, v, who) => {
      if (!(v > 0)) return;
      if (Un[i] == null) Un[i] = v;
      else if (Math.abs(Un[i] - v) / v > 0.01) err(`Tensioni nominali discordanti al nodo "${nodes[i].name}" (${Un[i]} kV / ${v} kV, ${who}).`);
    };
    reti.forEach(r => { seed(r.n, num(r.e.p.Un, 0), r.e.p.name); if (!(num(r.e.p.Pcc, 0) > 0)) err(`${r.e.p.name}: Pcc non valida.`); });
    nodes.forEach(nd => nd.bars.forEach(b => seed(nd.id, num(b.p.Un, 0), b.p.name)));
    const propagate = () => {
      let ch = true;
      while (ch) {
        ch = false;
        brs.forEach(b => {
          const p = b.e.p;
          if (b.e.type === 'trasf') {
            if (Un[b.a] != null && Un[b.b] == null) { Un[b.b] = M.snapV(num(p.V2, 0)); ch = true; }
            else if (Un[b.b] != null && Un[b.a] == null) { Un[b.a] = M.snapV(num(p.V1, 0)); ch = true; }
          } else if (Un[b.a] != null && Un[b.b] == null) { Un[b.b] = Un[b.a]; ch = true; }
          else if (Un[b.b] != null && Un[b.a] == null) { Un[b.a] = Un[b.b]; ch = true; }
        });
      }
    };
    propagate();
    gens.forEach(g => { if (Un[g.n] == null && num(g.e.p.Vn, 0) > 0) { Un[g.n] = M.snapV(num(g.e.p.Vn, 0)); propagate(); } });
    brs.forEach(b => { // trasformatori isolati: usa le tensioni di targa
      if (b.e.type === 'trasf' && Un[b.a] == null && Un[b.b] == null) { Un[b.a] = M.snapV(num(b.e.p.V1, 0)); propagate(); }
    });
    brs.forEach(b => {
      const p = b.e.p, nm = p.name;
      if (b.e.type === 'trasf') {
        ['Sn', 'V1', 'V2', 'vcc'].forEach(k => { if (!(num(p[k], 0) > 0)) err(`${nm}: parametro ${k} non valido.`); });
        if (num(p.vcc, 0) > 0 && num(p.Pcu, 0) / num(p.Sn, 1) >= num(p.vcc, 0) / 100) err(`${nm}: Pcu incompatibile con Vcc.`);
        if (Un[b.a] != null && Math.abs(Un[b.a] / num(p.V1, 1) - 1) > 0.15) warn(`${nm}: tensione del nodo a monte (${Un[b.a]} kV) diversa da V1 (${p.V1} kV). Controllare il verso del trasformatore.`);
        if (Un[b.b] != null && Math.abs(Un[b.b] / num(p.V2, 1) - 1) > 0.15) warn(`${nm}: tensione del nodo a valle (${Un[b.b]} kV) diversa da V2 (${p.V2} kV). Controllare il verso del trasformatore.`);
      } else if (Un[b.a] != null && Un[b.b] != null && Math.abs(Un[b.a] - Un[b.b]) / Un[b.a] > 0.02)
        err(`${nm}: collega nodi a tensioni diverse (${Un[b.a]} kV e ${Un[b.b]} kV): serve un trasformatore.`);
      if (b.e.type === 'cavo') {
        if (!(num(p.S, 0) > 0)) err(`${nm}: sezione non valida.`);
        if (!(num(p.L, 0) > 0)) err(`${nm}: lunghezza non valida.`);
      }
    });
    gens.forEach(g => {
      const p = g.e.p, nm = p.name;
      if (!(num(p.Vn, 0) > 0)) err(`${nm}: tensione nominale non valida.`);
      if (!(num(p.An, 0) > 0)) err(`${nm}: potenza apparente An non valida.`);
      if (p.modo === 'i' && !(num(p.icc, 0) > 0)) err(`${nm}: Icc prodotta non valida.`);
      if (p.modo === 'x') {
        if (p.tipo === 'sinc' && !(num(p.xd, 0) > 0)) err(`${nm}: x''d non valida.`);
        if (p.tipo === 'asinc' && !(num(p.ilr, 0) > 0)) err(`${nm}: Ia/In non valido.`);
        if (p.tipo === 'stat' && !(num(p.kst, 0) > 0)) err(`${nm}: Icc/In non valido.`);
      }
      if (Un[g.n] != null && Math.abs(Un[g.n] / num(p.Vn, 1) - 1) > 0.15) warn(`${nm}: Vn (${p.Vn} kV) diversa dalla tensione del nodo (${Un[g.n]} kV).`);
    });
    nodes.forEach(nd => { if (Un[nd.id] == null && nd.reported) err(`Tensione nominale non determinabile al nodo "${nd.name}": assegnare Un a una barra.`); nd.Un = Un[nd.id]; });
    if (out.errors.length) { out.nodes = nodes; return out; }

    /* componenti connesse (rami chiusi) */
    const adj = nodes.map(() => []);
    brs.forEach(b => { if (b.e.type === 'int' && b.e.p.stato === 'a') return; adj[b.a].push(b.b); adj[b.b].push(b.a); });
    let nc = 0; const comps = [];
    for (let i = 0; i < N; i++) {
      if (nodes[i].comp >= 0) continue;
      const st = [i], list = []; nodes[i].comp = nc;
      while (st.length) { const u = st.pop(); list.push(u); adj[u].forEach(v => { if (nodes[v].comp < 0) { nodes[v].comp = nc; st.push(v); } }); }
      comps.push(list); nc++;
    }
    const compHasSrc = comps.map(() => false);
    reti.forEach(r => compHasSrc[nodes[r.n].comp] = true);
    gens.forEach(g => { if (g.e.p.attivo !== '0' && g.e.p.tipo !== 'stat') compHasSrc[nodes[g.n].comp] = true; });
    comps.forEach((l, ci) => { if (!compHasSrc[ci] && l.some(i => nodes[i].reported)) warn(`Sezione di impianto senza sorgenti (${l.filter(i => nodes[i].reported).map(i => nodes[i].name).slice(0, 3).join(', ')}…): nodi non calcolati.`); });
    gens.forEach(g => { if (g.e.p.attivo !== '0' && g.e.p.tipo === 'stat' && !compHasSrc[nodes[g.n].comp]) warn(`${g.e.p.name}: inverter in una sezione senza sorgenti a tensione (non contribuisce).`); });

    /* scenari */
    const elemSeen = {};
    ['max', 'min'].forEach(sc => {
      const theta = sc === 'max' ? 20 : S.thetaMin, kT = 1 + ALPHA * (theta - 20);
      const brList = [], shList = [], injList = [];
      /* sorgenti */
      reti.forEach(r => {
        const p = r.e.p, un = Un[r.n], c = cFactor(S, un, sc);
        const sk = sc === 'min' && num(p.PccMin, 0) > 0 ? num(p.PccMin, 0) : num(p.Pcc, 1);
        const z = c * SB / sk, rx = num(p.rx, 0.1), x = z / Math.sqrt(1 + rx * rx), rr = rx * x;
        shList.push({ el: r.e, n: r.n, kind: 'rete', z: [rr, x] });
      });
      gens.forEach(g => {
        const p = g.e.p; if (p.attivo === '0') return;
        if (sc === 'min' && p.inMin === '0') return;
        const un = Un[g.n], c = cFactor(S, un, sc), Vn = num(p.Vn, un), An = num(p.An, 1), Ibn = SB / (SQ3 * un);
        if (p.tipo === 'stat') {
          const Ik = p.modo === 'i' ? num(p.icc, 0) : num(p.kst, 1) * An / (SQ3 * Vn) / 1000;
          injList.push({ el: g.e, n: g.n, I: Ik / Ibn, kA: Ik });
          return;
        }
        const rx = rxGen(p, un);
        let z;
        if (p.modo === 'i') z = c * Ibn / num(p.icc, 1);
        else if (p.tipo === 'sinc') {
          const x = num(p.xd, 15) / 100, sphi = Math.sqrt(Math.max(0, 1 - Math.pow(num(p.cosfi, 0.8), 2)));
          const KG = S.useC ? (un / Vn) * c / (1 + x * sphi) : 1;
          z = KG * x * Math.pow(Vn / un, 2) * SB * 1000 / An;
        } else z = (1 / num(p.ilr, 6)) * Math.pow(Vn / un, 2) * SB * 1000 / An;
        const x = z / Math.sqrt(1 + rx * rx);
        shList.push({ el: g.e, n: g.n, kind: p.tipo, z: [rx * x, x], Ir: An / (SQ3 * Vn) / 1000, mw: num(p.Pn, 0) / 1000 / Math.max(1, num(p.pp, 1)) });
      });
      brs.forEach(b => {
        const p = b.e.p;
        if (b.e.type === 'int') { if (p.stato !== 'a') brList.push({ el: b.e, a: b.a, b: b.b, z: [0, 1e-6] }); return; }
        if (b.e.type === 'trasf') {
          const Sn = num(p.Sn, 1), uk = num(p.vcc, 0) / 100, ur = num(p.Pcu, 0) / Sn, ux = Math.sqrt(Math.max(uk * uk - ur * ur, 0));
          const un2 = Un[b.b];
          let K = 1;
          if (S.useC && sc === 'max') K = 0.95 * cmaxOf(S, un2) / (1 + 0.6 * ux);
          const f = K * SB * 1000 / Sn * Math.pow(num(p.V2, un2) / un2, 2);
          brList.push({ el: b.e, a: b.a, b: b.b, z: [ur * f, ux * f], K });
          return;
        }
        const un = Un[b.a] != null ? Un[b.a] : Un[b.b], zb = un * un / SB;
        const rho = RHO[p.mat] || RHO.Cu, S_ = num(p.S, 1), L = num(p.L, 0), np = Math.max(1, num(p.n, 1));
        const r20 = num(p.r, 0) > 0 ? num(p.r, 0) / 1000 : rho / S_; // Ω/m
        const xk = num(p.x, 0) > 0 ? num(p.x, 0) : (un <= 1 ? 0.08 : 0.12);
        const R = r20 * L * kT / np, X = xk / 1000 * L / np;
        brList.push({ el: b.e, a: b.a, b: b.b, z: [R / zb, X / zb], ohm: [R, X] });
      });

      /* elenco impedenze (scenario max) */
      if (sc === 'max') {
        brList.forEach(b => {
          if (b.el.type === 'int') return;
          const un = b.el.type === 'trasf' ? Un[b.b] : (Un[b.a] != null ? Un[b.a] : Un[b.b]), zb = un * un / SB;
          out.elems.push({ id: b.el.id, name: b.el.p.name, type: b.el.type, un, r: b.z[0] * zb, x: b.z[1] * zb, K: b.K || 1 });
        });
        shList.forEach(s => { const zb = Un[s.n] * Un[s.n] / SB; out.elems.push({ id: s.el.id, name: s.el.p.name, type: s.el.type, un: Un[s.n], r: s.z[0] * zb, x: s.z[1] * zb, K: 1 }); });
        injList.forEach(s => out.elems.push({ id: s.el.id, name: s.el.p.name, type: s.el.type, un: Un[s.n], r: null, x: null, I: s.kA }));
      }

      /* risoluzione per componente */
      comps.forEach((list, ci) => {
        const sh = shList.filter(s => nodes[s.n].comp === ci);
        if (!sh.length) return;
        const m = list.length, loc = new Map(); list.forEach((n, i) => loc.set(n, i));
        const re = new Float64Array(m * m), im = new Float64Array(m * m);
        const addY = (i, j, yr, yi) => { re[i * m + j] += yr; im[i * m + j] += yi; };
        const yinv = z => { const d = z[0] * z[0] + z[1] * z[1]; return [z[0] / d, -z[1] / d]; };
        brList.forEach(b => {
          if (nodes[b.a].comp !== ci) return;
          const i = loc.get(b.a), j = loc.get(b.b); if (i === j) return;
          const y = yinv(b.z); addY(i, i, y[0], y[1]); addY(j, j, y[0], y[1]); addY(i, j, -y[0], -y[1]); addY(j, i, -y[0], -y[1]);
        });
        sh.forEach(s => { const y = yinv(s.z); s.y = y; const i = loc.get(s.n); addY(i, i, y[0], y[1]); });
        try { invert(re, im, m); } catch (ex) { warn('Sezione non risolvibile: ' + ex.message); return; }
        const inj = injList.filter(s => nodes[s.n].comp === ci);
        list.forEach(nid => {
          const nd = nodes[nid]; if (!nd.reported) return;
          const f = loc.get(nid), un = Un[nid], cf = cFactor(S, un, sc), Ibf = SB / (SQ3 * un);
          const zr = re[f * m + f], zi = im[f * m + f], zm = hyp(zr, zi);
          const contribs = []; let sr = 0, si = 0;
          sh.forEach(s => {
            const k = loc.get(s.n), zkr = re[k * m + f], zki = im[k * m + f];
            // I = y * c * Zkf / Zff
            const qr = (zkr * zr + zki * zi) / (zm * zm), qi = (zki * zr - zkr * zi) / (zm * zm);
            const ir = cf * (s.y[0] * qr - s.y[1] * qi), ii = cf * (s.y[0] * qi + s.y[1] * qr);
            const mag = hyp(ir, ii);
            contribs.push({ id: s.el.id, name: s.el.p.name, type: s.el.type, kind: s.kind, ipu: mag, ir, ii, kA: mag * Ibf, kAsrc: mag * SB / (SQ3 * Un[s.n]), s });
            sr += ir; si += ii;
          });
          let invSum = 0;
          inj.forEach(s => {
            const k = loc.get(s.n), zk = hyp(re[k * m + f], im[k * m + f]), ipu = s.I * zk / zm;
            contribs.push({ id: s.el.id, name: s.el.p.name, type: s.el.type, kind: 'stat', ipu, ir: ipu, ii: 0, kA: ipu * Ibf, kAsrc: s.kA * (zk / zm) * Ibf / Ibf, inv: true });
            invSum += ipu * Ibf;
          });
          const IkV = hyp(sr, si) * Ibf, Ik = IkV + invSum;
          const rxk = Math.max(zr, 0) / Math.max(zi, 1e-12);
          const kap = 1.02 + 0.98 * Math.exp(-3 * rxk), ip = kap * Math.SQRT2 * Ik;
          let ibRed = 0;
          contribs.forEach(c => {
            let mu = 1, q = 1;
            if (c.kind === 'sinc') mu = muQ(S, c.kAsrc / c.s.Ir).mu;
            else if (c.kind === 'asinc') { const r = muQ(S, c.kAsrc / c.s.Ir, c.s.mw); mu = r.mu; q = r.q; }
            c.mu = mu * q; ibRed += (1 - mu * q) * c.kA;
          });
          const Ib = Math.max(Ik - ibRed, 0);
          const lk = Math.log(kap - 1), tkk = Math.max(S.tk, 0.01), mTh = (Math.exp(4 * S.f * tkk * lk) - 1) / (2 * S.f * tkk * lk);
          const Ith = Ik * Math.sqrt(mTh + 1), zb = un * un / SB;
          const tot = contribs.reduce((a, c) => a + c.kA, 0) || 1;
          contribs.forEach(c => c.share = c.kA / tot * 100);
          out.res[sc][nid] = {
            node: nid, Un: un, c: cf, Ik, ip, Ib, Ith, Ik2: Ik * SQ3 / 2, kappa: kap, RX: rxk, Zk: zm * zb, R: zr * zb, X: zi * zb,
            contribs, siteRe: sr, siteIm: si, Ibf
          };
        });
      });
    });

    /* contributo dell'impianto verso la rete del distributore */
    reti.forEach(r => {
      const g = { id: r.e.id, name: r.e.p.name, node: r.n, nodeName: nodes[r.n].name, Un: Un[r.n] };
      ['max', 'min'].forEach(sc => {
        const rs = out.res[sc][r.n]; if (!rs) return;
        let sr = rs.siteRe, si = rs.siteIm, grid = 0, kinv = 0;
        rs.contribs.forEach(c => { if (c.id === r.e.id) { sr -= c.ir; si -= c.ii; grid = c.kA; } else if (c.inv) kinv += c.kA; });
        const ik = hyp(sr, si) * rs.Ibf + kinv;
        g[sc] = { Ik: ik, ip: rs.kappa * Math.SQRT2 * ik, Ib: Math.max(ik - rs.contribs.reduce((a, c) => a + (c.id === r.e.id ? 0 : (1 - c.mu) * c.kA), 0), 0), S: SQ3 * g.Un * ik, gridIk: grid, totIk: rs.Ik };
      });
      out.grids.push(g);
    });
    out.nodes = nodes;
    return out;
  }

  window.Calc = { analyze, SB };
})();
