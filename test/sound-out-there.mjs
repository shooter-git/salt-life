// (M15) The sound out there, under Node: the surf heard from the real island's waterline (src/audio/OpenSea.js),
// falling off as a real shore does and coming from where it is; the bank's breaking only in a sea big enough; the
// sea's wash by the wind's sea where you are; each whitecap heard once; and the real SoundScape, on a stand-in
// audio context, at the dock and far out, in a gale on the low tier: which beds run, and never more than its voices.
//
//   node test/sound-out-there.mjs

import { readFileSync } from 'node:fs';
import { TerrainData } from '../src/world/TerrainData.js';
import { decodeIsland } from '../src/world/terrain/IslandDecode.js';
import { Offshore, decodeSeabed } from '../src/world/terrain/Offshore.js';
import { Waves } from '../src/ocean/Waves.js';
import { Whitecaps } from '../src/ocean/Whitecaps.js';
import { SEABED } from '../src/world/terrain/SeabedModel.js';
import { SurfLine, seaGain, openWater, roarCut, roarCarry } from '../src/audio/OpenSea.js';
import { SoundScape, MIX } from '../src/audio/SoundScape.js';
import { BANK } from '../src/audio/soundBank.js';
import { computeShoreField, fieldGround } from '../src/world/ShoreField.js';
import { G } from '../src/core/Globals.js';

let failed = 0;
const ok = ( pass, what ) => {

	console.log( `${ pass ? 'ok  ' : 'FAIL' } ${ what }` );
	if ( ! pass ) failed ++;

};

const read = ( f ) => new Uint8Array( readFileSync( new URL( `../public/world/${ f }`, import.meta.url ) ) );
const T = new TerrainData( 7, decodeIsland( read( 'island.bin' ) ), { offshore: new Offshore( decodeSeabed( read( 'offshore.bin' ) ) ) } );
const db = ( v ) => 20 * Math.log10( v );
const train = ( amplitude, exposure = () => 1 ) => ( { amplitude, field: {}, fieldAt( x, z, o ) {

	o[ 1 ] = exposure( x, z );
	o[ 2 ] = 0;
	return o;

} } );

// ------------------------------------------------------------------ the surf from out at sea
const line = new SurfLine( T );
ok( line.points.length > 120 && line.points.length < 320, `the waterline read into ${ line.points.length } stretches (about ${ line.points.length * 32 / 1000 } km of shore)` );
const fair = [ train( 0.34 ) ];
const at = ( x, z, trains = fair ) => line.heard( x, z, trains, {} );
{

	// (the true nearest of the waterline, from a fine search of the ground)
	const check = ( x, z ) => {

		let best = Infinity;
		for ( let j = - 1000; j < 1000; j += 8 ) for ( let i = - 1000; i < 1000; i += 8 ) if ( T.heightAt( i, j ) > 0 ) best = Math.min( best, Math.hypot( i - x, j - z ) );
		return best;

	};

	for ( const [ x, z ] of [ [ 0, 800 ], [ 4000, - 300 ], [ 0, 20000 ], [ - 15000, 12000 ] ] ) {

		const land = at( x, z ).land, truth = check( x, z );
		ok( Math.abs( land - truth ) < 40, `the land's nearest from ( ${ x }, ${ z } ): ${ land.toFixed( 0 ) } m (the ground's ${ truth.toFixed( 0 ) } m)` );

	}

	const c = T.coastDistance( 0, 20000 ).d;
	ok( c < 12000, `(coastDistance said ${ c.toFixed( 0 ) } m there, which is why)` );

}

