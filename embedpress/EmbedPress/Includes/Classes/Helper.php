<?php

namespace EmbedPress\Includes\Classes;

use EmbedPress\Providers\TemplateLayouts\YoutubeLayout;
use EmbedPress\Shortcode;

use Elementor\Plugin;


if (!defined('ABSPATH')) {
	exit;
} // Exit if accessed directly

class Helper
{

	/**
	 * Parse a query string into an associative array.
	 *
	 * If multiple values are found for the same key, the value of that key
	 * value pair will become an array. This function does not parse nested
	 * PHP style arrays into an associative array (e.g., foo[a]=1&foo[b]=2 will
	 * be parsed into ['foo[a]' => '1', 'foo[b]' => '2']).
	 *
	 * @param string   $str         Query string to parse
	 * @param int|bool $urlEncoding How the query string is encoded
	 *
	 * @return array
	 */

	public function __construct()
	{
		add_action('admin_notices', [$this, 'outdated_pro_admin_notice']);
		// EmbedPress's own settings / analytics screens only print
		// `ep_admin_notices` (Shared::remove_admin_notice()).
		add_action('ep_admin_notices', [$this, 'outdated_pro_admin_notice']);
		add_action('admin_init', [$this, 'dismiss_outdated_pro_notice']);

		add_action('wp_ajax_loadmore_data_handler', [$this, 'loadmore_data_handler']);
		add_action('wp_ajax_nopriv_loadmore_data_handler', [$this, 'loadmore_data_handler']);


		add_action('wp_ajax_fetch_video_description', [$this, 'ajax_video_popup_description']);
		add_action('wp_ajax_nopriv_fetch_video_description', [$this, 'ajax_video_popup_description']);
	}

	public function ajax_video_popup_description()
	{
		if (isset($_POST['vid'])) {
			$api_key = self::get_api_key();
			$vid = sanitize_text_field($_POST['vid']);

			$video_data = Helper::get_youtube_video_data($api_key, $vid);

			if ($video_data) {
				ob_start();
?>
				<div class="video-description">
					<?php echo YoutubeLayout::generate_youtube_video_description($video_data); ?>
				</div>
		<?php
				$description_html = ob_get_clean();
				wp_send_json_success(['description' => $description_html]);
			} else {
				wp_send_json_error(['error' => 'Failed to fetch video data.']);
			}
		} else {
			wp_send_json_error(['error' => 'Invalid video ID.']);
		}
	}

	public static function get_api_key()
	{
		$settings = (array) get_option(EMBEDPRESS_PLG_NAME . ':youtube', []);
		return !empty($settings['api_key']) ? $settings['api_key'] : '';
	}

	public static function parse_query($str, $urlEncoding = true)
	{
		$result = [];

		if ($str === '') {
			return $result;
		}

		if ($urlEncoding === true) {
			$decoder = function ($value) {
				return rawurldecode(str_replace('+', ' ', $value));
			};
		} elseif ($urlEncoding === PHP_QUERY_RFC3986) {
			$decoder = 'rawurldecode';
		} elseif ($urlEncoding === PHP_QUERY_RFC1738) {
			$decoder = 'urldecode';
		} else {
			$decoder = function ($str) {
				return $str;
			};
		}

		foreach (explode('&', $str) as $kvp) {
			$parts = explode('=', $kvp, 2);
			$key = $decoder($parts[0]);
			$value = isset($parts[1]) ? $decoder($parts[1]) : null;
			if (!isset($result[$key])) {
				$result[$key] = $value;
			} else {
				if (!is_array($result[$key])) {
					$result[$key] = [$result[$key]];
				}
				$result[$key][] = $value;
			}
		}

		return $result;
	}
	/**
	 * URL of the PDF.js ("modern") viewer document.
	 *
	 * Same defect and same fix as get_flipbook_renderer() below — the viewer
	 * is a static HTML file, but routing it through admin-ajax.php paid a full
	 * WordPress bootstrap on every embed (measured 111ms vs 0ms served
	 * directly, on an idle install; far worse under load). This is the DEFAULT
	 * viewer style, so it affects more embeds than the flipbook does.
	 * See FB #84166.
	 *
	 * The viewer's asset references are relative to its own directory
	 * (viewer.css, viewer.js, locale/, and a ../build/ hop), so they resolve
	 * natively from here without the <base href> rewrite admin-ajax injected.
	 *
	 * The admin-ajax actions stay registered as a fallback for hosts that
	 * block direct .html access under wp-content; filter
	 * `embedpress_pdf_use_ajax_renderer` to true to force the old path.
	 *
	 * @return string
	 */
	/**
	 * Extension scripts the PDF viewer should load, as a comma-separated list
	 * of names for its `ext` hash param.
	 *
	 * viewer.html is a standalone document served in an iframe, so there is no
	 * wp_enqueue_script hook a plugin can use to add behaviour to it. Instead
	 * the viewer ships a small loader (assets/pdf/web/ep-extensions.js) that
	 * resolves names against its own allowlist; this is where PHP decides
	 * which of those names to request.
	 *
	 * Pro adds "watermark" here. Free requests nothing, so the loader is inert
	 * on a free install.
	 *
	 * @param array $params The viewer params this embed sends (watermark_text,
	 *                      …), so a filter can skip an extension the embed
	 *                      doesn't use. Empty when unknown.
	 * @return string Comma-separated extension names, or '' for none.
	 */
	public static function pdf_viewer_extensions($params = [])
	{
		$params = is_array($params) ? $params : [];
		$extensions = (array) apply_filters('embedpress/pdf/viewer_extensions', [], $params);

		$extensions = array_filter(array_map(function ($name) {
			return preg_replace('/[^a-z0-9_-]/', '', strtolower((string) $name));
		}, $extensions));

		return implode(',', array_unique($extensions));
	}

	/**
	 * Pass a PDF viewer param array through `embedpress/pdf/viewer_params`.
	 *
	 * Every PHP surface that builds the PDF.js / flipbook viewer params (the
	 * base64 `key` blob) fills the viewer options a site owner can only change
	 * with the Pro add-on — toolbar, print/download, copy text, draw, default
	 * selection tool and scrolling, RTL page flip and the watermark_* keys —
	 * with their default values, then calls this. Free never reads the user's
	 * choice for those keys itself.
	 *
	 * Filter contract — `embedpress/pdf/viewer_params`:
	 *
	 *   @param array  $params     Param array as built by free (Pro-controlled
	 *                             keys hold their defaults). Callbacks should
	 *                             only overwrite keys that already exist so the
	 *                             key order — and therefore the encoded blob —
	 *                             stays stable.
	 *   @param array  $attributes The raw source of the render surface: block
	 *                             attributes, shortcode attributes or
	 *                             Elementor widget settings.
	 *   @param string $context    Which surface (and attribute naming scheme)
	 *                             $attributes comes from: `shortcode`,
	 *                             `shortcode_gallery`, `gutenberg`,
	 *                             `gutenberg_gallery`, `elementor`,
	 *                             `elementor_wrapper` (data-* attributes on the
	 *                             Elementor PDF wrapper), `elementor_gallery`
	 *                             or `elementor_document`.
	 *   @return array
	 *
	 * @param array  $params
	 * @param mixed  $attributes
	 * @param string $context
	 * @return array
	 */
	public static function pdf_viewer_params(array $params, $attributes, $context)
	{
		$filtered = apply_filters('embedpress/pdf/viewer_params', $params, is_array($attributes) ? $attributes : [], (string) $context);

		return is_array($filtered) ? $filtered : $params;
	}

	/**
	 * PDF Gallery layouts this install can render.
	 *
	 * Free ships `grid` and `masonry`. Other layouts (EmbedPress Pro adds
	 * `carousel` and `bookshelf`) are registered through the
	 * `embedpress/pdf_gallery/layouts` filter by the plugin that implements
	 * them — that plugin also enqueues the layout's own JS/CSS.
	 *
	 * Filter contract — `embedpress/pdf_gallery/layouts`:
	 *   @param string[] $layouts Layout slugs. Return the list with yours added.
	 *
	 * @return string[]
	 */
	public static function pdf_gallery_layouts()
	{
		$layouts = (array) apply_filters('embedpress/pdf_gallery/layouts', ['grid', 'masonry']);

		return array_values(array_unique(array_filter(array_map(function ($layout) {
			return preg_replace('/[^a-z0-9_-]/', '', strtolower((string) $layout));
		}, $layouts))));
	}

	/**
	 * Resolve a saved PDF Gallery layout to one this install can render,
	 * falling back to `grid` for unknown layouts.
	 *
	 * @param string $layout
	 * @return string
	 */
	public static function pdf_gallery_layout($layout)
	{
		return in_array($layout, self::pdf_gallery_layouts(), true) ? $layout : 'grid';
	}

	/**
	 * Markup that wraps the PDF Gallery items for a layout.
	 *
	 * Free wraps the items in `.ep-pdf-gallery__grid` (Grid and Masonry are
	 * pure CSS). A plugin that registers a layout through
	 * `embedpress/pdf_gallery/layouts` supplies that layout's wrapper here.
	 *
	 * Filter contract — `embedpress/pdf_gallery/layout_markup`:
	 *   @param array  $markup     [
	 *                               'attributes' => extra attributes for the
	 *                                               `.ep-pdf-gallery` element
	 *                                               (already escaped, without
	 *                                               a leading space),
	 *                               'open'       => HTML printed before the items,
	 *                               'close'      => HTML printed after the items,
	 *                             ]
	 *   @param string $layout     Resolved layout slug (see pdf_gallery_layout()).
	 *   @param array  $attributes Raw attributes / settings of the surface.
	 *   @param string $context    `shortcode_gallery`, `gutenberg_gallery` or
	 *                             `elementor_gallery`.
	 *   @return array
	 *
	 * @param string $layout
	 * @param mixed  $attributes
	 * @param string $context
	 * @return array{attributes:string,open:string,close:string}
	 */
	public static function pdf_gallery_layout_markup($layout, $attributes, $context)
	{
		$default = [
			'attributes' => '',
			'open'       => '<div class="ep-pdf-gallery__grid">',
			'close'      => '</div>',
		];

		$markup = apply_filters('embedpress/pdf_gallery/layout_markup', $default, (string) $layout, is_array($attributes) ? $attributes : [], (string) $context);

		if (!is_array($markup)) {
			return $default;
		}

		$markup = array_merge($default, $markup);

		return [
			'attributes' => (string) $markup['attributes'],
			'open'       => (string) $markup['open'],
			'close'      => (string) $markup['close'],
		];
	}

