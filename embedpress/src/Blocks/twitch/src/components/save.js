import { getIframeTitle } from '../../../GlobalCoponents/helper';
import md5 from "md5";
import { lazyLoadIframe } from '../../../GlobalCoponents/lazy-load-deprecations.js';

const save = (props) => {
	const {
		iframeSrc,
		attrs,
		clientId,
		autoplay,
		twitchMute,
		twitchTheme,
		twitchFullscreen,
		twitchChat,
		startTime,
		width,
		height,
	} = props.attributes;

	const defaultClass = "ose-twitch-presentation";

	// Build full embed URL with settings
	let IframeUrl = iframeSrc;

	// Add Twitch control params
	const separator = IframeUrl.indexOf('?') > -1 ? '&' : '?';
	const params = [];

	params.push('autoplay=' + (autoplay ? 'true' : 'false'));
	params.push('muted=' + (twitchMute ? 'true' : 'false'));
	params.push('allowfullscreen=' + (twitchFullscreen ? 'true' : 'false'));
	params.push('theme=' + (twitchTheme || 'dark'));
	params.push('layout=' + (twitchChat ? 'video-with-chat' : 'video'));

	if (startTime > 0) {
		const ta = new Date(startTime * 1000);
		const h = ta.getUTCHours() + 'h';
		const m = ta.getUTCMinutes() + 'm';
		const s = ta.getUTCSeconds() + 's';
		params.push('time=' + h + m + s);
	}

	// Add parent domain
	if (typeof embedpressGutenbergData !== 'undefined' && embedpressGutenbergData.twitch_host) {
		params.push('parent=' + embedpressGutenbergData.twitch_host);
	}

	IframeUrl = IframeUrl + separator + params.join('&');

	// Generate client ID hash for content protection
	const _md5ClientId = md5(clientId || '');

	return (
		<div id={`ep-gutenberg-content-${_md5ClientId}`} className="ep-gutenberg-content">
			<figure
				className={defaultClass}
				data-embed-type="Twitch">
				{/* Lazy loading is Pro: `lazyLoadIframe()` (Pro filter `embedpress.lazyLoadIframe`) may swap the iframe for a placeholder. */}
				{lazyLoadIframe((
					<iframe
						src={IframeUrl} {...attrs}
						frameBorder="0"
						width={width || 600}
						title={getIframeTitle(iframeSrc)}
						height={height || 450}></iframe>
				), props.attributes, 'twitch')}
			</figure>
		</div>
	);
};

export default save;
