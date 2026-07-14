import crypto from "node:crypto";
import express from "express";
import { env } from "./config.js";
import { handleIncomingMessage, handleAdminCommand } from "./router.js";
import { startRemarketingScheduler } from "./remarketing.js";
import { mountDashboard } from "./dashboard.js";
import { startQualityScheduler } from "./quality.js";

const app = express();

// Guardamos el body crudo para poder validar la firma de Meta
app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.get("/", (_req, res) => res.send("Agente de WhatsApp activo ✅"));

// ── Verificación del webhook (Meta hace un GET al configurarlo) ────────
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && token === env.WHATSAPP_VERIFY_TOKEN) {
    console.log("✅ Webhook verificado por Meta");
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

function validSignature(req) {
  if (!env.WHATSAPP_APP_SECRET) return true; // validación opcional
  const signature = req.get("x-hub-signature-256") || "";
  const expected =
    "sha256=" +
    crypto.createHmac("sha256", env.WHATSAPP_APP_SECRET).update(req.rawBody).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

// ── Recepción de mensajes ───────────────────────────────────────────────
app.post("/webhook", (req, res) => {
  if (!validSignature(req)) return res.sendStatus(403);

  // Responder 200 de inmediato: Meta reintenta si tardamos
  res.sendStatus(200);

  const entries = req.body?.entry || [];
  for (const entry of entries) {
    for (const change of entry.changes || []) {
      const value = change.value;
      if (!value?.messages) continue;

      const contactInfo = value.contacts?.[0];
      for (const message of value.messages) {
        processMessage(message, contactInfo);
      }
    }
  }
});

async function processMessage(message, contactInfo) {
  try {
    // Comandos del administrador (APROBAR <telefono>)
    if (
      env.ADMIN_WHATSAPP &&
      message.from === env.ADMIN_WHATSAPP &&
      message.type === "text" &&
      (await handleAdminCommand(message.text.body))
    ) {
      return;
    }
    await handleIncomingMessage(message, contactInfo);
  } catch (err) {
    console.error("Error en processMessage:", err);
  }
}

mountDashboard(app);

app.listen(env.PORT, () => {
  console.log(`🚀 Agente de WhatsApp escuchando en el puerto ${env.PORT}`);
  console.log(`   Webhook: POST /webhook  |  Verificación: GET /webhook`);
  console.log(`   Panel de control: http://localhost:${env.PORT}/admin`);
  startRemarketingScheduler();
  startQualityScheduler();
});
