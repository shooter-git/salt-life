import * as THREE from '../engine/index.js';
import { CDLOD } from '../core/CDLOD.js';
import { G } from '../core/Globals.js';
import { bakeTerrainMaps } from './terrain/TerrainBake.js';
import { getDetailTexture } from './terrain/DetailTextures.js';
import { TERRAIN_SHADING_GLSL, rot2 } from './terrain/TerrainShading.js';
import { TERRAIN_SURFACE_GLSL } from './terrain/TerrainSurface.js';
import { halfIsland } from './terrain/IslandBake.js';
import { causticTexture } from '../ocean/SeaTextures.js';

// The island's ground, drawn with one instanced CDLOD grid (core/CDLOD.js): every vertex reads its
// height from a float texture of TerrainData's heightmap. The surface is Tidewater's terrain
// material translated to GLSL (terrain/TerrainSurface.js): sand with wind ripples, pebbles, the
// wrack line and swash marks, the tall-grass meadow and the forest floor, worn paths, triplanar
// volcanic rock with moss and streaks, the eroded scarp, and the seabed's ripples, seagrass and
// rubble, from the baked maps (macro normal, rock mask, horizon AO; splat masks) and the shared
// detail texture.
//
// GLSL for other materials (the water reads the sea floor): `terrain.heightUniforms` and
// `terrain.heightGlsl` define `float terrainHeightAt( vec2 xz )` (-90 outside the domain).

