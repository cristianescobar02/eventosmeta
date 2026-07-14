import crypto from "node:crypto";
import path from "node:path";
import express from "express";
import multer from "multer";
import {
  env,
  ROOT,
  getProduct,
  catalog,
  saveCatalog,
  loadKnowledgeMain,
  saveKnowledgeMain,
  listKnowledgeSources,
  addKnowledgeSource,
  removeKnowledgeSource,
} from "./config.js";
import { getSettingsForDisplay, updateSettings } from "./settings.js";
import { extractFromFile, extractFromLink } from "./extract.js";
import { allContacts, getContact, pushHistory, addTag, save } from "./db.js";
import { sendText, uploadMedia } from "./whatsapp.js";
import { deliverProduct } from "./router.js";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 16 * 1024 * 1024 } });
const uploadDoc = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

function slugify(text) {
  return String(text)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function uniqueProductId(base) {
  let id = base || "producto";
  let n = 2;
  while (catalog.productos.some((p) => p.id === id)) {
    id = `${base}-${n++}`;
  }
  return id;
}

const HOUR = 60 * 60 * 1000;

function checkAuth(req) {
  const password = process.env.DASHBOARD_PASSWORD || "";
  if (!password) return "unconfigured";
  const provided = (req.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const a = crypto.createHash("sha256").update(provided).digest();
  const b = crypto.createHash("sha256").update(password).digest();
  return crypto.timingSafeEqual(a, b) ? "ok" : "bad";
}

function contactSummary(c) {
  const last = c.history[c.history.length - 1] || null;
  const windowMsLeft = c.lastInboundAt ? Math.max(0, 24 * HOUR - (Date.now() - c.lastInboundAt)) : 0;
  return {
    phone: c.phone,
    name: c.name,
    productId: c.productId,
    productName: c.productId ? getProduct(c.productId)?.nombre || c.productId : null,
    stage: c.stage,
    tags: c.tags,
    botPaused: !!c.botPaused,
    lastMessage: last ? { role: last.role, content: String(last.content).slice(0, 120), ts: last.ts } : null,
    lastInboundAt: c.lastInboundAt,
    windowMsLeft,
    createdAt: c.createdAt,
  };
}

export function mountDashboard(app) {
  // Página del panel (la autenticación ocurre en las llamadas a la API)
  app.get("/admin", (_req, res) => {
    res.sendFile(path.join(ROOT, "public", "dashboard.html"));
  });

  const api = express.Router();

  api.use((req, res, next) => {
    const auth = checkAuth(req);
    if (auth === "unconfigured") {
      return res.status(503).json({
        error: "Configura DASHBOARD_PASSWORD en el archivo .env para activar el panel.",
      });
    }
    if (auth === "bad") return res.status(401).json({ error: "Contraseña incorrecta" });
    next();
  });

  api.get("/stats", (_req, res) => {
    const contacts = allContacts();
    const now = Date.now();
    res.json({
      total: contacts.length,
      conversando: contacts.filter((c) => c.stage === "conversando").length,
      pagoPendiente: contacts.filter((c) => c.stage === "pago_pendiente").length,
      compradores: contacts.filter((c) => c.stage === "comprador").length,
      ventanaAbierta: contacts.filter(
        (c) => c.lastInboundAt && now - c.lastInboundAt < 24 * HOUR && c.stage !== "comprador",
      ).length,
    });
  });

  api.get("/contacts", (_req, res) => {
    const list = allContacts()
      .map(contactSummary)
      .sort((a, b) => (b.lastMessage?.ts || b.createdAt) - (a.lastMessage?.ts || a.createdAt));
    res.json(list);
  });

  api.get("/contacts/:phone", (req, res) => {
    const c = getContact(req.params.phone);
    if (!c) return res.status(404).json({ error: "Contacto no encontrado" });
    res.json({ ...contactSummary(c), history: c.history });
  });

  // Enviar un mensaje manual (tú tomas la palabra)
  api.post("/contacts/:phone/send", async (req, res) => {
    const c = getContact(req.params.phone);
    if (!c) return res.status(404).json({ error: "Contacto no encontrado" });
    const text = String(req.body?.text || "").trim();
    if (!text) return res.status(400).json({ error: "Mensaje vacío" });
    try {
      await sendText(c.phone, text);
      c.lastOutboundAt = Date.now();
      pushHistory(c, "assistant", text);
      res.json({ ok: true });
    } catch (err) {
      res.status(502).json({ error: `WhatsApp: ${err.message}` });
    }
  });

  // Pausar / reanudar las respuestas automáticas para este contacto
  api.post("/contacts/:phone/pause", (req, res) => {
    const c = getContact(req.params.phone);
    if (!c) return res.status(404).json({ error: "Contacto no encontrado" });
    c.botPaused = !!req.body?.paused;
    save();
    res.json({ ok: true, botPaused: c.botPaused });
  });

  // Aprobar pago manualmente → entrega el producto y etiqueta comprador
  api.post("/contacts/:phone/approve", async (req, res) => {
    const c = getContact(req.params.phone);
    if (!c) return res.status(404).json({ error: "Contacto no encontrado" });
    const product = c.productId ? getProduct(c.productId) : null;
    if (!product) {
      return res.status(400).json({ error: "El contacto no tiene producto asignado" });
    }
    try {
      await deliverProduct(c, product);
      res.json({ ok: true });
    } catch (err) {
      res.status(502).json({ error: `WhatsApp: ${err.message}` });
    }
  });

  // Agregar o quitar etiquetas
  api.post("/contacts/:phone/tags", (req, res) => {
    const c = getContact(req.params.phone);
    if (!c) return res.status(404).json({ error: "Contacto no encontrado" });
    const { add, remove } = req.body || {};
    if (add) addTag(c, String(add).trim());
    if (remove) {
      c.tags = c.tags.filter((t) => t !== remove);
      save();
    }
    res.json({ ok: true, tags: c.tags });
  });

  // Asignar producto a un contacto
  api.post("/contacts/:phone/product", (req, res) => {
    const c = getContact(req.params.phone);
    if (!c) return res.status(404).json({ error: "Contacto no encontrado" });
    const id = req.body?.productId || null;
    if (id && !getProduct(id)) return res.status(400).json({ error: "Producto no existe" });
    c.productId = id;
    save();
    res.json({ ok: true });
  });

  api.get("/products", (_req, res) => {
    res.json(catalog.productos.map((p) => ({ id: p.id, nombre: p.nombre, precioTexto: p.precioTexto })));
  });

  // ── Administración de productos (para configurar sin editar JSON a mano) ──

  api.get("/products/full", (_req, res) => {
    res.json(catalog.productos);
  });

  function validateProductBody(body) {
    const nombre = String(body.nombre || "").trim();
    const precio = Number(body.precio);
    const precioTexto = String(body.precioTexto || "").trim();
    const driveLink = String(body.driveLink || "").trim();
    const keywords = Array.isArray(body.keywords)
      ? body.keywords.map((k) => String(k).trim()).filter(Boolean)
      : [];
    if (!nombre) return "El nombre es obligatorio";
    if (!Number.isFinite(precio) || precio <= 0) return "El precio debe ser un número mayor a 0";
    if (!precioTexto) return "El precio en texto es obligatorio (ej: $49.900 COP)";
    if (!driveLink) return "El link de Google Drive es obligatorio";
    if (!keywords.length) return "Agrega al menos una palabra clave";
    if (Array.isArray(body.upsells)) {
      for (const u of body.upsells) {
        if (!String(u.nombre || "").trim()) return "Cada complemento necesita un nombre";
        if (!(Number(u.precio) > 0)) return "Cada complemento necesita un precio adicional mayor a 0";
        if (!String(u.driveLink || "").trim()) return "Cada complemento necesita su link de Google Drive";
      }
    }
    return null;
  }

  // Normaliza los complementos (upsells) con un id estable por complemento.
  function sanitizeUpsells(list, existing = []) {
    if (!Array.isArray(list)) return [];
    return list.map((u, i) => ({
      id: existing[i]?.id || u.id || slugify(u.nombre) || `upsell-${i + 1}`,
      nombre: String(u.nombre).trim(),
      precio: Number(u.precio),
      precioTexto: String(u.precioTexto || `+$${Number(u.precio).toLocaleString("es-CO")}`).trim(),
      driveLink: String(u.driveLink).trim(),
    }));
  }

  api.post("/products", (req, res) => {
    const error = validateProductBody(req.body);
    if (error) return res.status(400).json({ error });

    const id = uniqueProductId(slugify(req.body.nombre));
    const product = {
      id,
      nombre: String(req.body.nombre).trim(),
      keywords: req.body.keywords.map((k) => String(k).trim()).filter(Boolean),
      precio: Number(req.body.precio),
      precioTexto: String(req.body.precioTexto).trim(),
      driveLink: String(req.body.driveLink).trim(),
      ocultarPreciosReferencia: !!req.body.ocultarPreciosReferencia,
      upsells: sanitizeUpsells(req.body.upsells),
      flujoInicio: Array.isArray(req.body.flujoInicio) ? req.body.flujoInicio : [],
      remarketing: Array.isArray(req.body.remarketing) ? req.body.remarketing : [],
    };
    const next = { ...catalog, productos: [...catalog.productos, product] };
    saveCatalog(next);
    res.json({ ok: true, product });
  });

  api.put("/products/:id", (req, res) => {
    const idx = catalog.productos.findIndex((p) => p.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: "Producto no encontrado" });
    const error = validateProductBody(req.body);
    if (error) return res.status(400).json({ error });

    const updated = {
      ...catalog.productos[idx],
      nombre: String(req.body.nombre).trim(),
      keywords: req.body.keywords.map((k) => String(k).trim()).filter(Boolean),
      precio: Number(req.body.precio),
      precioTexto: String(req.body.precioTexto).trim(),
      driveLink: String(req.body.driveLink).trim(),
      ocultarPreciosReferencia: !!req.body.ocultarPreciosReferencia,
      upsells: sanitizeUpsells(req.body.upsells, catalog.productos[idx].upsells),
      flujoInicio: Array.isArray(req.body.flujoInicio) ? req.body.flujoInicio : [],
      remarketing: Array.isArray(req.body.remarketing) ? req.body.remarketing : [],
    };
    const productos = [...catalog.productos];
    productos[idx] = updated;
    saveCatalog({ ...catalog, productos });
    res.json({ ok: true, product: updated });
  });

  api.delete("/products/:id", (req, res) => {
    const exists = catalog.productos.some((p) => p.id === req.params.id);
    if (!exists) return res.status(404).json({ error: "Producto no encontrado" });
    const productos = catalog.productos.filter((p) => p.id !== req.params.id);
    saveCatalog({ ...catalog, productos });
    res.json({ ok: true });
  });

  // Configuración general del negocio y métodos de pago
  api.get("/settings", (_req, res) => {
    res.json({ negocio: catalog.negocio, metodosPago: catalog.metodosPago, titularCuenta: catalog.titularCuenta });
  });

  api.put("/settings", (req, res) => {
    const { negocio, metodosPago, titularCuenta } = req.body || {};
    saveCatalog({
      ...catalog,
      // Merge para no perder campos como moneda/descripcion que no vienen del panel
      negocio: negocio ? { ...catalog.negocio, ...negocio } : catalog.negocio,
      metodosPago: Array.isArray(metodosPago) ? metodosPago : catalog.metodosPago,
      titularCuenta: titularCuenta ?? catalog.titularCuenta,
    });
    res.json({ ok: true });
  });

  // Base de conocimiento (un archivo principal editable por producto)
  api.get("/products/:id/knowledge", (req, res) => {
    if (!getProduct(req.params.id)) return res.status(404).json({ error: "Producto no encontrado" });
    res.json({ content: loadKnowledgeMain(req.params.id) });
  });

  api.put("/products/:id/knowledge", (req, res) => {
    if (!getProduct(req.params.id)) return res.status(404).json({ error: "Producto no encontrado" });
    saveKnowledgeMain(req.params.id, String(req.body?.content || ""));
    res.json({ ok: true });
  });

  // Subida de imagen/video para usar en el flujo inicial de un producto
  api.post("/media/upload", upload.single("file"), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No se recibió ningún archivo" });
    const mime = req.file.mimetype || "";
    const kind = mime.startsWith("image/") ? "image" : mime.startsWith("video/") ? "video" : null;
    if (!kind) return res.status(400).json({ error: "Solo se admiten imágenes o videos" });
    try {
      const mediaId = await uploadMedia(req.file.buffer, mime, req.file.originalname);
      res.json({ ok: true, mediaId, kind, mimeType: mime });
    } catch (err) {
      res.status(502).json({ error: `WhatsApp: ${err.message}` });
    }
  });

  // ── Fuentes de conocimiento: archivos (PDF/Word/Excel/texto) y links ──

  api.get("/products/:id/sources", (req, res) => {
    if (!getProduct(req.params.id)) return res.status(404).json({ error: "Producto no encontrado" });
    const list = listKnowledgeSources(req.params.id).map(({ id, type, name, addedAt }) => ({
      id,
      type,
      name,
      addedAt,
    }));
    res.json(list);
  });

  api.post("/products/:id/sources/file", uploadDoc.single("file"), async (req, res) => {
    if (!getProduct(req.params.id)) return res.status(404).json({ error: "Producto no encontrado" });
    if (!req.file) return res.status(400).json({ error: "No se recibió ningún archivo" });
    try {
      const content = await extractFromFile(req.file.buffer, req.file.mimetype, req.file.originalname);
      if (!content) return res.status(400).json({ error: "No se pudo extraer texto de ese archivo" });
      const entry = addKnowledgeSource(req.params.id, {
        type: "file",
        name: req.file.originalname,
        content,
      });
      res.json({ ok: true, source: entry });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  api.post("/products/:id/sources/link", async (req, res) => {
    if (!getProduct(req.params.id)) return res.status(404).json({ error: "Producto no encontrado" });
    const url = String(req.body?.url || "").trim();
    if (!url) return res.status(400).json({ error: "Falta el link" });
    try {
      const content = await extractFromLink(url);
      if (!content) return res.status(400).json({ error: "No se pudo extraer texto de ese link" });
      const entry = addKnowledgeSource(req.params.id, { type: "link", name: url, content });
      res.json({ ok: true, source: entry });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  api.delete("/products/:id/sources/:sourceId", (req, res) => {
    if (!getProduct(req.params.id)) return res.status(404).json({ error: "Producto no encontrado" });
    const removed = removeKnowledgeSource(req.params.id, req.params.sourceId);
    if (!removed) return res.status(404).json({ error: "Fuente no encontrada" });
    res.json({ ok: true });
  });

  // ── Integraciones (WhatsApp/Meta, Meta Ads, Meta Pixel, Google Sheets) ──

  api.get("/integrations", (_req, res) => {
    res.json(getSettingsForDisplay());
  });

  api.put("/integrations", (req, res) => {
    updateSettings(req.body || {});
    res.json({ ok: true, settings: getSettingsForDisplay() });
  });

  app.use("/api", api);
}
