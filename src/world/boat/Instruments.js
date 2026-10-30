import * as THREE from '../../engine/index.js';
import { FT, KT, gallons } from '../../game/Units.js';
import { SHEETS, HOME, legTo, magnetic, fuelFor } from '../../game/Chart.js';
import { S52, rgb, SHADES } from '../../game/ChartBake.js';

// (M11) The boat's instruments as they read: five gauges about the helm and two screens on the dash,
// drawn into one canvas that the dash's display meshes take their uvs from (RECTS, atlasUV: built in
// Wheelhouse.js, one material, BoatMaterials.display).
//   - The gauges: the tachometer over the wheel (the engine's revs), the speed in knots and the fuel
//     either side of it, the engine's temperature and the battery's volts (they warm and charge as she
//     runs: engineTemp, batteryVolts; the game keeps neither).
//   - The centre screen: the depth sounder every boat has, the bottom under her scrolling by and the
//     depth in feet; with Marta's fish finder, the fish under her too (Game's sonar: how rich the water).
//   - The port screen: a chart plotter, north up: the island's chart (the minimap's, baked once), her
//     track, her speed and heading, where she is; (M13) and a weather alert across it while a hurricane's
//     watched for or warned of (reading.alert), as a plotter with a weather service shows one. (M15) Your chart
//     (Chart.js: the minimap's two sheets as you've charted them, S-52's colours, ChartBake.js) with its
//     soundings and names, your marks and where the fish were; zoomed by steps as a plotter is, out as you go
//     further from the island; her heading magnetic, as her compass; how far home and the fuel for it.
//   - (M15) The compass on the dash top: its card (RECTS.compass, compassBand, drawn here; turned by BoatModel, as
//     a compass's card swings to the north in its bowl).
//   - (M14) The third, to port of the plotter: the radar (reading.radar: Radar.js, heading up, swept with
//     her array turning on the roof).
// Redrawn a few times a second while you're aboard; ashore her screens are off and her needles rest.
// Other players' boats show theirs on standby (ins.standby: the same program, a dark glass for its map;
// the readings here are yours). (M12) Riding along in theirs, it shows its skipper's (App.riddenReading),
// and yours is on standby.
//   const ins = new BoatInstruments( { material, tier } );   ins.update( dt, reading )

export const ATLAS = { w: 1536, h: 512 };
// where each is in the atlas (px, y down): the screens 0.31 x 0.21 m, the dials round
export const RECTS = {
	sounder: [ 0, 0, 492, 334 ],
	chart: [ 512, 0, 492, 334 ],
	radar: [ 1024, 0, 492, 334 ], // ((M14) the third screen)
	tach: [ 0, 352, 144, 144 ],
	speed: [ 160, 352, 144, 144 ],
	fuel: [ 320, 352, 144, 144 ],
	temp: [ 480, 352, 144, 144 ],
	volts: [ 640, 352, 144, 144 ],
	// ((M15) the compass's card: its flat top, its skirt as a strip, its lubbers' paint)
	compass: [ 800, 352, 160, 160 ],
	compassBand: [ 976, 352, 544, 68 ],
	lubber: [ 976, 432, 16, 16 ],
	lubberRed: [ 1000, 432, 16, 16 ],
};
// a rect's uvs ( u0, v0, u1, v1: v up, as the canvas's texture is flipped )
export function atlasUV( name ) {

	const [ x, y, w, h ] = RECTS[ name ];
	return [ x / ATLAS.w, 1 - ( y + h ) / ATLAS.h, ( x + w ) / ATLAS.w, 1 - y / ATLAS.h ];

}

