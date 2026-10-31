import { NAMES, SHEETS } from './Chart.js';
import { S52, rgb } from './ChartBake.js';
import { FT } from './Units.js';

// (M16) The whole chart to look at, above the marks on the Fish Hold's Chart tab: the minimap's own sheets (Minimap's,
// composed as it composes them: blank where you haven't been, or what Marta's chart covers; the way over pencilled
// on), so it holds no copy of them, only a canvas the size it's shown. North up, as a paper chart's read. Where you
// are, your boat when you're not aboard, your marks, the names you've come to; a scale. Drag to move it, pinch or the
// wheel to zoom, or its buttons. Made the first time the tab's opened; drawn when it's moved, and once a second
// while it's open.
//   const m = new ChartMap( game ); m.mount( slot ): shown in place of the slot
//   clampView( v ), zoomAbout( v, k, px, py, w, h ), nameFits( n, r ): the view { x, z, r } (m: r is half its narrower side)

export const RANGE = { min: 120, max: SHEETS.far.ext / 2 };
const F = SHEETS.far;

export function clampView( v ) {

	v.r = Math.min( RANGE.max, Math.max( RANGE.min, v.r ) );
	v.x = Math.min( F.x0 + F.ext, Math.max( F.x0, v.x ) );
	v.z = Math.min( F.z0 + F.ext, Math.max( F.z0, v.z ) );
	return v;

}

// zoomed k times in about a point on the canvas (px, py of w by h), which stays where it is
export function zoomAbout( v, k, px, py, w, h ) {

	const s0 = Math.min( w, h ) / 2 / v.r, wx = v.x + ( px - w / 2 ) / s0, wz = v.z + ( py - h / 2 ) / s0;
	v.r /= k;
	clampView( v );
	const s1 = Math.min( w, h ) / 2 / v.r;
	v.x = wx - ( px - w / 2 ) / s1;
	v.z = wz - ( py - h / 2 ) / s1;
	return clampView( v );

}

// (as the minimap chooses them, its radius being this view's r: the island's small names close in, the island's out to
// about its waters, the far grounds' once you're out past the island)
export function nameFits( n, r ) {

	const far = !! n.place || n.id === 'sandbar';
	return n.small ? r < 700 : far ? r > 900 : r < 4000;

}

// a scale bar's length: about `metres`, in round feet close in and round nautical miles further out
export function scaleOf( metres ) {

	const round = ( v ) => {

		const m = Math.pow( 10, Math.floor( Math.log10( v ) ) ), f = v / m;
		return ( f < 2 ? 1 : f < 5 ? 2 : 5 ) * m;

	};
	const NM = 1852;
	if ( metres < NM * 0.2 ) {

		const ft = round( metres / FT );
		return { m: ft * FT, label: `${ ft.toLocaleString( 'en-US' ) } ft` };

	}

	const nm = round( metres / NM );
	return { m: nm * NM, label: `${ nm } NM` };

}

export const CHART_MAP_CSS = /* css */`
.gm-chartmap { position: relative; height: clamp(150px, 40vh, 520px); margin: var(--tw-2) 0; border-radius: var(--tw-r-md, 10px); overflow: hidden; border: 1px solid var(--tw-line); background: rgb(${ S52.NODTA.join( ',' ) }); }
.gm-chartmap canvas { position: absolute; inset: 0; width: 100%; height: 100%; touch-action: none; cursor: grab; display: block; }
.gm-chartmap canvas:active { cursor: grabbing; }
.gm-chartmap-btns { position: absolute; right: 6px; top: 6px; display: flex; flex-direction: column; gap: 4px; }
.gm-chartmap-btns button { width: 34px; height: 34px; padding: 0; border-radius: 8px; border: 1px solid rgba(0,0,0,0.35); background: rgba(250,248,240,0.92); color: #101416; font: 700 18px/1 var(--tw-font); cursor: pointer; }
.gm-chartmap-btns button.is-me { font-size: 11px; }
`;

export class ChartMap {

