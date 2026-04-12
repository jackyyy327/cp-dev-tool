import { detectPlatform, getPlatformPageTypeTemplates } from './platform-detector'
import type { CrawlResult, Platform, SiteType } from '@/types/sitemap'

interface PageSample {
  url: string
  html: string
  title: string
  jsonLd: Record<string, unknown>[]
  metaTags: Record<string, string>
  dataLayer: Record<string, unknown> | null
}

export async function crawlWebsite(url: string): Promise<CrawlResult> {
  const baseUrl = new URL(url).origin

  // Fetch the homepage
  const homepageData = await fetchPage(url)

  const headers = homepageData.headers
  const { platform, siteType, isSPA } = detectPlatform(homepageData.html, headers, url)

  // Try to fetch sitemap.xml (now checks robots.txt + platform-specific paths)
  let sitemapXmlUrls = await fetchSitemapXml(baseUrl, platform)

  // Fallback: extract internal links from homepage HTML if sitemap is empty
  if (sitemapXmlUrls.length === 0) {
    sitemapXmlUrls = extractLinksFromHtml(homepageData.html, baseUrl)
  }

  // Sample URLs from sitemap to identify page type patterns
  const sampledUrls = sampleUrlsFromSitemap(sitemapXmlUrls, platform, siteType)

  // Fetch a few sample pages to understand structure
  const samplePages: PageSample[] = [homepageData]
  for (const sampleUrl of sampledUrls.slice(0, 4)) {
    try {
      const page = await fetchPage(sampleUrl)
      samplePages.push(page)
    } catch {
      // Skip failed pages
    }
  }

  // 2nd-level: extract links from every sample page we fetched
  // This dramatically improves coverage for sites without sitemap.xml
  const allUrls = new Set(sitemapXmlUrls)
  for (const page of samplePages) {
    for (const link of extractLinksFromHtml(page.html, baseUrl)) {
      allUrls.add(link)
    }
  }
  sitemapXmlUrls = [...allUrls]

  // Extract JSON-LD from all pages
  const allJsonLd = samplePages.flatMap(p => p.jsonLd)

  // Get dataLayer from homepage
  const dataLayer = samplePages[0]?.dataLayer || null

  // Build detected page types based on platform templates + URL analysis
  const pageTypeNames = getPlatformPageTypeTemplates(platform, siteType)
  const detectedPageTypes = inferPageTypes(sitemapXmlUrls, pageTypeNames, platform, samplePages)

  return {
    url,
    platform,
    siteType,
    isSPA,
    detectedPageTypes,
    jsonLd: allJsonLd,
    dataLayer,
    sitemapXmlUrls,
  }
}

async function fetchPage(url: string): Promise<PageSample & { headers: Record<string, string> }> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MCPDevTool/1.0)' },
    signal: AbortSignal.timeout(10000),
  })

  const headers: Record<string, string> = {}
  res.headers.forEach((value, key) => { headers[key] = value })

  const html = await res.text()
  const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() || ''

  // Extract JSON-LD
  const jsonLd: Record<string, unknown>[] = []
  const jsonLdMatches = html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)
  for (const match of jsonLdMatches) {
    try {
      const parsed = JSON.parse(match[1])
      jsonLd.push(parsed)
    } catch { /* skip malformed */ }
  }

  // Extract meta tags
  const metaTags: Record<string, string> = {}
  const metaMatches = html.matchAll(/<meta[^>]+(?:name|property)=["']([^"']+)["'][^>]+content=["']([^"']+)["'][^>]*>/gi)
  for (const match of metaMatches) {
    metaTags[match[1]] = match[2]
  }

  // Extract dataLayer - supports multiple common implementation patterns
  const dataLayer = extractDataLayer(html)

  return { url, html, title, jsonLd, metaTags, dataLayer, headers }
}

