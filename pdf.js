/* Generatore PDF minimale (Helvetica, tabelle con ritorno a capo, immagini JPEG) con rendering di "blocchi" di documento. */
(function () {
  'use strict';
  const MAP = { '–': '-', '—': '-', '‘': "'", '’': "'", '“': '"', '”': '"', '…': '...', '≥': '>=', '≤': '<=', '√': 'rad', 'Ω': 'ohm', 'κ': 'k', 'φ': 'fi', 'Δ': 'D', 'Σ': 'S', '≈': '~', '→': '->', 'μ': 'µ', '′': "'", '″': '"', '∑': 'S', '·': '·', '−': '-', 'ᵢ': 'i', '₁': '1', '₂': '2', '₃': '3', 'ₖ': 'k', '’': "'" };
  const SUP = { '⁰': '0', '¹': '¹' };
  function winAnsi(s) {
    s = String(s == null ? '' : s); let o = '';
    for (const ch of s) {
      let c = MAP[ch] != null ? MAP[ch] : ch; const code = c.charCodeAt(0);
      if (c.length === 1 && code < 256) o += c; else if (c.length > 1) o += c.replace(/[^\x00-\xff]/g, '?'); else o += '?';
    }
    return o;
  }
  const esc = s => winAnsi(s).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)').replace(/[\r\n]/g, ' ');
  const cv = document.createElement('canvas').getContext('2d');
  function tw(s, size, bold) { cv.font = (bold ? 'bold ' : '') + size + 'px Arial'; return cv.measureText(winAnsi(s)).width; }
  function wrap(text, w, size, bold) {
    const out = [];
    String(text == null ? '' : text).split('\n').forEach(par => {
      const words = par.split(/\s+/).filter(Boolean); let line = '';
      if (!words.length) { out.push(''); return; }
      words.forEach(wd => {
        const t = line ? line + ' ' + wd : wd;
        if (tw(t, size, bold) <= w || !line) {
          if (!line && tw(wd, size, bold) > w) { // parola troppo lunga: spezza
            let part = ''; for (const ch of wd) { if (tw(part + ch, size, bold) > w && part) { out.push(part); part = ch; } else part += ch; }
            line = part;
          } else line = t;
        } else { out.push(line); line = wd; }
      });
      out.push(line);
    });
    return out;
  }

  class Doc {
    constructor(opts) {
      opts = opts || {};
      this.land = !!opts.landscape; this.W = this.land ? 841.89 : 595.28; this.H = this.land ? 595.28 : 841.89;
      this.m = 40; this.pages = []; this.imgs = []; this.title = opts.title || ''; this.sub = opts.sub || '';
      this.newPage();
    }
    newPage() { this.pg = { ops: [], im: [] }; this.pages.push(this.pg); this.y = this.m + 14; }
    get cw() { return this.W - 2 * this.m; }
    ensure(h) { if (this.y + h > this.H - this.m - 14) this.newPage(); }
    color(r, g, b, stroke) { this.pg.ops.push(`${(r / 255).toFixed(3)} ${(g / 255).toFixed(3)} ${(b / 255).toFixed(3)} ${stroke ? 'RG' : 'rg'}`); }
    text(x, y, s, size, bold, col, align) {
      size = size || 10; col = col || [20, 30, 40];
      let px = x; if (align === 'right') px = x - tw(s, size, bold); else if (align === 'center') px = x - tw(s, size, bold) / 2;
      this.color(col[0], col[1], col[2]);
      this.pg.ops.push(`BT /F${bold ? 2 : 1} ${size} Tf ${px.toFixed(2)} ${(this.H - y).toFixed(2)} Td (${esc(s)}) Tj ET`);
    }
    rect(x, y, w, h, fill, stroke) {
      if (fill) { this.color(fill[0], fill[1], fill[2]); this.pg.ops.push(`${x.toFixed(2)} ${(this.H - y - h).toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`); }
      if (stroke) { this.color(stroke[0], stroke[1], stroke[2], true); this.pg.ops.push(`0.5 w ${x.toFixed(2)} ${(this.H - y - h).toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re S`); }
    }
    line(x1, y1, x2, y2, col) { this.color(col[0], col[1], col[2], true); this.pg.ops.push(`0.6 w ${x1.toFixed(2)} ${(this.H - y1).toFixed(2)} m ${x2.toFixed(2)} ${(this.H - y2).toFixed(2)} l S`); }
    image(bytes, iw, ih, x, y, w, h) {
      let idx = this.imgs.findIndex(i => i.bytes === bytes);
      if (idx < 0) { this.imgs.push({ bytes, iw, ih }); idx = this.imgs.length - 1; }
      if (this.pg.im.indexOf(idx) < 0) this.pg.im.push(idx);
      this.pg.ops.push(`q ${w.toFixed(2)} 0 0 ${h.toFixed(2)} ${x.toFixed(2)} ${(this.H - y - h).toFixed(2)} cm /Im${idx + 1} Do Q`);
    }

    /* ---- blocchi ---- */
    para(txt, o) {
      o = o || {}; const size = o.size || 10, lh = size * 1.35, lines = wrap(txt, this.cw - (o.indent || 0), size, o.bold);
      lines.forEach(l => { this.ensure(lh); this.text(this.m + (o.indent || 0), this.y + size, l, size, o.bold, o.color); this.y += lh; });
      this.y += o.after == null ? 4 : o.after;
    }
    heading(txt, lvl) {
      const size = lvl === 1 ? 15 : 12; this.ensure(size * 2.6 + 70);
      this.y += lvl === 1 ? 8 : 4;
      this.text(this.m, this.y + size, txt, size, true, lvl === 1 ? [31, 78, 121] : [30, 40, 50]);
      this.y += size * 1.3;
      if (lvl === 1) { this.line(this.m, this.y, this.W - this.m, this.y, [31, 78, 121]); }
      this.y += 6;
    }
    bullets(items) {
      items.forEach(it => {
        const lines = wrap(it, this.cw - 16, 10, false);
        lines.forEach((l, i) => { this.ensure(13.5); if (i === 0) this.text(this.m + 4, this.y + 10, '•', 10, true); this.text(this.m + 16, this.y + 10, l, 10); this.y += 13.5; });
      });
      this.y += 4;
    }
    table(head, rows, o) {
      o = o || {}; const size = o.size || 8, pad = 3, lh = size * 1.25, n = (head || rows[0]).length;
      const align = o.align || [];
      let ws;
      if (o.widths) ws = o.widths.slice();
      else {
        ws = new Array(n).fill(0);
        const samp = rows.length > 400 ? rows.filter((_, i) => i % Math.ceil(rows.length / 400) === 0) : rows;
        for (let c = 0; c < n; c++) {
          let mx = head ? tw(head[c], size, true) : 0;
          samp.forEach(r => { mx = Math.max(mx, tw(r[c], size, false)); });
          ws[c] = Math.min(mx, 180) + 2 * pad;
        }
      }
      const tot = ws.reduce((a, b) => a + b, 0), k = this.cw / tot; ws = ws.map(w => w * k);
      const drawHead = () => {
        if (!head) return;
        const lines = head.map((h, c) => wrap(h, ws[c] - 2 * pad, size, true)), hh = Math.max(...lines.map(l => l.length)) * lh + 2 * pad;
        this.ensure(hh + lh * 2); this.rect(this.m, this.y, this.cw, hh, [31, 78, 121]);
        let x = this.m; lines.forEach((l, c) => { l.forEach((t, i) => this.text(align[c] === 'r' ? x + ws[c] - pad : x + pad, this.y + pad + size + i * lh - 1, t, size, true, [255, 255, 255], align[c] === 'r' ? 'right' : 'left')); x += ws[c]; });
        this.y += hh;
      };
      if (o.caption) { this.ensure(70); this.para(o.caption, { bold: true, size: 9, after: 2 }); }
      drawHead();
      rows.forEach((r, ri) => {
        const cells = r.map((v, c) => wrap(v, ws[c] - 2 * pad, size, o.boldFirst && c === 0)), rh = Math.max(...cells.map(l => l.length)) * lh + 2 * pad - 1;
        if (this.y + rh > this.H - this.m - 14) { this.newPage(); drawHead(); }
        if (ri % 2) this.rect(this.m, this.y, this.cw, rh, [243, 246, 250]);
        let x = this.m;
        cells.forEach((l, c) => { l.forEach((t, i) => this.text(align[c] === 'r' ? x + ws[c] - pad : x + pad, this.y + pad + size + i * lh - 2, t, size, o.boldFirst && c === 0, null, align[c] === 'r' ? 'right' : 'left')); x += ws[c]; });
        this.line(this.m, this.y + rh, this.W - this.m, this.y + rh, [215, 222, 230]);
        this.y += rh;
      });
      this.y += 8;
    }
    picture(img, caption) {
      let w = this.cw, h = w * img.h / img.w;
      const maxH = this.H - 2 * this.m - 60;
      if (h > maxH) { h = maxH; w = h * img.w / img.h; }
      this.ensure(h + 24); this.image(img.bytes, img.w, img.h, this.m + (this.cw - w) / 2, this.y, w, h); this.y += h + 4;
      if (caption) this.para(caption, { size: 8, color: [90, 100, 110] });
    }
    blocks(bl) {
      bl.forEach(b => {
        switch (b.t) {
          case 'h1': this.heading(b.x, 1); break;
          case 'h2': this.heading(b.x, 2); break;
          case 'p': this.para(b.x, b.o); break;
          case 'note': this.para(b.x, { size: 8.5, color: [90, 100, 110] }); break;
          case 'ul': this.bullets(b.items); break;
          case 'table': this.table(b.head, b.rows, { size: b.size, align: b.align, widths: b.widths, caption: b.caption, boldFirst: b.boldFirst }); break;
          case 'kv': this.table(null, b.rows, { size: 9, widths: [1, 3], boldFirst: true }); break;
          case 'img': this.picture(b.img, b.caption); break;
          case 'pb': this.newPage(); break;
        }
      });
    }

    /* ---- salvataggio ---- */
    save() {
      const N = this.pages.length;
      this.pages.forEach((p, i) => {
        this.pg = p;
        this.text(this.m, 26, this.title, 8, false, [110, 120, 130]);
        this.text(this.W - this.m, 26, this.sub, 8, false, [110, 120, 130], 'right');
        this.line(this.m, 30, this.W - this.m, 30, [200, 208, 216]);
        this.text(this.W / 2, this.H - 20, `Pagina ${i + 1} di ${N}`, 8, false, [110, 120, 130], 'center');
      });
      const parts = []; let off = 0; const offs = [];
      const bin = s => { const b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 255; return b; };
      const put = d => { const b = typeof d === 'string' ? bin(d) : d; parts.push(b); off += b.length; };
      const obj = (id, body) => { offs[id] = off; put(`${id} 0 obj\n`); put(body); put('\nendobj\n'); };
      put('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
      const nI = this.imgs.length, firstPage = 6 + nI;
      obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
      obj(2, `<< /Type /Pages /Kids [${this.pages.map((_, i) => `${firstPage + 2 * i + 1} 0 R`).join(' ')}] /Count ${N} >>`);
      obj(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
      obj(4, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
      obj(5, '<< /Producer (Cortocircuito) >>');
      this.imgs.forEach((im, i) => {
        offs[6 + i] = off; put(`${6 + i} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${im.iw} /Height ${im.ih} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${im.bytes.length} >>\nstream\n`);
        put(im.bytes); put('\nendstream\nendobj\n');
      });
      this.pages.forEach((p, i) => {
        const cid = firstPage + 2 * i, pid = cid + 1, stream = p.ops.join('\n');
        offs[cid] = off; put(`${cid} 0 obj\n<< /Length ${stream.length} >>\nstream\n`); put(stream); put('\nendstream\nendobj\n');
        const xo = p.im.length ? ` /XObject << ${p.im.map(k => `/Im${k + 1} ${6 + k} 0 R`).join(' ')} >>` : '';
        obj(pid, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${this.W.toFixed(2)} ${this.H.toFixed(2)}] /Contents ${cid} 0 R /Resources << /Font << /F1 3 0 R /F2 4 0 R >>${xo} >> >>`);
      });
      const total = firstPage + 2 * N, xref = off;
      let x = `xref\n0 ${total}\n0000000000 65535 f \n`;
      for (let i = 1; i < total; i++) x += String(offs[i]).padStart(10, '0') + ' 00000 n \n';
      put(x + `trailer\n<< /Size ${total} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${xref}\n%%EOF`);
      let tot = 0; parts.forEach(p => tot += p.length);
      const out = new Uint8Array(tot); let p = 0; parts.forEach(c => { out.set(c, p); p += c.length; });
      return out;
    }
  }
  window.Pdf = { Doc, winAnsi };
})();
