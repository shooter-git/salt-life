import { SHADES, CONTOURS, S52, S52_DUSK, S52_NIGHT, rgb } from '../../game/ChartBake.js';

// (M16) What's on the plotter's screen, drawn for that screen alone: a small canvas (the screen and a little margin,
// `layer`), drawn again only when the view's changed, and copied into the instruments' atlas at each of its redraws.
//   - Close in, past where a sheet's pixels would show (RESOLVE), it's a vector chart, as a real plotter's is: the
//     seabed read for just this view (the same ground the sounder reads), its depth areas filled and its contours
//     stroked as lines at the plotter's own pixel (marching squares: isoFill, isoLine), its soundings written on
//     a lattice that stays put on the sea (`soundings`). Nothing's kept but a small grid of numbers.
//   - Further out, or over the island's own sheet, it's the minimap's sheets as they are, under the finer.
//   - Blank where you haven't been: the same cells as the sheets (ChartLog), their edge a clean line.
//   - After dark, S-52's dusk or night colours (PALETTES, as OpenCPN gives them): a vector view is simply drawn in them;
//     one with a sheet in it is drawn by day and its colours looked up (one small table, not a second copy of a sheet).
//     A change of palette is one redraw. Nothing here touches the minimap.
//   const p = new PlotterChart( { k, w, h } );  p.draw( g, { map, log, across, x, y, w, h, vx, vz, s, palette } )

export const PALETTES = { day: S52, dusk: S52_DUSK, night: S52_NIGHT };
// the plotter's own colours about the chart, as `PALETTES`: by day as they've always been; after dark S-52's user-interface ones
const dark = ( P ) => ( {
	bar: rgb( P.UIBCK, 0.9 ), text: rgb( P.UINFD ), ok: rgb( P.CHGRN ), tight: rgb( P.LITYW ), short: rgb( P.CHRED ),
	her: rgb( P.UINFO ), herEdge: rgb( P.UIBCK ), track: rgb( P.UINFF ), fish: rgb( P.UINFB ), edge: rgb( P.CHGRD ), mark: rgb( P.CHRED ),
	halo: rgb( P.UIBCK, 0.7 ), haloMark: rgb( P.UIBCK, 0.7 ), ink: rgb( P.CHBLK ),
	warn: rgb( P.CHRED ), warnOff: rgb( P.CHRED, 0.4 ), watch: rgb( P.LITYW, 0.6 ), alert: rgb( P.UINFD ),
} );
export const SCREEN = {
	day: {
		bar: 'rgba(2,8,14,0.82)', text: '#e8f4ff', ok: '#8fdc8a', tight: '#f2c14e', short: '#ff7a6a',
		her: '#ff6a2a', herEdge: '#1a1a1a', track: 'rgba(30,30,30,0.75)', fish: '#1d5b8f', edge: '#ffffff', mark: '#d6303a',
		halo: 'rgba(255,255,255,0.75)', haloMark: 'rgba(255,255,255,0.8)', ink: 'rgba(16,20,22,0.85)',
		warn: '#c8202c', warnOff: '#5a0f16', watch: '#c98a12', alert: '#ffffff',
	},
	dusk: dark( S52_DUSK ), night: dark( S52_NIGHT ),
};
// which palette at the sky's `night` (G.night, 0..1), the VHF's amber coming on over the same span (Instruments: 0.2
// to 0.7): a little either way before it changes back, so it doesn't flicker at the turn
const TO_DUSK = 0.2, TO_NIGHT = 0.7, EITHER = 0.03;
export function paletteFor( night, was = 'day' ) {

	const dusk = night >= TO_DUSK + ( was === 'day' ? EITHER : - EITHER ), full = night >= TO_NIGHT + ( was === 'night' ? - EITHER : EITHER );
	return full ? 'night' : dusk ? 'dusk' : 'day';

}

