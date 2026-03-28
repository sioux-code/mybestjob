'use strict';
const cheerio = require('cheerio');

const PROVINS_INSEE = '77379';
const RAYON_KM = 40;

// ── Scoring Asperger ──────────────────────────────────────────────────────────

const POSITIF = [
  /\binformatique\b/i, /\bdéveloppeur\b/i, /\bprogramm\w+\b/i,
  /\bsystème\b/i, /\bréseaux?\b/i, /\bdata\b/i, /\banalys\w+\b/i,
  /\bstatistique\b/i, /\bcomptabl\w+\b/i, /\bcomptabilité\b/i,
  /\badministratif\b/i, /\bsecrétariat\b/i, /\bsaisie\b/i,
  /\barchiv\w+\b/i, /\bgestion\b/i, /\bfactur\w+\b/i,
  /\bpaye\b/i, /\bpaie\b/i, /\btechnicien\b/i, /\bmaintenan\w+\b/i,
  /\bélectricien\b/i, /\bmécanicien\b/i, /\bautomatis\w+\b/i,
  /\bqualité\b/i, /\bcontrôle\b/i, /\blaboratoire\b/i,
  /\blogistique\b/i, /\bstock\w+\b/i, /\bmagasinier\b/i,
  /\binventaire\b/i, /\bpréparat\w+\b/i, /\bautonome\b/i,
  /\brigu\w+\b/i, /\bpréci\w+\b/i, /\bméthodi\w+\b/i,
  /\bradio\w+\b/i, /\bpharmac\w+\b/i, /\bbiolog\w+\b/i,
];

const NEGATIF = [
  /\baccueil\b/i, /\bréception\b/i, /\bcommercial\b/i,
  /\bvente\b/i, /\bclient\w*\b/i, /\banimation\b/i,
  /\bmanager\b/i, /\bmanagement\b/i, /\bencadrement\b/i,
  /\bcommunication\b/i, /\bnégoci\w+\b/i, /\bpolyvalent\b/i,
  /\btélé\w*vendeur\b/i, /\btéléconseiller\b/i,
];

function scoreAsperger(texte) {
  let score = 5;
  for (const p of POSITIF) if (p.test(texte)) score++;
  for (const p of NEGATIF) if (p.test(texte)) score--;
  return Math.max(0, Math.min(10, score));
}

// ── France Travail ────────────────────────────────────────────────────────────

async function getFTToken() {
  const res = await fetch(
    'https://entreprise.francetravail.fr/connexion/oauth2/access_token?realm=%2Fpartenaire',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type:    'client_credentials',
        client_id:     process.env.FT_CLIENT_ID,
        client_secret: process.env.FT_CLIENT_SECRET,
        scope:         'api_offresdemploiv2 o2dsoffre',
      }),
    }
  );
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Token FT ${res.status}: ${txt.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.access_token;
}

async function fetchFTAvecParams(token, params, isTHQuery = false) {
  const res = await fetch(
    `https://api.francetravail.io/partenaire/offresdemploi/v2/offres/search?${params}`,
    { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }
  );
  if (!res.ok) throw new Error(`FT API ${res.status}`);
  const data = await res.json();
  return (data.resultats || []).map(item => ({
    source:  'France Travail',
    titre:   item.intitule || '',
    lieu:    item.lieuTravail?.libelle || '',
    contrat: item.typeContratLibelle || '',
    date:    item.dateCreation?.slice(0, 10) || '',
    url:     item.origineOffre?.urlOrigine ||
             `https://candidat.francetravail.fr/offres/recherche/detail/${item.id}`,
    score:   scoreAsperger(`${item.intitule} ${item.description || ''}`),
    id:      item.id,
    th:      isTHQuery || item.accessibleTH === true,
  }));
}

async function fetchFranceTravail() {
  const token = await getFTToken();

  // Requête 1 : toutes offres dans le rayon
  const p1 = new URLSearchParams({
    commune:  PROVINS_INSEE,
    distance: RAYON_KM,
    range:    '0-149',
    sort:     '1',
  });

  // Requête 2 : offres spécifiques TH (accessibleTH) — rayon élargi
  const p2 = new URLSearchParams({
    commune:      PROVINS_INSEE,
    distance:     70,
    range:        '0-99',
    sort:         '1',
    accessibleTH: 'true',
  });

  const [r1, r2] = await Promise.all([
    fetchFTAvecParams(token, p1, false),
    fetchFTAvecParams(token, p2, true),
  ]);

  // Tag r1 offers also present in TH results
  const thIds = new Set(r2.map(o => o.id));
  const r1Tagged = r1.map(o => ({ ...o, th: o.th || thIds.has(o.id) }));

  // Add TH-only offers not in r1
  const r1Ids = new Set(r1.map(o => o.id));
  const r2unique = r2.filter(o => !r1Ids.has(o.id));

  return [...r1Tagged, ...r2unique];
}


// ── Softy.pro scraping ────────────────────────────────────────────────────────

const SOFTY_SOURCES = [
  { nom: 'CH Provins', url: 'https://ch-provins.softy.pro/offres' },
];

async function fetchSofty({ nom, url }) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MyJob77/1.0)' },
  });
  if (!res.ok) throw new Error(`Softy ${res.status}`);
  const html = await res.text();
  const $ = cheerio.load(html);
  const offres = [];
  const seen = new Set();
  const base = url.replace('/offres', '');
  const CONTRATS = ['CDI', 'CDD', 'Intérim', 'Alternance', 'Stage', 'Vacataire'];

  $('a[href*="/offre/"]').each((_, el) => {
    const href = $(el).attr('href') || '';
    if (!href || seen.has(href)) return;
    seen.add(href);
    const texte = $(el).text().replace(/\s+/g, ' ').trim();
    const dateM  = texte.match(/(\d{2}\/\d{2}\/\d{4})/);
    offres.push({
      source:  nom,
      titre:   texte.slice(0, 120),
      lieu:    'Provins',
      contrat: CONTRATS.find(c => texte.includes(c)) || '',
      date:    dateM ? dateM[1] : '',
      th:      false,
      url:     base + href,
      score:   scoreAsperger(texte),
    });
  });
  return offres;
}

// ── Handler ───────────────────────────────────────────────────────────────────

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');

  const results = await Promise.allSettled([
    fetchFranceTravail(),
    ...SOFTY_SOURCES.map(s => fetchSofty(s)),
  ]);

  const offres = [];
  const errors = [];

  for (const r of results) {
    if (r.status === 'fulfilled') offres.push(...r.value);
    else errors.push(r.reason?.message || 'Erreur inconnue');
  }

  offres.sort((a, b) => b.score - a.score);

  res.status(200).json({ offres, errors, total: offres.length });
};
