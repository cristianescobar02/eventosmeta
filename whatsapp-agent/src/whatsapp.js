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

/** Envía una imagen ya subida a WhatsApp (por media ID). */
export async function sendImage(to, mediaId, caption) {
  return graphRequest(`/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "image",
      image: caption ? { id: mediaId, caption } : { id: mediaId },
    }),
  });
}

/** Envía un video ya subido a WhatsApp (por media ID). */
export async function sendVideo(to, mediaId, caption) {
  return graphRequest(`/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "video",
      video: caption ? { id: mediaId, caption } : { id: mediaId },
    }),
  });
}

/**
 * Sube un archivo (imagen o video) a los servidores de WhatsApp y devuelve
 * su media ID reutilizable — así el archivo queda alojado por Meta, sin que
 * el bot tenga que servirlo públicamente.
 */
export async function uploadMedia(buffer, mimeType, filename) {
  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("file", new Blob([buffer], { type: mimeType }), filename || "archivo");

  const res = await fetch(`${GRAPH}/${env.WHATSAPP_PHONE_NUMBER_ID}/media`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.WHATSAPP_TOKEN}` },
    body: form,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Subida de media falló ${res.status}: ${body}`);
  }
  const data = await res.json();
  return data.id;
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

/**
 * Envía una secuencia de pasos (texto, imagen o video) con una pequeña pausa
 * entre cada uno. Cada paso es { type: "text", text } | { type: "image"|"video", mediaId, caption? }.
 */
export async function sendSequence(to, steps, delayMs = 1500) {
  for (const step of steps) {
    if (step.type === "image") await sendImage(to, step.mediaId, step.caption);
    else if (step.type === "video") await sendVideo(to, step.mediaId, step.caption);
    else await sendText(to, step.text);
    await new Promise((r) => setTimeout(r, delayMs));
  }
}
