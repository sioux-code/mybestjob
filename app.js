'use strict';

// ── Constantes ────────────────────────────────────────────────────────────────
const CLE_CACHE   = 'mybestjob-offres-v2';
const CLE_DATE    = 'mybestjob-date';

let toutesOffres  = [];
let scoreMin      = 8;
let filtreContrat = '';
let filtreSource  = '';
let filtreTH      = false;
let filtreProfil  = false;
let userLat       = null;
let userLng       = null;
let filtreDistance = 50; // km
let deferredInstall = null;

// ── Suppression service worker (source de problèmes de cache) ─────────────────
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(regs => {
    regs.forEach(r => r.unregister());
  });
}

// ── Installer en PWA ──────────────────────────────────────────────────────────
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredInstall = e;
  document.getElementById('install-btn').hidden = false;
});

document.getElementById('install-btn').addEventListener('click', async () => {
  if (!deferredInstall) return;
  deferredInstall.prompt();
  const { outcome } = await deferredInstall.userChoice;
  if (outcome === 'accepted') document.getElementById('install-btn').hidden = true;
  deferredInstall = null;
});

// ── Filtres — compatibilité ────────────────────────────────────────────────────
document.querySelectorAll('[data-filter="score"]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('[data-filter="score"]').forEach(b => {
      b.classList.remove('active');
      b.setAttribute('aria-checked', 'false');
    });
    btn.classList.add('active');
    btn.setAttribute('aria-checked', 'true');
    scoreMin = parseInt(btn.dataset.score, 10);
    afficher();
  });
});

// ── Filtres — contrat ──────────────────────────────────────────────────────────
document.getElementById('filtre-contrat').addEventListener('change', e => {
  filtreContrat = e.target.value;
  afficher();
});

// ── Filtres — source ───────────────────────────────────────────────────────────
document.getElementById('filtre-source').addEventListener('change', e => {
  filtreSource = e.target.value;
  afficher();
});

// ── Filtres — profil perso ────────────────────────────────────────────────────
document.getElementById('filtre-profil').addEventListener('change', e => {
  filtreProfil = e.target.checked;
  e.target.setAttribute('aria-checked', String(e.target.checked));
  afficher();
});

// ── Filtres — TH ──────────────────────────────────────────────────────────────
document.getElementById('filtre-th').addEventListener('change', e => {
  filtreTH = e.target.checked;
  e.target.setAttribute('aria-checked', String(e.target.checked));
  afficher();
});

// ── Géolocalisation ───────────────────────────────────────────────────────────
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 +
            Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

document.getElementById('btn-geo').addEventListener('click', () => {
  const btn   = document.getElementById('btn-geo');
  const label = document.getElementById('geo-label');

  if (!navigator.geolocation) {
    label.textContent = 'Non supporté';
    return;
  }

  label.textContent = 'Localisation…';
  btn.disabled = true;

  navigator.geolocation.getCurrentPosition(
    pos => {
      userLat = pos.coords.latitude;
      userLng = pos.coords.longitude;
      label.textContent = 'Position détectée';
      btn.disabled = false;
      btn.classList.add('btn-geo--active');
      document.getElementById('geo-slider-wrap').hidden = false;
      afficher();
    },
    () => {
      label.textContent = 'Accès refusé';
      btn.disabled = false;
    }
  );
});

document.getElementById('filtre-distance').addEventListener('input', e => {
  filtreDistance = parseInt(e.target.value, 10);
  document.getElementById('distance-val').textContent = `${filtreDistance} km`;
  e.target.setAttribute('aria-valuetext', `${filtreDistance} km`);
  afficher();
});

// ── Profils d'accessibilité ───────────────────────────────────────────────────
document.querySelectorAll('.pill--profile').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.pill--profile').forEach(b => {
      b.classList.remove('active');
      b.setAttribute('aria-checked', 'false');
    });
    btn.classList.add('active');
    btn.setAttribute('aria-checked', 'true');

    const profil = btn.dataset.profil;
    document.documentElement.classList.remove('profil-autisme', 'profil-malvoyant', 'profil-dyslexie');
    if (profil !== 'standard') {
      document.documentElement.classList.add(`profil-${profil}`);
    }
  });
});

// ── Actualiser ────────────────────────────────────────────────────────────────
document.getElementById('btn-actualiser').addEventListener('click', () => {
  chargerOffres(true);
});

