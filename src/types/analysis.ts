// Core state schema for the Sitemap Consultant Workbench.
// Drives Input → Loading → Workbench → Result stages.

export type Phase = 'input' | 'loading' | 'workbench' | 'result'

export type Confidence = 'high' | 'medium' | 'low'

export type PageTypeStatus = 'suggested' | 'confirmed' | 'edited'

// P4 trust calibration: every candidate result carries an origin layer so the
// consultant can distinguish what was observed on the site, what was inferred
// by the analyzer, and what was proposed only because the requirement asked
// for it. Origin is descriptive, not a quality score — a high-confidence
// `observed` item and a low-confidence `requirement-driven` item are both
// valid, they just sit in different columns of the review loop.
export type OriginType = 'observed' | 'inferred' | 'requirement-driven'

export interface Origin {
  type: OriginType
  reason: string
  evidenceRefs?: string[]
}

// Consultant review state. Applies uniformly to page types, events, and
// attribute candidates so the Design Summary and Pending queue can be
// derived from a single signal.
export type ReviewState = 'pending' | 'confirmed' | 'rejected'

export interface Review {
  state: ReviewState
  note?: string
  updatedAt?: number
}

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
  origin?: Origin
  review?: Review
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
  origin?: Origin
  review?: Review
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
  | 'LanguageSignal'
  | 'AttributeHint'

// A verifiable pointer back to a specific sampled page and the raw text
// snippet that produced a signal. Consultants click the url to open the page
// in a new tab and use the snippet as a Ctrl-F anchor to locate the signal
// on the live DOM.
export interface EvidenceLocation {
  url: string // site-relative path (e.g. "/products/baggies") or absolute
  snippet?: string // plain-text excerpt around the regex match
  patternName?: string // human-readable name of the probe that matched
  label?: string // optional per-location tag (typically the signal token)
}

export interface Evidence {
  id: string
  kind: EvidenceKind
  label: string
  detail: string
  pageTypeRef?: string
  source?: EvidenceSource
  matched?: string[]
  locations?: EvidenceLocation[]
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
  attributeRef?: string
}

export type AttributeCategory =
  | 'Locale'
  | 'Identity'
  | 'CustomerType'
  | 'Affinity'
  | 'Consent'
  | 'Other'

export type AttributeStatus = 'suggested' | 'needsConfirmation' | 'excluded'

export interface AttributeCandidate {
  id: string
  name: string // consultant-facing label, e.g. "language", "loginStatus"
  category: AttributeCategory
  proposedSource: string // e.g. 'html[lang]', 'url /jp/', 'account nav', 'requirement text'
  detectionHint: string // how the analyzer would read it
  confidence: Confidence
  confidenceReason: string
  sensitive: boolean // true → consultant should confirm or exclude
  status: AttributeStatus
  consultantAction: string
  fromRequirement: boolean // true when driven by a requirement clause rather than crawl
  evidenceRefs: string[]
  origin?: Origin
  review?: Review
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
  attributes: AttributeCandidate[]
  evidence: Evidence[]
  assumptions: string[]
  pendingConfirmations: PendingConfirmation[]
}
