const { models } = require("../../../../../database/models");
const { singleMediaWithType, singleMediaWithoutType } = require("../../traits/mediaButtonHelper");
const MetaTagService = require("../metaTag/MetaTagService");
const CommonSections = require("../common/CommonSections");
const { withVisibility, getDisabledSections, applyEnabled, inlineRichText, blockRichText } = require("../../traits/sectionHelpers");

const orderedActive = { where: { is_active: true }, order: [["sort_order", "ASC"]] };
const homeBannerAttributes = [
  "id",
  "title",
  "title_ar",
  "description",
  "description_ar",
  "media_type",
  "media_path",
  "thumbnail",
  "media_alt",
  "media_alt_ar",
  "sort_order",
  "is_active",
];
const commonMilestonesAttributes = [
  "id",
  "media_path",
  "media_alt",
  "media_alt_ar",
  "value",
  "value_ar",
  "label",
  "label_ar",
  "sort_order",
  "is_active",
  "show_in_home",
];

const homeCategoryAttributes = ["id", "slug", "title", "title_ar", "media_path", "sort_order"];

const homeIndustryAttributes = ["id", "slug", "title", "title_ar", "description", "description_ar", "sort_order"];
const industryCategoryAttributes = ["id", "slug", "title", "title_ar", "media_path", "sort_order"];

const homeTestimonialAttributes = [
  "id",
  "profile_media_path",
  "name",
  "name_ar",
  "designation",
  "designation_ar",
  "message",
  "message_ar",
  "sort_order",
];

const homeBrandAttributes = ["id", "media_path", "media_alt", "media_alt_ar", "sort_order"];

const homeFaqAttributes = ["id", "question", "question_ar", "answer", "answer_ar", "sort_order"];
const homeSideImageAttributes = [
  "id",
  "before_media_path",
  "after_media_path",
  "before_media_alt",
  "before_media_alt_ar",
  "after_media_alt",
  "after_media_alt_ar",
  "sort_order",
];

const commonListAttributes = ["id", "title", "title_ar", "description", "description_ar", "sort_order"];

const homeProductAttributes = [
  "id",
  "slug",
  "title",
  "title_ar",
  "short_description",
  "short_description_ar",
  "price",
  "list_media_path",
  "list_media_alt",
  "list_media_alt_ar",
  "sort_order",
];

class HomeService {
  static async index() {
    const [cmsData, commonContent] = await Promise.all([models.HomeCms.findOne({}), models.CommonContent.findOne({})]);
    if (!cmsData) {
      throw new Error("No CMS data found for About page");
    }
    const [
      homeBanners = [],
      milestones = [],
      homeCategories = [],
      industries = [],
      testimonials = [],
      brands = [],
      faqs = [],
      sideImages = [],
      features = [],
      howItWorks = [],
      residentialProducts = [],
      otherMeta,
      disabled,
    ] = await Promise.all([
      models.HomeBanner.findAll({
        ...orderedActive,
        attributes: homeBannerAttributes,
        include: [
          {
            model: models.Industry,
            as: "industry",
            attributes: ["id", "slug", "title", "title_ar", "link"],
            where: { is_active: true },
            required: true,
          },
        ],
      }),
      models.CommonMilestones.findAll({
        attributes: commonMilestonesAttributes,
        where: { is_active: true, show_in_home: true },
        order: [["sort_order", "ASC"]],
      }),
      models.ProductCategories.findAll({
        attributes: homeCategoryAttributes,
        where: { is_active: true, show_in_home: true },
        order: [["sort_order", "ASC"]],
      }),
      models.Industry.findAll({
        attributes: homeIndustryAttributes,
        where: { is_active: true },
        include: [
          {
            model: models.ProductCategories,
            as: "categories",
            attributes: industryCategoryAttributes,
            where: { is_active: true },
            required: false,
            through: { attributes: [] },
          },
        ],
        order: [
          ["sort_order", "ASC"],
          [{ model: models.ProductCategories, as: "categories" }, "sort_order", "ASC"],
        ],
      }),
      models.HomeTestimonials.findAll({ ...orderedActive, attributes: homeTestimonialAttributes }),
      models.HomeBrands.findAll({ ...orderedActive, attributes: homeBrandAttributes }),
      models.Faqs.findAll({
        attributes: homeFaqAttributes,
        where: { is_active: true, product_id: null },
        order: [["sort_order", "ASC"]],
      }),
      models.HomeSideImages.findAll({ ...orderedActive, attributes: homeSideImageAttributes }),
      models.CommonFeatures.findAll({ ...orderedActive, attributes: commonListAttributes }),
      models.CommonHowItWorks.findAll({ ...orderedActive, attributes: commonListAttributes }),
      models.Products.findAll({
        attributes: homeProductAttributes,
        where: { is_active: true, show_in_home: true },
        include: [
          { model: models.ProductLabels, as: "badge", attributes: ["id", "slug", "title", "title_ar"], required: false },
          {
            model: models.ProductCategories,
            as: "category",
            attributes: ["id", "slug", "title", "title_ar"],
            where: { is_active: true },
            required: true,
          },
        ],
        order: [["sort_order", "ASC"]],
      }),
      MetaTagService.getOtherMetaForPage("home"),
      getDisabledSections("home"),
    ]);

    const sections = {
      banner_section: this.buildBannerSection(homeBanners),
      milestones_section: this.buildMilestonesSection(milestones),
      discover_section: this.buildCategoriesSection(cmsData, homeCategories),
      industries_section: this.buildIndustriesSection(cmsData, industries),
      testimonials_section: this.buildTestimonialsSection(testimonials, cmsData),
      brands_section: this.buildBrandsSection(brands, cmsData),
      faqs_section: this.buildFaqsSection(faqs, cmsData),
      side_images_section: this.buildSideImagesSection(sideImages),
      space_section: { title: cmsData?.space_section_title ?? "", title_ar: cmsData?.space_section_title_ar ?? "" },
      premium_section: this.buildPremiumSection(cmsData),
      works_section: this.buildWorksSection(cmsData),
      features_section: this.buildFeaturesSection(features, commonContent),
      side_section: this.buildSideSection(commonContent),
      how_it_works_section: this.buildHowItWorksSection(howItWorks, commonContent),
      residential_section: this.buildResidentialSection(residentialProducts, cmsData),
      cta_section: this.buildCtaSection(cmsData),
    };

    return {
      other_meta: otherMeta.other_meta,
      other_meta_ar: otherMeta.other_meta_ar,
      ...applyEnabled(Object.fromEntries(Object.entries(sections).map(([key, section]) => [key, withVisibility(section)])), disabled),
    };
  }

