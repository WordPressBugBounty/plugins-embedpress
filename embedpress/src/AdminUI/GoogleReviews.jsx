/**
 * EmbedPress — Google Reviews settings (React)
 * Configuration card + searchable place picker + shortcode generator with live preview.
 */

import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';

const __ = (window.wp && window.wp.i18n && window.wp.i18n.__) || ((s) => s);
const sprintf = (window.wp && window.wp.i18n && window.wp.i18n.sprintf)
    || ((fmt, ...args) => { let i = 0; return String(fmt).replace(/%(\d+\$)?[ds]/g, (m) => {
        if (m.includes('$')) { const n = parseInt(m, 10) - 1; return args[n]; }
        return args[i++];
    }); });

const REST_NS = '/embedpress/v1/google-reviews';

// Shortcode defaults — mirror Shortcode::do_shortcode_google_reviews() so we only
// emit attributes that differ from the renderer's defaults (clean, short output).
const DEFAULTS = {
    limit: 10,
    min_rating: 0,
    layout: 'list',
    show_photo: true,
    show_stars: true,
    show_date: true,
    show_images: true,
    show_link: false,
    columns: 3,
    gap: 20,
    max_width: 0,
    show_summary: true,
    // Pro (round-trip through the shortcode; consumed by Pro render filters)
    sort: 'newest',
    keyword: '',
    hide_empty: false,
    load_more: true,
    theme: 'light',
    accent_color: '',
    autoplay: false,
    schema: false,
};

const bootstrap = (typeof window !== 'undefined' && window.epGoogleReviewsAdmin) || {};
const PRO_ACTIVE = !!bootstrap.proActive;
const UPGRADE_URL = bootstrap.upgradeUrl || 'https://wpdeveloper.com/in/upgrade-embedpress';

// Mask an opaque ID (Place ID / Site ID) license-key style: keep the first and
// last few characters and replace the middle with asterisks
// (e.g. "ChIJN1t***********K3Fg"). Short IDs are returned as-is.
const maskId = (id) => {
    const s = String(id || '');
    if (s.length <= 12) return s;
    return `${s.slice(0, 6)}${'*'.repeat(11)}${s.slice(-6)}`;
};

/* ---------- Layout catalogue + capability matrix ----------
 * Mirrors ALL_LAYOUTS + LAYOUT_CAPS in the Gutenberg block
 * (src/Blocks/google-reviews/src/edit.js) so the shortcode generator offers the
 * exact same layouts and gates the same controls per layout. Keep in sync. */
const GR_LAYOUTS = [
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

const GR_LAYOUT_CAPS = {
    list:      { reviews: true,  columns: false, gap: false, slider: false, autoplay: false, loadMore: true,  images: true  },
    grid:      { reviews: true,  columns: true,  gap: true,  slider: false, autoplay: false, loadMore: true,  images: true  },
    card:      { reviews: true,  columns: true,  gap: true,  slider: false, autoplay: false, loadMore: true,  images: true  },
    carousel:  { reviews: true,  columns: true,  gap: true,  slider: true,  autoplay: true,  loadMore: false, images: false },
    masonry:   { reviews: true,  columns: true,  gap: true,  slider: false, autoplay: false, loadMore: true,  images: true  },
    badge:     { reviews: false, columns: false, gap: false, slider: false, autoplay: false, loadMore: false, images: false },
    spotlight: { reviews: true,  columns: false, gap: false, slider: false, autoplay: true,  loadMore: false, images: true  },
    knowledge: { reviews: false, columns: false, gap: false, slider: false, autoplay: false, loadMore: false, images: false },
    marquee:   { reviews: true,  columns: true,  gap: true,  slider: false, autoplay: false, loadMore: false, images: false },
    bubble:    { reviews: true,  columns: true,  gap: true,  slider: false, autoplay: false, loadMore: true,  images: true  },
};
const layoutCaps = (l) => GR_LAYOUT_CAPS[l] || GR_LAYOUT_CAPS.list;
const PRO_LAYOUTS = new Set(GR_LAYOUTS.filter((l) => l.pro).map((l) => l.value));

const ACCENT_SWATCHES = [
    { name: 'Default', color: '' },
    { name: 'EmbedPress', color: '#5b4e96' },
    { name: 'Google Blue', color: '#4285f4' },
    { name: 'Green', color: '#34a853' },
    { name: 'Amber', color: '#fbbc05' },
    { name: 'Red', color: '#ea4335' },
    { name: 'Slate', color: '#334155' },
];

function api(method, path, params, body) {
    // bootstrap.restUrl is rest_url('embedpress/v1/google-reviews'). On PLAIN
    // permalinks that's `.../?rest_route=/embedpress/v1/google-reviews`, which
    // already contains a `?`. Appending the sub-path (/search) and then a second
    // `?qs` produced a malformed URL → "No matching route". Build the URL in a
    // permalink-aware way: when the base already has a query string (Plain mode),
    // the sub-path belongs INSIDE the rest_route value and extra params join with
    // `&`; otherwise (pretty permalinks) append the path then `?qs` as usual.
    const base = bootstrap.restUrl || '/wp-json' + REST_NS;
    const isPlain = base.indexOf('?') !== -1;
    let url;
    if (isPlain) {
        // Inject the sub-path into the rest_route parameter value.
        url = base.replace(
            /([?&]rest_route=)([^&]*)/,
            (m, pre, val) => pre + encodeURIComponent(decodeURIComponent(val) + path)
        );
    } else {
        url = base + path;
    }
    if (params) {
        const qs = Object.keys(params)
            .map((k) => encodeURIComponent(k) + '=' + encodeURIComponent(params[k]))
            .join('&');
        if (qs) url += (url.indexOf('?') !== -1 ? '&' : '?') + qs;
    }
    const init = {
        method,
        headers: {
            'X-WP-Nonce': bootstrap.nonce || '',
            'Content-Type': 'application/json',
        },
        credentials: 'same-origin',
    };
    if (body) init.body = JSON.stringify(body);
    return fetch(url, init).then((r) =>
        r.json().then((d) => ({ ok: r.ok, status: r.status, body: d }))
    );
}

// Google Places session-token UUID v4. Reused across every autocomplete +
// the final details call of a single picking session so Google bills the
// whole sequence as ONE event instead of N. The token is consumed once the
// user picks a place (or after 5 min idle); a fresh one starts the next
// session.
const newSessionToken = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
};
const SESSION_TOKEN_TTL_MS = 5 * 60 * 1000;

// Fill in ★/reviews after a suggestion list has already rendered.
//
// Google's Autocomplete returns names only — no Places tier carries a rating
// inside a prediction — so counts need a per-place lookup. Running it after the
// list keeps results instant: names appear immediately, numbers a moment later.
//
// seqRef guards a fast typist: only the newest request may write, so a slow
// response for "Mirp" cannot overwrite the list for "Mirpur 10". Failures are
// silent, leaving those rows with their neutral "Reviews unavailable" label.
const hydrateCounts = (list, seqRef, setPredictions, setLoading) => {
    const ids = (list || []).map((p) => p.place_id).filter(Boolean);
    if (!ids.length) return;

    const seq = ++seqRef.current;
    if (setLoading) setLoading(true);
    api('GET', '/place-counts', { place_ids: ids.join(',') }).then((res) => {
        if (seq !== seqRef.current) return;
        if (setLoading) setLoading(false);
        const counts = (res && res.ok && res.body && res.body.counts) || {};
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
    }).catch(() => {
        if (setLoading && seq === seqRef.current) setLoading(false);
    });
};


// Build the shortcode string from the chosen options. We only emit attributes
// that differ from the renderer defaults (DEFAULTS) so the output stays short.
// Caps-aware: an option that the active layout doesn't support is skipped, and
// Pro attributes are only emitted when Pro is active (so a free user's shortcode
// never carries Pro keys that do nothing).
const SHORTCODE_KEYS = [
    { k: 'limit' },
    { k: 'min_rating', cap: 'reviews', pro: true }, // "show only 5★" — exclusive Pro filter
    { k: 'layout' },
    { k: 'show_photo', cap: 'reviews' },
    { k: 'show_stars', cap: 'reviews' },
    { k: 'show_date', cap: 'reviews' },
    { k: 'show_images', cap: 'images', pro: true },
    { k: 'show_link', cap: 'reviews' },
    { k: 'show_summary' },
    { k: 'columns', cap: 'columns' },
    { k: 'gap', cap: 'gap' },
    { k: 'max_width' },
    // FREE (mirrors Essential Addons' free Business Reviews widget): sort /
    // keyword / hide-empty / theme / accent / autoplay / JSON-LD schema.
    { k: 'sort', cap: 'reviews' },
    { k: 'keyword', cap: 'reviews' },
    { k: 'hide_empty', cap: 'reviews' },
    { k: 'load_more', cap: 'loadMore' }, // FREE — frontend AJAX pagination
    { k: 'theme' },
    { k: 'accent_color' },
    { k: 'autoplay', cap: 'autoplay' },
    { k: 'schema' },
];

function buildShortcode(selected, options) {
    if (!selected) return '';
    const caps = layoutCaps(options.layout);
    const parts = ['embedpress_google_reviews', `place_id="${selected.place_id}"`];
    if (selected.main_text) {
        parts.push(`place_name="${selected.main_text.replace(/"/g, '&quot;')}"`);
    }
    SHORTCODE_KEYS.forEach(({ k, cap, pro }) => {
        if (cap && !caps[cap]) return;          // layout doesn't support this control
        if (pro && !PRO_ACTIVE) return;         // don't emit Pro keys without Pro
        let v = options[k];
        if (v === DEFAULTS[k] || v === undefined) return;
        if (typeof v === 'boolean') v = v ? 'true' : 'false';
        if (v === '') return;
        parts.push(`${k}="${v}"`);
    });
    return `[${parts.join(' ')}]`;
}

/* ---------- EmbedPress API connect card ----------
 *
 * Connects the install to api.embedpress.com/google-reviews/v1 with a
 * Bearer token bound to home_url + a fingerprint derived from the site's
 * AUTH_KEY. The token is what lets the plugin call enqueue.php /
 * status.php on the hosted scraping proxy — without it, every plugin
 * install could hit the public endpoint anonymously and burn through
 * Chrome capacity.
 *
 * UX: one Connect button. On success it flips to a "Connected" pill with
 * site_id + tier + a Disconnect action. No token is ever exposed to the
 * browser — the proxy keeps it server-side, the plugin stores the raw
 * token in wp_options on the WP backend only.
 */
