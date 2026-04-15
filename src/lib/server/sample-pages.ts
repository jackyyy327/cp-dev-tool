import { fetchPage, extractLinks, looksLikeSpaShell } from './fetch-site'
import type { SampledPage } from '@/types/analysis'

export interface RawSample extends SampledPage {
  html: string
  spaShell: boolean
}

export async function samplePages(entryUrl: string, maxPages = 8): Promise<RawSample[]> {
  const origin = new URL(entryUrl).origin
  const root = await fetchPage(origin + '/')
  const samples: RawSample[] = [
    {
      url: '/',
      title: root.title,
      signals: collectSignals(root.html),
      html: root.html,
      spaShell: looksLikeSpaShell(root.html),
    },
  ]

  const links = extractLinks(root.html, origin).filter((p) => p !== '/')
  const byFirst = new Map<string, string[]>()
  for (const p of links) {
    const first = p.split('/').filter(Boolean)[0]?.split('?')[0] ?? ''
    if (!byFirst.has(first)) byFirst.set(first, [])
    byFirst.get(first)!.push(p)
  }
  const picks: string[] = []
  for (const group of byFirst.values()) {
    picks.push(...group.slice(0, 2))
    if (picks.length >= maxPages - 1) break
  }

  const results = await Promise.all(
    picks.slice(0, maxPages - 1).map(async (path) => {
      try {
        // path may contain a preserved query suffix from extractLinks
        const page = await fetchPage(origin + path, 6000)
        return {
          url: path,
          title: page.title,
          signals: collectSignals(page.html),
          html: page.html,
          spaShell: looksLikeSpaShell(page.html),
        } as RawSample
      } catch {
        return null
      }
    }),
  )
  for (const r of results) if (r) samples.push(r)
  return samples
}