	/**
	 * Add the `ext` param to every PDF viewer URL in rendered HTML.
	 *
	 * The viewer reads its options from a base64 `#key=` hash. Markup built
	 * client-side (the PDF blocks' save()) has no `ext`, so extensions such as
	 * Pro's watermark were never requested on block embeds. This appends
	 * `&ext=…` inside that key. No-op when no extension is registered (Pro
	 * inactive) or the URL already names one.
	 *
	 * @param string $html
	 * @return string
	 */
	public static function add_pdf_viewer_extensions($html)
	{
		if (!is_string($html) || strpos($html, 'viewer.html') === false || strpos($html, 'key=') === false) {
			return $html;
		}

		if (self::pdf_viewer_extensions() === '') {
			return $html;
		}

		return preg_replace_callback(
			'/(viewer\.html[^"\'\s<>]*?#key=)([A-Za-z0-9+\/=%]+)/',
			function ($m) {
				$decoded = base64_decode(rawurldecode($m[2]), true);
				if ($decoded === false || preg_match('/(^|&)ext=/', $decoded)) {
					return $m[0];
				}

				parse_str($decoded, $params);
				$ext = self::pdf_viewer_extensions($params);
				if ($ext === '') {
					return $m[0];
				}

				return $m[1] . base64_encode($decoded . '&ext=' . rawurlencode($ext));
			},
			$html
		);
	}

	public static function get_pdf_renderer()
	{
		if (apply_filters('embedpress_pdf_use_ajax_renderer', false)) {
			return admin_url('admin-ajax.php?action=get_viewer');
		}

		// Trailing '?' is REQUIRED, not cosmetic. The admin-ajax URL this
		// replaces always carried a query string, and callers append their
		// params with a bare '&file=...' — several of them (the lightbox and
		// PDF-gallery front-end scripts) with no "is there a ? yet" check at
		// all. Returning a bare .html URL makes those produce
		// "viewer.html&file=..." which Apache serves as 404. Ending on '?'
		// keeps every existing caller correct without touching them.
		$renderer = EMBEDPRESS_URL_ASSETS . 'pdf/web/viewer.html?';

		// EMBEDPRESS_URL_ASSETS is built once at load time and can carry a
		// stale http:// scheme on a site now served over https; an http://
		// iframe inside an https page is blocked as mixed content.
		if (is_ssl() && 0 === strpos($renderer, 'http://')) {
			$renderer = set_url_scheme($renderer, 'https');
		}

		return apply_filters('embedpress_pdf_renderer_url', $renderer);
	}

	/**
	 * URL of the 3D flipbook viewer document.
	 *
	 * The viewer is a plain static HTML file. Serving it through
	 * admin-ajax.php pays a full WordPress bootstrap for every embed, and the
	 * viewer then has to fetch its template through a *second* admin-ajax
	 * request that the browser cannot even discover until the first one
	 * returns. Measured on an idle install that is ~120ms warm per request;
	 * on a loaded production site it has been reported at 1.98s + 2.27s,
	 * serialized in front of ~2.2MB of viewer JS. See FB #84166.
	 *
	 * Serving the file directly removes both round-trips. The viewer's own
	 * asset references (js/, css/, templates/, and the ../../../../../
	 * hop to wp-includes for jQuery) are written relative to its real
	 * directory, so they resolve natively from here without the <base href>
	 * rewrite the admin-ajax path had to inject.
	 *
	 * The admin-ajax actions remain registered as a fallback for hosts that
	 * block direct .html access under wp-content; filter
	 * `embedpress_flipbook_use_ajax_renderer` to true to force the old path.
	 *
	 * @return string
	 */
	public static function get_flipbook_renderer()
	{
		if (apply_filters('embedpress_flipbook_use_ajax_renderer', false)) {
			return admin_url('admin-ajax.php?action=get_flipbook_viewer');
		}

		// Trailing '?' is REQUIRED — see the note in get_pdf_renderer().
		// static/js/ep-pdf-lightbox.js and static/js/pdf-gallery.js append a
		// bare '&file=' with no separator check, so a URL without a query
		// string yields "viewer.html&file=..." → 404.
		$renderer = EMBEDPRESS_URL_ASSETS . 'pdf-flip-book/viewer.html?';

		// EMBEDPRESS_URL_ASSETS is built once at load time and can carry a
		// stale http:// scheme on a site that is now served over https (it is
		// http:// on our own test install). An http:// iframe inside an https
		// page is blocked outright as mixed content, so realign the scheme
		// with the site's. set_url_scheme() alone is not enough here — it
		// keys off the current request context, not the site's own scheme.
		if (is_ssl() && 0 === strpos($renderer, 'http://')) {
			$renderer = set_url_scheme($renderer, 'https');
		}

		return apply_filters('embedpress_flipbook_renderer_url', $renderer);
	}

	public static  function get_extension_from_file_url($url)
	{
		$path = parse_url((string) $url, PHP_URL_PATH);
		if (empty($path)) {
			$path = (string) $url;
		}
		$urlSplit = explode(".", $path);
		$ext = end($urlSplit);
		return strtolower($ext);
	}

	/**
	 * Poster image for a PDF, resolved server-side.
	 *
	 * Without this the lightbox/trigger markup ships a bare
	 * <canvas data-pdf-url> and static/js/ep-pdf-lightbox.js renders page 1
	 * with PDF.js in the visitor's browser on EVERY page load — no cache.
	 * Measured on an 18.1MB/29-page PDF that cost 18 requests, 19.16MB
	 * transferred and ~7s before the preview appeared, for every visitor.
	 * See FB #84167.
	 *
	 * WordPress already rasterises page 1 to JPEG at upload time for PDFs in
	 * the media library (the same previews the media grid shows), so in the
	 * common case this is a metadata lookup and costs nothing to generate.
	 * The 'large' preview of that same file is 161KB — ~119x smaller than
	 * making each visitor download the document.
	 *
	 * Returns '' when the PDF is not a library attachment (external URL) or
	 * has no generated preview; callers then fall back to the canvas path.
	 *
	 * @param string $url Absolute URL of the PDF.
	 * @param string $size Registered image size to prefer.
	 * @return string Image URL, or '' when none is available.
	 */
	public static function get_pdf_poster_url($url, $size = 'large')
	{
		if (empty($url)) {
			return '';
		}

		$attachment_id = attachment_url_to_postid($url);
		if (!$attachment_id) {
			return '';
		}

		if ('application/pdf' !== get_post_mime_type($attachment_id)) {
			return '';
		}

		// A thumbnail previously generated by Pdf_Thumbnail_Handler (Imagick
		// fallback path) is stored as a separate attachment; prefer it, since
		// its existence means WP's own preview was missing at the time.
		$cached_id = get_post_meta($attachment_id, '_ep_pdf_thumbnail_id', true);
		if ($cached_id) {
			$cached_url = wp_get_attachment_url($cached_id);
			if ($cached_url) {
				return apply_filters('embedpress_pdf_poster_url', $cached_url, $url, $attachment_id);
			}
			// Stale pointer — the thumbnail attachment is gone.
			delete_post_meta($attachment_id, '_ep_pdf_thumbnail_id');
		}

		// WP's upload-time preview. Falls back through progressively smaller
		// sizes; a PDF uploaded before the size was registered may only have
		// some of them.
		foreach ([$size, 'large', 'medium', 'thumbnail', 'full'] as $candidate) {
			$src = wp_get_attachment_image_src($attachment_id, $candidate);
			if ($src && !empty($src[0])) {
				return apply_filters('embedpress_pdf_poster_url', $src[0], $url, $attachment_id);
			}
		}

		// Nothing exists yet: this PDF predates upload-time poster generation,
		// or its upload ran before the feature shipped. Generate once now so
		// the render surfaces stop falling back to the in-browser <canvas>
		// renderer, which tears/flips the preview on large documents
		// (FB #83295). Rate-limited internally, so a host that cannot
		// rasterise PDFs pays for this at most once a week per attachment.
		$generated_id = Pdf_Thumbnail_Handler::get_or_create_poster($attachment_id);
		if ($generated_id) {
			$generated_url = wp_get_attachment_url($generated_id);
			if ($generated_url) {
				return apply_filters('embedpress_pdf_poster_url', $generated_url, $url, $attachment_id);
			}
		}

		return apply_filters('embedpress_pdf_poster_url', '', $url, $attachment_id);
	}

	public static function is_instagram_feed($url)
	{
		return (bool) preg_match('~(?:https?://)?(?:www\.)?instagram\.com/(?!p/|reel/|tv/|stories/)[^/]+/?$~i', (string) $url);
	}

	public static function is_file_url($url)
	{
		$pattern = '/\.([0-9a-z]+)(?=[?#])|(\.)(?:[\w]+)$/i';
		return preg_match($pattern, $url) === 1;
	}

	public static function is_opensea($url)
	{
		return strpos($url, "opensea.io") !== false;
	}

	/**
	 * Reject the three internal IPv4 ranges that WordPress core's own SSRF guard
	 * (wp_http_validate_url) leaves reachable: link-local (169.254/16, incl. the
	 * 169.254.169.254 cloud-metadata endpoint), CGNAT (100.64/10) and benchmark
	 * (198.18/15). Core already rejects loopback, RFC1918 and every IPv6 form, so
	 * this only fills the IPv4 gap — using the same octet check core uses itself.
	 *
	 * Core's `http_request_host_is_external` filter only fires for IPs core
	 * already suspects, so it can't cover these; `pre_http_request` fires for every
	 * request, guarding every wp_remote / wp_safe_remote call (including redirect
	 * hops). Resolving the host with gethostbyname mirrors core and normalises
	 * hostnames + integer-encoded literals to a dotted quad.
	 *
	 * @param false|array|\WP_Error $preempt Short-circuit value (false to proceed).
	 * @param array                 $args    Request args (unused).
	 * @param string                $url     The request URL.
	 * @return false|\WP_Error
	 */
	public static function block_internal_http_requests($preempt, $args, $url)
	{
		if (false !== $preempt) {
			return $preempt; // a prior hook already decided
		}

		$host = wp_parse_url($url, PHP_URL_HOST);
		if (empty($host)) {
			return $preempt;
		}
		$host = rtrim(trim($host, '[]'), '.'); // drop IPv6 brackets + trailing FQDN dot

		// Resolve to an IPv4 address, exactly as core's wp_http_validate_url does.
		$ip = preg_match('/^(\d{1,3}\.){3}\d{1,3}$/', $host) ? $host : gethostbyname($host);
		if (!filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) {
			return $preempt; // not IPv4 (IPv6 is core's job) or unresolved
		}

		$p = array_map('intval', explode('.', $ip));
		$internal =
			(169 === $p[0] && 254 === $p[1])                      // link-local 169.254/16
			|| (100 === $p[0] && 64 <= $p[1] && 127 >= $p[1])     // CGNAT 100.64/10
			|| (198 === $p[0] && (18 === $p[1] || 19 === $p[1])); // benchmark 198.18/15

		if ($internal) {
			return new \WP_Error(
				'http_request_blocked',
				__('Requests to internal hosts are not allowed.', 'embedpress')
			);
		}

		return $preempt;
	}

	public static function is_youtube_channel($url)
	{
		return (bool) (preg_match('~(?:https?:\/\/)?(?:www\.)?(?:youtube.com\/)(?:channel\/|c\/|user\/|@)(\w+)~i', (string) $url));
	}

