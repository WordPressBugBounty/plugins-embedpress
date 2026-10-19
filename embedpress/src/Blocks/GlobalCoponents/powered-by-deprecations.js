/**
 * Block-validation safety net for the `powered_by` attribute.
 *
 * The attribute's default follows the global "Powered By EmbedPress" setting
 * (localized as embedpressGutenbergData.poweredBy / embedpress_powered_by:
 * "1" when on, "" when off — off on fresh installs, WP.org Guideline 10).
 * A block that kept the default does not store `powered_by` in its comment
 * delimiter, so when the site owner flips the global setting, save() would
 * regenerate different markup and the editor would flag the block as
 * "unexpected or invalid content".
 *
 * These entries re-parse such a block under the default it was saved with.
 * The recovered value is then stored explicitly, so the post keeps exactly
 * the credit it was published with until the author changes it.
 *
 * @param {Object}   attributes Current block attributes definition.
 * @param {Function} save       Current block save component.
 * @return {Array} deprecated[] entries.
 */
export const poweredByDeprecations = (attributes, save) =>
    ['1', ''].map((savedDefault) => ({
        attributes: {
            ...attributes,
            powered_by: {
                ...(attributes.powered_by || {}),
                type: 'boolean',
                default: savedDefault,
            },
        },
        save,
    }));
