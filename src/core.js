'use strict';
/* ===== Utilitaires ===== */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
const pad = n => String(n).padStart(2, '0');
const toISO = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseISO = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const today = () => toISO(new Date());
const addDays = (iso, n) => { const d = parseISO(iso); d.setDate(d.getDate() + n); return toISO(d); };
const startOfWeek = iso => { const d = parseISO(iso); d.setDate(d.getDate() - (d.getDay() + 6) % 7); return toISO(d); };
const fmtDate = (iso, o) => iso ? parseISO(iso).toLocaleDateString('fr-FR', o || { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : '';
const fmtShort = iso => iso ? parseISO(iso).toLocaleDateString('fr-FR') : '';
const fmtH = h => { const m = Math.round((h || 0) * 60), hh = Math.floor(m / 60), mm = m % 60; return mm ? `${hh} h ${pad(mm)}` : `${hh} h`; };
const t2m = t => { if (!t) return null; const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const norm = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const lev = (a, b) => { const m = a.length, n = b.length; if (!m) return n; if (!n) return m; let p = Array.from({ length: n + 1 }, (_, i) => i); for (let i = 1; i <= m; i++) { const c = [i]; for (let j = 1; j <= n; j++) c[j] = Math.min(p[j] + 1, c[j - 1] + 1, p[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); p = c; } return p[n]; };
const sum = (a, f) => a.reduce((x, y) => x + (f ? f(y) : y), 0);
const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s;
const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

function download(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); }

/* ===== Référentiels fixes ===== */
const STATUTS = [
  { id: 'a_planifier', label: 'À planifier', color: '#9a8fb0', glyph: '○' },
  { id: 'planifiee', label: 'Planifiée', color: '#7c6cf0', glyph: '◔' },
  { id: 'confirmee', label: 'Confirmée', color: '#12a69a', glyph: '◑' },
  { id: 'realisee', label: 'Réalisée', color: '#2fb36d', glyph: '●' },
  { id: 'reportee', label: 'Reportée', color: '#f29e4c', glyph: '↻' },
  { id: 'annulee', label: 'Annulée', color: '#e5487a', glyph: '✕' }
];
const ST = Object.fromEntries(STATUTS.map(s => [s.id, s]));
const ROLES = { admin: 'Administrateur', gestionnaire: 'Gestionnaire', animateur: 'Animateur', manager: 'Manager / pilote', lecteur: 'Lecteur' };
const PALETTE = ['#e0539a', '#8b5cf6', '#14b8a6', '#f59e42', '#f472b6', '#6366f1', '#84cc16', '#06b6d4'];
const PENDING = ['a_planifier', 'planifiee', 'confirmee'];
const ACTIVE = ['a_planifier', 'planifiee', 'confirmee', 'realisee'];

/* ===== Base de données (stockage local du navigateur) ===== */
let DB = null;
const KEY = 'formidable.db.v1';
const S = { user: null, view: 'dashboard', F: {}, cal: { mode: 'month', date: today(), group: '', color: 'statut' }, sort: { k: 'date', d: 1 }, setTab: 'types' };

function newDB() {
  return {
    v: 1, settingsMod: '', del: {},
    settings: {
      org: '', alertDays: 7,
      types: [{ id: uid(), name: 'Néo', color: PALETTE[0] }, { id: uid(), name: 'SPECIFICA', color: PALETTE[1] }, { id: uid(), name: 'Collectif Agence', color: PALETTE[3] }],
      themes: [], equipes: [], populations: ['Nouveaux collaborateurs', 'Conseillers', 'Managers'],
      durees: [{ l: 'Demi-journée', h: 3 }, { l: 'Journée', h: 7 }]
    },
    lieux: ['Aiguille de Bionnassay|salle', 'Cirque du Fer à Cheval|salle', 'Dôme du Goûter|salle', 'Agence Annecy Saint-François|agence', 'Agence de Saint-Michel-de-Maurienne|agence'].map(x => { const [name, kind] = x.split('|'); return { id: uid(), name, kind, adresse: '', secteur: '', lien: '', aliases: [], mod: '' }; }),
    animateurs: [], users: [], sessions: [], history: []
  };
}
function loadDB() { try { const t = localStorage.getItem(KEY); if (t) { DB = JSON.parse(t); return true; } } catch (e) { console.error(e); } DB = newDB(); return false; }
const stamp = o => { o.mod = new Date().toISOString(); return o; };
const touchSettings = () => { DB.settingsMod = new Date().toISOString(); };
function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(DB)); } catch (e) { toast('Stockage du navigateur indisponible ou plein : exportez une sauvegarde !', 'err'); }
  scheduleFileSave();
}
function logH(action, s, detail) {
  DB.history.push({ id: uid(), ts: new Date().toISOString(), user: S.user ? S.user.name : '—', sid: s ? s.id : null, label: s ? sessionLabel(s) : '', action, detail: detail || '' });
  if (DB.history.length > 20000) DB.history.splice(0, DB.history.length - 20000);
}
function mergeDB(a, b) {
  const r = structuredClone(a), del = { ...(a.del || {}), ...(b.del || {}) };
  for (const k of ['sessions', 'animateurs', 'lieux', 'users']) {
    const m = new Map();
    for (const x of [...(a[k] || []), ...(b[k] || [])]) { const o = m.get(x.id); if (!o || (x.mod || '') > (o.mod || '')) m.set(x.id, x); }
    r[k] = [...m.values()].filter(x => !(del[x.id] && del[x.id] >= (x.mod || '')));
  }
  const h = new Map(); for (const x of [...(a.history || []), ...(b.history || [])]) h.set(x.id, x);
  r.history = [...h.values()].sort((x, y) => x.ts < y.ts ? -1 : 1);
  if ((b.settingsMod || '') > (a.settingsMod || '')) { r.settings = b.settings; r.settingsMod = b.settingsMod; }
  r.del = del; return r;
}