// a sheet's pixel larger than this many of the screen's is blown up: read the seabed instead
export const RESOLVE = 1.6;
export const sheetBlown = ( sheetPpm, pxPerM ) => pxPerM / sheetPpm > RESOLVE;
// the screen's pixels: the grid's step, the margin about the screen (how far she goes before it's drawn again)
const GRID = 4, SEEN_GRID = 16, MARGIN = 16;
// how much of the seabed's own grid the depths are smoothed over (as a chart's contours are generalised, its map's cells
// not to show as facets close in): that many of its cells' worth, in two passes, at most this many nodes
const SMOOTH_CELLS = 0.5, MOST_R = 4;
// the soundings' least spacing on the screen (atlas px), and the shallowest written (m)
const SOUND_PX = 64, SOUND_MIN = 0.6;

// the colours a sheet's drawn in (ChartBake's and drawSymbols'): what the look-up goes by
const BAKED = [ 'LANDA', 'LANDF', 'DEPIT', 'DEPVS', 'DEPMS', 'DEPMD', 'DEPDW', 'DEPCN', 'CSTLN', 'CHBLK', 'CHMGD', 'NODTA', 'LITRD', 'LITGN', 'LITYW' ];
const fract = ( v ) => v - Math.floor( v );
const hash2 = ( a, b, c ) => fract( Math.sin( a * 12.9898 + b * 78.233 + c * 37.719 ) * 43758.5453 );

// The region of a field where it's under `c`, as one path of cells (x, y of its first node, step between them): clockwise
// every one, so that one fill() of the lot shows no seams. Whole runs of cells as one rectangle.
export function isoFill( g, F, nx, ny, x0, y0, step, c ) {

	let started = false;
	const v = ( px, py ) => {

		if ( started ) g.lineTo( px, py );
		else g.moveTo( px, py );
		started = true;

	};

	for ( let j = 0; j < ny - 1; j ++ ) {

		const y = y0 + j * step;
		let run = - 1;
		for ( let i = 0; i < nx - 1; i ++ ) {

			const k = j * nx + i, a = F[ k ], b = F[ k + 1 ], d = F[ k + nx + 1 ], e = F[ k + nx ];
			const inA = a < c, inB = b < c, inD = d < c, inE = e < c;
			if ( inA && inB && inD && inE ) {

				if ( run < 0 ) run = i;
				continue;

			}

			if ( run >= 0 ) {

				g.rect( x0 + run * step, y, ( i - run ) * step, step );
				run = - 1;

			}

			if ( ! inA && ! inB && ! inD && ! inE ) continue;
			const x = x0 + i * step;
			started = false;
			if ( inA ) v( x, y );
			if ( inA !== inB ) v( x + step * ( c - a ) / ( b - a ), y );
			if ( inB ) v( x + step, y );
			if ( inB !== inD ) v( x + step, y + step * ( c - b ) / ( d - b ) );
			if ( inD ) v( x + step, y + step );
			if ( inD !== inE ) v( x + step * ( c - e ) / ( d - e ), y + step );
			if ( inE ) v( x, y + step );
			if ( inE !== inA ) v( x, y + step * ( c - a ) / ( e - a ) );
			g.closePath();

		}

		if ( run >= 0 ) g.rect( x0 + run * step, y, ( nx - 1 - run ) * step, step );

	}

}

