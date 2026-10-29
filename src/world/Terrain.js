import * as THREE from '../engine/index.js';
import { CDLOD } from '../core/CDLOD.js';
import { G } from '../core/Globals.js';
import { bakeTerrainMaps } from './terrain/TerrainBake.js';
import { getDetailTexture } from './terrain/DetailTextures.js';
import { TERRAIN_SHADING_GLSL, rot2, srgb } from './terrain/TerrainShading.js';
import { TERRAIN_SURFACE_GLSL } from './terrain/TerrainSurface.js';
import { halfIsland } from './terrain/IslandBake.js';
import { causticTexture } from '../ocean/SeaTextures.js';
import { SEA_CAVE_GLSL, seaCaveUniforms } from './terrain/CaveLight.js';

// The island's ground, drawn with one instanced CDLOD grid (core/CDLOD.js): every vertex reads its
// height from a float texture of TerrainData's heightmap. The surface is Tidewater's terrain
// material translated to GLSL (terrain/TerrainSurface.js): sand with wind ripples, pebbles, the
// wrack line and swash marks, the tall-grass meadow and the forest floor, worn paths, triplanar
// volcanic rock with moss and streaks, the eroded scarp, and the seabed's ripples, seagrass and
// rubble, from the baked maps (macro normal, rock mask, horizon AO; splat masks) and the shared
// detail texture.
//
// GLSL for other materials (the water reads the sea floor): `terrain.heightUniforms` and
// `terrain.heightGlsl` define `float terrainHeightAt( vec2 xz )` ((M15) past the island's square, the seabed
// out there: TerrainData's offshore map, and the deep's floor past that).
//
// (M15) The grid follows you, 512 m a step, and is drawn about its origin (core/CDLOD.js), the island's
// ground and the seabed out there alike; where it's too deep to be seen (HIDE) it isn't drawn at all. Past
// the island's baked maps its surface is the seabed's: its normal from its heights, sand, with seagrass and
// rubble in patches.

const LOD_GRID = { low: 12, mid: 24, high: 40 };
// (M14) m/s: the dry sand begins to blow, and all of it is by (TerrainSurface: its streamers)
const BLOW = [ 8, 16 ];
const HEIGHT_RES = { low: 1024, mid: 2048, high: 2048 };
const MAP_RES = 1024; // the baked maps: 2 m is plenty for macro shading (the detail adds the rest)
const ORIGIN_STEP = 512; // (M15) m: the grid's origin follows the camera this far at a time
// (M15) m: the seabed deeper than this is never seen (the sea's opaque from above past a few metres; a
// diver sees some tens of metres), and its grid's left out
const HIDE = 40;

export class Terrain {

