'use strict';

// ── Constantes ────────────────────────────────────────────────────────────────
const CLE_CACHE   = 'mybestjob-offres-v3';
const CLE_DATE    = 'mybestjob-date';
const CLE_PROFIL  = 'mybestjob-profil';

let toutesOffres   = [];
let scoreMin       = 8;
let filtreContrat  = '';
let filtreSource   = '';
let filtreTH       = false;
let filtreProfil   = false;
let userLat        = null;
let userLng        = null;
let filtreDistance = 50;
let deferredInstall = null;

// ── Profil utilisateur (persisté en localStorage) ─────────────────────────────
const PROFIL_DEFAUT = {
  formation:   'aucun',   // aucun | cap | bac | bac2 | bac3
  experience:  'confirme',
  age:         'tout',
  rqth:        false,
  seniorEmploi:false,
  permis:      false,
  motsCles:    '',        // ex: "comptabilité, saisie"
  exclus:      '',        // ex: "commercial, manager"
};

let monProfil = PROFIL_DEFAUT;

function chargerProfil() {
  try {
    const stored = localStorage.getItem(CLE_PROFIL);
    if (stored) monProfil = { ...PROFIL_DEFAUT, ...JSON.parse(stored) };
  } catch {}
}

function sauverProfil() {
  localStorage.setItem(CLE_PROFIL, JSON.stringify(monProfil));
}

function appliquerProfilAuFormulaire() {
  document.getElementById('p-formation').value  = monProfil.formation;
  document.getElementById('p-experience').value = monProfil.experience;
  document.getElementById('p-age').value        = monProfil.age;
  document.getElementById('p-rqth').checked     = monProfil.rqth;
  document.getElementById('p-senior-emploi').checked = monProfil.seniorEmploi;
  document.getElementById('p-permis').checked   = monProfil.permis;
  document.getElementById('p-mots').value       = monProfil.motsCles;
  document.getElementById('p-exclus').value     = monProfil.exclus;

  // Affiche un indicateur si profil configuré
  const label = document.getElementById('btn-profil-label');
  const configured = monProfil.formation !== 'aucun' || monProfil.motsCles || monProfil.exclus;
  label.textContent = configured ? 'Mon profil ✓' : 'Mon profil';
}

// ── Suppression service worker ─────────────────────────────────────────────────
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(regs => {
    regs.forEach(r => r.unregister());
  });
}

// ── Modal Mon profil ──────────────────────────────────────────────────────────
function ouvrirModal() {
  appliquerProfilAuFormulaire();
  document.getElementById('modal-profil').hidden = false;
  document.getElementById('modal-close').focus();
}

function fermerModal() {
  document.getElementById('modal-profil').hidden = true;
  document.getElementById('btn-mon-profil').focus();
}

document.getElementById('btn-mon-profil').addEventListener('click', ouvrirModal);
document.getElementById('modal-close').addEventListener('click', fermerModal);
document.getElementById('modal-overlay').addEventListener('click', fermerModal);

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !document.getElementById('modal-profil').hidden) fermerModal();
});

document.getElementById('btn-sauver-profil').addEventListener('click', () => {
  monProfil = {
    formation:    document.getElementById('p-formation').value,
    experience:   document.getElementById('p-experience').value,
    age:          document.getElementById('p-age').value,
    rqth:         document.getElementById('p-rqth').checked,
    seniorEmploi: document.getElementById('p-senior-emploi').checked,
    permis:       document.getElementById('p-permis').checked,
    motsCles:     document.getElementById('p-mots').value,
    exclus:       document.getElementById('p-exclus').value,
  };
  sauverProfil();
  appliquerProfilAuFormulaire();
  fermerModal();
  afficher();
});

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
      b.classList.remove('active'); b.setAttribute('aria-checked', 'false');
    });
    btn.classList.add('active'); btn.setAttribute('aria-checked', 'true');
    scoreMin = parseInt(btn.dataset.score, 10);
    afficher();
  });
});

