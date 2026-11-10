// (M17) Builds the flats' sounds from CC0 Freesound previews (see README.md):
//   node dl.mjs 443380:kylecutsfilms 507092:paulprit 273725:darthbaul 637957:kyles 509323:AugustSandberg 870597:CHallSmith
//   node build-flats.mjs            -> out/*.ogg + flats-bank.json (the bank entries for soundBank.js)
//   node build-flats.mjs --try      -> every candidate cut on its own in ../sounds/try/ + try-m17.json, for the listening page
// The recordings were chosen by ear from a shortlist (docs/m17/sounds.md). The cuts are from a map of each one (its level
// in three bands, its events over a running floor, voiced pitch for a voice or a hum), so hear them before trusting them:
//   tail: a tail's slap and the water running off it: koi breaking the top of a temple pond (443380), each slap with its
//     trickle, high-passed over the pond's rumble and the hum in it, clear of the voice in its first 2 s; and a fish's
//     landing out of a jump (507092), heavier, for a permit's
//   bolt: a school's rush through shallow water: an asp charging bleak at a river's top, from the bank (273725), its
//     spray high-passed over the river and the river's flow taken down by its own profile (afftdn, sampled between the
//     charges); and small splashes close together (637957) sped up into a rush
//   push: the kayak's water on a still day, between her strokes: the quietest steady stretch of each glide between two
//     strokes, each as loud as the rest, joined end to end with equal-power crossfades into a loop: from the kayak the
//     game's paddle strokes come from (509323) and from a steady paddle on a lake (870597)
// The picks (the user's, by ear, 2026-11-09), built without --try: tail_splash (the koi's eight slaps for a bonefish's tail,
// the jump's two landings for a permit's), school_bolt (the asp's five charges, the river taken down) and kayak_push (the
// steady paddle's glides). The koi's words ("koi pond") are at 1.2 to 1.9 s, before its first cut (4.86 s); its seventh
// cut ends before a faint pitched line at 25.75 s.
import { decode, writeWav, peak, gain, lufsOf, makeLoop, encode, momentary, fade, rms, SR } from './lib.mjs';
import fs from 'node:fs';

const OUT = 'out', W = 'work', TRY = '../sounds/try', GAP = 0.08, TRYING = process.argv.includes( '--try' );
fs.mkdirSync( OUT, { recursive: true } );
fs.mkdirSync( W, { recursive: true } );
if ( TRYING ) fs.mkdirSync( TRY, { recursive: true } );
const hp = ( f ) => `highpass=f=${ f }:p=2,highpass=f=${ f }:p=2`, sec = ( s ) => Math.round( s * SR );
// faster and higher, as a playback rate is
const rate = ( r ) => `asetrate=${ Math.round( SR * r ) },aresample=${ SR }`;
// the asp's river, taken down by its own profile: sampled from a stretch between charges (s from the cut's start)
const river = ( from, to ) => `asendcmd=c='${ from } afftdn sn start; ${ to } afftdn sn stop',afftdn=nr=20:nf=-30:tn=0`;
const tried = {};
const bank = {};

// ------------------------------------------------------------------ the candidates (--try) and the picks

// sprite candidates: each slice [ t, d, gain dB ], from src through af
const SPRITES = {
	tail_koi: { src: 443380, af: hp( 350 ), fades: [ 0.004, 0.25 ], cuts: [ [ 4.86, 0.7 ], [ 8.3, 0.85 ], [ 9.19, 0.75 ], [ 10.44, 0.6 ], [ 12.58, 0.8 ], [ 17.33, 0.75 ], [ 25.01, 0.67 ], [ 27.26, 0.7 ] ] },
	tail_jump: { src: 507092, af: hp( 250 ), fades: [ 0.004, 0.3 ], cuts: [ [ 0.8, 0.9 ], [ 1.69, 0.72 ] ] },
	bolt_asp: { src: 273725, af: hp( 700 ), fades: [ 0.04, 0.45 ], cuts: [ [ 2.0, 1.45 ], [ 7.2, 1.3 ], [ 11.8, 1.5 ], [ 16.5, 1.3 ], [ 20.75, 1.3 ] ] },
	// (the same, the river taken down: decoded from 0 so the noise sample's times are the recording's)
	bolt_asp_clean: { src: 273725, af: `${ river( 3.6, 6.6 ) },${ hp( 500 ) }`, whole: 25, fades: [ 0.04, 0.45 ], cuts: [ [ 2.0, 1.45 ], [ 7.2, 1.3 ], [ 11.8, 1.5 ], [ 16.5, 1.3 ], [ 20.75, 1.3 ] ] },
	bolt_splash: { src: 637957, af: `${ hp( 300 ) },${ rate( 1.4 ) }`, fades: [ 0.03, 0.4 ], cuts: [ [ 4.6, 1.9 ], [ 8.45, 1.6 ], [ 12.7, 1.9 ], [ 14.3, 2.2 ], [ 19.0, 2.1 ] ] },
};
// a cut's times are the recording's; one sped up comes out shorter by its rate
const RATE = { bolt_splash: 1.4 };

