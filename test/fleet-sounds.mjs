// (M16) Plain-node tests of the fleet's sounds on the real mixer, on a stand-in context (as sound-out-there.mjs's):
// each boat sounds only as herself, the kayak has no engine, the electric reel takes over from the hand's, the VHF's
// hiss and squelch, a turtle's hooks, the hauler, and never more sounds than the low tier's cap.
import { readFileSync, existsSync } from 'node:fs';
import { SoundScape, MIX, engineOf } from '../src/audio/SoundScape.js';
import { BANK } from '../src/audio/soundBank.js';
import { soundBeats } from '../src/game/Turtles.js';

let failed = 0;
const ok = ( c, m ) => {

	console.log( `${ c ? 'ok  ' : 'FAIL' } ${ m }` );
	if ( ! c ) failed ++;

};

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
const state = ( sound, rpm, extra = {} ) => ( { position, forward, up, aboard: true, coastDistance: 500, distanceToShore: 500, boat: { active: true, rpm, speed: rpm * 10, position, listenerInside: false, sound }, ...extra } );

async function run( { s, ctx }, seconds, st ) {

	let most = 0;
	for ( let t = 0; t < seconds; t += 1 / 30 ) {

		ctx.step( 1 / 30 );
		s.update( 1 / 30, st );
		most = Math.max( most, ctx.sources.size );
		if ( Math.round( t * 30 ) % 5 === 0 ) await settle();

	}

	return most;

}

const ENGINE = [ 'boat_engine', 'outboard_idle', 'outboard_run', 'twin_idle', 'twin_run', 'diesels_idle', 'diesels_run' ];
const heard = ( s ) => ENGINE.filter( ( n ) => s._beds.has( n ) && s._beds.get( n ).gain.gain.value > 1e-4 );

// ---- each boat sounds only as herself, at idle and running; another's is gone once she's changed
for ( const [ sound, idle, run_ ] of [ [ 'lobster', 'boat_engine', 'boat_engine' ], [ 'console', 'outboard_idle', 'outboard_run' ], [ 'twin', 'twin_idle', 'twin_run' ], [ 'sportfisher', 'diesels_idle', 'diesels_run' ] ] ) {

	const S = await scape();
	S.s.engineStart();
	await run( S, 2, state( sound, 0.15 ) );
	await run( S, 6, state( sound, 0.15 ) );
	ok( heard( S.s ).join() === idle, `${ sound } at idle: ${ heard( S.s ).join() }` );
	await run( S, 6, state( sound, 0.9 ) );
	ok( heard( S.s ).join() === run_, `${ sound } running: ${ heard( S.s ).join() }` );
	const rate = S.s._beds.get( run_ ).src.playbackRate.value;
	ok( rate > 1, `and pitched up with her rpm (${ rate.toFixed( 2 ) })` );
	await run( S, 6, state( sound, 0.15 ) );
	ok( heard( S.s ).join() === idle, `and back at idle: ${ heard( S.s ).join() }` );

}

{

	const S = await scape();
	S.s.engineStart();
	await run( S, 4, state( 'console', 0.9 ) );
	await run( S, 6, state( 'sportfisher', 0.9 ) );
	ok( heard( S.s ).join() === 'diesels_run', 'into another boat: only the new one\'s heard' );
	await run( S, 6, state( 'kayak', 0.3 ) );
	ok( heard( S.s ).length === 0, 'the kayak: no engine at all' );
	await run( S, 6, state( 'kayak', 0.3 ) );
	ok( ! ENGINE.some( ( n ) => S.s._beds.has( n ) ), 'and none left holding a voice' );

}

{

	const S = await scape();
	S.s.engineStart();
	await run( S, 6, state( undefined, 0.5 ) );
	ok( heard( S.s ).join() === 'boat_engine', 'a boat nobody names (an older copy of the game\'s): the lobster boat\'s' );

}

// ---- what she's heard as, here or on another's game (Together's pose says if she has her two)
ok( engineOf( 'console', true ) === 'twin' && engineOf( 'console', false ) === 'console', 'the console, with her two and with one' );
ok( engineOf( 'sportfisher', true ) === 'sportfisher' && engineOf( 'lobster' ) === 'lobster', 'no other boat is a twin console' );

