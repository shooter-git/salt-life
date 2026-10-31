import * as THREE from '../engine/index.js';
import { G } from '../core/Globals.js';
import { COVER, NO_COVER, decodeHeight } from '../world/Cover.js';
import { HOUSE, roofTopY } from '../world/boat/Wheelhouse.js';
import { CROWN_GLSL } from './Rain.js';

const f = ( x ) => {

	const s = String( x );
	return s.includes( '.' ) || s.includes( 'e' ) ? s : s + '.0';

};

// (M11) Drips: off the eaves of the village's roofs and stalls (where the cover map's tin, thatch or
// canvas runs down to an edge with a drop under it: world/Cover.js), off the wheelhouse roof's sides and
// back (in the boat's frame), and off the palms' fronds (a ring under each crown). Each place drips
// now and then, a drop falling from rest and splashing where it lands (the rain's crown: Rain.js), in
// the rain and for a minute or two after it while everything's soaked (G.wet).
//
// Each drips at its own rhythm (a period of its own, from its seed); how hard it's dripping is how
// many of those drops fall (each a chance), so a change in the rain never jolts a drop on its way.
// The places nearest the camera (within RANGE) take the instances: one instanced draw.
//
// The rhythm and the chances come from an integer hash of the seed (dripRand), the same on the GPU and
// here to the bit, so the drops that land near the camera (within HEAR) can be heard as they're seen:
// `landed`, each frame, those that landed on something that sounds (LANDS: wood or the boat, tin).
//   const drips = new Drips( { tier, flash } ); scene.add( drips.mesh );
//   drips.setPoints( [ ...eavePoints( cover, groundAt ), ...palmPoints( palms, groundAt, cover ) ] )
//   drips.setBoat( wheelhousePoints( boat.lines ) )
//   drips.update( dt, camera, cameraWaterHeight, viewHeight, boatMatrixWorld )   (each frame)
//   drips.landed: [ { x, y, z, on } ] this frame's, near the camera

const COUNT = { low: 120, mid: 240, high: 400 };
const RANGE = 22; // m: the drips drawn about the camera
const CELL = 8; // m: the places' grid, to find those near
const RESELECT = 0.3, MOVED = 1.5; // s, m: how often the nearest are looked for again, or once the camera's moved
const HEAR = 14; // m: the drops heard landing about the camera
// (each place: x, the y it falls from, z, the y it lands on, its seed, what it lands on: LANDS)
export const STRIDE = 6;
// what a drop lands on, as it sounds: nothing to speak of (the sand, the sea, thatch), something dull
// (wood, the boat, stone, canvas), tin (it rings)
export const LANDS = { SOFT: 0, DULL: 1, TIN: 2 };
const SOUNDS_OF = { [ COVER.WOOD ]: LANDS.DULL, [ COVER.HARD ]: LANDS.DULL, [ COVER.STONE ]: LANDS.DULL, [ COVER.CANVAS ]: LANDS.DULL, [ COVER.TIN ]: LANDS.TIN };
// the eaves: what drips (tin, thatch, canvas: not the decks, the rails, the stone), how far its edge
// has to be over what's under it (m), how much the roof has to fall toward its edge over a texel (m: a
// gable's rake, level along its edge, doesn't drip), and one texel in this many of an eave
const EAVE_KINDS = new Set( [ COVER.TIN, COVER.THATCH, COVER.CANVAS ] );
const EAVE_DROP = 0.6;
const EAVE_SLOPE = 0.03;
const EAVE_EVERY = 3;
// the palms: places a crown, how far out (m, of the palm's scale) and how far under the crown its
// fronds' tips hang
const PALM_DRIPS = 7;
const PALM_REACH = [ 2.6, 3.8 ];
const PALM_DROOP = [ 1.2, 2.4 ];
// a drop: its size (m), its fall (m/s^2) and the fastest it falls (m/s), a look's motion blur (s), how
// much more a streak shows than its breadth would (as the rain's); the shortest a place drips again
// (s, at its fastest: each has its own, up to twice that, and at least its fall and splash)
const SIZE = 0.004;
const FALL = 9.8;
const TERMINAL = 9;
const EXPOSURE = 0.04;
const VISIBILITY = 3.5;
const PERIOD = 0.6;
const SPLASH_LIFE = 0.15, SPLASH_SIZE = 0.07;