/* Accès rapides */
const A = id => DB.animateurs.find(x => x.id === id);
const L = id => DB.lieux.find(x => x.id === id);
const T = id => DB.settings.types.find(x => x.id === id);
const animName = id => (A(id) || {}).name || '';
const typeName = id => (T(id) || {}).name || '—';
const lieuName = s => s.modalite === 'distance' ? 'À distance' : ((L(s.lieuId) || {}).name || '');
function sessionLabel(s) { return `${fmtShort(s.date)} · ${s.titre || typeName(s.typeId)}`; }
const involved = s => [s.titulaireId, s.suppleantId, ...(s.coanim || [])].filter(Boolean);
/** Intervenants qui « comptent » pour la session (titulaire, ou suppléant s'il est intervenu, + coanimateurs) */
const effective = s => [...new Set([...(s.suppIntervenu && s.suppleantId ? [s.suppleantId] : (s.titulaireId ? [s.titulaireId] : [])), ...(s.coanim || [])])];
const dureeEff = s => s.statut === 'realisee' ? (s.dureeReelle ?? s.duree ?? 0) : (s.duree ?? 0);

function newSession(o = {}) {
  return { id: uid(), titre: '', typeId: '', theme: '', objectif: '', date: '', debut: '', fin: '', duree: 7, dureeReelle: null, statut: 'planifiee', modalite: 'presentiel', lieuId: '', lienVisio: '', adresse: '', titulaireId: '', suppleantId: '', suppIntervenu: false, coanim: [], coanimRole: '', caisse: '', agences: '', demandeur: '', population: '', profil: '', prevus: null, presents: null, participants: '', dateDemande: '', origine: '', organisateur: '', logistique: '', support: '', docs: [], commentaire: '', motif: '', dateDecision: '', decisionPar: '', nouvelleDate: '', groupeId: '', remplaceId: '', created: new Date().toISOString(), createdBy: S.user ? S.user.name : '', ...o };
}

/* ===== Droits ===== */
const role = () => S.user ? S.user.role : null;
const can = {
  edit: () => ['admin', 'gestionnaire'].includes(role()),
  own: s => role() === 'animateur' && S.user.animateurId && involved(s).includes(S.user.animateurId),
  refs: () => ['admin', 'gestionnaire'].includes(role()),
  admin: () => role() === 'admin',
  imp: () => ['admin', 'gestionnaire'].includes(role()),
  exp: () => ['admin', 'gestionnaire', 'manager'].includes(role()),
  hist: () => ['admin', 'gestionnaire', 'manager'].includes(role())
};

