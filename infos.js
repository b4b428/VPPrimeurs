/* =====================================================================
   VP PRIMEUR – INFORMATIONS DU SITE
   ---------------------------------------------------------------------
   C'est le SEUL fichier à modifier pour mettre à jour le site.
   - Écrivez entre les guillemets '…'.
   - Une information laissée vide ('') n'apparaît simplement pas sur le site.
   - Pour une apostrophe dans un texte, écrivez \'  (ex. 'd\'Espagne')
     ou utilisez l'apostrophe typographique ’ .
   Après modification : envoyez ce fichier sur GitHub, le site se met à
   jour en une à deux minutes (Ctrl+F5 pour recharger).
   ===================================================================== */

const INFOS = {

  // --- Coordonnées -----------------------------------------------------
  adresse:     '',            // ex. '12 place du Marché'
  codePostal:  '',            // ex. '28000'
  ville:       '',            // ex. 'Chartres'
  telephone:   '',            // ex. '02 37 00 00 00'
  email:       '',            // ex. 'contact@vp-primeur.fr'  (reçoit aussi les demandes des pros)

  // --- Horaires (laisser '' pour un jour non renseigné) -------------------
  horaires: {
    lundi:    '',             // ex. 'Fermé'
    mardi:    '',             // ex. '8h30 – 12h30 · 15h00 – 19h00'
    mercredi: '',
    jeudi:    '',
    vendredi: '',
    samedi:   '',
    dimanche: '',
  },
  horairesResume: '',         // bandeau du haut, ex. 'Du mardi au samedi, 8h30 – 19h'

  // --- Présentation ------------------------------------------------------
  histoire: 'Margot et Damien vous accueillent au magasin pour vous conseiller, vous faire goûter et vous aider à composer vos paniers de la semaine.',
  producteurs: '',            // ex. 'Nos pommes viennent du verger de … à … km.'
  photo: '',                  // ex. 'img/margot-damien.jpg' (déposez la photo dans le dossier img)

  // --- Mentions légales (obligatoires pour un site professionnel) -------
  raisonSociale: 'VP Primeur',
  formeJuridique: '',         // ex. 'SARL au capital de 5 000 €'
  siret:        '',
  responsable:  'Margot et Damien',   // directeur de la publication
};