{

	const a = at( 0, 3000 ).g, b = at( 0, 6000 ).g, c = at( 0, 12000 ).g, d = at( 0, 24000 ).g;
	ok( Math.abs( db( a / b ) - 6 ) < 1 && Math.abs( db( b / c ) - 6 ) < 0.5 && Math.abs( db( c / d ) - 6 ) < 0.3, `far off it falls as a point, 6 dB a doubling (${ db( a / b ).toFixed( 1 ) }, ${ db( b / c ).toFixed( 1 ) }, ${ db( c / d ).toFixed( 1 ) })` );
	const n = at( 0, 300 ).g, m = at( 0, 600 ).g;
	ok( db( n / m ) < 5, `near by, more as a line (${ db( n / m ).toFixed( 1 ) } dB, 300 to 600 m)` );
	const old = 1.25 / ( 1 + at( 0, 800 ).land / 200 ); // (SoundScape's near law)
	ok( Math.abs( db( at( 0, 800 ).g / old ) ) < 1.5, `where it takes over from the near law (800 m off the bay), about the same: ${ db( at( 0, 800 ).g ).toFixed( 1 ) } and ${ db( old ).toFixed( 1 ) } dB` );

}

for ( const [ name, x, z ] of [ [ 'south', 0, 6000 ], [ 'east', 6000, - 300 ], [ 'west', - 6000, - 300 ], [ 'north', 0, - 6000 ] ] ) {

	const o = at( x, z ), tx = - x, tz = - 300 - z, l = Math.hypot( tx, tz );
	ok( ( o.dx * tx + o.dz * tz ) / l > 0.98, `from the ${ name } it comes from the island (${ o.dx.toFixed( 2 ) }, ${ o.dz.toFixed( 2 ) })` );

}

{

	// (only the north shore's surf running: heard off the north, and from the bay with the mountain in the way, nothing)
	const north = [ train( 0.5, ( x, z ) => ( z < - 500 ? 1 : 0 ) ) ], L = new SurfLine( T );
	const off = L.heard( 0, - 1500, north, {} ), bay = L.heard( 0, 1000, north, {} );
	ok( off.surf > 0.4, `the north shore's sea heard off the north, as high as it is (${ off.surf.toFixed( 2 ) } m)` );
	ok( bay.g < off.g * 0.1, `and hardly at all from the far side of the island (${ db( bay.g / off.g ).toFixed( 0 ) } dB)` );
	const sheltered = L.heard( 0, 1000, [ train( 0.3, () => 0 ) ], {} );
	ok( sheltered.g === 0 && sheltered.surf === 0, 'no surf, nothing heard' );

}

ok( roarCut( 1200 ) > 800 && roarCut( 1200 ) < 1200 && roarCut( 5000 ) < 400 && roarCut( 100 ) > 8000, `the air takes its top: ${ roarCut( 100 ).toFixed( 0 ) } Hz at 100 m, ${ roarCut( 1200 ).toFixed( 0 ) } at 1.2 km, ${ roarCut( 5000 ).toFixed( 0 ) } at 5 km` );
ok( roarCarry( 1, 8, 2000 ) > 4 && roarCarry( - 1, 8, 2000 ) < - 4 && Math.abs( roarCarry( 1, 8, 100 ) ) < 0.01, 'the wind brings it down wind and bends it up against it, past a few hundred metres' );

// ------------------------------------------------------------------ the bank's breakers
{

	const B = SEABED.bank, L = new SurfLine( T, { bank: { x: B.x, z: B.z, size: 7168 } } );
	const shallow = L.points.length - L.island;
	ok( shallow > 50, `the bank's shallows read too: ${ shallow } of them` );
	const bar = ( A ) => [ train( 0 ), null, null, train( A ) ];
	const small = L.heard( B.x, B.z, bar( 0.02 ), {} ), big = L.heard( B.x, B.z, bar( 1.2 ), {} );
	ok( small.g === 0 || small.g < big.g * 0.3, `a slight sea breaks on less of it (${ small.g.toFixed( 3 ) } against ${ big.g.toFixed( 3 ) })` );
	ok( big.g > 0 && big.surf > 1, `a big one's heard from it, as high as it is (${ big.surf.toFixed( 2 ) } m)` );
	ok( big.land > 5000 && big.near < 1000, `out there the island's ${ ( big.land / 1000 ).toFixed( 1 ) } km off, the breaking ${ big.near.toFixed( 0 ) } m` );

}