/* ===== Authentification locale (garde-fou ergonomique) ===== */
async function hashPin(salt, pin) {
  if (crypto.subtle) { const b = await crypto.subtle.digest('SHA-256', TE.encode(salt + ':' + pin)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join(''); }
  return 'x' + btoa(unescape(encodeURIComponent(salt + pin)));
}
async function makeUser(name, roleId, pin, animateurId) {
  const u = stamp({ id: uid(), name, role: roleId, animateurId: animateurId || '', salt: uid(), pin: '' });
  if (pin) u.pin = await hashPin(u.salt, pin);
  return u;
}

/* ===== Sauvegarde chiffrée (AES-GCM / PBKDF2) ===== */
const b64 = u8 => { let s = ''; u8.forEach(x => s += String.fromCharCode(x)); return btoa(s); };
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
async function deriveKey(pw, salt) { const k = await crypto.subtle.importKey('raw', TE.encode(pw), 'PBKDF2', false, ['deriveKey']); return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 250000, hash: 'SHA-256' }, k, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']); }
async function encryptJSON(obj, pw) { const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12)); const key = await deriveKey(pw, salt); const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, TE.encode(JSON.stringify(obj)))); return { fmt: 'formidable-enc', v: 1, salt: b64(salt), iv: b64(iv), data: b64(ct) }; }
async function decryptJSON(o, pw) { const key = await deriveKey(pw, unb64(o.salt)); const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(o.iv) }, key, unb64(o.data)); return JSON.parse(TD.decode(pt)); }

/* ===== Fichier de données partagé (File System Access API) ===== */
const FS = { h: null, mod: 0, msg: '', timer: null };
const FS_OK = typeof window.showSaveFilePicker === 'function';
function kv(mode, fn) { return new Promise((res, rej) => { const o = indexedDB.open('formidable', 1); o.onupgradeneeded = () => o.result.createObjectStore('kv'); o.onerror = () => rej(o.error); o.onsuccess = () => { const tx = o.result.transaction('kv', mode), r = fn(tx.objectStore('kv')); tx.oncomplete = () => res(r && r.result); tx.onerror = () => rej(tx.error); }; }); }
const kvGet = k => kv('readonly', s => s.get(k)), kvSet = (k, v) => kv('readwrite', s => s.put(v, k)), kvDel = k => kv('readwrite', s => s.delete(k));
const FILE_TYPES = [{ description: 'Données Formidable', accept: { 'application/json': ['.json'] } }];

