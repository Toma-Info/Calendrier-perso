// ---------------------------------------------------------------------------
// calendar.js — construction du squelette de grille horaire et rendu des
// blocs (cours / événements / tâches) pour une semaine donnée (lundi→dimanche).
// ---------------------------------------------------------------------------

const DOW_SHORT = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const MONTHS = ["janvier","février","mars","avril","mai","juin","juillet","août","septembre","octobre","novembre","décembre"];

export function startOfWeek(date) {
  const d = new Date(date);
  const isoDay = (d.getDay() + 6) % 7; // lundi = 0
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - isoDay);
  return d;
}

export function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

export function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function formatWeekLabel(monday) {
  const sunday = addDays(monday, 6);
  const sameMonth = monday.getMonth() === sunday.getMonth() && monday.getFullYear() === sunday.getFullYear();
  if (sameMonth) {
    return `Semaine du ${monday.getDate()} au ${sunday.getDate()} ${MONTHS[monday.getMonth()]} ${monday.getFullYear()}`;
  }
  const sameYear = monday.getFullYear() === sunday.getFullYear();
  const start = `${monday.getDate()} ${MONTHS[monday.getMonth()]}${sameYear ? "" : " " + monday.getFullYear()}`;
  const end = `${sunday.getDate()} ${MONTHS[sunday.getMonth()]} ${sunday.getFullYear()}`;
  return `Semaine du ${start} au ${end}`;
}

/** Construit une fois pour toutes les cellules fixes de la grille
 *  (en-têtes de jour, étiquettes d'heure, colonnes de jour). Le contenu
 *  variable (blocs d'événements) est injecté/rafraîchi par renderWeek(). */
export function buildGridSkeleton(gridEl) {
  gridEl.querySelectorAll(".day-header-cell, .hour-label, .day-col").forEach((el) => el.remove());

  for (let i = 0; i < 7; i++) {
    const cell = document.createElement("div");
    cell.className = "day-header-cell";
    cell.style.gridColumn = String(i + 2);
    cell.dataset.dayIndex = String(i);
    cell.innerHTML = `<span class="dow"></span><span class="dom"></span>`;
    gridEl.appendChild(cell);
  }

  for (let h = 0; h < 24; h++) {
    const label = document.createElement("div");
    label.className = "hour-label";
    label.style.gridRow = String(h + 2);
    label.textContent = `${String(h).padStart(2, "0")}:00`;
    gridEl.appendChild(label);
  }

  for (let i = 0; i < 7; i++) {
    const col = document.createElement("div");
    col.className = "day-col";
    col.style.gridColumn = String(i + 2);
    col.style.gridRow = "2 / span 24";
    col.dataset.dayIndex = String(i);
    gridEl.appendChild(col);
  }
}

/** Répartit les éléments qui se chevauchent dans des colonnes côte à côte
 *  (algorithme glouton). Ajoute _col et _colCount à chaque élément. */
function layoutOverlaps(dayItems) {
  const sorted = [...dayItems].sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
  const clusters = [];
  let clusterEnd = -Infinity;

  for (const it of sorted) {
    if (clusters.length && it.startMin < clusterEnd) {
      clusters[clusters.length - 1].push(it);
      clusterEnd = Math.max(clusterEnd, it.endMin);
    } else {
      clusters.push([it]);
      clusterEnd = it.endMin;
    }
  }

  const placed = [];
  for (const cluster of clusters) {
    const columnEnds = [];
    for (const it of cluster) {
      let col = columnEnds.findIndex((end) => it.startMin >= end);
      if (col === -1) { col = columnEnds.length; columnEnds.push(it.endMin); }
      else columnEnds[col] = it.endMin;
      it._col = col;
    }
    const colCount = columnEnds.length;
    for (const it of cluster) { it._colCount = colCount; placed.push(it); }
  }
  return placed;
}