	public static function is_youtube_playlist($url)
	{
		// /playlist?list=PL… OR /watch?…&list=… (Mix radio, video-in-playlist).
		$u = str_replace(['&#038;', '&amp;'], '&', (string) $url);
		return (bool) (preg_match('~^https?://(?:www\.)?youtube\.com/(?:playlist|watch)\?(?:[^#]*&)?list=([\w-]+)~i', $u));
	}

	public static function is_youtube_channel_or_playlist($url)
	{
		return self::is_youtube_channel($url) || self::is_youtube_playlist($url);
	}

	public static function is_youtube($url)
	{
		return (bool) (preg_match('~(?:https?://)?(?:www\.)?(?:youtube\.com|youtu\.be)/watch\?v=([^&]+)~i', (string) $url));
	}

	// Saved sources data temporary in wp_options table
	public static function get_source_data($blockid, $source_url, $source_option_name, $source_temp_option_name)
	{
		if (self::is_youtube_channel($source_url)) {
			$source_name = 'YoutubeChannel';
		} else if (self::is_youtube($source_url)) {
			$source_name = 'Youtube';
		} else if (!empty(self::is_file_url($source_url))) {
			$source_name = 'document_' . self::get_extension_from_file_url($source_url);
		} else if (self::is_opensea($source_url)) {
			$source_name  = 'OpenSea';
		} else if (self::is_instagram_feed($source_url)) {
			$source_name  = 'InstagramFeed';
		} else {
			Shortcode::get_embera_instance();
			$collectios = Shortcode::get_collection();
			$provider = $collectios->findProviders($source_url);

			if (!empty($provider[$source_url])) {
				$source_name = $provider[$source_url]->getProviderName();
			} else {
				$host = parse_url($source_url, PHP_URL_HOST);
				if ($host) {
					$parts = explode('.', $host);
					if (count($parts) > 1) {
						$source_name = $parts[1];
					} else {
						// Handle the case where the host doesn't have at least two parts
						$source_name = $host;
					}
				} else {
					// Handle the case where parse_url fails
					$source_name = 'unknown';
				}
			}
		}

		if (!empty($blockid) && $blockid != 'undefined') {
			$sources = json_decode(get_option($source_temp_option_name), true);

			if (!$sources) {
				$sources = array();
			}
			$exists = false;

			foreach ($sources as $i => $source) {
				if ($source['id'] === $blockid) {
					$sources[$i]['source']['name'] = $source_name;
					$sources[$i]['source']['url'] = $source_url;
					$exists = true;
					break;
				}
			}

			if (!$exists) {
				$sources[] = array('id' => $blockid, 'source' => array('name' => $source_name, 'url' => $source_url, 'count' => 1));
			}

			update_option($source_temp_option_name, json_encode($sources));
		}
	}

	/**
	 * One-time scan of existing post content to seed the source-data options.
	 *
	 * Uses two SQL-prefiltered queries (post_content + _elementor_data postmeta)
	 * so a site with thousands of posts only loads the rows that actually
	 * mention "embedpress" — avoiding the N+1 round-trips of get_posts() +
	 * per-post get_post_field() / get_post_meta().
	 */
	public static function seed_source_data_from_existing_content()
	{
		if (get_option('embedpress_source_data_seeded')) {
			return;
		}

		global $wpdb;

		$limit = (int) apply_filters('embedpress_seed_source_data_limit', 2000);
		$like  = '%' . $wpdb->esc_like('embedpress') . '%';

		// Posts whose content mentions embedpress (blocks or shortcodes).
		$content_rows = $wpdb->get_results($wpdb->prepare(
			"SELECT ID, post_content
			 FROM {$wpdb->posts}
			 WHERE post_status IN ('publish','draft','private','future','pending')
			   AND post_type NOT IN ('revision','attachment','nav_menu_item','customize_changeset','oembed_cache')
			   AND post_content LIKE %s
			 LIMIT %d",
			$like,
			$limit
		));

		if ($content_rows) {
			foreach ($content_rows as $row) {
				$post_id = (int) $row->ID;
				$content = (string) $row->post_content;

				// Gutenberg: <!-- wp:embedpress/* {"url":"..."} -->
				if (preg_match_all('/wp:embedpress[^>]*?"url"\s*:\s*"([^"]+)"/', $content, $m)) {
					foreach ($m[1] as $i => $url) {
						self::get_source_data(
							md5("seed-{$post_id}-g-{$i}"),
							wp_unslash($url),
							'gutenberg_source_data',
							'gutenberg_temp_source_data'
						);
					}
				}

				// Shortcode: [embedpress ...]URL[/embedpress]
				if (preg_match_all('/\[embedpress[^\]]*\](.*?)\[\/embedpress\]/s', $content, $m)) {
					foreach ($m[1] as $i => $url) {
						$url = trim(wp_unslash($url));
						if ($url === '') continue;
						self::get_source_data(
							md5("seed-{$post_id}-s-{$i}"),
							$url,
							'gutenberg_source_data',
							'gutenberg_temp_source_data'
						);
					}
				}
			}
		}

		// Elementor widgets — postmeta-level prefilter.
		$meta_rows = $wpdb->get_results($wpdb->prepare(
			"SELECT post_id, meta_value
			 FROM {$wpdb->postmeta}
			 WHERE meta_key = %s
			   AND meta_value LIKE %s
			 LIMIT %d",
			'_elementor_data',
			$like,
			$limit
		));

		if ($meta_rows) {
			foreach ($meta_rows as $row) {
				$post_id = (int) $row->post_id;
				$el = (string) $row->meta_value;
				if (preg_match_all('/"widgetType":"embedpress[^"]*".*?"(?:embedpress_pro_embeded_link|embed_url|url|pdf_source|src)":"([^"]+)"/', $el, $m)) {
					foreach ($m[1] as $i => $url) {
						self::get_source_data(
							md5("seed-{$post_id}-e-{$i}"),
							stripslashes($url),
							'elementor_source_data',
							'elementor_temp_source_data'
						);
					}
				}
			}
		}

		// Promote temp → real without needing save_post.
		self::get_save_source_data_on_post_update('gutenberg_source_data', 'gutenberg_temp_source_data');
		self::get_save_source_data_on_post_update('elementor_source_data', 'elementor_temp_source_data');

		update_option('embedpress_source_data_seeded', time(), false);
	}

	// Saved source data when post updated
	public static function get_save_source_data_on_post_update($source_option_name, $source_temp_option_name)
	{

		if (defined('DOING_AUTOSAVE') && DOING_AUTOSAVE) {
			return;
		}
		$temp_data = json_decode(get_option($source_temp_option_name), true);
		$source_data = json_decode(get_option($source_option_name), true);
		if (!$temp_data) {
			$temp_data = array();
		}
		if (!$source_data) {
			$source_data = array();
		}

		$sources = array_merge($temp_data, $source_data);

		$unique_sources = array();
		foreach ($sources as $source) {
			$unique_sources[$source['id']] = $source;
		}

		$unique_sources = array_values($unique_sources);

		delete_option($source_temp_option_name);

		update_option($source_option_name, json_encode($unique_sources));
	}

	//Delete source temporary data when reload without update or publish
	public static function get_delete_source_temp_data_on_reload($source_temp_option_name)
	{
		$source_temp_data = json_decode(get_option($source_temp_option_name), true);
		if ($source_temp_data) {
			delete_option($source_temp_option_name);
		}
	}

	public static function get_file_title($url)
	{
		return get_the_title(attachment_url_to_postid($url));
	}

	public static function embed_content_share($content_id = '', $attributes = [])
	{
		$share_position = !empty($attributes['sharePosition']) ? $attributes['sharePosition'] : 'right';
		$custom_thumnail = !empty($attributes['customThumbnail']) ? $attributes['customThumbnail'] : '';
		$custom_title = !empty($attributes['customTitle']) ? $attributes['customTitle'] : '';
		$custom_description = !empty($attributes['customDescription']) ? $attributes['customDescription'] : '';

		// Create a unique hash based on content attributes
		$content_hash = md5($custom_thumnail . $custom_title . $custom_description . $content_id);

		// Encode for URL usage
		$custom_thumnail = urlencode($custom_thumnail);
		$custom_title = urlencode($custom_title);
		$custom_description = urlencode($custom_description);

		// Get social share options with defaults
		$facebook_enabled = isset($attributes['shareFacebook']) ? $attributes['shareFacebook'] !== false : true;
		$twitter_enabled = isset($attributes['shareTwitter']) ? $attributes['shareTwitter'] !== false : true;
		$pinterest_enabled = isset($attributes['sharePinterest']) ? $attributes['sharePinterest'] !== false : true;
		$linkedin_enabled = isset($attributes['shareLinkedin']) ? $attributes['shareLinkedin'] !== false : true;
		$style = isset($attributes['width']) ? 'style="max-width: ' . esc_attr($attributes['width']) . 'px;"' : '';


		$page_url = urlencode(get_permalink() . '?hash=' . $content_id . '&unique=' . $content_hash);

		$social_icons = '<div class="ep-social-share-wraper"' . $style . ' ><div class="ep-social-share share-position-' . esc_attr($share_position) . '">';


		// Facebook
		if ($facebook_enabled) {
			$social_icons .= '<a href="https://www.facebook.com/sharer/sharer.php?u=' . $page_url . '" class="ep-social-icon facebook" target="_blank">
			<svg width="64px" height="64px" fill="#000000" viewBox="0 -6 512 512" xmlns="http://www.w3.org/2000/svg">
			<path d="M0 0h512v500H0z" fill="#475a96"/>
			<path d="m375.72 112.55h-237.43c-8.137 0-14.73 6.594-14.73 14.73v237.43c0 8.135 6.594 14.73 14.73 14.73h127.83v-103.36h-34.781v-40.28h34.781v-29.705c0-34.473 21.055-53.244 51.807-53.244 14.73 0 27.391 1.097 31.08 1.587v36.026l-21.328 0.01c-16.725 0-19.963 7.947-19.963 19.609v25.717h39.887l-5.193 40.28h-34.693v103.36h68.012c8.135 0 14.73-6.596 14.73-14.73v-237.43c-1e-3 -8.137-6.596-14.73-14.731-14.73z" fill="#fff"/>
			</svg>
			</a>';
		}

		// Twitter
		if ($twitter_enabled) {
			$social_icons .= '<a href="https://twitter.com/intent/tweet?url=' . $page_url . '&text=' . $custom_title . '" class="ep-social-icon twitter" target="_blank">
				<svg viewBox="0 0 24 24" aria-hidden="true" fill="#fff" class="r-4qtqp9 r-yyyyoo r-dnmrzs r-bnwqim r-lrvibr r-m6rgpd r-lrsllp r-1nao33i r-16y2uox r-8kz0gk"><g><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"></path></g></svg>
			</a>';
		}

		// Pinterest
		if ($pinterest_enabled) {
			$social_icons .= '<a href="http://pinterest.com/pin/create/button/?url=' . $page_url . '&media=' . $custom_thumnail . '&description=' . $custom_description . '" class="ep-social-icon pinterest" target="_blank">

				<svg xmlns="http://www.w3.org/2000/svg" height="800" width="1200" viewBox="-36.42015 -60.8 315.6413 364.8"><path d="M121.5 0C54.4 0 0 54.4 0 121.5 0 173 32 217 77.2 234.7c-1.1-9.6-2-24.4.4-34.9 2.2-9.5 14.2-60.4 14.2-60.4s-3.6-7.3-3.6-18c0-16.9 9.8-29.5 22-29.5 10.4 0 15.4 7.8 15.4 17.1 0 10.4-6.6 26-10.1 40.5-2.9 12.1 6.1 22 18 22 21.6 0 38.2-22.8 38.2-55.6 0-29.1-20.9-49.4-50.8-49.4-34.6 0-54.9 25.9-54.9 52.7 0 10.4 4 21.6 9 27.7 1 1.2 1.1 2.3.8 3.5-.9 3.8-3 12.1-3.4 13.8-.5 2.2-1.8 2.7-4.1 1.6-15.2-7.1-24.7-29.2-24.7-47.1 0-38.3 27.8-73.5 80.3-73.5 42.1 0 74.9 30 74.9 70.2 0 41.9-26.4 75.6-63 75.6-12.3 0-23.9-6.4-27.8-14 0 0-6.1 23.2-7.6 28.9-2.7 10.6-10.1 23.8-15.1 31.9 11.4 3.5 23.4 5.4 36 5.4 67.1 0 121.5-54.4 121.5-121.5C243 54.4 188.6 0 121.5 0z" fill="#fff"/></svg>

			</a>';
		}

		// LinkedIn
		if ($linkedin_enabled) {
			$social_icons .= '<a href="https://www.linkedin.com/shareArticle?mini=true&url=' . $page_url . '" class="ep-social-icon linkedin" target="_blank">

			<svg fill="#ffffff" height="800px" width="800px" version="1.1" id="Layer_1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
				viewBox="0 0 310 310" xml:space="preserve">
			<g id="XMLID_801_">
				<path id="XMLID_802_" d="M72.16,99.73H9.927c-2.762,0-5,2.239-5,5v199.928c0,2.762,2.238,5,5,5H72.16c2.762,0,5-2.238,5-5V104.73
					C77.16,101.969,74.922,99.73,72.16,99.73z"/>
				<path id="XMLID_803_" d="M41.066,0.341C18.422,0.341,0,18.743,0,41.362C0,63.991,18.422,82.4,41.066,82.4
					c22.626,0,41.033-18.41,41.033-41.038C82.1,18.743,63.692,0.341,41.066,0.341z"/>
				<path id="XMLID_804_" d="M230.454,94.761c-24.995,0-43.472,10.745-54.679,22.954V104.73c0-2.761-2.238-5-5-5h-59.599
					c-2.762,0-5,2.239-5,5v199.928c0,2.762,2.238,5,5,5h62.097c2.762,0,5-2.238,5-5v-98.918c0-33.333,9.054-46.319,32.29-46.319
					c25.306,0,27.317,20.818,27.317,48.034v97.204c0,2.762,2.238,5,5,5H305c2.762,0,5-2.238,5-5V194.995
					C310,145.43,300.549,94.761,230.454,94.761z"/>
			</g>
			</svg>
		</a>';
		}

		$social_icons .= '</div></div>';

		return $social_icons;
	}

