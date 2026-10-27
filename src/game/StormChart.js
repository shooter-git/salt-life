import { Mesh, PlaneGeometry, CanvasTexture, MeshStandardMaterial, SRGBColorSpace } from '../engine/index.js';
import { latLon } from '../world/boat/Instruments.js';
import { timeText } from './IslandClock.js';
import { windFrom } from './Weather.js';

// (M13) The hurricane tracking chart pinned on the shelter's wall, as the hurricane centre's tracking
// charts are: the waters about the island (it lies where Key West does, off the Florida Keys: the
// plotter's position) on a latitude and longitude grid, Florida's and Cuba's coasts, the island marked,
// and a hurricane's track as it's plotted: where its eye has been, every six hours, and where it's
// forecast to go, its eye now with the hurricane's symbol, and what's known of it (its category, its
// strongest wind, where it's heading and how fast, the watch or warning). With none about, the chart's
// clear. Drawn again only when what it shows changes.
//   const chart = new StormChart();  mesh.position...  chart.draw( hurricane, news, T, locale )

const W = 640, H = 480; // the canvas (1.2 x 0.9 m on the wall)

// (M13) the shelter's sign over its door, as the islands' are: white on blue, its name under it (2.2 x
// 0.45 m)
export function shelterSign() {

	const c = document.createElement( 'canvas' );
	c.width = 880;
	c.height = 180;
	const g = c.getContext( '2d' );
	g.fillStyle = '#1f5a9a';
	g.fillRect( 0, 0, c.width, c.height );
	g.strokeStyle = '#ffffff';
	g.lineWidth = 8;
	g.strokeRect( 10, 10, c.width - 20, c.height - 20 );
	g.fillStyle = '#ffffff';
	g.textAlign = 'center';
	g.textBaseline = 'middle';
	// (as large as fits inside its border)
	let px = 84;
	do g.font = `800 ${ px -- }px system-ui, sans-serif`; while ( g.measureText( 'HURRICANE SHELTER' ).width > c.width - 70 && px > 20 );
	g.fillText( 'HURRICANE SHELTER', c.width / 2, 78 );
	g.font = '600 36px system-ui, sans-serif';
	g.fillText( 'Community Hall', c.width / 2, 142 );
	const tex = new CanvasTexture( c );
	tex.colorSpace = SRGBColorSpace;
	tex.anisotropy = 4;
	const mesh = new Mesh( new PlaneGeometry( 2.2, 0.45 ), new MeshStandardMaterial( { map: tex, roughness: 0.7 } ) );
	mesh.name = 'ShelterSign';
	return mesh;

}
const LAT = [ 21, 29 ], LON = [ - 86, - 76 ]; // what the chart covers (degrees)
// the coasts, roughly as a tracking chart draws them (lat, lon)
const FLORIDA = [ [ 31, - 87.6 ], [ 30.4, - 86.5 ], [ 30.1, - 85.6 ], [ 29.7, - 85.1 ], [ 29.9, - 84.3 ], [ 29.6, - 83.6 ], [ 29.1, - 83.0 ], [ 28.2, - 82.8 ], [ 27.9, - 82.6 ],
	[ 27.4, - 82.6 ], [ 26.7, - 82.2 ], [ 26.1, - 81.8 ], [ 25.5, - 81.2 ], [ 25.2, - 80.9 ], [ 25.15, - 80.5 ], [ 24.85, - 80.75 ], [ 24.6, - 81.3 ], [ 24.55, - 81.8 ], [ 24.7, - 81.0 ], [ 25.1, - 80.5 ],
	[ 25.4, - 80.3 ], [ 25.8, - 80.15 ], [ 26.7, - 80.03 ], [ 27.5, - 80.3 ], [ 28.4, - 80.6 ], [ 29.2, - 81.0 ], [ 30.3, - 81.4 ], [ 31, - 81.45 ], [ 31, - 87.6 ] ];
const CUBA = [ [ 21.87, - 84.95 ], [ 22.4, - 84.4 ], [ 22.9, - 83.3 ], [ 23.13, - 82.38 ], [ 23.05, - 81.58 ], [ 23.15, - 80.9 ], [ 22.9, - 80.0 ], [ 22.6, - 79.2 ], [ 22.3, - 78.3 ], [ 21.6, - 76.2 ],
	[ 21, - 76 ], [ 20.6, - 77.4 ], [ 21.2, - 78.6 ], [ 21.6, - 79.6 ], [ 21.7, - 80.9 ], [ 22.0, - 81.8 ], [ 21.8, - 82.9 ], [ 22.2, - 83.8 ], [ 21.87, - 84.95 ] ];
