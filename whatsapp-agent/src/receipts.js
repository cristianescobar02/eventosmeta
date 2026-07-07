import Anthropic from "@anthropic-ai/sdk";
import { env, catalog } from "./config.js";

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
    monto_coincide: {
      type: "boolean",
      description: "true si el monto coincide con el precio esperado del producto",
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
    "monto_coincide",
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

  const expected = product
    ? `Producto: ${product.nombre}\nPrecio exacto esperado: ${product.precioTexto} (${product.precio} ${catalog.negocio.moneda})`
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
2. Extrae monto, destinatario y fecha.
3. Compara contra los datos esperados. El monto debe coincidir EXACTAMENTE con el precio.
4. Busca señales de edición o falsificación: tipografías que no corresponden a la app, desalineaciones, bordes o artefactos de edición, números con estilos mezclados, comprobantes recortados donde se oculta información clave, capturas viejas reutilizadas.
5. Emite el veredicto:
   - "aprobado": es un comprobante claro, monto y destinatario coinciden, fecha de hoy o ayer, sin ninguna señal sospechosa.
   - "revision_manual": es un comprobante pero algo no se puede confirmar (fecha no visible, destinatario recortado, calidad baja) o hay dudas leves.
   - "rechazado": no es un comprobante, el monto/destinatario no coinciden, o hay señales claras de edición.

Sé estricto: ante la duda, prefiere "revision_manual" en lugar de "aprobado".`;

  const response = await client.messages.create({
    model: env.CLAUDE_MODEL,
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
      monto_coincide: false,
      destinatario_coincide: false,
      fecha_visible: null,
      fecha_es_de_hoy_o_ayer: false,
    };
  }

  const text = response.content.find((b) => b.type === "text")?.text || "{}";
  const result = JSON.parse(text);

  // Modo estricto: nada se aprueba solo, todo pasa por ti
  if (env.REQUIRE_MANUAL_APPROVAL && result.veredicto === "aprobado") {
    result.veredicto = "revision_manual";
    result.motivo += " (Aprobación manual requerida por configuración)";
  }

  return result;
}