	public static function ep_get_elementor_widget_settings($page_settings = '', $id = '', $widgetType = '')
	{
		if (empty($page_settings)) {
			return [];
		}

		// Handle both string and array cases for elementor data
		if (is_string($page_settings)) {
			$data = json_decode($page_settings, true);
		} else {
			// Data might already be an array in older versions
			$data = $page_settings;
		}
		$element_setting =  null;

		Plugin::$instance->db->iterate_data($data, function ($element) use (&$element_setting, $widgetType, $id) {

			if ($element['id'] == $id && $element['elType'] == 'widget' && $element['widgetType'] == $widgetType) {
				$element_setting[] = $element['settings'];
			}
		});

		return $element_setting;
	}



	public static function ep_get_popup_icon()
	{
		$svg = '<div class="ep-doc-popup-icon" ><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" xml:space="preserve"><path fill="#fff" d="M5 3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-6l-2-2v8H5V5h8l-2-2H5zm9 0 2.7 2.7-7.5 7.5 1.7 1.7 7.5-7.5L21 10V3h-7z"/><path style="fill:none" d="M0 0h24v24H0z"/></svg></div>';

		return $svg;
	}
	public static function ep_get_download_icon()
	{
		$svg = '<div class="ep-doc-download-icon" ><svg width="25" height="25" viewBox="0 0 0.6 0.6" xmlns="http://www.w3.org/2000/svg"><path fill="#fff" fill-rule="evenodd" d="M.525.4A.025.025 0 0 1 .55.422v.053A.075.075 0 0 1 .479.55H.125A.075.075 0 0 1 .05.479V.425A.025.025 0 0 1 .1.422v.053A.025.025 0 0 0 .122.5h.353A.025.025 0 0 0 .5.478V.425A.025.025 0 0 1 .525.4ZM.3.05a.025.025 0 0 1 .025.025v.24L.357.283A.025.025 0 0 1 .39.281l.002.002a.025.025 0 0 1 .002.033L.392.318.317.393.316.394.314.395.311.397.308.398.305.399.301.4H.295L.292.399.289.398.287.397.285.395A.025.025 0 0 1 .283.393L.208.318A.025.025 0 0 1 .241.281l.002.002.032.032v-.24A.025.025 0 0 1 .3.05Z"/></svg></div>';

		return $svg;
	}

	public static function ep_get_print_icon()
	{
		$svg = '<div class="ep-doc-print-icon" ><svg xmlns="http://www.w3.org/2000/svg" width="25" height="25" viewBox="0 0 24 24">
		<path d="M19 8H5c-1.66 0-3 1.34-3 3v6h4v4h12v-4h4v-6c0-1.66-1.34-3-3-3zm-3 11H8v-5h8v5zm3-7c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm-1-9H6v4h12V3z" fill="#fff"/>
		</svg></div>';

		return $svg;
	}

	public static function ep_get_fullscreen_icon()
	{
		$svg = '<div class="ep-doc-fullscreen-icon"><svg width="25" height="25" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
		<path d="m3 15 .117.007a1 1 0 0 1 .876.876L4 16v4h4l.117.007a1 1 0 0 1 0 1.986L8 22H3l-.117-.007a1 1 0 0 1-.876-.876L2 21v-5l.007-.117a1 1 0 0 1 .876-.876L3 15Zm18 0a1 1 0 0 1 .993.883L22 16v5a1 1 0 0 1-.883.993L21 22h-5a1 1 0 0 1-.117-1.993L16 20h4v-4a1 1 0 0 1 .883-.993L21 15ZM8 2a1 1 0 0 1 .117 1.993L8 4H4v4a1 1 0 0 1-.883.993L3 9a1 1 0 0 1-.993-.883L2 8V3a1 1 0 0 1 .883-.993L3 2h5Zm13 0 .117.007a1 1 0 0 1 .876.876L22 3v5l-.007.117a1 1 0 0 1-.876.876L21 9l-.117-.007a1 1 0 0 1-.876-.876L20 8V4h-4l-.117-.007a1 1 0 0 1 0-1.986L16 2h5Z" fill="#fff"/>
	  	</svg></div>';

		return $svg;
	}
	public static function ep_get_minimize_icon()
	{
		$svg = '<div class="ep-doc-minimize-icon" style="display:none"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" style="enable-background:new 0 0 385.331 385.331" xml:space="preserve" width="20" height="20"><path fill="#fff" d="M13.751 8.131h5.62c0.355 0 0.619 -0.28 0.619 -0.634 0 -0.355 -0.265 -0.615 -0.619 -0.614h-4.995V1.878c0 -0.355 -0.27 -0.624 -0.624 -0.624s-0.624 0.27 -0.624 0.624v5.62c0 0.002 0.001 0.003 0.001 0.004 0 0.002 -0.001 0.003 -0.001 0.005 0 0.348 0.276 0.625 0.624 0.624zM6.244 1.259c-0.354 0 -0.614 0.265 -0.614 0.619v4.995H0.624c-0.355 0 -0.624 0.27 -0.624 0.624 0 0.355 0.27 0.624 0.624 0.624h5.62c0.002 0 0.003 -0.001 0.004 -0.001 0.002 0 0.003 0.001 0.005 0.001 0.348 0 0.624 -0.276 0.624 -0.624V1.878c0 -0.354 -0.28 -0.619 -0.634 -0.619zm0.005 10.61H0.629c-0.355 0.001 -0.619 0.28 -0.619 0.634 0 0.355 0.265 0.615 0.619 0.614h4.995v5.005c0 0.355 0.27 0.624 0.624 0.624 0.355 0 0.624 -0.27 0.624 -0.624V12.502c0 -0.002 -0.001 -0.003 -0.001 -0.004 0 -0.002 0.001 -0.003 0.001 -0.005 0 -0.348 -0.276 -0.624 -0.624 -0.624zm13.127 0H13.756c-0.002 0 -0.003 0.001 -0.004 0.001 -0.002 0 -0.003 -0.001 -0.005 -0.001 -0.348 0 -0.624 0.276 -0.624 0.624v5.62c0 0.355 0.28 0.619 0.634 0.619 0.354 0.001 0.614 -0.265 0.614 -0.619v-4.995H19.376c0.355 0 0.624 -0.27 0.624 -0.624s-0.27 -0.624 -0.624 -0.625z"/><g/><g/><g/><g/><g/><g/></svg></div>';

		return $svg;
	}
	public static function ep_get_draw_icon()
	{
		$svg = '<div class="ep-doc-draw-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="m15 7.5 2.5 2.5m-10 10L19.25 8.25c0.69 -0.69 0.69 -1.81 0 -2.5v0c-0.69 -0.69 -1.81 -0.69 -2.5 0L5 17.5V20h2.5Zm0 0h8.379C17.05 20 18 19.05 18 17.879v0c0 -0.563 -0.224 -1.103 -0.621 -1.5L17 16M4.5 5c2 -2 5.5 -1 5.5 1 0 2.5 -6 2.5 -6 5 0 0.876 0.533 1.526 1.226 2" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></div>';

		return $svg;
	}

