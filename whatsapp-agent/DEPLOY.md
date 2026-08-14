# 🚀 Guía de despliegue (paso a paso, sin conocimientos técnicos)

Vas a poner el bot en línea 24/7. Son 3 fases. Hazlas en orden.

> 🔐 **Regla de oro de seguridad**: los tokens y claves (WhatsApp, Anthropic) se
> pegan SOLO en las variables de entorno del servidor. **Nunca** los pegues en un
> chat ni los subas a GitHub.

---

## FASE 1 — Conseguir la API key de Claude (5 min)

El bot usa Claude para conversar y validar comprobantes.

1. Entra a **https://console.anthropic.com** y crea una cuenta.
2. Ve a **Billing** y agrega un método de pago (se paga por uso, unos centavos
   por conversación; puedes ponerle un límite mensual).
3. Ve a **API Keys** → **Create Key** → cópiala (empieza por `sk-ant-...`).
4. Guárdala en un lugar seguro. La usarás en la Fase 3.

---

## FASE 2 — Desplegar el bot en Railway (10 min)

Railway mantiene el bot encendido siempre (necesario para recibir mensajes y
para el remarketing). Cuesta ~5 USD/mes tras el crédito de prueba.

1. Entra a **https://railway.app** → **Login with GitHub** (usa la cuenta donde
   está el repositorio `eventosmeta`).
2. **New Project** → **Deploy from GitHub repo** → elige `cristianescobar02/eventosmeta`.
3. Cuando cargue el proyecto, entra al servicio y ve a **Settings**:
   - **Source → Branch**: selecciona `claude/whatsapp-digital-products-agent-3079fo`
   - **Source → Root Directory**: escribe `whatsapp-agent`
   - (Railway detecta Node y usará `npm start` automáticamente.)
4. Ve a la pestaña **Variables** y agrega estas (con el botón *New Variable*).
   Deja en blanco las que aún no tengas; las completas en la Fase 3:

   | Variable | Valor |
   |---|---|
   | `ANTHROPIC_API_KEY` | tu key de la Fase 1 (`sk-ant-...`) |
   | `CLAUDE_MODEL_CHAT` | `claude-haiku-4-5` *(económico, para la conversación)* |
   | `CLAUDE_MODEL_RECEIPTS` | `claude-opus-4-8` *(precisión, para validar comprobantes)* |
   | `WHATSAPP_VERIFY_TOKEN` | inventa una palabra, ej. `mi-token-123` |
   | `DASHBOARD_PASSWORD` | inventa una clave para tu panel |
   | `SHEETS_WEBHOOK_URL` | la URL `/exec` de Google (ya la tienes) |
   | `SHEETS_SECRET` | la misma clave que pusiste en el Apps Script |
   | `WHATSAPP_TOKEN` | *(vacío por ahora — Fase 3)* |
   | `WHATSAPP_PHONE_NUMBER_ID` | *(vacío por ahora — Fase 3)* |
   | `ADMIN_WHATSAPP` | tu número con código de país, ej. `573001112233` |
   | `DATA_DIR` | `/data` *(dónde se guarda todo lo que generas en vivo)* |

5. Ve a **Settings → Networking → Generate Domain**. Railway te da una URL
   pública, ej. `https://eventosmeta-production.up.railway.app`. **Cópiala.**
6. **(IMPORTANTE) Settings → Volumes → Add Volume**, punto de montaje **`/data`**
   (el mismo valor que pusiste en la variable `DATA_DIR`). Este volumen conserva
   **todo lo que generas en vivo**: contactos, historial, los productos y la
   base de conocimiento que edites desde el panel, y la configuración de la
   pestaña Integraciones. **Sin este volumen, cada redeploy borra todo eso** y
   tendrías que volver a crearlo. Las ventas igual quedan en Google Sheets, pero
   no te saltes este paso: es lo que hace que tu configuración sea permanente.

   > El bot siembra automáticamente el producto de ejemplo la primera vez. Al
   > montar el volumen vacío, arranca con ese ejemplo; luego todo lo que crees
   > queda guardado en el volumen.

Tu bot ya está en línea. La URL del webhook será: **`<tu-URL-de-Railway>/webhook`**

---

## FASE 3 — Conectar WhatsApp (Meta) (20 min)

1. Entra a **https://developers.facebook.com** → **My Apps** → **Create App** →
   tipo **Business**.
2. En el panel, agrega el producto **WhatsApp**. Meta te da un **número de prueba**
   gratis para empezar.
3. En **WhatsApp → API Setup** copia el **Phone Number ID** y pégalo en Railway
   como `WHATSAPP_PHONE_NUMBER_ID`.
4. **Token permanente** (el de esa pantalla dura 24h): ve a
   **Business Settings → System Users** → crea uno → asígnale la app con permiso
   `whatsapp_business_messaging` → **Generate Token** → pégalo en Railway como
   `WHATSAPP_TOKEN`.
5. Vuelve a **WhatsApp → Configuration → Webhook** → **Edit**:
   - **Callback URL**: `<tu-URL-de-Railway>/webhook`
   - **Verify token**: el mismo valor de `WHATSAPP_VERIFY_TOKEN`
   - **Verify and Save** (el bot responde el reto solo).
   - En **Webhook fields**, suscríbete a **messages**.
6. En **API Setup**, en "To", agrega tu número personal para poder probar
   (con el número de prueba solo puedes escribirte a números que registres).

---

## Probar que todo funciona

1. Desde tu celular, escríbele al número del bot la palabra clave de un producto
   (ej. `CURSO`). Debe llegarte el flujo de inicio.
2. Revisa tu **Google Sheet** → debe aparecer una fila en la pestaña **LEADS**.
3. Entra a `<tu-URL-de-Railway>/admin`, ingresa tu `DASHBOARD_PASSWORD` y verás
   la conversación en vivo.
4. Envía una imagen cualquiera → el bot intenta validarla como comprobante.

---

## Pasar a producción (cuando ya funcione con el número de prueba)

- Conecta tu **número real** (no debe estar activo en la app normal de WhatsApp).
- Verifica tu **Meta Business** (Business Settings → Security Center).
- Pon la app en modo **Live**.
- Sin verificar: hasta 250 conversaciones nuevas/día. Verificado: 1.000/día y sube solo.

## Antes de lanzar campañas

- Llena `config/products.json` con tus productos, precios, keywords y links de Drive.
- Crea las carpetas `knowledge/<producto>/` con la info real de cada uno.
- Empieza con poco presupuesto de ads y sube gradualmente (calienta el número).
