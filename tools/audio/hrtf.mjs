#!/usr/bin/env node
// (M20) How much louder each recording is through the game's HRTF panner (mid and high) than through equal-power panning (low),
// in Chromium's own Web Audio (docs/m20/finish.md): each bank's file, its first 6 s, through a PannerNode at its reference distance
// at 0, 45, 90, 135 and 180 degrees round you, level with your ears, rendered offline both ways and K-weighted (ITU-R BS.1770),
// both channels. Equal-power keeps a mono file's loudness wherever it's put; Chromium's HRTF doesn't: it adds most to the low,
// even sounds (an outboard), least to the high, sharp ones.
//   node tools/audio/hrtf.mjs [out.json] [banks: all]       (ALL_THE_SPACES for Playwright)
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BANK } from '../../src/audio/soundBank.js';

const ROOT = fileURLToPath( new URL( '../..', import.meta.url ) );
const ATS = process.env.ALL_THE_SPACES || join( ROOT, '../all-the-spaces' );
const [ OUT = join( ROOT, 'qa-output/audio/hrtf.json' ), ONLY ] = process.argv.slice( 2 );
const { chromium } = await import( join( ATS, 'node_modules/playwright/index.mjs' ) );
const AZ = [ 0, 45, 90, 135, 180 ];
const browser = await chromium.launch();
let page = await browser.newPage();
const rows = [];
for ( const name of ONLY ? ONLY.split( ',' ) : Object.keys( BANK ) ) {

	const data = readFileSync( join( ROOT, 'public/audio', BANK[ name ].file ) ).toString( 'base64' );
	// (one that hangs (a busy machine's renderer can) given up on after 3 minutes, on a fresh page)
	let timer;
	const r = await Promise.race( [ page.evaluate( async ( { data, AZ } ) => {

		const bytes = Uint8Array.from( atob( data ), ( ch ) => ch.charCodeAt( 0 ) );
		const buf = await new OfflineAudioContext( 1, 1, 48000 ).decodeAudioData( bytes.buffer );
		const N = Math.min( buf.length, buf.sampleRate * 6 );
		// (the file through a panner, `model`, 3 m off at az degrees round from ahead; the K-weighted loudness of both channels)
		const loud = async ( model, az ) => {

			const c = new OfflineAudioContext( 2, N, buf.sampleRate ), s = c.createBufferSource(), p = c.createPanner();
			s.buffer = buf;
			p.panningModel = model;
			p.distanceModel = 'inverse';
			p.refDistance = 3;
			const a = az * Math.PI / 180;
			p.positionX.value = 3 * Math.sin( a );
			p.positionZ.value = - 3 * Math.cos( a );
			const shelf = c.createBiquadFilter(), hp = c.createBiquadFilter();
			shelf.type = 'highshelf';
			shelf.frequency.value = 1681.97;
			shelf.gain.value = 3.99984;
			hp.type = 'highpass';
			hp.frequency.value = 38.135;
			hp.Q.value = 0.5003;
			s.connect( p ).connect( shelf ).connect( hp ).connect( c.destination );
			s.start();
			const o = await c.startRendering();
			let z = 0;
			for ( let ch = 0; ch < 2; ch ++ ) {

				const d = o.getChannelData( ch );
				let q = 0;
				for ( let i = 0; i < d.length; i ++ ) q += d[ i ] * d[ i ];
				z += q / d.length;

			}

			return 10 * Math.log10( z + 1e-20 );

		};
		const by = [];
		for ( const az of AZ ) by.push( ( await loud( 'HRTF', az ) ) - ( await loud( 'equalpower', az ) ) );
		return { channels: buf.numberOfChannels, by };

	}, { data, AZ } ), new Promise( ( res ) => timer = setTimeout( () => res( null ), 180000 ) ) ] ).catch( ( e ) => ( { error: e.message } ) );
	clearTimeout( timer );
	if ( ! r || r.error ) {

		console.log( `${ name.padEnd( 20 ) } not measured (${ r ? r.error.split( '\n' )[ 0 ] : 'timed out' })` );
		await page.close().catch( () => {} );
		page = await browser.newPage();
		continue;

	}

	// (round you: the four quarters alike, so 0 and 180 count once and 45 to 135 twice)
	const mean = ( r.by[ 0 ] + r.by[ 4 ] + 2 * ( r.by[ 1 ] + r.by[ 2 ] + r.by[ 3 ] ) ) / 8;
	rows.push( { bank: name, channels: r.channels, db: + mean.toFixed( 1 ), by: Object.fromEntries( AZ.map( ( a, i ) => [ a, + r.by[ i ].toFixed( 1 ) ] ) ) } );
	console.log( `${ name.padEnd( 20 ) } ${ r.channels === 1 ? 'mono  ' : 'stereo' } ${ mean >= 0 ? '+' : '' }${ mean.toFixed( 1 ) } dB round you (${ AZ.map( ( a, i ) => `${ a }: ${ r.by[ i ].toFixed( 1 ) }` ).join( ', ' ) })` );
	writeFileSync( OUT, JSON.stringify( rows, null, 1 ) );

}

await browser.close();