// ---- into another boat once you're aboard: her starter's ready before her first crank
{

	const S = await scape();
	S.s.boatReady();
	await run( S, 0.2, state( 'lobster', 0 ) );
	ok( ! S.s._buffers.has( 'diesels_start' ), 'the lobster boat doesn\'t load the sportfisher\'s starter' );
	await run( S, 0.2, state( 'sportfisher', 0 ) );
	await settle();
	ok( S.s._buffers.has( 'diesels_start' ) && S.s._buffers.has( 'diesels_idle' ), 'into the sportfisher: hers are loaded' );

}

// ---- each one's own starter: slice 1 catches at the end of the game's crank
for ( const [ sound, bank ] of [ [ 'lobster', 'starter' ], [ 'console', 'outboard_start' ], [ 'twin', 'outboard_start' ], [ 'sportfisher', 'diesels_start' ] ] ) {

	const S = await scape();
	await run( S, 0.2, state( sound, 0 ) );
	S.s.boatReady();
	await settle();
	const used = [];
	const shot = S.s._shot;
	S.s._shot = function ( b, cat, dest, lufs, rate, at, pick ) {

		used.push( [ b, pick ] );
		return shot.call( this, b, cat, dest, lufs, rate, at, pick );

	};
	S.s.crank( true );
	S.s.crank( false );
	ok( used[ 0 ][ 0 ] === bank && used[ 0 ][ 1 ] === 1 && used[ 1 ][ 0 ] === bank && used[ 1 ][ 1 ] !== 1, `${ sound }: ${ bank }, a crank that catches and one that doesn't` );
	ok( BANK[ bank ].slices[ 1 ][ 1 ] > 1.1, `and it runs on past her crank (${ BANK[ bank ].slices[ 1 ][ 1 ] } s)` );

}

// ---- the paddle: its own recording, never the swim's
{

	const S = await scape();
	await run( S, 0.2, state( 'kayak', 0 ) );
	S.s.paddleStroke( 0.8 );
	await settle();
	S.s.paddleStroke( 0.8 );
	ok( ( S.s._voices.swim || [] ).length === 1 && S.s._buffers.has( 'paddle' ), 'a stroke plays the paddle' );
	const kayak = readFileSync( new URL( '../src/world/boat/kayak/KayakModel.js', import.meta.url ), 'utf8' );
	ok( kayak.includes( 'audio.paddleStroke(' ) && ! kayak.includes( 'audio.swimStroke(' ), 'and the kayak calls for it, not the swim stroke' );

}

// ---- the electric reel in place of the hand's
{

	const S = await scape();
	S.s.rodLoop( 1.4, 0, 0.2, false );
	await run( S, 2, state( 'sportfisher', 0 ) );
	ok( S.s._beds.has( 'reel_wind' ) && ! S.s._beds.has( 'reel_electric' ), 'a hand on the crank: the hand\'s reel' );
	S.s.rodLoop( 1.4, 0, 0.2, true );
	await run( S, 6, state( 'sportfisher', 0 ) );
	ok( S.s._beds.has( 'reel_electric' ) && ! S.s._beds.has( 'reel_wind' ), 'the deep drop: the motor, the hand\'s gone' );
	const free = S.s._beds.get( 'reel_electric' ).src.playbackRate.value;
	S.s.rodLoop( 1.4, 0, 1, true );
	await run( S, 1, state( 'sportfisher', 0 ) );
	ok( S.s._beds.get( 'reel_electric' ).src.playbackRate.value < free, 'and it labours with a fish on' );

}

// ---- the VHF
{

	const S = await scape();
	await run( S, 1, state( 'lobster', 0 ) );
	ok( ! S.s._beds.has( 'radio_hiss' ), 'the VHF off: no hiss' );
	S.s.radioOn( true );
	await run( S, 2, state( 'lobster', 0 ) );
	ok( S.s._beds.has( 'radio_hiss' ) && S.s._beds.get( 'radio_hiss' ).gain.gain.value > 0, 'on: its hiss' );
	ok( MIX.radioHiss < MIX.engineIdle, 'quieter than the engine\'s idle' );
	S.s.radioSquelch();
	await settle();
	S.s.radioSquelch();
	ok( ( S.s._voices.radio || [] ).length === 1, 'and its squelch breaks, one at a time' );
	S.s.radioOn( false );
	await run( S, 6, state( 'lobster', 0 ) );
	ok( ! S.s._beds.has( 'radio_hiss' ), 'off again: its voice is free' );

}

