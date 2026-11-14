#!/usr/bin/env node
// (M20) The moon in the sea (stream SEA: docs/m20/sea.md): its path on the water at a few heights, at night and in the twilight, in
// each weather, from a boat offshore looking toward it, and the path's width measured at its mirror point (the full width
// at half its brightness over the sea beside it, in degrees) against Cox and Munk's (docs/m20/sources-sea.md). The island's
// clock held where the moon's at the height asked, the sky clear. Drawn on the CPU (Chromium on SwiftShader, from All the
// Spaces' Playwright), into <out>/<tier>/ with the readings in moon-sea.json.
//
//   a dev server on LOOK_PORT (5241), then
//   node tools/moon/sea.mjs <out> [tier] [heights] [weathers] [when]
//   node tools/moon/sea.mjs qa-output/moon-sea mid 5,10,20 calm,fair,breezy night,twilight
//   (MOON_K=k: the share of Cox and Munk's slopes the glint's own spread takes, for the trials: WaterSurface's MOON_SLOPE)
//
// Each shot: 960 by 540, a 40 degree lens, the eye 2.2 m over the sea, the horizon a fifth of the way down; the width is
// read on the rows a degree either side of the mirror point, over four frames as the waves move. Don't edit src while it runs.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { moonSky, sunAt } from '../../src/sky/Moon.js';

const ROOT = fileURLToPath( new URL( '../..', import.meta.url ) );
const ATS = process.env.ALL_THE_SPACES || join( ROOT, '../all-the-spaces' );
const { chromium } = await import( join( ATS, 'node_modules/playwright/index.mjs' ) );
const [ OUTDIR = join( ROOT, 'qa-output/moon-sea' ), TIER = 'mid', HEIGHTS = '5,10,20', WEATHERS = 'calm,fair,breezy', WHEN = 'night,twilight' ] = process.argv.slice( 2 );
const PORT = process.env.LOOK_PORT || 5241;
const OUT = join( OUTDIR, TIER );
mkdirSync( OUT, { recursive: true } );
const T0 = Date.now();
const log = ( ...a ) => console.log( `[${ ( ( Date.now() - T0 ) / 1000 ).toFixed( 0 ) } s]`, ...a );
const W = 960, H = 540, FOV = 40, EYE = 2.2, DEG = Math.PI / 180;
// a shot's pixel back to the light before the tone curve (three's ACES fit, undone: its output matrix, its curve, its input
// matrix; at a scale of the exposure's): the luminance, for the path's width at half its brightness as light, not as shown.
// A pixel at 255 can't be undone: the widths say whether the path's core was clipped
const srgb = ( c ) => ( c /= 255, c <= 0.04045 ? c / 12.92 : Math.pow( ( c + 0.055 ) / 1.055, 2.4 ) );
const inv3 = ( m ) => {

	const [ a, b, c, d, e, f, g, h, i ] = m, A = e * i - f * h, B = - ( d * i - f * g ), C = d * h - e * g, det = a * A + b * B + c * C;
	return [ A / det, - ( b * i - c * h ) / det, ( b * f - c * e ) / det, B / det, ( a * i - c * g ) / det, - ( a * f - c * d ) / det, C / det, - ( a * h - b * g ) / det, ( a * e - b * d ) / det ];

};
// (row-major: three's GLSL matrices are given by columns)
const ACES_IN = [ 0.59719, 0.35458, 0.04823, 0.07600, 0.90834, 0.01566, 0.02840, 0.13383, 0.83777 ];
const ACES_OUT = [ 1.60475, - 0.53108, - 0.07367, - 0.10208, 1.10813, - 0.00605, - 0.00327, - 0.07276, 1.07602 ];
const IN_INV = inv3( ACES_IN ), OUT_INV = inv3( ACES_OUT );
const mul = ( m, x, y, z ) => [ m[ 0 ] * x + m[ 1 ] * y + m[ 2 ] * z, m[ 3 ] * x + m[ 4 ] * y + m[ 5 ] * z, m[ 6 ] * x + m[ 7 ] * y + m[ 8 ] * z ];
// RRTAndODTFit's inverse: ( x ( x + 0.0245786 ) - 0.000090537 ) / ( x ( 0.983729 x + 0.432951 ) + 0.238081 ) = v
const unfit = ( v ) => {

	v = Math.min( Math.max( v, 0 ), 1.0 );
	const a = 1 - 0.983729 * v, b = 0.0245786 - 0.432951 * v, c = - ( 0.000090537 + 0.238081 * v );
	return Math.abs( a ) < 1e-9 ? - c / b : ( - b + Math.sqrt( Math.max( b * b - 4 * a * c, 0 ) ) ) / ( 2 * a );

};

