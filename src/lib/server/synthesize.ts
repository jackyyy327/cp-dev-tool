import type {
  DataObjectDraft,
  EventDraft,
  Evidence,
  EvidenceLocation,
  InteractionName,
  Origin,
  PageTypeDraft,
} from '@/types/analysis'
import type { RawSample } from './sample-pages'

interface Cluster {
  template: string
  pages: RawSample[]
}

type Classification =
  | 'home'
  | 'product'
  | 'category'
  | 'search'
  | 'cart'
  | 'checkout'
  | 'content'
  | 'other'

interface ScoreBreakdown {
  score: number
  hits: string[]
}

interface ClassScore {
  class: Classification
  score: number
  hits: string[]
}

export interface SynthesizeOutput {
  pageTypes: PageTypeDraft[]
  dataObjects: DataObjectDraft[]
  events: EventDraft[]
  evidence: Evidence[]
}

export function synthesize(samples: RawSample[]): SynthesizeOutput {
  const clusters = clusterSamples(samples)
  const pageTypes: PageTypeDraft[] = []
  const dataObjects: DataObjectDraft[] = []
  const events: EventDraft[] = []
  const evidence: Evidence[] = []

  for (const cluster of clusters) {
    const id = 'pt_' + hash(cluster.template)
    const first = cluster.pages[0]
    const sigSet = new Set<string>()
    cluster.pages.forEach((p) => p.signals.forEach((s) => sigSet.add(s)))
    const anySpaShell = cluster.pages.some((p) => p.spaShell)
    const samplePaths = cluster.pages.map((p) => p.url)

    const scores = scoreClasses(cluster.template, sigSet, samplePaths)
    const [top, runnerUp] = scores
    // Need at least 3 points to commit to a class — weaker matches are almost
    // always site-wide signal leakage and should land in "other".
    const winner: Classification = top.score >= 3 ? top.class : 'other'
    const confidence = confidenceFromScore(top.score, runnerUp?.score ?? 0, anySpaShell, sigSet.size)
    const evRefs: string[] = []

    // URL pattern evidence — each sampled path becomes a clickable location
    // so the consultant can open the live page and verify the template.
    const urlEv: Evidence = {
      id: 'ev_url_' + hash(cluster.template),
      kind: 'UrlPattern',
      source: 'UrlPattern',
      label: cluster.template,
      detail:
        cluster.pages.length +
        ' sampled page' +
        (cluster.pages.length === 1 ? '' : 's') +
        ' match this path template',
      matched: samplePaths,
      locations: cluster.pages.map((p) => ({ url: p.url, label: p.title })),
      pageTypeRef: id,
    }
    evidence.push(urlEv)
    evRefs.push(urlEv.id)

    // Scoring evidence (the "why this class" explanation)
    const scoringEv: Evidence = {
      id: 'ev_score_' + hash(cluster.template),
      kind: 'Scoring',
      source: classificationSource(winner),
      label: humanClassName(winner) + ' — score ' + top.score,
      detail: scoreDetail(winner, top),
      matched: top.hits,
      confidenceReason: reasonForConfidence(confidence, top, runnerUp, anySpaShell),
      competingInterpretation:
        runnerUp && runnerUp.score >= Math.max(2, top.score - 1)
          ? humanClassName(runnerUp.class) + ' (score ' + runnerUp.score + ', ' + runnerUp.hits.slice(0, 3).join(' + ') + ')'
          : undefined,
      consultantAction: consultantActionFor(winner, confidence, runnerUp),
      pageTypeRef: id,
    }
    evidence.push(scoringEv)
    evRefs.push(scoringEv.id)

    // Page signal evidence — list concrete signals that fired, plus per-signal
    // locations (first sampled page where each signal was detected + snippet)
    // so the consultant can one-click-verify on the live DOM.
    if (sigSet.size > 0) {
      const sigList = Array.from(sigSet)
      const locations: EvidenceLocation[] = []
      for (const token of sigList) {
        for (const p of cluster.pages) {
          const hit = p.signalHits.find((h) => h.token === token)
          if (!hit) continue
          locations.push({
            url: p.url,
            snippet: hit.snippet,
            patternName: hit.patternName,
            label: token,
          })
          break
        }
      }
      const signalEv: Evidence = {
        id: 'ev_signal_' + hash(cluster.template),
        kind: 'PageSignal',
        source: 'DomSignal',
        label: sigList.slice(0, 4).join(' · '),
        detail: 'All signals observed across sampled pages in this cluster',
        matched: sigList,
        locations: locations.length > 0 ? locations : undefined,
        pageTypeRef: id,
      }
      evidence.push(signalEv)
      evRefs.push(signalEv.id)
    }

    if (anySpaShell) {
      const spaEv: Evidence = {
        id: 'ev_spa_' + hash(cluster.template),
        kind: 'Risk',
        source: 'SampleCoverage',
        label: 'Client-rendered shell',
        detail:
          'This page rendered with <300 chars of visible text — likely a SPA. DOM-based signals may be unreliable until JS executes.',
        consultantAction: 'Inspect the live page in a browser and confirm page-type assumptions',
        pageTypeRef: id,
      }
      evidence.push(spaEv)
      evRefs.push(spaEv.id)
    }

    // Create data objects and events only when winner + evidence justify them
    let objectRefs: string[] = []
    let interactionName: InteractionName | undefined

    if (winner === 'product') {
      const strongProduct =
        sigSet.has('jsonld:Product') || sigSet.has('og:type=product') || sigSet.has('sku hint')
      ensureObject(dataObjects, {
        id: 'do_product',
        type: 'Product',
        label: 'Product',
        fields: [
          { name: 'id', source: strongProduct ? 'jsonLd' : 'manual', required: true },
          {
            name: 'name',
            source: strongProduct ? 'jsonLd' : 'dom',
            selectorHint: 'h1',
            required: true,
          },
          {
            name: 'price',
            source: strongProduct ? 'jsonLd' : 'dom',
            selectorHint: '.price',
            required: strongProduct,
          },
        ],
      })
      objectRefs = ['do_product']
      interactionName = 'ViewCatalogObject'
      // Find the specific page + snippet that triggered the AddToCart so the
      // origin can point at a concrete observation instead of a generic claim.
      const cartSignalTokens = [
        'add-to-cart control',
        'add-to-cart control (JA)',
        'cart form',
        'variant selector',
        'variant selector (JA)',
      ]
      let cartTrigger: { url: string; token: string; snippet?: string } | null = null
      for (const token of cartSignalTokens) {
        if (!sigSet.has(token)) continue
        for (const p of cluster.pages) {
          const hit = p.signalHits.find((h) => h.token === token)
          if (hit) {
            cartTrigger = { url: p.url, token, snippet: hit.snippet }
            break
          }
        }
        if (cartTrigger) break
      }
      if (cartTrigger) {
        upsertEvent(events, {
          id: 'ev_add_to_cart',
          kind: 'interaction',
          interactionName: 'AddToCart',
          pageTypeRefs: [id],
          objectRef: 'do_product',
          triggerHint: 'click on add-to-cart control',
          origin: {
            type: 'observed',
            reason:
              'Add-to-cart control (' +
              cartTrigger.token +
              ') detected on sampled page ' +
              cartTrigger.url,
            evidenceRefs: sigSet.size > 0 ? ['ev_signal_' + hash(cluster.template)] : undefined,
          },
          review: { state: 'pending' },
        })
      }
    } else if (winner === 'category') {
      ensureObject(dataObjects, {
        id: 'do_category',
        type: 'Category',
        label: 'Category',
        fields: [{ name: 'id', source: 'url', required: true }],
      })
      objectRefs = ['do_category']
      interactionName = 'ViewCategory'
    } else if (winner === 'search') {
      interactionName = 'ViewSearch'
    } else if (winner === 'cart') {
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
    } else if (winner === 'checkout') {
      ensureObject(dataObjects, {
        id: 'do_order',
        type: 'Order',
        label: 'Order',
        fields: [
          { name: 'id', source: 'dom', selectorHint: '.order-number', required: true },
          { name: 'total', source: 'dom', selectorHint: '.order-total', required: true },
        ],
      })
      objectRefs = ['do_order']
      // Purchase is an order-level interaction — only emit if confidence is high
      if (confidence === 'high') {
        const firstPath = samplePaths[0]
        upsertEvent(events, {
          id: 'ev_purchase',
          kind: 'interaction',
          interactionName: 'Purchase',
          pageTypeRefs: [id],
          objectRef: 'do_order',
          triggerHint: 'order confirmation page load',
          origin: {
            type: 'observed',
            reason:
              'Checkout/order URL anchor matched with high confidence' +
              (firstPath ? ' on sampled path ' + firstPath : ''),
            evidenceRefs: ['ev_url_' + hash(cluster.template)],
          },
          review: { state: 'pending' },
        })
      }
    }

    const ptOrigin = originForClassification(winner, top, confidence, sigSet)
    pageTypes.push({
      id,
      name: nameFor(cluster.template, winner, first),
      isMatchHint: isMatchHintFor(cluster.template),
      interactionName,
      objectRefs,
      eventRefs: [],
      sampleUrls: samplePaths,
      confidence,
      status: 'suggested',
      evidenceRefs: evRefs,
      origin: ptOrigin,
      review: { state: confidence === 'high' ? 'confirmed' : 'pending' },
    })
  }

  for (const pt of pageTypes) {
    pt.eventRefs = events.filter((e) => e.pageTypeRefs.includes(pt.id)).map((e) => e.id)
  }

  return { pageTypes, dataObjects, events, evidence }
}

