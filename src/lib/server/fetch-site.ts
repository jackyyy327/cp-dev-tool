import type { FailureKind } from '@/types/analysis'

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

export interface FetchedPage {
  requestUrl: string
  finalUrl: string
  status: number
  html: string
  title?: string
  bodyLength: number
}

export class FetchError extends Error {
  kind: FailureKind
  status?: number
  constructor(kind: FailureKind, message: string, status?: number) {
    super(message)
    this.name = 'FetchError'
    this.kind = kind
    this.status = status
  }
}

export async function fetchPage(url: string, timeoutMs = 8000): Promise<FetchedPage> {
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
    if (res.status === 403 || res.status === 429) {
      throw new FetchError(
        'BlockedByAntiBot',
        'Site returned ' + res.status + ' — likely anti-bot or WAF protection',
        res.status,
      )
    }
    if (res.status >= 400) {
      throw new FetchError(
        'UrlFetchFailure',
        'HTTP ' + res.status + ' from ' + url,
        res.status,
      )
    }
    return {
      requestUrl: url,
      finalUrl: res.url,
      status: res.status,
      html,
      title: extractTitle(html),
      bodyLength: html.length,
    }
  } catch (err) {
    if (err instanceof FetchError) throw err
    const e = err as Error
    if (e.name === 'AbortError') {
      throw new FetchError('UrlFetchFailure', 'Request timed out after ' + timeoutMs + 'ms (' + url + ')')
    }
    throw new FetchError('UrlFetchFailure', 'Network error fetching ' + url + ': ' + e.message)
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
      // Preserve meaningful query keys so we can detect search pages
      const q = u.searchParams
      const searchKey = ['q', 's', 'query', 'keyword', 'search'].find((k) => q.has(k))
      if (searchKey) pathname += '?' + searchKey + '=' + q.get(searchKey)
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

// Detect whether HTML body is a JS shell with little pre-rendered content.
export function looksLikeSpaShell(html: string): boolean {
  const bodyMatch = html.match(/<body[\s\S]*?<\/body>/i)
  const body = bodyMatch ? bodyMatch[0] : html
  const stripped = body.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<[^>]+>/g, ' ')
  const visibleText = stripped.replace(/\s+/g, ' ').trim()
  return visibleText.length < 300
}