// the dials: what each reads (min, max), its sweep (rad, from its lowest), its marks, its label
const DIALS = {
	tach: { min: 0, max: 40, major: 5, minor: 1, label: 'RPM x100' },
	speed: { min: 0, max: 30, major: 5, minor: 1, label: 'KNOTS' },
	fuel: { min: 0, max: 1, major: 0.25, minor: 0.125, label: 'FUEL', marks: [ 'E', '', '1/2', '', 'F' ] },
	temp: { min: 100, max: 250, major: 50, minor: 10, label: '°F' },
	volts: { min: 8, max: 16, major: 2, minor: 1, label: 'VOLTS' },
};
const SWEEP = Math.PI * 1.5; // the needle's travel, from 225° to -45° (as a car's)
// the engine: its revs at full (the boat's rpm 1), its temperature (°F) as it runs and as it stands,
// how fast it warms and cools (s); the battery standing, charging, and as the starter turns her over
export const ENGINE = { maxRpm: 3600, hot: 178, cold: 84, warm: 70, cool: 400, rest: 12.6, charge: 14.2, cranking: 10.9 };
// the sounder's history: a column every this long (s), this many across; the chart: metres across
// the screen, a track point every this long (s), and the most kept
const PING = 0.25, COLUMNS = 120;
// (M15) how deep the sounder finds the bottom (m): a workboat's 600 W, 50 kHz one, about half what its
// makers claim (the salt and the hull's noise take the rest); deeper it's lost, and shows none
export const SOUNDER_REACH = 1200 * FT;
// the depth the sounder shows (m), or null: no bottom found
const echo = ( depth ) => depth > SOUNDER_REACH ? null : depth;
const CHART_M = 640, TRACK_EVERY = 2, TRACK_MAX = 90;
// ((M15) the plotter's ranges, its screen across (NM), stepped as a plotter's zoom is; it picks the least that
// shows half what the minimap does (reading.view, its radius, m): closer in, as a skipper keeps it)
export const PLOTTER_NM = [ CHART_M / 1852, 0.75, 1.5, 3, 6, 12, 24 ];
export const plotterAcross = ( view ) => ( PLOTTER_NM.find( ( nm ) => nm * 1852 >= view * 1.1 ) ?? PLOTTER_NM[ PLOTTER_NM.length - 1 ] ) * 1852;
// the soundings written black where shallower than this (m: S-52's safety depth, here the 60 ft shade), grey deeper
const SAFETY = SHADES[ 1 ];
// where the island is, for the plotter's position (a made-up spot off the Florida Keys), and degrees
// of latitude in a metre
const LAT0 = 24.5521, LON0 = - 81.7712, DEG_M = 1 / 111320;

// a needle's angle (rad, canvas: 0 to the right, clockwise) for a value on a dial
export function needleAngle( name, v ) {

	const d = DIALS[ name ], t = Math.min( 1, Math.max( 0, ( v - d.min ) / ( d.max - d.min ) ) );
	return Math.PI * 0.75 + t * SWEEP;

}

// the engine's temperature (°F) a moment on: toward its running heat while she runs, back to the air's
// when she stands (slowly)
export function engineTemp( temp, running, dt ) {

	const target = running ? ENGINE.hot : ENGINE.cold, tau = running ? ENGINE.warm : ENGINE.cool;
	return target + ( temp - target ) * Math.exp( - dt / tau );

}

// the battery's volts: charging while she runs, dipping as the starter turns her over, resting else
export function batteryVolts( engine ) {

	return engine === 'running' ? ENGINE.charge : engine === 'cranking' ? ENGINE.cranking : ENGINE.rest;

}

// where she is, as a plotter shows it ( '24°33.126′N', '81°46.272′W' )
// (M13) as degrees, [ lat, lon ] (west negative: the shelter's tracking chart)
export const latLon = ( x, z ) => [ LAT0 - z * DEG_M, LON0 + x * DEG_M / Math.cos( LAT0 * Math.PI / 180 ) ];

export function position( x, z ) {

	const [ lat, lon ] = latLon( x, z );
	const dm = ( v ) => {

		const a = Math.abs( v ), d = Math.floor( a );
		return `${ d }°${ ( ( a - d ) * 60 ).toFixed( 3 ).padStart( 6, '0' ) }′`;

	};
	return [ `${ dm( lat ) }${ lat >= 0 ? 'N' : 'S' }`, `${ dm( lon ) }${ lon >= 0 ? 'E' : 'W' }` ];

}

export class BoatInstruments {

