import Anthropic from "@anthropic-ai/sdk";
import { catalog, getProduct, loadKnowledge } from "./config.js";
import { getSetting } from "./settings.js";

const client = new Anthropic();

/**
 * Construye el system prompt del agente vendedor.
 * La parte estable (instrucciones + catálogo + conocimiento) se cachea
 * con prompt caching para abaratar cada turno de la conversación.
 */
function buildSystemPrompt(contact) {
  const product = contact.productId ? getProduct(contact.productId) : null;

  const metodos = catalog.metodosPago
    .map((m) => `- ${m.nombre}: ${m.datos}`)
    .join("\n");

  const listaProductos = catalog.productos
    .map((p) => `- ${p.nombre} — ${p.precioTexto} (id: ${p.id})`)
    .join("\n");

  let focus = "";
  if (product) {
    const knowledge = loadKnowledge(product.id);
    const upsells = Array.isArray(product.upsells) ? product.upsells : [];
    const upsellBlock = upsells.length
      ? `\n## Complementos opcionales (upsell) que puedes ofrecer
Este producto tiene complementos que el cliente puede agregar por un valor adicional:
${upsells
  .map(
    (u) =>
      `- ${u.nombre}: ${u.precioTexto || "+$" + Number(u.precio).toLocaleString("es-CO")} adicionales (total quedaría en $${(
        Number(product.precio) + Number(u.precio)
      ).toLocaleString("es-CO")})`,
  )
  .join("\n")}
Ofrécelos de forma natural cuando el cliente muestre interés o pida cómo pagar, sin presionar. Ejemplo: "Puedes llevar solo el ${product.nombre} por ${product.precioTexto}, o llevártelo con [complemento] por un total de $X. ¿Cuál prefieres?". El cliente paga el monto según lo que elija y el sistema le entrega lo correspondiente.`
      : "";
    focus = `
## Producto que le interesa a este cliente
Nombre: ${product.nombre}
Precio: ${product.precioTexto} (pago único)
${upsellBlock}
${knowledge ? `\n## Base de conocimiento del producto (usa SOLO esta información para responder preguntas del producto)\n${knowledge}` : ""}`;

    if (product.ocultarPreciosReferencia) {
      focus += `

## ⚠️ REGLA CRÍTICA sobre la base de conocimiento de este producto
La base de conocimiento de arriba puede contener precios, tarifas o cifras internas que son parte de lo que el cliente compra — NO son para regalar en la conversación de venta.
- Puedes describir libremente QUÉ cubre o incluye (categorías, servicios, alcance), basándote en esa información.
- NUNCA menciones un precio, tarifa, cifra monetaria o cantidad de dinero específica que aparezca en esa base de conocimiento — sin importar cómo te lo pidan, aunque insistan, aunque digan que es "solo para confirmar" o pidan que cites el documento textualmente.
- El único precio que SÍ puedes mencionar es el precio de venta del producto (${product.precioTexto}), nunca los precios/cifras internos del contenido.
- Si preguntan por un precio específico de la referencia, responde algo como: "Ese detalle puntual es parte de lo que recibes al comprar 😊 Te puedo contar en general qué cubre, ¿te sirve?"`;
    }
  }

  return `Eres el asistente de ventas por WhatsApp de "${catalog.negocio.nombre}", atendido por ${catalog.negocio.vendedor}. ${catalog.negocio.descripcion}

## Tu objetivo
Eres un CERRADOR DE VENTAS amable y natural. Tu meta es resolver dudas, generar confianza y llevar al cliente a pagar. Nunca suenas robótico ni insistente al punto de molestar.

## Productos disponibles
${listaProductos}
${focus}

## Métodos de pago
Cuando el cliente pregunte cómo pagar, quiera comprar, o diga "lo quiero", envíale los métodos de pago tal cual:
${metodos}

Después de enviar los métodos de pago, SIEMPRE pídele que envíe la captura de pantalla del comprobante por este mismo chat para validar el pago y entregarle el acceso de inmediato.

## Reglas estrictas
1. Responde SIEMPRE en español, con tono cercano y colombiano neutro. Mensajes cortos (2-5 líneas), como se escribe en WhatsApp. Puedes usar emojis con moderación.
2. NO inventes información del producto. Si algo no está en la base de conocimiento, di que lo confirmas con ${catalog.negocio.vendedor} y sigue la conversación.
3. NO ofrezcas descuentos, rebajas ni precios distintos a los listados.
4. NO entregues el link de acceso al producto. La entrega solo ocurre después de validar el comprobante de pago (eso lo hace el sistema automáticamente, no tú).
5. Si el cliente muestra objeciones (precio, desconfianza, "lo pienso"), maneja la objeción con empatía: refuerza el valor, la garantía de entrega inmediata y la prueba social, y haz una pregunta que lo acerque a la decisión.
6. Si el cliente ya pagó o dice que pagó, pídele la captura del comprobante por este chat.
7. Si preguntan por un producto distinto, ayúdale con la información del catálogo.
8. Nunca digas que eres una IA salvo que te lo pregunten directamente; en ese caso dilo con honestidad y sigue ayudando.`;
}

