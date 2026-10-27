// Picks the language-appropriate value; falls back to the base value when no
// Arabic variant exists (e.g. a table with no `_ar` columns at all).
function t(lang, base, ar) {
  return lang === "ar" ? (ar ?? base ?? "") : (base ?? "");
}

// Collapses a media object's paired `foo`/`foo_ar` keys down to a single
// language, recursing into nested objects (e.g. desktop/mobile).
function localizeMedia(media, lang) {
  if (Array.isArray(media)) return media.map((m) => localizeMedia(m, lang));
  if (media && typeof media === "object") {
    const result = {};
    for (const key of Object.keys(media)) {
      if (key.endsWith("_ar")) continue;
      const arKey = `${key}_ar`;
      if (Object.prototype.hasOwnProperty.call(media, arKey)) {
        result[key] = t(lang, media[key], media[arKey]);
      } else if (media[key] && typeof media[key] === "object") {
        result[key] = localizeMedia(media[key], lang);
      } else {
        result[key] = media[key];
      }
    }
    return result;
  }
  return media;
}

module.exports = { t, localizeMedia };
