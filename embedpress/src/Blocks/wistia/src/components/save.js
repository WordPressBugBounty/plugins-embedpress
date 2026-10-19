import { getIframeTitle } from '../../../GlobalCoponents/helper';
import md5 from "md5";
import { lazyLoadIframe } from '../../../GlobalCoponents/lazy-load-deprecations.js';

const save = (props) => {
	const { iframeSrc, width, height, clientId } = props.attributes

	// Generate client ID hash for content protection
	const _md5ClientId = md5(clientId || '');

	return (
		<div id={`ep-gutenberg-content-${_md5ClientId}`} className="ep-gutenberg-content">
			<div
				className="ose-wistia"
				data-embed-type="Wistia">
				{/* Lazy loading is Pro: `lazyLoadIframe()` (Pro filter `embedpress.lazyLoadIframe`) may swap the iframe for a placeholder. */}
				{lazyLoadIframe((
					<iframe
						src={iframeSrc}
						allowtransparency="true"
						frameBorder="0"
						className="wistia_embed"
						name="wistia_embed"
						width={width}
						height={height}
						title={getIframeTitle(iframeSrc)}
					></iframe>
				), props.attributes, 'wistia')}
			</div>
		</div>
	);
};

export default save;