// a hash of two integers, 0..1
const hash01 = ( a, b ) => {

	let h = ( Math.imul( a | 0, 374761393 ) + Math.imul( b | 0, 668265263 ) ) | 0;
	h = Math.imul( h ^ ( h >>> 13 ), 1274126177 );
	return ( ( h ^ ( h >>> 16 ) ) >>> 0 ) / 4294967296;

};

// (the drops' rhythm and chances, the GPU's to the bit: DRIP_RAND_GLSL) a 32-bit integer mix, and a
// number 0..1 (24 bits) from a seed (0..1, as a float32) and an integer k
const mix32 = ( x ) => {

	x ^= x >>> 16;
	x = Math.imul( x, 0x7feb352d );
	x ^= x >>> 15;
	x = Math.imul( x, 0x846ca68b );
	x ^= x >>> 16;
	return x >>> 0;

};
export const dripRand = ( seed, k ) => {

	const h = mix32( ( Math.floor( Math.fround( seed ) * 16777216 ) ^ mix32( ( k + 0x9e3779b9 ) >>> 0 ) ) >>> 0 );
	return ( h >>> 8 ) / 16777216;

};
const DRIP_RAND_GLSL = /* glsl */`
uint dripMix( uint x ) {
	x ^= x >> 16u;
	x *= 0x7feb352du;
	x ^= x >> 15u;
	x *= 0x846ca68bu;
	x ^= x >> 16u;
	return x;
}
float dripRand( float seed, float k ) {
	return float( dripMix( uint( seed * 16777216.0 ) ^ dripMix( uint( k ) + 0x9e3779b9u ) ) >> 8u ) / 16777216.0;
}
`;
// a place's rhythm: how long its drop falls (s), how often it drips (s), its phase (of a period); and
// the chance key of a cycle's drop (dripRand( seed, CHANCE + cycle ) < how hard it's dripping)
const CHANCE = 16;
export function dripRhythm( top, bottom, seed ) {

	const fallT = Math.sqrt( 2 * Math.max( top - bottom, 0.05 ) / FALL );
	return { fallT, period: Math.max( PERIOD * ( 1 + dripRand( seed, 1 ) ), fallT + SPLASH_LIFE + 0.1 ), phase: dripRand( seed, 2 ) };

}

// the cycle whose drop lands in ( t0, t1 ] (s on the drips' clock), or -1; whether it falls is its chance
export function landingIn( t0, t1, top, bottom, seed ) {

	const { fallT, period, phase } = dripRhythm( top, bottom, seed );
	const c = Math.floor( ( t1 - fallT ) / period + phase );
	const at = ( c - phase ) * period + fallT;
	return at > t0 && at <= t1 ? c : - 1;

}

const smooth = ( a, b, x ) => {

	const t = Math.min( 1, Math.max( 0, ( x - a ) / ( b - a ) ) );
	return t * t * ( 3 - 2 * t );

};

// how hard it's dripping, 0..1: in the rain (a shower's enough), and after it while everything's still
// soaked (G.wet dries over four minutes: the drips stop within the first two)
export const dripFlow = ( rain, wet ) => Math.max( Math.min( 1, rain * 2.5 ), smooth( 0.55, 1, wet ) );

