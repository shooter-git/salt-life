import * as THREE from '../engine/index.js';
import { CDLOD } from '../core/CDLOD.js';
import { G } from '../core/Globals.js';

// The island's ground, drawn with one instanced CDLOD grid (core/CDLOD.js): every vertex reads its
// height from a float texture of TerrainData's heightmap and its look from the baked masks (rock,
// sand, paths, seagrass, rubble, gullies, the beach scarp).
//
// Tidewater's terrain shader (triplanar rock, ripple fields, horizon AO, the heightfield sun shadow)
// was WGSL on WebGPU; this is the WebGL 2 version, sized by device tier: phones get a coarser grid
// and a 2 m height texture.
//
// GLSL for other materials (the water reads the sea floor): `terrain.heightUniforms` and
// `terrain.heightGlsl` define `float terrainHeightAt( vec2 xz )` (-90 outside the domain).

const LOD_GRID = { low: 16, mid: 24, high: 40 };
// an sRGB colour as a linear GLSL vec3 (shading is linear)
const rgb = ( r, g, b ) => {

	const c = new THREE.Color().setRGB( r, g, b, THREE.SRGBColorSpace );
	return `vec3( ${ c.r.toFixed( 4 ) }, ${ c.g.toFixed( 4 ) }, ${ c.b.toFixed( 4 ) } )`;

};
const HEIGHT_RES = { low: 1024, mid: 2048, high: 2048 };
const MASK_RES = 1024;

export class Terrain {