function extractDataLayer(html: string): Record<string, unknown> | null {
  const patterns = [
    // Standard array init: dataLayer = [...]
    /dataLayer\s*=\s*(\[[\s\S]*?\]);/,
    // window.dataLayer = [...]
    /window\.dataLayer\s*=\s*(\[[\s\S]*?\]);/,
    // dataLayer = []; dataLayer.push({...})
    /dataLayer\.push\s*\(\s*(\{[\s\S]*?\})\s*\)/,
    // window.dataLayer.push({...})
    /window\.dataLayer\.push\s*\(\s*(\{[\s\S]*?\})\s*\)/,
    // dataLayer = [{...}]  (no trailing semicolon)
    /dataLayer\s*=\s*(\[[\s\S]*?\])/,
  ]

  for (const pattern of patterns) {
    const match = html.match(pattern)
    if (!match) continue
    try {
      const parsed = JSON.parse(match[1])
      if (Array.isArray(parsed)) {
        // Merge all push objects into one flat object for easier reference
        const merged: Record<string, unknown> = {}
        for (const item of parsed) {
          if (typeof item === 'object' && item !== null) Object.assign(merged, item)
        }
        return Object.keys(merged).length > 0 ? merged : null
      }
      if (typeof parsed === 'object' && parsed !== null) return parsed
    } catch { /* try next pattern */ }
  }

  // Fallback: detect GTM presence even if dataLayer can't be parsed
  const gtmMatch = html.match(/GTM-[A-Z0-9]+/)
  if (gtmMatch) {
    return { _gtmDetected: true, _gtmId: gtmMatch[0] }
  }

  return null
}

/**
 * Extract internal links from HTML.
 * Improvements over the original:
 * - Includes query params (important for search URLs)
 * - Uses URL() constructor for proper relative path resolution
 * - Filters out non-page resources (.pdf, .jpg, .css, etc.)
 * - Prioritizes <nav> links (they represent site structure)
 * - Deduplicates by normalized path
 */
function extractLinksFromHtml(html: string, baseUrl: string): string[] {
  const seen = new Set<string>()
  const results: string[] = []

  // Helper: process an href and add to results
  function processHref(href: string) {
    href = href.trim()
    // Skip non-navigational schemes
    if (/^(mailto|javascript|tel|data|#)/.test(href)) return
    // Skip static resources
    if (/\.(pdf|jpg|jpeg|png|gif|svg|webp|css|js|ico|woff2?|ttf|eot|mp4|mp3|zip|gz)(\?|$)/i.test(href)) return

    try {
      const resolved = new URL(href, baseUrl)
      // Only same-origin with meaningful path
      if (resolved.origin !== baseUrl) return
      if (resolved.pathname.length <= 1 && !resolved.search) return

      // Normalize: strip trailing slash, keep search params, drop hash
      const normalized = resolved.origin + resolved.pathname.replace(/\/$/, '') + resolved.search
      if (seen.has(normalized)) return
      seen.add(normalized)
      results.push(normalized)
    } catch { /* skip invalid */ }
  }

  // 1. Extract from <nav> elements first (highest quality — site structure)
  const navMatches = html.matchAll(/<nav[\s>][\s\S]*?<\/nav>/gi)
  for (const navBlock of navMatches) {
    const hrefMatches = navBlock[0].matchAll(/href=["']([^"']+)["']/g)
    for (const m of hrefMatches) processHref(m[1])
  }

  // 2. Extract from all other <a> tags
  const allHrefMatches = html.matchAll(/href=["']([^"']+)["']/g)
  for (const m of allHrefMatches) processHref(m[1])

  return results.slice(0, 1000)
}

/**
 * Discover sitemap.xml URLs.
 * - Checks robots.txt for Sitemap: directives
 * - Tries standard + platform-specific paths
 * - Follows sitemap index files to child sitemaps
 */
async function fetchSitemapXml(baseUrl: string, platform: Platform): Promise<string[]> {
  // 1. Check robots.txt
  const robotsSitemaps = await checkRobotsTxt(baseUrl)

  // 2. Build candidate list
  const standardPaths = [
    `${baseUrl}/sitemap.xml`,
    `${baseUrl}/sitemap_index.xml`,
    `${baseUrl}/sitemap.xml.gz`,
  ]

  // Platform-specific sitemap paths
  const platformPaths: string[] = []
  if (platform === 'hybris') {
    platformPaths.push(
      `${baseUrl}/medias/sitemap.xml`,
      `${baseUrl}/medias/sitemap-index.xml`,
      `${baseUrl}/sitemap/sitemap-index.xml`,
    )
  } else if (platform === 'magento') {
    platformPaths.push(`${baseUrl}/pub/sitemap.xml`)
  } else if (platform === 'wordpress' || platform === 'woocommerce') {
    platformPaths.push(
      `${baseUrl}/wp-sitemap.xml`,
      `${baseUrl}/sitemap-index.xml`,
    )
  }

  // Deduplicate and order: robots.txt first, then standard, then platform
  const candidates = [...new Set([...robotsSitemaps, ...standardPaths, ...platformPaths])]

  for (const candidate of candidates) {
    try {
      const res = await fetch(candidate, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MCPDevTool/1.0)' },
        signal: AbortSignal.timeout(5000),
      })
      if (!res.ok) continue

      const text = await res.text()
      const locs = [...text.matchAll(/<loc>(.*?)<\/loc>/g)].map(m => m[1].trim())

      if (locs.length === 0) continue

      // Check if this is a sitemap index (contains links to other sitemaps)
      const isSitemapIndex = text.includes('<sitemapindex') || locs.every(u => /sitemap.*\.xml/i.test(u))

      if (isSitemapIndex) {
        // Follow child sitemaps (up to 5 to avoid slowness)
        const childUrls: string[] = []
        for (const childSitemapUrl of locs.slice(0, 5)) {
          try {
            const childRes = await fetch(childSitemapUrl, {
              headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MCPDevTool/1.0)' },
              signal: AbortSignal.timeout(5000),
            })
            if (!childRes.ok) continue
            const childText = await childRes.text()
            const childLocs = [...childText.matchAll(/<loc>(.*?)<\/loc>/g)].map(m => m[1].trim())
            childUrls.push(...childLocs)
          } catch { /* skip */ }
        }
        if (childUrls.length > 0) return childUrls
      }

      return locs
    } catch { /* try next */ }
  }
  return []
}

