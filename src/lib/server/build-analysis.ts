import type { AnalysisResult, Evidence, RequirementInput } from '@/types/analysis'
import { detectPlatform, fetchPage } from './fetch-site'
import { samplePages } from './sample-pages'
import { synthesize } from './synthesize'
import { parseRequirements } from './parse-requirements'

export async function buildAnalysis(
  siteUrl: string,
  requirement: RequirementInput,
): Promise<AnalysisResult> {
  const normalized = normalizeUrl(siteUrl)
  const root = await fetchPage(normalized)
  if (root.status >= 400) {
    throw new Error('Failed to fetch ' + normalized + ' (HTTP ' + root.status + ')')
  }
  const platform = detectPlatform(root.html)
  const samples = await samplePages(normalized)

  const { pageTypes, dataObjects, events, evidence } = synthesize(samples)
  const { mappings, pending } = parseRequirements(
    requirement.rawText,
    pageTypes,
    dataObjects,
    events,
  )

  // Attach requirement-match evidence to the page types it touches so the
  // Evidence pane can explain "why this candidate was recommended".
  for (const rm of mappings) {
    if (rm.status === 'unmapped') continue
    for (const t of rm.targets) {
      if (!t.pageTypeRef) continue
      const reqEv: Evidence = {
        id: 'ev_req_' + rm.id + '_' + t.pageTypeRef,
        kind: 'RequirementMatch',
        label: truncate(rm.text, 60),
        detail: 'Heuristic parser matched this requirement to the page type',
        pageTypeRef: t.pageTypeRef,
      }
      evidence.push(reqEv)
      const pt = pageTypes.find((p) => p.id === t.pageTypeRef)
      if (pt) pt.evidenceRefs = [...pt.evidenceRefs, reqEv.id]
    }
  }

  const assumptions: string[] = []
  if (samples.length < 3) {
    assumptions.push('Limited sample size — only ' + samples.length + ' page(s) fetched')
  }
  if (platform === 'Unknown') {
    assumptions.push('Platform could not be auto-detected; generated selectors are placeholders')
  }
  if (requirement.constraints) {
    assumptions.push('User constraint: ' + requirement.constraints)
  }
  if (pageTypes.every((pt) => pt.confidence !== 'high')) {
    assumptions.push('No high-confidence page type detected — expect manual refinement')
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

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}
