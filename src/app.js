/* ===== Rendu général ===== */
const NAV = [['dashboard', '🌸 Tableau de bord', () => true], ['planning', '🗓️ Planning', () => true], ['sessions', '📋 Sessions', () => true], ['alertes', '🔔 Alertes', () => true], ['historique', '🕘 Historique', () => can.hist()], ['echanges', '📥 Import / Export', () => can.imp() || can.exp()], ['settings', '⚙️ Paramètres', () => can.refs()]];
const VIEWS = { dashboard: viewDashboard, planning: viewPlanning, sessions: viewSessions, alertes: viewAlertes, historique: viewHistorique, echanges: viewEchanges, settings: viewSettings };

function render() {
  const app = $('#app');
  const ae = document.activeElement, fk = ae && (ae.dataset.f ? ['f', ae.dataset.f] : ae.hasAttribute && ae.hasAttribute('data-hq') ? ['hq', ''] : null), pos = fk && ae.selectionStart;
  if (!DB.users.length) { app.innerHTML = setupHTML(); return; }
  if (!S.user) { app.innerHTML = loginHTML(); return; }
  const nav = NAV.filter(n => n[2]()), v = nav.some(n => n[0] === S.view) ? S.view : 'dashboard';
  const nAl = computeAlerts().filter(a => a.sev === 'warn').length;
  const scroll = $('main') ? $('main').scrollTop : 0;
  app.innerHTML = `<header class="top noprint"><div class="brand"><b>🌸 Formidable</b><span>Planning des formations</span></div>${syncHTML()}<span class="sp"></span><button class="bell" data-act="goto" data-v="alertes" title="Alertes à traiter">🔔${nAl ? `<em>${nAl}</em>` : ''}</button><div class="who"><b>${esc(S.user.name)}</b><small>${ROLES[S.user.role]}</small></div><button class="btn ghost" data-act="logout">Quitter</button></header>
  <div class="shell"><nav class="side noprint">${nav.map(([k, l]) => `<button class="${k === v ? 'on' : ''}" data-act="goto" data-v="${k}">${l}${k === 'alertes' && nAl ? ` <em>${nAl}</em>` : ''}</button>`).join('')}</nav><main id="main">${VIEWS[v]()}</main></div>`;
  if (scroll && $('main')) $('main').scrollTop = scroll;
  if (fk) { const el = fk[0] === 'f' ? $(`[data-f="${fk[1]}"]`) : $('[data-hq]'); if (el) { el.focus(); try { el.setSelectionRange(pos, pos); } catch (e) { } } }
  const fi = $('#xlsxIn'); if (fi) fi.value = '';
}

function setupHTML() {
  return `<div class="login"><form id="setupForm" class="card"><h1>🌸 Bienvenue dans Formidable</h1><p>Application de planification des formations. <b>Toutes les données restent sur votre poste</b> (ou dans le fichier que vous choisirez) : aucune connexion, aucun envoi.</p>
  <label class="f"><span>Votre nom (futur administrateur)</span><input name="name" required autofocus></label><label class="f"><span>Code personnel (facultatif, 4 caractères minimum)</span><input name="pin" type="password" autocomplete="new-password"></label><label class="f"><span>Nom de l'équipe (affiché sur les bilans)</span><input name="org"></label>
  <button class="btn primary" type="submit">Démarrer</button><hr><p class="muted">Vous rejoignez une équipe qui utilise déjà Formidable ?</p><div class="actions wrap">${FS_OK ? '<button type="button" class="btn" data-act="fssetup">Ouvrir le fichier de données partagé…</button>' : ''}<label class="btn">Restaurer une sauvegarde…<input type="file" id="restoreIn" accept=".json" hidden></label></div></form></div>`;
}
function loginHTML() {
  return `<div class="login"><form id="loginForm" class="card"><h1>🌸 Formidable</h1><p class="muted">Planning des formations${DB.settings.org ? ' · ' + esc(DB.settings.org) : ''}</p><label class="f"><span>Utilisateur</span><select name="u" required>${opts([...DB.users].sort((a, b) => a.name.localeCompare(b.name, 'fr')).map(u => [u.id, `${u.name} (${ROLES[u.role]})`]), sessionStorage.getItem('formidable.last'))}</select></label><label class="f"><span>Code personnel</span><input name="pin" type="password" autocomplete="current-password"></label><p id="loginErr" class="err"></p><button class="btn primary" type="submit">Se connecter</button>${FS_OK && FS.h && FS.msg === 'reauth' ? '<hr><button type="button" class="btn" data-act="fsauth">Réautoriser le fichier partagé</button>' : ''}</form></div>`;
}

/* ===== Événements ===== */
let TMR;
document.addEventListener('click', async e => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  if (el.tagName === 'A') e.preventDefault();
  const a = el.dataset.act, v = el.dataset.v, id = el.dataset.id;
  try { await ACT[a]?.(el, v, id, e); } catch (err) { console.error(err); toast(String(err.message || err), 'err'); }
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !CB) closeModal(); if (e.key === 'Enter' && e.target.matches('tr[data-act],.alert[data-act]')) e.target.click(); });
document.addEventListener('change', e => {
  const t = e.target;
  if (t.dataset.f !== undefined && t.type !== 'search') { curF()[t.dataset.f] = t.value; render(); }
  else if (t.dataset.c) { S.cal[t.dataset.c] = t.value; render(); }
  else if (t.id === 'xlsxIn') importFile(t.files[0]);
  else if (t.id === 'restoreIn') restoreFlow(t.files[0], !DB.users.length);
  else if (t.name === 'statut' && t.closest('#sf')) formSync();
  else if (t.name === 'modalite' && t.closest('#sf')) formSync();
  else if (t.id === 'optPast' || t.id === 'optDup') renderPreview();
});
document.addEventListener('input', e => {
  const t = e.target;
  if (t.dataset.f === 'q') { clearTimeout(TMR); TMR = setTimeout(() => { curF().q = t.value; render(); }, 250); }
  else if (t.hasAttribute('data-hq')) { clearTimeout(TMR); TMR = setTimeout(() => { S.hq = t.value; render(); }, 250); }
  else if (t.closest('#sf') && (t.name === 'date' || t.name === 'duree')) formSync();
});
document.addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.target;
  if (f.id === 'sf') return saveSession(f);
  if (f.id === 'loginForm') {
    const u = DB.users.find(x => x.id === f.u.value), pin = f.pin.value;
    if (u && (!u.pin || (await hashPin(u.salt, pin)) === u.pin)) { S.user = u; sessionStorage.setItem('formidable.user', u.id); sessionStorage.setItem('formidable.last', u.id); S.view = 'dashboard'; render(); }
    else { $('#loginErr').textContent = 'Code incorrect.'; f.pin.value = ''; f.pin.focus(); }
  }
  if (f.id === 'setupForm') {
    const pin = f.pin.value; if (pin && pin.length < 4) return toast('Le code doit comporter au moins 4 caractères.', 'err');
    const u = await makeUser(f.name.value.trim(), 'admin', pin);
    DB.users.push(u); DB.settings.org = f.org.value.trim(); touchSettings(); S.user = u; sessionStorage.setItem('formidable.user', u.id); logH('Création', null, 'Initialisation de l\'application'); persist(); S.view = 'echanges'; render();
    toast('Application initialisée. Importez votre planning Excel ou créez une première session.');
  }
  if (f.id === 'edForm') return f.onsubmit2 && f.onsubmit2(f);
});

