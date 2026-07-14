import { catalog, getProduct, renderTemplate } from "./config.js";
import { allContacts, hasTag, save, pushHistory } from "./db.js";

/** true si el contacto cumple las condiciones de etiqueta del paso (si las tiene). */
function meetsCondition(contact, step) {
  if (step.etiquetaRequerida && !hasTag(contact, step.etiquetaRequerida)) return false;
  if (step.etiquetaExcluida && hasTag(contact, step.etiquetaExcluida)) return false;
  return true;
}
import { sendText } from "./whatsapp.js";

const HOUR = 60 * 60 * 1000;
// Margen de seguridad: nunca enviar más allá de las 23.5h desde el último
// mensaje ENTRANTE (la ventana de servicio de WhatsApp es de 24h).
const WINDOW_LIMIT = 23.5 * HOUR;

/**
 * Recorre los contactos y envía los mensajes de remarketing programados a
 * quienes NO están etiquetados como "comprador", antes de que se cierre la
 * ventana de 24 horas de WhatsApp.
 *
 * Cada producto define sus mensajes en products.json → remarketing:
 *   [{ horas: 4, mensaje: "...", etiquetaRequerida?: "x", etiquetaExcluida?: "y" }]
 * Los contactos sin producto usan remarketingGeneral. Un paso solo se envía
 * si el contacto cumple sus condiciones de etiqueta (cuando las tiene).
 */
export async function runRemarketingTick() {
  const now = Date.now();

  for (const contact of allContacts()) {
    try {
      if (!contact.lastInboundAt) continue;
      if (contact.stage === "comprador" || hasTag(contact, "comprador")) continue;
      if (hasTag(contact, "no_contactar")) continue;
      if (contact.botPaused) continue; // conversación en manos del humano

      const elapsed = now - contact.lastInboundAt;
      if (elapsed > WINDOW_LIMIT) continue; // ventana cerrada: solo plantillas pagas servirían

      const product = contact.productId ? getProduct(contact.productId) : null;
      const schedule = product?.remarketing?.length
        ? product.remarketing
        : catalog.remarketingGeneral || [];

      for (let i = 0; i < schedule.length; i++) {
        const step = schedule[i];
        const due = step.horas * HOUR;
        if (
          elapsed >= due &&
          !contact.followupsSent.includes(i) &&
          meetsCondition(contact, step)
        ) {
          const msg = renderTemplate(step.mensaje, product);
          await sendText(contact.phone, msg);
          contact.followupsSent.push(i);
          contact.totalFollowups = (contact.totalFollowups || 0) + 1;
          contact.lastOutboundAt = Date.now();
          pushHistory(contact, "assistant", msg);
          save();
          console.log(`📣 Remarketing #${i + 1} enviado a ${contact.phone}`);
          break; // máximo un follow-up por contacto por tick
        }
      }
    } catch (err) {
      console.error(`Error en remarketing para ${contact.phone}:`, err.message);
    }
  }
}

export function startRemarketingScheduler(intervalMs = 60_000) {
  setInterval(() => {
    runRemarketingTick().catch((err) => console.error("Remarketing tick:", err));
  }, intervalMs);
  console.log("⏰ Scheduler de remarketing activo (cada 60s)");
}
