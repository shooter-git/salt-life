#!/usr/bin/env node
// (M17 step 4) The looks fixed in step 4 (docs/m17/looks.md), drawn headless in the real game: the flare by night and by day,
// near and far; barn red and navy on the console and the sportfisher in sun and in shade, at sea and at their berths; the
// lobster boat's topsides in shade; the sportfisher's underwater lights from her deck, her bridge and off her side. Drawn on
// the CPU (Chromium on SwiftShader, from All the Spaces' Playwright) into <out>/<tier>/, with what each shot read.
//
//   a dev server on LOOK_PORT (5241: .claude/launch.json's "salt-life-looks"), then
//   node tools/looks/look.mjs <out> [tier] [groups]        groups: paint,berth,lobster,pool,flare (all of them by default)
//   (ALL_THE_SPACES: its checkout, if it isn't ../all-the-spaces. A load takes some minutes on the CPU, each shot tens of
//   seconds. Don't edit src while it runs.)

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath( new URL( '../..', import.meta.url ) );
const ATS = process.env.ALL_THE_SPACES || join( ROOT, '../all-the-spaces' );
const { chromium } = await import( join( ATS, 'node_modules/playwright/index.mjs' ) );
const [ OUTDIR = join( ROOT, 'qa-output/looks' ), TIER = 'mid', GROUPS = 'paint,lobster,pool,berth,flare' ] = process.argv.slice( 2 );
const PORT = process.env.LOOK_PORT || 5241;
const OUT = join( OUTDIR, TIER );
mkdirSync( OUT, { recursive: true } );
const T0 = Date.now();
const log = ( ...a ) => console.log( `[${ ( ( Date.now() - T0 ) / 1000 ).toFixed( 0 ) } s]`, ...a );

// at sea: well off the west side in deep water (night.mjs' spot)
const SEA = [ - 2600, 3000 ];
const RED = 'red', NAVY = 'navy';
// a shot: the boat you're in (`boat`, `paint`: a Fleet PAINTS id or null, as she came), where she lies (`at`: 'sea' or
// 'berth'), the hour, the camera (`cam`: 'sun' | 'shade' | 'deck' | 'bridge' | 'side' | 'stern' | [ x, y, z, tx, ty, tz ]),
// the boats you own and aren't in, with their paint (`own`), her underwater lights (`under`), a flare (`flare`: m off, west)
const SHOTS = {
	paint: [
		...[ [ 'console', RED ], [ 'console', null ], [ 'sportfisher', RED ], [ 'sportfisher', NAVY ] ].flatMap( ( [ boat, paint ] ) => [ 'sun', 'shade', 'shade-near' ].map( ( cam ) => ( {
			name: `${ boat }-${ paint || 'own' }-${ cam }`, boat, paint, at: 'sea', hour: 10.5, cam, fov: cam === 'shade-near' ? 50 : 32,
		} ) ) ),
	],
	lobster: [ 'sun', 'shade' ].map( ( cam ) => ( { name: `lobster-white-${ cam }`, boat: 'lobster', paint: null, at: 'sea', hour: 10.5, cam, fov: 32 } ) ),
	pool: [ 'deck', 'bridge', 'side', 'stern' ].map( ( cam ) => ( { name: `pool-${ cam }`, boat: 'sportfisher', paint: null, at: 'sea', hour: 22.5, cam, under: true, fov: cam === 'side' || cam === 'stern' ? 45 : 70 } ) ),
	berth: [
		{ name: 'berth-red-west', boat: 'kayak', at: 'berth', hour: 10.5, cam: [ 30, 2.4, 47, 52, 0.6, 39 ], fov: 50, own: { console: RED, sportfisher: RED } },
		{ name: 'berth-red-east', boat: 'kayak', at: 'berth', hour: 10.5, cam: [ 72, 2.4, 47, 50, 0.6, 39 ], fov: 50, own: { console: RED, sportfisher: RED } },
		{ name: 'berth-navy-west', boat: 'kayak', at: 'berth', hour: 10.5, cam: [ 30, 2.4, 47, 52, 0.6, 39 ], fov: 50, own: { console: null, sportfisher: NAVY } },
		{ name: 'berth-navy-east', boat: 'kayak', at: 'berth', hour: 10.5, cam: [ 72, 2.4, 47, 50, 0.6, 39 ], fov: 50, own: { console: null, sportfisher: NAVY } },
		{ name: 'berth-afternoon-west', boat: 'kayak', at: 'berth', hour: 15.5, cam: [ 30, 2.4, 47, 52, 0.6, 39 ], fov: 50, own: { console: RED, sportfisher: NAVY } },
	],
	flare: [
		...[ 100, 300, 2000, 8000 ].map( ( m ) => ( { name: `flare-night-${ m }`, boat: 'console', paint: null, at: 'sea', hour: 22.5, cam: 'west', flare: m } ) ),
		...[ 300, 1500, 3000 ].map( ( m ) => ( { name: `flare-day-${ m }`, boat: 'console', paint: null, at: 'sea', hour: 11, cam: 'west', flare: m } ) ),
	],
};
const shots = GROUPS.split( ',' ).flatMap( ( g ) => SHOTS[ g ] || [] );

