// Builds the boat's horn (public/audio/boat_horn.ogg) from a CC0 Freesound recording (see README.md):
//   node dl.mjs 162350:felix.blume   (Félix Blume's field recording of a cruise boat's horn in Istanbul, three
//                                     blasts, Schoeps MS pair: real, not synthesised)
//   node build-horn.mjs              -> out/boat_horn.ogg + the bank entry to copy into soundBank.js
// A sprite of the three blasts, each from just before its attack through a second of the harbour's
// echo, peak-normalised to -1 dBFS; each slice's maximum momentary loudness is measured.
import { decode, writeWav, peak, gain, fade, encode, momentary, SR } from './lib.mjs';
import fs from 'node:fs';

const OUT = 'out', W = 'work';
fs.mkdirSync( OUT, { recursive: true } );
fs.mkdirSync( W, { recursive: true } );
// [ src, start, duration, fade in, fade out ]
const SLICES = [ [ 162350, 0.1, 5.2, 0.02, 1.0 ], [ 162350, 8.24, 5.6, 0.02, 1.0 ], [ 162350, 15.56, 4.6, 0.02, 1.0 ] ];
const GAP = 0.08;
const parts = [], table = [], lufs = [];
let t = GAP;
for ( const [ src, st, d, fi, fo ] of SLICES ) {
	const [ x ] = decode( `raw/${ src }.ogg`, 1, st, d, 'highpass=f=60:p=2' );
	fade( [ x ], Math.round( fi * SR ), Math.round( fo * SR ) );
	gain( [ x ], 0.89 / Math.max( peak( [ x ] ), 1e-6 ) );
	parts.push( x );
	table.push( [ + t.toFixed( 4 ), + ( x.length / SR ).toFixed( 4 ) ] );
	t += x.length / SR + GAP;
}
const buf = new Float32Array( Math.ceil( ( t + 0.02 ) * SR ) );
let o = Math.round( GAP * SR );
for ( const x of parts ) { buf.set( x, o ); o += x.length + Math.round( GAP * SR ); }
writeWav( `${ W }/boat_horn.wav`, [ buf ] );
encode( `${ W }/boat_horn.wav`, `${ OUT }/boat_horn.ogg`, 64, 1 );
const y = decode( `${ OUT }/boat_horn.ogg`, 1 );
for ( const [ ts, d ] of table ) lufs.push( + Math.max( ...momentary( [ y[ 0 ].slice( Math.floor( ts * SR ), Math.floor( ( ts + d ) * SR ) ) ] ) ).toFixed( 1 ) );
console.log( `boat_horn: { file: 'boat_horn.ogg', slices: ${ JSON.stringify( table ) }, lufs: ${ JSON.stringify( lufs ) } },` );
