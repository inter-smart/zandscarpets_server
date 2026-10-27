const sequelize = require("../config/index");

const defineAdminUser = require("./admin/adminuser");
const defineAdminRole = require("./admin/adminRole");
const defineAdminRolePermission = require("./admin/adminRolePermission");
const defineAdminRefreshToken = require("./admin/adminRefreshToken");
const defineSiteSettings = require("./siteSettings/siteSettings");
const defineSocialMedia = require("./siteSettings/socialMedia");
const defineFloatingIcon = require("./siteSettings/floatingIcon");
const defineMetaData = require("./siteSettings/metaData");
const definePageSectionSetting = require("./siteSettings/pageSectionSetting");
const defineFooterMedia = require("./siteSettings/footerMedia");
const definePage = require("./masters/page");
const defineBanners = require("./siteSettings/banners");
const defineAdsBanner = require("./masters/AdsBanner");
const defineSeasonalOffer = require("./masters/seasonalOffer");
const defineFaqs = require("./masters/faqs");
const defineIndustry = require("./masters/industry");
const defineHomeCms = require("./home/homeCms");
const defineHomeBanner = require("./home/homeBanner");
const defineHomeBrands = require("./home/homeBrands");
const defineHomeTestimonials = require("./home/homeTestimonials");
const defineHomeSideImages = require("./home/homeSideImages");
const defineAboutCms = require("./about/aboutCms");
const defineCoreValues = require("./about/coreValues");
const defineHistory = require("./about/history");
const defineAboutIndustries = require("./about/aboutIndustries");
const defineMessages = require("./about/messages");
const defineContactCms = require("./contact/contactCms");
const defineCategoryCms = require("./products/categoryCms");
// blogs
const defineBlogs = require("./blogs/blogs");
const defineBlogImages = require("./blogs/blogImages");
const defineBlogTags = require("./blogs/blogTags");
const defineBlogCms = require("./blogs/blogCms");
const defineBlogRelated = require("./blogs/blogRelated");
const defineProjects = require("./projects/projects");
const defineProjectMedia = require("./projects/projectMedia");
// policies
const definePrivacyPolicy = require("./policies/privacyPolicy");
// enquiries
const defineContactEnquiry = require("./enquiries/contactEnquiry");
const defineSampleRequest = require("./enquiries/sampleRequest");
const defineDownloadRequest = require("./enquiries/downloadRequest");
const defineQuoteRequest = require("./enquiries/quoteRequest");
const defineQuoteRequestItem = require("./enquiries/quoteRequestItem");
const defineDownloads = require("./downloads/downloads");
// products
const defineProductCategories = require("./products/productCategory");
const defineProductHighlights = require("./products/productHightlights");
const defineProducts = require("./products/products");
const defineProductBanners = require("./products/productBanners");
const defineProductLabels = require("./products/productLabels");
const defineAttributes = require("./products/attributes");
const defineAttributeValues = require("./products/attributeValues");
const defineProductAttributes = require("./products/productAttributes");
const defineProductVariants = require("./products/productVariants");
const defineVariantAttributeValues = require("./products/variantAttributeValues");
// details
const defineDetailFields = require("./details/detailFields");
const defineMedia = require("./details/media");
const defineDetailMappings = require("./details/detailMappings");
const defineDetailItems = require("./details/detailItems");
const defineDetailItemExclusions = require("./details/detailItemExclusions");
// services
const defineProcessSteps = require("./services/processSteps");
const defineServices = require("./services/services");
const defineServiceCms = require("./services/serviceCms");
// common
const defineCommonMilestones = require("./common/commonMilestones");
const defineCommonContent = require("./common/commonContent");
const defineCommonFeatures = require("./common/commonFeatures");
const defineCommonHowItWorks = require("./common/commonHowItWorks");

