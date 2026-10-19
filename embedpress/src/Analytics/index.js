
/**
 * EmbedPress Analytics Page Entry Point
 * Standalone analytics component for the admin analytics page
 */

import React from 'react';
import { createRoot } from 'react-dom/client';
import AnalyticsDashboard from './components/AnalyticsDashboard';

import './style.scss';

/**
 * Share this bundle's React with extension bundles.
 *
 * This build does not externalize React (see vite.config.js), so the
 * dashboard runs on a React instance private to this file. Anything that
 * renders into the same tree — Pro's geo map and export control, supplied
 * through the wp.hooks slots — must use that exact instance: two React copies
 * in one tree produce "Invalid hook call" the moment the injected component
 * calls a hook.
 *
 * Exposing it here lets those bundles bind to it instead of shipping or
 * resolving their own.
 */
window.EmbedPressAnalyticsReact = React;

const AnalyticsApp = () => {
    return (
        <div className="embedpress-analytics-wrapper">
            <AnalyticsDashboard />
        </div>
    );
};

// Initialize the analytics app when DOM is ready
const initAnalytics = () => {
    const container = document.getElementById('embedpress-analytics-root');
    if (container) {
        const root = createRoot(container);
        root.render(<AnalyticsApp />);
    }
};

// Auto-initialize if DOM is ready, otherwise wait for it
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAnalytics);
} else {
    initAnalytics();
}

// Export for manual initialization if needed
window.EmbedPressAnalytics = {
    init: initAnalytics,
    component: AnalyticsApp
};

export default AnalyticsApp;
