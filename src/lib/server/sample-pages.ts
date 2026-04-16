import { fetchPage, extractLinks, looksLikeSpaShell, FetchError } from './fetch-site'
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

const SEED_PATHS = [
  '/shop',
  '/products',
  '/collections',
  '/category',
  '/categories',
  '/search',
  '/cart',
  '/blog',
  '/about',
  '/pages',
  '/shop/mens',
  '/shop/womens',
  '/shop/new-arrivals',
]

export async function samplePages(entryUrl: string, maxPages = 8): Promise<RawSample[]> {
  const parsed = new URL(entryUrl)
  const origin = parsed.origin
  const entryPath = parsed.pathname.replace(/\/+$/, '') || '/'
  const samples: RawSample[] = []
  const visited = new Set<string>()

  // Fetch the entry URL (user-provided path, not always '/')
  // Use a longer timeout for entry pages — some sites behind WAFs (Akamai, etc.)
  // are slow to respond on first request.
  const entry = await fetchOneSample(origin, entryPath, visited, 12000)
  if (entry) samples.push(entry)

  // If user gave a subpath, also fetch root '/' for broader link discovery
  if (entryPath !== '/') {
    const root = await fetchOneSample(origin, '/', visited, 12000)
    if (root) samples.push(root)
  }

  // Gather links from all entry samples
  let links: string[] = []
  for (const s of samples) {
    const extracted = extractLinks(s.html, origin).filter((p) => !visited.has(p))
    links.push(...extracted)
  }
  links = [...new Set(links)]

  // If HTML links are sparse, try sitemap and robots.txt discovery
  if (links.length < 3) {
    const sitemapLinks = await discoverFromSitemap(origin)
    for (const p of sitemapLinks) {
      if (!visited.has(p) && !links.includes(p)) links.push(p)
    }
  }

  // If still very few links, inject heuristic seed paths
  if (links.length < 3) {
    const seeds = SEED_PATHS.filter((p) => !visited.has(p) && !links.includes(p))
    links.push(...seeds)
  }

  // Diversify picks by first path segment, prioritizing commerce-critical paths
  // so product/item pages are always sampled when available.
  const byFirst = new Map<string, string[]>()
  for (const p of links) {
    const first = p.split('/').filter(Boolean)[0]?.split('?')[0] ?? ''
    if (!byFirst.has(first)) byFirst.set(first, [])
    byFirst.get(first)!.push(p)
  }
  const segPriority = (seg: string): number => {
    const s = seg.toLowerCase().replace(/\.(html?|php|aspx?)$/, '')
    if (/^(product|products|item|items|goods|detail|shop|pdp)/.test(s)) return 0
    if (/^(category|categories|collections|catalog)/.test(s)) return 1
    if (/^(cart|checkout|order|purchase)/.test(s)) return 2
    if (/^(login|signin|signup|register|account|member)/.test(s)) return 3
    return 4
  }
  const sortedGroups = [...byFirst.entries()].sort(
    (a, b) => segPriority(a[0]) - segPriority(b[0]),
  )
  const picks: string[] = []
  for (const [, group] of sortedGroups) {
    picks.push(...group.slice(0, 2))
    if (picks.length >= maxPages - samples.length) break
  }

  const results = await Promise.all(
    picks.slice(0, maxPages - samples.length).map((path) => fetchOneSample(origin, path, visited)),
  )
  for (const r of results) if (r) samples.push(r)
  return samples
}

async function fetchOneSample(
  origin: string,
  path: string,
  visited: Set<string>,
  timeoutMs = 6000,
): Promise<RawSample | null> {
  if (visited.has(path)) return null
  visited.add(path)
  try {
    const page = await fetchPage(origin + path, timeoutMs)
    const hits = collectSignalHits(page.html)
    return {
      url: path,
      title: page.title,
      signals: hits.map((h) => h.token),
      signalHits: hits,
      html: page.html,
      spaShell: looksLikeSpaShell(page.html),
    }
  } catch (err) {
    // Re-throw fatal errors from the very first page so buildAnalysis
    // surfaces the error to the user instead of silently producing empty results.
    if (err instanceof FetchError && visited.size <= 1) {
      throw err
    }
    return null
  }
}

// ——— sitemap / robots.txt discovery ———

async function discoverFromSitemap(origin: string): Promise<string[]> {
  const sitemapUrls = await findSitemapUrls(origin)
  const paths: string[] = []

  for (const sitemapUrl of sitemapUrls.slice(0, 3)) {
    try {
      const res = await fetch(sitemapUrl, {
        headers: { 'user-agent': 'Mozilla/5.0 (compatible; SitemapCrawler)' },
        signal: AbortSignal.timeout(5000),
      })
      if (!res.ok) continue
      const xml = await res.text()
      const extracted = extractSitemapPaths(xml, origin)
      for (const p of extracted) {
        if (!paths.includes(p)) paths.push(p)
      }
    } catch {
      // sitemap not available — continue
    }
  }

  return diversifySitemapPaths(paths)
}

async function findSitemapUrls(origin: string): Promise<string[]> {
  const urls = [origin + '/sitemap.xml', origin + '/sitemap_index.xml']

  // Parse robots.txt for Sitemap: directives
  try {
    const res = await fetch(origin + '/robots.txt', {
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; SitemapCrawler)' },
      signal: AbortSignal.timeout(3000),
    })
    if (res.ok) {
      const text = await res.text()
      const re = /^Sitemap:\s*(.+)$/gim
      let m: RegExpExecArray | null
      while ((m = re.exec(text)) !== null) {
        const url = m[1].trim()
        if (url && !urls.includes(url)) urls.push(url)
      }
    }
  } catch {
    // robots.txt not available
  }

  return urls
}

function extractSitemapPaths(xml: string, origin: string): string[] {
  const paths: string[] = []
  // Match <loc> tags in both sitemap and sitemap index files
  const re = /<loc>\s*(https?:\/\/[^<]+)\s*<\/loc>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(xml)) !== null) {
    const url = m[1].trim()
    // If it's a sub-sitemap URL, skip (we already handle top-level sitemaps)
    if (/sitemap.*\.xml/i.test(url)) continue
    try {
      const parsed = new URL(url)
      if (parsed.origin !== origin) continue
      let pathname = parsed.pathname.replace(/\/+$/, '')
      if (pathname === '' || pathname === '/') continue
      if (/\.(pdf|jpe?g|png|gif|webp|svg|css|js|xml|json|zip|mp4|woff2?|ico)$/i.test(pathname)) continue
      paths.push(pathname)
    } catch {
      // invalid URL
    }
  }
  return paths
}

function diversifySitemapPaths(paths: string[], maxPer = 2, maxTotal = 14): string[] {
  const byFirst = new Map<string, string[]>()
  for (const p of paths) {
    const first = p.split('/').filter(Boolean)[0]?.split('?')[0] ?? ''
    if (!byFirst.has(first)) byFirst.set(first, [])
    byFirst.get(first)!.push(p)
  }
  const picks: string[] = []
  for (const group of byFirst.values()) {
    picks.push(...group.slice(0, maxPer))
    if (picks.length >= maxTotal) break
  }
  return picks.slice(0, maxTotal)
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
export function extractSnippet(html: string, index: number, matchLen: number): string {
  const matchEnd = index + matchLen
  const before = matchLen > 120 ? Math.max(0, matchEnd - 120) : Math.max(0, index - 80)
  const after = Math.min(html.length, matchEnd + 80)
  const window = html.slice(before, after)
  const plain = window.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  if (plain.length > 180) return plain.slice(0, 177) + '…'
  return plain
}
