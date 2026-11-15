#!/usr/bin/env node
// (M20) The sounds measured in the game (stream FINISH: docs/m20/finish.md): M17's flats sounds, Pearl's outboard, the anchor's
// splash and another player's kayak, each played as the game plays it at its reference place (MIX's), everything else muted (the
// beds held at nothing, the other one-shots not played), and its loudness read off the game's own output after its limiter:
// momentary loudness (ITU-R BS.1770's K-weighting, 400 ms windows every 100 ms, both channels), the loudest moment of each event
// for a one-shot, the steady level for a bed. Each against its MIX target. M17 set them by ear on a listening page, not in the
// game's own mix with its panning and HRTF (docs/m17/sounds.md, "Not verified"). The limiter adds 1.29 dB to everything (the
// meter's first reading, a tone of known loudness), so a sound on its level reads 1.29 over.
//
//   a dev server on LOOK_PORT (5241), then
//   node tools/audio/levels.mjs [out.json] [tier]          (ONLY=push,Pearl: those measures alone)
// Headless Chromium with its audio running (no gesture asked: --autoplay-policy). Don't edit src while it runs.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath( new URL( '../..', import.meta.url ) );
const ATS = process.env.ALL_THE_SPACES || join( ROOT, '../all-the-spaces' );
const [ OUTFILE = join( ROOT, 'qa-output/levels.json' ), TIER = 'mid' ] = process.argv.slice( 2 );
const PORT = process.env.LOOK_PORT || 5241;
// (ONLY=push,Pearl: just the measures whose names have one of these in them)
const ONLY = process.env.ONLY ? process.env.ONLY.split( ',' ) : null, wanted = ( name ) => ! ONLY || ONLY.some( ( k ) => name.includes( k ) );
const T0 = Date.now();
const log = ( ...a ) => console.log( `[${ ( ( Date.now() - T0 ) / 1000 ).toFixed( 0 ) } s]`, ...a );
const { chromium } = await import( join( ATS, 'node_modules/playwright/index.mjs' ) );
const browser = await chromium.launch( { args: [ '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required' ] } );
const page = await browser.newPage( { viewport: { width: 640, height: 360 } } );
page.setDefaultTimeout( 900000 );
const errors = [];
page.on( 'pageerror', ( e ) => errors.push( e.message ) );
// (on the west flat, in a foot of water, by day in a calm: the flats' sounds' place)
await page.goto( `http://127.0.0.1:${ PORT }/?tier=${ TIER }&weather=calm&hour=11&boat=kayak&fullsea` );
await page.waitForFunction( () => window.__app && window.__app._started && window.__app.audio, null, { timeout: 900000 } );
log( 'started' );

