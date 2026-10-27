const cmsResources = {
  "social-media": {
    model: "SocialMedia",
  },
  "footer-media": {
    model: "FooterMedia",
  },
  "floating-icons": {
    model: "FloatingIcon",
  },
  pages: {
    model: "Page",
    sortable: false,
  },
  "ads-banner": { model: "AdsBanner" },
  faqs: { model: "Faqs" },
  industry: { model: "Industry" },
      "home-banner": { model: "HomeBanner" },
  "common-milestones": { model: "CommonMilestones" },
  "common-features": { model: "CommonFeatures" },
  "common-how-it-works": { model: "CommonHowItWorks" },
  "home-brands": { model: "HomeBrands" },
  "home-testimonials": {
    model: "HomeTestimonials",
  },
  "home-side-images": {
    model: "HomeSideImages",
  },
  "core-values": { model: "CoreValues" },
  history: { model: "History" },
  "about-industries": {
    model: "AboutIndustries",
  },
  messages: { model: "Messages" },
    projects: { model: "Projects", homeField: "is_show_in_home" },
  services: { model: "Services" },
  "process-steps": { model: "ProcessSteps" },
  "product-categories": {
    model: "ProductCategories",
  },
  // category responses embed highlights, so highlight changes bust them too
  "product-highlights": {
    model: "ProductHighlights",
  },
  "product-labels": {
    model: "ProductLabels",
  },
  // attribute responses embed their values, so value changes bust attributes too
  attributes: {
    model: "Attributes",
  },
  "attribute-values": {
    model: "AttributeValues",
  },
  // product responses embed variants, so variant changes bust products too
  "product-variants": {
    model: "ProductVariants",
  },
  products: { model: "Products", navbarField: "list_in_navbar" },
  "detail-fields": { model: "DetailFields" },
  // blog posts are ordered by their publish date, so only the status can be changed here
  blogs: { model: "Blogs", sortable: false },
  "blog-tags": { model: "BlogTags" },
  downloads: { model: "Downloads" },
};

module.exports = { cmsResources };
