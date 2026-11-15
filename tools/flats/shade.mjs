#!/usr/bin/env node
// (M20, stream CHECKS) A cloud's shade on the flats, the CPU's against the drawn (docs/m20/checks.md; M18's list): on high the
// clouds' shadows are drawn from a map of the sun's light through them (SkyProClouds' shadowMap), and the flats' fish see a
// cloud's shade from FlatsFishing.shadeAt. This reads the whole map back itself, and over a grid on the west's flats sets the
// drawn shade there against the CPU's own field (shadeField, what shadeAt was) and against shadeAt now (the map read back, on
// high), from above, in a fair and a breezy sky, the clock held at noon. A picture of each, its points' places on it in the JSON.
//
//   a dev server on LOOK_PORT (5241), then   node tools/flats/shade.mjs [out] [weathers: fair,breezy] [tier: high]
//   (ALL_THE_SPACES for Playwright.) Don't edit src while it runs.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath( new URL( '../..', import.meta.url ) );
const ATS = process.env.ALL_THE_SPACES || join( ROOT, '../all-the-spaces' );
const { chromium } = await import( join( ATS, 'node_modules/playwright/index.mjs' ) );
const [ OUT = join( ROOT, 'qa-output/flats/shade' ), WEATHERS = 'fair,breezy', TIER = 'high' ] = process.argv.slice( 2 );
const PORT = process.env.LOOK_PORT || 5241;
mkdirSync( OUT, { recursive: true } );
const T0 = Date.now();
const log = ( ...a ) => console.log( `[${ ( ( Date.now() - T0 ) / 1000 ).toFixed( 0 ) } s]`, ...a );
// (over the west's flats, 300 m up, looking down at the middle of the grid: its points every 20 m 400 m either way)
const MID = { x: - 690, z: - 150 }, EYE = { x: - 690, y: 300, z: - 40 }, HALF = 400, STEP = 20;