const ACT = {
  goto: (_, v) => { S.view = v; render(); $('main')?.scrollTo(0, 0); },
  logout: () => { S.user = null; sessionStorage.removeItem('formidable.user'); render(); },
  resetf: () => { delete S.F[S.view]; render(); },
  print: () => window.print(),
  sort: (_, v, __, e) => { const k = e.target.closest('[data-k]').dataset.k; S.sort = { k, d: S.sort.k === k ? -S.sort.d : 1 }; render(); },
  calmode: (_, v) => { S.cal.mode = v; render(); },
  caltoday: () => { S.cal.date = today(); render(); },
  calprev: () => calMove(-1), calnext: () => calMove(1),
  calgo: (el, v) => { S.cal.mode = v; S.cal.date = el.dataset.date; render(); },
  new: (el) => openSession(null, el.dataset.date),
  open: (el, v, id) => openSession(id),
  close: () => closeModal(),
  fssetup: async () => { await fileLink(false); S.user = null; render(); },
  fsauth: () => fileReauth(),
  fslink: async (_, v) => { await fileLink(v === 'new'); toast('Fichier partagé lié.'); render(); },
  fsunlink: async () => { await fileUnlink(); render(); },
  /* planning */
  exportSessions: () => dlXlsx([{ name: 'Sessions', rows: [SESSION_COLS, ...sortedSessions(filtered()).map(sessionRow)] }], 'sessions'),
  exportBilan: () => exportBilan(),
  exportBy: (_, v) => exportBy(v),
  exportIcs: () => download(icsFor(sortedSessions(filtered()).filter(s => s.statut !== 'reportee')), 'planning-formations.ics'),
  exportHist: () => dlXlsx([{ name: 'Historique', rows: [['Date', 'Utilisateur', 'Action', 'Session', 'Détail'], ...DB.history.slice().reverse().map(h => [new Date(h.ts).toLocaleString('fr-FR'), h.user, h.action, h.label, h.detail])] }], 'historique'),
  /* fiche */
  calcDuree: () => { const f = $('#sf'), a = t2m(f.debut.value), b = t2m(f.fin.value); if (a === null || b === null || b <= a) return toast('Renseignez des horaires valides.', 'err'); f.duree.value = Math.round((b - a) / 15) / 4; formSync(); },
  preset: (el) => { $('#sf').duree.value = el.dataset.h; formSync(); },
  addDate: () => { const v = $('#xd').value; if (!v) return; (S.xd ||= []); if (!S.xd.includes(v)) S.xd.push(v); S.xd.sort(); $('#xd').value = ''; xdRender(); },
  rmDate: (el, v) => { S.xd = S.xd.filter(x => x !== v); xdRender(); },
  quick: (_, v) => {
    const f = $('#sf'); f.statut.value = v; formSync();
    if (v === 'realisee') { if (!f.dureeReelle.value) f.dureeReelle.value = f.duree.value; $('#sect-public').open = true; f.presents.focus(); }
    else { if (!f.dateDecision.value) f.dateDecision.value = today(); f.motif.focus(); }
  },
  dup: () => { const s = DB.sessions.find(x => x.id === S.cur); closeModal(); openSession(null, '', { ...structuredClone(s), id: uid(), date: '', statut: 'planifiee', dureeReelle: null, presents: null, motif: '', dateDecision: '', nouvelleDate: '', decisionPar: '', groupeId: '', remplaceId: '', suppIntervenu: false }); },
  del: async () => { const s = DB.sessions.find(x => x.id === S.cur); if (!await confirmBox(`Supprimer définitivement « ${sessionLabel(s)} » ? (Préférez le statut « Annulée » pour conserver la trace.)`, 'Supprimer', true)) return; DB.sessions = DB.sessions.filter(x => x.id !== s.id); DB.del[s.id] = new Date().toISOString(); logH('Suppression', s, 'Session supprimée'); persist(); closeModal(); render(); },
  mail: () => { const s = DB.sessions.find(x => x.id === S.cur), to = involved(s).map(i => (A(i) || {}).email).filter(Boolean).join(';'); const body = `Bonjour,\n\nSession : ${s.titre || typeName(s.typeId)}\nDate : ${fmtDate(s.date)}${s.debut ? ' de ' + s.debut + (s.fin ? ' à ' + s.fin : '') : ''}\nLieu : ${lieuName(s) || 'à définir'}${s.lienVisio ? '\nLien : ' + s.lienVisio : ''}\nStatut : ${ST[s.statut].label}${s.motif ? '\nMotif : ' + s.motif : ''}${s.nouvelleDate ? '\nNouvelle date : ' + fmtDate(s.nouvelleDate) : ''}\nTitulaire : ${animName(s.titulaireId) || '—'}${s.suppleantId ? '\nSuppléant : ' + animName(s.suppleantId) : ''}\n\nCordialement,\n${S.user.name}`; location.href = `mailto:${to}?subject=${encodeURIComponent('Formation – ' + (s.titre || typeName(s.typeId)) + ' – ' + fmtShort(s.date))}&body=${encodeURIComponent(body)}`; },
  ics1: () => { const s = DB.sessions.find(x => x.id === S.cur); download(icsFor([s]), `formation-${s.date}-${norm(s.titre || typeName(s.typeId)).replace(/ /g, '-').slice(0, 40)}.ics`); toast('Fichier calendrier téléchargé : ouvrez-le (double-clic) pour l\'ajouter à Outlook.'); },
  /* paramètres */
  settab: (_, v) => { S.setTab = v; render(); },
  edit: (el) => editDialog(el.dataset.k, el.dataset.id),
  rm: (el) => removeItem(el.dataset.k, el.dataset.id),
  merge: (el) => mergeDialog(el.dataset.k, el.dataset.id),
  listadd: (el) => { const k = el.dataset.k, v = $('#add-' + k).value.trim(); if (!v || DB.settings[k].includes(v)) return; DB.settings[k].push(v); touchSettings(); persist(); render(); },
  listdel: (el) => { DB.settings[el.dataset.k].splice(+el.dataset.i, 1); touchSettings(); persist(); render(); },
  listren: async (el) => {
    const k = el.dataset.k, i = +el.dataset.i, old = DB.settings[k][i], nv = await promptBox('Nouvelle valeur', old); if (!nv || nv === old) return;
    DB.settings[k][i] = nv; touchSettings();
    if (k === 'themes') DB.sessions.forEach(s => { if (s.theme === old) { s.theme = nv; stamp(s); } });
    if (k === 'populations') DB.sessions.forEach(s => { if (s.population === old) { s.population = nv; stamp(s); } });
    if (k === 'equipes') DB.animateurs.forEach(a => { if (a.equipe === old) { a.equipe = nv; stamp(a); } });
    persist(); render();
  },
  saveGeneral: () => { DB.settings.org = $('#set-org').value.trim(); DB.settings.alertDays = Math.max(1, +$('#set-days').value || 7); touchSettings(); persist(); toast('Enregistré.'); render(); },
  wipe: async () => { if (!await confirmBox('Effacer TOUTES les données de ce navigateur ? Pensez à télécharger une sauvegarde avant.', 'Tout effacer', true)) return; localStorage.removeItem(KEY); await fileUnlink(); DB = newDB(); S.user = null; sessionStorage.clear(); render(); },
  backup: async () => { const pw = $('#bkpw').value; const data = pw ? await encryptJSON(DB, pw) : DB; download(new Blob([JSON.stringify(data)], { type: 'application/json' }), `formidable-sauvegarde-${today()}${pw ? '-chiffree' : ''}.json`); toast(pw ? 'Sauvegarde chiffrée téléchargée.' : 'Sauvegarde téléchargée (non chiffrée).'); },
  doImport: () => doImport()
};
function calMove(n) {
  const c = S.cal, d = parseISO(c.date);
  if (c.mode === 'day') c.date = addDays(c.date, n); else if (c.mode === 'week') c.date = addDays(c.date, 7 * n);
  else if (c.mode === 'year') { d.setFullYear(d.getFullYear() + n); c.date = toISO(d); } else { d.setDate(1); d.setMonth(d.getMonth() + n); c.date = toISO(d); }
  render();
}
function dlXlsx(sheets, name) { download(buildXlsx(sheets), `${name}-${today()}.xlsx`); toast('Export Excel généré.'); }

