// Minimal server-side HTML fetch + cheap parsing.
// No extra deps; plain fetch + regex (we only need coarse structure).

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

export interface FetchedPage {
  requestUrl: string
  finalUrl: string
  status: number
  html: string
  title?: string
}

export async function fetchPage(url: string, timeoutMs = 10000): Promise<FetchedPage> {
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      headers: {
        'user-agent': UA,
        accept: 'text/html,application/xhtml+xml',
        'accept-language': 'en,ja;q=0.8',
      },
      redirect: 'follow',
      signal: controller.signal,
    })
    const html = await res.text()
    return {
      requestUrl: url,
      finalUrl: res.url,
      status: res.status,
      html,
      title: extractTitle(html),
    }
  } finally {
    clearTimeout(t)
  }
}

export function extractTitle(html: string): string | undefined {
  const m = html.match(/<title[^>]*>([^<]+)<\/title>/i)
  return m?.[1]?.trim()
}

export function extractLinks(html: string, baseUrl: string): string[] {
  const out = new Set<string>()
  let base: URL
  try {
    base = new URL(baseUrl)
  } catch {
    return []
  }
  const re = /<a\b[^>]*\bhref=["']([^"']+)["'][^>]*>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    const raw = m[1]
    if (!raw || raw.startsWith('#') || raw.startsWith('javascript:') || raw.startsWith('mailto:')) continue
    try {
      const u = new URL(raw, baseUrl)
      if (u.hostname !== base.hostname) continue
      if (/\.(pdf|jpe?g|png|gif|webp|svg|css|js|xml|json|zip|mp4|woff2?|ico)$/i.test(u.pathname)) continue
      let pathname = u.pathname.replace(/\/+$/, '')
      if (pathname === '') pathname = '/'
      out.add(pathname)
    } catch {
      // skip
    }
  }
  return Array.from(out)
}

export function detectPlatform(html: string): string {
  if (/cdn\.shopify\.com|Shopify\.shop|Shopify\.theme/i.test(html)) return 'Shopify'
  if (/\/wp-content\/|wp-includes/i.test(html)) {
    return /woocommerce/i.test(html) ? 'WooCommerce' : 'WordPress'
  }
  if (/Mage\.Cookies|\/static\/version\d+/i.test(html)) return 'Magento'
  if (/demandware\.static|dwsgmc|sfcc\.com/i.test(html)) return 'SFCC'
  if (/hybris|_hybris|\/_ui\/responsive/i.test(html)) return 'Hybris'
  if (/bigcommerce\.com\/stencil/i.test(html)) return 'BigCommerce'
  return 'Unknown'
}