async function fileInit() { if (!FS_OK) return; try { FS.h = await kvGet('h') || null; if (FS.h) { FS.msg = (await FS.h.queryPermission({ mode: 'readwrite' })) === 'granted' ? 'ok' : 'reauth'; if (FS.msg === 'ok') await fileCheck(true); } } catch (e) { FS.h = null; } }
async function fileLink(create) {
  const h = create ? await showSaveFilePicker({ suggestedName: 'formidable-donnees.json', types: FILE_TYPES }) : (await showOpenFilePicker({ types: FILE_TYPES }))[0];
  FS.h = h; await kvSet('h', h); FS.mod = 0;
  const f = await h.getFile();
  if (f.size > 2) { const remote = JSON.parse(await f.text()); if (remote.fmt === 'formidable-enc') throw new Error('Ce fichier est une sauvegarde chiffrée : utilisez « Restaurer une sauvegarde ».'); DB = mergeDB(DB, remote); FS.mod = f.lastModified; }
  persist(); await fileWrite(true); FS.msg = 'ok';
}
async function fileUnlink() { FS.h = null; FS.msg = ''; try { await kvDel('h'); } catch (e) { } }
async function fileReauth() { try { if ((await FS.h.requestPermission({ mode: 'readwrite' })) === 'granted') { FS.msg = 'ok'; await fileCheck(true); await fileWrite(true); } } catch (e) { FS.msg = 'err'; } render(); }
async function fileCheck(silent) {
  if (!FS.h || FS.msg !== 'ok') return;
  try {
    const f = await FS.h.getFile();
    if (f.lastModified > FS.mod && f.size > 2) { const remote = JSON.parse(await f.text()); DB = mergeDB(DB, remote); FS.mod = f.lastModified; try { localStorage.setItem(KEY, JSON.stringify(DB)); } catch (e) { } if (!silent) { toast('Planning mis à jour depuis le fichier partagé.'); render(); } }
  } catch (e) { FS.msg = 'err'; }
}
function scheduleFileSave() { if (!FS.h) return; clearTimeout(FS.timer); FS.timer = setTimeout(() => fileWrite(), 400); }
async function fileWrite(force) {
  if (!FS.h) return;
  try {
    if ((await FS.h.queryPermission({ mode: 'readwrite' })) !== 'granted') { FS.msg = 'reauth'; updateSync(); return; }
    const f = await FS.h.getFile();
    if (f.lastModified > FS.mod && f.size > 2 && !force) { DB = mergeDB(DB, JSON.parse(await f.text())); toast('Fusion avec les modifications d\'un collègue.'); try { localStorage.setItem(KEY, JSON.stringify(DB)); } catch (e) { } render(); }
    const w = await FS.h.createWritable(); await w.write(JSON.stringify(DB)); await w.close();
    FS.mod = (await FS.h.getFile()).lastModified; FS.msg = 'ok';
  } catch (e) { console.error(e); FS.msg = 'err'; }
  updateSync();
}
function updateSync() { const el = $('#sync'); if (el) el.outerHTML = syncHTML(); }
function syncHTML() {
  if (!FS_OK) return '<span id="sync" class="pill" title="Le navigateur ne permet pas le fichier partagé : utilisez Chrome ou Edge, ou les sauvegardes manuelles.">Données locales</span>';
  if (!FS.h) return '<button id="sync" class="pill warn" data-act="goto" data-v="echanges" title="Les données sont uniquement dans ce navigateur">Données locales · lier un fichier</button>';
  if (FS.msg === 'reauth') return '<button id="sync" class="pill warn" data-act="fsauth">Fichier partagé : cliquer pour réautoriser</button>';
  if (FS.msg === 'err') return '<button id="sync" class="pill err" data-act="goto" data-v="echanges">Erreur fichier partagé</button>';
  return `<span id="sync" class="pill ok" title="Synchronisé avec ${esc(FS.h.name)}">Fichier partagé : ${esc(FS.h.name)}</span>`;
}

/* ===== Filtrage ===== */
/** Filtres propres à chaque onglet : tableau de bord = année en cours ; sessions = à venir (jour inclus) */
function curF() { return S.F[S.view] ||= S.view === 'dashboard' ? { year: String(new Date().getFullYear()) } : S.view === 'sessions' ? { scope: 'avenir' } : {}; }
function filtered(list = DB.sessions, f = curF()) {
  const t = today();
  return list.filter(s => {
    if (f.scope === 'avenir' && s.date < t) return false;
    if (f.scope === 'passees' && s.date >= t) return false;
    if (f.from && s.date < f.from) return false;
    if (f.to && s.date > f.to) return false;
    if (f.year && !f.from && !f.to && s.date.slice(0, 4) !== f.year) return false;
    if (f.type && s.typeId !== f.type) return false;
    if (f.theme && s.theme !== f.theme) return false;
    if (f.statut && s.statut !== f.statut) return false;
    if (f.modalite && s.modalite !== f.modalite) return false;
    if (f.anim && !involved(s).includes(f.anim)) return false;
    if (f.equipe && !involved(s).some(i => (A(i) || {}).equipe === f.equipe)) return false;
    if (f.lieu && s.lieuId !== f.lieu) return false;
    if (f.secteur && ((L(s.lieuId) || {}).secteur || '') !== f.secteur) return false;
    if (f.q) { const q = norm(f.q); if (!norm([s.titre, typeName(s.typeId), s.theme, lieuName(s), animName(s.titulaireId), animName(s.suppleantId), s.demandeur, s.commentaire, s.agences, s.caisse].join(' ')).includes(q)) return false; }
    return true;
  });
}

