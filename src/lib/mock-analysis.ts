import type { AnalysisResult, RequirementInput } from '@/types/analysis'

export function buildMockAnalysis(
  siteUrl: string,
  requirement: RequirementInput,
): AnalysisResult {
  return {
    site: {
      url: siteUrl || 'https://example-shop.com',
      title: 'Example Shop',
      platform: 'Shopify',
      sampledPages: [
        { url: '/', title: 'Home', signals: ['hero', 'featured products'] },
        { url: '/collections/mens', title: 'Mens', signals: ['product grid', 'filters'] },
        { url: '/products/sample-tee', title: 'Sample Tee', signals: ['price', 'add-to-cart', 'product JSON-LD'] },
        { url: '/cart', title: 'Cart', signals: ['line items', 'subtotal'] },
      ],
    },
    requirement: {
      rawText:
        requirement.rawText ||
        'Capture product ID, name, price, and add-to-cart clicks on product detail pages.',
      constraints: requirement.constraints,
    },
    pageTypes: [
      {
        id: 'pt_home',
        name: 'Home',
        isMatchHint: 'pathname === "/"',
        objectRefs: [],
        eventRefs: [],
        sampleUrls: ['/'],
        confidence: 'high',
        status: 'suggested',
        evidenceRefs: ['ev_home_url'],
      },
      {
        id: 'pt_category',
        name: 'Category',
        isMatchHint: 'pathname starts with /collections/',
        interactionName: 'ViewCategory',
        objectRefs: ['do_category'],
        eventRefs: [],
        sampleUrls: ['/collections/mens'],
        confidence: 'high',
        status: 'suggested',
        evidenceRefs: ['ev_category_url'],
      },
      {
        id: 'pt_product',
        name: 'Product Detail',
        isMatchHint: 'pathname starts with /products/',
        interactionName: 'ViewCatalogObject',
        objectRefs: ['do_product'],
        eventRefs: ['ev_add_to_cart'],
        sampleUrls: ['/products/sample-tee'],
        confidence: 'high',
        status: 'suggested',
        evidenceRefs: ['ev_product_url', 'ev_product_jsonld', 'ev_req_product'],
      },
      {
        id: 'pt_cart',
        name: 'Cart',
        isMatchHint: 'pathname === "/cart"',
        interactionName: 'ViewCart',
        objectRefs: ['do_cart'],
        eventRefs: [],
        sampleUrls: ['/cart'],
        confidence: 'medium',
        status: 'suggested',
        evidenceRefs: ['ev_cart_url'],
      },
    ],
    dataObjects: [
      {
        id: 'do_product',
        type: 'Product',
        label: 'Product',
        fields: [
          { name: 'id', source: 'jsonLd', required: true },
          { name: 'name', source: 'jsonLd', required: true },
          { name: 'price', source: 'jsonLd', required: true },
          { name: 'category', source: 'url', required: false },
        ],
      },
      {
        id: 'do_category',
        type: 'Category',
        label: 'Category',
        fields: [
          { name: 'id', source: 'url', required: true },
          { name: 'name', source: 'dom', selectorHint: 'h1', required: false },
        ],
      },
      {
        id: 'do_cart',
        type: 'Cart',
        label: 'Cart',
        fields: [
          { name: 'totalValue', source: 'dom', selectorHint: '.cart-subtotal', required: true },
        ],
      },
    ],
    events: [
      {
        id: 'ev_add_to_cart',
        kind: 'interaction',
        interactionName: 'AddToCart',
        pageTypeRefs: ['pt_product'],
        objectRef: 'do_product',
        triggerHint: 'click on button.add-to-cart',
      },
    ],
    evidence: [
      { id: 'ev_home_url', kind: 'UrlPattern', label: 'pathname === "/"', detail: '1 sampled page matches root' },
      { id: 'ev_category_url', kind: 'UrlPattern', label: '/collections/*', detail: '1 sample URL matches collection pattern' },
      { id: 'ev_product_url', kind: 'UrlPattern', label: '/products/*', detail: '1 sample URL matches product pattern' },
      { id: 'ev_product_jsonld', kind: 'PageSignal', label: 'Product JSON-LD present', detail: 'schema.org/Product with offers.price' },
      { id: 'ev_req_product', kind: 'RequirementMatch', label: 'product detail pages', detail: 'matched phrase in requirement text' },
      { id: 'ev_cart_url', kind: 'UrlPattern', label: '/cart', detail: 'Shopify default cart path' },
    ],
    requirementMappings: [
      {
        id: 'rm_capture_product',
        text: 'Capture product ID, name, price on product detail pages',
        targets: [{ pageTypeRef: 'pt_product', objectRef: 'do_product' }],
        status: 'mapped',
      },
      {
        id: 'rm_add_to_cart',
        text: 'Track add-to-cart clicks',
        targets: [{ pageTypeRef: 'pt_product', eventRef: 'ev_add_to_cart' }],
        status: 'mapped',
      },
    ],
    attributes: [],
    assumptions: [
      'Shopify theme with default /products/* and /collections/* routing',
      'Product JSON-LD is rendered server-side on every PDP',
      'Cart subtotal is exposed via .cart-subtotal DOM node',
    ],
    pendingConfirmations: [
      {
        id: 'pc_add_to_cart_selector',
        question: 'Is the add-to-cart selector "button.add-to-cart" correct for this theme?',
        pageTypeRef: 'pt_product',
      },
      {
        id: 'pc_search_page',
        question: 'Does this site expose a dedicated search results page we should add as a Page Type?',
      },
    ],
  }
}