/* ===== Exports ===== */
function exportBilan() {
  const list = filtered(), r = stats(list), pct = x => x === null ? '' : Math.round(x * 1000) / 10;
  const rows = o => Object.values(o).sort((a, b) => b.hReal - a.hReal || b.hPrev - a.hPrev).map(e => [e.name, e.prev, e.real, e.ann, e.rep, e.hPrev, e.hReal]);
  const H = n => [n, 'Sessions prévues', 'Sessions réalisées', 'Annulées', 'Reportées', 'Heures prévues', 'Heures réalisées'];
  dlXlsx([
    { name: 'Synthèse', rows: [['Indicateur', 'Valeur'], ['Période', periodLabel()], ['Entité', DB.settings.org], ['Sessions au total', r.n], ['À planifier', r.st.a_planifier], ['Planifiées', r.st.planifiee], ['Confirmées', r.st.confirmee], ['Réalisées', r.st.realisee], ['Reportées', r.st.reportee], ['Annulées', r.st.annulee], ['Heures planifiées (hors annulées/reportées)', r.hPlan], ['Heures réalisées', r.hReal], ['Participants prévus (sessions réalisées)', r.prevus], ['Participants présents', r.presents], ['Taux de participation (%)', pct(r.taux)], ['Édité le', new Date().toLocaleString('fr-FR')]] },
    { name: 'Animateurs', rows: [H('Animateur'), ...rows(r.anim)] }, { name: 'Types', rows: [H('Type'), ...rows(r.type)] },
    { name: 'Lieux', rows: [H('Lieu'), ...rows(r.lieu)] }, { name: 'Secteurs', rows: [H('Secteur'), ...rows(r.secteur)] },
    { name: 'Par mois', rows: [['Mois', ...STATUTS.map(s => s.label)], ...Object.keys(r.mois).sort().map(m => [m, ...STATUTS.map(s => r.mois[m][s.id])])] },
    { name: 'Sessions', rows: [SESSION_COLS, ...sortedSessions(list).map(sessionRow)] }], 'bilan-formations');
}
function exportBy(g) {
  const list = sortedSessions(filtered()), groups = new Map();
  const add = (k, s, extra) => { if (!groups.has(k)) groups.set(k, []); groups.get(k).push([...sessionRow(s), extra]); };
  for (const s of list) {
    if (g === 'anim') { const roles = [[s.titulaireId, 'Titulaire'], [s.suppleantId, 'Suppléant'], ...(s.coanim || []).map(c => [c, 'Coanimateur'])]; if (!s.titulaireId) add('Sans animateur', s, ''); roles.filter(r => r[0]).forEach(([id, rl]) => add(animName(id), s, rl)); }
    else if (g === 'lieu') add(lieuName(s) || 'Lieu non défini', s, ''); else add(typeName(s.typeId), s, '');
  }
  if (!groups.size) return toast('Aucune session à exporter.', 'err');
  dlXlsx([...groups.entries()].sort((a, b) => a[0].localeCompare(b[0], 'fr')).map(([k, rows]) => ({ name: k, rows: [[...SESSION_COLS, g === 'anim' ? 'Rôle' : ''], ...rows] })), 'planning-par-' + { anim: 'animateur', lieu: 'lieu', type: 'type' }[g]);
}