// ——— scoring ———

function scoreClasses(
  template: string,
  sigs: Set<string>,
  samplePaths: string[],
): ClassScore[] {
  const t = template.toLowerCase()
  const first = t.split('/').filter(Boolean)[0] || ''
  const has = (s: string) => sigs.has(s)
  const urlIs = (re: RegExp) => re.test(t)
  const querySearch = samplePaths.some((p) => /\?(q|s|query|keyword|search)=/.test(p))

  // Anchor gates — site-wide DOM signals (header/footer mentions of "cart",
  // "checkout", "add to cart") leak into every cluster, so we only credit
  // commerce classifications when the URL or structured data confirms the
  // page's actual purpose. Without an anchor, the class is capped at 2 points.
  //
  // Weak-structure PDP exception: a leaf slug path (single segment, no query)
  // with the combined signal set of a terminal product page can raise an
  // anchor. This catches brand sites that use slug-only URLs like
  // /baggies.html or /tree-runner without a /products/ prefix.
  const leafSegs = t === '/' ? [] : t.split('/').filter(Boolean)
  const isLeaf = leafSegs.length >= 1 && leafSegs.length <= 2 && !t.endsWith('/')
  const hasProductCombo =
    [
      has('product gallery'),
      has('product spec block'),
      has('variant selector'),
      has('variant selector (JA)'),
      has('add-to-cart control'),
      has('add-to-cart control (JA)'),
      has('stock state'),
      has('stock state (JA)'),
      has('sku hint'),
      has('visible price'),
      has('visible price (JA)'),
    ].filter(Boolean).length >= 3
  const hasTerminalBreadcrumb = has('breadcrumb nav') || has('jsonld:Breadcrumb')
  const weakProductAnchor = isLeaf && hasProductCombo && hasTerminalBreadcrumb
  const productAnchor =
    has('jsonld:Product') ||
    has('og:type=product') ||
    urlIs(/\/(products?|p|item|dp|goods|商品|shouhin)\b/) ||
    weakProductAnchor
  const categoryAnchor =
    has('jsonld:Collection') ||
    urlIs(/\/(collections?|categor|shop|c|catalog|department|tag|brand)\b/)
  const cartAnchor = urlIs(/\/(cart|basket|bag|minicart)\b/)
  const checkoutAnchor = urlIs(
    /\/(checkout|order(s|-confirmation)?|thank-?you|receipt|complete)\b/,
  )
  const searchAnchor =
    has('jsonld:SearchResults') || querySearch || urlIs(/\/search\b/)

  const product = gate(
    productAnchor,
    addScore(
      has('jsonld:Product') && { pts: 5, h: 'jsonld:Product' },
      has('og:type=product') && { pts: 4, h: 'og:type=product' },
      has('sku hint') && { pts: 2, h: 'sku hint' },
      (has('variant selector') || has('variant selector (JA)')) && { pts: 2, h: 'variant selector' },
      (has('add-to-cart control') || has('add-to-cart control (JA)')) && {
        pts: 1,
        h: 'add-to-cart control',
      },
      urlIs(/\/(products?|p|item|dp|goods)\b/) && { pts: 3, h: 'URL /' + first + '/' },
      (has('visible price') || has('visible price (JA)')) && { pts: 1, h: 'visible price' },
      has('product gallery') && { pts: 2, h: 'product gallery' },
      has('product spec block') && { pts: 2, h: 'product spec block' },
      (has('stock state') || has('stock state (JA)')) && { pts: 1, h: 'stock state' },
      weakProductAnchor && { pts: 2, h: 'weak-structure PDP combo (gallery + specs + breadcrumb)' },
    ),
  )

  const category = gate(
    categoryAnchor,
    addScore(
      has('jsonld:Collection') && { pts: 5, h: 'jsonld:Collection' },
      has('product grid') && { pts: 3, h: 'product grid layout' },
      urlIs(/\/(collections?|categor|shop|c|catalog|department|tag|brand)\b/) && {
        pts: 3,
        h: 'URL /' + first + '/',
      },
      has('filter/sort controls') && { pts: 2, h: 'filter/sort controls' },
      has('breadcrumb nav') && { pts: 1, h: 'breadcrumb nav' },
    ),
  )

  const search = gate(
    searchAnchor,
    addScore(
      has('jsonld:SearchResults') && { pts: 5, h: 'jsonld:SearchResults' },
      querySearch && { pts: 4, h: 'query param q/s/keyword' },
      urlIs(/\/search\b/) && { pts: 4, h: 'URL /search' },
      (has('search input') || has('search input (JA)')) && { pts: 1, h: 'search input' },
    ),
  )

  const cart = gate(
    cartAnchor,
    addScore(
      urlIs(/\/(cart|basket|bag|minicart)\b/) && { pts: 5, h: 'URL /' + first + '/' },
      has('cart form') && { pts: 3, h: 'cart form' },
      (has('cart line items') || has('cart line items (JA)')) && { pts: 3, h: 'cart line items' },
    ),
  )

  // Checkout is very strict — must have URL anchor, DOM "checkout" text is
  // unreliable because headers/footers link to checkout from every page.
  const checkout = gate(
    checkoutAnchor,
    addScore(
      urlIs(/\/(checkout|order(s|-confirmation)?|thank-?you|receipt|complete)\b/) && {
        pts: 5,
        h: 'URL /' + first + '/',
      },
      (has('checkout hint') || has('checkout hint (JA)')) && checkoutAnchor && {
        pts: 2,
        h: 'checkout DOM hint',
      },
    ),
  )

  const content = addScore(
    has('jsonld:Article') && { pts: 5, h: 'jsonld:Article' },
    has('og:type=article') && { pts: 4, h: 'og:type=article' },
    has('article tag') && { pts: 2, h: '<article> element' },
    has('datetime meta') && { pts: 2, h: '<time datetime>' },
    has('author byline') && { pts: 2, h: 'author byline' },
  )

  const home: ScoreBreakdown =
    template === '/' ? { score: 10, hits: ['root path /'] } : { score: 0, hits: [] }

  const all: ClassScore[] = [
    { class: 'home', score: home.score, hits: home.hits },
    { class: 'product', score: product.score, hits: product.hits },
    { class: 'category', score: category.score, hits: category.hits },
    { class: 'search', score: search.score, hits: search.hits },
    { class: 'cart', score: cart.score, hits: cart.hits },
    { class: 'checkout', score: checkout.score, hits: checkout.hits },
    { class: 'content', score: content.score, hits: content.hits },
  ]
  all.sort((a, b) => b.score - a.score)
  return all
}

