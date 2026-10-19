/* ===== Lecture / écriture XLSX (100 % local, sans bibliothèque) ===== */
const TD = new TextDecoder(), TE = new TextEncoder();

async function inflateRaw(u8) {
  const s = new Blob([u8]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}

async function unzip(buf) {
  const u8 = new Uint8Array(buf), dv = new DataView(buf);
  let e = -1;
  for (let i = u8.length - 22; i >= 0; i--) if (dv.getUint32(i, true) === 0x06054b50) { e = i; break; }
  if (e < 0) throw new Error('Fichier non reconnu (ce n\'est pas un classeur .xlsx).');
  const n = dv.getUint16(e + 10, true);
  let p = dv.getUint32(e + 16, true);
  const files = {};
  for (let i = 0; i < n; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
    const nl = dv.getUint16(p + 28, true), el = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true);
    const lho = dv.getUint32(p + 42, true);
    const name = TD.decode(u8.subarray(p + 46, p + 46 + nl));
    files[name] = { method, csize, lho };
    p += 46 + nl + el + cl;
  }
  return {
    names: Object.keys(files),
    async text(name) {
      const f = files[name]; if (!f) return null;
      const l = f.lho, start = l + 30 + dv.getUint16(l + 26, true) + dv.getUint16(l + 28, true);
      let d = u8.subarray(start, start + f.csize);
      if (f.method === 8) d = await inflateRaw(d);
      return TD.decode(d);
    }
  };
}

const colNum = ref => { const m = /^([A-Z]+)(\d+)$/.exec(ref); let c = 0; for (const ch of m[1]) c = c * 26 + ch.charCodeAt(0) - 64; return { c, r: +m[2] }; };
const colName = n => { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = (n - m - 1) / 26; } return s; };
const xml = t => new DOMParser().parseFromString(t, 'application/xml');
const relsMap = d => { const m = {}; for (const r of d.getElementsByTagName('Relationship')) m[r.getAttribute('Id')] = { target: r.getAttribute('Target'), type: r.getAttribute('Type') }; return m; };
const resolvePath = (base, t) => { if (t.startsWith('/')) return t.slice(1); const parts = base.split('/'); parts.pop(); for (const s of t.split('/')) { if (s === '..') parts.pop(); else if (s !== '.') parts.push(s); } return parts.join('/'); };

async function readXlsx(buf) {
  const z = await unzip(buf);
  const wb = xml(await z.text('xl/workbook.xml'));
  const wbRels = relsMap(xml(await z.text('xl/_rels/workbook.xml.rels')));
  const ssT = await z.text('xl/sharedStrings.xml');
  const shared = ssT ? [...xml(ssT).getElementsByTagName('si')].map(si => [...si.getElementsByTagName('t')].map(t => t.textContent).join('')) : [];
  const sheets = [];
  for (const s of wb.getElementsByTagName('sheet')) {
    const rid = s.getAttribute('r:id') || s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
    const path = resolvePath('xl/workbook.xml', wbRels[rid].target);
    const d = xml(await z.text(path));
    const cells = new Map();
    for (const c of d.getElementsByTagName('c')) {
      const { c: cc, r } = colNum(c.getAttribute('r'));
      const t = c.getAttribute('t'), vEl = c.getElementsByTagName('v')[0];
      let v = null;
      if (t === 'inlineStr') v = [...c.getElementsByTagName('t')].map(x => x.textContent).join('');
      else if (vEl) { v = vEl.textContent; if (t === 's') v = shared[+v]; else if (t === 'str' || t === 'e') v = v; else if (t === 'b') v = v === '1'; else v = Number(v); }
      if (v !== null && v !== '') cells.set(r + ',' + cc, v);
    }
    // commentaires
    const comments = [];
    const relPath = path.replace(/worksheets\/(.*)\.xml$/, 'worksheets/_rels/$1.xml.rels');
    const relT = await z.text(relPath);
    if (relT) for (const r of Object.values(relsMap(xml(relT)))) {
      if (!/\/comments$/.test(r.type)) continue;
      const cd = xml(await z.text(resolvePath(path, r.target)));
      for (const cm of cd.getElementsByTagName('comment')) {
        let txt = [...cm.getElementsByTagName('t')].map(x => x.textContent).join('');
        const m = /Commentaire\s*:\s*([\s\S]*)$/.exec(txt);
        if (m) txt = m[1];
        txt = txt.split('\n').map(l => l.trim()).filter(Boolean).join('\n');
        comments.push({ ...colNum(cm.getAttribute('ref')), text: txt });
      }
    }
    sheets.push({ name: s.getAttribute('name'), cells, comments, get: (r, c) => cells.get(r + ',' + c), maxCol: Math.max(0, ...[...cells.keys()].map(k => +k.split(',')[1])), maxRow: Math.max(0, ...[...cells.keys()].map(k => +k.split(',')[0])) });
  }
  return sheets;
}