const browser = await chromium.launch( { args: [ '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist' ] } );
const results = [];
for ( const weather of WEATHERS.split( ',' ) ) {

	const page = await browser.newPage( { viewport: { width: 960, height: 540 } } );
	const errors = [];
	page.on( 'pageerror', ( e ) => errors.push( e.message ) );
	page.on( 'console', ( m ) => m.type() === 'error' && errors.push( m.text().slice( 0, 200 ) ) );
	await page.goto( `http://127.0.0.1:${ PORT }/?tier=${ TIER }&weather=${ weather }&hour=12&fullsea` );
	await page.waitForFunction( () => window.__app && window.__app._started && window.__app._plantsGrown, null, { timeout: 900000 } );
	log( 'started', weather );
	await page.evaluate( ( [ EYE, MID ] ) => {

		const a = window.__app, cam = a.camera;
		const hold = () => {

			a.settings.timeSpeed = 0;
			a.settings.timeOfDay = 12;

		};
		hold();
		setInterval( hold, 1000 );
		// (the camera put over the flats before the ground and the sea are laid out for it, and before it's drawn)
		const place = () => {

			cam.position.set( EYE.x, EYE.y, EYE.z );
			cam.up.set( 0, 1, 0 );
			cam.lookAt( MID.x, 0, MID.z );
			cam.updateMatrixWorld();

		};
		// (and before the sky, whose clouds lay their shadow map out round it)
		for ( const k of [ 'terrain', 'water', 'sky' ] ) {

			const o = a[ k ], up = o.update.bind( o );
			o.update = function ( camera, ...r ) {

				place();
				return up( camera, ...r );

			};

		}

		const draw = a.drawWorld.bind( a );
		a.drawWorld = function () {

			place();
			draw();
			window.__frames = ( window.__frames || 0 ) + 1;

		};

	}, [ EYE, MID ] );
	// (the map made round the camera's new place, and read back for the CPU at least once since)
	const url = await page.evaluate( () => performance.getEntriesByType( 'resource' ).map( ( e ) => e.name ).filter( ( u ) => /\/src\/materials\/CloudShadows\.js(\?|$)/.test( u ) ).pop() );
	await page.evaluate( async ( url ) => {

		window.__CS = ( await import( url ) ).cloudShadows;

	}, url );
	await page.waitForFunction( () => {

		const C = window.__CS, A = C.clouds && C.clouds.shadowArea.value, cam = window.__app.camera.position, R = C._read;
		return !! A && A.w > 0.5 && Math.abs( A.x - cam.x ) < 200 && Math.abs( A.y - cam.z ) < 200 && R && ( R.failed || ( R.ok && Math.abs( R.area.x - A.x ) < 1 && Math.abs( R.area.y - A.y ) < 1 ) ) && ( window.__frames || 0 ) > 30;

	}, null, { timeout: 600000, polling: 1000 } );
	await page.waitForTimeout( 3000 );
	const r = await page.evaluate( async ( [ url, MID, HALF, STEP ] ) => {

		const { cloudShadows: C } = await import( url );
		const a = window.__app, cl = C.clouds, t = cl.shadowMap, RES = t.width, A = cl.shadowArea.value.clone(), map = new Float32Array( RES * RES );
		// (read as WebGL reads any float target, RGBA floats, itself, not as CloudShadows does; and what the device says it reads the
		// map as)
		const gl = a.renderer.getContext(), fb = a.renderer.properties.get( t ).__webglFramebuffer, raw = new Float32Array( RES * RES * 4 );
		gl.bindFramebuffer( gl.FRAMEBUFFER, fb );
		const readAs = [ gl.getParameter( gl.IMPLEMENTATION_COLOR_READ_FORMAT ), gl.getParameter( gl.IMPLEMENTATION_COLOR_READ_TYPE ) ];
		gl.readPixels( 0, 0, RES, RES, gl.RGBA, gl.FLOAT, raw );
		const glErr = gl.getError();
		gl.bindFramebuffer( gl.FRAMEBUFFER, null );
		let rawMin = Infinity, rawMax = - Infinity;
		for ( let k = 0; k < RES * RES; k ++ ) {

			map[ k ] = raw[ 4 * k ];
			rawMin = Math.min( rawMin, raw[ 4 * k ] );
			rawMax = Math.max( rawMax, raw[ 4 * k ] );

		}
		// (the drawn shade from the whole map, sampled here as the sea and the ground sample it: CloudShadows' cloudShadowXZ)
		const drawn = ( x, z ) => {

			const u = ( ( x - A.x ) / A.z + 0.5 ) * RES - 0.5, v = ( ( z - A.y ) / A.z + 0.5 ) * RES - 0.5;
			const i = Math.max( 0, Math.min( RES - 2, Math.floor( u ) ) ), j = Math.max( 0, Math.min( RES - 2, Math.floor( v ) ) ), fu = u - i, fv = v - j, k = j * RES + i;
			const T = ( map[ k ] * ( 1 - fu ) + map[ k + 1 ] * fu ) * ( 1 - fv ) + ( map[ k + RES ] * ( 1 - fu ) + map[ k + RES + 1 ] * fu ) * fv;
			return Math.min( 1, Math.max( 0, 1 - T ) ) * Math.min( 1, A.w / 0.85 );

		};
		const F = a.game.flats, cam = a.camera, P = cam.position.clone(), pts = [];
		for ( let x = MID.x - HALF; x <= MID.x + HALF; x += STEP ) for ( let z = MID.z - HALF; z <= MID.z + HALF; z += STEP ) {

			P.set( x, a.terrainData.heightAt( x, z ), z ).project( cam );
			pts.push( { x, z, drawn: + drawn( x, z ).toFixed( 3 ), field: + F.shadeField( x, z ).toFixed( 3 ), now: + F.shadeAt( x, z ).toFixed( 3 ), sx: + ( ( P.x + 1 ) / 2 ).toFixed( 4 ), sy: + ( ( 1 - P.y ) / 2 ).toFixed( 4 ), seen: Math.abs( P.x ) < 1 && Math.abs( P.y ) < 1 && P.z < 1 } );

		}

		const nan = [ ...map ].filter( ( v ) => ! Number.isFinite( v ) ).length;
		return { readAs: readAs.map( ( v ) => '0x' + v.toString( 16 ) ), glErr, raw: [ + rawMin.toFixed( 3 ), + rawMax.toFixed( 3 ) ], area: A.toArray(), cover: a.sky.clouds.coverage ? a.sky.clouds.coverage.value : null, read: { ok: C._read.ok, failed: C._read.failed }, nan, mapMin: Math.min( ...map ), mapMax: Math.max( ...map ), pts };

	}, [ url, MID, HALF, STEP ] );
	// (how they agree: shaded or not at a half, how far apart, and the two fields' correlation)
	const agree = ( k ) => {

		const P = r.pts, n = P.length, same = P.filter( ( p ) => ( p.drawn >= 0.5 ) === ( p[ k ] >= 0.5 ) ).length;
		const mx = P.reduce( ( s, p ) => s + p.drawn, 0 ) / n, my = P.reduce( ( s, p ) => s + p[ k ], 0 ) / n;
		let sxy = 0, sxx = 0, syy = 0;
		for ( const p of P ) {

			sxy += ( p.drawn - mx ) * ( p[ k ] - my );
			sxx += ( p.drawn - mx ) ** 2;
			syy += ( p[ k ] - my ) ** 2;

		}

		return { same: + ( same / n ).toFixed( 3 ), off: + ( P.reduce( ( s, p ) => s + Math.abs( p.drawn - p[ k ] ), 0 ) / n ).toFixed( 3 ), r: sxx && syy ? + ( sxy / Math.sqrt( sxx * syy ) ).toFixed( 3 ) : null, shaded: + ( P.filter( ( p ) => p[ k ] >= 0.5 ).length / n ).toFixed( 3 ) };

	};
	const res = { weather, tier: TIER, cover: r.cover, area: r.area, readAs: r.readAs, glErr: r.glErr, raw: r.raw, read: r.read, mapNaN: r.nan, map: [ + r.mapMin.toFixed( 3 ), + r.mapMax.toFixed( 3 ) ], points: r.pts.length, drawnShaded: + ( r.pts.filter( ( p ) => p.drawn >= 0.5 ).length / r.pts.length ).toFixed( 3 ), field: agree( 'field' ), now: agree( 'now' ), errors: errors.slice( 0, 3 ) };
	log( weather, JSON.stringify( res ) );
	await page.screenshot( { path: join( OUT, `${ TIER }-${ weather }.png` ) } );
	writeFileSync( join( OUT, `${ TIER }-${ weather }-points.json` ), JSON.stringify( r.pts ) );
	results.push( res );
	await page.close();

}

writeFileSync( join( OUT, `${ TIER }-shade.json` ), JSON.stringify( results, null, 1 ) );
await browser.close();
