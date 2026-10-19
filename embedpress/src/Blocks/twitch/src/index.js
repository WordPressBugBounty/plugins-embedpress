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

/**
 * Import styles - commented out to avoid Vite processing issues
 * Styles are handled separately through the build process
 */
// import "./style.scss";
import { twitchIcon } from "../../GlobalCoponents/icons.js";

// Check if the Twitch block is enabled - use a safer approach
let shouldRegister = false;

if (embedpressGutenbergData && embedpressGutenbergData.activeBlocks && embedpressGutenbergData.activeBlocks['twitch-block']) {
    shouldRegister = true;
}

if (shouldRegister) {
    registerBlockType(metadata.name, {
        ...metadata,
        icon: twitchIcon,
        attributes,
        keywords: [
            __("embedpress", "embedpress"),
            __("twitch", "embedpress"),
            __("stream", "embedpress"),
            __("gaming", "embedpress"),
        ],
        edit: Edit,
        save: Save,
        // Lets posts saved with (Pro) lazy-load placeholders validate either way.
        // save() does not use useBlockProps, so the entries must keep
        // apiVersion 2: as v1 deprecations WordPress would add the generated
        // `wp-block-embedpress-twitch-block` class and they would never match.
        deprecated: lazyLoadDeprecations(Save, { apiVersion: metadata.apiVersion, supports: metadata.supports, attributes: { ...(metadata.attributes || {}), ...attributes } }),
    });
}
