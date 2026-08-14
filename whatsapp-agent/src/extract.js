import mammoth from "mammoth";
import * as XLSX from "xlsx";

const MAX_LINK_BYTES = 5 * 1024 * 1024; // 5 MB

/** Extrae texto plano de un archivo subido, según su tipo. */
export async function extractFromFile(buffer, mimeType, filename = "") {
  const ext = (filename.split(".").pop() || "").toLowerCase();

  if (mimeType === "application/pdf" || ext === "pdf") {
    const pdfParse = (await import("pdf-parse")).default;
    const data = await pdfParse(buffer);
    return data.text.trim();
  }

  if (
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    ext === "docx"
  ) {
    const result = await mammoth.extractRawText({ buffer });
    return result.value.trim();
  }

  if (
    mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    mimeType === "application/vnd.ms-excel" ||
    ["xlsx", "xls", "csv"].includes(ext)
  ) {
    const wb = XLSX.read(buffer, { type: "buffer" });
    const parts = wb.SheetNames.map((name) => {
      const sheet = XLSX.utils.sheet_to_csv(wb.Sheets[name]);
      return `--- Hoja: ${name} ---\n${sheet.trim()}`;
    });
    return parts.join("\n\n").trim();
  }

  if (mimeType.startsWith("text/") || ["txt", "md"].includes(ext)) {
    return buffer.toString("utf8").trim();
  }

  throw new Error(
    `Formato no soportado (${mimeType || ext || "desconocido"}). Usa PDF, Word (.docx), Excel (.xlsx/.csv) o texto plano.`,
  );
}

/** Quita etiquetas HTML de forma simple para dejar solo texto legible. */
function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim();
}

/** Descarga un link y extrae su contenido (HTML o PDF). Con topes de tamaño y tiempo. */
export async function extractFromLink(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("El link no es una URL válida");
  }
  if (!/^https?:$/.test(parsed.protocol)) throw new Error("Solo se admiten links http/https");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  let res;
  try {
    res = await fetch(url, { signal: controller.signal, redirect: "follow" });
  } catch (err) {
    throw new Error(`No se pudo abrir el link: ${err.message}`);
  } finally {
    clearTimeout(timeout);
  }
  if (!res.ok) throw new Error(`El link respondió con error ${res.status}`);

  const contentType = res.headers.get("content-type") || "";
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length > MAX_LINK_BYTES) throw new Error("El contenido del link es demasiado grande (máx. 5 MB)");

  if (contentType.includes("application/pdf")) {
    return extractFromFile(buffer, "application/pdf");
  }
  if (contentType.includes("text/html")) {
    return stripHtml(buffer.toString("utf8"));
  }
  if (contentType.startsWith("text/")) {
    return buffer.toString("utf8").trim();
  }
  throw new Error(`No se pudo interpretar el contenido del link (tipo: ${contentType || "desconocido"})`);
}