/* --- écriture --- */
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = u8 => { let c = 0xffffffff; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

function zipStore(files) { // files: [{name, data:Uint8Array}]
  const parts = [], central = []; let off = 0;
  for (const f of files) {
    const nm = TE.encode(f.name), crc = crc32(f.data), n = f.data.length;
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
    lh.setUint16(10, 0, true); lh.setUint16(12, 0x5821, true); lh.setUint32(14, crc, true); lh.setUint32(18, n, true); lh.setUint32(22, n, true);
    lh.setUint16(26, nm.length, true); lh.setUint16(28, 0, true);
    parts.push(new Uint8Array(lh.buffer), nm, f.data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
    ch.setUint16(12, 0, true); ch.setUint16(14, 0x5821, true); ch.setUint32(16, crc, true); ch.setUint32(20, n, true); ch.setUint32(24, n, true);
    ch.setUint16(28, nm.length, true); ch.setUint32(42, off, true);
    central.push(new Uint8Array(ch.buffer), nm);
    off += 30 + nm.length + n;
  }
  const csize = central.reduce((a, b) => a + b.length, 0);
  const e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, csize, true); e.setUint32(16, off, true);
  return new Blob([...parts, ...central, new Uint8Array(e.buffer)], { type: 'application/zip' });
}

const xesc = s => String(s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** sheets: [{name, rows:[[...]]}] ; 1ère ligne = en-têtes. Valeurs : string | number | Date | null */
function buildXlsx(sheets) {
  const used = new Set();
  const safe = sheets.map((s, i) => {
    let n = String(s.name || 'Feuille' + (i + 1)).replace(/[:\\\/?*\[\]]/g, '-').slice(0, 31) || 'Feuille';
    let k = n, j = 2; while (used.has(k.toLowerCase())) k = n.slice(0, 28) + ' ' + j++;
    used.add(k.toLowerCase()); return { ...s, name: k };
  });
  const files = [];
  const add = (name, text) => files.push({ name, data: TE.encode(text) });
  add('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' + safe.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') + '</Types>');
  add('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
  add('xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' + safe.map((s, i) => `<sheet name="${xesc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') + '</sheets></workbook>');
  add('xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + safe.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') + `<Relationship Id="rId${safe.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
  add('xl/styles.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1F4E79"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs></styleSheet>');
  safe.forEach((s, i) => {
    const widths = [];
    const rows = s.rows.map((row, ri) => '<row r="' + (ri + 1) + '">' + row.map((v, ci) => {
      if (v === null || v === undefined || v === '') return '';
      const ref = colName(ci + 1) + (ri + 1);
      let len;
      let out;
      if (v instanceof Date) { out = `<c r="${ref}" s="2"><v>${Date.UTC(v.getFullYear(), v.getMonth(), v.getDate()) / 86400000 + 25569}</v></c>`; len = 10; }
      else if (typeof v === 'number') { out = `<c r="${ref}"${ri === 0 ? ' s="1"' : ''}><v>${v}</v></c>`; len = String(v).length; }
      else { const t = String(v); out = `<c r="${ref}" t="inlineStr"${ri === 0 ? ' s="1"' : ''}><is><t xml:space="preserve">${xesc(t)}</t></is></c>`; len = Math.max(...t.split('\n').map(x => x.length)); }
      widths[ci] = Math.max(widths[ci] || 8, Math.min(60, len + 2));
      return out;
    }).join('') + '</row>').join('');
    const cols = '<cols>' + widths.map((w, ci) => `<col min="${ci + 1}" max="${ci + 1}" width="${w || 8}" customWidth="1"/>`).join('') + '</cols>';
    add(`xl/worksheets/sheet${i + 1}.xml`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>${cols}<sheetData>${rows}</sheetData></worksheet>`);
  });
  return zipStore(files);
}
