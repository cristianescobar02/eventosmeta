import { env } from "./config.js";

const GRAPH = "https://graph.facebook.com/v21.0";

async function graphRequest(path, options = {}) {
  const res = await fetch(`${GRAPH}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${env.WHATSAPP_TOKEN}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`WhatsApp API ${res.status}: ${body}`);
  }
  return res.json();
}

/** Envía un mensaje de texto libre (solo válido dentro de la ventana de 24h). */
export async function sendText(to, body) {
  return graphRequest(`/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body, preview_url: true },
    }),
  });
}

/** Marca un mensaje como leído (doble check azul). */
export async function markAsRead(messageId) {
  try {
    await graphRequest(`/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: "POST",
      body: JSON.stringify({
        messaging_product: "whatsapp",
        status: "read",
        message_id: messageId,
      }),
    });
  } catch {
    // no es crítico
  }
}

/**
 * Descarga un archivo multimedia recibido (imagen del comprobante).
 * Devuelve { buffer, mimeType }.
 */
export async function downloadMedia(mediaId) {
  const meta = await graphRequest(`/${mediaId}`);
  const res = await fetch(meta.url, {
    headers: { Authorization: `Bearer ${env.WHATSAPP_TOKEN}` },
  });
  if (!res.ok) throw new Error(`Descarga de media falló: ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  return { buffer, mimeType: meta.mime_type || "image/jpeg" };
}

/** Consulta la calidad y el límite de mensajería del número (para detectar riesgo de bloqueo). */
export async function getPhoneNumberQuality() {
  const data = await graphRequest(
    `/${env.WHATSAPP_PHONE_NUMBER_ID}?fields=quality_rating,messaging_limit_tier`,
  );
  return {
    quality: data.quality_rating || "UNKNOWN", // GREEN | YELLOW | RED | UNKNOWN
    limitTier: data.messaging_limit_tier || "UNKNOWN",
  };
}

/** Envía una secuencia de mensajes con una pequeña pausa entre cada uno. */
export async function sendSequence(to, messages, delayMs = 1500) {
  for (const msg of messages) {
    await sendText(to, msg);
    await new Promise((r) => setTimeout(r, delayMs));
  }
}