function cutSprite( name, S ) {

	const whole = S.whole ? decode( `raw/${ S.src }.ogg`, 1, 0, S.whole, S.af )[ 0 ] : null;
	return S.cuts.map( ( [ t, d ] ) => {

		const r = RATE[ name ] || 1;
		const x = whole ? whole.slice( sec( t ), sec( t + d ) ) : decode( `raw/${ S.src }.ogg`, 1, t, d, S.af )[ 0 ];
		fade( [ x ], sec( S.fades[ 0 ] / r ), sec( S.fades[ 1 ] / r ) );
		return gain( [ x ], 0.89 / Math.max( peak( [ x ] ), 1e-6 ) )[ 0 ];

	} );

}

// loop candidates: grains [ t, d ] of src through af, each as loud as their median, joined with xf s crossfades
const GRAINS = {
	push_k3: { src: 509323, af: hp( 220 ), xf: 0.12, grains: [ [ 2.28, 0.45 ], [ 5.18, 0.45 ], [ 7.13, 0.45 ], [ 9.28, 0.45 ], [ 11.05, 0.45 ], [ 12.6, 0.45 ], [ 15.18, 0.45 ], [ 21.71, 0.45 ], [ 26.68, 0.45 ], [ 30.45, 0.45 ], [ 32.53, 0.45 ], [ 36.1, 0.45 ], [ 37.56, 0.45 ], [ 51.45, 0.45 ], [ 53.53, 0.45 ], [ 60.86, 0.45 ], [ 65.79, 0.45 ], [ 72.46, 0.45 ], [ 83.12, 0.45 ], [ 85.04, 0.45 ] ] },
	push_k4: { src: 870597, af: hp( 200 ), xf: 0.1, grains: [ [ 1.0, 0.35 ], [ 4.07, 0.35 ], [ 5.21, 0.35 ], [ 6.67, 0.35 ], [ 11.23, 0.35 ], [ 16.71, 0.35 ], [ 17.73, 0.35 ], [ 19.94, 0.35 ], [ 22.03, 0.35 ], [ 23.05, 0.35 ], [ 25.42, 0.35 ], [ 27.5, 0.35 ], [ 28.67, 0.35 ], [ 30.82, 0.35 ], [ 31.91, 0.35 ], [ 36.21, 0.35 ], [ 44.37, 0.35 ], [ 46.56, 0.35 ], [ 49.57, 0.35 ], [ 52.67, 0.35 ], [ 56.84, 0.35 ], [ 64.27, 0.35 ], [ 65.35, 0.35 ], [ 74.37, 0.35 ] ] },
};

function grainLoop( G ) {

	const parts = G.grains.map( ( [ t, d ] ) => decode( `raw/${ G.src }.ogg`, 1, t, d + G.xf, G.af )[ 0 ] );
	const levels = parts.map( ( x ) => rms( [ x ] ) ).sort( ( a, b ) => a - b ), mid = levels[ Math.floor( levels.length / 2 ) ];
	for ( const x of parts ) gain( [ x ], mid / Math.max( rms( [ x ] ), 1e-9 ) );
	// joined: each grain's head crossfaded into the last one's tail (equal power)
	const X = sec( G.xf ), total = parts.reduce( ( s, x ) => s + x.length - X, 0 ) + X;
	const o = new Float32Array( total );
	let at = 0;
	for ( const x of parts ) {

		for ( let i = 0; i < x.length; i ++ ) {

			const k = i < X && at > 0 ? Math.sin( ( ( i + 0.5 ) / X ) * Math.PI / 2 ) : 1;
			const j = at + i;
			if ( i < X && at > 0 ) o[ j ] = o[ j ] * Math.cos( ( ( i + 0.5 ) / X ) * Math.PI / 2 ) + x[ i ] * k;
			else o[ j ] = x[ i ];

		}

		at += x.length - X;

	}

	// the loop's wrap: its last crossfade's worth folded into its head
	return makeLoop( [ o ], o.length - X, X );

}

// ------------------------------------------------------------------ writing