const browser = await chromium.launch( { args: [ '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist' ] } );
const page = await browser.newPage( { viewport: { width: 1280, height: 720 } } );
page.setDefaultTimeout( 900000 );
const errors = [];
page.on( 'pageerror', ( e ) => errors.push( e.message ) );
page.on( 'console', ( m ) => m.type() === 'error' && errors.push( m.text() ) );
await page.goto( `http://127.0.0.1:${ PORT }/?tier=${ TIER }&weather=calm&hour=10.5&boat=${ shots[ 0 ].boat }&fullsea` );
await page.waitForFunction( () => window.__app && window.__app._started && window.__app.game, null, { timeout: 900000 } );
log( 'started' );
await page.waitForFunction( () => window.__app._plantsGrown, null, { timeout: 900000 } ).catch( () => log( 'no plants yet' ) );
log( 'the island all there' );

await page.evaluate( async ( SEA ) => {

	const a = window.__app, cam = a.camera, { G } = await import( '/src/core/Globals.js' ), THREE = await import( '/src/engine/index.js' );
	const up = new THREE.Vector3( 0, 1, 0 ), v = new THREE.Vector3(), w = new THREE.Vector3();
	// the clock held (window.__hour), no clouds over the sun, nobody's clock jumping her off her helm
	setInterval( () => {

		const h = window.__hour;
		if ( h === undefined ) return;
		a.settings.timeSpeed = 0;
		a.settings.timeOfDay = h;
		const t = a.together;
		if ( t && t._clock ) t._clock = { ...t._clock, at: Date.now(), day: a.settings.day, hour: h, speed: 0 };
		if ( a.game.daysOut ) a.game.daysOut._T = null;

	}, 300 );
	const wu = a.weather.update.bind( a.weather );
	a.weather.update = function ( ...args ) {

		wu( ...args );
		if ( this.live ) this.live.coverage = 0;

	};

	const place = () => {

		const L = window.__look;
		if ( ! L ) return;
		const c = a.boatCtl, sea = G.seaLevel.value;
		if ( L.at === 'sea' ) {

			// she lies where she's put, her beam to the sun (starboard) for the paint, her bow north for the rest
			const h = L.heading;
			c.position.set( L.x, c.position.y, L.z );
			c.mooring.anchor.set( L.x, sea, L.z );
			c.mooring.heading = h;
			c.moored = true;
			if ( ! L.settled ) {

				c.quaternion.setFromAxisAngle( up, h );
				c.position.y = sea;
				c.velocity.set( 0, 0, 0 );
				c.angular.set( 0, 0, 0 );
				L.settled = true;

			}

		}

		let C = L.cam;
		if ( typeof C === 'string' ) {

			// from her frame: ( across to starboard, up, aft ) about her, looking at a point in her frame
			const b = a.boat, len = b.lines ? b.lines.length : 8, f = c.forward ? c.forward( v ) : v.set( Math.sin( c.getYaw() ), 0, Math.cos( c.getYaw() ) );
			f.y = 0;
			f.normalize();
			const s = w.set( - f.z, 0, f.x ); // (starboard: her +X is port)
			const P = c.position, at = ( across, y, along ) => [ P.x + s.x * across + f.x * along, sea + y, P.z + s.z * across + f.z * along ];
			const sun = G.sunDir.value, sunSide = Math.sign( s.x * sun.x + s.z * sun.z ) || 1;
			if ( C === 'sun' || C === 'shade' || C === 'shade-near' ) {

				// (shade-near: from a dock's or a kayak's distance, 6 m off her side, where the air's haze is a quarter of it at 20 m)
				const k = ( C === 'sun' ? 1 : - 1 ) * sunSide, d = C === 'shade-near' ? 6 : len * 1.25 + 4;
				C = [ ...at( k * d, 2.2, - len * 0.12 ), ...at( 0, 0.9, 0 ) ];

			} else if ( C === 'deck' ) C = [ ...at( 1.3, 2.7, - len / 2 + 0.9 ), ...at( - 0.5, - 0.6, - len / 2 - 4.5 ) ];
			else if ( C === 'bridge' ) C = [ ...at( 0.3, 6.6, - len / 2 + 5.8 ), ...at( 0, - 0.5, - len / 2 - 7 ) ];
			else if ( C === 'side' ) C = [ ...at( 22, 2.2, - len / 2 + 2 ), ...at( 0, 0.2, - len / 2 - 1 ) ];
			else if ( C === 'stern' ) C = [ ...at( 6, 2.0, - len / 2 - 26 ), ...at( 0, 0.4, - len / 2 ) ];
			else if ( C === 'west' ) C = [ P.x - 10, sea + 2.4, P.z + 6, P.x - 1000, sea + 2.4 + Math.tan( L.pitch ) * 990, P.z + 6 ];

		}

		cam.position.set( C[ 0 ], C[ 1 ], C[ 2 ] );
		cam.up.set( 0, 1, 0 );
		cam.lookAt( C[ 3 ], C[ 4 ], C[ 5 ] );
		const fov = L.fov || 70;
		if ( cam.far !== 12000 || cam.fov !== fov ) {

			cam.far = 12000;
			cam.fov = fov;
			cam.updateProjectionMatrix();

		}

		cam.updateMatrixWorld();
		G.cameraUnderwater.value = 0;
		// (what the frame worked out from the camera before it was put here, again for this one: the flare's size and how bright,
		// the lamps' places in its view. A frame runs them against the player's own camera, ashore by the dock)
		if ( L.flare && a.game.daysOut.flare ) a.game.daysOut._updateFlare( 0 );
		if ( a.localLights ) a.localLights.update( cam, 0 );
		// (a flare held at the top of its climb, burning)
		const d = a.game.daysOut, F = L.flare && d.flare;
		if ( F ) {

			F.t = 3.5;
			const o = F.sprite || F.point || F.obj;
			if ( o && F.sprite ) o.position.y = sea + 111;

		}

	};

	const draw = a.drawWorld.bind( a ), water = a.water.update.bind( a.water ), ground = a.terrain.update.bind( a.terrain );
	a.terrain.update = function ( camera ) {

		place();
		ground( camera );

	};

	a.water.update = function ( camera ) {

		place();
		water( camera );

	};

	a.drawWorld = function () {

		place();
		draw();
		window.__frames = ( window.__frames || 0 ) + 1;

	};

	// she's yours, or not, painted as asked; you're ashore to change boats
	window.__stage = async ( L ) => {

		const st = a.game.state, p = a.player;
		window.__look = null;
		window.__hour = L.hour;
		for ( const id of [ 'kayak', 'console', 'lobster', 'sportfisher' ] ) if ( ! st.owns( id ) ) st.addBoat( id );
		if ( p.mode === 'boat' ) p.leaveHelm();
		if ( p.mode === 'deck' ) p.deckToWorld();
		if ( a.boat.id !== L.boat ) {

			a.boatCtl.reset();
			const ok = await a.setBoat( L.boat );
			if ( ! ok ) return `setBoat ${ L.boat } failed (mode ${ p.mode })`;

		}

		if ( L.paint !== undefined ) st.fleet[ L.boat ].paint = L.paint;
		for ( const [ id, paint ] of Object.entries( L.own || {} ) ) st.fleet[ id ].paint = paint;
		st.upgrades.sfUnderwaterLights = L.under ? 1 : 0;
		if ( a.game.fleet ) a.game.fleet._dirty = true; // (the boats at their berths dressed again: FleetDesk)
		a.game.applyGear();
		if ( a.game.fleet && a.game.fleet.look ) a.game.fleet.look();
		if ( L.at === 'berth' ) a.boatCtl.reset();
		else {

			// her starboard to the sun for the paint (heading: where her bow points, from +Z)
			const sun = G.sunDir.value;
			L.heading = L.cam === 'sun' || L.cam === 'shade' || L.cam === 'shade-near' ? Math.atan2( - sun.z, sun.x ) : 0;
			L.x = SEA[ 0 ];
			L.z = SEA[ 1 ];
			L.pitch = L.flare ? Math.min( 0.4, Math.atan2( 111, L.flare ) * 0.75 ) : 0;
			if ( L.flare ) d0( L.flare );

		}

		window.__look = L;
		return 'ok';

	};

	// a flare L m to the west of where the camera stands, burning at the top of its climb
	const d0 = ( m ) => {

		const d = a.game.daysOut;
		d._launch( SEA[ 0 ] - 10 - m, SEA[ 1 ] + 6 );

	};

	// (the HUD out of the shots)
	const canvas = a.renderer.domElement;
	for ( const el of document.body.querySelectorAll( '*' ) ) if ( el !== canvas && ! el.contains( canvas ) ) el.style.visibility = 'hidden';

}, SEA );

