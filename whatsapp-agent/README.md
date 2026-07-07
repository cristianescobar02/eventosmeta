# 🤖 Agente de WhatsApp para venta de productos digitales

Agente completo de ventas por WhatsApp (API oficial de Meta + Claude) que cubre todo el ciclo:

1. **Flujo de inicio por palabra clave** — el cliente llega desde el anuncio (Click to WhatsApp), escribe la palabra clave y recibe la secuencia de mensajes del producto.
2. **Cerrador de ventas con IA** — responde preguntas usando SOLO la base de conocimiento de cada producto (archivos en `knowledge/`), maneja objeciones y lleva al cliente al pago.
3. **Métodos de pago** — cuando el cliente pregunta cómo pagar, el agente envía tus cuentas (Nequi, Bancolombia, etc.) y pide la captura del comprobante.
4. **Validación de comprobantes** — analiza la captura con visión de Claude: monto exacto, destinatario, fecha y señales de edición/falsificación.
5. **Entrega automática** — si el comprobante es válido, envía el link de Google Drive del producto y etiqueta al cliente como `comprador`.
6. **Remarketing en la ventana de 24h** — a los que NO compraron les envía mensajes de seguimiento (ej. a las 4h, 12h y 22h) antes de que WhatsApp cierre la ventana de 24 horas.

## Requisitos

