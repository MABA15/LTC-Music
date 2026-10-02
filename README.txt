LTC MUSIC STUDIO V0.1
=====================

Contenu
- Piano-roll tactile 3 octaves
- Jusqu'à 8 pistes
- Presets : guitares, pianos, Rhodes, kalimba, marimba, mandoline, harpe, pizzicato, basse, pads, triangle, percussions
- BPM, tonalité, durée 30/60/90/120 s, grille 1/4 1/8 1/16, zoom
- Lecture + boucle
- Pattern rythmique 16 pas
- Volume / pan / attack / release / reverb / filtre
- Humanisation légère de la lecture
- Undo / redo
- Sauvegarde locale
- Import / export .ltcmusic
- Export WAV local
- PWA installable et hors ligne

Installation Android / Samsung
1. Le dossier doit être servi via HTTPS (ou localhost) pour que l'installation PWA et le mode hors ligne soient actifs.
2. Ouvrir index.html depuis l'URL dans Chrome ou Samsung Internet.
3. Menu du navigateur > "Installer l'application" / "Ajouter à l'écran d'accueil".
4. Après la première ouverture en ligne, le service worker met les fichiers en cache.

Test local sur PC
Depuis ce dossier :
  python -m http.server 8080
Puis ouvrir http://localhost:8080

Note V0.1
Les presets sont synthétisés localement afin que l'application reste autonome et légère. L'architecture permettra ensuite de remplacer les presets principaux par des multisamples réalistes (guitare/piano/etc.) sans changer le piano-roll ni le format de projet.
