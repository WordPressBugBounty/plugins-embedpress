/**
 * EmbedPress — PDF viewer extension loader.
 *
 * viewer.html is a standalone document loaded in an iframe, not a
 * WordPress-enqueued page, so there is no wp_enqueue_script hook a plugin
 * could use to add behaviour to it. This loader is that hook: the embedding
 * PHP appends an `ext` hash param naming one or more extension scripts, and
 * each is loaded into the viewer after ep-scripts.js has run.
 *
 * Pro uses it to ship the PDF watermark. With no `ext` param — every free
 * install — this file does nothing at all.
 *
 * SECURITY: `ext` names a script, it does not supply a URL. Each name is
 * looked up in the allowlist below and anything unrecognised is ignored, so
 * a crafted iframe src cannot make the viewer load an arbitrary file. Paths
 * resolve against this script's own directory, which is served from the free
 * plugin's assets — same origin as the viewer itself.
 *
 * Extensions are registered by copying the script into this directory and
 * adding its name here. PHP decides *whether* to request one (see
 * Helper::pdf_viewer_extensions()); this file decides *what* that name is
 * allowed to resolve to.
 */
(function epExtensionLoader() {
    'use strict';

    /**
     * name → filename, both inside this directory.
     * @type {Object<string, string>}
     */
    var ALLOWED = {
        watermark: 'ep-watermark.js'
    };

    var raw = '';
    try {
        var params = new URLSearchParams(location.hash.substring(1));

        // The embedding PHP base64-encodes the whole param string under `key`
        // (see getParamObj() in ep-scripts.js); unwrap it the same way before
        // looking for `ext`.
        if (params.get('key') !== null) {
            params = new URLSearchParams(atob(params.get('key')));
        }

        raw = params.get('ext') || '';
    } catch (e) {
        return;
    }

    if (!raw) {
        return;
    }

    var baseHref;
    try {
        baseHref = new URL('.', import.meta.url).href;
    } catch (e) {
        baseHref = new URL('.', location.href).href;
    }

    var seen = {};

    raw.split(',').forEach(function (entry) {
        var name = decodeURIComponent(entry).trim();

        if (!name || seen[name] || !Object.prototype.hasOwnProperty.call(ALLOWED, name)) {
            return;
        }
        seen[name] = true;

        var script = document.createElement('script');
        script.type = 'module';
        script.src = new URL(ALLOWED[name], baseHref).href;

        // The script only exists while the plugin that owns it is active, so a
        // stale `ext` in a cached or hand-edited URL can point at a file that
        // is gone. Swallow that quietly instead of surfacing a load error.
        script.onerror = function () {
            if (script.parentNode) {
                script.parentNode.removeChild(script);
            }
        };

        document.head.appendChild(script);
    });
})();
