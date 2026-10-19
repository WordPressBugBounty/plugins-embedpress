<?php

namespace EmbedPress\Analytics;

/**
 * EmbedPress Analytics Page Handler
 * 
 * Manages the standalone analytics page with React component mounting
 */
class Analytics
{
    /**
     * Initialize hooks
     */
    public function __construct()
    {
        add_action('admin_menu', [$this, 'register_submenu']);
        add_action('admin_enqueue_scripts', [$this, 'enqueue_analytics_scripts']);
    }

    /**
     * Register the submenu page under EmbedPress menu
     */
    public function register_submenu()
    {
        add_submenu_page(
            'embedpress',                    // Parent slug
            __('Analytics', 'embedpress'),   // Page title
            __('Analytics', 'embedpress'),   // Menu title
            'manage_options',                // Capability
            'embedpress-analytics',          // Menu slug
            [$this, 'render_analytics_page'] // Callback to render page
        );
    }

    /**
     * Enqueue analytics scripts and styles
     */
    public function enqueue_analytics_scripts($hook)
    {
        // Only load on the analytics page
        if ($hook !== 'embedpress_page_embedpress-analytics') {
            return;
        }

        // Enqueue the analytics script (this should be built by Vite)
        // wp-hooks: the dashboard exposes extension slots via
        // wp.hooks.applyFilters() that Pro fills with its own components
        // (geo map, export control). The bundle reads them off the global, so
        // the package must be loaded before it runs.
        wp_enqueue_script(
            'embedpress-analytics',
            EMBEDPRESS_URL_ASSETS . 'js/analytics.build.js',
            // React comes from WordPress's own handles, not the bundle.
            // wp-hooks: Pro registers its analytics filters on the shared registry.
            \EmbedPress\Core\AssetManager::with_react_deps(['wp-element', 'wp-i18n', 'wp-hooks']),
            EMBEDPRESS_PLUGIN_VERSION,
            true
        );

        // Wire JS translations so `__('Foo','embedpress')` in the analytics
        // bundle resolves against languages/embedpress-{locale}-embedpress-analytics.json.
        if (function_exists('wp_set_script_translations')) {
            wp_set_script_translations(
                'embedpress-analytics',
                'embedpress',
                defined('EMBEDPRESS_PATH_BASE') ? EMBEDPRESS_PATH_BASE . 'languages' : false
            );
        }

        // Add module attribute for ES modules. `$tag` also carries the handle's
        // translations and any inline before/after scripts, so only the bundle's
        // own tag (id="embedpress-analytics-js") is rewritten — an inline script
        // turned into a module would lose its synchronous execution.
        add_filter('script_loader_tag', function($tag, $handle) {
            if ($handle === 'embedpress-analytics') {
                return preg_replace(
                    '/<script(?=[^>]*\\bid=([\'"])embedpress-analytics-js\\1)/',
                    '<script type="module"',
                    $tag,
                    1
                );
            }
            return $tag;
        }, 10, 2);

        // Enqueue analytics styles
        wp_enqueue_style(
            'embedpress-analytics',
            EMBEDPRESS_URL_ASSETS . 'css/analytics.build.css',
            [],
            EMBEDPRESS_PLUGIN_VERSION
        );

        // Localize script with API settings
        $tracking_enabled = get_option('embedpress_analytics_tracking_enabled', true);
        wp_localize_script('embedpress-analytics', 'embedpressAnalyticsData', [
            'restUrl' => rest_url('embedpress/v1/analytics/'),
            'nonce' => wp_create_nonce('wp_rest'),
            'ajaxUrl' => admin_url('admin-ajax.php'),
            'cacheNonce' => wp_create_nonce('embedpress_clear_cache'),
            'isProActive' => defined('EMBEDPRESS_SL_ITEM_SLUG'),
            'currentUser' => wp_get_current_user()->ID,
            'siteUrl' => site_url(),
            'trackingEnabled' => (bool) $tracking_enabled,
            'geolocationEnabled' => \EmbedPress\Includes\Classes\Analytics\Geolocation::is_lookup_enabled(),
        ]);

        // Also make WordPress REST API settings available
        wp_localize_script('embedpress-analytics', 'wpApiSettings', [
            'root' => rest_url(),
            'nonce' => wp_create_nonce('wp_rest'),
        ]);
    }

    /**
     * Render the Analytics page with a React root div
     */
    public function render_analytics_page()
    {
?>
    <div id="embedpress-analytics-root"></div>

<?php
    }
}