	constructor( game ) {

		this.game = game;
		const el = this.el = document.createElement( 'div' );
		el.className = 'gm-chartmap';
		el.innerHTML = '<canvas aria-label="Your chart"></canvas><div class="gm-chartmap-btns"><button data-z="2" aria-label="Zoom in">+</button><button data-z="0.5" aria-label="Zoom out">−</button><button class="is-me" data-me aria-label="Where you are">You</button></div>';
		this.canvas = el.querySelector( 'canvas' );
		this.view = null;
		this._pts = new Map();
		for ( const b of el.querySelectorAll( '[data-z]' ) ) b.onclick = () => this._zoom( Number( b.dataset.z ) );
		el.querySelector( '[data-me]' ).onclick = () => {

			this._centre();
			this.ask();

		};
		const C = this.canvas;
		C.addEventListener( 'pointerdown', ( e ) => {

			C.setPointerCapture( e.pointerId );
			this._pts.set( e.pointerId, { x: e.offsetX, y: e.offsetY } );
			e.preventDefault();

		} );
		C.addEventListener( 'pointermove', ( e ) => this._moved( e ) );
		const up = ( e ) => this._pts.delete( e.pointerId );
		C.addEventListener( 'pointerup', up );
		C.addEventListener( 'pointercancel', up );
		C.addEventListener( 'wheel', ( e ) => {

			e.preventDefault();
			zoomAbout( this.view, Math.exp( - e.deltaY * 0.0016 ), e.offsetX, e.offsetY, C.clientWidth, C.clientHeight );
			this.ask();

		}, { passive: false } );
		C.addEventListener( 'dblclick', ( e ) => {

			zoomAbout( this.view, 2, e.offsetX, e.offsetY, C.clientWidth, C.clientHeight );
			this.ask();

		} );
		if ( typeof ResizeObserver !== 'undefined' ) new ResizeObserver( () => this.ask() ).observe( el );

	}

	// (the Fish Hold's drawn afresh at every change: the same map, where you left it, put back in)
	mount( slot ) {

		if ( ! slot ) return;
		slot.replaceWith( this.el );
		if ( ! this.view ) this._centre();
		this.ask();
		if ( ! this._t ) this._t = setInterval( () => {

			if ( this.el.isConnected ) return this.ask();
			clearInterval( this._t );
			this._t = 0;

		}, 1000 );

	}

	_at() {

		const a = this.game.app, p = a.player;
		return ( p.mode === 'boat' || p.mode === 'deck' ) && a.boatCtl ? a.boatCtl.position : a.camera.position;

	}

	// where you are, far enough out to see where you are on the island (a view's first look; "You" keeps its zoom)
	_centre() {

		const q = this._at();
		const r = this.view ? this.view.r : Math.max( 900, Math.hypot( q.x, q.z + 300 ) * 0.7 );
		this.view = clampView( { x: q.x, z: q.z, r } );

	}

	_zoom( k ) {

		const C = this.canvas;
		zoomAbout( this.view, k, C.clientWidth / 2, C.clientHeight / 2, C.clientWidth, C.clientHeight );
		this.ask();

	}

	_moved( e ) {

		const P = this._pts, was = P.get( e.pointerId );
		if ( ! was ) return;
		const C = this.canvas, w = C.clientWidth, h = C.clientHeight, v = this.view;
		const now = { x: e.offsetX, y: e.offsetY };
		if ( P.size === 1 ) {

			const s = Math.min( w, h ) / 2 / v.r;
			v.x -= ( now.x - was.x ) / s;
			v.z -= ( now.y - was.y ) / s;
			clampView( v );

		} else if ( P.size === 2 ) {

			// a pinch: as far apart as the fingers now are, about the middle of them, carried with them
			const other = [ ...P ].find( ( [ id ] ) => id !== e.pointerId )[ 1 ];
			const d0 = Math.hypot( was.x - other.x, was.y - other.y ), d1 = Math.hypot( now.x - other.x, now.y - other.y );
			const mx = ( now.x + other.x ) / 2, my = ( now.y + other.y ) / 2, s = Math.min( w, h ) / 2 / v.r;
			v.x -= ( mx - ( was.x + other.x ) / 2 ) / s;
			v.z -= ( my - ( was.y + other.y ) / 2 ) / s;
			if ( d0 > 1 ) zoomAbout( v, d1 / d0, mx, my, w, h );

		}

		P.set( e.pointerId, now );
		this.ask();

	}

	ask() {

		if ( this._asked || ! this.view ) return;
		this._asked = true;
		requestAnimationFrame( () => {

			this._asked = false;
			if ( this.el.isConnected ) this.draw();

		} );

	}