function addScore(...items: (false | { pts: number; h: string })[]): ScoreBreakdown {
  let score = 0
  const hits: string[] = []
  for (const it of items) {
    if (!it) continue
    score += it.pts
    hits.push(it.h)
  }
  return { score, hits }
}

// Cap a class's score when the anchor gate is absent. Weak residual signals
// still surface (e.g. a shared "add to cart" mention), but can never outrank
// a properly-anchored classification.
function gate(anchorPresent: boolean, s: ScoreBreakdown): ScoreBreakdown {
  if (anchorPresent) return s
  return { score: Math.min(s.score, 2), hits: s.hits }
}

function confidenceFromScore(
  top: number,
  runner: number,
  spa: boolean,
  signalCount: number,
): 'high' | 'medium' | 'low' {
  if (spa && signalCount < 3) return 'low'
  if (top >= 7 && top - runner >= 3) return 'high'
  if (top >= 4) return 'medium'
  return 'low'
}

function reasonForConfidence(
  c: 'high' | 'medium' | 'low',
  top: ClassScore,
  runner: ClassScore | undefined,
  spa: boolean,
): string {
  if (spa) return 'Client-rendered shell — DOM signals sparse; confidence capped.'
  if (c === 'high')
    return (
      'Top score ' +
      top.score +
      ' clearly exceeds runner-up ' +
      (runner?.score ?? 0) +
      '; multiple independent signals agree.'
    )
  if (c === 'medium')
    return (
      'Score ' +
      top.score +
      ' passes classification threshold but runner-up ' +
      humanClassName(runner?.class ?? 'other') +
      ' at ' +
      (runner?.score ?? 0) +
      ' is close — review before locking.'
    )
  return 'No strong signal combination — cluster fell back to generic/other.'
}

