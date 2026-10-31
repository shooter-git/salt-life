import { WORLD } from '../world/WorldLayout.js';
import { northReefMask } from '../world/TerrainData.js';
import { mangroveAt } from '../world/terrain/Mangrove.js';
import { FT } from './Units.js';

// (M15) The chart's sheets drawn as a chart is (Chart.js has what they cover and what you've seen of them):
// in the colours of IHO S-52, the standard every electronic chart (an ECDIS, a plotter's charts) is drawn
// by, its day palette as OpenCPN gives it. Land buff (LANDA), its buildings brown (LANDF), drying ground and
// mangroves green (DEPIT); the water in four shades by depth, the shallows blue, the deep white (DEPVS to
// DEPDW, at 18, 60 and 300 ft); the coastline and the depth contours grey (CSTLN, DEPCN, at the fathoms a US
// chart draws: 6, 18, 30, 60, 120, 300, 600 ft and on); reefs with a chart's crosses; heights in brown; what's
// not charted yet the grey S-52 gives an area with no chart (NODTA).
//   - Each sheet baked a few rows at a time (SheetBake.step), into an RGBA image: its heights, colours,
//     contours, coastline and reefs (all here, testable under Node); then the symbols a canvas draws over it
//     (drawSymbols: buildings, the pier and the camp's jetty, the lights' flares, the wreck).
//   - Soundings (`soundings`): depths on a scattered grid, the plotter writing those in view.
//   const b = new SheetBake( SHEETS.near, 640 );  while ( ! b.step( terrain, 48 ) );  ctx.putImageData( … b.rgba … )

// S-52's day colours (sRGB)
export const S52 = {
	LANDA: [ 201, 185, 122 ], LANDF: [ 139, 102, 31 ], DEPIT: [ 131, 178, 149 ],
	DEPVS: [ 115, 182, 239 ], DEPMS: [ 152, 197, 242 ], DEPMD: [ 186, 213, 225 ], DEPDW: [ 212, 234, 238 ],
	DEPCN: [ 125, 137, 140 ], CSTLN: [ 82, 90, 92 ], CHBLK: [ 7, 7, 7 ], CHGRD: [ 125, 137, 140 ],
	CHMGD: [ 197, 69, 195 ], NODTA: [ 163, 180, 183 ], LITRD: [ 241, 84, 105 ], LITGN: [ 104, 228, 86 ], LITYW: [ 244, 218, 72 ],
	SNDG1: [ 125, 137, 140 ], SNDG2: [ 7, 7, 7 ],
};
export const rgb = ( c, a = 1 ) => a === 1 ? `rgb(${ c.join( ',' ) })` : `rgba(${ c.join( ',' ) },${ a })`;
// where the water's shades change (m): 18 ft, 60 ft, 300 ft; the depth contours (m); land contours every 200 ft
export const SHADES = [ 18, 60, 300 ].map( ( f ) => f * FT );
export const CONTOURS = [ 6, 18, 30, 60, 120, 300, 600, 1200, 3000, 6000 ].map( ( f ) => f * FT );
export const LAND_STEP = 200 * FT;
// how far the depths are smoothed for the shades and contours (m): a chart's contours are generalised, not the
// bottom's every lump
const SMOOTH = 7;
// the soundings' spacing on each sheet (m), and the shallowest written (m)
const SOUNDING = { near: 44, mid: 200, far: 700, min: 0.6 };

// the water's shade at a depth (m)
export function shadeOf( depth ) {

	return depth < SHADES[ 0 ] ? S52.DEPVS : depth < SHADES[ 1 ] ? S52.DEPMS : depth < SHADES[ 2 ] ? S52.DEPMD : S52.DEPDW;

}

// how many depth contours lie above a height (m; land, none) / land contours below it
export const bandOf = ( h ) => {

	if ( h >= 0 ) return - 1 - Math.floor( h / LAND_STEP );
	let n = 0;
	while ( n < CONTOURS.length && - h > CONTOURS[ n ] ) n ++;
	return n;

};

// coral: the bay's reef and the windward one, where it's shallow enough to be a danger
const reefAt = ( x, z, depth ) => {

	if ( depth > 6 ) return false;
	const R = WORLD.reef, dx = x - R.center.x, dz = z - R.center.z;
	return dx * dx + dz * dz < R.radius * R.radius || northReefMask( x, z ) > 0.45;

};

