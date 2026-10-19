/*
INIT: ensure Babel/Eslint/Flow is configured for ES Class Fields & Static Properties
JSX USAGE: <Epwrap src='http://web.site' onLoad={myOnloadFunction}/>
*/
import { proxyYouTubeIframes } from './referer-proxy';
const { Component } = wp.element;

export default class EmbedWrap extends Component {
	constructor(props) {
		super(props);
		this.myRef = React.createRef();
	}
	componentDidMount () {
		let wrap = this.myRef.current
		wrap.addEventListener('load', this.props.onLoad);
		// Inside the iframed (blob:) editor canvas YouTube iframes must be
		// re-hosted in a referer-proxy document or they die with error 153.
		proxyYouTubeIframes(wrap);
	}
	componentDidUpdate () {
		// embedHTML changes re-write innerHTML with fresh (unproxied) markup.
		proxyYouTubeIframes(this.myRef.current);
	}

	render () {

		return (
			<div className={this.props.className}
				ref={this.myRef}
				{...this.props}
			></div>
		)
	}

}
