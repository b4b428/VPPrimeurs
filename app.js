/* ---------- Utilitaires ---------- */
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const nl2br = s => esc(s).replace(/\n/g, '<br>');
const num = v => { const n = parseFloat(String(v ?? '').replace(/\s/g,'').replace(',', '.')); return isFinite(n) ? n : 0; };
const r2 = n => Math.round((n + Number.EPSILON) * 100) / 100;
const EUR = new Intl.NumberFormat('fr-FR', {style:'currency', currency:'EUR'});
const eur = n => EUR.format(n || 0);
const pct = n => String(n).replace('.', ',') + ' %';
const fmtN = n => String(r2(num(n))).replace('.', ',');
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const today = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const addDays = (iso, n) => { if (!iso) return ''; const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + (n || 0)); return d.toISOString().slice(0, 10); };
const fmtDate = iso => iso ? new Date(iso + 'T12:00:00').toLocaleDateString('fr-FR') : '';
const clone = o => JSON.parse(JSON.stringify(o));

const LOGO = 'img/logo-vp-primeur.png';
const BRAND_COLOR = '#D24E17';
const TVAS = [[5.5,'5,5 %'],[10,'10 %'],[20,'20 %'],[2.1,'2,1 %'],[0,'0 %']];
const TVA_DEF = () => S.company.tvaDefaut ?? 5.5;
const CATEGORIES = ['Fruits','Légumes','Herbes aromatiques','Fruits secs','Crèmerie','Épicerie','Paniers','Autres'];
const UNITES = ['kg','pièce','barquette','botte','colis','cagette','sachet','filet','lot','panier','litre','forfait','unité'].map(u => [u,u]);
const STATUTS = {brouillon:'Brouillon', envoyee:'Envoyée', payee:'Payée'};
const MENTIONS_DEFAUT = "En cas de retard de paiement, des pénalités de retard sont exigibles au taux de trois fois le taux d'intérêt légal, ainsi qu'une indemnité forfaitaire pour frais de recouvrement de 40 €. Pas d'escompte pour paiement anticipé.";

let toastTimer;
function toast(msg){ const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 3200); }
function errMsg(e){
  const c = e && e.code;
  if (c === 'quota_exceeded') return 'Espace de stockage plein : supprimez des éléments inutiles.';
  if (c === 'resource_exhausted') return 'Trop d\u2019opérations d\u2019un coup, réessayez dans un instant.';
  if (c === 'invalid_argument') return 'Enregistrement refusé : vous n\u2019avez peut-être pas le droit de modifier ces données.';
  return 'Enregistrement impossible pour le moment, réessayez.';
}

/* ---------- Stockage ---------- */
const COLS = ['clients','fournisseurs','produits','factures'];
const S = {company:{}, clients:[], fournisseurs:[], produits:[], factures:[], ready:false, mode:'local'};
let db = null;
const LS = 'facturation-v1';

function loadLocal(){
  try { const d = JSON.parse(localStorage.getItem(LS) || 'null');
    if (d) { S.company = d.company || {}; COLS.forEach(c => S[c] = d[c] || []); } } catch(e) {}
}
function saveLocal(){
  try { localStorage.setItem(LS, JSON.stringify({company:S.company, clients:S.clients, fournisseurs:S.fournisseurs, produits:S.produits, factures:S.factures})); }
  catch(e) { toast('Enregistrement local impossible (stockage du navigateur plein ou désactivé).'); }
}
async function put(col, obj){
  const data = clone(obj);
  const arr = S[col]; const i = arr.findIndex(x => x.id === data.id);
  if (i >= 0) arr[i] = data; else arr.push(data);
  if (db) { try { await db.collection(col).doc(data.id).set(data); } catch(e){ toast(errMsg(e)); throw e; } }
  else saveLocal();
  updateCounts();
}
async function remove(col, id){
  S[col] = S[col].filter(x => x.id !== id);
  if (db) { try { await db.collection(col).doc(id).delete(); } catch(e){ toast(errMsg(e)); } }
  else saveLocal();
  updateCounts();
}
async function putCompany(obj){
  S.company = clone(obj);
  if (db) { try { await db.doc('settings/company').set(S.company); } catch(e){ toast(errMsg(e)); throw e; } }
  else saveLocal();
  updateCounts();
}

async function init(){
  window.addEventListener('hashchange', () => { route(); window.scrollTo(0, 0); });
  route();
  let got = null;
  if (window.claude && typeof window.claude.use === 'function') { try { got = await window.claude.use('db'); } catch(e) { got = null; } }
  if (got) {
    db = got; S.mode = 'cloud';
    let pending = COLS.length + 1;
    const first = () => { if (!S.ready && --pending <= 0) S.ready = true; refresh(); };
    COLS.forEach(c => {
      let isFirst = true;
      db.collection(c).onSnapshot(snap => {
        S[c] = snap.docs.map(d => ({...d.data(), id:d.id}));
        if (isFirst) { isFirst = false; first(); } else refresh();
      }, e => { toast(errMsg(e)); if (isFirst) { isFirst = false; first(); } });
    });
    let isFirstC = true;
    db.doc('settings/company').onSnapshot(s => {
      S.company = s.exists ? {...s.data()} : {};
      if (isFirstC) { isFirstC = false; first(); } else refresh();
    }, e => { toast(errMsg(e)); if (isFirstC) { isFirstC = false; first(); } });
  } else {
    loadLocal(); S.mode = 'local'; S.ready = true; refresh();
  }
}

/* ---------- Calculs ---------- */
function isNonTva(f){ return !!((f && f.companySnap) ? f.companySnap.tvaNonApplicable : S.company.tvaNonApplicable); }
function lineHT(l){ return r2(num(l.qte) * num(l.pu) * (1 - num(l.remise) / 100)); }
function calc(f, nonTva = isNonTva(f)){
  let ht = 0; const by = {};
  (f.lignes || []).forEach(l => { const h = lineHT(l); ht += h; const t = nonTva ? 0 : num(l.tva); if (t > 0) by[t] = (by[t] || 0) + h; });
  const tvas = Object.entries(by).map(([t, base]) => ({taux:+t, base:r2(base), montant:r2(base * t / 100)})).sort((a,b) => b.taux - a.taux);
  const tva = r2(tvas.reduce((s, x) => s + x.montant, 0));
  return {ht:r2(ht), tvas, tva, ttc:r2(ht + tva), nonTva};
}
function statusOf(f){
  if (f.statut === 'envoyee' && f.echeance && f.echeance < today()) return 'retard';
  return f.statut || 'brouillon';
}
function pill(f){ const s = statusOf(f); return `<span class="pill ${s}">${s === 'retard' ? 'En retard' : STATUTS[s]}</span>`; }
function nextNumero(dateIso){
  const year = (dateIso || today()).slice(0, 4);
  const prefix = (S.company.prefixe || 'FAC-') + year + '-';
  let max = 0;
  S.factures.forEach(f => { if ((f.numero || '').startsWith(prefix)) { const n = parseInt(f.numero.slice(prefix.length), 10); if (n > max) max = n; } });
  return prefix + String(max + 1).padStart(4, '0');
}
const clientName = id => (S.clients.find(c => c.id === id) || {}).nom;