	constructor( { scene, terrainData, tier = 'low' } ) {

		this.data = terrainData;
		const half = terrainData.size / 2;

		this.lod = new CDLOD( {
			gridSize: LOD_GRID[ tier ] ?? LOD_GRID.low, leafSize: 8, levels: 9,
			heightBounds: ( x0, z0, x1, z1 ) => terrainData.boundsFor( x0, z0, x1, z1 ),
			center: { x: - half, z: - half, size: terrainData.size },
			rangeFactor: 2.0,
			prefix: 'terrainLod',
		} );

		const heightRes = HEIGHT_RES[ tier ] ?? HEIGHT_RES.low;
		this.heightTexture = heightTexture( terrainData, heightRes );
		this.heightUniforms = {
			terrainHeightMap: { value: this.heightTexture },
			// origin x, origin z, texels per metre, texels per side
			terrainHeightInfo: { value: new THREE.Vector4( terrainData.origin, terrainData.origin, heightRes / terrainData.size, heightRes ) },
		};
		this.heightGlsl = /* glsl */`
uniform highp sampler2D terrainHeightMap;
uniform vec4 terrainHeightInfo;
float terrainHeightAt( vec2 xz ) {
	vec2 f = ( xz - terrainHeightInfo.xy ) * terrainHeightInfo.z - 0.5;
	float res = terrainHeightInfo.w;
	if ( f.x < 0.0 || f.y < 0.0 || f.x >= res - 1.0 || f.y >= res - 1.0 ) return -90.0;
	ivec2 i = ivec2( floor( f ) );
	vec2 t = f - floor( f );
	float h00 = texelFetch( terrainHeightMap, i, 0 ).r;
	float h10 = texelFetch( terrainHeightMap, i + ivec2( 1, 0 ), 0 ).r;
	float h01 = texelFetch( terrainHeightMap, i + ivec2( 0, 1 ), 0 ).r;
	float h11 = texelFetch( terrainHeightMap, i + ivec2( 1, 1 ), 0 ).r;
	return mix( mix( h00, h10, t.x ), mix( h01, h11, t.x ), t.y );
}
`;

		const [ maskA, maskB ] = maskTextures( terrainData, MASK_RES );
		this.maskTextures = [ maskA, maskB ];
		this.noiseTexture = noiseTexture( 256 );

		const uniforms = {
			...this.lod.uniforms,
			...this.heightUniforms,
			terrainMaskA: { value: maskA },
			terrainMaskB: { value: maskB },
			terrainNoise: { value: this.noiseTexture },
			terrainSeaLevel: G.seaLevel,
			terrainWaterAbsorption: G.waterAbsorption,
		};

		const mat = this.material = new THREE.MeshStandardMaterial( { roughness: 0.92, metalness: 0 } );
		mat.name = 'Terrain';
		mat.onBeforeCompile = ( shader ) => {

			Object.assign( shader.uniforms, uniforms );
			shader.vertexShader = shader.vertexShader
				.replace( '#include <common>', '#include <common>\n' + this.lod.glsl + this.heightGlsl + 'varying vec3 vTerrain;\n' )
				.replace( '#include <beginnormal_vertex>', /* glsl */`
	${ this.lod.vertexNodes( 'terrainHeightAt' ) }
	vec2 tXZ = lod.worldXZ;
	float tH = terrainHeightAt( tXZ );
	// normals across at least two texels: one texel's bilinear patch shades as flat squares
	float e = max( lod.spacing, 2.0 / terrainHeightInfo.z );
	vec3 objectNormal = normalize( vec3(
		terrainHeightAt( tXZ - vec2( e, 0.0 ) ) - terrainHeightAt( tXZ + vec2( e, 0.0 ) ),
		2.0 * e,
		terrainHeightAt( tXZ - vec2( 0.0, e ) ) - terrainHeightAt( tXZ + vec2( 0.0, e ) ) ) );
	vTerrain = vec3( tXZ, tH );` )
				.replace( '#include <begin_vertex>', 'vec3 transformed = vec3( tXZ.x, tH, tXZ.y );' );

			shader.fragmentShader = shader.fragmentShader
				.replace( '#include <common>', /* glsl */`#include <common>
uniform sampler2D terrainMaskA;
uniform sampler2D terrainMaskB;
uniform sampler2D terrainNoise;
uniform float terrainSeaLevel;
uniform vec3 terrainWaterAbsorption;
uniform vec4 terrainHeightInfo;
varying vec3 vTerrain;
` )
				.replace( '#include <color_fragment>', /* glsl */`
	vec2 tUv = ( vTerrain.xy - terrainHeightInfo.xy ) / ( terrainHeightInfo.w / terrainHeightInfo.z );
	vec4 mA = texture2D( terrainMaskA, tUv ); // rock, sand, path, seagrass
	vec4 mB = texture2D( terrainMaskB, tUv ); // gully, rubble, scarp
	float n1 = texture2D( terrainNoise, vTerrain.xy * 0.031 ).r;
	float n2 = texture2D( terrainNoise, vTerrain.xy * 0.23 + 0.37 ).r;
	float nv = n1 * 0.6 + n2 * 0.4;
	float h = vTerrain.z - terrainSeaLevel;
	// tropical lawn and jungle floor, browner in the gullies
	vec3 col = mix( ${ rgb( 0.16, 0.24, 0.07 ) }, ${ rgb( 0.27, 0.32, 0.11 ) }, nv );
	col = mix( col, ${ rgb( 0.25, 0.2, 0.12 ) }, mB.r * 0.7 );
	// sand: dry above the swash, darker and browner where the sea wets it
	vec3 sand = mix( ${ rgb( 0.78, 0.7, 0.54 ) }, ${ rgb( 0.86, 0.79, 0.63 ) }, n2 );
	sand = mix( sand * ${ rgb( 0.68, 0.63, 0.56 ) }, sand, smoothstep( 0.15, 0.9, h ) );
	col = mix( col, sand, mA.g );
	col = mix( col, ${ rgb( 0.47, 0.39, 0.29 ) } * ( 0.85 + 0.3 * n2 ), mA.b ); // worn paths
	col = mix( col, ${ rgb( 0.48, 0.43, 0.38 ) } * ( 0.75 + 0.5 * n1 ), mB.b ); // the scarp's raw earth
	col = mix( col, ${ rgb( 0.36, 0.35, 0.33 ) } * ( 0.7 + 0.6 * nv ), mA.r ); // weathered volcanic rock
	col = mix( col, ${ rgb( 0.16, 0.22, 0.1 ) }, mA.a * 0.85 ); // seagrass meadows
	col = mix( col, ${ rgb( 0.22, 0.2, 0.18 ) }, mB.g * 0.8 ); // coral rubble
	// under the sea: the water takes the red out first, then the green, over the way down and back
	float wd = max( terrainSeaLevel - vTerrain.z, 0.0 );
	col *= exp( - terrainWaterAbsorption * wd * 1.6 );
	diffuseColor.rgb = col;
` )
				.replace( '#include <roughnessmap_fragment>', /* glsl */`#include <roughnessmap_fragment>
	roughnessFactor = mix( roughnessFactor, 0.45, ( 1.0 - smoothstep( 0.05, 0.6, h ) ) * mA.g );` );

		};

		this.mesh = new THREE.Mesh( this.lod.geometry, mat );
		this.mesh.name = 'Terrain';
		this.mesh.frustumCulled = false;
		this.mesh.receiveShadow = true;
		scene.add( this.mesh );

	}