	// material: the dash's display (BoatMaterials.display); tier: the low one draws at half size
	constructor( { material, tier = 'high' } ) {

		const k = this.k = tier === 'low' ? 0.5 : 1;
		const c = this.canvas = document.createElement( 'canvas' );
		c.width = ATLAS.w * k;
		c.height = ATLAS.h * k;
		this.ctx = c.getContext( '2d' );
		this.ctx.scale( k, k );
		const t = this.texture = new THREE.CanvasTexture( c );
		t.colorSpace = THREE.SRGBColorSpace;
		t.anisotropy = 4;
		material.map = t;
		material.color.set( 0xffffff );
		material.needsUpdate = true;
		this.material = material; // ((M12) on the dash of the boat you're aboard: yours, or the one you ride in)
		// (others' boats: their dash dark, as yours is ashore, in the same program as yours)
		const dark = new THREE.DataTexture( new Uint8Array( [ 10, 16, 20, 255 ] ), 1, 1 );
		dark.colorSpace = THREE.SRGBColorSpace;
		dark.needsUpdate = true;
		this.standby = material.clone();
		this.standby.map = dark;
		this.standby.name = 'boatDisplayStandby';
		this.every = tier === 'low' ? 0.25 : 0.15; // s between redraws aboard
		this._t = 0;
		this._on = null;
		this.temp = ENGINE.cold;
		this.needles = { tach: 0, speed: 0, fuel: 0, temp: ENGINE.cold, volts: ENGINE.rest };
		this.pings = []; // { depth, fish: [ fraction of the depth ] }
		this._ping = 0;
		this.track = [];
		this._trackT = 0;
		this._seed = 1;
		this.draw( null );

	}

	// reading: null ashore (her screens off), or { engine ('off' | 'cranking' | 'running' | 'stalled'),
	// rpm (0..1), speed (m/s), heading (rad: 0 north, clockwise), fuel (0..1), depth (m, under her),
	// finder (whether she has one), fish (0..1: how rich the water under her), x, z, chart (the minimap's
	// baked canvas, or null) }
	update( dt, reading ) {

		const running = !! reading && reading.engine === 'running';
		this.temp = engineTemp( this.temp, running, dt );
		if ( ! reading ) {

			if ( this._on !== false ) this.draw( null );
			this._on = false;
			return;

		}

		// (coming aboard: the sounder's screen filled with the bottom under her, a new trip's track)
		if ( this._on !== true ) {

			this.pings.length = 0;
			for ( let n = 0; n < COLUMNS; n ++ ) this.pings.push( { depth: echo( reading.depth ), fish: [] } );
			this.track.length = 0;

		}

		this._on = true;
		// the sounder pings and the plotter lays its track whatever's shown
		if ( ( this._ping -= dt ) <= 0 ) {

			this._ping = PING;
			const fish = [];
			if ( reading.finder && reading.depth > 1 ) for ( let n = 0; n < 3; n ++ ) if ( this._rand() < reading.fish * 0.35 ) fish.push( 0.25 + 0.65 * this._rand() );
			this.pings.push( { depth: echo( reading.depth ), fish } );
			if ( this.pings.length > COLUMNS ) this.pings.shift();

		}

		if ( ( this._trackT -= dt ) <= 0 ) {

			this._trackT = TRACK_EVERY;
			const last = this.track[ this.track.length - 1 ];
			if ( ! last || Math.hypot( last[ 0 ] - reading.x, last[ 1 ] - reading.z ) > 3 ) this.track.push( [ reading.x, reading.z ] );
			if ( this.track.length > TRACK_MAX ) this.track.shift();

		}

		// the needles, as a gauge's own swing lags
		const N = this.needles, q = 1 - Math.exp( - dt * 5 );
		const target = {
			tach: running || reading.engine === 'cranking' ? reading.rpm * ENGINE.maxRpm / 100 + ( reading.engine === 'cranking' ? 2 : 0 ) : 0,
			speed: reading.speed / KT,
			fuel: reading.fuel,
			temp: this.temp,
			volts: batteryVolts( reading.engine ),
		};
		for ( const k in N ) N[ k ] += ( target[ k ] - N[ k ] ) * q;
		this._t -= dt;
		if ( this._t > 0 ) return;
		this._t = this.every;
		this.draw( reading );

	}

	_rand() {

		this._seed = ( this._seed * 16807 ) % 2147483647;
		return this._seed / 2147483647;

	}

	draw( reading ) {

		const g = this.ctx;
		g.fillStyle = '#05080a';
		g.fillRect( 0, 0, ATLAS.w, ATLAS.h );
		for ( const name in DIALS ) this._dial( name, reading );
		this._compassCard( !! reading, reading ? reading.night || 0 : 0 );
		if ( reading ) {

			this._sounder( reading );
			this._chart( reading );
			if ( reading.radar ) reading.radar.draw( g, RECTS.radar, reading );

		}

		for ( const name of reading ? ( reading.radar ? [] : [ 'radar' ] ) : [ 'sounder', 'chart', 'radar' ] ) {

			// (off: a dark glass)
			const [ x, y, w, h ] = RECTS[ name ];
			const grad = g.createLinearGradient( x, y, x + w, y + h );
			grad.addColorStop( 0, '#0b1014' );
			grad.addColorStop( 1, '#030506' );
			g.fillStyle = grad;
			g.fillRect( x, y, w, h );

		}

		this.texture.needsUpdate = true;

	}

