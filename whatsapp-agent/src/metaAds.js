import { getSetting } from "./settings.js";

const GRAPH = "https://graph.facebook.com/v21.0";

// Cache en memoria: un mismo anuncio suele traer a cientos de clientes,
// no tiene sentido pedirle a Meta el mismo dato una y otra vez.
const cache = new Map();

/**
 * Busca el nombre real del anuncio/conjunto/campaña en la Marketing API de
 * Meta a partir del ID que llega en el `referral` de WhatsApp. Requiere un
 * token con permiso `ads_read` (metaAdsToken) — si no está configurado,
 * simplemente no se enriquece (no rompe nada).
 */
export async function getAdInfo(adId) {
  if (!adId) return null;
  const token = getSetting("metaAdsToken");
  if (!token) return null;

  if (cache.has(adId)) return cache.get(adId);

  try {
    const res = await fetch(
      `${GRAPH}/${adId}?fields=name,adset{name},campaign{name}&access_token=${encodeURIComponent(token)}`,
    );
    if (!res.ok) {
      console.error(`Meta Ads API ${res.status} para ad ${adId}: ${await res.text().catch(() => "")}`);
      cache.set(adId, null);
      return null;
    }
    const data = await res.json();
    const info = {
      adName: data.name || "",
      adSetName: data.adset?.name || "",
      campaignName: data.campaign?.name || "",
    };
    cache.set(adId, info);
    return info;
  } catch (err) {
    console.error("No se pudo consultar Meta Ads API:", err.message);
    return null;
  }
}
