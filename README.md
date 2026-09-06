# Semainier — agenda hebdomadaire

Application web statique (HTML/CSS/JS, aucun outil de build) qui affiche un
agenda **lundi → dimanche** avec :

- import du calendrier de cours depuis un flux **ICS** (ex. EDT Bot) ;
- ajout d'**événements** et de **tâches** (case à cocher pour les valider) ;
- impression en PDF directement depuis le navigateur ;
- stockage **local** par défaut, ou synchronisé entre appareils via
  **Firebase** si tu choisis de le configurer.

## Contenu du projet

```
index.html            Structure de la page et des modales
css/styles.css         Feuille de style (palette, grille horaire, impression)
js/app.js               Point d'entrée : relie tout le reste
js/calendar.js          Construction de la grille et positionnement des blocs
js/ics.js                Lecture du flux .ics et récupération réseau
js/storage.js            Stockage : Firestore si configuré, sinon localStorage
js/firebase-config.js    Config Firebase à compléter (facultatif)
firestore.rules          Règles de sécurité Firestore à copier dans la console
```

Aucune dépendance à installer : tout tourne dans le navigateur. Les seules
ressources externes chargées sont les polices Google Fonts et, si tu actives
Firebase, le SDK Firebase (importé depuis son CDN officiel).

## Comment ça marche

- **Fuseau horaire** : le flux ICS d'EDT Bot indique des horaires en
  `Europe/Paris` sans règle de récurrence (chaque séance est un événement
  distinct). L'application lit ces horaires comme des heures locales de
  l'appareil qui l'affiche — ce qui est correct tant que tu consultes
  l'agenda depuis un appareil réglé sur l'heure française.
- **Import ICS et CORS** : un site hébergé sur GitHub Pages est 100% statique
  et ne peut pas contourner les restrictions CORS d'un serveur tiers.
  L'app essaie donc, dans l'ordre : 1) une récupération directe de l'URL,
  2) un repli via un proxy public (`allorigins.win`) si le serveur bloque
  la requête, 3) sinon elle t'invite à déposer le fichier `.ics` téléchargé
  manuellement — ce qui fonctionne toujours, quel que soit le serveur.
- **Courses vs événements/tâches** : chaque import ICS *remplace*
  entièrement les cours précédemment importés (le flux fait foi), alors que
  tes événements et tâches créés à la main ne sont jamais touchés par un
  import.
- **Stockage** : par défaut tout est enregistré dans le `localStorage` du
  navigateur (rien à configurer, mais les données restent sur cet appareil).
  Si tu renseignes `js/firebase-config.js`, l'app bascule automatiquement sur
  Firestore et synchronise entre tous tes appareils.

## Étapes de déploiement

### 1. Créer le dépôt GitHub

1. Crée un nouveau dépôt GitHub (public ou privé).
2. Place-y les fichiers de ce projet tels quels, à la racine (ou dans un
   dossier `docs/`, au choix — voir l'étape 3).
3. Commit puis push.

### 2. Tester en local (facultatif mais recommandé)

Les modules JavaScript utilisent `import`/`export`, ce que les navigateurs
n'acceptent pas en ouvrant directement le fichier (`file://`). Lance un petit
serveur local depuis le dossier du projet, par exemple :

```bash
python3 -m http.server 8000
```

puis ouvre `http://localhost:8000`.

### 3. Activer GitHub Pages

1. Dans le dépôt GitHub : **Settings → Pages**.
2. Choisis la branche (ex. `main`) et le dossier (`/root` ou `/docs` selon
   où tu as placé les fichiers).
3. Enregistre — GitHub te donne l'URL publique du site (quelques minutes
   d'attente la première fois).

### 4. Importer ton calendrier de cours

1. Ouvre le site, clique sur **« Importer les cours »**.
2. L'adresse de ton flux EDT Bot est déjà pré-remplie :
   `https://api.edtbot.fr/ics?&tag_id=45&tag_id=46&tag_id=47&`
3. Clique sur **« Récupérer depuis l'adresse »**.
   - Si un message d'erreur apparaît (blocage CORS), ouvre cette adresse
     dans un nouvel onglet, enregistre le fichier (`Ctrl+S` /
     `Cmd+S` → format « Page web, .ics »), puis utilise **« Déposer un
     fichier .ics »** dans la même fenêtre.
4. Réimporte quand tu veux mettre à jour l'emploi du temps : les anciens
   cours sont automatiquement remplacés par les nouveaux.

### 5. Ajouter des événements et des tâches

- Bouton **« + Ajouter »** en haut à droite.
- Choisis **Événement** ou **Tâche**, renseigne le titre, le début, la fin,
  le lieu et une courte description.
- Une tâche affiche une case à cocher directement sur son bloc dans la
  grille pour la marquer comme terminée.
- Clique sur un bloc existant pour le modifier ou le supprimer (les cours
  importés s'ouvrent en lecture seule : enseignant, groupe, salle).

### 6. Imprimer en PDF

- Bouton **« Imprimer »**, ou raccourci `Ctrl/Cmd + P`.
- La mise en page bascule automatiquement en A4 paysage, sans les boutons
  ni les menus, avec la semaine affichée à l'écran.
- Choisis **« Enregistrer au format PDF »** comme imprimante dans la boîte
  de dialogue de ton navigateur.

### 7. (Optionnel) Synchroniser entre appareils avec Firebase

Par défaut l'agenda fonctionne sans aucune configuration (stockage local).
Pour le retrouver identique sur ton téléphone et ton ordinateur :

1. Va sur <https://console.firebase.google.com> et crée un projet.
2. Ajoute une application **Web** (icône `</>`) au projet.
3. Copie l'objet `firebaseConfig` fourni par Firebase.
4. Colle ces valeurs dans `js/firebase-config.js` à la place de
   `"REMPLACE_MOI"`.
5. Dans la console Firebase : **Build → Firestore Database → Créer une
   base** (mode production, région Europe conseillée).
6. Toujours dans la console : **Build → Authentication → Sign-in method →
   Anonyme → Activer**.
7. Dans **Firestore → Règles**, colle le contenu de `firestore.rules` fourni
   dans ce projet, puis publie.
8. Recharge ton site : le badge en haut passe de « Stockage local » à
   « Synchronisé (Firebase) ».

⚠️ Ces règles autorisent quiconque ouvre ton site (l'authentification
anonyme s'active automatiquement) à lire/écrire tes données. C'est
suffisant pour un usage personnel si tu ne partages pas l'URL, mais ce
n'est pas une isolation par utilisateur. Le fichier `firestore.rules`
explique comment aller plus loin avec une vraie connexion par e-mail.

## Limites connues

- L'import ICS suppose un flux sans règle de récurrence (`RRULE`), comme le
  fait EDT Bot : chaque séance doit être un `VEVENT` complet. Un flux avec
  récurrence nécessiterait un développement du parseur.
- Le proxy CORS public utilisé en repli (`allorigins.win`) peut être
  temporairement indisponible ; le dépôt manuel du fichier `.ics` fonctionne
  dans tous les cas.
- Les règles Firestore fournies conviennent à un usage personnel, pas à un
  usage multi-utilisateurs avec des données privées à isoler.
