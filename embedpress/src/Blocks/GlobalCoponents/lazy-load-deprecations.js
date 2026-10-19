/**
 * Lazy-load save() hooks + block deprecations.
 *
 * Lazy loading is an EmbedPress Pro feature. Free block save() functions
 * always build plain iframes and hand them to `lazyLoadEmbedHTML()` /
 * `lazyLoadIframe()` below, which only apply the `embedpress.lazyLoadEmbedHTML`
 * / `embedpress.lazyLoadIframe` filters (EmbedPress Pro fills them).
 *
 * Posts saved while Pro was active hold `.ep-lazy-iframe-placeholder` markup.
 * `lazyLoadDeprecations(save)` returns deprecation entries that let the
 * editor RECOGNISE that markup (and the plain form) so those blocks don't show
 * the "unexpected or invalid content" warning:
 *
 *   1. 'placeholder' — the block's save() rendered with the old placeholder
 *      markup. Matches blocks saved with lazy loading on. Without Pro, the
 *      block is migrated and the next save writes the plain iframe.
 *   2. 'plain' — the block's save() rendered with plain iframes. Matches
 *      blocks saved without Pro while `enableLazyLoad` was on, so they still
 *      validate after Pro is activated (Pro's save then writes placeholders).
 *
 * This is markup matching only: nothing here runs at render time on the
 * frontend, and free never loads placeholders into iframes. Neither entry has
 * `isEligible`, so WordPress only consults them when the current save() does
 * NOT match — with Pro active, lazy blocks validate against the current
 * save() and these entries are skipped. Migration keeps the attributes.
 */
const { applyFilters } = wp.hooks;
const { createElement: el } = wp.element;

// null = normal save; 'placeholder' / 'plain' = rendering a deprecation.
let legacyMode = null;

const legacyEmbedHTML = (html, attributes, context) => {
    const { embedHTML, iframeStyle } = context || {};
    if (!attributes.enableLazyLoad || attributes.customPlayer || !embedHTML) {
        return html;
    }
    return embedHTML.replace(
        /<iframe([^>]*)src=["']([^"']+)["']([^>]*)>/gi,
        (match, before, src, after) => `<div class="ep-lazy-iframe-placeholder" data-ep-lazy-src="${src}" data-ep-iframe-style="${iframeStyle}" ${before} ${after} style="${iframeStyle}"></div>`
    );
};

const googlePlaceholder = (iframe, attributes) => {
    const { width, height, unitoption } = attributes;
    const cssWidth = unitoption === '%' ? width + '%' : width + 'px';
    return el('div', {
        className: 'ep-lazy-iframe-placeholder',
        'data-ep-lazy-src': iframe.props.src,
        'data-ep-iframe-style': `width: ${cssWidth}; height: ${height}px; max-width: 100%;`,
        'data-ep-iframe-frameborder': '0',
        'data-ep-iframe-allowfullscreen': 'true',
        'data-ep-iframe-mozallowfullscreen': 'true',
        'data-ep-iframe-webkitallowfullscreen': 'true',
        'data-ep-iframe-title': iframe.props.title,
        style: { width: cssWidth, height: height + 'px', maxWidth: '100%' },
    });
};

const legacyPlaceholders = {
    youtube: (iframe, { width, height }) => el('div', {
        className: 'ep-lazy-iframe-placeholder',
        'data-ep-lazy-src': iframe.props.src,
        'data-ep-iframe-style': 'max-width: 100%; height: 100%;',
        'data-ep-iframe-frameborder': '0',
        'data-ep-iframe-width': width,
        'data-ep-iframe-height': height,
        'data-ep-iframe-allowfullscreen': 'true',
        'data-ep-iframe-title': iframe.props.title,
        style: { maxWidth: '100%', height: '100%' },
    }),
    wistia: (iframe, { width, height }) => el('div', {
        className: 'ep-lazy-iframe-placeholder',
        'data-ep-lazy-src': iframe.props.src,
        'data-ep-iframe-allowtransparency': 'true',
        'data-ep-iframe-frameborder': '0',
        'data-ep-iframe-class': 'wistia_embed',
        'data-ep-iframe-name': 'wistia_embed',
        'data-ep-iframe-width': width,
        'data-ep-iframe-height': height,
        'data-ep-iframe-title': iframe.props.title,
        style: { width: `${width}px`, height: `${height}px`, maxWidth: '100%' },
    }),
    twitch: (iframe, { width, height }) => el('div', {
        className: 'ep-lazy-iframe-placeholder',
        'data-ep-lazy-src': iframe.props.src,
        'data-ep-iframe-frameborder': '0',
        'data-ep-iframe-width': width || 600,
        'data-ep-iframe-height': height || 450,
        'data-ep-iframe-title': iframe.props.title,
        style: { width: (width || 600) + 'px', height: (height || 450) + 'px', maxWidth: '100%' },
    }),
    'google-docs': googlePlaceholder,
    'google-forms': googlePlaceholder,
    'google-maps': googlePlaceholder,
    'google-sheets': googlePlaceholder,
    'google-slides': googlePlaceholder,
};

// Video blocks never lazy-loaded with the custom player on; Google blocks
// had no custom player check.
const honoursCustomPlayer = ['youtube', 'wistia', 'twitch'];

const legacyIframe = (iframe, attributes, blockSlug) => {
    if (!attributes.enableLazyLoad || !legacyPlaceholders[blockSlug]) {
        return iframe;
    }
    if (honoursCustomPlayer.includes(blockSlug) && attributes.customPlayer) {
        return iframe;
    }
    return legacyPlaceholders[blockSlug](iframe, attributes);
};

/**
 * EmbedPress block: the embed HTML string to save.
 */
export const lazyLoadEmbedHTML = (html, attributes, context) => {
    if (legacyMode === 'placeholder') return legacyEmbedHTML(html, attributes || {}, context);
    if (legacyMode === 'plain') return html;
    return applyFilters('embedpress.lazyLoadEmbedHTML', html, attributes, context);
};

/**
 * Static blocks: the element to save in place of the iframe.
 */
export const lazyLoadIframe = (iframe, attributes, blockSlug) => {
    if (legacyMode === 'placeholder') return legacyIframe(iframe, attributes || {}, blockSlug);
    if (legacyMode === 'plain') return iframe;
    return applyFilters('embedpress.lazyLoadIframe', iframe, attributes, blockSlug);
};

const withLegacyMode = (mode, save) => (props) => {
    const previous = legacyMode;
    legacyMode = mode;
    try {
        return save(props);
    } finally {
        legacyMode = previous;
    }
};

/**
 * Deprecation entries for a block save() that goes through the helpers above.
 *
 * @param {Function} save  The save() to render in legacy mode.
 * @param {Object}   extra Extra deprecation keys. Pass `attributes` (the
 *                         block's full schema): WordPress does not let a
 *                         deprecation inherit the block's attributes, and
 *                         without them save() receives `{}`. Deprecations do
 *                         not inherit `apiVersion` / `supports` either: a
 *                         block whose save() root does not use
 *                         useBlockProps.save() (twitch, wistia) must pass
 *                         its `apiVersion`, or WordPress treats the entry as
 *                         v1 and adds the generated `wp-block-*` class.
 * @return {Object[]}
 */
export const lazyLoadDeprecations = (save, extra = {}) => [
    { ...extra, save: withLegacyMode('placeholder', save), migrate: (attributes) => attributes },
    { ...extra, save: withLegacyMode('plain', save), migrate: (attributes) => attributes },
];