// ── Score profil (sans bac, 50 ans, femme) ────────────────────────────────────
const NIVEAUX_OK   = ['', 'Aucune formation scolaire', 'CAP, BEP et équivalents'];
const NIVEAUX_BAC  = ['Bac ou équivalent'];
const NIVEAUX_SUP  = ['Bac+2 ou équivalents', 'Bac+3, Bac+4 ou équivalents'];

// Mots-clés valorisés pour profil senior/femme sans diplôme
const PROFIL_POSITIF = [
  /expérience|expérimenté/i, /senior/i, /autonome/i,
  /sans diplôme|sans qualification/i, /débutant accepté/i,
  /aide.soignant/i, /auxiliaire/i, /agent de service/i,
  /nettoyage|ménage|entretien/i, /lingerie/i,
  /caissier|caissière/i, /vendeur|vendeuse/i,
  /préparatrice|préparateur/i, /assistante|assistant/i,
  /secrétaire/i, /agent administratif/i,
  /aide.cuisine|plonge/i, /agent.*restauration/i,
];

const PROFIL_NEGATIF = [
  /bac\+[23456]/i, /master|doctorat|ingénieur/i,
  /cadre supérieur/i, /directeur/i, /chef de projet/i,
  /jeune diplômé/i, /junior/i, /permis (b|c|d|e) obligatoire/i,
];

function scoreProfilPerso(o) {
  const texte = `${o.titre} ${o.niveauFormation || ''} ${o.experience || ''} ${o.qualification || ''}`;
  let s = 5;

  // Niveau de formation
  if (NIVEAUX_OK.includes(o.niveauFormation))  s += 2;
  if (NIVEAUX_BAC.includes(o.niveauFormation)) s += 0;
  if (NIVEAUX_SUP.includes(o.niveauFormation)) s -= 3;

  // Expérience : débutant = bon signe
  if (/débutant accepté/i.test(o.experience || '')) s += 1;

  // Mots-clés positifs / négatifs
  for (const p of PROFIL_POSITIF) if (p.test(texte)) s++;
  for (const p of PROFIL_NEGATIF) if (p.test(texte)) s--;

  return Math.max(0, Math.min(10, s));
}

// ── Score → métadonnées visuelles ─────────────────────────────────────────────
function niveauScore(score) {
  if (score >= 8) return 'haut';
  if (score >= 6) return 'mid';
  if (score >= 4) return 'low';
  return 'non';
}

function badgeScore(score) {
  if (score >= 8) return { cls: 'badge-haut', texte: 'Très compatible' };
  if (score >= 6) return { cls: 'badge-mid',  texte: 'Compatible'      };
  if (score >= 4) return { cls: 'badge-low',  texte: 'Neutre'          };
  return            { cls: 'badge-non',  texte: 'Peu compatible'  };
}

