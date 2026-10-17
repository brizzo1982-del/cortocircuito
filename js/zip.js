/* Generatore minimale di archivi ZIP (senza compressione), usato per .xlsx e .docx. */
(function () {
  'use strict';
  const T = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(b) { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = T[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  const enc = new TextEncoder();
  function build(files) {
    const chunks = [], cent = []; let off = 0;
    const hdr = (n, fill) => { const b = new Uint8Array(n), v = new DataView(b.buffer); fill(v); return b; };
    files.forEach(f => {
      const nm = enc.encode(f.name), d = typeof f.data === 'string' ? enc.encode(f.data) : f.data, crc = crc32(d);
      const lh = hdr(30, v => { v.setUint32(0, 0x04034b50, true); v.setUint16(4, 20, true); v.setUint16(6, 0x0800, true); v.setUint16(8, 0, true); v.setUint16(10, 0, true); v.setUint16(12, 0x5821, true); v.setUint32(14, crc, true); v.setUint32(18, d.length, true); v.setUint32(22, d.length, true); v.setUint16(26, nm.length, true); v.setUint16(28, 0, true); });
      chunks.push(lh, nm, d);
      const ch = hdr(46, v => { v.setUint32(0, 0x02014b50, true); v.setUint16(4, 20, true); v.setUint16(6, 20, true); v.setUint16(8, 0x0800, true); v.setUint16(10, 0, true); v.setUint16(12, 0, true); v.setUint16(14, 0x5821, true); v.setUint32(16, crc, true); v.setUint32(20, d.length, true); v.setUint32(24, d.length, true); v.setUint16(28, nm.length, true); v.setUint32(42, off, true); });
      cent.push(ch, nm);
      off += 30 + nm.length + d.length;
    });
    let csz = 0; cent.forEach(c => csz += c.length);
    const end = hdr(22, v => { v.setUint32(0, 0x06054b50, true); v.setUint16(8, files.length, true); v.setUint16(10, files.length, true); v.setUint32(12, csz, true); v.setUint32(16, off, true); });
    const all = chunks.concat(cent, [end]); let tot = 0; all.forEach(c => tot += c.length);
    const out = new Uint8Array(tot); let p = 0; all.forEach(c => { out.set(c, p); p += c.length; });
    return out;
  }
  window.Zip = { build, crc32 };
})();
