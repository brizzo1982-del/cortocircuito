/* Modello dati dello schema: tipi di elemento, campi, geometria dei terminali. */
(function () {
  'use strict';
  const G = 20; // pixel per modulo di griglia
  const STD_V = [0.23, 0.4, 0.69, 1, 3, 3.3, 6, 6.6, 10, 11, 15, 20, 22, 30, 33, 35, 45, 60, 66, 110, 132, 150, 220, 380];
  const SECTIONS = [1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95, 120, 150, 185, 240, 300, 400, 500, 630];

  function snapV(v) {
    let best = v, bd = 1;
    STD_V.forEach(s => { const d = Math.abs(s - v) / s; if (d < bd) { bd = d; best = s; } });
    return bd < 0.12 ? best : Math.round(v * 1000) / 1000;
  }

  const Y = [['1', 'Sì'], ['0', 'No']];
  const TYPES = {
    rete: {
      label: 'Rete', prefix: 'Rete', fields: [
        { k: 'name', l: 'Nome', t: 'txt' },
        { k: 'livello', l: 'Livello', t: 'sel', opts: [['AT', 'AT (>35 kV)'], ['MT', 'MT (1-35 kV)'], ['BT', 'BT (≤1 kV)']] },
        { k: 'Un', l: 'Tensione nominale', u: 'kV', t: 'n', min: 0 },
        { k: 'Pcc', l: 'Potenza di cortocircuito Pcc (max)', u: 'MVA', t: 'n', min: 0, help: 'Dato del distributore: Sk\'\' massima' },
        { k: 'PccMin', l: 'Pcc minima', u: 'MVA', t: 'n', opt: true, help: 'Vuoto = uguale alla massima' },
        { k: 'rx', l: 'Rapporto R/X della rete', t: 'n', min: 0, help: 'Tipico: 0,1 (MT/AT); 0,3-0,5 (BT)' }
      ], def: { livello: 'MT', Un: 20, Pcc: 250, PccMin: '', rx: 0.1 }
    },
    barra: {
      label: 'Barratura', prefix: 'Barra', fields: [
        { k: 'name', l: 'Nome', t: 'txt' },
        { k: 'Un', l: 'Tensione nominale', u: 'kV', t: 'n', opt: true, help: 'Vuoto = ricavata dalla rete collegata' },
        { k: 'len', l: 'Lunghezza nel disegno', u: 'moduli', t: 'n', min: 2 }
      ], def: { Un: '', len: 8 }
    },
    trasf: {
      label: 'Trasformatore', prefix: 'TR', fields: [
        { k: 'name', l: 'Nome', t: 'txt' },
        { k: 'Sn', l: 'Potenza nominale Sn', u: 'kVA', t: 'n', min: 0 },
        { k: 'V1', l: 'Tensione primaria V1 (terminale alto)', u: 'kV', t: 'n', min: 0 },
        { k: 'V2', l: 'Tensione secondaria V2 (terminale basso)', u: 'kV', t: 'n', min: 0 },
        { k: 'vcc', l: 'Tensione di cortocircuito Vcc', u: '%', t: 'n', min: 0 },
        { k: 'Pcu', l: 'Perdite nel rame Pcu', u: 'kW', t: 'n', min: 0, help: 'Per la componente resistiva' }
      ], def: { Sn: 1000, V1: 20, V2: 0.4, vcc: 6, Pcu: 10.5 }
    },
    gen: {
      label: 'Generatore', prefix: 'GEN', fields: [
        { k: 'name', l: 'Nome', t: 'txt' },
        { k: 'tipo', l: 'Tipo', t: 'sel', opts: [['sinc', 'Rotante sincrono'], ['asinc', 'Rotante asincrono / motore'], ['stat', 'Statico (inverter / FV)']] },
        { k: 'Pn', l: 'Potenza attiva Pn', u: 'kW', t: 'n', min: 0 },
        { k: 'An', l: 'Potenza apparente An', u: 'kVA', t: 'n', min: 0 },
        { k: 'Vn', l: 'Tensione nominale Vn', u: 'kV', t: 'n', min: 0 },
        { k: 'cosfi', l: 'cos φ nominale', t: 'n', min: 0 },
        { k: 'modo', l: 'Dato di cortocircuito', t: 'sel', opts: [['x', 'Reattanza / rapporto'], ['i', 'Icc prodotta (kA)']] },
        { k: 'xd', l: 'Reattanza subtransitoria x\'\'d', u: '%', t: 'n', min: 0, when: p => p.tipo === 'sinc' && p.modo === 'x' },
        { k: 'ilr', l: 'Rapporto Ia/In (rotore bloccato)', t: 'n', min: 0, when: p => p.tipo === 'asinc' && p.modo === 'x' },
        { k: 'kst', l: 'Icc / In (corrente di guasto erogata)', t: 'n', min: 0, when: p => p.tipo === 'stat' && p.modo === 'x' },
        { k: 'icc', l: 'Icc prodotta ai morsetti', u: 'kA', t: 'n', min: 0, when: p => p.modo === 'i' },
        { k: 'pp', l: 'Coppie polari', t: 'n', min: 1, when: p => p.tipo === 'asinc' },
        { k: 'rx', l: 'R/X (vuoto = valore IEC)', t: 'n', opt: true, when: p => p.tipo !== 'stat' },
        { k: 'attivo', l: 'In servizio', t: 'sel', opts: Y },
        { k: 'inMin', l: 'Contribuisce alla Icc minima', t: 'sel', opts: Y }
      ], def: { tipo: 'sinc', Pn: 800, An: 1000, Vn: 0.4, cosfi: 0.8, modo: 'x', xd: 15, ilr: 6, kst: 1.1, icc: 1, pp: 2, rx: '', attivo: '1', inMin: '1' }
    },
    cavo: {
      label: 'Cavo / linea', prefix: 'CV', fields: [
        { k: 'name', l: 'Nome', t: 'txt' },
        { k: 'mat', l: 'Materiale', t: 'sel', opts: [['Cu', 'Rame'], ['Al', 'Alluminio']] },
        { k: 'S', l: 'Sezione', u: 'mm²', t: 'n', min: 0, list: SECTIONS },
        { k: 'L', l: 'Lunghezza', u: 'm', t: 'n', min: 0 },
        { k: 'n', l: 'Cavi in parallelo', t: 'n', min: 1 },
        { k: 'r', l: 'R a 20 °C (vuoto = calcolata)', u: 'Ω/km', t: 'n', opt: true },
        { k: 'x', l: 'X (vuoto = tipica)', u: 'Ω/km', t: 'n', opt: true, help: 'Tipica: 0,08 BT, 0,12 MT' }
      ], def: { mat: 'Cu', S: 95, L: 50, n: 1, r: '', x: '' }
    },
    int: {
      label: 'Interruttore', prefix: 'INT', fields: [
        { k: 'name', l: 'Nome', t: 'txt' },
        { k: 'stato', l: 'Stato', t: 'sel', opts: [['c', 'Chiuso'], ['a', 'Aperto']] }
      ], def: { stato: 'c' }
    }
  };

  const LOCAL = {
    rete: [{ k: 'a', x: 0, y: 0, dx: 0, dy: 1 }],
    gen: [{ k: 'a', x: 0, y: 0, dx: 0, dy: -1 }],
    trasf: [{ k: 'a', x: 0, y: 0, dx: 0, dy: -1 }, { k: 'b', x: 0, y: 4, dx: 0, dy: 1 }],
    cavo: [{ k: 'a', x: 0, y: 0, dx: 0, dy: -1 }, { k: 'b', x: 0, y: 4, dx: 0, dy: 1 }],
    int: [{ k: 'a', x: 0, y: 0, dx: 0, dy: -1 }, { k: 'b', x: 0, y: 3, dx: 0, dy: 1 }],
    barra: []
  };
  const BOX = { // bounding box locale (moduli): x0,y0,x1,y1
    rete: [-1.6, -3.6, 1.6, 0], gen: [-1.6, 0, 1.6, 4.1], trasf: [-1.6, 0, 1.6, 4], cavo: [-0.9, 0, 0.9, 4], int: [-0.9, 0, 0.9, 3]
  };

  function rotv(x, y, rot) {
    switch (rot) { case 90: return [-y, x]; case 180: return [-x, -y]; case 270: return [y, -x]; default: return [x, y]; }
  }
  function terminals(e) {
    return LOCAL[e.type].map(t => {
      const [rx, ry] = rotv(t.x, t.y, e.rot || 0), [dx, dy] = rotv(t.dx, t.dy, e.rot || 0);
      return { k: t.k, x: e.x + rx, y: e.y + ry, dx, dy };
    });
  }
  function barEnds(e) { const len = +e.p.len || 8; return (e.rot || 0) % 180 === 90 ? [e.x, e.y, e.x, e.y + len] : [e.x, e.y, e.x + len, e.y]; }
  function bbox(e) {
    if (e.type === 'barra') { const [a, b, c, d] = barEnds(e); return [Math.min(a, c) - 0.5, Math.min(b, d) - 0.5, Math.max(a, c) + 0.5, Math.max(b, d) + 0.5]; }
    const [x0, y0, x1, y1] = BOX[e.type];
    const p = [rotv(x0, y0, e.rot || 0), rotv(x1, y1, e.rot || 0)];
    return [e.x + Math.min(p[0][0], p[1][0]), e.y + Math.min(p[0][1], p[1][1]), e.x + Math.max(p[0][0], p[1][0]), e.y + Math.max(p[0][1], p[1][1])];
  }

  function newId(model) {
    model.nextId = (model.nextId || 1);
    let id;
    do { id = 'e' + (model.nextId++); } while (model.elements.some(e => e.id === id) || model.wires.some(w => w.id === id));
    return id;
  }
  function uniqueName(model, type) {
    const T = TYPES[type]; let n = model.elements.filter(e => e.type === type).length + 1, name;
    do { name = T.prefix + ' ' + (n++); } while (model.elements.some(e => e.p.name === name));
    return name;
  }
  function create(model, type, x, y) {
    const e = { id: newId(model), type, x, y, rot: 0, p: JSON.parse(JSON.stringify(TYPES[type].def)) };
    e.p.name = uniqueName(model, type);
    return e;
  }
  function emptyProject() {
    return {
      v: 1, nextId: 1, elements: [], wires: [],
      meta: { title: 'Calcolo correnti di cortocircuito', client: '', job: '', author: '', rev: '00', date: new Date().toISOString().slice(0, 10), notes: '' },
      settings: { useC: true, cLV: 1.05, tmin: 0.1, tk: 1, f: 50, thetaMin: 80 }
    };
  }
  const num = (v, d) => { const x = parseFloat(v); return isFinite(x) ? x : d; };
  function summary(e) {
    const p = e.p;
    switch (e.type) {
      case 'rete': return `${p.livello} ${p.Un} kV · ${p.Pcc} MVA`;
      case 'barra': return p.Un ? `${p.Un} kV` : '';
      case 'trasf': return `${p.Sn} kVA ${p.V1}/${p.V2} kV · ${p.vcc}%`;
      case 'gen': return p.tipo === 'stat' ? `${p.An} kVA · inverter` : `${p.An} kVA · ${p.tipo === 'sinc' ? 'sincrono' : 'asincrono'}`;
      case 'cavo': return `${p.n > 1 ? p.n + '×' : ''}${p.S} mm² ${p.mat} · ${p.L} m`;
      case 'int': return p.stato === 'a' ? 'aperto' : 'chiuso';
    }
    return '';
  }

  window.Model = { G, TYPES, SECTIONS, STD_V, snapV, terminals, barEnds, bbox, rotv, create, newId, emptyProject, num, summary };
})();