// a field box-blurred r pixels each way (twice: near enough a Gaussian's), its edges held; a line at a time
// (n lines from `from`): baked over a few steps
function blurLines( src, dst, N, r, along, from, n ) {

	const at = ( line, t ) => {

		const c = t < 0 ? 0 : t >= N ? N - 1 : t;
		return along ? src[ line * N + c ] : src[ c * N + line ];

	};
	for ( let line = from; line < Math.min( N, from + n ); line ++ ) {

		let sum = 0;
		for ( let t = - r; t <= r; t ++ ) sum += at( line, t );
		const k = 1 / ( 2 * r + 1 );
		if ( along ) {

			const o = line * N;
			for ( let t = 0; t < N; t ++ ) {

				dst[ o + t ] = sum * k;
				sum += src[ o + ( t + r + 1 < N ? t + r + 1 : N - 1 ) ] - src[ o + ( t - r > 0 ? t - r : 0 ) ];

			}

		} else for ( let t = 0; t < N; t ++ ) {

			dst[ t * N + line ] = sum * k;
			sum += src[ ( t + r + 1 < N ? t + r + 1 : N - 1 ) * N + line ] - src[ ( t - r > 0 ? t - r : 0 ) * N + line ];

		}

	}

}

export class SheetBake {

	// spec: a Chart.js sheet; px: the image's size; { island: true } reads the island's masks (the mangroves'
	// green, the reefs): the far sheet's too coarse for them
	constructor( spec, px, { island = spec.ext < 4000 } = {} ) {

		this.spec = spec;
		this.N = px;
		this.ppm = px / spec.ext;
		this.island = island;
		// (made as its turn to bake comes: step. (Step 21) All three sheets' at once were more than the low tier can spare)
		this.rgba = null;
		this.H = null;
		this.S = null; // (the depths smoothed, as a chart's contours are drawn: its shades and contours from them)
		this._T = null; // (and the smoothing's other half)
		this.phase = 0; // the heights, the smoothing (four passes), their colours, the lines
		this.row = 0;
		this.done = false;

	}

	// the world at a pixel's middle
	xAt( i ) {

		return this.spec.x0 + ( i + 0.5 ) / this.ppm;

	}

	zAt( j ) {

		return this.spec.z0 + ( j + 0.5 ) / this.ppm;

	}

	// `rows` more rows of the heights, then of the smoothing (four passes: across, down, across, down), then of
	// the colours, then of the lines: -> done
	step( T, rows = 48 ) {

		if ( this.done ) return true;
		const N = this.N, end = Math.min( N, this.row + rows ), P = this.phase;
		if ( ! this.H ) {

			this.rgba = new Uint8ClampedArray( N * N * 4 );
			this.H = new Float32Array( N * N );

		}

		if ( P >= 1 && P <= 4 ) {

			if ( ! this.S ) {

				this.S = new Float32Array( N * N );
				this._T = new Float32Array( N * N );

			}

			// (H into _T, _T into S, S into _T, _T into S)
			const src = P === 1 ? this.H : P === 3 ? this.S : this._T, dst = P === 2 || P === 4 ? this.S : this._T;
			blurLines( src, dst, N, Math.max( 1, Math.round( SMOOTH * this.ppm ) ), P % 2 === 1, this.row, rows * 4 );
			this.row = Math.min( N, this.row + rows * 4 );

		} else for ( let j = this.row; j < end; j ++ ) {

			if ( P === 0 ) for ( let i = 0; i < N; i ++ ) this.H[ j * N + i ] = T.heightAt( this.xAt( i ), this.zAt( j ) );
			else if ( P === 5 ) this._colours( j );
			else this._lines( j );

		}

		if ( ! ( P >= 1 && P <= 4 ) ) this.row = end;
		if ( this.row < N ) return false;
		this.row = 0;
		if ( P === 4 ) this._T = null;
		if ( P === 6 ) {

			this._reefs();
			this.done = true;
			this._T = null;

		}

		this.phase ++;
		return this.done;

	}

	_colours( j ) {

		const N = this.N, d = this.rgba;
		for ( let i = 0; i < N; i ++ ) {

			const k = j * N + i, h = this.H[ k ], o = k * 4;
			let c;
			if ( h >= 0 ) c = S52.LANDA;
			else c = shadeOf( Math.max( - h * 0.5, - this.S[ k ] ) );
			// (the mangroves' stand: on its mud, a hand's depth under, at the waterline)
			if ( this.island && h < 0.6 && h > - 1.2 && mangroveAt( this.xAt( i ), this.zAt( j ) ).stand > 0.5 ) c = S52.DEPIT;
			d[ o ] = c[ 0 ]; d[ o + 1 ] = c[ 1 ]; d[ o + 2 ] = c[ 2 ]; d[ o + 3 ] = 255;

		}

	}