	// a gauge: its face (lit while aboard), its marks, its needle
	_dial( name, reading ) {

		const g = this.ctx, d = DIALS[ name ], [ x, y, w ] = RECTS[ name ];
		const cx = x + w / 2, cy = y + w / 2, r = w / 2;
		const lit = !! reading;
		g.save();
		g.beginPath();
		g.arc( cx, cy, r, 0, Math.PI * 2 );
		g.fillStyle = lit ? '#10161b' : '#07090b';
		g.fill();
		g.strokeStyle = lit ? '#e8f0f4' : '#4a5258';
		g.fillStyle = g.strokeStyle;
		g.lineCap = 'round';
		const steps = Math.round( ( d.max - d.min ) / d.minor );
		for ( let i = 0; i <= steps; i ++ ) {

			const v = d.min + i * d.minor, a = needleAngle( name, v ), major = Math.abs( ( v - d.min ) / d.major - Math.round( ( v - d.min ) / d.major ) ) < 1e-6;
			g.lineWidth = major ? 3 : 1.5;
			g.beginPath();
			g.moveTo( cx + Math.cos( a ) * r * ( major ? 0.72 : 0.8 ), cy + Math.sin( a ) * r * ( major ? 0.72 : 0.8 ) );
			g.lineTo( cx + Math.cos( a ) * r * 0.9, cy + Math.sin( a ) * r * 0.9 );
			g.stroke();
			if ( major ) {

				const k = Math.round( ( v - d.min ) / d.major );
				const text = d.marks ? d.marks[ k ] : String( Math.round( v ) );
				g.font = `600 ${ Math.round( r * 0.2 ) }px system-ui, sans-serif`;
				g.textAlign = 'center';
				g.textBaseline = 'middle';
				g.fillText( text, cx + Math.cos( a ) * r * 0.54, cy + Math.sin( a ) * r * 0.54 );

			}

		}

		g.font = `600 ${ Math.round( r * 0.15 ) }px system-ui, sans-serif`;
		g.fillText( d.label, cx, cy + r * 0.42 );
		// the needle, and its boss
		const a = needleAngle( name, lit ? this.needles[ name ] : d.min );
		g.strokeStyle = lit ? '#ff6a2a' : '#6a3a28';
		g.lineWidth = 4;
		g.beginPath();
		g.moveTo( cx - Math.cos( a ) * r * 0.12, cy - Math.sin( a ) * r * 0.12 );
		g.lineTo( cx + Math.cos( a ) * r * 0.82, cy + Math.sin( a ) * r * 0.82 );
		g.stroke();
		g.beginPath();
		g.arc( cx, cy, r * 0.08, 0, Math.PI * 2 );
		g.fillStyle = '#2a3036';
		g.fill();
		g.restore();

	}

