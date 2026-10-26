const { singleMediaWithoutType } = require("../../traits/mediaButtonHelper");

class SeasonalOfferSectionBuilder {
  static build(cmsData) {
    return {
      is_visible: Boolean(cmsData?.is_active),
      auto_show_delay_seconds: cmsData?.auto_show_delay_seconds ?? null,
      media: singleMediaWithoutType(cmsData ?? {}, "media_path"),
      mobile_media: singleMediaWithoutType(cmsData ?? {}, "mobile_media_path"),
      badge: singleMediaWithoutType(cmsData ?? {}, "badge_image"),
      button_text: cmsData?.button_text ?? "",
      button_text_ar: cmsData?.button_text_ar ?? "",
      button_link: cmsData?.button_link ?? "",
    };
  }
}

module.exports = SeasonalOfferSectionBuilder;