const frames = async ( n ) => {

	const from = await page.evaluate( () => window.__frames || 0 );
	await page.waitForFunction( ( to ) => ( window.__frames || 0 ) >= to, from + n, { timeout: 900000, polling: 500 } );

};

const results = [];
let lastHour = null;
for ( const S of shots ) {

	const said = await page.evaluate( ( L ) => window.__stage( L ), S );
	if ( said !== 'ok' ) {

		log( 'skip', S.name, said );
		continue;

	}

	// (a new hour: the sky's reflections and the clouds' panorama made again)
	await frames( S.hour !== lastHour ? ( TIER === 'low' ? 30 : 18 ) : 8 );
	lastHour = S.hour;
	await page.screenshot( { path: join( OUT, S.name + '.png' ) } );
	const info = await page.evaluate( () => new Promise( ( done ) => requestAnimationFrame( () => {

		const a = window.__app, r = ( x ) => Number( x.toFixed( 3 ) ), R = a.renderer, gl = R.getContext();
		// ((M17) the canvas's alpha, read straight after the game's frame: under 1, the page behind it shows through (SeenInWater);
		// and how many programs leave a boat's height in it)
		let under = null;
		if ( R.getRenderTarget() === null ) {

			const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight, px = new Uint8Array( w * h * 4 );
			gl.readPixels( 0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px );
			under = 0;
			for ( let i = 3; i < px.length; i += 4 ) if ( px[ i ] < 255 ) under ++;

		}

		const heights = R.info.programs.filter( ( p ) => gl.getAttachedShaders( p.program ).some( ( x ) => gl.getShaderParameter( x, gl.SHADER_TYPE ) === gl.FRAGMENT_SHADER && gl.getShaderSource( x ).includes( 'vSeenY' ) ) ).length;
		done( { hour: r( a.settings.timeOfDay ), boat: a.boat.id, programs: R.info.programs.length, calls: R.info.render.calls, lights: a.localLights ? a.localLights.active : null, alphaUnder1: under, heights } );

	} ) ) );
	results.push( { shot: S.name, ...info } );
	log( 'shot', S.name, JSON.stringify( info ) );

}

if ( errors.length ) log( 'errors:', errors.slice( 0, 6 ) );
results.push( { errors: errors.slice( 0, 12 ) } );
await browser.close();
writeFileSync( join( OUT, 'results.json' ), JSON.stringify( results, null, 1 ) );
log( 'done', OUT );
