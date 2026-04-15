import type {
  DataObjectDraft,
  EventDraft,
  Evidence,
  InteractionName,
  PageTypeDraft,
} from '@/types/analysis'
import type { RawSample } from './sample-pages'

interface Cluster {
  template: string
  pages: RawSample[]
}

type Classification = 'home' | 'product' | 'category' | 'cart' | 'search' | 'other'

export function synthesize(samples: RawSample[]): {
  pageTypes: PageTypeDraft[]
  dataObjects: DataObjectDraft[]
  events: EventDraft[]
  evidence: Evidence[]
} {
  const clusters = clusterSamples(samples)
  const pageTypes: PageTypeDraft[] = []
  const dataObjects: DataObjectDraft[] = []
  const events: EventDraft[] = []
  const evidence: Evidence[] = []

  for (const cluster of clusters) {
    const id = 'pt_' + hash(cluster.template)
    const first = cluster.pages[0]
    const signalSet = new Set<string>()
    cluster.pages.forEach((p) => p.signals.forEach((s) => signalSet.add(s)))
    const classification = classify(cluster.template, signalSet)
    const evRefs: string[] = []

    const urlEvidence: Evidence = {
      id: 'ev_url_' + hash(cluster.template),
      kind: 'UrlPattern',
      label: cluster.template,
      detail:
        cluster.pages.length +
        ' sampled page' +
        (cluster.pages.length === 1 ? '' : 's') +
        ' match this pattern',
      pageTypeRef: id,
    }
    evidence.push(urlEvidence)
    evRefs.push(urlEvidence.id)

    if (signalSet.size > 0) {
      const signalEvidence: Evidence = {
        id: 'ev_signal_' + hash(cluster.template),
        kind: 'PageSignal',
        label: Array.from(signalSet).slice(0, 3).join(', '),
        detail: Array.from(signalSet).join(' | '),
        pageTypeRef: id,
      }
      evidence.push(signalEvidence)
      evRefs.push(signalEvidence.id)
    }

    let objectRefs: string[] = []
    let interactionName: InteractionName | undefined

    if (classification === 'product') {
      ensureObject(dataObjects, {
        id: 'do_product',
        type: 'Product',
        label: 'Product',
        fields: [
          { name: 'id', source: signalSet.has('Product JSON-LD') ? 'jsonLd' : 'manual', required: true },
          { name: 'name', source: signalSet.has('Product JSON-LD') ? 'jsonLd' : 'dom', selectorHint: 'h1', required: true },
          { name: 'price', source: signalSet.has('Product JSON-LD') ? 'jsonLd' : 'dom', selectorHint: '.price', required: true },
        ],
      })
      objectRefs = ['do_product']
      interactionName = 'ViewCatalogObject'
      if (signalSet.has('add-to-cart button') || signalSet.has('cart form')) {
        const evId = 'ev_add_to_cart'
        if (!events.find((e) => e.id === evId)) {
          events.push({
            id: evId,
            kind: 'interaction',
            interactionName: 'AddToCart',
            pageTypeRefs: [id],
            objectRef: 'do_product',
            triggerHint: 'click on button.add-to-cart',
          })
        } else {
          const e = events.find((x) => x.id === evId)!
          if (!e.pageTypeRefs.includes(id)) e.pageTypeRefs.push(id)
        }
      }
    } else if (classification === 'category') {
      ensureObject(dataObjects, {
        id: 'do_category',
        type: 'Category',
        label: 'Category',
        fields: [{ name: 'id', source: 'url', required: true }],
      })
      objectRefs = ['do_category']
      interactionName = 'ViewCategory'
    } else if (classification === 'search') {
      interactionName = 'ViewSearch'
    } else if (classification === 'cart') {
      ensureObject(dataObjects, {
        id: 'do_cart',
        type: 'Cart',
        label: 'Cart',
        fields: [
          { name: 'totalValue', source: 'dom', selectorHint: '.cart-subtotal', required: true },
        ],
      })
      objectRefs = ['do_cart']
      interactionName = 'ViewCart'
    }

    const confidence: 'high' | 'medium' | 'low' =
      classification !== 'other' && signalSet.size >= 2
        ? 'high'
        : classification !== 'other'
        ? 'medium'
        : 'low'

    pageTypes.push({
      id,
      name: nameFor(cluster.template, classification, first),
      isMatchHint: isMatchHintFor(cluster.template),
      interactionName,
      objectRefs,
      eventRefs: [], // filled in pass 2
      sampleUrls: cluster.pages.map((p) => p.url),
      confidence,
      status: 'suggested',
      evidenceRefs: evRefs,
    })
  }

  // Pass 2 — populate pageType.eventRefs from events that target each page type.
  for (const pt of pageTypes) {
    pt.eventRefs = events.filter((e) => e.pageTypeRefs.includes(pt.id)).map((e) => e.id)
  }

  return { pageTypes, dataObjects, events, evidence }
}

function clusterSamples(samples: RawSample[]): Cluster[] {
  const map = new Map<string, Cluster>()
  for (const p of samples) {
    const tpl = pathTemplate(p.url)
    if (!map.has(tpl)) map.set(tpl, { template: tpl, pages: [] })
    map.get(tpl)!.pages.push(p)
  }
  return Array.from(map.values())
}

function pathTemplate(path: string): string {
  if (path === '/') return '/'
  const segs = path.split('/').filter(Boolean)
  return (
    '/' +
    segs
      .map((s, i) => {
        if (i === 0) return s
        if (/^\d+$/.test(s)) return ':id'
        if (/^[a-z0-9][a-z0-9-]{3,}$/i.test(s)) return ':slug'
        return s
      })
      .join('/')
  )
}

function classify(template: string, signals: Set<string>): Classification {
  if (template === '/') return 'home'
  const t = template.toLowerCase()
  if (/\bcart\b/.test(t)) return 'cart'
  if (/\bsearch\b/.test(t)) return 'search'
  if (
    signals.has('Product JSON-LD') ||
    signals.has('og:type product') ||
    /\/(products?|p|item)\b/.test(t)
  ) {
    return 'product'
  }
  if (
    signals.has('Collection JSON-LD') ||
    /\/(collections?|categor|shop|c|catalog)\b/.test(t)
  ) {
    return 'category'
  }
  return 'other'
}

function nameFor(template: string, cls: Classification, first: RawSample): string {
  if (cls === 'home') return 'Home'
  if (cls === 'product') return 'Product Detail'
  if (cls === 'category') return 'Category'
  if (cls === 'cart') return 'Cart'
  if (cls === 'search') return 'Search Results'
  const segs = template.split('/').filter(Boolean).filter((s) => !s.startsWith(':'))
  if (segs.length > 0) {
    return segs[0]
      .replace(/[-_]/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase())
  }
  return first.title?.slice(0, 40) || 'Untitled'
}

function isMatchHintFor(template: string): string {
  if (template === '/') return 'pathname === "/"'
  const first = template.split('/').filter(Boolean)[0]
  if (first && !first.startsWith(':')) return 'pathname starts with /' + first + '/'
  return 'pathname matches ' + template
}

function ensureObject(list: DataObjectDraft[], obj: DataObjectDraft): void {
  if (!list.find((d) => d.id === obj.id)) list.push(obj)
}

function hash(s: string): string {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h).toString(36).slice(0, 6)
}
