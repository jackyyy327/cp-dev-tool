// Structured JSON representation of the sitemap configuration derived from
// the AnalysisResult. Useful for version control, diffing between runs, and
// importing into external tools. Excludes rejected items.

import type { AnalysisResult } from '@/types/analysis'

export interface SitemapJSON {
  $schema: string
  version: string
  generatedAt: string
  site: {
    url: string
    cookieDomain: string
    platform?: string
  }
  pageTypes: SitemapPageType[]
  userAttributes: SitemapAttribute[]
  assumptions: string[]
}

interface SitemapPageType {
  name: string
  isMatch: string
  confidence: string
  interaction?: {
    name: string
    catalogObject?: {
      type: string
      fields: Record<string, { source: string; selector?: string; required: boolean }>
    }
  }
  listeners?: SitemapListener[]
  sampleUrls: string[]
}

interface SitemapListener {
  type: 'interaction' | 'customEvent'
  name: string
  trigger: string
  catalogObjectType?: string
}

interface SitemapAttribute {
  name: string
  category: string
  source: string
  confidence: string
  sensitive: boolean
}

export function sitemapJSONFromAnalysis(analysis: AnalysisResult): SitemapJSON {
  const activePts = analysis.pageTypes.filter((pt) => pt.review?.state !== 'rejected')
  const activeAttrs = analysis.attributes.filter(
    (a) => a.review?.state !== 'rejected' && a.status !== 'excluded',
  )

  return {
    $schema: 'https://sfmc-personalization.schema.json',
    version: '1.0',
    generatedAt: new Date().toISOString(),
    site: {
      url: analysis.site.url,
      cookieDomain: safeDomain(analysis.site.url),
      platform: analysis.site.platform ?? undefined,
    },
    pageTypes: activePts.map((pt) => {
      const object = pt.objectRefs[0]
        ? analysis.dataObjects.find((d) => d.id === pt.objectRefs[0])
        : undefined
      const events = analysis.events.filter(
        (e) => pt.eventRefs.includes(e.id) && e.review?.state !== 'rejected',
      )

      const entry: SitemapPageType = {
        name: pt.name,
        isMatch: pt.isMatchHint,
        confidence: pt.confidence,
        sampleUrls: pt.sampleUrls,
      }

      if (pt.interactionName) {
        entry.interaction = { name: pt.interactionName }
        if (object) {
          entry.interaction.catalogObject = {
            type: object.type,
            fields: Object.fromEntries(
              object.fields.map((f) => [
                f.name,
                {
                  source: f.source,
                  selector: f.selectorHint,
                  required: f.required,
                },
              ]),
            ),
          }
        }
      }

      if (events.length > 0) {
        entry.listeners = events.map((e) => {
          const listener: SitemapListener = {
            type: e.kind,
            name:
              e.kind === 'interaction'
                ? e.interactionName ?? 'unknown'
                : e.customName ?? 'unknown',
            trigger: e.triggerHint,
          }
          if (e.objectRef) {
            const obj = analysis.dataObjects.find((d) => d.id === e.objectRef)
            if (obj) listener.catalogObjectType = obj.type
          }
          return listener
        })
      }

      return entry
    }),
    userAttributes: activeAttrs.map((a) => ({
      name: a.name,
      category: a.category,
      source: a.proposedSource,
      confidence: a.confidence,
      sensitive: a.sensitive,
    })),
    assumptions: analysis.assumptions,
  }
}

function safeDomain(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return ''
  }
}
