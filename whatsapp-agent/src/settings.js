import fs from "node:fs";
import path from "node:path";
import { DATA_DIR, env } from "./config.js";

const FILE = path.join(DATA_DIR, "settings.json");

/**
 * Mapa de claves de configuración → variable de entorno de respaldo.
 * El panel puede sobreescribir cualquiera de estas sin necesidad de un
 * redeploy; si no se ha configurado desde el panel, se usa el valor del
 * .env / variables de Railway como respaldo.
 */
const ENV_FALLBACK = {
  whatsappToken: "WHATSAPP_TOKEN",
  whatsappPhoneNumberId: "WHATSAPP_PHONE_NUMBER_ID",
  whatsappVerifyToken: "WHATSAPP_VERIFY_TOKEN",
  whatsappAppSecret: "WHATSAPP_APP_SECRET",
  adminWhatsapp: "ADMIN_WHATSAPP",
  sheetsWebhookUrl: "SHEETS_WEBHOOK_URL",
  sheetsSecret: "SHEETS_SECRET",
  metaAdsToken: "",
  metaPixelId: "",
  metaConversionsToken: "",
  claudeModelChat: "CLAUDE_MODEL_CHAT",
  claudeModelReceipts: "CLAUDE_MODEL_RECEIPTS",
};

// Campos que se consideran secretos: la API nunca los devuelve completos.
const SECRET_FIELDS = new Set([
  "whatsappToken",
  "whatsappAppSecret",
  "sheetsSecret",
  "metaAdsToken",
  "metaConversionsToken",
]);

let store = {};

function load() {
  try {
    if (fs.existsSync(FILE)) store = JSON.parse(fs.readFileSync(FILE, "utf8"));
  } catch (err) {
    console.error("No se pudo leer data/settings.json, iniciando vacío:", err.message);
    store = {};
  }
}
load();

function persist() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2));
  fs.renameSync(tmp, FILE);
}

/** Valor efectivo de una clave: configurado en el panel, o el de .env, o "". */
export function getSetting(key) {
  if (store[key]) return store[key];
  const envKey = ENV_FALLBACK[key];
  return (envKey && env[envKey]) || (envKey && process.env[envKey]) || "";
}

/** true si la clave tiene un valor (del panel o de .env). */
export function isConfigured(key) {
  return !!getSetting(key);
}

/**
 * Actualiza una o más claves. Un valor vacío/"" se ignora (no borra lo
 * existente) — para borrar explícitamente pasa `null`.
 */
export function updateSettings(patch) {
  for (const [key, value] of Object.entries(patch)) {
    if (!(key in ENV_FALLBACK)) continue;
    if (value === null) delete store[key];
    else if (value !== undefined && value !== "") store[key] = String(value);
  }
  persist();
}

/** Vista segura para el panel: nunca expone el valor completo de un secreto. */
export function getSettingsForDisplay() {
  const out = {};
  for (const key of Object.keys(ENV_FALLBACK)) {
    const value = getSetting(key);
    if (SECRET_FIELDS.has(key)) {
      out[key] = value ? { configured: true, preview: "•••• " + value.slice(-4) } : { configured: false };
    } else {
      out[key] = { configured: !!value, value };
    }
  }
  return out;
}
