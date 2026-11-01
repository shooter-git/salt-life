// (M16) Builds the fleet's sounds from CC0 Freesound previews (see README.md):
//   node dl.mjs 637202:kyles 593024:paulprit 195743:blaukreuz 509323:AugustSandberg 683806:mpuffenbarger 636210:lartti
//     524205:JovianSounds 389631:_stubb 662864:schneidi67 851733:IENBA 516923:mariethompson 696035:BeroundSound
//   node build-fleet.mjs            -> out/*.ogg + fleet-bank.json (the bank entries for soundBank.js)
//   node build-fleet.mjs --try      -> each loop and each slice on its own in ../sounds/try/, for the listening page
// The recordings were chosen by ear on the listening page. The cuts are from a map of each one (level, its steadiest
// stretch, voiced pitch), so hear them before trusting them:
//   outboard_idle, outboard_run: the console's one outboard, at idle after it's caught and at its steady, brighter speed
//   twin_idle, twin_run: her two (2 x 250 hp Suzukis): the recording never idles, so its low, dull stretch and its bright one
//   diesels_idle, diesels_run: the sportfisher's. A yacht's engine, idling and under way. Nothing's labelled a twin, so
//     each is laid over itself 0.6% sharper and a moment on: a pair out of step, beating, in the one voice
//   paddle: six strokes of a kayak, each from just before the blade's catch (they come every 1.9 s)
//   reel_electric: an electric actuator under load, past its start
//   radio_hiss: a radio's static, through a small speaker's band
//   radio_squelch: a walkie-talkie's sign-off squelch
//   turtle_breath: a heavy huff (no CC0 recording of a sea turtle was to be had)
//   turtle_sand: hands digging sand, six throws
//   turtle_crawl: thick sand moved about, four strokes
//   turtle_hatch: a scrabble in soft sand, five stretches
//   hauler: a hydraulic pump, steady
// Loops as build-sea.mjs's are; the sprites too.
import { decode, writeWav, peak, gain, lufsOf, makeLoop, encode, momentary, fade, SR } from './lib.mjs';
import fs from 'node:fs';

const OUT = 'out', W = 'work', TRY = '../sounds/try', GAP = 0.08, TRYING = process.argv.includes( '--try' );
fs.mkdirSync( OUT, { recursive: true } );
fs.mkdirSync( W, { recursive: true } );
if ( TRYING ) fs.mkdirSync( TRY, { recursive: true } );
const hp = ( f ) => `highpass=f=${ f }:p=2`, sec = ( s ) => Math.round( s * SR );
const bank = {};

// the recording and itself a touch sharper and a moment on: two engines out of step
function pair( [ x ], rate = 1.006, on = 0.37 ) {

	const n = Math.floor( ( x.length - sec( on ) ) / rate ), o = new Float32Array( n );
	for ( let i = 0; i < n; i ++ ) {

		const f = i * rate + sec( on ), k = Math.floor( f ), t = f - k;
		o[ i ] = 0.7 * ( x[ i ] + x[ k ] * ( 1 - t ) + x[ Math.min( k + 1, x.length - 1 ) ] * t );

	}

	return [ o ];

}

const LOOPS = {
	outboard_idle: { src: 637202, from: 21, len: 12, xf: 1, af: hp( 40 ) },
	outboard_run: { src: 637202, from: 59, len: 12, xf: 1, af: hp( 40 ) },
	twin_idle: { src: 593024, from: 31, len: 12, xf: 1, af: hp( 40 ) },
	twin_run: { src: 593024, from: 15, len: 12, xf: 1, af: hp( 40 ) },
	diesels_idle: { src: 195743, from: 15, len: 12, xf: 1, af: hp( 30 ), pair: true },
	diesels_run: { src: 195743, from: 48, len: 12, xf: 1, af: hp( 30 ), pair: true },
	reel_electric: { src: 683806, from: 3, len: 5, xf: 0.4, af: hp( 80 ) },
	radio_hiss: { src: 636210, from: 6, len: 5, xf: 0.4, af: `${ hp( 350 ) },lowpass=f=3200:p=2` },
	hauler: { src: 696035, from: 3, len: 5, xf: 0.4, af: hp( 60 ) },
};
for ( const [ name, L ] of Object.entries( LOOPS ) ) {

	let seg = decode( `raw/${ L.src }.ogg`, 1, L.from, L.len + L.xf + 0.6, L.af );
	if ( L.pair ) seg = pair( seg );
	const loop = makeLoop( seg, sec( L.len ), sec( L.xf ) );
	writeWav( `${ W }/${ name }.wav`, loop );
	const m = lufsOf( `${ W }/${ name }.wav` );
	gain( loop, 10 ** ( ( - 23 - m.I ) / 20 ) );
	const pk = peak( loop );
	if ( pk > 0.89 ) gain( loop, 0.89 / pk );
	writeWav( `${ W }/${ name }.wav`, loop );
	encode( `${ W }/${ name }.wav`, `${ OUT }/${ name }.ogg`, 64, 1 );
	const M = momentary( decode( `${ OUT }/${ name }.ogg`, 1 ) ).sort( ( a, b ) => a - b );
	const lufs = + M[ Math.floor( M.length / 2 ) ].toFixed( 1 );
	bank[ name ] = { file: `${ name }.ogg`, loop: true, lufs, src: [ L.src ] };
	if ( TRYING ) fs.copyFileSync( `${ OUT }/${ name }.ogg`, `${ TRY }/${ name }.ogg` );
	console.log( `loop   ${ name.padEnd( 14 ) } src ${ L.src }  ${ L.len } s  lufs(before) ${ m.I } -> -23  median M ${ lufs }` );

}

