/**
 * Feature flags.
 *
 * One constant, one comment each. If a flag ever needs a config file, that is a
 * sign there are too many of them.
 */

/**
 * The regional layer — kosher availability, Chabad distance, Hebrew-speaking
 * ski instruction, Shabbat notes.
 *
 * OFF. The product is universal; a single nationality's requirements are not a
 * headline feature of a European ski search.
 *
 * The data, the schema, the verification gating and the curated research in
 * `data/seed/israel_layer_research.json` are all DELIBERATELY RETAINED. This is
 * real work and the modelling is sound — it is dormant, not deleted. Flipping
 * this to `true` restores every surface it used to render.
 *
 * The generalisation that replaces it is `LanguageProfile.skiSchoolLanguages`:
 * "this ski school teaches in English, German and Italian" serves every visitor,
 * where "Hebrew: yes/no" only ever served one. Language data is not collected
 * yet, so those fields render as "not recorded" — which is the honest state, and
 * the same tri-state discipline the rest of the app uses.
 */
export const SHOW_REGIONAL_LAYER = false;
