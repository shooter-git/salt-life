import { WORLD } from '../world/WorldLayout.js';
import { SEABED } from '../world/terrain/SeabedModel.js';
import { CAMP } from './FishCamp.js';
import { HARBOUR_LIGHTS } from '../world/HarbourLights.js';
import { LIGHTHOUSE } from '../world/Lighthouse.js';
import { CAVES } from '../world/terrain/SeaCaves.js';
import { fuelBurn } from './Gear.js';

// (M15) The chart you fill in: what you've seen of the island and the far grounds, the names you've come to,
// your own marks and where the fish were. Kept in the save (GameState's chart). The minimap and the boat's
// plotter draw it (ChartBake.js the sheets, Minimap.js, world/boat/Instruments.js).
//   - Three sheets: the island's (2.3 km about it, its coast and the water off it, 8 m cells), its waters' (8 km
//     about it, out past the drop-off, 32 m cells) and the far grounds' (the offshore seabed's 32 km, 128 m cells). Each cell's seen or
//     not; the bay's known from the start (KNOWN).
//   - What you see as you go (`look( x, z, r )`): about you, further from high ground and from the sea.
//   - Names (NAMES): the bays, points, beaches and the far grounds, each learned as you come to it (near
//     enough, or over its water: Places.js's place under you). Marta's chart (Gear's `chart`) has the
//     island's sheet, its waters to SOLD and its names.
//   - Your marks (`mark`, `unmark`), and every catch's spot (`caught`): the places that fish differently
//     marked at the first fish you had there, the plotter's fish where they were.
//   const c = new ChartLog();  c.look( x, z, 300 );  c.learn( x, z, place );  c.mark( x, z, day );  c.toJSON()

// the sheets: where each starts (m), how far it reaches, its cells (m); the island's is the minimap's bake
export const SHEETS = {
	near: { x0: - 1152, z0: - 300 - 1152, ext: 2304, cell: 8 },
	mid: { x0: SEABED.centre.x - 4096, z0: SEABED.centre.z - 4096, ext: 8192, cell: 32 },
	far: { x0: - SEABED.size / 2, z0: - SEABED.size / 2, ext: SEABED.size, cell: 128 },
};
for ( const s of Object.values( SHEETS ) ) s.n = s.ext / s.cell;
// what's known from the start: the bay, its beach and headlands, the village behind it (x0, z0, x1, z1)
export const KNOWN = [ - 340, - 260, 340, 340 ];
// Marta's chart: the island's sheet, and the far sheet within this of the island's middle (its shelf, to the
// drop-off: the far grounds past it are yours to find)
export const SOLD = { r: 2600 };
// how far you see to chart it (m): on foot, more from high ground (a metre more for each metre up, to the most);
// at sea; swimming
export const SIGHT = { foot: 140, perM: 1, footMax: 650, sea: 320, swim: 70 };
// where home is (the boat's berth by the pier) and the compass's variation there: 6.3° W (NOAA's World
// Magnetic Model for the island's spot, October 2026; 0.09° more west a year)
export const HOME = { x: WORLD.boatDock.position.x, z: WORLD.boatDock.position.z };
export const VARIATION = - 6.3 * Math.PI / 180; // rad, west negative: magnetic = true - variation
// your marks: the most kept; the catches kept for the plotter's fish
export const MAX_MARKS = 40, MAX_SPOTS = 80;