const setup = await page.evaluate( async () => {

	// (the game's audio as a gesture starts it: App's begin)
	const a = window.__app, A = a.audio;
	await A.resume();
	const c = A.ctx;
	// (at full volume: MIX's levels are the mix's at unity, and the game's own volume, 0.8 unless set, is 3.9 dB under it)
	A.setMasterVolume( 1 );
	// (the beds muted below still hold their voices till they idle out: room for the one measured)
	A.maxVoices = 64;
	// ---- the meter: the limiter's output, K-weighted (BS.1770: a high shelf of +4 dB from about 1.7 kHz, a high pass at 38 Hz),
	// its squares gathered into 100 ms blocks
	const split = c.createChannelSplitter( 2 ), merge = c.createChannelMerger( 2 );
	A.limiter.connect( split );
	for ( let ch = 0; ch < 2; ch ++ ) {

		const shelf = c.createBiquadFilter(), hp = c.createBiquadFilter();
		shelf.type = 'highshelf';
		shelf.frequency.value = 1681.97;
		shelf.gain.value = 3.99984;
		hp.type = 'highpass';
		hp.frequency.value = 38.135;
		hp.Q.value = 0.5003;
		split.connect( shelf, ch ).connect( hp ).connect( merge, 0, ch );

	}

	const proc = c.createScriptProcessor( 4096, 2, 2 ), mute = c.createGain();
	mute.gain.value = 0;
	merge.connect( proc ).connect( mute ).connect( c.destination );
	const M = window.__meter = { blocks: [], acc: 0, n: 0, per: Math.round( c.sampleRate / 10 ) };
	proc.onaudioprocess = ( e ) => {

		const L = e.inputBuffer.getChannelData( 0 ), R = e.inputBuffer.getChannelData( 1 );
		for ( let i = 0; i < L.length; i ++ ) {

			M.acc += L[ i ] * L[ i ] + R[ i ] * R[ i ];
			if ( ++ M.n === M.per ) {

				M.blocks.push( M.acc / M.per );
				M.acc = 0;
				M.n = 0;

			}

		}

	};
	// (the loudest momentary loudness of the blocks from `from`, or the median of them for a bed: 4 blocks a window)
	window.__lufs = ( from, steady = false ) => {

		const b = M.blocks, out = [];
		for ( let i = Math.max( 3, from + 3 ); i < b.length; i ++ ) out.push( - 0.691 + 10 * Math.log10( ( b[ i ] + b[ i - 1 ] + b[ i - 2 ] + b[ i - 3 ] ) / 4 + 1e-12 ) );
		if ( ! out.length ) return null;
		if ( steady ) return out.sort( ( p, q ) => p - q )[ out.length >> 1 ];
		return Math.max( ...out );

	};

	// ---- what's heard: only what's asked (window.__only: a bank's name), the beds at nothing besides
	const bed = A._bed.bind( A ), shot = A._shot.bind( A ), shotAt = A._shotAt.bind( A ), pass = A.passingOutboard.bind( A );
	A._bed = function ( name, g, ...r ) {

		return bed( name, name === window.__only ? g : 0, ...r );

	};
	A._shot = function ( bank, ...r ) {

		return bank === window.__only ? shot( bank, ...r ) : null;

	};
	A._shotAt = function ( bank, ...r ) {

		return bank === window.__only ? shotAt( bank, ...r ) : null;

	};
	A.passingOutboard = function ( o ) {

		return pass( window.__only === 'passing' ? window.__pearl : null );

	};
	// ---- where you stand and look: held each frame on the west flat (or in the kayak, for her push)
	const p = a.player, up = p.update.bind( p );
	p.update = function ( dt, ...r ) {

		const out = up( dt, ...r );
		const H = window.__hold;
		if ( H && H.walk ) {

			p.position.set( H.x, H.y, H.z );
			p.velocity.set( 0, 0, 0 );
			p.yaw = H.yaw;
			p.pitch = 0;

		}

		return out;

	};

	// (the meter checked: a 997 Hz tone at -20 dBFS on both channels into the limiter reads -20 LUFS)
	window.__tone = ( on ) => {

		if ( on ) {

			const o = c.createOscillator(), g = c.createGain();
			o.frequency.value = 997;
			g.gain.value = 0.1;
			o.connect( g ).connect( A.limiter );
			o.start();
			window.__osc = o;

		} else if ( window.__osc ) window.__osc.stop();

	};
	return { state: c.state, rate: c.sampleRate, enabled: A.enabled };

} );
log( 'audio', JSON.stringify( setup ) );
const frames = ( n ) => page.evaluate( ( n ) => new Promise( ( res ) => {

	let k = 0;
	const f = () => ( ++ k >= n ? res() : requestAnimationFrame( f ) );
	requestAnimationFrame( f );

} ), n );
const wait = ( s ) => page.waitForTimeout( s * 1000 );
const blocks = () => page.evaluate( () => window.__meter.blocks.length );

// where to stand: the west flat, in its shallows, facing north (the sounds are put ahead of you)
const spot = await page.evaluate( async () => {

	const a = window.__app, T = a.terrainData, url = performance.getEntriesByType( 'resource' ).map( ( e ) => e.name ).filter( ( u ) => /\/src\/core\/Globals\.js(\?|$)/.test( u ) ).pop();
	const { G } = await import( url );
	window.__G = G;
	let best = null;
	for ( let x = - 760; x <= - 640; x += 4 ) for ( let z = - 170; z <= - 90; z += 4 ) {

		const d = G.seaLevel.value - T.heightAt( x, z );
		if ( d > 0.15 && d < 0.5 && ( ! best || Math.abs( d - 0.3 ) < Math.abs( best.d - 0.3 ) ) ) best = { x, z, d };

	}

	window.__hold = { walk: true, x: best.x, y: T.heightAt( best.x, best.z ), z: best.z, yaw: 0 };
	return { ...best, sea: G.seaLevel.value };

} );
log( 'standing', JSON.stringify( spot ) );
await frames( 10 );

const results = [];
// ---- the meter itself, on a tone of known loudness (all else muted)
await page.evaluate( () => {

	window.__only = '-';
	window.__tone( true );

} );
await wait( 1.5 );
{

	const from = await blocks();
	await wait( 3 );
	const l = await page.evaluate( ( from ) => window.__lufs( from, true ), from );
	await page.evaluate( () => window.__tone( false ) );
	results.push( { name: 'the meter: a 997 Hz tone at -20 dBFS on both channels', target: - 20, steady: + l.toFixed( 2 ), off: + ( l + 20 ).toFixed( 2 ) } );
	log( 'meter', results.at( - 1 ) );

}