	_put( i, j, c, a = 1 ) {

		if ( i < 0 || j < 0 || i >= this.N || j >= this.N ) return;
		const o = ( j * this.N + i ) * 4, d = this.rgba;
		d[ o ] = d[ o ] + ( c[ 0 ] - d[ o ] ) * a; d[ o + 1 ] = d[ o + 1 ] + ( c[ 1 ] - d[ o + 1 ] ) * a; d[ o + 2 ] = d[ o + 2 ] + ( c[ 2 ] - d[ o + 2 ] ) * a;

	}

	// a row's lines: the coastline (from the heights as they are), the depth contours and the land's (the depths
	// smoothed), each where it crosses between two pixels' middles, its ink shared between them (anti-aliased: a
	// coarse sheet's lines don't step when it's drawn larger)
	_lines( j ) {

		const N = this.N;
		if ( j >= N - 1 ) return;
		for ( let i = 0; i < N - 1; i ++ ) {

			const k = j * N + i;
			this._edge( k, i, j, k + 1, i + 1, j );
			this._edge( k, i, j, k + N, i, j + 1 );

		}

	}

	_edge( k1, i1, j1, k2, i2, j2 ) {

		const H = this.H, S = this.S, h1 = H[ k1 ], h2 = H[ k2 ];
		if ( ( h1 < 0 ) !== ( h2 < 0 ) ) return this._ink( i1, j1, i2, j2, S52.CSTLN, 1.7, h1 / ( h1 - h2 ) );
		if ( h1 < 0 ) {

			const a = - Math.min( - 0.01, S[ k1 ] ), b = - Math.min( - 0.01, S[ k2 ] );
			if ( a === b ) return;
			for ( const c of CONTOURS ) if ( ( a - c ) * ( b - c ) < 0 ) this._ink( i1, j1, i2, j2, S52.DEPCN, 0.9, ( c - a ) / ( b - a ) );
			return;

		}

		const lo = Math.ceil( Math.min( h1, h2 ) / LAND_STEP ), hi = Math.floor( Math.max( h1, h2 ) / LAND_STEP );
		for ( let n = Math.max( 1, lo ); n <= hi; n ++ ) if ( n * LAND_STEP !== h1 ) this._ink( i1, j1, i2, j2, S52.LANDF, 0.4, ( n * LAND_STEP - h1 ) / ( h2 - h1 ) );

	}

	// a line crossing between two pixels, t of the way from the first: its ink a, shared between them
	_ink( i1, j1, i2, j2, c, a, t ) {

		this._put( i1, j1, c, Math.min( 1, a * ( 1 - t ) ) );
		this._put( i2, j2, c, Math.min( 1, a * t ) );

	}

	// a cross every 10 m on the reefs, offset row by row
	_reefs() {

		if ( ! this.island ) return;
		const N = this.N, H = this.H, step = Math.max( 4, Math.round( 10 * this.ppm ) );
		for ( let j = step; j < N - step; j += step ) for ( let i = step + ( ( j / step ) % 2 ) * ( step >> 1 ); i < N - step; i += step ) {

			const h = H[ j * N + i ];
			if ( h >= 0 || ! reefAt( this.xAt( i ), this.zAt( j ), - h ) ) continue;
			for ( let k = - 1; k <= 1; k ++ ) {

				this._put( i + k, j, S52.CHBLK, 0.75 );
				this._put( i, j + k, S52.CHBLK, 0.75 );

			}

		}

	}

	// the height (m) at a world point, from the baked image (nearest pixel), or null off it
	heightAt( x, z ) {

		const i = Math.floor( ( x - this.spec.x0 ) * this.ppm ), j = Math.floor( ( z - this.spec.z0 ) * this.ppm );
		return i < 0 || j < 0 || i >= this.N || j >= this.N ? null : this.H[ j * this.N + i ];

	}

	// soundings on a scattered grid (each cell's point jittered, as a surveyor's lines wander): [ { x, z, d } ]
	soundings( kind = this.island ? 'near' : 'far' ) {

		const s = this.spec, step = SOUNDING[ kind ], out = [];
		let seed = 7;
		const rand = () => ( seed = ( seed * 16807 ) % 2147483647 ) / 2147483647;
		for ( let z = s.z0 + step / 2; z < s.z0 + s.ext; z += step ) for ( let x = s.x0 + step / 2; x < s.x0 + s.ext; x += step ) {

			const px = x + ( rand() - 0.5 ) * step * 0.7, pz = z + ( rand() - 0.5 ) * step * 0.7, h = this.heightAt( px, pz );
			if ( h !== null && - h > SOUNDING.min ) out.push( { x: px, z: pz, d: - h } );

		}

		return out;

	}

}

