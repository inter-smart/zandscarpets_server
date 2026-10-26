const { models } = require("../../../../../database/models");
const ServicesSectionBuilder = require("./ServicesSectionBuilder");
const MetaTagService = require("../metaTag/MetaTagService");
const { withVisibility, getDisabledSections, applyEnabled } = require("../../traits/sectionHelpers");

class ServicesService {
  // Same convention as the home / about APIs: both languages in one response (no `?lang=`),
  // each section carries `is_visible`, plus the page's JSON-LD / extra scripts (`other_meta`).
  static async index() {
    const cmsData = await models.ServiceCms.findOne({});

    if (!cmsData) {
      throw new Error("No CMS data found for Services page");
    }

    const activeQuery = {
      where: { is_active: true },
      order: [["sort_order", "ASC"]],
    };

    const [banner = [], industries = [], services = [], processSteps = [], otherMeta, disabled] = await Promise.all([
      models.Banners.findAll({
        include: [
          {
            model: models.Page,
            as: "page",
            required: true,
            attributes: [],
            where: { is_active: true, page_slug: "services" },
          },
        ],
      }),
      models.Industry.findAll(activeQuery),
      models.Services.findAll(activeQuery),
      models.ProcessSteps.findAll(activeQuery),
      MetaTagService.getOtherMetaForPage("services"),
      getDisabledSections("services"),
    ]);

    const sections = {
      banner_section: ServicesSectionBuilder.buildBannerSection(banner),
      introduction_section: ServicesSectionBuilder.buildIntroductionSection(cmsData, industries),
      service_section: ServicesSectionBuilder.buildServiceSection(cmsData, services),
      process_steps_section: ServicesSectionBuilder.buildProcessStepsSection(cmsData, processSteps),
    };

    const data = {
      other_meta: otherMeta.other_meta,
      other_meta_ar: otherMeta.other_meta_ar,
      ...applyEnabled(
        Object.fromEntries(Object.entries(sections).map(([key, section]) => [key, withVisibility(section)])),
        disabled,
      ),
    };

    return { data };
  }
}

module.exports = ServicesService;
