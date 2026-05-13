import CryptoJS from 'crypto-js'

const WOMPI_PUBLIC_KEY = import.meta.env.VITE_WOMPI_PUBLIC_KEY as string
const WOMPI_INTEGRITY_KEY = import.meta.env.VITE_WOMPI_INTEGRITY_KEY as string

export interface WompiCheckoutConfig {
  amountCOP: number       // ej: 49900
  reference: string       // ej: "SUB_abc123_basic_20260513"
  customerEmail: string
  redirectUrl?: string
  description?: string
}

// Genera la firma de integridad requerida por Wompi
// SHA256(reference + amount_in_cents + currency + integrity_secret)
export function buildWompiIntegrity(reference: string, amountCOP: number): string {
  const amountCents = amountCOP * 100
  const raw = `${reference}${amountCents}COP${WOMPI_INTEGRITY_KEY}`
  return CryptoJS.SHA256(raw).toString()
}

// Genera una referencia única por usuario, plan y fecha
export function buildReference(userId: string, plan: string): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const rand = Math.random().toString(36).slice(2, 7).toUpperCase()
  return `PRESOB_${plan.toUpperCase()}_${userId.slice(0, 8)}_${date}_${rand}`
}

// Abre el checkout de Wompi (widget embebido)
export function openWompiCheckout(config: WompiCheckoutConfig): Promise<void> {
  return new Promise((resolve) => {
    const { amountCOP, reference, customerEmail, redirectUrl, description } = config
    const amountCents = amountCOP * 100
    const integrity = buildWompiIntegrity(reference, amountCOP)

    // Cargar el script de Wompi si no está cargado
    if (!document.getElementById('wompi-script')) {
      const script = document.createElement('script')
      script.id = 'wompi-script'
      script.src = 'https://checkout.wompi.co/widget.js'
      script.setAttribute('data-render', 'button')
      document.head.appendChild(script)
    }

    // Usar la API de checkout de Wompi
    const checkoutConfig = {
      currency: 'COP',
      amountInCents: amountCents,
      reference,
      publicKey: WOMPI_PUBLIC_KEY,
      signature: { integrity },
      customerData: { email: customerEmail },
      redirectUrl: redirectUrl ?? `${window.location.origin}/payment-success`,
      description: description ?? 'Suscripción PresupuestosObra',
    }

    // @ts-expect-error Wompi global
    if (window.WidgetCheckout) {
      // @ts-expect-error Wompi global
      const checkout = new window.WidgetCheckout(checkoutConfig)
      checkout.open((result: { transaction: { status: string } }) => {
        if (result.transaction.status === 'APPROVED') resolve()
      })
    } else {
      // Fallback: redirigir a la página de pago de Wompi
      const params = new URLSearchParams({
        'public-key': WOMPI_PUBLIC_KEY,
        currency: 'COP',
        'amount-in-cents': String(amountCents),
        reference,
        'signature:integrity': integrity,
        'customer-data:email': customerEmail,
        'redirect-url': redirectUrl ?? `${window.location.origin}/payment-success`,
      })
      window.open(`https://checkout.wompi.co/p/?${params.toString()}`, '_blank')
      resolve()
    }
  })
}

export { WOMPI_PUBLIC_KEY }
