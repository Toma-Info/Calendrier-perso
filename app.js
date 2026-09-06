// ---------------------------------------------------------------------------
// app.js — point d'entrée : relie le stockage, le rendu de la grille et les
// interactions (ajout/édition, import ICS, impression).
// ---------------------------------------------------------------------------

import { initStorage, getItems, upsertItem, deleteItem, replaceCourses } from "./storage.js";
import { startOfWeek, addDays, formatWeekLabel, buildGridSkeleton, renderWeek } from "./calendar.js";
import { parseIcs, fetchIcsSmart } from "./ics.js";

const $ = (sel) => document.querySelector(sel);

const gridEl = $("#calendarGrid");
const weekLabelEl = $("#weekLabel");
const syncStatusEl = $("#syncStatus");
const toastEl = $("#toast");

let currentMonday = startOfWeek(new Date());
let allItems = [];
let editingId = null;
let toastTimer = null;

// ------------------------------------------------------------------ Toast

function toast(message) {
  toastEl.textContent = message;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastEl.hidden = true; }, 2600);
}

// -------------------------------------------------------------- Rendering

function render() {
  weekLabelEl.textContent = formatWeekLabel(currentMonday);
  renderWeek(gridEl, currentMonday, allItems, {
    onOpenItem: handleOpenItem,
    onToggleDone: handleToggleDone,
  });
}

function goToWeek(monday) { currentMonday = monday; render(); }

// --------------------------------------------------------- Date/time util

function toLocalInputValue(input) {
  const d = input instanceof Date ? input : new Date(input);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatFull(date) {
  return date.toLocaleString("fr-FR", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
}

// ---------------------------------------------------------- Item modal (add/edit)

const itemModal = $("#itemModal");
const itemForm = $("#itemForm");
const modalTitle = $("#modalTitle");
const fieldTitle = $("#fieldTitle");
const fieldStart = $("#fieldStart");
const fieldEnd = $("#fieldEnd");
const fieldLocation = $("#fieldLocation");
const fieldDescription = $("#fieldDescription");
const fieldDone = $("#fieldDone");
const doneRow = $("#doneRow");
const formError = $("#formError");
const deleteItemBtn = $("#deleteItemBtn");
const typeRadios = document.querySelectorAll('input[name="itemType"]');

function setTypeRadio(value) {
  typeRadios.forEach((r) => {
    r.checked = r.value === value;
    r.closest(".radio-pill").classList.toggle("is-checked", r.value === value);
  });
  doneRow.hidden = value !== "task";
}

typeRadios.forEach((r) => r.addEventListener("change", () => setTypeRadio(r.value)));

function getSelectedType() {
  return document.querySelector('input[name="itemType"]:checked')?.value || "event";
}

function openAddModal() {
  editingId = null;
  modalTitle.textContent = "Ajouter";
  formError.hidden = true;
  deleteItemBtn.hidden = true;
  setTypeRadio("event");

  const now = new Date();
  now.setSeconds(0, 0);
  now.setMinutes(Math.ceil(now.getMinutes() / 15) * 15);
  const end = new Date(now.getTime() + 60 * 60000);

  fieldTitle.value = "";
  fieldStart.value = toLocalInputValue(now);
  fieldEnd.value = toLocalInputValue(end);
  fieldLocation.value = "";
  fieldDescription.value = "";
  fieldDone.checked = false;

  itemModal.showModal();
  fieldTitle.focus();
}

function openEditModal(item) {
  editingId = item.id;
  modalTitle.textContent = item.type === "task" ? "Modifier la tâche" : "Modifier l’événement";
  formError.hidden = true;
  deleteItemBtn.hidden = false;
  setTypeRadio(item.type);

  fieldTitle.value = item.title || "";
  fieldStart.value = toLocalInputValue(item.start);
  fieldEnd.value = toLocalInputValue(item.end);
  fieldLocation.value = item.location || "";
  fieldDescription.value = item.description || "";
  fieldDone.checked = !!item.done;

  itemModal.showModal();
  fieldTitle.focus();
}

itemForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const title = fieldTitle.value.trim();
  const start = new Date(fieldStart.value);
  const end = new Date(fieldEnd.value);

  if (!title) { showFormError("Donne un titre à cet élément."); return; }
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) { showFormError("Dates invalides."); return; }
  if (end <= start) { showFormError("La fin doit être après le début."); return; }

  const type = getSelectedType();
  const item = {
    id: editingId || (crypto.randomUUID ? crypto.randomUUID() : `item-${Date.now()}`),
    type,
    title,
    start: start.toISOString(),
    end: end.toISOString(),
    location: fieldLocation.value.trim(),
    description: fieldDescription.value.trim(),
    done: type === "task" ? fieldDone.checked : false,
  };

  try {
    await upsertItem(item);
    itemModal.close();
    toast(editingId ? "Modifications enregistrées" : "Ajouté à l’agenda");
  } catch (err) {
    console.error(err);
    showFormError("Échec de l’enregistrement — réessaie.");
  }
});

