import type { AnalysisResult, Evidence, RequirementInput } from '@/types/analysis'
import { detectPlatform, FetchError } from './fetch-site'
import { samplePages } from './sample-pages'
import { synthesize } from './synthesize'
import { parseRequirements } from './parse-requirements'
import { detectAttributes } from './detect-attributes'

export async function buildAnalysis(
  siteUrl: string,
  requirement: RequirementInput,
): Promise<AnalysisResult> {
  const normalized = normalizeUrl(siteUrl)

  let samples
  try {
    samples = await samplePages(normalized)
  } catch (err) {
    if (err instanceof FetchError) throw err
    const e = err as Error
    throw new FetchError('SamplingFailure', 'Failed to sample pages: ' + e.message)
  }
  if (samples.length === 0) {
    throw new FetchError('SamplingFailure', 'No pages could be fetched from ' + normalized)
  }

  const platform = detectPlatform(samples[0].html)

  const { pageTypes, dataObjects, events, evidence } = synthesize(samples)
  const { attributes, evidence: attrEvidence } = detectAttributes({
    samples,
    siteUrl: normalized,
    requirementText: requirement.rawText,
  })
  for (const ae of attrEvidence) evidence.push(ae)
  const {
    mappings,
    pending,
    evidence: reqEvidence,
  } = parseRequirements(requirement.rawText, pageTypes, dataObjects, events, attributes)

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
  if (attributes.length === 0) {
    assumptions.push('No user attributes were detected — personalization targeting will rely on page type only until attributes are added manually.')
  } else if (attributes.every((a) => a.confidence === 'low')) {
    assumptions.push('All detected attributes are low-confidence — confirm their runtime sources before locking the sitemap.')
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
      title: samples[0].title,
      platform,
      sampledPages: samples.map(({ url, title, signals }) => ({ url, title, signals })),
    },
    requirement,
    requirementMappings: mappings,
    pageTypes,
    dataObjects,
    events,
    attributes,
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
