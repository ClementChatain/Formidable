/* ===== Composants d'interface ===== */
const opts = (list, sel, ph) => (ph !== undefined ? `<option value="">${esc(ph)}</option>` : '') + list.map(o => { const [v, l] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(v)}"${String(v) === String(sel ?? '') ? ' selected' : ''}>${esc(l)}</option>`; }).join('');
const typeOpts = () => DB.settings.types.map(t => [t.id, t.name]);
const animOpts = (all) => DB.animateurs.filter(a => all || a.actif !== false).sort((a, b) => a.name.localeCompare(b.name, 'fr')).map(a => [a.id, a.name]);
const lieuOpts = () => [...DB.lieux].sort((a, b) => a.name.localeCompare(b.name, 'fr')).map(l => [l.id, l.name]);
const statutBadge = id => `<span class="badge" style="--c:${ST[id].color}"><i>${ST[id].glyph}</i> ${ST[id].label}</span>`;
const typeDot = id => `<span class="dot" style="background:${(T(id) || {}).color || '#888'}"></span>`;
const first = n => (n || '').split(' ')[0];

function toast(msg, kind) { const t = document.createElement('div'); t.className = 'toast ' + (kind || ''); t.textContent = msg; $('#toasts').appendChild(t); setTimeout(() => t.remove(), kind === 'err' ? 7000 : 3500); }
function modal(html, cls = '') { closeModal(); const m = document.createElement('div'); m.className = 'overlay'; m.innerHTML = `<div class="modal ${cls}" role="dialog" aria-modal="true">${html}</div>`; document.body.appendChild(m); m.addEventListener('mousedown', e => { if (e.target === m && !m.dataset.sticky) closeModal(); }); const f = $('input:not([disabled]):not([type=hidden]),select:not([disabled])', m); if (f && !cls.includes('nofocus')) f.focus(); return m; }
function closeModal() { $$('.overlay').forEach(m => m.remove()); }
function confirmBox(msg, ok = 'Confirmer', danger) { return new Promise(res => { const m = modal(`<div class="mbody"><p>${esc(msg)}</p></div><div class="mfoot"><button class="btn" data-x="0">Annuler</button><button class="btn ${danger ? 'danger' : 'primary'}" data-x="1">${esc(ok)}</button></div>`, 'small'); m.addEventListener('click', e => { const b = e.target.closest('[data-x]'); if (b) { closeModal(); res(b.dataset.x === '1'); } }); }); }

/* ===== Barre de filtres ===== */
function filterBar(period = true) {
  const f = S.f, sel = (k, ph, list) => `<select data-f="${k}" aria-label="${ph}">${opts(list, f[k], ph)}</select>`;
  const years = [...new Set([...DB.sessions.map(s => s.date.slice(0, 4)), String(new Date().getFullYear())])].sort();
  const secteurs = [...new Set(DB.lieux.map(l => l.secteur).filter(Boolean))].sort();
  return `<div class="filters">
    ${period ? `<label class="fl">Année <select data-f="year">${opts(years, f.year, 'Toutes')}</select></label>
    <label class="fl">Du <input type="date" data-f="from" value="${f.from || ''}"></label><label class="fl">Au <input type="date" data-f="to" value="${f.to || ''}"></label>` : ''}
    ${sel('type', 'Tous les types', typeOpts())}${DB.settings.themes.length ? sel('theme', 'Tous les thèmes', DB.settings.themes) : ''}
    ${sel('anim', 'Tous les animateurs', animOpts(true))}${DB.settings.equipes.length ? sel('equipe', 'Toutes les équipes', DB.settings.equipes) : ''}
    ${sel('lieu', 'Tous les lieux', lieuOpts())}${secteurs.length ? sel('secteur', 'Tous les secteurs', secteurs) : ''}
    ${sel('statut', 'Tous les statuts', STATUTS.map(s => [s.id, s.label]))}${sel('modalite', 'Présentiel + distance', Object.entries(MODAL))}
    <input type="search" data-f="q" placeholder="Rechercher…" value="${esc(f.q || '')}" aria-label="Rechercher">
    <button class="btn ghost" data-act="resetf">Réinitialiser</button></div>`;
}

/* ===== Tableau de bord ===== */
function bars(items, fmt = v => v, color = 'var(--accent)') {
  const max = Math.max(1, ...items.map(i => i.v));
  return `<div class="bars">${items.map(i => `<div class="bar"><span class="bl" title="${esc(i.name)}">${esc(i.name)}</span><span class="bt"><span style="width:${Math.max(2, i.v / max * 100)}%;background:${i.color || color}"></span></span><span class="bv">${fmt(i.v)}</span></div>`).join('') || '<p class="muted">Aucune donnée.</p>'}</div>`;
}
function periodLabel() { const f = S.f; if (f.from || f.to) return `Du ${fmtShort(f.from) || '…'} au ${fmtShort(f.to) || '…'}`; return f.year ? `Année ${f.year}` : 'Toutes périodes'; }
function viewDashboard() {
  const list = filtered(), r = stats(list), t = today();
  const kpi = (v, l, sub, c) => `<div class="kpi"${c ? ` style="--c:${c}"` : ''}><b>${v}</b><span>${l}</span>${sub ? `<small>${sub}</small>` : ''}</div>`;
  const rows = o => Object.values(o).sort((a, b) => b.hReal - a.hReal || b.hPrev - a.hPrev || b.prev - a.prev);
  const tbl = (title, data, first) => `<div class="card"><h3>${title}</h3><div class="scroll"><table class="tbl"><thead><tr><th>${first}</th><th class="n">Sessions prévues</th><th class="n">Réalisées</th><th class="n">Annulées</th><th class="n">Reportées</th><th class="n">Heures prévues</th><th class="n">Heures réalisées</th></tr></thead><tbody>${data.map(e => `<tr><td>${esc(e.name)}</td><td class="n">${e.prev}</td><td class="n">${e.real}</td><td class="n">${e.ann}</td><td class="n">${e.rep}</td><td class="n">${fmtH(e.hPrev)}</td><td class="n"><b>${fmtH(e.hReal)}</b></td></tr>`).join('') || '<tr><td colspan="7" class="muted">Aucune donnée.</td></tr>'}</tbody></table></div></div>`;
  const months = Object.keys(r.mois).sort(), mmax = Math.max(1, ...months.map(m => sum(Object.values(r.mois[m]))));
  const stack = ['realisee', 'confirmee', 'planifiee', 'a_planifier', 'reportee', 'annulee'];
  const chart = months.length ? `<div class="mchart">${months.map(m => `<div class="mcol" title="${cap(fmtDate(m + '-01', { month: 'long', year: 'numeric' }))}"><div class="mstack" style="height:${sum(Object.values(r.mois[m])) / mmax * 100}%">${stack.filter(k => r.mois[m][k]).map(k => `<span style="flex:${r.mois[m][k]};background:${ST[k].color}" title="${ST[k].label} : ${r.mois[m][k]}">${r.mois[m][k]}</span>`).join('')}</div><em>${fmtDate(m + '-01', { month: 'short' })}${S.f.year ? '' : ' ' + m.slice(2, 4)}</em></div>`).join('')}</div>` : '<p class="muted">Aucune donnée.</p>';
  const al = computeAlerts().filter(a => a.sev === 'warn' && filtered([DB.sessions.find(s => s.id === a.sid)]).length).length;
  return `<div class="page-h"><div><h1>Tableau de bord</h1><p class="muted">${esc(periodLabel())}${DB.settings.org ? ' · ' + esc(DB.settings.org) : ''} · ${list.length} session${list.length > 1 ? 's' : ''} correspondant aux filtres</p></div>
    <div class="actions noprint">${can.exp() ? '<button class="btn" data-act="exportBilan">Exporter le bilan (Excel)</button>' : ''}<button class="btn" data-act="print">Imprimer / PDF</button></div></div>
    ${filterBar()}
    <div class="kpis">
      ${kpi(r.n, 'Sessions au total', `dont ${r.st.reportee} reportée(s), ${r.st.annulee} annulée(s)`)}
      ${kpi(r.st.a_planifier + r.st.planifiee + r.st.confirmee, 'À venir / en attente', `${r.st.a_planifier} à planifier · ${r.st.planifiee} planifiées · ${r.st.confirmee} confirmées`, ST.planifiee.color)}
      ${kpi(r.st.realisee, 'Sessions réalisées', '', ST.realisee.color)}
      ${kpi(r.st.reportee, 'Reportées', '', ST.reportee.color)}
      ${kpi(r.st.annulee, 'Annulées', 'exclues des heures', ST.annulee.color)}
      ${kpi(fmtH(r.hReal), 'Heures réalisées', 'sessions réalisées uniquement', ST.realisee.color)}
      ${kpi(fmtH(r.hPlan), 'Heures planifiées', 'hors annulées et reportées')}
      ${kpi(r.prevus || '—', 'Participants prévus', 'sessions réalisées')}
      ${kpi(r.partN ? r.presents : '—', 'Participants présents', '')}
      ${kpi(r.taux === null ? '—' : Math.round(r.taux * 100) + ' %', 'Taux de participation', 'présents / prévus')}
      ${kpi(al, 'Alertes à traiter', '<a href="#" data-act="goto" data-v="alertes">voir les alertes</a>', al ? ST.reportee.color : '')}
    </div>
    <div class="grid2">
      <div class="card"><h3>Sessions par mois</h3>${chart}<div class="legend">${stack.map(k => `<span><i style="background:${ST[k].color}"></i>${ST[k].label}</span>`).join('')}</div></div>
      <div class="card"><h3>Heures réalisées par animateur</h3>${bars(rows(r.anim).filter(e => e.hReal || e.hPrev).map(e => ({ name: e.name, v: e.hReal, color: 'var(--accent)' })), fmtH)}</div>
      <div class="card"><h3>Sessions par type de formation</h3>${bars(Object.entries(r.type).map(([id, e]) => ({ name: e.name, v: e.prev, color: (T(id) || {}).color })).sort((a, b) => b.v - a.v), v => v)}</div>
      <div class="card"><h3>Répartition par lieu / agence</h3>${bars(Object.values(r.lieu).map(e => ({ name: e.name, v: e.prev })).sort((a, b) => b.v - a.v).slice(0, 12), v => v)}</div>
    </div>
    ${tbl('Synthèse par animateur', rows(r.anim), 'Animateur')}
    ${tbl('Synthèse par type de formation', rows(r.type), 'Type')}
    ${tbl('Synthèse par secteur géographique', rows(r.secteur), 'Secteur')}
    <p class="muted note">Règles : une session annulée ou reportée n'entre ni dans les heures planifiées ni dans les heures réalisées. Les heures réalisées utilisent la durée réelle saisie (à défaut, la durée prévue). Si le suppléant est intervenu, la session est comptée pour lui plutôt que pour le titulaire ; les coanimateurs sont comptés pour chaque session.</p>`;
}

/* ===== Planning (calendrier) ===== */
function chip(s, long) {
  const col = S.cal.color === 'type' ? (T(s.typeId) || {}).color : ST[s.statut].color;
  return `<button class="chip${s.statut === 'annulee' ? ' cancelled' : ''}${s.statut === 'reportee' ? ' postponed' : ''}" style="--c:${col};--c2:${S.cal.color === 'type' ? ST[s.statut].color : ((T(s.typeId) || {}).color || '#888')}" data-act="open" data-id="${s.id}" title="${esc(ST[s.statut].label + ' · ' + (s.titre || typeName(s.typeId)))}">${s.debut ? `<b>${s.debut}</b> ` : ''}${esc(typeName(s.typeId))}${long ? ' · ' + esc(lieuName(s)) : ''} · ${esc(first(animName(s.titulaireId)) || '⚠ sans animateur')}</button>`;
}
function calNav() {
  const c = S.cal, d = parseISO(c.date);
  const title = { day: cap(fmtDate(c.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })), week: `Semaine du ${fmtDate(startOfWeek(c.date), { day: 'numeric', month: 'long' })} au ${fmtDate(addDays(startOfWeek(c.date), 6), { day: 'numeric', month: 'long', year: 'numeric' })}`, month: cap(fmtDate(c.date, { month: 'long', year: 'numeric' })), res: cap(fmtDate(c.date, { month: 'long', year: 'numeric' })), year: String(d.getFullYear()) }[c.mode];
  return `<div class="calbar"><div class="seg">${[['day', 'Jour'], ['week', 'Semaine'], ['month', 'Mois'], ['year', 'Année'], ['res', 'Mois par ressource']].map(([k, l]) => `<button class="${c.mode === k ? 'on' : ''}" data-act="calmode" data-v="${k}">${l}</button>`).join('')}</div>
  <div class="calnav"><button class="btn" data-act="calprev" aria-label="Précédent">‹</button><button class="btn" data-act="caltoday">Aujourd'hui</button><button class="btn" data-act="calnext" aria-label="Suivant">›</button><h2>${esc(title)}</h2></div>
  <div class="calopt">${c.mode === 'res' ? `<label>Lignes <select data-c="group">${opts([['anim', 'Animateurs'], ['lieu', 'Lieux'], ['type', 'Types de formation']], c.group || 'anim')}</select></label>` : ''}<label>Couleur <select data-c="color">${opts([['statut', 'selon le statut'], ['type', 'selon le type']], c.color)}</select></label></div></div>`;
}
function viewPlanning() {
  const c = S.cal, list = filtered(DB.sessions, { ...S.f, year: '', from: '', to: '' }), by = {};
  list.forEach(s => (by[s.date] ||= []).push(s));
  Object.values(by).forEach(a => a.sort((x, y) => (x.debut || '99') < (y.debut || '99') ? -1 : 1));
  let body = '';
  const t = today();
  const dayCell = (iso, curMonth) => `<div class="day${iso === t ? ' today' : ''}${curMonth !== undefined && iso.slice(0, 7) !== curMonth ? ' other' : ''}${[0, 6].includes(parseISO(iso).getDay()) ? ' we' : ''}" ${can.edit() ? `data-act="new" data-date="${iso}"` : ''}><span class="dn">${+iso.slice(8)}</span>${(by[iso] || []).map(s => chip(s)).join('')}</div>`;
  if (c.mode === 'month') {
    const ym = c.date.slice(0, 7), s0 = startOfWeek(ym + '-01'); const days = Array.from({ length: 42 }, (_, i) => addDays(s0, i));
    body = `<div class="mgrid">${['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'].map(d => `<div class="dh">${d}.</div>`).join('')}${days.slice(0, 35).concat(days[35].slice(0, 7) === ym ? days.slice(35) : []).map(d => dayCell(d, ym)).join('')}</div>`;
  } else if (c.mode === 'week') {
    const s0 = startOfWeek(c.date);
    body = `<div class="wgrid">${Array.from({ length: 7 }, (_, i) => addDays(s0, i)).map(d => `<div class="wday${d === t ? ' today' : ''}"><h4>${cap(fmtDate(d, { weekday: 'long', day: 'numeric', month: 'short' }))}</h4>${(by[d] || []).map(s => chip(s, true)).join('') || '<p class="muted">—</p>'}${can.edit() ? `<button class="btn ghost sm" data-act="new" data-date="${d}">+ Session</button>` : ''}</div>`).join('')}</div>`;
  } else if (c.mode === 'day') {
    const ss = by[c.date] || [];
    body = `<div class="dayview">${ss.map(s => `<div class="dcard" style="--c:${(T(s.typeId) || {}).color}" data-act="open" data-id="${s.id}"><div><b>${s.debut ? s.debut + (s.fin ? '–' + s.fin : '') : 'Horaires non renseignés'}</b> · ${fmtH(s.duree)}</div><h3>${esc(s.titre || typeName(s.typeId))}</h3><p>${typeDot(s.typeId)}${esc(typeName(s.typeId))}${s.theme ? ' · ' + esc(s.theme) : ''} · ${esc(lieuName(s) || 'Lieu à définir')}</p><p>Titulaire : <b>${esc(animName(s.titulaireId) || 'à désigner')}</b>${s.suppleantId ? ' · Suppléant : ' + esc(animName(s.suppleantId)) : ''}</p>${statutBadge(s.statut)}</div>`).join('') || '<p class="muted pad">Aucune session ce jour.</p>'}${can.edit() ? `<button class="btn" data-act="new" data-date="${c.date}">+ Nouvelle session ce jour</button>` : ''}</div>`;
  } else if (c.mode === 'year') {
    const y = parseISO(c.date).getFullYear();
    body = `<div class="ygrid">${MONTHS.map((mn, m) => { const first = new Date(y, m, 1), s0 = startOfWeek(toISO(first)); const days = Array.from({ length: 42 }, (_, i) => addDays(s0, i)); const n = sum(Object.keys(by).filter(d => d.startsWith(`${y}-${pad(m + 1)}`)).map(d => by[d].length)); return `<div class="ymonth"><h4><a href="#" data-act="calgo" data-date="${y}-${pad(m + 1)}-01" data-v="month">${cap(mn)}</a> <small>${n ? n + ' session' + (n > 1 ? 's' : '') : ''}</small></h4><div class="ymini">${['L', 'M', 'M', 'J', 'V', 'S', 'D'].map(d => `<i class="yh">${d}</i>`).join('')}${days.map(d => { const ss = by[d] || [], inM = d.slice(5, 7) === pad(m + 1); const col = ss.length ? (ss.some(s => s.statut === 'realisee') ? ST.realisee.color : ss.some(s => ['planifiee', 'confirmee', 'a_planifier'].includes(s.statut)) ? ST.planifiee.color : ST.annulee.color) : ''; return inM ? `<a href="#" class="yd${ss.length ? ' has' : ''}${d === t ? ' today' : ''}" ${col ? `style="--c:${col}"` : ''} data-act="calgo" data-date="${d}" data-v="day" title="${ss.map(s => esc(sessionLabel(s))).join('\n')}">${+d.slice(8)}</a>` : '<i></i>'; }).join('')}</div></div>`; }).join('')}</div>`;
  } else {
    const ym = c.date.slice(0, 7), nd = new Date(+ym.slice(0, 4), +ym.slice(5), 0).getDate(), g = c.group || 'anim';
    const inMonth = list.filter(s => s.date.startsWith(ym));
    const keys = g === 'anim' ? animOpts(true).map(([id, n]) => [id, n]) : g === 'lieu' ? [...lieuOpts(), ['dist', 'À distance']] : typeOpts();
    const keyOf = s => g === 'anim' ? effective(s).concat(s.suppleantId && !s.suppIntervenu ? [] : []) : g === 'lieu' ? [s.modalite === 'distance' ? 'dist' : s.lieuId] : [s.typeId];
    const rowsData = keys.map(([id, n]) => [id, n, inMonth.filter(s => keyOf(s).includes(id))]).filter(([, , ss]) => ss.length || g === 'anim');
    const noAnim = g === 'anim' ? inMonth.filter(s => !s.titulaireId) : [];
    if (noAnim.length) rowsData.push(['-', '⚠ Sans animateur', noAnim]);
    body = `<div class="scroll"><table class="rgrid"><thead><tr><th class="rname"></th>${Array.from({ length: nd }, (_, i) => { const d = `${ym}-${pad(i + 1)}`; return `<th class="${[0, 6].includes(parseISO(d).getDay()) ? 'we' : ''}${d === t ? ' today' : ''}"><small>${['D', 'L', 'M', 'M', 'J', 'V', 'S'][parseISO(d).getDay()]}</small>${i + 1}</th>`; }).join('')}<th>Σ h</th></tr></thead><tbody>${rowsData.map(([id, n, ss]) => `<tr><th class="rname">${esc(n)}</th>${Array.from({ length: nd }, (_, i) => { const d = `${ym}-${pad(i + 1)}`, x = ss.filter(s => s.date === d); return `<td class="${[0, 6].includes(parseISO(d).getDay()) ? 'we' : ''}">${x.map(s => `<button class="rc${s.statut === 'annulee' ? ' cancelled' : ''}" style="--c:${S.cal.color === 'type' ? (T(s.typeId) || {}).color : ST[s.statut].color}" data-act="open" data-id="${s.id}" title="${esc(sessionLabel(s) + ' · ' + ST[s.statut].label)}">${esc((typeName(s.typeId)).slice(0, 3))}</button>`).join('')}</td>`; }).join('')}<td class="n">${fmtH(sum(ss.filter(s => ACTIVE.includes(s.statut)), dureeEff))}</td></tr>`).join('') || `<tr><td colspan="${nd + 2}" class="muted">Aucune session.</td></tr>`}</tbody></table></div>`;
  }
  const legend = S.cal.color === 'type' ? DB.settings.types.map(t => `<span><i style="background:${t.color}"></i>${esc(t.name)}</span>`).join('') : STATUTS.map(s => `<span><i style="background:${s.color}"></i>${s.label}</span>`).join('');
  return `<div class="page-h"><div><h1>Planning</h1></div><div class="actions noprint">${can.edit() ? '<button class="btn primary" data-act="new">+ Nouvelle session</button>' : ''}${can.exp() ? '<button class="btn" data-act="exportIcs" title="Fichier calendrier (.ics) pour Outlook">Export calendrier</button>' : ''}</div></div>${filterBar(false)}${calNav()}<div class="legend">${legend}</div>${body}`;
}

