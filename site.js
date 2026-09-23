(function () {
  const I = (typeof INFOS !== 'undefined' && INFOS) || {};
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const has = v => typeof v === 'string' && v.trim() !== '';

  /* ---------- Menu mobile ---------- */
  const btn = $('.menu-btn'), menu = $('#menu');
  btn.addEventListener('click', () => {
    const open = menu.classList.toggle('open');
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  $$('#menu a').forEach(a => a.addEventListener('click', () => { menu.classList.remove('open'); btn.setAttribute('aria-expanded', 'false'); }));

  /* ---------- Informations pratiques ---------- */
  const villeComplete = [I.codePostal, I.ville].filter(has).join(' ');
  const values = { histoire: I.histoire, producteurs: I.producteurs, adresse: I.adresse, villeComplete };
  $$('[data-info]').forEach(el => {
    const v = values[el.dataset.info];
    if (has(v)) el.textContent = v; else el.hidden = true;
  });

  const telHref = has(I.telephone) ? 'tel:' + I.telephone.replace(/[^\d+]/g, '') : null;
  $$('[data-tel]').forEach(a => {
    if (telHref) { a.href = telHref; if (!a.classList.contains('pill-btn')) { a.textContent = I.telephone; a.hidden = false; } }
    // sans numéro, le bouton « Nous appeler » renvoie vers la section Nous trouver
  });
  $$('[data-mail]').forEach(a => {
    if (has(I.email)) { a.href = 'mailto:' + I.email; a.textContent = I.email; a.hidden = false; }
  });

  // Bandeau
  const bandItems = [];
  if (has(I.horairesResume)) bandItems.push(document.createTextNode(I.horairesResume));
  if (has(I.adresse) || has(villeComplete)) bandItems.push(document.createTextNode([I.adresse, I.ville].filter(has).join(', ')));
  if (telHref) { const a = document.createElement('a'); a.href = telHref; a.textContent = I.telephone; bandItems.push(a); }
  if (bandItems.length) {
    const band = $('#band');
    bandItems.forEach(n => { const s = document.createElement('span'); s.appendChild(n); band.appendChild(s); });
    band.hidden = false;
  }

  // Horaires
  const jours = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
  const h = I.horaires || {};
  if (jours.some(j => has(h[j]))) {
    const tb = $('#hours tbody');
    const todayIdx = (new Date().getDay() + 6) % 7;
    jours.forEach((j, i) => {
      const tr = document.createElement('tr');
      if (i === todayIdx) tr.className = 'today';
      const a = document.createElement('td'); a.textContent = j.charAt(0).toUpperCase() + j.slice(1) + (i === todayIdx ? ' (aujourd’hui)' : '');
      const b = document.createElement('td'); b.textContent = has(h[j]) ? h[j] : '—';
      tr.append(a, b); tb.appendChild(tr);
    });
    $('#hours').hidden = false;
  }
  if (!has(I.adresse) && !telHref && !jours.some(j => has(h[j]))) $('#no-info').hidden = false;

  // Carte
  const fullAddress = [I.adresse, villeComplete].filter(has).join(', ');
  if (has(I.adresse) && has(I.ville)) {
    const f = document.createElement('iframe');
    f.src = 'https://www.google.com/maps?q=' + encodeURIComponent('VP Primeur, ' + fullAddress) + '&output=embed';
    f.title = 'Plan d’accès à VP Primeur';
    f.loading = 'lazy';
    f.referrerPolicy = 'no-referrer-when-downgrade';
    const m = $('#map'); m.textContent = ''; m.appendChild(f);
  } else $('#map').hidden = true;

  // Photo
  if (has(I.photo)) {
    const img = document.createElement('img');
    img.src = I.photo; img.alt = 'Margot et Damien au magasin'; img.className = 'photo';
    const box = $('#nous-media'); box.textContent = ''; box.appendChild(img);
  }

  /* ---------- Saisons ---------- */
  const SAISONS = {
    printemps: { label: 'Printemps', fruits: ['Fraises', 'Rhubarbe', 'Cerises', 'Kiwis', 'Pamplemousses'],
      legumes: ['Asperges', 'Radis', 'Petits pois', 'Artichauts', 'Épinards', 'Fèves', 'Carottes nouvelles', 'Oignons nouveaux'] },
    ete: { label: 'Été', fruits: ['Pêches', 'Abricots', 'Melons', 'Pastèques', 'Framboises', 'Myrtilles', 'Nectarines', 'Prunes'],
      legumes: ['Tomates', 'Courgettes', 'Aubergines', 'Poivrons', 'Haricots verts', 'Concombres', 'Maïs', 'Fenouil'] },
    automne: { label: 'Automne', fruits: ['Pommes', 'Poires', 'Raisins', 'Figues', 'Coings', 'Châtaignes', 'Noix', 'Mûres'],
      legumes: ['Potirons', 'Butternuts', 'Champignons', 'Choux', 'Brocolis', 'Panais', 'Betteraves', 'Céleri'] },
    hiver: { label: 'Hiver', fruits: ['Clémentines', 'Oranges', 'Kiwis', 'Pommes', 'Poires', 'Citrons', 'Pamplemousses'],
      legumes: ['Poireaux', 'Endives', 'Carottes', 'Choux de Bruxelles', 'Mâche', 'Topinambours', 'Navets', 'Céleri-rave'] }
  };
  const month = new Date().getMonth(); // 0 = janvier
  let current = month >= 2 && month <= 4 ? 'printemps' : month >= 5 && month <= 7 ? 'ete' : month >= 8 && month <= 10 ? 'automne' : 'hiver';
  const tabs = $('#tabs');
  function fill(ul, list) { ul.textContent = ''; list.forEach(x => { const li = document.createElement('li'); li.textContent = x; ul.appendChild(li); }); }
  function renderSeason() {
    $$('button', tabs).forEach(b => b.setAttribute('aria-pressed', b.dataset.k === current ? 'true' : 'false'));
    fill($('#fruits'), SAISONS[current].fruits);
    fill($('#legumes'), SAISONS[current].legumes);
  }
  Object.keys(SAISONS).forEach(k => {
    const b = document.createElement('button');
    b.type = 'button'; b.dataset.k = k; b.textContent = SAISONS[k].label;
    b.addEventListener('click', () => { current = k; renderSeason(); });
    tabs.appendChild(b);
  });
  renderSeason();

  /* ---------- Formulaire professionnels ---------- */
  const form = $('#pro-form'), err = $('#form-err');
  form.addEventListener('submit', e => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(form).entries());
    if (!d.etablissement.trim() || !d.nom.trim()) { err.textContent = 'Indiquez le nom de l’établissement et votre nom.'; return; }
    if (!d.email.trim() && !d.telephone.trim()) { err.textContent = 'Laissez un e-mail ou un téléphone pour qu’on puisse vous répondre.'; return; }
    if (!has(I.email)) { err.textContent = telHref ? 'Pour le moment, appelez-nous au ' + I.telephone + '.' : 'Le formulaire sera bientôt disponible. Passez nous voir au magasin !'; return; }
    err.textContent = '';
    const body = `Bonjour Margot et Damien,\n\nJe souhaite recevoir votre liste de prix professionnels.\n\nÉtablissement : ${d.etablissement}\nNom : ${d.nom}\nE-mail : ${d.email || '—'}\nTéléphone : ${d.telephone || '—'}\n\nNos besoins :\n${d.message || '—'}\n`;
    window.location.href = 'mailto:' + I.email + '?subject=' + encodeURIComponent('Demande de tarifs pro – ' + d.etablissement) + '&body=' + encodeURIComponent(body);
    form.hidden = true; $('#form-done').hidden = false;
  });
  $('#form-again').addEventListener('click', () => { form.reset(); form.hidden = false; $('#form-done').hidden = true; });

  /* ---------- Pied de page et mentions légales ---------- */
  $('#year').textContent = new Date().getFullYear();
  const legal = $('#legal');
  const p = html => { const el = document.createElement('p'); el.innerHTML = html; legal.appendChild(el); };
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  p('<b>Éditeur du site</b><br>' + [I.raisonSociale || 'VP Primeur', I.formeJuridique, fullAddress, has(I.siret) ? 'SIRET ' + I.siret : '', I.telephone, I.email].filter(has).map(esc).join('<br>'));
  if (has(I.responsable)) p('<b>Directeur de la publication</b><br>' + esc(I.responsable));
  p('<b>Hébergement</b><br>GitHub, Inc. – 88 Colin P. Kelly Jr. Street, San Francisco, CA 94107, États-Unis – github.com');
  p('<b>Données personnelles</b><br>Ce site ne dépose aucun cookie de suivi et ne collecte aucune donnée : le formulaire professionnel prépare simplement un e-mail dans votre propre messagerie. La carte d’accès est fournie par Google Maps.');
})();