// ------------------------------------------------------------------ the sea's wash
{

	const waves = new Waves( { tier: 'mid' } );
	waves.setWind( 7 );
	ok( seaGain( 2.5, 1 ) === 0 && seaGain( 3, 1 ) === 0, 'none in a light air (no whitecaps)' );
	ok( Math.abs( seaGain( 7, 1 ) - 1 ) < 1e-6, 'its level on a fair day, in the open' );
	const g11 = db( seaGain( 11, 1 ) ), g15 = db( seaGain( 15, 1 ) ), g19 = db( seaGain( 19, 1 ) );
	ok( g11 > 5 && g11 < 9 && g15 > 9 && g15 < 13 && g19 > 12 && g19 < 18 && db( seaGain( 30, 1 ) ) === g19, `louder with the wind's whitecaps: +${ g11.toFixed( 1 ) } dB at 11 m/s, +${ g15.toFixed( 1 ) } at 15, +${ g19.toFixed( 1 ) } at a gale's and no more` );
	G.windDir.value.set( - 0.34, 0.94 ).normalize(); // (the trades', down toward the bay)
	waves.setWindDir( G.windDir.value, { x: 0, z: 0 } );
	const bay = waves.windGrownAt( 0, 30 ), open = waves.windGrownAt( 0, - 6000 );
	ok( bay < 0.4 && open > 0.95, `quieter in the island's lee (grown ${ bay.toFixed( 2 ) } in the bay), full upwind of it (${ open.toFixed( 2 ) })` );
	ok( openWater( 40 ) === 0 && openWater( 500 ) === 1 && openWater( 230 ) > 0.4 && openWater( 230 ) < 0.6, 'open water from a few hundred metres off the shore' );

}

// ------------------------------------------------------------------ each whitecap heard once
{

	const waves = new Waves( { tier: 'mid' } ), caps = new Whitecaps( { waves } );
	const rate = ( u ) => {

		caps.set( u );
		const seen = new Map();
		let twice = 0, tried = 0;
		for ( let t = 1000; t < 1120; t += 0.2 ) caps.rollers( 0, - 6000, 35, t, ( x, z, a, h, on, w, id ) => {

			tried ++;
			if ( seen.has( id ) && t - seen.get( id ) > 12 ) twice ++;
			if ( ! seen.has( id ) ) seen.set( id, t );

		} );
		return { n: seen.size / 2, twice, tried };

	};

	const r0 = rate( 2.5 ), r7 = rate( 7 ), r11 = rate( 11 ), r15 = rate( 15 ), r19 = rate( 19 );
	ok( r0.n === 0, 'none breaking in a light air' );
	ok( r7.n > 0 && r11.n > r7.n && r15.n > r11.n && r19.n >= r15.n, `new crests a minute within 35 m: ${ r7.n } at 7 m/s, ${ r11.n } at 11, ${ r15.n } at 15, ${ r19.n } at 19` );
	ok( r7.twice + r11.twice + r15.twice + r19.twice === 0, 'each has its own id while it breaks: never heard twice' );

}

// ------------------------------------------------------------------ the real mixer, on a stand-in context
class Param {

	constructor( v ) {

		this.value = v;

	}

	setTargetAtTime( v ) {

		this.value = v;

	}

	setValueAtTime( v ) {

		this.value = v;

	}

	linearRampToValueAtTime( v ) {

		this.value = v;

	}

	cancelScheduledValues() {}

}

class FakeContext {

	constructor() {

		this.currentTime = 0;
		this.state = 'running';
		this.destination = {};
		this.sources = new Set();
		this.listener = {};
		for ( const k of [ 'positionX', 'positionY', 'positionZ', 'forwardX', 'forwardY', 'forwardZ', 'upX', 'upY', 'upZ' ] ) this.listener[ k ] = new Param( 0 );

	}

	node( extra = {} ) {

		return { connect( d ) {

			return d;

		}, disconnect() {}, ...extra };

	}

	createGain() {

		return this.node( { gain: new Param( 1 ) } );

	}

	createBiquadFilter() {

		return this.node( { frequency: new Param( 20000 ), Q: new Param( 1 ), type: '' } );

	}

	createPanner() {

		return this.node( { positionX: new Param( 0 ), positionY: new Param( 0 ), positionZ: new Param( 0 ) } );

	}