function consultantActionFor(
  c: Classification,
  conf: 'high' | 'medium' | 'low',
  runner: ClassScore | undefined,
): string {
  if (c === 'other' || conf === 'low')
    return 'Review sampled URLs and rename or merge with a more specific page type.'
  if (conf === 'medium' && runner)
    return 'Confirm this is ' + humanClassName(c) + ' and not ' + humanClassName(runner.class) + '.'
  return 'Confirm the name and isMatch expression, then lock.'
}

function classificationSource(c: Classification): Evidence['source'] {
  if (c === 'home') return 'UrlPattern'
  if (c === 'content') return 'StructuredData'
  return 'DomSignal'
}

function humanClassName(c: Classification): string {
  switch (c) {
    case 'home':
      return 'Home'
    case 'product':
      return 'Product Detail'
    case 'category':
      return 'Category'
    case 'search':
      return 'Search Results'
    case 'cart':
      return 'Cart'
    case 'checkout':
      return 'Checkout / Order'
    case 'content':
      return 'Content / Article'
    case 'other':
      return 'Other'
  }
}

function scoreDetail(c: Classification, s: ClassScore): string {
  if (s.hits.length === 0) return 'No class-specific signals observed.'
  return humanClassName(c) + ' signals: ' + s.hits.join(' + ')
}