// The eaves in a cover map (a CoverMap, built): where a roof (EAVE_KINDS) falls toward an edge with more
// than EAVE_DROP under it, a place just outside the edge, on what's under it (groundAt( x, z ): the
// ground or the sea, which say nothing; or a lower cover, as it sounds). Every EAVE_EVERY-th texel of an
// eave, about
export function eavePoints( cover, groundAt ) {

	const { data, width: W, height: H, texel: T, originX, originZ } = cover;
	const out = [];
	if ( ! data ) return out;
	const at = ( i, j ) => decodeHeight( data[ ( j * W + i ) * 4 ] * 256 + data[ ( j * W + i ) * 4 + 1 ] );
	const DIRS = [ [ 1, 0 ], [ - 1, 0 ], [ 0, 1 ], [ 0, - 1 ] ];
	for ( let j = 1; j < H - 1; j ++ ) for ( let i = 1; i < W - 1; i ++ ) {

		if ( ! EAVE_KINDS.has( data[ ( j * W + i ) * 4 + 2 ] ) ) continue;
		const h = at( i, j );
		if ( h === NO_COVER || hash01( i, j ) * EAVE_EVERY >= 1 ) continue;
		for ( let d = 0; d < 4; d ++ ) {

			const [ di, dj ] = DIRS[ d ];
			// (the roof falls toward this edge: the texel inward from it is higher)
			const hm = at( i - di, j - dj );
			if ( hm === NO_COVER || hm - h < EAVE_SLOPE ) continue;
			const x = originX + ( i + 0.5 + di * 0.5 ) * T + di * 0.04, z = originZ + ( j + 0.5 + dj * 0.5 ) * T + dj * 0.04;
			const ground = groundAt( x, z ), under = at( i + di, j + dj ), below = Math.max( ground, under );
			if ( h - below < EAVE_DROP ) continue;
			const on = under > ground ? SOUNDS_OF[ data[ ( ( j + dj ) * W + i + di ) * 4 + 2 ] ] ?? LANDS.SOFT : LANDS.SOFT;
			out.push( x, h - 0.03, z, below, hash01( i * 4 + d, j + 7919 ), on );
			break;

		}

	}

	return out;

}

// The palms (Vegetation's records: x, y, z at the foot, s its scale, H the stem's height, la and l the
// lean's azimuth and fraction of H): PALM_DRIPS places under each crown's fronds, landing on the ground
// or on what covers it there
export function palmPoints( palms, groundAt, cover = null ) {

	const out = [];
	for ( let n = 0; n < palms.length; n ++ ) {

		const r = palms[ n ], s = r.s || 1, lean = ( r.l || 0 ) * r.H;
		const cx = r.x + Math.cos( r.la || 0 ) * lean, cz = r.z + Math.sin( r.la || 0 ) * lean, cy = r.y + r.H;
		for ( let k = 0; k < PALM_DRIPS; k ++ ) {

			const a = ( r.seed || 0 ) * Math.PI * 2 + k * 2.39996;
			const reach = s * ( PALM_REACH[ 0 ] + ( PALM_REACH[ 1 ] - PALM_REACH[ 0 ] ) * hash01( n, k ) );
			const droop = s * ( PALM_DROOP[ 0 ] + ( PALM_DROOP[ 1 ] - PALM_DROOP[ 0 ] ) * hash01( k, n + 31 ) );
			const x = cx + Math.cos( a ) * reach, z = cz + Math.sin( a ) * reach, y = cy - droop;
			const ground = groundAt( x, z ), under = cover ? cover.heightAt( x, z ) : NO_COVER, below = Math.max( ground, under );
			if ( y - below < EAVE_DROP ) continue;
			out.push( x, y, z, below, hash01( n + 104729, k ), under > ground ? SOUNDS_OF[ cover.kindAt( x, z ) ] ?? LANDS.SOFT : LANDS.SOFT );

		}

	}

	return out;

}

// The wheelhouse roof, in the boat's frame (lines: her HullLines): its camber sheds the rain off its
// sides, onto the gunwales beside the house, and off its back edge, into the cockpit (dull, both)
export function wheelhousePoints( lines ) {

	const out = [];
	const y = roofTopY( 1.25 ) - 0.02;
	let k = 0;
	for ( let z = HOUSE.roofZ0 + 0.15; z < HOUSE.roofZ1 - 0.1; z += 0.3 ) for ( const sx of [ - 1, 1 ] ) {

		out.push( sx * 1.28, y, z, lines.sheerY( lines.tAtSheerZ( z ) ), hash01( 77, k ++ ), LANDS.DULL );

	}

	for ( let x = - 1.05; x <= 1.06; x += 0.3 ) out.push( x, y, HOUSE.roofZ0 - 0.03, lines.deckY, hash01( 78, k ++ ), LANDS.DULL );
	return out;

}

