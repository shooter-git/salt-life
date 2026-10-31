import * as THREE from '../engine/index.js';

// (M15) The island seen from far off. Its ground's drawn about you only so far (Terrain's CDLOD: some 4 km),
// its trees and houses less far, and nothing past the far plane (12 km): so from a few kilometres out it was
// gone, where a real high island stands on the horizon for twenty and more. This is its far shape: its ground
// every 16 m, coloured as it reads from far off (the forest's dark canopy, the meadows, the bare basalt, the
// beaches' sand), drawn a little under the real ground (where that's drawn, it's in front), and:
//   - hazed at its true distance by the scene's haze (materials/HeightHaze.js: the marine layer and the fine
//     aerosol, thinning with height; the distance fog's only on the low land): the summit still a shape at
//     20 km on a fair day, gone by 25 or so, sooner in rain;
//   - set down by the earth's curve (as a light's horizon is: Glare.horizonOf), refraction's 0.13 taken: the
//     beaches go under the horizon first, past 10 to 15 km only the hills show, then only the summit;
//   - past the far plane, pulled in toward you and shrunk by as much (as the lights' glares are), so it's the
//     size it would be.
//   const far = new FarIsland( { scene, terrain } ); far.update( camera )
//   curveDrop( d, eye ) -> m: how far a point d m off is set down under the sea's horizon for an eye eye m up

const STEP = 16; // m
const SINK = 1.5; // m: under the real ground
const EARTH = 6371000 / ( 1 - 0.13 ); // m: the earth's radius as the light bends round it
const PULL = 10500; // m: no further than this (the far plane's 12 km)
const SHOW = 1500; // m from its middle: drawn past this

export function curveDrop( d, eye ) {

	const k = Math.max( 0, d - Math.sqrt( 2 * EARTH * Math.max( eye, 0.5 ) ) );
	return k * k / ( 2 * EARTH );

}

// sRGB colours as the island reads from a few kilometres (its canopy darker than its ground)
const C = ( r, g, b ) => new THREE.Color().setRGB( r, g, b, THREE.SRGBColorSpace );
const FOREST = C( 0.11, 0.14, 0.075 ), MEADOW = C( 0.27, 0.31, 0.14 ), ROCK = C( 0.25, 0.235, 0.21 ), SAND = C( 0.78, 0.71, 0.56 ), WET = C( 0.48, 0.43, 0.34 );

export class FarIsland {

