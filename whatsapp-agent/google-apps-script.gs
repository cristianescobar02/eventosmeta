/**
 * 📄 AGENTE WHATSAPP → GOOGLE SHEETS
 *
 * Cómo instalarlo (5 minutos):
 * 1. Crea una hoja de cálculo nueva en Google Sheets.
 * 2. Menú: Extensiones → Apps Script. Borra lo que haya y pega TODO este archivo.
 * 3. Cambia SECRET por una clave que tú inventes (la misma va en el .env del bot
 *    como SHEETS_SECRET).
 * 4. Botón "Implementar" → Nueva implementación → tipo "Aplicación web":
 *      - Ejecutar como: Tú
 *      - Quién tiene acceso: Cualquier persona
 * 5. Copia la URL que te da (termina en /exec) y ponla en el .env del bot como
 *    SHEETS_WEBHOOK_URL. Reinicia el bot y listo.
 *
 * Qué crea automáticamente:
 *   - Una pestaña "VENTAS — <producto>" por cada producto, con cada venta.
 *   - Una pestaña "LEADS" con cada persona que llega desde un anuncio.
 *   - Una pestaña "RESUMEN ADS" con leads, ventas, conversión y facturación
 *     por anuncio y por producto, para decidir qué ad escalar o apagar.
 */

var SECRET = "cambia-esta-clave";

var HEADERS_VENTAS = [
  "Fecha", "Nombre", "Teléfono", "Pagó", "Método de pago",
  "Ad (ID)", "Ad (titular)", "Ad (texto)", "Ad (nombre)", "Conjunto de anuncios", "Campaña",
  "Keyword", "Aprobación", "Seguimientos", "Mensajes", "Horas hasta compra"
];

var HEADERS_LEADS = [
  "Fecha", "Nombre", "Teléfono", "Producto",
  "Keyword", "Ad (ID)", "Ad (titular)", "Ad (texto)", "Ad (nombre)", "Conjunto de anuncios", "Campaña",
  "Ad (URL)"
];

var HEADERS_RESUMEN = [
  "Producto", "Ad (ID)", "Ad (titular)",
  "Leads", "Ventas", "% Conversión", "Facturación"
];

function doPost(e) {
  var out = { ok: false };
  try {
    var data = JSON.parse(e.postData.contents);
    if (data.secret !== SECRET) {
      return respond({ ok: false, error: "secret inválido" });
    }
    if (data.tipo === "venta") registrarVenta(data);
    else if (data.tipo === "lead") registrarLead(data);
    else return respond({ ok: false, error: "tipo desconocido" });

    actualizarResumen();
    out.ok = true;
  } catch (err) {
    out.error = String(err);
  }
  return respond(out);
}

function respond(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function getSheet(name, headers) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold");
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function registrarVenta(d) {
  var sheet = getSheet("VENTAS — " + d.producto, HEADERS_VENTAS);
  sheet.appendRow([
    d.fecha, d.nombre, "+" + d.telefono, d.pago, d.metodoPago,
    d.adId, d.adTitular, d.adTexto, d.nombreAd, d.conjuntoAnuncios, d.campana,
    d.keyword, d.aprobacion, d.seguimientos, d.mensajes, d.horasHastaCompra
  ]);
}

function registrarLead(d) {
  var sheet = getSheet("LEADS", HEADERS_LEADS);
  sheet.appendRow([
    d.fecha, d.nombre, "+" + d.telefono, d.producto,
    d.keyword, d.adId, d.adTitular, d.adTexto, d.nombreAd, d.conjuntoAnuncios, d.campana,
    d.adUrl
  ]);
}

/** Reconstruye RESUMEN ADS: leads, ventas, conversión y facturación por ad. */
function actualizarResumen() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var stats = {}; // clave: producto | adId

  function key(producto, adId, adTitular) {
    return producto + "||" + (adId || "(orgánico)") + "||" + (adTitular || "");
  }

  var leads = ss.getSheetByName("LEADS");
  if (leads) {
    var rows = leads.getDataRange().getValues();
    for (var i = 1; i < rows.length; i++) {
      var k = key(rows[i][3], rows[i][5], rows[i][6]);
      if (!stats[k]) stats[k] = { leads: 0, ventas: 0, plata: 0 };
      stats[k].leads++;
    }
  }

  ss.getSheets().forEach(function (sheet) {
    var name = sheet.getName();
    if (name.indexOf("VENTAS — ") !== 0) return;
    var producto = name.substring("VENTAS — ".length);
    var rows = sheet.getDataRange().getValues();
    for (var i = 1; i < rows.length; i++) {
      var k = key(producto, rows[i][5], rows[i][6]);
      if (!stats[k]) stats[k] = { leads: 0, ventas: 0, plata: 0 };
      stats[k].ventas++;
      stats[k].plata += Number(rows[i][3]) || 0;
    }
  });

  var resumen = getSheet("RESUMEN ADS", HEADERS_RESUMEN);
  if (resumen.getLastRow() > 1) {
    resumen.getRange(2, 1, resumen.getLastRow() - 1, HEADERS_RESUMEN.length).clearContent();
  }
  var out = [];
  Object.keys(stats).sort().forEach(function (k) {
    var parts = k.split("||");
    var s = stats[k];
    var conv = s.leads ? s.ventas / s.leads : "";
    out.push([parts[0], parts[1], parts[2], s.leads, s.ventas, conv, s.plata]);
  });
  if (out.length) {
    resumen.getRange(2, 1, out.length, HEADERS_RESUMEN.length).setValues(out);
    resumen.getRange(2, 6, out.length, 1).setNumberFormat("0.0%");
  }
}
