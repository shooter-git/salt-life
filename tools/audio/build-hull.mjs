// (M10) Builds the sounds of the weather's cost (the boat's hull, bilge and engine, and the shutters
// banging in a blow) in public/audio from CC0 Freesound previews (see README.md):
//   node dl.mjs 398416:bone666138 506688:magzlurban 623692:launchsite 418417:wormer2 \
//     146347:colinpoh 388014:supersplat1 31574:Walter_Odington 829588:DJKaren
//   node build-hull.mjs              -> out/*.ogg + hull-bank.json (the bank entries for soundBank.js)
// The beds (the keel's scrape, the bilge pump, the slosh) are loops: an excerpt, an equal-power
// crossfade at the wrap, loudness-normalised to -23 LUFS integrated; `lufs` in the bank is the median
// momentary loudness. The rest are sprites of slices peak-normalised to -1 dBFS; each slice's maximum
// momentary loudness is measured. The starter: its recording cranks for only 0.4 s before the engine
// fires, so that stretch is laid end to end (crossfaded) into a crank that doesn't catch (1.1 s) and
// one that does, firing as the game's crank ends (Hull.CRANK_S) and running on into its idle.
import { decode, writeWav, peak, gain, lufsOf, makeLoop, fade, encode, momentary, env, SR } from './lib.mjs';
import fs from 'node:fs';

const OUT = 'out', W = 'work';
fs.mkdirSync( OUT, { recursive: true } );
fs.mkdirSync( W, { recursive: true } );
const hp = ( f ) => `highpass=f=${ f }:p=2`;
const bank = {};
const sec = ( s ) => Math.round( s * SR );

// ---------------------------------------------------------------- the beds
const LOOPS = {
	// a heavy sandbag dragged over sand: the keel grinding along the bottom
	keel_scrape: { src: 623692, from: 1, len: 5, xf: 0.8, af: hp( 50 ) },
	// a small water pump's buzz with its water running: the bilge pump and its outflow over the side
	bilge_pump: { src: 146347, from: 36, len: 8, xf: 1, af: hp( 60 ) },
	// a bucket sloshing: the water in her bilge as she rolls
	bilge_slosh: { src: 388014, from: 4, len: 7, xf: 1, af: hp( 60 ) },
};
for ( const [ name, L ] of Object.entries( LOOPS ) ) {

	const N = sec( L.len ), X = sec( L.xf );
	const seg = decode( `raw/${ L.src }.ogg`, 1, L.from, L.len + L.xf + 0.05, L.af || '' );
	const loop = makeLoop( seg, N, X );
	writeWav( `${ W }/${ name }.wav`, loop );
	const m = lufsOf( `${ W }/${ name }.wav` );
	gain( loop, 10 ** ( ( - 23 - m.I ) / 20 ) );
	const pk = peak( loop );
	if ( pk > 0.89 ) gain( loop, 0.89 / pk );
	writeWav( `${ W }/${ name }.wav`, loop );
	encode( `${ W }/${ name }.wav`, `${ OUT }/${ name }.ogg`, 64, 1 );
	const M = momentary( decode( `${ OUT }/${ name }.ogg`, 1 ) ).sort( ( a, b ) => a - b );
	bank[ name ] = { file: `${ name }.ogg`, loop: true, lufs: + M[ Math.floor( M.length / 2 ) ].toFixed( 1 ), src: [ L.src ] };
	console.log( `loop   ${ name.padEnd( 12 ) } src ${ L.src }  ${ L.len } s  lufs(before) ${ m.I } -> -23  median M ${ bank[ name ].lufs }` );

}