	draw() {

		const C = this.canvas, cw = C.clientWidth, ch = C.clientHeight;
		if ( ! cw || ! ch ) return;
		const d = Math.min( 2, window.devicePixelRatio || 1 ), W = Math.round( cw * d ), H = Math.round( ch * d );
		if ( C.width !== W || C.height !== H ) {

			C.width = W;
			C.height = H;

		}

		const g = C.getContext( '2d' ), v = this.view, map = this.game.minimap, s = Math.min( cw, ch ) / 2 / v.r;
		const X = ( x ) => cw / 2 + ( x - v.x ) * s, Y = ( z ) => ch / 2 + ( z - v.z ) * s;
		g.setTransform( d, 0, 0, d, 0, 0 );
		g.fillStyle = rgb( S52.NODTA );
		g.fillRect( 0, 0, cw, ch );
		g.imageSmoothingEnabled = true;
		// the sheets, far to near, each under the finer (as the minimap has them)
		for ( const k of [ 'far', 'mid', 'near' ] ) {

			const sh = map && map.sheets[ k ];
			if ( ! sh || sh.drawn < 0 ) continue;
			const p = sh.spec, x0 = X( p.x0 ), y0 = Y( p.z0 ), e = p.ext * s;
			if ( x0 > cw || y0 > ch || x0 + e < 0 || y0 + e < 0 ) continue;
			g.drawImage( sh.view, x0, y0, e, e );

		}

		const chart = this.game.state.chart;
		this._names( g, chart, X, Y, v.r, cw, ch );
		// your marks, red diamonds as the plotter's, numbered as its waypoints are
		g.textAlign = 'left';
		g.textBaseline = 'middle';
		for ( const m of chart.marks ) {

			const x = X( m.x ), y = Y( m.z );
			if ( x < - 40 || y < - 12 || x > cw + 6 || y > ch + 12 ) continue;
			g.fillStyle = '#d0342c';
			g.strokeStyle = '#fff';
			g.lineWidth = 1.2;
			g.beginPath();
			g.moveTo( x, y - 6 );
			g.lineTo( x + 5, y );
			g.lineTo( x, y + 6 );
			g.lineTo( x - 5, y );
			g.closePath();
			g.fill();
			g.stroke();
			this._label( g, String( m.id ).padStart( 3, '0' ), x + 8, y, '600 10px' );

		}

		// your boat, ashore; you
		const a = this.game.app, p = a.player;
		if ( a.boatCtl && p.mode !== 'boat' && p.mode !== 'deck' ) {

			const b = a.boatCtl.position, x = X( b.x ), y = Y( b.z );
			g.fillStyle = '#fff';
			g.strokeStyle = '#0b1418';
			g.lineWidth = 1.4;
			g.beginPath();
			g.arc( x, y, 4, 0, Math.PI * 2 );
			g.fill();
			g.stroke();
			this._label( g, 'Boat', x + 7, y, '600 10px' );

		}

		const q = this._at(), e = a.camera.matrixWorld.elements, ang = Math.atan2( - e[ 8 ], e[ 10 ] );
		g.save();
		g.translate( X( q.x ), Y( q.z ) );
		g.rotate( ang );
		g.fillStyle = '#fff';
		g.strokeStyle = '#0b1418';
		g.lineWidth = 1.6;
		g.lineJoin = 'round';
		g.beginPath();
		g.moveTo( 0, - 11 );
		g.lineTo( 7.5, 9 );
		g.lineTo( 0, 5 );
		g.lineTo( - 7.5, 9 );
		g.closePath();
		g.fill();
		g.stroke();
		g.restore();
		// north, and the scale
		g.textAlign = 'center';
		this._label( g, 'N ↑', 20, 14, '700 12px' );
		const bar = scaleOf( Math.min( cw * 0.33, 150 ) / s ), L = bar.m * s, by = ch - 14;
		g.strokeStyle = 'rgba(255,255,255,0.9)';
		g.lineWidth = 4;
		g.beginPath();
		g.moveTo( 10, by );
		g.lineTo( 10 + L, by );
		g.stroke();
		g.strokeStyle = '#101416';
		g.lineWidth = 2;
		g.stroke();
		g.textAlign = 'left';
		this._label( g, bar.label, 10, by - 10, '600 11px' );

	}

	// black with a pale halo, as the chart's names are
	_label( g, text, x, y, font, italic = false ) {

		g.font = `${ italic ? 'italic ' : '' }${ font } "Inter", system-ui, sans-serif`;
		g.lineJoin = 'round';
		g.strokeStyle = 'rgba(255,255,255,0.9)';
		g.lineWidth = 3;
		g.strokeText( text, x, y );
		g.fillStyle = '#101416';
		g.fillText( text, x, y );

	}

	// the names you've come to that suit the zoom, none over another
	_names( g, chart, X, Y, r, w, h ) {

		g.textAlign = 'center';
		g.textBaseline = 'middle';
		const taken = [];
		for ( const n of NAMES ) {

			if ( ! chart.named( n.id ) || ! nameFits( n, r ) ) continue;
			const x = X( n.x ), y = Y( n.z ), text = n.peak ? `▲ ${ n.name }` : n.name, font = n.small ? '600 10px' : '600 12px';
			g.font = `${ font } "Inter", system-ui, sans-serif`;
			const hw = g.measureText( text ).width / 2 + 3, hh = n.light ? 14 : 8;
			if ( x + hw < 0 || y + hh < 0 || x - hw > w || y - hh > h ) continue;
			if ( taken.some( ( b ) => Math.abs( b[ 0 ] - x ) < b[ 2 ] + hw && Math.abs( b[ 1 ] - y ) < b[ 3 ] + hh ) ) continue;
			taken.push( [ x, y, hw, hh ] );
			this._label( g, text, x, n.light ? y - 5 : y, font, !! n.water );
			if ( n.light ) this._label( g, n.light, x, y + 7, '500 9px' );

		}

	}

}