function writeTry( file, chans, kind ) {

	writeWav( `${ W }/${ file }.wav`, chans );
	encode( `${ W }/${ file }.wav`, `${ TRY }/${ file }.ogg`, 64, 1 );
	const M = momentary( decode( `${ TRY }/${ file }.ogg`, 1 ) );
	// (a slice's loudest moment; a loop's median moment, as the bank's are)
	const lufs = kind === 'loop' ? M.slice().sort( ( a, b ) => a - b )[ Math.floor( M.length / 2 ) ] : Math.max( ...M );
	tried[ file ] = { lufs: + lufs.toFixed( 1 ), dur: + ( chans[ 0 ].length / SR ).toFixed( 3 ), kb: + ( fs.statSync( `${ TRY }/${ file }.ogg` ).size / 1024 ).toFixed( 1 ) };

}

if ( TRYING ) {

	for ( const [ name, S ] of Object.entries( SPRITES ) ) cutSprite( name, S ).forEach( ( x, i ) => writeTry( `${ name }_${ i + 1 }`, [ x ], 'slice' ) );
	// (joined: the asp's rush with the sped-up splashes under it, 4 dB down, as a school of many: each pair as loud as one)
	const asp = cutSprite( 'bolt_asp_clean', SPRITES.bolt_asp_clean ), spl = cutSprite( 'bolt_splash', SPRITES.bolt_splash );
	asp.forEach( ( a, i ) => {

		const b = spl[ i % spl.length ], n = Math.max( a.length, b.length ), o = new Float32Array( n );
		for ( let k = 0; k < n; k ++ ) o[ k ] = ( a[ k ] || 0 ) + 0.63 * ( b[ k ] || 0 );
		writeTry( `bolt_both_${ i + 1 }`, [ gain( [ o ], 0.89 / peak( [ o ] ) )[ 0 ] ], 'slice' );

	} );
	for ( const [ name, G ] of Object.entries( GRAINS ) ) {

		const loop = grainLoop( G );
		writeWav( `${ W }/${ name }.wav`, loop );
		const m = lufsOf( `${ W }/${ name }.wav` );
		gain( loop, 10 ** ( ( - 23 - m.I ) / 20 ) );
		const pk = peak( loop );
		if ( pk > 0.89 ) gain( loop, 0.89 / pk );
		writeTry( name, loop, 'loop' );

	}

	fs.writeFileSync( `${ TRY }/try-m17.json`, JSON.stringify( tried, null, 1 ) );
	for ( const [ k, v ] of Object.entries( tried ) ) console.log( `${ k.padEnd( 18 ) } ${ v.dur.toFixed( 2 ) } s  ${ v.lufs } LUFS  ${ v.kb } KB` );

}

// ------------------------------------------------------------------ the picks

const PICKS = { tail_splash: [ 'tail_koi', 'tail_jump' ], school_bolt: [ 'bolt_asp_clean' ] };
const LOOP_PICKS = { kayak_push: 'push_k4' };

if ( ! TRYING ) {

	for ( const [ name, from ] of Object.entries( PICKS ) ) {

		const parts = from.flatMap( ( k ) => cutSprite( k, SPRITES[ k ] ) ), table = [];
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
		bank[ name ] = { file: `${ name }.ogg`, slices: table, lufs, src: [ ...new Set( from.map( ( k ) => SPRITES[ k ].src ) ) ] };
		console.log( `sprite ${ name.padEnd( 12 ) } ${ table.length } slices  lufs ${ lufs.join( ' ' ) }  ${ ( fs.statSync( `${ OUT }/${ name }.ogg` ).size / 1024 ).toFixed( 1 ) } KB` );

	}

	for ( const [ name, k ] of Object.entries( LOOP_PICKS ) ) {

		const loop = grainLoop( GRAINS[ k ] );
		writeWav( `${ W }/${ name }.wav`, loop );
		const m = lufsOf( `${ W }/${ name }.wav` );
		gain( loop, 10 ** ( ( - 23 - m.I ) / 20 ) );
		const pk = peak( loop );
		if ( pk > 0.89 ) gain( loop, 0.89 / pk );
		writeWav( `${ W }/${ name }.wav`, loop );
		encode( `${ W }/${ name }.wav`, `${ OUT }/${ name }.ogg`, 64, 1 );
		const M = momentary( decode( `${ OUT }/${ name }.ogg`, 1 ) ).sort( ( a, b ) => a - b );
		bank[ name ] = { file: `${ name }.ogg`, loop: true, lufs: + M[ Math.floor( M.length / 2 ) ].toFixed( 1 ), src: [ GRAINS[ k ].src ] };
		console.log( `loop   ${ name.padEnd( 12 ) } ${ ( loop[ 0 ].length / SR ).toFixed( 2 ) } s  median M ${ bank[ name ].lufs }  ${ ( fs.statSync( `${ OUT }/${ name }.ogg` ).size / 1024 ).toFixed( 1 ) } KB` );

	}

	fs.writeFileSync( 'flats-bank.json', JSON.stringify( bank, null, 1 ) );

}

fs.rmSync( W, { recursive: true } );