// ---------------------------------------------------------------- the sprites
// slices laid end to end with a gap, each peak-normalised; the table and each slice's loudness measured.
// shared: one gain for them all, and one loudness (the loudest's), so they play as loud as each other
// sounds in the recording (the starter: its crank, quieter than the engine catching)
const GAP = 0.08;
function sprite( name, parts, src, shared = false ) {

	const table = [], lufs = [];
	const all = 0.89 / Math.max( peak( parts ), 1e-6 );
	let t = GAP;
	for ( const x of parts ) {

		gain( [ x ], shared ? all : 0.89 / Math.max( peak( [ x ] ), 1e-6 ) );
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
	for ( const [ ts, d ] of table ) lufs.push( + Math.max( ...momentary( [ y[ 0 ].slice( Math.floor( ts * SR ), Math.floor( ( ts + d ) * SR ) ) ] ) ).toFixed( 1 ) );
	if ( shared ) lufs.fill( Math.max( ...lufs ) );
	bank[ name ] = { file: `${ name }.ogg`, slices: table, lufs, src };
	console.log( `sprite ${ name.padEnd( 12 ) } ${ table.length } slices  lufs ${ lufs.join( ' ' ) }` );

}

// cuts: [ src, start, duration, fade in, fade out ] (s), through `af`
const cut = ( src, st, d, fi, fo, af ) => {

	const [ x ] = decode( `raw/${ src }.ogg`, 1, st, d, af );
	fade( [ x ], sec( fi ), sec( fo ) );
	return x;

};

// copies of `seg` laid end to end, each crossfaded (equal power, `xf` s) into the next, to `len` s
function tile( seg, len, xf ) {

	const N = sec( len ), X = sec( xf ), step = seg.length - X, out = new Float32Array( N );
	for ( let o = 0; o < N; o += step ) {

		for ( let i = 0; i < seg.length && o + i < N; i ++ ) {

			const a = o > 0 && i < X ? Math.sin( ( i + 0.5 ) / X * Math.PI / 2 ) : 1;
			const b = i >= step && o + step < N ? Math.cos( ( i - step + 0.5 ) / X * Math.PI / 2 ) : 1;
			out[ o + i ] += seg[ i ] * a * b;

		}

	}

	return out;

}

// one signal crossfaded (equal power, `xf` s) into the next, `b` starting where `a` ends less `xf`
function join( a, b, xf ) {

	const X = sec( xf ), out = new Float32Array( a.length + b.length - X );
	out.set( a.subarray( 0, a.length - X ) );
	for ( let i = 0; i < X; i ++ ) {

		const t = ( i + 0.5 ) / X;
		out[ a.length - X + i ] = a[ a.length - X + i ] * Math.cos( t * Math.PI / 2 ) + b[ i ] * Math.sin( t * Math.PI / 2 );

	}

	out.set( b.subarray( X ), a.length );
	return out;

}

// the starter: a lobster boat's diesel cranking (0.2 to 0.58 s) and catching (about 0.62 s), then idling
{

	const STARTER = 398416, af = hp( 40 );
	const [ rec ] = decode( `raw/${ STARTER }.ogg`, 1, 0, 2.4, af );
	const crank = rec.slice( sec( 0.2 ), sec( 0.58 ) );
	// a crank that doesn't catch: the starter turning her over for 1.1 s, then letting go
	const fails = tile( crank, 1.1, 0.06 );
	fade( [ fails ], sec( 0.01 ), sec( 0.12 ) );
	// one that does: 0.72 s of cranking into the recording's own last cranks, the catch (at 1.1 s) and
	// her idle, fading as the engine's bed comes up
	const catches = join( tile( crank, 0.72, 0.06 ), rec.slice( sec( 0.2 ), sec( 2.1 ) ), 0.06 );
	fade( [ catches ], sec( 0.01 ), sec( 0.6 ) );
	sprite( 'starter', [ fails, catches ], [ STARTER ], true );

}

// a boat bumping a dock, gently (its knocks in the lapping water); harder ones are the shutter's bang
// played slow and low under it (SoundScape.hullKnock)
sprite( 'hull_bump', [ 0.22, 1.12, 2.52, 3.82, 6.52, 7.82 ].map( ( t ) => cut( 506688, t, 0.5, 0.01, 0.22, hp( 60 ) ) ), [ 506688 ] );
// a scoop bailed over the side: a wading swish through the water (step_water.ogg's second slice, in
// public/audio) run straight into a bucket being emptied (its splash and the water settling, faded over
// the drips), the two band-limited alike, each brought to the same loudness, crossfaded
{

	const BAND = 'highpass=f=100:p=2,lowpass=f=12000:p=2', XF = sec( 0.08 );
	const same = ( x ) => gain( [ x ], 10 ** ( ( - 18 - Math.max( ...momentary( [ x ] ) ) ) / 20 ) );
	let [ scoop ] = decode( '../../public/audio/step_water.ogg', 1, 1.014, 0.704, BAND );
	// (to just after it's done: 0.12 s past its last 10 ms within 18 dB of its peak)
	const e = env( scoop, 480 ), top = Math.max( ...e );
	let last = 0;
	e.forEach( ( v, k ) => {

		if ( v > top * 10 ** ( - 18 / 20 ) ) last = k;

	} );
	scoop = scoop.slice( 0, Math.min( scoop.length, ( last + 1 ) * 480 + sec( 0.12 ) ) );
	fade( [ scoop ], sec( 0.01 ), sec( 0.06 ) );
	same( scoop );
	const [ dump ] = decode( 'raw/418417.ogg', 1, 0, 2.3, BAND );
	fade( [ dump ], sec( 0.005 ), sec( 0.6 ) );
	same( dump );
	const bail = new Float32Array( scoop.length + dump.length - XF );
	bail.set( scoop.subarray( 0, scoop.length - XF ) );
	for ( let i = 0; i < XF; i ++ ) {

		const t = ( i + 0.5 ) / XF;
		bail[ scoop.length - XF + i ] = scoop[ scoop.length - XF + i ] * Math.cos( t * Math.PI / 2 ) + dump[ i ] * Math.sin( t * Math.PI / 2 );

	}

	bail.set( dump.subarray( XF ), scoop.length );
	sprite( 'bucket', [ bail ], [ 418417 ] );

}
// a wooden hull creaking (the recording's creaks, high-passed off the waves under them)
sprite( 'hull_creak', [ [ 24.2, 0.8 ], [ 27.0, 0.7 ], [ 70.6, 0.6 ], [ 137.8, 0.8 ], [ 140.6, 0.7 ], [ 155.0, 0.8 ] ].map( ( [ t, d ] ) => cut( 31574, t, d, 0.02, 0.22, hp( 150 ) ) ), [ 31574 ] );
// a window or gate banging in the wind: the village's shutters in a blow
sprite( 'shutter', [ 1.54, 4.89, 8.74 ].map( ( t ) => cut( 829588, t, 1.0, 0.004, 0.3, hp( 50 ) ) ), [ 829588 ] );

fs.writeFileSync( 'hull-bank.json', JSON.stringify( bank, null, 1 ) );