document.getElementById('filtre-contrat').addEventListener('change', e => { filtreContrat = e.target.value; afficher(); });
document.getElementById('filtre-source').addEventListener('change',  e => { filtreSource  = e.target.value; afficher(); });

document.getElementById('filtre-profil').addEventListener('change', e => {
  filtreProfil = e.target.checked;
  e.target.setAttribute('aria-checked', String(e.target.checked));
  afficher();
});

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
  if (!navigator.geolocation) { label.textContent = 'Non supporté'; return; }
  label.textContent = 'Localisation…';
  btn.disabled = true;
  navigator.geolocation.getCurrentPosition(
    pos => {
      userLat = pos.coords.latitude; userLng = pos.coords.longitude;
      label.textContent = 'Position détectée';
      btn.disabled = false; btn.classList.add('btn-geo--active');
      document.getElementById('geo-slider-wrap').hidden = false;
      afficher();
    },
    () => { label.textContent = 'Accès refusé'; btn.disabled = false; }
  );
});

document.getElementById('filtre-distance').addEventListener('input', e => {
  filtreDistance = parseInt(e.target.value, 10);
  document.getElementById('distance-val').textContent = `${filtreDistance} km`;
  e.target.setAttribute('aria-valuetext', `${filtreDistance} km`);
  afficher();
});

// ── Profils d'accessibilité ───────────────────────────────────────────────────
const TOUS_PROFILS = ['autisme', 'tdah', 'malvoyant', 'dyslexie', 'daltonien', 'anxiete', 'motricite'];

document.querySelectorAll('.pill--profile').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.pill--profile').forEach(b => {
      b.classList.remove('active'); b.setAttribute('aria-checked', 'false');
    });
    btn.classList.add('active'); btn.setAttribute('aria-checked', 'true');

    const profil = btn.dataset.profil;
    document.documentElement.classList.remove(...TOUS_PROFILS.map(p => `profil-${p}`));
    if (profil !== 'standard') document.documentElement.classList.add(`profil-${profil}`);

    // Slider taille : visible uniquement pour malvoyant
    document.getElementById('ctrl-taille').hidden = profil !== 'malvoyant';

    // Malvoyant : appliquer taille par défaut
    if (profil === 'malvoyant') {
      const val = document.getElementById('slider-taille').value;
      document.documentElement.style.fontSize = val + 'px';
    } else {
      document.documentElement.style.fontSize = '';
    }
  });
});

// Slider taille texte (malvoyant)
document.getElementById('slider-taille').addEventListener('input', e => {
  const val = e.target.value;
  document.getElementById('taille-val').textContent = `${val} px`;
  e.target.setAttribute('aria-valuetext', `${val}px`);
  document.documentElement.style.fontSize = val + 'px';
});

document.getElementById('btn-actualiser').addEventListener('click', () => chargerOffres(true));

// ── Réinitialiser filtres ─────────────────────────────────────────────────────
document.getElementById('btn-reset-filtres').addEventListener('click', () => {
  // Compatibilité → Très compatible (score 8)
  scoreMin = 8;
  document.querySelectorAll('[data-filter="score"]').forEach(b => {
    const actif = b.dataset.score === '8';
    b.classList.toggle('active', actif);
    b.setAttribute('aria-checked', String(actif));
  });

  // Contrat / Source → Tous
  filtreContrat = '';
  filtreSource  = '';
  document.getElementById('filtre-contrat').value = '';
  document.getElementById('filtre-source').value  = '';

  // Toggles → off
  filtreTH = false;
  filtreProfil = false;
  const th = document.getElementById('filtre-th');
  th.checked = false; th.setAttribute('aria-checked', 'false');
  const prof = document.getElementById('filtre-profil');
  prof.checked = false; prof.setAttribute('aria-checked', 'false');

  afficher();
});

