import {
	BufferGeometry, Float32BufferAttribute, Uint32BufferAttribute, Matrix4, Matrix3, Vector3, Quaternion, Euler,
	CylinderGeometry, TorusGeometry, SphereGeometry, LatheGeometry, Vector2,
	DataArrayTexture, DataTexture, MeshStandardMaterial, SRGBColorSpace, NoColorSpace, RepeatWrapping, ClampToEdgeWrapping,
	LinearFilter, LinearMipmapLinearFilter,
} from '../engine/index.js';
import { G } from '../core/Globals.js';

// Shared kit for the vendor stalls (FishStand, Chandlery): photoscanned CC0 surfaces and props from
// Poly Haven (public/models/props, built by tools/props/build.mjs; credits in credits/props.md) plus
// a few procedural pieces, all merged into ONE mesh per stall with ONE material:
//
//   per vertex: uv, color (tint / plain colour), aLayer (what it is), aUV2 (a second uv or params)
//   aLayer  0..3   tiling surface (texture array): 0 weathered wall planks (boards along u),
//                  1 dark nailed planks (boards along v), 2 corrugated iron (ribs along v), 3 painted timber
//           100+i  scanned prop texture set i (texture array), uv = the model's own uvs
//           -1 crushed ice, -2 hand-painted sign (painted timber + the sign atlas at aUV2),
//           -3 chalkboard (slate + chalk from the atlas at aUV2), -4 plain (color, aUV2 = roughness,
//           metalness), -5 rope (color, uv = ( metres along, around )), -6 weathered painted float,
//           -7 enamel scale dial (atlas at aUV2)
// Textures are loaded once (loadStallAssets) and shared by both stalls. Their size follows the device
// tier (TEX_SIZE: the scans are 1K surfaces and 512 px props; low / mid devices get them smaller).
//
// Port notes (WebGL 2): the images are decoded by the browser and drawn into a 2D canvas at the tier's
// size, then uploaded as three DataArrayTextures (mipmapped by the GPU). The material is three's
// MeshStandardMaterial with Tidewater's surface spliced in (onBeforeCompile); the ice and the dial's
// clearcoat and the ice's translucency are left out (a glossy surface instead).

export const LAYER = { WALL: 0, DECK: 1, TIN: 2, PAINTED: 3, PROP: 100, ICE: - 1, SIGN: - 2, CHALK: - 3, PLAIN: - 4, ROPE: - 5, FLOAT: - 6, DIAL: - 7 };
// metres covered by one repeat of each surface texture, and which uv axis the boards / ribs follow
const SURF = [
	{ name: 'weathered_brown_planks', size: 1.8, grain: 'u' },
	{ name: 'weathered_planks', size: 2.0, grain: 'v' },
	{ name: 'worn_corrugated_iron', size: 1.8, grain: 'v' },
	{ name: 'weathered_peeling_timber', size: 1.1, grain: 'v' },
];
// texture sizes per tier: tiling surfaces, scanned props, the sign atlas (width; it is 2:1)
const TEX_SIZE = {
	low: { surf: 512, prop: 128, signs: 1024 },
	mid: { surf: 512, prop: 256, signs: 1024 },
	high: { surf: 1024, prop: 256, signs: 2048 },
};
// sign atlas (signs.png, 2048 x 1024) regions in uv: [ u0, v0, u1, v1 ]
export const ATLAS = {
	joe: [ 0.0, 0.0, 1.0, 0.25 ],
	marta: [ 0.0, 0.25, 0.72, 0.5 ],
	prices: [ 0.0, 0.5, 0.5, 1.0 ],
	dial: [ 0.75, 0.5, 1.0, 1.0 ],
};
// corrugation measured from the iron's normal map: 16 ribs per 1.8 m tile, height phase 1.029 rad
const RIBS = 16, RIB_PHASE = 1.029, RIB_AMP = 0.011;

const BASE = ( ( import.meta.env && import.meta.env.BASE_URL ) || '/' ) + 'models/props/';

async function bytes( url ) {

	if ( globalThis.__assetFile ) return globalThis.__assetFile( url );
	const res = await fetch( url );
	if ( ! res.ok ) throw new Error( 'StallKit: ' + url + ' ' + res.status );
	return res.arrayBuffer();

}

