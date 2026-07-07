import { env, catalog, matchProductByKeyword, getProduct, renderTemplate } from "./config.js";
import { upsertContact, pushHistory, addTag, save } from "./db.js";
import { sendText, sendSequence, markAsRead, downloadMedia } from "./whatsapp.js";
import { agentReply } from "./agent.js";
import { validateReceipt } from "./receipts.js";

const OPT_OUT = ["stop", "baja", "no me escribas", "no me contactes", "dejame en paz"];

/** Punto de entrada: procesa cada mensaje entrante del webhook. */
export async function handleIncomingMessage(message, contactInfo) {
  const phone = message.from;
  const name = contactInfo?.profile?.name || "";
  const contact = upsertContact(phone, name);

  await markAsRead(message.id);

  // Cada mensaje entrante reabre la ventana de 24h → reinicia el remarketing
  contact.lastInboundAt = Date.now();
  contact.followupsSent = [];
  save();

  try {
    if (message.type === "text") {
      await handleText(contact, message.text.body, message.referral);
    } else if (message.type === "image") {
      await handleImage(contact, message.image);
    } else if (message.type === "document" && /image|pdf/.test(message.document?.mime_type || "")) {
      await handleImage(contact, message.document);
    } else {
      pushHistory(contact, "user", `[El cliente envió un ${message.type}]`);
      await replyWithAgent(contact);
    }
  } catch (err) {
    console.error(`Error procesando mensaje de ${phone}:`, err);
    await sendText(
      phone,
      "Ups, tuve un problema técnico 🙈 ¿Me lo puedes repetir en un momento?",
    ).catch(() => {});
  }
}

async function handleText(contact, text, referral) {
  const lower = text.toLowerCase();

  // Opt-out
  if (OPT_OUT.some((w) => lower.includes(w))) {
    addTag(contact, "no_contactar");
    pushHistory(contact, "user", text);
    const bye = "Entendido, no te escribiré más. ¡Gracias por tu tiempo! 🙏";
    await sendText(contact.phone, bye);
    pushHistory(contact, "assistant", bye);
    return;
  }

  // Detección de palabra clave (cliente que viene del anuncio).
  // El anuncio de Meta también puede traer `referral` con datos del ad.
  const keywordSource = [text, referral?.body, referral?.headline]
    .filter(Boolean)
    .join(" ");
  const matched = matchProductByKeyword(keywordSource);

  pushHistory(contact, "user", text);

  if (matched && (contact.stage === "nuevo" || contact.productId !== matched.id)) {
    contact.productId = matched.id;
    contact.stage = "conversando";
    addTag(contact, `interesado:${matched.id}`);
    if (referral?.source_id) addTag(contact, `ad:${referral.source_id}`);
    save();

    const flow = (matched.flujoInicio || []).map((m) => renderTemplate(m, matched));
    if (flow.length) {
      await sendSequence(contact.phone, flow);
      contact.lastOutboundAt = Date.now();
      for (const m of flow) pushHistory(contact, "assistant", m);
      return;
    }
  }

  if (contact.stage === "nuevo") contact.stage = "conversando";
  save();
  await replyWithAgent(contact);
}

async function replyWithAgent(contact) {
  const reply = await agentReply(contact);
  if (!reply) return;
  await sendText(contact.phone, reply);
  contact.lastOutboundAt = Date.now();
  pushHistory(contact, "assistant", reply);
}

