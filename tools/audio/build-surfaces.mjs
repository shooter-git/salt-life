// (M11) Builds the rain's sounds on what it falls on, and the drips, from CC0 Freesound previews (see
// README.md):
//   node dl.mjs 683778:Elements-Library 824671:buzkill 51813:kyles 572429:TRP 399281:Mjeno
//   node build-surfaces.mjs          -> out/*.ogg + surfaces-bank.json (the bank entries for soundBank.js)
//   node build-surfaces.mjs --try    -> ../sounds/try/: each loop and each drip on its own, and try.json
//                                       (their loudness), for the listening page
// Each recording was mapped first (its level over time, anything voiced, any chirping): none has a
// voice in it. The beds are loops as the rain's are (build-weather.mjs): an excerpt, an equal-power
// crossfade at the wrap, loudness-normalised to -23 LUFS integrated, `lufs` the median momentary
// loudness. The drips are a sprite: single drops on thin metal, each from just before it lands through
// its ring, peak-normalised to -1 dBFS, each slice's maximum momentary loudness measured.
import { decode, writeWav, peak, gain, lufsOf, makeLoop, fade, encode, momentary, SR } from './lib.mjs';
import fs from 'node:fs';

const TRY = process.argv.includes( '--try' );
const OUT = TRY ? '../sounds/try' : 'out', W = 'work';
fs.mkdirSync( OUT, { recursive: true } );
fs.mkdirSync( W, { recursive: true } );
const hp = ( f ) => `highpass=f=${ f }:p=2`;
const bank = {}, tried = {};

// ---------------------------------------------------------------- the beds
const LOOPS = {
	// rain on a lake by a cottage in Ontario, as it eases and builds: light (its first minute), medium
	// (from 110 s), heavier (180 to 225 s)
	rain_water_light: { src: 572429, from: 12, len: 20, xf: 1.5, af: hp( 90 ) },
	rain_water: { src: 572429, from: 120, len: 20, xf: 1.5, af: hp( 90 ) },
	rain_water_heavy: { src: 572429, from: 192, len: 20, xf: 1.5, af: hp( 90 ) },
	// a downpour on a pond, close
	rain_pond: { src: 399281, from: 2, len: 20, xf: 1.5, af: hp( 90 ) },
	// light rain on a wooden porch on the coast of Maine, from a window above it (clear of the knocks in
	// its first 100 s), and later as it's set in
	rain_wood_light: { src: 824671, from: 125, len: 20, xf: 1.5, af: hp( 110 ) },
	rain_wood_heavy: { src: 824671, from: 905, len: 20, xf: 1.5, af: hp( 110 ) },
	// drops slapping on a porch, close
	rain_porch: { src: 51813, from: 18, len: 20, xf: 1.5, af: hp( 110 ) },
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
	const lufs = + M[ Math.floor( M.length / 2 ) ].toFixed( 1 );
	bank[ name ] = { file: `${ name }.ogg`, loop: true, lufs, src: [ L.src ] };
	tried[ `${ name }.ogg` ] = lufs;
	console.log( `loop   ${ name.padEnd( 17 ) } src ${ L.src }  ${ L.len } s  lufs(before) ${ m.I } -> -23  median M ${ lufs }` );

}

// ---------------------------------------------------------------- the drips: onsets in 683778 (s)
const DRIPS = [ 0.408, 3.403, 5.483, 6.468, 8.758, 11.898, 12.873, 16.283 ];
const DRIP_LEN = 0.38, PRE = 0.01, GAP = 0.05;
{

	const parts = [], table = [], lufs = [];
	let t = GAP;
	for ( const at of DRIPS ) {

		const [ x ] = decode( 'raw/683778.ogg', 1, at - PRE, DRIP_LEN, hp( 150 ) );
		fade( [ x ], Math.round( 0.002 * SR ), Math.round( 0.15 * SR ) );
		gain( [ x ], 0.89 / Math.max( peak( [ x ] ), 1e-6 ) );
		parts.push( x );
		table.push( [ + t.toFixed( 4 ), + ( x.length / SR ).toFixed( 4 ) ] );
		lufs.push( + Math.max( ...momentary( [ x ] ) ).toFixed( 1 ) );
		t += x.length / SR + GAP;

	}

	if ( TRY ) parts.forEach( ( x, i ) => {

		writeWav( `${ W }/drip_${ i + 1 }.wav`, [ x ] );
		encode( `${ W }/drip_${ i + 1 }.wav`, `${ OUT }/drip_${ i + 1 }.ogg`, 64, 1 );
		tried[ `drip_${ i + 1 }.ogg` ] = lufs[ i ];

	} );
	else {

		const buf = new Float32Array( Math.ceil( ( t + 0.02 ) * SR ) );
		let o = Math.round( GAP * SR );
		for ( const x of parts ) {

			buf.set( x, o );
			o += x.length + Math.round( GAP * SR );

		}

		writeWav( `${ W }/drips.wav`, [ buf ] );
		encode( `${ W }/drips.wav`, `${ OUT }/drips.ogg`, 64, 1 );
		bank.drips = { file: 'drips.ogg', slices: table, lufs, src: [ 683778 ] };

	}

	console.log( `sprite drips  ${ DRIPS.length } slices  max M ${ lufs.join( ' ' ) }` );

}

if ( TRY ) fs.writeFileSync( `${ OUT }/try.json`, JSON.stringify( tried, null, 1 ) );
else fs.writeFileSync( 'surfaces-bank.json', JSON.stringify( bank, null, 1 ) );
