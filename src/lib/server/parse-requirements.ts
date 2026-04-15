import type {
  DataObjectDraft,
  EventDraft,
  PageTypeDraft,
  PendingConfirmation,
  RequirementMapping,
  RequirementMappingTarget,
} from '@/types/analysis'

export function parseRequirements(
  rawText: string,
  pageTypes: PageTypeDraft[],
  dataObjects: DataObjectDraft[],
  events: EventDraft[],
): { mappings: RequirementMapping[]; pending: PendingConfirmation[] } {
  const sentences = splitSentences(rawText)
  const mappings: RequirementMapping[] = []
  const pending: PendingConfirmation[] = []

  sentences.forEach((text, i) => {
    const lower = text.toLowerCase()
    const targets: RequirementMappingTarget[] = []

    for (const pt of pageTypes) {
      if (pageTypeMatches(pt, lower)) targets.push({ pageTypeRef: pt.id })
    }
    for (const ev of events) {
      if (eventMatches(ev, lower)) {
        targets.push({ eventRef: ev.id, pageTypeRef: ev.pageTypeRefs[0] })
      }
    }
    for (const obj of dataObjects) {
      if (objectMatches(obj, lower)) targets.push({ objectRef: obj.id })
    }

    const unique = dedupe(targets)
    const status: RequirementMapping['status'] =
      unique.length === 0
        ? 'unmapped'
        : unique.length >= 2 || hasEventOrObjectTarget(unique)
        ? 'mapped'
        : 'needsConfirmation'

    const id = 'rm_' + i + '_' + Math.random().toString(36).slice(2, 6)
    mappings.push({ id, text, targets: unique, status })

    if (status !== 'mapped') {
      pending.push({
        id: 'pc_' + id,
        question:
          status === 'unmapped'
            ? 'Could not auto-map requirement: "' + truncate(text, 80) + '". Assign a page type manually.'
            : 'Confirm target for requirement: "' + truncate(text, 80) + '"',
      })
    }
  })

  return { mappings, pending }
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?。！？])\s+|[\n;；]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function pageTypeMatches(pt: PageTypeDraft, lower: string): boolean {
  const name = pt.name.toLowerCase()
  if (lower.includes(name)) return true
  if (/product|pdp|detail/.test(lower) && /product/.test(name)) return true
  if (/(category|collection|listing|plp)/.test(lower) && /(category|collection)/.test(name)) return true
  if (/(home|homepage|landing|top)/.test(lower) && name === 'home') return true
  if (/\bcart\b/.test(lower) && /cart/.test(name)) return true
  if (/\bsearch\b/.test(lower) && /search/.test(name)) return true
  return false
}

function eventMatches(ev: EventDraft, lower: string): boolean {
  if (ev.interactionName === 'AddToCart' && /add[- ]?to[- ]?cart/.test(lower)) return true
  if (ev.interactionName === 'Purchase' && /(purchase|checkout complete|order complete)/.test(lower)) return true
  if (ev.interactionName === 'ViewCatalogObject' && /(view a product|product view|pdp view|view item)/.test(lower)) return true
  if (ev.interactionName === 'ViewCategory' && /(view category|category view|collection view)/.test(lower)) return true
  if (ev.customName && lower.includes(ev.customName.toLowerCase())) return true
  return false
}

function objectMatches(obj: DataObjectDraft, lower: string): boolean {
  if (obj.type === 'Product' && /\bproduct\b/.test(lower)) return true
  if (obj.type === 'Category' && /(category|collection)/.test(lower)) return true
  if (obj.type === 'Cart' && /\bcart\b/.test(lower)) return true
  if (obj.type === 'Order' && /(order|purchase)/.test(lower)) return true
  return false
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

function hasEventOrObjectTarget(targets: RequirementMappingTarget[]): boolean {
  return targets.some((t) => t.eventRef || t.objectRef)
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}
