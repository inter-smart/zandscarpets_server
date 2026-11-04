const { models } = require("../../../../../database/models");

// The general FAQs (the ones that don't belong to a product) and their heading. Shared by the home
// and products page APIs so both list the same FAQs, in the same order, under the same title.
// Callers wrap the result with `withVisibility` / `applyEnabled` like any other section.
class GeneralFaqs {
  static async fetch() {
    const [faqs = [], cms] = await Promise.all([
      models.Faqs.findAll({
        attributes: ["id", "question", "question_ar", "answer", "answer_ar", "sort_order"],
        where: { is_active: true, product_id: null },
        order: [["sort_order", "ASC"], ["id", "ASC"]],
      }),
      models.HomeCms.findOne({ attributes: ["faq_title", "faq_title_ar"] }),
    ]);
    return { faqs, cms };
  }

  static buildSection({ faqs, cms }) {
    return {
      title: cms?.faq_title ?? "",
      title_ar: cms?.faq_title_ar ?? "",
      list: faqs.map((item) => ({
        id: item.id,
        question: item.question ?? "",
        question_ar: item.question_ar ?? "",
        answer: item.answer ?? "",
        answer_ar: item.answer_ar ?? "",
      })),
    };
  }
}

module.exports = GeneralFaqs;
