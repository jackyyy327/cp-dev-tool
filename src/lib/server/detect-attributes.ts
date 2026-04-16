import type { AttributeCandidate, Evidence, EvidenceLocation } from '@/types/analysis'
import { extractSnippet, type RawSample } from './sample-pages'

export interface AttributeContext {
  samples: RawSample[]
  siteUrl: string
  requirementText: string
}

export interface DetectedAttributes {
  attributes: AttributeCandidate[]
  evidence: Evidence[]
}

// Sensitive topics the analyzer must never auto-propose. If a consultant asks
// for them, they are returned as "excluded" candidates with a hard warning.
const SENSITIVE_TOPICS = [
  'race',
  'ethnicity',
  'religion',
  'political',
  'health',
  'medical',
  'sexual',
  'orientation',
  'disability',
  'genetic',
  'biometric',
  'citizenship',
  'immigration',
]

export function detectAttributes(ctx: AttributeContext): DetectedAttributes {
  const attributes: AttributeCandidate[] = []
  const evidence: Evidence[] = []
  const allSignals = new Set<string>()
  ctx.samples.forEach((s) => s.signals.forEach((sig) => allSignals.add(sig)))

  const push = (a: AttributeCandidate, ev?: Partial<Evidence>) => {
    // Apply a default origin + review to every attribute candidate so downstream
    // UI and summaries always have something to display. Callers can override
    // before pushing if they have a better story.
    if (!a.origin) {
      a.origin = a.fromRequirement
        ? {
            type: 'requirement-driven',
            reason: 'Requested by the requirement text; no crawl-time DOM signal corroborated it',
          }
        : a.sensitive
        ? {
            type: 'requirement-driven',
            reason: 'Flagged by sensitive-topic policy — not auto-tracked regardless of signals',
          }
        : a.confidence === 'high'
        ? {
            type: 'observed',
            reason: a.confidenceReason,
          }
        : {
            type: 'inferred',
            reason: a.confidenceReason,
          }
    }
    if (!a.review) {
      a.review = { state: a.status === 'excluded' ? 'rejected' : 'pending' }
    }
    attributes.push(a)
    if (ev) {
      const e: Evidence = {
        id: 'ev_attr_' + a.id,
        kind: 'PageSignal',
        source: 'AttributeHint',
        label: a.name + ' (' + a.category + ')',
        detail: a.proposedSource,
        confidenceReason: a.confidenceReason,
        consultantAction: a.consultantAction,
        matched: ev.matched,
        locations: ev.locations,
        ...ev,
      }
      evidence.push(e)
      a.evidenceRefs.push(e.id)
    }
  }

  // ——— Locale / Language ———
  const htmlLangSignal = [...allSignals].find((s) => s.startsWith('html:lang='))
  const hreflangCount = [...allSignals].find((s) => s.startsWith('hreflang:'))
  const pathLocale = detectPathLocale(ctx)
  const hasMultipleLangSignals = (htmlLangSignal ? 1 : 0) + (hreflangCount ? 1 : 0) + (pathLocale ? 1 : 0) >= 2

  if (htmlLangSignal || pathLocale || hreflangCount) {
    const matched: string[] = []
    if (htmlLangSignal) matched.push(htmlLangSignal)
    if (hreflangCount) matched.push(hreflangCount)
    if (pathLocale) matched.push('path locale "' + pathLocale + '"')
    const confidence = hasMultipleLangSignals ? 'high' : 'medium'
    const langLocations: EvidenceLocation[] = []
    if (htmlLangSignal) {
      const loc = locateRegex(
        ctx.samples,
        /<html[^>]*\blang=["']([^"']+)["']/i,
        'html[lang] attribute',
        htmlLangSignal,
      )
      if (loc) langLocations.push(loc)
    }
    if (hreflangCount) {
      const loc = locateRegex(
        ctx.samples,
        /<link[^>]+rel=["']alternate["'][^>]+hreflang=["']([^"']+)["']/i,
        'hreflang alternate link',
        hreflangCount,
      )
      if (loc) langLocations.push(loc)
    }
    if (pathLocale) {
      const pathLoc = locatePathSegment(ctx.samples, pathLocale)
      if (pathLoc) langLocations.push(pathLoc)
    }
    push(
      {
        id: 'attr_language',
        name: 'language',
        category: 'Locale',
        proposedSource:
          (htmlLangSignal ? 'html[lang]' : pathLocale ? 'URL locale segment' : 'hreflang links') +
          (matched.length > 1 ? ' (+other signals)' : ''),
        detectionHint: 'document.documentElement.lang',
        confidence,
        confidenceReason:
          confidence === 'high'
            ? 'Multiple independent language signals agree (' + matched.join(', ') + ')'
            : 'Single language signal detected — confirm before locking',
        sensitive: false,
        status: 'suggested',
        consultantAction:
          'Confirm the language reflects the visitor\'s UI language, not just site default',
        fromRequirement: false,
        evidenceRefs: [],
      },
      { matched, locations: langLocations.length > 0 ? langLocations : undefined },
    )
    if (pathLocale || (hreflangCount && htmlLangSignal)) {
      const marketLocations: EvidenceLocation[] = []
      if (pathLocale) {
        const loc = locatePathSegment(ctx.samples, pathLocale)
        if (loc) marketLocations.push(loc)
      } else if (hreflangCount) {
        const loc = locateRegex(
          ctx.samples,
          /<link[^>]+rel=["']alternate["'][^>]+hreflang=["']([^"']+)["']/i,
          'hreflang alternate link',
          hreflangCount,
        )
        if (loc) marketLocations.push(loc)
      }
      push(
        {
          id: 'attr_market',
          name: 'market',
          category: 'Locale',
          proposedSource: pathLocale ? 'URL locale segment "' + pathLocale + '"' : 'hreflang link graph',
          detectionHint: 'parseUrl().path.split("/")[1]',
          confidence: pathLocale ? 'high' : 'medium',
          confidenceReason: pathLocale
            ? 'URL path carries a locale/market segment'
            : 'Multiple hreflang links suggest market-specific variants',
          sensitive: false,
          status: 'suggested',
          consultantAction: 'Verify the market segment maps to catalog region, not just language',
          fromRequirement: false,
          evidenceRefs: [],
        },
        {
          matched: pathLocale ? ['path:' + pathLocale] : [hreflangCount!],
          locations: marketLocations.length > 0 ? marketLocations : undefined,
        },
      )
    }
  }

  // ——— Identity State ———
  if (allSignals.has('account/identity hint') || allSignals.has('account/identity hint (JA)')) {
    const token = allSignals.has('account/identity hint (JA)')
      ? 'account/identity hint (JA)'
      : 'account/identity hint'
    const loc = locateSignal(ctx.samples, token)
    push(
      {
        id: 'attr_login_status',
        name: 'loginStatus',
        category: 'Identity',
        proposedSource: 'account nav / login affordance',
        detectionHint: 'presence of account/logout link vs login/signup CTA',
        confidence: 'medium',
        confidenceReason:
          'Account/login affordance detected in navigation — true login state needs a runtime DOM check',
        sensitive: false,
        status: 'needsConfirmation',
        consultantAction:
          'Confirm how known vs anonymous state is distinguished (cookie, account nav class, data attribute)',
        fromRequirement: false,
        evidenceRefs: [],
      },
      { matched: [token], locations: loc ? [loc] : undefined },
    )
  }

  // ——— Consent ———
  if (allSignals.has('consent banner') || allSignals.has('consent banner (JA)')) {
    const token = allSignals.has('consent banner (JA)') ? 'consent banner (JA)' : 'consent banner'
    const loc = locateSignal(ctx.samples, token)
    push(
      {
        id: 'attr_consent_status',
        name: 'consentStatus',
        category: 'Consent',
        proposedSource: 'cookie/consent banner detected',
        detectionHint: 'read from consent manager SDK after init',
        confidence: 'medium',
        confidenceReason:
          'A consent/privacy banner was detected — respecting it is mandatory before any tracking fires',
        sensitive: false,
        status: 'needsConfirmation',
        consultantAction:
          'Confirm which consent manager is in use and gate Salesforce Interactions init on its signal',
        fromRequirement: false,
        evidenceRefs: [],
      },
      { matched: [token], locations: loc ? [loc] : undefined },
    )
  }

  // ——— Requirement-driven candidates ———
  // We lightly scan the requirement text for attribute-style phrases and emit
  // candidates even if no DOM signal corroborates them — they just get lower
  // confidence and a "from requirement" flag.
  const req = ctx.requirementText.toLowerCase()
  const reqDrivenAttrs: Array<{
    id: string
    name: string
    category: AttributeCandidate['category']
    trigger: RegExp
    sensitive?: boolean
    action?: string
  }> = [
    {
      id: 'attr_locale_req',
      name: 'locale',
      category: 'Locale',
      trigger: /\b(locale|market|region|country|language)\b/,
    },
    {
      id: 'attr_login_status_req',
      name: 'loginStatus',
      category: 'Identity',
      trigger: /\b(login\s*status|authenticated|known\s*vs\s*anonymous|logged[\s-]?in)\b/,
    },
    {
      id: 'attr_customer_type_req',
      name: 'customerType',
      category: 'CustomerType',
      trigger: /\b(member|subscriber|loyalty|tier|b2[bc]|vip)\b/,
      action: 'Confirm how the customer tier is exposed (cookie, data attribute, dataLayer)',
    },
    {
      id: 'attr_product_affinity_req',
      name: 'productAffinity',
      category: 'Affinity',
      trigger: /\b(affinity|preference|interest|category\s*affinity|brand\s*affinity)\b/,
      action:
        'This is an enrichment attribute — usually derived downstream by the personalization platform, not tracked in the sitemap',
    },
  ]
  for (const def of reqDrivenAttrs) {
    if (!def.trigger.test(req)) continue
    if (attributes.find((a) => a.name === def.name)) continue
    push(
      {
        id: def.id,
        name: def.name,
        category: def.category,
        proposedSource: 'requirement text',
        detectionHint: 'derive from ' + def.category.toLowerCase() + ' signal at runtime',
        confidence: 'low',
        confidenceReason:
          'Requested by requirement text but no corroborating DOM signal was found during crawl',
        sensitive: false,
        status: 'needsConfirmation',
        consultantAction:
          def.action ?? 'Confirm the runtime source for this attribute before implementation',
        fromRequirement: true,
        evidenceRefs: [],
      },
      { source: 'RequirementText', matched: [def.trigger.source] },
    )
  }

  // Sensitive topics — emit excluded candidates so the consultant sees they
  // were considered and rejected, rather than silently dropped.
  for (const topic of SENSITIVE_TOPICS) {
    if (!new RegExp('\\b' + topic + '\\b', 'i').test(req)) continue
    if (attributes.find((a) => a.name === 'sensitive:' + topic)) continue
    push(
      {
        id: 'attr_excluded_' + topic,
        name: 'sensitive:' + topic,
        category: 'Other',
        proposedSource: 'requirement text',
        detectionHint: '(excluded by policy)',
        confidence: 'high',
        confidenceReason:
          'Topic matches the sensitive-attribute exclusion list — cannot be auto-tracked',
        sensitive: true,
        status: 'excluded',
        consultantAction:
          'Do not implement. If the business truly needs this, route through legal/privacy review first.',
        fromRequirement: true,
        evidenceRefs: [],
      },
      { source: 'RequirementText', matched: [topic] },
    )
  }

  return { attributes, evidence }
}

// Find the first sample whose PROBES registry already captured this token,
// and borrow its snippet + pattern name. Falls back to null if no sample
// carries the token (caller then skips locations for this attribute).
function locateSignal(samples: RawSample[], token: string): EvidenceLocation | null {
  for (const s of samples) {
    const hit = s.signalHits.find((h) => h.token === token)
    if (hit) {
      return {
        url: s.url,
        snippet: hit.snippet,
        patternName: hit.patternName,
        label: token,
      }
    }
  }
  return null
}

// Run an ad-hoc regex against each sample's html and return a location for
// the first match. Used for attribute-specific patterns that aren't in the
// PROBES registry (e.g. html[lang] capture, hreflang links).
function locateRegex(
  samples: RawSample[],
  regex: RegExp,
  patternName: string,
  label: string,
): EvidenceLocation | null {
  for (const s of samples) {
    const m = regex.exec(s.html)
    if (m) {
      return {
        url: s.url,
        snippet: extractSnippet(s.html, m.index, m[0].length),
        patternName,
        label,
      }
    }
  }
  return null
}

// For URL-encoded attributes (e.g. path locale /jp/), point at the first
// sample whose path starts with that segment. No snippet — the URL itself
// is the evidence.
function locatePathSegment(samples: RawSample[], segment: string): EvidenceLocation | null {
  const seg = segment.toLowerCase()
  for (const s of samples) {
    const first = s.url.split('/').filter(Boolean)[0]?.split('?')[0]?.toLowerCase() ?? ''
    if (first === seg) {
      return {
        url: s.url,
        patternName: 'URL path segment /' + seg + '/',
        label: 'path:' + seg,
      }
    }
  }
  return null
}

function detectPathLocale(ctx: AttributeContext): string | null {
  // Inspect the entry URL path and sampled page paths for a ll or ll-CC segment
  const candidates = new Set<string>()
  try {
    const entry = new URL(ctx.siteUrl)
    const firstSeg = entry.pathname.split('/').filter(Boolean)[0]
    if (firstSeg && /^[a-z]{2}([-_][a-z]{2})?$/i.test(firstSeg)) candidates.add(firstSeg.toLowerCase())
  } catch {
    // ignore
  }
  for (const s of ctx.samples) {
    const first = s.url.split('/').filter(Boolean)[0]?.split('?')[0] ?? ''
    if (first && /^[a-z]{2}([-_][a-z]{2})?$/i.test(first)) candidates.add(first.toLowerCase())
  }
  if (candidates.size === 1) return [...candidates][0]
  return null
}
