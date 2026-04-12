export interface GtmVariable {
  gtmName: string   // display name in GTM (e.g. "dlv - page_type")
  dlvKey: string    // actual dataLayer key (e.g. "page_type")
}

export interface GtmParseResult {
  variables: GtmVariable[]
  customEvents: string[]
  containerName: string
  tagCount: number
}

// Parse a GTM container export JSON (exportFormatVersion 2)
export function parseGtmContainer(json: unknown): GtmParseResult {
  if (typeof json !== 'object' || json === null) {
    throw new Error('Invalid GTM container JSON')
  }

  const root = json as Record<string, unknown>
  const cv = (root.containerVersion ?? root) as Record<string, unknown>

  const containerName =
    (cv.container as Record<string, unknown> | undefined)?.name as string ?? 'Unknown'

  // Parse Data Layer Variables (type "v")
  const variables: GtmVariable[] = []
  const rawVars = cv.variable as Array<Record<string, unknown>> | undefined
  if (Array.isArray(rawVars)) {
    for (const v of rawVars) {
      if (v.type !== 'v') continue
      const params = v.parameter as Array<Record<string, unknown>> | undefined
      if (!Array.isArray(params)) continue
      const nameParam = params.find(p => p.key === 'name')
      if (!nameParam?.value) continue
      variables.push({
        gtmName: String(v.name ?? ''),
        dlvKey: String(nameParam.value),
      })
    }
  }

  // Parse custom event triggers
  const customEvents: string[] = []
  const rawTriggers = cv.trigger as Array<Record<string, unknown>> | undefined
  if (Array.isArray(rawTriggers)) {
    for (const t of rawTriggers) {
      if (t.type !== 'CUSTOM_EVENT') continue
      const params = t.parameter as Array<Record<string, unknown>> | undefined
      if (!Array.isArray(params)) continue
      // Event name can be in a "filter" param or a direct "eventName" param
      const eventParam = params.find(p => p.key === 'eventName' || p.key === 'customEventFilter')
      if (eventParam?.value) {
        const val = eventParam.value
        // Can be a list or a single string
        if (Array.isArray(val)) {
          for (const item of val as Array<Record<string, unknown>>) {
            if (item.value) customEvents.push(String(item.value))
          }
        } else {
          customEvents.push(String(val))
        }
      }
    }
  }

  const tagCount = Array.isArray(cv.tag) ? (cv.tag as unknown[]).length : 0

  return { variables, customEvents, containerName, tagCount }
}
