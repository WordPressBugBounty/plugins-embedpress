/**
 * Google Reviews Block Attributes
 *
 * Single source of truth for this block's attributes — same convention as the
 * other EmbedPress blocks (see src/Blocks/EmbedPress/src/components/attributes.js).
 *
 * EDIT THIS FILE ONLY. The build (vite copyBlockJson step) injects these
 * attributes into block.json so the PHP server side — which can't read JS and
 * has no `src/` in the dist zip — gets the same schema for the block-renderer
 * REST endpoint. Editing block.json's `attributes` by hand will be overwritten
 * on the next build. `align`/`anchor` are derived by WP from block.json
 * `supports`, so they're intentionally not declared here.
 */
const attributes = {
    placeId: { type: 'string', default: '' },
    placeName: { type: 'string', default: '' },
    // Location details (formatted address) for the selected place — shown in the
    // editor's selected chip so users see the location, not just the Place ID.
    placeAddress: { type: 'string', default: '' },
    limit: { type: 'number', default: 10 },
    minRating: { type: 'number', default: 0 },
    layout: { type: 'string', default: 'list' },
    showPhoto: { type: 'boolean', default: true },
    showStars: { type: 'boolean', default: true },
    showDate: { type: 'boolean', default: true },
    showLink: { type: 'boolean', default: false },
    showImages: { type: 'boolean', default: true },

    // Structural layout controls (free). Drive grid/masonry columns, carousel
    // per-view, block max-width cap (px; 0 = unset), and inter-card gap (px).
    columns: { type: 'number', default: 3 },
    maxWidth: { type: 'number', default: 0 },
    gap: { type: 'number', default: 20 },

    // Carousel controls (free).
    showArrows: { type: 'boolean', default: true },
    showDots: { type: 'boolean', default: true },
    carouselLoop: { type: 'boolean', default: true },
    autoplaySpeed: { type: 'number', default: 5 },

    // Header / summary controls (free).
    showSummary: { type: 'boolean', default: true },
    showSummaryName: { type: 'boolean', default: true },
    showSummaryRating: { type: 'boolean', default: true },
    showSummaryStars: { type: 'boolean', default: true },
    showSummaryCount: { type: 'boolean', default: true },
    showWriteReview: { type: 'boolean', default: true },
    summaryAlign: { type: 'string', default: 'left' },

    // Pro-extended attributes. Defined in the free block so they persist and
    // round-trip to the server-side renderer; the Pro plugin's google-reviews.js
    // filter exposes the UI that sets them. Free shows upsell placeholders.
    sort: { type: 'string', default: 'newest' },
    keyword: { type: 'string', default: '' },
    hideEmpty: { type: 'boolean', default: false },
    fetchAll: { type: 'boolean', default: false },
    theme: { type: 'string', default: 'light' },
    accentColor: { type: 'string', default: '' },
    autoplay: { type: 'boolean', default: false },
    schema: { type: 'boolean', default: false },
    places: { type: 'array', default: [] },
    cacheTtl: { type: 'number', default: 0 },
    loadMore: { type: 'boolean', default: true },
    // 0 = use the "Reviews per page" count control (limit) as the page size.
    perPage: { type: 'number', default: 0 },
};

export default attributes;