// The names on the chart: x, z where it's written; learned within `r` of (x, z) (about as far as you see it from
// the sea, SIGHT) or over `place`'s water;
// `water`: written in italics, as a chart names water; `island`: on Marta's chart; `known`: from the start;
// `light`: a light's characteristic under it (as a chart gives it)
const lh = LIGHTHOUSE, east = HARBOUR_LIGHTS[ 0 ], west = HARBOUR_LIGHTS[ 1 ], pier = HARBOUR_LIGHTS[ 2 ];
export const NAMES = [
	{ id: 'bay', name: 'The Bay', x: 10, z: 110, water: true, island: true, known: true },
	{ id: 'eastPoint', name: 'East Point', x: east.x + 40, z: east.z + 30, island: true, known: true, light: 'Fl R 4s' },
	{ id: 'westPoint', name: 'West Point', x: west.x - 40, z: west.z + 30, island: true, known: true, light: 'Fl G 4s' },
	{ id: 'pier', name: 'Pier', x: pier.x - 34, z: pier.z + 14, island: true, known: true, light: 'Iso 4s', small: true },
	{ id: 'summit', name: '992', x: - 24, z: - 492, island: true, known: true, peak: true }, // (302 m: in feet, as the chart's heights)
	{ id: 'creek', name: 'Mangrove Creek', x: - 470, z: - 150, r: 280, water: true, island: true },
	{ id: 'westCave', name: 'Sea Cave', x: CAVES[ 0 ].x - 50, z: CAVES[ 0 ].z, r: 220, island: true, small: true },
	{ id: 'nwCave', name: 'Sea Cave', x: CAVES[ 1 ].x - 20, z: CAVES[ 1 ].z - 50, r: 220, island: true, small: true },
	{ id: 'lighthouse', name: 'Lighthouse Point', x: lh.x + 10, z: lh.z + 70, r: 340, island: true, light: 'Fl 10s' },
	{ id: 'windReef', name: 'Windward Reef', x: - 455, z: - 900, r: 340, water: true, island: true },
	{ id: 'wreck', name: 'Wreck', x: - 520, z: - 845, r: 240, island: true, small: true },
	{ id: 'northBeach', name: 'North Beach', x: 195, z: - 790, r: 340, island: true },
	{ id: 'camp', name: 'Fish Camp', x: CAMP.jetty.x - 75, z: CAMP.jetty.z1 + 5, r: 300, island: true, small: true },
	{ id: 'canyon', name: 'Canyon', x: 90, z: 1800, r: 700, water: true, island: true },
	{ id: 'ledge', name: 'North Ledge', x: 0, z: - 2550, place: 'ledge', water: true },
	{ id: 'hump', name: 'The Hump', x: SEABED.hump[ 0 ][ 0 ], z: SEABED.hump[ 0 ][ 1 ] - 500, place: 'hump', water: true },
	{ id: 'bank', name: 'The Bank', x: SEABED.bank.x, z: SEABED.bank.z, place: 'bank', water: true },
	{ id: 'sandbar', name: 'Sandbar', x: SEABED.bank.x + 400, z: SEABED.bank.z + 1300, r: 900, water: true, small: true },
];
export const NAME = Object.fromEntries( NAMES.map( ( n ) => [ n.id, n ] ) );

// ---- a sheet's cells: seen (1) or not (0), row by row from its (x0, z0)
export class Sheet {

	constructor( spec ) {

		this.spec = spec;
		this.cells = new Uint8Array( spec.n * spec.n );
		this.v = 0; // up one at every change (its picture drawn again)

	}

	// the cell ( x, z ) is in, or -1 off the sheet
	index( x, z ) {

		const s = this.spec, i = Math.floor( ( x - s.x0 ) / s.cell ), j = Math.floor( ( z - s.z0 ) / s.cell );
		return i < 0 || j < 0 || i >= s.n || j >= s.n ? - 1 : j * s.n + i;

	}

	seen( x, z ) {

		const k = this.index( x, z );
		return k >= 0 && this.cells[ k ] === 1;

	}

	// every cell whose middle is within r of ( x, z ) seen; -> how many weren't
	see( x, z, r ) {

		const s = this.spec, c = s.cell, n = s.n;
		const i0 = Math.max( 0, Math.floor( ( x - r - s.x0 ) / c ) ), i1 = Math.min( n - 1, Math.floor( ( x + r - s.x0 ) / c ) );
		const j0 = Math.max( 0, Math.floor( ( z - r - s.z0 ) / c ) ), j1 = Math.min( n - 1, Math.floor( ( z + r - s.z0 ) / c ) );
		let added = 0;
		for ( let j = j0; j <= j1; j ++ ) {

			const dz = s.z0 + ( j + 0.5 ) * c - z;
			for ( let i = i0; i <= i1; i ++ ) {

				const dx = s.x0 + ( i + 0.5 ) * c - x, k = j * n + i;
				if ( this.cells[ k ] === 0 && dx * dx + dz * dz <= r * r ) {

					this.cells[ k ] = 1;
					added ++;

				}

			}

		}

		if ( added ) this.v ++;
		return added;

	}

	// the cells in a rectangle seen (x0, z0, x1, z1)
	seeRect( x0, z0, x1, z1 ) {

		const s = this.spec;
		for ( let j = 0; j < s.n; j ++ ) for ( let i = 0; i < s.n; i ++ ) {

			const x = s.x0 + ( i + 0.5 ) * s.cell, z = s.z0 + ( j + 0.5 ) * s.cell;
			if ( x >= x0 && x <= x1 && z >= z0 && z <= z1 ) this.cells[ j * s.n + i ] = 1;

		}

		this.v ++;

	}

	count() {

		let n = 0;
		for ( const v of this.cells ) n += v;
		return n;

	}

