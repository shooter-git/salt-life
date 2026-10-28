// (M14) Builds the roof sheets a hurricane tears off, tearing and landing, from CC0 Freesound previews
// (see README.md):
//   node dl.mjs 840435:SieuAmThanh 453351:kyles
//   node build-sheets.mjs           -> out/*.ogg + sheets-bank.json (the bank entries for soundBank.js)
//   node build-sheets.mjs --try     -> each slice on its own in ../sounds/try, for the listening page
// The recordings chosen from candidates (the user's T1 and L2), their slices by measurement, to be heard on the
// listening page and changed by ear. Each recording was mapped first: no voice in either
// (no voiced frames in the first; in the second a few frames of a wandering pitch near 42 s and 52 s, left
// out). Sprites of slices peak-normalised to -1 dBFS, each slice's maximum momentary loudness measured, as
// build-hull.mjs's are.
//   sheet_tear: a long corrugated roofing sheet being put up on a house roof (Vietnam, a phone's
//     recording): five of its bangs, their rattle and ring, each from a clean start and the least clipped
//     of them (the recording clips on its loudest); the fourth a double slam
//   sheet_land: a thin metal sheet dropped on a pile: four drops, none clipped, each with its bounce and
//     rattle, cut before the next
import { decode, writeWav, peak, gain, fade, encode, momentary, SR } from './lib.mjs';
import fs from 'node:fs';

const TRY = process.argv.includes( '--try' );
const OUT = TRY ? '../sounds/try' : 'out', W = 'work';
fs.mkdirSync( OUT, { recursive: true } );
fs.mkdirSync( W, { recursive: true } );
const hp = ( f ) => `highpass=f=${ f }:p=2`;
const sec = ( s ) => Math.round( s * SR );
const bank = {}, tried = {};

// slices laid end to end with a gap, each peak-normalised; the table and each slice's loudness measured
const GAP = 0.08;
function sprite( name, parts, src ) {

	if ( TRY ) {

		parts.forEach( ( x, i ) => {

			gain( [ x ], 0.89 / Math.max( peak( [ x ] ), 1e-6 ) );
			writeWav( `${ W }/${ name }_${ i }.wav`, [ x ] );
			encode( `${ W }/${ name }_${ i }.wav`, `${ OUT }/${ name }_${ i }.ogg`, 64, 1 );
			tried[ `${ name }_${ i }.ogg` ] = + Math.max( ...momentary( decode( `${ OUT }/${ name }_${ i }.ogg`, 1 ) ) ).toFixed( 1 );

		} );
		return;

	}

	const table = [], lufs = [];
	let t = GAP;
	for ( const x of parts ) {

		gain( [ x ], 0.89 / Math.max( peak( [ x ] ), 1e-6 ) );
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
	bank[ name ] = { file: `${ name }.ogg`, slices: table, lufs, src };
	console.log( `sprite ${ name.padEnd( 12 ) } ${ table.length } slices  lufs ${ lufs.join( ' ' ) }` );

}

// cuts: [ start, duration ] (s) of src, faded in and out, through `af`
const cut = ( src, st, d, fi, fo, af ) => {

	const [ x ] = decode( `raw/${ src }.ogg`, 1, st, d, af );
	fade( [ x ], sec( fi ), sec( fo ) );
	return x;

};

// the roofing sheet's bangs (its handling's rumble high-passed off)
sprite( 'sheet_tear', [ [ 9.03, 1.6 ], [ 57.51, 1.6 ], [ 59.35, 1.1 ], [ 90.70, 2.2 ], [ 102.58, 0.95 ] ].map( ( [ t, d ] ) => cut( 840435, t, d, 0.004, 0.35, hp( 60 ) ) ), [ 840435 ] );
// the thin sheet's drops
sprite( 'sheet_land', [ [ 5.68, 1.3 ], [ 8.71, 1.25 ], [ 18.22, 1.5 ], [ 31.50, 1.3 ] ].map( ( [ t, d ] ) => cut( 453351, t, d, 0.003, 0.35, hp( 50 ) ) ), [ 453351 ] );

if ( TRY ) console.log( JSON.stringify( tried, null, 1 ) );
else fs.writeFileSync( 'sheets-bank.json', JSON.stringify( bank, null, 1 ) );
fs.rmSync( W, { recursive: true } );
