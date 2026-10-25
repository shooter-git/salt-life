// (M9) Builds the weather's sounds of public/audio from CC0 Freesound previews (see README.md):
//   node dl.mjs 400178:Sassaby 200272:jmbphilmes 567027:johndynaudio 717909:TRP 652690:AyaDrevis \
//     243782:bastipictures 778374:BlondPanda
//   node build-weather.mjs           -> out/*.ogg + weather-bank.json (the bank entries for soundBank.js)
// The rain's beds are loops: an excerpt (clear of the heavy rain's thunderclap and the boat's gusts),
// an equal-power crossfade at the wrap, loudness-normalised to -23 LUFS integrated; `lufs` in the bank
// is the median momentary loudness. The thunder is a sprite: two near cracks, then two far rumbles,
// each from just before it begins through its roll, peak-normalised to -1 dBFS; each slice's maximum
// momentary loudness is measured.
import { decode, writeWav, peak, gain, lufsOf, makeLoop, fade, encode, momentary, SR } from './lib.mjs';
import fs from 'node:fs';

const OUT = 'out', W = 'work';
fs.mkdirSync( OUT, { recursive: true } );
fs.mkdirSync( W, { recursive: true } );
const hp = ( f ) => `highpass=f=${ f }:p=2`;
const bank = {};

// ---------------------------------------------------------------- the rain's beds
const LOOPS = {
	// light rain on a porch roof at night in Hawaii: a shower's patter (the night's insects, a steady
	// whine about 3.4 kHz, notched out)
	rain_light: { src: 400178, from: 6, len: 20, xf: 1.5, af: `${ hp( 90 ) },equalizer=f=3370:t=h:w=480:g=-18` },
	// a heavy downpour in the country, nothing else about (before its thunderclap at 43 s)
	rain_heavy: { src: 200272, from: 4, len: 20, xf: 1.5, af: hp( 70 ) },
	// rain drumming on a boat in a harbour: on deck and at the helm (its stretch with the least wind on
	// the microphone)
	rain_boat: { src: 567027, from: 212, len: 20, xf: 1.5, af: hp( 140 ) },
};
for ( const [ name, L ] of Object.entries( LOOPS ) ) {

	const N = Math.round( L.len * SR ), X = Math.round( L.xf * SR );
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

// ---------------------------------------------------------------- the thunder: [ src, start, duration, fade in, fade out ]
const THUNDER = [
	// near: a close crack in light rain (Toronto), and a strike and its roll
	[ 717909, 2.6, 10.5, 0.01, 3 ],
	[ 652690, 0, 17, 0.005, 4 ],
	// far: a distant peal, and thunder rolling far off through a downpour
	[ 243782, 3.4, 13, 0.3, 4 ],
	[ 778374, 1.2, 16, 0.6, 4 ],
];
const GAP = 0.08;
{

	const parts = [], table = [], lufs = [];
	let t = GAP;
	for ( const [ src, st, d, fi, fo ] of THUNDER ) {

		const [ x ] = decode( `raw/${ src }.ogg`, 1, st, d, hp( 30 ) );
		fade( [ x ], Math.round( fi * SR ), Math.round( fo * SR ) );
		gain( [ x ], 0.89 / Math.max( peak( [ x ] ), 1e-6 ) );
		parts.push( x );
		table.push( [ + t.toFixed( 4 ), + ( x.length / SR ).toFixed( 4 ) ] );
		t += x.length / SR + GAP;

	}

	const buf = new Float32Array( Math.ceil( ( t + 0.02 ) * SR ) );
	let o = Math.round( GAP * SR );
	for ( const x of parts ) {

		buf.set( x, o );
		o += x.length + Math.round( GAP * SR );

	}

	writeWav( `${ W }/thunder.wav`, [ buf ] );
	encode( `${ W }/thunder.wav`, `${ OUT }/thunder.ogg`, 64, 1 );
	const y = decode( `${ OUT }/thunder.ogg`, 1 );
	for ( const [ ts, d ] of table ) lufs.push( + Math.max( ...momentary( [ y[ 0 ].slice( Math.floor( ts * SR ), Math.floor( ( ts + d ) * SR ) ) ] ) ).toFixed( 1 ) );
	bank.thunder = { file: 'thunder.ogg', slices: table, lufs, src: [ ...new Set( THUNDER.map( ( s ) => s[ 0 ] ) ) ] };
	console.log( `sprite thunder      ${ table.length } slices  lufs ${ lufs.join( ' ' ) }` );

}

fs.writeFileSync( 'weather-bank.json', JSON.stringify( bank, null, 1 ) );
