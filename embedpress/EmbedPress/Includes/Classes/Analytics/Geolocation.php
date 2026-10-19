<?php

namespace EmbedPress\Includes\Classes\Analytics;

defined('ABSPATH') or die("No direct script access allowed.");

/**
 * Visitor geolocation, consent-gated.
 *
 * Single source of truth for "which country is this visitor in?", shared by
 * analytics (country/city breakdowns) and the Pro custom-player country
 * restriction (via EmbedPressBlockRenderer::resolve_visitor_country_public()).
 *
 * Resolution order:
 *   1. Trusted CDN / reverse-proxy / server GeoIP headers (CF-IPCountry,
 *      CloudFront-Viewer-Country, X-Country-Code, GEOIP_COUNTRY_CODE, …).
 *      Nothing leaves the server.
 *   2. The `embedpress_visitor_country` filter, so a site can plug in its own
 *      local GeoIP database.
 *   3. An HTTPS lookup of the visitor IP at ipapi.co, falling back to
 *      ipinfo.io (cached per IP), gated by purpose:
 *        - 'analytics': ONLY when the site owner has opted in (Analytics →
 *          "Visitor Geolocation", option
 *          `embedpress_analytics_geolocation_enabled`, OFF by default).
 *        - 'restriction': always allowed. A site owner who configures a
 *          country restriction on an embed has explicitly asked for that
 *          embed's visitors to be geolocated.
 *      Either default can be overridden with the
 *      `embedpress/geolocation/allow_remote_lookup` filter.
 *
 * With the lookup not allowed and no header present, the country is unknown.
 *
 * @since 4.6.9
 */
class Geolocation
{
    /**
     * wp_options key for the explicit opt-in. Absent = off, so both fresh and
     * existing installs start with no visitor IP leaving the site.
     */
    const OPT_ENABLED = 'embedpress_analytics_geolocation_enabled';

    /** Analytics country/city breakdowns: remote lookup needs the opt-in. */
    const PURPOSE_ANALYTICS = 'analytics';

    /** Per-embed country restriction (Pro): remote lookup allowed by default. */
    const PURPOSE_RESTRICTION = 'restriction';

    /**
     * Server variables that carry an ISO-3166 alpha-2 country code set by a
     * CDN, reverse proxy or a server-side GeoIP module.
     */
    const COUNTRY_HEADERS = [
        'HTTP_CF_IPCOUNTRY',                // Cloudflare
        'HTTP_CLOUDFRONT_VIEWER_COUNTRY',   // AWS CloudFront
        'HTTP_X_VERCEL_IP_COUNTRY',         // Vercel
        'HTTP_X_APPENGINE_COUNTRY',         // Google App Engine
        'HTTP_FASTLY_GEO_COUNTRY_CODE',     // Fastly (custom VCL convention)
        'HTTP_X_COUNTRY_CODE',              // Generic proxy convention
        'HTTP_GEOIP_COUNTRY_CODE',          // nginx geoip passed as header
        'GEOIP_COUNTRY_CODE',               // Apache mod_geoip / nginx geoip
        'MM_COUNTRY_CODE',                  // Apache mod_maxminddb
    ];

    /**
     * Server variables that carry a city name, when the CDN provides one.
     */
    const CITY_HEADERS = [
        'HTTP_CF_IPCITY',                   // Cloudflare "visitor location headers"
        'HTTP_CLOUDFRONT_VIEWER_CITY',      // AWS CloudFront
        'HTTP_X_VERCEL_IP_CITY',            // Vercel (URL-encoded)
        'HTTP_X_APPENGINE_CITY',            // Google App Engine
        'GEOIP_CITY',                       // Apache mod_geoip
        'MM_CITY_NAME',                     // Apache mod_maxminddb
    ];

    /**
     * Whether the site owner has opted in to IP-based lookups.
     */
    public static function is_lookup_enabled(): bool
    {
        return (bool) get_option(self::OPT_ENABLED, false);
    }

    /**
     * Whether an HTTPS lookup of the visitor IP may run for this purpose.
     *
     * Analytics follows the opt-in toggle. A country restriction configured
     * on an embed is itself the site owner's opt-in, so it is allowed by
     * default. Sites can veto (or grant) either via
     * `embedpress/geolocation/allow_remote_lookup` (bool $allowed, string $purpose).
     */
    public static function is_remote_lookup_allowed(string $purpose = self::PURPOSE_ANALYTICS): bool
    {
        $allowed = $purpose === self::PURPOSE_RESTRICTION ? true : self::is_lookup_enabled();
        return (bool) apply_filters('embedpress/geolocation/allow_remote_lookup', $allowed, $purpose);
    }

