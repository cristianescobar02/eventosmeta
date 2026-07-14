import Anthropic from "@anthropic-ai/sdk";
import { env, catalog, getPaymentCombos } from "./config.js";
import { getSetting } from "./settings.js";

const client = new Anthropic();

const RECEIPT_SCHEMA = {
  type: "object",
  properties: {
    es_comprobante: {
      type: "boolean",
      description: "true si la imagen es un comprobante de pago/transferencia",
    },
    monto_detectado: {
      anyOf: [{ type: "string" }, { type: "null" }],
      description: "Monto que aparece en el comprobante, tal cual se lee",
    },
    monto_numerico: {
      anyOf: [{ type: "integer" }, { type: "null" }],
      description:
        "El monto pagado como número entero en pesos, sin puntos ni símbolos (ej: 35100). null si no se puede leer con claridad.",
    },
    medio_pago: {
      anyOf: [{ type: "string" }, { type: "null" }],
      description: "App o banco del comprobante: Nequi, Bancolombia, Daviplata, PSE, etc.",
    },
    destinatario_coincide: {
      type: "boolean",
      description: "true si el destinatario/beneficiario coincide con el titular esperado",
    },
    fecha_visible: {
      anyOf: [{ type: "string" }, { type: "null" }],
      description: "Fecha y hora del comprobante si es visible",
    },
    fecha_es_de_hoy_o_ayer: { type: "boolean" },
    senales_sospechosas: {
      type: "array",
      items: { type: "string" },
      description:
        "Indicios de edición o falsedad: fuentes inconsistentes, alineación rara, artefactos de recorte, montos borrosos, datos que no cuadran, capturas de una pantalla fotografiada, etc.",
    },
    veredicto: {
      type: "string",
      enum: ["aprobado", "revision_manual", "rechazado"],
    },
    motivo: {
      type: "string",
      description: "Explicación breve del veredicto, en español",
    },
  },
  required: [
    "es_comprobante",
    "monto_detectado",
    "monto_numerico",
    "medio_pago",
    "destinatario_coincide",
    "fecha_visible",
    "fecha_es_de_hoy_o_ayer",
    "senales_sospechosas",
    "veredicto",
    "motivo",
  ],
  additionalProperties: false,
};

/**
 * Analiza la captura del comprobante con visión de Claude.
 *
 * ⚠️ IMPORTANTE: el análisis visual detecta inconsistencias evidentes pero NO
 * puede garantizar al 100% que un comprobante sea real (una captura bien
 * falsificada puede pasar). El veredicto "aprobado" exige que todo cuadre; ante
 * cualquier duda devuelve "revision_manual". La verificación definitiva es
 * confirmar el ingreso del dinero en tu cuenta.
 */