	// as runs, row by row, seen and not by turns (the first not seen), in base 36: '0,3k,2,…' (a few hundred
	// bytes where it's a few blobs)
	encode() {

		const out = [];
		let v = 0, run = 0;
		for ( const c of this.cells ) {

			if ( c === v ) run ++;
			else {

				out.push( run.toString( 36 ) );
				v = c;
				run = 1;

			}

		}

		out.push( run.toString( 36 ) );
		return out.join( ',' );

	}

	decode( text ) {

		if ( typeof text !== 'string' ) return false;
		const runs = text.split( ',' ).map( ( r ) => parseInt( r, 36 ) );
		if ( runs.some( ( r ) => ! Number.isInteger( r ) || r < 0 ) || runs.reduce( ( a, r ) => a + r, 0 ) !== this.cells.length ) return false;
		let k = 0, v = 0;
		for ( const r of runs ) {

			this.cells.fill( v, k, k + r );
			k += r;
			v ^= 1;

		}

		this.v ++;
		return true;

	}

}

// ---- the chart as you've filled it in
export class ChartLog {

	constructor() {

		this.near = new Sheet( SHEETS.near );
		this.mid = new Sheet( SHEETS.mid );
		this.far = new Sheet( SHEETS.far );
		this.names = new Set();
		this.marks = []; // { id, x, z, day }
		this.spots = []; // { x, z, s (species), p (place), d (day) }: the catches, oldest first
		this.firsts = {}; // place -> { x, z }: where your first fish there was
		this.bought = false; // Marta's chart (GameState sets it from the upgrades)
		this.version = 0; // up one at every change: the sheets drawn again
		this._nextMark = 1;
		this.reset();

	}

	reset() {

		for ( const s of [ this.near, this.mid, this.far ] ) {

			s.cells.fill( 0 );
			s.v ++;

		}

		this.near.seeRect( ...KNOWN );
		this.mid.seeRect( ...KNOWN );
		this.names = new Set( NAMES.filter( ( n ) => n.known ).map( ( n ) => n.id ) );
		this.marks = [];
		this.spots = [];
		this.firsts = {};
		this._nextMark = 1;
		this.version ++;

	}

	// a sheet's cell k on your chart (yours, or on Marta's)
	charted( sheet, k ) {

		if ( sheet.cells[ k ] === 1 ) return true;
		if ( ! this.bought ) return false;
		if ( sheet === this.near ) return true;
		const s = sheet.spec, x = s.x0 + ( ( k % s.n ) + 0.5 ) * s.cell, z = s.z0 + ( Math.floor( k / s.n ) + 0.5 ) * s.cell;
		return Math.hypot( x - SEABED.centre.x, z - SEABED.centre.z ) < SOLD.r;

	}

	// is ( x, z ) on your chart? (the finest sheet that reaches it)
	seen( x, z ) {

		const k = this.near.index( x, z );
		if ( k >= 0 ) return this.bought || this.near.cells[ k ] === 1;
		const sold = this.bought && Math.hypot( x - SEABED.centre.x, z - SEABED.centre.z ) < SOLD.r;
		const m = this.mid.index( x, z );
		if ( m >= 0 ) return sold || this.mid.cells[ m ] === 1;
		return sold || this.far.seen( x, z );

	}

	// seen about ( x, z ) out to r (m): every sheet; -> whether anything new was
	look( x, z, r ) {

		const n = this.near.see( x, z, r ) + this.mid.see( x, z, r ) + this.far.see( x, z, r );
		if ( n ) this.version ++;
		return n > 0;

	}

	// the names you come to at ( x, z ), over `place`'s water: -> those new to you
	learn( x, z, place = null ) {

		const out = [];
		for ( const n of NAMES ) {

			if ( this.names.has( n.id ) ) continue;
			if ( n.place ? n.place === place : Math.hypot( x - n.x, z - n.z ) < n.r ) {

				this.names.add( n.id );
				out.push( n );

			}

		}

		if ( out.length ) this.version ++;
		return out;

	}

	// a name's on your chart: learned, or on Marta's
	named( id ) {

		return this.names.has( id ) || ( this.bought && !! NAME[ id ] && NAME[ id ].island );

	}

	// a mark of your own at ( x, z ): -> it, or null with as many as are kept
	mark( x, z, day = null ) {

		if ( this.marks.length >= MAX_MARKS ) return null;
		const m = { id: this._nextMark ++, x: Math.round( x ), z: Math.round( z ), day };
		this.marks.push( m );
		this.version ++;
		return m;

	}

	unmark( id ) {

		const n = this.marks.length;
		this.marks = this.marks.filter( ( m ) => m.id !== id );
		if ( this.marks.length === n ) return false;
		this.version ++;
		return true;

	}