const ahead = ( m ) => page.evaluate( ( m ) => {

	// (m ahead of where you look, on the water)
	const a = window.__app, cam = a.camera, d = cam.getWorldDirection( new cam.position.constructor() ).setY( 0 ).normalize();
	return { x: cam.position.x + d.x * m, y: window.__G.seaLevel.value, z: cam.position.z + d.z * m, eye: cam.position.toArray().map( ( v ) => + v.toFixed( 2 ) ) };

}, m );

// a one-shot, played n times as the game plays it, each its loudest moment: the mean of them, and their spread
async function oneShot( name, bank, target, n, play ) {

	if ( ! wanted( name ) ) return;

	await page.evaluate( ( b ) => {

		window.__only = b;
		window.__app.audio._want( b );

	}, bank );
	// (its recording fetched and decoded first)
	await page.waitForFunction( ( b ) => window.__app.audio._buffers.has( b ), bank, { timeout: 120000, polling: 250 } );
	await wait( 2 );
	const got = [];
	for ( let i = 0; i < n; i ++ ) {

		const from = await blocks();
		const played = await play( i );
		await wait( 2.2 );
		const l = await page.evaluate( ( from ) => window.__lufs( from ), from );
		if ( played && l !== null && l > - 70 ) got.push( l );

	}

	const mean = got.length ? got.reduce( ( s, v ) => s + v, 0 ) / got.length : null;
	const r = { name, bank, target, n: got.length, mean: mean === null ? null : + mean.toFixed( 1 ), lo: got.length ? + Math.min( ...got ).toFixed( 1 ) : null, hi: got.length ? + Math.max( ...got ).toFixed( 1 ) : null, off: mean === null ? null : + ( mean - target ).toFixed( 1 ) };
	results.push( r );
	log( name, JSON.stringify( r ) );

}

// a bed, held at its reference for s seconds: its steady level
// (sounding: a function run in the page, true once it's playing at its level. Under a loaded machine its recording can take many
// seconds to fetch and decode, and a window measured before then reads it silent)
async function bed( name, bank, target, s, start, stop, sounding ) {

	if ( ! wanted( name ) ) return;

	await page.evaluate( ( b ) => {

		window.__only = b;

	}, bank );
	await start();
	await page.waitForFunction( sounding, null, { timeout: 120000, polling: 250 } );
	await wait( 3 );
	const from = await blocks();
	await wait( s );
	const l = await page.evaluate( ( from ) => window.__lufs( from, true ), from );
	await stop();
	const r = { name, bank, target, steady: l === null ? null : + l.toFixed( 1 ), off: l === null ? null : + ( l - target ).toFixed( 1 ), state: await page.evaluate( () => {

		const a = window.__app, A = a.audio, e = A.env, bed = A._beds.get( 'kayak_push' ), L = A.ctx.listener, P = A.boatPan;
		const r = ( v ) => + v.toFixed( 2 );
		return { ear: + a.camera.position.distanceTo( a.boatCtl.position ).toFixed( 2 ), mode: a.player.mode, aboard: e.aboard, sound: e.boat.sound, speed: r( e.boat.speed ), wind: r( e.wind ), bed: bed ? r( bed.gain.gain.value ) : null, loaded: A._buffers.has( 'kayak_push' ), voices: A._playing(), boatOut: r( A.boatOut.gain.value ), boatIn: r( A.boatIn.gain.value ), pan: P ? [ r( P.positionX.value ), r( P.positionY.value ), r( P.positionZ.value ) ] : null, u: e.u, water: r( a.cameraWaterHeight ), boatY: r( a.boatCtl.position.y ), limiter: A.limiter.reduction, ear: [ r( L.positionX.value ), r( L.positionY.value ), r( L.positionZ.value ) ] };

	} ) };
	results.push( r );
	log( name, JSON.stringify( r ) );

}

const MIX = await page.evaluate( async () => {

	const url = performance.getEntriesByType( 'resource' ).map( ( e ) => e.name ).filter( ( u ) => /\/src\/audio\/SoundScape\.js(\?|$)/.test( u ) ).pop();
	const m = await import( url );
	return { mix: m.MIX, passing: m.PASSING };

} );