	createStereoPanner() {

		return this.node( { pan: new Param( 0 ) } );

	}

	createDynamicsCompressor() {

		return this.node( { threshold: new Param( 0 ), knee: new Param( 0 ), ratio: new Param( 1 ), attack: new Param( 0 ), release: new Param( 0 ) } );

	}

	createBufferSource() {

		const ctx = this, listeners = [];
		const s = this.node( {
			playbackRate: new Param( 1 ), loop: false, buffer: null, end: Infinity, onended: null,
			start( at, off, dur ) {

				if ( ! this.loop ) this.end = Math.max( at, ctx.currentTime ) + ( dur ?? 1 ) / this.playbackRate.value;
				ctx.sources.add( this );

			},
			stop( at ) {

				this.end = Math.min( this.end, at ?? ctx.currentTime );

			},
			addEventListener( k, f ) {

				listeners.push( f );

			},
			fire() {

				ctx.sources.delete( this );
				if ( this.onended ) this.onended();
				for ( const f of listeners ) f();

			},
		} );
		return s;

	}

	decodeAudioData( a ) {

		return Promise.resolve( { duration: 30, numberOfChannels: a.channels } );

	}

	step( dt ) {

		this.currentTime += dt;
		for ( const s of [ ...this.sources ] ) if ( s.end <= this.currentTime ) s.fire();

	}

}

globalThis.fetch = async ( url ) => ( { ok: true, arrayBuffer: async () => ( { channels: /sea_open|wind\.|whale/.test( url ) ? 2 : 1 } ) } );
const settle = () => new Promise( ( r ) => setTimeout( r, 0 ) );

async function scape( tier, caps = null ) {

	const ctx = new FakeContext(), s = new SoundScape( { context: () => ctx, output: () => ctx.node(), tier } );
	if ( caps ) s.attachSea( caps );
	await s.resume();
	return { s, ctx };

}

// runs it for `seconds` where it's told, the most sounds at once
async function run( { s, ctx }, seconds, state ) {

	let most = 0;
	for ( let t = 0; t < seconds; t += 1 / 30 ) {

		ctx.step( 1 / 30 );
		G.time.value += 1 / 30;
		s.update( 1 / 30, state );
		most = Math.max( most, ctx.sources.size );
		if ( t < 1 || Math.floor( t * 30 ) % 30 === 0 ) await settle();

	}

	return most;

}

const state = ( x, z, o = {} ) => ( {
	listener: { position: { x, y: 2.5, z }, forward: { x: 0, y: 0, z: - 1 }, up: { x: 0, y: 1, z: 0 } }, surfIntensity: 0.57, distanceToShore: 3000, coastDistance: 3000, windSpeed: 7, gust: 0.6, daylight: 0,
	sea: { g: 0, surf: 0, dx: 0, dz: - 1, land: 20000, near: 20000, grown: 1, big: 1, bottom: 1800 },
	boat: { active: true, rpm: 0.8, speed: 10, position: { x, y: 0, z }, listenerInside: true }, aboard: true, hull: { motion: 0.3 }, rainOn: { water: 1 },
	...o,
} );

const has = ( s, name ) => s._beds.has( name );
const gain = ( s, name ) => ( s._beds.has( name ) ? s._beds.get( name ).gain.gain.value : 0 );
const lufs = ( s, name ) => db( gain( s, name ) ) + BANK[ name ].lufs;

{

	const S = await scape( 'high' );
	S.s.engineStart();
	await run( S, 8, state( 0, 20000 ) );
	ok( has( S.s, 'sea_open' ) && has( S.s, 'wind_sea' ), 'far out: the sea\'s wash and the wind off open water' );
	ok( Math.abs( lufs( S.s, 'sea_open' ) - MIX.seaOpen ) < 1, `the wash at its level on a fair day (${ lufs( S.s, 'sea_open' ).toFixed( 1 ) } LUFS)` );
	ok( ! has( S.s, 'surf_far' ), 'the surf gone, its voice freed' );
	ok( ! has( S.s, 'wind' ) && ! has( S.s, 'crickets' ) && ! has( S.s, 'under_reef' ), 'no bushes in the wind, no crickets, no reef over 1,800 m of water' );
	const fromSea = S.s._beds.get( 'wind_sea' ).gain.gain.value;
	ok( fromSea > 0, `the wind's lulls don't fall quiet out there (${ ( db( fromSea ) + BANK.wind_sea.lufs ).toFixed( 1 ) } LUFS now)` );

}