const SPRITES = {
	paddle: { src: 509323, af: hp( 150 ), fades: [ 0.02, 0.3 ], cuts: [ [ 1.68, 1 ], [ 3.62, 1 ], [ 5.56, 1 ], [ 7.49, 1 ], [ 46.14, 1 ], [ 55.55, 1 ] ] },
	radio_squelch: { src: 524205, af: hp( 200 ), fades: [ 0.002, 0.04 ], cuts: [ [ 0, 0.48 ] ] },
	turtle_breath: { src: 389631, af: hp( 50 ), fades: [ 0.02, 0.2 ], cuts: [ [ 0.2, 1.4 ] ] },
	turtle_sand: { src: 662864, af: hp( 200 ), fades: [ 0.01, 0.12 ], cuts: [ [ 14.77, 0.62 ], [ 15.66, 0.58 ], [ 20.18, 0.92 ], [ 36.19, 1 ], [ 60.51, 0.62 ], [ 62.89, 0.78 ] ] },
	turtle_crawl: { src: 851733, af: hp( 150 ), fades: [ 0.01, 0.15 ], cuts: [ [ 11.2, 0.82 ], [ 37.85, 1.15 ], [ 47.15, 0.92 ], [ 49.65, 0.95 ] ] },
	turtle_hatch: { src: 516923, af: hp( 300 ), fades: [ 0.08, 0.15 ], cuts: [ [ 30.5, 0.8 ], [ 31.5, 0.8 ], [ 32.5, 0.8 ], [ 33.5, 0.8 ], [ 34.6, 0.8 ] ] },
};
for ( const [ name, S ] of Object.entries( SPRITES ) ) {

	const parts = S.cuts.map( ( [ t, d ] ) => {

		const [ x ] = decode( `raw/${ S.src }.ogg`, 1, t, d, S.af );
		fade( [ x ], sec( S.fades[ 0 ] ), sec( S.fades[ 1 ] ) );
		return gain( [ x ], 0.89 / Math.max( peak( [ x ] ), 1e-6 ) )[ 0 ];

	} );
	const table = [];
	let t = GAP;
	for ( const x of parts ) {

		table.push( [ + t.toFixed( 4 ), + ( x.length / SR ).toFixed( 4 ) ] );
		t += x.length / SR + GAP;

	}

	const buf = new Float32Array( Math.ceil( ( t + 0.02 ) * SR ) );
	let o = sec( GAP );
	for ( const x of parts ) {

		buf.set( x, o );
		o += x.length + sec( GAP );

	}

	writeWav( `${ W }/${ name }.wav`, [ buf ] );
	encode( `${ W }/${ name }.wav`, `${ OUT }/${ name }.ogg`, 64, 1 );
	const y = decode( `${ OUT }/${ name }.ogg`, 1 );
	const lufs = table.map( ( [ ts, d ] ) => + Math.max( ...momentary( [ y[ 0 ].slice( Math.floor( ts * SR ), Math.floor( ( ts + d ) * SR ) ) ] ) ).toFixed( 1 ) );
	bank[ name ] = { file: `${ name }.ogg`, slices: table, lufs, src: [ S.src ] };
	if ( TRYING ) fs.copyFileSync( `${ OUT }/${ name }.ogg`, `${ TRY }/${ name }.ogg` );
	console.log( `sprite ${ name.padEnd( 14 ) } ${ table.length } slices  lufs ${ lufs.join( ' ' ) }` );

}

fs.writeFileSync( 'fleet-bank.json', JSON.stringify( bank, null, 1 ) );
fs.rmSync( W, { recursive: true } );
