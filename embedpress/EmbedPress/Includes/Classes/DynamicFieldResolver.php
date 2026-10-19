<?php

namespace EmbedPress\Includes\Classes;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Free-side entry point for Dynamic Source, a Pro feature.
 *
 * Dynamic Source resolves an embed URL from a custom-field source (ACF,
 * MetaBox, Pods, Toolset, JetEngine, raw post meta). The resolution logic is
 * a Pro implementation and lives in the Pro plugin; free keeps this class as
 * the stable entry point the render surfaces call into.
 *
 * Why the class stays in free rather than moving wholesale: it is referenced
 * from nine call sites across the free render path (Gutenberg renderer,
 * shortcode, Elementor PDF and Document widgets) and — critically — from two
 * REST routes registered in Core.php as string callables. WordPress does not
 * validate callables at registration time, so a missing class there would
 * surface as rest_invalid_handler or a PHP error on dispatch rather than a
 * clean 404. Keeping a stub preserves every one of those contracts.
 *
 * Pro supplies the implementation by hooking
 * `embedpress/dynamic_source/resolver` with an object exposing the same four
 * public methods. With Pro absent (or unlicensed) every method here returns
 * its documented empty value, and callers fall back to the editor-preview URL
 * exactly as they did when the feature was gated inline.
 *
 * Note the call sites are already gated on Helper::is_pro_features_enabled()
 * — the genuine licence check — so in practice these methods are only reached
 * on a licensed Pro install. The empty returns are the safety net, not the
 * gate.
 */
class DynamicFieldResolver
{
    /**
     * Cached resolver supplied by Pro, or null on a free install.
     *
     * @var object|null
     */
    private static $resolver;

    /**
     * Whether the resolver lookup has run. Distinct from a null resolver,
     * which is also the settled "free install" state.
     *
     * @var bool
     */
    private static $resolved = false;

    /**
     * @return object|null
     */
    private static function resolver()
    {
        if (!self::$resolved) {
            self::$resolved = true;

            $resolver = apply_filters('embedpress/dynamic_source/resolver', null);
            self::$resolver = is_object($resolver) ? $resolver : null;
        }

        return self::$resolver;
    }

    /**
     * Resolve a custom-field URL given an explicit source + field name.
     * Used by Gutenberg blocks and shortcodes (which know their source directly).
     *
     * @param string   $source  acf|metabox|pods|toolset|jetengine|meta
     * @param string   $field   Field name / key on the current post.
     * @param int|null $post_id Defaults to current queried post.
     * @return string Resolved URL, or '' when no value / source unavailable.
     */
    public static function resolve_field($source, $field, $post_id = null)
    {
        $resolver = self::resolver();

        return $resolver ? $resolver->resolve_field($source, $field, $post_id) : '';
    }

    /**
     * Resolve Elementor's `__dynamic__` control blob (the picker emits an
     * HTML-encoded value carrying the source + field).
     *
     * @param string $dynamic_value Raw `__dynamic__[<control>]` value.
     * @return string Resolved URL, or '' if nothing could be resolved.
     */
    public static function resolve_elementor_dynamic($dynamic_value)
    {
        $resolver = self::resolver();

        return $resolver ? $resolver->resolve_elementor_dynamic($dynamic_value) : '';
    }

    /**
     * REST: list the selectable fields for a source, so the editor can offer a
     * dropdown instead of a hand-typed key.
     *
     * Response: { fields: [{ value, label }, ...], available: bool, message }
     *
     * @param \WP_REST_Request $request
     * @return \WP_REST_Response
     */
    public static function rest_list_fields(\WP_REST_Request $request)
    {
        $resolver = self::resolver();

        if (!$resolver) {
            return rest_ensure_response([
                'fields'    => [],
                'available' => false,
                'message'   => __('Dynamic Source requires EmbedPress Pro.', 'embedpress'),
            ]);
        }

        return $resolver->rest_list_fields($request);
    }

    /**
     * REST: resolve a source + field to its URL, so the block editor canvas
     * can preview the real value instead of the saved placeholder.
     *
     * @param \WP_REST_Request $request
     * @return \WP_REST_Response
     */
    public static function rest_resolve_field(\WP_REST_Request $request)
    {
        $resolver = self::resolver();

        if (!$resolver) {
            return rest_ensure_response([
                'url'     => '',
                'message' => __('Dynamic Source requires EmbedPress Pro.', 'embedpress'),
            ]);
        }

        return $resolver->rest_resolve_field($request);
    }
}
