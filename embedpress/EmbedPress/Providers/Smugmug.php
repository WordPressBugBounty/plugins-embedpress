<?php

namespace EmbedPress\Providers;

use Embera\Url;
use Embera\Provider\Smugmug as EmberaSmugmug;

(defined('ABSPATH') && defined('EMBEDPRESS_IS_LOADED')) or die("No direct script access allowed.");

/**
 * Entity responsible to support SmugMug embeds.
 *
 * Overrides the vendored Embera\Provider\Smugmug, whose validateUrl() only
 * accepts URLs with exactly three path segments after the host. That rejects
 * two common, valid forms:
 *
 *   1. Direct CDN image URLs, which always carry a deep
 *      /<i-key>/0/<hash>/<SIZE>/<file>.jpg tail.
 *   2. Photo pages in galleries nested deeper than two folders.
 *
 * Because Embera resolves a provider by wildcard host and does not fall through
 * to the next match when validateUrl() fails, that rejection was terminal — the
 * URL resolved to nothing even though SelfHosted would otherwise have matched
 * the *.com wildcard. Registering this class for *.smugmug.com in providers.php
 * overwrites the vendored mapping so this widened matcher runs instead.
 *
 * @package     EmbedPress
 * @subpackage  EmbedPress/Providers
 * @author      EmbedPress <help@embedpress.com>
 * @copyright   Copyright (C) 2023 WPDeveloper. All rights reserved.
 * @license     GPLv3 or later
 * @since       4.6.6
 *
 * @see https://github.com/WPDevelopers/embedpress/issues/290
 */
class Smugmug extends EmberaSmugmug
{
    /**
     * Matches a direct image file on the SmugMug CDN, e.g.
     * https://photos.smugmug.com/<Gallery>/<Sub>/i-<key>/0/<hash>/XL/<file>-XL.jpg
     *
     * @var string
     */
    private $imageRegexPattern = '~smugmug\.com/.+\.(?:jpe?g|png|gif|webp)$~i';

    /**
     * Verifies the embed URL belongs to SmugMug, accepting an arbitrary gallery
     * depth and an optional direct-image CDN tail.
     *
     * @param Url $url
     * @return boolean
     */
    public function validateUrl(Url $url)
    {
        $urlString = (string) $url;

        // Direct image file on the CDN — rendered locally as an <img>.
        if (preg_match($this->imageRegexPattern, $urlString)) {
            return true;
        }

        // Any smugmug.com page with at least two path segments after the host
        // (gallery + node), at any nesting depth. The vendored provider capped
        // this at exactly three; this accepts two-or-more so deep galleries pass.
        return (bool) preg_match('~smugmug\.com/([^/]+)/(.+)$~i', $urlString);
    }

    /**
     * Fakes an oEmbed response for direct image URLs. The SmugMug oEmbed API
     * does not serve the CDN image form, so it must be rendered locally rather
     * than fetched; gallery/photo pages fall through to the parent's oEmbed
     * endpoint and modifyResponse() untouched.
     *
     * @return array
     */
    public function fakeResponse()
    {
        $url = (string) $this->getUrl();

        if (!preg_match($this->imageRegexPattern, $url)) {
            return [];
        }

        $width  = isset($this->config['maxwidth']) ? $this->config['maxwidth'] : 600;
        $height = isset($this->config['maxheight']) ? $this->config['maxheight'] : 450;

        $html = '<div class="smugmug-html">'
            . '<img src="' . esc_url($url) . '" alt="" width="' . esc_attr($width) . '" height="' . esc_attr($height) . '" />'
            . '</div>';

        return [
            'type'          => 'photo',
            'provider_name' => 'SmugMug',
            'provider_url'  => 'https://www.smugmug.com',
            'url'           => $url,
            'html'          => $html,
        ];
    }

    /**
     * For direct images, return the faked <img> response; otherwise defer to the
     * parent (vendored) oEmbed photo handling.
     *
     * @param array $response
     * @return array
     */
    public function modifyResponse(array $response = [])
    {
        $faked = $this->fakeResponse();
        if (!empty($faked)) {
            return $faked;
        }

        return parent::modifyResponse($response);
    }
}
