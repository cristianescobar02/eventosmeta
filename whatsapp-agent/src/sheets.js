import { catalog } from "./config.js";

/**
 * Integración con Google Sheets vía Google Apps Script (Web App).
 * Configura SHEETS_WEBHOOK_URL y SHEETS_SECRET en el .env.
 * El código del Apps Script está en google-apps-script.gs (raíz del proyecto).
 *
 * Los envíos son "fire and forget": si Sheets falla, la venta/lead se registra
 * en el log del servidor pero nunca bloquea la conversación de WhatsApp.
 */

const URL = () => process.env.SHEETS_WEBHOOK_URL || "";
const SECRET = () => process.env.SHEETS_SECRET || "";

async function post(payload) {
  if (!URL()) return; // integración no configurada
  try {
    const res = await fetch(URL(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // Apps Script sigue redirecciones 302; fetch de Node las maneja solo
      body: JSON.stringify({ secret: SECRET(), ...payload }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch (err) {
    console.error("📄 Google Sheets: no se pudo registrar:", err.message, payload.tipo);
  }
}

function fechaLocal() {
  return new Date().toLocaleString("es-CO", { timeZone: "America/Bogota" });
}

/** Nuevo lead que llegó desde un anuncio (o escribió por primera vez). */
export function logLead(contact, product) {
  const r = contact.referral || {};
  return post({
    tipo: "lead",
    fecha: fechaLocal(),
    nombre: contact.name || "",
    telefono: contact.phone,
    producto: product ? product.nombre : "(sin producto)",
    keyword: contact.keyword || "",
    adId: r.sourceId || "",
    adTitular: r.headline || "",
    adTexto: r.body || "",
    adUrl: r.sourceUrl || "",
  });
}

/** Venta confirmada (comprobante aprobado o aprobación manual). */
export function logSale(contact, product, extra = {}) {
  const r = contact.referral || {};
  const horas = contact.createdAt
    ? Math.round(((Date.now() - contact.createdAt) / 3600000) * 10) / 10
    : "";
  return post({
    tipo: "venta",
    fecha: fechaLocal(),
    nombre: contact.name || "",
    telefono: contact.phone,
    producto: product.nombre,
    pago: product.precio,
    moneda: catalog.negocio.moneda,
    metodoPago: extra.medioPago || "",
    aprobacion: extra.origen || "auto", // "auto" | "manual"
    keyword: contact.keyword || "",
    adId: r.sourceId || "",
    adTitular: r.headline || "",
    adTexto: r.body || "",
    seguimientos: contact.totalFollowups || 0,
    mensajes: contact.history?.length || 0,
    horasHastaCompra: horas,
  });
}
