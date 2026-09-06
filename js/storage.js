// ---------------------------------------------------------------------------
// storage.js
//
// Petite couche d'abstraction au-dessus de deux backends possibles :
//   - Firestore (si js/firebase-config.js contient une vraie configuration)
//   - localStorage (repli automatique, aucune configuration requise)
//
// Le reste de l'application ne connaît jamais lequel des deux est actif :
// il appelle initStorage(), getItems(), upsertItem(), deleteItem(),
// replaceCourses().
// ---------------------------------------------------------------------------

import { firebaseConfig } from "./firebase-config.js";

const LOCAL_KEY = "semainier_items_v1";
const FIREBASE_SDK_VERSION = "10.13.0";

let backend = "local"; // "local" | "firestore"
let cache = [];
let listeners = [];
let firestoreRefs = null; // { db, colRef, doc, setDoc, deleteDoc, writeBatch }

function isFirebaseConfigured() {
  return !!(firebaseConfig && firebaseConfig.apiKey && !String(firebaseConfig.apiKey).startsWith("REMPLACE_"));
}

function notify() {
  const snapshot = cache.slice();
  listeners.forEach((fn) => {
    try { fn(snapshot, backend); } catch (err) { console.error(err); }
  });
}

function loadLocal() {
  try {
    cache = JSON.parse(localStorage.getItem(LOCAL_KEY) || "[]");
  } catch {
    cache = [];
  }
  notify();
}

function saveLocal() {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(cache));
  notify();
}

async function initFirestore() {
  const [{ initializeApp }, authMod, storeMod] = await Promise.all([
    import(`https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-app.js`),
    import(`https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-auth.js`),
    import(`https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-firestore.js`),
  ]);

  const app = initializeApp(firebaseConfig);
  const auth = authMod.getAuth(app);
  const db = storeMod.getFirestore(app);

  await authMod.signInAnonymously(auth);
  await new Promise((resolve, reject) => {
    const unsub = authMod.onAuthStateChanged(auth, (user) => {
      if (user) { unsub(); resolve(user); }
    }, reject);
  });

  const colRef = storeMod.collection(db, "items");

  storeMod.onSnapshot(colRef, (snap) => {
    cache = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    notify();
  }, (err) => {
    console.error("Erreur de synchronisation Firestore :", err);
  });

  firestoreRefs = { db, colRef, ...storeMod };
  backend = "firestore";
}

export async function initStorage(onChange) {
  if (onChange) listeners.push(onChange);

  if (isFirebaseConfigured()) {
    try {
      await initFirestore();
      return backend;
    } catch (err) {
      console.warn("Firebase indisponible, bascule sur le stockage local du navigateur.", err);
    }
  }

  backend = "local";
  loadLocal();
  return backend;
}

export function onItemsChange(fn) {
  listeners.push(fn);
}

export function getBackend() {
  return backend;
}

export function getItems() {
  return cache.slice();
}

export async function upsertItem(item) {
  if (backend === "firestore") {
    const { doc, setDoc, colRef } = firestoreRefs;
    await setDoc(doc(colRef, item.id), item, { merge: true });
    return;
  }
  const idx = cache.findIndex((i) => i.id === item.id);
  if (idx >= 0) cache[idx] = item; else cache.push(item);
  saveLocal();
}

export async function deleteItem(id) {
  if (backend === "firestore") {
    const { doc, deleteDoc, colRef } = firestoreRefs;
    await deleteDoc(doc(colRef, id));
    return;
  }
  cache = cache.filter((i) => i.id !== id);
  saveLocal();
}

// Remplace intégralement les éléments de type "course" par la nouvelle
// liste importée depuis le flux ICS (le flux est la source de vérité pour
// les cours : on ne fusionne pas, on resynchronise).
export async function replaceCourses(newCourseItems) {
  if (backend === "firestore") {
    const { doc, setDoc, deleteDoc, writeBatch, colRef } = firestoreRefs;
    const existingCourses = cache.filter((i) => i.type === "course");
    const batchSize = 400; // marge sous la limite de 500 écritures par batch
    const ops = [
      ...existingCourses.map((i) => ({ kind: "delete", id: i.id })),
      ...newCourseItems.map((i) => ({ kind: "set", item: i })),
    ];
    for (let i = 0; i < ops.length; i += batchSize) {
      const batch = writeBatch(firestoreRefs.db);
      for (const op of ops.slice(i, i + batchSize)) {
        if (op.kind === "delete") batch.delete(doc(colRef, op.id));
        else batch.set(doc(colRef, op.item.id), op.item, { merge: true });
      }
      await batch.commit();
    }
    return;
  }
  cache = cache.filter((i) => i.type !== "course").concat(newCourseItems);
  saveLocal();
}
