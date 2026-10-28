// (M14) The boat's radar: her open array turns on the wheelhouse roof (BoatModel: clockwise from above, as
// a radar's does, RADAR_RPM), and its screen on the dash (Instruments' third, to port of the plotter) shows
// what it sees, as a small boat's colour radar does (a Furuno 1815's, photographed at 2 NM): heading up,
// black, its rings and bearing scale in green, each echo as strong as it returns (blue where it's faint, to
// magenta and pink where it's strong), painted bearing by bearing as the sweep passes, with the array.
// What returns:
//   - the island: along each bearing from the array's height (ANTENNA m over the sea), out over the
//     terrain, the land the beam sees: the coast where it rises from the sea, strongest; the slopes facing
//     her, the steeper the stronger; nothing behind a ridge (its shadow). And the pier.
//   - the rain: the showers about the island and a hurricane's bands (`rainAt`), as hard as they rain,
//     speckled and changing sweep to sweep;
//   - the sea about her: clutter as rough as the wind's sea (`sea`, 0..1), out a few hundred metres, as an
//     automatic sea control leaves it;
//   - other boats: an arc each, as wide as the beam (BEAM) and a pulse long.
// Ranges (NM) as a radar's (RANGES), stepped at the helm (step); a new range is painted afresh as the
// sweep comes round; it starts at 0.75 NM. Pure but for the canvas it draws on (test/radar.mjs).
//   const r = new BoatRadar( { terrain, size } );
//   r.update( dt, { x, z, heading, beam, sea, rainAt, boats } )   (heading: hers, rad clockwise from north;
//   beam: the array's, clockwise from her bow; boats: [ { x, z } ])
//   r.draw( ctx, [ x, y, w, h ], { heading } )   (into the instruments' atlas)

export const NM = 1852;
// the ranges (NM) and their rings' interval
export const RANGES = [ [ 0.25, 0.125 ], [ 0.5, 0.25 ], [ 0.75, 0.25 ], [ 1.5, 0.5 ], [ 3, 1 ], [ 6, 2 ], [ 12, 4 ], [ 24, 8 ] ];
const START = 2; // 0.75 NM: the bay and the coast about her, as a skipper sets it near harbour
// rad a second the array turns (BoatModel's RADAR_RPM: 24)
const TURN = 24 / 60 * Math.PI * 2;
const BEARINGS = 720, BINS = 160;
export const ANTENNA = 4.6; // m: the array over the sea (her wheelhouse roof)
const BEAM = 1.9 * Math.PI / 180; // a 4 ft open array's horizontal beam
const PULSE = 25; // m: a short pulse's length (an echo's depth in range)
// the island's echo: the coast where land first rises from the sea, the slopes facing her (by how steep),
// land seen beyond (fainter with range); the pier
const COAST = 1, FACING = 0.9, LAND = 0.42, PIER = 0.95;
// the pier's walkway and head (world m), as points the beam can find
const PIER_PTS = [];
for ( let z = - 60; z <= 40; z += 4 ) PIER_PTS.push( [ 55, z ] );
for ( let x = 48; x <= 62; x += 3.5 ) PIER_PTS.push( [ x, 40 ] );
// the rain's echo for a rain (0..1: a downpour 1), and the sea's clutter out to (m, at its roughest)
const RAIN = 0.75, CLUTTER = 650;

const fract = ( x ) => x - Math.floor( x );
const hash3 = ( a, b, c ) => fract( Math.sin( a * 12.9898 + b * 78.233 + c * 37.719 ) * 43758.5453 );
// a value noise over the world (0..1), for the rain's clumps within a shower
const vnoise = ( x, z ) => {

	const i = Math.floor( x ), j = Math.floor( z ), fx = x - i, fz = z - j;
	const u = fx * fx * ( 3 - 2 * fx ), v = fz * fz * ( 3 - 2 * fz );
	const a = hash3( i, j, 0.1 ), b = hash3( i + 1, j, 0.1 ), c = hash3( i, j + 1, 0.1 ), d = hash3( i + 1, j + 1, 0.1 );
	return ( a * ( 1 - u ) + b * u ) * ( 1 - v ) + ( c * ( 1 - u ) + d * u ) * v;

};