// ---- the symbols over a baked sheet, on a 2D canvas (P( x, z ) -> [ px, py ]; k: px a metre)
//   pads: the village's buildings (TerrainData.pads); lights: [ { x, z, colour: 'red' | 'green' | 'white' } ];
//   piers: [ [ x0, z0, x1, z1 ] ]; wrecks: [ { x, z } ]
export function drawSymbols( ctx, P, k, { pads = [], piers = [], lights = [], wrecks = [] } ) {

	ctx.save();
	// buildings: brown, a size seen (no smaller than a pixel and a half)
	ctx.fillStyle = rgb( S52.LANDF );
	for ( const p of pads ) {

		const [ cx, cy ] = P( p.x, p.z ), r = Math.max( 0.75, p.radius * 0.7 * k );
		ctx.fillRect( cx - r, cy - r, 2 * r, 2 * r );

	}

	// piers and jetties: the land's buff, outlined as the coast is
	ctx.fillStyle = rgb( S52.LANDA );
	ctx.strokeStyle = rgb( S52.CSTLN );
	ctx.lineWidth = Math.max( 0.6, 0.5 * k );
	for ( const [ x0, z0, x1, z1 ] of piers ) {

		const [ a, b ] = P( x0, z0 ), [ c, d ] = P( x1, z1 );
		ctx.fillRect( Math.min( a, c ), Math.min( b, d ), Math.max( 1, Math.abs( c - a ) ), Math.max( 1, Math.abs( d - b ) ) );
		ctx.strokeRect( Math.min( a, c ), Math.min( b, d ), Math.max( 1, Math.abs( c - a ) ), Math.max( 1, Math.abs( d - b ) ) );

	}

	// a light: the chart's magenta flare, a teardrop from the light's spot, its colour inside it
	for ( const L of lights ) {

		const [ cx, cy ] = P( L.x, L.z ), s = L.size || 9;
		ctx.save();
		ctx.translate( cx, cy );
		ctx.rotate( L.dir ?? 0.6 );
		ctx.beginPath();
		ctx.moveTo( 0, 0 );
		ctx.bezierCurveTo( s * 0.35, - s * 0.35, s * 0.35, - s * 0.95, 0, - s );
		ctx.bezierCurveTo( - s * 0.35, - s * 0.95, - s * 0.35, - s * 0.35, 0, 0 );
		ctx.fillStyle = rgb( L.colour === 'red' ? S52.LITRD : L.colour === 'green' ? S52.LITGN : S52.LITYW );
		ctx.fill();
		ctx.strokeStyle = rgb( S52.CHMGD );
		ctx.lineWidth = Math.max( 0.8, s / 9 );
		ctx.stroke();
		ctx.restore();
		ctx.beginPath();
		ctx.arc( cx, cy, Math.max( 1, s / 7 ), 0, Math.PI * 2 );
		ctx.fillStyle = rgb( S52.CHBLK );
		ctx.fill();

	}

	// a wreck, partly awash: the chart's hull and masts
	ctx.strokeStyle = rgb( S52.CHBLK );
	ctx.fillStyle = rgb( S52.CHBLK );
	for ( const w of wrecks ) {

		const [ cx, cy ] = P( w.x, w.z ), s = w.size || 7;
		ctx.lineWidth = Math.max( 0.8, s / 7 );
		ctx.beginPath();
		ctx.moveTo( cx - s, cy );
		ctx.lineTo( cx + s, cy );
		ctx.quadraticCurveTo( cx + s * 0.6, cy + s * 0.55, cx, cy + s * 0.55 );
		ctx.quadraticCurveTo( cx - s * 0.6, cy + s * 0.55, cx - s, cy );
		ctx.fill();
		ctx.beginPath();
		ctx.moveTo( cx - s * 0.35, cy );
		ctx.lineTo( cx - s * 0.35, cy - s * 0.7 );
		ctx.moveTo( cx + s * 0.3, cy );
		ctx.lineTo( cx + s * 0.3, cy - s * 0.55 );
		ctx.stroke();

	}

	ctx.restore();

}
