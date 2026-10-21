#!/usr/bin/env node
// Keeps public/audio inside All the Spaces' loudness rule, so its build leaves the files as they are
// and the soundscape's mix stays as measured (soundBank.js). The build turns a file down when it is
// louder than -14 LUFS integrated or peaks above -1 dBFS, by min( -16 - I, -1.5 - peak ) dB
// (packages/qa-browser/src/convert.ts in All the Spaces); here the same rule with a little margin,
// and every loudness in soundBank.js for that file moves by the same gain.
//
// Also writes each sound as .m4a (AAC) next to its .ogg, for browsers that can't decode Ogg Opus
// (older Safari); the soundscape picks one with canPlayType.
//
//   node tools/audio/tame.mjs           tame, write the .m4a copies, update soundBank.js
//   node tools/audio/tame.mjs --check   fail if a file is outside the rule or a .m4a is missing
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath( new URL( '../..', import.meta.url ) );
const DIR = join( ROOT, 'public/audio' );
const BANK = join( ROOT, 'src/audio/soundBank.js' );
// the build's thresholds, and where a file is brought to (a little inside them: encoding moves peaks)
const RULE = { maxLufs: - 14, maxPeak: - 1 };
const AIM = { lufs: - 16.5, peak: - 2 };
const check = process.argv.includes( '--check' );

const ffmpeg = ( args ) => execFileSync( 'ffmpeg', [ '-hide_banner', '-nostats', ...args ], { encoding: 'utf8', stdio: [ 'ignore', 'pipe', 'pipe' ] } );

// integrated loudness and peak, measured as the build measures them (ffmpeg's ebur128 summary)
function measure( file ) {

	const r = spawnSync( 'ffmpeg', [ '-hide_banner', '-nostats', '-i', file, '-af', 'ebur128=peak=true', '-f', 'null', '-' ], { encoding: 'utf8' } );
	const out = r.stderr || '';
	const summary = out.slice( out.lastIndexOf( 'Summary:' ) );
	const lufs = Number( summary.match( /I:\s+(-?[\d.]+) LUFS/ )?.[ 1 ] );
	const peak = Number( summary.match( /Peak:\s+(-?[\d.]+) dBFS/ )?.[ 1 ] );
	if ( ! Number.isFinite( lufs ) || ! Number.isFinite( peak ) ) throw new Error( `${ file }: no loudness measured\n${ out.slice( - 500 ) }` );
	return { lufs, peak };

}

// (with 0.3 dB to spare: another ffmpeg may measure a hair louder)
const outside = ( m ) => m.lufs > RULE.maxLufs - 0.3 || m.peak > RULE.maxPeak - 0.3;

function probe( file ) {

	const [ channels, bitRate ] = execFileSync( 'ffprobe', [ '-v', 'error', '-show_entries', 'stream=channels,bit_rate', '-of', 'csv=p=0', file ], { encoding: 'utf8' } ).trim().split( ',' );
	return { channels: Number( channels ) || 1, bitRate: Number( bitRate ) || 0 };

}

// re-encodes `file` (Opus in Ogg) turned by `gain` dB, at its own bit rate
function turn( file, gain ) {

	const { channels, bitRate } = probe( file );
	const kbps = bitRate ? Math.round( bitRate / 1000 ) : channels > 1 ? 96 : 64;
	const tmp = file + '.tmp.ogg';
	ffmpeg( [ '-y', '-i', file, '-map_metadata', '-1', '-af', `volume=${ gain.toFixed( 2 ) }dB`, '-c:a', 'libopus', '-b:a', `${ kbps }k`, '-ar', '48000', tmp ] );
	renameSync( tmp, file );

}

// the AAC copy of `ogg` (same loudness; turned down a little more only if AAC's peaks overshoot)
function m4a( ogg ) {

	const out = ogg.replace( /\.ogg$/, '.m4a' );
	const { channels } = probe( ogg );
	let extra = 0;
	for ( let k = 0; k < 4; k ++ ) {

		ffmpeg( [ '-y', '-i', ogg, '-map_metadata', '-1', ...( extra ? [ '-af', `volume=${ extra }dB` ] : [] ), '-c:a', 'aac', '-b:a', channels > 1 ? '96k' : '64k', '-movflags', '+faststart', out ] );
		if ( ! outside( measure( out ) ) ) return extra;
		extra -= 0.5;

	}

	throw new Error( `${ out }: still outside the loudness rule` );

}

// moves every loudness of `file`'s entry in soundBank.js by `gain` dB
function shiftBank( src, file, gain ) {

	const lines = src.split( '\n' );
	const i = lines.findIndex( ( l ) => l.includes( `file: '${ file }'` ) );
	if ( i < 0 ) throw new Error( `soundBank.js has no entry for ${ file }` );
	const shift = ( v ) => ( Math.round( ( Number( v ) + gain ) * 10 ) / 10 ).toString().replace( /^(-?\d+)$/, '$1' );
	lines[ i ] = lines[ i ]
		.replace( /lufs: (-?[\d.]+)(?=\s*[,}])/, ( _, v ) => `lufs: ${ shift( v ) }` )
		.replace( /lufs: \[([^\]]*)\]/, ( _, list ) => `lufs: [${ list.replace( /-?[\d.]+/g, ( v ) => shift( v ) ) }]` );
	return lines.join( '\n' );

}

let bank = readFileSync( BANK, 'utf8' );
const problems = [];
for ( const name of readdirSync( DIR ).filter( ( f ) => f.endsWith( '.ogg' ) ).sort() ) {

	const file = join( DIR, name );
	let m = measure( file );
	if ( check ) {

		if ( outside( m ) ) problems.push( `${ name }: ${ m.lufs } LUFS, peak ${ m.peak } dBFS` );
		if ( ! existsSync( file.replace( /\.ogg$/, '.m4a' ) ) ) problems.push( `${ name }: no .m4a copy` );
		continue;

	}

	let total = 0;
	for ( let k = 0; k < 4 && outside( m ); k ++ ) {

		const gain = Math.min( AIM.lufs - m.lufs, AIM.peak - m.peak );
		turn( file, gain );
		total += gain;
		m = measure( file );

	}

	if ( outside( m ) ) throw new Error( `${ name }: still outside the loudness rule` );
	if ( total ) bank = shiftBank( bank, name, total );
	const extra = m4a( file );
	console.log( `${ name.padEnd( 20 ) } ${ total ? `${ total.toFixed( 1 ).padStart( 5 ) } dB` : '   ok   ' }  ${ m.lufs.toFixed( 1 ) } LUFS, peak ${ m.peak.toFixed( 1 ) } dBFS${ extra ? `  (.m4a ${ extra } dB more)` : '' }` );

}

if ( check ) {

	if ( problems.length ) {

		console.error( `public/audio is outside All the Spaces' loudness rule (run \`node tools/audio/tame.mjs\`):\n  ${ problems.join( '\n  ' ) }` );
		process.exit( 1 );

	}

	console.log( 'public/audio is inside the loudness rule, with an .m4a for every .ogg.' );

} else writeFileSync( BANK, bank );