	public static function get_insta_video_icon()
	{
		$svg = '<svg class="insta-video-icon" aria-label="Clip" class="x1lliihq x1n2onr6" color="#FFF" fill="#FFF" height="20" viewBox="1.111 1.111 24.444 24.447" width="20">
		<path d="m14.248 1.111 3.304 5.558h-6.2L8.408 1.146c.229-.014.466-.024.713-.03l.379-.005Zm2.586 0h.331c3.4 0 4.964.838 6.267 2.097a6.674 6.674 0 0 1 1.773 3.133l.078.328H20.14l-3.307-5.558ZM6.093 1.53l2.74 5.139H1.382a6.678 6.678 0 0 1 4.38-5.033ZM16.91 15.79l-5.05-2.916a1.01 1.01 0 0 0-1.507.742l-.009.133v5.831a1.011 1.011 0 0 0 1.394.933l.121-.059 5.05-2.916a1.01 1.01 0 0 0 .111-1.674l-.111-.076-5.05-2.916ZM1.132 8.891h24.404l.017.4.003.21v7.666c0 3.401-.839 4.966-2.098 6.267-1.279 1.238-2.778 2.062-5.922 2.121l-.371.003H9.501c-3.4 0-4.963-.839-6.267-2.099-1.238-1.278-2.06-2.776-2.12-5.922l-.003-.37V9.501l.003-.21Z" fill-rule="evenodd" /></svg>';

		return $svg;
	}

	public static function get_insta_image_carousel_icon()
	{
		$svg = '<svg aria-label="Carousel" class="x1lliihq x1n2onr6" color="#FFF" fill="#FFF" height="25" viewBox="0 0 43.636 43.636" width="25">
		<path d="M31.636 27V10a4.695 4.695 0 0 0-4.727-4.727H10A4.695 4.695 0 0 0 5.273 10v17A4.695 4.695 0 0 0 10 31.727h17c2.545-.091 4.636-2.182 4.636-4.727zm4-13.364v14.636c0 4.091-3.364 7.455-7.455 7.455H13.545c-.545 0-.818.636-.455 1 .909 1 2.182 1.636 3.727 1.636h12.182a9.35 9.35 0 0 0 9.364-9.364V16.818a5.076 5.076 0 0 0-1.636-3.727c-.455-.364-1.091 0-1.091.545z" /></svg>';

		return $svg;
	}

	public static function get_insta_image_icon()
	{
		$svg = '<svg width="22" height="22" viewBox="0 0 0.6 0.6" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M.175.05A.125.125 0 0 0 .05.175v.25A.125.125 0 0 0 .175.55h.25A.125.125 0 0 0 .55.425v-.25A.125.125 0 0 0 .425.05h-.25ZM.2.225a.025.025 0 1 1 .05 0 .025.025 0 0 1-.05 0ZM.225.15a.075.075 0 1 0 0 .15.075.075 0 0 0 0-.15Zm.138.205A.025.025 0 0 1 .398.351l.048.042A.025.025 0 1 0 .479.355L.43.312a.075.075 0 0 0-.107.011l-.04.05a.024.024 0 0 1-.032.005.074.074 0 0 0-.099.015L.118.432a.025.025 0 0 0 .038.033l.035-.04A.024.024 0 0 1 .223.42.074.074 0 0 0 .322.405l.04-.05Z" fill="#fff"/></svg>';

		return $svg;
	}

	public static function get_insta_like_icon()
	{
		$svg = '<svg version="1.1" id="Uploaded to svgrepo.com" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 0.8 0.8" xml:space="preserve"><path d="M.225.25C.225.264.214.275.2.275S.175.264.175.25.186.225.2.225.225.236.225.25zM.75.3C.75.453.589.582.485.65a1.06 1.06 0 0 1-.073.044.025.025 0 0 1-.024 0A1.049 1.049 0 0 1 .315.65C.211.582.05.453.05.3a.2.2 0 0 1 .2-.2.199.199 0 0 1 .15.068A.199.199 0 0 1 .55.1a.2.2 0 0 1 .2.2zM.25.25a.05.05 0 1 0-.1 0 .05.05 0 0 0 .1 0z" style="fill:#fff"/></svg>';

		return $svg;
	}
	public static function get_insta_comment_icon()
	{
		$svg = '<svg fill="#fff" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 2.5 2.5" xml:space="preserve"><path d="M2.374.446a.063.063 0 0 0-.061-.057H.991a.063.063 0 0 0-.063.057H.927v.328h.559c.029 0 .053.022.056.051h.001v.731h.275l.162.162a.063.063 0 0 0 .116-.035v-.127h.217a.063.063 0 0 0 .06-.051h.002V.446h-.001z"/><path d="M1.361.899H.18A.056.056 0 0 0 .125.95v.946h.001a.057.057 0 0 0 .054.045h.194v.113a.057.057 0 0 0 .104.032l.145-.145h.738c.027 0 .05-.02.056-.045h.001V.95h-.001a.056.056 0 0 0-.056-.051z"/></svg>';

		return $svg;
	}
	public static function get_instagram_icon()
	{
		$svg = '<svg version="1.1" id="Icons" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" xml:space="preserve" width="1285" height="400"><style>.st0{fill:none;stroke:#fff;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;stroke-miterlimit:10}</style><path class="st0" d="M14.375 19.375h-8.75c-2.75 0-5-2.25-5-5v-8.75c0-2.75 2.25-5 5-5h8.75c2.75 0 5 2.25 5 5v8.75c0 2.75-2.25 5-5 5z"/><path class="st0" d="M14.375 10A4.375 4.375 0 0 1 10 14.375 4.375 4.375 0 0 1 5.625 10a4.375 4.375 0 0 1 8.75 0zm1.25-5.625A.625.625 0 0 1 15 5a.625.625 0 0 1-.625-.625.625.625 0 0 1 1.25 0z"/></svg>';

		return $svg;
	}

	public static function get_google_presentation_url($embedded_url)
	{
		$parsed_url = parse_url($embedded_url);
		$base_url = $parsed_url['scheme'] . '://' . $parsed_url['host'] . $parsed_url['path'];
		$base_url = strtok($base_url, '?');
		$base_url = rtrim($base_url, '/');
		return $base_url;
	}

	public static function check_media_format($url)
	{
		// Strip query/hash so signed streaming URLs (Mux, CloudFront) match.
		$path = preg_replace('/[?#].*$/', '', (string) $url);
		$pattern1 = '/\.(mp4|mov|avi|wmv|flv|mkv|webm|mpeg|mpg|m3u8|mpd)$/i';
		$pattern2 = '/\.(mp3|wav|ogg|aac)$/i';

		$isVideo = preg_match($pattern1, $path);
		$isAudio = preg_match($pattern2, $path);

		$is_self_hosted = false;
		$format = '';

		if (!empty($isVideo) || !empty($isAudio)) {
			$is_self_hosted = true;
			if (!empty($isVideo)) {
				$format = 'video';
			} else if (!empty($isAudio)) {
				$format = 'audio';
			}
		}

		if (!$is_self_hosted) {
			return [
				'selhosted' => false,
			];
		}

		return [
			'selhosted' => true,
			'format' => $format,
		];
	}

	// Ajax Methods get instagram feed data
	public function loadmore_data_handler()
	{
		$connected_account_type = isset($_POST['connected_account_type']) ? sanitize_text_field($_POST['connected_account_type']) : 'personal';
		$hashtag_id = isset($_POST['hashtag_id']) ? sanitize_text_field($_POST['hashtag_id']) : '';
		$feed_type = isset($_POST['feed_type']) ? sanitize_text_field($_POST['feed_type']) : 'user_aacount_type';
		$user_id = isset($_POST['user_id']) ? sanitize_text_field($_POST['user_id']) : '';
		$loadmore_key = isset($_POST['loadmore_key']) ? sanitize_text_field($_POST['loadmore_key']) : '';
		$nonce = isset($_POST['_nonce']) ? sanitize_text_field($_POST['_nonce']) : '';
		$params = isset($_POST['params']) ? sanitize_text_field($_POST['params']) : '';
		// $params = json_decode($params, true);
		$params = stripslashes($params); // Remove extra backslashes
		$params = json_decode($params, true);

		// Verify nonce
		if (!wp_verify_nonce($nonce, 'ep_nonce')) {
			wp_send_json_error('Invalid nonce');
			wp_die(); // Terminate script execution if nonce is invalid
		}

		$feeds_data = get_option('ep_instagram_feed_data');
		$user_data = $feeds_data[$user_id]['feed_userinfo'];

		$profile_picture_url = isset($user_data['profile_picture_url']) ? $user_data['profile_picture_url'] : '';

		if ($feed_type === 'user_account_type' && isset($feeds_data[$loadmore_key]['feed_posts'])) {
			$feed_posts = $feeds_data[$loadmore_key]['feed_posts'];
		} else {
			$feed_posts = ['error'];
		}

		/**
		 * Filters the posts served by the Instagram "Load more" AJAX handler.
		 *
		 * Free serves user-account feeds. EmbedPress Pro serves its hashtag
		 * feed (feed type `hashtag_type`) through this filter.
		 *
		 * @param array  $feed_posts   Posts for $loadmore_key, or ['error'].
		 * @param string $feed_type    'user_account_type' or 'hashtag_type'.
		 * @param string $loadmore_key User id or hashtag id.
		 */
		$feed_posts = apply_filters('embedpress/instagram/loadmore_posts', $feed_posts, $feed_type, $loadmore_key);


		if (is_array($feed_posts) && count($feed_posts) > 0) {
			$loaded_posts = isset($_POST['loaded_posts']) ? intval($_POST['loaded_posts']) : 0;
			$posts_per_page = isset($_POST['posts_per_page']) ? intval($_POST['posts_per_page']) : 0;

			$post_index = $loaded_posts + 1;
			$start_index = $loaded_posts;

			$next_posts = array_slice($feed_posts, $start_index, $posts_per_page);

			ob_start();

			if (is_array($next_posts) && count($next_posts) > 0) :
				foreach ($next_posts as $post) :
					$caption = !empty($post['caption']) ? $post['caption'] : '';
					$media_type = !empty($post['media_type']) ? $post['media_type'] : '';
					$media_url = !empty($post['media_url']) ? $post['media_url'] : '';
					$permalink = !empty($post['permalink']) ? $post['permalink'] : '';
					$timestamp = !empty($post['timestamp']) ? $post['timestamp'] : '';
					$username = !empty($post['username']) ? $post['username'] : '';
					$like_count = !empty($post['like_count']) ? $post['like_count'] : 0;
					$comments_count = !empty($post['comments_count']) ? $post['comments_count'] : 0;

					$post['profile_picture_url'] = $profile_picture_url;
					$post['show_likes_count'] = isset($params['show_likes_count']) ? $params['show_likes_count'] : false;
					$post['show_comments_count'] = isset($params['show_comments_count']) ? $params['show_comments_count'] : false;
					$post['popup_follow_button'] = isset($params['popup_follow_button']) ? $params['popup_follow_button'] : true;
					$post['popup_follow_button_text'] = isset($params['popup_follow_button_text']) ? $params['popup_follow_button_text'] : 'Follow';
		?>

					<div class="insta-gallery-item cg-carousel__slide js-carousel__slide" data-insta-postid="<?php echo esc_attr($post['id']) ?>" data-postindex="<?php echo esc_attr($post_index); ?>" data-postdata="<?php echo htmlspecialchars(json_encode($post), ENT_QUOTES, 'UTF-8'); ?>" data-media-type="<?php echo esc_attr($media_type); ?>">
						<?php

						if (!empty($hashtag_id) && $media_type == 'CAROUSEL_ALBUM') {
							if (isset($post['children']['data'][0]['media_url'])) {
								$hashtag_media_url = $post['children']['data'][0]['media_url'];
								$hashtag_media_type = $post['children']['data'][0]['media_type'];

								if ($hashtag_media_type == 'VIDEO') {
									echo '<video class="insta-gallery-image" src="' . esc_url($hashtag_media_url) . '"></video>';
								} else {
									echo ' <img class="insta-gallery-image" src="' . esc_url($hashtag_media_url) . '" alt="' . esc_attr('image') . '">';
								}
							}
						} else {
							if ($media_type == 'VIDEO') {
								echo '<video class="insta-gallery-image" src="' . esc_url($media_url) . '"></video>';
							} else {
								echo ' <img class="insta-gallery-image" src="' . esc_url($media_url) . '" alt="' . esc_attr('image') . '">';
							}
						}
						?>

						<div class="insta-gallery-item-type">
							<div class="insta-gallery-item-type-icon">
								<?php
								if ($media_type == 'VIDEO') {
									echo Helper::get_insta_video_icon();
								} else if ($media_type == 'CAROUSEL_ALBUM') {
									echo Helper::get_insta_image_carousel_icon();
								} else {
									echo Helper::get_insta_image_icon();
								}
								?>
							</div>
						</div>
						<div class="insta-gallery-item-info">
							<?php echo \EmbedPress\Providers\InstagramFeed::item_info_html($like_count, $comments_count, (array) $params, 'loadmore'); ?>
						</div>
					</div>

<?php $post_index++;
				endforeach;
			endif;

			$feed_item = ob_get_clean();

			$next_start_index = $start_index + count($next_posts);

			wp_send_json(array(
				'html' => $feed_item,
				'next_post_index' => $next_start_index,
				'total_feed_posts' => count($feed_posts)
			));
		} else {
			wp_send_json('');
		}
	}