// Structured list of signal tokens. Each token is stable so the synthesize
// layer can score against it without regex-in-regex. Tokens are human-readable
// because they flow directly into Evidence.matched.
//
// Signal grammar is intentionally language-agnostic where possible. Where we
// need text matching (add-to-cart, price), we match an English pattern AND a
// Japanese pattern so non-English brand sites don't fall back to URL-only.
export function collectSignals(html: string): string[] {
  const signals = new Set<string>()
  const add = (s: string) => signals.add(s)

  // ——— Language / locale meta (language-neutral, flows into attributes) ———
  const htmlLang = html.match(/<html[^>]*\blang=["']([^"']+)["']/i)
  if (htmlLang) add('html:lang=' + htmlLang[1].toLowerCase())
  const hreflangs = Array.from(html.matchAll(/<link[^>]+rel=["']alternate["'][^>]+hreflang=["']([^"']+)["']/gi))
  if (hreflangs.length > 0) add('hreflang:' + hreflangs.length)
  const canonical = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)
  if (canonical) add('canonical present')

  // Structured data
  if (/application\/ld\+json[^>]*>[\s\S]*?"@type"\s*:\s*"Product"/i.test(html)) add('jsonld:Product')
  if (/application\/ld\+json[^>]*>[\s\S]*?"@type"\s*:\s*"(CollectionPage|ItemList)"/i.test(html))
    add('jsonld:Collection')
  if (/application\/ld\+json[^>]*>[\s\S]*?"@type"\s*:\s*"SearchResultsPage"/i.test(html))
    add('jsonld:SearchResults')
  if (/application\/ld\+json[^>]*>[\s\S]*?"@type"\s*:\s*"Article"/i.test(html))
    add('jsonld:Article')
  if (/application\/ld\+json[^>]*>[\s\S]*?"@type"\s*:\s*"BreadcrumbList"/i.test(html))
    add('jsonld:Breadcrumb')

  // Meta
  if (/\bog:type[^>]*content=["']product["']/i.test(html)) add('og:type=product')
  if (/\bog:type[^>]*content=["']article["']/i.test(html)) add('og:type=article')
  if (/itemprop=["']sku["']|data-sku=|"sku"\s*:/i.test(html)) add('sku hint')

  // Commerce DOM — English + Japanese variants
  if (/add[-_\s]?to[-_\s]?cart|addtocart/i.test(html)) add('add-to-cart control')
  // JA: カートに入れる / カートへ / 買い物かごに入れる / 購入する
  if (/カートに入れる|カートへ|買い物かごに入れる|購入する|今すぐ購入/.test(html))
    add('add-to-cart control (JA)')
  if (/<form[^>]*action=[^>]*\/cart/i.test(html)) add('cart form')
  if (/variant|swatch|size-selector|option-selector|color-swatch/i.test(html)) add('variant selector')
  // JA: サイズ / カラー / 在庫 / 品番
  if (/サイズ選択|カラー選択|サイズ・カラー|在庫|品番|SKU/.test(html)) add('variant selector (JA)')
  if (/cart-(subtotal|total|count)|line-item|cart__line/i.test(html)) add('cart line items')
  if (/小計|合計|数量|カートの中|カート商品/.test(html)) add('cart line items (JA)')
  if (/checkout|order-summary|order-confirmation|thank[\s-]?you/i.test(html)) add('checkout hint')
  if (/ご注文|お支払い|ご購入手続|注文完了|注文確認/.test(html)) add('checkout hint (JA)')
  if (/ログイン|会員登録|マイアカウント|お気に入り/.test(html)) add('account/identity hint (JA)')
  if (/login|sign[\s-]?in|my[\s-]?account|wishlist|favorites/i.test(html)) add('account/identity hint')

  // Category/listing
  if (
    /(product-card|product-grid|product-list|collection__grid|products-grid|search-results)/i.test(
      html,
    )
  )
    add('product grid')
  if (/breadcrumb/i.test(html)) add('breadcrumb nav')
  if (/\bfilter\b|\bsort\b|facet/i.test(html)) add('filter/sort controls')

  // Search
  if (/<input[^>]*(type=["']search["']|name=["'](q|s|query|keyword)["'])/i.test(html))
    add('search input')
  if (/検索|サイト内検索|キーワード/.test(html)) add('search input (JA)')

  // Content
  if (/<article\b/i.test(html)) add('article tag')
  if (/<time\b[^>]*datetime/i.test(html)) add('datetime meta')
  if (/byline|author[-_]name|rel=["']author["']/i.test(html)) add('author byline')

  // Tracking infra (informational, not classification)
  if (/\bdataLayer\s*=|dataLayer\.push/i.test(html)) add('dataLayer present')
  if (/gtm\.start|googletagmanager\.com/i.test(html)) add('GTM container')

  // Pricing — weak signal, but contributes
  if (/class=["'][^"']*\bprice\b[^"']*["']|itemprop=["']price["']|\$\s?\d|¥\s?\d|€\s?\d|￥\s?\d/.test(html))
    add('visible price')
  if (/税込|税抜|円$|[0-9,]+\s?円/m.test(html)) add('visible price (JA)')

  // Consent / privacy
  if (/cookie[\s-]?consent|gdpr|ccpa|onetrust|trustarc|cookielaw|privacy[\s-]?preferences/i.test(html))
    add('consent banner')
  if (/クッキー|プライバシー設定/.test(html)) add('consent banner (JA)')

  // Weak-PDP leaf signals — combined later in scoring
  if (/<(div|section)[^>]*class=["'][^"']*(product-(gallery|images|media)|gallery|image-slider|carousel-product)/i.test(html))
    add('product gallery')
  if (/<(div|section)[^>]*class=["'][^"']*(product-(specs|details|info)|spec-table|product-attributes)/i.test(html))
    add('product spec block')
  if (/in\s?stock|out\s?of\s?stock|available|sold\s?out/i.test(html)) add('stock state')
  if (/在庫あり|在庫なし|入荷待ち|売り切れ|完売/.test(html)) add('stock state (JA)')

  // Title signal
  const h1 = html.match(/<h1[^>]*>([^<]{2,120})<\/h1>/i)
  if (h1) signals.add('h1: ' + h1[1].replace(/\s+/g, ' ').trim())

  return Array.from(signals)
}
