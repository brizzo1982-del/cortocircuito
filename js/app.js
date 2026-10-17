/* Interfaccia: pagine, pannello proprietà, verifica/approvazione, risultati ed esportazioni. */
(function () {
  'use strict';
  const M = window.Model, E = window.Editor, C = window.Calc, Rp = window.Report;
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const f = Rp.f, KEY = 'cortocircuito_project_v1';
  let P = null, R = null, page = 'schema', saveT = null, selNode = null, filter = '';

  /* ---------- progetto ---------- */
  function load() {
    try { const j = JSON.parse(localStorage.getItem(KEY)); if (j && j.v === 1 && j.elements) return fix(j); } catch (e) { /* nuovo */ }
    return null;
  }
  function fix(j) { const b = M.emptyProject(); j.meta = Object.assign(b.meta, j.meta); j.settings = Object.assign(b.settings, j.settings); j.wires = j.wires || []; j.nextId = j.nextId || (j.elements.length + j.wires.length + 10); return j; }
  function persist() { clearTimeout(saveT); saveT = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(P)); } catch (e) { /* quota */ } }, 400); }
  function setProject(p) { P = p; R = null; P.approved = false; E.setModel(P); E.setLocked(false); E.setOverlay({}, false); E.fit(); refreshAll(); }

  /* ---------- toast e attesa ---------- */
  let tt = null;
  function toast(m, bad) { const t = $('#toast'); t.textContent = m; t.className = 'toast show' + (bad ? ' bad' : ''); clearTimeout(tt); tt = setTimeout(() => t.className = 'toast', 3500); }
  function busy(msg, fn) {
    const b = $('#busy'); b.querySelector('span').textContent = msg; b.hidden = false;
    return new Promise(res => setTimeout(async () => { try { res(await fn()); } catch (e) { console.error(e); toast('Errore: ' + e.message, true); res(null); } finally { b.hidden = true; } }, 40));
  }
  function download(bytes, name, mime) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([bytes], { type: mime })); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }
  const fname = ext => ((P.meta.job || P.meta.title || 'cortocircuito').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_') || 'cortocircuito') + '_' + (P.meta.rev || '00') + '.' + ext;

  /* ---------- navigazione ---------- */
  const PAGES = [['schema', 'Schema'], ['impost', 'Impostazioni'], ['verifica', 'Verifica e calcolo'], ['risultati', 'Risultati']];
  function nav() {
    $('#nav').innerHTML = PAGES.map(([k, l]) => `<button data-pg="${k}" class="${page === k ? 'on' : ''}">${l}${k === 'risultati' && R ? ' <i class="dot"></i>' : ''}</button>`).join('') +
      `<span class="navinfo">${P.approved ? '<b class="okc">Schema approvato (bloccato)</b>' : 'Schema in modifica'}</span>`;
  }
  function go(p) {
    page = p; nav();
    $('#v-schema').hidden = p !== 'schema'; $('#v-other').hidden = p === 'schema';
    if (p === 'schema') { E.renderNow(); }
    else if (p === 'impost') pageSettings(); else if (p === 'verifica') pageVerify(); else pageResults();
  }
  function refreshAll() { nav(); refreshPanel(); toolbar(); status(); go(page); }

  /* ---------- palette e barra strumenti ---------- */
  const ICON = {
    rete: '<svg viewBox="0 0 40 40"><rect x="8" y="4" width="24" height="18" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 14l5-6 5 12 5-6" fill="none" stroke="currentColor" stroke-width="2"/><line x1="20" y1="22" x2="20" y2="36" stroke="currentColor" stroke-width="2"/></svg>',
    barra: '<svg viewBox="0 0 40 40"><line x1="3" y1="20" x2="37" y2="20" stroke="currentColor" stroke-width="6"/></svg>',
    trasf: '<svg viewBox="0 0 40 40"><line x1="20" y1="2" x2="20" y2="9" stroke="currentColor" stroke-width="2"/><circle cx="20" cy="16" r="8" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="20" cy="25" r="8" fill="none" stroke="currentColor" stroke-width="2"/><line x1="20" y1="33" x2="20" y2="39" stroke="currentColor" stroke-width="2"/></svg>',
    gen: '<svg viewBox="0 0 40 40"><line x1="20" y1="2" x2="20" y2="10" stroke="currentColor" stroke-width="2"/><circle cx="20" cy="24" r="13" fill="none" stroke="currentColor" stroke-width="2"/><text x="20" y="30" text-anchor="middle" font-size="16" font-weight="700" fill="currentColor">G</text></svg>',
    cavo: '<svg viewBox="0 0 40 40"><line x1="20" y1="2" x2="20" y2="38" stroke="currentColor" stroke-width="2"/><rect x="14" y="12" width="12" height="16" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
    int: '<svg viewBox="0 0 40 40"><line x1="20" y1="2" x2="20" y2="38" stroke="currentColor" stroke-width="2"/><rect x="14" y="14" width="12" height="12" fill="currentColor"/></svg>'
  };
  let placing = null;
  function palette() {
    $('#palette').innerHTML = '<h4>Elementi</h4>' + Object.keys(M.TYPES).map(k => `<button class="pal ${placing === k ? 'on' : ''}" data-type="${k}" title="Clic, poi clic sullo schema per inserire">${ICON[k]}<span>${M.TYPES[k].label}</span></button>`).join('') +
      '<p class="hint">Dopo la scelta clicca nello schema per posizionare. <b>Esc</b> per terminare.</p><h4>Come si collega</h4><p class="hint">Trascina dal <b>pallino</b> di un terminale fino a un altro terminale o su una barratura. Da una barra: <b>Alt+Maiusc</b> e trascina.</p><h4>Vista</h4><p class="hint">Rotella: zoom. <b>Spazio</b>+trascina o tasto destro: sposta.</p>';
  }
  function setPlacing(t) { placing = t; E.setPlace(t); palette(); }
  function toolbar() {
    const dis = P.approved ? ' disabled' : '';
    $('#toolbar').innerHTML = `<button data-a="undo"${dis} title="Annulla (Ctrl+Z)">↶ Annulla</button><button data-a="redo"${dis} title="Ripeti (Ctrl+Y)">↷ Ripeti</button><span class="sep"></span>
<button data-a="rot"${dis} title="Ruota (R)">⟳ Ruota</button><button data-a="copy"${dis}>Copia</button><button data-a="paste"${dis}>Incolla</button><button data-a="del"${dis} class="danger" title="Elimina (Canc)">Elimina</button><span class="sep"></span>
<button data-a="zi">＋</button><button data-a="zo">－</button><button data-a="fit">Adatta</button><span class="sep"></span>
<label class="chk"><input type="checkbox" id="showres"${R ? '' : ' disabled'}> Mostra risultati</label>
${P.approved ? '<button data-a="unlock" class="primary">Modifica schema</button>' : '<button data-a="verify" class="primary">Verifica e approva →</button>'}`;
    const sr = $('#showres'); if (sr) { sr.checked = !!showRes; sr.onchange = () => { showRes = sr.checked; E.setShowRes(showRes); }; }
  }
  let showRes = false;
  function status() { $('#statusbar').textContent = `${P.elements.length} elementi · ${P.wires.length} collegamenti` + (P.elements.length > 500 ? ' · attenzione: oltre 500 elementi' : ''); }

  /* ---------- pannello proprietà ---------- */
  function fieldHtml(fd, p, locked) {
    const v = p[fd.k] == null ? '' : p[fd.k], d = locked ? ' disabled' : '', id = 'f_' + fd.k;
    let inp;
    if (fd.t === 'sel') inp = `<select data-k="${fd.k}"${d}>${fd.opts.map(([k, l]) => `<option value="${esc(k)}"${String(k) === String(v) ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
    else if (fd.t === 'txt') inp = `<input type="text" data-k="${fd.k}" value="${esc(v)}"${d}>`;
    else inp = `<input type="number" step="any" data-k="${fd.k}"${fd.min != null ? ` min="${fd.min}"` : ''} value="${esc(v)}"${fd.list ? ` list="dl_${fd.k}"` : ''}${d}>` + (fd.list ? `<datalist id="dl_${fd.k}">${fd.list.map(x => `<option value="${x}">`).join('')}</datalist>` : '');
    return `<label class="fld"><span>${esc(fd.l)}${fd.u ? ` <i>${esc(fd.u)}</i>` : ''}</span>${inp}${fd.help ? `<small>${esc(fd.help)}</small>` : ''}</label>`;
  }
  function infoLine(e) {
    const p = e.p, n = M.num, S3 = Math.sqrt(3);
    switch (e.type) {
      case 'rete': return `Icc equivalente max ≈ ${f(n(p.Pcc, 0) / (S3 * n(p.Un, 1)))} kA`;
      case 'trasf': { const ur = n(p.Pcu, 0) / n(p.Sn, 1) * 100; return `ur = ${f(ur)} %, ux = ${f(Math.sqrt(Math.max(n(p.vcc, 0) ** 2 - ur ** 2, 0)))} % · In1 = ${f(n(p.Sn, 0) / (S3 * n(p.V1, 1)), 1)} A · In2 = ${f(n(p.Sn, 0) / (S3 * n(p.V2, 1)), 1)} A`; }
      case 'gen': return `In = ${f(n(p.An, 0) / (S3 * n(p.Vn, 1)), 1)} A`;
      case 'cavo': { const rho = p.mat === 'Al' ? 1 / 35 : 1 / 56, r = (n(p.r, 0) > 0 ? n(p.r, 0) / 1000 : rho / n(p.S, 1)) * n(p.L, 0) / Math.max(1, n(p.n, 1)), x = (n(p.x, 0) > 0 ? n(p.x, 0) : 0.08) / 1000 * n(p.L, 0) / Math.max(1, n(p.n, 1)); return `R20 = ${f(r * 1000, 2)} mΩ · X ≈ ${f(x * 1000, 2)} mΩ (con x tipica BT 0,08 Ω/km)`; }
    }
    return '';
  }
  function refreshPanel() {
    const box = $('#props'), sel = E.getSel(), lock = !!P.approved;
    if (sel.els.length === 1 && !sel.wires.length) {
      const e = sel.els[0], T = M.TYPES[e.type];
      box.innerHTML = `<h4>${T.label}</h4><div class="pfields">${T.fields.filter(fd => !fd.when || fd.when(e.p)).map(fd => fieldHtml(fd, e.p, lock)).join('')}</div>` +
        (infoLine(e) ? `<p class="info">${infoLine(e)}</p>` : '') + (e.type !== 'barra' ? `<p class="hint">Terminali: ${e.type === 'rete' || e.type === 'gen' ? 'uno' : '<b>alto</b> (primario) e <b>basso</b> (secondario)'}. Ruota con R.</p>` : '<p class="hint">Trascina il quadratino azzurro per allungare la barra. Collega gli altri elementi trascinando i loro pallini sulla barra.</p>');
      box.onchange = box.oninput = ev => {
        const t = ev.target; if (!t.dataset || !t.dataset.k) return;
        const fd = T.fields.find(q => q.k === t.dataset.k); let v = t.value;
        if (fd.t === 'n') { const x = parseFloat(v); v = isFinite(x) ? x : ''; }
        e.p[t.dataset.k] = v;
        if (e.type === 'rete' && t.dataset.k === 'livello') e.p.Un = { AT: 132, MT: 20, BT: 0.4 }[v];
        if (e.type === 'gen' && t.dataset.k === 'tipo' && ev.type === 'change') { e.p.inMin = v === 'asinc' ? '0' : '1'; if (v === 'asinc') e.p.rx = ''; }
        E.render(); persist(); status();
        if (ev.type === 'change' && (fd.t === 'sel')) refreshPanel();
      };
    } else if (sel.els.length > 1) {
      box.innerHTML = `<h4>${sel.els.length} elementi selezionati</h4><p class="hint">Sposta con il trascinamento, ruota con R, elimina con Canc, copia/incolla con Ctrl+C / Ctrl+V.</p>`; box.onchange = box.oninput = null;
    } else if (sel.wires.length) {
      box.innerHTML = `<h4>Collegamento</h4><p class="hint">Premi Canc per eliminarlo.</p>`; box.onchange = box.oninput = null;
    } else {
      const cnt = t => P.elements.filter(e => e.type === t).length;
      box.innerHTML = `<h4>Schema</h4><p class="info">${Object.keys(M.TYPES).map(k => `${M.TYPES[k].label}: <b>${cnt(k)}</b>`).join('<br>')}</p><p class="hint">Seleziona un elemento per modificarne i dati.</p>` + (P.approved ? '<p class="okc">Lo schema è approvato: per modificarlo premi “Modifica schema”.</p>' : ''); box.onchange = box.oninput = null;
    }
  }

  /* ---------- pagina impostazioni ---------- */
  function fld(label, path, o) {
    o = o || {}; const parts = path.split('.'), v = P[parts[0]][parts[1]];
    let inp;
    if (o.sel) inp = `<select data-path="${path}">${o.sel.map(([k, l]) => `<option value="${k}"${String(k) === String(v) ? ' selected' : ''}>${l}</option>`).join('')}</select>`;
    else if (o.area) inp = `<textarea data-path="${path}" rows="4">${esc(v)}</textarea>`;
    else inp = `<input type="${o.n ? 'number' : 'text'}" ${o.n ? 'step="any"' : ''} data-path="${path}" value="${esc(v)}">`;
    return `<label class="fld"><span>${label}${o.u ? ` <i>${o.u}</i>` : ''}</span>${inp}${o.help ? `<small>${o.help}</small>` : ''}</label>`;
  }
  function pageSettings() {
    $('#v-other').innerHTML = `<div class="page"><div class="card"><h3>Dati del progetto</h3><div class="grid2">${fld('Titolo', 'meta.title')}${fld('Committente', 'meta.client')}${fld('Commessa', 'meta.job')}${fld('Progettista', 'meta.author')}${fld('Revisione', 'meta.rev')}${fld('Data', 'meta.date')}</div>${fld('Note (riportate nei documenti)', 'meta.notes', { area: 1 })}</div>
<div class="card"><h3>Parametri di calcolo</h3><div class="grid2">
${fld('Fattore di tensione c', 'settings.useC', { sel: [['true', 'Applica c (CEI EN 60909-0)'], ['false', 'Senza c (tensione prefault = Un, KT = KG = 1)']], help: 'Con c: cmax e cmin dipendono dal livello di tensione, con KT e KG.' })}
${fld('cmax in bassa tensione', 'settings.cLV', { sel: [['1.05', '1,05 (tolleranza +6%)'], ['1.1', '1,10 (tolleranza +10%)']] })}
${fld('Ritardo minimo di apertura tmin', 'settings.tmin', { sel: [['0.02', '0,02 s'], ['0.05', '0,05 s'], ['0.1', '0,10 s'], ['0.25', '≥ 0,25 s']], help: 'Per la corrente di interruzione Ib.' })}
${fld('Durata del guasto per Ith', 'settings.tk', { n: 1, u: 's' })}
${fld('Frequenza', 'settings.f', { sel: [['50', '50 Hz'], ['60', '60 Hz']] })}
${fld('Temperatura dei cavi per la Icc minima', 'settings.thetaMin', { n: 1, u: '°C', help: 'Max: 20 °C. Min: resistenza maggiorata di 0,004/°C.' })}
</div></div>
<div class="card"><h3>File di progetto</h3><p class="muted">Lo schema è salvato automaticamente nel browser. Per archiviarlo o condividerlo usa “Salva” (file .cc.json) e “Apri”.</p><div class="btns"><button data-top="save">Salva file</button><button data-top="open">Apri file</button><button data-top="sample">Carica esempio</button><button data-top="stress" title="Genera una rete di prova di circa 520 elementi">Rete di prova (500+ elementi)</button></div></div></div>`;
    $('#v-other').oninput = $('#v-other').onchange = ev => {
      const t = ev.target; if (!t.dataset.path) return; const [a, b] = t.dataset.path.split('.'); let v = t.value;
      if (b === 'useC') v = v === 'true'; else if (['cLV', 'tmin', 'tk', 'f', 'thetaMin'].indexOf(b) >= 0) v = parseFloat(v) || 0;
      P[a][b] = v; invalidate(); persist();
    };
  }
  function invalidate() { if (R && !P.approved) { R = null; } }

  /* ---------- verifica e calcolo ---------- */
  function pageVerify() {
    const a = C.analyze(P);
    const li = (arr, cls) => arr.length ? `<ul class="msgs ${cls}">${arr.map(m => `<li>${esc(m)}</li>`).join('')}</ul>` : '';
    $('#v-other').innerHTML = `<div class="page"><div class="card"><h3>Verifica dello schema</h3>
<p>${P.elements.length} elementi, ${P.wires.length} collegamenti, ${a.nodes.filter(n => n.reported).length} nodi di calcolo. ${a.errors.length ? `<b class="koc">${a.errors.length} errori da correggere</b>` : '<b class="okc">Nessun errore bloccante</b>'}${a.warnings.length ? `, ${a.warnings.length} avvisi.` : '.'}</p>
${li(a.errors, 'err')}${li(a.warnings, 'warn')}
<p class="muted">Con l’approvazione lo schema viene bloccato e sono calcolate le correnti di cortocircuito in tutti i nodi (massima e minima). Potrai sempre riaprirlo con “Modifica schema”.</p>
<div class="btns">${P.approved ? '<button data-a="unlock" class="primary">Modifica schema</button>' : `<button data-a="approve" class="primary"${a.errors.length ? ' disabled' : ''}>Approva schema e calcola</button>`}<button data-pg="schema">Torna allo schema</button></div></div></div>`;
  }
  async function approve() {
    const res = await busy('Calcolo in corso…', () => C.analyze(P));
    if (!res) return;
    if (res.errors.length) { toast('Schema con errori: correggere prima di approvare', true); pageVerify(); return; }
    R = res; P.approved = true;
    const ov = {};
    R.nodes.forEach(n => { const r = R.res.max[n.id]; if (!r) return; n.bars.forEach(b => ov[b.id] = [`I''k ${f(r.Ik)} kA`, `ip ${f(r.ip)} kA`]); });
    E.setLocked(true); E.setOverlay(ov, true); showRes = true; selNode = null;
    toolbar(); nav(); refreshPanel(); go('risultati');
  }
  function unlock() { P.approved = false; R = null; selNode = null; E.setLocked(false); E.setOverlay({}, false); showRes = false; refreshAll(); go('schema'); }

  /* ---------- risultati ---------- */
  function pageResults() {
    if (!R) { $('#v-other').innerHTML = `<div class="page"><div class="card"><h3>Risultati</h3><p class="muted">Nessun risultato: approva lo schema nella pagina “Verifica e calcolo”.</p><div class="btns"><button data-pg="verifica" class="primary">Vai alla verifica</button></div></div></div>`; return; }
    const rn = Rp.reported(R), mxN = rn.slice().sort((a, b) => R.res.max[b.id].Ik - R.res.max[a.id].Ik)[0];
    const flt = filter.toLowerCase(), rows = rn.filter(n => !flt || n.name.toLowerCase().includes(flt));
    const t1 = rows.map(n => { const a = R.res.max[n.id], b = R.res.min[n.id]; return `<tr data-node="${n.id}" class="${selNode === n.id ? 'sel' : ''}"><td>${esc(n.name)}</td><td>${f(n.Un, 3)}</td><td><b>${f(a.Ik)}</b></td><td>${f(a.ip)}</td><td>${f(a.Ib)}</td><td>${f(a.Ith)}</td><td>${f(a.Ik2)}</td><td>${f(a.RX, 3)}</td><td>${f(a.Zk * 1000, 1)}</td><td>${b ? f(b.Ik) : '-'}</td><td>${b ? f(b.Ik2) : '-'}</td></tr>`; }).join('');
    let det = '';
    if (selNode != null && R.res.max[selNode]) {
      const nd = R.nodes[selNode], tab = sc => { const r = R.res[sc][selNode]; if (!r) return '<p class="muted">Non calcolata.</p>'; return `<table class="tbl"><thead><tr><th>Sorgente</th><th>I al nodo [kA]</th><th>Quota</th><th>μ·q</th></tr></thead><tbody>${r.contribs.slice().sort((a, b) => b.kA - a.kA).map(c => `<tr><td>${esc(Rp.srcName(c))}</td><td>${f(c.kA, 3)}</td><td>${f(c.share, 1)} %</td><td>${f(c.mu, 2)}</td></tr>`).join('')}</tbody></table><p class="muted">c = ${f(r.c)} · Zk = ${f(r.R * 1000, 2)} + j${f(r.X * 1000, 2)} mΩ · κ = ${f(r.kappa, 3)}</p>`; };
      det = `<div class="card"><h3>Contributi al nodo “${esc(nd.name)}”</h3><div class="grid2"><div><h4>Corrente massima</h4>${tab('max')}</div><div><h4>Corrente minima</h4>${tab('min')}</div></div><div class="btns"><button data-a="showNode" data-id="${nd.bars[0] ? nd.bars[0].id : (nd.terms[0] && nd.terms[0].e.id)}">Mostra nello schema</button></div></div>`;
    }
    const gt = R.grids.map(g => `<tr><td>${esc(g.name)}</td><td>${esc(g.nodeName)}</td><td>${f(g.Un, 3)}</td><td><b>${g.max ? f(g.max.Ik) : '-'}</b></td><td>${g.max ? f(g.max.ip) : '-'}</td><td>${g.max ? f(g.max.Ib) : '-'}</td><td>${g.max ? f(g.max.S, 1) : '-'}</td><td>${g.min ? f(g.min.Ik) : '-'}</td><td>${g.max ? f(g.max.gridIk) : '-'}</td></tr>`).join('');
    $('#v-other').innerHTML = `<div class="page"><div class="card"><div class="row"><div><h3>Risultati del calcolo</h3><p class="muted">${rn.length} nodi · ${R.settings.useC ? 'con fattore c' : 'senza fattore c'} · valori in kA alla tensione del nodo · tmin ${R.settings.tmin} s · Ith per ${R.settings.tk} s${mxN ? ` · massimo: <b>${esc(mxN.name)}</b> ${f(R.res.max[mxN.id].Ik)} kA` : ''}</p></div></div>
${R.warnings.length ? `<ul class="msgs warn">${R.warnings.map(m => `<li>${esc(m)}</li>`).join('')}</ul>` : ''}
<div class="btns exp"><button data-a="xlsx" class="primary">Esporta Excel</button><button data-a="pdf" class="primary">Esporta PDF</button><button data-a="relpdf" class="primary">Relazione tecnica (PDF)</button><button data-a="reldocx" class="primary">Relazione tecnica (Word)</button><button data-a="unlock">Modifica schema</button><button data-pg="schema">Vedi schema</button></div></div>
<div class="card"><div class="row"><h3>Correnti ai nodi</h3><input id="flt" type="search" placeholder="Filtra per nome nodo…" value="${esc(filter)}"></div><div class="scroll"><table class="tbl" id="restbl"><thead><tr><th>Nodo</th><th>Un [kV]</th><th>I''k max</th><th>ip</th><th>Ib</th><th>Ith</th><th>I''k2 max</th><th>R/X</th><th>Zk [mΩ]</th><th>I''k min</th><th>I''k2 min</th></tr></thead><tbody>${t1}</tbody></table></div><p class="muted">Clic su una riga per vedere i contributi delle sorgenti.</p></div>${det}
<div class="card"><h3>Contributo dell’impianto verso la rete del distributore</h3>${R.grids.length ? `<div class="scroll"><table class="tbl"><thead><tr><th>Rete</th><th>Nodo di consegna</th><th>Un [kV]</th><th>I''k max [kA]</th><th>ip [kA]</th><th>Ib [kA]</th><th>S [MVA]</th><th>I''k min [kA]</th><th>I''k della rete [kA]</th></tr></thead><tbody>${gt}</tbody></table></div><p class="muted">Corrente che generatori, motori e inverter dell’impianto inviano verso il distributore in caso di guasto sul punto di consegna (esclusa la rete stessa).</p>` : '<p class="muted">Nessuna rete nello schema.</p>'}</div></div>`;
    const fl = $('#flt'); if (fl) fl.oninput = () => { filter = fl.value; const p = fl.selectionStart; pageResults(); const n = $('#flt'); n.focus(); n.setSelectionRange(p, p); };
  }

  /* ---------- esportazioni ---------- */
  async function exportXlsx() {
    await busy('Creazione del file Excel…', () => download(window.Xlsx.build(Rp.sheets(P, R)), fname('xlsx'), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'));
  }
  async function exportPdf() {
    await busy('Creazione del PDF…', async () => {
      const img = await E.exportImage('jpeg', true, 2600);
      const d = new window.Pdf.Doc({ landscape: true, title: P.meta.title, sub: (P.meta.job ? P.meta.job + ' - ' : '') + 'Rev. ' + P.meta.rev });
      d.blocks(Rp.pdfBlocks(P, R, img)); download(d.save(), fname('pdf'), 'application/pdf');
    });
  }
  async function exportRelPdf() {
    await busy('Creazione della relazione…', async () => {
      const img = await E.exportImage('jpeg', true, 2200);
      const d = new window.Pdf.Doc({ landscape: false, title: 'Relazione tecnica - ' + P.meta.title, sub: (P.meta.job ? P.meta.job + ' - ' : '') + 'Rev. ' + P.meta.rev });
      d.blocks(Rp.relazione(P, R, img)); download(d.save(), 'Relazione_' + fname('pdf'), 'application/pdf');
    });
  }
  async function exportRelDocx() {
    await busy('Creazione della relazione Word…', async () => {
      const img = await E.exportImage('png', true, 2000);
      download(window.Docx.build(Rp.relazione(P, R, img), { footer: P.meta.title + ' - Rev. ' + P.meta.rev }), 'Relazione_' + fname('docx'), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    });
  }

  /* ---------- file ---------- */
  function saveFile() { download(JSON.stringify(Object.assign({}, P, { approved: false }), null, 1), fname('cc.json'), 'application/json'); }
  function openFile() {
    const i = document.createElement('input'); i.type = 'file'; i.accept = '.json,.cc.json';
    i.onchange = () => { const r = new FileReader(); r.onload = () => { try { const j = JSON.parse(r.result); if (!j.elements) throw new Error('file non valido'); setProject(fix(j)); go('schema'); toast('Progetto caricato'); } catch (e) { toast('File non valido: ' + e.message, true); } }; r.readAsText(i.files[0]); };
    i.click();
  }

  /* ---------- esempi ---------- */
  function mk(p, type, x, y, rot, props) { const e = M.create(p, type, x, y); e.rot = rot || 0; Object.assign(e.p, props || {}); p.elements.push(e); return e; }
  function wr(p, a, b) {
    const end = x => Array.isArray(x) ? (x[0].type === 'barra' ? { el: x[0].id, t: 'b', u: x[1] } : { el: x[0].id, t: x[1] }) : x;
    p.wires.push({ id: M.newId(p), a: end(a), b: end(b) });
  }
  function sample() {
    const p = M.emptyProject(); p.meta.title = 'Esempio - cabina MT/BT con fotovoltaico'; p.meta.client = 'Cliente di esempio'; p.meta.job = 'ESEMPIO-01';
    const rete = mk(p, 'rete', 10, 6, 0, { name: 'Rete MT distributore', Pcc: 250, PccMin: 150, Un: 20, livello: 'MT' });
    const mt = mk(p, 'barra', 2, 9, 0, { name: 'Sbarre MT 20 kV', len: 22 });
    wr(p, [rete, 'a'], [mt, 10]);
    const tr1 = mk(p, 'trasf', 6, 10, 0, { name: 'TR1', Sn: 1000, V1: 20, V2: 0.4, vcc: 6, Pcu: 10.5 });
    const tr2 = mk(p, 'trasf', 18, 10, 0, { name: 'TR2', Sn: 630, V1: 20, V2: 0.4, vcc: 4, Pcu: 6.5 });
    wr(p, [mt, 4], [tr1, 'a']); wr(p, [mt, 16], [tr2, 'a']);
    const bt = mk(p, 'barra', 2, 16, 0, { name: 'QGBT 400 V', len: 30 });
    wr(p, [tr1, 'b'], [bt, 4]); wr(p, [tr2, 'b'], [bt, 16]);
    const fv = mk(p, 'gen', 22, 16, 0, { name: 'Inverter FV', tipo: 'stat', Pn: 200, An: 220, Vn: 0.4, modo: 'x', kst: 1.1 });
    wr(p, [fv, 'a'], [bt, 20]);
    const mo = mk(p, 'gen', 8, 16, 0, { name: 'Motore 90 kW', tipo: 'asinc', Pn: 90, An: 110, Vn: 0.4, cosfi: 0.88, modo: 'x', ilr: 6.5, pp: 2, inMin: '0' });
    wr(p, [mo, 'a'], [bt, 6]);
    const cv = mk(p, 'cavo', 30, 17, 0, { name: 'Cavo QE1', mat: 'Cu', S: 120, L: 80, n: 1 });
    wr(p, [bt, 28], [cv, 'a']);
    const qe = mk(p, 'barra', 24, 22, 0, { name: 'QE1 officina', len: 14 });
    wr(p, [cv, 'b'], [qe, 6]);
    const ge = mk(p, 'gen', 36, 22, 0, { name: 'Gruppo elettrogeno', tipo: 'sinc', Pn: 320, An: 400, Vn: 0.4, cosfi: 0.8, modo: 'x', xd: 14 });
    wr(p, [ge, 'a'], [qe, 12]);
    return p;
  }
  function stress() {
    const p = M.emptyProject(); p.meta.title = 'Rete di prova (500+ elementi)';
    const rete = mk(p, 'rete', 40, 6, 0, { name: 'Rete AT', livello: 'AT', Un: 132, Pcc: 3000, rx: 0.1 });
    const at = mk(p, 'barra', 2, 9, 0, { name: 'Sbarre AT', len: 80 }); wr(p, [rete, 'a'], [at, 38]);
    const ctr = mk(p, 'trasf', 38, 10, 0, { name: 'TR AT/MT', Sn: 40000, V1: 132, V2: 20, vcc: 12, Pcu: 150 }); wr(p, [at, 36], [ctr, 'a']);
    const mt = mk(p, 'barra', 2, 15, 0, { name: 'Sbarre MT', len: 12 * 55 + 4 }); wr(p, [ctr, 'b'], [mt, 36]);
    let x = 4;
    for (let i = 1; i <= 55; i++) {
      const cv = mk(p, 'cavo', x, 16, 0, { name: 'Linea MT ' + i, S: 95, L: 300 + i * 40, mat: i % 3 ? 'Al' : 'Cu' }); wr(p, [mt, x - 2], [cv, 'a']);
      const cab = mk(p, 'barra', x - 1, 21, 0, { name: 'Cabina ' + i, len: 5 }); wr(p, [cv, 'b'], [cab, 1]);
      const tr = mk(p, 'trasf', x, 22, 0, { name: 'TR ' + i, Sn: [400, 630, 800, 1000][i % 4], V1: 20, V2: 0.4, vcc: 6, Pcu: 8 }); wr(p, [cab, 1], [tr, 'a']);
      const bt = mk(p, 'barra', x - 3, 27, 0, { name: 'QBT ' + i, len: 8 }); wr(p, [tr, 'b'], [bt, 3]);
      if (i % 2) { const g = mk(p, 'gen', x + 3, 27, 0, { name: 'FV ' + i, tipo: 'stat', Pn: 100, An: 110, Vn: 0.4, kst: 1.1 }); wr(p, [g, 'a'], [bt, 6]); }
      for (let k = 0; k < 3; k++) {
        const c2 = mk(p, 'cavo', x - 2 + k * 2, 28, 0, { name: `Cavo ${i}.${k + 1}`, S: 35, L: 40 + k * 20 }); wr(p, [bt, 1 + k * 2], [c2, 'a']);
        const ub = mk(p, 'barra', x - 3 + k * 2, 33, 0, { name: `Utenza ${i}.${k + 1}`, len: 2 }); wr(p, [c2, 'b'], [ub, 1]);
      }
      x += 12;
    }
    mt.p.len = x; return p;
  }

  /* ---------- eventi globali ---------- */
  function onClick(ev) {
    const t = ev.target.closest('button, tr[data-node]'); if (!t) return;
    if (t.dataset.pg) return go(t.dataset.pg);
    if (t.dataset.type) { return setPlacing(placing === t.dataset.type ? null : t.dataset.type); }
    if (t.dataset.node != null && t.tagName === 'TR') { selNode = +t.dataset.node; return pageResults(); }
    const a = t.dataset.a || t.dataset.top;
    switch (a) {
      case 'undo': E.undo(); break; case 'redo': E.redo(); break; case 'rot': E.rotateSel(); break; case 'copy': E.copySel(); break; case 'paste': E.paste(); break;
      case 'del': E.removeSel(); break; case 'zi': E.zoom(1.25); break; case 'zo': E.zoom(0.8); break; case 'fit': E.fit(); break;
      case 'verify': go('verifica'); break; case 'approve': approve(); break; case 'unlock': unlock(); break;
      case 'xlsx': exportXlsx(); break; case 'pdf': exportPdf(); break; case 'relpdf': exportRelPdf(); break; case 'reldocx': exportRelDocx(); break;
      case 'showNode': go('schema'); E.centerOn(t.dataset.id); E.select([t.dataset.id]); break;
      case 'new': if (confirm('Creare un nuovo progetto? Le modifiche non salvate andranno perse.')) { setProject(M.emptyProject()); go('schema'); } break;
      case 'open': openFile(); break; case 'save': saveFile(); break;
      case 'sample': setProject(sample()); go('schema'); toast('Esempio caricato'); break;
      case 'stress': busy('Generazione rete di prova…', () => { setProject(stress()); go('schema'); toast(`Generati ${P.elements.length} elementi`); }); break;
      case 'logout': sessionStorage.removeItem('auth'); location.reload(); break;
    }
  }

  function init() {
    P = load() || M.emptyProject(); P.approved = false;
    document.addEventListener('click', onClick);
    E.init($('#canvas'), {
      onChange: s => { invalidate(); persist(); status(); if (s) toolbar(); },
      onSelect: () => refreshPanel(),
      onPlace: t => { placing = t; palette(); }
    });
    E.setModel(P); palette(); nav(); toolbar(); refreshPanel(); status();
    if (!P.elements.length) { P = sample(); E.setModel(P); toast('Caricato uno schema di esempio: modificalo o crea un nuovo progetto'); refreshAll(); }
    setTimeout(() => E.fit(), 50);
    window.addEventListener('beforeunload', () => { try { localStorage.setItem(KEY, JSON.stringify(P)); } catch (e) { /* ok */ } });
    go('schema');
  }
  window.App = { init, get P() { return P; }, get R() { return R; }, sample, stress, approve, setProject, go };
})();