  static buildBannerSection(homeBanners) {
    console.log(
      "homeBanners",
      (homeBanners ?? []).map((b) => ({
        title: b.title,
        title_ar: b.title_ar,
        industry: b.industry
          ? { id: b.industry.id, slug: b.industry.slug, title: b.industry.title, title_ar: b.industry.title_ar, link: b.industry.link }
          : null,
      })),
    );

    return {
      list: homeBanners.map((item) => ({
        id: item?.id,
        title: inlineRichText(item?.title),
        title_ar: inlineRichText(item?.title_ar),
        description: inlineRichText(item?.description),
        description_ar: inlineRichText(item?.description_ar),
        media: singleMediaWithType(item, "media_type", "media_path", "media_alt", "media_alt_ar"),
        thumbnail: singleMediaWithoutType(item, "thumbnail", "media_alt", "media_alt_ar"),
        industry: item?.industry
          ? {
              id: item.industry.id,
              slug: item.industry.slug,
              title: item.industry.title ?? "",
              title_ar: item.industry.title_ar ?? "",
              link: item.industry.link ?? "",
            }
          : null,
      })),
    };
  }

  static buildMilestonesSection(milestones) {
    return {
      list: milestones.map((item) => ({
        id: item?.id,
        value: item?.value ?? "",
        value_ar: item?.value_ar ?? "",
        label: item?.label ?? "",
        label_ar: item?.label_ar ?? "",
        media: singleMediaWithoutType(item, "media_path", "media_alt", "media_alt_ar"),
      })),
    };
  }

  static buildCategoriesSection(cmsData, homeCategories) {
    return {
      title: cmsData?.discover_title ?? "",
      title_ar: cmsData?.discover_title_ar ?? "",
      list: homeCategories.map((item) => ({
        id: item?.id,
        slug: item?.slug ?? "",
        title: item?.title ?? "",
        title_ar: item?.title_ar ?? "",
        link: `products?category=${item?.slug}`,
        media: singleMediaWithoutType(item, "media_path"),
      })),
    };
  }

  static buildIndustriesSection(cmsData, industries) {
    const buttonLink = cmsData?.space_button_link;

    return {
      title: cmsData?.space_section_title ?? "",
      title_ar: cmsData?.space_section_title_ar ?? "",
      background: singleMediaWithoutType(cmsData ?? {}, "space_bg_image"),
      list: industries.map((item) => {
        const categories = (item?.categories ?? []).map((cat) => ({
          id: cat?.id,
          slug: cat?.slug ?? "",
          title: cat?.title ?? "",
          title_ar: cat?.title_ar ?? "",
          media: singleMediaWithoutType(cat, "media_path"),
        }));

        return {
          id: item?.id,
          slug: item?.slug ?? "",
          title: item?.title ?? "",
          title_ar: item?.title_ar ?? "",
          description: blockRichText(item?.description),
          description_ar: blockRichText(item?.description_ar),
          link: item?.link ?? "",
          // only shown by the client when a link is configured and this industry has
          // at least one category to filter by; otherwise the CTA is hidden entirely
          button:
            buttonLink && categories.length
              ? {
                  text: cmsData?.space_button_text ?? "",
                  text_ar: cmsData?.space_button_text_ar ?? "",
                  link: `${buttonLink}${buttonLink.includes("?") ? "&" : "?"}category=${categories[0].slug}`,
                }
              : null,
          categories,
        };
      }),
    };
  }