// The line where a field crosses `c`, one segment a cell (a saddle's two by its middle). -> how many segments
export function isoLine( g, F, nx, ny, x0, y0, step, c ) {

	let n = 0;
	const seg = ( ax, ay, bx, by ) => {

		g.moveTo( ax, ay );
		g.lineTo( bx, by );
		n ++;

	};

	for ( let j = 0; j < ny - 1; j ++ ) {

		const y = y0 + j * step;
		for ( let i = 0; i < nx - 1; i ++ ) {

			const k = j * nx + i, a = F[ k ], b = F[ k + 1 ], d = F[ k + nx + 1 ], e = F[ k + nx ];
			const code = ( a < c ? 1 : 0 ) | ( b < c ? 2 : 0 ) | ( d < c ? 4 : 0 ) | ( e < c ? 8 : 0 );
			if ( code === 0 || code === 15 ) continue;
			const x = x0 + i * step;
			const tx = x + step * ( c - a ) / ( b - a ), rx = x + step, ry = y + step * ( c - b ) / ( d - b );
			const bx = x + step * ( c - e ) / ( d - e ), by = y + step, ly = y + step * ( c - a ) / ( e - a );
			switch ( code ) {

				case 1: case 14: seg( x, ly, tx, y ); break;
				case 2: case 13: seg( tx, y, rx, ry ); break;
				case 3: case 12: seg( x, ly, rx, ry ); break;
				case 4: case 11: seg( rx, ry, bx, by ); break;
				case 6: case 9: seg( tx, y, bx, by ); break;
				case 7: case 8: seg( x, ly, bx, by ); break;
				default: {

					// (a saddle: the shallower corners joined if the cell's middle is shallow)
					const joined = ( a + b + d + e ) / 4 < c;
					if ( ( code === 5 ) === joined ) {

						seg( x, ly, bx, by );
						seg( tx, y, rx, ry );

					} else {

						seg( x, ly, tx, y );
						seg( rx, ry, bx, by );

					}

				}

			}

		}

	}

	return n;

}

// a field box-blurred r nodes each way, twice (near enough a Gaussian's), its edges held: S from H, T its scratch
export function blurField( H, S, T, nx, ny, r ) {

	const pass = ( src, dst, along ) => {

		const n = along ? nx : ny, lines = along ? ny : nx, q = 1 / ( 2 * r + 1 ), sx = along ? 1 : nx, sl = along ? nx : 1;
		for ( let l = 0; l < lines; l ++ ) {

			const o = l * sl;
			let sum = 0;
			for ( let t = - r; t <= r; t ++ ) sum += src[ o + Math.min( n - 1, Math.max( 0, t ) ) * sx ];
			for ( let t = 0; t < n; t ++ ) {

				dst[ o + t * sx ] = sum * q;
				sum += src[ o + Math.min( n - 1, t + r + 1 ) * sx ] - src[ o + Math.max( 0, t - r ) * sx ];

			}

		}

	};
	pass( H, T, true );
	pass( T, S, false );
	pass( S, T, true );
	pass( T, S, false );

}

// how much of a sheet's cells about ( x, z ) you've charted, 0..1, between the cells' middles (their edge a clean line
// when it's cut at a half); -1 off the sheet
export function softSeen( log, sheet, x, z ) {

	const s = sheet.spec, n = s.n, fx = ( x - s.x0 ) / s.cell - 0.5, fz = ( z - s.z0 ) / s.cell - 0.5;
	if ( fx < - 0.5 || fz < - 0.5 || fx > n - 0.5 || fz > n - 0.5 ) return - 1;
	const i = Math.floor( fx ), j = Math.floor( fz ), tx = fx - i, tz = fz - j;
	return ( cellSeen( log, sheet, i, j ) * ( 1 - tx ) + cellSeen( log, sheet, i + 1, j ) * tx ) * ( 1 - tz ) + ( cellSeen( log, sheet, i, j + 1 ) * ( 1 - tx ) + cellSeen( log, sheet, i + 1, j + 1 ) * tx ) * tz;

}

function cellSeen( log, sheet, a, b ) {

	const n = sheet.spec.n, p = a < 0 ? 0 : a >= n ? n - 1 : a, q = b < 0 ? 0 : b >= n ? n - 1 : b, k = q * n + p;
	return sheet.cells[ k ] === 1 || ( log.bought && log.charted( sheet, k ) ) ? 1 : 0;

}