/* ===== Alertes ===== */
function computeAlerts() {
  const out = [], t = today(), soon = addDays(t, DB.settings.alertDays || 7);
  const act = DB.sessions.filter(s => ['a_planifier', 'planifiee', 'confirmee', 'realisee'].includes(s.statut));
  for (const s of DB.sessions) {
    if (s.statut === 'annulee' || s.statut === 'reportee') continue;
    if (!s.titulaireId) out.push({ sev: 'warn', kind: 'Animateur manquant', sid: s.id, msg: 'Aucun animateur titulaire désigné.' });
    else if (!s.suppleantId && s.statut !== 'realisee') out.push({ sev: 'info', kind: 'Suppléant manquant', sid: s.id, msg: 'Aucun suppléant prévu.' });
    if (s.date < t && PENDING.includes(s.statut)) out.push({ sev: 'warn', kind: 'À confirmer', sid: s.id, msg: 'Session passée non confirmée comme réalisée.' });
    if (s.date >= t && s.date <= soon && s.statut !== 'a_planifier') { const n = Math.round((parseISO(s.date) - parseISO(t)) / 864e5); out.push({ sev: 'rappel', kind: 'Rappel', sid: s.id, msg: n === 0 ? 'Session aujourd\'hui.' : `Session dans ${n} jour${n > 1 ? 's' : ''}.` }); }
  }
  const byDate = {};
  act.forEach(s => (byDate[s.date] ||= []).push(s));
  const overlap = (a, b) => { const a1 = t2m(a.debut), a2 = t2m(a.fin), b1 = t2m(b.debut), b2 = t2m(b.fin); if (a1 !== null && a2 !== null && b1 !== null && b2 !== null) return a1 < b2 && b1 < a2; return (a.duree || 0) + (b.duree || 0) > 7.5; };
  for (const list of Object.values(byDate)) for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const a = list[i], b = list[j]; if (!overlap(a, b)) continue;
    const ea = effective(a), common = ea.filter(x => effective(b).includes(x));
    if (common.length) { const m = `Conflit : ${common.map(animName).join(', ')} est aussi sur « ${sessionLabel(b)} ».`; out.push({ sev: 'warn', kind: 'Conflit animateur', sid: a.id, msg: m }); out.push({ sev: 'warn', kind: 'Conflit animateur', sid: b.id, msg: `Conflit : ${common.map(animName).join(', ')} est aussi sur « ${sessionLabel(a)} ».` }); }
    const l = a.lieuId && a.lieuId === b.lieuId && a.modalite !== 'distance' && b.modalite !== 'distance' ? L(a.lieuId) : null;
    if (l && l.kind === 'salle') { out.push({ sev: 'warn', kind: 'Conflit de salle', sid: a.id, msg: `Salle « ${l.name} » déjà prise par « ${sessionLabel(b)} ».` }); out.push({ sev: 'warn', kind: 'Conflit de salle', sid: b.id, msg: `Salle « ${l.name} » déjà prise par « ${sessionLabel(a)} ».` }); }
  }
  return out.sort((x, y) => (x.sev === y.sev ? 0 : x.sev === 'warn' ? -1 : x.sev === 'info' ? (y.sev === 'warn' ? 1 : -1) : 1) || (DB.sessions.find(s => s.id === x.sid).date < DB.sessions.find(s => s.id === y.sid).date ? -1 : 1));
}
const conflictsFor = s => computeAlerts().filter(a => a.sid === s.id && a.kind.startsWith('Conflit'));