export class Drips {

	// flash: the lightning's light ( { value } , Rain's)
	constructor( { tier = 'high', flash = { value: 0 } } = {} ) {

		const count = this.count = COUNT[ tier ] ?? COUNT.low;
		this.points = new Float32Array( 0 );
		this.cells = new Map();
		this.boat = new Float32Array( 0 );
		this._statics = 0;
		this._since = Infinity;
		this._at = new THREE.Vector3( 1e9, 0, 0 );
		this._near = [];
		this.lands = new Uint8Array( count ); // (what each instance's drop lands on: LANDS)
		this.landed = [];
		this._pool = [];
		this.uniforms = {
			...THREE.UniformsUtils.clone( THREE.UniformsLib.fog ),
			dripTime: { value: 0 },
			dripFlow: { value: 0 },
			dripViewHeight: { value: 720 },
			dripSeaLevel: G.seaLevel,
			dripSunDir: G.sunDir,
			dripSun: G.sunColor,
			dripSky: G.skyIrradiance,
			dripFlash: flash,
			// ((M15) where they're drawn about: a point by the camera, to a metre (the mesh put there), as tens of
			// km out a 32-bit float's step, 4 mm at 40 km, shook the boat's drips against her)
			dripAt: { value: new THREE.Vector3() },
		};

		const vertexShader = /* glsl */`
#include <common>
#include <fog_pars_vertex>
attribute vec4 aDrip; // x, the y it falls from, z, the y it lands on (world; (M15) x and z about dripAt)
attribute float aSeed;
uniform float dripTime;
uniform float dripFlow;
uniform float dripViewHeight;
uniform float dripSeaLevel;
uniform vec3 dripSunDir;
uniform vec3 dripSun;
uniform vec3 dripSky;
uniform float dripFlash;
uniform vec3 dripAt;
varying vec4 vDripCol; // radiance, opacity
varying vec3 vDripUV; // quad corner, how far through its splash (-1: falling)
${ DRIP_RAND_GLSL }
float dripSs( float a, float b, float x ) { float t = clamp( ( x - a ) / ( b - a ), 0.0, 1.0 ); return t * t * ( 3.0 - 2.0 * t ); }
void main() {
	// its rhythm (dripRhythm): a period of its own, at least its fall and its splash
	float drop = max( aDrip.y - aDrip.w, 0.05 );
	float fallT = sqrt( 2.0 * drop / ${ f( FALL ) } );
	float period = max( ${ f( PERIOD ) } * ( 1.0 + dripRand( aSeed, 1.0 ) ), fallT + ${ f( SPLASH_LIFE ) } + 0.1 );
	float k = dripTime / period + dripRand( aSeed, 2.0 ), cycle = floor( k ), tc = fract( k ) * period;
	// whether this one falls: a chance, the harder it's dripping the likelier
	float keep = dripRand( aSeed, cycle + ${ f( CHANCE ) } ) < dripFlow ? 1.0 : 0.0;
	bool falling = tc < fallT;
	float life = ( tc - fallT ) / ${ f( SPLASH_LIFE ) };
	// (a splash where it lands, but on the sea)
	float splash = ! falling && life < 1.0 && aDrip.w > dripSeaLevel + 0.03 ? 1.0 : 0.0;
	vec3 p = vec3( aDrip.x, falling ? aDrip.y - 0.5 * ${ f( FALL ) } * tc * tc : aDrip.w, aDrip.z );
	vec3 toCam = ( cameraPosition - dripAt ) - p;
	float dist = max( length( toCam ), 0.05 );
	vec3 Vd = toCam / dist;
	float pixel = dist * 2.0 / ( projectionMatrix[ 1 ][ 1 ] * dripViewHeight );
	float fade = dripSs( 0.4, 1.2, dist ) * ( 1.0 - dripSs( ${ f( RANGE * 0.7 ) }, ${ f( RANGE ) }, dist ) );
	float glint = 0.5 * pow( max( - dot( Vd, dripSunDir ), 0.0 ), 8.0 );
	vec2 corner = position.xy; // plane is 2 x 2
	vec3 world;
	float a;
	if ( falling ) {
		// the streak a moment's look leaves, above the drop (where it's come from), at least ~1.2 px across
		float v = min( ${ f( FALL ) } * tc, ${ f( TERMINAL ) } );
		float width = max( ${ f( SIZE ) }, pixel * 1.2 );
		float len = max( v * ${ f( EXPOSURE ) }, pixel * 3.0 );
		vec3 across = normalize( cross( vec3( 0.0, 1.0, 0.0 ), Vd ) + vec3( 1e-5, 0.0, 0.0 ) );
		world = p + across * ( corner.x * width ) + vec3( 0.0, ( corner.y + 1.0 ) * len * 0.5, 0.0 );
		// (bigger than a raindrop, and as bright: a bead of the sky's light)
		a = min( ${ f( SIZE ) } / width * ${ f( VISIBILITY ) }, 1.0 ) * 0.8;
		vDripCol.rgb = dripSky * 0.9 + dripSun * ( 0.04 + glint ) + vec3( 0.8, 0.85, 1.0 ) * dripFlash * 0.4;
		vDripUV = vec3( corner, - 1.0 );
	} else {
		// the crown where it lands, facing you (about the upright), at least a couple of pixels across
		float w = max( ${ f( SPLASH_SIZE ) } * ( 0.5 + 0.5 * life ), pixel * 2.0 );
		vec3 right = normalize( vec3( - toCam.z, 0.0, toCam.x ) + vec3( 1e-5, 0.0, 0.0 ) );
		world = p + right * ( corner.x * w ) + vec3( 0.0, ( corner.y + 1.0 ) * 0.4 * w, 0.0 );
		a = 0.8 * splash;
		vDripCol.rgb = dripSky * 2.2 + dripSun * ( 0.1 + glint ) + vec3( 0.8, 0.85, 1.0 ) * dripFlash * 0.6;
		vDripUV = vec3( corner, clamp( life, 0.0, 1.0 ) );
	}
	a *= keep * fade;
	vDripCol.a = a;
	vec4 mvPosition = modelViewMatrix * vec4( world, 1.0 );
	gl_Position = projectionMatrix * mvPosition;
	// nothing to draw: off the screen
	if ( a < 2e-4 ) gl_Position = vec4( 0.0, 0.0, 2.0, 1.0 );
	#include <fog_vertex>
}
`;

		// a soft streak falling, or the crown where it lands
		const fragmentShader = /* glsl */`
#include <common>
#include <fog_pars_fragment>
varying vec4 vDripCol;
varying vec3 vDripUV;
${ CROWN_GLSL }
void main() {
	vec2 uv = vDripUV.xy;
	float g = vDripUV.z < 0.0 ? ( 1.0 - uv.x * uv.x ) * ( 1.0 - uv.y * uv.y ) * 1.6 : splashCrown( uv, vDripUV.z );
	float a = clamp( vDripCol.w * g, 0.0, 1.0 );
	if ( a < 0.003 ) discard;
	gl_FragColor = vec4( vDripCol.rgb * a, a );
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
#ifdef USE_FOG
	// (premultiplied: the fog's colour by the drop's coverage; materials/HeightHaze.js)
	gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor * gl_FragColor.a, sceneFogFactor() );
#endif
}
`;

		this.material = new THREE.ShaderMaterial( {
			name: 'Drips',
			uniforms: this.uniforms,
			vertexShader,
			fragmentShader,
			transparent: true,
			depthWrite: false,
			side: THREE.DoubleSide,
			fog: true,
			blending: THREE.CustomBlending,
			blendSrc: THREE.OneFactor,
			blendDst: THREE.OneMinusSrcAlphaFactor,
			blendSrcAlpha: THREE.OneFactor,
			blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
			premultipliedAlpha: true,
		} );
		this.material.forceSinglePass = true;

		const plane = new THREE.PlaneGeometry( 2, 2 );
		const geo = new THREE.InstancedBufferGeometry();
		geo.index = plane.index;
		geo.setAttribute( 'position', plane.getAttribute( 'position' ) );
		this.drip = new THREE.InstancedBufferAttribute( new Float32Array( count * 4 ), 4 ).setUsage( THREE.DynamicDrawUsage );
		this.seed = new THREE.InstancedBufferAttribute( new Float32Array( count ), 1 ).setUsage( THREE.DynamicDrawUsage );
		geo.setAttribute( 'aDrip', this.drip );
		geo.setAttribute( 'aSeed', this.seed );
		geo.instanceCount = 0;
		geo.boundingSphere = new THREE.Sphere( new THREE.Vector3(), 1e5 );
		this.mesh = new THREE.Mesh( geo, this.material );
		this.mesh.name = 'Drips';
		this.mesh.frustumCulled = false;
		this.mesh.matrixAutoUpdate = false;
		this.mesh.renderOrder = 21;
		this.mesh.visible = false;

	}