function showFormError(msg) { formError.textContent = msg; formError.hidden = false; }

$("#cancelItemBtn").addEventListener("click", () => itemModal.close());

deleteItemBtn.addEventListener("click", async () => {
  if (!editingId) return;
  if (!confirm("Supprimer cet élément ?")) return;
  await deleteItem(editingId);
  itemModal.close();
  toast("Supprimé");
});

// ---------------------------------------------------------- Course detail modal

const courseModal = $("#courseModal");
const courseTag = $("#courseTag");
const courseTitle = $("#courseTitle");
const courseMeta = $("#courseMeta");

function metaRow(label, value) {
  if (!value) return "";
  return `<dt>${label}</dt><dd>${escapeHtml(value)}</dd>`;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function openCourseDetail(item) {
  courseTag.textContent = item.cancelled ? "Cours annulé" : "Cours";
  courseTag.style.background = item.cancelled ? "var(--danger-bg)" : "var(--course-bg)";
  courseTag.style.color = item.cancelled ? "var(--danger)" : "var(--course)";
  courseTitle.textContent = item.title || "(sans titre)";

  const start = new Date(item.start);
  const end = new Date(item.end);
  courseMeta.innerHTML = [
    metaRow("Horaire", `${formatFull(start)} → ${end.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`),
    metaRow("Lieu", item.location),
    metaRow("Enseignant", item.teacher),
    metaRow("Groupe", item.group),
    metaRow("Statut", item.tags && item.tags.length ? item.tags.join(", ") : ""),
  ].join("");

  courseModal.showModal();
}

$("#closeCourseBtn").addEventListener("click", () => courseModal.close());

// -------------------------------------------------------------- Item routing

function handleOpenItem(item) {
  if (item.type === "course") openCourseDetail(item);
  else openEditModal(item);
}

async function handleToggleDone(item, checked) {
  try {
    await upsertItem({ ...item, done: checked });
  } catch (err) {
    console.error(err);
    toast("Échec de la mise à jour");
  }
}

// -------------------------------------------------------------------- Import

const importModal = $("#importModal");
const icsUrlInput = $("#icsUrl");
const icsFileInput = $("#icsFile");
const importStatus = $("#importStatus");
const fetchIcsBtn = $("#fetchIcsBtn");

function setImportStatus(message, kind) {
  importStatus.hidden = false;
  importStatus.textContent = message;
  importStatus.className = `import-status${kind ? ` is-${kind}` : ""}`;
}

async function importCourses(text) {
  const courses = parseIcs(text);
  if (!courses.length) {
    setImportStatus("Aucun cours trouvé dans ce flux — vérifie l’adresse ou le fichier.", "error");
    return;
  }
  await replaceCourses(courses);
  setImportStatus(`${courses.length} séance(s) importée(s) et synchronisée(s) avec l’agenda.`, "success");
  toast("Cours importés");
}

fetchIcsBtn.addEventListener("click", async () => {
  const url = icsUrlInput.value.trim();
  if (!url) { setImportStatus("Renseigne une adresse .ics.", "error"); return; }
  fetchIcsBtn.disabled = true;
  setImportStatus("Récupération du flux…");
  try {
    const text = await fetchIcsSmart(url);
    await importCourses(text);
  } catch (err) {
    console.error(err);
    setImportStatus(err.message || "Échec de la récupération.", "error");
  } finally {
    fetchIcsBtn.disabled = false;
  }
});

icsFileInput.addEventListener("change", async () => {
  const file = icsFileInput.files?.[0];
  if (!file) return;
  setImportStatus("Lecture du fichier…");
  try {
    const text = await file.text();
    await importCourses(text);
  } catch (err) {
    console.error(err);
    setImportStatus("Impossible de lire ce fichier.", "error");
  } finally {
    icsFileInput.value = "";
  }
});

$("#importBtn").addEventListener("click", () => { importStatus.hidden = true; importModal.showModal(); });
$("#closeImportBtn").addEventListener("click", () => importModal.close());

// ------------------------------------------------------------------ Toolbar

$("#addBtn").addEventListener("click", openAddModal);
$("#printBtn").addEventListener("click", () => window.print());
$("#prevWeek").addEventListener("click", () => goToWeek(addDays(currentMonday, -7)));
$("#nextWeek").addEventListener("click", () => goToWeek(addDays(currentMonday, 7)));
$("#todayBtn").addEventListener("click", () => goToWeek(startOfWeek(new Date())));

// --------------------------------------------------------------------- Boot

buildGridSkeleton(gridEl);

initStorage((items, backend) => {
  allItems = items;
  syncStatusEl.textContent = backend === "firestore" ? "Synchronisé (Firebase)" : "Stockage local";
  render();
});

render();
setInterval(render, 60000); // rafraîchit le repère "maintenant" chaque minute