	// the depth sounder (and the fish finder): the bottom's echo scrolling right to left, the depth
	_sounder( reading ) {

		const g = this.ctx, [ x, y, w, h ] = RECTS.sounder;
		const P = this.pings, top = y + 30, bottom = y + h - 6, col = w / COLUMNS;
		// ((M15) with no bottom found, its whole reach)
		let deep = 10 * FT, found = false;
		for ( const p of P ) if ( p.depth !== null ) {

			deep = Math.max( deep, p.depth );
			found = true;

		}

		if ( ! found ) deep = SOUNDER_REACH / 1.25;
		const range = Math.ceil( deep * 1.25 / FT / 10 ) * 10 * FT; // (to the next 10 ft)
		const grad = g.createLinearGradient( 0, top, 0, bottom );
		grad.addColorStop( 0, '#062a5a' );
		grad.addColorStop( 1, '#03142e' );
		g.fillStyle = grad;
		g.fillRect( x, y, w, h );
		const yAt = ( m ) => top + ( bottom - top ) * Math.min( 1, m / range );
		// (the bottom: a strong red return, fading into the sand under it)
		for ( let i = 0; i < P.length; i ++ ) {

			const px = x + w - ( P.length - i ) * col, d = P[ i ].depth;
			// ((M15) past its reach, no bottom: only the fish it finds on the way down)
			if ( d !== null ) {

				const yb = yAt( d );
				g.fillStyle = '#e8402a';
				g.fillRect( px, yb, col + 0.5, 4 );
				g.fillStyle = '#b8902a';
				g.fillRect( px, yb + 4, col + 0.5, 5 );
				g.fillStyle = '#5a3a1e';
				g.fillRect( px, yb + 9, col + 0.5, bottom - yb - 9 );

			}

			for ( const f of P[ i ].fish ) {

				// (a fish: an arch, the sound's cone sweeping over it)
				const fy = yAt( ( d ?? range ) * f );
				g.strokeStyle = '#ffd23a';
				g.lineWidth = 2.5;
				g.beginPath();
				g.arc( px + col / 2, fy + 4, 6, Math.PI * 1.15, Math.PI * 1.85 );
				g.stroke();

			}

		}

		// the depth scale, and the reading
		g.fillStyle = 'rgba(220,235,245,0.75)';
		g.font = '600 14px system-ui, sans-serif';
		g.textAlign = 'right';
		g.textBaseline = 'middle';
		for ( const f of [ 0, 0.5, 1 ] ) g.fillText( `${ Math.round( range * f / FT ) }`, x + w - 6, Math.min( bottom - 8, Math.max( top + 8, yAt( range * f ) ) ) );
		g.fillStyle = '#02070e';
		g.fillRect( x, y, w, 30 );
		g.fillStyle = '#e8f4ff';
		g.textAlign = 'left';
		g.font = '700 22px system-ui, sans-serif';
		g.fillText( reading.depth > 0.3 && echo( reading.depth ) !== null ? `${ Math.round( reading.depth / FT ) } ft` : '-- ft', x + 10, y + 16 );
		g.font = '600 13px system-ui, sans-serif';
		g.textAlign = 'right';
		g.fillStyle = reading.finder ? '#ffd23a' : 'rgba(220,235,245,0.6)';
		g.fillText( reading.finder ? 'FISH FINDER' : 'DEPTH', x + w - 10, y + 16 );

	}

	// (M15) the compass's card, a CombiDial's, after a Ritchie Helmsman's as photographed: black, white. Its flat top: a
	// mark every 5° about its rim, a serif N, the other points inside it, read from over it. Its skirt, a strip that
	// wraps it: a mark every 5° along its foot and the figures every 30° over them, 360 at its left and 0 at its right
	// (Wheelhouse.compassCardGeometry). Lit while you're aboard, green after dark as its lamp is
	_compassCard( lit, night = 0 ) {

		const g = this.ctx, [ x, y, w ] = RECTS.compass, cx = x + w / 2, cy = y + w / 2, r = w / 2;
		const channel = ( a, b ) => Math.round( a + ( b - a ) * night );
		const ink = lit ? `rgb(${ channel( 244, 96 ) },${ channel( 242, 255 ) },${ channel( 234, 140 ) })` : '#9a9890';
		const ground = lit ? '#0d0f10' : '#08090a';
		g.save();
		g.fillStyle = '#05080a';
		g.fillRect( x, y, w, w );
		g.beginPath();
		g.arc( cx, cy, r, 0, Math.PI * 2 );
		g.fillStyle = ground;
		g.fill();
		g.strokeStyle = g.fillStyle = ink;
		for ( let d = 0; d < 360; d += 5 ) {

			const a = ( d - 90 ) * Math.PI / 180, long = d % 10 === 0;
			g.lineWidth = d % 30 === 0 ? 2.6 : 1.5;
			g.beginPath();
			g.moveTo( cx + Math.cos( a ) * r * ( long ? 0.86 : 0.9 ), cy + Math.sin( a ) * r * ( long ? 0.86 : 0.9 ) );
			g.lineTo( cx + Math.cos( a ) * r * 0.98, cy + Math.sin( a ) * r * 0.98 );
			g.stroke();

		}

		g.textAlign = 'center';
		g.textBaseline = 'middle';
		for ( const [ d, text, big ] of [ [ 0, 'N', 1 ], [ 45, 'NE', 0 ], [ 90, 'E', 1 ], [ 135, 'SE', 0 ], [ 180, 'S', 1 ], [ 225, 'SW', 0 ], [ 270, 'W', 1 ], [ 315, 'NW', 0 ] ] ) {

			g.save();
			g.translate( cx, cy );
			g.rotate( d * Math.PI / 180 );
			g.font = big ? `700 ${ Math.round( r * ( d === 0 ? 0.34 : 0.28 ) ) }px Georgia, 'Times New Roman', serif` : `600 ${ Math.round( r * 0.17 ) }px Georgia, 'Times New Roman', serif`;
			g.fillText( text, 0, - r * ( big ? 0.62 : 0.66 ) );
			g.restore();

		}

		// (its column, seen under the dome)
		g.beginPath();
		g.arc( cx, cy, r * 0.2, 0, Math.PI * 2 );
		g.fillStyle = '#17191b';
		g.fill();
		// the skirt
		const [ sx, sy, sw, sh ] = RECTS.compassBand;
		g.fillStyle = ground;
		g.fillRect( sx, sy, sw, sh );
		g.beginPath();
		g.rect( sx, sy, sw, sh );
		g.clip();
		g.strokeStyle = g.fillStyle = ink;
		for ( let d = 0; d <= 360; d += 5 ) {

			const px = sx + sw * ( 1 - d / 360 ), major = d % 30 === 0, ten = d % 10 === 0;
			g.lineWidth = major ? 2.4 : 1.4;
			g.beginPath();
			g.moveTo( px, sy + sh - ( major ? 15 : ten ? 12 : 8 ) );
			g.lineTo( px, sy + sh );
			g.stroke();
			if ( ! major ) continue;
			// (a strip, wider than it's tall on the card: its figures narrowed to their shape there)
			g.save();
			g.translate( px, sy + sh * 0.38 );
			g.scale( 0.46, 1 );
			g.font = '600 38px system-ui, sans-serif';
			g.fillText( String( d % 360 ), 0, 0 );
			g.restore();

		}

		g.restore();
		// the lubbers' paint
		const paint = ( name, c ) => {

			const [ px, py, pw, ph ] = RECTS[ name ];
			g.fillStyle = c;
			g.fillRect( px, py, pw, ph );

		};
		paint( 'lubber', lit ? '#f2d21e' : '#6e6012' );
		paint( 'lubberRed', lit ? '#e8341f' : '#6a1c12' );

	}

