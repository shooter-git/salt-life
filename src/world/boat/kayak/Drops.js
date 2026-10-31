// (M16) Water on your face, sat down there among it: a few blurred drops over the view from the seat, when the rain's on
// you or a sea's just come over her deck, running off in a moment or two. An element over the canvas: nothing's drawn
// for it, on any device.
const N = 22;

export class Drops {

	constructor() {

		this.el = null;
		this.k = 0;
		this.shown = - 1;

	}

	_make( root ) {

		const el = this.el = document.createElement( 'div' );
		const bg = [];
		for ( let i = 0; i < N; i ++ ) {

			const r = 12 + Math.random() * Math.random() * 46, x = Math.random() * 100, y = Math.random() * 100;
			bg.push( `radial-gradient(circle ${ r.toFixed( 0 ) }px at ${ x.toFixed( 1 ) }% ${ y.toFixed( 1 ) }%, rgba(235,245,250,0.07) 0, rgba(235,245,250,0.2) 72%, rgba(255,255,255,0.03) 88%, transparent 100%)` );

		}

		el.style.cssText = `position:absolute;inset:0;pointer-events:none;opacity:0;z-index:0;background:${ bg.join( ',' ) };`;
		root.append( el );

	}

	// on: from the seat, through your own eyes. rain 0..1, wash: m of sea about her
	update( dt, on, rain, wash, root ) {

		if ( typeof document === 'undefined' || ! root ) return;
		if ( ! this.el ) this._make( root );
		const want = ! on ? 0 : Math.max( rain * 0.45, wash > 0.17 ? 1 : 0 );
		this.k += ( want - this.k ) * ( 1 - Math.exp( - dt * ( want > this.k ? 12 : 0.7 ) ) );
		const o = Math.round( this.k * 40 ) / 40;
		if ( o !== this.shown ) {

			this.shown = o;
			this.el.style.opacity = o;
			this.el.style.display = o > 0 ? '' : 'none';

		}

	}

	dispose() {

		if ( this.el ) this.el.remove();
		this.el = null;

	}

}
