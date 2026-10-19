/**
 * EmbedPress Google Reviews — block editor UI
 *
 * Picker calls /embedpress/v1/google-reviews/search to autocomplete businesses
 * (API key stays on the server). Preview is the canonical server-side render
 * via wp.serverSideRender, keyed off block attributes, so editor and frontend
 * always match byte-for-byte.
 */
const { __, sprintf } = wp.i18n;
const { useState, useEffect, useRef } = wp.element;
const { applyFilters } = wp.hooks;
const { useBlockProps, InspectorControls, BlockControls } = wp.blockEditor;
const {
    PanelBody,
    SelectControl,
    ToggleControl,
    TextControl,
    RangeControl,
    Notice,
    Placeholder,
    Button,
    ToolbarGroup,
    ToolbarButton,
    ExternalLink,
} = wp.components;
const ServerSideRender = wp.serverSideRender;
const apiFetch = wp.apiFetch;
const { ColorPalette, BaseControl } = wp.components;

import { isPro, removeAlert } from '../../GlobalCoponents/helper';
import Upgrade from '../../GlobalCoponents/upgrade';

/**
 * Pro-active detection — the canonical EmbedPress flag, localized in
 * Core/LocalizationManager.php (`isProPluginActive` ⇢ defined EMBEDPRESS_SL_ITEM_SLUG).
 * Every other EmbedPress block reads this same global, so Google Reviews now
 * matches them instead of probing a sentinel through applyFilters.
 */
const isProPluginActive =
    typeof embedpressGutenbergData !== 'undefined' && !!embedpressGutenbergData.isProPluginActive;

// When the EmbedPress API is connected a place can hold many more than Google's
// 5-review API cap, so the "Reviews per page" ceiling lifts to 50. Otherwise the
// free ceiling is 10. The localized flag name is kept for back-compat; it now
// reflects the managed EmbedPress API connection (see LocalizationManager).
const apifyConnected =
    typeof embedpressGutenbergData !== 'undefined' && !!embedpressGutenbergData.googleReviewsApifyConnected;
const REVIEWS_PER_PAGE_MAX = apifyConnected ? 50 : 10;

// Mask an opaque Place ID license-key style for display: first/last few chars
// with asterisks in between (e.g. "ChIJN1t***********K3Fg"). Mirrors maskId() in
// src/AdminUI/GoogleReviews.jsx. Short IDs are returned unchanged.
const maskId = (id) => {
    const s = String(id || '');
    if (s.length <= 12) return s;
    return `${s.slice(0, 6)}${'*'.repeat(11)}${s.slice(-6)}`;
};

/**
 * Parse a manual place input into a handle the store/worker can use. Accepts:
 *   - a raw Place ID            → ChIJ… / GhIJ… / a `/g/…` feature ID
 *   - `places/ChIJ…`            → ChIJ…
 *   - a full Google Maps URL    → extract, in priority order:
 *       1. `?q=place_id:<id>`              (explicit place_id)
 *       2. `!16s%2Fg%2F<feature>`          (feature ID → `/g/<feature>`)
 *       3. `!1s0x<hex>:0x<hex>` in /data=  (CID pair → `cid:0x…:0x…`)
 * Returns the handle string, or '' if nothing usable was found. This lets users
 * add places that Google's Places API search/Details can't surface (new or
 * unverified listings that appear on Maps but 404 on the API) by pasting the
 * Maps link — the EmbedPress worker scrapes Maps directly from the handle.
 */
const parsePlaceInput = (input) => {
    const raw = (input || '').trim();
    if (!raw) return '';

    // Not a URL → treat as a bare ID (place_id, places/<id>, or /g/<feature>).
    if (!/^https?:\/\//i.test(raw)) {
        const idy = raw.replace(/^places\//, '');
        // `/g/11ms07zf05` feature-id form, or a normal place_id token.
        if (/^\/g\/[A-Za-z0-9]+$/.test(idy)) return idy;
        if (/^[A-Za-z0-9_-]{10,}$/.test(idy)) return idy;
        return '';
    }

    // URL form. Priority:
    //   1. explicit `?q=place_id:<id>` — an API-grade place_id when present.
    //   2. CID pair `!1s0x<hex>:0x<hex>` from /data= — the MOST reliable handle
    //      on consumer Maps (renders even when the API doesn't index the place),
    //      so prefer it over the `/g/…` feature id.
    //   3. `/g/<feature>` feature id (`!16s%2Fg%2F…` or plain) as a last resort.
    let m = raw.match(/[?&]q=place_id:([A-Za-z0-9_-]+)/);
    if (m) return m[1];

    m = raw.match(/!1s(0x[0-9a-f]+:0x[0-9a-f]+)/i);
    if (m) return 'cid:' + m[1];

    m = raw.match(/!16s(%2F|\/)g(%2F|\/)([A-Za-z0-9]+)/i);
    if (m) return '/g/' + m[3];
    m = raw.match(/\/g\/([A-Za-z0-9]+)/);
    if (m) return '/g/' + m[1];

    return '';
};

// Map-pin marker shown before each place suggestion (disambiguates the result
// as a location, mirroring Google's own picker).
const PinIcon = () => (
    <svg className="ep-gr-suggestion-pin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
        <circle cx="12" cy="10" r="3" />
    </svg>
);

/**
 * Rating + review-count line for a search suggestion. Shared shape across the
 * block + admin pickers: ★ 4.5 · 1,167 reviews.
 *
 * Four states, and conflating any of them misleads the user:
 *
 *   count > 0   → ★ 4.5 · 1,167 reviews
 *   count === 0 → ★ 0.0 · No reviews yet   (Google says the place is empty)
 *   count null, lookup in flight → skeleton bar
 *   count null, lookup finished  → Reviews unavailable
 *
 * Counts never arrive with the suggestions: Autocomplete returns names only,
 * so they are fetched separately (see hydrateCounts) and every row starts
 * without one. Showing "Reviews unavailable" during that window would label a
 * place with thousands of reviews as having none, so the pending state gets a
 * skeleton and the failed label is reserved for a lookup that actually
 * finished empty.
 */
const SuggestionMeta = ({ rating, count, loading }) => {
    if (count == null && rating == null) {
        if (loading) {
            return (
                <span className="ep-gr-suggestion-meta ep-gr-suggestion-meta--loading" aria-hidden="true">
                    <span className="ep-gr-suggestion-skeleton" />
                </span>
            );
        }
        return (
            <span className="ep-gr-suggestion-meta ep-gr-suggestion-meta--unknown">
                <span className="ep-gr-suggestion-count">{__('Reviews unavailable', 'embedpress')}</span>
            </span>
        );
    }

    const isEmpty = count === 0;

    return (
        <span className="ep-gr-suggestion-meta">
            {/* An empty place has no rating to show, so render 0.0 rather than
                dropping the star and leaving the row visually ragged. */}
            {(rating != null || isEmpty) && (
                <span className="ep-gr-suggestion-rating">
                    <span className="ep-gr-suggestion-star" aria-hidden="true">★</span>
                    {Number(rating || 0).toFixed(1)}
                </span>
            )}
            {count != null && (
                <span className="ep-gr-suggestion-count">
                    {isEmpty
                        ? __('No reviews yet', 'embedpress')
                        : `${Number(count).toLocaleString()} ${count === 1 ? __('review', 'embedpress') : __('reviews', 'embedpress')}`}
                </span>
            )}
        </span>
    );
};

/**
 * Show the shared "upgrade to Pro" modal — the same modal the PDF / Custom
 * Player / Branding controls use. Mounted lazily on first locked-control click.
 */
const showProAlert = (e) => {
    if (isProPluginActive) return;
    let alertWrap = document.querySelector('.pro__alert__wrap');
    if (!alertWrap) {
        document.querySelector('body').append(isPro('none'));
        removeAlert();
        alertWrap = document.querySelector('.pro__alert__wrap');
    }
    if (alertWrap) {
        alertWrap.style.display = 'block';
    }
};

const ACCENT_COLORS = [
    { name: 'EmbedPress', color: '#5b4e96' },
    { name: 'Google Blue', color: '#4285f4' },
    { name: 'Green', color: '#34a853' },
    { name: 'Amber', color: '#fbbc05' },
    { name: 'Red', color: '#ea4335' },
    { name: 'Slate', color: '#334155' },
];

// Session-token UUID — reused across every keystroke of one picking session so
// Google Places bills the whole sequence as 1 event, not N. Mirrors the admin
// picker in src/AdminUI/GoogleReviews.jsx, which has always sent one; the block
// picker did not, so its searches were billed per keystroke AND routed to the
// proxy's text-search path, which matches resolvable place names rather than
// prefixes — that is what made single-keyword searches ("cricket", "coffee")
// return nothing. See fbs-84184.
const newSessionToken = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
};
const SESSION_TOKEN_TTL_MS = 5 * 60 * 1000;