/* ===== Statistiques ===== */
function stats(list) {
  const r = { n: list.length, st: Object.fromEntries(STATUTS.map(s => [s.id, 0])), hPlan: 0, hReal: 0, prevus: 0, presents: 0, partN: 0, anim: {}, type: {}, lieu: {}, secteur: {}, mois: {} };
  const ent = (o, k, name) => o[k] ||= { name, prev: 0, real: 0, hPrev: 0, hReal: 0, ann: 0, rep: 0 };
  for (const s of list) {
    r.st[s.statut]++;
    const active = ACTIVE.includes(s.statut), done = s.statut === 'realisee';
    const h = s.duree || 0, hr = dureeEff(s);
    if (active) r.hPlan += h;
    if (done) { r.hReal += hr; if (s.prevus != null) r.prevus += +s.prevus; if (s.presents != null) { r.presents += +s.presents; r.partN++; } }
    const targets = [['type', s.typeId, typeName(s.typeId)], ['lieu', s.modalite === 'distance' ? 'dist' : (s.lieuId || '-'), lieuName(s) || 'Non renseigné'], ['secteur', ((L(s.lieuId) || {}).secteur || (s.modalite === 'distance' ? 'À distance' : 'Non renseigné')), ((L(s.lieuId) || {}).secteur || (s.modalite === 'distance' ? 'À distance' : 'Non renseigné'))]];
    for (const [g, k, nm] of targets) { const e = ent(r[g], k, nm); if (active) { e.prev++; e.hPrev += h; } if (done) { e.real++; e.hReal += hr; } if (s.statut === 'annulee') e.ann++; if (s.statut === 'reportee') e.rep++; }
    const who = effective(s).length ? effective(s) : [''];
    for (const a of who) { const e = ent(r.anim, a || '-', a ? animName(a) : 'Non attribué'); if (active) { e.prev++; e.hPrev += h; } if (done) { e.real++; e.hReal += hr; } if (s.statut === 'annulee') e.ann++; if (s.statut === 'reportee') e.rep++; }
    const m = s.date.slice(0, 7); r.mois[m] ||= Object.fromEntries(STATUTS.map(x => [x.id, 0])); r.mois[m][s.statut]++;
  }
  r.taux = r.prevus ? r.presents / r.prevus : null;
  return r;
}

/* ===== Export des sessions ===== */
const MODAL = { presentiel: 'Présentiel', distance: 'À distance' };
const SESSION_COLS = ['Date', 'Début', 'Fin', 'Durée prévue (h)', 'Durée réelle (h)', 'Année', 'Intitulé', 'Type', 'Thème / produit', 'Statut', 'Modalité', 'Lieu', 'Secteur', 'Titulaire', 'Suppléant', 'Suppléant intervenu', 'Coanimateurs', 'Équipe', 'Demandeur', 'Participants prévus', 'Participants présents', 'Commentaire', 'Motif annulation/report', 'Nouvelle date'];
function sessionRow(s) {
  const d = x => x ? parseISO(x) : null;
  return [d(s.date), s.debut, s.fin, s.duree, s.dureeReelle, +s.date.slice(0, 4), s.titre, typeName(s.typeId), s.theme, ST[s.statut].label, MODAL[s.modalite], lieuName(s), (L(s.lieuId) || {}).secteur || '', animName(s.titulaireId), animName(s.suppleantId), s.suppIntervenu ? 'Oui' : '', (s.coanim || []).map(animName).join(', '), (A(s.titulaireId) || {}).equipe || '', s.demandeur, s.prevus, s.presents, s.commentaire, s.motif, d(s.nouvelleDate)];
}
const sortedSessions = l => [...l].sort((a, b) => (a.date + (a.debut || '')) < (b.date + (b.debut || '')) ? -1 : 1);
function icsFor(list) {
  const e = s => String(s).replace(/[\;,]/g, m => '\\' + m).replace(/\n/g, '\\n');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Formidable//FR', 'CALSCALE:GREGORIAN'];
  for (const s of list) {
    const d = s.date.replace(/-/g, '');
    lines.push('BEGIN:VEVENT', `UID:${s.id}@formidable`, `DTSTAMP:${new Date().toISOString().replace(/[-:]|\.\d+/g, '')}`);
    if (s.debut) { const end = s.fin || (() => { const m = t2m(s.debut) + Math.round((s.duree || 1) * 60); return pad(Math.floor(m / 60) % 24) + ':' + pad(m % 60); })(); lines.push(`DTSTART:${d}T${s.debut.replace(':', '')}00`, `DTEND:${d}T${end.replace(':', '')}00`); }
    else lines.push(`DTSTART;VALUE=DATE:${d}`, `DTEND;VALUE=DATE:${addDays(s.date, 1).replace(/-/g, '')}`);
    lines.push(`SUMMARY:${e((s.titre || typeName(s.typeId)) + (s.statut === 'annulee' ? ' (annulée)' : ''))}`, `LOCATION:${e(lieuName(s) + (s.modalite === 'distance' && s.lienVisio ? ' ' + s.lienVisio : ''))}`, `DESCRIPTION:${e([`Type : ${typeName(s.typeId)}`, `Statut : ${ST[s.statut].label}`, `Titulaire : ${animName(s.titulaireId)}`, s.suppleantId ? `Suppléant : ${animName(s.suppleantId)}` : '', s.commentaire].filter(Boolean).join('\n'))}`, 'END:VEVENT');
  }
  lines.push('END:VCALENDAR'); return new Blob([lines.join('\r\n')], { type: 'text/calendar' });
}

