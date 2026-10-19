/**
 * EmbedPress PDF Gallery - Frontend Script
 *
 * Handles:
 * - PDF.js thumbnail generation (first page render)
 * - Grid / Masonry layouts (pure CSS) and the layout registry
 * - Popup/lightbox with prev/next navigation
 *
 * Layout registry: `window.EmbedPressPdfGalleryLayouts` maps a layout slug to
 * an init(galleryEl) function. Free ships no JS layouts; other plugins (e.g.
 * EmbedPress Pro's Carousel and Bookshelf) add theirs there and dispatch
 * `embedpress:pdf-gallery-layouts` on document once registered. A gallery
 * whose layout is neither built in nor registered is shown as a grid.
 */
(function () {
    'use strict';

    var BUILTIN_LAYOUTS = ['grid', 'masonry'];
    var layoutRegistry = window.EmbedPressPdfGalleryLayouts = window.EmbedPressPdfGalleryLayouts || {};

    // =========================================
    // Module 1: PDF Thumbnail Generator
    // =========================================
    var ThumbnailGenerator = {
        pdfjsLoaded: false,
        pdfjsLoading: false,
        loadCallbacks: [],

        /**
         * Load PDF.js library dynamically
         */
        loadPdfJs: function (callback) {
            if (this.pdfjsLoaded && window.pdfjsLib) {
                callback();
                return;
            }

            this.loadCallbacks.push(callback);

            if (this.pdfjsLoading) return;
            this.pdfjsLoading = true;

            var self = this;
            var scriptUrl = (typeof embedpressObj !== 'undefined' && embedpressObj.pluginUrl)
                ? embedpressObj.pluginUrl + 'assets/pdf/build/script.js'
                : null;

            if (!scriptUrl) {
                // Try to find from existing script tags
                var scripts = document.querySelectorAll('script[src*="embedpress"]');
                for (var i = 0; i < scripts.length; i++) {
                    var match = scripts[i].src.match(/(.*embedpress[^/]*\/(?:assets|static)\/)/);
                    if (match) {
                        scriptUrl = match[1] + 'pdf/build/script.js';
                        break;
                    }
                }
            }

            if (!scriptUrl) {
                self.pdfjsLoading = false;
                return;
            }

            var script = document.createElement('script');
            script.src = scriptUrl;
            script.type = 'module';
            script.onload = function () {
                // Module scripts set pdfjsLib on globalThis; wait a tick for execution
                setTimeout(function () {
                    if (window.pdfjsLib || globalThis.pdfjsLib) {
                        if (!window.pdfjsLib) window.pdfjsLib = globalThis.pdfjsLib;
                        var workerUrl = scriptUrl.replace('script.js', 'pdf.worker.js');
                        window.pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
                        self.pdfjsLoaded = true;
                    }
                    self.pdfjsLoading = false;
                    self.loadCallbacks.forEach(function (cb) { cb(); });
                    self.loadCallbacks = [];
                }, 50);
            };
            script.onerror = function () {
                self.pdfjsLoading = false;
                self.loadCallbacks = [];
            };
            document.head.appendChild(script);
        },

        /**
         * Render first page of a PDF to a canvas
         */
        renderThumbnail: function (canvas, pdfUrl) {
            if (!window.pdfjsLib) return;

            canvas.setAttribute('data-loading', 'true');

            var loadingTask = window.pdfjsLib.getDocument(pdfUrl);
            loadingTask.promise.then(function (pdf) {
                pdf.getPage(1).then(function (page) {
                    var containerWidth = canvas.parentElement ? canvas.parentElement.offsetWidth : 400;
                    var dpr = Math.min(window.devicePixelRatio || 1, 2);
                    var targetWidth = Math.max(containerWidth * dpr, 400);
                    targetWidth = Math.min(targetWidth, 1200);
                    var scale = targetWidth / page.getViewport({ scale: 1 }).width;
                    scale = Math.max(scale, 0.8);
                    scale = Math.min(scale, 3);
                    var viewport = page.getViewport({ scale: scale });

                    canvas.width = viewport.width;
                    canvas.height = viewport.height;

                    var ctx = canvas.getContext('2d');
                    page.render({
                        canvasContext: ctx,
                        viewport: viewport
                    }).promise.then(function () {
                        canvas.removeAttribute('data-loading');
                    });
                });
            }).catch(function () {
                // Show fallback placeholder
                canvas.removeAttribute('data-loading');
                canvas.style.display = 'none';
                var wrap = canvas.parentElement;
                if (wrap && !wrap.querySelector('.ep-pdf-gallery__placeholder')) {
                    var placeholder = document.createElement('div');
                    placeholder.className = 'ep-pdf-gallery__placeholder';
                    placeholder.innerHTML = '<svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 2l5 5h-5V4zM6 20V4h5v7h7v9H6z"/></svg>';
                    wrap.appendChild(placeholder);
                }
            });
        },

        /**
         * Initialize all thumbnails with IntersectionObserver
         */
        initAll: function () {
            var canvases = document.querySelectorAll('.ep-pdf-gallery__canvas[data-pdf-src]');
            if (!canvases.length) return;

            var self = this;
            this.loadPdfJs(function () {
                if (!window.pdfjsLib) return;

                if ('IntersectionObserver' in window) {
                    var observer = new IntersectionObserver(function (entries) {
                        entries.forEach(function (entry) {
                            if (entry.isIntersecting) {
                                var c = entry.target;
                                observer.unobserve(c);
                                self.renderThumbnail(c, c.dataset.pdfSrc);
                            }
                        });
                    }, { rootMargin: '200px' });

                    canvases.forEach(function (c) { observer.observe(c); });
                } else {
                    canvases.forEach(function (c) {
                        self.renderThumbnail(c, c.dataset.pdfSrc);
                    });
                }
            });
        }
    };

    // =========================================
    // Module 2: Layouts
    // =========================================
    var Layouts = {
        /**
         * Show a gallery whose layout nobody implements as a grid: move its
         * items into a `.ep-pdf-gallery__grid` and drop any other markup the
         * saved layout carried. The requested layout is remembered so it can
         * still be applied if its implementation registers later.
         */
        fallbackToGrid: function (gallery, requested) {
            gallery.setAttribute('data-ep-requested-layout', requested);
            gallery.setAttribute('data-layout', 'grid');

            if (gallery.querySelector('.ep-pdf-gallery__grid')) return;

            var items = Array.prototype.slice.call(gallery.querySelectorAll('.ep-pdf-gallery__item'));
            var grid = document.createElement('div');
            grid.className = 'ep-pdf-gallery__grid';
            items.forEach(function (item) { grid.appendChild(item); });

            while (gallery.firstChild) {
                gallery.removeChild(gallery.firstChild);
            }
            gallery.appendChild(grid);
        },

        apply: function (gallery) {
            var requested = gallery.getAttribute('data-ep-requested-layout') || gallery.dataset.layout || 'grid';
            var init = layoutRegistry[requested];

            if (typeof init === 'function') {
                gallery.removeAttribute('data-ep-requested-layout');
                gallery.setAttribute('data-layout', requested);
                init(gallery);
                return;
            }

            if (BUILTIN_LAYOUTS.indexOf(requested) === -1) {
                this.fallbackToGrid(gallery, requested);
            }
        }
    };

    // A layout registered after the galleries were initialised.
    document.addEventListener('embedpress:pdf-gallery-layouts', function () {
        document.querySelectorAll('.ep-pdf-gallery[data-ep-requested-layout]').forEach(function (gallery) {
            Layouts.apply(gallery);
        });
    });

    // =========================================
    // Module 3: Popup Controller
    // =========================================
    var Popup = {
        popupEl: null,
        iframe: null,
        counterEl: null,
        prevBtn: null,
        nextBtn: null,
        currentGallery: null,
        currentIndex: 0,
        isOpen: false,

        init: function () {
            this.createPopupElement();
            this.bindEvents();
        },

        createPopupElement: function () {
            if (document.querySelector('.ep-pdf-gallery__popup')) return;

            var popup = document.createElement('div');
            popup.className = 'ep-pdf-gallery__popup';
            popup.innerHTML =
                '<div class="ep-pdf-gallery__popup-overlay">' +
                    '<button class="ep-pdf-gallery__popup-close" aria-label="Close">&times;</button>' +
                    '<button class="ep-pdf-gallery__popup-prev" aria-label="Previous PDF">' +
                        '<svg viewBox="0 0 24 24"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>' +
                    '</button>' +
                    '<button class="ep-pdf-gallery__popup-next" aria-label="Next PDF">' +
                        '<svg viewBox="0 0 24 24"><path d="M8.59 16.59L10 18l6-6-6-6-1.41 1.41L13.17 12z"/></svg>' +
                    '</button>' +
                    '<div class="ep-pdf-gallery__popup-counter"></div>' +
                    '<div class="ep-pdf-gallery__popup-viewer">' +
                        '<iframe class="ep-pdf-gallery__popup-iframe" src="" allowfullscreen></iframe>' +
                    '</div>' +
                '</div>';

            document.body.appendChild(popup);

            this.popupEl = popup;
            this.iframe = popup.querySelector('.ep-pdf-gallery__popup-iframe');
            this.counterEl = popup.querySelector('.ep-pdf-gallery__popup-counter');
            this.prevBtn = popup.querySelector('.ep-pdf-gallery__popup-prev');
            this.nextBtn = popup.querySelector('.ep-pdf-gallery__popup-next');
        },

        bindEvents: function () {
            var self = this;

            // Delegate click on gallery items
            document.addEventListener('click', function (e) {
                var item = e.target.closest('.ep-pdf-gallery__item');
                if (!item) return;

                var gallery = item.closest('.ep-pdf-gallery');
                if (!gallery) return;

                e.preventDefault();
                self.currentGallery = gallery;
                self.currentIndex = parseInt(item.dataset.pdfIndex) || 0;
                self.open();
            });

            // Close button
            if (this.popupEl) {
                this.popupEl.querySelector('.ep-pdf-gallery__popup-close').addEventListener('click', function () {
                    self.close();
                });

                // Close on overlay click (not on viewer)
                this.popupEl.querySelector('.ep-pdf-gallery__popup-overlay').addEventListener('click', function (e) {
                    if (e.target === e.currentTarget) {
                        self.close();
                    }
                });

                // Prev/Next
                this.prevBtn.addEventListener('click', function (e) {
                    e.stopPropagation();
                    self.prev();
                });
                this.nextBtn.addEventListener('click', function (e) {
                    e.stopPropagation();
                    self.next();
                });
            }

            // Keyboard
            document.addEventListener('keydown', function (e) {
                if (!self.isOpen) return;
                if (e.key === 'Escape') self.close();
                if (e.key === 'ArrowLeft') self.prev();
                if (e.key === 'ArrowRight') self.next();
            });
        },

        open: function () {
            if (!this.currentGallery || !this.popupEl) return;

            var items = this.currentGallery.querySelectorAll('.ep-pdf-gallery__item');
            if (this.currentIndex >= items.length) return;

            var item = items[this.currentIndex];
            var pdfUrl = item.dataset.pdfUrl;
            if (!pdfUrl) return;

            var viewerSrc = this.buildViewerUrl(pdfUrl);
            this.iframe.src = viewerSrc;

            this.popupEl.classList.add('ep-pdf-gallery__popup--open');
            document.body.style.overflow = 'hidden';
            this.isOpen = true;

            this.updateCounter(items.length);
            this.updateNavButtons(items.length);
        },

        close: function () {
            if (!this.popupEl) return;
            this.popupEl.classList.remove('ep-pdf-gallery__popup--open');
            this.iframe.src = '';
            document.body.style.overflow = '';
            this.isOpen = false;
        },

        prev: function () {
            if (this.currentIndex > 0) {
                this.currentIndex--;
                this.iframe.src = '';
                this.open();
            }
        },

        next: function () {
            var items = this.currentGallery ? this.currentGallery.querySelectorAll('.ep-pdf-gallery__item') : [];
            if (this.currentIndex < items.length - 1) {
                this.currentIndex++;
                this.iframe.src = '';
                this.open();
            }
        },

        updateCounter: function (total) {
            if (this.counterEl) {
                this.counterEl.textContent = (this.currentIndex + 1) + ' / ' + total;
            }
        },

        updateNavButtons: function (total) {
            if (this.prevBtn) {
                this.prevBtn.classList.toggle('ep-hidden', this.currentIndex <= 0);
            }
            if (this.nextBtn) {
                this.nextBtn.classList.toggle('ep-hidden', this.currentIndex >= total - 1);
            }
        },

        buildViewerUrl: function (pdfUrl) {
            if (!this.currentGallery) return pdfUrl;

            var viewerStyle = this.currentGallery.dataset.viewerStyle || 'modern';
            var viewerParams = this.currentGallery.dataset.viewerParams || '';
            var encodedFile = encodeURIComponent(pdfUrl);

            // Get viewer base URLs from localized data
            var pdfRenderer = '';
            var flipbookRenderer = '';

            if (typeof embedpressObj !== 'undefined') {
                pdfRenderer = embedpressObj.pdfRenderer || '';
                flipbookRenderer = embedpressObj.flipbookRenderer || '';
            }

            if (viewerStyle === 'flip-book' && flipbookRenderer) {
                return flipbookRenderer + '&file=' + encodedFile + '&key=' + viewerParams;
            } else if (pdfRenderer) {
                return pdfRenderer + '&file=' + encodedFile + '#key=' + viewerParams;
            }

            // Fallback: just open the PDF directly
            return pdfUrl;
        }
    };

    // =========================================
    // Module 4: Initialization
    // =========================================
    function initGalleries() {
        var galleries = document.querySelectorAll('.ep-pdf-gallery');
        if (!galleries.length) return;

        // Init thumbnails
        ThumbnailGenerator.initAll();

        // Init layouts
        galleries.forEach(function (gallery) {
            // Set CSS custom properties from data attributes
            var columns = gallery.dataset.columns || 3;
            var columnsTablet = gallery.dataset.columnsTablet || 2;
            var columnsMobile = gallery.dataset.columnsMobile || 1;
            var gap = gallery.dataset.gap || 20;
            var radius = gallery.dataset.borderRadius;

            gallery.style.setProperty('--ep-gallery-columns-desktop', columns);
            gallery.style.setProperty('--ep-gallery-columns-tablet', columnsTablet);
            gallery.style.setProperty('--ep-gallery-columns-mobile', columnsMobile);
            gallery.style.setProperty('--ep-gallery-gap', gap + 'px');
            if (radius !== undefined) {
                gallery.style.setProperty('--ep-gallery-radius', radius + 'px');
            }

            Layouts.apply(gallery);
        });

        // Init popup
        Popup.init();
    }

    // Run on DOMContentLoaded
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initGalleries);
    } else {
        initGalleries();
    }

    // Elementor editor: re-initialize when widget is rendered/re-rendered
    if (typeof jQuery !== 'undefined') {
        jQuery(window).on('elementor/frontend/init', function () {
            if (typeof elementorFrontend !== 'undefined') {
                elementorFrontend.hooks.addAction(
                    'frontend/element_ready/embedpress_pdf_gallery.default',
                    function ($scope) {
                        var gallery = $scope.find('.ep-pdf-gallery')[0];
                        if (!gallery) return;

                        // Set CSS custom properties from data attributes
                        var columns = gallery.dataset.columns || 3;
                        var columnsTablet = gallery.dataset.columnsTablet || 2;
                        var columnsMobile = gallery.dataset.columnsMobile || 1;
                        var gap = gallery.dataset.gap || 20;
                        var radius = gallery.dataset.borderRadius;

                        gallery.style.setProperty('--ep-gallery-columns-desktop', columns);
                        gallery.style.setProperty('--ep-gallery-columns-tablet', columnsTablet);
                        gallery.style.setProperty('--ep-gallery-columns-mobile', columnsMobile);
                        gallery.style.setProperty('--ep-gallery-gap', gap + 'px');
                        if (radius !== undefined) {
                            gallery.style.setProperty('--ep-gallery-radius', radius + 'px');
                        }

                        // Re-init thumbnails within this widget
                        var canvases = gallery.querySelectorAll('.ep-pdf-gallery__canvas[data-pdf-src]');
                        if (canvases.length) {
                            ThumbnailGenerator.loadPdfJs(function () {
                                if (!window.pdfjsLib) return;
                                canvases.forEach(function (c) {
                                    ThumbnailGenerator.renderThumbnail(c, c.dataset.pdfSrc);
                                });
                            });
                        }

                        // Re-init the layout (registered layouts only)
                        Layouts.apply(gallery);

                        // Ensure popup is initialized
                        if (!Popup.popupEl) {
                            Popup.init();
                        }

                        // If popup is open, update gallery reference and refresh iframe
                        // so changed viewer controls take effect immediately
                        if (Popup.isOpen && Popup.currentGallery) {
                            var oldGalleryId = Popup.currentGallery.dataset.galleryId;
                            var newGalleryId = gallery.dataset.galleryId;
                            if (oldGalleryId === newGalleryId) {
                                Popup.currentGallery = gallery;
                                Popup.open();
                            }
                        }
                    }
                );
            }
        });
    }
})();