/* ---------- Routage ---------- */
let viewKind = 'loading', renderedReady = false, filtre = 'all', draft = null, dirty = false;

function updateCounts(){
  COLS.forEach(c => { const el = $('#n-' + c); if (el) el.textContent = S.ready && S[c].length ? S[c].length : ''; });
  $('#store-info').textContent = !S.ready ? '' : S.mode === 'cloud'
    ? 'Données enregistrées avec cette page, retrouvées à chaque ouverture.'
    : 'Données enregistrées dans ce navigateur, sur cet appareil. Pensez à exporter une sauvegarde régulièrement.';
}
function refresh(){
  updateCounts();
  if (!S.ready) return;
  if (viewKind === 'form' && renderedReady) return; // ne pas écraser une saisie en cours
  route();
}
function route(){
  const h = location.hash.replace(/^#\/?/, '') || 'factures';
  const [v, id] = h.split('/');
  document.querySelectorAll('#nav a').forEach(a => a.classList.toggle('on', a.dataset.v === v || (v === 'facture' || v === 'apercu') && a.dataset.v === 'factures'));
  const m = $('#main');
  renderedReady = S.ready;
  if (!S.ready) { viewKind = 'loading'; m.innerHTML = '<p class="muted">Chargement…</p>'; return; }
  switch (v) {
    case 'factures': viewKind = 'list'; m.innerHTML = vFactures(); break;
    case 'facture': viewKind = 'form'; m.innerHTML = vEdit(id); break;
    case 'apercu': viewKind = 'list'; m.innerHTML = vApercu(id); break;
    case 'clients': case 'fournisseurs': case 'produits': viewKind = 'list'; m.innerHTML = vEntity(v); break;
    case 'entreprise': viewKind = 'form'; m.innerHTML = vEntreprise(); break;
    case 'tarifs': viewKind = 'list'; m.innerHTML = vTarifs(); break;
    default: location.hash = '#/factures';
  }
}

/* ---------- Vue : liste des factures ---------- */
function vFactures(){
  const all = [...S.factures].sort((a,b) => (b.date || '').localeCompare(a.date || '') || (b.numero || '').localeCompare(a.numero || ''));
  const year = today().slice(0, 4);
  let aEnc = 0, retard = 0, enc = 0;
  all.forEach(f => { const t = calc(f).ttc, s = statusOf(f);
    if (s === 'envoyee' || s === 'retard') aEnc += t;
    if (s === 'retard') retard += t;
    if (s === 'payee' && (f.date || '').startsWith(year)) enc += t; });
  const list = all.filter(f => filtre === 'all' || statusOf(f) === filtre || (filtre === 'envoyee' && statusOf(f) === 'retard'));
  const chips = [['all','Toutes'],['brouillon','Brouillons'],['envoyee','Envoyées'],['retard','En retard'],['payee','Payées']]
    .map(([k,l]) => `<button class="chip${filtre === k ? ' on' : ''}" data-act="filtre" data-k="${k}">${l}</button>`).join('');
  let lastExp = null; try { lastExp = localStorage.getItem(LS + '-export'); } catch(e) {}
  const needBackup = S.mode === 'local' && all.length && (!lastExp || (new Date(today()) - new Date(lastExp)) / 864e5 > 14);
  const backup = needBackup ? `<div class="banner"><span>${lastExp ? 'Dernière sauvegarde le ' + fmtDate(lastExp) + '.' : 'Aucune sauvegarde de vos données pour l’instant.'} Vos factures ne sont stockées que sur cet appareil.</span><button class="btn sm" data-act="export">Exporter une sauvegarde</button></div>` : '';
  const banner = backup + (!S.company.nom ? `<div class="banner"><span>Renseignez d’abord les informations de votre entreprise : elles apparaîtront sur chaque facture.</span><a class="btn sm" href="#/entreprise">Compléter mon entreprise</a></div>` : '');
  const rows = list.map(f => `<tr class="click" data-href="#/facture/${f.id}">
      <td><b>${esc(f.numero)}</b></td>
      <td>${esc((f.clientSnap && f.clientSnap.nom) || clientName(f.clientId) || '—')}${f.objet ? `<div class="muted" style="font-size:13px">${esc(f.objet)}</div>` : ''}</td>
      <td>${fmtDate(f.date)}</td><td>${fmtDate(f.echeance)}</td>
      <td class="r"><b>${eur(calc(f).ttc)}</b></td><td>${pill(f)}</td></tr>`).join('');
  return `${banner}
  <div class="head"><h1>Factures</h1><a class="btn primary" href="#/facture/new">Nouvelle facture</a></div>
  ${all.length ? `<div class="summary"><span>À encaisser<b>${eur(aEnc)}</b></span><span class="late">Dont en retard<b>${eur(retard)}</b></span><span>Encaissé en ${year}<b>${eur(enc)}</b></span></div>` : ''}
  ${all.length ? `<div class="row" style="margin-bottom:14px"><div class="chips">${chips}</div></div>` : ''}
  <div class="tbl-wrap"><div class="scroll">
  ${list.length ? `<table class="tbl"><thead><tr><th>Numéro</th><th>Client</th><th>Date</th><th>Échéance</th><th class="r">Total TTC</th><th>Statut</th></tr></thead><tbody>${rows}</tbody></table>`
    : `<div class="empty"><p>${all.length ? 'Aucune facture dans cette catégorie.' : 'Aucune facture pour l’instant.'}</p>${all.length ? '' : '<a class="btn primary" href="#/facture/new">Créer la première facture</a>'}</div>`}
  </div></div>`;
}

/* ---------- Vue : éditeur de facture ---------- */
function newFacture(){
  const c = S.company, d = today();
  return {id:uid(), numero:nextNumero(d), date:d, echeance:addDays(d, c.delai === undefined || c.delai === '' ? 30 : num(c.delai)),
    clientId:'', objet:'', lignes:[], notes:c.notesDefaut || '', conditions:c.conditions || '', statut:'brouillon'};
}
function clientOptions(sel){
  return '<option value="">Choisir un client…</option>' + [...S.clients].sort((a,b) => (a.nom||'').localeCompare(b.nom||''))
    .map(c => `<option value="${c.id}"${c.id === sel ? ' selected' : ''}>${esc(c.nom)}</option>`).join('');
}
function productOptions(){
  return '<option value="">Ajouter un produit du catalogue…</option>' + [...S.produits].sort((a,b) => (a.designation||'').localeCompare(b.designation||''))
    .map(p => `<option value="${p.id}">${esc((p.ref ? p.ref + ' · ' : '') + p.designation)} (${eur(p.pu)} HT)</option>`).join('');
}
function opts(list, sel){ return list.map(([v,l]) => `<option value="${esc(v)}"${String(v) === String(sel) ? ' selected' : ''}>${esc(l)}</option>`).join(''); }
function lineRow(l, i, nonTva){
  return `<tr data-i="${i}">
    <td><textarea data-k="designation" rows="2" placeholder="Désignation (2e ligne = détail)">${esc(l.designation)}</textarea></td>
    <td style="width:80px"><input data-k="qte" inputmode="decimal" value="${esc(l.qte)}"></td>
    <td style="width:100px"><select data-k="unite">${opts(UNITES, l.unite)}</select></td>
    <td style="width:110px"><input data-k="pu" inputmode="decimal" value="${esc(l.pu)}"></td>
    <td style="width:80px"><input data-k="remise" inputmode="decimal" value="${esc(l.remise || '')}" placeholder="0"></td>
    ${nonTva ? '' : `<td style="width:92px"><select data-k="tva">${opts(TVAS, l.tva)}</select></td>`}
    <td class="lt" style="width:110px">${eur(lineHT(l))}</td>
    <td style="width:40px"><button type="button" class="icon-btn" data-act="rmline" aria-label="Supprimer la ligne">×</button></td></tr>`;
}
function linesHTML(){
  const nonTva = !!S.company.tvaNonApplicable;
  if (!draft.lignes.length) return `<div class="empty" style="padding:24px"><p>Ajoutez une ligne libre ou un produit de votre catalogue.</p></div>`;
  return `<div class="scroll"><table class="tbl lines"><thead><tr><th>Désignation</th><th>Qté</th><th>Unité</th><th>PU HT (€)</th><th>Remise %</th>${nonTva ? '' : '<th>TVA</th>'}<th class="r">Total HT</th><th></th></tr></thead>
    <tbody>${draft.lignes.map((l,i) => lineRow(l, i, nonTva)).join('')}</tbody></table></div>`;
}
function totalsHTML(){
  const t = calc(draft, !!S.company.tvaNonApplicable);
  return `<div><span>Total HT</span><b>${eur(t.ht)}</b></div>
    ${t.nonTva ? '<div><span>TVA non applicable</span><b>—</b></div>' : t.tvas.map(x => `<div><span>TVA ${pct(x.taux)}</span><b>${eur(x.montant)}</b></div>`).join('')}
    <div class="ttc"><span>Total TTC</span><span>${eur(t.ttc)}</span></div>`;
}
function vEdit(id){
  if (id === 'new') draft = newFacture();
  else { const f = S.factures.find(x => x.id === id);
    if (!f) return `<div class="empty"><p>Cette facture n’existe pas ou a été supprimée.</p><a class="btn" href="#/factures">Retour aux factures</a></div>`;
    draft = clone(f); }
  dirty = false;
  const isNew = !S.factures.some(x => x.id === draft.id);
  return `<div class="row" style="margin-bottom:10px"><a href="#/factures" class="muted" style="text-decoration:none">Retour aux factures</a></div>
  <div class="head"><h1>${isNew ? 'Nouvelle facture' : 'Facture ' + esc(draft.numero)}</h1>
    <div class="row"><span class="dirty" id="dirty"></span>
      ${isNew ? '' : '<button class="btn" data-act="dup">Dupliquer</button><button class="btn danger" data-act="delfac">Supprimer</button>'}
      <button class="btn" data-act="preview">Aperçu et PDF</button>
      <button class="btn primary" data-act="savefac">Enregistrer</button></div></div>
  <section class="panel"><h2>Informations</h2>
    <div class="fields three">
      <div class="field"><label for="f-numero">Numéro</label><input id="f-numero" data-f="numero" value="${esc(draft.numero)}"></div>
      <div class="field"><label for="f-date">Date d’émission</label><input id="f-date" type="date" data-f="date" value="${esc(draft.date)}"></div>
      <div class="field"><label for="f-ech">Date d’échéance</label><input id="f-ech" type="date" data-f="echeance" value="${esc(draft.echeance)}"></div>
      <div class="field"><label for="f-client">Client</label>
        <div class="row" style="flex-wrap:nowrap"><select id="f-client" data-f="clientId">${clientOptions(draft.clientId)}</select>
        <button type="button" class="btn" data-act="newclient" title="Créer un client">Nouveau</button></div></div>
      <div class="field"><label for="f-objet">Objet (facultatif)</label><input id="f-objet" data-f="objet" value="${esc(draft.objet)}" placeholder="Ex. Travaux de rénovation cuisine"></div>
      <div class="field"><label for="f-statut">Statut</label><select id="f-statut" data-f="statut">${opts(Object.entries(STATUTS), draft.statut)}</select></div>
    </div></section>
  <section class="panel"><h2>Lignes</h2>
    <div id="lines">${linesHTML()}</div>
    <div class="lines-add"><select id="add-prod" aria-label="Ajouter un produit">${productOptions()}</select>
      <button type="button" class="btn" data-act="addline">Ajouter une ligne libre</button></div>
    <div class="totals" id="totals">${totalsHTML()}</div></section>
  <section class="panel"><h2>Paiement et notes</h2>
    <div class="fields">
      <div class="field"><label for="f-cond">Conditions de paiement</label><textarea id="f-cond" rows="3" data-f="conditions" placeholder="Ex. Paiement par virement à 30 jours">${esc(draft.conditions)}</textarea></div>
      <div class="field"><label for="f-notes">Note visible sur la facture</label><textarea id="f-notes" rows="3" data-f="notes">${esc(draft.notes)}</textarea></div>
    </div></section>`;
}
function markDirty(){ dirty = true; const d = $('#dirty'); if (d) d.textContent = 'Modifications non enregistrées'; }
function redrawLines(){ $('#lines').innerHTML = linesHTML(); $('#totals').innerHTML = totalsHTML(); }

async function saveDraft(){
  const numero = (draft.numero || '').trim();
  if (!numero) { toast('Indiquez un numéro de facture.'); return false; }
  if (S.factures.some(x => x.numero === numero && x.id !== draft.id)) { toast(`Le numéro ${numero} est déjà utilisé par une autre facture.`); return false; }
  const cl = S.clients.find(c => c.id === draft.clientId);
  const {logo, ...comp} = S.company;
  const f = {...draft, numero,
    lignes: draft.lignes.map(l => ({...l, qte:num(l.qte), pu:num(l.pu), remise:num(l.remise), tva:num(l.tva)})),
    clientSnap: draft.clientId ? (cl ? {...cl} : (draft.clientSnap || null)) : null,
    companySnap: comp, updatedAt: new Date().toISOString()};
  try { await put('factures', f); } catch(e) { return false; }
  draft = clone(f); dirty = false;
  const d = $('#dirty'); if (d) d.textContent = '';
  return true;
}

/* ---------- Vue : aperçu / PDF ---------- */
function sheetHTML(f){
  const c = {...(f.companySnap || S.company), logo:S.company.logo || LOGO, couleur:S.company.couleur || (f.companySnap || {}).couleur};
  const cl = f.clientSnap || S.clients.find(x => x.id === f.clientId) || {};
  const t = calc(f);
  const hasRemise = (f.lignes || []).some(l => num(l.remise));
  const accent = /^#[0-9a-f]{6}$/i.test(c.couleur || '') ? c.couleur : BRAND_COLOR;
  const lines = (f.lignes || []).map(l => {
    const [first, ...rest] = String(l.designation || '').split('\n');
    return `<tr><td>${esc(first)}${rest.join('\n').trim() ? `<div class="sh-sub">${esc(rest.join('\n').trim())}</div>` : ''}</td>
      <td class="r">${fmtN(l.qte)} ${esc(l.unite && l.unite !== 'unité' ? l.unite : '')}</td>
      <td class="r">${eur(num(l.pu))}</td>
      ${hasRemise ? `<td class="r">${num(l.remise) ? pct(num(l.remise)) : ''}</td>` : ''}
      ${t.nonTva ? '' : `<td class="r">${pct(num(l.tva))}</td>`}
      <td class="r">${eur(lineHT(l))}</td></tr>`; }).join('');
  const cityLine = o => esc([o.cp, o.ville].filter(Boolean).join(' '));
  const legal = [c.nom && (c.nom + (c.forme ? ' ' + c.forme : '')), c.capital && ('au capital de ' + c.capital + ' €'),
    c.siret && ('SIRET ' + c.siret), c.rcs && ('RCS ' + c.rcs), c.ape && ('APE ' + c.ape), c.tva && ('TVA ' + c.tva)].filter(Boolean).map(esc).join(' – ');
  const iban = c.iban ? `<p>IBAN : <b>${esc(c.iban)}</b>${c.bic ? ` – BIC : <b>${esc(c.bic)}</b>` : ''}${c.banque ? `<br>${esc(c.banque)}` : ''}</p>` : '';
  return `<div class="sheet" style="--sh-accent:${accent}">
    ${f.statut === 'payee' ? `<div class="stamp">Acquittée${f.datePaiement ? `<small>le ${fmtDate(f.datePaiement)}</small>` : ''}</div>` : ''}
    <header class="sh-head">
      <div class="sh-from">
        ${c.logo ? `<img class="sh-logo" src="${c.logo}" alt="">` : ''}
        <div class="sh-name">${esc(c.nom || 'VP Primeur')}</div>
        ${c.adresse ? `<p>${nl2br(c.adresse)}</p>` : ''}
        ${c.cp || c.ville ? `<p>${cityLine(c)}</p>` : ''}
        ${c.pays ? `<p>${esc(c.pays)}</p>` : ''}
        ${c.tel ? `<p>Tél. ${esc(c.tel)}</p>` : ''}
        ${c.email ? `<p>${esc(c.email)}</p>` : ''}
        ${c.web ? `<p>${esc(c.web)}</p>` : ''}
      </div>
      <div class="sh-title"><h1>Facture</h1>
        <table class="sh-meta"><tr><th>Numéro</th><td>${esc(f.numero)}</td></tr>
          <tr><th>Date</th><td>${fmtDate(f.date)}</td></tr>
          ${f.echeance ? `<tr><th>Échéance</th><td>${fmtDate(f.echeance)}</td></tr>` : ''}</table></div>
    </header>
    <section class="sh-parties"><div class="sh-to"><div class="sh-lbl">Facturé à</div>
      <div class="sh-name">${esc(cl.nom || '—')}</div>
      ${cl.contact ? `<p>${esc(cl.contact)}</p>` : ''}
      ${cl.adresse ? `<p>${nl2br(cl.adresse)}</p>` : ''}
      ${cl.cp || cl.ville ? `<p>${cityLine(cl)}</p>` : ''}
      ${cl.pays ? `<p>${esc(cl.pays)}</p>` : ''}
      ${cl.siret ? `<p>SIRET ${esc(cl.siret)}</p>` : ''}
      ${cl.tva ? `<p>TVA ${esc(cl.tva)}</p>` : ''}
    </div></section>
    ${f.objet ? `<p class="sh-obj"><b>Objet :</b> ${esc(f.objet)}</p>` : ''}
    <table class="sh-lines"><thead><tr><th>Désignation</th><th class="r">Quantité</th><th class="r">PU HT</th>${hasRemise ? '<th class="r">Remise</th>' : ''}${t.nonTva ? '' : '<th class="r">TVA</th>'}<th class="r">Total HT</th></tr></thead>
      <tbody>${lines || `<tr><td colspan="6" style="color:#888">Aucune ligne</td></tr>`}</tbody></table>
    <div class="sh-bottom">
      <div class="sh-pay">
        ${f.conditions ? `<p>${nl2br(f.conditions)}</p>` : ''}
        ${f.echeance ? `<p>À régler au plus tard le <b>${fmtDate(f.echeance)}</b></p>` : ''}
        ${iban}
      </div>
      <table class="sh-totals">
        <tr><td>Total HT</td><td>${eur(t.ht)}</td></tr>
        ${t.nonTva ? '' : t.tvas.map(x => `<tr><td>TVA ${pct(x.taux)} sur ${eur(x.base)}</td><td>${eur(x.montant)}</td></tr>`).join('')}
        <tr class="ttc"><td>${t.nonTva ? 'Net à payer' : 'Total TTC'}</td><td>${eur(t.ttc)}</td></tr>
      </table>
    </div>
    ${t.nonTva ? '<p class="sh-note">TVA non applicable, art. 293 B du CGI.</p>' : ''}
    ${f.notes ? `<p class="sh-note">${nl2br(f.notes)}</p>` : ''}
    <div class="sh-spacer"></div>
    <footer class="sh-foot"><p>${nl2br(c.mentions || MENTIONS_DEFAUT)}</p>${legal ? `<p>${legal}</p>` : ''}</footer>
  </div>`;
}
function vApercu(id){
  const f = S.factures.find(x => x.id === id);
  if (!f) return `<div class="empty"><p>Cette facture n’existe pas ou a été supprimée.</p><a class="btn" href="#/factures">Retour aux factures</a></div>`;
  const cl = f.clientSnap || {};
  return `<div class="preview-bar">
    <div class="head" style="margin-bottom:10px"><h1>Facture ${esc(f.numero)}</h1>
      <div class="row"><select id="ap-statut" aria-label="Statut" style="width:auto">${opts(Object.entries(STATUTS), f.statut)}</select></div></div>
    <div class="row">
      <a class="btn" href="#/facture/${f.id}">Modifier</a>
      <button class="btn" data-act="print">Imprimer</button>
      <button class="btn primary" data-act="pdf" data-id="${f.id}">Télécharger le PDF</button>
      <button class="btn" data-act="mail" data-id="${f.id}">Envoyer par e-mail</button>
    </div></div>
  <p class="hint">Pour l’envoi : téléchargez le PDF, puis cliquez sur « Envoyer par e-mail » et joignez le fichier au message préparé${cl.email ? ` pour ${esc(cl.email)}` : ''}.</p>
  <div class="paper-wrap">${sheetHTML(f)}</div>`;
}

async function downloadPDF(id, btn){
  const f = S.factures.find(x => x.id === id);
  if (!f) return;
  const name = ((f.numero || 'facture') + ((f.clientSnap && f.clientSnap.nom) ? ' - ' + f.clientSnap.nom : '')).replace(/[\\/:*?"<>|]/g, '-') + '.pdf';
  return sheetToPDF(name, btn);
}
async function sheetToPDF(name, btn){
  const el = $('#main .sheet'); if (!el) return;
  if (typeof html2pdf === 'undefined') { toast('Le module PDF n’a pas pu se charger : utilisez Imprimer puis « Enregistrer au format PDF ».'); return; }
  const label = btn.textContent; btn.disabled = true; btn.textContent = 'Préparation du PDF…';
  try {
    const shadow = el.style.boxShadow; el.style.boxShadow = 'none';
    const blob = await html2pdf().set({
      margin:0, filename:name, image:{type:'jpeg', quality:0.97},
      html2canvas:{scale:2, useCORS:true, backgroundColor:'#ffffff', scrollX:0, scrollY:0},
      jsPDF:{unit:'mm', format:'a4', orientation:'portrait'},
      pagebreak:{mode:['css','legacy'], avoid:['tr','.sh-bottom','.sh-foot']}
    }).from(el).outputPdf('blob');
    el.style.boxShadow = shadow;
    let dl = null;
    if (window.claude && typeof window.claude.use === 'function') { try { dl = await window.claude.use('downloads'); } catch(e) {} }
    if (dl) {
      try { await dl.save({filename:name, data:blob}); toast('PDF enregistré : ' + name); }
      catch(e) { if (e && e.code !== 'declined') toast('Téléchargement impossible ici : utilisez Imprimer puis « Enregistrer au format PDF ».'); }
    } else {
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    }
  } catch(e) { toast('La génération du PDF a échoué : utilisez Imprimer puis « Enregistrer au format PDF ».'); }
  finally { btn.disabled = false; btn.textContent = label; }
}
function printSheet(){
  const el = $('#main .sheet'); if (!el) return;
  $('#print-root').innerHTML = el.outerHTML;
  try { window.print(); } catch(e) { toast('L’impression est bloquée ici : utilisez « Télécharger le PDF ».'); }
}
async function mailFacture(id){
  const f = S.factures.find(x => x.id === id); if (!f) return;
  const cl = f.clientSnap || {}, c = S.company, t = calc(f);
  const subject = `Facture ${f.numero}` + (c.nom ? ` – ${c.nom}` : '');
  const body = `Bonjour${cl.contact ? ' ' + cl.contact : ''},\n\nVeuillez trouver ci-joint la facture ${f.numero} d'un montant de ${eur(t.ttc)}${t.nonTva ? '' : ' TTC'}` +
    (f.echeance ? `, à régler au plus tard le ${fmtDate(f.echeance)}` : '') + `.\n\nNous restons à votre disposition pour toute question.\n\nCordialement,\n${c.nom || ''}`;
  const to = String(cl.email || '').replace(/[\s<>"]/g, '');
  const a = document.createElement('a');
  a.href = `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  a.target = '_blank'; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove();
  if (f.statut === 'brouillon') { const g = clone(f); g.statut = 'envoyee'; try { await put('factures', g); toast('Facture marquée comme envoyée.'); route(); } catch(e) {} }
}

/* ---------- Vue : liste des prix (affichage boutique / clients pros) ---------- */
let tarifMode = 'ttc';
function tarifHTML(){
  const c = S.company, nonTva = !!c.tvaNonApplicable;
  const accent = /^#[0-9a-f]{6}$/i.test(c.couleur || '') ? c.couleur : BRAND_COLOR;
  const groups = {};
  S.produits.forEach(p => { const k = p.categorie || 'Autres'; (groups[k] = groups[k] || []).push(p); });
  const order = [...CATEGORIES, ...Object.keys(groups).filter(k => !CATEGORIES.includes(k))].filter(k => groups[k]);
  const price = p => tarifMode === 'ht' || nonTva ? num(p.pu) : r2(num(p.pu) * (1 + num(p.tva) / 100));
  const body = order.map(k => `<div class="tarif-cat">${esc(k)}</div><table class="tarif"><tbody>${
    groups[k].sort((a,b) => (a.designation||'').localeCompare(b.designation||'')).map(p => `<tr>
      <td><b>${esc(p.designation)}</b>${p.description ? ` <span class="o">${esc(p.description)}</span>` : ''}</td>
      <td class="o">${p.origine ? 'Origine : ' + esc(p.origine) : ''}</td>
      <td class="p">${eur(price(p))} <span class="u">/ ${esc(p.unite || 'kg')}</span></td></tr>`).join('')}</tbody></table>`).join('');
  return `<div class="sheet" style="--sh-accent:${accent}">
    <div class="tarif-head"><img src="${c.logo || LOGO}" alt="">
      <div><h1>Nos prix</h1><p>Au ${new Date().toLocaleDateString('fr-FR')} · Prix ${tarifMode === 'ht' || nonTva ? 'HT' : 'TTC'}</p></div></div>
    ${body}
    <div class="sh-spacer"></div>
    <footer class="sh-foot"><p>${esc([c.nom || 'VP Primeur', c.adresse && c.adresse.replace(/\n/g, ', '), [c.cp, c.ville].filter(Boolean).join(' '), c.tel && 'Tél. ' + c.tel].filter(Boolean).join(' – '))}</p></footer>
  </div>`;
}
function vTarifs(){
  if (!S.produits.length) return `<div class="head"><h1>Liste des prix</h1></div><div class="tbl-wrap"><div class="empty"><p>Ajoutez des produits pour générer votre liste des prix.</p><a class="btn primary" href="#/produits">Ajouter des produits</a></div></div>`;
  return `<div class="preview-bar"><div class="head" style="margin-bottom:10px"><h1>Liste des prix</h1>
      <div class="chips">${S.company.tvaNonApplicable ? '' : [['ttc','Prix TTC (particuliers)'],['ht','Prix HT (professionnels)']].map(([k,l]) => `<button class="chip${tarifMode === k ? ' on' : ''}" data-act="tarifmode" data-k="${k}">${l}</button>`).join('')}</div></div>
    <div class="row"><button class="btn" data-act="print">Imprimer</button><button class="btn primary" data-act="pdftarif">Télécharger le PDF</button></div></div>
  <p class="hint">Classée par catégorie, avec l’origine des produits. À afficher en boutique ou à envoyer à vos clients professionnels.</p>
  <div class="paper-wrap">${tarifHTML()}</div>`;
}

/* ---------- Bases : clients, fournisseurs, produits ---------- */
const PERSON_FIELDS = [
  ['nom','Nom ou raison sociale',{req:1, wide:1}], ['contact','Personne à contacter'],
  ['email','E-mail',{type:'email'}], ['tel','Téléphone'],
  ['adresse','Adresse',{area:1, wide:1}], ['cp','Code postal'], ['ville','Ville'], ['pays','Pays'],
  ['siret','SIRET'], ['tva','N° TVA intracommunautaire']];
const ENT = {
  clients:{titre:'Clients', nouveau:'Nouveau client', edit:'Modifier le client', vide:'Aucun client enregistré.',
    fields:PERSON_FIELDS,
    cols:[['Nom', x => `<b>${esc(x.nom)}</b>${x.contact ? `<div class="muted" style="font-size:13px">${esc(x.contact)}</div>` : ''}`],
          ['Ville', x => esc(x.ville)], ['E-mail', x => esc(x.email)], ['Téléphone', x => esc(x.tel)],
          ['Factures', x => String(S.factures.filter(f => f.clientId === x.id).length), 'r']]},
  fournisseurs:{titre:'Fournisseurs', nouveau:'Nouveau fournisseur', edit:'Modifier le fournisseur', vide:'Aucun fournisseur enregistré : ajoutez vos grossistes et producteurs.',
    fields:[...PERSON_FIELDS, ['notes','Notes (conditions, délais…)',{area:1, wide:1}]],
    cols:[['Nom', x => `<b>${esc(x.nom)}</b>`], ['Contact', x => esc(x.contact)], ['E-mail', x => esc(x.email)], ['Téléphone', x => esc(x.tel)],
          ['Produits', x => String(S.produits.filter(p => p.fournisseurId === x.id).length), 'r']]},
  produits:{titre:'Produits', nouveau:'Nouveau produit', edit:'Modifier le produit', vide:'Aucun produit dans le catalogue : ajoutez vos fruits et légumes.',
    fields:[['designation','Désignation',{req:1, wide:1, ph:'Ex. Tomates cœur de bœuf'}], ['categorie','Catégorie',{options:CATEGORIES.map(c => [c,c]), def:() => 'Fruits'}],
      ['origine','Origine',{ph:'Ex. France, Espagne, Maroc…'}], ['ref','Référence ou code'], ['unite','Unité de vente',{options:UNITES, def:() => 'kg'}],
      ['description','Détail (variété, calibre, catégorie…)',{area:1, wide:1, rows:2}],
      ['pu','Prix de vente HT (€)',{type:'number'}], ['tva','TVA',{options:TVAS, def:TVA_DEF}],
      ['fournisseurId','Fournisseur',{options:() => [['','Aucun'], ...S.fournisseurs.map(f => [f.id, f.nom])]}],
      ['achat','Prix d’achat HT (€)',{type:'number'}]],
    cols:[['Désignation', x => `<b>${esc(x.designation)}</b>${x.origine ? `<div class="muted" style="font-size:13px">${esc(x.origine)}</div>` : ''}`],
          ['Catégorie', x => esc(x.categorie)], ['Unité', x => esc(x.unite)],
          ['Fournisseur', x => esc((S.fournisseurs.find(f => f.id === x.fournisseurId) || {}).nom)],
          ['Prix HT', x => eur(x.pu), 'r'], ['TVA', x => pct(num(x.tva)), 'r'],
          ['Marge', x => num(x.achat) ? eur(num(x.pu) - num(x.achat)) : '', 'r']]}
};
const sortKey = (col, x) => (col === 'produits' ? (x.categorie || '') + ' ' + x.designation : x.nom) || '';
function vEntity(col){
  const e = ENT[col];
  const list = [...S[col]].sort((a,b) => sortKey(col,a).localeCompare(sortKey(col,b)));
  const rows = list.map(x => `<tr class="click" data-edit="${col}" data-id="${x.id}" data-search="${esc(Object.values(x).join(' ').toLowerCase())}">
      ${e.cols.map(([,fn,cls]) => `<td class="${cls || ''}">${fn(x) || ''}</td>`).join('')}</tr>`).join('');
  return `<div class="head"><h1>${e.titre}</h1><div class="row">
      ${list.length ? `<input class="search" id="search" placeholder="Rechercher…" aria-label="Rechercher">` : ''}
      <button class="btn primary" data-act="newent" data-col="${col}">${e.nouveau}</button></div></div>
    <div class="tbl-wrap"><div class="scroll">${list.length
      ? `<table class="tbl"><thead><tr>${e.cols.map(([l,,cls]) => `<th class="${cls || ''}">${l}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>`
      : `<div class="empty"><p>${e.vide}</p><button class="btn primary" data-act="newent" data-col="${col}">${e.nouveau}</button></div>`}</div></div>`;
}
function fieldHTML(key, label, o = {}, val, pre = 'e'){
  const id = pre + '-' + key; const v = val ?? '';
  let ctl;
  if (o.area) ctl = `<textarea id="${id}" name="${key}" rows="${o.rows || 3}"${o.ph ? ` placeholder="${esc(o.ph)}"` : ''}>${esc(v)}</textarea>`;
  else if (o.options) ctl = `<select id="${id}" name="${key}">${opts(typeof o.options === 'function' ? o.options() : o.options, v)}</select>`;
  else if (o.check) return `<div class="field${o.wide ? ' wide' : ''}"><label class="check"><input type="checkbox" id="${id}" name="${key}"${v ? ' checked' : ''}>${esc(label)}</label>${o.help ? `<small>${esc(o.help)}</small>` : ''}</div>`;
  else ctl = `<input id="${id}" name="${key}" type="${o.type || 'text'}" value="${esc(v)}"${o.type === 'number' ? ' step="0.01" inputmode="decimal"' : ''}${o.ph ? ` placeholder="${esc(o.ph)}"` : ''}>`;
  return `<div class="field${o.wide ? ' wide' : ''}"><label for="${id}">${esc(label)}${o.req ? ' *' : ''}</label>${ctl}${o.help ? `<small>${esc(o.help)}</small>` : ''}</div>`;
}

let dlgCtx = null;
function openEntity(col, id, onSaved){
  const e = ENT[col]; const item = id ? S[col].find(x => x.id === id) : null;
  dlgCtx = {col, id:item ? item.id : null, onSaved};
  $('#dlg-title').textContent = item ? e.edit : e.nouveau;
  $('#dlg-fields').innerHTML = e.fields.map(([k,l,o]) => fieldHTML(k, l, o, item ? item[k] : (o && o.def ? o.def() : ''))).join('');
  const del = $('#dlg-del'); del.style.display = item ? '' : 'none'; del.classList.remove('armed'); del.textContent = 'Supprimer';
  $('#dlg').showModal();
  const first = $('#dlg-fields input, #dlg-fields textarea'); if (first) first.focus();
}
$('#dlg-form').addEventListener('submit', async ev => {
  ev.preventDefault();
  const {col, id, onSaved} = dlgCtx; const e = ENT[col]; const form = ev.target;
  const obj = id ? clone(S[col].find(x => x.id === id) || {id}) : {id:uid()};
  for (const [k,, o = {}] of e.fields) {
    const el = form.elements[k]; if (!el) continue;
    obj[k] = (o.type === 'number' || k === 'tva') ? num(el.value) : el.value.trim();
    if (o.req && !obj[k]) { toast('Le champ « ' + e.fields.find(f => f[0] === k)[1] + ' » est obligatoire.'); el.focus(); return; }
  }
  try { await put(col, obj); } catch(err) { return; }
  $('#dlg').close();
  toast('Enregistré.');
  if (onSaved) onSaved(obj); else route();
});
$('#dlg-cancel').addEventListener('click', () => $('#dlg').close());
$('#dlg-del').addEventListener('click', async ev => {
  const b = ev.currentTarget;
  if (!b.classList.contains('armed')) { b.classList.add('armed'); b.textContent = 'Confirmer la suppression'; return; }
  await remove(dlgCtx.col, dlgCtx.id); $('#dlg').close(); toast('Supprimé.'); route();
});

/* ---------- Vue : entreprise ---------- */
let pendingLogo;
const COMPANY_SECTIONS = [
  ['Identité', [['nom','Nom ou raison sociale',{req:1, wide:1}], ['forme','Forme juridique',{ph:'SARL, SAS, EI, micro-entreprise…'}], ['capital','Capital social (€)'],
    ['siret','SIRET'], ['rcs','RCS / RM',{ph:'Ex. RCS Chartres 123 456 789'}], ['ape','Code APE'], ['tva','N° TVA intracommunautaire']]],
  ['Coordonnées', [['adresse','Adresse',{area:1, wide:1, rows:2}], ['cp','Code postal'], ['ville','Ville'], ['pays','Pays'],
    ['tel','Téléphone'], ['email','E-mail',{type:'email'}], ['web','Site web']]],
  ['Paiement', [['iban','IBAN'], ['bic','BIC'], ['banque','Banque'], ['delai','Délai de paiement par défaut (jours)',{type:'number', ph:'30'}],
    ['conditions','Conditions de paiement par défaut',{area:1, wide:1, rows:2, ph:'Ex. Paiement par virement à 30 jours à réception de facture.'}]]],
  ['Facturation', [['prefixe','Préfixe des numéros',{ph:'FAC-', help:'Numérotation : préfixe + année + numéro, ex. FAC-2026-0001.'}],
    ['tvaDefaut','Taux de TVA par défaut',{options:TVAS, help:'5,5 % pour les fruits et légumes frais.'}],
    ['tvaNonApplicable','TVA non applicable (franchise en base, art. 293 B du CGI)',{check:1, wide:1, help:'Pour les micro-entreprises : les factures sont émises sans TVA avec la mention légale.'}],
    ['mentions','Mentions légales en pied de facture',{area:1, wide:1, rows:3, ph:MENTIONS_DEFAUT}],
    ['notesDefaut','Note par défaut sur les nouvelles factures',{area:1, wide:1, rows:2}]]]
];
function vEntreprise(){
  const c = S.company; pendingLogo = c.logo;
  return `<div class="head"><h1>Mon entreprise</h1><button class="btn primary" form="comp-form" type="submit">Enregistrer</button></div>
  <form id="comp-form" novalidate>
    <section class="panel"><h2>Logo et couleur</h2>
      <div class="row" style="gap:18px;align-items:flex-start">
        <div id="logo-prev" style="min-width:120px">${logoPreview(c.logo || LOGO)}</div>
        <div class="field" style="gap:8px">
          <label for="logo-file">Remplacer le logo (PNG, JPG ou SVG)</label>
          <input type="file" id="logo-file" accept="image/*">
          <button type="button" class="btn sm" data-act="rmlogo" style="align-self:flex-start">Revenir au logo VP Primeur</button>
        </div>
        <div class="field"><label for="c-couleur">Couleur des factures</label><input type="color" id="c-couleur" name="couleur" value="${esc(c.couleur || BRAND_COLOR)}"></div>
      </div></section>
    ${COMPANY_SECTIONS.map(([t, fs]) => `<section class="panel"><h2>${t}</h2><div class="fields">${fs.map(([k,l,o]) => fieldHTML(k, l, o, k === 'tvaDefaut' ? (c[k] ?? 5.5) : (k === 'nom' && !c.nom ? 'VP Primeur' : c[k]), 'c')).join('')}</div></section>`).join('')}
    <section class="panel"><h2>Sauvegarde</h2>
      <p class="muted" style="margin:0 0 12px">Exportez toutes vos données (entreprise, clients, fournisseurs, produits, factures) dans un fichier JSON à conserver.</p>
      <div class="row"><button type="button" class="btn" data-act="export">Exporter mes données</button>
      <label class="btn" for="import-file" style="cursor:pointer">Restaurer une sauvegarde</label>
      <input type="file" id="import-file" accept="application/json,.json" style="position:absolute;width:1px;height:1px;opacity:0"></div>
      <p class="muted" id="import-msg" style="margin:10px 0 0;font-size:13.5px">La restauration remplace toutes les données actuelles par celles du fichier. Utile pour passer sur un autre ordinateur.</p></section>
    <div class="row"><span class="sp"></span><button class="btn primary" type="submit">Enregistrer</button></div>
  </form>`;
}
function logoPreview(src){ return src ? `<img src="${src}" alt="Logo" style="max-width:180px;max-height:110px;display:block;background:#fff;padding:6px;border:1px solid var(--line);border-radius:6px">` : '<span class="muted" style="font-size:13px">Aucun logo</span>'; }
function readLogo(file){
  return new Promise((res, rej) => {
    const img = new Image(); const url = URL.createObjectURL(file);
    img.onload = () => {
      const max = 420, s = Math.min(1, max / Math.max(img.width || max, img.height || max));
      const cv = document.createElement('canvas'); cv.width = Math.max(1, Math.round((img.width || max) * s)); cv.height = Math.max(1, Math.round((img.height || max / 3) * s));
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      let d = cv.toDataURL('image/png');
      if (d.length > 170000) d = cv.toDataURL('image/webp', 0.85);
      URL.revokeObjectURL(url);
      if (d.length > 200000) rej(new Error('big')); else res(d);
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('bad')); };
    img.src = url;
  });
}
async function saveCompany(form){
  const c = {...S.company};
  COMPANY_SECTIONS.forEach(([, fs]) => fs.forEach(([k,, o = {}]) => {
    const el = form.elements[k]; if (!el) return;
    c[k] = o.check ? el.checked : (k === 'tvaDefaut' ? num(el.value) : el.value.trim());
  }));
  c.couleur = form.elements.couleur.value;
  if (pendingLogo) c.logo = pendingLogo; else delete c.logo;
  if (!c.nom) { toast('Indiquez au moins le nom de votre entreprise.'); form.elements.nom.focus(); return; }
  try { await putCompany(c); toast('Informations de l’entreprise enregistrées.'); } catch(e) {}
}
async function exportData(){
  const data = JSON.stringify({exporte_le:new Date().toISOString(), entreprise:S.company, clients:S.clients, fournisseurs:S.fournisseurs, produits:S.produits, factures:S.factures}, null, 2);
  const name = 'vp-primeur-sauvegarde-' + today() + '.json';
  try { localStorage.setItem(LS + '-export', today()); } catch(e) {}
  let dl = null;
  if (window.claude && typeof window.claude.use === 'function') { try { dl = await window.claude.use('downloads'); } catch(e) {} }
  if (dl) { try { await dl.save({filename:name, data}); toast('Sauvegarde exportée.'); } catch(e) { if (e && e.code !== 'declined') toast('Export impossible ici.'); } }
  else { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([data], {type:'application/json'})); a.download = name; document.body.appendChild(a); a.click(); a.remove(); }
}

let importPending = null;
async function importData(file){
  let d;
  try { d = JSON.parse(await file.text()); } catch(e) { toast('Ce fichier n’est pas une sauvegarde valide.'); return; }
  if (!d || typeof d !== 'object' || !Array.isArray(d.factures) || !Array.isArray(d.clients)) { toast('Ce fichier n’est pas une sauvegarde VP Primeur.'); return; }
  importPending = d;
  const m = $('#import-msg');
  m.innerHTML = `Sauvegarde du ${esc(fmtDate((d.exporte_le || '').slice(0,10)) || '?')} : ${d.factures.length} factures, ${d.clients.length} clients, ${(d.produits||[]).length} produits. <button type="button" class="btn sm danger armed" data-act="doimport">Remplacer mes données actuelles</button>`;
}
function doImport(){
  const d = importPending; if (!d) return;
  S.company = d.entreprise || {}; S.clients = d.clients || []; S.fournisseurs = d.fournisseurs || []; S.produits = d.produits || []; S.factures = d.factures || [];
  saveLocal(); importPending = null; updateCounts(); toast('Sauvegarde restaurée.'); location.hash = '#/factures'; route();
}

/* ---------- Événements ---------- */
const main = $('#main');
function onField(ev){
  const t = ev.target;
  if (viewKind === 'form' && draft && $('#lines')) {
    if (t.dataset.f) {
      const k = t.dataset.f; draft[k] = t.value;
      if (k === 'date') { const dl = S.company.delai === undefined || S.company.delai === '' ? 30 : num(S.company.delai); draft.echeance = addDays(t.value, dl); $('#f-ech').value = draft.echeance; }
      if (k === 'statut' && t.value === 'payee' && !draft.datePaiement) draft.datePaiement = today();
      if (k === 'statut' && t.value !== 'payee') delete draft.datePaiement;
      markDirty(); return;
    }
    if (t.dataset.k) {
      const tr = t.closest('tr'); const i = +tr.dataset.i;
      draft.lignes[i][t.dataset.k] = t.value;
      tr.querySelector('.lt').textContent = eur(lineHT(draft.lignes[i]));
      $('#totals').innerHTML = totalsHTML(); markDirty(); return;
    }
  }
}
main.addEventListener('input', onField);
main.addEventListener('change', async ev => {
  const t = ev.target;
  if (t.id === 'add-prod' && t.value) {
    const p = S.produits.find(x => x.id === t.value); t.value = '';
    if (p) { draft.lignes.push({designation:p.designation + (p.description ? '\n' + p.description : '') + (p.origine ? '\nOrigine : ' + p.origine : ''), qte:1, unite:p.unite || 'kg', pu:p.pu ?? 0, remise:'', tva:p.tva ?? TVA_DEF(), produitId:p.id}); redrawLines(); markDirty(); }
    return;
  }
  if (t.id === 'ap-statut') {
    const id = (location.hash.split('/')[2] || ''); const f = S.factures.find(x => x.id === id); if (!f) return;
    const g = clone(f); g.statut = t.value; if (t.value === 'payee') g.datePaiement = g.datePaiement || today(); else delete g.datePaiement;
    try { await put('factures', g); toast('Statut mis à jour : ' + STATUTS[t.value] + '.'); route(); } catch(e) {}
    return;
  }
  if (t.id === 'import-file' && t.files && t.files[0]) { importData(t.files[0]); t.value = ''; return; }
  if (t.id === 'logo-file' && t.files && t.files[0]) {
    try { pendingLogo = await readLogo(t.files[0]); $('#logo-prev').innerHTML = logoPreview(pendingLogo); toast('Logo prêt : enregistrez pour l’appliquer.'); }
    catch(e) { toast(e.message === 'big' ? 'Ce logo est trop lourd : utilisez une image plus simple ou plus petite.' : 'Impossible de lire cette image.'); }
    t.value = '';
  }
  onField(ev);
});
main.addEventListener('submit', ev => { if (ev.target.id === 'comp-form') { ev.preventDefault(); saveCompany(ev.target); } });
main.addEventListener('keyup', ev => {
  if (ev.target.id !== 'search') return;
  const q = ev.target.value.trim().toLowerCase();
  main.querySelectorAll('tbody tr[data-search]').forEach(tr => tr.hidden = q && !tr.dataset.search.includes(q));
});
main.addEventListener('click', async ev => {
  const t = ev.target.closest('[data-act], tr[data-href], tr[data-edit]');
  if (!t) return;
  if (t.matches('tr[data-href]')) { location.hash = t.dataset.href; return; }
  if (t.matches('tr[data-edit]')) { openEntity(t.dataset.edit, t.dataset.id); return; }
  const a = t.dataset.act;
  if (a === 'filtre') { filtre = t.dataset.k; route(); }
  else if (a === 'newent') openEntity(t.dataset.col);
  else if (a === 'addline') { draft.lignes.push({designation:'', qte:1, unite:'kg', pu:'', remise:'', tva:TVA_DEF()}); redrawLines(); markDirty();
    const tas = main.querySelectorAll('#lines textarea'); if (tas.length) tas[tas.length - 1].focus(); }
  else if (a === 'rmline') { draft.lignes.splice(+t.closest('tr').dataset.i, 1); redrawLines(); markDirty(); }
  else if (a === 'newclient') openEntity('clients', null, c => { draft.clientId = c.id; $('#f-client').innerHTML = clientOptions(c.id); markDirty(); });
  else if (a === 'savefac') {
    const wasNew = location.hash.endsWith('/new');
    if (await saveDraft()) { toast('Facture ' + draft.numero + ' enregistrée.'); if (wasNew) location.hash = '#/facture/' + draft.id; }
  }
  else if (a === 'preview') { if (await saveDraft()) location.hash = '#/apercu/' + draft.id; }
  else if (a === 'dup') {
    const d = today(); const n = clone(draft);
    Object.assign(n, {id:uid(), numero:nextNumero(d), date:d, echeance:addDays(d, S.company.delai === undefined || S.company.delai === '' ? 30 : num(S.company.delai)), statut:'brouillon'});
    delete n.datePaiement;
    try { await put('factures', n); toast('Facture dupliquée : ' + n.numero + '.'); location.hash = '#/facture/' + n.id; } catch(e) {}
  }
  else if (a === 'delfac') {
    if (!t.classList.contains('armed')) { t.classList.add('armed'); t.textContent = 'Confirmer la suppression'; return; }
    await remove('factures', draft.id); toast('Facture supprimée.'); location.hash = '#/factures';
  }
  else if (a === 'print') printSheet();
  else if (a === 'pdf') downloadPDF(t.dataset.id, t);
  else if (a === 'mail') mailFacture(t.dataset.id);
  else if (a === 'rmlogo') { pendingLogo = null; $('#logo-prev').innerHTML = logoPreview(LOGO); }
  else if (a === 'export') exportData();
  else if (a === 'doimport') doImport();
  else if (a === 'tarifmode') { tarifMode = t.dataset.k; route(); }
  else if (a === 'pdftarif') sheetToPDF('Liste des prix VP Primeur ' + today() + '.pdf', t);
});

$('#brand-logo').src = LOGO;
init();