async function checkRobotsTxt(baseUrl: string): Promise<string[]> {
  try {
    const res = await fetch(`${baseUrl}/robots.txt`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MCPDevTool/1.0)' },
      signal: AbortSignal.timeout(3000),
    })
    if (!res.ok) return []
    const text = await res.text()
    return [...text.matchAll(/^Sitemap:\s*(.+)$/gim)].map(m => m[1].trim())
  } catch {
    return []
  }
}

function sampleUrlsFromSitemap(urls: string[], platform: Platform, siteType: SiteType): string[] {
  // Sample representative URLs for each likely page type
  const patterns = getUrlPatterns(platform, siteType)
  const sampled: string[] = []

  for (const pattern of patterns) {
    const match = urls.find(u => pattern.test(u))
    if (match) sampled.push(match)
  }

  return sampled
}

function getUrlPatterns(platform: Platform, siteType: SiteType): RegExp[] {
  if (platform === 'shopify') {
    return [
      /\/products\/[^/]+$/,
      /\/collections\/[^/]+$/,
      /\/cart/,
      /\/blogs\/[^/]+\/[^/]+$/,
    ]
  }
  if (platform === 'hybris') {
    return [
      /\/p\/[^/]+$/,           // 商品ページ: /p/SKU
      /\/c\/[^/]+$/,           // カテゴリページ: /c/CODE
      /\/cart/,
      /\/checkout/,
      /\/search\?/,
      /\/my-account/,
    ]
  }
  if (platform === 'bigcommerce') {
    return [
      /\/[^/]+-[0-9]+\/?$/,   // BigCommerce product slug
      /\/[^/]+\/?$/,
      /\/cart\.php/,
      /\/checkout/,
    ]
  }
  if (siteType === 'ecommerce') {
    return [
      /\/product[s]?\/[^/]+$/,
      /\/categor(y|ies)\/[^/]+$/,
      /\/cart/,
      /\/checkout/,
    ]
  }
  return [/\/blog\/[^/]+$/, /\/article[s]?\/[^/]+$/]
}