const SEARCH_PATH = '/embedpress/v1/google-reviews/search';
const COUNTS_PATH = '/embedpress/v1/google-reviews/place-counts';
const PLACES_PATH = '/embedpress/v1/google-reviews/places';
const STATUS_PATH = '/embedpress/v1/google-reviews/status';
const CONNECT_PATH = '/embedpress/v1/google-reviews/managed/connect';
const PRIVACY_URL = 'https://wpdeveloper.com/privacy-policy';

// Deep link to the Google Reviews settings page (where the explicit "Refetch"
// pulls more than the quick preview). Resolved from the localized admin URL.
const GR_SETTINGS_URL =
    ((typeof embedpressGutenbergData !== 'undefined' && embedpressGutenbergData.adminUrl) || '/wp-admin/') +
    'admin.php?page=embedpress-google-reviews';

/**
 * Polls the per-place fetch status while a background Apify job runs, so the
 * block can show a live progress bar and re-render when the full set lands.
 * Returns { status, fetchedSoFar, reviewCount, message, done }.
 */
const useFetchProgress = (placeId) => {
    const [state, setState] = useState({ status: 'idle', fetchedSoFar: 0, reviewCount: 0, message: null });
    const timerRef = useRef(null);

    useEffect(() => {
        clearTimeout(timerRef.current);
        if (!placeId) {
            setState({ status: 'idle', fetchedSoFar: 0, reviewCount: 0, message: null });
            return undefined;
        }
        let cancelled = false;
        const poll = () => {
            apiFetch({ path: `${STATUS_PATH}?place_id=${encodeURIComponent(placeId)}` })
                .then((res) => {
                    if (cancelled) return;
                    setState({
                        status: res.fetch_status || 'idle',
                        fetchedSoFar: res.fetched_so_far || 0,
                        reviewCount: res.review_count || 0,
                        message: res.fetch_message || null,
                    });
                    // Keep polling while the background job is active.
                    if (res.fetch_status === 'running' || res.fetch_status === 'queued') {
                        timerRef.current = setTimeout(poll, 4000);
                    }
                })
                .catch(() => {
                    if (!cancelled) timerRef.current = setTimeout(poll, 8000);
                });
        };
        poll();
        return () => { cancelled = true; clearTimeout(timerRef.current); };
    }, [placeId]);

    const running = state.status === 'running' || state.status === 'queued';
    return { ...state, running, done: state.status === 'done' };
};