/* ===== Import du planning Excel « Néo » ===== */
function excelDate(v) {
  if (typeof v === 'number' && v > 30000) { const d = new Date(Math.round((v - 25569) * 86400) * 1000); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; }
  if (typeof v === 'string') { const m = /^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/.exec(v.trim()); if (m) return `${m[3]}-${pad(m[2])}-${pad(m[1])}`; if (/^\d{4}-\d{2}-\d{2}$/.test(v.trim())) return v.trim(); }
  return null;
}
function excelHours(v) {
  if (typeof v === 'number') return v < 1 ? Math.round(v * 1440) / 60 : v <= 24 ? v : null;
  if (typeof v === 'string') { const m = /^(\d{1,2})\s*[h:]\s*(\d{0,2})/i.exec(v.trim()); if (m) return +m[1] + (+m[2] || 0) / 60; const n = parseFloat(v.replace(',', '.')); return isNaN(n) ? null : n; }
  return null;
}
const cleanName = s => String(s ?? '').replace(/\s+/g, ' ').trim();
const lieuKey = s => norm(s).replace(/\bst\b/g, 'saint').replace(/\bstes?\b/g, 'sainte').replace(/\baiguilles\b/g, 'aiguille').replace(/\b(de|du|des|d|la|le|les)\b/g, ' ').replace(/\s+/g, ' ').trim();

/** Analyse un classeur au format « Planning formation » → { sessions, notes, warnings } (références par nom, résolues à l'application) */
function parseNeo(sheets) {
  const out = { rows: [], notes: [], warn: [] };
  for (const sh of sheets) {
    const blocks = [];
    for (let r = 1; r <= sh.maxRow; r++) {
      if (norm(sh.get(r, 3)) !== 'salles') continue;
      const b = { sheet: sh.name, roomRow: r, dateRow: r - 1, year: sh.get(r, 2) };
      for (let rr = r + 1; rr <= r + 8; rr++) {
        const lab = norm(sh.get(rr, 2) ?? sh.get(rr, 3));
        if (lab === 'animateurs') break;
        if (lab.startsWith('type')) b.typeRow = rr; else if (lab.startsWith('duree')) b.dureeRow = rr; else if (lab.includes('titulaire')) b.titRow = rr; else if (lab.includes('suppleant')) b.suppRow = rr;
      }
      blocks.push(b);
    }
    if (!blocks.length) { out.warn.push(`Feuille « ${sh.name} » ignorée : aucun bloc « Salles » reconnu.`); continue; }
    for (const b of blocks) {
      b.cols = {};
      for (let c = 4; c <= sh.maxCol; c++) {
        const date = excelDate(sh.get(b.dateRow, c)); if (!date) continue;
        const room = cleanName(sh.get(b.roomRow, c));
        const cancelled = norm(room).includes('annul');
        const row = { date, lieu: cancelled ? '' : room, annulee: cancelled, type: cleanName(sh.get(b.typeRow, c)), duree: excelHours(sh.get(b.dureeRow, c)), titulaire: cleanName(sh.get(b.titRow, c)), suppleant: cleanName(sh.get(b.suppRow, c)), commentaire: '', ref: `${sh.name}!${colName(c)}${b.roomRow}` };
        b.cols[c] = row; out.rows.push(row);
      }
      b.rowsAnim = [];
    }
    for (const cm of sh.comments) {
      const blk = blocks.find(b => b.roomRow === cm.r && b.cols[cm.c]);
      if (blk) { blk.cols[cm.c].commentaire = cm.text; continue; }
      const name = cleanName(sh.get(cm.r, cm.c));
      if (name) out.notes.push({ name, text: cm.text });
    }
  }
  return out;
}