/* ===== Liste des sessions ===== */
function viewSessions() {
  const list = filtered(), k = S.sort.k, d = S.sort.d;
  const val = { date: s => s.date + (s.debut || ''), type: s => typeName(s.typeId), lieu: s => lieuName(s), tit: s => animName(s.titulaireId), duree: s => s.duree || 0, statut: s => STATUTS.findIndex(x => x.id === s.statut) }[k];
  list.sort((a, b) => (val(a) < val(b) ? -1 : val(a) > val(b) ? 1 : 0) * d);
  const alerts = computeAlerts(), warn = new Set(alerts.filter(a => a.sev === 'warn').map(a => a.sid));
  const th = (key, l, cls = '') => `<th class="${cls}"><button class="sortb" data-act="sort" data-k="${key}">${l}${k === key ? (d > 0 ? ' ▲' : ' ▼') : ''}</button></th>`;
  return `<div class="page-h"><div><h1>Sessions</h1><p class="muted">${list.length} session${list.length > 1 ? 's' : ''} · ${fmtH(sum(list.filter(s => ACTIVE.includes(s.statut)), dureeEff))} (hors annulées/reportées)</p></div><div class="actions noprint">${can.edit() ? '<button class="btn primary" data-act="new">+ Nouvelle session</button>' : ''}${can.exp() ? '<button class="btn" data-act="exportSessions">Exporter (Excel)</button>' : ''}</div></div>${filterBar()}
  <div class="scroll"><table class="tbl hover"><thead><tr>${th('date', 'Date')}<th>Horaires</th>${th('type', 'Formation')}${th('lieu', 'Lieu')}${th('tit', 'Titulaire')}<th>Suppléant</th>${th('duree', 'Durée', 'n')}<th class="n">Particip.</th>${th('statut', 'Statut')}<th></th></tr></thead><tbody>${list.map(s => `<tr data-act="open" data-id="${s.id}" tabindex="0"><td>${fmtDate(s.date, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</td><td>${s.debut ? s.debut + (s.fin ? '–' + s.fin : '') : '<span class="muted">—</span>'}</td><td>${typeDot(s.typeId)}<b>${esc(s.titre || typeName(s.typeId))}</b>${s.groupeId ? ' <span class="tag" title="Session d\'une action à sessions multiples">série</span>' : ''}<br><small class="muted">${esc(typeName(s.typeId))}${s.theme ? ' · ' + esc(s.theme) : ''}</small></td><td>${esc(lieuName(s)) || '<span class="muted">—</span>'}</td><td>${esc(animName(s.titulaireId)) || '<span class="warnt">à désigner</span>'}</td><td>${esc(animName(s.suppleantId)) || '<span class="muted">—</span>'}</td><td class="n">${fmtH(dureeEff(s))}</td><td class="n">${s.presents != null ? s.presents : '–'} / ${s.prevus != null ? s.prevus : '–'}</td><td>${statutBadge(s.statut)}</td><td>${warn.has(s.id) ? '<span class="warnt" title="Alerte : voir l\'onglet Alertes">⚠</span>' : ''}</td></tr>`).join('') || '<tr><td colspan="10" class="muted pad">Aucune session ne correspond aux filtres.</td></tr>'}</tbody></table></div>`;
}

/* ===== Alertes & historique ===== */
function viewAlertes() {
  const al = computeAlerts(), groups = { warn: 'À traiter', info: 'Informations', rappel: 'Rappels à venir' };
  return `<div class="page-h"><div><h1>Alertes</h1><p class="muted">Calculées en direct sur l'ensemble des sessions. Rappels : sessions dans les ${DB.settings.alertDays} prochains jours.</p></div></div>` + Object.entries(groups).map(([sev, label]) => { const items = al.filter(a => a.sev === sev); return `<div class="card"><h3>${label} <span class="tag">${items.length}</span></h3>${items.map(a => { const s = DB.sessions.find(x => x.id === a.sid); return `<div class="alert ${sev}" data-act="open" data-id="${s.id}" tabindex="0"><b>${esc(a.kind)}</b> <span>${esc(sessionLabel(s))}</span><em>${esc(a.msg)}</em></div>`; }).join('') || '<p class="muted">Rien à signaler.</p>'}</div>`; }).join('');
}
function viewHistorique() {
  const q = norm(S.hq || ''), h = [...DB.history].reverse().filter(x => !q || norm([x.user, x.label, x.action, x.detail].join(' ')).includes(q)).slice(0, 500);
  return `<div class="page-h"><div><h1>Historique des modifications</h1><p class="muted">Journal de toutes les créations, modifications, changements de statut et d'animateur.</p></div><div class="actions noprint"><input type="search" data-hq placeholder="Rechercher (personne, session, statut…)" value="${esc(S.hq || '')}">${can.exp() ? '<button class="btn" data-act="exportHist">Exporter (Excel)</button>' : ''}</div></div>
  <div class="scroll"><table class="tbl"><thead><tr><th>Date / heure</th><th>Utilisateur</th><th>Action</th><th>Session</th><th>Détail</th></tr></thead><tbody>${h.map(x => `<tr><td>${new Date(x.ts).toLocaleString('fr-FR')}</td><td>${esc(x.user)}</td><td><span class="tag">${esc(x.action)}</span></td><td>${x.sid && DB.sessions.some(s => s.id === x.sid) ? `<a href="#" data-act="open" data-id="${x.sid}">${esc(x.label)}</a>` : esc(x.label)}</td><td class="pre">${esc(x.detail)}</td></tr>`).join('') || '<tr><td colspan="5" class="muted pad">Aucun événement.</td></tr>'}</tbody></table></div>${DB.history.length > 500 ? '<p class="muted">Seuls les 500 derniers événements sont affichés ; l\'export contient tout.</p>' : ''}`;
}

/* ===== Fiche session ===== */
function sessionForm(s, isNew) {
  const full = can.edit(), own = can.own(s), ro = !(full || own);
  const d = (ownOk) => (full || (own && ownOk)) ? '' : ' disabled';
  const inp = (n, label, type = 'text', ownOk = false, extra = '') => `<label class="f"><span>${label}</span><input type="${type}" name="${n}" value="${esc(s[n] ?? '')}"${d(ownOk)} ${extra}></label>`;
  const txt = (n, label, ownOk = false, rows = 2) => `<label class="f wide"><span>${label}</span><textarea name="${n}" rows="${rows}"${d(ownOk)}>${esc(s[n] ?? '')}</textarea></label>`;
  const co = new Set(s.coanim || []);
  const hist = DB.history.filter(h => h.sid === s.id).reverse();
  const dec = ['annulee', 'reportee'].includes(s.statut);
  return `<form id="sf" autocomplete="off"><div class="mhead"><h2>${isNew ? 'Nouvelle session' : esc(s.titre || typeName(s.typeId))}</h2>${isNew ? '' : statutBadge(s.statut)}<button type="button" class="x" data-act="close" aria-label="Fermer">✕</button></div>
  <div class="mbody">
  ${ro ? '<p class="info">Consultation uniquement.</p>' : (!full ? '<p class="info">Vous pouvez mettre à jour le statut, la durée réelle, les participants et les commentaires de vos interventions.</p>' : '')}
  ${!isNew && conflictsFor(s).length ? `<p class="info warn">${conflictsFor(s).map(a => esc(a.msg)).join('<br>')}</p>` : ''}
  <fieldset><legend>Informations générales</legend><div class="fg">
    ${inp('titre', 'Intitulé de la formation')}
    <label class="f"><span>Type de formation *</span><select name="typeId" required${d()}>${opts(typeOpts(), s.typeId, '— choisir —')}</select></label>
    <label class="f"><span>Thème / produit</span><input name="theme" list="dl-themes" value="${esc(s.theme)}"${d()}><datalist id="dl-themes">${DB.settings.themes.map(t => `<option value="${esc(t)}">`).join('')}</datalist></label>
    ${txt('objectif', 'Objectif de la formation')}
    ${inp('date', 'Date *', 'date', false, 'required')}${inp('debut', 'Heure de début', 'time')}${inp('fin', 'Heure de fin', 'time')}
    <label class="f"><span>Durée prévue (heures) <button type="button" class="lnk" data-act="calcDuree">calculer depuis les horaires</button></span><input type="number" name="duree" min="0" max="24" step="0.25" value="${s.duree ?? ''}"${d()}><span class="presets">${DB.settings.durees.map(x => `<button type="button" class="chipb" data-act="preset" data-h="${x.h}"${d()}>${esc(x.l)} (${x.h} h)</button>`).join('')}<small id="dureeFmt" class="muted"></small></span></label>
    <label class="f"><span>Durée réelle (heures)</span><input type="number" name="dureeReelle" min="0" max="24" step="0.25" value="${s.dureeReelle ?? ''}"${d(true)}></label>
    <label class="f"><span>Année de rattachement</span><input id="annee" value="${s.date ? s.date.slice(0, 4) : ''}" disabled></label>
    <label class="f"><span>Statut *</span><select name="statut"${d(true)}>${opts(STATUTS.map(x => [x.id, x.label]), s.statut)}</select></label>
  </div></fieldset>
  <fieldset id="decision" class="${dec ? '' : 'hide'}"><legend>Annulation / report</legend><div class="fg">
    ${inp('motif', 'Motif', 'text', true)}${inp('dateDecision', 'Date de la décision', 'date', true)}${inp('nouvelleDate', 'Nouvelle date prévue (si connue)', 'date', true)}
    <label class="f"><span>Décision enregistrée par</span><input value="${esc(s.decisionPar || (S.user ? S.user.name : ''))}" disabled></label>
    ${full ? `<label class="chk wide"><input type="checkbox" name="creerRemplacement" checked> Créer automatiquement la session de remplacement à la nouvelle date (statut « à planifier »)</label>` : ''}
  </div></fieldset>
  <fieldset><legend>Lieu</legend><div class="fg">
    <label class="f"><span>Modalité</span><select name="modalite"${d()}>${opts(Object.entries(MODAL), s.modalite)}</select></label>
    <label class="f lieu-p"><span>Agence, site ou salle</span><select name="lieuId"${d()}>${opts(lieuOpts(), s.lieuId, '— à définir —')}</select></label>
    <label class="f lieu-d"><span>Lien de connexion</span><input name="lienVisio" value="${esc(s.lienVisio)}"${d(true)}></label>
    ${inp('adresse', 'Précision d\'adresse / secteur')}
  </div></fieldset>
  <fieldset><legend>Animateurs</legend><div class="fg">
    <label class="f"><span>Animateur titulaire</span><select name="titulaireId"${d()}>${opts(animOpts(), s.titulaireId, '— à désigner —')}${s.titulaireId && !A(s.titulaireId)?.actif === false ? '' : ''}</select></label>
    <label class="f"><span>Animateur suppléant (en cas d'absence)</span><select name="suppleantId"${d()}>${opts(animOpts(), s.suppleantId, '— aucun —')}</select></label>
    <label class="chk wide"><input type="checkbox" name="suppIntervenu"${s.suppIntervenu ? ' checked' : ''}${d(true)}> Le suppléant est intervenu à la place du titulaire (la session lui est alors comptée)</label>
    <div class="f wide"><span>Coanimateur(s) éventuel(s)</span><div class="checks">${animOpts().map(([id, n]) => `<label class="chk"><input type="checkbox" name="coanim" value="${id}"${co.has(id) ? ' checked' : ''}${d()}> ${esc(n)}</label>`).join('') || '<small class="muted">Aucun animateur référencé.</small>'}</div></div>
    ${inp('coanimRole', 'Rôle des coanimateurs (ex. co-animation DCO, binôme)')}
  </div></fieldset>
  <fieldset><legend>Public concerné</legend><div class="fg">
    ${inp('caisse', 'Caisse / direction / secteur / unité')}${inp('agences', 'Agence ou groupe d\'agences')}${inp('demandeur', 'Demandeur')}
    <label class="f"><span>Population concernée</span><input name="population" list="dl-pop" value="${esc(s.population)}"${d()}><datalist id="dl-pop">${DB.settings.populations.map(t => `<option value="${esc(t)}">`).join('')}</datalist></label>
    ${inp('profil', 'Métier / profil des participants')}
    ${inp('prevus', 'Participants prévus', 'number', true, 'min="0"')}${inp('presents', 'Participants présents', 'number', true, 'min="0"')}
    ${txt('participants', 'Liste des participants (si nécessaire)', true, 3)}
  </div></fieldset>
  <fieldset><legend>Organisation et suivi</legend><div class="fg">
    ${inp('dateDemande', 'Date de la demande', 'date')}${inp('origine', 'Personne / origine de la demande')}${inp('organisateur', 'Personne chargée de l\'organisation')}
    ${txt('logistique', 'Besoins matériels ou logistiques')}${inp('support', 'Support de formation utilisé')}
    <label class="f wide"><span>Documents associés (une ligne par document : <code>nom | chemin ou lien</code>)</span><textarea name="docs" rows="2" placeholder="Support Néo.pptx | \\\\serveur\\partage\\formations\\neo.pptx"${d(true)}>${esc((s.docs || []).map(x => x.nom + (x.lien ? ' | ' + x.lien : '')).join('\n'))}</textarea></label>
    ${txt('commentaire', 'Commentaires', true, 3)}
  </div></fieldset>
  ${isNew ? `<fieldset><legend>Plusieurs sessions sur une même action</legend><label class="f wide"><span>Dates supplémentaires (une session identique sera créée à chaque date)</span><div class="adddates"><input type="date" id="xd"><button type="button" class="btn" data-act="addDate">Ajouter la date</button></div><div id="xdl" class="checks"></div></label></fieldset>` : ''}
  ${!isNew && !ro ? '' : ''}
  ${!isNew ? `<details><summary>Historique de cette session (${hist.length})</summary><ul class="hist">${hist.map(h => `<li><b>${new Date(h.ts).toLocaleString('fr-FR')}</b> · ${esc(h.user)} · <span class="tag">${esc(h.action)}</span><br><span class="pre">${esc(h.detail)}</span></li>`).join('') || '<li class="muted">Aucun événement.</li>'}</ul></details>` : ''}
  </div>
  <div class="mfoot">
    ${!isNew && full ? '<button type="button" class="btn" data-act="dup">Dupliquer</button><button type="button" class="btn danger ghost" data-act="del">Supprimer</button>' : ''}
    ${!isNew ? '<button type="button" class="btn ghost" data-act="mail" title="Ouvre votre messagerie avec un message pré-rempli">Prévenir par e-mail</button><button type="button" class="btn ghost" data-act="ics1">Fichier calendrier</button>' : ''}
    ${!ro ? `<span class="sp"></span><button type="button" class="btn" data-act="quick" data-v="realisee">Confirmer la réalisation</button><button type="button" class="btn" data-act="quick" data-v="reportee">Reporter</button><button type="button" class="btn" data-act="quick" data-v="annulee">Annuler la session</button>` : '<span class="sp"></span>'}
    <button type="button" class="btn" data-act="close">${ro ? 'Fermer' : 'Fermer sans enregistrer'}</button>${!ro ? '<button class="btn primary" type="submit">Enregistrer</button>' : ''}
  </div></form>`;
}

/* ===== Échanges (import / export / partage) ===== */
function viewEchanges() {
  const imp = can.imp(), exp = can.exp();
  const n = DB.sessions.length;
  return `<div class="page-h"><div><h1>Import / Export / Partage</h1></div></div>
  ${imp ? `<div class="card"><h3>Importer le planning Excel existant</h3><p>Sélectionnez le fichier <b>Planning formation NéoV2</b> (.xlsx). Il est lu <b>localement dans votre navigateur</b> : rien n'est envoyé nulle part. Un aperçu s'affiche avant toute écriture.</p><input type="file" id="xlsxIn" accept=".xlsx"><div id="impPreview"></div></div>` : ''}
  ${exp ? `<div class="card"><h3>Exports Excel</h3><p class="muted">Les exports tiennent compte des filtres en cours (onglets Tableau de bord / Sessions) : ${filtered().length} session(s) sur ${n}. Pensez à réinitialiser les filtres pour tout exporter.</p>
    <div class="actions wrap"><button class="btn" data-act="exportSessions">Toutes les sessions filtrées</button><button class="btn" data-act="exportBilan">Bilan d'activité (synthèses + sessions)</button><button class="btn" data-act="exportBy" data-v="anim">Planning par animateur</button><button class="btn" data-act="exportBy" data-v="lieu">Planning par lieu / agence</button><button class="btn" data-act="exportBy" data-v="type">Planning par type de formation</button><button class="btn" data-act="exportIcs">Calendrier (.ics)</button></div></div>` : ''}
  ${can.imp() ? `<div class="card"><h3>Fichier de données partagé</h3>
    <p>Les données vivent dans le navigateur de chaque poste. Pour travailler à plusieurs, liez l'application à <b>un fichier .json placé sur un dossier partagé</b> de l'entreprise : chaque modification y est enregistrée et fusionnée automatiquement avec celles des collègues (même session modifiée par deux personnes : la plus récente l'emporte). Les droits d'accès au dossier protègent les données.</p>
    ${FS_OK ? `<p>État : ${FS.h ? `<b>lié à ${esc(FS.h.name)}</b>` : '<b>aucun fichier lié</b> (données locales à ce navigateur)'}</p><div class="actions wrap"><button class="btn primary" data-act="fslink" data-v="new">Créer le fichier partagé…</button><button class="btn" data-act="fslink" data-v="open">Ouvrir un fichier existant…</button>${FS.h ? '<button class="btn danger ghost" data-act="fsunlink">Délier</button>' : ''}</div>` : '<p class="info warn">Cette fonction nécessite Chrome ou Edge. Avec un autre navigateur, utilisez les sauvegardes ci-dessous.</p>'}</div>
  <div class="card"><h3>Sauvegarde et restauration</h3><p>Copie complète de l'application (sessions, référentiels, utilisateurs, historique). Il est recommandé de protéger la sauvegarde par un mot de passe (chiffrement AES-256).</p>
    <div class="actions wrap"><label class="f inl"><span>Mot de passe (facultatif)</span><input type="password" id="bkpw" autocomplete="new-password"></label><button class="btn" data-act="backup">Télécharger la sauvegarde</button><label class="btn">Restaurer une sauvegarde…<input type="file" id="restoreIn" accept=".json" hidden></label></div></div>` : ''}`;
}

/* ===== Paramètres ===== */
function viewSettings() {
  const tabs = [['types', 'Types de formation'], ['lieux', 'Lieux'], ['animateurs', 'Animateurs'], ['listes', 'Thèmes, équipes, populations'], ['durees', 'Durées types']].concat(can.admin() ? [['users', 'Utilisateurs & droits'], ['general', 'Général']] : []);
  const tab = tabs.some(t => t[0] === S.setTab) ? S.setTab : 'types';
  const used = { type: id => DB.sessions.filter(s => s.typeId === id).length, lieu: id => DB.sessions.filter(s => s.lieuId === id).length, anim: id => DB.sessions.filter(s => involved(s).includes(id)).length };
  let body = '';
  if (tab === 'types') body = `<p class="muted">Ajoutez librement de nouveaux types de formation : aucune évolution technique n'est nécessaire.</p><table class="tbl"><thead><tr><th>Couleur</th><th>Type</th><th class="n">Sessions</th><th></th></tr></thead><tbody>${DB.settings.types.map(t => `<tr><td><span class="dot big" style="background:${t.color}"></span></td><td>${esc(t.name)}</td><td class="n">${used.type(t.id)}</td><td class="r"><button class="btn sm" data-act="edit" data-k="type" data-id="${t.id}">Modifier</button> <button class="btn sm danger ghost" data-act="rm" data-k="type" data-id="${t.id}">Supprimer</button></td></tr>`).join('')}</tbody></table><button class="btn primary" data-act="edit" data-k="type">+ Type de formation</button>`;
  if (tab === 'lieux') body = `<p class="muted">Liste harmonisée : un lieu = un nom unique. Les variantes d'orthographe (alias) sont rattachées au lieu principal ; utilisez <b>Fusionner</b> pour regrouper des doublons.</p><div class="scroll"><table class="tbl"><thead><tr><th>Lieu</th><th>Nature</th><th>Adresse</th><th>Secteur</th><th>Alias</th><th class="n">Sessions</th><th></th></tr></thead><tbody>${[...DB.lieux].sort((a, b) => a.name.localeCompare(b.name, 'fr')).map(l => `<tr><td>${esc(l.name)}</td><td>${{ salle: 'Salle', agence: 'Agence', site: 'Site' }[l.kind] || ''}</td><td>${esc(l.adresse)}</td><td>${esc(l.secteur)}</td><td><small>${esc((l.aliases || []).join(' · '))}</small></td><td class="n">${used.lieu(l.id)}</td><td class="r"><button class="btn sm" data-act="edit" data-k="lieu" data-id="${l.id}">Modifier</button> <button class="btn sm" data-act="merge" data-k="lieu" data-id="${l.id}">Fusionner</button> <button class="btn sm danger ghost" data-act="rm" data-k="lieu" data-id="${l.id}">Supprimer</button></td></tr>`).join('') || '<tr><td colspan="7" class="muted">Aucun lieu.</td></tr>'}</tbody></table></div><button class="btn primary" data-act="edit" data-k="lieu">+ Lieu</button>`;
  if (tab === 'animateurs') body = `<div class="scroll"><table class="tbl"><thead><tr><th>Nom</th><th>Équipe / unité</th><th>E-mail</th><th>Actif</th><th class="n">Sessions</th><th></th></tr></thead><tbody>${[...DB.animateurs].sort((a, b) => a.name.localeCompare(b.name, 'fr')).map(a => `<tr><td>${esc(a.name)}${a.note ? `<br><small class="muted pre">${esc(a.note)}</small>` : ''}</td><td>${esc(a.equipe)}</td><td>${esc(a.email)}</td><td>${a.actif === false ? 'Non' : 'Oui'}</td><td class="n">${used.anim(a.id)}</td><td class="r"><button class="btn sm" data-act="edit" data-k="anim" data-id="${a.id}">Modifier</button> <button class="btn sm" data-act="merge" data-k="anim" data-id="${a.id}">Fusionner</button> <button class="btn sm danger ghost" data-act="rm" data-k="anim" data-id="${a.id}">Supprimer</button></td></tr>`).join('') || '<tr><td colspan="6" class="muted">Aucun animateur.</td></tr>'}</tbody></table></div><button class="btn primary" data-act="edit" data-k="anim">+ Animateur</button>`;
  if (tab === 'listes') body = [['themes', 'Thèmes / produits'], ['equipes', 'Équipes / unités'], ['populations', 'Populations concernées']].map(([k, l]) => `<div class="card"><h3>${l}</h3><div class="checks">${DB.settings[k].map((v, i) => `<span class="tag lg">${esc(v)} <button class="lnk" data-act="listren" data-k="${k}" data-i="${i}">modifier</button> <button class="lnk" data-act="listdel" data-k="${k}" data-i="${i}">retirer</button></span>`).join('') || '<small class="muted">Liste vide.</small>'}</div><div class="adddates"><input id="add-${k}" placeholder="Nouvelle valeur"><button class="btn" data-act="listadd" data-k="${k}">Ajouter</button></div></div>`).join('');
  if (tab === 'durees') body = `<p class="muted">Raccourcis proposés dans la fiche session (ex. demi-journée = 3 h, journée = 7 h). La durée reste libre.</p><table class="tbl"><thead><tr><th>Libellé</th><th class="n">Heures</th><th></th></tr></thead><tbody>${DB.settings.durees.map((x, i) => `<tr><td>${esc(x.l)}</td><td class="n">${x.h}</td><td class="r"><button class="btn sm" data-act="edit" data-k="duree" data-id="${i}">Modifier</button> <button class="btn sm danger ghost" data-act="rm" data-k="duree" data-id="${i}">Supprimer</button></td></tr>`).join('')}</tbody></table><button class="btn primary" data-act="edit" data-k="duree">+ Durée type</button>`;
  if (tab === 'users') body = `<p class="info">Les profils servent à adapter l'écran à chacun (qui peut modifier, exporter, paramétrer). Ils ne constituent pas une protection cryptographique : les données sont stockées dans le navigateur ou dans le fichier partagé, dont l'accès doit être protégé par les droits du dossier réseau.</p><table class="tbl"><thead><tr><th>Nom</th><th>Profil</th><th>Animateur lié</th><th>Code</th><th></th></tr></thead><tbody>${DB.users.map(u => `<tr><td>${esc(u.name)}</td><td>${ROLES[u.role]}</td><td>${esc(animName(u.animateurId))}</td><td>${u.pin ? 'oui' : '<span class="warnt">aucun</span>'}</td><td class="r"><button class="btn sm" data-act="edit" data-k="user" data-id="${u.id}">Modifier</button> <button class="btn sm danger ghost" data-act="rm" data-k="user" data-id="${u.id}">Supprimer</button></td></tr>`).join('')}</tbody></table><button class="btn primary" data-act="edit" data-k="user">+ Utilisateur</button>
    <table class="tbl" style="margin-top:1.5rem"><caption>Droits par profil</caption><thead><tr><th>Profil</th><th>Droits</th></tr></thead><tbody><tr><td>Administrateur</td><td>Tout : paramétrage, utilisateurs, sessions, import/export, sauvegardes</td></tr><tr><td>Gestionnaire</td><td>Création/modification/suppression des sessions, référentiels (types, lieux, animateurs), import Excel, exports, fichier partagé</td></tr><tr><td>Animateur</td><td>Consultation ; mise à jour de ses propres interventions (statut, durée réelle, participants, commentaires, documents)</td></tr><tr><td>Manager / pilote</td><td>Consultation, tableaux de bord, historique, exports</td></tr><tr><td>Lecteur</td><td>Consultation uniquement</td></tr></tbody></table>`;
  if (tab === 'general') body = `<div class="card"><label class="f"><span>Nom de l'équipe / entité (affiché sur les bilans)</span><input id="set-org" value="${esc(DB.settings.org)}"></label><label class="f"><span>Rappel avant session (jours)</span><input id="set-days" type="number" min="1" max="60" value="${DB.settings.alertDays}"></label><button class="btn primary" data-act="saveGeneral">Enregistrer</button></div><div class="card"><h3>Zone sensible</h3><p>Efface <b>toutes</b> les données de ce navigateur (sessions, référentiels, utilisateurs).</p><button class="btn danger" data-act="wipe">Réinitialiser l'application…</button></div>`;
  return `<div class="page-h"><div><h1>Paramètres</h1></div></div><div class="seg tabs">${tabs.map(([k, l]) => `<button class="${k === tab ? 'on' : ''}" data-act="settab" data-v="${k}">${l}</button>`).join('')}</div><div class="card">${body}</div>`;
}