const EmbedPressApiCard = () => {
    const [state, setState] = useState({ connected: false, site_id: '', tier: '', connected_at: 0, home_url: '', endpoint: '', would_send: { site_url: '' }, privacy_url: '' });
    const [booted, setBooted] = useState(false);
    const [busy, setBusy] = useState(false);
    const [status, setStatus] = useState({ text: '', tone: '' });
    // Cache TTL + Clear are the only "Advanced" controls now that Apify /
    // Google API key rows are gone — folded directly into this card so
    // there's no separate Configuration section just to hold them.
    const [cacheTtl, setCacheTtl] = useState(21600);
    const [cacheSaving, setCacheSaving] = useState(false);
    // "What we send" disclosure (Connect button copy). Off by default so the
    // header stays one-line; we still surface the data the moment the user
    // wants to see it.
    const [sendOpen, setSendOpen] = useState(false);

    useEffect(() => {
        api('GET', '/managed/status').then((res) => {
            if (res.ok) setState(res.body);
            setBooted(true);
        });
        // The place-search consent prompt (PlacesManager) can connect too —
        // refresh this card when it does so both stay in sync.
        const onConn = () => {
            api('GET', '/managed/status').then((res) => { if (res.ok) setState(res.body); });
        };
        window.addEventListener('ep-gr-connection-changed', onConn);
        // Cache TTL still lives on the existing /settings endpoint — we
        // only read what we render; nothing else from that payload is used
        // here.
        api('GET', '/settings').then((res) => {
            if (res.ok && res.body && res.body.cache_ttl) {
                setCacheTtl(parseInt(res.body.cache_ttl, 10));
            }
        });
        return () => window.removeEventListener('ep-gr-connection-changed', onConn);
    }, []);

    const flash = (text, tone) => {
        setStatus({ text, tone });
        setTimeout(() => setStatus({ text: '', tone: '' }), 7000);
    };

    const handleConnect = () => {
        setBusy(true);
        api('POST', '/managed/connect').then((res) => {
            setBusy(false);
            if (res.ok && res.body && res.body.connected) {
                setState(res.body);
                // Tell sibling components (PlacesManager) the connection changed
                // so search unlocks WITHOUT a page reload.
                window.dispatchEvent(new CustomEvent('ep-gr-connection-changed', { detail: { connected: true } }));
                flash('Connected to the EmbedPress API.', 'success');
            } else {
                flash((res.body && res.body.message) || 'Couldn’t connect. Try again.', 'error');
            }
        });
    };

    const handleDisconnect = () => {
        setBusy(true);
        api('POST', '/managed/disconnect').then((res) => {
            setBusy(false);
            if (res.ok) {
                setState(res.body);
                window.dispatchEvent(new CustomEvent('ep-gr-connection-changed', { detail: { connected: false } }));
                // Disconnecting is a teardown action — surface it as a red/error
                // toast, not a green success one (per QA #3).
                flash('Disconnected from the EmbedPress API.', 'error');
            } else {
                flash((res.body && res.body.message) || 'Couldn’t disconnect. Try again.', 'error');
            }
        });
    };

    const handleSaveCache = () => {
        setCacheSaving(true);
        api('POST', '/settings', null, { cache_ttl: cacheTtl }).then((res) => {
            setCacheSaving(false);
            if (res.ok) flash('Settings saved.', 'success');
            else flash((res.body && res.body.message) || 'Couldn’t save settings.', 'error');
        });
    };

    const handleClearCache = () => {
        api('POST', '/clear-cache', null, {}).then((res) => {
            if (res.ok) flash(`Cache cleared (${(res.body && res.body.deleted) || 0} reviews).`, 'success');
            else flash('Couldn’t clear the cache.', 'error');
        });
    };

    if (!booted) {
        return (
            <section className="ep-gr-card ep-gr-card--api ep-gr-card--skeleton" aria-hidden="true">
                <header className="ep-gr-card-header">
                    <span className="ep-gr-step-badge">·</span>
                    <div className="ep-gr-card-headtext">
                        <h2><span className="ep-gr-skel ep-gr-skel--title" style={{ width: 180 }} /></h2>
                        <p>
                            <span className="ep-gr-skel ep-gr-skel--line" />
                            <span className="ep-gr-skel ep-gr-skel--line ep-gr-skel--line-short" />
                        </p>
                    </div>
                </header>
                <div className="ep-gr-card-body">
                    <div className="ep-gr-api-cta">
                        <span className="ep-gr-skel ep-gr-skel--btn" style={{ width: 200, height: 32 }} />
                        <span className="ep-gr-skel ep-gr-skel--line" style={{ width: 100 }} />
                    </div>
                </div>
            </section>
        );
    }

    const isConnected = !!state.connected;

    // Data the proxy will receive on Connect, shown verbatim in the
    // "What we send" disclosure so the click never feels opaque. Site URL
    // and admin email are sourced from /managed/status (server-side truth);
    // fingerprint is computed server-side and intentionally NOT shown — it's
    // a one-way digest, the SAH256 isn't useful to the user.
    const wouldSend = state.would_send || {};

    return (
        <section className="ep-gr-card ep-gr-card--api">
            <header className="ep-gr-card-header">
                <span className="ep-gr-step-badge">1</span>
                <div className="ep-gr-card-headtext">
                    <h2>
                        EmbedPress API
                        {isConnected ? (
                            <span className="ep-gr-hpill ep-gr-hpill--on">
                                <span className="ep-gr-hpill-dot" />
                                Connected
                                {/* Tier reflects the EmbedPress Pro plugin's active
                                    state (QA #2): PRO when Pro is active, Free otherwise. */}
                                {` · ${PRO_ACTIVE ? 'PRO' : 'Free'}`}
                            </span>
                        ) : (
                            <span className="ep-gr-hpill ep-gr-hpill--off">
                                <span className="ep-gr-hpill-dot" />
                                Not connected
                            </span>
                        )}
                    </h2>
                    <p>
                        {isConnected
                            ? 'Your site is connected and ready to pull Google reviews. This connection is locked to this site only.'
                            : 'Connect in one click to start pulling Google reviews — no signup or API keys needed.'}
                    </p>
                </div>
            </header>

            <div className="ep-gr-card-body">
                {isConnected ? (
                    <div className="ep-gr-api-status">
                        <div className="ep-gr-api-status-meta">
                            <span className="ep-gr-api-status-label">Site ID</span>
                            <code className="ep-gr-api-status-val">
                                {state.site_id ? maskId(state.site_id) : '—'}
                            </code>
                        </div>
                        <button type="button" className="button" disabled={busy} onClick={handleDisconnect}>
                            {busy ? 'Disconnecting…' : 'Disconnect'}
                        </button>
                    </div>
                ) : (
                    <>
                        <div className="ep-gr-api-cta">
                            <button
                                type="button"
                                className="button button-primary"
                                disabled={busy}
                                onClick={handleConnect}
                            >
                                {busy ? 'Connecting…' : 'Connect to EmbedPress API'}
                            </button>
                            <button
                                type="button"
                                className="ep-gr-linklike"
                                aria-expanded={sendOpen}
                                onClick={() => setSendOpen((v) => !v)}
                            >
                                {sendOpen ? 'Hide Data Privacy Info' : 'View Data Privacy Info'}
                            </button>
                        </div>

                        {sendOpen && (
                            <ul className="ep-gr-send-list" aria-label="Information sent at connect">
                                <li>
                                    <span className="ep-gr-send-key">Site URL</span>
                                    <code className="ep-gr-send-val">{wouldSend.site_url || ''}</code>
                                    <span className="ep-gr-send-note">used to verify and connect this site</span>
                                </li>
                                <li>
                                    <span className="ep-gr-send-key">Install fingerprint</span>
                                    <code className="ep-gr-send-val">one-way hash</code>
                                    <span className="ep-gr-send-note">locks the connection to this site</span>
                                </li>
                                <li>
                                    <span className="ep-gr-send-key">Versions</span>
                                    <code className="ep-gr-send-val">{`EmbedPress ${wouldSend.plugin_version || ''} · WordPress ${wouldSend.wp_version || ''}`}</code>
                                    <span className="ep-gr-send-note">compatibility</span>
                                </li>
                                <li>
                                    <span className="ep-gr-send-note">
                                        Place searches then send the text you type to api.embedpress.com.{' '}
                                        <a href={state.privacy_url || 'https://wpdeveloper.com/privacy-policy'} target="_blank" rel="noopener noreferrer">Privacy policy</a>
                                    </span>
                                </li>
                            </ul>
                        )}
                    </>
                )}

                {/* Cache settings — shown directly (no collapse). Two controls:
                    cache TTL (how long fetched reviews are kept before a
                    re-fetch) and a Clear-cache button. */}
                <div className="ep-gr-advanced">
                    <div className="ep-gr-advanced-body">
                        <div className="ep-gr-advanced-row">
                            <div className="ep-gr-advanced-control">
                                <label htmlFor="ep-gr-cache-ttl">Cache reviews for</label>
                                <div className="ep-gr-advanced-inline">
                                    <select id="ep-gr-cache-ttl" value={cacheTtl} onChange={(e) => setCacheTtl(parseInt(e.target.value, 10))}>
                                        <option value={3600}>1 hour</option>
                                        <option value={21600}>6 hours</option>
                                        <option value={86400}>24 hours</option>
                                    </select>
                                    <button type="button" className="button button-primary" disabled={cacheSaving} onClick={handleSaveCache}>
                                        {cacheSaving ? 'Saving…' : 'Save'}
                                    </button>
                                </div>
                            </div>
                            <button type="button" className="button ep-gr-clear-cache" onClick={handleClearCache}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                    <polyline points="3 6 5 6 21 6" />
                                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                </svg>
                                Clear reviews cache
                            </button>
                        </div>
                        <p className="ep-gr-advanced-hint">
                            How long fetched reviews are stored before EmbedPress checks for fresh ones.
                        </p>
                    </div>
                </div>

                {status.text && (
                    <span className={`ep-gr-status ep-gr-status--${status.tone}`} aria-live="polite">{status.text}</span>
                )}
            </div>
        </section>
    );
};