export async function validateReceipt({ imageBuffer, mimeType, product }) {
  const hoy = new Date().toLocaleDateString("es-CO", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const combos = product ? getPaymentCombos(product) : [];
  const expected = product
    ? `Producto: ${product.nombre}\nMontos de pago VÁLIDOS (el comprobante debe coincidir con uno EXACTAMENTE):\n${combos
        .map((c) => `- ${c.amount} ${catalog.negocio.moneda} → ${c.label}`)
        .join("\n")}`
    : "No se sabe qué producto está pagando el cliente: si la imagen es un comprobante válido, usa veredicto revision_manual.";

  const metodos = catalog.metodosPago.map((m) => `- ${m.nombre}: ${m.datos}`).join("\n");

  const prompt = `Analiza esta imagen enviada por un cliente de WhatsApp que dice haber pagado un producto digital.

## Datos esperados del pago
${expected}
Titular que debe recibir el dinero: ${catalog.titularCuenta}
Cuentas/medios de pago válidos:
${metodos}
Fecha de hoy: ${hoy} (hora de Colombia)

## Qué debes hacer
1. Determina si la imagen es realmente un comprobante de pago (Nequi, Bancolombia, Daviplata, PSE, etc.).
2. Extrae el monto y ponlo en "monto_numerico" como número entero de pesos (ej: 35100), además del texto en "monto_detectado".
3. Verifica si el destinatario/beneficiario coincide con el titular esperado.
4. Verifica si la fecha es de hoy o de ayer.
5. Busca señales de edición o falsificación: tipografías que no corresponden a la app, desalineaciones, bordes o artefactos de edición, números con estilos mezclados, comprobantes recortados donde se oculta información clave, capturas viejas reutilizadas.

Reporta con honestidad cada campo. El veredicto final lo calcula el sistema a partir de tus datos; para el campo "veredicto" puedes poner tu mejor estimación, pero lo importante es que "monto_numerico", "destinatario_coincide", "fecha_es_de_hoy_o_ayer" y "senales_sospechosas" sean precisos.`;

  const response = await client.messages.create({
    model: getSetting("claudeModelReceipts"),
    max_tokens: 2048,
    output_config: { format: { type: "json_schema", schema: RECEIPT_SCHEMA } },
    messages: [
      {
        role: "user",
        content: [
          mimeType === "application/pdf"
            ? {
                type: "document",
                source: {
                  type: "base64",
                  media_type: "application/pdf",
                  data: imageBuffer.toString("base64"),
                },
              }
            : {
                type: "image",
                source: {
                  type: "base64",
                  media_type: mimeType,
                  data: imageBuffer.toString("base64"),
                },
              },
          { type: "text", text: prompt },
        ],
      },
    ],
  });

  if (response.stop_reason === "refusal") {
    return {
      es_comprobante: false,
      veredicto: "revision_manual",
      motivo: "No se pudo analizar la imagen automáticamente.",
      senales_sospechosas: [],
      monto_detectado: null,
      monto_numerico: null,
      medio_pago: null,
      destinatario_coincide: false,
      fecha_visible: null,
      fecha_es_de_hoy_o_ayer: false,
      combo: null,
    };
  }

  const text = response.content.find((b) => b.type === "text")?.text || "{}";
  const result = JSON.parse(text);

  // El veredicto final se calcula en código a partir de los datos estructurados
  // (más robusto que confiar en el juicio holístico del modelo, y necesario
  // para el condicional de montos con complementos/upsells).
  const decision = decideVerdict(result, combos);
  result.veredicto = decision.veredicto;
  result.motivo = decision.motivo;
  result.combo = decision.combo;

  // Modo estricto: nada se aprueba solo, todo pasa por ti
  if (env.REQUIRE_MANUAL_APPROVAL && result.veredicto === "aprobado") {
    result.veredicto = "revision_manual";
    result.motivo += " (Aprobación manual requerida por configuración)";
  }

  return result;
}

/**
 * Decide el veredicto final a partir de los campos estructurados y las
 * combinaciones de pago válidas del producto.
 * - Banderas graves (no es comprobante, destinatario incorrecto, señales de
 *   edición) → rechazado.
 * - Monto que no coincide con ninguna combinación → revision_manual (podría
 *   ser un pago parcial; mejor revisarlo que perder la venta).
 * - Monto que coincide con exactamente una combinación y todo lo demás bien →
 *   aprobado, con esa combinación (define qué links se entregan).
 */
export function decideVerdict(result, combos) {
  if (!result.es_comprobante) {
    return { veredicto: "rechazado", combo: null, motivo: result.motivo || "La imagen no es un comprobante de pago." };
  }

  const redFlags = [];
  if (!result.destinatario_coincide) redFlags.push("el destinatario no coincide con el titular esperado");
  if (result.senales_sospechosas?.length)
    redFlags.push("señales de posible edición: " + result.senales_sospechosas.join("; "));
  if (redFlags.length) {
    return { veredicto: "rechazado", combo: null, motivo: redFlags.join(". ") };
  }

  if (!combos.length) {
    return { veredicto: "revision_manual", combo: null, motivo: "No hay producto asignado para comparar el monto." };
  }

  const amount = result.monto_numerico;
  if (amount == null) {
    return { veredicto: "revision_manual", combo: null, motivo: "No se pudo leer el monto con claridad." };
  }

  const matches = combos.filter((c) => c.amount === amount);
  if (matches.length === 0) {
    const validos = combos.map((c) => `$${c.amount.toLocaleString("es-CO")}`).join(" o ");
    return {
      veredicto: "revision_manual",
      combo: null,
      motivo: `El monto ($${amount.toLocaleString("es-CO")}) no coincide con ninguna opción válida (${validos}); podría ser un pago parcial.`,
    };
  }
  if (matches.length > 1) {
    return { veredicto: "revision_manual", combo: null, motivo: "El monto coincide con más de una combinación; revisar manualmente." };
  }

  const combo = matches[0];
  if (!result.fecha_es_de_hoy_o_ayer) {
    return { veredicto: "revision_manual", combo, motivo: "La fecha del comprobante no es de hoy ni de ayer." };
  }
  return { veredicto: "aprobado", combo, motivo: `Pago de "${combo.label}" confirmado.` };
}