	// the chart plotter: north up, about her, her track, her heading, speed and position; (M15) your chart, its
	// soundings and names, your marks, where the fish were, home and the fuel for it
	_chart( reading ) {

		const g = this.ctx, [ x, y, w, h ] = RECTS.chart;
		const across = plotterAcross( reading.view || 0 ), s = w / across; // px a metre
		const rx = reading.x, rz = reading.z;
		g.save();
		g.beginPath();
		g.rect( x, y, w, h );
		g.clip();
		g.fillStyle = rgb( S52.NODTA );
		g.fillRect( x, y, w, h );
		const cx = x + w / 2, cy = y + h / 2 + 12;
		const sx = ( wx ) => cx + ( wx - rx ) * s, sy = ( wz ) => cy + ( wz - rz ) * s;
		const map = reading.chart, log = reading.log;
		if ( map && map.sheets ) {

			g.imageSmoothingEnabled = true;
			// (the sheets, coarsest first, from the finest that covers the screen)
			const covers = ( sp ) => sx( sp.x0 ) <= x && sy( sp.z0 ) <= y && sx( sp.x0 + sp.ext ) >= x + w && sy( sp.z0 + sp.ext ) >= y + h;
			const S = map.sheets, list = [ S.far, S.mid, S.near ];
			const from = covers( S.near.spec ) ? 2 : covers( S.mid.spec ) ? 1 : 0;
			for ( const sh of list.slice( from ) ) if ( sh.drawn >= 0 ) {

				const sp = sh.spec;
				g.drawImage( sh.view, sx( sp.x0 ), sy( sp.z0 ), sp.ext * s, sp.ext * s );

			}

		}

		if ( map && map.soundings && log ) {

			// soundings, in feet, those charted that fit: the finest sheet's first (the island's close in, then its
			// waters', then the far grounds'), the others' only where they leave room
			const lists = [ across < 1500 && map.soundings.near, across < 12000 && map.soundings.mid, map.soundings.far ];
			const drawn = [];
			g.font = '500 11px system-ui, sans-serif';
			g.textAlign = 'center';
			g.textBaseline = 'middle';
			for ( const list of lists ) if ( list ) for ( const p of list ) {

				const px = sx( p.x ), py = sy( p.z );
				if ( px < x + 8 || px > x + w - 8 || py < y + 34 || py > y + h - 28 ) continue;
				// (none closer to another than a sounding's width, as a chart spaces them)
				if ( drawn.some( ( [ qx, qy ] ) => Math.abs( qx - px ) < 34 && Math.abs( qy - py ) < 18 ) || ! log.seen( p.x, p.z ) ) continue;
				drawn.push( [ px, py ] );
				g.fillStyle = rgb( p.d < SAFETY ? S52.SNDG2 : S52.SNDG1 );
				g.fillText( String( Math.round( p.d / FT ) ), px, py );

			}

		}

		// the names you've come to, upright: the water's in italics, a light's characteristic under it in magenta
		if ( log ) {

			// (the bigger names first; one that would sit on another left off)
			const boxes = [];
			for ( const n of [ ...( reading.names || [] ) ].sort( ( a, b ) => ( a.small ? 1 : 0 ) - ( b.small ? 1 : 0 ) ) ) {

				const far = !! n.place || n.id === 'sandbar', fits = far || ( n.small ? across < 1500 : across < 7000 );
				if ( ! fits || ! log.named( n.id ) ) continue;
				const px = sx( n.x ), py = sy( n.z );
				if ( px < x - 60 || px > x + w + 60 || py < y + 30 || py > y + h ) continue;
				g.textAlign = 'center';
				g.textBaseline = 'middle';
				g.font = `${ n.water ? 'italic 500' : '600' } ${ n.small ? 12 : 14 }px system-ui, sans-serif`;
				const half = g.measureText( n.peak ? `▲ ${ n.name }` : n.name ).width / 2 + 3, tall = n.light ? 22 : 10;
				if ( boxes.some( ( b ) => Math.abs( b.x - px ) < b.half + half && py - 9 < b.y + b.tall && py + tall > b.y - 9 ) ) continue;
				boxes.push( { x: px, y: py, half, tall } );
				g.lineWidth = 3;
				g.strokeStyle = 'rgba(255,255,255,0.75)';
				const text = n.peak ? `▲ ${ n.name }` : n.name;
				g.strokeText( text, px, py );
				g.fillStyle = rgb( S52.CHBLK );
				g.fillText( text, px, py );
				if ( n.light ) {

					g.font = '600 11px system-ui, sans-serif';
					g.fillStyle = rgb( S52.CHMGD );
					g.fillText( n.light, px, py + 13 );

				}

			}

			// where the fish were: a plotter's fish mark at each catch
			for ( const f of log.spots ) {

				const px = sx( f.x ), py = sy( f.z );
				if ( px < x || px > x + w || py < y + 30 || py > y + h ) continue;
				g.save();
				g.translate( px, py );
				g.fillStyle = '#1d5b8f';
				g.strokeStyle = '#ffffff';
				g.lineWidth = 1.5;
				g.beginPath();
				g.ellipse( - 1, 0, 6, 3.4, 0, 0, Math.PI * 2 );
				g.moveTo( 4, 0 );
				g.lineTo( 9, - 4 );
				g.lineTo( 9, 4 );
				g.closePath();
				g.stroke();
				g.fill();
				g.restore();

			}

			// your marks: a waypoint's red diamond and its number
			g.font = '700 12px system-ui, sans-serif';
			g.textAlign = 'left';
			for ( const m of log.marks ) {

				const px = sx( m.x ), py = sy( m.z );
				if ( px < x || px > x + w || py < y + 30 || py > y + h ) continue;
				g.beginPath();
				g.moveTo( px, py - 7 );
				g.lineTo( px + 7, py );
				g.lineTo( px, py + 7 );
				g.lineTo( px - 7, py );
				g.closePath();
				g.fillStyle = '#d6303a';
				g.strokeStyle = '#ffffff';
				g.lineWidth = 1.5;
				g.fill();
				g.stroke();
				g.lineWidth = 3;
				g.strokeStyle = 'rgba(255,255,255,0.8)';
				const label = String( m.id ).padStart( 3, '0' );
				g.strokeText( label, px + 10, py );
				g.fillStyle = rgb( S52.CHBLK );
				g.fillText( label, px + 10, py );

			}

		}

		// her track
		const T = this.track;
		if ( T.length > 1 ) {

			g.strokeStyle = 'rgba(30,30,30,0.75)';
			g.setLineDash( [ 5, 4 ] );
			g.lineWidth = 2;
			g.beginPath();
			T.forEach( ( [ tx, tz ], i ) => {

				const px = sx( tx ), py = sy( tz );
				if ( i ) g.lineTo( px, py ); else g.moveTo( px, py );

			} );
			g.lineTo( cx, cy );
			g.stroke();
			g.setLineDash( [] );

		}

		// her, pointing where she heads
		g.translate( cx, cy );
		g.rotate( reading.heading );
		g.fillStyle = '#ff6a2a';
		g.strokeStyle = '#1a1a1a';
		g.lineWidth = 2;
		g.beginPath();
		g.moveTo( 0, - 12 );
		g.lineTo( 8, 9 );
		g.lineTo( 0, 4 );
		g.lineTo( - 8, 9 );
		g.closePath();
		g.fill();
		g.stroke();
		g.restore();
		// the data bar: her speed and heading (magnetic, as her compass), where she is; a scale and north
		g.fillStyle = 'rgba(2,8,14,0.82)';
		g.fillRect( x, y, w, 30 );
		g.fillStyle = '#e8f4ff';
		g.font = '700 16px system-ui, sans-serif';
		g.textAlign = 'left';
		g.textBaseline = 'middle';
		g.fillText( `SOG ${ ( reading.speed / KT ).toFixed( 1 ) } kt   HDG ${ String( magnetic( reading.heading ) ).padStart( 3, '0' ) }°M`, x + 10, y + 16 );
		const [ lat, lon ] = position( reading.x, reading.z );
		g.font = '600 12px system-ui, sans-serif';
		g.textAlign = 'right';
		g.fillText( lat, x + w - 10, y + 9 );
		g.fillText( lon, x + w - 10, y + 22 );
		// ((M15) home: how far and which way, and the fuel for it, along the foot)
		g.fillStyle = 'rgba(2,8,14,0.82)';
		g.fillRect( x, y + h - 24, w, 24 );
		const leg = legTo( rx, rz, HOME.x, HOME.z );
		g.font = '700 13px system-ui, sans-serif';
		g.textAlign = 'left';
		g.fillStyle = '#e8f4ff';
		g.fillText( `HOME ${ leg.m < 0.2 * 1852 ? `${ Math.round( leg.m / FT ) } ft` : `${ ( leg.m / 1852 ).toFixed( 1 ) } NM` } ${ String( magnetic( leg.bearing ) ).padStart( 3, '0' ) }°M`, x + 10, y + h - 12 );
		if ( Number.isFinite( reading.fuelL ) ) {

			const f = fuelFor( leg.m, reading.fuelL, { rpm: reading.rpm, speed: reading.speed, speedMul: reading.speedMul || 1 } );
			g.textAlign = 'right';
			g.fillStyle = f.state === 'ok' ? '#8fdc8a' : f.state === 'tight' ? '#f2c14e' : '#ff7a6a';
			g.fillText( `FUEL ${ gallons( reading.fuelL ) } gal · ${ gallons( f.litres ) } to get home${ f.state === 'short' ? ' · SHORT' : '' }`, x + w - 10, y + h - 12 );

		}

		g.fillStyle = 'rgba(16,20,22,0.85)';
		g.textAlign = 'left';
		g.font = '700 12px system-ui, sans-serif';
		g.fillText( 'N ↑', x + 10, y + h - 38 );
		// (a scale bar a round length, about a fifth of the screen)
		const bar = niceLength( across / 5 ), bw = bar * s;
		g.fillRect( x + w - 10 - bw, y + h - 34, bw, 2 );
		g.textAlign = 'right';
		g.fillText( bar < 0.2 * 1852 ? `${ Math.round( bar / FT ) } ft` : `${ +( bar / 1852 ).toFixed( 2 ) } NM`, x + w - 10, y + h - 44 );
		// ((M13) the weather alert under the data bar, flashing for a warning)
		if ( reading.alert ) {

			const warn = /WARNING/.test( reading.alert ), on = ! warn || ( Date.now() % 1600 ) < 1100;
			g.fillStyle = warn ? ( on ? '#c8202c' : '#5a0f16' ) : '#c98a12';
			g.fillRect( x, y + 30, w, 24 );
			g.fillStyle = '#ffffff';
			g.font = '800 14px system-ui, sans-serif';
			g.textAlign = 'center';
			g.fillText( reading.alert, x + w / 2, y + 43 );

		}

	}

}

// (M15) a scale bar's length (m): the roundest under `m`, in feet close in (100, 200, 500 ft), else in nautical
// miles (0.25, 0.5, 1, 2, 5 …)
export function niceLength( m ) {

	const ft = [ 50, 100, 200, 500 ].map( ( f ) => f * FT ), nm = [ 0.25, 0.5, 1, 2, 5, 10 ].map( ( n ) => n * 1852 );
	let best = ft[ 0 ];
	for ( const v of [ ...ft, ...nm ] ) if ( v <= m ) best = v;
	return best;

}