// ---- a bonefish's tail slapping 10 m ahead (MIX.tailSplash; the game's own call, its slice and jitter, until one plays)
await oneShot( 'a bonefish\'s tail, 10 m off', 'tail_splash', MIX.mix.tailSplash, 12, async () => {

	const at = await ahead( 10 );
	return page.evaluate( ( at ) => {

		const A = window.__app.audio, was = A._tailAt;
		for ( let k = 0; k < 40 && A._tailAt === was; k ++ ) {

			A._tailAt = - 1e9;
			A.tailSplash( at.x, at.y, at.z, 1, false );

		}

		return A._tailAt !== - 1e9;

	}, at );

} );
// ---- a school of 12 bolting 15 m ahead (MIX.schoolBolt)
await oneShot( 'a school of 12 bolting, 15 m off', 'school_bolt', MIX.mix.schoolBolt, 10, async () => {

	const at = await ahead( 15 );
	return page.evaluate( ( at ) => {

		window.__app.audio.schoolBolt( at.x, at.y, at.z, 12 );
		return true;

	}, at );

} );
// ---- the anchor's splash (M20: Game.plunk's, at its strength)
await oneShot( 'the anchor going in (Game.plunk)', 'splash', MIX.mix.splash - ( 1 - 0.75 ) * 8, 10, async () => page.evaluate( () => {

	window.__app.audio.splash( 0.75 );
	return true;

} ) );
// ---- Pearl's outboard 12 m off, idling and flat out (PASSING.db, and 6 dB more flat out)
for ( const [ label, throttle, target ] of [ [ 'idling', 0, MIX.passing.db ], [ 'flat out', 1, MIX.passing.db + 6 ] ] ) {

	await bed( `Pearl's outboard 12 m off, ${ label }`, 'passing', target, 6, async () => {

		const at = await ahead( 12 );
		await page.evaluate( ( [ at, throttle ] ) => {

			window.__pearl = { x: at.x, y: at.y + 0.5, z: at.z, speed: throttle ? 9 : 0.3, throttle };

		}, [ at, throttle ] );

	}, async () => page.evaluate( () => {

		window.__pearl = null;

	} ), () => !! window.__app.audio._passing );

}

// ---- the kayak's push at her seat at hull speed on still water (MIX.kayakPush)
await bed( 'the kayak\'s push at hull speed', 'kayak_push', MIX.mix.kayakPush, 6, async () => page.evaluate( ( spot ) => {

	const a = window.__app, b = a.boatCtl, p = a.player;
	window.__hold = null;
	b.moored = b.beached = false;
	b.position.set( spot.x, window.__G.seaLevel.value, spot.z ); // (afloat: moved off her sand, she'd hang at its height)
	if ( p.mode !== 'boat' ) p.boardBoat();
	p.camMode = 'first'; // (her seat's eye: the push is reckoned at her seat)
	const U = 4.4 * 0.5144;
	window.__push = setInterval( () => {

		const f = b.forward( new b.position.constructor() ).setY( 0 ).normalize();
		b.velocity.set( f.x * U, b.velocity.y, f.z * U );
		b.speed = U;

	}, 16 );

}, spot ).then( () => page.waitForFunction( () => {

	// (the camera, and so your ears, come to her seat)
	const a = window.__app;
	return a.camera.position.distanceTo( a.boatCtl.position ) < 2.5;

}, null, { timeout: 60000, polling: 250 } ) ), async () => page.evaluate( () => clearInterval( window.__push ) ), () => {

	const b = window.__app.audio._beds.get( 'kayak_push' );
	return !! b && b.gain.gain.value > 0.05;

} );

// ---- (M19, heard from M20) another player's kayak at hull speed 2 m and 9 m ahead of you, sat still in yours: as loud as your own
// push at 2 m, 6 dB under at 9 (her push falls off from 3 to 15 m); she's put in the frame's state as Together.kayakHeard has her
for ( const [ d, target ] of [ [ 2, MIX.mix.kayakPush ], [ 9, MIX.mix.kayakPush - 6 ] ] ) await bed( `another's kayak ${ d } m off at hull speed`, 'kayak_push_theirs', target, 6, async () => page.evaluate( ( d ) => {

	const a = window.__app, A = a.audio, b = a.boatCtl;
	b.velocity.set( 0, b.velocity.y, 0 );
	b.speed = 0;
	if ( ! A.__theirs ) {

		const up = A.update.bind( A );
		A.update = ( dt, st ) => up( dt, window.__theirs ? { ...st, theirKayak: window.__theirs() } : st );
		A.__theirs = true;

	}

	const U = 4.4 * 0.5144;
	window.__theirs = () => {

		const c = a.camera, f = c.getWorldDirection( c.position.clone() ).setY( 0 ).normalize();
		return { d, speed: U, x: c.position.x + f.x * d, y: window.__G.seaLevel.value + 0.3, z: c.position.z + f.z * d };

	};

}, d ), async () => page.evaluate( () => window.__theirs = null ), () => {

	const b = window.__app.audio._beds.get( 'kayak_push_theirs' );
	return !! b && b.gain.gain.value > 0.01;

} );

writeFileSync( OUTFILE, JSON.stringify( { tier: TIER, setup, spot, results, errors }, null, 1 ) );
log( `done, ${ errors.length } errors` );
await browser.close();
