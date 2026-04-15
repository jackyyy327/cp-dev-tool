// Core state schema for the Sitemap Consultant Workbench.
// Drives Input → Loading → Workbench → Result stages.

export type Phase = 'input' | 'loading' | 'workbench' | 'result'

export type Confidence = 'high' | 'medium' | 'low'

export type PageTypeStatus = 'suggested' | 'confirmed' | 'edited'

// Salesforce Interactions namespace — item-level interactions on catalog objects.
// Mirrors SalesforceInteractions.CatalogObjectInteractionName / CartInteractionName / OrderInteractionName.
export type CatalogInteractionName =
  | 'ViewCatalogObject'
  | 'ViewCategory'
  | 'ViewSearch'
  | 'QuickViewCatalogObject'
  | 'StopQuickViewCatalogObject'

export type CartInteractionName =
  | 'AddToCart'
  | 'UpdateLineItem'
  | 'RemoveFromCart'
  | 'ViewCart'

export type OrderInteractionName = 'Purchase'

export type InteractionName =
  | CatalogInteractionName
  | CartInteractionName
  | OrderInteractionName

export type CatalogObjectType =
  | 'Product'
  | 'Category'
  | 'Search'
  | 'Cart'
  | 'Order'
  | 'Custom'

export type FieldSource = 'dataLayer' | 'dom' | 'url' | 'jsonLd' | 'manual'

export interface DataObjectField {
  name: string
  source: FieldSource
  selectorHint?: string
  required: boolean
}

export interface DataObjectDraft {
  id: string
  type: CatalogObjectType
  label: string
  fields: DataObjectField[]
}

export type EventKind = 'interaction' | 'customEvent'

export interface EventDraft {
  id: string
  kind: EventKind
  // For kind === 'interaction'
  interactionName?: InteractionName
  // For kind === 'customEvent'
  customName?: string
  pageTypeRefs: string[]
  objectRef?: string
  triggerHint: string
}

export interface PageTypeDraft {
  id: string
  name: string
  isMatchHint: string // human-readable match description; compiled to JS in code gen
  interactionName?: InteractionName
  objectRefs: string[]
  eventRefs: string[]
  sampleUrls: string[]
  confidence: Confidence
  status: PageTypeStatus
  evidenceRefs: string[]
}

export type EvidenceKind =
  | 'UrlPattern'
  | 'PageSignal'
  | 'RequirementMatch'
  | 'Confidence'
  | 'Risk'
  | 'Scoring'
  | 'Competing'

export type EvidenceSource =
  | 'UrlPattern'
  | 'DomSignal'
  | 'StructuredData'
  | 'Metadata'
  | 'RequirementText'
  | 'SampleCoverage'

export interface Evidence {
  id: string
  kind: EvidenceKind
  label: string
  detail: string
  pageTypeRef?: string
  source?: EvidenceSource
  matched?: string[]
  confidenceReason?: string
  competingInterpretation?: string
  consultantAction?: string
}

export type FailureKind =
  | 'UrlFetchFailure'
  | 'SamplingFailure'
  | 'RequirementParseFailure'
  | 'LowConfidenceAnalysis'
  | 'BlockedByAntiBot'
  | 'SpaLowVisibility'

export type MappingStatus = 'mapped' | 'unmapped' | 'needsConfirmation'

export interface RequirementMappingTarget {
  pageTypeRef?: string
  objectRef?: string
  eventRef?: string
}

export interface RequirementMapping {
  id: string
  text: string
  targets: RequirementMappingTarget[]
  status: MappingStatus
}

export interface PendingConfirmation {
  id: string
  question: string
  pageTypeRef?: string
  options?: string[]
}

export interface SampledPage {
  url: string
  title?: string
  signals: string[]
}

export interface SiteContext {
  url: string
  title?: string
  platform?: string
  sampledPages: SampledPage[]
}

export interface RequirementInput {
  rawText: string
  constraints?: string
}

export interface AnalysisResult {
  site: SiteContext
  requirement: RequirementInput
  requirementMappings: RequirementMapping[]
  pageTypes: PageTypeDraft[]
  dataObjects: DataObjectDraft[]
  events: EventDraft[]
  evidence: Evidence[]
  assumptions: string[]
  pendingConfirmations: PendingConfirmation[]
}