{

	// (coming away from the bay: the near law as it was, the far law past it, the surf quieter and duller)
	const S = await scape( 'high' );
	const here = ( land, g ) => state( 0, land, { distanceToShore: land, coastDistance: land, sea: { g, surf: 0.34, dx: 0, dz: - 1, land, near: land, grown: 0.5, big: 0.8, bottom: 30 }, boat: { active: false, speed: 0, position: { x: 0, y: 0, z: 0 } }, aboard: false, hull: null } );
	await run( S, 5, here( 100, 0 ) );
	const by = lufs( S.s, 'surf_far' ), cutBy = S.s.surfLP.frequency.value;
	ok( Math.abs( by - ( MIX.surfFar - 3 + db( 1.25 / 1.5 ) ) ) < 1.5 && cutBy === 20000, `by the shore as it always was (${ by.toFixed( 1 ) } LUFS, nothing cut)` );
	await run( S, 3, here( 3000, 0.1 ) );
	ok( lufs( S.s, 'surf_far' ) < by - 15 && S.s.surfLP.frequency.value < 500, `3 km off, ${ ( by - lufs( S.s, 'surf_far' ) ).toFixed( 0 ) } dB quieter, its top cut to ${ S.s.surfLP.frequency.value.toFixed( 0 ) } Hz` );
	ok( Math.abs( S.s.env.surfZ + 1 ) < 0.01, 'and from the way the shore is' );
	await run( S, 8, here( 15000, 0.012 ) );
	ok( ! has( S.s, 'surf_far' ), 'stopped once it\'s gone under the rest' );

}

{

	// (the shore: nothing of the open sea on the beach or in the bay's lee)
	const S = await scape( 'high' );
	await run( S, 3, state( 0, 40, { coastDistance: - 10, distanceToShore: 10, sea: { g: 1, surf: 0.34, dx: 0, dz: - 1, land: 10, near: 10, grown: 1, big: 1, bottom: - 2 }, boat: { active: false, speed: 0, position: { x: 0, y: 0, z: 0 } }, aboard: false, hull: null } ) );
	ok( ! has( S.s, 'sea_open' ) && ! has( S.s, 'wind_sea' ), 'ashore: only the wind through the bushes, no sea\'s wash' );
	const B = await scape( 'high' );
	await run( B, 3, state( 0, 500, { sea: { g: 0.2, surf: 0.34, dx: 0, dz: - 1, land: 500, near: 500, grown: 0, big: 0.5, bottom: 25 } } ) );
	ok( ! has( B.s, 'sea_open' ), 'in the lee, no wind\'s sea: no wash' );

}

{

	// (the worst of it on a phone: a gale's rain and whitecaps, far out, running hard, slamming)
	const waves = new Waves( { tier: 'low' } ), caps = new Whitecaps( { waves } );
	caps.set( 19 );
	const S = await scape( 'low', caps );
	S.s.engineStart();
	S.s.boatReady();
	const st = state( 0, - 6000, { windSpeed: 19, rain: 1, sea: { g: 0.05, surf: 0.6, dx: 0, dz: 1, land: 5500, near: 5500, grown: 1, big: 3, bottom: 900 }, hull: { motion: 1, flood: 1, wear: 0.5 } } );
	const most = await run( S, 30, st );
	ok( most <= 14, `a gale far out on the low tier: ${ most } sounds at most (its cap 14, All the Spaces' 16)` );
	ok( S.s._voices.whitecap !== undefined, 'with its whitecaps heard' );
	const high = await scape( 'high', ( () => {

		const c = new Whitecaps( { waves: new Waves( { tier: 'high' } ) } );
		c.set( 19 );
		return c;

	} )() );
	const mostHigh = await run( high, 15, st );
	ok( mostHigh <= 62, `and on high: ${ mostHigh } of 62` );

}

