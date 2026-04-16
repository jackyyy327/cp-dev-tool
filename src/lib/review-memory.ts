// Persistent review memory: stores consultant rejections per site so that a
// re-run of the same site automatically re-applies previous decisions. Lives
// in localStorage keyed by site origin. Fingerprints use stable fields
// (isMatchHint for page types, name for attributes, interactionName@pageType
// for events) so transient ids changing between runs don't break matching.

import type {
  AnalysisResult,
  AttributeCandidate,
  EventDraft,
  PageTypeDraft,
} from '@/types/analysis'

const STORAGE_VERSION = 1
const STORAGE_KEY = 'mcpReviewMemory:v' + STORAGE_VERSION

export type MemoryTargetKind = 'pageType' | 'event' | 'attribute'

export interface MemoryEntry {
  fingerprint: string
  kind: MemoryTargetKind
  displayLabel: string
  reason: string
  createdAt: number
}

export interface SiteMemory {
  origin: string
  entries: MemoryEntry[]
}

type MemoryStore = Record<string, SiteMemory>

function readStore(): MemoryStore {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object') return parsed as MemoryStore
    return {}
  } catch {
    return {}
  }
}

function writeStore(store: MemoryStore): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
  } catch {
    // quota exceeded / disabled — swallow, memory is best-effort
  }
}

export function originOf(siteUrl: string): string | null {
  try {
    return new URL(siteUrl).origin
  } catch {
    return null
  }
}

// ——— Fingerprinting ———
//
// Identifiers carried inside AnalysisResult (pt_xxx, attr_xxx, ev_xxx) are
// hash-derived and not stable across re-runs of the same site if e.g. the
// cluster template changes slightly. Fingerprints are stable so the memory
// layer can re-apply decisions correctly.

export function fingerprintPageType(pt: Pick<PageTypeDraft, 'isMatchHint' | 'name'>): string {
  return 'pt:' + (pt.isMatchHint || pt.name || 'unknown')
}

export function fingerprintAttribute(a: Pick<AttributeCandidate, 'name'>): string {
  return 'attr:' + a.name
}

export function fingerprintEvent(
  e: Pick<EventDraft, 'interactionName' | 'customName' | 'pageTypeRefs'>,
  resolvePtHint: (id: string) => string | undefined,
): string {
  const name = e.interactionName ?? e.customName ?? 'unknown'
  const hints =
    e.pageTypeRefs
      .map(resolvePtHint)
      .filter((h): h is string => typeof h === 'string' && h.length > 0)
      .sort()
      .join(',') || '*'
  return 'event:' + name + '@' + hints
}

// ——— Storage ops ———

export function getSiteMemory(siteUrl: string): SiteMemory | null {
  const origin = originOf(siteUrl)
  if (!origin) return null
  const store = readStore()
  return store[origin] ?? null
}

export function rememberReject(
  siteUrl: string,
  entry: Omit<MemoryEntry, 'createdAt'>,
): void {
  const origin = originOf(siteUrl)
  if (!origin) return
  const store = readStore()
  const bucket = store[origin] ?? { origin, entries: [] }
  const existing = bucket.entries.find((e) => e.fingerprint === entry.fingerprint)
  if (existing) {
    existing.reason = entry.reason
    existing.displayLabel = entry.displayLabel
    existing.kind = entry.kind
    existing.createdAt = Date.now()
  } else {
    bucket.entries.push({ ...entry, createdAt: Date.now() })
  }
  store[origin] = bucket
  writeStore(store)
}

export function forgetReject(siteUrl: string, fingerprint: string): void {
  const origin = originOf(siteUrl)
  if (!origin) return
  const store = readStore()
  const bucket = store[origin]
  if (!bucket) return
  bucket.entries = bucket.entries.filter((e) => e.fingerprint !== fingerprint)
  if (bucket.entries.length === 0) {
    delete store[origin]
  } else {
    store[origin] = bucket
  }
  writeStore(store)
}

// ——— Apply to analysis ———
//
// Mutates the AnalysisResult in place, setting review = { state: 'rejected' }
// on every item whose fingerprint matches a remembered entry. Called once
// when a new analysis lands so the workbench opens with previous decisions
// already applied.

export function applyMemoryToAnalysis(analysis: AnalysisResult): AnalysisResult {
  const memory = getSiteMemory(analysis.site.url)
  if (!memory || memory.entries.length === 0) return analysis
  const byFingerprint = new Map(memory.entries.map((e) => [e.fingerprint, e]))

  const stamp = (m: MemoryEntry) => ({
    state: 'rejected' as const,
    note: 'Auto-rejected from client memory — ' + m.reason,
    updatedAt: Date.now(),
  })

  const ptHintById = new Map(analysis.pageTypes.map((pt) => [pt.id, pt.isMatchHint]))

  for (const pt of analysis.pageTypes) {
    const mem = byFingerprint.get(fingerprintPageType(pt))
    if (mem) pt.review = stamp(mem)
  }
  for (const a of analysis.attributes) {
    const mem = byFingerprint.get(fingerprintAttribute(a))
    if (mem) a.review = stamp(mem)
  }
  for (const e of analysis.events) {
    const mem = byFingerprint.get(fingerprintEvent(e, (id) => ptHintById.get(id)))
    if (mem) e.review = stamp(mem)
  }
  return analysis
}

// ——— Fingerprint lookup from a live analysis by kind + id ———
//
// The store's actions.review receives (target kind, item id) but the memory
// layer works on fingerprints. This helper bridges the two at call time.
export function fingerprintFor(
  analysis: AnalysisResult,
  kind: MemoryTargetKind,
  id: string,
): { fingerprint: string; displayLabel: string } | null {
  if (kind === 'pageType') {
    const pt = analysis.pageTypes.find((p) => p.id === id)
    if (!pt) return null
    return { fingerprint: fingerprintPageType(pt), displayLabel: pt.name }
  }
  if (kind === 'attribute') {
    const a = analysis.attributes.find((x) => x.id === id)
    if (!a) return null
    return { fingerprint: fingerprintAttribute(a), displayLabel: a.name }
  }
  const e = analysis.events.find((x) => x.id === id)
  if (!e) return null
  const ptHintById = new Map(analysis.pageTypes.map((pt) => [pt.id, pt.isMatchHint]))
  const label = (e.interactionName ?? e.customName ?? 'event') +
    (e.pageTypeRefs[0] ? ' on ' + (analysis.pageTypes.find((p) => p.id === e.pageTypeRefs[0])?.name ?? '?') : '')
  return {
    fingerprint: fingerprintEvent(e, (id) => ptHintById.get(id)),
    displayLabel: label,
  }
}
