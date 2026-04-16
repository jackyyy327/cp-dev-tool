import type {
  AttributeCandidate,
  DataObjectDraft,
  EventDraft,
  Evidence,
  PageTypeDraft,
  PendingConfirmation,
  RequirementMapping,
  RequirementMappingTarget,
} from '@/types/analysis'

interface Intent {
  id:
    | 'view_product'
    | 'view_category'
    | 'view_search'
    | 'add_to_cart'
    | 'purchase'
    | 'view_cart'
    | 'track_content'
    | 'enrich_profile'
    | 'attribute_language'
    | 'attribute_market'
    | 'attribute_login'
    | 'attribute_customer_type'
    | 'attribute_affinity'
    | 'attribute_consent'
    | 'exclude'
    | 'generic_track'
  interaction?:
    | 'ViewCatalogObject'
    | 'ViewCategory'
    | 'ViewSearch'
    | 'AddToCart'
    | 'Purchase'
    | 'ViewCart'
  objectTypes: Array<'Product' | 'Category' | 'Cart' | 'Order' | 'Search'>
  pageClassHint?: 'product' | 'category' | 'search' | 'cart' | 'checkout' | 'content' | 'home'
  attributeBinding?: string // attribute name, e.g. 'language'
  mayCreateEvent?: boolean // if true and no event matches, synthesize a candidate
}

interface ParsedClause {
  text: string
  original: string
  negated: boolean
  conditional: boolean
  limiter: boolean
  intents: Array<{ intent: Intent; matchedPhrase: string }>
}

// Intent templates — ordered; longer/more specific first so we don't let a
// generic "view" swallow "view product detail".
//
// Templates are deliberately patterned on consultant-style phrasing rather
// than single keywords. "track product detail views", "capture product
// impressions", "understand how users browse categories" all map to the
// right intent without requiring exact wording.
const TEMPLATES: Array<{ pattern: RegExp; intent: Intent }> = [
  // ——— page/event intents ———
  {
    pattern:
      /\b(product\s*(detail|page|view|impression)|pdp|view\s*(a\s*)?product|product\s*view|view\s*item|browse\s*products?)\b/,
    intent: {
      id: 'view_product',
      interaction: 'ViewCatalogObject',
      objectTypes: ['Product'],
      pageClassHint: 'product',
      mayCreateEvent: true,
    },
  },
  {
    pattern:
      /\b(categor(y|ies)|collection|listing|plp|browse\s*categor(y|ies)|category\s*(view|page|impression))\b/,
    intent: {
      id: 'view_category',
      interaction: 'ViewCategory',
      objectTypes: ['Category'],
      pageClassHint: 'category',
      mayCreateEvent: true,
    },
  },
  {
    pattern:
      /\b(search(\s*(result|usage|query|page|term|keyword))?|on[\s-]?site\s*search|site\s*search)\b/,
    intent: {
      id: 'view_search',
      interaction: 'ViewSearch',
      objectTypes: [],
      pageClassHint: 'search',
      mayCreateEvent: true,
    },
  },
  {
    pattern:
      /\badd[\s-]?to[\s-]?cart\b|\badd\s+item(s)?\s+to\s+(the\s+)?cart\b|\bput\s+in\s+(the\s+)?cart\b/,
    intent: {
      id: 'add_to_cart',
      interaction: 'AddToCart',
      objectTypes: ['Cart', 'Product'],
      pageClassHint: 'product',
      mayCreateEvent: true,
    },
  },
  {
    pattern:
      /\b(purchase|checkout\s*(complete|start|intent)?|order\s*(complete|confirmation|placed)?|transaction|conversion)\b/,
    intent: {
      id: 'purchase',
      interaction: 'Purchase',
      objectTypes: ['Order'],
      pageClassHint: 'checkout',
      mayCreateEvent: true,
    },
  },
  {
    pattern: /\b(cart\s*(state|view|page|value)|view\s*(the\s*)?cart|basket)\b/,
    intent: {
      id: 'view_cart',
      interaction: 'ViewCart',
      objectTypes: ['Cart'],
      pageClassHint: 'cart',
      mayCreateEvent: true,
    },
  },
  {
    pattern: /\b(article|blog|story|content)\s*(view|page|read|impression)?s?\b/,
    intent: { id: 'track_content', objectTypes: [], pageClassHint: 'content' },
  },
  // ——— attribute intents ———
  {
    pattern: /\b(language|ui\s*language|html\s*lang|display\s*language|locale)\b/,
    intent: { id: 'attribute_language', objectTypes: [], attributeBinding: 'language' },
  },
  {
    pattern: /\b(market|country|region|store\s*locale)\b/,
    intent: { id: 'attribute_market', objectTypes: [], attributeBinding: 'market' },
  },
  {
    pattern: /\b(login\s*status|authenticated|known\s*vs\s*anonymous|logged[\s-]?in|sign[\s-]?in\s*state)\b/,
    intent: { id: 'attribute_login', objectTypes: [], attributeBinding: 'loginStatus' },
  },
  {
    pattern: /\b(customer\s*(tier|type|segment)|member|subscriber|loyalty|b2[bc]|vip)\b/,
    intent: { id: 'attribute_customer_type', objectTypes: [], attributeBinding: 'customerType' },
  },
  {
    pattern:
      /\b(affinity|preference|interest|category\s*affinity|brand\s*affinity|product\s*affinity|browse\s*affinity)\b/,
    intent: { id: 'attribute_affinity', objectTypes: [], attributeBinding: 'productAffinity' },
  },
  {
    pattern: /\b(consent|opt[\s-]?in|opt[\s-]?out|gdpr|ccpa|privacy\s*preference)\b/,
    intent: { id: 'attribute_consent', objectTypes: [], attributeBinding: 'consentStatus' },
  },
  {
    pattern: /\b(enrich|capture|update).*(profile|user|visitor|attribute)\b/,
    intent: { id: 'enrich_profile', objectTypes: [] },
  },
]

