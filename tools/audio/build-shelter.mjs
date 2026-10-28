// (M14) Builds the rain on a tin roof heard from beneath it, and the radio in the hurricane shelter, from
// CC0 Freesound previews (see README.md):
//   node dl.mjs 771981:Sassaby 397088:relwin
//   node build-shelter.mjs          -> out/*.ogg + shelter-bank.json (the bank entries for soundBank.js)
// Each recording was mapped first. The tin roof has no voice in it: a medium rain setting in, lighter in its
// first minute (rain_tin_light, from 8 s) and heavier by its last (rain_tin_heavy, from 86 s), loops as the
// rain's beds are (build-weather.mjs): an excerpt, an equal-power crossfade at the wrap, loudness-normalised
// to -23 LUFS integrated, `lufs` the median momentary loudness.
// The radio is a NOAA marine forecast off an SDR, all speech: a small speaker's band (280 Hz to 3.2 kHz),
// then low-passed twice at 300 Hz, so across the shelter's hall it's a voice reading on and nothing of what
// it says can be made out (the consonants that make speech out are 2 to 4 kHz; it reads Southern
// California's forecast). Chosen by ear on the listening page against 650 and 420 Hz. 48 s looped.
import { decode, writeWav, peak, gain, lufsOf, makeLoop, encode, momentary, SR } from './lib.mjs';
import fs from 'node:fs';

const OUT = 'out', W = 'work';
fs.mkdirSync( OUT, { recursive: true } );
fs.mkdirSync( W, { recursive: true } );
const bank = {};
const LOOPS = {
	rain_tin_light: { src: 771981, from: 8, len: 20, xf: 1.5, af: 'highpass=f=90:p=2', kbps: 64 },
	rain_tin_heavy: { src: 771981, from: 86, len: 20, xf: 1.5, af: 'highpass=f=90:p=2', kbps: 64 },
	shelter_radio: { src: 397088, from: 0.3, len: 48, xf: 1.2, af: 'highpass=f=280:p=2,lowpass=f=3200,lowpass=f=300:p=2,lowpass=f=300', kbps: 48 },
};
for ( const [ name, L ] of Object.entries( LOOPS ) ) {

	const N = Math.round( L.len * SR ), X = Math.round( L.xf * SR );
	const seg = decode( `raw/${ L.src }.ogg`, 1, L.from, L.len + L.xf + 0.05, L.af );
	const loop = makeLoop( seg, N, X );
	writeWav( `${ W }/${ name }.wav`, loop );
	const m = lufsOf( `${ W }/${ name }.wav` );
	gain( loop, 10 ** ( ( - 23 - m.I ) / 20 ) );
	const pk = peak( loop );
	if ( pk > 0.89 ) gain( loop, 0.89 / pk );
	writeWav( `${ W }/${ name }.wav`, loop );
	encode( `${ W }/${ name }.wav`, `${ OUT }/${ name }.ogg`, L.kbps, 1 );
	const M = momentary( decode( `${ OUT }/${ name }.ogg`, 1 ) ).sort( ( a, b ) => a - b );
	const lufs = + M[ Math.floor( M.length / 2 ) ].toFixed( 1 );
	bank[ name ] = { file: `${ name }.ogg`, loop: true, lufs, src: [ L.src ] };
	console.log( `loop   ${ name.padEnd( 15 ) } src ${ L.src }  ${ L.len } s  lufs(before) ${ m.I } -> -23  median M ${ lufs }` );

}

fs.writeFileSync( 'shelter-bank.json', JSON.stringify( bank, null, '\t' ) + '\n' );
fs.rmSync( W, { recursive: true } );