	constructor( { scene, terrain } ) {

		this.terrain = terrain;
		const g = this.geometry = this._build( terrain );
		g.computeBoundingBox();
		const bb = g.boundingBox;
		this.middle = new THREE.Vector3( ( bb.min.x + bb.max.x ) / 2, 0, ( bb.min.z + bb.max.z ) / 2 );
		this.radius = Math.hypot( bb.max.x - bb.min.x, bb.max.z - bb.min.z ) / 2;
		this.top = bb.max.y;
		const m = this.material = new THREE.MeshStandardMaterial( { vertexColors: true, roughness: 0.92, metalness: 0, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 4 } );
		m.name = 'FarIsland';
		m.onBeforeCompile = ( sh ) => {

			sh.vertexShader = sh.vertexShader
				.replace( '#include <common>', /* glsl */`#include <common>
varying float vFarY;
// how far the earth's curve has set ( a point d m off ) down under the sea's horizon, for an eye hc up
float farDrop( float d, float hc ) {
	float dh = sqrt( 2.0 * ${ EARTH.toFixed( 1 ) } * max( hc, 0.5 ) );
	float k = max( 0.0, d - dh );
	return k * k / ${ ( 2 * EARTH ).toFixed( 1 ) };
}` )
				.replace( '#include <fog_vertex>', /* glsl */`#include <fog_vertex>
	// (its true place: the attribute, the world's; set down by the earth's curve; the haze reckoned there)
	{
		vec3 trueW = position;
		trueW.y -= farDrop( length( trueW.xz - cameraPosition.xz ), cameraPosition.y );
		vFarY = trueW.y;
#ifdef USE_FOG
		vFogWorld = trueW;
		vFogDepth = length( trueW - cameraPosition );
#endif
	}` );
			sh.fragmentShader = sh.fragmentShader
				.replace( '#include <common>', '#include <common>\nvarying float vFarY;' )
				// (the haze toward the horizon as the sky draws it behind: the fog's colour a little greyer and darker
				// (on low its sky's horizon is greyer than its fog): it read as a pale blue blob on the sky at 10 km)
				.replace( '#include <fog_fragment>', /* glsl */`
#ifdef USE_FOG
	vec3 farHaze = mix( vec3( dot( fogColor, vec3( 0.2126, 0.7152, 0.0722 ) ) ), fogColor, 0.75 ) * 0.95;
	gl_FragColor.rgb = mix( gl_FragColor.rgb, farHaze, sceneFogFactor() );
#endif` )
				// (under the sea's horizon: not seen)
				.replace( '#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>\n\tif ( vFarY + ${ SINK.toFixed( 2 ) } < 0.0 ) discard;` );

		};

		this.mesh = new THREE.Mesh( g, m );
		this.mesh.name = 'FarIsland';
		this.mesh.frustumCulled = false;
		this.mesh.matrixAutoUpdate = false;
		this.mesh.visible = false;
		scene.add( this.mesh );

	}

	// its ground every STEP m (world coordinates), coloured; only the cells that reach out of the sea
	_build( T ) {

		const half = T.size / 2, n = Math.floor( T.size / STEP ) + 1, x0 = - half, z0 = - half;
		const H = new Float32Array( n * n ), pos = [], col = [], idx = [], map = new Int32Array( n * n ).fill( - 1 );
		for ( let j = 0; j < n; j ++ ) for ( let i = 0; i < n; i ++ ) H[ j * n + i ] = T.heightAt( x0 + i * STEP, z0 + j * STEP );
		const mask = ( a, x, z, scale ) => {

			if ( ! a ) return 0;
			const i = Math.min( T.res - 1, Math.max( 0, Math.floor( ( x - T.origin ) / T.texel ) ) ), j = Math.min( T.res - 1, Math.max( 0, Math.floor( ( z - T.origin ) / T.texel ) ) );
			return a[ j * T.res + i ] * scale;

		};
		const c = new THREE.Color();
		const vertex = ( i, j ) => {

			const k = j * n + i;
			if ( map[ k ] >= 0 ) return map[ k ];
			const x = x0 + i * STEP, z = z0 + j * STEP, h = H[ k ];
			// its look: bare where it's steep or rock, sand on the beaches, the forest over the rest, meadow on the
			// gentle low ground
			const sx = ( H[ j * n + Math.min( n - 1, i + 1 ) ] - H[ j * n + Math.max( 0, i - 1 ) ] ) / ( 2 * STEP ), sz = ( H[ Math.min( n - 1, j + 1 ) * n + i ] - H[ Math.max( 0, j - 1 ) * n + i ] ) / ( 2 * STEP );
			const slope = Math.hypot( sx, sz ), rock = Math.max( mask( T.rock, x, z, 1 ), Math.min( 1, Math.max( 0, ( slope - 0.7 ) / 0.4 ) ) );
			const sand = mask( T.sand, x, z, 1 / 255 ) * ( h < 4 ? 1 : 0 );
			c.copy( FOREST ).lerp( MEADOW, Math.max( 0, Math.min( 1, ( 0.3 - slope ) / 0.2 ) ) * ( h < 40 ? 1 : 0 ) * 0.7 );
			c.lerp( ROCK, Math.min( 1, rock ) * 0.85 );
			c.lerp( h < 1 ? WET : SAND, Math.min( 1, sand * 1.2 ) );
			map[ k ] = pos.length / 3;
			pos.push( x, h - SINK, z );
			col.push( c.r, c.g, c.b );
			return map[ k ];

		};

		for ( let j = 0; j < n - 1; j ++ ) for ( let i = 0; i < n - 1; i ++ ) {

			const k = j * n + i;
			if ( Math.max( H[ k ], H[ k + 1 ], H[ k + n ], H[ k + n + 1 ] ) < - 4 ) continue;
			const a = vertex( i, j ), b = vertex( i + 1, j ), d = vertex( i, j + 1 ), e = vertex( i + 1, j + 1 );
			idx.push( a, d, b, b, d, e );

		}

		const g = new THREE.BufferGeometry();
		g.setAttribute( 'position', new THREE.Float32BufferAttribute( pos, 3 ) );
		g.setAttribute( 'color', new THREE.Float32BufferAttribute( col, 3 ) );
		g.setIndex( idx );
		g.computeVertexNormals();
		return g;

	}

	update( camera ) {

		const p = camera.position, d = Math.hypot( p.x - this.middle.x, p.z - this.middle.z );
		const m = this.mesh;
		m.visible = d > SHOW;
		if ( ! m.visible ) return;
		// (past the far plane: pulled in toward you and shrunk by as much: p' = cam + ( p - cam ) s)
		const s = Math.min( 1, PULL / ( d + this.radius ) );
		m.matrix.makeScale( s, s, s ).setPosition( p.x * ( 1 - s ), p.y * ( 1 - s ), p.z * ( 1 - s ) );
		m.matrixWorldNeedsUpdate = true;

	}

}