// a day colour's look-up into a palette: 16 steps a channel (r << 8 | g << 4 | b, its three bytes). Each the palette's
// colours as near as it is to the day's (a line's anti-aliasing between two comes out between them)
export function paletteTable( to, day = S52 ) {

	const out = new Uint8Array( 4096 * 3 ), n = BAKED.length, D = new Float32Array( n * 3 ), C = new Float32Array( n * 3 );
	BAKED.forEach( ( k, i ) => {

		D.set( day[ k ], i * 3 );
		C.set( to[ k ], i * 3 );

	} );
	for ( let q = 0; q < 4096; q ++ ) {

		const cr = ( q >> 8 ) * 17, cg = ( ( q >> 4 ) & 15 ) * 17, cb = ( q & 15 ) * 17;
		let sum = 0, R = 0, G = 0, B = 0;
		for ( let i = 0; i < n; i ++ ) {

			const dr = D[ i * 3 ] - cr, dg = D[ i * 3 + 1 ] - cg, db = D[ i * 3 + 2 ] - cb, e = dr * dr + dg * dg + db * db + 1, w = 1 / ( e * e );
			sum += w;
			R += C[ i * 3 ] * w;
			G += C[ i * 3 + 1 ] * w;
			B += C[ i * 3 + 2 ] * w;

		}

		out[ q * 3 ] = R / sum;
		out[ q * 3 + 1 ] = G / sum;
		out[ q * 3 + 2 ] = B / sum;

	}

	return out;

}

export class PlotterChart {

	// k: the atlas's pixels to a unit (the low tier's half); w, h: the screen (atlas units); make: a canvas of a size
	constructor( { k = 1, w, h, make = null } ) {

		this.k = k;
		this.w = w;
		this.h = h;
		this.W = Math.ceil( w * k ) + MARGIN * 2;
		this.H = Math.ceil( h * k ) + MARGIN * 2;
		const c = make ? make( this.W, this.H ) : document.createElement( 'canvas' );
		c.width = this.W;
		c.height = this.H;
		this.canvas = c;
		this.ctx = c.getContext( '2d' );
		this.vector = false; // (the view's a vector one)
		this.soundings = []; // (those of a vector view, as the sheets': { x, z, d })
		this.redraws = 0;
		this._cx = null;
		this._key = '';
		this._version = - 1;
		this._at = - 1e9;
		this._grid = null;
		this._tables = {};

	}

	// the screen's copy of the chart, into the atlas (g): at world ( vx, vz ) in the screen's middle ( s: atlas px a metre )
	draw( g, { map, log, across, x, y, w, h, vx, vz, s, palette } ) {

		const pxm = s * this.k;
		if ( this._stale( map, log, across, vx, vz, pxm, palette ) ) this._redraw( map, log, across, vx, vz, s, pxm, palette );
		const k = this.k, lx = x + w / 2 - this.W / ( 2 * k ) - ( vx - this._cx ) * s, ly = y + h / 2 - this.H / ( 2 * k ) - ( vz - this._cz ) * s;
		// (on the screen's own pixels: it's crisp, and goes by a pixel at a time)
		g.imageSmoothingEnabled = false;
		g.drawImage( this.canvas, Math.round( lx * k ) / k, Math.round( ly * k ) / k, this.W / k, this.H / k );
		g.imageSmoothingEnabled = true;

	}

	_stale( map, log, across, vx, vz, pxm, palette ) {

		const S = map && map.sheets;
		const key = `${ across }|${ palette }|${ log ? log.bought : 0 }|${ S ? ( S.far.drawn >= 0 ) + 2 * ( S.mid.drawn >= 0 ) + 4 * ( S.near.drawn >= 0 ) : - 1 }`;
		if ( key !== this._key || this._cx === null ) {

			this._key = key;
			return true;

		}

		if ( Math.abs( vx - this._cx ) * pxm > MARGIN - 2 || Math.abs( vz - this._cz ) * pxm > MARGIN - 2 ) return true;
		if ( log && log.version !== this._version && performance.now() - this._at > 1000 ) return true;
		return false;

	}