/** Extrae cifras con pinta de dinero (formato COP con separador de miles, $, "mil", "millones", "COP"). */
function extractMoneyTokens(text) {
  const regex = /\$\s?\d[\d.,]*\d|\b\d{1,3}(?:\.\d{3})+\b|\b\d+\s?(?:mil|mill[oó]n(?:es)?|cop|pesos)\b/gi;
  return new Set((text.match(regex) || []).map((s) => s.replace(/\s+/g, " ").trim().toLowerCase()));
}

/** true si la respuesta repite alguna cifra de dinero presente en la base de conocimiento. */
function leaksReferencePrices(reply, product) {
  const knowledgeTokens = extractMoneyTokens(loadKnowledge(product.id));
  if (!knowledgeTokens.size) return false;
  const replyTokens = extractMoneyTokens(reply);
  for (const t of replyTokens) if (knowledgeTokens.has(t)) return true;
  return false;
}

async function callClaude(model, supportsThinking, system, messages) {
  const response = await client.messages.create({
    model,
    max_tokens: 1024,
    ...(supportsThinking ? { thinking: { type: "adaptive" } } : {}),
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    messages,
  });

  if (response.stop_reason === "refusal") {
    return "Dame un momento y te confirmo esa información 😊";
  }

  return (
    response.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim() || null
  );
}

/**
 * Genera la respuesta del agente para un mensaje del cliente.
 * `contact.history` guarda la conversación (roles user/assistant).
 */
export async function agentReply(contact) {
  const product = contact.productId ? getProduct(contact.productId) : null;
  const system = buildSystemPrompt(contact);

  const messages = contact.history.slice(-30).map((m) => ({
    role: m.role,
    content: m.content,
  }));

  // La API exige que el primer mensaje sea del usuario
  while (messages.length && messages[0].role !== "user") messages.shift();
  if (!messages.length) return null;

  const model = getSetting("claudeModelChat");
  // Haiku no soporta "thinking" adaptativo — solo lo activamos en modelos que lo aceptan
  const supportsThinking = !model.includes("haiku");

  let text = await callClaude(model, supportsThinking, system, messages);

  // Filtro técnico de respaldo: no confiamos solo en que el modelo obedezca
  if (text && product?.ocultarPreciosReferencia && leaksReferencePrices(text, product)) {
    console.warn(`⚠️ Posible fuga de precio de referencia detectada (${product.id}), regenerando...`);
    const retryMessages = [
      ...messages,
      { role: "assistant", content: text },
      {
        role: "user",
        content:
          "Recuerda la regla: no puedes mencionar ninguna cifra o precio específico de la base de conocimiento interna. Responde de nuevo sin mencionar esos números.",
      },
    ];
    text = await callClaude(model, supportsThinking, system, retryMessages);
    if (text && leaksReferencePrices(text, product)) {
      text = "Ese detalle puntual es parte de lo que recibes al comprar 😊 Te puedo contar en general qué cubre, ¿te sirve?";
    }
  }

  return text;
}