const linear = ( r, g, b ) => {

	const o = mul( OUT_INV, srgb( r ), srgb( g ), srgb( b ) ), x = mul( IN_INV, unfit( o[ 0 ] ), unfit( o[ 1 ] ), unfit( o[ 2 ] ) );
	return 0.2126 * x[ 0 ] + 0.7152 * x[ 1 ] + 0.0722 * x[ 2 ];

};

// the day and hour (the first two months) with the moon nearest `up` degrees, a good part of it lit, and the sun: at night
// more than 15 degrees down; in the twilight (dusk or dawn) 1 to 5 degrees down, the sky still blue
function when( up, kind ) {

	let best = null;
	for ( let day = 1; day <= 60; day ++ ) for ( let h = 0; h < 24; h += 0.02 ) {

		const sunUp = Math.asin( sunAt( h )[ 1 ] ) / DEG;
		if ( kind === 'night' ? sunUp > - 15 : sunUp > - 1 || sunUp < - 5 ) continue;
		const m = moonSky( ( day - 1 ) * 24 + h, h );
		if ( m.lit < 0.6 ) continue;
		const off = Math.abs( Math.asin( m.dir[ 1 ] ) / DEG - up ) - m.lit * 0.5;
		if ( ! best || off < best.off ) best = { day, hour: + h.toFixed( 2 ), off, up: + ( Math.asin( m.dir[ 1 ] ) / DEG ).toFixed( 2 ), lit: + m.lit.toFixed( 2 ), sun: + sunUp.toFixed( 1 ) };

	}

	return best;

}

