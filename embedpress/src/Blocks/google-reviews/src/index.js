/**
 * WordPress dependencies
 */
const { __ } = wp.i18n;
const { registerBlockType } = wp.blocks;

/**
 * Internal dependencies
 */
import Edit from './edit.js';
import metadata from '../block.json';
import attributes from './attributes';
import './editor.scss';

// Block icon — a review chat bubble with a star inside, evoking "rated review"
// rather than a bare star (more distinctive in the inserter + toolbar).
const googleReviewsIcon = wp.element.createElement(
    'svg',
    { xmlns: 'http://www.w3.org/2000/svg', viewBox: '0 0 24 24', width: 24, height: 24 },
    wp.element.createElement('path', {
        fill: '#5b4e96',
        d: 'M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z',
    }),
    wp.element.createElement('path', {
        fill: '#fff',
        d: 'M12 5.2l1.55 3.14 3.45.5-2.5 2.44.59 3.44L12 12.92l-3.09 1.8.59-3.44-2.5-2.44 3.45-.5L12 5.2z',
    })
);

let shouldRegister = false;
if (
    typeof embedpressGutenbergData !== 'undefined' &&
    embedpressGutenbergData.activeBlocks &&
    embedpressGutenbergData.activeBlocks['google-reviews']
) {
    shouldRegister = true;
}

if (shouldRegister) {
    registerBlockType(metadata.name, {
        ...metadata,
        icon: googleReviewsIcon,
        attributes,
        keywords: [
            __('embedpress', 'embedpress'),
            __('google', 'embedpress'),
            __('reviews', 'embedpress'),
            __('places', 'embedpress'),
            __('business', 'embedpress'),
        ],
        edit: Edit,
        // Dynamic block — render handled server-side via PHP render_callback.
        save: () => null,
    });
}