// Observed: anchored by URL or JSON-LD — we have a concrete site fact.
// Inferred: scoring/weak-anchor or fell through to "other" — analyzer's
// aggregation, not a direct observation.
function originForClassification(
  winner: Classification,
  top: ClassScore,
  confidence: 'high' | 'medium' | 'low',
  sigSet: Set<string>,
): Origin {
  if (winner === 'home') {
    return { type: 'observed', reason: 'Entry URL is the site root' }
  }
  if (winner === 'other') {
    return {
      type: 'inferred',
      reason: 'No class-specific signal combination reached the threshold',
    }
  }
  const hasStructuredAnchor =
    sigSet.has('jsonld:Product') ||
    sigSet.has('jsonld:Collection') ||
    sigSet.has('jsonld:Article') ||
    sigSet.has('jsonld:SearchResults') ||
    sigSet.has('og:type=product') ||
    sigSet.has('og:type=article')
  const hasUrlAnchor = top.hits.some((h) => h.startsWith('URL /'))
  if (hasStructuredAnchor || hasUrlAnchor || confidence === 'high') {
    return {
      type: 'observed',
      reason:
        hasStructuredAnchor
          ? 'Structured data anchor (' + top.hits.filter((h) => h.startsWith('jsonld')).join(', ') + ')'
          : hasUrlAnchor
          ? 'URL pattern anchor — ' + top.hits.filter((h) => h.startsWith('URL /')).join(', ')
          : 'High-confidence multi-signal agreement',
    }
  }
  return {
    type: 'inferred',
    reason:
      'Classified by DOM signal aggregation without a URL or structured-data anchor',
  }
}

function upsertEvent(events: EventDraft[], draft: EventDraft): void {
  const existing = events.find((e) => e.id === draft.id)
  if (!existing) {
    events.push(draft)
    return
  }
  for (const ref of draft.pageTypeRefs) {
    if (!existing.pageTypeRefs.includes(ref)) existing.pageTypeRefs.push(ref)
  }
}

// ——— clustering ———

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
  const clean = path.split('?')[0]
  if (clean === '/') return '/'
  const segs = clean.split('/').filter(Boolean)
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

function nameFor(template: string, cls: Classification, first: RawSample): string {
  if (cls === 'home') return 'Home'
  if (cls === 'product') return 'Product Detail'
  if (cls === 'category') return 'Category'
  if (cls === 'cart') return 'Cart'
  if (cls === 'search') return 'Search Results'
  if (cls === 'checkout') return 'Checkout / Order'
  if (cls === 'content') return 'Article'
  const segs = template.split('/').filter(Boolean).filter((s) => !s.startsWith(':'))
  if (segs.length > 0) {
    return segs[0].replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
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
