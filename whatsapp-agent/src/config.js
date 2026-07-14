import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
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
  // Conversación de ventas: modelo económico (la mayoría de mensajes son chat simple)
  CLAUDE_MODEL_CHAT: process.env.CLAUDE_MODEL_CHAT || "claude-haiku-4-5",
  // Validación de comprobantes: modelo con mayor precisión (aquí importa evitar fraude)
  CLAUDE_MODEL_RECEIPTS: process.env.CLAUDE_MODEL_RECEIPTS || "claude-opus-4-8",
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

const CATALOG_FILE = path.join(ROOT, "config", "products.json");

function loadCatalog() {
  return JSON.parse(fs.readFileSync(CATALOG_FILE, "utf8"));
}

export let catalog = loadCatalog();

// Recarga el catálogo si editas products.json a mano sin reiniciar el servidor
fs.watchFile(CATALOG_FILE, { interval: 5000 }, () => {
  try {
    catalog = loadCatalog();
    console.log("🔄 Catálogo de productos recargado");
  } catch (err) {
    console.error("Error recargando products.json:", err.message);
  }
});

/**
 * Guarda el catálogo completo de forma atómica y actualiza la copia en
 * memoria al instante (el dashboard no tiene que esperar el watchFile).
 */
export function saveCatalog(newCatalog) {
  const tmp = CATALOG_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(newCatalog, null, 2));
  fs.renameSync(tmp, CATALOG_FILE);
  catalog = newCatalog;
}

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

/** Carga la base de conocimiento (archivos .md/.txt + fuentes subidas) de un producto. */
export function loadKnowledge(productId) {
  const dir = path.join(ROOT, "knowledge", productId);
  const parts = [];

  if (fs.existsSync(dir)) {
    for (const file of fs.readdirSync(dir).sort()) {
      if (!/\.(md|txt)$/i.test(file)) continue;
      const content = fs.readFileSync(path.join(dir, file), "utf8").trim();
      if (content) parts.push(`--- ${file} ---\n${content}`);
    }
  }

  for (const source of listKnowledgeSources(productId)) {
    const content = fs.existsSync(source.file) ? fs.readFileSync(source.file, "utf8").trim() : "";
    if (content) parts.push(`--- ${source.name} ---\n${content}`);
  }

  return parts.join("\n\n");
}

const KNOWLEDGE_MAIN_FILE = "info.md";
const SOURCES_INDEX_FILE = "sources.json";

/** Lee el archivo principal de conocimiento que edita el dashboard (uno solo, texto plano). */
export function loadKnowledgeMain(productId) {
  const file = path.join(ROOT, "knowledge", productId, KNOWLEDGE_MAIN_FILE);
  if (!fs.existsSync(file)) return "";
  return fs.readFileSync(file, "utf8");
}

/** Guarda el archivo principal de conocimiento del producto (crea la carpeta si no existe). */
export function saveKnowledgeMain(productId, content) {
  const dir = path.join(ROOT, "knowledge", productId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, KNOWLEDGE_MAIN_FILE), content ?? "");
}

function sourcesDir(productId) {
  return path.join(ROOT, "knowledge", productId, "sources");
}

function sourcesIndexFile(productId) {
  return path.join(sourcesDir(productId), SOURCES_INDEX_FILE);
}

/**
 * Lista las fuentes de conocimiento subidas (archivos o links) de un
 * producto: [{ id, type, name, addedAt, file }]. `file` es la ruta absoluta
 * al .txt con el contenido ya extraído.
 */
export function listKnowledgeSources(productId) {
  const indexFile = sourcesIndexFile(productId);
  if (!fs.existsSync(indexFile)) return [];
  try {
    const list = JSON.parse(fs.readFileSync(indexFile, "utf8"));
    return list.map((s) => ({ ...s, file: path.join(sourcesDir(productId), `${s.id}.txt`) }));
  } catch {
    return [];
  }
}

/** Agrega una fuente de conocimiento (contenido ya extraído a texto plano). */
export function addKnowledgeSource(productId, { type, name, content }) {
  const dir = sourcesDir(productId);
  fs.mkdirSync(dir, { recursive: true });

  const id = crypto.randomUUID();
  fs.writeFileSync(path.join(dir, `${id}.txt`), content || "");

  const indexFile = sourcesIndexFile(productId);
  const list = fs.existsSync(indexFile) ? JSON.parse(fs.readFileSync(indexFile, "utf8")) : [];
  const entry = { id, type, name, addedAt: Date.now() };
  list.push(entry);
  fs.writeFileSync(indexFile, JSON.stringify(list, null, 2));
  return entry;
}

/** Elimina una fuente de conocimiento (archivo o link) por su id. */
export function removeKnowledgeSource(productId, sourceId) {
  const dir = sourcesDir(productId);
  const indexFile = sourcesIndexFile(productId);
  if (!fs.existsSync(indexFile)) return false;

  const list = JSON.parse(fs.readFileSync(indexFile, "utf8"));
  const next = list.filter((s) => s.id !== sourceId);
  if (next.length === list.length) return false;

  fs.writeFileSync(indexFile, JSON.stringify(next, null, 2));
  const txtFile = path.join(dir, `${sourceId}.txt`);
  if (fs.existsSync(txtFile)) fs.unlinkSync(txtFile);
  return true;
}

/**
 * Normaliza un paso del flujo inicial a { type, text?, mediaId?, caption? }.
 * Acepta el formato viejo (string = texto plano) por compatibilidad.
 */
export function normalizeFlowStep(step) {
  if (typeof step === "string") return { type: "text", text: step };
  return step;
}