const EXCLUSION_RE =
  /\b(do\s*not|don'?t|never|avoid|exclude|without)\b|\bno\s+(cart|commerce|purchase|product|sensitive)/
const CONDITIONAL_RE =
  /\b(if\s+(detectable|possible|available)|where\s+possible|otherwise|when\s+available|if\s+they)\b/
const LIMIT_RE = /\b(only|solely|exclusively)\b/

export function parseRequirements(
  rawText: string,
  pageTypes: PageTypeDraft[],
  dataObjects: DataObjectDraft[],
  events: EventDraft[],
  attributes: AttributeCandidate[],
): {
  mappings: RequirementMapping[]
  pending: PendingConfirmation[]
  evidence: Evidence[]
  newEvents: EventDraft[]
} {
  const mappings: RequirementMapping[] = []
  const pending: PendingConfirmation[] = []
  const evidence: Evidence[] = []
  const newEvents: EventDraft[] = []
  if (!rawText.trim()) return { mappings, pending, evidence, newEvents }

  const clauses = splitClauses(rawText).map(parseClause)

  clauses.forEach((clause, i) => {
    const targets: RequirementMappingTarget[] = []
    const matchedHits: string[] = []
    const matchedIntents = clause.intents

    if (clause.negated) {
      const id = 'rm_' + i + '_' + rand()
      mappings.push({
        id,
        text: clause.original,
        targets: [],
        status: 'mapped', // negation is a handled exclusion, not a failure
      })
      evidence.push({
        id: 'ev_req_excl_' + id,
        kind: 'RequirementMatch',
        source: 'RequirementText',
        label: 'Exclusion: ' + clause.original.slice(0, 50),
        detail: 'Recognized as a "do not track" / exclusion instruction',
        matched: clause.intents.map((i) => i.matchedPhrase),
        confidenceReason: 'Matched negation keyword — no targets generated intentionally',
        consultantAction: 'Verify no events or objects are inadvertently created for this topic',
      })
      return
    }

    if (matchedIntents.length === 0) {
      const id = 'rm_' + i + '_' + rand()
      mappings.push({
        id,
        text: clause.original,
        targets: [],
        status: 'unmapped',
      })
      pending.push({
        id: 'pc_' + id,
        question:
          'Could not auto-map requirement: "' +
          truncate(clause.original, 80) +
          '". Assign it to a page type, object, attribute, or event manually.',
      })
      evidence.push({
        id: 'ev_req_unmapped_' + id,
        kind: 'RequirementMatch',
        source: 'RequirementText',
        label: 'Unmapped: ' + clause.original.slice(0, 50),
        detail: 'No intent template matched this clause',
        confidenceReason:
          'None of the product/category/search/cart/purchase/content/attribute templates fired',
        consultantAction: 'Rephrase or manually assign this requirement',
      })
      return
    }

    for (const { intent, matchedPhrase } of matchedIntents) {
      matchedHits.push(matchedPhrase)

      // Attribute-type intent → bind to attribute candidate
      if (intent.attributeBinding) {
        let attr = attributes.find((a) => a.name === intent.attributeBinding)
        if (!attr) {
          // Create a low-confidence requirement-driven candidate on the fly
          attr = {
            id: 'attr_req_' + intent.attributeBinding + '_' + rand(),
            name: intent.attributeBinding,
            category:
              intent.id === 'attribute_language' || intent.id === 'attribute_market'
                ? 'Locale'
                : intent.id === 'attribute_login'
                ? 'Identity'
                : intent.id === 'attribute_customer_type'
                ? 'CustomerType'
                : intent.id === 'attribute_affinity'
                ? 'Affinity'
                : intent.id === 'attribute_consent'
                ? 'Consent'
                : 'Other',
            proposedSource: 'requirement text',
            detectionHint: 'derive from runtime signal',
            confidence: 'low',
            confidenceReason:
              'Requested by the requirement but no crawl-time DOM signal corroborated it',
            sensitive: false,
            status: 'needsConfirmation',
            consultantAction:
              'Confirm the runtime source and whether this should be tracked in sitemap vs. derived downstream',
            fromRequirement: true,
            evidenceRefs: [],
            origin: {
              type: 'requirement-driven',
              reason: 'Proposed because the requirement mentioned it — not observed on site',
            },
            review: { state: 'pending' },
          }
          attributes.push(attr)
        }
        targets.push({ attributeRef: attr.id })
        continue
      }

      const candidatePt = intent.pageClassHint
        ? pageTypes.find((pt) => classHintMatchesPT(intent.pageClassHint!, pt))
        : undefined

      // Event target — bind or synthesize
      if (intent.interaction) {
        let ev = events.find((e) => e.interactionName === intent.interaction)
        if (!ev && intent.mayCreateEvent && candidatePt) {
          ev = {
            id: 'ev_' + intent.interaction!.toLowerCase() + '_' + rand(),
            kind: 'interaction',
            interactionName: intent.interaction,
            pageTypeRefs: [candidatePt.id],
            triggerHint: defaultTriggerFor(intent.interaction),
            origin: {
              type: 'requirement-driven',
              reason: 'Synthesized because the requirement asked for it; not observed on site',
            },
            review: { state: 'pending' },
          }
          events.push(ev)
          newEvents.push(ev)
        }
        if (ev) {
          targets.push({
            eventRef: ev.id,
            pageTypeRef: candidatePt?.id ?? ev.pageTypeRefs[0],
            objectRef: ev.objectRef,
          })
          continue
        }
      }

      // Object target
      for (const ot of intent.objectTypes) {
        const obj = dataObjects.find((d) => d.type === ot)
        if (obj) targets.push({ objectRef: obj.id, pageTypeRef: candidatePt?.id })
      }

      // Page type fallback
      if (candidatePt && !targets.some((t) => t.pageTypeRef === candidatePt.id)) {
        targets.push({ pageTypeRef: candidatePt.id })
      }
    }

    const unique = dedupe(targets)
    const id = 'rm_' + i + '_' + rand()

    let status: RequirementMapping['status']
    if (unique.length === 0) status = 'unmapped'
    else if (clause.conditional || clause.limiter) status = 'needsConfirmation'
    else if (
      unique.some((t) => t.eventRef) ||
      unique.some((t) => t.attributeRef) ||
      unique.some((t) => t.objectRef && t.pageTypeRef) ||
      unique.length >= 2
    )
      status = 'mapped'
    else status = 'needsConfirmation'

    mappings.push({ id, text: clause.original, targets: unique, status })

    evidence.push({
      id: 'ev_req_' + id,
      kind: 'RequirementMatch',
      source: 'RequirementText',
      label: intentSummary(matchedIntents) + ': ' + clause.original.slice(0, 60),
      detail:
        'Matched ' +
        matchedIntents.length +
        ' intent' +
        (matchedIntents.length === 1 ? '' : 's') +
        ' → ' +
        unique.length +
        ' target binding' +
        (unique.length === 1 ? '' : 's'),
      matched: matchedHits,
      confidenceReason:
        status === 'mapped'
          ? 'Intent template matched and a concrete target (event / attribute / object) was bound'
          : clause.conditional
          ? 'Clause contains a conditional — needs consultant confirmation before locking'
          : clause.limiter
          ? 'Clause contains a limiter ("only"/"exclusively") — confirm scope before locking'
          : 'Intent matched but no concrete target could be bound — weak mapping',
      competingInterpretation:
        matchedIntents.length > 1
          ? matchedIntents
              .slice(1)
              .map((m) => m.intent.id)
              .join(', ')
          : undefined,
      consultantAction:
        status === 'mapped'
          ? 'Verify the bound target is correct'
          : 'Open Questions: confirm the intended target for this requirement',
    })

    if (status !== 'mapped') {
      pending.push({
        id: 'pc_' + id,
        question:
          (status === 'unmapped' ? 'Unmapped requirement: "' : 'Confirm target for: "') +
          truncate(clause.original, 80) +
          '"',
      })
    }
  })

  return { mappings, pending, evidence, newEvents }
}

function defaultTriggerFor(name: string): string {
  switch (name) {
    case 'ViewCatalogObject':
      return 'fires on product detail page load'
    case 'ViewCategory':
      return 'fires on category page load'
    case 'ViewSearch':
      return 'fires on search results page load (bind to query param)'
    case 'ViewCart':
      return 'fires on cart page load'
    case 'AddToCart':
      return 'click on add-to-cart control'
    case 'Purchase':
      return 'order confirmation page load'
    default:
      return 'to be confirmed'
  }
}

function splitClauses(text: string): string[] {
  const sentences = text
    .split(/(?<=[.!?。！？])\s+|[\n;；]+/)
    .map((s) => s.trim())
    .filter(Boolean)
  const out: string[] = []
  for (const s of sentences) {
    const parts = s.split(/\s*,?\s+but\s+(?=do\s*not|don'?t|never|avoid|exclude)/i)
    for (const p of parts) {
      const trimmed = p.trim().replace(/^[,;\s]+|[,;\s]+$/g, '')
      if (trimmed) out.push(trimmed)
    }
  }
  return out
}

function parseClause(original: string): ParsedClause {
  const lower = original.toLowerCase()
  const negated = EXCLUSION_RE.test(lower)
  const conditional = CONDITIONAL_RE.test(lower)
  const limiter = LIMIT_RE.test(lower)
  const intents: Array<{ intent: Intent; matchedPhrase: string }> = []
  for (const tpl of TEMPLATES) {
    const m = lower.match(tpl.pattern)
    if (m) intents.push({ intent: tpl.intent, matchedPhrase: m[0] })
  }
  return { text: lower, original, negated, conditional, limiter, intents }
}

function classHintMatchesPT(hint: string, pt: PageTypeDraft): boolean {
  const n = pt.name.toLowerCase()
  if (hint === 'product') return /product/.test(n)
  if (hint === 'category') return /(category|collection|tag)/.test(n)
  if (hint === 'search') return /search/.test(n)
  if (hint === 'cart') return /cart|basket/.test(n)
  if (hint === 'checkout') return /(checkout|order)/.test(n)
  if (hint === 'content') return /(article|story|blog|content)/.test(n)
  if (hint === 'home') return n === 'home'
  return false
}

function intentSummary(list: Array<{ intent: Intent }>): string {
  return list.map((l) => l.intent.id).join('+')
}

function dedupe(targets: RequirementMappingTarget[]): RequirementMappingTarget[] {
  const seen = new Set<string>()
  const out: RequirementMappingTarget[] = []
  for (const t of targets) {
    const k =
      (t.pageTypeRef || '') +
      '|' +
      (t.objectRef || '') +
      '|' +
      (t.eventRef || '') +
      '|' +
      (t.attributeRef || '')
    if (seen.has(k)) continue
    seen.add(k)
    out.push(t)
  }
  return out
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}

function rand(): string {
  return Math.random().toString(36).slice(2, 6)
}