function timeLabel(date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

const TAG_LABELS = { EXAM: "Examen", DELETE: "Annulé", ADD: "Ajouté", EDIT: "Modifié" };

function renderBlock(item, handlers) {
  const el = document.createElement("div");
  el.className = `event-block type-${item.type}`;
  if (item.cancelled) el.classList.add("is-cancelled");
  if (item.type === "task" && item.done) el.classList.add("is-done");

  el.style.top = `${(item.startMin / 1440) * 100}%`;
  el.style.height = `${((item.endMin - item.startMin) / 1440) * 100}%`;
  el.style.minHeight = "16px";
  const widthPct = 100 / item._colCount;
  el.style.left = `calc(${item._col * widthPct}% + 2px)`;
  el.style.width = `calc(${widthPct}% - 4px)`;

  const time = document.createElement("span");
  time.className = "ev-time";
  time.textContent = `${timeLabel(item._clipStart)}–${timeLabel(item._clipEnd)}`;
  el.appendChild(time);

  const title = document.createElement("span");
  title.className = "ev-title";
  title.textContent = item.title || "(sans titre)";
  el.appendChild(title);

  if (item.location) {
    const loc = document.createElement("span");
    loc.className = "ev-loc";
    loc.textContent = `📍 ${item.location}`;
    el.appendChild(loc);
  }

  if (item.tags && item.tags.length) {
    const badges = document.createElement("span");
    badges.className = "ev-badges";
    for (const tag of item.tags) {
      const b = document.createElement("span");
      b.className = "badge";
      b.textContent = TAG_LABELS[tag] || tag;
      badges.appendChild(b);
    }
    el.appendChild(badges);
  }

  if (item.type === "task") {
    const check = document.createElement("input");
    check.type = "checkbox";
    check.className = "ev-check";
    check.checked = !!item.done;
    check.title = "Marquer comme terminée";
    check.addEventListener("click", (e) => e.stopPropagation());
    check.addEventListener("change", () => handlers.onToggleDone?.(item, check.checked));
    el.appendChild(check);
  }

  el.addEventListener("click", () => handlers.onOpenItem?.(item));
  return el;
}

/** Rafraîchit les en-têtes et les blocs de la grille pour la semaine dont
 *  le lundi est `monday`. `items` contient tous les éléments (cours,
 *  événements, tâches) toutes semaines confondues ; seuls ceux qui
 *  recouvrent la semaine affichée sont dessinés. */
export function renderWeek(gridEl, monday, items, handlers = {}) {
  const today = new Date();

  gridEl.querySelectorAll(".day-header-cell").forEach((cell) => {
    const idx = Number(cell.dataset.dayIndex);
    const date = addDays(monday, idx);
    cell.querySelector(".dow").textContent = DOW_SHORT[idx];
    cell.querySelector(".dom").textContent = String(date.getDate()).padStart(2, "0");
    cell.classList.toggle("is-today", sameDay(date, today));
  });

  for (let i = 0; i < 7; i++) {
    const dayBegin = addDays(monday, i);
    const dayEnd = addDays(dayBegin, 1);
    const col = gridEl.querySelector(`.day-col[data-day-index="${i}"]`);
    col.classList.toggle("is-today", sameDay(dayBegin, today));
    col.classList.toggle("is-weekend", i >= 5);
    col.querySelectorAll(".event-block, .now-line").forEach((n) => n.remove());

    const dayItems = items
      .map((it) => ({ ...it, _start: new Date(it.start), _end: new Date(it.end) }))
      .filter((it) => !Number.isNaN(it._start.getTime()) && !Number.isNaN(it._end.getTime()) && it._start < dayEnd && it._end > dayBegin)
      .map((it) => {
        const clipStart = it._start < dayBegin ? dayBegin : it._start;
        const clipEnd = it._end > dayEnd ? dayEnd : it._end;
        const startMin = (clipStart - dayBegin) / 60000;
        const endMin = Math.max(startMin + 8, (clipEnd - dayBegin) / 60000);
        return { ...it, startMin, endMin, _clipStart: clipStart, _clipEnd: clipEnd };
      });

    const placed = layoutOverlaps(dayItems);
    for (const it of placed) col.appendChild(renderBlock(it, handlers));

    if (sameDay(dayBegin, today)) {
      const nowMin = today.getHours() * 60 + today.getMinutes();
      const line = document.createElement("div");
      line.className = "now-line";
      line.style.top = `${(nowMin / 1440) * 100}%`;
      col.appendChild(line);
    }
  }
}