	// Calendly API helpers (user info / event types / scheduled events /
	// invitees) moved to EmbedPress Pro with the Calendly dashboard
	// (Embedpress\Pro\Filters\Calendly).

	public static function parseDuration($durationString)
	{
		list($minutes, $seconds) = explode(':', $durationString);
		return intval($minutes) * 60 + intval($seconds);
	}




	public static function is_pro_active()
	{
		if (defined('EMBEDPRESS_SL_ITEM_SLUG')) {
			return true;
		}
		return false;
	}

	/**
	 * Whether an active EmbedPress Pro predates the hooks this free version
	 * relies on (content protection, PDF viewer options).
	 *
	 * Version-agnostic: checks that the hooks are actually registered, not a
	 * version number. Always false when Pro is not active, and before
	 * `plugins_loaded` has finished (Pro registers its hooks then).
	 *
	 * @return bool
	 */
	public static function pro_is_outdated()
	{
		if (!self::is_pro_active() || !did_action('plugins_loaded')) {
			return false;
		}

		return !has_filter('embedpress/content_protection/is_locked')
			|| !has_filter('embedpress/pdf/viewer_params');
	}

	/**
	 * Whether an embed has content protection switched on and configured.
	 *
	 * Only used to fail closed when Pro is outdated (see is_content_locked());
	 * free never enforces protection itself.
	 *
	 * @param array $data lock_content, protection_type, content_password.
	 * @return bool
	 */
	public static function is_protection_configured($data)
	{
		$lock = $data['lock_content'] ?? '';
		if (empty($lock) || $lock === 'no' || $lock === 'false') {
			return false;
		}
		if (($data['protection_type'] ?? '') === 'password' && (string) ($data['content_password'] ?? '') === '') {
			return false;
		}
		return true;
	}

	/**
	 * Content protection decision for blocks and Elementor widgets.
	 *
	 * Asks `embedpress/content_protection/is_locked` (default false — free
	 * never locks). When an outdated Pro is active it cannot answer that
	 * filter, so a protected embed is treated as locked (fail closed) and the
	 * caller prints protection_paused_notice() instead of the lock UI.
	 *
	 * @param array  $data    lock_content, protection_type, content_password,
	 *                        user_role, protection_message, client_id.
	 * @param string $context gutenberg | elementor | elementor_pdf | elementor_document.
	 * @return bool
	 */
	public static function is_content_locked($data, $context)
	{
		$data = is_array($data) ? $data : [];
		if (self::pro_is_outdated() && self::is_protection_configured($data)) {
			return true;
		}
		return (bool) apply_filters('embedpress/content_protection/is_locked', false, $data, $context);
	}

	/**
	 * Neutral notice shown in place of a protected embed while an outdated
	 * Pro is active.
	 *
	 * @return string
	 */
	public static function protection_paused_notice()
	{
		return '<div class="protected-message ep-protection-paused">' . esc_html__('This content is protected. The site administrator needs to update EmbedPress Pro.', 'embedpress') . '</div>';
	}

	/**
	 * Whether something can render the private (OAuth) Google Calendar
	 * through the `embedpress_google_helper_shortcode` action.
	 *
	 * Compat for Pro < next release, remove later: EmbedPress Pro <= 3.9.1
	 * hooks that action but calls the Embedpress_Google_Helper class that
	 * used to ship in free, so firing it would fatal. With an outdated Pro the
	 * private calendar is treated as unavailable (same output as without Pro).
	 *
	 * @return bool
	 */
	public static function has_private_calendar_renderer()
	{
		return has_action('embedpress_google_helper_shortcode') && !self::pro_is_outdated();
	}

	/**
	 * Site-wide content-protection hash key (option `embedpress_hash_key`).
	 *
	 * @deprecated Compat for Pro <= 3.9.1, remove later. Old Pro's
	 *             `display_password_form` calls `Helper::get_hash()`, which
	 *             moved to Pro (Content_Protection_Pro::get_hash()). Returns
	 *             the same value; free never uses it itself.
	 *
	 * @return string
	 */
	public static function get_hash()
	{
		$option = (defined('EMBEDPRESS_PLG_NAME') ? EMBEDPRESS_PLG_NAME : 'embedpress') . '_hash_key';
		$hash_key = get_option($option);
		if (!$hash_key) {
			$hash_key = wp_hash_password(wp_generate_password(30));
			update_option($option, $hash_key);
		}
		return $hash_key;
	}

	/**
	 * Admin notice: an outdated Pro is active, so protected embeds and some Pro
	 * settings are paused. Dismissible per Pro version, per user.
	 */
	public function outdated_pro_admin_notice()
	{
		static $printed = false;
		if ($printed || !current_user_can('activate_plugins') || !self::pro_is_outdated()) {
			return;
		}

		$version = defined('EMBEDPRESS_PRO_PLUGIN_VERSION') ? (string) EMBEDPRESS_PRO_PLUGIN_VERSION : 'unknown';
		if (get_user_meta(get_current_user_id(), 'embedpress_outdated_pro_dismissed', true) === $version) {
			return;
		}
		$printed = true;

		$dismiss_url = wp_nonce_url(add_query_arg('embedpress_dismiss_outdated_pro', '1'), 'embedpress_dismiss_outdated_pro');
		?>
		<div class="notice notice-warning embedpress-outdated-pro-notice">
			<p>
				<strong><?php esc_html_e('Please update EmbedPress Pro.', 'embedpress'); ?></strong>
				<?php esc_html_e('Your EmbedPress Pro version is not compatible with this version of EmbedPress. Protected embeds stay hidden and some Pro settings are paused until you update EmbedPress Pro.', 'embedpress'); ?>
			</p>
			<p>
				<a class="button button-primary" href="<?php echo esc_url(self_admin_url('plugins.php')); ?>"><?php esc_html_e('Go to Plugins', 'embedpress'); ?></a>
				<a class="button" href="<?php echo esc_url($dismiss_url); ?>"><?php esc_html_e('Dismiss', 'embedpress'); ?></a>
			</p>
		</div>
		<?php
	}

	/**
	 * Store the per-version dismissal of the outdated-Pro notice.
	 */
	public function dismiss_outdated_pro_notice()
	{
		if (empty($_GET['embedpress_dismiss_outdated_pro']) || !current_user_can('activate_plugins')) {
			return;
		}
		check_admin_referer('embedpress_dismiss_outdated_pro');

		$version = defined('EMBEDPRESS_PRO_PLUGIN_VERSION') ? (string) EMBEDPRESS_PRO_PLUGIN_VERSION : 'unknown';
		update_user_meta(get_current_user_id(), 'embedpress_outdated_pro_dismissed', $version);

		wp_safe_redirect(remove_query_arg(['embedpress_dismiss_outdated_pro', '_wpnonce']));
		exit;
	}

	/**
	 * Check if pro features should be enabled based on license status
	 *
	 * @return bool True if pro features should be enabled, false otherwise
	 */
	public static function is_pro_features_enabled()
	{
		// First check if pro plugin is active
		if (!self::is_pro_active()) {
			return false;
		}

		// Get license status
		$license_status = get_option('embedpress_pro_software__license_status', '');

		// Pro features are enabled only if license is valid
		return $license_status === 'valid';
	}

	/**
	 * Get detailed license information
	 *
	 * @return array License information including status, key, and data
	 */
	public static function get_license_info()
	{
		$is_pro_active = self::is_pro_active();
		$license_status = '';
		$license_key = '';
		$license_data = [];
		$is_features_enabled = false;

		if ($is_pro_active) {
			$license_status = get_option('embedpress_pro_software__license_status', '');
			$license_data_raw = get_transient('embedpress_pro_software__license_data');

			if ($license_data_raw) {
				$license_data = json_decode(json_encode($license_data_raw), true);
			}

			// The license STATUS is a persistent option, but the license_data
			// TRANSIENT (which carries the key) expires — so reading the key
			// only from the transient leaves an "Active" license with an empty
			// key field once it lapses. The Pro LicenseManager also persists the
			// full key in the `embedpress_pro_software__license` option, so use
			// that as the authoritative source; fall back to the transient's
			// (already-masked) key only if the option is somehow empty.
			$license_key = get_option('embedpress_pro_software__license', '');
			if ($license_key === '' && isset($license_data['license_key'])) {
				$license_key = $license_data['license_key'];
			}

			$is_features_enabled = ($license_status === 'valid');
		}

		return [
			'is_pro_active' => $is_pro_active,
			'license_status' => $license_status,
			'license_key' => $license_key,
			'license_data' => $license_data,
			'is_features_enabled' => $is_features_enabled,
			'status_message' => self::get_license_status_message($is_pro_active, $license_status)
		];
	}

