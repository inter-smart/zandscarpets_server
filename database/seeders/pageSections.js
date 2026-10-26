// Sections an admin can show/hide per storefront page. `key` matches the section key in that
// page's frontend API response. Add a page here (slug from pagenames.js) to make it toggleable.
const PAGE_SECTIONS = {
  contact: [
    { key: "banner_section", label: "Banner" },
    { key: "contact_detail_section", label: "Contact Details" },
    { key: "social_section", label: "Social Links" },
    { key: "form_section", label: "Contact Form" },
    { key: "map_section", label: "Map" },
  ],
  home: [
    { key: "banner_section", label: "Hero Banner (with milestones)" },
    { key: "discover_section", label: "Collections" },
    { key: "residential_section", label: "Best Sellers" },
    { key: "industries_section", label: "Built For (Industries)" },
    { key: "works_section", label: "Our Work" },
    { key: "features_section", label: "Why Choose Us" },
    { key: "side_images_section", label: "Before / After Images" },
    { key: "how_it_works_section", label: "How It Works" },
    { key: "testimonials_section", label: "Testimonials" },
    { key: "brands_section", label: "Trusted Brands" },
    { key: "cta_section", label: "Call To Action" },
    { key: "faqs_section", label: "FAQs" },
    { key: "premium_section", label: "Premium Solutions" },
  ],
  products: [
    { key: "banner_section", label: "Banner" },
    { key: "faqs_section", label: "FAQs" },
  ],
  about: [
    { key: "banner_section", label: "Banner" },
    { key: "introduction_section", label: "Introduction" },
    { key: "history_section", label: "History" },
    { key: "messages_section", label: "Management Messages" },
    { key: "how_it_works_section", label: "How It Works" },
    { key: "core_value_section", label: "Core Values" },
    { key: "features_section", label: "Why Choose Us" },
    { key: "industry_section", label: "Industries" },
  ],
  services: [
    { key: "banner_section", label: "Banner" },
    { key: "introduction_section", label: "Introduction" },
    { key: "service_section", label: "Services Grid" },
    { key: "process_steps_section", label: "Process Steps" },
  ],
};

const isValidPageSection = (pageSlug, sectionKey) =>
  Object.prototype.hasOwnProperty.call(PAGE_SECTIONS, pageSlug) &&
  PAGE_SECTIONS[pageSlug].some((s) => s.key === sectionKey);

module.exports = { PAGE_SECTIONS, isValidPageSection };