// decoded RGBA pixels of an image at w x h (row 0 = the top of the image, as Tidewater's decoder)
let _canvas = null;
async function pixels( url, w, h ) {

	const blob = new Blob( [ await bytes( url ) ], { type: url.endsWith( '.png' ) ? 'image/png' : 'image/jpeg' } );
	const bmp = await createImageBitmap( blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' } );
	if ( ! _canvas ) _canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas( w, h ) : document.createElement( 'canvas' );
	_canvas.width = w;
	_canvas.height = h;
	const ctx = _canvas.getContext( '2d', { willReadFrequently: true } );
	ctx.clearRect( 0, 0, w, h );
	ctx.imageSmoothingQuality = 'high';
	ctx.drawImage( bmp, 0, 0, w, h );
	if ( bmp.close ) bmp.close();
	return ctx.getImageData( 0, 0, w, h ).data;

}

// one texture array from same-sized images
function arrayTexture( name, imgs, size, srgb ) {

	const data = new Uint8Array( size * size * 4 * imgs.length );
	imgs.forEach( ( im, i ) => data.set( im, size * size * 4 * i ) );
	const tex = new DataArrayTexture( data, size, size, imgs.length );
	tex.name = name;
	tex.colorSpace = srgb ? SRGBColorSpace : NoColorSpace;
	tex.wrapS = tex.wrapT = RepeatWrapping;
	tex.minFilter = LinearMipmapLinearFilter;
	tex.magFilter = LinearFilter;
	tex.generateMipmaps = true;
	tex.anisotropy = 8;
	tex.needsUpdate = true;
	return tex;

}

const _assets = {};
export function loadStallAssets( tier = 'high' ) {

	const t = TEX_SIZE[ tier ] ? tier : 'high';
	return _assets[ t ] || ( _assets[ t ] = _load( TEX_SIZE[ t ] ) );

}

async function _load( size ) {

	const t0 = performance.now();
	const info = JSON.parse( new TextDecoder().decode( await bytes( BASE + 'props.json' ) ) );
	const bin = await bytes( BASE + 'props.bin' );
	const verts = new Float32Array( bin, 0, info.vertexCount * info.vertexFloats );
	const index = new Uint32Array( bin, info.indexByteOffset, info.indexCount );
	const set = ( names, prefix, px ) => Promise.all( [ 'a', 'n', 'r' ].map( ( m ) => Promise.all( names.map( ( n ) => pixels( BASE + prefix + n + '_' + m + '.jpg', px, px ) ) ) ) );
	const [ surf, prop, signs ] = await Promise.all( [
		set( SURF.map( ( s ) => s.name ), 's_', size.surf ),
		set( info.layers, 'p_', size.prop ),
		pixels( BASE + 'signs.png', size.signs, size.signs / 2 ),
	] );
	const assets = {
		info, verts, index,
		surf: { a: arrayTexture( 'stallSurfA', surf[ 0 ], size.surf, true ), n: arrayTexture( 'stallSurfN', surf[ 1 ], size.surf, false ), r: arrayTexture( 'stallSurfR', surf[ 2 ], size.surf, false ) },
		prop: { a: arrayTexture( 'stallPropA', prop[ 0 ], size.prop, true ), n: arrayTexture( 'stallPropN', prop[ 1 ], size.prop, false ), r: arrayTexture( 'stallPropR', prop[ 2 ], size.prop, false ) },
		signs: signTexture( signs, size.signs, size.signs / 2 ),
	};
	assets.material = createStallMaterial( assets );
	assets.lite = size === TEX_SIZE.low; // the stalls leave out a few scanned finishing touches
	assets.bytes = ( 12 * size.surf * size.surf + 3 * info.layers.length * size.prop * size.prop * 4 + size.signs * size.signs * 2 ) * 4 / 3;
	assets.loadMs = performance.now() - t0;
	return assets;

}

function signTexture( data, w, h ) {

	const tex = new DataTexture( new Uint8Array( data.buffer, data.byteOffset, data.byteLength ), w, h );
	tex.name = 'stallSigns';
	tex.colorSpace = SRGBColorSpace;
	tex.flipY = false;
	tex.wrapS = tex.wrapT = ClampToEdgeWrapping;
	tex.minFilter = LinearMipmapLinearFilter;
	tex.magFilter = LinearFilter;
	tex.generateMipmaps = true;
	tex.needsUpdate = true;
	return tex;

}

// ---------------------------------------------------------------- material

// The plain procedural stalls (the fallback when the scans fail to load) are GeoKit geometry
// (boat/GeoKit.js: linear vertex colours, aux = roughness, metalness, pattern). Tidewater drew them
// with the game's prop material (GameMaterials.js, not ported yet); this stand-in keeps the colours.
// PAT: the game material's pattern ids (GameMaterials.PAT), kept in the geometry for it.
export const PAT = {
	plain: 0, wood: 1, cloth: 2, skin: 3, cork: 4, rusty: 5, woodX: 6, woodZ: 7,
	carbon: 8, thread: 9, eva: 10, braid: 11, machined: 12, knurl: 13, rubber: 14,
};

export function createPlainMaterial( name ) {

	const m = new MeshStandardMaterial( { vertexColors: true, roughness: 0.85, metalness: 0 } );
	m.name = name;
	return m;

}

const KIT_GLSL = /* glsl */`
uniform highp sampler2DArray skSurfA;
uniform highp sampler2DArray skSurfN;
uniform highp sampler2DArray skSurfR;
uniform highp sampler2DArray skPropA;
uniform highp sampler2DArray skPropN;
uniform highp sampler2DArray skPropR;
uniform sampler2D skSigns;
uniform float skTime;
uniform float skNight;
varying float vLayer;
varying vec2 vUV2;
varying vec2 vSkUv;
varying vec3 vSkP;
varying vec3 vSkN;

float skHash( vec3 p ) { return fract( sin( dot( p, vec3( 127.1, 311.7, 74.7 ) ) ) * 43758.5453 ); }
float skNoise( vec3 p ) {
	vec3 i = floor( p ); vec3 f = fract( p ); vec3 u = f * f * ( 3.0 - 2.0 * f );
	float a = mix( mix( skHash( i ), skHash( i + vec3( 1, 0, 0 ) ), u.x ), mix( skHash( i + vec3( 0, 1, 0 ) ), skHash( i + vec3( 1, 1, 0 ) ), u.x ), u.y );
	float b = mix( mix( skHash( i + vec3( 0, 0, 1 ) ), skHash( i + vec3( 1, 0, 1 ) ), u.x ), mix( skHash( i + vec3( 0, 1, 1 ) ), skHash( i + vec3( 1, 1, 1 ) ), u.x ), u.y );
	return mix( a, b, u.z );
}
float skFbm( vec3 p ) { return skNoise( p ) * 0.55 + skNoise( p * 2.13 + 7.1 ) * 0.3 + skNoise( p * 4.7 + 3.3 ) * 0.15; }
// 2D cellular noise: ( distance to the nearest feature, to the second nearest )
vec2 skCells( vec2 p ) {
	vec2 i = floor( p ); vec2 f = fract( p );
	float d1 = 8.0; float d2 = 8.0;
	for ( int y = -1; y <= 1; y ++ ) {
		for ( int x = -1; x <= 1; x ++ ) {
			vec2 g = vec2( float( x ), float( y ) );
			vec2 h = vec2( skHash( vec3( i + g, 1.7 ) ), skHash( vec3( i + g, 9.3 ) ) );
			float d = length( g + h - f );
			if ( d < d1 ) { d2 = d1; d1 = d; } else if ( d < d2 ) { d2 = d; }
		}
	}
	return vec2( d1, d2 );
}
// perturbed normal from a scalar height (screen-space derivatives)
vec3 skBump( vec3 P, vec3 N, float h ) {
	vec3 dPdx = dFdx( P ); vec3 dPdy = dFdy( P );
	vec3 r1 = cross( dPdy, N ); vec3 r2 = cross( N, dPdx );
	float det = dot( dPdx, r1 );
	vec3 grad = sign( det ) * ( dFdx( h ) * r1 + dFdy( h ) * r2 );
	return normalize( abs( det ) * N - grad + N * 1e-12 );
}

struct SkSurf { vec3 albedo; float roughness; float metalness; float ao; vec3 emissive; vec3 normal; };

SkSurf skSurface( vec3 tint ) {
	float L = floor( vLayer + 0.5 );
	vec2 uv = vSkUv;
	vec2 uv2 = vUV2;
	vec3 P = vSkP;
	vec3 N0 = normalize( vSkN ) * ( gl_FrontFacing ? 1.0 : - 1.0 );
	// tangent frame from derivatives (uniform control flow): OpenGL normal maps, image v runs down
	vec3 dp1 = dFdx( P ); vec3 dp2 = dFdy( P ); vec2 duv1 = dFdx( uv ); vec2 duv2 = dFdy( uv );
	vec3 dp2perp = cross( dp2, N0 ); vec3 dp1perp = cross( N0, dp1 );
	vec3 Tt = dp2perp * duv1.x + dp1perp * duv2.x;
	vec3 Bt = dp2perp * duv1.y + dp1perp * duv2.y;
	float tInv = inversesqrt( max( max( dot( Tt, Tt ), dot( Bt, Bt ) ), 1e-24 ) );
	mat3 TBN = mat3( Tt * tInv, - Bt * tInv, N0 );
	vec2 g2x = dFdx( uv2 ); vec2 g2y = dFdy( uv2 );
	vec3 alb = tint;
	float rough = 0.8;
	float metal = 0.0;
	float ao = 1.0;
	vec3 nrm = N0;
	vec3 emissive = vec3( 0.0 );
	if ( L > -0.5 ) {
		// scanned texture set: a prop or a tiling surface
		vec4 a; vec4 n; vec4 r;
		if ( L > 99.5 ) {
			vec3 q = vec3( uv, L - 100.0 );
			a = textureGrad( skPropA, q, duv1, duv2 );
			n = textureGrad( skPropN, q, duv1, duv2 );
			r = textureGrad( skPropR, q, duv1, duv2 );
		} else {
			vec3 q = vec3( uv, L );
			a = textureGrad( skSurfA, q, duv1, duv2 );
			n = textureGrad( skSurfN, q, duv1, duv2 );
			r = textureGrad( skSurfR, q, duv1, duv2 );
		}
		// the corrugated sheets are corrugated in the geometry too: keep only a little of the ribs
		float strength = abs( L - 2.0 ) < 0.5 ? 0.35 : 1.0;
		vec3 tn = n.xyz * 2.0 - 1.0;
		tn = vec3( tn.xy * strength, max( tn.z, 0.05 ) );
		nrm = normalize( TBN * tn );
		alb = a.rgb * tint;
		ao = r.r; rough = r.g; metal = r.b;
		// the lantern's glass (prop layer 7: wooden_lantern_01_1): sooty panes that glow warm from dusk,
		// as the village lanterns do
		if ( abs( L - 107.0 ) < 0.5 ) {
			float lum = dot( a.rgb, vec3( 0.3, 0.55, 0.15 ) );
			float pane = 1.0 - smoothstep( 0.16, 0.32, lum ); // the dark panes, not the frame rims
			float nightOn = smoothstep( 0.15, 0.75, skNight );
			float flicker = sin( skTime * 9.0 + P.x * 40.0 ) * sin( skTime * 5.3 + P.z * 13.0 ) * 0.12 + 0.9;
			// lit from inside: the flame shows through the soot, brighter in the middle of each pane
			float soot = mix( 1.0, 0.35, smoothstep( 0.05, 0.22, lum ) );
			// the flame sits ~19 cm up in the middle: a hot core behind the glass, dim toward the frame
			vec2 qf = ( uv2 - vec2( 0.0, 0.19 ) ) / vec2( 0.05, 0.075 );
			float core = exp( - dot( qf, qf ) );
			vec3 glow = vec3( 1.0, 0.5, 0.18 ) * 0.35 + vec3( 1.0, 0.72, 0.4 ) * 3.0 * core;
			emissive = glow * flicker * nightOn * pane * soot;
			// clean glass over the soot: glossy, a little lighter than the scan by day
			alb = mix( alb, alb * 1.6 + 0.02, pane );
			rough = mix( rough, 0.12, pane );
			metal = 0.0;
		}
		// sun-bleached and salty on the upward faces of the stall timber
		if ( L < 1.5 ) {
			float up = smoothstep( 0.3, 0.95, N0.y );
			float lum = dot( alb, vec3( 0.3, 0.55, 0.15 ) );
			alb = mix( alb, vec3( lum * 1.25 ), 0.28 * up + 0.12 );
			rough = clamp( rough + 0.06, 0.0, 1.0 );
		}
	} else if ( L > -1.5 ) {
		// crushed ice: packed chunks with glassy facets, clear meltwater in the gaps
		vec2 c = skCells( P.xz * 34.0 + vec2( P.y * 11.0 ) );
		float chunk = smoothstep( 0.0, 0.55, c.y - c.x );
		float frost = skFbm( P * 90.0 );
		float hgt = chunk * 0.004 + frost * 0.0008;
		nrm = skBump( P, N0, hgt );
		alb = mix( vec3( 0.52, 0.62, 0.66 ), vec3( 0.86, 0.92, 0.95 ), chunk * 0.8 + frost * 0.2 );
		rough = mix( 0.03, 0.28, frost * chunk );
	} else if ( L > -3.5 || ( L > -7.5 && L < -6.5 ) ) {
		// painted: a sign on peeling timber, a chalkboard, or the scale's enamel dial
		vec4 paint = textureGrad( skSigns, uv2, g2x, g2y );
		if ( L > -2.5 ) {
			vec3 q = vec3( uv, 3.0 );
			vec4 a = textureGrad( skSurfA, q, duv1, duv2 );
			vec4 n = textureGrad( skSurfN, q, duv1, duv2 );
			vec4 r = textureGrad( skSurfR, q, duv1, duv2 );
			// the board was painted over: a dark ground coat, the lettering, both chipped and sun-faded
			// chipped through where the old timber shows (its own peeling paint pattern) and at random
			float wear = skFbm( vec3( uv2 * vec2( 90.0, 45.0 ), 3.1 ) );
			float chips = smoothstep( 0.64, 0.74, wear + ( 0.45 - dot( a.rgb, vec3( 0.33 ) ) ) * 0.35 );
			vec3 ground = mix( vec3( 0.03, 0.062, 0.068 ) * mix( 0.8, 1.15, wear ), a.rgb * tint, chips );
			float letters = paint.a * ( 1.0 - chips * 0.8 ) * mix( 0.78, 1.0, skNoise( vec3( uv2 * 400.0, 0.0 ) ) );
			alb = mix( ground, paint.rgb * 0.82, letters );
			rough = mix( r.g, 0.62, ( 1.0 - chips ) * 0.8 );
			ao = r.r;
			vec3 tn = n.xyz * 2.0 - 1.0;
			nrm = normalize( TBN * vec3( tn.xy * mix( 1.0, 0.45, 1.0 - chips ), tn.z ) );
		} else if ( L > -3.5 ) {
			// slate with smeared chalk dust, the prices in chalk
			float dust = skFbm( vec3( uv2 * vec2( 18.0, 9.0 ), 0.0 ) );
			float chalk = paint.a * mix( 0.55, 1.0, skNoise( vec3( uv2 * 900.0, 1.0 ) ) );
			alb = mix( vec3( 0.028, 0.034, 0.031 ) + dust * 0.035, vec3( 0.72, 0.72, 0.68 ), chalk );
			rough = 0.9;
		} else {
			// enamel dial face, a little crazed and yellowed
			float crazing = skNoise( vec3( uv2 * 900.0, 2.0 ) );
			alb = mix( vec3( 0.72, 0.68, 0.58 ), paint.rgb, paint.a ) * mix( 0.92, 1.0, crazing );
			rough = 0.18;
		}
	} else if ( L > -4.5 ) {
		// plain: colour, roughness and metalness from the vertex data; a little grime and pitting
		float g = skFbm( P * 14.0 );
		alb = tint * mix( 0.78, 1.04, g );
		rough = clamp( uv2.x + ( g - 0.5 ) * 0.2, 0.05, 1.0 );
		metal = uv2.y;
		if ( metal > 0.5 ) {
			float rust = smoothstep( 0.6, 0.8, skFbm( P * 40.0 + 3.0 ) );
			alb = mix( alb, vec3( 0.2, 0.09, 0.04 ), rust * 0.8 );
			metal = mix( metal, 0.0, rust );
			rough = mix( rough, 0.9, rust );
		}
	} else if ( L > -5.5 ) {
		// three-strand laid rope: twisted strands, fibres, grime
		float strand = sin( ( uv.y * 3.0 + uv.x * 22.0 ) * 6.2831853 ) * 0.5 + 0.5;
		float fibre = skNoise( vec3( uv.x * 900.0, uv.y * 40.0, 0.0 ) );
		alb = tint * mix( 0.55, 1.05, strand ) * mix( 0.85, 1.05, fibre ) * mix( 0.8, 1.0, skFbm( P * 6.0 ) );
		rough = 0.95;
		nrm = skBump( P, N0, strand * 0.0025 + fibre * 0.0003 );
	} else {
		// sun-faded painted float or fender: chalky, chipped to the white foam, streaky grime
		float fade = skFbm( P * 9.0 );
		float chip = smoothstep( 0.66, 0.74, skFbm( P * 55.0 + 2.0 ) );
		float streak = skFbm( vec3( P.x * 30.0, P.y * 3.0, P.z * 30.0 ) );
		vec3 chalky = mix( tint, vec3( dot( tint, vec3( 0.33 ) ) * 1.1 + 0.08 ), 0.3 + fade * 0.2 );
		alb = mix( chalky, vec3( 0.78, 0.76, 0.7 ), chip ) * mix( 0.62, 1.0, smoothstep( 0.35, 0.7, streak ) );
		rough = mix( 0.55, 0.85, fade );
		nrm = skBump( P, N0, - chip * 0.0015 + fade * 0.0006 );
	}
	return SkSurf( alb, rough, metal, ao, emissive, nrm );
}
`;

export function createStallMaterial( assets ) {

	const m = new MeshStandardMaterial( { vertexColors: true, roughness: 0.8, metalness: 0 } );
	m.name = 'stall';
	const uniforms = {
		skSurfA: { value: assets.surf.a }, skSurfN: { value: assets.surf.n }, skSurfR: { value: assets.surf.r },
		skPropA: { value: assets.prop.a }, skPropN: { value: assets.prop.n }, skPropR: { value: assets.prop.r },
		skSigns: { value: assets.signs }, skTime: G.time, skNight: G.night,
	};
	m.userData.uniforms = uniforms;
	m.onBeforeCompile = ( shader ) => {

		Object.assign( shader.uniforms, uniforms );
		shader.vertexShader = shader.vertexShader
			.replace( '#include <common>', '#include <common>\nattribute float aLayer;\nattribute vec2 aUV2;\nvarying float vLayer;\nvarying vec2 vUV2;\nvarying vec2 vSkUv;\nvarying vec3 vSkP;\nvarying vec3 vSkN;' )
			.replace( '#include <worldpos_vertex>', '#include <worldpos_vertex>\n\tvLayer = aLayer;\n\tvUV2 = aUV2;\n\tvSkUv = uv;\n\tvSkP = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;\n\tvSkN = normalize( mat3( modelMatrix ) * objectNormal );' );
		shader.fragmentShader = shader.fragmentShader
			.replace( '#include <common>', '#include <common>\n' + KIT_GLSL )
			.replace( '#include <color_fragment>', '#include <color_fragment>\n\tSkSurf sk = skSurface( diffuseColor.rgb );\n\tdiffuseColor.rgb = sk.albedo;' )
			.replace( '#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n\troughnessFactor = sk.roughness;' )
			.replace( '#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n\tmetalnessFactor = sk.metalness;' )
			.replace( '#include <normal_fragment_maps>', '\tnormal = normalize( ( viewMatrix * vec4( sk.normal, 0.0 ) ).xyz );' )
			.replace( '#include <emissivemap_fragment>', '\ttotalEmissiveRadiance = sk.emissive;' )
			.replace( '#include <aomap_fragment>', '\treflectedLight.indirectDiffuse *= sk.ao;\n\treflectedLight.indirectSpecular *= sk.ao;' );

	};

	m.customProgramCacheKey = () => 'stallKit';
	return m;

}

// ---------------------------------------------------------------- geometry builder

const _m = new Matrix4(), _n = new Matrix3(), _v = new Vector3(), _w = new Vector3();

// matrix from a position and yaw / pitch / roll (radians, YXZ)
export function place( x, y, z, ry = 0, rx = 0, rz = 0, s = 1 ) {

	return new Matrix4().compose( new Vector3( x, y, z ), new Quaternion().setFromEuler( new Euler( rx, ry, rz, 'YXZ' ) ), new Vector3( s, s, s ) );

}

export class KitBuilder {

	constructor( assets, seed = 1 ) {

		this.assets = assets;
		this.pos = []; this.nrm = []; this.uv = []; this.col = []; this.layer = []; this.uv2 = []; this.idx = [];
		this.seed = seed;
		this.lite = assets.lite === true;

	}

	rnd() {

		this.seed = ( this.seed * 16807 ) % 2147483647;
		return this.seed / 2147483647;

	}

	jit( a ) {

		return ( this.rnd() - 0.5 ) * a;

	}

	// raw vertex append; returns the first index
	_vert( p, n, uv, col, layer, uv2 ) {

		this.pos.push( p.x, p.y, p.z );
		this.nrm.push( n.x, n.y, n.z );
		this.uv.push( uv[ 0 ], uv[ 1 ] );
		this.col.push( col[ 0 ], col[ 1 ], col[ 2 ], 1 );
		this.layer.push( layer );
		this.uv2.push( uv2[ 0 ], uv2[ 1 ] );
		return this.pos.length / 3 - 1;

	}

	// A box of size w x h x d (centred) under `matrix`. Surfaces tile at their real size with the
	// boards / ribs running along the box's local `along` axis ('x' | 'y' | 'z'); `off` shifts the
	// texture so neighbouring boards differ. o.uv2Rect maps the +z face (the front) into the sign
	// atlas; o.params = [ roughness, metalness ] for plain boxes.
	box( w, h, d, matrix, o = {} ) {

		const layer = o.layer ?? LAYER.WALL;
		const col = o.color || [ 1, 1, 1 ];
		const S = layer >= 0 && layer < 100 ? SURF[ layer ] : { size: 1, grain: 'u' };
		const off = o.off || [ this.rnd(), this.rnd() ];
		const along = o.along || 'x';
		_n.getNormalMatrix( matrix );
		const half = [ w / 2, h / 2, d / 2 ];
		const axes = [ 'x', 'y', 'z' ];
		for ( let f = 0; f < 6; f ++ ) {

			const ax = f >> 1, sgn = f & 1 ? - 1 : 1;
			const u = ( ax + 1 ) % 3, v = ( ax + 2 ) % 3;
			// the face spans axes u and v: put the grain axis on the texture's grain direction
			let ua = u, va = v;
			const want = axes.indexOf( along );
			if ( S.grain === 'u' ? va === want : ua === want ) {

				ua = v; va = u;

			}

			const n = new Vector3(); n.setComponent( ax, sgn );
			const nw = n.clone().applyMatrix3( _n ).normalize();
			const base = this.pos.length / 3;
			for ( const [ a, b ] of [ [ - 1, - 1 ], [ 1, - 1 ], [ 1, 1 ], [ - 1, 1 ] ] ) {

				const p = new Vector3();
				p.setComponent( ax, sgn * half[ ax ] );
				p.setComponent( ua, a * half[ ua ] );
				p.setComponent( va, b * half[ va ] );
				const tu = ( p.getComponent( ua ) + half[ ua ] ) / S.size + off[ 0 ];
				const tv = - ( p.getComponent( va ) + half[ va ] ) / S.size + off[ 1 ];
				let uv2 = o.params || [ 0, 0 ];
				if ( o.uv2Rect && ax === 2 && sgn > 0 ) {

					const R = o.uv2Rect;
					uv2 = [ R[ 0 ] + ( R[ 2 ] - R[ 0 ] ) * ( p.x / w + 0.5 ), R[ 1 ] + ( R[ 3 ] - R[ 1 ] ) * ( 0.5 - p.y / h ) ];

				} else if ( o.uv2Rect ) uv2 = [ o.uv2Rect[ 0 ] + 0.001, o.uv2Rect[ 1 ] + 0.001 ];

				p.applyMatrix4( matrix );
				this._vert( p, nw, [ tu, tv ], col, layer, uv2 );

			}

			// winding: counter-clockwise seen from outside
			const flip = ( ( ua - ax + 3 ) % 3 === 1 ) === ( sgn > 0 );
			if ( flip ) this.idx.push( base, base + 1, base + 2, base, base + 2, base + 3 );
			else this.idx.push( base, base + 2, base + 1, base, base + 3, base + 2 );

		}

	}

	// any engine geometry (position / normal / uv / index), transformed; uv scaled by uvScale;
	// o.params = [ roughness, metalness ] for plain parts
	geometry( g, matrix, o = {} ) {

		const layer = o.layer ?? LAYER.PLAIN;
		const col = o.color || [ 1, 1, 1 ];
		const uv2 = o.params || [ 0.6, 0 ];
		const us = o.uvScale || [ 1, 1 ];
		_n.getNormalMatrix( matrix );
		const P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv;
		const base = this.pos.length / 3;
		for ( let i = 0; i < P.count; i ++ ) {

			_v.fromBufferAttribute( P, i ).applyMatrix4( matrix );
			_w.fromBufferAttribute( N, i ).applyMatrix3( _n ).normalize();
			const uv = U ? [ U.getX( i ) * us[ 0 ], U.getY( i ) * us[ 1 ] ] : [ 0, 0 ];
			// uv2FromUV: [ u0, v0, u1, v1 ] maps the geometry's uv (0..1) into the sign atlas
			const R = o.uv2FromUV;
			this._vert( _v, _w, uv, col, layer, R && U ? [ R[ 0 ] + ( R[ 2 ] - R[ 0 ] ) * U.getX( i ), R[ 1 ] + ( R[ 3 ] - R[ 1 ] ) * ( 1 - U.getY( i ) ) ] : uv2 );

		}

		if ( g.index ) for ( let i = 0; i < g.index.count; i ++ ) this.idx.push( base + g.index.getX( i ) );
		else for ( let i = 0; i < P.count; i ++ ) this.idx.push( base + i );

	}

	// rope along a polyline (world points), radius r, colour
	rope( points, r = 0.009, color = [ 0.62, 0.53, 0.38 ], radial = 6 ) {

		const base = this.pos.length / 3;
		let len = 0;
		const T = new Vector3(), B = new Vector3(), Nn = new Vector3(), up = new Vector3( 0, 1, 0 );
		for ( let i = 0; i < points.length; i ++ ) {

			const p = points[ i ];
			const a = points[ Math.max( 0, i - 1 ) ], b = points[ Math.min( points.length - 1, i + 1 ) ];
			T.subVectors( b, a ).normalize();
			if ( i > 0 ) len += p.distanceTo( points[ i - 1 ] );
			Nn.crossVectors( T, Math.abs( T.y ) > 0.9 ? new Vector3( 1, 0, 0 ) : up ).normalize();
			B.crossVectors( T, Nn );
			for ( let k = 0; k <= radial; k ++ ) {

				const ang = k / radial * Math.PI * 2;
				const dir = Nn.clone().multiplyScalar( Math.cos( ang ) ).addScaledVector( B, Math.sin( ang ) );
				this._vert( p.clone().addScaledVector( dir, r ), dir, [ len, k / radial ], color, LAYER.ROPE, [ 0, 0 ] );

			}

		}

		for ( let i = 0; i < points.length - 1; i ++ ) for ( let k = 0; k < radial; k ++ ) {

			const a = base + i * ( radial + 1 ) + k, b = a + radial + 1;
			this.idx.push( a, a + 1, b, a + 1, b + 1, b );

		}

	}

	// a coil of rope lying flat: `turns` rings at radius r, stacked a little
	coil( x, y, z, r = 0.2, turns = 5, rr = 0.012, color ) {

		for ( let t = 0; t < turns; t ++ ) {

			const pts = [];
			const R = r - t * rr * 1.6 + this.jit( 0.01 );
			for ( let i = 0; i <= 28; i ++ ) {

				const a = i / 28 * Math.PI * 2 + t * 0.7;
				pts.push( new Vector3( x + Math.cos( a ) * R, y + rr + t * rr * 1.3 + Math.sin( a * 3 + t ) * 0.003, z + Math.sin( a ) * R ) );

			}

			this.rope( pts, rr, color );

		}

	}

	// a corrugated iron sheet in its local xz plane (ribs along z), w wide, l long, under matrix.
	// The ribs line up with the texture's (u = x / 1.8 m).
	corrugated( w, l, matrix, u0 = 0, color = [ 1, 1, 1 ] ) {

		const nx = Math.ceil( w / 1.8 * RIBS * 8 ), nz = 2;
		_n.getNormalMatrix( matrix );
		const base = this.pos.length / 3;
		const hAt = ( x ) => {

			const u = x / 1.8 + u0;
			return RIB_AMP * Math.cos( 2 * Math.PI * RIBS * u - RIB_PHASE );

		};

		for ( let j = 0; j <= nz; j ++ ) for ( let i = 0; i <= nx; i ++ ) {

			const x = - w / 2 + w * i / nx, z = - l / 2 + l * j / nz;
			const dh = ( hAt( x + 1e-3 ) - hAt( x - 1e-3 ) ) / 2e-3;
			const p = new Vector3( x, hAt( x ), z ).applyMatrix4( matrix );
			const n = new Vector3( - dh, 1, 0 ).normalize().applyMatrix3( _n ).normalize();
			this._vert( p, n, [ x / 1.8 + u0, - z / 1.8 ], color, LAYER.TIN, [ 0, 0 ] );

		}

		for ( let j = 0; j < nz; j ++ ) for ( let i = 0; i < nx; i ++ ) {

			const a = base + j * ( nx + 1 ) + i, b = a + nx + 1;
			this.idx.push( a, b, a + 1, a + 1, b, b + 1 );
			// underside: the same sheet seen from below (double-sided)
		}

		// underside copy (normals flipped, reversed winding)
		const top = this.pos.length / 3;
		for ( let k = base; k < top; k ++ ) {

			const p = new Vector3( this.pos[ k * 3 ], this.pos[ k * 3 + 1 ], this.pos[ k * 3 + 2 ] );
			const n = new Vector3( - this.nrm[ k * 3 ], - this.nrm[ k * 3 + 1 ], - this.nrm[ k * 3 + 2 ] );
			this._vert( p, n, [ this.uv[ k * 2 ], this.uv[ k * 2 + 1 ] ], [ 0.8, 0.8, 0.8 ], LAYER.TIN, [ 0, 0 ] );

		}

		for ( let j = 0; j < nz; j ++ ) for ( let i = 0; i < nx; i ++ ) {

			const a = top + j * ( nx + 1 ) + i, b = a + nx + 1;
			this.idx.push( a, a + 1, b, a + 1, b + 1, b );

		}

	}

	// crushed-ice bed: a lumpy heightfield w x d at height y (local), under matrix
	ice( w, d, matrix, lump = 0.018 ) {

		const nx = 36, nz = 22;
		_n.getNormalMatrix( matrix );
		const H = [];
		for ( let j = 0; j <= nz; j ++ ) for ( let i = 0; i <= nx; i ++ ) {

			const edge = Math.min( i, nx - i, j, nz - j ) === 0 ? - 0.4 : 1;
			H.push( ( this.rnd() * 0.7 + 0.3 * Math.sin( i * 1.7 + j * 2.3 ) ) * lump * edge );

		}

		const base = this.pos.length / 3;
		for ( let j = 0; j <= nz; j ++ ) for ( let i = 0; i <= nx; i ++ ) {

			const x = - w / 2 + w * i / nx, z = - d / 2 + d * j / nz;
			const h = ( ii, jj ) => H[ Math.min( nz, Math.max( 0, jj ) ) * ( nx + 1 ) + Math.min( nx, Math.max( 0, ii ) ) ];
			const n = new Vector3( ( h( i - 1, j ) - h( i + 1, j ) ) / ( 2 * w / nx ), 1, ( h( i, j - 1 ) - h( i, j + 1 ) ) / ( 2 * d / nz ) ).normalize();
			const p = new Vector3( x, h( i, j ), z ).applyMatrix4( matrix );
			this._vert( p, n.applyMatrix3( _n ).normalize(), [ x, z ], [ 1, 1, 1 ], LAYER.ICE, [ 0, 0 ] );

		}

		for ( let j = 0; j < nz; j ++ ) for ( let i = 0; i < nx; i ++ ) {

			const a = base + j * ( nx + 1 ) + i, b = a + nx + 1;
			this.idx.push( a, b, a + 1, a + 1, b, b + 1 );

		}

	}

	// a flat disc of radius r in the local xy plane facing +z, uv2 mapping it into an atlas rect
	disc( r, matrix, o = {} ) {

		const seg = 40, layer = o.layer ?? LAYER.DIAL, R = o.uv2Rect || [ 0, 0, 1, 1 ], col = o.color || [ 1, 1, 1 ];
		_n.getNormalMatrix( matrix );
		const nw = new Vector3( 0, 0, 1 ).applyMatrix3( _n ).normalize();
		const at = ( x, y ) => [ R[ 0 ] + ( R[ 2 ] - R[ 0 ] ) * ( x / r * 0.5 + 0.5 ), R[ 1 ] + ( R[ 3 ] - R[ 1 ] ) * ( 0.5 - y / r * 0.5 ) ];
		const c = this._vert( new Vector3( 0, 0, 0 ).applyMatrix4( matrix ), nw, [ 0.5, 0.5 ], col, layer, at( 0, 0 ) );
		for ( let i = 0; i <= seg; i ++ ) {

			const a = i / seg * Math.PI * 2, x = Math.cos( a ) * r, y = Math.sin( a ) * r;
			this._vert( new Vector3( x, y, 0 ).applyMatrix4( matrix ), nw, [ x / r * 0.5 + 0.5, 0.5 - y / r * 0.5 ], col, layer, at( x, y ) );
			if ( i > 0 ) this.idx.push( c, c + i, c + i + 1 );

		}

	}

	// a scanned prop from props.bin (placed with its origin at the matrix; props are y-up, metres).
	// o.detail: a finishing touch, left out on low-powered devices (K.lite)
	prop( name, matrix, o = {} ) {

		if ( o.detail && this.lite ) return;
		const A = this.assets, P = A.info.props[ name ];
		if ( ! P ) throw new Error( 'StallKit: no prop ' + name );
		const V = A.verts, F = A.info.vertexFloats;
		const fix = propLayers( A, name, P );
		_n.getNormalMatrix( matrix );
		const base = this.pos.length / 3;
		for ( let i = 0; i < P.vCount; i ++ ) {

			const k = ( P.vOff + i ) * F;
			_v.set( V[ k ], V[ k + 1 ], V[ k + 2 ] ).applyMatrix4( matrix );
			_w.set( V[ k + 3 ], V[ k + 4 ], V[ k + 5 ] ).applyMatrix3( _n ).normalize();
			this._vert( _v, _w, [ V[ k + 6 ], V[ k + 7 ] ], [ 1, 1, 1 ], LAYER.PROP + ( fix ? fix.layer[ i ] : V[ k + 8 ] ), fix ? [ fix.uv2[ i * 2 ], fix.uv2[ i * 2 + 1 ] ] : [ 0, 0 ] );

		}

		for ( let i = 0; i < P.iCount; i ++ ) this.idx.push( base + A.index[ P.iOff + i ] );

	}

	// bounds of a prop (for placing it on a surface)
	bounds( name ) {

		return this.assets.info.props[ name ];

	}

	build() {

		const g = new BufferGeometry();
		g.setAttribute( 'position', new Float32BufferAttribute( this.pos, 3 ) );
		g.setAttribute( 'normal', new Float32BufferAttribute( this.nrm, 3 ) );
		g.setAttribute( 'uv', new Float32BufferAttribute( this.uv, 2 ) );
		g.setAttribute( 'color', new Float32BufferAttribute( this.col, 4 ) );
		g.setAttribute( 'aLayer', new Float32BufferAttribute( this.layer, 1 ) );
		g.setAttribute( 'aUV2', new Float32BufferAttribute( this.uv2, 2 ) );
		g.setIndex( new Uint32BufferAttribute( this.idx, 1 ) );
		g.computeBoundingBox();
		g.computeBoundingSphere();
		return g;

	}

}

// Per-vertex texture layers of a prop, where props.bin lost a material. The decimated lantern came
// out as one material (the frame): its four glass panes are found again as the thin flat pieces
// between the rails (~25 cm tall, ~1 cm thick) and given the glass layer (wooden_lantern_01_1);
// their uv2 is the position on the pane in metres (across, up) for the flame's glow.
const _propLayers = new Map();
function propLayers( A, name, P ) {

	if ( name !== 'wooden_lantern_01' ) return null;
	if ( _propLayers.has( name ) ) return _propLayers.get( name );
	const glassLayer = A.info.layers.indexOf( 'wooden_lantern_01_1' );
	if ( glassLayer < 0 ) return null;
	const V = A.verts, F = A.info.vertexFloats, n = P.vCount;
	// connected pieces: shared indices and coincident positions
	const parent = new Int32Array( n ).map( ( _, i ) => i );
	const find = ( a ) => {

		while ( parent[ a ] !== a ) a = parent[ a ] = parent[ parent[ a ] ];
		return a;

	};

	const union = ( a, b ) => { parent[ find( a ) ] = find( b ); };
	const seen = new Map();
	for ( let i = 0; i < n; i ++ ) {

		const k = ( P.vOff + i ) * F;
		const key = `${ Math.round( V[ k ] * 1e4 ) },${ Math.round( V[ k + 1 ] * 1e4 ) },${ Math.round( V[ k + 2 ] * 1e4 ) }`;
		if ( seen.has( key ) ) union( i, seen.get( key ) );
		else seen.set( key, i );

	}

	for ( let t = 0; t < P.iCount; t += 3 ) {

		const a = A.index[ P.iOff + t ];
		union( a, A.index[ P.iOff + t + 1 ] );
		union( a, A.index[ P.iOff + t + 2 ] );

	}

	const box = new Map();
	for ( let i = 0; i < n; i ++ ) {

		const r = find( i ), k = ( P.vOff + i ) * F;
		let b = box.get( r );
		if ( ! b ) box.set( r, b = [ 1e9, 1e9, 1e9, - 1e9, - 1e9, - 1e9 ] );
		for ( let j = 0; j < 3; j ++ ) {

			b[ j ] = Math.min( b[ j ], V[ k + j ] );
			b[ j + 3 ] = Math.max( b[ j + 3 ], V[ k + j ] );

		}

	}

	const out = { layer: new Float32Array( n ), uv2: new Float32Array( n * 2 ) };
	for ( let i = 0; i < n; i ++ ) {

		const b = box.get( find( i ) ), k = ( P.vOff + i ) * F;
		const thinX = b[ 3 ] - b[ 0 ] < b[ 5 ] - b[ 2 ];
		const pane = b[ 4 ] - b[ 1 ] > 0.2 && b[ 1 ] > 0.045 && b[ 4 ] < 0.3 && Math.min( b[ 3 ] - b[ 0 ], b[ 5 ] - b[ 2 ] ) < 0.015;
		out.layer[ i ] = pane ? glassLayer : V[ k + 8 ];
		out.uv2[ i * 2 ] = thinX ? V[ k + 2 ] : V[ k ];
		out.uv2[ i * 2 + 1 ] = V[ k + 1 ];

	}

	_propLayers.set( name, out );
	return out;

}

// helpers for common shapes
export const Shapes = {
	cylinder: ( rt, rb, h, seg = 16, open = false ) => new CylinderGeometry( rt, rb, h, seg, 1, open ),
	torus: ( r, t, rs = 8, ts = 24 ) => new TorusGeometry( r, t, rs, ts ),
	sphere: ( r, ws = 14, hs = 10 ) => new SphereGeometry( r, ws, hs ),
	lathe: ( pts, seg = 16 ) => new LatheGeometry( pts.map( ( [ x, y ] ) => new Vector2( x, y ) ), seg ),
};