	/**
	 * Mask a license key for display, keeping only the head and tail visible.
	 *
	 * The full key must never render into the DOM of the settings page (it sits
	 * in a disabled input, readable via view-source / dev-tools). This keeps the
	 * real key's first 4 and last 5 characters and replaces every character in
	 * between with an asterisk — so the mask length matches the true key length
	 * (e.g. a 29-char key → "2343********************32432"). Safe to echo into
	 * the visible input's value.
	 *
	 * Short keys (<= head+tail chars) are fully masked so nothing meaningful
	 * leaks. Empty input returns empty.
	 *
	 * @param string $key  The raw license key.
	 * @param int    $head Visible leading chars. Default 4.
	 * @param int    $tail Visible trailing chars. Default 5.
	 * @return string Masked key, or '' when $key is empty.
	 */
	public static function mask_license_key($key, $head = 4, $tail = 5)
	{
		$key = (string) $key;
		$len = strlen($key);

		if ($len === 0) {
			return '';
		}

		// Too short to reveal head+tail without overlap — mask entirely.
		if ($len <= ($head + $tail)) {
			return str_repeat('*', $len);
		}

		// Star out the real middle so the masked length equals the key length.
		return substr($key, 0, $head) . str_repeat('*', $len - $head - $tail) . substr($key, -$tail);
	}

	/**
	 * Display license warning notice for pro features
	 *
	 * @param string $context Context where the notice is displayed (e.g., 'analytics', 'branding')
	 * @return string HTML for the license warning notice
	 */
	public static function get_pro_feature_notice($context = '')
	{
		$license_info = self::get_license_info();

		if (!$license_info['is_pro_active']) {
			return '<div class="embedpress-pro-notice embedpress-notice-warning">
				<p><strong>' . __('EmbedPress Pro Required', 'embedpress') . '</strong></p>
				<p>' . __('This feature requires EmbedPress Pro. Please install and activate EmbedPress Pro to access this feature.', 'embedpress') . '</p>
			</div>';
		}

		if (!$license_info['is_features_enabled']) {
			$message = $license_info['status_message'];
			$action_text = '';
			$action_link = admin_url('admin.php?page=embedpress&page_type=license');

			switch ($license_info['license_status']) {
				case 'expired':
					$action_text = __('Renew License', 'embedpress');
					break;
				case 'invalid':
				case 'site_inactive':
				case 'disabled':
				case 'revoked':
					$action_text = __('Activate License', 'embedpress');
					break;
				default:
					$action_text = __('Activate License', 'embedpress');
					break;
			}

			return '<div class="embedpress-pro-notice embedpress-notice-error">
				<p><strong>' . __('Pro Features Disabled', 'embedpress') . '</strong></p>
				<p>' . esc_html($message) . '</p>
				<p><a href="' . esc_url($action_link) . '" class="button button-primary">' . esc_html($action_text) . '</a></p>
			</div>';
		}

		return '';
	}

	/**
	 * Initialize license checking hooks
	 */
	public static function init_license_hooks()
	{
		// Add filter to disable pro features when license is not valid
		add_filter('embedpress_pro_features_enabled', [__CLASS__, 'is_pro_features_enabled']);

		// Add action to show license notices in admin
		add_action('admin_notices', [__CLASS__, 'show_license_admin_notices']);

		// Add styles for license notices
		add_action('admin_head', [__CLASS__, 'add_license_notice_styles']);
	}

	/**
	 * Show license admin notices
	 */
	public static function show_license_admin_notices()
	{
		// Only show on EmbedPress admin pages
		if (!isset($_GET['page']) || $_GET['page'] !== 'embedpress') {
			return;
		}

		$license_info = self::get_license_info();

		if ($license_info['is_pro_active'] && !$license_info['is_features_enabled']) {
			$message = $license_info['status_message'];
			$action_link = admin_url('admin.php?page=embedpress&page_type=license');
			$action_text = $license_info['license_status'] === 'expired' ? __('Renew License', 'embedpress') : __('Activate License', 'embedpress');

			echo '<div class="notice notice-warning is-dismissible">
				<p><strong>' . __('EmbedPress Pro Features Disabled', 'embedpress') . '</strong></p>
				<p>' . esc_html($message) . '</p>
				<p><a href="' . esc_url($action_link) . '" class="button button-primary">' . esc_html($action_text) . '</a></p>
			</div>';
		}
	}

	/**
	 * Add CSS styles for license notices
	 */
	public static function add_license_notice_styles()
	{
		echo '<style>
			.embedpress-pro-notice {
				padding: 15px;
				margin: 15px 0;
				border-left: 4px solid #dc3545;
				background: #fff;
				box-shadow: 0 1px 1px rgba(0,0,0,.04);
			}
			.embedpress-pro-notice.embedpress-notice-warning {
				border-left-color: #ffb900;
			}
			.embedpress-pro-notice.embedpress-notice-error {
				border-left-color: #dc3545;
			}
			.embedpress-pro-notice p {
				margin: 0.5em 0;
			}
			.embedpress-pro-notice strong {
				color: #23282d;
			}
			.embedpress-text-error {
				color: #dc3545 !important;
			}
			.embedpress-text-warning {
				color: #ffb900 !important;
			}
		</style>';
	}

	/**
	 * Get user-friendly license status message
	 *
	 * @param bool $is_pro_active Whether pro plugin is active
	 * @param string $license_status Current license status
	 * @return string User-friendly status message
	 */
	public static function get_license_status_message($is_pro_active, $license_status)
	{
		if (!$is_pro_active) {
			return __('EmbedPress Pro is not installed or activated.', 'embedpress');
		}

		switch ($license_status) {
			case 'valid':
				return __('Your license is active and valid.', 'embedpress');
			case 'expired':
				return __('Your license has expired. Please renew to continue receiving updates and support.', 'embedpress');
			case 'invalid':
			case 'site_inactive':
				return __('Your license is not active for this URL. Please activate your license.', 'embedpress');
			case 'disabled':
			case 'revoked':
				return __('Your license key has been disabled or revoked.', 'embedpress');
			case 'missing':
				return __('License key is missing. Please enter your license key.', 'embedpress');
			case 'http_error':
				return __('Unable to verify license due to connection issues. Please try again later.', 'embedpress');
			case '':
			case false:
			default:
				return __('Please activate your license key to enable EmbedPress Pro features.', 'embedpress');
		}
	}


	public static function getInstagramUserInfo($accessToken, $accountType, $userId, $is_sync = false)
	{
		if ($is_sync) {
			// If $is_sync is true, don't use transient
			$use_transient = false;
		} else {
			// If $is_sync is false, use transient
			$transient_key = 'instagram_user_info_' . $userId;
			$use_transient = true;
		}

		if ($use_transient && false !== ($userInfo = get_transient($transient_key))) {
			// If transient exists, return cached user info
			return $userInfo;
		}

		if (strtolower($accountType) === 'personal') {
			$api_url = 'https://graph.instagram.com/v24.0/me?fields=biography,id,username,website,followers_count,media_count,profile_picture_url,name&access_token=' . $accessToken;
		} else {
			$api_url = 'https://graph.facebook.com/' . $userId . '?fields=biography,id,username,website,followers_count,media_count,profile_picture_url,name&access_token=' . $accessToken;
		}

		$connected_account_type = $accountType;

		$userInfoResponse = wp_remote_get($api_url);

		if (is_wp_error($userInfoResponse)) {
			echo 'Error: Unable to retrieve Instagram user information.';
		} else {
			$userInfoBody = wp_remote_retrieve_body($userInfoResponse);
			$userInfo = json_decode($userInfoBody, true);

			$userInfo['connected_account_type'] = $connected_account_type;
			$userInfo['access_token'] = $accessToken;


			if (!isset($userInfo['profile_picture_url'])) {
				$userInfo['profile_picture_url'] = '';
			}

			// If not using transient, cache the user info for an hour
			if ($use_transient) {
				set_transient($transient_key, $userInfo, HOUR_IN_SECONDS);
			}

			return $userInfo;
		}
	}


	// Get Instagram posts, videos, reels
	public static function getInstagramPosts($access_token, $account_type, $userId, $limit = 100, $is_sync = false)
	{
		if ($is_sync) {
			// If $is_sync is true, don't use transient
			$use_transient = false;
		} else {
			// If $is_sync is false, use transient
			$transient_key = 'instagram_posts_' . $userId;
			$use_transient = true;
		}

		if ($use_transient && false !== ($posts = get_transient($transient_key))) {
			// If transient exists, return cached posts
			return $posts;
		}

		if (strtolower($account_type) === 'personal') {
			$api_url = 'https://graph.instagram.com/v24.0/me/media?fields=id,caption,media_type,media_url,children{media_url,id,media_type},permalink,timestamp,username,thumbnail_url,comments_count,like_count&limit=' . $limit . '&access_token=' . $access_token;
		} else {
			$api_url = 'https://graph.facebook.com/v17.0/' . $userId . '/media?fields=media_url,media_product_type,thumbnail_url,caption,id,media_type,timestamp,username,comments_count,like_count,permalink,children%7Bmedia_url,id,media_type,timestamp,permalink,thumbnail_url%7D&limit=' . $limit . '&access_token=' . $access_token;
		}

		$postsResponse = wp_remote_get($api_url);

		if (is_wp_error($postsResponse)) {
			echo 'Error: Unable to retrieve Instagram posts.';
		} else {
			$postsBody = wp_remote_retrieve_body($postsResponse);
			$posts = json_decode($postsBody, true);

			if (empty($posts['data'])) {
				return 'Please add Instagram Access Token';
			}

			// If not using transient, cache the posts for an hour
			if ($use_transient) {
				set_transient($transient_key, $posts['data'], HOUR_IN_SECONDS);
			}

			return $posts['data'];
		}
	}

	public static function get_enable_settings_data_for_scripts($settings)
	{
		$settings_data = [
			'enabled_ads' => isset($settings['adManager']) && $settings['adManager'] === 'yes' ? 'yes' : '',

			'enabled_custom_player' => isset($settings['emberpress_custom_player']) && $settings['emberpress_custom_player'] === 'yes' ? 'yes' : '',

			'enabled_instafeed' => isset($settings['embedpress_pro_embeded_source']) && $settings['embedpress_pro_embeded_source'] === 'instafeed' ? 'yes' : '',

			'enabled_docs_custom_viewer' => isset($settings['embedpress_document_viewer']) && $settings['embedpress_document_viewer'] === 'custom' ? 'yes' : '',
		];

		update_option('enabled_elementor_scripts', $settings_data);
	}

	public static function get_options_value($key)
	{
		$g_settings = get_option(EMBEDPRESS_PLG_NAME);

		if (isset($g_settings['enableEmbedResizeWidth']) && $g_settings['enableEmbedResizeWidth'] == 1) {
			$g_settings['enableEmbedResizeWidth'] = 600;
			update_option(EMBEDPRESS_PLG_NAME, $g_settings);
		}
		if (isset($g_settings['enableEmbedResizeHeight']) && $g_settings['enableEmbedResizeHeight'] == 1) {
			$g_settings['enableEmbedResizeHeight'] = 600;
			update_option(EMBEDPRESS_PLG_NAME, $g_settings);
		}

		if (isset($g_settings[$key])) {
			return $g_settings[$key];
		}

		return '';
	}