  static buildTestimonialsSection(testimonials, cmsData) {
    return {
      title: cmsData?.testimonial_title ?? "",
      title_ar: cmsData?.testimonial_title_ar ?? "",
      list: testimonials.map((item) => ({
        id: item?.id,
        name: item?.name ?? "",
        name_ar: item?.name_ar ?? "",
        designation: item?.designation ?? "",
        designation_ar: item?.designation_ar ?? "",
        message: item?.message ?? "",
        message_ar: item?.message_ar ?? "",
        profile: singleMediaWithoutType(item, "profile_media_path"),
      })),
    };
  }

  static buildBrandsSection(brands, cmsData) {
    return {
      title: cmsData?.brand_title ?? "",
      title_ar: cmsData?.brand_title_ar ?? "",
      list: brands.map((item) => ({
        id: item?.id,
        media: singleMediaWithoutType(item, "media_path", "media_alt", "media_alt_ar"),
      })),
    };
  }

  static buildFaqsSection(faqs, cmsData) {
    return {
      title: cmsData?.faq_title ?? "",
      title_ar: cmsData?.faq_title_ar ?? "",
      list: faqs.map((item) => ({
        id: item?.id,
        question: item?.question ?? "",
        question_ar: item?.question_ar ?? "",
        answer: item?.answer ?? "",
        answer_ar: item?.answer_ar ?? "",
      })),
    };
  }

  static buildSideImagesSection(sideImages) {
    return {
      list: sideImages.map((item) => ({
        id: item?.id,
        before: singleMediaWithoutType(item, "before_media_path", "before_media_alt", "before_media_alt_ar"),
        after: singleMediaWithoutType(item, "after_media_path", "after_media_alt", "after_media_alt_ar"),
      })),
    };
  }

  // Heading of the projects ("Explore Our Work") block; the projects themselves come from /api/frontend/projects
  static buildWorksSection(cmsData) {
    return {
      title: cmsData?.project_title ?? "",
      title_ar: cmsData?.project_title_ar ?? "",
    };
  }

  static buildPremiumSection(cmsData) {
    return {
      title: cmsData?.premium_title ?? "",
      title_ar: cmsData?.premium_title_ar ?? "",
      description: blockRichText(cmsData?.premium_description),
      description_ar: blockRichText(cmsData?.premium_description_ar),
    };
  }

  static buildFeaturesSection(features, commonContent) {
    return CommonSections.buildFeaturesSection(features, commonContent);
  }

  static buildHowItWorksSection(howItWorks, commonContent) {
    return CommonSections.buildHowItWorksSection(howItWorks, commonContent);
  }

  static buildSideSection(commonContent) {
    return CommonSections.buildSideSection(commonContent);
  }

  static buildCtaSection(cmsData) {
    return {
      title: inlineRichText(cmsData?.cta_title),
      title_ar: inlineRichText(cmsData?.cta_title_ar),
      description: blockRichText(cmsData?.cta_description),
      description_ar: blockRichText(cmsData?.cta_description_ar),
      media: singleMediaWithoutType(cmsData, "cta_media_path"),
    };
  }

  static buildResidentialSection(products, cmsData) {
    return {
      title: cmsData?.residential_title ?? "",
      title_ar: cmsData?.residential_title_ar ?? "",
      list: products.map((item) => ({
        id: item?.id,
        slug: item?.slug ?? "",
        title: item?.title ?? "",
        title_ar: item?.title_ar ?? "",
        short_description: item?.short_description ?? "",
        short_description_ar: item?.short_description_ar ?? "",
        price: item?.price ?? null,
        media: singleMediaWithoutType(item, "list_media_path", "list_media_alt", "list_media_alt_ar"),
        badge: item?.badge ? { id: item.badge.id, slug: item.badge.slug, title: item.badge.title, title_ar: item.badge.title_ar } : null,
        category: item?.category
          ? { id: item.category.id, slug: item.category.slug, title: item.category.title, title_ar: item.category.title_ar }
          : null,
      })),
    };
  }
}

module.exports = HomeService;
