import type {
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
const TEMPLATES: Array<{ pattern: RegExp; intent: Intent }> = [
  {
    pattern: /\b(product\s*detail|product\s*page|pdp|view\s*(a\s*)?product|product\s*view|view\s*item)\b/,
    intent: {
      id: 'view_product',
      interaction: 'ViewCatalogObject',
      objectTypes: ['Product'],
      pageClassHint: 'product',
    },
  },
  {
    pattern: /\b(category|collection|listing|plp)\s*(page|view)?s?\b/,
    intent: {
      id: 'view_category',
      interaction: 'ViewCategory',
      objectTypes: ['Category'],
      pageClassHint: 'category',
    },
  },
  {
    pattern: /\bsearch(\s*(result|usage|query|page))?\b/,
    intent: {
      id: 'view_search',
      interaction: 'ViewSearch',
      objectTypes: [],
      pageClassHint: 'search',
    },
  },
  {
    pattern: /\badd[\s-]?to[\s-]?cart\b|\badd\s+item(s)?\s+to\s+(the\s+)?cart\b/,
    intent: {
      id: 'add_to_cart',
      interaction: 'AddToCart',
      objectTypes: ['Cart', 'Product'],
      pageClassHint: 'product',
    },
  },
  {
    pattern: /\b(purchase|checkout\s*complete|order\s*(complete|confirmation)|transaction|order\s*placed)\b/,
    intent: {
      id: 'purchase',
      interaction: 'Purchase',
      objectTypes: ['Order'],
      pageClassHint: 'checkout',
    },
  },
  {
    pattern: /\b(cart\s*(state|view|page)|view\s*(the\s*)?cart|basket)\b/,
    intent: {
      id: 'view_cart',
      interaction: 'ViewCart',
      objectTypes: ['Cart'],
      pageClassHint: 'cart',
    },
  },
  {
    pattern: /\b(article|blog|story|content)\s*(view|page|read)?s?\b/,
    intent: {
      id: 'track_content',
      objectTypes: [],
      pageClassHint: 'content',
    },
  },
  {
    pattern: /\b(enrich|capture|update).*(profile|user|visitor|attribute|affinity|language|market|login\s*status)\b/,
    intent: { id: 'enrich_profile', objectTypes: [] },
  },
]

const EXCLUSION_RE =
  /\b(do\s*not|don'?t|never|avoid|exclude|without)\b|\bno\s+(cart|commerce|purchase|product)/
const CONDITIONAL_RE = /\b(if\s+detectable|if\s+possible|where\s+possible|otherwise|when\s+available)\b/
const LIMIT_RE = /\b(only|solely|exclusively)\b/

export function parseRequirements(
  rawText: string,
  pageTypes: PageTypeDraft[],
  dataObjects: DataObjectDraft[],
  events: EventDraft[],
): {
  mappings: RequirementMapping[]
  pending: PendingConfirmation[]
  evidence: Evidence[]
} {
  const mappings: RequirementMapping[] = []
  const pending: PendingConfirmation[] = []
  const evidence: Evidence[] = []
  if (!rawText.trim()) return { mappings, pending, evidence }

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
          '". Assign it to a page type, object, or event manually.',
      })
      evidence.push({
        id: 'ev_req_unmapped_' + id,
        kind: 'RequirementMatch',
        source: 'RequirementText',
        label: 'Unmapped: ' + clause.original.slice(0, 50),
        detail: 'No intent template matched this clause',
        confidenceReason: 'None of the product/category/search/cart/purchase/content templates fired',
        consultantAction: 'Rephrase or manually assign this requirement',
      })
      return
    }

    for (const { intent, matchedPhrase } of matchedIntents) {
      matchedHits.push(matchedPhrase)

      // Try to bind to an existing page type via hint
      const candidatePt = intent.pageClassHint
        ? pageTypes.find((pt) => classHintMatchesPT(intent.pageClassHint!, pt))
        : undefined

      // Event target
      if (intent.interaction) {
        const ev = events.find((e) => e.interactionName === intent.interaction)
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
          ? 'Intent template matched and a concrete event/object target was available'
          : clause.conditional
          ? 'Clause contains a conditional ("if detectable"/"otherwise") — needs consultant confirmation'
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

  return { mappings, pending, evidence }
}

function splitClauses(text: string): string[] {
  // First pass: sentences on strong terminators.
  const sentences = text
    .split(/(?<=[.!?。！？])\s+|[\n;；]+/)
    .map((s) => s.trim())
    .filter(Boolean)
  // Second pass: split compound sentences on ", but " / " but " so that
  // an exclusion sub-clause doesn't nullify the positive sub-clause.
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
  if (hint === 'category') return /(category|collection)/.test(n)
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
    const k = (t.pageTypeRef || '') + '|' + (t.objectRef || '') + '|' + (t.eventRef || '')
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