// ---- a nesting turtle's hooks, as NestingTurtles calls them
{

	const S = await scape();
	await run( S, 0.2, state( 'lobster', 0 ) );
	const H = S.s.turtleHooks();
	ok( [ 'breath', 'sandThrown', 'crawlStroke', 'scramble' ].every( ( k ) => typeof H[ k ] === 'function' ), 'all four of a turtle\'s sounds' );
	for ( const k in H ) H[ k ]( 3, 0, 3, 0.8 );
	await settle();
	for ( const k in H ) H[ k ]( 3, 0, 3, 0.8 );
	ok( S.s._voices.turtle.length === 3 && S.s._voices.hatch.length === 1, 'each makes its sound where it happens' );
	const before = S.s._voices.hatch.length;
	H.scramble( 3, 0, 3, 0 );
	ok( S.s._voices.hatch.length === before, 'the last hatchling gone: nothing' );
	ok( Array.isArray( soundBeats( null, { phase: 'up', t: 1 } ) ), 'her night\'s beats still read' );

}

// ---- the hauler
{

	const S = await scape();
	S.s.haulerRun( true );
	await run( S, 2, state( 'lobster', 0 ) );
	ok( S.s._beds.has( 'hauler' ), 'the hauler turning' );
	S.s.haulerRun( false );
	await run( S, 6, state( 'lobster', 0 ) );
	ok( ! S.s._beds.has( 'hauler' ), 'and stopped' );
	const work = readFileSync( new URL( '../src/game/TrapWork.js', import.meta.url ), 'utf8' );
	ok( work.includes( 'haulerRun( true )' ) && work.includes( 'haulerRun( false )' ) && ! work.includes( 'netPull(' ), 'and the traps call for it, not the net\'s pull' );
	ok( /netLift\( _c\.set\(/.test( work ), 'and the trap breaking the surface sounds where it is' );

}

// ---- the most at once on a phone: running through the crossfade with the radio on, a reel going and the hauler
{

	const S = await scape( 'low' );
	S.s.engineStart();
	S.s.boatReady();
	S.s.radioOn( true );
	S.s.haulerRun( true );
	S.s.rodLoop( 1.4, 1, 1, true );
	const gale = ( rpm ) => state( 'sportfisher', rpm, { windSpeed: 19, rain: 1 } );
	let most = 0;
	for ( const rpm of [ 0.15, 0.3, 0.9, 0.3, 0.15 ] ) most = Math.max( most, await run( S, 3, gale( rpm ) ) );
	ok( most <= 14, `the low tier's cap holds: ${ most } at most` );
	ok( heard( S.s ).length > 0, 'and her engine\'s still heard' );

}

// ---- every sound's on disk, with its credit
{

	const credits = readFileSync( new URL( '../credits/audio.md', import.meta.url ), 'utf8' );
	let bytes = 0;
	for ( const n of [ 'outboard_idle', 'outboard_run', 'twin_idle', 'twin_run', 'diesels_idle', 'diesels_run', 'paddle', 'reel_electric', 'radio_hiss', 'radio_squelch', 'turtle_breath', 'turtle_sand', 'turtle_crawl', 'turtle_hatch', 'hauler', 'outboard_start', 'diesels_start' ] ) {

		if ( ! BANK[ n ] || ! existsSync( new URL( `../public/audio/${ n }.ogg`, import.meta.url ) ) ) ok( false, `${ n }: no file` );
		if ( ! credits.includes( `\`${ n }.ogg\`` ) ) ok( false, `${ n }: no credit` );
		for ( const ext of [ '.ogg', '.m4a' ] ) bytes += readFileSync( new URL( `../public/audio/${ n }${ ext }`, import.meta.url ) ).length;

	}

	ok( bytes < 2e6, `the fleet's sounds with their Safari copies: ${ ( bytes / 1e6 ).toFixed( 2 ) } of 2 MB` );

}

if ( failed ) {

	console.error( `${ failed } failed` );
	process.exit( 1 );

}