	update( camera ) {

		this.lod.update( camera );

	}

}

// TerrainData's heights as a float texture at `res` texels per side (box-filtered when smaller)
function heightTexture( terrain, res ) {

	const src = terrain.heights, sr = terrain.res, f = sr / res;
	const data = new Float32Array( res * res );
	for ( let j = 0; j < res; j ++ ) for ( let i = 0; i < res; i ++ ) {

		let s = 0;
		for ( let b = 0; b < f; b ++ ) for ( let a = 0; a < f; a ++ ) s += src[ ( j * f + b ) * sr + i * f + a ];
		data[ j * res + i ] = s / ( f * f );

	}

	const tex = new THREE.DataTexture( data, res, res, THREE.RedFormat, THREE.FloatType );
	tex.minFilter = tex.magFilter = THREE.NearestFilter;
	tex.generateMipmaps = false;
	tex.needsUpdate = true;
	return tex;

}

// the masks, packed: A = ( rock, sand, path, seagrass ), B = ( gully, rubble, scarp, 0 )
function maskTextures( terrain, res ) {

	const sr = terrain.res, f = sr / res;
	const A = new Uint8Array( res * res * 4 ), B = new Uint8Array( res * res * 4 );
	const avg = ( arr, i, j, scale ) => {

		let s = 0;
		for ( let b = 0; b < f; b ++ ) for ( let a = 0; a < f; a ++ ) s += arr[ ( j * f + b ) * sr + i * f + a ];
		return Math.round( Math.min( 255, s * scale / ( f * f ) ) );

	};

	for ( let j = 0; j < res; j ++ ) for ( let i = 0; i < res; i ++ ) {

		const k = ( j * res + i ) * 4;
		A[ k ] = avg( terrain.rock, i, j, 255 );
		A[ k + 1 ] = avg( terrain.sand, i, j, 1 );
		A[ k + 2 ] = avg( terrain.path, i, j, 1 );
		A[ k + 3 ] = avg( terrain.seagrass, i, j, 1 );
		B[ k ] = avg( terrain.gully, i, j, 1 );
		B[ k + 1 ] = avg( terrain.rubble, i, j, 1 );
		B[ k + 2 ] = avg( terrain.scarp, i, j, 1 );

	}

	return [ A, B ].map( ( data ) => {

		const tex = new THREE.DataTexture( data, res, res, THREE.RGBAFormat );
		tex.minFilter = THREE.LinearMipmapLinearFilter;
		tex.magFilter = THREE.LinearFilter;
		tex.generateMipmaps = true;
		tex.needsUpdate = true;
		return tex;

	} );

}

// tileable value noise (two octaves), for colour variation
function noiseTexture( res ) {

	const lattice = ( n ) => {

		const g = new Float32Array( n * n );
		let s = 12345 + n;
		for ( let i = 0; i < g.length; i ++ ) {

			s = ( Math.imul( s, 1103515245 ) + 12345 ) >>> 0;
			g[ i ] = ( s >>> 8 ) / 16777216;

		}

		const at = ( i, j ) => g[ ( ( j % n + n ) % n ) * n + ( ( i % n + n ) % n ) ];
		return ( x, y ) => {

			const xi = Math.floor( x ), yi = Math.floor( y ), tx = x - xi, ty = y - yi;
			const sx = tx * tx * ( 3 - 2 * tx ), sy = ty * ty * ( 3 - 2 * ty );
			return ( at( xi, yi ) * ( 1 - sx ) + at( xi + 1, yi ) * sx ) * ( 1 - sy ) + ( at( xi, yi + 1 ) * ( 1 - sx ) + at( xi + 1, yi + 1 ) * sx ) * sy;

		};

	};

	const n8 = lattice( 8 ), n32 = lattice( 32 );
	const data = new Uint8Array( res * res * 4 );
	for ( let j = 0; j < res; j ++ ) for ( let i = 0; i < res; i ++ ) {

		const v = n8( i / res * 8, j / res * 8 ) * 0.65 + n32( i / res * 32, j / res * 32 ) * 0.35;
		const k = ( j * res + i ) * 4;
		data[ k ] = data[ k + 1 ] = data[ k + 2 ] = Math.round( v * 255 );
		data[ k + 3 ] = 255;

	}

	const tex = new THREE.DataTexture( data, res, res, THREE.RGBAFormat );
	tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
	tex.minFilter = THREE.LinearMipmapLinearFilter;
	tex.magFilter = THREE.LinearFilter;
	tex.generateMipmaps = true;
	tex.needsUpdate = true;
	return tex;

}
