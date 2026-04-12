import type { Platform, SiteType } from '@/types/sitemap'

interface DetectionResult {
  platform: Platform
  siteType: SiteType
  isSPA: boolean
}

export function detectPlatform(html: string, headers: Record<string, string>, url: string): DetectionResult {
  const lowerHtml = html.toLowerCase()
  const lowerUrl = url.toLowerCase()

  let platform: Platform = 'unknown'
  let siteType: SiteType = 'general'
  let isSPA = false

  // Platform detection
  if (
    lowerHtml.includes('shopify') ||
    lowerHtml.includes('cdn.shopify.com') ||
    headers['x-shopid'] ||
    headers['x-shopify-stage']
  ) {
    platform = 'shopify'
    siteType = 'ecommerce'
  } else if (
    lowerHtml.includes('magento') ||
    lowerHtml.includes('mage/') ||
    lowerHtml.includes('requirejs/require.js')
  ) {
    platform = 'magento'
    siteType = 'ecommerce'
  } else if (
    lowerHtml.includes('demandware') ||
    lowerHtml.includes('salesforce commerce cloud') ||
    lowerUrl.includes('demandware.net') ||
    lowerHtml.includes('sfcc')
  ) {
    platform = 'sfcc'
    siteType = 'ecommerce'
  } else if (
    lowerHtml.includes('hybrisanalyticsaddon') ||
    lowerHtml.includes('b2bacceleratoraddon') ||
    lowerHtml.includes('acceleratorstorefrontcommons') ||
    (lowerHtml.includes('"acc"') && lowerHtml.includes('csrf'))
  ) {
    platform = 'hybris'
    siteType = 'ecommerce'
  } else if (
    lowerHtml.includes('bigcommerce') ||
    lowerHtml.includes('bc-sf-filter') ||
    headers['x-bc-store-id']
  ) {
    platform = 'bigcommerce'
    siteType = 'ecommerce'
  } else if (
    lowerHtml.includes('wp-content') ||
    lowerHtml.includes('wp-includes') ||
    headers['x-powered-by']?.toLowerCase().includes('wordpress')
  ) {
    platform = lowerHtml.includes('woocommerce') ? 'woocommerce' : 'wordpress'
    siteType = lowerHtml.includes('woocommerce') ? 'ecommerce' : 'general'
  }

  // SPA detection
  if (
    lowerHtml.includes('__next') ||
    lowerHtml.includes('__nuxt') ||
    lowerHtml.includes('data-reactroot') ||
    lowerHtml.includes('ng-version') ||
    lowerHtml.includes('ember-application')
  ) {
    isSPA = true
  }

  // Site type hints if not already determined
  if (siteType === 'general') {
    if (
      lowerHtml.includes('add to cart') ||
      lowerHtml.includes('add-to-cart') ||
      lowerHtml.includes('shopping cart') ||
      lowerHtml.includes('buy now')
    ) {
      siteType = 'ecommerce'
    } else if (
      lowerHtml.includes('request a demo') ||
      lowerHtml.includes('contact sales') ||
      lowerHtml.includes('enterprise')
    ) {
      siteType = 'b2b'
    } else if (
      lowerHtml.includes('article') ||
      lowerHtml.includes('blog') ||
      lowerHtml.includes('subscribe')
    ) {
      siteType = 'media'
    }
  }

  return { platform, siteType, isSPA }
}

export function getPlatformPageTypeTemplates(platform: Platform, siteType: SiteType): string[] {
  const ecommerceTypes = ['home', 'category', 'product_detail', 'cart', 'checkout', 'order_confirmation', 'search_results', 'account']
  const b2bTypes = ['home', 'product', 'solution', 'article', 'event', 'learning', 'contact', 'account']
  const mediaTypes = ['home', 'blog', 'blog_detail', 'search_results', 'account']

  const platformSpecific: Record<Platform, string[]> = {
    shopify: ecommerceTypes,
    magento: ecommerceTypes,
    sfcc: ecommerceTypes,
    hybris: ecommerceTypes,
    bigcommerce: ecommerceTypes,
    woocommerce: ecommerceTypes,
    wordpress: mediaTypes,
    custom: siteType === 'ecommerce' ? ecommerceTypes : siteType === 'b2b' ? b2bTypes : mediaTypes,
    unknown: siteType === 'ecommerce' ? ecommerceTypes : siteType === 'b2b' ? b2bTypes : mediaTypes,
  }

  return platformSpecific[platform] || ecommerceTypes
}
