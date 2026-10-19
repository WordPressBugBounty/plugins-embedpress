<?php
defined('ABSPATH') or die("No direct script access allowed.");

/**
 * File responsible for defining basic general constants used by the plugin.
 *
 * @package     EmbedPress
 * @author      EmbedPress <help@embedpress.com>
 * @copyright   Copyright (C) 2021 WPDeveloper. All rights reserved.
 * @license     GPLv3 or later
 * @since       1.0.0
 */


if ( ! defined('EMBEDPRESS')) {

	define('EMBEDPRESS', "EmbedPress");
}

if ( ! defined('EMBEDPRESS_PLG_NAME')) {
	define('EMBEDPRESS_PLG_NAME', 'embedpress');
}

if ( ! defined('EMBEDPRESS_VERSION')) {
	define('EMBEDPRESS_VERSION', "4.7.0");
	/**
	 * @deprecated 2.2.0
	 */
	define('EMBEDPRESS_PLG_VERSION', EMBEDPRESS_VERSION);
}

/**
 * Version of the free ↔ Pro extension contract this free build provides.
 *
 * 2 = the #314 split: Pro features run only through the neutral
 * `embedpress/*` hooks and JS registries documented in
 * docs/architecture/free-pro-coupling.md, and free no longer ships the
 * implementations Pro used to share (Embedpress_Google_Helper, Analytics
 * Pro services, ...). EmbedPress Pro checks it on boot and, when it is
 * missing or lower, keeps its pre-split behaviour and asks for an update.
 * Bump only when the contract changes, never with the release version.
 */
if ( ! defined('EMBEDPRESS_PRO_CONTRACT')) {
	define('EMBEDPRESS_PRO_CONTRACT', 2);
}


if ( ! defined('EMBEDPRESS_ROOT')) {
	define('EMBEDPRESS_ROOT', dirname(__FILE__));
}

if ( ! defined('EMBEDPRESS_PATH_BASE')) {
	define('EMBEDPRESS_PATH_BASE', plugin_dir_path(__FILE__));
}

if ( ! defined('EMBEDPRESS_PATH_CORE')) {
	define('EMBEDPRESS_PATH_CORE', EMBEDPRESS_PATH_BASE . "EmbedPress/");
}

if ( ! defined('EMBEDPRESS_URL_ASSETS')) {
	define('EMBEDPRESS_URL_ASSETS', plugins_url(EMBEDPRESS_PLG_NAME) . "/assets/");
}

if ( ! defined('EMBEDPRESS_URL_STATIC')) {
	define('EMBEDPRESS_URL_STATIC', plugins_url(EMBEDPRESS_PLG_NAME) . "/static/");
}

if ( ! defined('EMBEDPRESS_PATH_STATIC')) {
	define('EMBEDPRESS_PATH_STATIC', EMBEDPRESS_PATH_BASE . "static/");
}

if ( ! defined('EMBEDPRESS_NAMESPACE')) {
	define('EMBEDPRESS_NAMESPACE', "\\EmbedPress");
}

if ( ! defined('EMBEDPRESS_AUTOLOADER_NAME')) {
	define('EMBEDPRESS_AUTOLOADER_NAME', "AutoLoader");
}

if ( ! defined('EMBEDPRESS_SHORTCODE')) {
	define('EMBEDPRESS_SHORTCODE', "embed");
}

if ( ! defined('EMBEDPRESS_LICENSES_API_HOST')) {
	define('EMBEDPRESS_LICENSES_API_HOST', "embedpress.com");
}

if ( ! defined('EMBEDPRESS_LICENSES_API_URL')) {
	define('EMBEDPRESS_LICENSES_API_URL', "https://embedpress.com");
}

if ( ! defined('EMBEDPRESS_LICENSES_MORE_INFO_URL')) {
	define('EMBEDPRESS_LICENSES_MORE_INFO_URL', "https://embedpress.com/docs/activate-license");
}
function embedpress_cache_cleanup( ){
	$dirname = wp_get_upload_dir()['basedir'].'/embedpress';
	if ( file_exists( $dirname) ) {
		$files = glob($dirname.'/*');
		//@TODO; delete files only those start with 'mu_'
		foreach($files as $file) {
			if(is_file($file))
				unlink($file);
		}
	}
}

function embedpress_schedule_cache_cleanup( ){
	if ( ! wp_next_scheduled( 'embedpress_cache_cleanup_action' ) ) {
		wp_schedule_event( time(), 'daily', 'embedpress_cache_cleanup_action' );
	}
}
if (file_exists(__DIR__ . '/vendor/autoload.php')) {
	require_once __DIR__ . '/vendor/autoload.php';
}
/**
 * The private Google Calendar (OAuth + FullCalendar) implementation, including
 * the [embedpress_calendar] shortcode, is provided by EmbedPress Pro. When
 * nothing registers the shortcode, swallow it so a post that used it doesn't
 * print the raw shortcode text.
 */
add_action('init', function () {
	if (!shortcode_exists('embedpress_calendar')) {
		add_shortcode('embedpress_calendar', '__return_empty_string');
	}
}, 20);
function is_embedpress_pro_active() {
	if ( ! function_exists( 'is_plugin_active') ) {
		include_once ABSPATH . 'wp-admin/includes/plugin.php';
	}

	return is_plugin_active('embedpress-pro/embedpress-pro.php');
}

/**
 * Get the version of the currently activated embedpress pro plugin dynamically
 * @return false|mixed
 */
function get_embedpress_pro_version() {
	if ( is_embedpress_pro_active() ) {
		if(defined('EMBEDPRESS_PRO_PLUGIN_VERSION')){
			return EMBEDPRESS_PRO_PLUGIN_VERSION;
		}
		$p = wp_get_active_and_valid_plugins();
		$p = array_filter( $p, function ( $plugin){
			return !empty( strpos( $plugin, 'embedpress-pro'));
		});
		$p = array_values( $p);
		if ( !empty( $p[0]) ) {
			$d = get_plugin_data($p[0]);
			if ( isset( $d['Version']) ) {
				return $d['Version'];
			}
			return false;
		}
		return false;
	}
	return false;

}
// Run the plugin autoload script
if ( ! defined('EMBEDPRESS_IS_LOADED')) {
	require_once EMBEDPRESS_PATH_BASE . "autoloader.php";
}

// Update string attributes values to boleen
if (!function_exists('stringToBoolean')){
    function stringToBoolean($attributes) {
        if(is_array($attributes)) {
            foreach ($attributes as $key => $value) {
                if(!empty($value) && $value === 'true'){
                    $attributes[$key] = true;
                }
				else if(!empty($value) && $value === 'false'){
                    $attributes[$key] = false;
                }
            }
		}
        return $attributes;
    }
}



// Includes the EmbedPress blocks system
// Check if we should use the new block system
if (apply_filters('embedpress_use_new_block_system', true)) {
	$new_block_file = __DIR__ . '/EmbedPress/Gutenberg/InitBlocks.php';

	if (file_exists($new_block_file)) {
		require_once $new_block_file;
	} 
} 
