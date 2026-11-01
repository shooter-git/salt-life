import { HullLines, sstep, lerp } from '../HullLines.js';

// (M16) The lines of a 23 ft deep-V center console, after the Regulator 23's (7.14 m by 2.59 m, 24° of deadrise at the
// transom, 0.53 m of draft: its maker's plan and side photographs; docs/m16/console.md). HullLines' section is a smooth
// curve through seven points, a lobster boat's round bilge. Hers has edges a smooth curve can't draw: a keel pad, two
// lifting strakes each with its flat underside, a hard chine and the chine's flat, then flared topsides. So a section
// here is its own polyline, its hard edges known (hardEdges), and everything that reads a section through sectionPoints,
// sectionCount and setback (floating, walking, the spray) goes on working as it does for the lobster boat.

// intervals per panel at density 1: pad, bottom in three, the strakes' flats and steps, the chine's flat, topsides
const PAD = 1, PANEL = 2, STRAKE = 2, FLAT = 1, TOP = 7;
const COUNT = PAD + PANEL * 3 + STRAKE * 2 + FLAT + TOP;
const STRAKES = [ 0.36, 0.7 ]; // where along the bottom, keel to chine
const STRAKE_W = 0.045; // its flat's width, m
const PAD_W = 0.035; // half the keel pad
const FLAT_W = 0.1; // the chine's flat's width, m
const FLAT_DROP = 0.1; // how it falls outboard (rad): throws the spray down

export class ConsoleLines extends HullLines {

	constructor() {

		// (the stem's rake and its forefoot from the side photographs; the sole 27 in. under the gunwale; shell: outer skin
		// to the coaming at the sole, the gunwale's width, 0.17 m on her plan)
		super( { zAft: - 3.0, zBow: 4.14, deckY: 0.32, shell: 0.17, houseBack: - 0.7, houseFront: 0.44, stemRake: 0.72, forefootR: 0.6, widest: 1.4 } );

	}

	sheerY( t ) {

		return 1.02 + 0.7 * Math.pow( t, 2.6 );

	}

	// half-breadth at the sheer, as measured off her plan: most of her beam from 40% aft of the stem to the corners, a
	// little in at the transom, a fine entry
	sheerX( t ) {

		if ( t <= 0.42 ) {

			const a = 1 - t / 0.42;
			return 1.295 - 0.05 * a * a;

		}

		const s = ( t - 0.42 ) / 0.58;
		return 1.295 * ( 1 - Math.pow( s, 2.6 ) );

	}

	// flat aft for the first half of her and rising in a long curve to the forefoot
	keelY( t ) {

		if ( t <= 0.45 ) return - 0.46 - 0.07 * Math.sin( Math.PI * 0.5 * t / 0.45 );
		return - 0.53 + 0.48 * Math.pow( sstep( 0.45, 1, t ), 1.4 );

	}

	chineX( t ) {

		if ( t <= 0.42 ) {

			const a = 1 - t / 0.42;
			return 1.14 - 0.03 * a * a;

		}

		const s = ( t - 0.42 ) / 0.58;
		return 1.14 * Math.pow( Math.max( 0, 1 - Math.pow( s, 1.9 ) ), 1.1 );

	}

	// a hand above the water at the transom (a little white shows over the antifouling), sweeping up the bow
	chineY( t ) {

		return lerp( 0.06, 0.09, sstep( 0, 0.45, t ) ) + 0.66 * Math.pow( sstep( 0.45, 1, t ), 1.5 );

	}

	// > 0: how far the topsides' middle lies in from the straight line, of its length (the bow's concave flare)
	flare( t ) {

		return lerp( 0.012, 0.15, sstep( 0.4, 0.92, t ) ) * ( 1 - 0.5 * sstep( 0.94, 1, t ) );

	}

	bowBlend( t ) {

		return t > 0.55 ? ( ( t - 0.55 ) / 0.45 ) ** 2 : 0;

	}

