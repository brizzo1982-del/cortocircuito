/* Costruzione dei contenuti per Excel, PDF e relazione tecnica a partire da progetto e risultati. */
(function () {
  'use strict';
  const M = window.Model;
  const TL = { rete: 'Rete', barra: 'Barratura', trasf: 'Trasformatore', gen: 'Generatore', cavo: 'Cavo', int: 'Interruttore' };
  const GT = { sinc: 'sincrono', asinc: 'asincrono', stat: 'statico' };
  const f = (x, d) => (x == null || !isFinite(x)) ? '-' : Number(x).toLocaleString('it-IT', { minimumFractionDigits: d == null ? 2 : d, maximumFractionDigits: d == null ? 2 : d });
  const fi = x => (x == null || !isFinite(x)) ? '' : x;
  function reported(R) { return R.nodes.filter(n => n.reported && R.res.max[n.id]).sort((a, b) => (b.Un - a.Un) || a.name.localeCompare(b.name, 'it', { numeric: true })); }
  function srcName(c) { return c.name + ' (' + (TL[c.type] || c.type) + (c.type === 'gen' ? ' ' + GT[c.kind === 'stat' ? 'stat' : c.kind] : '') + ')'; }
  function today(P) { const d = P.meta.date ? new Date(P.meta.date) : new Date(); return isNaN(d) ? '' : d.toLocaleDateString('it-IT'); }

  function nodeRows(R, pdf) {
    return reported(R).map(n => {
      const a = R.res.max[n.id], b = R.res.min[n.id];
      return [n.name, f(n.Un, 3), f(a.Ik), f(a.ip), f(a.Ib), f(a.Ith), f(a.Ik2), f(a.RX, 3), f(a.Zk * 1000, 2), b ? f(b.Ik) : '-', b ? f(b.Ik2) : '-'];
    });
  }
  function headNodes(R) {
    return ['Nodo', 'Un [kV]', "Ik''max [kA]", 'ip [kA]', 'Ib [kA]', `Ith ${R.settings.tk} s [kA]`, 'Ik2max [kA]', 'R/X', 'Zk [mΩ]', "Ik''min [kA]", 'Ik2min [kA]'];
  }
  function gridRows(R) {
    return R.grids.map(g => {
      const a = g.max, b = g.min;
      return [g.name, g.nodeName, f(g.Un, 3), a ? f(a.Ik) : '-', a ? f(a.ip) : '-', a ? f(a.Ib) : '-', a ? f(a.S, 1) : '-', b ? f(b.Ik) : '-', b ? f(b.S, 1) : '-', a ? f(a.gridIk) : '-'];
    });
  }
  const gridHead = ['Rete', 'Nodo di consegna', 'Un [kV]', "I''k impianto→rete max [kA]", 'ip [kA]', 'Ib [kA]', 'S [MVA]', "I''k impianto→rete min [kA]", 'S min [MVA]', "I''k da rete max [kA]"];

  /* ---------- Excel ---------- */
  function sheets(P, R) {
    const S = R.settings, out = [];
    const sum = [[{ v: P.meta.title || 'Calcolo correnti di cortocircuito', s: 'title' }], [],
      ['Committente', P.meta.client], ['Commessa', P.meta.job], ['Progettista', P.meta.author], ['Revisione', P.meta.rev], ['Data', today(P)], [],
      [{ v: 'Impostazioni di calcolo', s: 'bold' }],
      ['Norma', 'CEI EN 60909-0 (IEC 60909-0), guasto trifase e bifase'], ['Fattore di tensione c', S.useC ? `Applicato (BT: cmax ${f(S.cLV)}, cmin 0,95; MT/AT: cmax 1,10, cmin 1,00); KT e KG applicati` : 'Non applicato (c = 1, KT = KG = 1)'],
      ['Potenza di base', M.num(100) + ' MVA'], ['Ritardo minimo di apertura tmin', S.tmin + ' s'], ['Durata del guasto per Ith', S.tk + ' s'], ['Frequenza', S.f + ' Hz'], ['Temperatura conduttori (Icc minima)', S.thetaMin + ' °C'], [],
      [{ v: 'Note', s: 'bold' }], [P.meta.notes || '']];
    out.push({ name: 'Riepilogo', widths: [34, 90], rows: sum });
    const head = headNodes(R).map(h => ({ v: h, s: 'head' }));
    const rows = [head];
    reported(R).forEach(n => {
      const a = R.res.max[n.id], b = R.res.min[n.id];
      rows.push([{ v: n.name }, { v: n.Un, s: 'n3' }, { v: a.Ik, s: 'n2' }, { v: a.ip, s: 'n2' }, { v: a.Ib, s: 'n2' }, { v: a.Ith, s: 'n2' }, { v: a.Ik2, s: 'n2' }, { v: a.RX, s: 'n3' }, { v: a.Zk * 1000, s: 'n2' }, b ? { v: b.Ik, s: 'n2' } : '', b ? { v: b.Ik2, s: 'n2' } : '']);
    });
    out.push({ name: 'Nodi', widths: [30, 9, 13, 11, 11, 13, 12, 8, 11, 13, 12], freeze: 1, rows });
    const cr = [['Nodo', 'Scenario', 'Sorgente', 'Tipo', 'I al nodo [kA]', 'I alla sorgente [kA]', 'Quota [%]', 'Fattore μ·q (Ib)'].map(h => ({ v: h, s: 'head' }))];
    reported(R).forEach(n => ['max', 'min'].forEach(sc => {
      const r = R.res[sc][n.id]; if (!r) return;
      r.contribs.slice().sort((a, b) => b.kA - a.kA).forEach(c => cr.push([n.name, sc === 'max' ? 'Massima' : 'Minima', c.name, TL[c.type] + (c.type === 'gen' ? ' ' + GT[c.kind] : ''), { v: c.kA, s: 'n3' }, { v: c.kAsrc, s: 'n3' }, { v: c.share, s: 'n1' }, { v: c.mu, s: 'n3' }]));
    }));
    out.push({ name: 'Contributi', widths: [30, 10, 28, 20, 14, 18, 10, 14], freeze: 1, rows: cr });
    const gr = [gridHead.map(h => ({ v: h, s: 'head' }))];
    R.grids.forEach(g => { const a = g.max, b = g.min; gr.push([g.name, g.nodeName, { v: g.Un, s: 'n3' }, a ? { v: a.Ik, s: 'n2' } : '', a ? { v: a.ip, s: 'n2' } : '', a ? { v: a.Ib, s: 'n2' } : '', a ? { v: a.S, s: 'n1' } : '', b ? { v: b.Ik, s: 'n2' } : '', b ? { v: b.S, s: 'n1' } : '', a ? { v: a.gridIk, s: 'n2' } : '']); });
    gr.push([], [{ v: 'Contributo dell\'impianto al guasto sul nodo di consegna, escluso il contributo della rete del distributore stessa. Il calcolo include generatori, motori e inverter attivi.', s: 'note' }]);
    out.push({ name: 'Verso rete distributore', widths: [18, 28, 9, 22, 11, 11, 11, 22, 12, 18], freeze: 1, rows: gr });
    const er = [['Nome', 'Tipo', 'Dati', 'Un nodo [kV]', 'R [Ω]', 'X [Ω]', 'KT'].map(h => ({ v: h, s: 'head' }))];
    P.elements.filter(e => e.type !== 'barra').forEach(e => {
      const z = R.elems.find(q => q.id === e.id);
      er.push([e.p.name, TL[e.type], M.summary(e), z ? { v: z.un, s: 'n3' } : '', z && z.r != null ? { v: z.r, s: 'n4' } : '', z && z.x != null ? { v: z.x, s: 'n4' } : '', z && z.K ? { v: z.K, s: 'n3' } : '']);
    });
    out.push({ name: 'Elementi e impedenze', widths: [24, 16, 40, 12, 12, 12, 8], freeze: 1, rows: er });
    return out;
  }

  /* ---------- tabelle di dati di ingresso ---------- */
  function inputTables(P) {
    const E = P.elements, bl = [];
    const by = t => E.filter(e => e.type === t);
    if (by('rete').length) bl.push({ t: 'table', caption: 'Reti di alimentazione', head: ['Nome', 'Livello', 'Un [kV]', 'Pcc max [MVA]', 'Pcc min [MVA]', 'R/X'], align: ['l', 'l', 'r', 'r', 'r', 'r'], size: 8.5, rows: by('rete').map(e => [e.p.name, e.p.livello, f(e.p.Un, 3), f(+e.p.Pcc, 1), e.p.PccMin ? f(+e.p.PccMin, 1) : 'come max', f(+e.p.rx, 2)]) });
    if (by('trasf').length) bl.push({ t: 'table', caption: 'Trasformatori', head: ['Nome', 'Sn [kVA]', 'V1/V2 [kV]', 'Vcc [%]', 'Pcu [kW]'], align: ['l', 'r', 'r', 'r', 'r'], size: 8.5, rows: by('trasf').map(e => [e.p.name, f(+e.p.Sn, 0), `${f(+e.p.V1, 3)} / ${f(+e.p.V2, 3)}`, f(+e.p.vcc, 2), f(+e.p.Pcu, 2)]) });
    if (by('gen').length) bl.push({ t: 'table', caption: 'Impianti di produzione e carichi rotanti', head: ['Nome', 'Tipo', 'Pn [kW]', 'An [kVA]', 'Vn [kV]', 'Dato di cortocircuito', 'In servizio', 'Icc min'], align: ['l', 'l', 'r', 'r', 'r', 'l', 'l', 'l'], size: 8.5, rows: by('gen').map(e => { const p = e.p; const d = p.modo === 'i' ? `Icc = ${f(+p.icc, 2)} kA` : p.tipo === 'sinc' ? `x''d = ${f(+p.xd, 1)} %` : p.tipo === 'asinc' ? `Ia/In = ${f(+p.ilr, 1)}` : `Icc/In = ${f(+p.kst, 2)}`; return [p.name, GT[p.tipo], f(+p.Pn, 0), f(+p.An, 0), f(+p.Vn, 3), d, p.attivo === '0' ? 'No' : 'Sì', p.inMin === '0' ? 'No' : 'Sì']; }) });
    if (by('cavo').length) bl.push({ t: 'table', caption: 'Cavi e linee', head: ['Nome', 'Materiale', 'Sezione [mm²]', 'n.', 'Lunghezza [m]', 'r [Ω/km]', 'x [Ω/km]'], align: ['l', 'l', 'r', 'r', 'r', 'r', 'r'], size: 8.5, rows: by('cavo').map(e => [e.p.name, e.p.mat === 'Cu' ? 'Rame' : 'Alluminio', f(+e.p.S, 1), f(+e.p.n, 0), f(+e.p.L, 1), e.p.r ? f(+e.p.r, 4) : 'calc.', e.p.x ? f(+e.p.x, 3) : 'tipica']) });
    const bars = by('barra');
    if (bars.length) bl.push({ t: 'p', x: `Barrature: ${bars.length}. Interruttori/sezionatori: ${by('int').length} (aperti: ${by('int').filter(e => e.p.stato === 'a').length}).` });
    return bl;
  }

  /* ---------- relazione tecnica ---------- */
  function relazione(P, R, img) {
    const S = R.settings, rn = reported(R), meta = P.meta, bl = [];
    const maxN = rn.slice().sort((a, b) => R.res.max[b.id].Ik - R.res.max[a.id].Ik);
    const minN = rn.filter(n => R.res.min[n.id]).sort((a, b) => R.res.min[a.id].Ik - R.res.min[b.id].Ik);
    bl.push({ t: 'h1', x: 'Relazione tecnica - Calcolo delle correnti di cortocircuito' });
    bl.push({ t: 'kv', rows: [['Oggetto', meta.title], ['Committente', meta.client || '-'], ['Commessa', meta.job || '-'], ['Progettista', meta.author || '-'], ['Revisione / data', `${meta.rev || '-'} / ${today(P)}`]] });
    bl.push({ t: 'h1', x: '1. Premessa' });
    bl.push({ t: 'p', x: `La presente relazione documenta il calcolo delle correnti di cortocircuito ai nodi dell'impianto elettrico oggetto della commessa, comprensivo dei contributi delle reti di alimentazione, dei trasformatori, dei cavi e degli impianti di produzione di energia elettrica collegati. Lo schema è composto da ${P.elements.length} elementi e ${rn.length} nodi di calcolo. Sono calcolati anche i contributi che l'impianto fornisce verso la rete del distributore in caso di guasto sul punto di consegna.` });
    bl.push({ t: 'h1', x: '2. Riferimenti normativi' });
    bl.push({ t: 'ul', items: ['CEI EN 60909-0 (IEC 60909-0): Correnti di cortocircuito nei sistemi trifase in corrente alternata - Calcolo delle correnti.', 'CEI 11-28 (IEC/TR 60909-1): Guida all\'applicazione della norma CEI EN 60909-0.', 'CEI EN 60909-3: Correnti durante doppio guasto a terra non simultaneo e correnti parziali di cortocircuito nei conduttori di terra (per eventuali sviluppi).', 'CEI 0-16 e CEI 0-21: regole tecniche di connessione per utenti attivi e passivi alle reti MT/AT e BT (riferimento per la verifica con il distributore).'] });
    bl.push({ t: 'h1', x: '3. Dati di ingresso' });
    bl.push({ t: 'p', x: 'Lo schema unifilare e i dati degli elementi che lo compongono sono riportati di seguito.' });
    if (img) bl.push({ t: 'img', img, caption: 'Schema unifilare dell\'impianto con le correnti di cortocircuito massime ai nodi' });
    inputTables(P).forEach(b => bl.push(b));
    bl.push({ t: 'h1', x: '4. Metodo di calcolo' });
    bl.push({ t: 'p', x: `Il calcolo è eseguito con il metodo della sorgente di tensione equivalente al punto di guasto (CEI EN 60909-0), mediante la matrice delle impedenze di nodo del sistema di sequenza diretta, espressa in per unità su potenza di base ${f(100, 0)} MVA e tensione di base pari alla tensione nominale di ciascun nodo. I trasformatori sono modellati con rapporto ideale, impedenza riferita al lato secondario. Il guasto è considerato franco ai morsetti del nodo.` });
    if (S.useC) {
      bl.push({ t: 'p', x: `Sono applicati i fattori di tensione c: per la corrente massima cmax = ${f(S.cLV)} in bassa tensione (Un ≤ 1 kV) e cmax = 1,10 oltre 1 kV; per la corrente minima cmin = 0,95 in bassa tensione e cmin = 1,00 oltre 1 kV. Sono applicati inoltre i fattori di correzione delle impedenze: KT = 0,95·cmax/(1 + 0,6·xT) ai trasformatori nel calcolo della corrente massima e KG = (Un/UrG)·cmax/(1 + x''d·sin φrG) ai generatori sincroni.` });
    } else {
      bl.push({ t: 'p', x: 'Il calcolo è eseguito senza fattore di tensione (c = 1): tensione prefault pari alla tensione nominale di ogni nodo e senza fattori di correzione KT e KG. I risultati sono in genere inferiori a quelli ottenuti con c applicato, secondo la norma.' });
    }
    bl.push({ t: 'h2', x: '4.1 Modellazione degli elementi' });
    bl.push({ t: 'ul', items: [
      'Rete: ZQ = c·Un²/Sk\'\', con R/X assegnato (X = ZQ/√(1+(R/X)²)). Nel calcolo minimo si usa la Pcc minima, se assegnata.',
      'Trasformatore a due avvolgimenti: ZT = (ur + j·ux)·Un²/Sn con ur = Pcu/Sn e ux = √(ukr² − ur²); impedenza riferita alla tensione secondaria nominale.',
      `Cavo: R = ρ20·L·[1 + 0,004·(θ − 20)]/(S·n), con ρ20 = 1/56 Ω·mm²/m (rame) o 1/35 Ω·mm²/m (alluminio); θ = 20 °C per la corrente massima e θ = ${S.thetaMin} °C per la minima. Reattanza tipica 0,08 Ω/km in BT e 0,12 Ω/km in MT, se non assegnata.`,
      'Generatore sincrono: ZG = (RG + j·X\'\'d), con X\'\'d = x\'\'d·UrG²/SrG e R/X secondo IEC 60909-0 (0,15 BT; 0,07 MT con SrG < 100 MVA).',
      'Motore asincrono: ZM = (1/ILR/IrM)·UrM²/SrM con R/X = 0,42 in BT e 0,10-0,15 in MT; escluso dalla corrente minima, salvo diversa indicazione.',
      'Generatore statico (inverter/fotovoltaico): sorgente di corrente con Icc = k·In (o valore assegnato), sommata aritmeticamente alla corrente delle sorgenti di tensione e ripartita secondo il rapporto tra impedenze di trasferimento.',
      'Interruttori/sezionatori: considerati ideali; se aperti dividono la rete.'] });
    bl.push({ t: 'h2', x: '4.2 Grandezze calcolate' });
    bl.push({ t: 'ul', items: [
      'Corrente iniziale simmetrica di cortocircuito trifase: I\'\'k3 = c·Un/(√3·|Zk|), con Zk impedenza di sequenza diretta vista dal nodo.',
      'Corrente di picco: ip = κ·√2·I\'\'k con κ = 1,02 + 0,98·e^(−3R/X) (R/X al punto di guasto).',
      `Corrente di interruzione simmetrica: Ib = I\'\'k − Σ(1 − μ·q)·I\'\'ki, con μ e q (motori) funzione di tmin = ${S.tmin} s e del rapporto I\'\'kG/IrG; μ = 1 per reti e inverter.`,
      `Corrente termica equivalente: Ith = I\'\'k·√(m + n), con n = 1 (guasto lontano dai generatori), m funzione di κ, f = ${S.f} Hz e durata ${S.tk} s.`,
      'Corrente bifase: I\'\'k2 = (√3/2)·I\'\'k3 (impedenze di sequenza diretta e inversa uguali).'] });
    bl.push({ t: 'h1', x: '5. Risultati' });
    bl.push({ t: 'p', x: `Le correnti massime e minime ai nodi sono riportate nella tabella seguente (valori in kA riferiti alla tensione del nodo). Il contributo di ciascuna sorgente ai singoli nodi è disponibile nel foglio "Contributi" del file Excel.` });
    bl.push({ t: 'table', head: ['Nodo', 'Un [kV]', 'I\'\'k max', 'ip', 'Ib', 'Ith', 'I\'\'k2 max', 'I\'\'k min'], align: ['l', 'r', 'r', 'r', 'r', 'r', 'r', 'r'], size: 8, widths: [4, 1.2, 1.2, 1.2, 1.2, 1.2, 1.2, 1.2], rows: rn.map(n => { const a = R.res.max[n.id], b = R.res.min[n.id]; return [n.name, f(n.Un, 3), f(a.Ik), f(a.ip), f(a.Ib), f(a.Ith), f(a.Ik2), b ? f(b.Ik) : '-']; }) });
    bl.push({ t: 'h1', x: '6. Contributo verso la rete del distributore' });
    if (R.grids.length) {
      bl.push({ t: 'p', x: 'Nel caso di guasto trifase sul punto di consegna, la corrente fornita dall\'impianto verso la rete del distributore (esclusa la corrente della rete stessa) è:' });
      bl.push({ t: 'table', head: ['Rete', 'Nodo', 'Un [kV]', 'I\'\'k max [kA]', 'ip [kA]', 'Ib [kA]', 'S [MVA]', 'I\'\'k min [kA]'], align: ['l', 'l', 'r', 'r', 'r', 'r', 'r', 'r'], size: 8, widths: [2, 2.6, 1.2, 1.4, 1.2, 1.2, 1.2, 1.4], rows: R.grids.map(g => [g.name, g.nodeName, f(g.Un, 3), g.max ? f(g.max.Ik) : '-', g.max ? f(g.max.ip) : '-', g.max ? f(g.max.Ib) : '-', g.max ? f(g.max.S, 1) : '-', g.min ? f(g.min.Ik) : '-']) });
      bl.push({ t: 'note', x: 'Valori da confrontare con le prescrizioni del distributore (potere di interruzione e tenuta delle protezioni di interfaccia e delle apparecchiature al punto di connessione).' });
    } else bl.push({ t: 'p', x: 'Nello schema non sono presenti reti di alimentazione.' });
    bl.push({ t: 'h1', x: '7. Considerazioni conclusive' });
    const mx = maxN[0], mn = minN[0];
    const items = [];
    if (mx) items.push(`Il valore massimo della corrente di cortocircuito si ha al nodo "${mx.name}": I\'\'k = ${f(R.res.max[mx.id].Ik)} kA, ip = ${f(R.res.max[mx.id].ip)} kA, Ib = ${f(R.res.max[mx.id].Ib)} kA.`);
    if (mn) items.push(`Il valore minimo della corrente di cortocircuito si ha al nodo "${mn.name}": I\'\'k min = ${f(R.res.min[mn.id].Ik)} kA, da considerare per la verifica della sensibilità delle protezioni.`);
    items.push('Il potere di interruzione delle apparecchiature deve essere non inferiore a Ib (o I\'\'k) massima al nodo di installazione; la tenuta dinamica non inferiore a ip; la tenuta termica deve essere verificata con Ith per il tempo di eliminazione del guasto.');
    items.push('Le correnti minime devono essere confrontate con le soglie di intervento istantaneo e con la protezione dei cavi (I²t) nel punto più sfavorevole della linea.');
    items.push('Il calcolo è basato sui dati forniti e deve essere verificato dal progettista abilitato; non sostituisce la verifica con i dati effettivi del distributore e dei costruttori.');
    bl.push({ t: 'ul', items });
    bl.push({ t: 'h1', x: '8. Limiti del calcolo' });
    bl.push({ t: 'ul', items: ['Sono calcolati i guasti trifase e bifase (sequenza diretta). Il guasto monofase a terra non è incluso.', 'La corrente stazionaria Ik non è calcolata; per le reti con generatori sincroni vicini al guasto si raccomanda una verifica specifica.', 'Il contributo degli inverter è sommato in modo aritmetico (ipotesi cautelativa); per le sorgenti di tensione la somma è vettoriale.', 'I rapporti di trasformazione sono considerati nominali; non sono modellati i variatori di rapporto.', 'Per i generatori collegati tramite trasformatore dedicato (unità di produzione) non è applicato il fattore KS: il risultato è cautelativamente semplificato.'] });
    return bl;
  }

  /* ---------- PDF risultati ---------- */
  function pdfBlocks(P, R, img) {
    const rn = reported(R), bl = [];
    bl.push({ t: 'h1', x: P.meta.title || 'Calcolo correnti di cortocircuito' });
    bl.push({ t: 'kv', rows: [['Committente', P.meta.client || '-'], ['Commessa', P.meta.job || '-'], ['Progettista', P.meta.author || '-'], ['Revisione / data', `${P.meta.rev || '-'} / ${today(P)}`], ['Norma', 'CEI EN 60909-0 (IEC 60909-0)'], ['Fattore c', R.settings.useC ? 'Applicato' : 'Non applicato'], ['tmin / durata guasto', `${R.settings.tmin} s / ${R.settings.tk} s`]] });
    if (img) { bl.push({ t: 'pb' }); bl.push({ t: 'h1', x: 'Schema unifilare' }); bl.push({ t: 'img', img, caption: 'Valori: I\'\'k max trifase [kA]' }); }
    bl.push({ t: 'pb' });
    bl.push({ t: 'h1', x: 'Correnti di cortocircuito ai nodi' });
    bl.push({ t: 'table', head: headNodes(R), rows: nodeRows(R), align: ['l', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'r'], size: 8, widths: [4.6, 1, 1.3, 1.1, 1.1, 1.3, 1.3, 0.9, 1.1, 1.3, 1.3] });
    if (R.grids.length) { bl.push({ t: 'h1', x: 'Contributo verso la rete del distributore' }); bl.push({ t: 'table', head: gridHead, rows: gridRows(R), size: 8, align: ['l', 'l', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'r'] }); }
    bl.push({ t: 'h1', x: 'Contributi delle sorgenti (corrente massima)' });
    const rows = [];
    rn.forEach(n => R.res.max[n.id].contribs.slice().sort((a, b) => b.kA - a.kA).forEach(c => rows.push([n.name, srcName(c), f(c.kA, 3), f(c.share, 1)])));
    bl.push({ t: 'table', head: ['Nodo', 'Sorgente', 'I al nodo [kA]', 'Quota [%]'], rows, size: 8, align: ['l', 'l', 'r', 'r'], widths: [3, 3.6, 1.2, 1] });
    bl.push({ t: 'h1', x: 'Dati degli elementi' });
    inputTables(P).forEach(b => bl.push(b));
    return bl;
  }

  window.Report = { sheets, relazione, pdfBlocks, f, TL, GT, reported, srcName, inputTables };
})();
