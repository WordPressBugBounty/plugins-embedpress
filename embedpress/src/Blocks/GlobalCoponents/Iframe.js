/*
INIT: ensure Babel/Eslint/Flow is configured for ES Class Fields & Static Properties
JSX USAGE: <Iframe src='http://web.site' onLoad={myOnloadFunction}/>
*/
import { docNeedsRefererProxy, isYouTubeEmbedSrc, writeRefererProxyDoc } from './referer-proxy';
const { Component } = wp.element;

class Iframe extends Component {
	constructor(props) {
		super(props);
		this.myRef = React.createRef();
	}
  // Inside the iframed (blob:) editor canvas a direct YouTube iframe gets
  // no Referer header and YouTube rejects it with error 153. Swap the src
  // for a referer-proxy document written from the admin page context.
  maybeProxy () {
    const iframe = this.myRef.current;
    if (!iframe) return;
    const src = this.props.src || '';
    if (!isYouTubeEmbedSrc(src) || !docNeedsRefererProxy(iframe.ownerDocument)) return;
    if (iframe.dataset.epRefererProxy === src) return;
    iframe.removeAttribute('src');
    writeRefererProxyDoc(iframe, src, {
      ...(this.props.title ? { title: this.props.title } : {}),
    });
  }
  componentDidMount () {
    let iframe = this.myRef.current
    iframe.addEventListener('load', this.props.onLoad);
    this.maybeProxy();
  }
  componentDidUpdate () {
    // A src prop change makes React restore the src attribute — re-proxy.
    this.maybeProxy();
  }

  render () {

    return (
      <iframe
		  ref={this.myRef}
        {...this.props}

      />
    )
  }

}

export default Iframe