const LOD_GRID = { low: 16, mid: 24, high: 40 };
const HEIGHT_RES = { low: 1024, mid: 2048, high: 2048 };
const MAP_RES = 1024; // the baked maps: 2 m is plenty for macro shading (the detail adds the rest)

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

		// the baked maps (Tidewater's TerrainBake): normal xz, rock, AO / sand, path, gully or
		// seagrass, rubble or scarp
		const mapSource = terrainData.res > MAP_RES ? { ...halfIsland( terrainData ), texel: terrainData.texel * 2, origin: terrainData.origin, pads: terrainData.pads } : terrainData;
		const maps = bakeTerrainMaps( mapSource );
		this.normalTexture = mapTexture( maps.normal, mapSource.res );
		this.splatTexture = mapTexture( maps.splat, mapSource.res );
		this.detailTexture = getDetailTexture();
		this.gustOffset = new THREE.Vector2();

		const uniforms = {
			...this.lod.uniforms,
			...this.heightUniforms,
			terrainNormalTex: { value: this.normalTexture },
			terrainSplatTex: { value: this.splatTexture },
			terrainDetailTex: { value: this.detailTexture },
			terrainMapInfo: { value: new THREE.Vector3( terrainData.origin, terrainData.origin, terrainData.size ) },
			terrainSeaLevel: G.seaLevel,
			terrainWaterAbsorption: G.waterAbsorption,
			terrainWindDir: G.windDir,
			terrainWindSpeed: G.windSpeed,
			terrainGustOffset: { value: this.gustOffset },
			terrainCaustics: { value: causticTexture() },
			terrainTime: G.time,
			terrainNight: G.night,
		};

		this.uniforms = uniforms;
		const mat = this.material = new THREE.MeshStandardMaterial( { roughness: 0.9, metalness: 0 } );
		mat.name = 'Terrain';
		if ( tier === 'low' ) mat.defines = { TERRAIN_LITE: '' };
		mat.onBeforeCompile = ( shader ) => {

			Object.assign( shader.uniforms, uniforms );
			shader.vertexShader = shader.vertexShader
				.replace( '#include <common>', '#include <common>\n' + this.lod.glsl + this.heightGlsl + 'varying vec3 vTerrain;\n' )
				.replace( '#include <beginnormal_vertex>', /* glsl */`
	${ this.lod.vertexNodes( 'terrainHeightAt' ) }
	vec2 tXZ = lod.worldXZ;
	float tH = terrainHeightAt( tXZ );
	vec3 objectNormal = vec3( 0.0, 1.0, 0.0 ); // the fragment shader takes the normal from the baked map
	vTerrain = vec3( tXZ, tH );` )
				.replace( '#include <begin_vertex>', 'vec3 transformed = vec3( tXZ.x, tH, tXZ.y );' );

			shader.fragmentShader = shader.fragmentShader
				.replace( '#include <common>', /* glsl */`#include <common>
uniform sampler2D terrainDetailTex;
uniform sampler2D terrainNormalTex;
uniform sampler2D terrainSplatTex;
uniform vec3 terrainMapInfo;
uniform float terrainSeaLevel;
uniform vec3 terrainWaterAbsorption;
uniform vec2 terrainWindDir;
uniform float terrainWindSpeed;
uniform vec2 terrainGustOffset;
uniform sampler2D terrainCaustics;
uniform float terrainTime;
uniform float terrainNight;
varying vec3 vTerrain;
vec4 terDetail( vec2 uv ) { return texture( terrainDetailTex, uv ); }
vec2 terrainUvOf( vec2 xz ) { return ( xz - terrainMapInfo.xy ) / terrainMapInfo.z; }
// macro normal xz (-1..1), rock mask, AO
vec4 terrainNormalRock( vec2 xz ) { vec4 t = texture( terrainNormalTex, terrainUvOf( xz ) ); return vec4( t.xy * 2.0 - 1.0, t.zw ); }
// sand, paths, gullies (land) or seagrass (seabed), rubble (seabed) or the beach scarp (land)
vec4 terrainSplat( vec2 xz ) { return texture( terrainSplatTex, terrainUvOf( xz ) ); }
${ TERRAIN_SHADING_GLSL }
` )
				.replace( '#include <color_fragment>', TERRAIN_SURFACE_GLSL + /* glsl */`
	// under the sea: the water takes the red out first, then the green, on the way down and back
	float cWater = max( terrainSeaLevel - h, 0.0 );
	tAlbedo *= exp( - terrainWaterAbsorption * cWater * 1.6 );
	// caustics: the net of sunlight focused by the waves, drifting over the shallow sea floor
	float cK = ss( 0.05, 0.7, cWater ) * exp( - cWater * 0.1 ) * ( 1.0 - terrainNight );
	if ( cK > 0.001 ) {
		float ca = min( texture( terrainCaustics, xz * 0.19 + terrainTime * vec2( 0.031, 0.018 ) ).r,
			texture( terrainCaustics, ${ rot2( 'xz', 0.8 ) } * 0.15 + 0.5 - terrainTime * vec2( 0.017, 0.034 ) ).r );
		tAlbedo *= 1.0 + ca * 3.0 * cK;
	}
	diffuseColor.rgb = tAlbedo;
` )
				.replace( '#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n\troughnessFactor = tRough;' )
				.replace( '#include <normal_fragment_maps>', 'normal = normalize( ( viewMatrix * vec4( tNormal, 0.0 ) ).xyz );' )
				.replace( '#include <aomap_fragment>', /* glsl */`
	reflectedLight.indirectDiffuse *= tAO;
	reflectedLight.indirectSpecular *= tAO;` );

		};

		this.mesh = new THREE.Mesh( this.lod.geometry, mat );
		this.mesh.name = 'Terrain';
		this.mesh.frustumCulled = false;
		this.mesh.receiveShadow = true;
		scene.add( this.mesh );

	}

	update( camera ) {

		this.lod.update( camera );
		// travelling gust field offset (integrated so speed/direction changes never jump)
		const wd = G.windDir.value, speed = 0.7 * G.windSpeed.value + 1.5, dt = G.dt.value;
		this.gustOffset.x += wd.x * speed * dt;
		this.gustOffset.y += wd.y * speed * dt;

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

function mapTexture( data, res ) {

	const tex = new THREE.DataTexture( data, res, res, THREE.RGBAFormat );
	tex.minFilter = THREE.LinearMipmapLinearFilter;
	tex.magFilter = THREE.LinearFilter;
	tex.generateMipmaps = true;
	tex.needsUpdate = true;
	return tex;

}