// ── Utilitaires ───────────────────────────────────────────────────────────────
function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ── Score profil dynamique ────────────────────────────────────────────────────
const FORMATION_NIVEAUX = {
  aucun: 0, cap: 1, bac: 2, bac2: 3, bac3: 4,
};

const NIVEAU_FT = {
  '':                              0,
  'Aucune formation scolaire':     0,
  'CAP, BEP et équivalents':       1,
  'Bac ou équivalent':             2,
  'Bac+2 ou équivalents':          3,
  'Bac+3, Bac+4 ou équivalents':   4,
};

function scoreProfilPerso(o) {
  const texte = `${o.titre} ${o.niveauFormation || ''} ${o.experience || ''} ${o.qualification || ''}`.toLowerCase();
  let s = 5;

  // Formation : l'offre demande-t-elle plus que ce que j'ai ?
  const niveauOffre = NIVEAU_FT[o.niveauFormation] ?? 0;
  const niveauMoi   = FORMATION_NIVEAUX[monProfil.formation] ?? 0;
  const ecart = niveauOffre - niveauMoi;
  if      (ecart <= 0) s += 2;  // accessible
  else if (ecart === 1) s -= 1; // légèrement au-dessus
  else                 s -= 3;  // trop élevé

  // Expérience
  if (/débutant accepté/i.test(o.experience || '')) {
    if (monProfil.experience === 'debutant') s += 2;
    else s += 1;
  }
  if (monProfil.experience === 'senior' && /senior|expérimenté|confirmé/i.test(texte)) s += 1;

  // RQTH
  if (monProfil.rqth && o.th) s += 2;

  // Mots-clés personnalisés (positifs)
  if (monProfil.motsCles) {
    const mots = monProfil.motsCles.split(',').map(m => m.trim()).filter(Boolean);
    for (const mot of mots) {
      if (mot && new RegExp(escapeRegex(mot), 'i').test(texte)) s += 2;
    }
  }

  // Mots-clés exclus
  if (monProfil.exclus) {
    const excl = monProfil.exclus.split(',').map(m => m.trim()).filter(Boolean);
    for (const mot of excl) {
      if (mot && new RegExp(escapeRegex(mot), 'i').test(texte)) s -= 4;
    }
  }

  // Âge 50+
  if (monProfil.age === '50plus' && /senior|expérimenté|confirmé/i.test(texte)) s += 1;
  if (monProfil.age === '50plus' && /jeune diplômé|junior/i.test(texte)) s -= 2;

  // Permis
  if (!monProfil.permis && /permis\s*b\s*obligatoire|véhicule exigé/i.test(texte)) s -= 2;

  return Math.max(0, Math.min(10, s));
}

