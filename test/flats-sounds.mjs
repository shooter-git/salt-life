// (M17) Plain-node tests of the flats' sounds on the real mixer, on a stand-in context (as fleet-sounds.mjs's): a tail's slap
// where a tailing fish's ring is drawn (bonefish and permit, within its reach, now and then, never two at once), a school's rush
// where it bolts (by its count, within its reach), the kayak's push by her speed on still water (under her slaps, kept as they
// were), each loaded when it's wanted, the low tier's caps, and Pearl's outboard at its level by ear.
import { readFileSync } from 'node:fs';
import { SoundScape, MIX, PASSING } from '../src/audio/SoundScape.js';
import { BANK } from '../src/audio/soundBank.js';
import { TAIL, BOLT, PUSH, pushShare, pushRate, stillOf, tailDb, tailSlice, boltDb } from '../src/audio/FlatsSound.js';

let failed = 0;
const ok = ( c, m ) => {

	console.log( `${ c ? 'ok  ' : 'FAIL' } ${ m }` );
	if ( ! c ) failed ++;

};
const near = ( a, b, e ) => Math.abs( a - b ) <= e;
const dB = ( d ) => Math.pow( 10, d / 20 );
const toDb = ( g ) => 20 * Math.log10( g );
const MONO = dB( - 3 );

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

class Context {

	constructor() {

		this.currentTime = 0;
		this.sampleRate = 48000;
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

		const ctx = this;
		return this.node( {
			playbackRate: new Param( 1 ), loop: false, buffer: null, end: Infinity, onended: null,
			start( at, off, dur ) {

				if ( ! this.loop ) this.end = Math.max( at, ctx.currentTime ) + ( dur ?? 1 ) / this.playbackRate.value;
				ctx.sources.add( this );

			},
			stop( at ) {

				this.end = Math.min( this.end, at ?? ctx.currentTime );

			},
			addEventListener() {},
			fire() {

				ctx.sources.delete( this );
				if ( this.onended ) this.onended();

			},
		} );

	}

	decodeAudioData() {

		return Promise.resolve( { duration: 30, numberOfChannels: 1 } );

	}

	step( dt ) {

		this.currentTime += dt;
		for ( const s of [ ...this.sources ] ) if ( s.end <= this.currentTime ) s.fire();

	}

}

globalThis.fetch = async () => ( { ok: true, arrayBuffer: async () => ( {} ) } );
const settle = () => new Promise( ( r ) => setTimeout( r, 0 ) );

async function scape( tier = 'high' ) {

	const ctx = new Context(), s = new SoundScape( { context: () => ctx, output: () => ctx.node(), tier } );
	await s.resume();
	return { s, ctx };

}

const position = { x: 0, y: 0, z: 0 }, forward = { x: 0, y: 0, z: - 1 }, up = { x: 0, y: 1, z: 0 };
const state = ( extra = {}, boat = {} ) => ( { position, forward, up, aboard: true, coastDistance: 300, distanceToShore: 300, windSpeed: 1, boat: { active: false, rpm: 0, speed: 0, position, listenerInside: false, sound: 'kayak', ...boat }, ...extra } );

async function run( { s, ctx }, seconds, st ) {

	for ( let t = 0; t < seconds; t += 1 / 30 ) {

		ctx.step( 1 / 30 );
		s.update( 1 / 30, st );
		if ( Math.round( t * 30 ) % 5 === 0 ) await settle();

	}

}

// Math.random held at r while f runs
function held( r, f ) {

	const was = Math.random;
	Math.random = () => r;
	try {

		return f();

	} finally {

		Math.random = was;

	}

}

