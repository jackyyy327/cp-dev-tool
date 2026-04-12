import Anthropic from '@anthropic-ai/sdk'
import type { CrawlResult, FieldSource, GenerationResult, PageTypeAnalysis, SitemapSummary } from '@/types/sitemap'
import type { CustomPageTypeEntry } from '@/app/api/parse-requirements/route'
import type { GtmParseResult } from '@/lib/gtm-parser'

const client = new Anthropic()

export async function generateSitemapCode(
  crawlResult: CrawlResult,
  customNotes?: string,
  customPageTypes?: CustomPageTypeEntry[],
  gtmData?: GtmParseResult
): Promise<GenerationResult> {
  const prompt = buildPrompt(crawlResult, customNotes, customPageTypes, gtmData)

  const message = await client.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 8192,
    messages: [{ role: 'user', content: prompt }],
  })

  const content = message.content[0]
  if (content.type !== 'text') throw new Error('Unexpected response type')

  return parseGenerationResponse(content.text)
}

/**
 * Parse the LLM JSON response into a GenerationResult.
 * Handles markdown-wrapped JSON and provides fallback for malformed output.
 */
function parseGenerationResponse(raw: string): GenerationResult {
  // Try to extract JSON from markdown code fence first
  const jsonMatch = raw.match(/```(?:json)?\s*\n([\s\S]*?)```/)
  const jsonStr = jsonMatch ? jsonMatch[1].trim() : raw.trim()

  try {
    const parsed = JSON.parse(jsonStr)
    return validateAndNormalize(parsed)
  } catch {
    // Fallback: if the response is just JS code (backward compat or model error)
    const codeMatch = raw.match(/```(?:javascript|js)?\n([\s\S]*?)```/)
    if (codeMatch) {
      return buildFallbackResult(codeMatch[1].trim())
    }

    // Last resort: treat the entire response as code
    if (raw.includes('SalesforceInteractions')) {
      return buildFallbackResult(raw.trim())
    }

    throw new Error(
      'LLM応答のJSON解析に失敗しました。モデルが期待されたフォーマットで応答しませんでした。再度生成をお試しください。'
    )
  }
}

function buildFallbackResult(code: string): GenerationResult {
  return {
    code,
    summary: {
      overallAssessment: 'モデルが構造化JSONではなくコードのみを返しました。レビュー情報は利用できません。',
      globalRisks: ['構造化分析が取得できなかったため、手動レビューが必要です'],
      nextActions: ['生成されたコードを手動で検証してください', '再生成を試みてください'],
      heuristicLimitations: [
        '現在の識別は公開可抓取ページに基づいています',
        'SPA・ログイン必須・遅延読み込み・多言語ページは識別が不完全な場合があります',
        'イベントリスナーの提案は検証済みの埋め込みではなく、手動検証が必要です',
      ],
    },
    pageTypes: [],
  }
}

function validateAndNormalize(parsed: Record<string, unknown>): GenerationResult {
  const code = typeof parsed.code === 'string' ? parsed.code : ''
  if (!code) {
    throw new Error('LLM応答にcodeフィールドが含まれていません。')
  }

  const rawSummary = (parsed.summary || {}) as Record<string, unknown>
  const summary: SitemapSummary = {
    overallAssessment: typeof rawSummary.overallAssessment === 'string'
      ? rawSummary.overallAssessment : 'No assessment provided',
    globalRisks: normalizeStringArray(rawSummary.globalRisks),
    nextActions: normalizeStringArray(rawSummary.nextActions),
    heuristicLimitations: ensureHeuristicLimitations(normalizeStringArray(rawSummary.heuristicLimitations)),
  }

  const rawPageTypes = Array.isArray(parsed.pageTypes) ? parsed.pageTypes : []
  const pageTypes: PageTypeAnalysis[] = rawPageTypes.map((pt: Record<string, unknown>) => ({
    name: typeof pt.name === 'string' ? pt.name : 'unknown',
    recognitionStatus: validateEnum(pt.recognitionStatus, ['confirmed', 'likely', 'template'], 'template') as PageTypeAnalysis['recognitionStatus'],
    sampleUrls: normalizeStringArray(pt.sampleUrls),
    evidence: normalizeStringArray(pt.evidence),
    fieldSources: Array.isArray(pt.fieldSources)
      ? pt.fieldSources.map((fs: Record<string, unknown>) => ({
          field: typeof fs.field === 'string' ? fs.field : 'unknown',
          source: validateEnum(fs.source, ['json_ld', 'data_layer', 'selector', 'inferred', 'missing'], 'missing') as FieldSource['source'],
          detail: typeof fs.detail === 'string' ? fs.detail : undefined,
        }))
      : [],
    eventStatus: validateEnum(pt.eventStatus, ['detected', 'suggested', 'not_configured'], 'not_configured') as PageTypeAnalysis['eventStatus'],
    eventDetails: typeof pt.eventDetails === 'string' ? pt.eventDetails : undefined,
    risks: normalizeStringArray(pt.risks),
    recommendedFixes: normalizeStringArray(pt.recommendedFixes),
  }))

  return { code, summary, pageTypes }
}

