#!/usr/bin/env node
// (M15) Every shader against what a real graphics card allows. The headless browser draws on the CPU, where a shader may
// use 32 textures a stage and thousands of uniforms; many GPUs (Direct3D 11, Metal, and what WebGL 2 promises) allow 16,
// and a shader past that doesn't link, and whatever it draws just isn't there: the sea on a laptop, in v1.11.0, for one
// texture too many. Nothing else here can see that, so run this when a shader's gained a texture or a uniform.
//
//   pnpm dev, then   node tools/gpu-limits.mjs [tiers, comma separated] [s to wait for what comes late]
//   SEA_PORT=5190 node tools/gpu-limits.mjs high     (a dev server on another port than 5189)
//
// It goes round the places whose shaders load only when you're near, and exits 1 if anything's over.

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join( dirname( fileURLToPath( import.meta.url ) ), '..' );
const { chromium } = await import( join( ROOT, '../all-the-spaces/node_modules/playwright/index.mjs' ) );

// (textures: the floor WebGL 2 promises, and what Direct3D 11 and Metal give. Uniforms: what they commonly give, WebGL 2's
// floor of 224 being far under what any device here runs at. Varyings aren't counted: three's sources are full of those
// #if'd out, and the compiled ones can't be read here)
const LIMITS = { fragment: 16, vertex: 16, combined: 32, fragmentUniforms: 1024, vertexUniforms: 1024, attributes: 16 };
const [ TIERS = 'high,mid,low', WAIT = '120' ] = process.argv.slice( 2 );
const browser = await chromium.launch( { args: [ '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist' ] } );
let over = 0;
for ( const tier of TIERS.split( ',' ) ) {

	const page = await browser.newPage( { viewport: { width: 480, height: 270 } } );
	await page.goto( `http://127.0.0.1:${ process.env.SEA_PORT || 5189 }/?tier=${ tier }&hour=11&weather=fair&day=5&fullsea`, { waitUntil: 'domcontentloaded', timeout: 300000 } );
	await page.waitForFunction( () => window.__app && window.__app._started, null, { timeout: 600000, polling: 1000 } );
	await page.waitForTimeout( + WAIT * 1000 );
	// (the fish camp, the windward reef and the sea caves load as you come near)
	for ( const [ x, z ] of [ [ 116, - 870 ], [ - 460, - 760 ], [ - 542, - 378 ], [ - 6200, 7400 ] ] ) {

		await page.evaluate( ( [ x, z ] ) => {

			const a = window.__app, p = a.player, b = a.boatCtl;
			if ( p.mode !== 'boat' ) { p.boardBoat(); p.takeHelm(); }
			b.moored = false;
			b.position.set( x, b.position.y, z );

		}, [ x, z ] );
		await page.waitForTimeout( 20000 );

	}

	const rows = await page.evaluate( () => {

		const a = window.__app, gl = a.renderer.getContext();
		const samplers = new Set( [ gl.SAMPLER_2D, gl.SAMPLER_3D, gl.SAMPLER_CUBE, gl.SAMPLER_2D_ARRAY, gl.SAMPLER_2D_SHADOW, gl.SAMPLER_CUBE_SHADOW, gl.SAMPLER_2D_ARRAY_SHADOW, gl.INT_SAMPLER_2D, gl.UNSIGNED_INT_SAMPLER_2D ] );
		const vectors = ( t ) => t === gl.FLOAT_MAT4 ? 4 : t === gl.FLOAT_MAT3 ? 3 : t === gl.FLOAT_MAT2 ? 2 : 1;
		const out = [];
		for ( const p of a.renderer.info.programs ) {

			const src = {};
			for ( const s of gl.getAttachedShaders( p.program ) ) src[ gl.getShaderParameter( s, gl.SHADER_TYPE ) === gl.VERTEX_SHADER ? 'v' : 'f' ] = gl.getShaderSource( s );
			const uses = ( text, name ) => new RegExp( `\\b${ name.split( '.' ).pop() }\\b` ).test( text );
			const r = { name: p.name || '(unnamed)', fragment: 0, vertex: 0, combined: 0, fragmentUniforms: 0, vertexUniforms: 0, attributes: gl.getProgramParameter( p.program, gl.ACTIVE_ATTRIBUTES ), linked: gl.getProgramParameter( p.program, gl.LINK_STATUS ) };
			for ( let i = 0, n = gl.getProgramParameter( p.program, gl.ACTIVE_UNIFORMS ); i < n; i ++ ) {

				const u = gl.getActiveUniform( p.program, i ), name = u.name.replace( /\[0\]$/, '' ), f = uses( src.f, name ), v = uses( src.v, name );
				if ( samplers.has( u.type ) ) {

					r.combined += u.size;
					if ( f ) r.fragment += u.size;
					if ( v ) r.vertex += u.size;

				} else {

					if ( f ) r.fragmentUniforms += u.size * vectors( u.type );
					if ( v ) r.vertexUniforms += u.size * vectors( u.type );

				}

			}

			out.push( r );

		}

		return out;

	} );
	const most = {};
	for ( const r of rows ) for ( const k of Object.keys( LIMITS ) ) if ( ! most[ k ] || r[ k ] > most[ k ][ 0 ] ) most[ k ] = [ r[ k ], r.name ];
	console.log( `${ tier }: ${ rows.length } shaders` );
	for ( const k of Object.keys( LIMITS ) ) console.log( `  ${ ( most[ k ][ 0 ] > LIMITS[ k ] ? 'OVER' : 'ok  ' ) } ${ k.padEnd( 17 ) } ${ String( most[ k ][ 0 ] ).padStart( 5 ) } of ${ LIMITS[ k ] }  ${ most[ k ][ 1 ] }` );
	for ( const r of rows ) {

		const bad = Object.keys( LIMITS ).filter( ( k ) => r[ k ] > LIMITS[ k ] );
		if ( ! r.linked ) bad.push( 'not linked' );
		if ( bad.length ) { over ++; console.log( `  OVER ${ r.name }: ${ bad.map( ( k ) => `${ k } ${ r[ k ] ?? '' }` ).join( ', ' ) }` ); }

	}

	await page.close();

}

await browser.close();
if ( over ) process.exit( 1 );
console.log( 'all within what a graphics card allows' );