	_redraw( map, log, across, vx, vz, s, pxm, palette ) {

		const g = this.ctx, W = this.W, H = this.H;
		this._cx = vx;
		this._cz = vz;
		this._version = log ? log.version : - 1;
		this._at = performance.now();
		this.redraws ++;
		const x0 = vx - W / ( 2 * pxm ), z0 = vz - H / ( 2 * pxm ), x1 = vx + W / ( 2 * pxm ), z1 = vz + H / ( 2 * pxm );
		const list = [];
		let vector = false;
		if ( map && map.sheets ) {

			// (from the finest that covers the view: those whose pixels would show left to the vector chart)
			const S = map.sheets, covers = ( sp ) => sp.x0 <= x0 && sp.z0 <= z0 && sp.x0 + sp.ext >= x1 && sp.z0 + sp.ext >= z1;
			const from = covers( S.near.spec ) ? 2 : covers( S.mid.spec ) ? 1 : 0;
			const reaches = ( sp ) => sp.x0 < x1 && sp.z0 < z1 && sp.x0 + sp.ext > x0 && sp.z0 + sp.ext > z0;
			for ( const sh of [ S.far, S.mid, S.near ].slice( from ) ) {

				if ( ! reaches( sh.spec ) ) continue;
				if ( sh !== S.near && sheetBlown( sh.ppm, pxm ) ) vector = true;
				else if ( sh.drawn >= 0 ) list.push( sh );

			}

		}

		const T = map && map.game && map.game.app && map.game.app.terrainData;
		vector = vector && !! T && !! log;
		this.vector = vector;
		this.soundings.length = 0;
		// (with a sheet in the view, all of it by day and looked up after, as the sheet's only that)
		const direct = list.length ? 'day' : palette, P = PALETTES[ direct ];
		g.fillStyle = rgb( P.NODTA );
		g.fillRect( 0, 0, W, H );
		if ( vector ) {

			this._drawVector( T, log, x0, z0, pxm, P );
			this._writeSoundings( T, log, x0, z0, x1, z1, s );

		}

		g.imageSmoothingEnabled = true;
		for ( const sh of list ) {

			const sp = sh.spec;
			g.drawImage( sh.view, ( sp.x0 - x0 ) * pxm, ( sp.z0 - z0 ) * pxm, sp.ext * pxm, sp.ext * pxm );

		}

		if ( direct !== palette ) this._lookUp( palette );

	}

