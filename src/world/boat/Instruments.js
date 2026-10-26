import * as THREE from '../../engine/index.js';
import { FT, KT } from '../../game/Units.js';

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
//     watched for or warned of (reading.alert), as a plotter with a weather service shows one.
// Redrawn a few times a second while you're aboard; ashore her screens are off and her needles rest.
// Other players' boats show theirs on standby (ins.standby: the same program, a dark glass for its map;
// the readings here are yours). (M12) Riding along in theirs, it shows its skipper's (App.riddenReading),
// and yours is on standby.
//   const ins = new BoatInstruments( { material, tier } );   ins.update( dt, reading )

export const ATLAS = { w: 1024, h: 512 };
// where each is in the atlas (px, y down): the screens 0.31 x 0.21 m, the dials round
export const RECTS = {
	sounder: [ 0, 0, 492, 334 ],
	chart: [ 512, 0, 492, 334 ],
	tach: [ 0, 352, 144, 144 ],
	speed: [ 160, 352, 144, 144 ],
	fuel: [ 320, 352, 144, 144 ],
	temp: [ 480, 352, 144, 144 ],
	volts: [ 640, 352, 144, 144 ],
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
const CHART_M = 640, TRACK_EVERY = 2, TRACK_MAX = 90;
// the minimap's bake (Minimap.js): metres covered, and the world at its (0, 0)
const MAP = { ext: 1280, x0: - 640, z0: - 180 - 640 };
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
export function position( x, z ) {

	const lat = LAT0 - z * DEG_M, lon = LON0 + x * DEG_M / Math.cos( LAT0 * Math.PI / 180 );
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
			for ( let n = 0; n < COLUMNS; n ++ ) this.pings.push( { depth: reading.depth, fish: [] } );
			this.track.length = 0;

		}

		this._on = true;
		// the sounder pings and the plotter lays its track whatever's shown
		if ( ( this._ping -= dt ) <= 0 ) {

			this._ping = PING;
			const fish = [];
			if ( reading.finder && reading.depth > 1 ) for ( let n = 0; n < 3; n ++ ) if ( this._rand() < reading.fish * 0.35 ) fish.push( 0.25 + 0.65 * this._rand() );
			this.pings.push( { depth: reading.depth, fish } );
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
		if ( reading ) {

			this._sounder( reading );
			this._chart( reading );

		} else for ( const name of [ 'sounder', 'chart' ] ) {

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
		let deep = 10 * FT;
		for ( const p of P ) deep = Math.max( deep, p.depth );
		const range = Math.ceil( deep * 1.25 / FT / 10 ) * 10 * FT; // (to the next 10 ft)
		const grad = g.createLinearGradient( 0, top, 0, bottom );
		grad.addColorStop( 0, '#062a5a' );
		grad.addColorStop( 1, '#03142e' );
		g.fillStyle = grad;
		g.fillRect( x, y, w, h );
		const yAt = ( m ) => top + ( bottom - top ) * Math.min( 1, m / range );
		// (the bottom: a strong red return, fading into the sand under it)
		for ( let i = 0; i < P.length; i ++ ) {

			const px = x + w - ( P.length - i ) * col;
			const yb = yAt( P[ i ].depth );
			g.fillStyle = '#e8402a';
			g.fillRect( px, yb, col + 0.5, 4 );
			g.fillStyle = '#b8902a';
			g.fillRect( px, yb + 4, col + 0.5, 5 );
			g.fillStyle = '#5a3a1e';
			g.fillRect( px, yb + 9, col + 0.5, bottom - yb - 9 );
			for ( const f of P[ i ].fish ) {

				// (a fish: an arch, the sound's cone sweeping over it)
				const fy = yAt( P[ i ].depth * f );
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
		g.fillText( reading.depth > 0.3 ? `${ Math.round( reading.depth / FT ) } ft` : '-- ft', x + 10, y + 16 );
		g.font = '600 13px system-ui, sans-serif';
		g.textAlign = 'right';
		g.fillStyle = reading.finder ? '#ffd23a' : 'rgba(220,235,245,0.6)';
		g.fillText( reading.finder ? 'FISH FINDER' : 'DEPTH', x + w - 10, y + 16 );

	}

	// the chart plotter: north up, about her, her track, her heading, speed and position
	_chart( reading ) {

		const g = this.ctx, [ x, y, w, h ] = RECTS.chart;
		const s = w / CHART_M; // px a metre
		g.save();
		g.beginPath();
		g.rect( x, y, w, h );
		g.clip();
		g.fillStyle = '#0b2c48';
		g.fillRect( x, y, w, h );
		const cx = x + w / 2, cy = y + h / 2 + 12;
		if ( reading.chart ) {

			// (the minimap's bake: N px over MAP.ext metres, north up)
			const ppm = reading.chart.width / MAP.ext;
			g.imageSmoothingEnabled = true;
			g.drawImage( reading.chart, cx - ( reading.x - MAP.x0 ) * s, cy - ( reading.z - MAP.z0 ) * s, reading.chart.width / ppm * s, reading.chart.height / ppm * s );

		}

		// her track
		const T = this.track;
		if ( T.length > 1 ) {

			g.strokeStyle = 'rgba(255,255,255,0.7)';
			g.setLineDash( [ 5, 4 ] );
			g.lineWidth = 2;
			g.beginPath();
			T.forEach( ( [ tx, tz ], i ) => {

				const px = cx + ( tx - reading.x ) * s, py = cy + ( tz - reading.z ) * s;
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
		g.strokeStyle = '#ffffff';
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
		// the data bar: her speed and heading, where she is; a scale and north
		g.fillStyle = 'rgba(2,8,14,0.82)';
		g.fillRect( x, y, w, 30 );
		g.fillStyle = '#e8f4ff';
		g.font = '700 16px system-ui, sans-serif';
		g.textAlign = 'left';
		g.textBaseline = 'middle';
		const hdg = ( ( Math.round( reading.heading * 180 / Math.PI ) % 360 ) + 360 ) % 360;
		g.fillText( `SOG ${ ( reading.speed / KT ).toFixed( 1 ) } kt   HDG ${ String( hdg ).padStart( 3, '0' ) }°`, x + 10, y + 16 );
		const [ lat, lon ] = position( reading.x, reading.z );
		g.font = '600 12px system-ui, sans-serif';
		g.textAlign = 'right';
		g.fillText( lat, x + w - 10, y + 9 );
		g.fillText( lon, x + w - 10, y + 22 );
		g.fillStyle = 'rgba(232,244,255,0.85)';
		g.textAlign = 'left';
		g.fillText( 'N ↑', x + 10, y + h - 14 );
		g.fillRect( x + w - 110, y + h - 14, 100, 2 );
		g.textAlign = 'right';
		g.fillText( `${ Math.round( 100 / s / FT ) } ft`, x + w - 10, y + h - 24 );
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