- Node.js 20 o superior
- Una app de WhatsApp Business en [Meta for Developers](https://developers.facebook.com) (API Cloud oficial)
- Una API key de Anthropic ([console.anthropic.com](https://console.anthropic.com))
- Un servidor con URL pública HTTPS (Railway, Render, un VPS, o ngrok para pruebas)

## Instalación

```bash
cd whatsapp-agent
npm install
cp .env.example .env   # y llena tus datos
npm start
```

## Configuración paso a paso

### 1. WhatsApp Cloud API (Meta)

1. En [developers.facebook.com](https://developers.facebook.com) crea una app tipo **Business** y agrega el producto **WhatsApp**.
2. Copia el **Phone Number ID** y un **token permanente** (crea un System User en Business Settings → System Users con permiso `whatsapp_business_messaging`) al `.env`.
3. En WhatsApp → Configuration → Webhook pon:
   - **Callback URL**: `https://TU-DOMINIO/webhook`
   - **Verify token**: el mismo valor que pusiste en `WHATSAPP_VERIFY_TOKEN`
   - Suscríbete al campo **messages**.

### 2. Productos (`config/products.json`)

Edita el archivo con tus datos reales:

- `negocio` y `metodosPago`: tu información y tus cuentas.
- `titularCuenta`: el nombre que debe aparecer como destinatario en los comprobantes.
- Por cada producto: `id`, `nombre`, `keywords` (las palabras clave de tus anuncios), `precio` exacto, `driveLink` (enlace de Google Drive con el acceso) y:
  - `flujoInicio`: la secuencia de mensajes que se envía cuando llega la palabra clave. Variables disponibles: `{negocio}`, `{producto}`, `{precio}`.
  - `remarketing`: mensajes de seguimiento con la hora (desde el último mensaje del cliente) a la que se envían.

> 💡 **Tip para el link de Drive**: configura el archivo/carpeta como "Cualquier persona con el enlace puede ver" y desactiva la descarga/copia si quieres más control, o usa un Drive por producto.

### 3. Base de conocimiento (`knowledge/`)

Crea una carpeta por producto con el mismo `id` de `products.json` y coloca dentro archivos `.md` o `.txt` con TODO lo que el agente debe saber: qué incluye, para quién es, preguntas frecuentes, testimonios, garantías. **El agente solo responde con esta información y no inventa nada.**

```
knowledge/
├── curso-ejemplo/
│   └── producto.md
└── otro-producto/
    ├── info.md
    └── faq.md
```

### 4. Anuncios (Click to WhatsApp)

En tu anuncio de Meta configura el mensaje pre-llenado con la palabra clave del producto (ej. "CURSO"). Cuando el cliente lo envíe, el bot dispara el flujo de inicio de ese producto automáticamente. El bot también lee el objeto `referral` del webhook y etiqueta al contacto con el ID del anuncio (`ad:<id>`).

## Panel de control (visual de conversaciones)

En `https://tu-servidor/admin` tienes un panel web para controlar cada conversación en tiempo real:

- **KPIs**: contactos totales, en conversación, pagos pendientes, compradores y ventanas de 24h abiertas.
- **Lista de conversaciones** con buscador y filtros por etapa, vista del último mensaje, etiquetas, producto y **tiempo restante de la ventana de 24h** de cada contacto.
- **Chat completo** de cada cliente con burbujas estilo WhatsApp (se actualiza solo cada 4 segundos).
- **Tomar el control**: botón *⏸ Pausar bot* — el agente deja de responder automáticamente (y se detiene el remarketing para ese contacto) y tú escribes directamente desde el panel. *▶️ Reanudar bot* devuelve el control a la IA.
- **✅ Aprobar pago**: entrega el producto y etiqueta como comprador (equivale al comando `APROBAR` por WhatsApp).
- **Etiquetas**: agrega o quita etiquetas con un clic, y reasigna el producto del contacto.

Para activarlo, define `DASHBOARD_PASSWORD` en el `.env`. Sin contraseña configurada el panel queda desactivado. Funciona en celular y computador, con modo claro y oscuro.

## Cómo funciona la validación de comprobantes

Cuando el cliente envía una imagen, el bot la descarga y la analiza con visión de Claude comparándola contra el precio del producto, el titular de tus cuentas y la fecha actual. El resultado es uno de tres veredictos:

| Veredicto | Acción |
|---|---|
| `aprobado` | Envía el link de Drive y etiqueta `comprador` |
| `revision_manual` | Avisa al cliente que está en verificación y te notifica a tu WhatsApp (`ADMIN_WHATSAPP`) |
| `rechazado` | Pide un comprobante válido y te notifica |

Para aprobar manualmente un pago en revisión, responde desde tu número de admin:

```
APROBAR 573001234567
```

> ⚠️ **Importante sobre seguridad**: el análisis visual detecta montos incorrectos, destinatarios que no coinciden y señales evidentes de edición, pero **ninguna IA puede garantizar al 100% que una captura sea real** — una falsificación bien hecha puede pasar. Recomendaciones:
> - Para productos de mayor valor, activa `REQUIRE_MANUAL_APPROVAL=true` en el `.env`: todo comprobante pasará por ti antes de entregar.
> - La verificación definitiva siempre es **ver el dinero en tu cuenta**.
> - Considera migrar a un link de pago con confirmación automática (Wompi, Mercado Pago, PayU) cuando el volumen lo justifique.

## Cómo funciona el remarketing

- Cada mensaje del cliente reabre la ventana de 24h y reinicia la secuencia de seguimiento.
- El scheduler revisa cada minuto qué contactos **no etiquetados como `comprador`** tienen mensajes pendientes y los envía en los horarios configurados.
- Nunca envía nada después de las 23.5h del último mensaje del cliente (margen de seguridad sobre la ventana de 24h de WhatsApp).
- Si el cliente escribe "STOP" o similar, se etiqueta `no_contactar` y no recibe más seguimientos.

> 📌 Después de que la ventana de 24h se cierra, WhatsApp solo permite **plantillas aprobadas** (Message Templates, con costo). Este bot llega hasta el límite de la ventana gratuita; si quieres re-contactar después, crea una plantilla de marketing en el administrador de WhatsApp y se puede agregar el envío.

## Registro automático en Google Sheets (leads y ventas por producto)

Cada lead y cada venta se registran solos en una hoja de cálculo tuya:

- **`VENTAS — <producto>`** (una pestaña por producto): fecha, nombre, teléfono, monto pagado, método de pago detectado en el comprobante, **ad que lo trajo** (ID, titular y texto del anuncio), keyword, si la aprobación fue automática o manual, seguimientos que recibió, cantidad de mensajes y horas desde el primer contacto hasta la compra.
- **`LEADS`**: cada persona que llega (con su ad de origen) — con esto calculas el % de conversión real por anuncio.
- **`RESUMEN ADS`** (se recalcula solo): leads, ventas, % de conversión y facturación **por anuncio y por producto** — tu tablero para decidir qué ad escalar y cuál apagar.

**Instalación (5 min):**
1. Crea una hoja de cálculo en Google Sheets → Extensiones → Apps Script.
2. Pega el contenido de [`google-apps-script.gs`](./google-apps-script.gs) y cambia la variable `SECRET` por una clave tuya.
3. Implementar → Nueva implementación → Aplicación web → *Ejecutar como: tú* / *Acceso: cualquier persona* → copia la URL `/exec`.
4. En el `.env` del bot: `SHEETS_WEBHOOK_URL=<esa URL>` y `SHEETS_SECRET=<tu clave>`.

Si Sheets falla o no está configurado, el bot sigue funcionando normal (el registro nunca bloquea una conversación).

> 💡 Para completar tu análisis de ROAS diario (gasto vs facturación, como lo llevas hoy), agrega el gasto publicitario del día en una columna manual o con el reporte de Meta; la facturación, #ventas y #conversaciones ya te las da el RESUMEN y las pestañas automáticas.

## Etiquetas que maneja el bot

| Etiqueta | Significado |
|---|---|
| `interesado:<producto>` | Llegó por la palabra clave de ese producto |
| `ad:<id>` | ID del anuncio de Meta del que vino |
| `comprador` / `comprador:<producto>` | Pago validado y producto entregado |
| `revision_manual` | Envió comprobante pendiente de tu aprobación |
| `comprobante_rechazado` | Envió un comprobante inválido |
| `no_contactar` | Pidió no recibir más mensajes |

Los datos se guardan en `data/db.json` (contactos, etiquetas e historial de conversación).

## Estructura del proyecto

```
whatsapp-agent/
├── src/
│   ├── server.js        # Express: webhook de Meta (verificación + mensajes)
│   ├── dashboard.js     # API del panel de control (/admin)
│   ├── router.js        # Orquestador: keywords, texto→agente, imagen→validación
│   ├── agent.js         # Cerrador de ventas con Claude + base de conocimiento
│   ├── receipts.js      # Validación de comprobantes con visión (JSON estructurado)
│   ├── remarketing.js   # Seguimientos antes del cierre de la ventana de 24h
│   ├── sheets.js        # Registro de leads/ventas en Google Sheets
│   ├── whatsapp.js      # Cliente de la Cloud API (enviar, marcar leído, descargar media)
│   ├── db.js            # Persistencia simple en JSON (contactos, tags, historial)
│   └── config.js        # Variables de entorno + catálogo de productos
├── public/dashboard.html # Interfaz del panel de control
├── config/products.json # Tus productos, precios, flujos y remarketing
├── knowledge/           # Base de conocimiento por producto (.md/.txt)
└── data/db.json         # Base de datos (se crea sola, no se sube a git)
```

## Probar en local

```bash
npm start
# en otra terminal:
npx ngrok http 3000
# usa la URL https de ngrok como Callback URL del webhook en Meta
```