// ---- the numbers
ok( pushShare( 0 ) === 0 && pushShare( 0.15 ) === 0, 'the push: nothing drifting' );
ok( near( toDb( pushShare( 1.54 ) ), - 5, 0.3 ) && near( toDb( pushShare( 1.03 ) ), - 10.3, 0.5 ), `5 dB under the top at 3 knots (${ toDb( pushShare( 1.54 ) ).toFixed( 1 ) }), 10 at 2 (${ toDb( pushShare( 1.03 ) ).toFixed( 1 ) })` );
ok( pushShare( PUSH.top ) === 1 && pushShare( 3 ) === 1, 'all of it at her hull speed, and no more past it' );
let rising = true;
for ( let v = 0.25; v < PUSH.top; v += 0.05 ) rising = rising && pushShare( v + 0.05 ) > pushShare( v );
ok( rising, 'louder with every bit of speed' );
ok( pushShare( 2, 9 ) === 0 && near( pushShare( 2, 5.5 ), pushShare( 2 ) / 2, 0.05 ) && stillOf( 2 ) === 1, 'still water only: gone in a breeze, half of it in a light one' );
ok( pushRate( 0 ) < pushRate( 1 ) && pushRate( 1 ) < pushRate( 2.26 ) && near( pushRate( 2.26 ), 1.04, 1e-9 ), 'a little brighter faster' );
const bone = new Set(), perm = new Set();
for ( let r = 0; r < 1; r += 0.01 ) {

	bone.add( tailSlice( false, r ) );
	perm.add( tailSlice( true, r ) );

}

ok( [ ...bone ].sort().join() === '0,1,2,3,4,5,6,7' && [ ...perm ].sort().join() === '8,9', 'a bonefish\'s tail is the koi\'s eight slaps, a permit\'s the jump\'s two landings' );
ok( BANK.tail_splash.slices.length === TAIL.permit[ 1 ], 'and the bank has all ten' );
ok( tailDb( TAIL.out ) === 0 && tailDb( 0.01 ) < tailDb( 0.05 ) && tailDb( TAIL.out, true ) === 3, 'a tail well out at its level, a tip quieter, a permit\'s heavier' );
ok( boltDb( BOLT.school ) === 0 && boltDb( 1 ) === BOLT.least && boltDb( 3 ) < boltDb( 12 ) && boltDb( 40 ) === BOLT.most, 'a school\'s rush by its count: a lone fish 6 dB under a school of 12' );

// ---- loaded when wanted
{

	const S = await scape();
	await run( S, 0.5, state( { aboard: false }, { sound: 'lobster' } ) );
	ok( ! S.s._buffers.has( 'tail_splash' ) && ! S.s._buffers.has( 'school_bolt' ) && ! S.s._buffers.has( 'kayak_push' ), 'nothing of the flats\' loaded off them and out of the kayak' );
	await run( S, 0.5, state( { flats: true, aboard: false }, { sound: 'lobster' } ) );
	ok( S.s._buffers.has( 'tail_splash' ) && S.s._buffers.has( 'school_bolt' ), 'near the flats: their tails and bolts' );
	ok( ! S.s._buffers.has( 'kayak_push' ), 'the push not, out of the kayak' );
	await run( S, 0.5, state( { flats: true } ) );
	ok( S.s._buffers.has( 'kayak_push' ), 'aboard the kayak: her push' );

}

