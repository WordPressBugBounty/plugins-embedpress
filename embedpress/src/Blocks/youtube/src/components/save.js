/**
 * WordPress dependencies
 */
const { useBlockProps } = wp.blockEditor;
import { lazyLoadIframe } from '../../../GlobalCoponents/lazy-load-deprecations.js';
import md5 from "md5";

/**
 * Internal dependencies
 */
import { sanitizeUrl, getIframeTitle } from '../../../GlobalCoponents/helper';

const save = ({ attributes }) => {
	const blockProps = useBlockProps.save();
	const { iframeSrc, width, height, clientId } = attributes;

	if (!iframeSrc) {
		return null;
	}

	// Width class is now fixed
	const width_class = 'ep-fixed-width';

	// Generate client ID hash for content protection
	const _md5ClientId = md5(clientId || '');

	return (
		<div {...blockProps}>
			<div id={`ep-gutenberg-content-${_md5ClientId}`} className="ep-gutenberg-content">
				<div
					className={`embedpress-youtube-embed ${width_class}`}
					style={{ maxWidth: '100%', width: `${width}px`, height: `${height}px` }}
					data-embed-type="YouTube"
				>
					{/* Lazy loading is Pro: `lazyLoadIframe()` (Pro filter `embedpress.lazyLoadIframe`) may swap the iframe for a placeholder. */}
					{lazyLoadIframe((
						<iframe
							src={sanitizeUrl(iframeSrc)}
							style={{ maxWidth: '100%', height: '100%' }}
							frameBorder="0"
							width={width}
							height={height}
							allowFullScreen
							title={getIframeTitle(iframeSrc)}
						/>
					), attributes, 'youtube')}
				</div>
			</div>
		</div>
	);
};

export default save;
