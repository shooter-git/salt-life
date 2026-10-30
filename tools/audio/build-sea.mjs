// (M15) Builds the open sea's own sounds from CC0 Freesound previews (see README.md):
//   node dl.mjs 583205:Sotiris_Laskaris 830338:pnwheeler 607261:LarsErikErtzgaardRingen
//   node build-sea.mjs              -> out/*.ogg + sea-bank.json (the bank entries for soundBank.js)
// All three chosen by ear on the listening page, from candidates that were each mapped first (none has a voice
// or a motor in these stretches):
//   sea_open: sea wash heard from a cliff (Kimolos, Greece): water at a distance and all about, with no hull in
//     it, so it does for a boat at rest. The chosen 22 s, stereo.
//   wind_sea: Storm Henk over a large open reservoir, gusts to 57 mph: wind over open water with no plants in it.
//     Everything under 180 Hz is cut, that being mostly the wind on the microphone's cover. A steadier stretch,
//     neither its lulls nor its strongest.
//   whitecap: five swells of water about a floating jetty in waves on a windy lake, each rising and falling away
//     in a second or two: the chosen five, a crest spilling near you.
// Loops as build-shelter.mjs's are; the sprite as build-sheets.mjs's is.
import { decode, writeWav, peak, gain, lufsOf, makeLoop, encode, momentary, fade, SR } from './lib.mjs';
import fs from 'node:fs';

const OUT = 'out', W = 'work', GAP = 0.08;
fs.mkdirSync( OUT, { recursive: true } );
fs.mkdirSync( W, { recursive: true } );
const hp = ( f ) => `highpass=f=${ f }:p=2`, sec = ( s ) => Math.round( s * SR );
const bank = {};
const LOOPS = {
	sea_open: { src: 583205, ch: 2, from: 28, len: 22, xf: 1.5, af: hp( 60 ), kbps: 96 },
	wind_sea: { src: 830338, ch: 1, from: 120, len: 24, xf: 1.5, af: `${ hp( 180 ) },${ hp( 180 ) }`, kbps: 64 },
};
for ( const [ name, L ] of Object.entries( LOOPS ) ) {

	const seg = decode( `raw/${ L.src }.ogg`, L.ch, L.from, L.len + L.xf + 0.05, L.af );
	const loop = makeLoop( seg, sec( L.len ), sec( L.xf ) );
	writeWav( `${ W }/${ name }.wav`, loop );
	const m = lufsOf( `${ W }/${ name }.wav` );
	gain( loop, 10 ** ( ( - 23 - m.I ) / 20 ) );
	const pk = peak( loop );
	if ( pk > 0.89 ) gain( loop, 0.89 / pk );
	writeWav( `${ W }/${ name }.wav`, loop );
	encode( `${ W }/${ name }.wav`, `${ OUT }/${ name }.ogg`, L.kbps, L.ch );
	const M = momentary( decode( `${ OUT }/${ name }.ogg`, L.ch ) ).sort( ( a, b ) => a - b );
	const lufs = + M[ Math.floor( M.length / 2 ) ].toFixed( 1 );
	bank[ name ] = { file: `${ name }.ogg`, loop: true, lufs, src: [ L.src ] };
	console.log( `loop   ${ name.padEnd( 10 ) } src ${ L.src }  ${ L.len } s  lufs(before) ${ m.I } -> -23  median M ${ lufs }` );

}

const parts = [ [ 431.5, 1.5 ], [ 474.2, 1.6 ], [ 479.1, 1.5 ], [ 496.2, 1.8 ], [ 509.3, 1.3 ] ].map( ( [ t, d ] ) => {

	const [ x ] = decode( 'raw/607261.ogg', 1, t, d, hp( 120 ) );
	fade( [ x ], sec( 0.03 ), sec( 0.3 ) );
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

writeWav( `${ W }/whitecap.wav`, [ buf ] );
encode( `${ W }/whitecap.wav`, `${ OUT }/whitecap.ogg`, 64, 1 );
const y = decode( `${ OUT }/whitecap.ogg`, 1 );
const lufs = table.map( ( [ ts, d ] ) => + Math.max( ...momentary( [ y[ 0 ].slice( Math.floor( ts * SR ), Math.floor( ( ts + d ) * SR ) ) ] ) ).toFixed( 1 ) );
bank.whitecap = { file: 'whitecap.ogg', slices: table, lufs, src: [ 607261 ] };
console.log( `sprite whitecap ${ table.length } slices  lufs ${ lufs.join( ' ' ) }` );

fs.writeFileSync( 'sea-bank.json', JSON.stringify( bank, null, 1 ) );
fs.rmSync( W, { recursive: true } );
