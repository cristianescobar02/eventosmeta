import Anthropic from "@anthropic-ai/sdk";
import { env, catalog, getProduct, loadKnowledge } from "./config.js";

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
    focus = `
## Producto que le interesa a este cliente
Nombre: ${product.nombre}
Precio: ${product.precioTexto} (pago único)
${knowledge ? `\n## Base de conocimiento del producto (usa SOLO esta información para responder preguntas del producto)\n${knowledge}` : ""}`;
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

/**
 * Genera la respuesta del agente para un mensaje del cliente.
 * `contact.history` guarda la conversación (roles user/assistant).
 */
export async function agentReply(contact) {
  const system = buildSystemPrompt(contact);

  const messages = contact.history.slice(-30).map((m) => ({
    role: m.role,
    content: m.content,
  }));

  // La API exige que el primer mensaje sea del usuario
  while (messages.length && messages[0].role !== "user") messages.shift();
  if (!messages.length) return null;

  const model = env.CLAUDE_MODEL_CHAT;
  // Haiku no soporta "thinking" adaptativo — solo lo activamos en modelos que lo aceptan
  const supportsThinking = !model.includes("haiku");

  const response = await client.messages.create({
    model,
    max_tokens: 1024,
    ...(supportsThinking ? { thinking: { type: "adaptive" } } : {}),
    system: [
      {
        type: "text",
        text: system,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages,
  });

  if (response.stop_reason === "refusal") {
    return "Dame un momento y te confirmo esa información 😊";
  }

  const text = response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  return text || null;
}