{

	// (a flock working bait: calling all the while, against the odd tern's call)
	const agents = [];
	for ( let i = 0; i < 14; i ++ ) agents.push( { kind: 'tern', working: true, visible: true, idle: false, f: { P: { pos: [ 100 + i, 10, - 6000 ] } } } );
	globalThis.__app = { wildlife: { birds: { agents } } };
	const S = await scape( 'high' );
	let calls = 0;
	const shot = S.s._shotAt.bind( S.s );
	S.s._shotAt = ( bank, ...rest ) => {

		if ( bank === 'tern' ) calls ++;
		return shot( bank, ...rest );

	};

	await run( S, 40, state( 0, - 6000, { daylight: 1 } ) );
	ok( calls > 15 && calls < 90, `a working flock 100 m off: ${ calls } calls in 40 s` );
	for ( const a of agents ) a.working = false;
	calls = 0;
	await run( S, 40, state( 0, - 6000, { daylight: 1 } ) );
	ok( calls < 10, `the same terns not working: ${ calls }` );
	delete globalThis.__app;

}

{

	// (the bank's breakers, wave by wave, off its real field: crashes on the bar, in time, none in the open)
	const B = SEABED.bank, res = 128, size = 7168, h = size / res, origin = B.x - size / 2, originZ = B.z - size / 2, depth = new Float32Array( res * res );
	for ( let j = 0; j < res; j ++ ) for ( let i = 0; i < res; i ++ ) depth[ j * res + i ] = - T.heightAt( origin + ( i + 0.5 ) * h, originZ + ( j + 0.5 ) * h );
	const field = computeShoreField( fieldGround( { depth, res, size, origin, originZ } ), { res, swellDir: [ - 0.12, - 1 ], seaLevel: 0 } );
	const S = await scape( 'high' );
	const val = ( v ) => ( { value: v } );
	const shore = { amplitude: val( 0.34 ), variation: val( 0.3 ), period: val( 9 ), gamma: val( 0.78 ), enabled: val( 1 ), time: G.time };
	S.s.attachShore( { shore: { ...shore, amplitude: val( 0 ) }, field, terrain: T } );
	S.s.addShore( { shore, field }, 3 );
	const crashes = [];
	const shot = S.s._shotAt.bind( S.s );
	S.s._shotAt = ( bank, cat, x, y, z, ...rest ) => {

		if ( bank === 'surf_crash' ) crashes.push( { x, z } );
		if ( bank === 'surf_wash' || bank === 'surf_backwash' ) crashes.washed = true;
		return shot( bank, cat, x, y, z, ...rest );

	};

	const bar = S.s._shore4;
	const off = { sea: { g: 0.1, surf: 0.34, dx: 0, dz: - 1, land: 9000, near: 200, grown: 1, big: 1, bottom: 8 } };
	await run( S, 3, state( - 5809, 8360, off ) );
	ok( bar.stations && bar.stations.length >= 5, `a row of stations along the sandbar from its seaward side: ${ bar.stations.length }` );
	const shallow = bar.stations.every( ( st ) => - T.heightAt( st.x, st.z ) < 1.5 );
	ok( shallow, 'each on the bar, where a fair day\'s wave would break' );
	await run( S, 45, state( - 5809, 8360, off ) );
	ok( crashes.length >= 15, `its waves breaking there: ${ crashes.length } crashes in 48 s` );
	ok( crashes.every( ( c ) => Math.hypot( c.x + 5809, c.z - 8360 ) < 150 ), 'each within hearing, where it breaks' );
	ok( ! crashes.washed, 'no wash up a beach: there\'s none' );
	crashes.length = 0;
	const middle = { sea: { ...off.sea, bottom: 20 } };
	await run( S, 3, state( B.x, B.z - 400, middle ) );
	await run( S, 20, state( B.x, B.z - 400, middle ) );
	ok( crashes.length === 0, 'and none over the bank\'s middle' );

}

console.log( failed ? `${ failed } FAILED` : 'all ok' );
process.exit( failed ? 1 : 0 );