// product masters
const models = {
  AdminRole: defineAdminRole(sequelize),
  AdminRolePermission: defineAdminRolePermission(sequelize),
  AdminUser: defineAdminUser(sequelize),
  AdminRefreshToken: defineAdminRefreshToken(sequelize),
  SiteSettings: defineSiteSettings(sequelize),
  SocialMedia: defineSocialMedia(sequelize),
  FooterMedia: defineFooterMedia(sequelize),
  FloatingIcon: defineFloatingIcon(sequelize),

  // SITE SETTINGS
  MetaData: defineMetaData(sequelize),
  PageSectionSetting: definePageSectionSetting(sequelize),
  Page: definePage(sequelize),
  Banners: defineBanners(sequelize),
  AdsBanner: defineAdsBanner(sequelize),
  SeasonalOffer: defineSeasonalOffer(sequelize),
  Faqs: defineFaqs(sequelize),
  Industry: defineIndustry(sequelize),

  // HOME
  HomeCms: defineHomeCms(sequelize),
  HomeBanner: defineHomeBanner(sequelize),
  HomeBrands: defineHomeBrands(sequelize),
  HomeTestimonials: defineHomeTestimonials(sequelize),
  HomeSideImages: defineHomeSideImages(sequelize),

  // ABOUT
  AboutCms: defineAboutCms(sequelize),
  CoreValues: defineCoreValues(sequelize),
  History: defineHistory(sequelize),
  AboutIndustries: defineAboutIndustries(sequelize),
  Messages: defineMessages(sequelize),

  // CONTACT
  ContactCms: defineContactCms(sequelize),
  CategoryCms: defineCategoryCms(sequelize),
  ContactEnquiry: defineContactEnquiry(sequelize),
  SampleRequest: defineSampleRequest(sequelize),
  DownloadRequest: defineDownloadRequest(sequelize),
  QuoteRequest: defineQuoteRequest(sequelize),
  QuoteRequestItem: defineQuoteRequestItem(sequelize),
  Downloads: defineDownloads(sequelize),

  // POLICIES
  PrivacyPolicy: definePrivacyPolicy(sequelize),

  // BLOGS
  Blogs: defineBlogs(sequelize),
  BlogImages: defineBlogImages(sequelize),
  BlogTags: defineBlogTags(sequelize),
  BlogCms: defineBlogCms(sequelize),
  BlogRelated: defineBlogRelated(sequelize),

  // PROJECTS
  Projects: defineProjects(sequelize),
  ProjectMedia: defineProjectMedia(sequelize),

  // PRODUCTS
  ProductCategories: defineProductCategories(sequelize),
  ProductHighlights: defineProductHighlights(sequelize),
  Products: defineProducts(sequelize),
  ProductBanners: defineProductBanners(sequelize),
  ProductLabels: defineProductLabels(sequelize),

  // ATTRIBUTES
  Attributes: defineAttributes(sequelize),
  AttributeValues: defineAttributeValues(sequelize),

  // VARIANTS
  ProductAttributes: defineProductAttributes(sequelize),
  ProductVariants: defineProductVariants(sequelize),
  VariantAttributeValues: defineVariantAttributeValues(sequelize),

  // DETAILS
  DetailFields: defineDetailFields(sequelize),
  Media: defineMedia(sequelize),
  DetailMappings: defineDetailMappings(sequelize),
  DetailItems: defineDetailItems(sequelize),
  DetailItemExclusions: defineDetailItemExclusions(sequelize),

  // SERVICES
  Services: defineServices(sequelize),
  ServiceCms: defineServiceCms(sequelize),
  ProcessSteps: defineProcessSteps(sequelize),

  // COMMON
  CommonMilestones: defineCommonMilestones(sequelize),
  CommonContent: defineCommonContent(sequelize),
  CommonFeatures: defineCommonFeatures(sequelize),
  CommonHowItWorks: defineCommonHowItWorks(sequelize),
};

Object.keys(models).forEach((modelName) => {
  if ("associate" in models[modelName]) {
    console.log("Associating", modelName);
    models[modelName].associate(models);
  }
});

module.exports = { sequelize, models };