/* ===== Listes avec saisie libre (combobox) ===== */
const SRC = { type: () => DB.settings.types.map(t => t.name), lieu: () => DB.lieux.map(l => l.name), anim: () => DB.animateurs.filter(a => a.actif !== false).map(a => a.name), theme: () => DB.settings.themes, population: () => DB.settings.populations, equipe: () => DB.settings.equipes, secteur: () => [...new Set(DB.lieux.map(l => l.secteur).filter(Boolean))] };
function findByName(src, txt) {
  const n = norm(txt);
  if (src === 'type') return (DB.settings.types.find(t => norm(t.name) === n) || {}).id;
  if (src === 'lieu') return (DB.lieux.find(l => norm(l.name) === n || (l.aliases || []).some(a => norm(a) === n)) || {}).id;
  return (DB.animateurs.find(a => norm(a.name) === n) || {}).id;
}
function createByName(src, txt) {
  if (src === 'type') { const t = { id: uid(), name: txt, color: PALETTE[DB.settings.types.length % PALETTE.length] }; DB.settings.types.push(t); touchSettings(); return t.id; }
  if (src === 'lieu') { const l = stamp({ id: uid(), name: txt, kind: /agence/i.test(txt) ? 'agence' : 'salle', adresse: '', secteur: '', lien: '', aliases: [] }); DB.lieux.push(l); return l.id; }
  const a = stamp({ id: uid(), name: txt, equipe: '', email: '', actif: true, note: '' }); DB.animateurs.push(a); return a.id;
}
let CB = null;
function cbShow(box, all) {
  const inp = $('input', box), ul = $('ul', box), q = norm(inp.value), items = (SRC[box.dataset.src]() || []).slice().sort((a, b) => a.localeCompare(b, 'fr'));
  const list = all || !q ? items : items.filter(x => norm(x).includes(q));
  const exact = items.some(x => norm(x) === q);
  ul.innerHTML = list.map(x => `<li data-v="${esc(x)}"${norm(x) === q ? ' class="sel"' : ''}>${esc(x)}</li>`).join('') + (inp.value.trim() && !exact ? `<li class="new" data-v="${esc(inp.value.trim())}">＋ Ajouter « ${esc(inp.value.trim())} »</li>` : '') || '<li class="none">Aucune entrée — tapez pour en créer une</li>';
  ul.classList.remove('hide'); CB = box;
}
function cbHide() { $$('.combo ul').forEach(u => u.classList.add('hide')); CB = null; }
document.addEventListener('focusin', e => { const b = e.target.closest('.combo'); if (b && e.target.tagName === 'INPUT') { cbHide(); cbShow(b, true); e.target.select(); } });
document.addEventListener('input', e => { const b = e.target.closest('.combo'); if (b && e.target.tagName === 'INPUT') cbShow(b, false); });
document.addEventListener('mousedown', e => {
  const li = e.target.closest('.combo li'), btn = e.target.closest('.combo .cb');
  if (li && !li.classList.contains('none')) { e.preventDefault(); const b = li.closest('.combo'); $('input', b).value = li.dataset.v; cbHide(); $('input', b).dispatchEvent(new Event('change', { bubbles: true })); }
  else if (btn) { e.preventDefault(); const b = btn.closest('.combo'); if (CB === b) cbHide(); else { cbHide(); $('input', b).focus(); cbShow(b, true); } }
  else if (!e.target.closest('.combo')) cbHide();
});
document.addEventListener('keydown', e => {
  const b = e.target.closest && e.target.closest('.combo'); if (!b) return;
  const ul = $('ul', b), lis = $$('li:not(.none)', ul), cur = $('li.hl', ul);
  if (e.key === 'Escape') { if (!ul.classList.contains('hide')) { e.stopPropagation(); cbHide(); } return; }
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (ul.classList.contains('hide')) cbShow(b, true); const L2 = $$('li:not(.none)', ul); let i = L2.indexOf($('li.hl', ul)) + (e.key === 'ArrowDown' ? 1 : -1); i = (i + L2.length) % L2.length; $('li.hl', ul)?.classList.remove('hl'); if (L2[i]) { L2[i].classList.add('hl'); L2[i].scrollIntoView({ block: 'nearest' }); } }
  else if (e.key === 'Enter' && cur) { e.preventDefault(); $('input', b).value = cur.dataset.v; cbHide(); }
  else if (e.key === 'Tab') cbHide();
});

/* ===== Fiche session ===== */
function openSession(id, date, tpl) {
  const isNew = !id; let s = isNew ? newSession({ date: date || '', ...(tpl || {}), typeId: (tpl && tpl.typeId) || '' }) : DB.sessions.find(x => x.id === id);
  if (tpl) s = { ...s, ...tpl };
  if (isNew && !can.edit()) return;
  S.cur = isNew ? null : id; S.curNew = isNew; S.tpl = isNew ? s : null; S.xd = [];
  modal(sessionForm(s, isNew), 'big');
  formSync();
}
function formSync() {
  const f = $('#sf'); if (!f) return;
  $('#decision').classList.toggle('hide', !['annulee', 'reportee'].includes(f.statut.value));
  const dist = f.modalite.value === 'distance';
  $('.lieu-p', f).classList.toggle('hide', dist); $('.lieu-d', f).classList.toggle('hide', !dist);
  $('#annee').value = f.date.value ? f.date.value.slice(0, 4) : '';
  const h = parseFloat(f.duree.value); $('#dureeFmt').textContent = isNaN(h) ? '' : '= ' + fmtH(h);
}
function xdRender() { $('#xdl').innerHTML = (S.xd || []).map(d => `<span class="tag lg">${fmtShort(d)} <button type="button" class="lnk" data-act="rmDate" data-v="${d}">retirer</button></span>`).join(''); }