	// the places that drip (STRIDE floats each, world), found near the camera on a grid
	setPoints( points ) {

		this.points = points instanceof Float32Array ? points : new Float32Array( points );
		this.cells.clear();
		for ( let n = 0; n < this.points.length / STRIDE; n ++ ) {

			const key = cellKey( this.points[ n * STRIDE ], this.points[ n * STRIDE + 2 ] );
			const list = this.cells.get( key );
			if ( list ) list.push( n );
			else this.cells.set( key, [ n ] );

		}

		this._since = Infinity;

	}

	// the boat's places (in her frame: wheelhousePoints)
	setBoat( points ) {

		this.boat = points instanceof Float32Array ? points : new Float32Array( points );

	}

	// cameraWaterHeight: the water level at the camera (none drawn with the camera under water); boat: her
	// matrixWorld (her drips with her), or null
	update( dt, camera, cameraWaterHeight = 0, viewHeight = 720, boat = null ) {

		const U = this.uniforms;
		const flow = dripFlow( G.rain.value, G.wet.value );
		const t0 = U.dripTime.value, t1 = ( t0 + dt ) % 3600;
		U.dripFlow.value = flow;
		U.dripTime.value = t1;
		for ( const l of this.landed ) this._pool.push( l );
		this.landed.length = 0;
		const visible = flow > 0.002 && camera.position.y > cameraWaterHeight;
		this.mesh.visible = visible;
		if ( ! visible ) return;
		U.dripViewHeight.value = viewHeight;
		const c = camera.position;
		let dirty = false;
		this._since += dt;
		if ( this._since > RESELECT || Math.hypot( c.x - this._at.x, c.z - this._at.z ) > MOVED ) {

			this._since = 0;
			this._at.copy( c );
			U.dripAt.value.set( Math.round( c.x ), 0, Math.round( c.z ) );
			this.mesh.position.copy( U.dripAt.value );
			this.mesh.updateMatrix();
			this._statics = this._select( c.x, c.z, this.count - this.boat.length / STRIDE );
			dirty = true;

		}

		// the boat's, after the island's: where she is now, when she's near
		let used = this._statics;
		if ( boat && this.boat.length ) {

			const e = boat.elements;
			if ( Math.hypot( e[ 12 ] - c.x, e[ 14 ] - c.z ) < RANGE + 6 ) {

				const B = this.boat, D = this.drip.array, S = this.seed.array, at = U.dripAt.value;
				for ( let n = 0; n < B.length / STRIDE && used < this.count; n ++, used ++ ) {

					const x = B[ n * STRIDE ], y = B[ n * STRIDE + 1 ], z = B[ n * STRIDE + 2 ], yb = B[ n * STRIDE + 3 ];
					D[ used * 4 ] = e[ 0 ] * x + e[ 4 ] * y + e[ 8 ] * z + e[ 12 ] - at.x;
					D[ used * 4 + 1 ] = e[ 1 ] * x + e[ 5 ] * y + e[ 9 ] * z + e[ 13 ];
					D[ used * 4 + 2 ] = e[ 2 ] * x + e[ 6 ] * y + e[ 10 ] * z + e[ 14 ] - at.z;
					D[ used * 4 + 3 ] = e[ 1 ] * x + e[ 5 ] * yb + e[ 9 ] * z + e[ 13 ];
					S[ used ] = B[ n * STRIDE + 4 ];
					this.lands[ used ] = B[ n * STRIDE + 5 ];

				}

				dirty = true;

			}

		}

		if ( dirty ) {

			this.mesh.geometry.instanceCount = used;
			this.drip.needsUpdate = true;
			this.seed.needsUpdate = true;

		}

		// the drops that landed since the last frame, near enough to hear, on something that sounds (the
		// clock wraps once an hour: that frame's go unheard)
		if ( t1 > t0 ) this._landings( t0, t1, flow, c, used );

	}