const browser = await chromium.launch( { args: [ '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist' ] } );
const results = [];
for ( const weather of WEATHERS.split( ',' ) ) {

	const page = await browser.newPage( { viewport: { width: W, height: H } } );
	const errors = [];
	page.on( 'pageerror', ( e ) => errors.push( e.message ) );
	const first = when( + HEIGHTS.split( ',' )[ 0 ], WHEN.split( ',' )[ 0 ] );
	await page.goto( `http://127.0.0.1:${ PORT }/?tier=${ TIER }&weather=${ weather }&hour=${ first.hour }&day=${ first.day }&fullsea` );
	await page.waitForFunction( () => window.__app && window.__app._started && window.__app.sky.moonShown, null, { timeout: 900000 } );
	log( weather, 'started' );
	if ( process.env.MOON_K ) await page.evaluate( ( k ) => window.__moonK = k, + process.env.MOON_K );
	await page.evaluate( async () => {

		// (the game's own Globals: once src has changed under the dev server, the game's imports carry a ?t= of their own, and a
		// bare import of it would be another copy)
		window.__globalsUrl = () => performance.getEntriesByType( 'resource' ).map( ( e ) => e.name ).filter( ( u ) => /\/src\/core\/Globals\.js(\?|$)/.test( u ) ).pop() || '/src/core/Globals.js';
		const a = window.__app, cam = a.camera, { G } = await import( window.__globalsUrl() );
		// (MOON_K: the share of Cox and Munk's slopes the glint's own spread takes, WaterSurface's MOON_SLOPE.k, for the trials)
		if ( window.__moonK !== undefined ) {

			const url = performance.getEntriesByType( 'resource' ).map( ( e ) => e.name ).filter( ( u ) => /\/src\/ocean\/WaterSurface\.js(\?|$)/.test( u ) ).pop();
			( await import( url ) ).MOON_SLOPE.k = window.__moonK;

		}

		// (the sky clear: no cloud over the moon)
		const w = a.weather, up = w.update.bind( w );
		w.update = function ( ...args ) {

			up( ...args );
			if ( this.live ) this.live.coverage = 0;

		};

		const place = () => {

			const at = window.__at;
			if ( ! at ) return;
			a.settings.timeSpeed = 0;
			a.settings.day = at[ 0 ];
			a.settings.timeOfDay = at[ 1 ];
			const t = a.together;
			if ( t && t._clock ) t._clock = { ...t._clock, at: Date.now(), day: at[ 0 ], hour: at[ 1 ], speed: 0 };
			// (the weather's wind on the sea now, not at the driver's next turn)
			a.weather.apply();
			// (offshore toward the moon, 3 km out from the island's middle, looking its way with the horizon a fifth down)
			const m = a.sky.moonDir, h = Math.hypot( m.x, m.z ) || 1, sea = G.seaLevel.value;
			const x = m.x / h * 3000, z = m.z / h * 3000;
			a.player.position.set( x, sea - 1.2, z );
			cam.position.set( x, sea + window.__eye, z );
			cam.up.set( 0, 1, 0 );
			const pitch = - window.__pitch;
			cam.lookAt( x + m.x / h * Math.cos( pitch ), cam.position.y + Math.sin( pitch ), z + m.z / h * Math.cos( pitch ) );
			if ( cam.fov !== window.__fov || cam.far !== 12000 ) {

				cam.fov = window.__fov;
				cam.far = 12000;
				cam.updateProjectionMatrix();

			}

			cam.updateMatrixWorld();
			G.cameraUnderwater.value = 0;
			a.scene.fog.near = a.sky.fogNear;
			a.scene.fog.far = a.sky.fogFar;
			a.scene.fog.color.copy( G.horizonColor.value );

		};

		const draw = a.drawWorld.bind( a ), water = a.water.update.bind( a.water );
		a.water.update = function ( camera ) {

			place();
			water( camera );

		};

		a.drawWorld = function () {

			place();
			draw();
			window.__frames = ( window.__frames || 0 ) + 1;

		};

		const canvas = a.renderer.domElement;
		for ( const el of document.body.querySelectorAll( '*' ) ) if ( el !== canvas && ! el.contains( canvas ) ) el.style.visibility = 'hidden';

	} );
	const frames = async ( n ) => {

		const from = await page.evaluate( () => window.__frames || 0 );
		await page.waitForFunction( ( to ) => ( window.__frames || 0 ) >= to, from + n, { timeout: 900000, polling: 500 } );

	};

	// (the horizon a fifth of the way down: the lens pitched down by the angle that puts it there)
	const f = ( H / 2 ) / Math.tan( FOV / 2 * DEG ), pitch = Math.atan( ( H / 2 - H / 5 ) / f );
	for ( const kind of WHEN.split( ',' ) ) for ( const up of HEIGHTS.split( ',' ).map( Number ) ) {

		const N = when( up, kind );
		await page.evaluate( ( [ at, eye, p, fov ] ) => {

			window.__at = at;
			window.__eye = eye;
			window.__pitch = p;
			window.__fov = fov;

		}, [ [ N.day, N.hour ], EYE, pitch, FOV ] );
		await frames( TIER === 'low' ? 30 : 16 );
		const name = `${ weather }-${ kind }-${ up }`;
		// (four frames as the waves move; each a row's brightness across, about the mirror point)
		const rows = [];
		let shot = null;
		for ( let k = 0; k < 4; k ++ ) {

			await frames( 2 );
			const png = await page.screenshot( { path: k === 0 ? join( OUT, name + '.png' ) : undefined } );
			shot = shot || png;
			rows.push( await page.evaluate( async ( [ b64, W, H ] ) => {

				const img = new Image();
				img.src = 'data:image/png;base64,' + b64;
				await img.decode();
				const c = document.createElement( 'canvas' );
				c.width = W;
				c.height = H;
				const x = c.getContext( '2d' );
				x.drawImage( img, 0, 0 );
				return Array.from( x.getImageData( 0, 0, W, H ).data );

			}, [ png.toString( 'base64' ), W, H ] ) );

		}

		const info = await page.evaluate( async () => {

			const a = window.__app, { G } = await import( window.__globalsUrl() );
			const m = a.sky.moonDir, cam = a.camera;
			// (where the moon's mirror point is in the frame: its direction mirrored in the level sea)
			const THREE = await import( '/src/engine/index.js' );
			const p = new THREE.Vector3( m.x, - m.y, m.z ).multiplyScalar( 1000 ).add( cam.position ).project( cam );
			const hz = new THREE.Vector3( m.x, 0, m.z ).multiplyScalar( 10000 ).add( cam.position ).project( cam );
			return { moonUp: Math.asin( m.y ) * 180 / Math.PI, mirror: [ p.x, p.y ], horizon: hz.y, wind: G.windSpeed.value, glint: G.moonGlint.value.toArray(), light: G.moonLight.value.toArray(), key: G.sunDir.value.toArray() };

		} );
		// the luminance across each row a degree either side of the mirror point, the four frames averaged
		const my = Math.round( ( 1 - info.mirror[ 1 ] ) / 2 * H ), mx = Math.round( ( info.mirror[ 0 ] + 1 ) / 2 * W ), band = Math.round( f * Math.tan( 1 * DEG ) );
		const lum = ( d, i ) => linear( d[ i ], d[ i + 1 ], d[ i + 2 ] );
		const prof = new Float64Array( W );
		let n = 0;
		for ( const d of rows ) for ( let y = Math.max( 0, my - band ); y <= Math.min( H - 1, my + band ); y ++, n ++ ) for ( let x = 0; x < W; x ++ ) prof[ x ] += lum( d, ( y * W + x ) * 4 );
		for ( let x = 0; x < W; x ++ ) prof[ x ] /= n;
		// (the sea beside it: the median of the outer fifths; the peak near the mirror point; where it falls to half over that)
		const side = [ ...prof.slice( 0, W / 5 ), ...prof.slice( W * 4 / 5 ) ].sort( ( p, q ) => p - q ), bg = side[ side.length >> 1 ];
		let peak = 0, px = mx;
		for ( let x = Math.max( 0, mx - 40 ); x < Math.min( W, mx + 40 ); x ++ ) if ( prof[ x ] > peak ) {

			peak = prof[ x ];
			px = x;

		}

		const half = bg + ( peak - bg ) / 2, clipped = rows.some( ( d ) => {

			for ( let y = Math.max( 0, my - band ); y <= Math.min( H - 1, my + band ); y ++ ) for ( let x = l0( px ); x < r0( px ); x ++ ) if ( d[ ( y * W + x ) * 4 + 1 ] >= 254 ) return true;
			return false;

		} );
		let l = px, r = px;
		while ( l > 0 && prof[ l ] > half ) l --;
		while ( r < W - 1 && prof[ r ] > half ) r ++;
		const ang = ( x ) => Math.atan( ( x - W / 2 ) / f ) / DEG;
		function l0( x ) {

			return Math.max( 0, x - 60 );

		}

		function r0( x ) {

			return Math.min( W, x + 60 );

		}

		const width = my >= 0 && my < H && peak > bg * 1.2 ? + ( ang( r ) - ang( l ) ).toFixed( 2 ) : null;
		// (Cox and Munk's, for the wind: across the path, both ways the wind may blow, and the disc in quadrature: sources-sea.md)
		const U = info.wind, sA = Math.sqrt( 3.16e-3 * U ), sC = Math.sqrt( 0.003 + 1.92e-3 * U ), e = info.moonUp * DEG;
		const cm = [ sC, sA ].map( ( s ) => + Math.hypot( 2.355 * s * 2 * Math.sin( e ) / DEG, 0.52 ).toFixed( 2 ) );
		const res = { weather, kind, up, at: N, moonUp: + info.moonUp.toFixed( 2 ), wind: U, mirrorRow: my, peak: + peak.toFixed( 3 ), sea: + bg.toFixed( 3 ), clipped, width, coxMunk: cm, keyIsMoon: info.light[ 3 ], errors: errors.length };
		results.push( res );
		log( name, JSON.stringify( res ) );

	}

	await page.close();

}

writeFileSync( join( OUT, 'moon-sea.json' ), JSON.stringify( { tier: TIER, results }, null, 1 ) );
log( 'done' );
await browser.close();