/** El cliente envió una imagen: se asume comprobante de pago y se valida. */
async function handleImage(contact, media) {
  pushHistory(contact, "user", "[El cliente envió una imagen — posible comprobante de pago]");

  await sendText(contact.phone, "¡Recibido! 🧾 Dame un momento mientras verifico tu comprobante...");

  const { buffer, mimeType } = await downloadMedia(media.id);
  const product = contact.productId ? getProduct(contact.productId) : null;

  const result = await validateReceipt({ imageBuffer: buffer, mimeType, product });
  console.log(`🧾 Comprobante de ${contact.phone}:`, result.veredicto, "—", result.motivo);

  if (result.veredicto === "aprobado" && product) {
    await deliverProduct(contact, product);
  } else if (result.veredicto === "rechazado") {
    addTag(contact, "comprobante_rechazado");
    const msg = result.es_comprobante
      ? `Hmm, revisé tu comprobante y algo no cuadra 🤔 (${result.motivo}). ¿Puedes verificar el pago y enviarme una captura clara donde se vea el monto, la fecha y el destinatario?`
      : "Parece que esa imagen no es un comprobante de pago 🤔 Cuando realices el pago, envíame la captura y te entrego el acceso de inmediato 😊";
    await sendText(contact.phone, msg);
    pushHistory(contact, "assistant", msg);
    await notifyAdmin(contact, result, "RECHAZADO");
  } else {
    // revision_manual (o aprobado sin producto asignado)
    contact.stage = "pago_pendiente";
    addTag(contact, "revision_manual");
    save();
    const msg =
      "¡Gracias! Tu comprobante quedó en verificación ✅ En cuanto lo confirmemos (normalmente en pocos minutos) te envío el acceso por aquí mismo 😊";
    await sendText(contact.phone, msg);
    pushHistory(contact, "assistant", msg);
    await notifyAdmin(contact, result, "REVISIÓN MANUAL");
  }
}

/** Entrega el producto y etiqueta al cliente como comprador. */
export async function deliverProduct(contact, product) {
  contact.stage = "comprador";
  addTag(contact, "comprador");
  addTag(contact, `comprador:${product.id}`);
  save();

  const msg = `✅ ¡Pago confirmado! Muchas gracias por tu compra 🎉

Aquí tienes tu acceso al *${product.nombre}*:
${product.driveLink}

Guarda este enlace. Si tienes cualquier problema para entrar, escríbeme por aquí y te ayudo de inmediato 🙌`;

  await sendText(contact.phone, msg);
  contact.lastOutboundAt = Date.now();
  pushHistory(contact, "assistant", msg);
  await notifyAdmin(contact, null, `💰 VENTA CONFIRMADA — ${product.nombre}`);
}

async function notifyAdmin(contact, result, label) {
  if (!env.ADMIN_WHATSAPP) return;
  const lines = [
    `🔔 ${label}`,
    `Cliente: ${contact.name || "sin nombre"} (+${contact.phone})`,
    `Producto: ${contact.productId || "sin asignar"}`,
  ];
  if (result) {
    lines.push(
      `Monto detectado: ${result.monto_detectado || "no visible"}`,
      `Motivo: ${result.motivo}`,
    );
    if (result.senales_sospechosas?.length) {
      lines.push(`⚠️ Señales: ${result.senales_sospechosas.join("; ")}`);
    }
    lines.push("", `Para aprobar manualmente responde aquí: APROBAR ${contact.phone}`);
  }
  await sendText(env.ADMIN_WHATSAPP, lines.join("\n")).catch((err) =>
    console.error("No se pudo notificar al admin:", err.message),
  );
}

/**
 * Comandos del administrador enviados desde ADMIN_WHATSAPP:
 *   APROBAR <telefono>  → confirma el pago en revisión y entrega el producto
 */
export async function handleAdminCommand(text) {
  const match = /^aprobar\s+(\d{6,15})$/i.exec(text.trim());
  if (!match) return false;

  const phone = match[1];
  const { getContact } = await import("./db.js");
  const contact = getContact(phone);
  if (!contact) {
    await sendText(env.ADMIN_WHATSAPP, `No encuentro el contacto ${phone}`);
    return true;
  }
  const product = contact.productId ? getProduct(contact.productId) : null;
  if (!product) {
    await sendText(env.ADMIN_WHATSAPP, `El contacto ${phone} no tiene producto asignado`);
    return true;
  }
  await deliverProduct(contact, product);
  await sendText(env.ADMIN_WHATSAPP, `✅ Entregado ${product.nombre} a +${phone}`);
  return true;
}