const MPH = 2.23694, KMH_MPH = 0.621371;

export class StormChart {

	constructor() {

		this.canvas = document.createElement( 'canvas' );
		this.canvas.width = W;
		this.canvas.height = H;
		this.texture = new CanvasTexture( this.canvas );
		this.texture.colorSpace = SRGBColorSpace;
		this.texture.anisotropy = 4;
		this.mesh = new Mesh( new PlaneGeometry( 1.2, 0.9 ), new MeshStandardMaterial( { map: this.texture, roughness: 0.9 } ) );
		this.mesh.name = 'StormChart';
		this._key = null;
		this.draw();

	}

	// hurricane: Weather.hurricaneAt's (null: none about); news: Weather.hurricaneNews's; T: island time
	draw( hurricane = null, news = null, T = 0, locale = undefined ) {

		// (what it shows: the eye's six-hourly fix, the stage)
		const key = hurricane ? `${ hurricane.tc }|${ Math.floor( T / 6 ) }|${ news ? news.stage : '' }` : 'clear';
		if ( key === this._key ) return;
		this._key = key;
		const g = this.canvas.getContext( '2d' );
		// the paper, the title, the grid
		g.fillStyle = '#f3f0e6';
		g.fillRect( 0, 0, W, H );
		const top = 54, px = ( lon ) => 30 + ( lon - LON[ 0 ] ) / ( LON[ 1 ] - LON[ 0 ] ) * ( W - 60 ), py = ( lat ) => top + ( LAT[ 1 ] - lat ) / ( LAT[ 1 ] - LAT[ 0 ] ) * ( H - top - 30 );
		g.fillStyle = '#16365c';
		g.fillRect( 0, 0, W, 42 );
		g.fillStyle = '#ffffff';
		g.font = '800 22px system-ui, sans-serif';
		g.textAlign = 'center';
		g.textBaseline = 'middle';
		g.fillText( 'HURRICANE TRACKING CHART', W / 2, 22 );
		g.fillStyle = '#cfe3ee';
		g.fillRect( 30, top, W - 60, H - top - 30 );
		// (the coasts)
		g.fillStyle = '#e8dcb8';
		g.strokeStyle = '#7a6a48';
		g.lineWidth = 1.5;
		for ( const coast of [ FLORIDA, CUBA ] ) {

			g.beginPath();
			coast.forEach( ( [ la, lo ], i ) => i ? g.lineTo( px( lo ), py( la ) ) : g.moveTo( px( lo ), py( la ) ) );
			g.fill();
			g.stroke();

		}

		g.strokeStyle = 'rgba(22, 54, 92, 0.35)';
		g.lineWidth = 1;
		g.fillStyle = '#16365c';
		g.font = '600 12px system-ui, sans-serif';
		for ( let la = LAT[ 0 ]; la <= LAT[ 1 ]; la ++ ) {

			g.beginPath();
			g.moveTo( 30, py( la ) );
			g.lineTo( W - 30, py( la ) );
			g.stroke();
			if ( la % 2 === 1 ) {

				g.textAlign = 'right';
				g.fillText( `${ la }°N`, 27, py( la ) );

			}

		}

		for ( let lo = LON[ 0 ]; lo <= LON[ 1 ]; lo ++ ) {

			g.beginPath();
			g.moveTo( px( lo ), top );
			g.lineTo( px( lo ), H - 30 );
			g.stroke();
			if ( lo % 2 === 0 ) {

				g.textAlign = 'center';
				g.fillText( `${ - lo }°W`, px( lo ), H - 16 );

			}

		}

		// the island (where Key West is)
		const here = latLon( 0, 0 );
		g.fillStyle = '#c8202c';
		star( g, px( here[ 1 ] ), py( here[ 0 ] ), 8 );
		g.font = '700 13px system-ui, sans-serif';
		g.textAlign = 'left';
		g.fillText( 'You are here', px( here[ 1 ] ) + 10, py( here[ 0 ] ) + 14 );
		if ( ! hurricane ) {

			g.fillStyle = '#16365c';
			g.font = '600 16px system-ui, sans-serif';
			g.textAlign = 'center';
			g.fillText( 'No storms about', W / 2, top + 22 );
			this.texture.needsUpdate = true;
			return;

		}

		// its track: the eye every six hours, where it's been (solid) and where it's forecast to go (dashed)
		const at = ( t ) => {

			const pm = - ( t - hurricane.tc ) * hurricane.speed, pn = hurricane.d;
			const [ la, lo ] = latLon( - ( pm * hurricane.track.x + pn * hurricane.left.x ), - ( pm * hurricane.track.y + pn * hurricane.left.y ) );
			return [ px( lo ), py( la ) ];

		};
		const now = Math.floor( T / 6 ) * 6;
		g.lineWidth = 2.5;
		g.strokeStyle = '#16365c';
		for ( const past of [ true, false ] ) {

			g.setLineDash( past ? [] : [ 7, 6 ] );
			g.beginPath();
			for ( let t = past ? now - 72 : now; t <= ( past ? now : now + 48 ); t += 6 ) {

				const [ x, y ] = at( t );
				if ( t === ( past ? now - 72 : now ) ) g.moveTo( x, y ); else g.lineTo( x, y );

			}

			g.stroke();

		}

		g.setLineDash( [] );
		for ( let t = now - 72; t <= now + 48; t += 6 ) {

			const [ x, y ] = at( t );
			g.beginPath();
			g.arc( x, y, 4, 0, Math.PI * 2 );
			if ( t <= now ) {

				g.fillStyle = '#16365c';
				g.fill();

			} else {

				g.fillStyle = '#f3f0e6';
				g.fill();
				g.stroke();

			}

		}

		// its eye now, with the hurricane's symbol
		const [ ex, ey ] = at( T );
		hurricaneSymbol( g, ex, ey, 13 );
		// what's known of it
		const mph = Math.round( ( hurricane.vmax + 0.6 * hurricane.speed / 3600 ) * MPH / 5 ) * 5;
		const heading = windFrom( - hurricane.track.x, - hurricane.track.y ); // (where it's going)
		const lines = [ `Hurricane · Category 1 · winds ${ mph } mph`, `Moving ${ heading } at ${ Math.round( hurricane.speed / 1000 * KMH_MPH ) } mph` ];
		if ( news && news.stage !== 'outlook' ) lines.push( `${ news.stage === 'watch' ? 'Hurricane watch' : 'Hurricane warning' } for the island · its eye nearest ${ timeText( ( ( news.eye % 24 ) + 24 ) % 24, locale, 60 ) }` );
		g.fillStyle = 'rgba(243, 240, 230, 0.92)';
		g.fillRect( 38, H - 40 - lines.length * 20, 430, lines.length * 20 + 6 );
		g.fillStyle = '#16365c';
		g.font = '700 14px system-ui, sans-serif';
		g.textAlign = 'left';
		lines.forEach( ( l, i ) => g.fillText( l, 46, H - 26 - ( lines.length - 1 - i ) * 20 ) );
		this.texture.needsUpdate = true;

	}

}

function star( g, x, y, r ) {

	g.beginPath();
	for ( let i = 0; i < 10; i ++ ) {

		const a = - Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r;
		g.lineTo( x + Math.cos( a ) * rr, y + Math.sin( a ) * rr );

	}

	g.closePath();
	g.fill();

}

// the hurricane's symbol: a filled circle with two hooked arms (the northern hemisphere's, turning
// counter-clockwise)
function hurricaneSymbol( g, x, y, r ) {

	g.fillStyle = '#c8202c';
	g.strokeStyle = '#c8202c';
	g.lineWidth = 3.5;
	g.beginPath();
	g.arc( x, y, r * 0.45, 0, Math.PI * 2 );
	g.fill();
	for ( const s of [ 1, - 1 ] ) {

		g.beginPath();
		g.arc( x + s * r * 0.35, y, r * 0.85, s > 0 ? Math.PI : 0, s > 0 ? Math.PI * 1.55 : Math.PI * 0.55 );
		g.stroke();

	}

	g.fillStyle = '#ffffff';
	g.beginPath();
	g.arc( x, y, r * 0.18, 0, Math.PI * 2 );
	g.fill();

}