	// the section's corners and how many intervals of each panel, for density
	_section( t, density, out ) {

		const yK = this.keelY( t ), xC = this.chineX( t ), yC = this.chineY( t ), xS = this.sheerX( t ), yS = this.sheerY( t );
		const fade = sstep( 0, 0.35, xC ); // (it all closes into the stem)
		const pad = Math.min( PAD_W * fade, xC * 0.2 );
		let k = 0;
		const put = ( x, y ) => {

			out[ k ++ ] = Math.max( 0, x );
			out[ k ++ ] = y;

		};

		// a slight hollow near the keel, the bottom's convex forward
		const line = ( x ) => {

			const u = xC > 1e-6 ? x / xC : 0;
			return yK + ( yC - yK ) * ( u + 0.05 * ( 1 - sstep( 0.45, 0.8, t ) ) * Math.sin( Math.PI * u ) * - 1 );

		};

		const run = ( x0, x1, n ) => {

			for ( let i = 1; i <= n; i ++ ) {

				const x = lerp( x0, x1, i / n );
				put( x, line( x ) );

			}

		};

		put( 0, yK );
		const pad1 = PAD * density;
		for ( let i = 1; i <= pad1; i ++ ) put( pad * i / pad1, yK + 0.002 * i / pad1 );
		// bottom, a strake, bottom, a strake, bottom
		const width = STRAKE_W * fade;
		let x0 = pad;
		STRAKES.forEach( ( s ) => {

			const xs = xC * s;
			run( x0, xs, PANEL * density );
			const y = line( xs );
			const xe = xs + width, half = STRAKE * density >> 1;
			// its flat, outboard level; then up to the hull's line again
			for ( let i = 1; i <= half; i ++ ) put( xs + width * i / half, y );
			for ( let i = 1; i <= half; i ++ ) put( xe, lerp( y, line( xe ), i / half ) );
			x0 = xe;

		} );
		run( x0, xC, PANEL * density );
		// the chine's flat
		const w = FLAT_W * fade, xT = xC + w, yT = yC - w * Math.tan( FLAT_DROP );
		for ( let i = 1; i <= FLAT * density; i ++ ) put( lerp( xC, xT, i / ( FLAT * density ) ), lerp( yC, yT, i / ( FLAT * density ) ) );
		// topsides, a curve from the flat's edge to the sheer
		const dx = xS - xT, dy = yS - yT, len = Math.hypot( dx, dy ) || 1;
		const fl = this.flare( t ) * len;
		const cx = ( xT + xS ) / 2 - ( dy / len ) * fl, cy = ( yT + yS ) / 2 + ( dx / len ) * fl;
		const n = TOP * density;
		for ( let i = 1; i <= n; i ++ ) {

			const u = i / n, a = ( 1 - u ) * ( 1 - u ), b = 2 * u * ( 1 - u ), c = u * u;
			put( a * xT + b * cx + c * xS, a * yT + b * cy + c * yS );

		}

		return out;

	}

	sectionPoints( t, density = 1 ) {

		const key = t + ':' + density;
		const cached = this._sectionCache.get( key );
		if ( cached ) return cached;
		const out = this._section( t, density, new Float64Array( ( COUNT * density + 1 ) * 2 ) );
		if ( this._sectionCache.size > 4096 ) this._sectionCache.clear();
		this._sectionCache.set( key, out );
		return out;

	}

	sectionCount( density = 1 ) {

		return COUNT * density + 1;

	}

	// the rows of a section between its hard edges, as [ first, last ] (each its own smooth surface): the pad, the three
	// bottom panels, each strake's flat and its step, the chine's flat, the topsides; which row's which colour reads off it
	panels( density = 1 ) {

		const d = density, out = [];
		let j = 0;
		const take = ( n, name ) => {

			out.push( { from: j, to: j + n * d, name } );
			j += n * d;

		};

		take( PAD, 'pad' );
		take( PANEL, 'bottom' );
		take( STRAKE >> 1, 'strake' );
		take( STRAKE >> 1, 'step' );
		take( PANEL, 'bottom' );
		take( STRAKE >> 1, 'strake' );
		take( STRAKE >> 1, 'step' );
		take( PANEL, 'bottom' );
		take( FLAT, 'flat' );
		take( TOP, 'topsides' );
		return out;

	}

}