// ── Score → badges Asperger ───────────────────────────────────────────────────
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
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Rendu ──────────────────────────────────────────────────────────────────────
function afficher() {
  const liste    = document.getElementById('liste-offres');
  const vide     = document.getElementById('vide');
  const compteur = document.getElementById('compteur');

  let filtrées = toutesOffres.filter(o => o.score >= scoreMin);
  if (filtreContrat) filtrées = filtrées.filter(o => o.contrat === filtreContrat);
  if (filtreSource)  filtrées = filtrées.filter(o => o.source === filtreSource);
  if (filtreTH)      filtrées = filtrées.filter(o => o.th === true);
  if (filtreProfil)  filtrées = filtrées.filter(o => scoreProfilPerso(o) >= 7);
  if (userLat !== null) {
    filtrées = filtrées.filter(o => {
      if (o.lat == null || o.lng == null) return true;
      return haversineKm(userLat, userLng, o.lat, o.lng) <= filtreDistance;
    });
  }

  const nb = filtrées.length;
  compteur.textContent = `${nb} offre${nb > 1 ? 's' : ''} affich\u00e9e${nb > 1 ? 's' : ''}`;

  if (nb === 0) { liste.innerHTML = ''; vide.hidden = false; return; }
  vide.hidden = true;

  liste.innerHTML = filtrées.map(o => {
    const { cls, texte } = badgeScore(o.score);
    const niveau  = niveauScore(o.score);
    const profil  = scoreProfilPerso(o);
    const dist    = (userLat !== null && o.lat != null && o.lng != null)
                    ? Math.round(haversineKm(userLat, userLng, o.lat, o.lng)) : null;

    const metaProfil  = profil >= 7
      ? `<span class="meta-tag meta-tag--profil">\u2665 Pour moi</span>`
      : profil <= 3
      ? `<span class="meta-tag meta-tag--hors-profil">\u26A0 Hors profil</span>`
      : '';
    const metaDist    = dist !== null ? `<span class="meta-tag meta-tag--dist">\uD83D\uDCCD ${dist}\u00a0km</span>` : '';
    const metaLieu    = o.lieu    ? `<span class="meta-tag">${esc(o.lieu)}</span>` : '';
    const metaContrat = o.contrat ? `<span class="meta-tag">${esc(o.contrat)}</span>` : '';
    const metaDate    = o.date    ? `<span class="meta-tag">${esc(o.date)}</span>` : '';
    const metaTH      = o.th      ? `<span class="meta-tag meta-tag--th">\u267F TH</span>` : '';

    return `
      <li role="listitem">
        <a class="carte" href="${esc(o.url)}" target="_blank" rel="noopener noreferrer"
           data-niveau="${niveau}" aria-label="${esc(o.titre)} \u2014 ${texte}">
          <div class="carte-entete">
            <span class="carte-titre">${esc(o.titre)}</span>
            <span class="badge ${cls}">${texte}</span>
          </div>
          <div class="carte-meta">${metaProfil}${metaDist}${metaLieu}${metaContrat}${metaDate}${metaTH}</div>
          <div class="carte-source">${esc(o.source)}</div>
        </a>
      </li>`;
  }).join('');
}

// ── Chargement des offres ──────────────────────────────────────────────────────
async function chargerOffres(forceRefresh = false) {
  const errDiv = document.getElementById('erreurs');
  const majEl  = document.getElementById('derniere-maj');
  const fab    = document.getElementById('btn-actualiser');

  errDiv.hidden = true;
  document.getElementById('liste-offres').innerHTML = '';
  document.getElementById('vide').hidden = true;
  fab.classList.add('fab--loading');
  fab.disabled = true;

  if (!forceRefresh) {
    try {
      const cached     = localStorage.getItem(CLE_CACHE);
      const cachedDate = localStorage.getItem(CLE_DATE);
      if (cached && cachedDate && Date.now() - Number(cachedDate) < 5 * 60_000) {
        toutesOffres = JSON.parse(cached);
        majEl.textContent = `Actualis\u00e9 il y a moins de 5\u00a0min`;
        afficher();
        return;
      }
    } catch {}
  }

  try {
    const controller = new AbortController();
    const timeout    = setTimeout(() => controller.abort(), 15000);
    const res        = await fetch('/api/offres', { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`Erreur serveur ${res.status}`);
    const data = await res.json();
    toutesOffres = data.offres || [];
    localStorage.setItem(CLE_CACHE, JSON.stringify(toutesOffres));
    localStorage.setItem(CLE_DATE, String(Date.now()));
    const now = new Date();
    majEl.textContent = `Mis \u00e0 jour \u00e0 ${now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
    if (data.errors?.length) {
      errDiv.hidden = false;
      errDiv.textContent = 'Avertissement\u00a0: ' + data.errors.join(' \u2014 ');
    }
  } catch (err) {
    const cached = localStorage.getItem(CLE_CACHE);
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
    fab.classList.remove('fab--loading');
    fab.disabled = false;
    afficher();
  }
}

// ── Lancement ──────────────────────────────────────────────────────────────────
chargerProfil();
chargerOffres();