const FL = { titre: 'Intitulé', typeId: 'Type', theme: 'Thème', objectif: 'Objectif', date: 'Date', debut: 'Début', fin: 'Fin', duree: 'Durée prévue', dureeReelle: 'Durée réelle', statut: 'Statut', modalite: 'Modalité', lieuId: 'Lieu', lienVisio: 'Lien visio', adresse: 'Adresse', titulaireId: 'Titulaire', suppleantId: 'Suppléant', suppIntervenu: 'Suppléant intervenu', coanim: 'Coanimateurs', coanimRole: 'Rôle coanimation', caisse: 'Caisse/unité', agences: 'Agences', demandeur: 'Demandeur', population: 'Population', profil: 'Profil', prevus: 'Participants prévus', presents: 'Participants présents', participants: 'Participants', dateDemande: 'Date de la demande', origine: 'Origine de la demande', organisateur: 'Organisateur', logistique: 'Logistique', support: 'Support', docs: 'Documents', commentaire: 'Commentaire', motif: 'Motif', dateDecision: 'Date de décision', nouvelleDate: 'Nouvelle date' };
function showVal(k, v) {
  if (Array.isArray(v)) return v.map(x => typeof x === 'object' ? x.nom : animName(x)).join(', ') || '∅';
  if (v === '' || v === null || v === undefined) return '∅';
  if (k === 'typeId') return typeName(v); if (k === 'lieuId') return (L(v) || {}).name || '∅'; if (k === 'titulaireId' || k === 'suppleantId') return animName(v);
  if (k === 'statut') return ST[v].label; if (k === 'modalite') return MODAL[v]; if (typeof v === 'boolean') return v ? 'oui' : 'non';
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return fmtShort(v); return String(v);
}
async function saveSession(form) {
  const base = S.curNew ? S.tpl : DB.sessions.find(x => x.id === S.cur), old = structuredClone(base), s = structuredClone(base);
  const strF = ['titre', 'typeId', 'theme', 'objectif', 'date', 'debut', 'fin', 'statut', 'modalite', 'lieuId', 'lienVisio', 'adresse', 'titulaireId', 'suppleantId', 'coanimRole', 'caisse', 'agences', 'demandeur', 'population', 'profil', 'participants', 'dateDemande', 'origine', 'organisateur', 'logistique', 'support', 'commentaire', 'motif', 'dateDecision', 'nouvelleDate'];
  const ok = n => { const e = form.elements[n]; return e && !(e.length ? e[0].disabled : e.disabled) ? e : null; };
  strF.forEach(n => { const e = ok(n); if (e) s[n] = e.value.trim(); });
  ['duree', 'dureeReelle', 'prevus', 'presents'].forEach(n => { const e = ok(n); if (e) s[n] = e.value === '' ? null : +e.value; });
  if (ok('suppIntervenu')) s.suppIntervenu = form.suppIntervenu.checked;
  if (ok('coanim')) s.coanim = $$('input[name=coanim]:checked', form).map(x => x.value);
  if (ok('docs')) s.docs = form.docs.value.split('\n').map(l => l.trim()).filter(Boolean).map(l => { const [n, ...r] = l.split('|'); return { nom: n.trim(), lien: r.join('|').trim() }; });
  /* champs « liste + saisie libre » : nom saisi → identifiant (création si nouveau, après validation) */
  const pend = [];
  [['typeId', 'type'], ['lieuId', 'lieu'], ['titulaireId', 'anim'], ['suppleantId', 'anim']].forEach(([f, src]) => { if (!ok(f)) return; const txt = s[f]; s[f] = ''; if (!txt) return; const id = findByName(src, txt); if (id) s[f] = id; else pend.push([f, src, txt]); });
  const coNew = ok('coanimNew') ? form.coanimNew.value.trim() : '';
  const pendTxt = f => (pend.find(p => p[0] === f) || [])[2];
  if (!s.date) return toast('La date est obligatoire.', 'err');
  if (!s.typeId && !pendTxt('typeId')) return toast('Le type de formation est obligatoire.', 'err');
  if (s.debut && s.fin && t2m(s.fin) <= t2m(s.debut)) return toast('L\'heure de fin doit être postérieure à l\'heure de début.', 'err');
  const tk = s.titulaireId || norm(pendTxt('titulaireId')), sk = s.suppleantId || norm(pendTxt('suppleantId'));
  if (tk && tk === sk) return toast('Le suppléant doit être différent du titulaire.', 'err');
  const added = [];
  pend.forEach(p => { s[p[0]] = createByName(p[1], p[2]); added.push(p[1] + ' « ' + p[2] + ' »'); });
  if (coNew) { let id = findByName('anim', coNew); if (!id) { id = createByName('anim', coNew); added.push('anim « ' + coNew + ' »'); } s.coanim = [...new Set([...(s.coanim || []), id])]; }
  ['theme', 'population'].forEach(f => { const list = DB.settings[f === 'theme' ? 'themes' : 'populations']; if (s[f] && !list.some(x => norm(x) === norm(s[f]))) { list.push(s[f]); touchSettings(); } else if (s[f]) s[f] = list.find(x => norm(x) === norm(s[f])); });
  if (s.suppleantId === '' ) s.suppIntervenu = false;
  s.coanim = (s.coanim || []).filter(x => x !== s.titulaireId);
  if (!s.titre) s.titre = typeName(s.typeId) + (s.modalite === 'distance' ? ' – à distance' : (s.lieuId ? ' – ' + (L(s.lieuId) || {}).name : ''));
  if (['annulee', 'reportee'].includes(s.statut) && s.statut !== old.statut) { s.dateDecision ||= today(); s.decisionPar = S.user.name; }
  if (s.statut === 'realisee' && s.dureeReelle == null) s.dureeReelle = s.duree;
  if (s.statut !== 'realisee' && old.statut !== 'realisee' && false) s.dureeReelle = null;
  stamp(s);
  const created = [];
  if (S.curNew) {
    const dates = [s.date, ...(S.xd || []).filter(d => d !== s.date)], gid = dates.length > 1 ? uid() : '';
    dates.forEach(d => { const c = { ...structuredClone(s), id: dates.length > 1 ? uid() : s.id, date: d, groupeId: gid }; stamp(c); DB.sessions.push(c); created.push(c); logH('Création', c, `Session créée (${typeName(c.typeId)}, ${fmtShort(c.date)}${c.titulaireId ? ', ' + animName(c.titulaireId) : ''})${gid ? ' – série de ' + dates.length : ''}`); });
  } else {
    const i = DB.sessions.findIndex(x => x.id === s.id); DB.sessions[i] = s; created.push(s);
    const ch = Object.keys(FL).filter(k => JSON.stringify(old[k] ?? '') !== JSON.stringify(s[k] ?? ''));
    if (ch.includes('statut')) logH('Statut', s, `${showVal('statut', old.statut)} → ${showVal('statut', s.statut)}${s.motif ? ' · motif : ' + s.motif : ''}${s.nouvelleDate ? ' · nouvelle date : ' + fmtShort(s.nouvelleDate) : ''}`);
    const an = ch.filter(k => ['titulaireId', 'suppleantId', 'coanim', 'suppIntervenu'].includes(k)); if (an.length) logH('Animateur', s, an.map(k => `${FL[k]} : ${showVal(k, old[k])} → ${showVal(k, s[k])}`).join('\n'));
    const rest = ch.filter(k => k !== 'statut' && !an.includes(k)); if (rest.length) logH('Modification', s, rest.map(k => `${FL[k]} : ${showVal(k, old[k])} → ${showVal(k, s[k])}`).join('\n'));
    if (!ch.length) { closeModal(); return; }
    if (s.statut === 'reportee' && s.nouvelleDate && form.creerRemplacement && form.creerRemplacement.checked && !DB.sessions.some(x => x.remplaceId === s.id)) {
      const r = stamp(newSession({ ...structuredClone(s), id: uid(), date: s.nouvelleDate, statut: 'a_planifier', dureeReelle: null, presents: null, motif: '', dateDecision: '', nouvelleDate: '', decisionPar: '', remplaceId: s.id, suppIntervenu: false, created: new Date().toISOString() }));
      DB.sessions.push(r); logH('Création', r, `Session de remplacement de « ${sessionLabel(s)} »`); toast('Session de remplacement créée au ' + fmtShort(r.date) + '.');
    }
  }
  persist(); closeModal(); render();
  const cf = created.flatMap(conflictsFor); if (cf.length) toast('⚠ ' + cf[0].msg, 'err'); else toast(S.curNew ? (created.length > 1 ? `${created.length} sessions créées.` : 'Session créée.') : 'Modifications enregistrées.');
}

