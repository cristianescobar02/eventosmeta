import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

dotenv.config();

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, "..");

export const env = {
  WHATSAPP_TOKEN: process.env.WHATSAPP_TOKEN,
  WHATSAPP_PHONE_NUMBER_ID: process.env.WHATSAPP_PHONE_NUMBER_ID,
  WHATSAPP_VERIFY_TOKEN: process.env.WHATSAPP_VERIFY_TOKEN,
  WHATSAPP_APP_SECRET: process.env.WHATSAPP_APP_SECRET || "",
  CLAUDE_MODEL: process.env.CLAUDE_MODEL || "claude-opus-4-8",
  ADMIN_WHATSAPP: process.env.ADMIN_WHATSAPP || "",
  PORT: Number(process.env.PORT || 3000),
  REQUIRE_MANUAL_APPROVAL:
    String(process.env.REQUIRE_MANUAL_APPROVAL || "false").toLowerCase() === "true",
};

const missing = ["WHATSAPP_TOKEN", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_VERIFY_TOKEN"].filter(
  (k) => !env[k],
);
if (missing.length) {
  console.warn(`⚠️  Faltan variables de entorno: ${missing.join(", ")} (revisa tu .env)`);
}

function loadCatalog() {
  const file = path.join(ROOT, "config", "products.json");
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export let catalog = loadCatalog();

// Recarga el catálogo si editas products.json sin reiniciar el servidor
fs.watchFile(path.join(ROOT, "config", "products.json"), { interval: 5000 }, () => {
  try {
    catalog = loadCatalog();
    console.log("🔄 Catálogo de productos recargado");
  } catch (err) {
    console.error("Error recargando products.json:", err.message);
  }
});

function normalize(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim();
}

/** Busca un producto cuya keyword aparezca en el texto (mensaje del ad). */
export function matchProductByKeyword(text) {
  const t = normalize(text);
  if (!t) return null;
  for (const p of catalog.productos) {
    for (const kw of p.keywords || []) {
      if (t.includes(normalize(kw))) return p;
    }
  }
  return null;
}

export function getProduct(id) {
  return catalog.productos.find((p) => p.id === id) || null;
}

/** Reemplaza variables {negocio}, {producto}, {precio} en las plantillas. */
export function renderTemplate(text, product) {
  return String(text)
    .replaceAll("{negocio}", catalog.negocio.nombre)
    .replaceAll("{producto}", product ? product.nombre : "")
    .replaceAll("{precio}", product ? product.precioTexto : "");
}

/** Carga la base de conocimiento (archivos .md/.txt) de un producto. */
export function loadKnowledge(productId) {
  const dir = path.join(ROOT, "knowledge", productId);
  if (!fs.existsSync(dir)) return "";
  const parts = [];
  for (const file of fs.readdirSync(dir).sort()) {
    if (!/\.(md|txt)$/i.test(file)) continue;
    const content = fs.readFileSync(path.join(dir, file), "utf8").trim();
    if (content) parts.push(`--- ${file} ---\n${content}`);
  }
  return parts.join("\n\n");
}
