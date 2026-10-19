/**
 * YouTube "Error 153" fix for the iframed block-editor canvas.
 *
 * WordPress renders the post-editor canvas inside an iframe whose document
 * is a `blob:` URL. Browsers never send an HTTP Referer for requests that
 * originate from a blob: document, and YouTube rejects embeds without an
 * embedder identity (player error 153, QoE beacon:
 * `embedder.identity.missing.referrer`). `referrerpolicy` attributes and
 * the `origin`/`widget_referrer` query params cannot compensate — YouTube
 * checks the actual header.
 *
 * Core's embed previews dodge this via the SandBox component: a src-less
 * iframe whose content is written with document.open()/write() from the
 * admin page's script context. Per the HTML spec, document.open() re-points
 * the document's URL to the *running script's* responsible document — the
 * real https admin URL — so requests from inside it carry a valid Referer.
 *
 * These helpers apply the same trick to EmbedPress previews, and only when
 * needed: on the frontend, in Elementor, or in a non-iframed editor the
 * host document has an https URL and everything is left untouched.
 */

const YT_EMBED_RE = /^https?:\/\/(?:www\.)?(?:youtube\.com|youtube-nocookie\.com)\/embed\//i;

export const isYouTubeEmbedSrc = (src) => YT_EMBED_RE.test(src || '');

// Only documents without a real http(s) URL drop the Referer header.
export const docNeedsRefererProxy = (doc) =>
	!!doc && /^(?:blob:|about:)/i.test(doc.URL || '');

const escAttr = (value) =>
	String(value)
		.replace(/&/g, '&amp;')
		.replace(/"/g, '&quot;')
		.replace(/</g, '&lt;');

/**
 * Fill a src-less iframe with a full-bleed page containing the real
 * YouTube iframe. Must be called from the admin page's script context so
 * the written document gets the admin URL (and therefore a Referer).
 */
export function writeRefererProxyDoc(iframe, src, attrs = {}) {
	if (!iframe || !isYouTubeEmbedSrc(src)) {
		return;
	}
	if (iframe.dataset.epRefererProxy === src) {
		return; // already showing this src
	}
	iframe.dataset.epRefererProxy = src;

	const passThrough = {
		allow: 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share',
		referrerpolicy: 'strict-origin-when-cross-origin',
		...attrs,
	};
	const attrString = Object.entries(passThrough)
		.filter(([, v]) => v !== undefined && v !== null && v !== false)
		.map(([k, v]) => `${k}="${escAttr(v === true ? '' : v)}"`)
		.join(' ');

	const MARKER = 'data-ep-referer-proxy-doc';
	const html =
		'<!doctype html><html><head><style>' +
		'html,body{margin:0;padding:0;height:100%;overflow:hidden;background:transparent}' +
		'iframe{display:block;width:100%;height:100%;border:0}' +
		'</style></head><body>' +
		`<iframe ${MARKER} src="${escAttr(src)}" ${attrString} allowfullscreen></iframe>` +
		'</body></html>';

	const write = () => {
		const idoc = iframe.contentDocument;
		if (!idoc) {
			return;
		}
		idoc.open();
		idoc.write(html);
		idoc.close();
	};

	// Firefox queues an async about:blank navigation for freshly-inserted
	// iframes that lands AFTER a synchronous write and wipes it (Chrome
	// doesn't). Same pattern as core's SandBox: write now, and re-write on
	// any load event whose document lacks our content. document.close()
	// itself fires load, so the marker check terminates the cycle; the
	// counter is a hard stop against pathological reload loops.
	let rewrites = 0;
	const onLoad = () => {
		if (rewrites >= 3 || iframe.dataset.epRefererProxy !== src) {
			iframe.removeEventListener('load', onLoad);
			return;
		}
		try {
			const idoc = iframe.contentDocument;
			if (idoc && idoc.querySelector(`iframe[${MARKER}]`)) {
				return; // our content survived
			}
			rewrites++;
			write();
		} catch (e) {
			// Cross-origin document (a previously-set src finished loading):
			// navigate back to a writable about:blank; its load re-enters here.
			rewrites++;
			try {
				iframe.contentWindow.location.replace('about:blank');
			} catch (err) {
				iframe.removeEventListener('load', onLoad);
			}
		}
	};
	iframe.addEventListener('load', onLoad);
	try {
		write();
	} catch (e) {
		// Initial document not writable (pending cross-origin navigation);
		// the load handler will recover.
	}
}

/**
 * Replace every YouTube embed iframe inside `rootEl` with a referer-proxy
 * iframe. No-op unless rootEl lives in a blob:/about: document (the
 * iframed editor canvas). Safe to call repeatedly — already-proxied
 * iframes are skipped.
 */
export function proxyYouTubeIframes(rootEl) {
	if (!rootEl || typeof rootEl.querySelectorAll !== 'function') {
		return;
	}
	const doc = rootEl.ownerDocument;
	if (!docNeedsRefererProxy(doc)) {
		return;
	}
	rootEl.querySelectorAll('iframe').forEach((old) => {
		if (old.dataset.epRefererProxy) {
			return;
		}
		const src = old.getAttribute('src') || '';
		if (!isYouTubeEmbedSrc(src)) {
			return;
		}
		const proxy = doc.createElement('iframe');
		for (const attr of [...old.attributes]) {
			if (attr.name !== 'src' && attr.name !== 'srcdoc') {
				proxy.setAttribute(attr.name, attr.value);
			}
		}
		old.replaceWith(proxy);
		writeRefererProxyDoc(proxy, src, {
			...(old.getAttribute('allow') ? { allow: old.getAttribute('allow') } : {}),
			...(old.getAttribute('title') ? { title: old.getAttribute('title') } : {}),
		});
	});
}