	_landings( t0, t1, flow, c, used ) {

		const D = this.drip.array, S = this.seed.array, at = this.uniforms.dripAt.value;
		for ( let s = 0; s < used; s ++ ) {

			if ( this.lands[ s ] === LANDS.SOFT || D[ s * 4 + 3 ] <= G.seaLevel.value + 0.03 ) continue;
			const x = D[ s * 4 ] + at.x, z = D[ s * 4 + 2 ] + at.z;
			if ( Math.abs( x - c.x ) > HEAR || Math.abs( z - c.z ) > HEAR || Math.hypot( x - c.x, z - c.z ) > HEAR ) continue;
			const cycle = landingIn( t0, t1, D[ s * 4 + 1 ], D[ s * 4 + 3 ], S[ s ] );
			if ( cycle < 0 || dripRand( S[ s ], cycle + CHANCE ) >= flow ) continue;
			const l = this._pool.pop() || {};
			l.x = x;
			l.y = D[ s * 4 + 3 ];
			l.z = z;
			l.on = this.lands[ s ];
			this.landed.push( l );

		}

	}

	// the nearest places within RANGE of ( cx, cz ), at most max of them, into the first instances;
	// how many
	_select( cx, cz, max ) {

		const P = this.points, near = this._near;
		near.length = 0;
		const r = Math.ceil( RANGE / CELL ), i0 = Math.floor( cx / CELL ), j0 = Math.floor( cz / CELL );
		const d2 = ( n ) => ( P[ n * STRIDE ] - cx ) ** 2 + ( P[ n * STRIDE + 2 ] - cz ) ** 2;
		for ( let di = - r; di <= r; di ++ ) for ( let dj = - r; dj <= r; dj ++ ) {

			const list = this.cells.get( ( i0 + di + 4096 ) * 8192 + ( j0 + dj + 4096 ) );
			if ( list ) for ( const n of list ) if ( d2( n ) < RANGE * RANGE ) near.push( n );

		}

		if ( near.length > max ) {

			near.sort( ( a, b ) => d2( a ) - d2( b ) );
			near.length = Math.max( 0, max );

		}

		const D = this.drip.array, S = this.seed.array, at = this.uniforms.dripAt.value;
		for ( let s = 0; s < near.length; s ++ ) {

			const n = near[ s ];
			for ( let q = 0; q < 4; q ++ ) D[ s * 4 + q ] = P[ n * STRIDE + q ] - ( q === 0 ? at.x : q === 2 ? at.z : 0 );
			S[ s ] = P[ n * STRIDE + 4 ];
			this.lands[ s ] = P[ n * STRIDE + 5 ];

		}

		return near.length;

	}

	dispose() {

		this.mesh.geometry.dispose();
		this.material.dispose();

	}

}

const cellKey = ( x, z ) => ( Math.floor( x / CELL ) + 4096 ) * 8192 + ( Math.floor( z / CELL ) + 4096 );