/* ===== Paramètres : dialogues ===== */
function promptBox(label, val = '', type = 'text') { return new Promise(res => { const m = modal(`<form><div class="mbody"><label class="f"><span>${esc(label)}</span><input type="${type}" value="${esc(val)}" name="v" autocomplete="off"></label></div><div class="mfoot"><button type="button" class="btn" data-x="0">Annuler</button><button class="btn primary">OK</button></div></form>`, 'small'); m.querySelector('form').addEventListener('submit', e => { e.preventDefault(); e.stopPropagation(); const v = e.target.v.value.trim(); closeModal(); res(v); }); m.addEventListener('click', e => { if (e.target.closest('[data-x]')) { closeModal(); res(null); } }); }); }
const EDITORS = {
  type: { title: 'Type de formation', get: id => DB.settings.types.find(x => x.id === id) || { name: '', color: PALETTE[DB.settings.types.length % PALETTE.length] }, fields: o => `<label class="f"><span>Nom</span><input name="name" value="${esc(o.name)}" required></label><label class="f"><span>Couleur</span><input type="color" name="color" value="${o.color}"></label>`, save(o, fd, id) { const n = fd.name.trim(); if (DB.settings.types.some(t => t.id !== id && norm(t.name) === norm(n))) throw new Error('Ce type existe déjà.'); if (id) Object.assign(DB.settings.types.find(x => x.id === id), { name: n, color: fd.color }); else DB.settings.types.push({ id: uid(), name: n, color: fd.color }); touchSettings(); } },
  lieu: { title: 'Lieu', get: id => L(id) || { name: '', kind: 'salle', adresse: '', secteur: '', lien: '', aliases: [] }, fields: o => `<label class="f"><span>Nom</span><input name="name" value="${esc(o.name)}" required></label><label class="f"><span>Nature</span><select name="kind">${opts([['salle', 'Salle'], ['agence', 'Agence'], ['site', 'Site']], o.kind)}</select></label><label class="f"><span>Adresse</span><input name="adresse" value="${esc(o.adresse)}"></label><div class="f"><span>Secteur géographique</span>${combo('secteur', 'secteur', o.secteur, '')}</div><label class="f"><span>Autres orthographes rencontrées (séparées par « ; »)</span><input name="aliases" value="${esc((o.aliases || []).join(' ; '))}"></label>`, save(o, fd, id) { const n = fd.name.trim(); if (DB.lieux.some(l => l.id !== id && norm(l.name) === norm(n))) throw new Error('Ce lieu existe déjà : utilisez-le, ou fusionnez les doublons.'); const v = { name: n, kind: fd.kind, adresse: fd.adresse.trim(), secteur: fd.secteur.trim(), aliases: fd.aliases.split(';').map(x => x.trim()).filter(Boolean) }; if (id) stamp(Object.assign(L(id), v)); else DB.lieux.push(stamp({ id: uid(), lien: '', ...v })); } },
  anim: { title: 'Animateur', get: id => A(id) || { name: '', equipe: '', email: '', actif: true, note: '' }, fields: o => `<label class="f"><span>Nom</span><input name="name" value="${esc(o.name)}" required></label><div class="f"><span>Équipe / unité de rattachement</span>${combo('equipe', 'equipe', o.equipe, '')}</div><label class="f"><span>E-mail (sert uniquement à pré-remplir vos messages)</span><input name="email" type="email" value="${esc(o.email)}"></label><label class="chk"><input type="checkbox" name="actif"${o.actif === false ? '' : ' checked'}> Actif (proposé dans les listes)</label><label class="f"><span>Note</span><textarea name="note" rows="2">${esc(o.note)}</textarea></label>`, save(o, fd, id) { const n = fd.name.trim(); if (DB.animateurs.some(a => a.id !== id && norm(a.name) === norm(n))) throw new Error('Cet animateur existe déjà.'); const v = { name: n, equipe: fd.equipe.trim(), email: fd.email.trim(), actif: !!fd.actif, note: fd.note.trim() }; if (id) stamp(Object.assign(A(id), v)); else DB.animateurs.push(stamp({ id: uid(), ...v })); if (v.equipe && !DB.settings.equipes.includes(v.equipe)) { DB.settings.equipes.push(v.equipe); touchSettings(); } } },
  duree: { title: 'Durée type', get: id => DB.settings.durees[id] || { l: '', h: 1 }, fields: o => `<label class="f"><span>Libellé</span><input name="l" value="${esc(o.l)}" required></label><label class="f"><span>Heures</span><input name="h" type="number" step="0.25" min="0.25" max="24" value="${o.h}" required></label>`, save(o, fd, id) { const v = { l: fd.l.trim(), h: +fd.h }; if (id !== undefined && id !== '') DB.settings.durees[+id] = v; else DB.settings.durees.push(v); touchSettings(); } },
  user: { title: 'Utilisateur', get: id => DB.users.find(x => x.id === id) || { name: '', role: 'lecteur', animateurId: '' }, fields: o => `<label class="f"><span>Nom</span><input name="name" value="${esc(o.name)}" required></label><label class="f"><span>Profil</span><select name="role">${opts(Object.entries(ROLES), o.role)}</select></label><label class="f"><span>Animateur correspondant (profil Animateur)</span><select name="animateurId">${opts(animOpts(true), o.animateurId, '— aucun —')}</select></label><label class="f"><span>Code personnel ${o.pin ? '(laisser vide pour le conserver)' : '(facultatif)'}</span><input type="password" name="pin" autocomplete="new-password"></label>${o.pin ? '<label class="chk"><input type="checkbox" name="nopin"> Supprimer le code</label>' : ''}`, async save(o, fd, id) { if (fd.pin && fd.pin.length < 4) throw new Error('Le code doit comporter au moins 4 caractères.'); const adm = DB.users.filter(u => u.role === 'admin' && u.id !== id).length; if (id && fd.role !== 'admin' && !adm) throw new Error('Il doit rester au moins un administrateur.'); if (id) { const u = DB.users.find(x => x.id === id); Object.assign(u, { name: fd.name.trim(), role: fd.role, animateurId: fd.animateurId }); if (fd.nopin) u.pin = ''; else if (fd.pin) u.pin = await hashPin(u.salt, fd.pin); stamp(u); if (S.user.id === id) S.user = u; } else DB.users.push(await makeUser(fd.name.trim(), fd.role, fd.pin, fd.animateurId)); } }
};
function editDialog(k, id) {
  const E = EDITORS[k], o = E.get(id);
  const m = modal(`<form id="edForm"><div class="mhead"><h2>${id !== undefined && id !== '' ? 'Modifier' : 'Ajouter'} · ${E.title}</h2><button type="button" class="x" data-act="close">✕</button></div><div class="mbody"><div class="fg1">${E.fields(o)}</div></div><div class="mfoot"><span class="sp"></span><button type="button" class="btn" data-act="close">Annuler</button><button class="btn primary">Enregistrer</button></div></form>`, 'small');
  $('#edForm').onsubmit2 = async f => { try { const fd = {}; new FormData(f).forEach((v, n) => fd[n] = v); await E.save(o, fd, id); persist(); closeModal(); render(); } catch (err) { toast(err.message, 'err'); } };
}
async function removeItem(k, id) {
  const use = { type: DB.sessions.filter(s => s.typeId === id).length, lieu: DB.sessions.filter(s => s.lieuId === id).length, anim: DB.sessions.filter(s => involved(s).includes(id)).length }[k];
  if (use) return toast(`Utilisé par ${use} session(s) : ${k === 'type' ? 'réaffectez ces sessions d\'abord' : 'utilisez « Fusionner »' + (k === 'anim' ? ' ou désactivez l\'animateur' : '')}.`, 'err');
  if (k === 'user') { if (id === S.user.id) return toast('Vous ne pouvez pas supprimer votre propre compte.', 'err'); if (DB.users.find(u => u.id === id).role === 'admin' && DB.users.filter(u => u.role === 'admin').length < 2) return toast('Il doit rester au moins un administrateur.', 'err'); }
  if (!await confirmBox('Supprimer cet élément ?', 'Supprimer', true)) return;
  if (k === 'type') DB.settings.types = DB.settings.types.filter(x => x.id !== id), touchSettings();
  if (k === 'duree') DB.settings.durees.splice(+id, 1), touchSettings();
  if (k === 'lieu') { DB.lieux = DB.lieux.filter(x => x.id !== id); DB.del[id] = new Date().toISOString(); }
  if (k === 'anim') { DB.animateurs = DB.animateurs.filter(x => x.id !== id); DB.del[id] = new Date().toISOString(); }
  if (k === 'user') { DB.users = DB.users.filter(x => x.id !== id); DB.del[id] = new Date().toISOString(); }
  persist(); render();
}
function mergeDialog(k, id) {
  const src = k === 'lieu' ? L(id) : A(id), list = (k === 'lieu' ? lieuOpts() : animOpts(true)).filter(x => x[0] !== id);
  if (!list.length) return toast('Aucun autre élément vers lequel fusionner.', 'err');
  const m = modal(`<form id="edForm"><div class="mhead"><h2>Fusionner « ${esc(src.name)} »</h2><button type="button" class="x" data-act="close">✕</button></div><div class="mbody"><p>Toutes les sessions de « ${esc(src.name)} » seront rattachées à l'élément choisi, puis « ${esc(src.name)} » sera supprimé (son nom devient un alias pour un lieu).</p><label class="f"><span>Fusionner dans</span><select name="to">${opts(list)}</select></label></div><div class="mfoot"><span class="sp"></span><button type="button" class="btn" data-act="close">Annuler</button><button class="btn primary">Fusionner</button></div></form>`, 'small');
  $('#edForm').onsubmit2 = f => {
    const to = f.to.value;
    DB.sessions.forEach(s => { let ch = false; if (k === 'lieu' && s.lieuId === id) { s.lieuId = to; ch = true; } if (k === 'anim') { ['titulaireId', 'suppleantId'].forEach(p => { if (s[p] === id) { s[p] = to; ch = true; } }); if ((s.coanim || []).includes(id)) { s.coanim = [...new Set(s.coanim.map(x => x === id ? to : x))]; ch = true; } } if (ch) stamp(s); });
    if (k === 'lieu') { const t = L(to); t.aliases = [...new Set([...(t.aliases || []), src.name, ...(src.aliases || [])])]; stamp(t); DB.lieux = DB.lieux.filter(x => x.id !== id); } else DB.animateurs = DB.animateurs.filter(x => x.id !== id);
    DB.del[id] = new Date().toISOString(); persist(); closeModal(); render(); toast('Fusion effectuée.');
  };
}