// ---- a tail's slap
{

	const S = await scape();
	await run( S, 0.5, state( { flats: true } ) );
	const shots = [];
	const shot = S.s._shot;
	S.s._shot = function ( bank, cat, dest, lufs, rate, at, pick ) {

		const v = shot.call( this, bank, cat, dest, lufs, rate, at, pick );
		if ( v ) shots.push( { bank, cat, lufs, pick, v } );
		return v;

	};
	held( 0.99, () => S.s.tailSplash( 10, 0, 0, 0.1 ) );
	ok( shots.length === 0, 'most rings wave silently' );
	held( 0.1, () => S.s.tailSplash( 10, 0, 0, 0.1 ) );
	ok( shots.length === 1 && shots[ 0 ].bank === 'tail_splash' && shots[ 0 ].pick < 8, 'one in a few: a bonefish\'s slap' );
	ok( near( shots[ 0 ].lufs, MIX.tailSplash, 2 ), `at its level (${ shots[ 0 ].lufs.toFixed( 1 ) } LUFS 10 m off)` );
	held( 0.1, () => S.s.tailSplash( 10, 0, 0, 0.1 ) );
	ok( shots.length === 1, 'never two in a breath' );
	S.ctx.step( 0.4 );
	held( 0.1, () => S.s.tailSplash( 6, 0, 3, 0.1, true ) );
	ok( shots.length === 2 && shots[ 1 ].pick >= 8, 'a permit\'s, heavier' );
	S.ctx.step( 0.4 );
	held( 0.1, () => S.s.tailSplash( 0, 0, TAIL.heard + 1, 0.1 ) );
	ok( shots.length === 2, `none past ${ TAIL.heard } m` );
	await run( S, 0.2, state( { flats: true, underwater: 1 } ) );
	S.ctx.step( 0.4 );
	held( 0.1, () => S.s.tailSplash( 5, 0, 0, 0.1 ) );
	ok( shots.length === 2, 'none heard under the water' );

}