	// a fish caught at ( x, z ), at `place` (Places.js): -> true when it's your first there (marked)
	caught( species, place, x, z, day = null ) {

		this.spots.push( { x: Math.round( x ), z: Math.round( z ), s: species, p: place, d: day } );
		if ( this.spots.length > MAX_SPOTS ) this.spots.shift();
		const first = !! place && ! this.firsts[ place ];
		if ( first ) this.firsts[ place ] = { x: Math.round( x ), z: Math.round( z ) };
		this.version ++;
		return first;

	}

	toJSON() {

		return { near: this.near.encode(), mid: this.mid.encode(), far: this.far.encode(), names: [ ...this.names ], marks: this.marks, spots: this.spots, firsts: this.firsts };

	}

	// a saved chart; one from before (none) has the bay alone
	fromJSON( d ) {

		this.reset();
		if ( ! d || typeof d !== 'object' ) return false;
		if ( ! this.near.decode( d.near ) ) this.near.seeRect( ...KNOWN );
		if ( ! this.mid.decode( d.mid ) ) this.mid.seeRect( ...KNOWN );
		this.far.decode( d.far );
		for ( const id of Array.isArray( d.names ) ? d.names : [] ) if ( NAME[ id ] ) this.names.add( id );
		const num = ( v ) => Number.isFinite( v ) ? v : null;
		this.marks = ( Array.isArray( d.marks ) ? d.marks : [] ).filter( ( m ) => m && Number.isInteger( m.id ) && Number.isFinite( m.x ) && Number.isFinite( m.z ) ).slice( - MAX_MARKS ).map( ( m ) => ( { id: m.id, x: m.x, z: m.z, day: num( m.day ) } ) );
		this._nextMark = Math.max( 1, ...this.marks.map( ( m ) => m.id + 1 ) );
		this.spots = ( Array.isArray( d.spots ) ? d.spots : [] ).filter( ( s ) => s && Number.isFinite( s.x ) && Number.isFinite( s.z ) && typeof s.s === 'string' ).slice( - MAX_SPOTS ).map( ( s ) => ( { x: s.x, z: s.z, s: s.s, p: typeof s.p === 'string' ? s.p : null, d: num( s.d ) } ) );
		for ( const [ k, v ] of Object.entries( d.firsts && typeof d.firsts === 'object' ? d.firsts : {} ) ) if ( v && Number.isFinite( v.x ) && Number.isFinite( v.z ) ) this.firsts[ k ] = { x: v.x, z: v.z };
		this.version ++;
		return true;

	}

}

// how far you see to chart it from ( mode: the player's ), your eye `up` metres over the sea
export function sightOf( mode, up = 0 ) {

	if ( mode === 'boat' || mode === 'deck' ) return SIGHT.sea;
	if ( mode === 'swim' ) return SIGHT.swim;
	return Math.min( SIGHT.footMax, SIGHT.foot + Math.max( 0, up ) * SIGHT.perM );

}

// ---- finding your way: a bearing (rad, clockwise from true north) and distance (m) from ( x, z ) to ( tx, tz )
export function legTo( x, z, tx, tz ) {

	const dx = tx - x, dz = tz - z;
	return { m: Math.hypot( dx, dz ), bearing: ( Math.atan2( dx, - dz ) + Math.PI * 2 ) % ( Math.PI * 2 ) };

}

// a bearing (rad, true) as a compass gives it: degrees magnetic, 0..359
export const magnetic = ( rad ) => ( ( Math.round( ( rad - VARIATION ) * 180 / Math.PI ) % 360 ) + 360 ) % 360;

// her cruise when she's not under way: the revs, and her speed at them on a calm sea (m/s), as measured
// (BoatController, the tired diesel: 7.1 m/s at 0.7, 2.0 L a km; flat out 9.9 m/s, 2.7 L a km)
export const CRUISE = { rpm: 0.7, speed: 7.1 };

// Fuel for the way home. `perM`: litres a metre as she's going (her burn over her speed, when she's making
// way), else at her cruise; the mariner's rule of thirds: a third out, a third back, a third kept
//   -> { litres (to get there), state: 'ok' | 'tight' (into the last third) | 'short' (not enough) }
export function fuelFor( metres, fuelL, { rpm = 0, speed = 0, speedMul = 1 } = {} ) {

	const under = speed > 2 && rpm > 0.1;
	const perM = under ? fuelBurn( rpm ) / speed : fuelBurn( CRUISE.rpm ) / ( CRUISE.speed * speedMul );
	const litres = metres * perM;
	return { litres, perM, state: fuelL < litres ? 'short' : fuelL < litres * 1.5 ? 'tight' : 'ok' };

}