// an echo's colour (0..1): blue where faint, through violet to magenta and pink where strong
const STOPS = [ [ 0.1, 0, 30, 110 ], [ 0.3, 20, 90, 255 ], [ 0.5, 120, 70, 230 ], [ 0.7, 235, 60, 170 ], [ 1, 255, 150, 200 ] ];
export function echoColour( k, out = [ 0, 0, 0 ] ) {

	if ( k < STOPS[ 0 ][ 0 ] ) return out.fill( 0 );
	let i = 0;
	while ( i < STOPS.length - 2 && k > STOPS[ i + 1 ][ 0 ] ) i ++;
	const [ k0, r0, g0, b0 ] = STOPS[ i ], [ k1, r1, g1, b1 ] = STOPS[ i + 1 ], t = Math.min( 1, ( k - k0 ) / ( k1 - k0 ) );
	out[ 0 ] = r0 + ( r1 - r0 ) * t;
	out[ 1 ] = g0 + ( g1 - g0 ) * t;
	out[ 2 ] = b0 + ( b1 - b0 ) * t;
	return out;

}

export class BoatRadar {

	// terrain: heightAt( x, z ); seaLevel: () => m; size: the picture's pixels across (its PPI)
	constructor( { terrain, seaLevel = () => 0, size = 300 } ) {

		this.terrain = terrain;
		this.seaLevel = seaLevel;
		this.range = START;
		this.picture = new Float32Array( BEARINGS * BINS );
		this.beam = null; // the bearing (true, rad) last painted
		this.sweeps = 0;
		this.size = size;
		this.canvas = null;
		if ( typeof document !== 'undefined' ) {

			this.canvas = document.createElement( 'canvas' );
			this.canvas.width = this.canvas.height = size;
			this.ctx = this.canvas.getContext( '2d' );
			this.image = this.ctx.createImageData( size, size );

		}

		// (each pixel of the PPI: its bin, -1 off the screen; its angle, in bearings clockwise from up)
		this._bin = new Int16Array( size * size );
		this._ang = new Float32Array( size * size );
		const c = ( size - 1 ) / 2;
		for ( let j = 0; j < size; j ++ ) for ( let i = 0; i < size; i ++ ) {

			const dx = i - c, dy = j - c, r = Math.hypot( dx, dy ) / ( size / 2 ), k = j * size + i;
			this._bin[ k ] = r < 1 ? Math.min( BINS - 1, Math.floor( r * BINS ) ) : - 1;
			this._ang[ k ] = ( ( Math.atan2( dx, - dy ) / ( Math.PI * 2 ) + 1 ) % 1 ) * BEARINGS;

		}

		this._rgb = [ 0, 0, 0 ];

	}

	get nm() {

		return RANGES[ this.range ][ 0 ];

	}

	// a range in or out (d: -1 or +1); painted afresh as the sweep comes round
	step( d ) {

		const r = Math.max( 0, Math.min( RANGES.length - 1, this.range + d ) );
		if ( r === this.range ) return false;
		this.range = r;
		this.picture.fill( 0 );
		return true;

	}

	// each frame aboard: where she is and heads, the array's bearing from her bow (the sweep turns with it),
	// how rough the sea is, the rain about, and the other boats
	update( dt, { x, z, heading, beam, sea = 0, rainAt = null, boats = [] } ) {

		const now = heading + beam;
		if ( this.beam === null ) this.beam = now - 1e-3;
		// (a new turn of the array: the rain's speckle changes)
		if ( beam < ( this._arr ?? 0 ) ) this.sweeps ++;
		this._arr = beam;
		// (the bearings swept since the last frame, clockwise: as far as the array's turned in it, whole turns
		// and all on a slow frame, and her own turning; at most a turn)
		let span = ( ( now - this.beam ) % ( Math.PI * 2 ) + Math.PI * 2 ) % ( Math.PI * 2 );
		span += Math.round( ( dt * TURN - span ) / ( Math.PI * 2 ) ) * Math.PI * 2;
		span = Math.min( Math.PI * 2, Math.max( 0.02, span ) );
		const from = now - span;
		const n = Math.min( BEARINGS, Math.ceil( span / ( Math.PI * 2 ) * BEARINGS ) );
		for ( let i = 1; i <= n; i ++ ) {

			const b = from + span * i / n, bi = ( ( Math.round( b / ( Math.PI * 2 ) * BEARINGS ) % BEARINGS ) + BEARINGS ) % BEARINGS;
			this._paint( bi, x, z, sea, rainAt, boats );

		}

		this.beam = now;

	}

