import { getPhoneNumberQuality, sendText } from "./whatsapp.js";
import { getSetting } from "./settings.js";
import { getQualityState, setQualityState } from "./db.js";

const LABEL = {
  GREEN: "🟢 Verde (buena)",
  YELLOW: "🟡 Amarilla (atención)",
  RED: "🔴 Roja (riesgo alto)",
  UNKNOWN: "⚪ Desconocida",
};

/**
 * Consulta el Quality Rating del número de WhatsApp y avisa al admin si:
 *  - Bajó de calidad respecto a la última vez, o
 *  - Está en Amarillo/Rojo (independientemente de si bajó o no).
 * Así te enteras a tiempo de ajustar el remarketing antes de que empeore.
 */
export async function runQualityCheck() {
  if (!getSetting("adminWhatsapp")) return;

  let current;
  try {
    current = await getPhoneNumberQuality();
  } catch (err) {
    console.error("No se pudo consultar el Quality Rating:", err.message);
    return;
  }

  const previous = getQualityState();
  const worsened =
    previous && rank(current.quality) < rank(previous.quality);
  const isRisky = current.quality === "YELLOW" || current.quality === "RED";

  console.log(
    `📶 Quality Rating: ${current.quality} (límite: ${current.limitTier})`,
  );

  if (worsened || (isRisky && shouldReAlert(previous))) {
    const msg = [
      `📶 Alerta de calidad de tu número de WhatsApp`,
      ``,
      `Calidad actual: ${LABEL[current.quality] || current.quality}`,
      `Límite de mensajería: ${current.limitTier}`,
      previous ? `Calidad anterior: ${LABEL[previous.quality] || previous.quality}` : "",
      ``,
      isRisky
        ? "⚠️ Considera reducir la frecuencia del remarketing por unos días hasta que mejore."
        : "",
    ]
      .filter(Boolean)
      .join("\n");

    await sendText(getSetting("adminWhatsapp"), msg).catch((err) =>
      console.error("No se pudo notificar la calidad al admin:", err.message),
    );
  }

  setQualityState({ quality: current.quality, limitTier: current.limitTier });
}

function rank(quality) {
  return { GREEN: 2, YELLOW: 1, RED: 0, UNKNOWN: 2 }[quality] ?? 2;
}

/** No repetir la misma alerta de riesgo más de una vez cada 24h. */
function shouldReAlert(previous) {
  if (!previous?.checkedAt) return true;
  return Date.now() - previous.checkedAt > 24 * 60 * 60 * 1000;
}

export function startQualityScheduler(intervalMs = 6 * 60 * 60 * 1000) {
  runQualityCheck().catch((err) => console.error("Quality check inicial:", err));
  setInterval(() => {
    runQualityCheck().catch((err) => console.error("Quality check:", err));
  }, intervalMs);
  console.log("📶 Monitoreo de Quality Rating activo (cada 6h)");
}