/** Applique l'import (retourne un compte rendu). opts: { pastDone, skipDup } */
function applyNeo(parsed, opts) {
  const rep = { added: 0, dup: 0, newAnim: [], newLieu: [], newType: [], lieuMap: {} };
  const findLieu = raw => {
    const k = lieuKey(raw); if (!k) return null;
    let best = null, bd = 99;
    for (const l of DB.lieux) for (const nm of [l.name, ...(l.aliases || [])]) { const kk = lieuKey(nm), d = k === kk ? 0 : lev(k, kk); if (d < bd) { bd = d; best = l; } }
    if (best && bd <= Math.max(1, Math.floor(k.length / 12))) return best;
    return null;
  };
  const getLieu = raw => {
    let l = findLieu(raw);
    if (!l) { l = stamp({ id: uid(), name: raw, kind: /agence/i.test(raw) ? 'agence' : 'salle', adresse: '', secteur: '', lien: '', aliases: [] }); DB.lieux.push(l); rep.newLieu.push(raw); }
    else if (l.name !== raw && !(l.aliases || []).includes(raw) && norm(l.name) !== norm(raw)) { (l.aliases ||= []).push(raw); stamp(l); }
    (rep.lieuMap[l.name] ||= new Set()).add(raw);
    return l;
  };
  const getAnim = raw => { if (!raw) return ''; let a = DB.animateurs.find(x => norm(x.name) === norm(raw)); if (!a) { a = stamp({ id: uid(), name: raw, equipe: '', email: '', actif: true, note: '' }); DB.animateurs.push(a); rep.newAnim.push(raw); } return a.id; };
  const getType = raw => { if (!raw) return ''; let t = DB.settings.types.find(x => norm(x.name) === norm(raw)); if (!t) { t = { id: uid(), name: raw, color: PALETTE[DB.settings.types.length % PALETTE.length] }; DB.settings.types.push(t); touchSettings(); rep.newType.push(raw); } return t.id; };
  const t0 = today();
  for (const r of parsed.rows) {
    const typeId = getType(r.type), lieu = r.lieu ? getLieu(r.lieu) : null, tit = getAnim(r.titulaire), sup = getAnim(r.suppleant);
    if (opts.skipDup && DB.sessions.some(s => s.date === r.date && s.typeId === typeId && s.lieuId === (lieu ? lieu.id : '') && s.titulaireId === tit)) { rep.dup++; continue; }
    const statut = r.annulee ? 'annulee' : (opts.pastDone && r.date < t0 ? 'realisee' : 'planifiee');
    const duree = r.duree ?? (typeId && /specifica/i.test(typeName(typeId)) ? 3.5 : 7);
    const s = newSession({ date: r.date, typeId, titre: typeName(typeId) + (lieu ? ' – ' + lieu.name : ''), duree: r.annulee && r.duree == null ? 0 : duree, dureeReelle: statut === 'realisee' ? duree : null, statut, lieuId: lieu ? lieu.id : '', titulaireId: tit, suppleantId: sup, commentaire: r.commentaire, motif: r.annulee ? 'Session annulée (mention du fichier Excel d\'origine)' : '', decisionPar: r.annulee ? (S.user ? S.user.name : '') : '', origine: 'Import Excel ' + r.ref });
    stamp(s); DB.sessions.push(s); logH('Création', s, 'Import du planning Excel'); rep.added++;
  }
  for (const n of parsed.notes) { const a = DB.animateurs.find(x => norm(x.name) === norm(n.name)); if (a && !(a.note || '').includes(n.text)) { a.note = ((a.note ? a.note + '\n' : '') + n.text); stamp(a); } }
  return rep;
}