function normalizeStringArray(val: unknown): string[] {
  if (!Array.isArray(val)) return []
  return val.filter((v): v is string => typeof v === 'string')
}

function validateEnum(val: unknown, allowed: string[], fallback: string): string {
  return typeof val === 'string' && allowed.includes(val) ? val : fallback
}

function ensureHeuristicLimitations(limitations: string[]): string[] {
  const defaults = [
    '現在の識別は公開可抓取ページに基づいています',
    'SPA・ログイン必須・遅延読み込み・多言語・多地域ページは識別が不完全な場合があります',
    'イベントリスナーの提案は検証済みの埋め込みではなく、手動検証が必要です',
  ]
  if (limitations.length === 0) return defaults
  return limitations
}

function buildPrompt(result: CrawlResult, customNotes?: string, customPageTypes?: CustomPageTypeEntry[], gtmData?: GtmParseResult): string {
  const { url, platform, siteType, isSPA, detectedPageTypes, jsonLd, dataLayer } = result

  const pageTypeSummary = detectedPageTypes
    .map(pt => `- ${pt.name} (confidence: ${pt.confidence}%, sample URLs: ${pt.urls.slice(0, 2).join(', ')})`)
    .join('\n')

  const jsonLdSample = jsonLd.slice(0, 3).map(j => JSON.stringify(j, null, 2)).join('\n---\n')

  const dataLayerInfo = dataLayer
    ? `DataLayer detected:\n${JSON.stringify(dataLayer, null, 2)}`
    : 'No dataLayer detected'

  return `You are an expert Salesforce Marketing Cloud Personalization (MCP) developer.

Generate a complete, production-ready MCP Sitemap JavaScript configuration for the following website.
You MUST also provide a structured analysis of your output.

## Website Info
- URL: ${url}
- Platform: ${platform}
- Site Type: ${siteType}
- Is SPA: ${isSPA}

## Detected Page Types
${pageTypeSummary}

## JSON-LD Schema Data Found on Site
${jsonLdSample || 'None detected'}

## DataLayer Info
${dataLayerInfo}

${customPageTypes && customPageTypes.length > 0 ? `## Custom Page Types (PROJECT-SPECIFIC — REQUIRED)
These page types MUST be included with the EXACT name and action values specified below.
Generate an accurate isMatch function for each one based on the matching rule and sample URLs.
These must appear FIRST in the pageTypes array (before generic ones), as they are more specific.

${customPageTypes.map((pt, i) => `### Custom Page Type ${i + 1}
- name: "${pt.name}"
- action: "${pt.action || pt.name + '_View'}"
- Matching Rule: ${pt.rule}${pt.sampleUrls ? `\n- Sample URLs: ${pt.sampleUrls}` : ''}`).join('\n\n')}` : ''}

${gtmData && gtmData.variables.length > 0 ? `## GTM Container Data
Container: ${gtmData.containerName}
DataLayer Variables detected in GTM:
${gtmData.variables.map(v => `- window.dataLayer key: "${v.dlvKey}"  (GTM variable: "${v.gtmName}")`).join('\n')}
${gtmData.customEvents.length > 0 ? `\nCustom Events tracked in GTM:\n${gtmData.customEvents.map(e => `- "${e}"`).join('\n')}` : ''}

Use these dataLayer variable names when accessing dataLayer values in the sitemap (e.g. window.dataLayer to find the latest push containing these keys).` : ''}

${customNotes ? `## Additional Notes from Developer\n${customNotes}` : ''}

## Requirements
1. Use the \`SalesforceInteractions\` namespace (not the legacy \`Evergage\` namespace)
2. Call \`SalesforceInteractions.initSitemap(sitemapConfig)\` at the end
3. Each pageType MUST have \`name\` and \`isMatch\` (function returning boolean)
4. Use built-in resolvers where possible: \`SalesforceInteractions.resolvers.selectText()\`, \`getJsonLdData()\`, \`getCanonicalUrl()\`, \`getMetaTag()\`, \`getAttribute()\`
5. If JSON-LD Product schema is available, prefer \`getJsonLdData()\` for catalog extraction
6. Include appropriate Content Zones for each page type
7. Add \`SalesforceInteractions.reinitialize()\` pattern if site is SPA
8. Include listeners for key ecommerce events (AddToCart, Purchase) where applicable
9. Add helpful comments explaining each section
10. Use \`pageTypeDefault\` as a catch-all

## Output Format — STRICT JSON

You MUST respond with a single JSON object (no markdown wrapping, no extra text). The JSON must follow this exact structure:

{
  "code": "<the complete sitemap JavaScript code as a single string>",
  "summary": {
    "overallAssessment": "<1-3 sentence overall assessment of the generated sitemap>",
    "globalRisks": ["<risk 1>", "<risk 2>", ...],
    "nextActions": ["<action 1>", "<action 2>", ...],
    "heuristicLimitations": ["<limitation 1>", "<limitation 2>", ...]
  },
  "pageTypes": [
    {
      "name": "<page type name>",
      "recognitionStatus": "confirmed | likely | template",
      "sampleUrls": ["<url1>", "<url2>"],
      "evidence": ["<evidence for recognition, e.g. 'URL pattern /products/ matched 12 crawled URLs'>"],
      "fieldSources": [
        {"field": "<field name>", "source": "json_ld | data_layer | selector | inferred | missing", "detail": "<optional detail>"}
      ],
      "eventStatus": "detected | suggested | not_configured",
      "eventDetails": "<optional: what events are configured and how>",
      "risks": ["<risk specific to this page type>"],
      "recommendedFixes": ["<fix suggestion>"]
    }
  ]
}

### recognitionStatus rules:
- "confirmed": page type has strong evidence from multiple crawled URLs with matching URL patterns AND structured data (JSON-LD, dataLayer, or clear DOM selectors)
- "likely": page type matches URL patterns but lacks structural evidence, OR only a few sample URLs were found
- "template": page type was added based on common patterns for this platform/site type but has NO direct evidence from crawled pages. Any page type without real crawled evidence MUST be "template".

### eventStatus rules:
- "detected": event listeners are based on confirmed DOM elements or dataLayer events found during crawl
- "suggested": event listeners are added based on platform conventions but not directly verified from crawl data
- "not_configured": no event listeners configured for this page type

### fieldSources.source rules:
- "json_ld": field extracted from JSON-LD schema detected on site
- "data_layer": field extracted from dataLayer/GTM variables
- "selector": field extracted via CSS selector from DOM
- "inferred": field source guessed based on platform conventions, not directly verified
- "missing": field is expected but no source was identified

### heuristicLimitations MUST include at minimum:
- Recognition is based on publicly crawlable pages only
- SPA, login-gated, lazy-loaded, multi-language, and multi-region pages may be incompletely identified
- Event listener suggestions are not verified instrumentation and require manual validation

Respond with ONLY the JSON object. No markdown code fences, no explanation outside the JSON.`
}