function inferPageTypes(
  sitemapUrls: string[],
  pageTypeNames: string[],
  platform: Platform,
  samplePages: PageSample[]
): import('@/types/sitemap').PageTypeDetected[] {
  const urlGroups = groupUrlsByPattern(sitemapUrls, platform)

  return pageTypeNames.map(name => {
    const group = urlGroups[name] || []
    const confidence = group.length > 0 ? Math.min(95, 60 + group.length * 2) : 40

    return {
      name,
      urls: group.slice(0, 3),
      confidence,
      isMatch: generateIsMatch(name, group, platform),
      catalog: shouldHaveCatalog(name) ? generateCatalogConfig(name, samplePages) : undefined,
      contentZones: generateContentZones(name),
    }
  })
}

function groupUrlsByPattern(urls: string[], platform: Platform): Record<string, string[]> {
  const groups: Record<string, string[]> = {}

  for (const url of urls) {
    let path: string
    try { path = new URL(url).pathname.toLowerCase() } catch { continue }

    if (path === '/' || path === '') {
      ;(groups.home = groups.home || []).push(url)
    } else if (platform === 'shopify') {
      if (path.startsWith('/products/')) (groups.product_detail = groups.product_detail || []).push(url)
      else if (path.startsWith('/collections/')) (groups.category = groups.category || []).push(url)
      else if (path.startsWith('/cart')) (groups.cart = groups.cart || []).push(url)
      else if (path.startsWith('/blogs/')) (groups.blog_detail = groups.blog_detail || []).push(url)
    } else if (platform === 'hybris') {
      if (/\/p\/[^/]+$/.test(path)) (groups.product_detail = groups.product_detail || []).push(url)
      else if (/\/c\/[^/]+/.test(path)) (groups.category = groups.category || []).push(url)
      else if (path.includes('/cart')) (groups.cart = groups.cart || []).push(url)
      else if (path.includes('/checkout')) (groups.checkout = groups.checkout || []).push(url)
      else if (path.includes('/search')) (groups.search_results = groups.search_results || []).push(url)
      else if (path.includes('/my-account') || path.includes('/account')) (groups.account = groups.account || []).push(url)
      else if (/\/order-confirmation|\/order-detail/.test(path)) (groups.order_confirmation = groups.order_confirmation || []).push(url)
    } else {
      if (/\/product[s]?\//.test(path)) (groups.product_detail = groups.product_detail || []).push(url)
      else if (/\/categor/.test(path)) (groups.category = groups.category || []).push(url)
      else if (/\/cart/.test(path)) (groups.cart = groups.cart || []).push(url)
      else if (/\/checkout/.test(path)) (groups.checkout = groups.checkout || []).push(url)
      else if (/\/blog|\/article|\/news/.test(path)) (groups.blog_detail = groups.blog_detail || []).push(url)
      else if (/\/search/.test(path)) (groups.search_results = groups.search_results || []).push(url)
      else if (/\/account|\/my-/.test(path)) (groups.account = groups.account || []).push(url)
    }
  }

  return groups
}

function generateIsMatch(pageType: string, urls: string[], platform: Platform): string {
  const patterns: Record<string, string> = {
    home: `() => window.location.pathname === '/'`,
    product_detail: platform === 'shopify'
      ? `() => window.location.pathname.startsWith('/products/')`
      : platform === 'hybris'
        ? `() => /^\\/p\\/[^/]+$/.test(window.location.pathname)`
        : `() => /\\/product[s]?\\/[^/]+/.test(window.location.pathname)`,
    category: platform === 'shopify'
      ? `() => window.location.pathname.startsWith('/collections/')`
      : platform === 'hybris'
        ? `() => /^\\/c\\/[^/]+/.test(window.location.pathname)`
        : `() => /\\/categor(y|ies)\\//.test(window.location.pathname)`,
    cart: platform === 'hybris'
      ? `() => window.location.pathname.includes('/cart')`
      : `() => window.location.pathname.includes('/cart')`,
    checkout: `() => window.location.pathname.includes('/checkout')`,
    order_confirmation: platform === 'hybris'
      ? `() => window.location.pathname.includes('/order-confirmation') || window.location.pathname.includes('/order-detail')`
      : `() => window.location.pathname.includes('/order') || window.location.pathname.includes('/thank-you')`,
    search_results: platform === 'hybris'
      ? `() => window.location.pathname.includes('/search') || new URLSearchParams(window.location.search).has('q') || new URLSearchParams(window.location.search).has('text')`
      : `() => window.location.pathname.includes('/search') || new URLSearchParams(window.location.search).has('q')`,
    account: platform === 'hybris'
      ? `() => window.location.pathname.includes('/my-account')`
      : `() => window.location.pathname.includes('/account') || window.location.pathname.includes('/my-')`,
    blog_detail: platform === 'shopify'
      ? `() => window.location.pathname.startsWith('/blogs/')`
      : `() => /\\/(blog|article|news)\\/[^/]+$/.test(window.location.pathname)`,
    blog: `() => /\\/(blog|articles|news)\\/?$/.test(window.location.pathname)`,
  }

  return patterns[pageType] || `() => false /* TODO: implement isMatch for ${pageType} */`
}

function shouldHaveCatalog(pageType: string): boolean {
  return ['product_detail', 'category', 'cart', 'order_confirmation', 'blog_detail'].includes(pageType)
}

function generateCatalogConfig(pageType: string, samplePages: PageSample[]): string {
  // Check if any sample page has JSON-LD Product schema
  const hasProductJsonLd = samplePages.some(p =>
    p.jsonLd.some(ld => (ld as Record<string, unknown>)['@type'] === 'Product')
  )

  if (pageType === 'product_detail') {
    if (hasProductJsonLd) {
      return `{
        Product: {
          _id: () => SalesforceInteractions.resolvers.getJsonLdData('Product', 'sku') || SalesforceInteractions.resolvers.getJsonLdData('Product', 'productID'),
          name: () => SalesforceInteractions.resolvers.getJsonLdData('Product', 'name'),
          description: () => SalesforceInteractions.resolvers.getJsonLdData('Product', 'description'),
          price: () => SalesforceInteractions.resolvers.getJsonLdData('Product', 'offers.price'),
          imageUrl: () => SalesforceInteractions.resolvers.getJsonLdData('Product', 'image'),
          url: () => SalesforceInteractions.resolvers.getCanonicalUrl(),
        }
      }`
    }
    return `{
        Product: {
          _id: () => SalesforceInteractions.resolvers.getAttribute('data-product-id', 'body') || new URLSearchParams(window.location.search).get('id'),
          name: () => SalesforceInteractions.resolvers.selectText('h1.product-title, h1.product__title, h1[itemprop="name"]'),
          price: () => SalesforceInteractions.resolvers.selectText('.price, .product-price, [itemprop="price"]'),
          imageUrl: () => document.querySelector('.product-image img, .product__image img')?.getAttribute('src') ?? undefined,
          url: () => SalesforceInteractions.resolvers.getCanonicalUrl(),
        }
      }`
  }

  if (pageType === 'category') {
    return `{
        Category: {
          _id: () => window.location.pathname.split('/').filter(Boolean).pop(),
          name: () => SalesforceInteractions.resolvers.selectText('h1, .category-title, .collection-title'),
        }
      }`
  }

  return ''
}

function generateContentZones(pageType: string): import('@/types/sitemap').ContentZone[] {
  const zones: Record<string, import('@/types/sitemap').ContentZone[]> = {
    home: [
      { name: 'home_hero', selector: '.hero, .banner, [data-section-type="image-banner"]' },
      { name: 'home_recs', selector: '.featured-products, .home-recommendations' },
    ],
    product_detail: [
      { name: 'product_detail_recs_row_1', selector: '.product-recommendations, .related-products' },
      { name: 'product_detail_recs_row_2', selector: '.recently-viewed, .you-may-also-like' },
    ],
    category: [
      { name: 'category_top_banner', selector: '.collection-hero, .category-banner' },
    ],
    cart: [
      { name: 'cart_recommendations', selector: '.cart-recommendations, .upsell' },
    ],
  }

  return zones[pageType] || []
}