	// one bearing's returns, out along it from her
	_paint( bi, x0, z0, sea, rainAt, boats ) {

		const P = this.picture, base = bi * BINS, R = this.nm * NM, dr = R / BINS;
		const b = bi / BEARINGS * Math.PI * 2, dx = Math.sin( b ), dz = - Math.cos( b );
		const sl = this.seaLevel(), steps = Math.min( 4, Math.max( 1, Math.ceil( dr / 8 ) ) ), sweep = this.sweeps;
		let maxA = - Infinity, wasSea = true, prevH = sl;
		for ( let k = 0; k < BINS; k ++ ) {

			let e = 0;
			// the land the beam sees in this bin (the steepest of a few looks)
			for ( let s = 0; s < steps; s ++ ) {

				const r = ( k + ( s + 0.5 ) / steps ) * dr, x = x0 + dx * r, z = z0 + dz * r;
				const h = this.terrain.heightAt( x, z ) - sl, a = ( h - ANTENNA ) / r;
				if ( h > 0.2 ) {

					if ( a >= maxA - 0.002 ) {

						const rise = ( h - prevH ) / ( dr / steps );
						e = Math.max( e, wasSea ? COAST : Math.min( 1, LAND * ( 1 - k / BINS * 0.4 ) + FACING * Math.max( 0, Math.min( 1, rise * 1.5 ) ) ) );

					}

					wasSea = false;

				} else wasSea = true;

				maxA = Math.max( maxA, a );
				prevH = Math.max( h, 0 );

			}

			const r = ( k + 0.5 ) * dr, x = x0 + dx * r, z = z0 + dz * r, grain = hash3( bi, k, sweep );
			// the rain, in clumps, speckled sweep to sweep
			if ( rainAt ) {

				const w = rainAt( x, z );
				if ( w > 0.02 ) e = Math.max( e, RAIN * Math.pow( w, 0.8 ) * ( 0.55 + 0.6 * vnoise( x / 260, z / 260 ) ) * ( 0.65 + 0.5 * grain ) );

			}

			// the sea's clutter about her
			if ( sea > 0 && r < CLUTTER * sea ) e = Math.max( e, 0.55 * sea * ( 1 - r / ( CLUTTER * sea ) ) ** 2 * ( grain > 0.55 ? grain : 0 ) );
			P[ base + k ] = e;

		}

		// the pier and the other boats: an arc as wide as the beam, a pulse deep
		const hit = ( px, pz, strength ) => {

			const rx = px - x0, rz = pz - z0, r = Math.hypot( rx, rz );
			if ( r < 1 || r > R ) return;
			const brg = Math.atan2( rx, - rz ), d = Math.abs( ( ( brg - b ) % ( Math.PI * 2 ) + Math.PI * 3 ) % ( Math.PI * 2 ) - Math.PI );
			if ( d > BEAM / 2 + 6 / r ) return;
			const k = Math.floor( r / dr );
			for ( let j = k; j <= Math.min( BINS - 1, k + Math.max( 0, Math.ceil( PULSE / dr ) - 1 ) ); j ++ ) P[ base + j ] = Math.max( P[ base + j ], strength );

		};
		for ( const [ px, pz ] of PIER_PTS ) hit( px, pz, PIER );
		for ( const o of boats ) hit( o.x, o.z, 1 );

	}