// ── Echappement HTML ───────────────────────────────────────────────────────────
function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Rendu ──────────────────────────────────────────────────────────────────────
function afficher() {
  const liste    = document.getElementById('liste-offres');
  const vide     = document.getElementById('vide');
  const compteur = document.getElementById('compteur');

  let filtrées = toutesOffres.filter(o => o.score >= scoreMin);
  if (filtreContrat) filtrées = filtrées.filter(o => o.contrat.toLowerCase().includes(filtreContrat.toLowerCase()));
  if (filtreSource)  filtrées = filtrées.filter(o => o.source === filtreSource);
  if (filtreTH)      filtrées = filtrées.filter(o => o.th === true);
  if (filtreProfil)  filtrées = filtrées.filter(o => scoreProfilPerso(o) >= 7);
  if (userLat !== null) {
    filtrées = filtrées.filter(o => {
      if (o.lat == null || o.lng == null) return true; // garde si pas de coords
      return haversineKm(userLat, userLng, o.lat, o.lng) <= filtreDistance;
    });
  }

  const nb = filtrées.length;
  compteur.textContent = `${nb} offre${nb > 1 ? 's' : ''} affich\u00e9e${nb > 1 ? 's' : ''}`;

  if (nb === 0) {
    liste.innerHTML = '';
    vide.hidden = false;
    return;
  }
  vide.hidden = true;

  liste.innerHTML = filtrées.map(o => {
    const { cls, texte } = badgeScore(o.score);
    const niveau = niveauScore(o.score);
    const metaLieu    = o.lieu    ? `<span class="meta-tag">Lieu\u00a0: ${esc(o.lieu)}</span>`       : '';
    const metaContrat = o.contrat ? `<span class="meta-tag">Contrat\u00a0: ${esc(o.contrat)}</span>` : '';
    const metaDate    = o.date    ? `<span class="meta-tag">Date\u00a0: ${esc(o.date)}</span>`       : '';
    const metaTH      = o.th      ? `<span class="meta-tag meta-tag--th" title="Poste accessible aux travailleurs handicap\u00e9s">\u267F TH</span>` : '';
    const profil = scoreProfilPerso(o);
    const metaProfil  = profil >= 7
      ? `<span class="meta-tag meta-tag--profil" title="Accessible sans bac, exp\u00e9rience valoris\u00e9e">\u2665 Pour moi</span>`
      : profil <= 3
      ? `<span class="meta-tag meta-tag--hors-profil" title="Probablement hors profil (bac+ requis ou cadre)">\u26A0 Hors profil</span>`
      : '';
    const dist = (userLat !== null && o.lat != null && o.lng != null)
      ? Math.round(haversineKm(userLat, userLng, o.lat, o.lng))
      : null;
    const metaDist = dist !== null ? `<span class="meta-tag meta-tag--dist">\uD83D\uDCCD ${dist}\u00a0km</span>` : '';
    return `
      <li role="listitem">
        <a class="carte" href="${esc(o.url)}" target="_blank" rel="noopener noreferrer"
           data-niveau="${niveau}"
           aria-label="${esc(o.titre)} \u2014 ${texte}">
          <div class="carte-entete">
            <span class="carte-titre">${esc(o.titre)}</span>
            <span class="badge ${cls}" aria-hidden="true">${texte}</span>
          </div>
          <div class="carte-meta">${metaProfil}${metaDist}${metaLieu}${metaContrat}${metaDate}${metaTH}</div>
          <div class="carte-source">${esc(o.source)}</div>
        </a>
      </li>`;
  }).join('');
}

// ── Chargement des offres ──────────────────────────────────────────────────────
async function chargerOffres(forceRefresh = false) {
  const errDiv  = document.getElementById('erreurs');
  const majEl   = document.getElementById('derniere-maj');

  errDiv.hidden  = true;
  document.getElementById('liste-offres').innerHTML = '';
  document.getElementById('vide').hidden = true;

  // Cache sessionStorage (valide 5 min)
  if (!forceRefresh) {
    try {
      const cached = sessionStorage.getItem(CLE_CACHE);
      const cachedDate = sessionStorage.getItem(CLE_DATE);
      if (cached && cachedDate && Date.now() - Number(cachedDate) < 5 * 60_000) {
        toutesOffres = JSON.parse(cached);
        majEl.textContent = `Actualis\u00e9 il y a moins de 5 min`;
        afficher();
        return;
      }
    } catch {}
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const res = await fetch('/api/offres', { signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) throw new Error(`Erreur serveur ${res.status}`);
    const data = await res.json();

    toutesOffres = data.offres || [];
    sessionStorage.setItem(CLE_CACHE, JSON.stringify(toutesOffres));
    sessionStorage.setItem(CLE_DATE, String(Date.now()));

    const now = new Date();
    majEl.textContent = `Mis \u00e0 jour \u00e0 ${now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;

    if (data.errors?.length) {
      errDiv.hidden = false;
      errDiv.textContent = 'Avertissement\u00a0: ' + data.errors.join(' \u2014 ');
    }
  } catch (err) {
    const cached = sessionStorage.getItem(CLE_CACHE);
    if (cached) {
      try { toutesOffres = JSON.parse(cached); } catch {}
      majEl.textContent = '(donn\u00e9es en cache)';
    } else {
      errDiv.hidden = false;
      errDiv.textContent = err.name === 'AbortError'
        ? 'D\u00e9lai d\u00e9pass\u00e9 \u2014 r\u00e9essayez dans un instant.'
        : 'Impossible de charger les offres\u00a0: ' + err.message;
    }
  } finally {
    afficher();
  }
}

// ── Lancement ──────────────────────────────────────────────────────────────────
chargerOffres();
