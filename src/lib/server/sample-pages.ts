import { fetchPage, extractLinks } from './fetch-site'
import type { SampledPage } from '@/types/analysis'

export interface RawSample extends SampledPage {
  html: string
}

export async function samplePages(entryUrl: string, maxPages = 8): Promise<RawSample[]> {
  const origin = new URL(entryUrl).origin
  const root = await fetchPage(origin + '/')
  const samples: RawSample[] = [
    { url: '/', title: root.title, signals: collectSignals(root.html), html: root.html },
  ]

  const links = extractLinks(root.html, origin).filter((p) => p !== '/')
  // Diversify by first path segment so we capture different page templates.
  const byFirst = new Map<string, string[]>()
  for (const p of links) {
    const first = p.split('/').filter(Boolean)[0] ?? ''
    if (!byFirst.has(first)) byFirst.set(first, [])
    byFirst.get(first)!.push(p)
  }
  const picks: string[] = []
  for (const group of byFirst.values()) {
    picks.push(...group.slice(0, 2))
    if (picks.length >= maxPages - 1) break
  }

  for (const path of picks.slice(0, maxPages - 1)) {
    try {
      const page = await fetchPage(origin + path)
      samples.push({
        url: path,
        title: page.title,
        signals: collectSignals(page.html),
        html: page.html,
      })
    } catch {
      // skip failed sample
    }
  }
  return samples
}

function collectSignals(html: string): string[] {
  const signals: string[] = []
  if (/application\/ld\+json[^>]*>[^<]*"@type"\s*:\s*"Product"/i.test(html)) {
    signals.push('Product JSON-LD')
  }
  if (/application\/ld\+json[^>]*>[^<]*"@type"\s*:\s*"(CollectionPage|Collection|ItemList|Category)"/i.test(html)) {
    signals.push('Collection JSON-LD')
  }
  if (/\bog:type[^>]*content=["']product["']/i.test(html)) signals.push('og:type product')
  if (/add[-_\s]to[-_\s]cart/i.test(html)) signals.push('add-to-cart button')
  if (/<form[^>]*action=[^>]*\/cart/i.test(html)) signals.push('cart form')
  if (/\bdataLayer\s*=|data-layer\b/i.test(html)) signals.push('dataLayer present')
  if (/gtm\.start|googletagmanager\.com/i.test(html)) signals.push('GTM container')
  if (/price|[¥$€]\s?\d/i.test(html)) signals.push('price visible')
  const h1 = html.match(/<h1[^>]*>([^<]{2,80})<\/h1>/i)
  if (h1) signals.push('h1: ' + h1[1].replace(/\s+/g, ' ').trim())
  return signals
}