/* ---------- Place picker ---------- */
const PlacePicker = ({ selected, onSelect, onClear }) => {
    const [q, setQ] = useState('');
    const [predictions, setPredictions] = useState([]);
    const [open, setOpen] = useState(false);
    const [searching, setSearching] = useState(false);
    const [noResults, setNoResults] = useState(false);
    const [error, setError] = useState(null);
    const debounceRef = useRef(null);
    // Lazily-created session token, reused across keystrokes of the same
    // picking session. Refresh on idle or when the user picks/clears.
    const sessionRef = useRef({ token: '', mintedAt: 0 });
    const countsSeqRef = useRef(0);
    const [countsLoading, setCountsLoading] = useState(false);
    const getSession = () => {
        const now = Date.now();
        if (!sessionRef.current.token || now - sessionRef.current.mintedAt > SESSION_TOKEN_TTL_MS) {
            sessionRef.current = { token: newSessionToken(), mintedAt: now };
        }
        return sessionRef.current.token;
    };
    const endSession = () => { sessionRef.current = { token: '', mintedAt: 0 }; };

    useEffect(() => {
        clearTimeout(debounceRef.current);
        setError(null);
        // Min 3 chars + a longer debounce: search can run through Apify, where
        // every query is a slow, billed actor run — wait until typing stops.
        if (q.trim().length < 3) {
            setPredictions([]);
            setOpen(false);
            setNoResults(false);
            return;
        }
        setSearching(true);
        debounceRef.current = setTimeout(() => {
            api('GET', '/search', { q: q.trim(), session_token: getSession() }).then((res) => {
                setSearching(false);
                if (res.ok && Array.isArray(res.body.predictions)) {
                    setPredictions(res.body.predictions);
                    setOpen(res.body.predictions.length > 0);
                    setNoResults(res.body.predictions.length === 0);
                    hydrateCounts(res.body.predictions, countsSeqRef, setPredictions, setCountsLoading);
                } else {
                    // REST error: WP_Error body shape is { code, message, data: { status } }
                    setPredictions([]);
                    setOpen(false);
                    setNoResults(false);
                    setError(
                        (res.body && (res.body.message || res.body.code)) ||
                            `Search failed (HTTP ${res.status}).`
                    );
                }
            }).catch((e) => {
                setSearching(false);
                setError('Network error — could not reach the server.');
            });
        }, 800);
        return () => clearTimeout(debounceRef.current);
    }, [q]);

    const pick = (p) => {
        onSelect(p);
        setQ('');
        setPredictions([]);
        setOpen(false);
        setNoResults(false);
        setError(null);
        endSession(); // selection closes the billing session
    };

    // Embedded picker → normalize {place_id,name,address,…} to the picker shape.
    return (
        <div className="ep-gr-picker">
            {!selected ? (
                <div className="ep-gr-field ep-gr-picker-field">
                    <label htmlFor="ep-gr-search">
                        <strong>Search for a place</strong>
                    </label>
                    <input
                        id="ep-gr-search"
                        type="text"
                        className="regular-text"
                        autoComplete="off"
                        placeholder="e.g. Sydney Opera House"
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                    />
                    {searching && !error && <span className="ep-gr-searching">Searching…</span>}
                    {open && (
                        <ul className="ep-gr-suggestions" role="listbox">
                            {predictions.map((p) => (
                                <li
                                    key={p.place_id}
                                    role="option"
                                    tabIndex={0}
                                    className="ep-gr-suggestion ep-gr-suggestion--option"
                                    onClick={() => pick(p)}
                                    onKeyDown={(e) => e.key === 'Enter' && pick(p)}
                                >
                                    <PinIcon />
                                    <span className="ep-gr-suggestion-body">
                                        <strong>{p.main_text || p.description}</strong>
                                        {p.secondary_text && <span>{p.secondary_text}</span>}
                                        <SuggestionMeta rating={p.rating} count={p.review_count} loading={countsLoading} />
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                    {!searching && noResults && !error && (
                        <p className="ep-gr-inline-note ep-gr-inline-note--muted">
                            No matches for “{q.trim()}”. Try a different spelling or include the city.
                        </p>
                    )}
                    {error && (
                        <p className="ep-gr-inline-note ep-gr-inline-note--error" role="alert">
                            <strong>Search failed:</strong> {error}
                            {/missing|api[_ ]?key|not configured/i.test(error) && (
                                <>
                                    {' '}Add your Google Places API key above and save before searching.
                                </>
                            )}
                        </p>
                    )}
                </div>
            ) : (
                <div className="ep-gr-selected">
                    <div className="ep-gr-selected-info">
                        <strong>{selected.main_text}</strong>
                        {selected.secondary_text && <span>{selected.secondary_text}</span>}
                        <code title={selected.place_id}>{maskId(selected.place_id)}</code>
                    </div>
                    <button type="button" className="button-link" onClick={onClear}>
                        Change
                    </button>
                </div>
            )}
        </div>
    );
};

/* ---------- Pro-lock primitive (mirrors the block's ProLock) ----------
 * Wraps Pro-only controls so free users SEE them, greyed + non-interactive, with
 * a small crown "Pro" badge. Clicking the overlay opens the EmbedPress upgrade
 * page. When Pro is active, children render as ordinary, interactive controls. */
const CrownIcon = () => (
    <svg width="11" height="11" viewBox="0 0 24 24" aria-hidden="true">
        <path fill="currentColor" d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm0 2h14v2H5v-2z" />
    </svg>
);

// Map-pin marker shown before each place suggestion (disambiguates the result
// as a location, mirroring Google's own picker).
const PinIcon = () => (
    <svg className="ep-gr-suggestion-pin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
        <circle cx="12" cy="10" r="3" />
    </svg>
);

// Rating + review-count line for a place suggestion: ★ 4.5 · 1,167 reviews.
// Renders nothing when the provider returned neither (e.g. legacy autocomplete).
const SuggestionMeta = ({ rating, count, loading }) => {
    // Four states — see the matching component in
    // src/Blocks/google-reviews/src/edit.js:
    //   count > 0   → ★ 4.5 · 1,167 reviews
    //   count === 0 → ★ 0.0 · No reviews yet   (Google says the place is empty)
    //   count null, lookup in flight → skeleton bar
    //   count null, lookup finished  → Reviews unavailable
    // Counts never arrive with the suggestions, so every row starts empty;
    // labelling that window "Reviews unavailable" would call a place with
    // thousands of reviews empty, hence the separate pending state.
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

const ProLock = ({ locked, children }) =>
    locked ? (
        <div
            className="ep-gr-prolock"
            role="button"
            tabIndex={0}
            title={__('This is a Pro feature — click to upgrade.', 'embedpress')}
            onClick={() => window.open(UPGRADE_URL, '_blank', 'noopener')}
            onKeyDown={(e) => { if (e.key === 'Enter') window.open(UPGRADE_URL, '_blank', 'noopener'); }}
        >
            <span className="ep-gr-prolock-badge"><CrownIcon /> {__('Pro', 'embedpress')}</span>
            <div className="ep-gr-prolock-inner" aria-hidden="true">{children}</div>
        </div>
    ) : (
        children
    );

/* Layout tile picker — icon grid mirroring the block's LayoutPicker. Pro layouts
 * render disabled + crown until Pro is active. */
const LAYOUT_TILE_ICON = (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="4" y="4" width="16" height="16" rx="2" />
        <line x1="8" y1="10" x2="16" y2="10" />
        <line x1="8" y1="14" x2="13" y2="14" />
    </svg>
);

const LayoutTiles = ({ value, onChange }) => (
    <div className="ep-gr-layout-picker">
        {GR_LAYOUTS.map((l) => {
            const locked = l.pro && !PRO_ACTIVE;
            return (
                <button
                    key={l.value}
                    type="button"
                    className={
                        'ep-gr-layout-tile' +
                        (l.value === value ? ' is-active' : '') +
                        (locked ? ' is-locked' : '')
                    }
                    aria-pressed={l.value === value}
                    disabled={locked}
                    title={locked ? `${l.label} — ${__('Pro', 'embedpress')}` : l.label}
                    onClick={() => { if (!locked) { onChange(l.value); } else { window.open(UPGRADE_URL, '_blank', 'noopener'); } }}
                >
                    {locked && (
                        <svg className="ep-gr-tile-crown" width="12" height="12" viewBox="0 0 24 24" aria-hidden="true">
                            <path fill="#f0b849" d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm0 2h14v2H5v-2z" />
                        </svg>
                    )}
                    <span className="ep-gr-layout-tile-icon">{LAYOUT_TILE_ICON}</span>
                    <span className="ep-gr-layout-tile-label">{l.label}</span>
                </button>
            );
        })}
    </div>
);

/* ---------- Shortcode generator (modal, scoped to one place) ---------- */
const ShortcodeModal = ({ place, apifyConnected, onClose }) => {
    // 10 = free ceiling; once the EmbedPress API is connected a place can hold
    // many more, so the "Reviews per page" choices go up to 50.
    const reviewsPerPageMax = apifyConnected ? 50 : 10;
    // `place` is a saved-place row: { place_id, place_name, ... }. Adapt it to
    // the shape buildShortcode()/preview expect (main_text = display name).
    const selected = { place_id: place.place_id, main_text: place.place_name || place.place_id };

    const [options, setOptions] = useState({
        limit: 10,
        min_rating: 0,
        layout: 'list',
        show_photo: true,
        show_stars: true,
        show_date: true,
        show_images: true,
        show_link: false,
        show_summary: true,
        columns: 3,
        gap: 20,
        max_width: 0,
        // Pro
        sort: 'newest',
        keyword: '',
        hide_empty: false,
        load_more: true,
        theme: 'light',
        accent_color: '',
        autoplay: false,
        schema: false,
    });
    const [previewHtml, setPreviewHtml] = useState('');
    const [previewLoading, setPreviewLoading] = useState(false);
    const [previewError, setPreviewError] = useState(null);
    const [copied, setCopied] = useState(false);
    const previewDebounceRef = useRef(null);

    const updateOption = (k, v) => setOptions((prev) => ({ ...prev, [k]: v }));

    // Which controls the active layout supports (mirrors the block's LAYOUT_CAPS).
    const caps = layoutCaps(options.layout);

    // Close on Escape; lock body scroll while open.
    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKey);
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.removeEventListener('keydown', onKey);
            document.body.style.overflow = prevOverflow;
        };
    }, [onClose]);

    const refreshPreview = useCallback(() => {
        setPreviewLoading(true);
        setPreviewError(null);
        // Send every option so the live preview matches the generated shortcode
        // exactly (the renderer ignores Pro keys when Pro is inactive).
        const params = {
            place_id: selected.place_id,
            place_name: selected.main_text || '',
            ...options,
        };
        api('GET', '/preview', params).then((res) => {
            setPreviewLoading(false);
            if (res.ok && res.body.html) {
                setPreviewHtml(res.body.html);
            } else {
                setPreviewHtml('');
                setPreviewError(
                    (res.body && (res.body.message || res.body.code)) ||
                        `Preview failed (HTTP ${res.status}).`
                );
            }
        }).catch(() => {
            setPreviewLoading(false);
            setPreviewError('Network error — could not reach the server.');
        });
    }, [selected.place_id, selected.main_text, options]);

    useEffect(() => {
        clearTimeout(previewDebounceRef.current);
        previewDebounceRef.current = setTimeout(refreshPreview, 250);
        return () => clearTimeout(previewDebounceRef.current);
    }, [options, refreshPreview]);

    const shortcode = buildShortcode(selected, options);

    const handleCopy = () => {
        if (!shortcode) return;
        const writeText = (text) => {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                return navigator.clipboard.writeText(text);
            }
            const ta = document.createElement('textarea');
            ta.value = text;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            return Promise.resolve();
        };
        writeText(shortcode).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };

    return (
        <div className="ep-gr-modal-overlay" onMouseDown={onClose} role="presentation">
            <div
                className="ep-gr-modal"
                role="dialog"
                aria-modal="true"
                aria-label={`Generate shortcode for ${selected.main_text}`}
                onMouseDown={(e) => e.stopPropagation()}
            >
                <header className="ep-gr-modal-header">
                    <div className="ep-gr-modal-title">
                        <span className="ep-gr-modal-title-icon" aria-hidden="true">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="16 18 22 12 16 6" />
                                <polyline points="8 6 2 12 8 18" />
                            </svg>
                        </span>
                        <div>
                            <h2>Embed this place</h2>
                            <p>{selected.main_text}</p>
                        </div>
                    </div>
                    <button type="button" className="ep-gr-modal-close" aria-label="Close" onClick={onClose}>×</button>
                </header>

                <div className="ep-gr-modal-body">
                    <div className="ep-gr-callout">
                        Use the shortcode in <strong>Classic, Bricks, Divi</strong>, or any builder. In <strong>Gutenberg</strong> &amp; <strong>Elementor</strong>, use the dedicated <strong>Google Reviews</strong> block/widget for richer controls.
                    </div>

                    <div className="ep-gr-split">
                        {/* LEFT: controls — mirror the Gutenberg block's free/Pro split */}
                        <div className="ep-gr-split-pane">
                            <h3>Layout</h3>
                            <LayoutTiles value={options.layout} onChange={(v) => updateOption('layout', v)} />

                            <h3 className="ep-gr-h3-spaced">Display</h3>
                            <div className="ep-gr-row ep-gr-row--three">
                                {caps.reviews && (
                                    /* Min. rating ("show only 5★") is PRO — the
                                       highest-demand filter. Locked + crown in free. */
                                    <ProLock locked={!PRO_ACTIVE}>
                                        <div className="ep-gr-field">
                                            <label htmlFor="ep-gr-min-rating">Minimum rating</label>
                                            <select
                                                id="ep-gr-min-rating"
                                                value={options.min_rating}
                                                onChange={(e) => updateOption('min_rating', parseInt(e.target.value, 10))}
                                            >
                                                <option value={0}>Any</option>
                                                <option value={3}>3+</option>
                                                <option value={4}>4+</option>
                                                <option value={5}>5</option>
                                            </select>
                                        </div>
                                    </ProLock>
                                )}
                                {caps.loadMore && (
                                    <div className="ep-gr-field">
                                        <label htmlFor="ep-gr-limit">Reviews per page</label>
                                        <select
                                            id="ep-gr-limit"
                                            value={options.limit}
                                            onChange={(e) => updateOption('limit', parseInt(e.target.value, 10))}
                                        >
                                            {(reviewsPerPageMax > 5
                                                ? [1, 2, 3, 4, 5, 6, 8, 10, 15, 20, 30, 40, 50]
                                                : [1, 2, 3, 4, 5]
                                            ).filter((n) => n <= reviewsPerPageMax).map((n) => (
                                                <option key={n} value={n}>{n}</option>
                                            ))}
                                        </select>
                                    </div>
                                )}
                                {caps.columns && (
                                    <div className="ep-gr-field">
                                        <label htmlFor="ep-gr-columns">Columns</label>
                                        <select
                                            id="ep-gr-columns"
                                            value={options.columns}
                                            onChange={(e) => updateOption('columns', parseInt(e.target.value, 10))}
                                        >
                                            {[1, 2, 3, 4, 5, 6].map((n) => (
                                                <option key={n} value={n}>{n}</option>
                                            ))}
                                        </select>
                                    </div>
                                )}
                            </div>

                            {caps.reviews && (
                                <fieldset className="ep-gr-toggles">
                                    <legend>Review Elements</legend>
                                    <div className="ep-gr-chips">
                                        {[
                                            // Labels kept consistent with the Gutenberg block inspector
                                            // + Elementor widget (Reviewer photo / Star rating / Date /
                                            // Review images / "View on Google" link / Show header).
                                            ['show_photo', 'Reviewer photo', true, false],
                                            ['show_stars', 'Star rating', true, false],
                                            ['show_date', 'Date', true, false],
                                            // Review images are Pro — locked chip in free.
                                            ['show_images', 'Review images', caps.images, true],
                                            ['show_link', '“View on Google” link', true, false],
                                            ['show_summary', 'Show header', true, false],
                                        ].filter(([, , vis]) => vis).map(([k, label, , pro]) => {
                                            const locked = pro && !PRO_ACTIVE;
                                            return (
                                                <label
                                                    key={k}
                                                    className={`ep-gr-chip${options[k] && !locked ? ' is-on' : ''}${locked ? ' is-locked' : ''}`}
                                                    title={locked ? 'Pro feature' : undefined}
                                                    onClick={locked ? (e) => { e.preventDefault(); window.open(UPGRADE_URL, '_blank', 'noopener'); } : undefined}
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={options[k] && !locked}
                                                        disabled={locked}
                                                        onChange={(e) => { if (!locked) updateOption(k, e.target.checked); }}
                                                    />
                                                    {label}{locked && <CrownIcon />}
                                                </label>
                                            );
                                        })}
                                    </div>
                                </fieldset>
                            )}

                            {/* "Load more" — FREE (frontend AJAX pagination of the
                                fetched reviews). Lives in the free zone, not the Pro
                                region. Only for paginatable layouts. */}
                            {caps.loadMore && (
                                <div className="ep-gr-pro-toggles">
                                    <label className={`ep-gr-switch${options.load_more ? ' is-on' : ''}`}>
                                        <input type="checkbox" checked={options.load_more} onChange={(e) => updateOption('load_more', e.target.checked)} />
                                        <span className="ep-gr-switch-track" /> Load More
                                    </label>
                                </div>
                            )}

                            {/* Filtering & style are FREE now (mirrors Essential
                                Addons' free Business Reviews widget) — a plain
                                section divider, no Pro lock. */}
                            <div className="ep-gr-section-divider">
                                <span>Filtering &amp; style</span>
                            </div>

                            <>
                                {caps.reviews && (
                                    <div className="ep-gr-row ep-gr-row--two">
                                        <div className="ep-gr-field">
                                            <label htmlFor="ep-gr-sort">Sort by</label>
                                            <select
                                                id="ep-gr-sort"
                                                value={options.sort}
                                                onChange={(e) => updateOption('sort', e.target.value)}
                                            >
                                                <option value="newest">Newest</option>
                                                <option value="highest">Highest rated</option>
                                                <option value="lowest">Lowest rated</option>
                                                <option value="relevant">Most relevant</option>
                                            </select>
                                        </div>
                                        <div className="ep-gr-field">
                                            <label htmlFor="ep-gr-keyword">Keyword filter</label>
                                            <input
                                                id="ep-gr-keyword"
                                                type="text"
                                                placeholder="e.g. service, staff"
                                                value={options.keyword}
                                                onChange={(e) => updateOption('keyword', e.target.value)}
                                            />
                                        </div>
                                    </div>
                                )}

                                <div className="ep-gr-row ep-gr-row--two">
                                    <div className="ep-gr-field">
                                        <label htmlFor="ep-gr-theme">Theme</label>
                                        <select
                                            id="ep-gr-theme"
                                            value={options.theme}
                                            onChange={(e) => updateOption('theme', e.target.value)}
                                        >
                                            <option value="light">Light</option>
                                            <option value="dark">Dark</option>
                                        </select>
                                    </div>
                                    <div className="ep-gr-field">
                                        <label>Accent color</label>
                                        <div className="ep-gr-swatches">
                                            {ACCENT_SWATCHES.map((s) => (
                                                <button
                                                    key={s.name}
                                                    type="button"
                                                    className={
                                                        'ep-gr-swatch' +
                                                        (options.accent_color === s.color ? ' is-active' : '') +
                                                        (s.color === '' ? ' ep-gr-swatch--none' : '')
                                                    }
                                                    style={s.color ? { background: s.color } : undefined}
                                                    title={s.name}
                                                    aria-label={s.name}
                                                    onClick={() => updateOption('accent_color', s.color)}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                <div className="ep-gr-pro-toggles">
                                    {caps.reviews && (
                                        <label className={`ep-gr-switch${options.hide_empty ? ' is-on' : ''}`}>
                                            <input type="checkbox" checked={options.hide_empty} onChange={(e) => updateOption('hide_empty', e.target.checked)} />
                                            <span className="ep-gr-switch-track" /> Hide reviews with no text
                                        </label>
                                    )}
                                    {caps.autoplay && (
                                        <label className={`ep-gr-switch${options.autoplay ? ' is-on' : ''}`}>
                                            <input type="checkbox" checked={options.autoplay} onChange={(e) => updateOption('autoplay', e.target.checked)} />
                                            <span className="ep-gr-switch-track" /> Autoplay
                                        </label>
                                    )}
                                    <label className={`ep-gr-switch${options.schema ? ' is-on' : ''}`}>
                                        <input type="checkbox" checked={options.schema} onChange={(e) => updateOption('schema', e.target.checked)} />
                                        <span className="ep-gr-switch-track" /> Output review schema (JSON-LD)
                                    </label>
                                </div>
                            </>

                            <div className="ep-gr-field ep-gr-shortcode-field">
                                <div className="ep-gr-shortcode-head">
                                    <label htmlFor="ep-gr-shortcode">Generated shortcode</label>
                                    <span className="ep-gr-shortcode-hint">Paste into any post, page, or builder widget.</span>
                                </div>
                                <div className={`ep-gr-shortcode-row${copied ? ' is-copied' : ''}`}>
                                    <span className="ep-gr-shortcode-prompt" aria-hidden="true">&lt;/&gt;</span>
                                    <textarea
                                        id="ep-gr-shortcode"
                                        rows={1}
                                        readOnly
                                        value={shortcode}
                                        onFocus={(e) => e.target.select()}
                                    />
                                    <button
                                        type="button"
                                        className="ep-gr-shortcode-copy"
                                        disabled={!shortcode}
                                        onClick={handleCopy}
                                        aria-label={copied ? 'Copied' : 'Copy shortcode'}
                                    >
                                        {copied ? (
                                            <>
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                                    <polyline points="20 6 9 17 4 12" />
                                                </svg>
                                                Copied
                                            </>
                                        ) : (
                                            <>
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                                                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                                                </svg>
                                                Copy
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* RIGHT: live preview */}
                        <div className="ep-gr-split-pane">
                            <h3>Live preview</h3>
                            <div className="ep-gr-preview-wrap">
                                {previewLoading && previewHtml && <span className="ep-gr-preview-loading">Updating</span>}
                                {previewError ? (
                                    <p className="ep-gr-inline-note ep-gr-inline-note--error" role="alert">
                                        <strong>Preview failed:</strong> {previewError}
                                    </p>
                                ) : previewHtml ? (
                                    <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
                                ) : (
                                    <div className="ep-gr-preview-skeleton" aria-hidden="true">
                                        <div className="ep-gr-preview-skel-summary">
                                            <span className="ep-gr-skel ep-gr-skel--avatar" />
                                            <div className="ep-gr-preview-skel-summary-lines">
                                                <span className="ep-gr-skel ep-gr-skel--title" />
                                                <span className="ep-gr-skel ep-gr-skel--sub" />
                                            </div>
                                        </div>
                                        {[0, 1, 2].map((i) => (
                                            <div className="ep-gr-preview-skel-card" key={i}>
                                                <div className="ep-gr-preview-skel-card-head">
                                                    <span className="ep-gr-skel ep-gr-skel--avatar" />
                                                    <div className="ep-gr-preview-skel-card-meta">
                                                        <span className="ep-gr-skel ep-gr-skel--title" />
                                                        <span className="ep-gr-skel ep-gr-skel--sub" />
                                                    </div>
                                                </div>
                                                <span className="ep-gr-skel ep-gr-skel--line" />
                                                <span className="ep-gr-skel ep-gr-skel--line" />
                                                <span className="ep-gr-skel ep-gr-skel--line ep-gr-skel--line-short" />
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

/* ---------- Refetch popover (choose how many reviews to pull) ---------- */
const REFETCH_PRESETS = [50, 100, 500];
// Shared: outside-click / Escape close + auto-flip popover above its trigger
// when there isn't enough room below. Measures synchronously in
// useLayoutEffect and keeps the popover invisible until measured, so the
// final position is the first paint — no bottom→top flicker.
// Lighter-weight sibling of usePopoverPlacement for non-modal floating panels
// (e.g. the search-suggestion dropdown). Same flip logic — render above the
// anchor when there's no room below and more room above — but skips the
// outside-click / Escape dismissers because the parent already controls the
// open state (predictions.length > 0).
const useDropdownFlip = (active) => {
    const popRef = useRef(null);
    const [flipUp, setFlipUp] = useState(false);
    const [ready, setReady] = useState(false);

    useLayoutEffect(() => {
        if (!active) { setReady(false); return; }
        const el = popRef.current;
        if (!el) return;
        const measure = () => {
            const anchor = el.offsetParent || el.parentElement;
            if (!anchor) { setReady(true); return; }
            const rect = anchor.getBoundingClientRect();
            const popH = el.offsetHeight || 200;
            const spaceBelow = window.innerHeight - rect.bottom;
            const spaceAbove = rect.top;
            setFlipUp(spaceBelow < popH + 12 && spaceAbove > spaceBelow);
            setReady(true);
        };
        measure();
        // Re-measure when window resizes OR when scroll changes the anchor's
        // viewport position. capture=true catches scrolls in inner regions too.
        window.addEventListener('resize', measure);
        window.addEventListener('scroll', measure, true);
        return () => {
            window.removeEventListener('resize', measure);
            window.removeEventListener('scroll', measure, true);
        };
    }, [active]);

    return [popRef, flipUp, ready];
};

// Returns [ref, flipUp, ready] — apply `is-up` when flipUp, render hidden
// (visibility:hidden) until `ready` to avoid the flash.
const usePopoverPlacement = (onClose) => {
    const popRef = useRef(null);
    const [flipUp, setFlipUp] = useState(false);
    const [ready, setReady] = useState(false);

    useEffect(() => {
        const onDown = (e) => { if (popRef.current && !popRef.current.contains(e.target)) onClose(); };
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDown);
            document.removeEventListener('keydown', onKey);
        };
    }, [onClose]);

    useLayoutEffect(() => {
        const el = popRef.current;
        if (!el) return;
        // Anchor = the popover's positioning parent (the inline-flex wrap
        // around the trigger button). Flip up when the popover would
        // overflow the viewport bottom AND there's more room above.
        const anchor = el.offsetParent || el.parentElement;
        if (!anchor) { setReady(true); return; }
        const rect = anchor.getBoundingClientRect();
        const popH = el.offsetHeight || 200;
        const spaceBelow = window.innerHeight - rect.bottom;
        const spaceAbove = rect.top;
        setFlipUp(spaceBelow < popH + 12 && spaceAbove > spaceBelow);
        setReady(true);
    }, []);

    useEffect(() => {
        const onResize = () => {
            const el = popRef.current;
            if (!el) return;
            const anchor = el.offsetParent || el.parentElement;
            if (!anchor) return;
            const rect = anchor.getBoundingClientRect();
            const popH = el.offsetHeight || 200;
            const spaceBelow = window.innerHeight - rect.bottom;
            const spaceAbove = rect.top;
            setFlipUp(spaceBelow < popH + 12 && spaceAbove > spaceBelow);
        };
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    return [popRef, flipUp, ready];
};

// Most reviews fetchable for one place: the actual count if it's under 1000,
// else 1000. Users can't request more than this (server caps at 1000 too).
const REFETCH_HARD_CAP = 1000;

const RefetchPopover = ({ onConfirm, onClose, total = 0 }) => {
    // Two modes:
    //   quick — incremental: pull newest 50, stop when we hit a review already
    //           in the DB. Cheap. Picks up only NEW reviews since last fetch.
    //   full  — wipe + re-pull the chosen count. Surfaces edits/deletes;
    //           costs more.
    const [mode, setMode] = useState('quick');
    const [count, setCount] = useState('100');
    const [popRef, flipUp, ready] = usePopoverPlacement(onClose);

    // Cap = actual review count when < 1000, otherwise 1000. (0 = unknown → 1000.)
    const maxFetch = total > 0 ? Math.min(total, REFETCH_HARD_CAP) : REFETCH_HARD_CAP;

    const submit = () => {
        if (mode === 'quick') {
            onConfirm({ mode: 'quick', count: 0 }); // count ignored server-side for quick
            return;
        }
        const raw = count === 'all' ? 0 : parseInt(count, 10);
        const n   = Number.isFinite(raw) && raw > 0 ? Math.min(raw, maxFetch) : 0;
        onConfirm({ mode: 'full', count: n });
    };

    return (
        <div
            className={`ep-gr-refetch-pop${flipUp ? ' is-up' : ''}${ready ? '' : ' is-measuring'}`}
            ref={popRef}
            role="dialog"
            aria-label="Refetch reviews"
        >
            <p className="ep-gr-refetch-pop-title">Refetch reviews</p>

            <div className="ep-gr-refetch-modes" role="radiogroup" aria-label="Refetch mode">
                <button
                    type="button"
                    role="radio"
                    aria-checked={mode === 'quick'}
                    className={`ep-gr-refetch-mode${mode === 'quick' ? ' is-active' : ''}`}
                    onClick={() => setMode('quick')}
                >
                    <span className="ep-gr-refetch-mode-title">Quick check</span>
                    <span className="ep-gr-refetch-mode-desc">Only pull new reviews since last fetch (recommended).</span>
                </button>
                <button
                    type="button"
                    role="radio"
                    aria-checked={mode === 'full'}
                    className={`ep-gr-refetch-mode${mode === 'full' ? ' is-active' : ''}`}
                    onClick={() => setMode('full')}
                >
                    <span className="ep-gr-refetch-mode-title">Full refresh</span>
                    <span className="ep-gr-refetch-mode-desc">Wipe and re-pull. Surfaces edits and deleted reviews.</span>
                </button>
            </div>

            {mode === 'full' && (
                <>
                    <div className="ep-gr-refetch-presets">
                        {REFETCH_PRESETS.map((n) => (
                            <button
                                key={n}
                                type="button"
                                className={`ep-gr-refetch-preset${count === String(n) ? ' is-active' : ''}`}
                                onClick={() => setCount(String(n))}
                            >
                                {n}
                            </button>
                        ))}
                        <button
                            type="button"
                            className={`ep-gr-refetch-preset${count === 'all' ? ' is-active' : ''}`}
                            onClick={() => setCount('all')}
                        >
                            All
                        </button>
                    </div>
                    <div className="ep-gr-refetch-custom">
                        <input
                            type="text"
                            inputMode="numeric"
                            value={count === 'all' ? 'All' : count}
                            onChange={(e) => {
                                const digits = e.target.value.replace(/[^0-9]/g, '');
                                if (digits === '') { setCount(''); return; }
                                // Clamp so the user can't enter more than the cap.
                                setCount(String(Math.min(parseInt(digits, 10), maxFetch)));
                            }}
                            onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
                            aria-label="Number of reviews to fetch"
                        />
                        <button type="button" className="button button-primary button-small" onClick={submit}>Fetch</button>
                    </div>
                    <p className="ep-gr-refetch-hint">More reviews = longer fetch time.</p>
                </>
            )}

            {mode === 'quick' && (
                <div className="ep-gr-refetch-actions">
                    <button type="button" className="button button-primary button-small" onClick={submit}>
                        Check now
                    </button>
                </div>
            )}
        </div>
    );
};

/* ---------- Count info popover ---------- */
const CountInfoPopover = ({ fetched, total, onClose }) => {
    const [popRef, flipUp, ready] = usePopoverPlacement(onClose);
    return (
        <div
            className={`ep-gr-refetch-pop ep-gr-info-pop${flipUp ? ' is-up' : ''}${ready ? '' : ' is-measuring'}`}
            ref={popRef}
            role="dialog"
            aria-label="About this count"
        >
            <p className="ep-gr-refetch-pop-title">About this count</p>
            {total > 0 ? (
                <p className="ep-gr-info-pop-count">
                    <strong>{fetched.toLocaleString()}</strong> of {total.toLocaleString()} reviews ready to show
                </p>
            ) : (
                <p className="ep-gr-info-pop-count">
                    <strong>{fetched.toLocaleString()}</strong> reviews ready to show
                </p>
            )}
            {total > fetched ? (
                <p className="ep-gr-info-pop-body">
                    Google may not make all reviews available for automated collection, so the number
                    imported can be lower than the total shown on Google.
                </p>
            ) : null}
            {fetched >= REFETCH_HARD_CAP ? (
                <p className="ep-gr-info-pop-body">EmbedPress keeps up to <strong>{REFETCH_HARD_CAP.toLocaleString()}</strong> reviews per place.</p>
            ) : null}
            <p className="ep-gr-info-pop-note">
                Use <strong>Refetch</strong> to pick up new or updated reviews.
            </p>
        </div>
    );
};

/* ---------- Remove-confirm popover ---------- */
const RemoveConfirmPopover = ({ placeName, onConfirm, onClose }) => {
    const [popRef, flipUp, ready] = usePopoverPlacement(onClose);

    return (
        <div
            className={`ep-gr-refetch-pop ep-gr-confirm-pop${flipUp ? ' is-up' : ''}${ready ? '' : ' is-measuring'}`}
            ref={popRef}
            role="dialog"
            aria-label="Confirm remove"
        >
            <p className="ep-gr-refetch-pop-title">Remove this place?</p>
            <p className="ep-gr-confirm-pop-body">
                <strong>{placeName}</strong> and its cached reviews will be deleted from your library. You can re-add it anytime.
            </p>
            <div className="ep-gr-confirm-pop-actions">
                <button type="button" className="button button-small" onClick={onClose}>Cancel</button>
                <button type="button" className="button button-small button-primary ep-gr-confirm-pop-danger" onClick={onConfirm}>
                    Remove
                </button>
            </div>
        </div>
    );
};

/* ---------- Running status ---------- */
// The pill NEVER repeats the count (the Reviews column already shows the live
// climbing number). Two phases:
//   1. WARM-UP (no count yet) — step through the setup phrases ONCE, in order,
//      then HOLD on the last one. We never loop back ("Connecting…" after
//      "Almost ready…" would read as fake) and never repeat a phrase. The steps
//      mirror the real sequence: connect → open Maps → find place → load.
//   2. FETCHING (count flowing in the Reviews column) — a single stable
//      "Fetching reviews…", no number.
const WARMUP_PHRASES = [
    'Connecting…', 'Opening Google Maps…', 'Finding the place…', 'Loading reviews…',
];

const RunningStatus = ({ fetched = 0, message = '', total = 0 }) => {
    const [idx, setIdx] = useState(0);
    const warming = fetched <= 0 && !message;
    useEffect(() => {
        if (!warming) return;
        // Advance one step at a time and STOP at the last phrase (no wrap-around).
        const t = setInterval(() => {
            setIdx((i) => (i < WARMUP_PHRASES.length - 1 ? i + 1 : i));
        }, 2200);
        return () => clearInterval(t);
    }, [warming]);

    // Message priority (honest, never a frozen canned phrase when real data exists):
    //   1. A real live count from the worker → "Fetching reviews… N of M".
    //   2. The worker's own status message (e.g. "Fetched 40 reviews so far…").
    //   3. WARM-UP: no count and no message yet (spin-up / batch fetch) → step
    //      through the setup phrases and HOLD on the last. This is the only case
    //      that shows canned text — and only while we genuinely have nothing.
    // Show ONLY the climbing count — never "N of M". We cap at 1000 and Google
    // often exposes fewer than a place's advertised total, so "190 of 311"
    // implies a target we may legitimately never reach and makes a complete
    // fetch feel like a shortfall. A bare climbing number is honest and always
    // reads as forward progress.
    let label;
    if (fetched > 0) {
        label = sprintf(__('Fetching reviews… %d', 'embedpress'), fetched);
    } else if (message) {
        label = message;
    } else {
        label = WARMUP_PHRASES[idx];
    }

    return (
        <span className="ep-gr-pill ep-gr-pill--running">
            <span className="ep-gr-spinner" aria-hidden="true" />
            <span className="ep-gr-running-text">{label}</span>
        </span>
    );
};

/* ---------- Root ---------- */
/* ---------- Places manager (DB-backed library) ---------- */
const PlacesManager = () => {
    const [places, setPlaces] = useState([]);
    const [loading, setLoading] = useState(true);
    const [q, setQ] = useState('');
    const [predictions, setPredictions] = useState([]);
    const [searching, setSearching] = useState(false);
    const [noResults, setNoResults] = useState(false);
    const [searchError, setSearchError] = useState(null);
    const [busy, setBusy] = useState('');            // place_id currently refetching/removing
    const [status, setStatus] = useState({ text: '', tone: '' });
    const [scPlace, setScPlace] = useState(null);    // place whose shortcode modal is open
    const [refetchFor, setRefetchFor] = useState(null); // place_id whose refetch popover is open
    const [infoFor, setInfoFor] = useState(null);       // place_id whose count-info popover is open
    const [removeFor, setRemoveFor] = useState(null);   // place_id whose remove-confirm is open
    const [addingId, setAddingId] = useState('');       // place_id being added (locks ALL Add buttons)
    const [copiedId, setCopiedId] = useState('');       // place_id just copied to clipboard (✓ feedback)
    const [apifyConnected, setApifyConnected] = useState(false); // lifts the per-page max to 50
    const debounceRef = useRef(null);
    // Search-suggestions dropdown: flip above the input when the page is
    // scrolled near the bottom and there's no room below. Same behavior as
    // the Refetch / Remove popovers.
    const [suggestRef, suggestFlipUp, suggestReady] = useDropdownFlip(predictions.length > 0);

    const flash = (text, tone) => {
        setStatus({ text, tone });
        setTimeout(() => setStatus({ text: '', tone: '' }), 7000);
    };

    // Guard against OVERLAPPING polls. `/places` drives the worker poll inline
    // server-side, so a slow request can still be in flight when the 2s timer
    // fires the next one. Two overlapping responses carry different live counts,
    // and if the OLDER (lower) one resolves last it overwrites the newer one —
    // the count visibly jumps backwards (620 → 400 → climbs again). We skip a
    // poll while one is pending, and stamp each request so only the latest
    // response is applied.
    const loadInFlight = useRef(false);
    const loadSeq = useRef(0);
    const load = useCallback(() => {
        if (loadInFlight.current) return;          // don't stack polls
        loadInFlight.current = true;
        const seq = ++loadSeq.current;
        api('GET', '/places').then((res) => {
            loadInFlight.current = false;
            if (seq !== loadSeq.current) return;    // a newer poll already won
            setLoading(false);
            if (res.ok && Array.isArray(res.body.places)) {
                // Monotonic live count: while a place is still running, never let
                // its fetched_so_far drop below what we already show (a stale
                // poll must not rewind the climbing number).
                setPlaces((prev) => {
                    const prevById = {};
                    prev.forEach((p) => { prevById[p.place_id] = p; });
                    return res.body.places.map((np) => {
                        const op = prevById[np.place_id];
                        const stillRunning = np.fetch_status === 'running' || np.fetch_status === 'queued';
                        if (op && stillRunning && (op.fetch_status === 'running' || op.fetch_status === 'queued')) {
                            const hi = Math.max(np.fetched_so_far || 0, op.fetched_so_far || 0);
                            return { ...np, fetched_so_far: hi };
                        }
                        return np;
                    });
                });
            }
        }).catch(() => { loadInFlight.current = false; });
    }, []);

    useEffect(() => { load(); }, [load]);

    // Whether an Apify token is connected — lifts the shortcode generator's
    // "Reviews per page" choices from Google's 5-review cap to 50.
    useEffect(() => {
        api('GET', '/settings').then((res) => {
            if (res.ok) setApifyConnected(!!res.body.apify_token_configured);
        });
    }, []);

    // Whether search is allowed. Search goes through whatever provider is
    // active; when that provider is the hosted EmbedPress API and the site
    // isn't connected, the backend refuses with `embedpress_gr_not_connected`
    // (403). We learn that from the search response and show a connect prompt —
    // this is provider-aware (a user with their own Google/Apify key is NOT
    // blocked, because the backend doesn't block them). `null` = unknown.
    const [apiConnected, setApiConnected] = useState(null);
    const [consentBusy, setConsentBusy] = useState(false);
    const [consentError, setConsentError] = useState('');

    // Explicit consent: nothing is sent to api.embedpress.com until the admin
    // clicks Connect next to the disclosure above. The connected event re-runs
    // the pending search via the listener below.
    const handleConsentConnect = () => {
        setConsentBusy(true);
        setConsentError('');
        api('POST', '/managed/connect').then((res) => {
            setConsentBusy(false);
            if (res.ok && res.body && res.body.connected) {
                window.dispatchEvent(new CustomEvent('ep-gr-connection-changed', { detail: { connected: true } }));
            } else {
                setConsentError((res.body && res.body.message) || 'Couldn’t connect. Try again.');
            }
        });
    };

    // Update the connection state in REAL TIME when the user connects/
    // disconnects in the card above (no page reload needed). The
    // EmbedPressApiCard fires 'ep-gr-connection-changed' on connect/disconnect.
    // NOTE: we DON'T pre-block from /managed/status on mount — that's not
    // provider-aware (an own-key user shows managed=disconnected but can still
    // search). The search 403 is the authoritative block signal; the event only
    // flips state when the user actually connects/disconnects here, so the
    // prompt clears instantly on connect and re-appears instantly on disconnect.
    useEffect(() => {
        const onConn = (e) => {
            const connected = !!(e.detail && e.detail.connected);
            // apiConnected is in the search effect's deps, so flipping it re-runs
            // the search for the current query — results appear without retyping.
            setSearchError(null);
            setApiConnected(connected);
        };
        window.addEventListener('ep-gr-connection-changed', onConn);
        return () => window.removeEventListener('ep-gr-connection-changed', onConn);
    }, []);

    // Live progress: while any place's background fetch is running/queued, poll
    // the list every 2s so the admin sees "fetching… N so far" fill in.
    // The proxy worker writes progress at ~1.8s cadence; 2s matches that so
    // the visible count climbs smoothly instead of jumping in chunks.
    const anyRunning = places.some((p) => p.fetch_status === 'running' || p.fetch_status === 'queued');
    useEffect(() => {
        if (!anyRunning) return undefined;
        const t = setInterval(load, 2000);
        return () => clearInterval(t);
    }, [anyRunning, load]);

    // Session-token UUID — reused across every keystroke of one picking
    // session so Google Places bills the whole sequence as 1 event, not N.
    const sessionRef = useRef({ token: '', mintedAt: 0 });
    const countsSeqRef = useRef(0);
    const [countsLoading, setCountsLoading] = useState(false);
    const getSession = () => {
        const now = Date.now();
        if (!sessionRef.current.token || now - sessionRef.current.mintedAt > SESSION_TOKEN_TTL_MS) {
            sessionRef.current = { token: newSessionToken(), mintedAt: now };
        }
        return sessionRef.current.token;
    };
    const endSession = () => { sessionRef.current = { token: '', mintedAt: 0 }; };

    // Search autocomplete (debounced).
    useEffect(() => {
        clearTimeout(debounceRef.current);
        setSearchError(null);
        // Already known not-connected → skip the call; show the connect prompt.
        if (apiConnected === false) { setPredictions([]); setNoResults(false); setSearching(false); return; }
        // Min 3 chars + a longer debounce: search can run through Apify, where
        // every query is a slow, billed actor run — wait until typing stops.
        if (q.trim().length < 3) { setPredictions([]); setNoResults(false); return; }
        setSearching(true);
        debounceRef.current = setTimeout(() => {
            api('GET', '/search', { q: q.trim(), session_token: getSession() }).then((res) => {
                setSearching(false);
                if (res.ok && Array.isArray(res.body.predictions)) {
                    setApiConnected(true);
                    setPredictions(res.body.predictions);
                    setNoResults(res.body.predictions.length === 0);
                    hydrateCounts(res.body.predictions, countsSeqRef, setPredictions, setCountsLoading);
                } else if (res.body && res.body.code === 'embedpress_gr_not_connected') {
                    // Backend refused: search needs the EmbedPress API connection.
                    setApiConnected(false);
                    setPredictions([]);
                    setNoResults(false);
                } else {
                    setPredictions([]);
                    setNoResults(false);
                    setSearchError(
                        (res.body && (res.body.message || res.body.code)) ||
                            `Search failed (HTTP ${res.status}).`
                    );
                }
            }).catch(() => {
                setSearching(false);
                setPredictions([]);
                setNoResults(false);
                setSearchError('Network error — could not reach the server.');
            });
        }, 800);
        return () => clearTimeout(debounceRef.current);
    }, [q, apiConnected]);

    // Copy a place's raw Place ID to the clipboard (the ID is masked in the UI;
    // this is how users grab the real value when they need it).
    const copyPlaceId = (place_id) => {
        const writeText = (text) => {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                return navigator.clipboard.writeText(text);
            }
            const ta = document.createElement('textarea');
            ta.value = text;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            return Promise.resolve();
        };
        writeText(place_id).then(() => {
            setCopiedId(place_id);
            setTimeout(() => setCopiedId((cur) => (cur === place_id ? '' : cur)), 2000);
        });
    };

    const addPlace = (place_id, place_name, place_address = '', meta = {}) => {
        if (addingId) return; // an add is already in flight — ignore double-clicks
        endSession(); // user picked — close out the billing session
        setAddingId(place_id); // locks ALL Add buttons (spinner on the clicked one)
        // Seed the search result's total review count + rating so the row shows
        // the real numbers immediately, before the background fetch finishes.
        const seed = {};
        if (meta.total != null && Number(meta.total) > 0) seed.total = Number(meta.total);
        if (meta.rating != null && Number(meta.rating) > 0) seed.rating = Number(meta.rating);
        api('POST', '/places', null, { action: 'add', place_id, place_name: place_name || '', place_address: place_address || '', ...seed }).then((res) => {
            setAddingId('');
            if (res.ok) {
                setPlaces(res.body.places || []);
                setQ(''); setPredictions([]); setNoResults(false); setSearchError(null);
                // After the instant fetch, the place card already shows the
                // first 5 reviews + rating. Mention "Fetch all" only when there
                // are more than 5 to pull, so the success message matches what
                // the user is actually seeing in the row.
                const added = (res.body.places || []).find((x) => x.place_id === place_id);
                if (added && added.total && added.total > added.review_count) {
                    flash(`Place added — showing ${added.review_count} of ${added.total} reviews. Refetch to pull more.`, 'success');
                } else {
                    flash('Place added.', 'success');
                }
            } else flash('Couldn’t add that place. Try again.', 'error');
        }).catch(() => {
            setAddingId('');
            flash('Couldn’t add that place. Try again.', 'error');
        });
    };

    // Refetch a place's reviews. Two modes:
    //   quick — incremental check (server uses fingerprint matching to stop
    //           on first already-stored review); user picks no count.
    //   full  — wipe + re-pull `count` reviews (0 = all up to ceiling).
    // Runs as the background batched job (returns immediately; status polls in).
    const refetchPlace = (place_id, { mode, count }) => {
        setRefetchFor(null);
        setBusy(place_id);
        // 'all' (string) means "no cap" — server expands it to MAX_REVIEWS_PER_JOB
        // and the worker bails out when Google stops returning new reviews.
        // A numeric string ('100') is a soft cap and shows up verbatim in the toast.
        const isAll = count === 'all' || count === '' || !count;
        api('POST', '/places', null, {
            action: 'refetch',
            place_id,
            fetch_max: isAll ? 0 : Number(count) || 0,
            sort: 'newest',
            mode: mode === 'full' ? 'full' : 'quick',
        }).then((res) => {
            setBusy('');
            if (res.ok) {
                setPlaces(res.body.places || []);
                // In-progress, not done — use the neutral 'info' tone, not green.
                flash(
                    mode === 'quick'
                        ? 'Checking for new reviews…'
                        : (isAll
                            ? 'Fetching all reviews in the background…'
                            : `Fetching up to ${count} reviews in the background…`),
                    'info'
                );
            } else flash((res.body && res.body.message) || 'Couldn’t start the refetch. Try again.', 'error');
        });
    };

    const removePlace = (place_id) => {
        setRemoveFor(null);
        setBusy(place_id);
        api('POST', '/places', null, { action: 'remove', place_id }).then((res) => {
            setBusy('');
            if (res.ok) { setPlaces(res.body.places || []); flash('Place removed.', 'success'); }
            else flash('Couldn’t remove that place.', 'error');
        });
    };

    const savedIds = new Set(places.map((p) => p.place_id));
    const fmtDate = (s) => (s ? new Date(s.replace(' ', 'T')).toLocaleString() : '—');

    return (
        <section className="ep-gr-card">
            <header className="ep-gr-card-header">
                <span className="ep-gr-step-badge">2</span>
                <div className="ep-gr-card-headtext">
                    <h2>Add your places</h2>
                    <p>
                        Search and save the Google Businesses you want to display. Reviews are stored on
                        your site, so every block, widget, and shortcode reuses them — no repeat lookups.
                        Hit <strong>Refetch</strong> anytime to pull the latest.
                    </p>
                </div>
            </header>

            <div className="ep-gr-card-body">
                {/* Search + add */}
                <div className="ep-gr-field">
                    <label htmlFor="ep-gr-place-search"><strong>Add a place</strong></label>
                    <input
                        id="ep-gr-place-search"
                        type="text"
                        autoComplete="off"
                        placeholder="e.g. Sydney Opera House"
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                    />
                    {/* Not connected → searching is disabled; prompt to connect
                      * right in the results area the moment the user types. */}
                    {apiConnected === false && q.trim().length > 0 && (
                        <div className="ep-gr-inline-note ep-gr-inline-note--error ep-gr-consent" role="alert">
                            <p>
                                <strong>Place search uses the EmbedPress API.</strong>{' '}
                                Connecting sends your site URL, a one-way install fingerprint and your EmbedPress/WordPress
                                versions to api.embedpress.com; searches then send the text you type.{' '}
                                <a href="https://wpdeveloper.com/privacy-policy" target="_blank" rel="noopener noreferrer">Privacy policy</a>
                            </p>
                            <button type="button" className="button button-primary" disabled={consentBusy} onClick={handleConsentConnect}>
                                {consentBusy ? 'Connecting…' : 'Connect to EmbedPress API'}
                            </button>
                            {consentError && <span className="ep-gr-consent-error">{consentError}</span>}
                        </div>
                    )}
                    {searching && !searchError && <p className="description">Searching…</p>}
                    {predictions.length > 0 && (
                        <div
                            ref={suggestRef}
                            className={`ep-gr-suggestions-panel${suggestFlipUp ? ' is-up' : ''}${suggestReady ? '' : ' is-measuring'}`}
                        >
                        <ul className="ep-gr-suggestions">
                            {predictions.map((p) => {
                                const already = savedIds.has(p.place_id);
                                // An add in flight locks EVERY Add button; the
                                // clicked row shows a spinner, the rest go busy.
                                const adding = addingId === p.place_id;
                                const busyAdd = !!addingId;
                                return (
                                    <li key={p.place_id}>
                                        <button
                                            type="button"
                                            className={`ep-gr-suggestion${busyAdd ? ' is-adding-busy' : ''}`}
                                            disabled={busyAdd}
                                            aria-busy={adding}
                                            onClick={() => {
                                                if (busyAdd) return;
                                                addPlace(p.place_id, p.main_text || p.description, p.secondary_text || '', {
                                                    total: p.review_count,
                                                    rating: p.rating,
                                                });
                                            }}
                                        >
                                            <PinIcon />
                                            <span className="ep-gr-suggestion-body">
                                                <strong>{p.main_text || p.description}</strong>
                                                {p.secondary_text && <span>{p.secondary_text}</span>}
                                                <SuggestionMeta rating={p.rating} count={p.review_count} loading={countsLoading} />
                                            </span>
                                            {adding ? (
                                                <em className="ep-gr-suggestion-add ep-gr-suggestion-add--loading">
                                                    <span className="ep-gr-spinner" aria-hidden="true" /> {__('Adding…', 'embedpress')}
                                                </em>
                                            ) : already ? (
                                                <em className="ep-gr-already">{__('already added', 'embedpress')}</em>
                                            ) : (
                                                <em className="ep-gr-suggestion-add">+ {__('Add', 'embedpress')}</em>
                                            )}
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                        </div>
                    )}
                    {!searching && noResults && !searchError && (
                        <p className="ep-gr-inline-note ep-gr-inline-note--muted">
                            No matches for “{q.trim()}”. Try a different spelling or include the city.
                        </p>
                    )}
                    {searchError && (
                        <p className="ep-gr-inline-note ep-gr-inline-note--error" role="alert">
                            <strong>Search failed:</strong> {searchError}
                            {/missing|api[_ ]?key|not configured|no_key|not connected/i.test(searchError) && (
                                <> {' '}Connect a provider in <strong>step 1</strong> above before searching.</>
                            )}
                        </p>
                    )}
                </div>

                {/* Saved places table */}
                {loading ? (
                    <table className="ep-gr-places-table ep-gr-places-table--skeleton" aria-hidden="true">
                        <thead>
                            <tr>
                                <th className="ep-gr-col-place">Place</th>
                                <th className="ep-gr-col-num">Reviews</th>
                                <th className="ep-gr-col-num">Rating</th>
                                <th className="ep-gr-col-status">Last fetched</th>
                                <th className="ep-gr-col-actions"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {[0, 1, 2].map((i) => (
                                <tr key={i}>
                                    <td className="ep-gr-col-place">
                                        <span className="ep-gr-skel ep-gr-skel--title" />
                                        <span className="ep-gr-skel ep-gr-skel--sub" />
                                    </td>
                                    <td className="ep-gr-col-num"><span className="ep-gr-skel ep-gr-skel--num" /></td>
                                    <td className="ep-gr-col-num"><span className="ep-gr-skel ep-gr-skel--num" /></td>
                                    <td><span className="ep-gr-skel ep-gr-skel--text" /></td>
                                    <td className="ep-gr-col-actions"><span className="ep-gr-skel ep-gr-skel--btn" /></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                ) : places.length === 0 ? (
                    <div className="ep-gr-places-empty">
                        <p>No places saved yet.</p>
                        <p className="description">Search above to add a Google Business, then Refetch it to load its reviews.</p>
                    </div>
                ) : (
                    <table className="ep-gr-places-table">
                        <thead>
                            <tr>
                                <th className="ep-gr-col-place">Place</th>
                                <th className="ep-gr-col-num">Reviews</th>
                                <th className="ep-gr-col-num">Rating</th>
                                <th className="ep-gr-col-status">Last fetched</th>
                                <th className="ep-gr-col-actions"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {places.map((p) => {
                                const running = p.fetch_status === 'running' || p.fetch_status === 'queued';
                                const failed = p.fetch_status === 'failed';
                                return (
                                    <tr key={p.place_id} className={running ? 'is-running' : ''}>
                                        <td className="ep-gr-col-place">
                                            <span className="ep-gr-place-cell">
                                                <PinIcon />
                                                <span className="ep-gr-place-cell-body">
                                                    <span className="ep-gr-place-title">
                                                        <strong>{p.place_name || maskId(p.place_id)}</strong>
                                                        <button
                                                            type="button"
                                                            className={`ep-gr-copy-id${copiedId === p.place_id ? ' is-copied' : ''}`}
                                                            onClick={() => copyPlaceId(p.place_id)}
                                                            aria-label={copiedId === p.place_id ? __('Place ID copied', 'embedpress') : __('Copy Place ID', 'embedpress')}
                                                            data-tip={copiedId === p.place_id ? __('Place ID copied!', 'embedpress') : `${__('Copy Place ID', 'embedpress')} · ${maskId(p.place_id)}`}
                                                        >
                                                            {copiedId === p.place_id ? (
                                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                                                    <polyline points="20 6 9 17 4 12" />
                                                                </svg>
                                                            ) : (
                                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                                                    <rect x="9" y="9" width="11" height="11" rx="2" />
                                                                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                                                                </svg>
                                                            )}
                                                        </button>
                                                    </span>
                                                    {p.address && <span className="ep-gr-place-address">{p.address}</span>}
                                                    {/* Show the place's ACTUAL total review count (p.total),
                                                      * not how many we fetched/stored (p.review_count). */}
                                                    <SuggestionMeta rating={p.rating || null} count={p.total || (p.review_count != null ? p.review_count : null)} />
                                                </span>
                                            </span>
                                        </td>
                                        <td className="ep-gr-col-num">
                                            {running && p.fetched_so_far
                                                ? <b className="ep-gr-count-live">{p.fetched_so_far}</b>
                                                : (p.last_fetched_at || p.review_count)
                                                    ? (
                                                        <span className="ep-gr-count-wrap">
                                                            <b>{p.review_count}</b>
                                                            {/* Info icon only when we fetched fewer than
                                                              * Google's total — i.e. there's a gap to
                                                              * explain. Fully-fetched places show just
                                                              * the number. */}
                                                            {p.total && p.review_count < p.total && (
                                                                <>
                                                                    <button
                                                                        type="button"
                                                                        className="ep-gr-info-btn"
                                                                        aria-label="About this count"
                                                                        title="About this count"
                                                                        onClick={() => setInfoFor(infoFor === p.place_id ? null : p.place_id)}
                                                                    >
                                                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                                                            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
                                                                            <path d="M12 11v5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                                                                            <circle cx="12" cy="8" r="1.2" fill="currentColor" />
                                                                        </svg>
                                                                    </button>
                                                                    {infoFor === p.place_id && (
                                                                        <CountInfoPopover
                                                                            fetched={p.review_count}
                                                                            total={p.total || 0}
                                                                            onClose={() => setInfoFor(null)}
                                                                        />
                                                                    )}
                                                                </>
                                                            )}
                                                        </span>
                                                    )
                                                    : <span className="ep-gr-muted">—</span>}
                                        </td>
                                        <td className="ep-gr-col-num">{p.rating ? <span className="ep-gr-rating">{p.rating}★</span> : <span className="ep-gr-muted">—</span>}</td>
                                        <td className="ep-gr-col-status">
                                            {running ? (
                                                <RunningStatus fetched={p.fetched_so_far || 0} message={p.fetch_message || ''} total={p.total || 0} />
                                            ) : failed ? (
                                                <span className="ep-gr-pill ep-gr-pill--error" title={p.fetch_message || ''}>Failed</span>
                                            ) : p.last_fetched_at ? (
                                                <span className="ep-gr-fetched-at">{fmtDate(p.last_fetched_at)}</span>
                                            ) : (
                                                <span className="ep-gr-muted">Not fetched yet</span>
                                            )}
                                        </td>
                                        <td className="ep-gr-col-actions">
                                            <div className="ep-gr-actions-row">
                                                <button
                                                    type="button"
                                                    className="ep-gr-icon-btn"
                                                    title={p.last_fetched_at ? 'Get shortcode' : 'Refetch this place first to load reviews'}
                                                    aria-label="Get shortcode"
                                                    disabled={!p.last_fetched_at || running}
                                                    onClick={() => setScPlace(p)}
                                                >
                                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                                        <polyline points="8 7 3 12 8 17" />
                                                        <polyline points="16 7 21 12 16 17" />
                                                    </svg>
                                                </button>
                                                <span className="ep-gr-refetch-wrap">
                                                    <button
                                                        type="button"
                                                        className={`button button-small${busy === p.place_id ? ' is-loading' : ''}`}
                                                        disabled={busy === p.place_id || running}
                                                        aria-haspopup="dialog"
                                                        aria-expanded={refetchFor === p.place_id}
                                                        onClick={() => setRefetchFor(refetchFor === p.place_id ? null : p.place_id)}
                                                    >
                                                        {busy === p.place_id ? (
                                                            <>
                                                                <span className="ep-gr-spinner" aria-hidden="true" />
                                                                Starting…
                                                            </>
                                                        ) : 'Refetch'}
                                                    </button>
                                                    {refetchFor === p.place_id && (
                                                        <RefetchPopover
                                                            total={p.total || p.review_count || 0}
                                                            onConfirm={(choice) => refetchPlace(p.place_id, choice)}
                                                            onClose={() => setRefetchFor(null)}
                                                        />
                                                    )}
                                                </span>
                                                <span className="ep-gr-refetch-wrap">
                                                    <button
                                                        type="button"
                                                        className="button button-small button-link-delete"
                                                        disabled={busy === p.place_id}
                                                        aria-haspopup="dialog"
                                                        aria-expanded={removeFor === p.place_id}
                                                        onClick={() => setRemoveFor(removeFor === p.place_id ? null : p.place_id)}
                                                    >
                                                        Remove
                                                    </button>
                                                    {removeFor === p.place_id && (
                                                        <RemoveConfirmPopover
                                                            placeName={p.place_name || p.place_id}
                                                            onConfirm={() => removePlace(p.place_id)}
                                                            onClose={() => setRemoveFor(null)}
                                                        />
                                                    )}
                                                </span>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
                {status.text && (
                    <span className={`ep-gr-status ep-gr-status--${status.tone}`} aria-live="polite">{status.text}</span>
                )}
            </div>

            {scPlace && <ShortcodeModal place={scPlace} apifyConnected={apifyConnected} onClose={() => setScPlace(null)} />}
        </section>
    );
};

const GoogleReviews = () => {
    return (
        <div className="ep-gr-app">
            <header className="ep-gr-page-title">
                <div className="ep-gr-page-title-main">
                    <h1>Google Reviews</h1>
                    <p>
                        Embed Google Business reviews on any page, post, or page-builder widget — search
                        a place, pick your options, and copy the shortcode.
                    </p>
                </div>
                <a
                    className="ep-gr-doc-link"
                    href="https://embedpress.com/docs/embed-google-reviews-in-wordpress/"
                    target="_blank"
                    rel="noopener noreferrer"
                >
                    Read the documentation
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path d="M7 17 17 7M7 7h10v10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                </a>
            </header>

            <div className="ep-gr-stack">
                <EmbedPressApiCard />
                <PlacesManager />
            </div>
        </div>
    );
};

export default GoogleReviews;
