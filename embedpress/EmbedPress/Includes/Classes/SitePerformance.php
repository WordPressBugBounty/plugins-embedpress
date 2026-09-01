<?php

/**
 * Site Performance — install and activate xSpeed Cache from the onboarding wizard.
 *
 * The toggle means "install and activate xSpeed". Whether page caching is then
 * turned ON is not ours to decide: it depends on whether anything already owns
 * the page cache on this site. That question is answered by the portable
 * Detector in includes/Vendor/page-cache-safety/, copied from the xSpeed repo.
 *
 * @package EmbedPress
 */

namespace EmbedPress\Includes\Classes;

defined('ABSPATH') || exit;

use WPDeveloper\PageCacheSafety\Detector;
use WPDeveloper\PageCacheSafety\Setup;

class SitePerformance
{
    /**
     * Records that EmbedPress is the one that installed xSpeed, so we can
     * describe the outcome honestly on a later screen.
     */
    const INSTALLED_BY_US_OPTION = 'embedpress_site_performance_installed';

    /**
     * Load the vendored detector + setup pair.
     *
     * Both are guarded with class_exists() internally, so another WPDeveloper
     * plugin carrying its own copy does not fatal — first one loaded wins.
     */
    private static function load()
    {
        $dir = EMBEDPRESS_PLUGIN_DIR_PATH . 'includes/Vendor/page-cache-safety/';

        if (!class_exists('\WPDeveloper\PageCacheSafety\Detector')) {
            require_once $dir . 'class-page-cache-safety.php';
        }
        if (!class_exists('\WPDeveloper\PageCacheSafety\Setup')) {
            require_once $dir . 'class-page-cache-setup.php';
        }
    }

    /**
     * The state the onboarding card renders from.
     *
     * @return array{
     *     available:bool, installed:bool, active:bool,
     *     field_clear:bool, state:string, blocker:string
     * }
     */
    public static function get_status()
    {
        self::load();

        $installed = Setup::is_installed();
        $active    = Setup::is_active();
        $supported = Setup::is_supported();

        // is_field_clear() is true only when nothing owns the page cache AND
        // nothing about the site's state was unreadable or ambiguous. "We could
        // not tell" is not "the field is clear".
        $field_clear = Detector::is_field_clear();
        $verdict     = Detector::classify();

        $status = [
            // Offer it only on a site that has never had xSpeed. A site that
            // already has it has decided about it; re-offering is nagging.
            'available'   => $supported && !$installed && !Setup::has_settings(),
            'installed'   => $installed,
            'active'      => $active,
            'supported'   => $supported,
            'field_clear' => $field_clear,
            'state'       => isset($verdict['state']) ? $verdict['state'] : '',
            'blocker'     => self::blocker_label($verdict),
        ];

        /**
         * Filter the Site Performance offer status.
         *
         * @param array $status Offer availability and page-cache verdict.
         */
        return apply_filters('embedpress/site_performance_status', $status);
    }

    /**
     * Name whoever already owns the page cache, for the card's explanation.
     *
     * The Detector deliberately returns codes rather than sentences — the
     * wording is ours because the textdomain is ours.
     */
    private static function blocker_label($verdict)
    {
        if (empty($verdict['blockers']) || !is_array($verdict['blockers'])) {
            return '';
        }

        foreach ($verdict['blockers'] as $blocker) {
            if (!empty($blocker['label'])) {
                return (string) $blocker['label'];
            }
        }

        return '';
    }

    /**
     * Install + activate xSpeed, enabling page caching only when the field is clear.
     *
     * @return array{success:bool, message:string, caching_enabled:bool}
     */
    public static function install()
    {
        self::load();

        if (!current_user_can('install_plugins')) {
            return self::fail(__('You do not have permission to install plugins.', 'embedpress'));
        }

        if (!Setup::is_supported()) {
            return self::fail(__('This site does not meet the minimum requirements for xSpeed Cache.', 'embedpress'));
        }

        // Nothing owns the page cache => xSpeed may own it. Something does =>
        // install it, but do not touch the page cache. Never fight for it.
        $enable_cache = Detector::is_field_clear();

        if (!Setup::is_installed()) {
            $downloaded = self::download();

            if (is_wp_error($downloaded)) {
                return self::fail($downloaded->get_error_message());
            }
        }

        /*
         * prepare() writes the target state BEFORE activation, and that order is
         * load-bearing. xSpeed's activation reads what is already stored rather
         * than stamping over it, and configuring afterwards silently does
         * nothing: Settings_Manager::update() resolves modules through a
         * Module_Registry that is empty for a plugin activated part-way through
         * the request.
         *
         * It runs on BOTH paths, including the occupied one. Skipping it does
         * not mean "change nothing" -- it means xSpeed's own set_defaults()
         * sees a fresh install and seeds its recommended profile, switching on
         * gzip, browser caching and HTML/CSS minification. On the very site
         * where we promised to touch nothing, the user would get markup
         * rewriting they never agreed to, and no page cache either.
         *
         * Writing the settings option is what suppresses that first-run path.
         */
        $ours = Setup::prepare($enable_cache);

        $activated = activate_plugin(Setup::PLUGIN_FILE);

        if (is_wp_error($activated)) {
            if ($ours) {
                Setup::rollback();
            }

            return self::fail($activated->get_error_message());
        }

        /*
         * Safe on both paths: finish() reads back what prepare() was told, so
         * on an occupied site it clears the wizard redirect and the snapshot
         * without enabling a cache we deliberately left off.
         */
        Setup::finish();

        update_option(self::INSTALLED_BY_US_OPTION, true, false);

        return [
            'success'         => true,
            'caching_enabled' => $enable_cache,
            'message'         => $enable_cache
                ? __('xSpeed Cache installed and page caching enabled.', 'embedpress')
                : __('xSpeed Cache installed. Page caching was left off because another plugin already handles it on this site.', 'embedpress'),
        ];
    }

    /**
     * Download and unpack xSpeed from wordpress.org.
     *
     * Setup installs nothing by design — the host owns the install, its
     * capability checks, and its UI.
     *
     * @return true|\WP_Error
     */
    private static function download()
    {
        require_once ABSPATH . 'wp-admin/includes/file.php';
        require_once ABSPATH . 'wp-admin/includes/misc.php';
        require_once ABSPATH . 'wp-admin/includes/class-wp-upgrader.php';
        require_once ABSPATH . 'wp-admin/includes/plugin-install.php';

        $api = plugins_api('plugin_information', [
            'slug'   => Setup::PLUGIN_SLUG,
            'fields' => ['sections' => false],
        ]);

        if (is_wp_error($api)) {
            return $api;
        }

        $upgrader = new \Plugin_Upgrader(new \WP_Ajax_Upgrader_Skin());
        $result   = $upgrader->install($api->download_link);

        if (is_wp_error($result)) {
            return $result;
        }

        if (!$result) {
            return new \WP_Error(
                'embedpress_xspeed_install_failed',
                __('Could not install xSpeed Cache.', 'embedpress')
            );
        }

        return true;
    }

    /**
     * @return array{success:bool, message:string, caching_enabled:bool}
     */
    private static function fail($message)
    {
        return [
            'success'         => false,
            'caching_enabled' => false,
            'message'         => $message,
        ];
    }
}
