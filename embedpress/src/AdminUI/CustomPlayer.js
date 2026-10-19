/**
 * Player & Engagement admin page (free) — upgrade panel.
 *
 * The Leads / Drop-off Heatmap / Completions dashboards are EmbedPress Pro
 * features: Pro registers its own page on the same slug (Admin_Page) with
 * its own dashboard bundle. Free shows the same header and tabs with an
 * upgrade panel in the body.
 */

import React, { useState, useEffect } from 'react';
import { __ } from '@wordpress/i18n';

const Header = () => (
    <div className="ep-cp__header">
        <div className="ep-cp__header-inner">
            <div className="ep-cp__brand">
                <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
                    <rect width="36" height="36" rx="8" fill="#5B4E96" />
                    <path d="M14 12 L14 24 L24 18 Z" fill="#fff" />
                </svg>
                <div>
                    <h1 className="ep-cp__title">{__('Player & Engagement', 'embedpress')}</h1>
                    <p className="ep-cp__subtitle">{__('Marketing & learning data captured from your videos', 'embedpress')}</p>
                </div>
            </div>
        </div>
    </div>
);

const TabBar = ({ tab, onChange, counts }) => {
    const items = [
        { key: 'leads', label: __('Leads', 'embedpress'), hint: __('Email captures', 'embedpress') },
        { key: 'heatmap', label: __('Drop-off Heatmap', 'embedpress'), hint: __('Where viewers leave', 'embedpress') },
        { key: 'completions', label: __('Completions', 'embedpress'), hint: __('Watch-through events', 'embedpress') },
    ];
    return (
        <div className="ep-cp__tabs" role="tablist">
            {items.map((it) => (
                <button
                    key={it.key}
                    role="tab"
                    aria-selected={tab === it.key}
                    className={`ep-cp__tab ${tab === it.key ? 'ep-cp__tab--active' : ''}`}
                    onClick={() => onChange(it.key)}
                >
                    <span className="ep-cp__tab-label">{it.label}</span>
                    <span className="ep-cp__tab-hint">{it.hint}</span>
                    {counts[it.key] !== undefined && counts[it.key] !== null && (
                        <span className="ep-cp__tab-count">{counts[it.key]}</span>
                    )}
                </button>
            ))}
        </div>
    );
};

/* ---------- UPGRADE PANEL ---------- */

const UPGRADE_URL = 'https://wpdeveloper.com/in/upgrade-embedpress';

const UPGRADE_FEATURES = [
    __('Email Capture', 'embedpress'),
    __('Drop-Off Heatmap', 'embedpress'),
    __('Action Lock', 'embedpress'),
    __('Timed CTAs', 'embedpress'),
    __('Chapters', 'embedpress'),
    __('LMS Completion', 'embedpress'),
];

const UpgradePanel = () => (
    <div className="ep-cp__upgrade">
        <span className="ep-cp__upgrade-lock" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
        </span>
        <h2 className="ep-cp__upgrade-title">{__('Engagement data lives in Pro', 'embedpress')}</h2>
        <p className="ep-cp__upgrade-body">{UPGRADE_FEATURES.join(' · ')}</p>
        <a href={UPGRADE_URL} target="_blank" rel="noopener noreferrer" className="ep-cp__upgrade-cta">
            {__('Unlock Pro', 'embedpress')}
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
        </a>
    </div>
);

/* ---------- ROOT ---------- */

const CustomPlayer = () => {
    const [tab, setTab] = useState(() => {
        const u = new URLSearchParams(window.location.search);
        return u.get('tab') || 'leads';
    });

    useEffect(() => {
        const u = new URLSearchParams(window.location.search);
        u.set('tab', tab);
        window.history.replaceState(null, '', window.location.pathname + '?' + u.toString());
    }, [tab]);

    return (
        <div className="ep-cp">
            <Header />
            <TabBar tab={tab} onChange={setTab} counts={{}} />
            <div className="ep-cp__body">
                <div className="ep-cp__panel"><UpgradePanel /></div>
            </div>
        </div>
    );
};

export default CustomPlayer;
