/**
 * Editor popover guard — prevents the block editor from crashing when the
 * iframed canvas is torn down while a Floating UI popover is still mounted.
 *
 * THE BUG (FB #84254)
 * -------------------
 * WordPress only iframes the editor canvas when EVERY block in the post is
 * `apiVersion >= 3` (see `useShouldIframe()` in wp-includes/js/dist/edit-post.js).
 * EmbedPress blocks are `apiVersion: 2`, so inserting one into a post that was
 * being edited in the iframed canvas flips that condition to false and core
 * destroys the `editor-canvas` iframe mid-flight.
 *
 * The block toolbar / between-blocks insertion-point popovers are still mounted
 * at that moment. Floating UI's `autoUpdate()` then runs:
 *
 *     getOverflowAncestors(node)
 *       -> const win = getWindow(scrollableAncestor)
 *       -> getFrameElement(win)            // returns null: the frame is gone
 *       -> getOverflowAncestors(null)      // core recurses WITHOUT a null check
 *       -> getNearestOverflowAncestor(null)
 *       -> getComputedStyle(null)          // TypeError -> React unmounts the editor
 *
 * Result: "The editor has encountered an unexpected error."
 *
 * WHY THE GUARD LIVES HERE
 * ------------------------
 * `useShouldIframe()` exposes no filter, so the teardown itself cannot be
 * prevented from a plugin. The throw is core passing `null` into a DOM API that
 * requires an Element -- a call that is meaningless for a null argument in the
 * first place. We make that single call non-fatal.
 *
 * Scope is deliberately minimal:
 *   - Only runs on block editor screens where EmbedPress is active.
 *   - Only intercepts non-Element arguments. Every real Element call goes
 *     straight through to the native implementation, untouched.
 *   - Returns an inert style-declaration-shaped stub, which is what the
 *     Floating UI ancestor walk reads (`overflow`, `overflowX`, `overflowY`,
 *     `display`, `position`) before discarding the branch.
 *
 * This mirrors what upstream Floating UI does today: newer versions null-check
 * `frameElement` before recursing. The guard becomes a no-op once WordPress
 * ships that version.
 */
(function () {
	'use strict';

	if (typeof window === 'undefined' || !window.getComputedStyle) {
		return;
	}

	// Guard against double-installation (script enqueued twice, HMR, etc.).
	if (window.__embedpressPopoverGuardInstalled) {
		return;
	}
	window.__embedpressPopoverGuardInstalled = true;

	var native = window.getComputedStyle.bind(window);

	// Values the Floating UI overflow-ancestor walk reads. `visible`/`static`
	// make it treat the node as a non-scrolling, non-positioned ancestor, so it
	// stops walking that branch instead of throwing.
	var INERT = {
		overflow: 'visible',
		overflowX: 'visible',
		overflowY: 'visible',
		display: 'block',
		position: 'static',
		getPropertyValue: function (prop) {
			return Object.prototype.hasOwnProperty.call(INERT, prop) &&
				typeof INERT[prop] === 'string'
				? INERT[prop]
				: '';
		},
	};

	window.getComputedStyle = function (element, pseudoElement) {
		// Anything that is a real Element keeps the exact native behaviour.
		//
		// The check is `nodeType`, NOT `instanceof Element`, and that matters:
		// `instanceof` is realm-bound. The editor canvas is an IFRAME, so its
		// elements come from a different realm and fail `instanceof Element`
		// against this window even while they are perfectly real, attached
		// elements. Using `instanceof` here handed every element inside the
		// iframed canvas the inert stub below during NORMAL editing — the exact
		// opposite of this guard's contract that real elements pass through
		// untouched — so anything measuring layout in the canvas silently read
		// `overflow: visible` / `position: static` instead of its true style.
		// `nodeType === 1` (ELEMENT_NODE) is realm-agnostic and correct here.
		if (element && element.nodeType === 1) {
			// Resolve against the element's OWN view. An element inside the
			// editor-canvas iframe must be measured by that iframe's window;
			// passing it to the outer window's implementation resolves it
			// against the wrong view. Fall back to the native outer
			// implementation when the element has no defaultView (detached).
			var view =
				element.ownerDocument && element.ownerDocument.defaultView;
			if (view && view !== window &&
				typeof view.getComputedStyle === 'function') {
				return view.getComputedStyle(element, pseudoElement);
			}
			return native(element, pseudoElement);
		}

		// Non-Element (null/undefined/window/document/text node): core is walking
		// past a torn-down canvas. Returning an inert declaration ends the walk
		// quietly instead of taking the whole editor down.
		return INERT;
	};
})();
