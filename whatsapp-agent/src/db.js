import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./config.js";

const DATA_DIR = path.join(ROOT, "data");
const DB_FILE = path.join(DATA_DIR, "db.json");

let data = { contacts: {} };

function load() {
  try {
    if (fs.existsSync(DB_FILE)) {
      data = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
      if (!data.contacts) data.contacts = {};
    }
  } catch (err) {
    console.error("No se pudo leer data/db.json, iniciando vacío:", err.message);
    data = { contacts: {} };
  }
}
load();

let saveTimer = null;
export function save() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = DB_FILE + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, DB_FILE);
  }, 250);
}

/**
 * Contacto:
 * {
 *   phone, name, productId, stage: 'nuevo'|'conversando'|'pago_pendiente'|'comprador',
 *   tags: [], history: [{role, content, ts}],
 *   lastInboundAt, lastOutboundAt, followupsSent: [], createdAt
 * }
 */
export function getContact(phone) {
  return data.contacts[phone] || null;
}

export function upsertContact(phone, name) {
  let c = data.contacts[phone];
  if (!c) {
    c = {
      phone,
      name: name || "",
      productId: null,
      stage: "nuevo",
      tags: [],
      history: [],
      lastInboundAt: null,
      lastOutboundAt: null,
      followupsSent: [],
      createdAt: Date.now(),
    };
    data.contacts[phone] = c;
  } else if (name && !c.name) {
    c.name = name;
  }
  save();
  return c;
}

export function addTag(contact, tag) {
  if (!contact.tags.includes(tag)) {
    contact.tags.push(tag);
    save();
  }
}

export function hasTag(contact, tag) {
  return contact.tags.includes(tag);
}

const MAX_HISTORY = 40;
export function pushHistory(contact, role, content) {
  contact.history.push({ role, content, ts: Date.now() });
  if (contact.history.length > MAX_HISTORY) {
    contact.history = contact.history.slice(-MAX_HISTORY);
  }
  save();
}

export function allContacts() {
  return Object.values(data.contacts);
}

/** Última calidad de número conocida: { quality, limitTier, checkedAt } */
export function getQualityState() {
  return data.quality || null;
}

export function setQualityState(state) {
  data.quality = { ...state, checkedAt: Date.now() };
  save();
}
