export type Platform =
  | 'shopify'
  | 'magento'
  | 'sfcc'
  | 'hybris'
  | 'bigcommerce'
  | 'wordpress'
  | 'woocommerce'
  | 'custom'
  | 'unknown'

export type SiteType = 'ecommerce' | 'b2b' | 'media' | 'general'

export type Industry =
  | 'retail'
  | 'fashion'
  | 'electronics'
  | 'food'
  | 'travel'
  | 'finance'
  | 'healthcare'
  | 'technology'
  | 'other'

export interface PageTypeDetected {
  name: string
  urls: string[]
  confidence: number // 0-100
  isMatch: string   // generated JS code string
  catalog?: string
  contentZones?: ContentZone[]
  listeners?: string
}

export interface ContentZone {
  name: string
  selector?: string
}

export interface CrawlResult {
  url: string
  platform: Platform
  siteType: SiteType
  isSPA: boolean
  detectedPageTypes: PageTypeDetected[]
  jsonLd: Record<string, unknown>[]
  dataLayer: Record<string, unknown> | null
  sitemapXmlUrls: string[]
}

export interface SitemapConfig {
  global: {
    contentZones: ContentZone[]
    listeners: string
  }
  pageTypes: PageTypeDetected[]
  pageTypeDefault: {
    contentZones: ContentZone[]
  }
}

// Knowledge base entry
export interface SitemapEntry {
  id: string
  name: string           // project/client name
  url: string            // client website URL
  platform: Platform
  siteType: SiteType
  industry: Industry
  code: string           // generated sitemap JS code
  notes?: string
  tags: string[]
  createdAt: string
  updatedAt: string
  createdBy?: string
  crawlResult?: CrawlResult  // stored for template re-use
}