	public static function get_branding_value($key, $provider)
	{
		$settings = get_option(EMBEDPRESS_PLG_NAME . ':' . $provider, []);

		// Check if provider has custom branding enabled and the specific key set
		if (isset($settings['branding']) && $settings['branding'] === 'yes') {
			// If provider has custom logo, use it
			if (isset($settings[$key]) && !empty($settings[$key])) {
				return $settings[$key];
			}

			// If branding is enabled but no custom logo, use global brand as fallback
			if ($key === 'logo_url') {
				$global_logo = self::get_global_brand_logo_url();
				if (!empty($global_logo)) {
					return $global_logo;
				}
			}
		}

		return '';
	}

	/**
	 * Get global brand logo URL
	 *
	 * @return string
	 */
	public static function get_global_brand_logo_url()
	{
		$global_brand_settings = get_option(EMBEDPRESS_PLG_NAME . ':global_brand', []);
		return isset($global_brand_settings['logo_url']) ? $global_brand_settings['logo_url'] : '';
	}

	/**
	 * Get global brand logo ID
	 *
	 * @return int
	 */
	public static function get_global_brand_logo_id()
	{
		$global_brand_settings = get_option(EMBEDPRESS_PLG_NAME . ':global_brand', []);
		return isset($global_brand_settings['logo_id']) ? intval($global_brand_settings['logo_id']) : 0;
	}


	public static function format_number($number)
	{
		if ($number >= 1000000000) {
			return number_format($number / 1000000000, 1) . 'b';
		} elseif ($number >= 1000000) {
			return number_format($number / 1000000, 1) . 'm';
		} elseif ($number >= 1000) {
			return number_format($number / 1000, 1) . 'k';
		} else {
			return $number;
		}
	}

	public static function get_id($item)
	{
		$vid = isset($item->snippet->resourceId->videoId) ? $item->snippet->resourceId->videoId : null;
		$vid = $vid ? $vid : (isset($item->id->videoId) ? $item->id->videoId : null);
		$vid = $vid ? $vid : (isset($item->id) ? $item->id : null);
		return $vid;
	}

	public static function clean_api_error($raw_message)
	{
		return htmlspecialchars(strip_tags(preg_replace('@&key=[^& ]+@i', '&key=*******', $raw_message)));
	}

	public static function clean_api_error_html($raw_message)
	{
		$clean_html = '';
		if ((defined('REST_REQUEST') && REST_REQUEST) || current_user_can('manage_options')) {
			$clean_html = '<div>' . __('EmbedPress: ', 'embedpress') . self::clean_api_error($raw_message) . '</div>';
		}
		return $clean_html;
	}

	public static function get_thumbnail_url($item, $quality, $privacyStatus)
	{
		$url = "";
		if ($privacyStatus == 'private') {
			$url = EMBEDPRESS_URL_ASSETS . 'images/youtube/private.png';
		} elseif (isset($item->snippet->thumbnails->{$quality}->url)) {
			$url = $item->snippet->thumbnails->{$quality}->url;
		} elseif (isset($item->snippet->thumbnails->medium->url)) {
			$url = $item->snippet->thumbnails->medium->url;
		} elseif (isset($item->snippet->thumbnails->default->url)) {
			$url = $item->snippet->thumbnails->default->url;
		} elseif (isset($item->snippet->thumbnails->high->url)) {
			$url = $item->snippet->thumbnails->high->url;
		} else {
			$url = EMBEDPRESS_URL_ASSETS . 'images/youtube/deleted-video-thumb.png';
		}
		return $url;
	}

	public static function compare_vid_date($a, $b)
	{
		$dateA = strtotime($a->snippet->publishedAt);
		$dateB = strtotime($b->snippet->publishedAt);

		// Sort in descending order (newest first)
		return $dateB - $dateA;
	}


	public static function get_youtube_video_data($api_key, $video_id)
	{
		// Set a unique transient name based on the video ID
		$transient_name = 'youtube_video_data_' . $video_id;

		// Try to get data from the transient cache
		$video_data = get_transient($transient_name);

		// If no cached data, fetch from the API
		if ($video_data === false) {
			// YouTube Data API URL
			$url = "https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,statistics&id={$video_id}&key={$api_key}";

			// Fetch the data from the API
			$response = wp_remote_get($url);

			if (is_wp_error($response)) {
				return false; // Return false if there is an error
			}

			$body = wp_remote_retrieve_body($response);
			$video_data = json_decode($body, true);

			if (isset($video_data['items'][0])) {
				$video_data = $video_data['items'][0];

				// Cache the data in a transient for 12 hours
				set_transient($transient_name, $video_data, 24 * HOUR_IN_SECONDS);
			} else {
				return false; // Return false if no data found
			}
		}

		return $video_data;
	}

	public static function trimTitle($title, $wordCount)
	{
		$words = explode(' ', $title);

		if (count($words) <= $wordCount) {
			return $title; // No trimming needed
		}

		$trimmedWords = array_slice($words, 0, $wordCount);

		return implode(' ', $trimmedWords) . ' ...';
	}

	public static function timeAgo($datetime)
	{
		$now = new \DateTime();
		$date = new \DateTime($datetime);
		$interval = $now->diff($date);

		if ($interval->y > 0) {
			return $interval->y . ' year' . ($interval->y > 1 ? 's' : '') . ' ago';
		} elseif ($interval->m > 0) {
			return $interval->m . ' month' . ($interval->m > 1 ? 's' : '') . ' ago';
		} elseif ($interval->d > 0) {
			return $interval->d . ' day' . ($interval->d > 1 ? 's' : '') . ' ago';
		} elseif ($interval->h > 0) {
			return $interval->h . ' hour' . ($interval->h > 1 ? 's' : '') . ' ago';
		} elseif ($interval->i > 0) {
			return $interval->i . ' minute' . ($interval->i > 1 ? 's' : '') . ' ago';
		} else {
			return 'just now';
		}
	}

	public static function removeQuote($attributes)
	{
		$parsedAttributes = [];

		$regex = '/^on.*/i';

		foreach ($attributes as $key => $value) {
			if (is_string($value)) {
				$cleanValue = str_replace(['"', "'"], '', $value);
			} else {
				$cleanValue = $value;
			}

			if (!preg_match($regex, $key)) {
				$parsedAttributes[$key] = $cleanValue;
			}
		}

		return $parsedAttributes;
	}

	public static function getBooleanParam($param, $default = false)
	{
		if (in_array($param, [true, 'true', 'yes', 1, '1'], true)) {
			return true;
		}
		if (in_array($param, [false, 'false', 'no', 0, '0'], true)) {
			return false;
		}
		return (bool) $default;
	}

	public static function get_elementor_global_color($settings, $key)
	{

		$global_color = $settings[$key];

		if (isset($settings['__globals__'][$key])) {
			$color_setting = $settings['__globals__'][$key];

			if (strpos($color_setting, 'globals/colors?id=') === 0) {
				// It's a global color reference
				$global_id = str_replace('globals/colors?id=', '', $color_setting);

				$kit  = Plugin::$instance->kits_manager->get_current_settings();

				$system_colors = isset($kit['system_colors']) ? $kit['system_colors'] : [];
				$custom_colors = isset($kit['custom_colors']) ? $kit['custom_colors'] : [];
				$global_colors = array_merge($system_colors, $custom_colors);

				foreach ($global_colors as $color) {

					if ($color['_id'] === $global_id) {
						$global_color = $color['color'];  // Found a match, set the color
						break;
					}
				}
			}
		}
		return $global_color;
	}

	public static function get_provider_name($source_url)
	{
		if (self::is_youtube_channel($source_url)) {
			$source_name = 'YoutubeChannel';
		} else if (self::is_youtube($source_url)) {
			$source_name = 'Youtube';
		} else if (!empty(self::is_file_url($source_url))) {
			$source_name = 'document_' . self::get_extension_from_file_url($source_url);
		} else if (self::is_opensea($source_url)) {
			$source_name  = 'OpenSea';
		} else if (self::is_instagram_feed($source_url)) {
			$source_name  = 'InstagramFeed';
		}else {
			Shortcode::get_embera_instance();
			$collectios = Shortcode::get_collection();
			$provider = $collectios->findProviders($source_url);

			if (!empty($provider[$source_url])) {
				$source_name = $provider[$source_url]->getProviderName();
			} else {
				$host = parse_url($source_url, PHP_URL_HOST);
				if ($host) {
					$parts = explode('.', $host);
					if (count($parts) > 1) {
						$source_name = $parts[1];
					} else {
						// Handle the case where the host doesn't have at least two parts
						$source_name = $host;
					}
				} else {
					// Handle the case where parse_url fails
					$source_name = '';
				}
			}
		}

		return $source_name;
	}

	public static function get_user_roles()
	{
		global $wp_roles; // Access global roles object
		$user_roles = [];

		if (isset($wp_roles->roles) && is_array($wp_roles->roles)) {
			foreach ($wp_roles->roles as $role_key => $role_data) {
				$user_roles[] = [
					'value' => $role_key,       // Machine-readable key
					'label' => $role_data['name'], // Human-readable name
				];
			}
		}

		return $user_roles;
	}

	/**
	 * Sign the YouTube pagination params the server itself rendered.
	 *
	 * The public pagination endpoints (AJAX `youtube_rest_api` and REST
	 * `embedpress/v1/youtube-playlist-items`) serve logged-out visitors, so a
	 * capability check is not an option. Instead every prev/next button and
	 * playlist root carries this HMAC, and the endpoints refuse any
	 * playlist/page-token/page-size combination the site did not emit —
	 * visitors can page through galleries the site embeds, but nobody can
	 * spend the site's YouTube API quota or create cache rows for arbitrary
	 * input. Not time-bound, so page-cached markup keeps working.
	 */
	public static function yt_page_sig($playlist_id, $page_token, $page_size)
	{
		$data = 'ep-yt-page|' . (string) $playlist_id . '|' . (string) $page_token . '|' . (int) $page_size;
		return hash_hmac('sha256', $data, wp_salt('nonce'));
	}

	/**
	 * Verify a signature from yt_page_sig() and the shape of its params.
	 * Must pass before any outbound API request or transient write.
	 */
	public static function verify_yt_page_sig($sig, $playlist_id, $page_token, $page_size)
	{
		if (!is_string($sig) || !preg_match('/^[a-f0-9]{64}$/', $sig)) {
			return false;
		}
		if (!is_string($playlist_id) || !preg_match('/^[A-Za-z0-9_-]{2,64}$/', $playlist_id)) {
			return false;
		}
		if (!is_string($page_token) || ($page_token !== '' && !preg_match('/^[A-Za-z0-9_-]{1,128}$/', $page_token))) {
			return false;
		}
		$page_size = (int) $page_size;
		if ($page_size < 1 || $page_size > 50) {
			return false;
		}
		return hash_equals(self::yt_page_sig($playlist_id, $page_token, $page_size), $sig);
	}


}
