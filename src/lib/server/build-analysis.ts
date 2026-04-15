import type { AnalysisResult, Evidence, RequirementInput } from '@/types/analysis'
import { detectPlatform, fetchPage, FetchError } from './fetch-site'
import { samplePages } from './sample-pages'
import { synthesize } from './synthesize'
import { parseRequirements } from './parse-requirements'

export async function buildAnalysis(
  siteUrl: string,
  requirement: RequirementInput,
): Promise<AnalysisResult> {
  const normalized = normalizeUrl(siteUrl)
  const root = await fetchPage(normalized) // throws typed FetchError
  const platform = detectPlatform(root.html)

  let samples
  try {
    samples = await samplePages(normalized)
  } catch (err) {
    const e = err as Error
    throw new FetchError('SamplingFailure', 'Failed to sample pages: ' + e.message)
  }

  const { pageTypes, dataObjects, events, evidence } = synthesize(samples)
  const {
    mappings,
    pending,
    evidence: reqEvidence,
  } = parseRequirements(requirement.rawText, pageTypes, dataObjects, events)

  // Attach requirement evidence to the page types it touches
  for (const rm of mappings) {
    if (rm.status === 'unmapped') continue
    for (const t of rm.targets) {
      if (!t.pageTypeRef) continue
      const linkedEv = reqEvidence.find((ev) => ev.id === 'ev_req_' + rm.id)
      if (!linkedEv) continue
      const attachedId = linkedEv.id + '_pt_' + t.pageTypeRef
      if (!evidence.find((e) => e.id === attachedId)) {
        const attached: Evidence = { ...linkedEv, id: attachedId, pageTypeRef: t.pageTypeRef }
        evidence.push(attached)
        const pt = pageTypes.find((p) => p.id === t.pageTypeRef)
        if (pt) pt.evidenceRefs = [...pt.evidenceRefs, attached.id]
      }
    }
  }
  for (const rev of reqEvidence) evidence.push(rev)

  // Conservative assumptions + coverage warnings
  const assumptions: string[] = []
  if (samples.length < 3) {
    assumptions.push(
      'Limited sample coverage — only ' +
        samples.length +
        ' page(s) fetched. Recommend re-running after widening the entry point.',
    )
  }
  if (samples.every((s) => s.spaShell)) {
    assumptions.push(
      'Every sampled page looked like a client-rendered SPA shell. DOM-based signals are unreliable; treat all results as low-visibility.',
    )
  } else if (samples.some((s) => s.spaShell)) {
    assumptions.push('Some sampled pages appear client-rendered — those clusters are flagged as low-visibility risks.')
  }
  if (platform === 'Unknown') {
    assumptions.push('Platform could not be auto-detected — selectors are generic placeholders that must be confirmed.')
  }
  if (requirement.constraints) {
    assumptions.push('User constraint applied: ' + requirement.constraints)
  }
  if (pageTypes.every((pt) => pt.confidence !== 'high')) {
    assumptions.push('No high-confidence page type was detected — expect meaningful manual refinement.')
  }
  const hasCommerce = pageTypes.some((pt) =>
    ['product', 'cart', 'checkout'].some((c) => pt.name.toLowerCase().includes(c)),
  )
  const hasContent = pageTypes.some((pt) => /article|story|content/i.test(pt.name))
  if (hasContent && !hasCommerce) {
    assumptions.push('Only content/article page types detected — no commerce objects or events were inferred.')
  }

  return {
    site: {
      url: normalized,
      title: root.title,
      platform,
      sampledPages: samples.map(({ url, title, signals }) => ({ url, title, signals })),
    },
    requirement,
    requirementMappings: mappings,
    pageTypes,
    dataObjects,
    events,
    evidence,
    assumptions,
    pendingConfirmations: pending,
  }
}

function normalizeUrl(input: string): string {
  const trimmed = input.trim()
  try {
    const u = new URL(trimmed)
    return u.origin + (u.pathname === '/' ? '/' : u.pathname.replace(/\/+$/, ''))
  } catch {
    return 'https://' + trimmed.replace(/^\/+/, '')
  }
}
