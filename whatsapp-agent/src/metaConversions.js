import crypto from "node:crypto";
import { getSetting } from "./settings.js";

const GRAPH = "https://graph.facebook.com/v21.0";

function sha256(value) {
  return crypto.createHash("sha256").update(String(value).trim().toLowerCase()).digest("hex");
}

/**
 * Envía un evento de "Purchase" a la Conversions API de Meta para campañas
 * de Click-to-WhatsApp, usando el `ctwa_clid` capturado del referral del
 * primer mensaje. Esto le da a Meta la señal real de venta para optimizar el
 * anuncio — sin esto, Meta solo ve "conversaciones", no compras reales.
 *
 * Requiere metaPixelId + metaConversionsToken configurados (panel o .env).
 * Si no están configurados, o si el contacto no tiene ctwa_clid (no vino de
 * un anuncio), no hace nada — es una mejora opcional, nunca bloquea la venta.
 *
 * ⚠️ La forma exacta de este payload puede variar según la versión de la
 * Conversions API de Meta para WhatsApp — si Meta cambia el formato, ajusta
 * este archivo según su documentación vigente de "Conversions API for
 * click-to-WhatsApp ads".
 */
export async function sendPurchaseEvent(contact, product, amount) {
  const pixelId = getSetting("metaPixelId");
  const token = getSetting("metaConversionsToken");
  const ctwaClid = contact.referral?.ctwaClid;
  if (!pixelId || !token || !ctwaClid) return;

  try {
    const res = await fetch(`${GRAPH}/${pixelId}/events?access_token=${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        data: [
          {
            event_name: "Purchase",
            event_time: Math.floor(Date.now() / 1000),
            action_source: "business_messaging",
            messaging_channel: "whatsapp",
            user_data: {
              ctwa_clid: ctwaClid,
              ph: sha256(contact.phone),
            },
            custom_data: {
              currency: "COP",
              value: amount ?? product.precio,
            },
          },
        ],
      }),
    });
    if (!res.ok) {
      console.error(`Meta Conversions API ${res.status}: ${await res.text().catch(() => "")}`);
      return;
    }
    console.log(`📈 Evento de compra enviado a Meta Conversions API (${contact.phone})`);
  } catch (err) {
    console.error("No se pudo enviar el evento a Meta Conversions API:", err.message);
  }
}
