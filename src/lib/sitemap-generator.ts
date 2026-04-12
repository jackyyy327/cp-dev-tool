import Anthropic from '@anthropic-ai/sdk'
import type { CrawlResult } from '@/types/sitemap'
import type { CustomPageTypeEntry } from '@/app/api/parse-requirements/route'
import type { GtmParseResult } from '@/lib/gtm-parser'

const client = new Anthropic()

export async function generateSitemapCode(
  crawlResult: CrawlResult,
  customNotes?: string,
  customPageTypes?: CustomPageTypeEntry[],
  gtmData?: GtmParseResult
): Promise<string> {
  const prompt = buildPrompt(crawlResult, customNotes, customPageTypes, gtmData)

  const message = await client.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  })

  const content = message.content[0]
  if (content.type !== 'text') throw new Error('Unexpected response type')

  // Extract code block if wrapped in markdown
  const codeMatch = content.text.match(/```(?:javascript|js)?\n([\s\S]*?)```/)
  return codeMatch ? codeMatch[1].trim() : content.text.trim()
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

Generate ONLY the JavaScript code, no explanation needed outside of code comments.`
}