// ---- a school bolting
{

	const S = await scape();
	await run( S, 0.5, state( { flats: true } ) );
	const shots = [];
	const shot = S.s._shot;
	S.s._shot = function ( bank, cat, dest, lufs, rate, at, pick ) {

		const v = shot.call( this, bank, cat, dest, lufs, rate, at, pick );
		if ( v ) shots.push( { bank, cat, lufs } );
		return v;

	};
	held( 0.5, () => S.s.schoolBolt( 15, 0, 0, 12 ) );
	ok( shots.length === 1 && shots[ 0 ].bank === 'school_bolt' && near( shots[ 0 ].lufs, MIX.schoolBolt, 1e-9 ), `a school of 12: its rush at its level (${ MIX.schoolBolt } LUFS 15 m off)` );
	held( 0.5, () => S.s.schoolBolt( 20, 0, 10, 3 ) );
	ok( shots.length === 2 && near( shots[ 1 ].lufs, MIX.schoolBolt + boltDb( 3 ), 1e-9 ), `three: ${ ( - boltDb( 3 ) ).toFixed( 1 ) } dB quieter` );
	held( 0.5, () => S.s.schoolBolt( 0, 0, BOLT.heard + 5, 12 ) );
	held( 0.5, () => S.s.schoolBolt( 15, 0, 0, 0 ) );
	ok( shots.length === 2, `none past ${ BOLT.heard } m, nor for a school with none left` );
	const fish = readFileSync( new URL( '../src/world/Fish.js', import.meta.url ), 'utf8' ), flats = readFileSync( new URL( '../src/game/FlatsFishing.js', import.meta.url ), 'utf8' ), app = readFileSync( new URL( '../src/App.js', import.meta.url ), 'utf8' );
	ok( /sightBolt\( g, x, z \) \{[\s\S]*?this\.onBolt\( g\.center\.x/.test( fish ) && /this\.onTail\( x - hx/.test( fish ), 'the fish call for them where they happen: a bolt in sightBolt, a tail where its ring\'s drawn' );
	ok( app.includes( 'audio.tailSplash(' ) && app.includes( 'audio.schoolBolt(' ) && app.includes( 'flats.near(' ), 'and App hands them to the mixer, and says when you\'re near the flats' );
	ok( ! /spooked\( g, why[\s\S]{0,600}fishSplash/.test( flats ), 'a spooked school no longer plays the hooked fish\'s splash' );
	// ((M17) the flats together: someone else's spook bolts a school here through sightBolt too, so it's heard as yours is, once)
	const theirs = flats.match( /\ttheirSpook\( id, x, z \) \{[\s\S]*?\n\t\}\n/ );
	ok( theirs && theirs[ 0 ].includes( 'sightBolt(' ) && ! theirs[ 0 ].includes( 'fishSplash' ), 'a school bolting for someone else\'s spook: heard by sightBolt\'s bolt alone, not the splash on top' );

}

// ---- the kayak's push
{

	const S = await scape();
	const bed = () => S.s._beds.get( 'kayak_push' );
	const lv = () => bed() ? toDb( bed().gain.gain.value / MONO * dB( BANK.kayak_push.lufs ) ) : - Infinity;
	await run( S, 6, state( {}, { speed: 0 } ) );
	ok( ! bed() || bed().gain.gain.value < 1e-4, 'drifting: no push' );
	await run( S, 4, state( {}, { speed: 1.54 } ) );
	ok( near( lv(), MIX.kayakPush - 5, 0.4 ), `paddling at 3 knots: ${ lv().toFixed( 1 ) } LUFS at her seat` );
	await run( S, 4, state( {}, { speed: PUSH.top } ) );
	ok( near( lv(), MIX.kayakPush, 0.3 ) && near( bed().src.playbackRate.value, pushRate( PUSH.top ), 0.01 ), `at her hull speed: ${ lv().toFixed( 1 ) }, its level, a little brighter` );
	ok( MIX.kayakPush < MIX.paddle, 'under her strokes' );
	await run( S, 6, state( { windSpeed: 10 }, { speed: PUSH.top } ) );
	ok( ! bed() || bed().gain.gain.value < 1e-4, 'a breeze: no push' );
	await run( S, 6, state( { underwater: 1 }, { speed: PUSH.top } ) );
	ok( ! bed() || bed().gain.gain.value < 1e-4, 'under the water: none' );
	await run( S, 8, state( {}, { sound: 'console', active: true, rpm: 0.3, speed: 2 } ) );
	ok( ! bed(), 'another boat: none, its voice let go' );

}

// ---- her slaps kept as they were, on still water too (the user's, by ear: the push plays under them)
for ( const wind of [ 1, 10 ] ) {

	const S = await scape();
	let n = 0;
	const shot = S.s._shot;
	S.s._shot = function ( bank, ...rest ) {

		if ( bank === 'hull_slap' ) n ++;
		return shot.call( this, bank, ...rest );

	};
	S.s.engineStart(); // (as App does once you're in a boat: the hull's sounds ready)
	await run( S, 30, state( { windSpeed: wind }, { speed: 1.6 } ) );
	ok( n > 3, `the kayak at 3 knots in ${ wind } m/s of wind: ${ n } slaps, as before` );

}

// ---- the low tier's caps
{

	const S = await scape( 'low' );
	await run( S, 0.5, state( { flats: true } ) );
	await settle();
	for ( let k = 0; k < 5; k ++ ) {

		S.ctx.step( 0.3 );
		held( 0.1, () => S.s.tailSplash( 8, 0, k, 0.1 ) );
		held( 0.5, () => S.s.schoolBolt( 15, 0, k, 12 ) );

	}

	ok( S.s._voices.tail.length === 1 && S.s._voices.bolt.length === 1, 'low: one tail and one rush at a time' );

}

// ---- Pearl's outboard, by ear: 9 dB under M16's
{

	ok( PASSING.db === - 36, `her level: ${ PASSING.db } LUFS 12 m off idling, ${ PASSING.db + 6 } flat out` );
	const S = await scape();
	await run( S, 0.5, state( {}, { sound: 'lobster' } ) );
	S.s.passingOutboard( { x: 0, y: 0, z: - 12, speed: 10.8, throttle: 1 } );
	await settle();
	S.s.passingOutboard( { x: 0, y: 0, z: - 12, speed: 10.8, throttle: 1 } );
	const g = S.s._passing ? S.s._passing.gain.gain.value : 0;
	ok( near( toDb( g * dB( BANK.outboard_run.lufs ) ), PASSING.db + 6, 0.01 ), `flat out 12 m off: ${ toDb( g * dB( BANK.outboard_run.lufs ) ).toFixed( 1 ) } LUFS, 9 dB under the console flat out at her helm (-21)` );

}

if ( failed ) {

	console.log( `\n${ failed } failed` );
	process.exit( 1 );

}

console.log( '\nflats sounds: all passed' );