	// the seabed read for this view, drawn at its own pixel: the depth areas, their contours and the coast; blank where you
	// haven't been
	_drawVector( T, log, x0, z0, pxm, P ) {

		const g = this.ctx, W = this.W, H = this.H, m = GRID / pxm;
		const cell = T.offshore ? T.offshore.texel : 32, r = Math.max( 1, Math.min( MOST_R, Math.round( cell * SMOOTH_CELLS / m ) ) ), pad = r * 2 + 1;
		const nx = Math.ceil( W / GRID ) + 1 + pad * 2, ny = Math.ceil( H / GRID ) + 1 + pad * 2, N = nx * ny;
		const sx = Math.ceil( W / SEEN_GRID ) + 3, sy = Math.ceil( H / SEEN_GRID ) + 3;
		const G = this._grid && this._grid.h.length >= N ? this._grid : ( this._grid = { h: new Float32Array( N ), s: new Float32Array( N ), t: new Float32Array( N ), seen: new Float32Array( sx * sy ) } );
		const { h: Hh, s: Hs, t: Ht, seen } = G;
		const ox = x0 - pad * m, oz = z0 - pad * m;
		for ( let j = 0; j < ny; j ++ ) for ( let i = 0; i < nx; i ++ ) Hh[ j * nx + i ] = T.heightAt( ox + i * m, oz + j * m );
		blurField( Hh, Hs, Ht, nx, ny, r );
		// (as the sheets are: shallower than it's smoothed to, by half of where it really is, for a shoal not to be lost)
		let lo = Infinity, hi = - Infinity;
		for ( let k = 0; k < N; k ++ ) {

			const h = Hh[ k ], f = h >= 0 ? - h : Math.max( - h * 0.5, - Hs[ k ] );
			Ht[ k ] = f;
			if ( f < lo ) lo = f;
			if ( f > hi ) hi = f;

		}

		const X0 = - pad * GRID, Y0 = - pad * GRID, fill = ( c, colour ) => {

			if ( lo >= c ) return;
			g.beginPath();
			isoFill( g, Ht, nx, ny, X0, Y0, GRID, c );
			g.fillStyle = colour;
			g.fill();

		};
		const line = ( c, colour, width ) => {

			if ( lo >= c || hi <= c ) return;
			g.beginPath();
			isoLine( g, Ht, nx, ny, X0, Y0, GRID, c );
			g.strokeStyle = colour;
			g.lineWidth = width;
			g.stroke();

		};
		g.save();
		g.lineCap = 'round';
		g.fillStyle = rgb( P.DEPDW );
		g.fillRect( 0, 0, W, H );
		fill( SHADES[ 2 ], rgb( P.DEPMD ) );
		fill( SHADES[ 1 ], rgb( P.DEPMS ) );
		fill( SHADES[ 0 ], rgb( P.DEPVS ) );
		fill( 0, rgb( P.LANDA ) );
		const thin = Math.max( 1, 1.1 * this.k ), bold = Math.max( 1.4, 2 * this.k );
		for ( const c of CONTOURS ) line( c, rgb( c === SHADES[ 1 ] ? P.DEPSC : P.DEPCN ), c === SHADES[ 1 ] ? bold : thin );
		line( 0, rgb( P.CSTLN ), bold );
		// (blank: S-52's for no chart, past a clean edge)
		const mid = log.mid, far = log.far, q = SEEN_GRID / pxm;
		for ( let j = 0; j < sy; j ++ ) for ( let i = 0; i < sx; i ++ ) {

			const x = x0 + ( i - 1 ) * q, z = z0 + ( j - 1 ) * q;
			let v = softSeen( log, mid, x, z );
			if ( v < 0 ) v = softSeen( log, far, x, z );
			seen[ j * sx + i ] = v < 0 ? 0 : v;

		}

		g.beginPath();
		isoFill( g, seen, sx, sy, - SEEN_GRID, - SEEN_GRID, SEEN_GRID, 0.5 );
		g.fillStyle = rgb( P.NODTA );
		g.fill();
		g.restore();

	}

	// soundings on a lattice that stays put on the sea (the screen's own spacing, its points jittered, as a surveyor's lines
	// wander): those in the water, as a real plotter's vector chart gives more as you range in
	_writeSoundings( T, log, x0, z0, x1, z1, s ) {

		let sp = 25;
		while ( sp * s < SOUND_PX ) sp *= 2;
		for ( let j = Math.floor( z0 / sp ); j * sp < z1; j ++ ) for ( let i = Math.floor( x0 / sp ); i * sp < x1; i ++ ) {

			const x = ( i + 0.15 + 0.7 * hash2( i, j, sp ) ) * sp, z = ( j + 0.15 + 0.7 * hash2( j, i, sp + 1 ) ) * sp, d = - T.heightAt( x, z );
			if ( d > SOUND_MIN ) this.soundings.push( { x, z, d } );

		}

	}

	// the view's colours as the palette has them
	_lookUp( palette ) {

		const t = this._tables[ palette ] || ( this._tables = { [ palette ]: paletteTable( PALETTES[ palette ] ) } )[ palette ];
		const g = this.ctx, img = g.getImageData( 0, 0, this.W, this.H ), d = img.data;
		for ( let o = 0; o < d.length; o += 4 ) {

			const q = ( ( ( d[ o ] >> 4 ) << 8 ) | ( ( d[ o + 1 ] >> 4 ) << 4 ) | ( d[ o + 2 ] >> 4 ) ) * 3;
			d[ o ] = t[ q ];
			d[ o + 1 ] = t[ q + 1 ];
			d[ o + 2 ] = t[ q + 2 ];

		}

		g.putImageData( img, 0, 0 );

	}

}
