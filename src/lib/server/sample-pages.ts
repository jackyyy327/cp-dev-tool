import { fetchPage, extractLinks, looksLikeSpaShell } from './fetch-site'
import type { SampledPage } from '@/types/analysis'

// A structured signal detection: the same token the scoring layer consumes,
// plus the pattern name and plain-text snippet so the evidence pane can let a
// consultant verify the signal on the live page. Pages keep an array of these
// so downstream synthesis can attach per-URL locations to evidence entries.
export interface SignalHit {
  token: string
  patternName?: string
  snippet?: string
}

export interface RawSample extends SampledPage {
  html: string
  spaShell: boolean
  signalHits: SignalHit[]
}

export async function samplePages(entryUrl: string, maxPages = 8): Promise<RawSample[]> {
  const origin = new URL(entryUrl).origin
  const root = await fetchPage(origin + '/')
  const rootHits = collectSignalHits(root.html)
  const samples: RawSample[] = [
    {
      url: '/',
      title: root.title,
      signals: rootHits.map((h) => h.token),
      signalHits: rootHits,
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
        const hits = collectSignalHits(page.html)
        return {
          url: path,
          title: page.title,
          signals: hits.map((h) => h.token),
          signalHits: hits,
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

// ——— signal detection ———
//
// Each Probe emits a stable token (consumed by the scoring layer via
// sigs.has(token)) and carries a human-readable pattern name + regex so we
// can extract a snippet around the match for the evidence pane. Tokens are
// intentionally language-tagged ("(JA)") so consultants can distinguish EN
// and JA hits at a glance.
interface Probe {
  token: string
  patternName: string
  regex: RegExp
}

const PROBES: Probe[] = [
  // ——— Meta / structured data ———
  {
    token: 'canonical present',
    patternName: '<link rel=canonical>',
    regex: /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i,
  },
  {
    token: 'jsonld:Product',
    patternName: 'JSON-LD @type=Product',
    regex: /application\/ld\+json[^>]*>[\s\S]*?"@type"\s*:\s*"Product"/i,
  },
  {
    token: 'jsonld:Collection',
    patternName: 'JSON-LD @type=CollectionPage/ItemList',
    regex: /application\/ld\+json[^>]*>[\s\S]*?"@type"\s*:\s*"(CollectionPage|ItemList)"/i,
  },
  {
    token: 'jsonld:SearchResults',
    patternName: 'JSON-LD @type=SearchResultsPage',
    regex: /application\/ld\+json[^>]*>[\s\S]*?"@type"\s*:\s*"SearchResultsPage"/i,
  },
  {
    token: 'jsonld:Article',
    patternName: 'JSON-LD @type=Article',
    regex: /application\/ld\+json[^>]*>[\s\S]*?"@type"\s*:\s*"Article"/i,
  },
  {
    token: 'jsonld:Breadcrumb',
    patternName: 'JSON-LD @type=BreadcrumbList',
    regex: /application\/ld\+json[^>]*>[\s\S]*?"@type"\s*:\s*"BreadcrumbList"/i,
  },
  {
    token: 'og:type=product',
    patternName: 'og:type=product meta',
    regex: /\bog:type[^>]*content=["']product["']/i,
  },
  {
    token: 'og:type=article',
    patternName: 'og:type=article meta',
    regex: /\bog:type[^>]*content=["']article["']/i,
  },
  {
    token: 'sku hint',
    patternName: 'sku attribute or key',
    regex: /itemprop=["']sku["']|data-sku=|"sku"\s*:/i,
  },

  // ——— Commerce DOM — EN + JA variants ———
  {
    token: 'add-to-cart control',
    patternName: 'add-to-cart class/text (EN)',
    regex: /add[-_\s]?to[-_\s]?cart|addtocart/i,
  },
  {
    token: 'add-to-cart control (JA)',
    patternName: 'カートに入れる / 購入する',
    regex: /カートに入れる|カートへ|買い物かごに入れる|購入する|今すぐ購入/,
  },
  {
    token: 'cart form',
    patternName: '<form action=/cart>',
    regex: /<form[^>]*action=[^>]*\/cart/i,
  },
  {
    token: 'variant selector',
    patternName: 'variant / swatch / size class',
    regex: /variant|swatch|size-selector|option-selector|color-swatch/i,
  },
  {
    token: 'variant selector (JA)',
    patternName: 'サイズ選択 / カラー選択 / 在庫',
    regex: /サイズ選択|カラー選択|サイズ・カラー|在庫|品番|SKU/,
  },
  {
    token: 'cart line items',
    patternName: 'cart-subtotal / line-item class',
    regex: /cart-(subtotal|total|count)|line-item|cart__line/i,
  },
  {
    token: 'cart line items (JA)',
    patternName: '小計 / 合計 / 数量',
    regex: /小計|合計|数量|カートの中|カート商品/,
  },
  {
    token: 'checkout hint',
    patternName: 'checkout / order / thank-you',
    regex: /checkout|order-summary|order-confirmation|thank[\s-]?you/i,
  },
  {
    token: 'checkout hint (JA)',
    patternName: 'ご注文 / お支払い / 注文完了',
    regex: /ご注文|お支払い|ご購入手続|注文完了|注文確認/,
  },
  {
    token: 'account/identity hint (JA)',
    patternName: 'ログイン / 会員登録 / マイアカウント',
    regex: /ログイン|会員登録|マイアカウント|お気に入り/,
  },
  {
    token: 'account/identity hint',
    patternName: 'login / sign-in / my-account',
    regex: /login|sign[\s-]?in|my[\s-]?account|wishlist|favorites/i,
  },

  // ——— Category / listing ———
  {
    token: 'product grid',
    patternName: 'product-card / product-grid / product-list class',
    regex:
      /(product-card|product-grid|product-list|collection__grid|products-grid|search-results)/i,
  },
  {
    token: 'breadcrumb nav',
    patternName: 'breadcrumb class',
    regex: /breadcrumb/i,
  },
  {
    token: 'filter/sort controls',
    patternName: 'filter / sort / facet',
    regex: /\bfilter\b|\bsort\b|facet/i,
  },

  // ——— Search ———
  {
    token: 'search input',
    patternName: '<input type=search> or q/s/keyword',
    regex: /<input[^>]*(type=["']search["']|name=["'](q|s|query|keyword)["'])/i,
  },
  {
    token: 'search input (JA)',
    patternName: '検索 / キーワード',
    regex: /検索|サイト内検索|キーワード/,
  },

  // ——— Content ———
  { token: 'article tag', patternName: '<article> element', regex: /<article\b/i },
  { token: 'datetime meta', patternName: '<time datetime>', regex: /<time\b[^>]*datetime/i },
  {
    token: 'author byline',
    patternName: 'byline / rel=author',
    regex: /byline|author[-_]name|rel=["']author["']/i,
  },

  // ——— Tracking infra (informational) ———
  {
    token: 'dataLayer present',
    patternName: 'dataLayer = / dataLayer.push',
    regex: /\bdataLayer\s*=|dataLayer\.push/i,
  },
  {
    token: 'GTM container',
    patternName: 'gtm.start / googletagmanager.com',
    regex: /gtm\.start|googletagmanager\.com/i,
  },

  // ——— Pricing ———
  {
    token: 'visible price',
    patternName: 'price class / currency glyph',
    regex:
      /class=["'][^"']*\bprice\b[^"']*["']|itemprop=["']price["']|\$\s?\d|¥\s?\d|€\s?\d|￥\s?\d/,
  },
  {
    token: 'visible price (JA)',
    patternName: '税込 / 税抜 / 円',
    regex: /税込|税抜|円$|[0-9,]+\s?円/m,
  },

  // ——— Consent / privacy ———
  {
    token: 'consent banner',
    patternName: 'cookie-consent / onetrust / gdpr',
    regex:
      /cookie[\s-]?consent|gdpr|ccpa|onetrust|trustarc|cookielaw|privacy[\s-]?preferences/i,
  },
  {
    token: 'consent banner (JA)',
    patternName: 'クッキー / プライバシー設定',
    regex: /クッキー|プライバシー設定/,
  },

  // ——— Weak-PDP leaf signals ———
  {
    token: 'product gallery',
    patternName: 'product-gallery / image-slider class',
    regex:
      /<(div|section)[^>]*class=["'][^"']*(product-(gallery|images|media)|gallery|image-slider|carousel-product)/i,
  },
  {
    token: 'product spec block',
    patternName: 'product-specs / details class',
    regex:
      /<(div|section)[^>]*class=["'][^"']*(product-(specs|details|info)|spec-table|product-attributes)/i,
  },
  {
    token: 'stock state',
    patternName: 'in stock / out of stock / sold out',
    regex: /in\s?stock|out\s?of\s?stock|available|sold\s?out/i,
  },
  {
    token: 'stock state (JA)',
    patternName: '在庫あり / 売り切れ / 完売',
    regex: /在庫あり|在庫なし|入荷待ち|売り切れ|完売/,
  },
]

export function collectSignalHits(html: string): SignalHit[] {
  const out: SignalHit[] = []
  const seen = new Set<string>()

  for (const p of PROBES) {
    if (seen.has(p.token)) continue
    const m = p.regex.exec(html)
    if (!m) continue
    seen.add(p.token)
    out.push({
      token: p.token,
      patternName: p.patternName,
      snippet: extractSnippet(html, m.index, m[0].length),
    })
  }

  // Structured extractors whose token encodes a capture group or a count —
  // no snippet is produced because the token itself is the evidence.
  const htmlLang = html.match(/<html[^>]*\blang=["']([^"']+)["']/i)
  if (htmlLang) out.push({ token: 'html:lang=' + htmlLang[1].toLowerCase() })
  const hreflangs = Array.from(
    html.matchAll(/<link[^>]+rel=["']alternate["'][^>]+hreflang=["']([^"']+)["']/gi),
  )
  if (hreflangs.length > 0) out.push({ token: 'hreflang:' + hreflangs.length })

  const h1 = html.match(/<h1[^>]*>([^<]{2,120})<\/h1>/i)
  if (h1) out.push({ token: 'h1: ' + h1[1].replace(/\s+/g, ' ').trim() })

  return out
}

// Backwards-compatible flat token list for the scoring layer.
export function collectSignals(html: string): string[] {
  return collectSignalHits(html).map((h) => h.token)
}

// Grab ~80 chars of context around a regex match, strip HTML tags, collapse
// whitespace. For long matches (e.g. JSON-LD blobs), anchor near the end of
// the match so the snippet surfaces the signal itself rather than the opening
// <script> tag that may sit hundreds of characters earlier.
function extractSnippet(html: string, index: number, matchLen: number): string {
  const matchEnd = index + matchLen
  const before = matchLen > 120 ? Math.max(0, matchEnd - 120) : Math.max(0, index - 80)
  const after = Math.min(html.length, matchEnd + 80)
  const window = html.slice(before, after)
  const plain = window.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  if (plain.length > 180) return plain.slice(0, 177) + '…'
  return plain
}
