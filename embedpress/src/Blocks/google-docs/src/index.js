/**
 * WordPress dependencies
 */
const { __ } = wp.i18n;

/**
 * Internal dependencies
 */
import Save from "./components/save.js";
import { lazyLoadDeprecations } from "../../GlobalCoponents/lazy-load-deprecations.js";
import Edit from "./components/edit.js";
import metadata from "../block.json";
import attributes from "./components/attributes";
import { poweredByDeprecations } from "../../GlobalCoponents/powered-by-deprecations.js";
import { embedpressConditionalRegisterBlockType } from "../../EmbedPress/src/components/conditional-register.js";

/**
 * Import styles - commented out to avoid Vite processing issues
 * Styles are handled separately through the build process
 */
// import "./style.scss";
import { googleDocsIcon } from "../../GlobalCoponents/icons.js";

embedpressConditionalRegisterBlockType(metadata, {
    icon: googleDocsIcon,
    attributes,
    keywords: [
        __("embedpress", "embedpress"),
        __("google", "embedpress"),
        __("docs", "embedpress"),
        __("document", "embedpress"),
    ],
    edit: Edit,
    save: Save,
    // Lets posts saved with (Pro) lazy-load placeholders, or under the other
    // "Powered By" default, validate either way.
    deprecated: [
        ...lazyLoadDeprecations(Save, { attributes: { ...(metadata.attributes || {}), ...attributes } }),
        ...poweredByDeprecations(attributes, Save),
    ],
}, 'google-docs-block');