/* ===== Import Excel ===== */
async function importFile(file) {
  if (!file) return;
  try { S.parsed = parseNeo(await readXlsx(await file.arrayBuffer())); S.parsed.file = file.name; renderPreview(); }
  catch (e) { $('#impPreview').innerHTML = `<p class="err">${esc(e.message || e)}</p>`; }
}
function renderPreview() {
  const P = S.parsed, box = $('#impPreview'); if (!box || !P) return;
  const o = { pastDone: $('#optPast') ? $('#optPast').checked : true, skipDup: $('#optDup') ? $('#optDup').checked : true };
  if (!P.rows.length) { box.innerHTML = `<p class="err">Aucune session trouvée. ${esc(P.warn.join(' '))}</p>`; return; }
  const backup = structuredClone(DB); let rep; try { rep = applyNeo(P, o); } finally { DB = backup; }
  const lm = Object.entries(rep.lieuMap), canc = P.rows.filter(r => r.annulee).length;
  box.innerHTML = `<div class="info"><b>${esc(P.file)}</b> : ${P.rows.length} session(s) détectée(s) (${canc} annulée(s)) du ${fmtShort(P.rows.map(r => r.date).sort()[0])} au ${fmtShort(P.rows.map(r => r.date).sort().pop())}.<br>Seront ajoutées : <b>${rep.added}</b>${rep.dup ? ` · ignorées (déjà présentes) : ${rep.dup}` : ''}.<br>Nouveaux animateurs : ${rep.newAnim.map(esc).join(', ') || 'aucun'}<br>Nouveaux types : ${rep.newType.map(esc).join(', ') || 'aucun'}<br>Nouveaux lieux : ${rep.newLieu.map(esc).join(', ') || 'aucun'}</div>
  ${lm.length ? `<details open><summary>Harmonisation des lieux (variantes d'orthographe regroupées)</summary><table class="tbl"><thead><tr><th>Lieu retenu</th><th>Orthographes rencontrées dans le fichier</th></tr></thead><tbody>${lm.map(([n, set]) => `<tr><td>${esc(n)}</td><td>${[...set].map(esc).join(' · ')}</td></tr>`).join('')}</tbody></table></details>` : ''}
  ${P.notes.length ? `<p class="muted">${P.notes.length} commentaire(s) d'animateur seront ajoutés à leur fiche. Les commentaires de session sont repris dans le champ « Commentaires ».</p>` : ''}
  <label class="chk"><input type="checkbox" id="optPast"${o.pastDone ? ' checked' : ''}> Marquer les sessions passées (avant aujourd'hui) comme « Réalisées »</label><label class="chk"><input type="checkbox" id="optDup"${o.skipDup ? ' checked' : ''}> Ignorer les sessions déjà présentes (même date, type, lieu et animateur)</label>
  <div class="actions"><button class="btn primary" data-act="doImport">Importer ${rep.added} session(s)</button></div>`;
}
function doImport() {
  const o = { pastDone: $('#optPast').checked, skipDup: $('#optDup').checked }, rep = applyNeo(S.parsed, o);
  S.parsed = null; persist(); S.F.sessions = { scope: '' }; S.view = 'sessions'; render(); toast(`${rep.added} session(s) importée(s).`);
}

/* ===== Restauration ===== */
async function restoreFlow(file, fromSetup) {
  if (!file) return;
  try {
    let data = JSON.parse(await file.text());
    if (data.fmt === 'formidable-enc') { const pw = await promptBox('Mot de passe de la sauvegarde', '', 'password'); if (!pw) return; try { data = await decryptJSON(data, pw); } catch (e) { throw new Error('Mot de passe incorrect.'); } }
    if (!data.sessions || !data.settings) throw new Error('Ce fichier n\'est pas une sauvegarde Formidable.');
    let merge = false;
    if (!fromSetup && DB.sessions.length + DB.users.length) merge = await confirmBox(`Fusionner la sauvegarde avec les données actuelles ? (Annuler = ne rien faire.) Pour remplacer entièrement, utilisez d'abord « Réinitialiser l'application » dans Paramètres.`, 'Fusionner');
    if (!fromSetup && !merge) return;
    DB = merge ? mergeDB(DB, data) : data; persist(); S.user = null; sessionStorage.removeItem('formidable.user'); render(); toast('Sauvegarde restaurée.');
  } catch (e) { toast(e.message || String(e), 'err'); }
}

/* ===== Démarrage ===== */
(async function init() {
  loadDB(); await fileInit();
  const uidS = sessionStorage.getItem('formidable.user'); if (uidS) S.user = DB.users.find(u => u.id === uidS) || null;
  window.addEventListener('focus', () => fileCheck());
  setInterval(() => { if (!document.hidden && !$('.overlay')) fileCheck(); }, 30000);
  render();
})();