	// the screen: the picture heading up, its rings, the bearing scale and the heading line, the sweep, her
	// at its middle, and the range, the rings' interval, her heading
	draw( g, [ x, y, w, h ], { heading = 0 } = {} ) {

		g.save();
		g.fillStyle = '#000000';
		g.fillRect( x, y, w, h );
		const size = this.size, S = h - 34, cx = x + w / 2, cy = y + h / 2 + 4, R = S / 2;
		if ( this.canvas ) {

			const img = this.image.data, P = this.picture, rot = heading / ( Math.PI * 2 ) * BEARINGS, rgb = this._rgb;
			for ( let k = 0; k < size * size; k ++ ) {

				const bin = this._bin[ k ], o = k * 4;
				if ( bin < 0 ) {

					img[ o + 3 ] = 0;
					continue;

				}

				const bi = ( Math.floor( this._ang[ k ] + rot ) % BEARINGS + BEARINGS ) % BEARINGS;
				echoColour( P[ bi * BINS + bin ], rgb );
				img[ o ] = rgb[ 0 ];
				img[ o + 1 ] = rgb[ 1 ];
				img[ o + 2 ] = rgb[ 2 ];
				img[ o + 3 ] = 255;

			}

			this.ctx.putImageData( this.image, 0, 0 );
			g.imageSmoothingEnabled = true;
			g.drawImage( this.canvas, cx - R, cy - R, S, S );

		}

		const green = '#5aff5a';
		g.strokeStyle = green;
		g.fillStyle = green;
		// the rings, the bearing scale outside the last, and the heading line
		const [ nm, ring ] = RANGES[ this.range ];
		g.lineWidth = 1;
		g.globalAlpha = 0.8;
		for ( let d = ring; d <= nm + 1e-6; d += ring ) {

			g.beginPath();
			g.arc( cx, cy, R * d / nm, 0, Math.PI * 2 );
			g.stroke();

		}

		for ( let deg = 0; deg < 360; deg += 5 ) {

			const a = ( deg * Math.PI / 180 ) - heading - Math.PI / 2, long = deg % 30 === 0 ? 7 : deg % 10 === 0 ? 4 : 2;
			g.beginPath();
			g.moveTo( cx + Math.cos( a ) * ( R + 1 ), cy + Math.sin( a ) * ( R + 1 ) );
			g.lineTo( cx + Math.cos( a ) * ( R + 1 + long ), cy + Math.sin( a ) * ( R + 1 + long ) );
			g.stroke();

		}

		g.globalAlpha = 1;
		g.beginPath();
		g.moveTo( cx, cy );
		g.lineTo( cx, cy - R );
		g.stroke();
		// the sweep, where the beam is now
		if ( this.beam !== null ) {

			const a = this.beam - heading - Math.PI / 2;
			g.globalAlpha = 0.45;
			g.beginPath();
			g.moveTo( cx, cy );
			g.lineTo( cx + Math.cos( a ) * R, cy + Math.sin( a ) * R );
			g.stroke();
			g.globalAlpha = 1;

		}

		g.beginPath();
		g.arc( cx, cy, 2.5, 0, Math.PI * 2 );
		g.fill();
		// the range, the rings' interval, heading up; her heading
		g.textBaseline = 'top';
		g.textAlign = 'left';
		g.font = '700 22px ui-monospace, monospace';
		g.fillText( `${ nm }NM`, x + 10, y + 8 );
		g.font = '600 15px ui-monospace, monospace';
		g.fillText( `${ ring }`, x + 10, y + 34 );
		g.fillText( 'H UP', x + 10, y + 52 );
		g.textAlign = 'right';
		const hdg = ( ( heading * 180 / Math.PI ) % 360 + 360 ) % 360;
		g.fillText( 'HDG', x + w - 10, y + 10 );
		g.font = '700 18px ui-monospace, monospace';
		g.fillText( `${ hdg.toFixed( 1 ) }°`, x + w - 10, y + 28 );
		g.font = '600 13px ui-monospace, monospace';
		g.textBaseline = 'bottom';
		g.fillText( '← → RANGE', x + w - 10, y + h - 8 );
		g.textAlign = 'left';
		g.fillText( 'GAIN AUTO', x + 10, y + h - 8 );
		g.restore();

	}

}