const PlacePicker = ({ selected, onSelect, onClear }) => {
    const [q, setQ] = useState('');
    const [predictions, setPredictions] = useState([]);
    const [searching, setSearching] = useState(false);
    const [noResults, setNoResults] = useState(false);
    const [error, setError] = useState(null);
    const [saved, setSaved] = useState([]); // the global places library (DB-backed)
    // Adding a place writes to the SITE-WIDE library, so /google-reviews/places
    // is gated on manage_options at both verbs. Read the capability up front:
    // search and preview are open to Authors/Editors, so without this the
    // picker would happily search, offer "+ Select", then 403 on commit with
    // nothing on screen to explain why the block stayed empty.
    const canManagePlaces =
        typeof embedpressGutenbergData === 'undefined' ||
        !!embedpressGutenbergData.canManageGoogleReviewPlaces;
    const [manualOpen, setManualOpen] = useState(false);
    const [manualVal, setManualVal] = useState('');
    // Whether the site is connected to the EmbedPress API. Search needs it (the
    // managed proxy); when not connected we block search + prompt to connect.
    // null = not yet checked (don't flash the prompt while loading).
    const [apiConnected, setApiConnected] = useState(null);
    const [consentBusy, setConsentBusy] = useState(false);
    // Bumped after an explicit connect so the search effect re-runs the query.
    const [searchNonce, setSearchNonce] = useState(0);
    const debounceRef = useRef(null);
    // Newest counts request wins — see hydrateCounts().
    const countsSeqRef = useRef(0);
    // True while the follow-up count lookup is in flight, so rows show a
    // skeleton instead of claiming the reviews are unavailable.
    const [countsLoading, setCountsLoading] = useState(false);

    // Lazily-created session token, reused across keystrokes of the same
    // picking session. Refresh on idle or when the user picks.
    const sessionRef = useRef({ token: '', mintedAt: 0 });
    const getSession = () => {
        const now = Date.now();
        if (!sessionRef.current.token || now - sessionRef.current.mintedAt > SESSION_TOKEN_TTL_MS) {
            sessionRef.current = { token: newSessionToken(), mintedAt: now };
        }
        return sessionRef.current.token;
    };
    const endSession = () => { sessionRef.current = { token: '', mintedAt: 0 }; };

    // Mirror the settings-page picker flow: know which places are already in the
    // global library, so search results show "+ Select" / "already added".
    const savedIds = new Set(saved.map((p) => p.place_id));

    // Reading the library is admin-only too, so a non-admin simply has no saved
    // list to show. That is expected, not an error — stay silent and let the
    // capability-aware UI below do the explaining.
    const loadSaved = () => {
        if (!canManagePlaces) return;
        apiFetch({ path: PLACES_PATH })
            .then((res) => setSaved((res && res.places) || []))
            .catch(() => { });
    };

    useEffect(() => { loadSaved(); }, []);

    // Fill in ★/reviews after the suggestion list has already rendered.
    //
    // Google's Autocomplete returns names only — no Places tier carries a
    // rating inside a prediction — so counts need a per-place lookup. Doing it
    // here rather than inside /search keeps the list instant: results appear
    // immediately, the numbers arrive a moment later.
    //
    // countsSeqRef guards against a fast typist: only the newest request may
    // write, so a slow response for "Mirp" can't overwrite the list for
    // "Mirpur 10". Rows show a skeleton until this resolves; failures are
    // silent and fall back to the neutral "Reviews unavailable" label rather
    // than breaking a list that rendered fine.
    const hydrateCounts = (list) => {
        const ids = (list || []).map((p) => p.place_id).filter(Boolean);
        if (!ids.length) return;

        const seq = ++countsSeqRef.current;
        setCountsLoading(true);
        apiFetch({ path: `${COUNTS_PATH}?place_ids=${encodeURIComponent(ids.join(','))}` })
            .then((res) => {
                if (seq !== countsSeqRef.current) return;
                setCountsLoading(false);
                const counts = (res && res.counts) || {};
                if (!Object.keys(counts).length) return;
                setPredictions((prev) =>
                    prev.map((p) => {
                        const c = counts[p.place_id];
                        if (!c) return p;
                        return {
                            ...p,
                            rating: c.rating != null ? c.rating : p.rating,
                            review_count: c.review_count != null ? c.review_count : p.review_count,
                        };
                    })
                );
            })
            .catch(() => {
                if (seq === countsSeqRef.current) setCountsLoading(false);
            });
    };

    useEffect(() => {
        clearTimeout(debounceRef.current);
        setError(null);
        // Min 3 chars + a longer debounce: place search can run through Apify,
        // where every query is a slow (~live scrape) and BILLED actor run, so we
        // wait until the user has clearly stopped typing before firing.
        if (q.trim().length < 3) {
            setPredictions([]);
            setNoResults(false);
            return;
        }
        setSearching(true);
        debounceRef.current = setTimeout(() => {
            apiFetch({ path: `${SEARCH_PATH}?q=${encodeURIComponent(q.trim())}&session_token=${encodeURIComponent(getSession())}` })
                .then((res) => {
                    setSearching(false);
                    setError(null);
                    const list = (res && res.predictions) || [];
                    setPredictions(list);
                    setNoResults(list.length === 0);
                    hydrateCounts(list);
                })
                .catch((err) => {
                    setSearching(false);
                    setPredictions([]);
                    setNoResults(false);
                    // Backend refuses search when not connected to the EmbedPress
                    // API — surface a clear connect prompt instead of a raw error.
                    if (err && err.code === 'embedpress_gr_not_connected') {
                        setApiConnected(false);
                        setError(__('Place search uses the EmbedPress API. Connecting sends your site URL, a one-way install fingerprint and your EmbedPress/WordPress versions to api.embedpress.com; searches then send the text you type.', 'embedpress'));
                        return;
                    }
                    setApiConnected(true);
                    setError((err && (err.message || err.code)) || __('Search failed.', 'embedpress'));
                });
        }, 800);
        return () => clearTimeout(debounceRef.current);
    }, [q, searchNonce]);

    // Explicit consent: the site only connects to api.embedpress.com when an
    // admin clicks this button next to the disclosure.
    const connectApi = () => {
        setConsentBusy(true);
        apiFetch({ path: CONNECT_PATH, method: 'POST' })
            .then((res) => {
                setConsentBusy(false);
                if (res && res.connected) {
                    setApiConnected(true);
                    setError(null);
                    setSearchNonce((n) => n + 1);
                }
            })
            .catch((err) => {
                setConsentBusy(false);
                setError((err && err.message) || __('Couldn’t connect. Try again.', 'embedpress'));
            });
    };

    // Add a place to the global library (lookup-first server-side: no dup, no
    // re-fetch if already saved), then select it for this block.
    const commitPick = (place_id, place_name, place_address = '', meta = {}) => {
        onSelect({ place_id, main_text: place_name, description: place_name, secondary_text: place_address });
        endSession(); // user picked — close out the billing session
        const data = { action: 'add', place_id, place_name: place_name || '', place_address: place_address || '' };
        // Forward the search result's review total + rating. The server seeds
        // them so the card shows real numbers immediately AND — crucially — can
        // SKIP a full Chrome scrape when the count is 0 (a place we already know
        // is empty). Only include when the count is known (search results carry
        // it; the manual "paste a Place ID" path does not), so an unknown place
        // still scrapes normally.
        if (typeof meta.review_count === 'number' && meta.review_count >= 0) {
            data.total = meta.review_count;
        }
        if (typeof meta.rating === 'number' && meta.rating > 0) {
            data.rating = meta.rating;
        }
        apiFetch({
            path: PLACES_PATH,
            method: 'POST',
            data,
        })
            .then((res) => {
                setError(null);
                setSaved((res && res.places) || []);
            })
            .catch((err) => {
                // NEVER swallow this. The add is what puts the place in the
                // site-wide library; if it fails the block renders nothing, so
                // a silent catch leaves the user staring at an empty block with
                // no idea why. 403 is the expected non-admin case and gets a
                // specific message; anything else surfaces its own reason.
                const code = (err && err.code) || '';
                const status = (err && err.data && err.data.status) || 0;
                if (status === 403 || code === 'rest_forbidden') {
                    onClear && onClear();
                    setError(
                        __(
                            'Adding a place changes the Google Reviews library for the whole site, so it needs an administrator. Ask one to add this place — you can then select it here.',
                            'embedpress'
                        )
                    );
                    return;
                }
                setError(
                    (err && (err.message || err.code)) ||
                    __('That place could not be added. Please try again.', 'embedpress')
                );
            });
    };

    const applyManual = () => {
        const parsed = parsePlaceInput(manualVal);
        if (!parsed) {
            setError(__('Paste a Google Place ID or a Google Maps link for the place.', 'embedpress'));
            return;
        }
        commitPick(parsed, '');
        setManualVal('');
        setManualOpen(false);
    };

    if (selected && selected.place_id) {
        const placeName = selected.place_name || selected.main_text || '';
        // Location details (address) saved with the place. Prefer showing the
        // human-readable address; fall back to the raw Place ID only when no
        // address was captured (e.g. added by raw ID / Maps link).
        const placeAddress = selected.place_address || selected.secondary_text || '';
        return (
            <div className="ep-gr-block-selected">
                <span className="ep-gr-block-selected-pin" aria-hidden="true">
                    {wp.element.createElement(
                        'svg',
                        { viewBox: '0 0 24 24', width: 18, height: 18, fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' },
                        wp.element.createElement('path', { d: 'M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z' }),
                        wp.element.createElement('circle', { cx: 12, cy: 10, r: 3 })
                    )}
                </span>
                <div className="ep-gr-block-selected-info">
                    <strong className="ep-gr-block-selected-name" title={placeName || selected.place_id}>
                        {placeName || __('Selected place', 'embedpress')}
                    </strong>
                    {placeAddress ? (
                        <span className="ep-gr-block-selected-address" title={placeAddress}>
                            {placeAddress}
                        </span>
                    ) : (
                        <span className="ep-gr-block-selected-id" title={selected.place_id}>
                            {maskId(selected.place_id)}
                        </span>
                    )}
                </div>
                <Button variant="tertiary" className="ep-gr-block-selected-change" onClick={onClear}>
                    {__('Change', 'embedpress')}
                </Button>
            </div>
        );
    }

    const renderSavedRow = (p) => {
        return (
            <li key={`saved-${p.place_id}`}>
                <button
                    type="button"
                    className="ep-gr-block-list-pick"
                    onClick={() => {
                        commitPick(p.place_id, p.place_name || '', p.address || '', { review_count: p.review_count, rating: p.rating });
                    }}
                >
                    <PinIcon />
                    <span className="ep-gr-block-list-pick-body">
                        <strong>{p.place_name || maskId(p.place_id)}</strong>
                        {/* Location description (address) — saved with the place. */}
                        {p.address && <span>{p.address}</span>}
                    </span>
                </button>
            </li>
        );
    };

    return (
        <div className="ep-gr-block-picker">
            {!canManagePlaces && (
                <Notice status="warning" isDismissible={false}>
                    {__(
                        'Places are shared across the whole site, so only an administrator can add one. You can still search below to find the place, then ask an administrator to add it.',
                        'embedpress'
                    )}
                </Notice>
            )}
            <div className="ep-gr-block-search">
                <TextControl
                    label={__('Search for a place', 'embedpress')}
                    value={q}
                    onChange={setQ}
                    placeholder={__('e.g. Sydney Opera House', 'embedpress')}
                    __nextHasNoMarginBottom
                />
                {searching && <p className="ep-gr-block-status">{__('Searching…', 'embedpress')}</p>}
                {!searching && predictions.length > 0 && (
                    <div className="ep-gr-suggestions-panel">
                        <ul className="ep-gr-suggestions">
                            {predictions.map((p) => {
                                const already = savedIds.has(p.place_id);
                                // A non-admin cannot write to the shared library at
                                // all. Keep the row visible (finding the place is
                                // still useful) but inert, so the click can't fail
                                // silently against a 403.
                                const noPermission = !canManagePlaces && !already;
                                return (
                                    <li key={p.place_id}>
                                        <button
                                            type="button"
                                            className={`ep-gr-suggestion${noPermission ? ' is-locked' : ''}`}
                                            aria-disabled={noPermission || undefined}
                                            title={
                                                noPermission
                                                    ? __('Only an administrator can add a place to this site.', 'embedpress')
                                                    : undefined
                                            }
                                            onClick={(e) => {
                                                if (noPermission) {
                                                    e.preventDefault();
                                                    setError(
                                                        __(
                                                            'Adding a place changes the Google Reviews library for the whole site, so it needs an administrator. Ask one to add this place — you can then select it here.',
                                                            'embedpress'
                                                        )
                                                    );
                                                    return;
                                                }
                                                commitPick(p.place_id, p.main_text || p.description || '', p.secondary_text || '', { review_count: p.review_count, rating: p.rating });
                                            }}
                                        >
                                            <PinIcon />
                                            <span className="ep-gr-suggestion-body">
                                                <strong>{p.main_text || p.description}</strong>
                                                {p.secondary_text && <span>{p.secondary_text}</span>}
                                                <SuggestionMeta rating={p.rating} count={p.review_count} loading={countsLoading} />
                                                {already ? (
                                                    <em className="ep-gr-already">{__('already added', 'embedpress')}</em>
                                                ) : (
                                                    <em className="ep-gr-suggestion-add">+ {__('Select', 'embedpress')}</em>
                                                )}
                                            </span>
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                )}
                {!searching && noResults && !error && q.trim().length >= 2 && (
                    <Notice status="info" isDismissible={false}>
                        {__('No matches. Try a different spelling or include the city.', 'embedpress')}
                    </Notice>
                )}
                {error && (
                    <Notice status={apiConnected === false ? 'warning' : 'error'} isDismissible={false}>
                        {apiConnected === false ? (
                            <>
                                {error}{' '}
                                <ExternalLink href={PRIVACY_URL}>{__('Privacy policy', 'embedpress')}</ExternalLink>
                                <div style={{ marginTop: 8 }}>
                                    {canManagePlaces ? (
                                        <Button variant="primary" isBusy={consentBusy} disabled={consentBusy} onClick={connectApi}>
                                            {consentBusy ? __('Connecting…', 'embedpress') : __('Connect to EmbedPress API', 'embedpress')}
                                        </Button>
                                    ) : (
                                        __('Ask a site administrator to connect the EmbedPress API.', 'embedpress')
                                    )}
                                </div>
                            </>
                        ) : (
                            <>
                                <strong>{__('Search failed:', 'embedpress')}</strong> {error}
                                {/missing|api[_ ]?key|not configured/i.test(error) && (
                                    <>
                                        {' '}
                                        <a
                                            href="admin.php?page=embedpress-google-reviews"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                        >
                                            {__('Open settings to add your API key →', 'embedpress')}
                                        </a>
                                    </>
                                )}
                            </>
                        )}
                    </Notice>
                )}
            </div>

            {q.trim().length < 2 && saved.length > 0 && (
                <div className="ep-gr-block-lists">
                    <div className="ep-gr-block-list">
                        <div className="ep-gr-block-list-heading">{__('Saved places', 'embedpress')}</div>
                        <ul>{saved.map((p) => renderSavedRow(p))}</ul>
                    </div>
                </div>
            )}

            <div className="ep-gr-block-manual">
                <Button
                    isLink
                    onClick={() => setManualOpen(!manualOpen)}
                    aria-expanded={manualOpen}
                >
                    {__('Have a Place ID? Enter manually', 'embedpress')}
                </Button>
                {manualOpen && (
                    <div className="ep-gr-block-manual-row">
                        <TextControl
                            value={manualVal}
                            onChange={setManualVal}
                            placeholder={__('ChIJ… or https://maps.google.com/…', 'embedpress')}
                            help={__('Useful for new or unverified businesses that don’t show in search yet.', 'embedpress')}
                            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); applyManual(); } }}
                            __nextHasNoMarginBottom
                        />
                        <Button variant="primary" onClick={applyManual}>{__('Use', 'embedpress')}</Button>
                    </div>
                )}
            </div>
        </div>
    );
};

/* ── Per-layout icons + tile picker ──────────────────────────────────────── */
const el = wp.element.createElement;
const svg = (children) =>
    el('svg', { viewBox: '0 0 24 24', width: 22, height: 22, fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' }, children);

// One small line-icon per layout value. Pro values are included so they show
// when Pro injects them; anything unmapped falls back to LAYOUT_ICON_FALLBACK.
const LAYOUT_ICONS = {
    list: svg([el('line', { key: 1, x1: 4, y1: 7, x2: 20, y2: 7 }), el('line', { key: 2, x1: 4, y1: 12, x2: 20, y2: 12 }), el('line', { key: 3, x1: 4, y1: 17, x2: 20, y2: 17 })]),
    grid: svg([el('rect', { key: 1, x: 4, y: 4, width: 7, height: 7 }), el('rect', { key: 2, x: 13, y: 4, width: 7, height: 7 }), el('rect', { key: 3, x: 4, y: 13, width: 7, height: 7 }), el('rect', { key: 4, x: 13, y: 13, width: 7, height: 7 })]),
    card: svg([el('rect', { key: 1, x: 3, y: 5, width: 8, height: 14, rx: 1.5 }), el('rect', { key: 2, x: 13, y: 5, width: 8, height: 14, rx: 1.5 })]),
    carousel: svg([el('rect', { key: 1, x: 7, y: 6, width: 10, height: 12, rx: 1.5 }), el('polyline', { key: 2, points: '4 9 2 12 4 15' }), el('polyline', { key: 3, points: '20 9 22 12 20 15' })]),
    masonry: svg([el('rect', { key: 1, x: 4, y: 4, width: 7, height: 9 }), el('rect', { key: 2, x: 13, y: 4, width: 7, height: 5 }), el('rect', { key: 3, x: 4, y: 15, width: 7, height: 5 }), el('rect', { key: 4, x: 13, y: 11, width: 7, height: 9 })]),
    badge: svg([el('rect', { key: 1, x: 3, y: 9, width: 18, height: 6, rx: 3 }), el('circle', { key: 2, cx: 7, cy: 12, r: 1.4, fill: 'currentColor', stroke: 'none' })]),
    spotlight: svg([el('rect', { key: 1, x: 6, y: 6, width: 12, height: 12, rx: 1.5 }), el('line', { key: 2, x1: 9, y1: 21, x2: 15, y2: 21 })]),
    knowledge: svg([el('rect', { key: 1, x: 4, y: 4, width: 16, height: 16, rx: 2 }), el('line', { key: 2, x1: 8, y1: 9, x2: 16, y2: 9 }), el('line', { key: 3, x1: 8, y1: 13, x2: 13, y2: 13 })]),
    marquee: svg([el('rect', { key: 1, x: 5, y: 8, width: 6, height: 8, rx: 1 }), el('rect', { key: 2, x: 13, y: 8, width: 6, height: 8, rx: 1 }), el('polyline', { key: 3, points: '21 10 23 12 21 14' }), el('polyline', { key: 4, points: '3 10 1 12 3 14' })]),
    bubble: svg([el('path', { key: 1, d: 'M4 5h16v9H9l-4 4v-4H4z' })]),
};
const LAYOUT_ICON_FALLBACK = svg([el('rect', { key: 1, x: 4, y: 4, width: 16, height: 16, rx: 2 })]);

const crownTile = () =>
    el('svg', { className: 'ep-gr-tile-crown', viewBox: '0 0 24 24', width: 13, height: 13, 'aria-hidden': 'true' },
        el('path', { fill: '#f0b849', d: 'M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm0 2h14v2H5v-2z' }));

// Wrap Pro-only controls so free users SEE them, greyed + non-interactive, with
// a small "pro" pill in the corner — clicking opens the shared EmbedPress upgrade
// modal. This is the EXACT canonical primitive the PDF / Custom Player / Branding
// blocks use: a bare `pro-control` div (its `:after` overlay blocks interaction
// and greys the control) + the `isPro` badge. No bespoke frame/heading. When Pro
// is active, children render as ordinary, fully-interactive controls.
const ProLock = ({ locked, children }) =>
    locked
        ? el('div', { className: 'pro-control', onClick: showProAlert },
            children,
            el('span', { className: 'isPro' }, __('pro', 'embedpress')))
        : children;

// A tile is disabled when its layout is Pro-only and Pro is not active. Disabled
// tiles render greyed with a crown badge (so free users SEE the Pro layouts) and
// can't be selected — matching the EmbedPress Pro-placeholder convention.
const LayoutPicker = ({ value, options, onChange }) =>
    el(
        'div',
        { className: 'ep-gr-layout-picker' },
        options.map((opt) => {
            const locked = !!opt.disabled;
            return el(
                'button',
                {
                    key: opt.value,
                    type: 'button',
                    className: 'ep-gr-layout-tile'
                        + (opt.value === value ? ' is-active' : '')
                        + (locked ? ' is-locked' : ''),
                    'aria-pressed': opt.value === value,
                    'aria-disabled': locked ? 'true' : undefined,
                    disabled: locked,
                    title: locked ? opt.label + ' — ' + __('Pro', 'embedpress') : opt.label,
                    onClick: () => { if (!locked) onChange(opt.value); },
                },
                locked ? crownTile() : null,
                el('span', { className: 'ep-gr-layout-tile-icon' }, LAYOUT_ICONS[opt.value] || LAYOUT_ICON_FALLBACK),
                el('span', { className: 'ep-gr-layout-tile-label' }, opt.label)
            );
        })
    );

// Canonical layout list. `pro: true` layouts come from EmbedPress Pro — shown in
// the picker as disabled+crown tiles for free users so they can see what Pro adds.
const ALL_LAYOUTS = [
    { label: 'List', value: 'list' },
    { label: 'Grid', value: 'grid' },
    { label: 'Card', value: 'card' },
    { label: 'Carousel', value: 'carousel' },
    { label: 'Masonry', value: 'masonry', pro: true },
    { label: 'Compact badge', value: 'badge', pro: true },
    { label: 'Spotlight', value: 'spotlight', pro: true },
    { label: 'Knowledge panel', value: 'knowledge', pro: true },
    { label: 'Marquee', value: 'marquee', pro: true },
    { label: 'Bubble', value: 'bubble', pro: true },
];

// ── Per-layout capability matrix — THE single source of truth for which
// controls each layout supports. Both the Elementor widget (PHP) and the
// server-side renderer mirror this exact table, so the editor, the other
// builder, and the output can never drift. Each flag:
//   reviews   — renders a per-review LIST. FALSE for summary-only layouts
//               (badge, knowledge) which show ONLY the header — for those,
//               Review Elements / Filtering / Min rating / Load more / Columns
//               are all meaningless and hidden.
//   header    — 'optional' (a "Show header" toggle) or 'forced' (header IS the
//               whole widget; no toggle, always on — badge, knowledge).
//   columns   — multi-column / slides-per-view count
//   gap       — spacing between cards (control-driven; badge hardcodes its own)
//   maxWidth  — wrapper width cap (universal — every layout)
//   slider    — arrows + dots + infinite loop (carousel only; spotlight builds
//               its own nav in JS, so its toggles are hidden)
//   autoplay  — auto-advance toggle (+ speed): carousel, spotlight
//   speed     — a standalone scroll-speed control (marquee)
//   loadMore  — "Load more" pagination (stacked, review-list layouts only)
//   images    — per-review attached images (off for compact/sliding layouts)
// Keep this matrix identical to LAYOUT_CAPS in GoogleReviewsRenderer.php.
// writeReview: false → the "Write a review" toggle is hidden (badge + knowledge
// are compact summaries where the button isn't shown; QA #4).
const LAYOUT_CAPS = {
    list: { reviews: true, header: 'optional', columns: false, gap: false, maxWidth: true, slider: false, autoplay: false, speed: false, loadMore: true, images: true, writeReview: true },
    grid: { reviews: true, header: 'optional', columns: true, gap: true, maxWidth: true, slider: false, autoplay: false, speed: false, loadMore: true, images: true, writeReview: true },
    card: { reviews: true, header: 'optional', columns: true, gap: true, maxWidth: true, slider: false, autoplay: false, speed: false, loadMore: true, images: true, writeReview: true },
    carousel: { reviews: true, header: 'optional', columns: true, gap: true, maxWidth: true, slider: true, autoplay: true, speed: false, loadMore: false, images: false, writeReview: true },
    masonry: { reviews: true, header: 'optional', columns: true, gap: true, maxWidth: true, slider: false, autoplay: false, speed: false, loadMore: true, images: true, writeReview: true },
    badge: { reviews: false, header: 'forced', columns: false, gap: false, maxWidth: true, slider: false, autoplay: false, speed: false, loadMore: false, images: false, writeReview: false },
    spotlight: { reviews: true, header: 'optional', columns: false, gap: false, maxWidth: true, slider: false, autoplay: true, speed: false, loadMore: false, images: true, writeReview: true },
    knowledge: { reviews: false, header: 'forced', columns: false, gap: false, maxWidth: true, slider: false, autoplay: false, speed: false, loadMore: false, images: false, writeReview: false },
    marquee: { reviews: true, header: 'optional', columns: true, gap: true, maxWidth: true, slider: false, autoplay: false, speed: true, loadMore: false, images: false, writeReview: true },
    bubble: { reviews: true, header: 'optional', columns: true, gap: true, maxWidth: true, slider: false, autoplay: false, speed: false, loadMore: true, images: true, writeReview: true },
};
const layoutCaps = (layout) => LAYOUT_CAPS[layout] || LAYOUT_CAPS.list;
// Layouts that use "columns" as a slides-per-view count rather than a true grid
// column count — drives the dynamic "Columns" vs "Slides per view" label.
const SLIDES_PER_VIEW_LAYOUTS = ['carousel', 'marquee'];

const Edit = (props) => {
    const { attributes, setAttributes } = props;
    const {
        placeId,
        placeName,
        placeAddress,
        limit,
        minRating,
        layout,
        showPhoto,
        showStars,
        showDate,
        showLink,
        showImages,
        columns,
        maxWidth,
        gap,
        showArrows,
        showDots,
        carouselLoop,
        autoplay,
        autoplaySpeed,
        showSummary,
        showSummaryName,
        showSummaryRating,
        showSummaryStars,
        showSummaryCount,
        showWriteReview,
        summaryAlign,
        // Pro-extended attributes — controls live here in free (rendered locked);
        // the Pro plugin only unlocks them. See Google_Reviews_Pro.php for the
        // server-side behaviour each one drives.
        sort,
        keyword,
        hideEmpty,
        loadMore,
        theme,
        accentColor,
        schema,
        places = [],
        cacheTtl,
    } = attributes;

    const blockProps = useBlockProps({ className: 'ep-gr-block-wrap' });

    const selected = placeId ? { place_id: placeId, place_name: placeName, main_text: placeName, place_address: placeAddress } : null;
    const proActive = isProPluginActive;

    // Which controls the current layout supports (see LAYOUT_CAPS). Every
    // conditional control below reads from this — no ad-hoc layout checks.
    const caps = layoutCaps(layout);
    const isSlides = SLIDES_PER_VIEW_LAYOUTS.includes(layout);
    const columnsLabel = isSlides ? __('Slides per view', 'embedpress') : __('Columns', 'embedpress');

    // Live background-fetch progress (Apify pulls all reviews in the background;
    // a small instant batch shows first). While running we show a progress bar;
    // when it FINISHES we bump the SSR preview ONCE (not on every poll tick).
    const progress = useFetchProgress(placeId);

    // A token that changes ONLY when a fetch completes (status → done), so the
    // ServerSideRender key refreshes the preview exactly once when the full set
    // lands — instead of remounting on every 4s poll (which caused the editor
    // freeze: each remount = a fresh 1.3MB block-renderer request). It does NOT
    // track reviewCount/running ticks. `useRef` holds the last count we showed
    // at completion so a later refetch that grows the set still triggers one bump.
    const ssrDoneRef = useRef(0);
    if (progress.status === 'done' && progress.reviewCount !== ssrDoneRef.current) {
        ssrDoneRef.current = progress.reviewCount;
    }
    const ssrDoneToken = progress.status === 'done' ? ssrDoneRef.current : 'pending';

    const handleSelect = (p) => {
        setAttributes({
            placeId: p.place_id,
            placeName: p.main_text || p.description || '',
            // Persist the address so the selected chip can show the location
            // details across reloads (the picker only has it at pick time).
            placeAddress: p.secondary_text || '',
        });
    };

    const handleClear = () => {
        setAttributes({ placeId: '', placeName: '', placeAddress: '' });
    };

    return (
        <div {...blockProps}>
            {/* Alignment/width is provided natively by block.json `supports.align`
                (matching the other EmbedPress blocks) — no custom alignment
                toolbar here, which previously rendered a SECOND, duplicate
                alignment button next to the native one. */}
            {placeId && (
                <BlockControls>
                    <ToolbarGroup>
                        <ToolbarButton
                            icon="edit"
                            label={__('Change place', 'embedpress')}
                            onClick={handleClear}
                        />
                    </ToolbarGroup>
                </BlockControls>
            )}
            <InspectorControls>
                <PanelBody title={__('Place', 'embedpress')} initialOpen={true}>
                    <PlacePicker selected={selected} onSelect={handleSelect} onClear={handleClear} />
                    {/* Concise hint, shown only while still on the quick preview
                        (≤5 stored). Once the user fetches more from Settings, the
                        stored count climbs past 5 and this hint disappears. */}
                    {placeId && !progress.running && progress.reviewCount > 0 && progress.reviewCount <= 5 && (
                        <p className="ep-gr-fetch-hint">
                            {__('Quick preview — 5 reviews.', 'embedpress')}{' '}
                            <a href={GR_SETTINGS_URL} target="_blank" rel="noopener noreferrer">
                                {__('Fetch more', 'embedpress')}
                            </a>
                        </p>
                    )}
                </PanelBody>

                {/*
                  * Order: Place → Layout & Display → Reviews & Filtering →
                  * Review Elements → Style → SEO → Sources. The Pro controls live
                  * HERE in the free block and render LOCKED (greyed + crown +
                  * upgrade modal) until Pro is active — the canonical EmbedPress
                  * per-control pattern (PDF / Custom Player / Branding). The Pro
                  * plugin doesn't inject these controls; it only flips
                  * isProPluginActive, which unlocks them in place. Free users see
                  * every Pro control individually, so they know exactly what Pro
                  * adds.
                  */}
                {/* Layout & Display comes right after Place — pick the layout
                    first, then filter/style. */}
                <PanelBody title={__('Layout & Display', 'embedpress')} initialOpen={true}>
                    {/*
                      * Single layout control for free + Pro, rendered as an icon
                      * tile grid. Free ships list/grid/card/carousel; Pro appends
                      * masonry/spotlight/marquee/bubble/etc. via the
                      * `embedpress.googleReviews.layoutOptions` filter — one
                      * selector, never a separate conflicting "preset" control.
                      */}
                    <p className="ep-gr-control-label">{__('Layout', 'embedpress')}</p>
                    <LayoutPicker
                        value={layout}
                        options={ALL_LAYOUTS.map((l) => ({
                            label: __(l.label, 'embedpress'),
                            value: l.value,
                            // Pro layouts are locked (disabled+crown) until Pro is active.
                            disabled: l.pro && !proActive,
                        }))}
                        onChange={(v) => {
                            // Default "Review images" to whatever the target layout
                            // supports (caps.images) — compact/sliding layouts default
                            // it OFF, stacked layouts ON. Only adjusts the default when
                            // the capability flips; the user can still toggle it where
                            // the layout supports it.
                            const wasImages = layoutCaps(layout).images;
                            const nowImages = layoutCaps(v).images;
                            const next = { layout: v };
                            if (wasImages !== nowImages) next.showImages = nowImages;
                            setAttributes(next);
                        }}
                    />
                </PanelBody>

                {/* Reviews & Filtering and Review Elements both operate on the
                    per-review LIST, so they only apply to layouts that render one.
                    Summary-only layouts (badge/knowledge) show neither. */}
                {caps.reviews && (
                    <PanelBody title={__('Reviews & Filtering', 'embedpress')} initialOpen={false}>
                        {/* These controls form a clear PIPELINE, top to bottom:
                            FILTER (which reviews are eligible: min rating, keyword,
                            hide-empty) → ORDER (sort the eligible ones) → SHOW (how
                            many). The help text makes that obvious so the controls
                            don't read as overlapping/conflicting. */}
                        {/* 1. FILTER — Minimum rating (PRO). The "show only 5★" filter
                            is the highest-demand ask, so it's an exclusive Pro control
                            (free still ships keyword + hide-empty). */}
                        <ProLock locked={!proActive}>
                            <SelectControl
                                label={__('Minimum rating', 'embedpress')}
                                value={String(minRating)}
                                options={[
                                    { label: __('Any', 'embedpress'), value: '0' },
                                    { label: '3+', value: '3' },
                                    { label: '4+', value: '4' },
                                    { label: '5', value: '5' },
                                ]}
                                onChange={(v) => setAttributes({ minRating: parseInt(v, 10) })}
                                help={__('Filter: only reviews at or above this rating are eligible to show.', 'embedpress')}
                                __nextHasNoMarginBottom
                            />
                        </ProLock>
                        <TextControl
                            label={__('Keyword filter', 'embedpress')}
                            value={keyword || ''}
                            onChange={(v) => setAttributes({ keyword: v })}
                            placeholder={__('e.g. service, staff, clean', 'embedpress')}
                            help={__('Filter: only reviews whose text contains this word.', 'embedpress')}
                            __nextHasNoMarginBottom
                        />
                        <ToggleControl
                            label={__('Hide reviews with no text', 'embedpress')}
                            checked={!!hideEmpty}
                            onChange={(v) => setAttributes({ hideEmpty: v })}
                            __nextHasNoMarginBottom
                        />
                        {/* 2. ORDER — Sort the eligible (filtered) reviews. */}
                        <SelectControl
                            label={__('Sort by', 'embedpress')}
                            value={sort || 'newest'}
                            options={[
                                { label: __('Newest', 'embedpress'), value: 'newest' },
                                { label: __('Highest rated', 'embedpress'), value: 'highest' },
                                { label: __('Lowest rated', 'embedpress'), value: 'lowest' },
                                { label: __('Most relevant', 'embedpress'), value: 'relevant' },
                            ]}
                            onChange={(v) => setAttributes({ sort: v })}
                            help={__('Order of the filtered reviews (applied after the filters above).', 'embedpress')}
                            __nextHasNoMarginBottom
                        />
                        {/* 3. SHOW — how many of the filtered + sorted reviews to
                            render. The cap when Load more is off, the page size when
                            it's on. Only stacked, paginatable layouts (caps.loadMore)
                            honor it: sliding layouts render ALL reviews into their
                            track, summary-only layouts show no list, so it's hidden. */}
                        {caps.loadMore && (
                            <RangeControl
                                label={__('Reviews per page', 'embedpress')}
                                value={limit}
                                min={1}
                                // 10 = free ceiling; 50 once the EmbedPress API is
                                // connected (a place can then hold far more). Pro's
                                // maxLimit filter can lift it further.
                                max={applyFilters('embedpress.googleReviews.maxLimit', REVIEWS_PER_PAGE_MAX)}
                                onChange={(v) => setAttributes({ limit: v })}
                                help={apifyConnected
                                    ? __('How many of the filtered, sorted reviews to show (the page size when “Load more” is on).', 'embedpress')
                                    : __('Show up to 10 reviews per place. Connect the EmbedPress API in EmbedPress → Google Reviews to show more.', 'embedpress')}
                                __nextHasNoMarginBottom
                            />
                        )}
                        {/* "Load more" pairs with "Reviews per page" above — the count
                            IS the page size. FREE feature (pure frontend pagination of
                            already-fetched reviews, no extra API calls). Only for
                            layouts that support pagination (caps.loadMore); sliding
                            layouts reveal every review through their own nav. */}
                        {caps.loadMore && (
                            <ToggleControl
                                label={__('Load More', 'embedpress')}
                                checked={!!loadMore}
                                onChange={(v) => setAttributes({ loadMore: v })}
                                help={__('Reveals reviews a page at a time (no extra API calls). Page size = the “Reviews per page” count above.', 'embedpress')}
                                __nextHasNoMarginBottom
                            />
                        )}
                    </PanelBody>
                )}

                {caps.reviews && (
                    <PanelBody title={__('Review Elements', 'embedpress')} initialOpen={false}>
                        <ToggleControl
                            label={__('Reviewer photo', 'embedpress')}
                            checked={showPhoto}
                            onChange={(v) => setAttributes({ showPhoto: v })}
                            __nextHasNoMarginBottom
                        />
                        <ToggleControl
                            label={__('Star rating', 'embedpress')}
                            checked={showStars}
                            onChange={(v) => setAttributes({ showStars: v })}
                            __nextHasNoMarginBottom
                        />
                        <ToggleControl
                            label={__('Date', 'embedpress')}
                            checked={showDate}
                            onChange={(v) => setAttributes({ showDate: v })}
                            __nextHasNoMarginBottom
                        />
                        {/* Review images (Pro) only apply to layouts with room for
                            them (caps.images) — hidden for compact/sliding layouts
                            that never render attached photos. Gated: locked in free. */}
                        {caps.images && (
                            <ProLock locked={!proActive}>
                                <ToggleControl
                                    label={__('Review images', 'embedpress')}
                                    checked={showImages}
                                    onChange={(v) => setAttributes({ showImages: v })}
                                    help={__('Photos attached to reviews.', 'embedpress')}
                                    __nextHasNoMarginBottom
                                />
                            </ProLock>
                        )}
                        <ToggleControl
                            label={__('"View on Google" link', 'embedpress')}
                            checked={showLink}
                            onChange={(v) => setAttributes({ showLink: v })}
                            __nextHasNoMarginBottom
                        />
                    </PanelBody>
                )}

                {/* Size & Spacing — only for layouts that render a review list.
                    Summary-only layouts (badge/knowledge) are a single compact
                    card and don't use columns/gap/width. Within review layouts,
                    each control still gates on its own cap. */}
                {caps.reviews && (
                    <PanelBody title={__('Size & Spacing', 'embedpress')} initialOpen={false}>
                        {/* Columns / slides-per-view — only for layouts with a
                            multi-column or per-view count. Label adapts: "Slides
                            per view" for sliders, "Columns" otherwise. */}
                        {caps.columns && (
                            <RangeControl
                                label={columnsLabel}
                                value={columns}
                                min={1}
                                max={6}
                                onChange={(v) => setAttributes({ columns: v })}
                                help={isSlides
                                    ? __('How many review cards are shown at once. Collapses on smaller screens.', 'embedpress')
                                    : __('Number of columns. Collapses on smaller screens.', 'embedpress')}
                                __nextHasNoMarginBottom
                            />
                        )}
                        {caps.gap && (
                            <RangeControl
                                label={__('Gap (px)', 'embedpress')}
                                value={gap}
                                min={0}
                                max={80}
                                onChange={(v) => setAttributes({ gap: v })}
                                help={__('Space between review cards.', 'embedpress')}
                                __nextHasNoMarginBottom
                            />
                        )}
                        {caps.maxWidth && (
                            <RangeControl
                                label={__('Max width (px)', 'embedpress')}
                                value={maxWidth}
                                min={0}
                                max={1600}
                                step={10}
                                onChange={(v) => setAttributes({ maxWidth: v })}
                                help={__('Cap the block width and center it. 0 = full width.', 'embedpress')}
                                __nextHasNoMarginBottom
                            />
                        )}
                    </PanelBody>
                )}

                {/* Motion — one caps-driven panel replacing the old per-layout
                    Carousel / Spotlight / Marquee panels. Shows only the motion
                    controls the current layout supports:
                      slider   → arrows + dots + infinite loop (carousel nav)
                      autoplay → auto-advance toggle (+ speed), Pro
                      speed    → standalone scroll speed (marquee)
                    Renders only when the layout has at least one motion cap. */}
                {(caps.slider || caps.autoplay || caps.speed) && (
                    <PanelBody title={__('Motion', 'embedpress')} initialOpen={false}>
                        {caps.slider && (
                            <>
                                <ToggleControl
                                    label={__('Show arrows', 'embedpress')}
                                    checked={showArrows !== false}
                                    onChange={(v) => setAttributes({ showArrows: v })}
                                    __nextHasNoMarginBottom
                                />
                                <ToggleControl
                                    label={__('Show dots', 'embedpress')}
                                    checked={showDots !== false}
                                    onChange={(v) => setAttributes({ showDots: v })}
                                    __nextHasNoMarginBottom
                                />
                                <ToggleControl
                                    label={__('Infinite loop', 'embedpress')}
                                    checked={carouselLoop !== false}
                                    onChange={(v) => setAttributes({ carouselLoop: v })}
                                    help={__('Slide seamlessly from the last review back to the first.', 'embedpress')}
                                    __nextHasNoMarginBottom
                                />
                            </>
                        )}
                        {/* Autoplay + speed are FREE (mirrors Essential Addons'
                            free slider autoplay). */}
                        {caps.autoplay && (
                            <>
                                <ToggleControl
                                    label={__('Autoplay', 'embedpress')}
                                    checked={!!autoplay}
                                    onChange={(v) => setAttributes({ autoplay: v })}
                                    help={__('Advance through reviews automatically.', 'embedpress')}
                                    __nextHasNoMarginBottom
                                />
                                {autoplay && (
                                    <RangeControl
                                        label={__('Autoplay speed (seconds)', 'embedpress')}
                                        value={autoplaySpeed || 5}
                                        min={1}
                                        max={30}
                                        onChange={(v) => setAttributes({ autoplaySpeed: v })}
                                        __nextHasNoMarginBottom
                                    />
                                )}
                            </>
                        )}
                        {caps.speed && (
                            <RangeControl
                                label={__('Scroll speed', 'embedpress')}
                                value={autoplaySpeed >= 1 && autoplaySpeed <= 10 ? autoplaySpeed : 4}
                                min={1}
                                max={10}
                                onChange={(v) => setAttributes({ autoplaySpeed: v })}
                                help={__('Marquee scroll speed, from 1 (slowest) to 10 (fastest).', 'embedpress')}
                                __nextHasNoMarginBottom
                            />
                        )}
                    </PanelBody>
                )}

                {/* Header (summary). For summary-only layouts (badge/knowledge)
                    the header IS the whole widget, so the "Show header" toggle is
                    hidden (caps.header === 'forced') — turning it off would render
                    nothing. The granular per-part toggles + alignment (Pro) still
                    apply. For all other layouts the toggle shows. */}
                <PanelBody title={__('Header', 'embedpress')} initialOpen={false}>
                    {caps.header === 'optional' && (
                        <ToggleControl
                            label={__('Show header', 'embedpress')}
                            checked={showSummary !== false}
                            onChange={(v) => setAttributes({ showSummary: v })}
                            __nextHasNoMarginBottom
                        />
                    )}
                    {/* Granular per-part toggles + alignment are FREE (mirrors
                        Essential Addons). Shown when the header is visible
                        (optional+on) OR forced. */}
                    {(caps.header === 'forced' || showSummary !== false) && (
                        <>
                            <ToggleControl
                                label={__('Business name', 'embedpress')}
                                checked={showSummaryName !== false}
                                onChange={(v) => setAttributes({ showSummaryName: v })}
                                __nextHasNoMarginBottom
                            />
                            <ToggleControl
                                label={__('Rating score', 'embedpress')}
                                checked={showSummaryRating !== false}
                                onChange={(v) => setAttributes({ showSummaryRating: v })}
                                __nextHasNoMarginBottom
                            />
                            <ToggleControl
                                label={__('Rating stars', 'embedpress')}
                                checked={showSummaryStars !== false}
                                onChange={(v) => setAttributes({ showSummaryStars: v })}
                                __nextHasNoMarginBottom
                            />
                            <ToggleControl
                                label={__('Review count', 'embedpress')}
                                checked={showSummaryCount !== false}
                                onChange={(v) => setAttributes({ showSummaryCount: v })}
                                __nextHasNoMarginBottom
                            />
                            {caps.writeReview && (
                                <ToggleControl
                                    label={__('"Write a review" button', 'embedpress')}
                                    checked={showWriteReview !== false}
                                    onChange={(v) => setAttributes({ showWriteReview: v })}
                                    __nextHasNoMarginBottom
                                />
                            )}
                            <SelectControl
                                label={__('Header alignment', 'embedpress')}
                                value={summaryAlign || 'left'}
                                options={[
                                    { label: __('Left', 'embedpress'), value: 'left' },
                                    { label: __('Center', 'embedpress'), value: 'center' },
                                    { label: __('Right', 'embedpress'), value: 'right' },
                                ]}
                                onChange={(v) => setAttributes({ summaryAlign: v })}
                                __nextHasNoMarginBottom
                            />
                        </>
                    )}
                </PanelBody>

                {/* Colors & Theme — light/dark + accent. FREE (mirrors Essential
                    Addons; purely cosmetic skinning). Autoplay is layout BEHAVIOR
                    and lives in the Motion panel, not duplicated here. */}
                <PanelBody title={__('Colors & Theme', 'embedpress')} initialOpen={false}>
                    <SelectControl
                        label={__('Theme', 'embedpress')}
                        value={theme || 'light'}
                        options={[
                            { label: __('Light', 'embedpress'), value: 'light' },
                            { label: __('Dark', 'embedpress'), value: 'dark' },
                        ]}
                        onChange={(v) => setAttributes({ theme: v })}
                        __nextHasNoMarginBottom
                    />
                    <BaseControl label={__('Accent color', 'embedpress')} __nextHasNoMarginBottom>
                        <ColorPalette
                            colors={ACCENT_COLORS}
                            value={accentColor}
                            onChange={(v) => setAttributes({ accentColor: v || '' })}
                            clearable
                        />
                    </BaseControl>
                </PanelBody>

                {/* SEO / Rich Snippets — JSON-LD toggle. FREE (mirrors Essential
                    Addons' free Local Business schema). */}
                <PanelBody title={__('SEO / Rich Snippets', 'embedpress')} initialOpen={false}>
                    <ToggleControl
                        label={__('Output review schema (JSON-LD)', 'embedpress')}
                        checked={!!schema}
                        onChange={(v) => setAttributes({ schema: v })}
                        help={__('Adds AggregateRating + Review structured data so search engines can show star ratings.', 'embedpress')}
                        __nextHasNoMarginBottom
                    />
                </PanelBody>

                {/* Sources & Caching — cache duration is FREE (mirrors Essential
                    Addons' free "Data Cache Time"); multi-place merge stays Pro. */}
                <PanelBody title={__('Sources & Caching', 'embedpress')} initialOpen={false}>
                    {/* Cache duration — FREE. */}
                    <RangeControl
                        label={__('Cache duration (minutes)', 'embedpress')}
                        value={cacheTtl ? Math.round(cacheTtl / 60) : 0}
                        min={0}
                        max={1440}
                        step={15}
                        onChange={(v) => setAttributes({ cacheTtl: v * 60 })}
                        help={__('0 = use the global default. Overrides cache time for this block.', 'embedpress')}
                        __nextHasNoMarginBottom
                    />
                    {/* Additional places (multi-place merge) — PRO. */}
                    <ProLock locked={!proActive}>
                        <BaseControl
                            label={__('Additional places', 'embedpress')}
                            help={__('Merge reviews from more than one Google place (by Place ID).', 'embedpress')}
                            __nextHasNoMarginBottom
                        >
                            {places.map((p, idx) => (
                                <div className="ep-gr-pro-place-row" key={`place-${idx}`}>
                                    <TextControl
                                        value={p}
                                        onChange={(v) => {
                                            const next = [...places];
                                            next[idx] = v;
                                            setAttributes({ places: next });
                                        }}
                                        placeholder="ChIJ…"
                                        __nextHasNoMarginBottom
                                    />
                                    <Button
                                        isDestructive
                                        isSmall
                                        onClick={() => setAttributes({ places: places.filter((_, i) => i !== idx) })}
                                    >
                                        {__('Remove', 'embedpress')}
                                    </Button>
                                </div>
                            ))}
                            <Button variant="secondary" isSmall onClick={() => setAttributes({ places: [...places, ''] })}>
                                {__('+ Add place', 'embedpress')}
                            </Button>
                        </BaseControl>
                    </ProLock>
                </PanelBody>

                {/* Shared analytics / help / upgrade card — same component used
                    across all EmbedPress blocks (youtube, document, maps, …). */}
                <Upgrade />
            </InspectorControls>

            {!placeId ? (
                <Placeholder
                    className="ep-gr-block-placeholder"
                    icon="star-filled"
                    label={__('EmbedPress Google Reviews', 'embedpress')}
                    instructions={__(
                        'Search for a Google Business to embed its reviews. Open the block sidebar to pick a place.',
                        'embedpress'
                    )}
                >
                    <PlacePicker selected={null} onSelect={handleSelect} onClear={handleClear} />

                </Placeholder>
            ) : (
                <>
                    {progress.running && (
                        <div className="ep-gr-fetch-progress" role="status" aria-live="polite">
                            <div className="ep-gr-fetch-progress-head">
                                <span className="ep-gr-spinner" aria-hidden="true" />
                                <span className="ep-gr-fetch-progress-text">
                                    {progress.fetchedSoFar > 0
                                        ? sprintf(
                                            /* translators: %d: number of reviews fetched so far */
                                            __('Fetching all reviews… %d so far', 'embedpress'),
                                            progress.fetchedSoFar
                                        )
                                        // Cold-start window: the fetch is queued/running but the
                                        // background worker hasn't reported a count or message yet
                                        // (the managed fetcher takes ~a minute to spin up). Show an
                                        // honest "starting up" message instead of a static
                                        // "Fetching all reviews…" that looks frozen — the worker's
                                        // real "Fetched N so far…" replaces it as soon as it lands.
                                        : progress.message
                                            || __('Starting the review fetcher… this can take a moment.', 'embedpress')}
                                </span>
                            </div>
                            <div className="ep-gr-fetch-progress-bar" aria-hidden="true">
                                <span className="ep-gr-fetch-progress-fill" />
                            </div>
                            <p className="ep-gr-fetch-progress-note">
                                {__('Showing the first reviews now — the rest are loading in the background. You can keep editing.', 'embedpress')}
                            </p>
                        </div>
                    )}
                    <ServerSideRender
                        // Keep the key STABLE per place. It must NOT include the
                        // live poll fields (progress.status / reviewCount): while a
                        // place is fetching, useFetchProgress polls every few
                        // seconds and those values change on every tick — a key
                        // that tracks them REMOUNTS ServerSideRender each poll,
                        // firing a fresh block-renderer POST every time and (with
                        // attribute changes on top) floods the editor with
                        // in-flight 1.3MB requests → the browser freeze. We bump
                        // the key ONLY when a fetch transitions to "done" (via
                        // doneToken below), so the preview refreshes once when the
                        // full set lands, not on every poll. ServerSideRender
                        // already re-renders on attribute changes by itself.
                        key={`gr-${placeId}-${ssrDoneToken}`}
                        block="embedpress/google-reviews"
                        attributes={attributes}
                        EmptyResponsePlaceholder={() => (
                            <Notice status="warning" isDismissible={false}>
                                {__('No preview yet. Verify your API key and place selection.', 'embedpress')}
                            </Notice>
                        )}
                    />
                </>
            )}
        </div>
    );
};

export default Edit;
