// Catalog of permission modules. Every admin route is guarded by exactly one of these keys
// (authMiddleware({ module })). The Roles screen renders its tick-boxes from this list
// (GET /roles/modules), so adding a module here is all it takes to make it assignable.
//
// readOpen: when true, any logged-in admin user may GET this module's endpoints even without
// view access, because other modules' forms load this data as dropdowns/dependencies. Writes
// always need "manage". Keep it false where the data is sensitive (personal data, accounts, config).
const MODULES = [
  { key: "website_pages", label: "Website Pages", group: "Website Content", description: "Home, About, Contact, Services/Categories/Blog page content, Privacy Policy, navigation pages" , readOpen: true },
  { key: "site_elements", label: "Site Elements", group: "Website Content", description: "Banners, Ads Banner, Seasonal Offer, Footer Media, Floating Icons" , readOpen: true },
  { key: "catalog", label: "Catalog", group: "Catalog", description: "Products, categories, attributes, labels, detail fields, media library" , readOpen: true },
  { key: "bulk_upload", label: "Bulk Upload", group: "Catalog", description: "Spreadsheet import / export" , readOpen: true },
  { key: "blogs", label: "Blogs", group: "Marketing & Content", description: "Blogs and blog tags" , readOpen: true },
  { key: "projects", label: "Projects", group: "Marketing & Content", description: "Projects" , readOpen: true },
  { key: "services", label: "Services", group: "Marketing & Content", description: "Services and process steps" , readOpen: true },
  { key: "downloads", label: "Downloads", group: "Marketing & Content", description: "Downloadable files" , readOpen: true },
  { key: "shared_blocks", label: "Shared Blocks", group: "Marketing & Content", description: "Common content, features, how it works, milestones" , readOpen: true },
  { key: "masters", label: "Reference Data", group: "Reference Data", description: "FAQs, industries, materials, work plans, our features" , readOpen: true },
  { key: "leads", label: "Leads / Enquiries", group: "Leads", description: "Contact, sample, download and quote requests" , readOpen: false },
  { key: "seo", label: "SEO", group: "SEO", description: "Meta tags and structured data" , readOpen: true },
  { key: "settings", label: "Site Settings", group: "Settings", description: "Site settings and social media" , readOpen: false },
  { key: "users", label: "Users", group: "Administration", description: "Admin users" , readOpen: false },
  { key: "roles", label: "Roles & Permissions", group: "Administration", description: "Create roles and edit their permissions" , readOpen: false },
];

const MODULE_KEYS = MODULES.map((m) => m.key);
const READ_OPEN_MODULES = new Set(MODULES.filter((m) => m.readOpen).map((m) => m.key));
const ACCESS_LEVELS = ["view", "manage"];

module.exports = { MODULES, MODULE_KEYS, ACCESS_LEVELS, READ_OPEN_MODULES };
