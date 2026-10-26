const { models } = require("../../../../../database/models");
const ContactSectionBuilder = require("./ContactSectionBuilder");
const MetaTagService = require("../metaTag/MetaTagService");
const { withVisibility, getDisabledSections, applyEnabled } = require("../../traits/sectionHelpers");

class ContactService {
  // Same convention as the home / about APIs: both languages in one response (no `?lang=`),
  // each section carries `is_visible`, plus the page's JSON-LD / extra scripts (`other_meta`).
  // A missing CMS row is not an error: the sections come back hidden and the storefront
  // falls back to its translated content.
  static async index() {
    const cmsData = (await models.ContactCms.findOne({})) ?? {};

    const [banner = [], socialMedia = [], otherMeta, disabled] = await Promise.all([
      models.Banners.findAll({
        include: [
          {
            model: models.Page,
            as: "page",
            required: true,
            attributes: [],
            where: { is_active: true, page_slug: "contact" },
          },
        ],
      }),
      models.SocialMedia.findAll({
        where: { is_active: true },
        order: [["sort_order", "ASC"]],
      }),
      MetaTagService.getOtherMetaForPage("contact"),
      getDisabledSections("contact"),
    ]);

    const sections = applyEnabled({
      banner_section: withVisibility(ContactSectionBuilder.buildBannerSection(banner)),
      contact_detail_section: ContactSectionBuilder.buildContactDetailSection(cmsData),
      social_section: withVisibility(ContactSectionBuilder.buildSocialSection(cmsData, socialMedia)),
      form_section: withVisibility(ContactSectionBuilder.buildFormSection(cmsData)),
      map_section: ContactSectionBuilder.buildMapSection(cmsData),
    }, disabled);

    const data = {
      other_meta: otherMeta.other_meta,
      other_meta_ar: otherMeta.other_meta_ar,
      ...sections,
    };

    return { data };
  }
}

module.exports = ContactService;
