const { models } = require("../../../../../database/models");
const AboutSectionBuilder = require("./AboutSectionBuilder");
const CommonSections = require("../common/CommonSections");
const MetaTagService = require("../metaTag/MetaTagService");
const { withVisibility, getDisabledSections, applyEnabled } = require("../../traits/sectionHelpers");

class AboutService {
  // Same convention as the home API: both languages in one response (no `?lang=`),
  // each section carries `is_visible`, plus the page's JSON-LD / extra scripts (`other_meta`).
  static async index() {
    const cmsData = await models.AboutCms.findOne({});

    if (!cmsData) {
      throw new Error("No CMS data found for About page");
    }

    const activeQuery = {
      where: { is_active: true },
      order: [["sort_order", "ASC"]],
    };

    const [
      banner = [],
      milestones = [],
      coreValues = [],
      history = [],
      messages = [],
      industries = [],
      common,
      otherMeta,
      disabled,
    ] = await Promise.all([
      models.Banners.findAll({
        include: [
          {
            model: models.Page,
            as: "page",
            required: true,
            attributes: [],
            where: { is_active: true, page_slug: "about" },
          },
        ],
      }),
      models.CommonMilestones.findAll(activeQuery),
      models.CoreValues.findAll(activeQuery),
      models.History.findAll(activeQuery),
      models.Messages.findAll({
        ...activeQuery,
        attributes: {
          exclude: ["createdAt", "updatedAt", "deleted_at", "sort_order", "is_active"],
        },
      }),
      models.AboutIndustries.findAll(activeQuery),
      CommonSections.fetch(),
      MetaTagService.getOtherMetaForPage("about"),
      getDisabledSections("about"),
    ]);

    const sections = {
      banner_section: AboutSectionBuilder.buildBannerSection(banner),
      introduction_section: AboutSectionBuilder.buildIntroductionSection(cmsData, milestones),
      history_section: AboutSectionBuilder.buildHistorySection(cmsData, history),
      messages_section: AboutSectionBuilder.buildMessagesSection(cmsData, messages),
      core_value_section: AboutSectionBuilder.buildCoreValueSection(cmsData, coreValues),
      industry_section: AboutSectionBuilder.buildIndustrySection(cmsData, industries),
      how_it_works_section: CommonSections.buildHowItWorksSection(common.howItWorks, common.commonContent),
      features_section: CommonSections.buildFeaturesSection(common.features, common.commonContent),
      side_section: CommonSections.buildSideSection(common.commonContent),
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

module.exports = AboutService;