	constructor( { scene, terrainData, tier = 'low' } ) {

		this.data = terrainData;

		// ((M15) about you: five root nodes each way, 2 km each, as far as its 4 km reaches)
		this.lod = new CDLOD( {
			gridSize: LOD_GRID[ tier ] ?? LOD_GRID.low, leafSize: 8, levels: 9,
			heightBounds: ( x0, z0, x1, z1 ) => terrainData.boundsFor( x0, z0, x1, z1 ),
			follow: ORIGIN_STEP, reach: 2, below: - HIDE,
			rangeFactor: 2.0,
			prefix: 'terrainLod',
		} );

		const heightRes = HEIGHT_RES[ tier ] ?? HEIGHT_RES.low;
		this.heightTexture = heightTexture( terrainData, heightRes );
		// ((M15) and the seabed out there: its map, as TerrainData reads it)
		const sea = terrainData.offshore;
		this.offshoreTexture = sea ? floatTexture( sea.heights, sea.res ) : floatTexture( new Float32Array( 4 ).fill( - 90 ), 2 );
		this.heightUniforms = {
			terrainHeightMap: { value: this.heightTexture },
			// origin x, origin z, texels per metre, texels per side
			terrainHeightInfo: { value: new THREE.Vector4( terrainData.origin, terrainData.origin, heightRes / terrainData.size, heightRes ) },
			offshoreHeightMap: { value: this.offshoreTexture },
			// origin (x and z), texels per metre, texels per side, the deep's floor past it (m down)
			offshoreHeightInfo: { value: sea ? new THREE.Vector4( sea.origin, 1 / sea.texel, sea.res, sea.basin ) : new THREE.Vector4( - 1, 1, 2, 90 ) },
		};
		this.heightGlsl = /* glsl */`
uniform highp sampler2D terrainHeightMap;
uniform vec4 terrainHeightInfo;
uniform highp sampler2D offshoreHeightMap;
uniform vec4 offshoreHeightInfo;
float offshoreHeightAt( vec2 xz ) {
	vec2 f = ( xz - offshoreHeightInfo.x ) * offshoreHeightInfo.y - 0.5;
	float res = offshoreHeightInfo.z;
	if ( f.x < 0.0 || f.y < 0.0 || f.x >= res - 1.0 || f.y >= res - 1.0 ) return - offshoreHeightInfo.w;
	ivec2 i = ivec2( floor( f ) );
	vec2 t = f - floor( f );
	float h00 = texelFetch( offshoreHeightMap, i, 0 ).r;
	float h10 = texelFetch( offshoreHeightMap, i + ivec2( 1, 0 ), 0 ).r;
	float h01 = texelFetch( offshoreHeightMap, i + ivec2( 0, 1 ), 0 ).r;
	float h11 = texelFetch( offshoreHeightMap, i + ivec2( 1, 1 ), 0 ).r;
	return mix( mix( h00, h10, t.x ), mix( h01, h11, t.x ), t.y );
}
float terrainHeightAt( vec2 xz ) {
	vec2 f = ( xz - terrainHeightInfo.xy ) * terrainHeightInfo.z - 0.5;
	float res = terrainHeightInfo.w;
	if ( f.x < 0.0 || f.y < 0.0 || f.x >= res - 1.0 || f.y >= res - 1.0 ) return offshoreHeightAt( xz );
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
		this.blow = new THREE.Vector4( 1, 0, 0, 0 );

		const uniforms = {
			...this.lod.uniforms,
			...this.heightUniforms,
			terrainNormalTex: { value: this.normalTexture },
			terrainSplatTex: { value: this.splatTexture },
			terrainDetailTex: { value: this.detailTexture },
			terrainMapInfo: { value: new THREE.Vector3( terrainData.origin, terrainData.origin, terrainData.size ) },
			terrainSeaLevel: G.seaLevel,
			terrainWaterAbsorption: G.waterAbsorption,
			terrainWindDir: G.windPrevailing, // (Salt Life: the sand's ripples and the grass's comb, as the trades laid them)
			terrainWindSpeed: G.windSpeed,
			terrainGustOffset: { value: this.gustOffset },
			// ((M14) the sand blowing over the dry beach: the way the wind blows, how far it's carried the
			// sand's streamers (m), and how much is blowing)
			terrainBlow: { value: this.blow },
			terrainCaustics: { value: causticTexture() },
			terrainTime: G.time,
			terrainNight: G.night,
			terrainCausticsK: G.caustics, // (M9: faint under a grey sky)
			// ((M13) what a hurricane's sea left: setStorm)
			terrainStorm: { value: new THREE.Vector4( 0, 0, 0, 1 ) },
			terrainStormPaths: { value: 0 },
		};

		this.uniforms = uniforms;
		const mat = this.material = new THREE.MeshStandardMaterial( { roughness: 0.9, metalness: 0 } );
		mat.name = 'Terrain';
		mat.userData.uniforms = uniforms;
		if ( tier === 'low' ) mat.defines = { TERRAIN_LITE: '' };
		mat.onBeforeCompile = ( shader ) => {

			Object.assign( shader.uniforms, uniforms, seaCaveUniforms );
			shader.vertexShader = shader.vertexShader
				.replace( '#include <common>', '#include <common>\n' + this.lod.glsl + this.heightGlsl + /* glsl */`
varying vec3 vTerrain;
varying vec4 vTerrainSea;
// ((M15) the grid's laid out about its origin)
float terrainHeightLocal( vec2 p ) { return terrainHeightAt( p + terrainLodAt ); }
// ((M15) past the island's baked maps: the seabed's normal ( x, z ) from its heights e m about, and how much
// is the island's still (1 in its square, 0 past it: the last 48 m blended))
vec4 terrainSeaOf( vec2 xz, float e ) {
	float island = smoothstep( 0.0, 48.0, - terrainHeightInfo.x - max( abs( xz.x ), abs( xz.y ) ) );
	if ( island > 0.999 ) return vec4( 0.0, 0.0, 1.0, 0.0 );
	vec2 g = vec2( terrainHeightAt( xz + vec2( e, 0.0 ) ) - terrainHeightAt( xz - vec2( e, 0.0 ) ),
		terrainHeightAt( xz + vec2( 0.0, e ) ) - terrainHeightAt( xz - vec2( 0.0, e ) ) ) / ( 2.0 * e );
	vec3 n = normalize( vec3( - g.x, 1.0, - g.y ) );
	return vec4( n.x, n.z, island, 0.0 );
}
` )
				.replace( '#include <beginnormal_vertex>', /* glsl */`
	${ this.lod.vertexNodes( 'terrainHeightLocal' ) }
	vec2 tXZ = lod.xz + terrainLodAt; // ((M15) the world's: the grid's drawn about its origin, near you)
	float tH = terrainHeightAt( tXZ );
	vec3 objectNormal = vec3( 0.0, 1.0, 0.0 ); // the fragment shader takes the normal from the baked map
	vTerrain = vec3( tXZ, tH );
	vTerrainSea = terrainSeaOf( tXZ, max( lod.spacing, 16.0 ) );` )
				.replace( '#include <begin_vertex>', 'vec3 transformed = vec3( lod.xz.x, tH, lod.xz.y );' );

			shader.fragmentShader = shader.fragmentShader
				.replace( '#include <common>', /* glsl */`#include <common>
${ SEA_CAVE_GLSL }
uniform sampler2D terrainDetailTex;
uniform sampler2D terrainNormalTex;
uniform sampler2D terrainSplatTex;
uniform vec3 terrainMapInfo;
uniform float terrainSeaLevel;
uniform vec3 terrainWaterAbsorption;
uniform vec2 terrainWindDir;
uniform float terrainWindSpeed;
uniform vec2 terrainGustOffset;
uniform vec4 terrainBlow;
uniform sampler2D terrainCaustics;
uniform float terrainTime;
uniform float terrainNight;
uniform float terrainCausticsK;
uniform vec4 terrainStorm;
uniform float terrainStormPaths;
varying vec3 vTerrain;
varying vec4 vTerrainSea;
vec4 terDetail( vec2 uv ) { return texture( terrainDetailTex, uv ); }
vec2 terrainUvOf( vec2 xz ) { return ( xz - terrainMapInfo.xy ) / terrainMapInfo.z; }
// macro normal xz (-1..1), rock mask, AO ((M15) past the island's maps, the seabed's: bare rock where steep)
vec4 terrainNormalRock( vec2 xz ) {
	vec4 t = texture( terrainNormalTex, terrainUvOf( xz ) );
	vec4 island = vec4( t.xy * 2.0 - 1.0, t.zw );
	if ( vTerrainSea.z > 0.999 ) return island;
	float slope = 1.0 - sqrt( max( 1.0 - dot( vTerrainSea.xy, vTerrainSea.xy ), 0.0 ) );
	return mix( vec4( vTerrainSea.xy, smoothstep( 0.25, 0.5, slope ), 1.0 ), island, vTerrainSea.z );
}
// sand, paths, gullies (land) or seagrass (seabed), rubble (seabed) or the beach scarp (land) ((M15) past
// the island's maps: sand, with seagrass in patches on the shallow flats and rubble in others)
vec4 terrainSplat( vec2 xz ) {
	vec4 island = texture( terrainSplatTex, terrainUvOf( xz ) );
	// (read whichever it is: a texture's derivatives are only sure outside a branch)
	float meadow = smoothstep( 0.45, 0.65, terDetail( xz / 310.0 + 0.13 ).w ) * ( 1.0 - smoothstep( 12.0, 20.0, - vTerrain.z ) );
	float rubble = smoothstep( 0.55, 0.75, terDetail( xz / 170.0 + 0.61 ).w );
	return mix( vec4( 1.0, 0.0, meadow, rubble ), island, vTerrainSea.z );
}
${ TERRAIN_SHADING_GLSL }
` )
				.replace( '#include <color_fragment>', TERRAIN_SURFACE_GLSL + /* glsl */`
	// ((M15) in a sea cave: its floor's cobbles and boulders, the basalt's, rolled by the sea; and as much of the
	// sky's light as its floor sees, no sun nor caustics in its dark)
	vec3 caveL = seaCaveLightAt( xz );
	if ( caveL.z > 0.01 ) {
		vec4 cb = terDetail( xz / 1.7 + 0.31 ), cs = terDetail( xz / 0.45 + 0.77 );
		float stone = ss( 0.42, 0.58, cs.w + ( cb.w - 0.5 ) * 0.6 );
		vec3 cob = mix( ${ srgb( 0.08, 0.075, 0.07 ) }, mix( ${ srgb( 0.2, 0.19, 0.18 ) }, ${ srgb( 0.3, 0.27, 0.24 ) }, cb.y ), stone ) * ( 0.8 + 0.4 * cs.x );
		tAlbedo = mix( tAlbedo, cob, caveL.z );
	}
	// under the sea: the water takes the red out first, then the green, on the way down and back
	float cWater = max( terrainSeaLevel - h, 0.0 );
	tAlbedo *= exp( - terrainWaterAbsorption * cWater * 1.6 );
	// caustics: the net of sunlight focused by the waves, drifting over the shallow sea floor
	float cK = ss( 0.05, 0.7, cWater ) * exp( - cWater * 0.1 ) * ( 1.0 - terrainNight ) * terrainCausticsK * ss( 0.2, 0.6, caveL.x );
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
	reflectedLight.indirectDiffuse *= tAO * caveL.x;
	reflectedLight.indirectSpecular *= tAO * caveL.x;
	reflectedLight.directDiffuse *= ss( 0.03, 0.3, caveL.x );
	reflectedLight.directSpecular *= ss( 0.03, 0.3, caveL.x );` );

		};

		this.mesh = new THREE.Mesh( this.lod.geometry, mat );
		this.mesh.name = 'Terrain';
		this.mesh.frustumCulled = false;
		this.mesh.receiveShadow = true;
		scene.add( this.mesh );

	}

	// (M13) what the last hurricane's sea left (game/StormDamage.js's damageAt): the sand it washed up
	// over the ground behind the beach, its line of wrack at how high it reached and how long ago, and
	// the weed over the paths
	setStorm( D ) {

		this.uniforms.terrainStorm.value.set( D.sand, D.wrack, D.wrackH, D.wrackAge );
		this.uniforms.terrainStormPaths.value = D.paths;

	}

	update( camera ) {

		this.lod.update( camera );
		this.mesh.position.copy( this.lod.origin ); // ((M15) drawn about its origin)
		// travelling gust field offset (integrated so speed/direction changes never jump)
		const wd = G.windDir.value, speed = 0.7 * G.windSpeed.value + 1.5, dt = G.dt.value;
		this.gustOffset.x += wd.x * speed * dt;
		this.gustOffset.y += wd.y * speed * dt;
		// ((M14) dry sand blows from a strong breeze (Bagnold's threshold for fine sand: about 8 m/s at 10 m),
		// all of it by a near gale's; none wet from the rain. Its streamers run at a quarter of the wind)
		const ws = G.windSpeed.value, b = this.blow;
		b.x = wd.x;
		b.y = wd.y;
		b.z = ( b.z + 0.25 * ws * dt ) % 1e5;
		b.w = THREE.MathUtils.smoothstep( ws, BLOW[ 0 ], BLOW[ 1 ] ) * ( 1 - Math.min( 1, G.wet.value * 1.5 ) );

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

	return floatTexture( data, res );

}

// heights (m) as a float texture, read texel by texel
function floatTexture( data, res ) {

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
