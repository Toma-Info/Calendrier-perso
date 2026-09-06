// ---------------------------------------------------------------------------
// Configuration Firebase (optionnelle).
//
// Tant que "apiKey" commence par "REMPLACE_", l'application fonctionne
// entièrement en local (localStorage du navigateur) : rien à configurer,
// mais les données restent sur cet appareil et ce navigateur uniquement.
//
// Pour synchroniser tes événements et tâches entre plusieurs appareils :
//   1. Crée un projet sur https://console.firebase.google.com
//   2. Ajoute une application "Web" au projet (icône </>)
//   3. Copie l'objet de configuration fourni par Firebase ci-dessous
//   4. Active Firestore Database (mode production) dans la console
//   5. Active Authentication > méthode "Anonyme"
//   6. Applique les règles Firestore fournies dans firestore.rules
//
// Voir le README.md du projet pour le détail des étapes.
// ---------------------------------------------------------------------------

export const firebaseConfig = {
  apiKey: "REMPLACE_MOI",
  authDomain: "REMPLACE_MOI.firebaseapp.com",
  projectId: "REMPLACE_MOI",
  storageBucket: "REMPLACE_MOI.appspot.com",
  messagingSenderId: "REMPLACE_MOI",
  appId: "REMPLACE_MOI",
};
