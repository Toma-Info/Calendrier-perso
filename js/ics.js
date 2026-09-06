// ---------------------------------------------------------------------------
// ics.js — lecture d'un flux ICS (RFC 5545) et conversion en éléments
// "course" pour le calendrier. Volontairement minimaliste : le flux EDT Bot
// (et la plupart des générateurs d'emploi du temps) écrit un VEVENT distinct
// par séance, sans règle de récurrence (RRULE) — inutile donc de gérer les
// récurrences ici.
// ---------------------------------------------------------------------------

const PROXY_URL = (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;

/** Déplie les lignes ICS repliées (RFC 5545 §3.1 : une ligne de continuation
 *  commence par une espace ou une tabulation). */
function unfold(text) {
  return text.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "");
}

function unescapeText(value) {
  return value
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

/** Transforme "20250901T100000" (+ TZID éventuel) en objet Date en heure
 *  locale du navigateur. On suppose que l'appareil est réglé sur le fuseau
 *  du calendrier (Europe/Paris pour un usage universitaire français) : les
 *  composantes de date/heure sont donc utilisées telles quelles. */
function parseDate(raw) {
  const m = raw.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?$/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m.map(Number);
  return new Date(y, mo - 1, d, h, mi, s);
}

function parseLine(line) {
  const colonIdx = line.indexOf(":");
  if (colonIdx === -1) return null;
  const left = line.slice(0, colonIdx);
  const value = line.slice(colonIdx + 1);
  const [name, ...paramParts] = left.split(";");
  const params = {};
  for (const p of paramParts) {
    const [k, v] = p.split("=");
    if (k) params[k] = v;
  }
  return { name: name.toUpperCase(), params, value };
}

const TAG_RE = /\[(EXAM|DELETE|ADD|EDIT)\]\s*/gi;

function extractTags(summary) {
  const tags = new Set();
  let m;
  TAG_RE.lastIndex = 0;
  while ((m = TAG_RE.exec(summary))) tags.add(m[1].toUpperCase());
  const cleanTitle = summary.replace(TAG_RE, "").trim();
  return { tags: [...tags], cleanTitle };
}

function parseDescription(desc) {
  const teacher = desc.match(/Enseignant\s*:\s*([^\n]+)/i)?.[1]?.trim();
  const group = desc.match(/Groupe\s*:\s*([^\n]+)/i)?.[1]?.trim();
  const duration = desc.match(/Dur[ée]e\s*:\s*([^\n]+)/i)?.[1]?.trim();
  return { teacher, group, duration };
}

/** Parse un texte ICS complet et retourne un tableau d'éléments "course". */
export function parseIcs(text) {
  const unfolded = unfold(text);
  const lines = unfolded.split("\n").filter(Boolean);

  const items = [];
  let current = null;

  for (const rawLine of lines) {
    const line = parseLine(rawLine);
    if (!line) continue;

    if (line.name === "BEGIN" && line.value === "VEVENT") {
      current = {};
      continue;
    }
    if (line.name === "END" && line.value === "VEVENT") {
      if (current?.start && current?.end && current?.summary) {
        const { tags, cleanTitle } = extractTags(current.summary);
        const { teacher, group, duration } = parseDescription(current.description || "");
        items.push({
          id: `course-${current.uid || cryptoId()}`,
          type: "course",
          title: cleanTitle,
          start: current.start.toISOString(),
          end: current.end.toISOString(),
          location: current.location || "",
          description: current.description || "",
          teacher: teacher || "",
          group: group || "",
          duration: duration || "",
          tags,
          cancelled: tags.includes("DELETE"),
        });
      }
      current = null;
      continue;
    }
    if (!current) continue;

    switch (line.name) {
      case "UID":
        current.uid = line.value;
        break;
      case "SUMMARY":
        current.summary = unescapeText(line.value);
        break;
      case "LOCATION":
        current.location = unescapeText(line.value);
        break;
      case "DESCRIPTION":
        current.description = unescapeText(line.value);
        break;
      case "DTSTART":
        current.start = parseDate(line.value);
        break;
      case "DTEND":
        current.end = parseDate(line.value);
        break;
      default:
        break;
    }
  }

  return items;
}

function cryptoId() {
  return (crypto.randomUUID ? crypto.randomUUID() : String(Math.random())).slice(0, 8);
}

/** Récupère un flux ICS depuis une URL : essaie d'abord une requête directe
 *  (fonctionne si le serveur autorise le CORS), puis se replie sur un proxy
 *  public si le navigateur bloque la requête. Lève une erreur explicite si
 *  les deux échouent, pour orienter vers l'import de fichier. */
export async function fetchIcsSmart(url) {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    if (!text.includes("BEGIN:VCALENDAR")) throw new Error("Réponse inattendue");
    return text;
  } catch (directErr) {
    try {
      const res = await fetch(PROXY_URL(url), { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      if (!text.includes("BEGIN:VCALENDAR")) throw new Error("Réponse inattendue via proxy");
      return text;
    } catch (proxyErr) {
      const err = new Error(
        "Impossible de récupérer le flux directement (probablement bloqué par le CORS du serveur ou par le proxy public). Télécharge le fichier .ics depuis l’adresse dans ton navigateur, puis dépose-le ci-dessous."
      );
      err.cause = { directErr, proxyErr };
      throw err;
    }
  }
}
