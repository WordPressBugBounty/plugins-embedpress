/**
 * WordPress dependencies
 */
const { __ } = wp.i18n;
const { registerBlockType } = wp.blocks;

/**
 * Internal dependencies
 */
import Save from "./components/save.js";
import { lazyLoadDeprecations } from "../../GlobalCoponents/lazy-load-deprecations.js";
import Edit from "./components/edit.js";
import metadata from "../block.json";
import attributes from "./components/attributes";
import { poweredByDeprecations } from "../../GlobalCoponents/powered-by-deprecations.js";

/**
 * Import styles - commented out to avoid Vite processing issues
 * Styles are handled separately through the build process
 */
// import "./style.scss";
import { googleFormsIcon } from "../../GlobalCoponents/icons.js";

// Check if the Google Forms block is enabled - use a safer approach
let shouldRegister = false;

if (embedpressGutenbergData && embedpressGutenbergData.activeBlocks && embedpressGutenbergData.activeBlocks['google-forms-block']) {
    shouldRegister = true;
}

if (shouldRegister) {
    registerBlockType(metadata.name, {
        ...metadata,
        icon: googleFormsIcon,
        attributes,
        keywords: [
            __("embedpress", "embedpress"),
            __("google", "embedpress"),
            __("forms", "embedpress"),
            __("survey", "embedpress"),
        ],
        edit: Edit,
        save: Save,
        // Lets posts saved with (Pro) lazy-load placeholders, or under the other
        // "Powered By" default, validate either way.
        deprecated: [
            ...lazyLoadDeprecations(Save, { attributes: { ...(metadata.attributes || {}), ...attributes } }),
            ...poweredByDeprecations(attributes, Save),
        ],
    });
}