    /**
     * The third-party services an opted-in lookup may contact, for
     * disclosure in the settings UI. Filterable alongside the lookup itself.
     */
    public static function providers(): array
    {
        return (array) apply_filters('embedpress/geolocation/providers', [
            'ipapi.co'  => 'https://ipapi.co/%s/json/',
            'ipinfo.io' => 'https://ipinfo.io/%s/json',
        ]);
    }

    /**
     * Resolve the visitor's location.
     *
     * @param string $purpose self::PURPOSE_ANALYTICS (default) or
     *                        self::PURPOSE_RESTRICTION. Decides whether the
     *                        HTTPS lookup may run; headers are always tried first.
     * @return array{country_code: string, city: string} Empty strings when unknown.
     */
    public static function resolve(string $purpose = self::PURPOSE_ANALYTICS): array
    {
        $code = self::country_from_headers();
        $city = $code !== '' ? self::city_from_headers() : '';

        if ($code === '') {
            $code = self::normalize_code((string) apply_filters('embedpress_visitor_country', ''));
        }

        if ($code === '' && self::is_remote_lookup_allowed($purpose)) {
            $ip = self::client_ip();
            if ($ip !== '') {
                $looked_up = self::lookup($ip);
                $code = $looked_up['country_code'];
                $city = $looked_up['city'];
            }
        }

        return ['country_code' => $code, 'city' => $city];
    }

    /**
     * Country code from trusted headers only (never makes a request).
     */
    public static function country_from_headers(): string
    {
        foreach (self::COUNTRY_HEADERS as $key) {
            if (empty($_SERVER[$key])) {
                continue;
            }
            $code = self::normalize_code(sanitize_text_field(wp_unslash($_SERVER[$key])));
            if ($code !== '') {
                return $code;
            }
        }
        return '';
    }

    private static function city_from_headers(): string
    {
        foreach (self::CITY_HEADERS as $key) {
            if (!empty($_SERVER[$key])) {
                return sanitize_text_field(rawurldecode(wp_unslash($_SERVER[$key])));
            }
        }
        return '';
    }

    /**
     * Accept only a real ISO alpha-2 code. Cloudflare uses XX for unknown and
     * T1 for Tor; neither is a country.
     */
    private static function normalize_code(string $code): string
    {
        $code = strtoupper(trim($code));
        if (!preg_match('/^[A-Z]{2}$/', $code) || in_array($code, ['XX', 'T1', 'ZZ'], true)) {
            return '';
        }
        return $code;
    }

    /**
     * Best-effort public client IP. Only consulted when a remote lookup is allowed.
     */
    public static function client_ip(): string
    {
        foreach (['HTTP_CF_CONNECTING_IP', 'HTTP_X_FORWARDED_FOR', 'HTTP_X_REAL_IP', 'REMOTE_ADDR'] as $key) {
            if (empty($_SERVER[$key])) {
                continue;
            }
            $candidate = trim(explode(',', sanitize_text_field(wp_unslash($_SERVER[$key])))[0]);
            if (filter_var($candidate, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) {
                return $candidate;
            }
        }
        return '';
    }

    /**
     * HTTPS lookup of a public IP. Callers must have checked
     * is_remote_lookup_allowed().
     *
     * @return array{country_code: string, city: string}
     */
    private static function lookup(string $ip): array
    {
        $empty = ['country_code' => '', 'city' => ''];

        $cache_key = 'embedpress_geo_' . md5($ip);
        $cached = get_transient($cache_key);
        if (is_array($cached) && isset($cached['country_code'])) {
            return $cached;
        }

        foreach (self::providers() as $template) {
            $url = sprintf((string) $template, rawurlencode($ip));
            // Never send a visitor IP in plaintext.
            if (strpos($url, 'https://') !== 0) {
                continue;
            }

            $response = wp_remote_get($url, [
                'timeout' => 3,
                'headers' => ['Accept' => 'application/json'],
            ]);
            if (is_wp_error($response) || (int) wp_remote_retrieve_response_code($response) !== 200) {
                continue;
            }

            $data = json_decode((string) wp_remote_retrieve_body($response), true);
            if (!is_array($data)) {
                continue;
            }

            // ipapi.co: country_code + city; ipinfo.io: country + city.
            $code = self::normalize_code((string) ($data['country_code'] ?? ($data['country'] ?? '')));
            if ($code === '') {
                continue;
            }

            $city = isset($data['city']) ? sanitize_text_field((string) $data['city']) : '';
            if (in_array($city, ['Unknown', 'Undefined'], true)) {
                $city = '';
            }

            $result = ['country_code' => $code, 'city' => $city];
            set_transient($cache_key, $result, DAY_IN_SECONDS);
            return $result;
        }

        // Negative-cache briefly so a failing provider doesn't add a request
        // to every page view.
        set_transient($cache_key, $empty, 5 * MINUTE_IN_SECONDS);
        return $empty;
    }
}
