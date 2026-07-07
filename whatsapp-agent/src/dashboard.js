import crypto from "node:crypto";
import path from "node:path";
import express from "express";
import { env, ROOT, getProduct, catalog } from "./config.js";
import { allContacts, getContact, pushHistory, addTag, save } from "./db.js";
import { sendText } from "./whatsapp.js";
import { deliverProduct } from "./router.js";

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

  app.use("/api", api);
}
