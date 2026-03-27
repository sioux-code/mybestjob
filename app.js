'use strict';

// ── Constantes ────────────────────────────────────────────────────────────────
const CLE_CACHE   = 'mybestjob-offres-v1';
const CLE_DATE    = 'mybestjob-date';

let toutesOffres  = [];
let scoreMin      = 8;
let filtreContrat = '';
let deferredInstall = null;

// ── Service worker ─────────────────────────────────────────────────────────────
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
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

// ── Filtres ────────────────────────────────────────────────────────────────────
document.querySelectorAll('.pill').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.pill').forEach(b => {
      b.classList.remove('active');
      b.setAttribute('aria-checked', 'false');
    });
    btn.classList.add('active');
    btn.setAttribute('aria-checked', 'true');
    scoreMin = parseInt(btn.dataset.score, 10);
    afficher();
  });
});

document.getElementById('filtre-contrat').addEventListener('change', e => {
  filtreContrat = e.target.value;
  afficher();
});

document.getElementById('btn-actualiser').addEventListener('click', () => {
  chargerOffres(true);
});

// ── Score → métadonnées visuelles ─────────────────────────────────────────────
function niveauScore(score) {
  if (score >= 8) return 'haut';
  if (score >= 6) return 'mid';
  if (score >= 4) return 'low';
  return 'non';
}

/*
  Triple codage pour daltoniens :
  ① Forme/symbole  ② Couleur de classe CSS  ③ Texte explicite
*/
function badgeScore(score) {
  if (score >= 8) return { cls: 'badge-haut', texte: '\u25A0\u25A0\u25A0 Tr\u00e8s compatible' };
  if (score >= 6) return { cls: 'badge-mid',  texte: '\u25B2\u25B2\u25B3 Compatible'       };
  if (score >= 4) return { cls: 'badge-low',  texte: '\u25CF\u25CB\u25CB Neutre'            };
  return            { cls: 'badge-non',  texte: '\u2715\u2715\u2715 Peu compatible'   };
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
  const liste  = document.getElementById('liste-offres');
  const vide   = document.getElementById('vide');
  const compteur = document.getElementById('compteur');

  const filtrées = toutesOffres
    .filter(o => o.score >= scoreMin)
    .filter(o => !filtreContrat || o.contrat.toLowerCase().includes(filtreContrat.toLowerCase()));

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
    const metaLieu    = o.lieu    ? `<span class="meta-tag">Lieu\u00a0: ${esc(o.lieu)}</span>`    : '';
    const metaContrat = o.contrat ? `<span class="meta-tag">Contrat\u00a0: ${esc(o.contrat)}</span>` : '';
    const metaDate    = o.date    ? `<span class="meta-tag">Date\u00a0: ${esc(o.date)}</span>`    : '';
    return `
      <li role="listitem">
        <a class="carte" href="${esc(o.url)}" target="_blank" rel="noopener noreferrer"
           data-niveau="${niveau}"
           aria-label="${esc(o.titre)} \u2014 ${texte}">
          <div class="carte-entete">
            <span class="carte-titre">${esc(o.titre)}</span>
            <span class="badge ${cls}" aria-hidden="true">${texte}</span>
          </div>
          <div class="carte-meta">${metaLieu}${metaContrat}${metaDate}</div>
          <div class="carte-source">${esc(o.source)}</div>
        </a>
      </li>`;
  }).join('');
}

// ── Chargement des offres ──────────────────────────────────────────────────────
async function chargerOffres(forceRefresh = false) {
  const loading = document.getElementById('chargement');
  const errDiv  = document.getElementById('erreurs');
  const majEl   = document.getElementById('derniere-maj');

  loading.hidden = false;
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
        loading.hidden = true;
        majEl.textContent = `Actualisé il y a moins de 5 min`;
        afficher();
        return;
      }
    } catch {}
  }

  try {
    const res = await fetch('/api/offres');
    if (!res.ok) throw new Error(`Erreur serveur ${res.status}`);
    const data = await res.json();

    toutesOffres = data.offres || [];
    sessionStorage.setItem(CLE_CACHE, JSON.stringify(toutesOffres));
    sessionStorage.setItem(CLE_DATE, String(Date.now()));

    const now = new Date();
    majEl.textContent = `Mis à jour à ${now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;

    if (data.errors?.length) {
      errDiv.hidden = false;
      errDiv.textContent = 'Avertissement : ' + data.errors.join(' — ');
    }
  } catch (err) {
    // Repli sur le cache si réseau indisponible
    const cached = sessionStorage.getItem(CLE_CACHE);
    if (cached) {
      toutesOffres = JSON.parse(cached);
      majEl.textContent = '(données en cache)';
    } else {
      errDiv.hidden = false;
      errDiv.textContent = 'Impossible de charger les offres. Vérifiez votre connexion.';
    }
  }

  loading.hidden = true;
  afficher();
}

// ── Lancement ──────────────────────────────────────────────────────────────────
chargerOffres();
