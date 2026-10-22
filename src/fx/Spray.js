import * as THREE from 'three';
import { G, GRAVITY } from '../core/Globals.js';

// Spray particles: drops, ligaments, dense spray, mist and clear sheets.
//
// Particles are integrated with gravity + drag toward the air around them (the wind; mist first
// keeps the air pushed along by whatever threw it) and die when they fall back into the water.
//
// Rendering (soft camera-facing sprites, premultiplied alpha):
//  * drops and ligaments are clear water: sub-pixel drops are drawn as motion-blurred streaks whose
//    opacity conserves the drop's cross-section (a drop covering 1/10 of a pixel for 1/5 of the
//    exposure adds 1/50 of its colour), so their visual weight is the amount of water; they show the
//    bright sky they refract, a tiny sun glint, and light up strongly when backlit (forward lobe)
//  * dense spray (clouds of drops) is white from every side (multiple scattering), with a forward
//    lobe and its own shadow on the far side
//  * mist is a thin, strongly forward-scattering, sky-tinted veil
//  * clear sheets (a boat's bow sheet) are thin water: translucent, showing the sky, glowing when
//    backlit, torn into strands and drop clusters as they age
//  * all of it is darker at night (the sun's and the sky's light)
//
// Particles collide with one moving body (the boat, setBody): its hull (plan outline with an
// elliptic bow, up to the sheer) and one box (the wheelhouse). They are pushed out through the
// nearest face, lose the velocity into it (relative to the body), and drops that hit it run off.
//
// (Salt Life) Tidewater's pool lived on the GPU (a 40k storage ring, compute kernels, the breaking
// waves emitting there too). Here it is a CPU pool of 1k-4k particles by tier, with the same emit
// API and the same motion: the water under a particle is asked for (Waves.heightAt) only once it
// falls toward it; live particles are drawn as one instanced sprite batch (the same shading, minus
// the soft edges against the scene's depth, which no pass here makes).
//
//   spray.emit( position, velocity, count, size, kind, { spread, jitter, life, to, sizeJitter } )
//   spray.emitAlongPoints( points, velocity, countPerSegment, size, kind, opts )
//   spray.setBodyShape( {...} ); spray.setBody( matrixWorld, velocity )   (the boat)
//   spray.update( dt, camera, viewHeight )                                (each frame, after emitters)

export const SPRAY = { DROPLET: 0, MIST: 1, LIGAMENT: 2, SPRAY: 3, SHEET: 4 };

// per-kind constants: droplet (a drop of a few mm, ballistic), mist (fine drops that follow the air),
// ligament (an elongated blob of water, ~1-2 cm, torn off a sheet or jet), spray (a cloud of drops:
// the white of splashes), sheet (a thin clear sheet of water peeling off a hull, spreading and tearing)
const KIND = {
	tau: [ 3.0, 0.35, 5.0, 1.8, 2.5 ], // drag time constant toward the air velocity (s): ~ drop size^2
	grav: [ GRAVITY, 0.3, GRAVITY, 8.5, GRAVITY ], // effective gravity (mist barely settles; torn sheets fall back)
	turb: [ 0, 0.5, 0, 0.3, 0.1 ], // turbulent wander (m/s^2, zero mean)
	grow: [ 0, 0.22, 0, 0.3, 0.7 ], // size growth (1/s)
	dies: [ 1, 0, 1, 1, 1 ], // killed when falling into the water (else skims over it)
	stretch: [ 1 / 40, 0, 1 / 40, 1 / 30, 1 / 60 ], // motion blur (s of travel)
	alpha: [ 0.55, 0.06, 0.8, 0.66, 0.22 ], // (dense spray: see-through, streaked by its motion, never cotton wool)
	fadeIn: [ 0.02, 0.2, 0.02, 0.12, 0.02 ], // (dense spray blooms out of the splash instead of popping in)
	fadeOut: [ 0.8, 0.45, 0.8, 0.7, 0.5 ], // fraction of life when it starts to fade
};

// pool size, and the share of mist and spray clouds kept (the most overdraw), by tier
const TIER = {
	low: { capacity: 1024, cloud: 0.5 },
	mid: { capacity: 2048, cloud: 0.8 },
	high: { capacity: 4096, cloud: 1 },
};

const fl = ( x ) => {

	const s = String( x );
	return /[.e]/.test( s ) ? s : s + '.0';

};

// a per-kind constant (GLSL expression)
const byKind = ( kind, arr ) => `sprayByKind( ${ kind }, ${ arr.map( fl ).join( ', ' ) } )`;

const COMMON = /* glsl */`
float sprayByKind( float kind, float a, float b, float c, float d, float e ) {
	return kind < 0.5 ? a : kind < 1.5 ? b : kind < 2.5 ? c : kind < 3.5 ? d : e;
}
// Henyey-Greenstein phase (1/sr)
float sprayPhaseHG( float cosT, float g ) {
	float g2 = g * g;
	return ( ( 1.0 - g2 ) / ( 4.0 * PI ) ) / pow( max( 1.0 + g2 - 2.0 * g * cosT, 1e-4 ), 1.5 );
}
`;

const VERTEX = /* glsl */`
#include <common>
#include <fog_pars_vertex>
attribute vec4 iPos; // xyz, age (s)
attribute vec4 iVel; // xyz, radius (m)
attribute vec4 iInfo; // kind, life (s), water height under it, seed
uniform vec3 spraySunDir;
uniform vec3 spraySun;
uniform vec3 spraySky;
uniform float sprayIntensity;
uniform float sprayMaxDistance;
uniform float sprayViewHeight;
varying vec2 vUV;
varying vec4 vCol; // radiance, opacity
varying vec4 vMisc; // kind + 0.45 * life fraction, water height, size, seed
varying vec4 vFwd; // forward-scattered sun (thin parts glow with it), w: half-size in pixels
varying float vWorldY;
${ COMMON }
void main() {
	vec3 p = iPos.xyz;
	float age = iPos.w;
	vec3 vel = iVel.xyz;
	float kind = iInfo.x;
	float life = iInfo.y;
	bool isDrop = kind < 0.5;
	bool isLig = kind > 1.5 && kind < 2.5;
	bool isMist = kind > 0.5 && kind < 1.5;
	bool water = isDrop || isLig; // clear water: drops and ligaments

	vec3 toCam = cameraPosition - p;
	float dist = max( length( toCam ), 0.05 );
	vec3 Vd = toCam / dist;

	// pixel footprint at this distance: drops are drawn at least ~1.3 px wide
	float pixel = dist * 2.0 / ( projectionMatrix[ 1 ][ 1 ] * sprayViewHeight );
	float r0 = iVel.w;
	// dense spray is thrown out of the splash as a compact mass and spreads (grows from ~half size)
	float tAge = age / max( life, 1e-3 );
	float r = kind > 2.5 && kind < 3.5 ? r0 * mix( 0.45, 1.0, smoothstep( 0.0, 0.25, tAge ) ) : r0;
	float size = max( r, pixel * 1.3 );

	// motion blur along the velocity projected on the view plane; ligaments are elongated anyway
	vec3 vPerp = vel - Vd * dot( vel, Vd );
	float speed = length( vPerp );
	float stretchLen = speed * ${ byKind( 'kind', KIND.stretch ) };
	float elong = isLig ? r * 2.0 : 0.0;
	vec3 up = speed > 1e-3 ? vPerp / max( speed, 1e-3 ) : vec3( 0.0, 1.0, 0.0 );
	// clouds: random rotation that slowly turns
	float rot = fract( iInfo.w ) * 6.283 + age * ( fract( iInfo.w ) - 0.5 );
	vec3 camRight = normalize( cross( vec3( 0.0, 1.0, 0.0 ), Vd ) + vec3( 1e-5, 0.0, 0.0 ) );
	vec3 camUp = cross( Vd, camRight );
	vec3 mRight = camRight * cos( rot ) + camUp * sin( rot );
	vec3 mUp = camUp * cos( rot ) - camRight * sin( rot );
	// torn sheets (dense spray) are drawn along their motion too, tilted a little at random and
	// stretched by their speed: fibrous, streaked silhouettes instead of round puffs
	bool isSheet = kind > 2.5;
	bool isClear = kind > 3.5; // clear sheet (bow sheet)
	vec3 side = normalize( cross( Vd, up ) );
	float tilt = ( fract( iInfo.w * 7.31 ) - 0.5 ) * 0.7;
	vec3 sUp = up * cos( tilt ) + side * sin( tilt );
	vec3 sSide = side * cos( tilt ) - up * sin( tilt );
	// mist streams with the air: drawn along its motion, stretched by its speed (wisps, not discs)
	bool alongMotion = isSheet || ( isMist && speed > 0.3 );
	vec3 axisY = water ? up : ( alongMotion ? sUp : mUp );
	vec3 axisX = water ? side : ( alongMotion ? sSide : mRight );
	float sheetLen = isSheet ? size * clamp( speed * 0.08, 0.0, 0.8 ) : 0.0;
	float mistLen = isMist ? size * clamp( ( speed - 0.3 ) * 0.35, 0.0, 1.4 ) : 0.0;
	float halfY = size + stretchLen * 0.5 + elong + sheetLen + mistLen;
	float halfX = isSheet ? size * 1.05 : size;
	vec2 corner = position.xy;
	vec3 world = p + axisX * ( corner.x * halfX ) + axisY * ( corner.y * halfY );

	// coverage that conserves the water's cross-section: the drop's projected area (and the time it
	// spends on each pixel of its streak) spread over the drawn footprint. For the gaussian
	// footprint exp( -k d^2 ) the peak is k r (r + elong) / ( halfX halfY ). Clouds: lost to the clamp.
	float kShape = isLig ? 4.5 : 3.5;
	float cover = water ? min( r * ( r + elong ) * kShape / ( halfX * halfY ), 1.0 ) : clamp( r / size, 0.0, 1.0 );

	// ---- lighting (per particle)
	vec3 L = spraySunDir;
	float cosT = dot( - Vd, L ); // 1 = looking toward the sun through the particle
	float cosA = dot( Vd, L );
	vec3 sun = spraySun;
	// clear water (drop, ligament): the bright sky it refracts and reflects, a strong forward lobe
	// (diffraction + refraction) when backlit, a small glint from any side
	vec3 cWater = spraySky * 0.9 + sun * ( sprayPhaseHG( cosT, 0.85 ) * 1.2 + 0.12 );
	// dense spray: multiply scattered, white from any side (a diffuse sphere: its far side is in its
	// own shadow), plus a forward lobe
	float lambert = ( sqrt( max( 1.0 - cosA * cosA, 0.0 ) ) + ( PI - acos( clamp( cosA, -1.0, 1.0 ) ) ) * cosA ) / PI;
	vec3 cSpray = sun * ( ( lambert * 0.65 + 0.35 ) / PI ) + spraySky * 1.15;
	vec3 fSpray = sun * ( sprayPhaseHG( cosT, 0.6 ) * 0.9 );
	// mist: a thin veil of fine drops, strongly forward scattering, tinted by the sky
	vec3 cMist = sun * ( 0.25 / PI ) + spraySky * 0.9;
	vec3 fMist = sun * sprayPhaseHG( cosT, 0.75 );
	// clear sheet: thin water, the sky it shows and a little sun off its surface; the sun shining
	// through it (forward lobe) is passed on: the thin torn parts glow when backlit
	vec3 cClear = spraySky * 0.95 + sun * 0.05;
	vec3 fClear = sun * ( sprayPhaseHG( cosT, 0.8 ) * 1.1 );
	vec3 col = water ? cWater : isMist ? cMist : isClear ? cClear : cSpray;
	vFwd = vec4( water ? vec3( 0.0 ) : isMist ? fMist : isClear ? fClear : fSpray, halfX / pixel );

	// opacity over the particle's life
	float t = age / max( life, 1e-3 );
	float fadeIn = smoothstep( 0.0, ${ byKind( 'kind', KIND.fadeIn ) }, t );
	float fadeOut = 1.0 - smoothstep( ${ byKind( 'kind', KIND.fadeOut ) }, 1.0, t );
	float baseA = ${ byKind( 'kind', KIND.alpha ) };
	// far: fade out; very near the eye: sheets and mist would fill the screen (and cost a lot of overdraw)
	float distFade = ( 1.0 - smoothstep( sprayMaxDistance * 0.55, sprayMaxDistance, dist ) ) * ( water ? 1.0 : smoothstep( 0.6, 3.0, dist ) );
	float a = baseA * fadeIn * fadeOut * cover * distFade * sprayIntensity;

	vUV = corner;
	vCol = vec4( col, a );
	vMisc = vec4( kind + clamp( t, 0.0, 1.0 ) * 0.45, iInfo.z, size, fract( iInfo.w ) );
	vWorldY = world.y;
	vec4 mvPosition = viewMatrix * vec4( world, 1.0 );
	gl_Position = projectionMatrix * mvPosition;
	// (spent: off the screen)
	if ( a < 1e-4 ) gl_Position = vec4( 0.0, 0.0, 2.0, 1.0 );
	#include <fog_vertex>
}
`;

const FRAGMENT = /* glsl */`
#include <common>
#include <fog_pars_fragment>
uniform sampler2D sprayPuff;
uniform sampler2D sprayDots;
varying vec2 vUV;
varying vec4 vCol;
varying vec4 vMisc;
varying vec4 vFwd;
varying float vWorldY;
void main() {
	vec2 uv = vUV;
	float kind = vMisc.x;
	bool isDrop = kind < 0.5;
	bool isMist = kind > 0.5 && kind < 1.5;
	bool isLig = kind > 1.5 && kind < 2.5;
	bool isSheet = kind > 2.5;
	bool isClear = kind > 3.5;
	float t = clamp( fract( kind ) / 0.45, 0.0, 1.0 ); // life fraction
	float r2 = dot( uv, uv );
	vec2 sd = vec2( vMisc.w, vMisc.w * 1.7 );
	float env = clamp( 1.0 - r2, 0.0, 1.0 );
	float shape = 0.0, shade = 1.0, glow = 1.0, farK = 0.0;
	if ( isDrop ) {
		// drop: gaussian streak
		shape = max( exp( r2 * - 3.5 ) - 0.03, 0.0 );
	} else if ( isLig ) {
		// ligament: a slightly sharper, beaded blob
		shape = max( exp( r2 * - 4.5 ) * ( sin( uv.y * 5.0 + vMisc.w * 40.0 ) * 0.2 + 0.9 ) - 0.03, 0.0 );
	} else if ( isSheet ) {
		// torn sheet: noise streaked along the motion (uv.y), eroded from its edges inward and more
		// and more as it ages, so it tears into strands and fragments instead of shrinking. Thick
		// parts are dense white water, the torn edges thin and translucent.
		float fib = texture2D( sprayPuff, vec2( uv.x * 0.5, uv.y * 0.26 ) + sd ).x;
		float fine = texture2D( sprayPuff, vec2( uv.x * 1.2, uv.y * 0.6 ) + sd * 2.3 ).x;
		float field = fib * 0.6 + fine * 0.4 + ( env - 0.55 ) * 0.75 - smoothstep( 0.8, 1.0, r2 );
		// a torn sheet only a few pixels across can't show its tears: drawn thinner and more torn,
		// a far splash-up is a ragged, see-through burst
		farK = isClear ? 0.0 : 1.0 - smoothstep( 3.0, 14.0, vFwd.w );
		float erode = mix( 0.26, 0.7, t ) + farK * 0.16;
		float dens = clamp( ( field - erode ) * 3.0, 0.0, 1.0 );
		// torn edges are thin, translucent water: soft and see-through, the core dense white
		float torn = smoothstep( erode - 0.04, erode + 0.2, field ) * ( dens * 0.45 + 0.55 );
		// ... which breaks up into a cluster of drops: many small dots in a ragged envelope that
		// thins out as it ages (sub-pixel drops average out through the mipmaps)
		float dots = texture2D( sprayDots, uv * vec2( 0.5, 0.32 ) + sd * 3.7 ).x;
		float swarm = dots * smoothstep( 0.25, 0.55, fib + env * 0.45 - t * 0.2 ) * ( 1.0 - t * 0.5 );
		shape = max( torn * ( 1.0 - smoothstep( 0.15, 0.6, t ) ), swarm );
		// self-shadowing inside thick sheets; the forward-scattered sun lights up the thin parts
		shade = isClear ? 1.0 : 1.0 - dens * 0.15;
		glow = isClear ? 1.0 - dens * 0.3 : 1.0 - dens * 0.6;
	} else {
		// mist: a soft veil of low-frequency noise that drifts and thins, never a disc
		float m1 = texture2D( sprayPuff, uv * 0.2 + sd ).x;
		float m2 = texture2D( sprayPuff, uv * 0.55 + sd * 3.1 ).x;
		shape = smoothstep( 0.28, 0.8, m1 * 0.7 + m2 * 0.3 + env * 0.3 - 0.12 ) * sqrt( env ) * ( 1.0 - t * 0.4 );
	}
	// soft against the water surface under the particle
	float soft = vMisc.z * 1.5 + 0.03;
	float fadeWater = clamp( ( vWorldY - vMisc.y ) / ( soft * 0.6 ) + 0.15, 0.0, 1.0 );
	float aOut = vCol.w * shape * fadeWater * ( 1.0 - farK * 0.4 );
	if ( aOut < 0.002 ) discard;
	gl_FragColor = vec4( ( vCol.rgb * shade + vFwd.xyz * glow ) * aOut, aOut );
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
#ifdef USE_FOG
	// (premultiplied: the fog's colour by the particle's coverage)
	#ifdef FOG_EXP2
		float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
	#else
		float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
	#endif
	gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor * gl_FragColor.a, fogFactor );
#endif
}
`;

const _bodyN = new THREE.Vector3();
const _q = new THREE.Vector3();

export class Spray {

	// waves: ocean/Waves.js (the water height under a falling particle); terrain: TerrainData
	constructor( { waves, terrain, tier = 'high' } ) {

		this.waves = waves;
		this.terrain = terrain;
		const T = TIER[ tier ] || TIER.high;
		this.cloud = T.cloud;
		const N = this.N = T.capacity;
		// pos: xyz, age (s) | vel: xyz, radius (m) | info: kind, life (s, 0 = dead), water height, seed
		this.pos = new Float32Array( N * 4 );
		this.vel = new Float32Array( N * 4 );
		this.info = new Float32Array( N * 4 );
		this.head = 0; // ring: a new particle takes the oldest slot
		this.nReq = 0; // (the GPU pool's pending emit requests, which emitters check: none queue here)
		this.live = 0;
		this.time = 0;

		// one moving body the particles collide with (setBody / setBodyShape)
		this.body = {
			on: false,
			mat: new THREE.Matrix4(), // body -> world
			inv: new THREE.Matrix4(), // world -> body
			vel: new THREE.Vector3(),
			hull: new THREE.Vector4( 0, 0, 1, 0 ), // at the sheer: z aft, z shoulder, z stem, half beam
			hullWL: new THREE.Vector4( 0, 1, 0, 0 ), // at y = 0: z shoulder, z stem, half beam
			sheer: new THREE.Vector4( 0, 0, - 1, 0 ), // y sheer aft, y sheer stem, y bottom
			boxMin: new THREE.Vector3(),
			boxMax: new THREE.Vector3(),
		};

		this._buildMesh();

	}

	// ------------------------------------------------------------------ the emitters' API

	// Emit `count` particles at `position` (Vector3) with base `velocity` (Vector3, m/s). size: radius (m),
	// kind: SPRAY.DROPLET | SPRAY.LIGAMENT | SPRAY.SPRAY | SPRAY.MIST | SPRAY.SHEET. Nothing is
	// allocated. opts: spread (velocity jitter, m/s), jitter (position jitter, m), life (s), to
	// (Vector3: emit along the segment position -> to), sizeJitter (0..1)
	emit( position, velocity, count, size = 0.04, kind = SPRAY.DROPLET, opts = {} ) {

		const { spread = 0.6, jitter = 0.05, life = kind === SPRAY.MIST ? 2.5 : 1.6, to = null, sizeJitter = 0.5 } = opts;
		// (fewer clouds of mist and spray on weaker tiers: the most overdraw)
		if ( kind === SPRAY.MIST || kind === SPRAY.SPRAY ) count *= this.cloud;
		count = Math.min( Math.round( count ), this.N >> 2 );
		if ( count <= 0 ) return;
		const b = to || position;
		const P = this.pos, V = this.vel, I = this.info, R = Math.random;
		for ( let n = 0; n < count; n ++ ) {

			const i = this.head, o = i * 4;
			this.head = ( i + 1 ) % this.N;
			const h0 = R(), h2 = R(), h3 = R();
			P[ o ] = position.x + ( b.x - position.x ) * h0 + ( R() - 0.5 ) * jitter * 2;
			P[ o + 1 ] = position.y + ( b.y - position.y ) * h0 + ( h2 - 0.5 ) * jitter * 2;
			P[ o + 2 ] = position.z + ( b.z - position.z ) * h0 + ( h3 - 0.5 ) * jitter * 2;
			P[ o + 3 ] = 0;
			V[ o ] = velocity.x + ( R() - 0.5 ) * spread * 2;
			V[ o + 1 ] = velocity.y + ( R() - 0.5 ) * spread * 2;
			V[ o + 2 ] = velocity.z + ( R() - 0.5 ) * spread * 2;
			V[ o + 3 ] = size * ( 1 + ( h2 - 0.5 ) * sizeJitter );
			I[ o ] = kind;
			I[ o + 1 ] = life * ( h3 * 0.5 + 0.75 );
			I[ o + 2 ] = P[ o + 1 ] - 1; // (the water: asked for once it falls toward it)
			I[ o + 3 ] = R();

		}

	}

	// Emit along a polyline: countPerSegment particles spread over each segment. velocity is a Vector3,
	// or an array with one per point (each segment uses the velocity of its start point).
	emitAlongPoints( points, velocity, countPerSegment, size = 0.04, kind = SPRAY.DROPLET, opts = {} ) {

		const o = Object.assign( this._segOpts || ( this._segOpts = {} ), opts );
		for ( let i = 0; i + 1 < points.length; i ++ ) {

			o.to = points[ i + 1 ];
			this.emit( points[ i ], Array.isArray( velocity ) ? velocity[ i ] : velocity, countPerSegment, size, kind, o );

		}

		o.to = null;

	}

	// Collision shape of the body, in its own frame (+Z forward, +Y up): the hull's plan outline
	// (full half beam aft of the shoulder, an elliptic bow to the stem), given at the waterline
	// (y = 0: wl*) and at the sheer, blended with height (flare, raked stem), from yBottom up to the
	// sheer (linear from ySheerAft to ySheerStem); and one box (e.g. the wheelhouse).
	setBodyShape( { zAft, zShoulder, zStem, halfBeam, wlShoulder, wlStem, wlHalfBeam, ySheerAft, ySheerStem, yBottom, boxMin, boxMax } ) {

		const b = this.body;
		b.hull.set( zAft, zShoulder, zStem, halfBeam );
		b.hullWL.set( wlShoulder, wlStem, wlHalfBeam, 0 );
		b.sheer.set( ySheerAft, ySheerStem, yBottom, 0 );
		b.boxMin.copy( boxMin );
		b.boxMax.copy( boxMax );

	}

	// The body's pose (matrixWorld) and velocity this frame; null disables the collisions.
	setBody( matrixWorld, velocity ) {

		const b = this.body;
		b.on = !! matrixWorld;
		if ( ! matrixWorld ) return;
		b.mat.copy( matrixWorld );
		b.inv.copy( matrixWorld ).invert();
		b.vel.copy( velocity );

	}

	// ------------------------------------------------------------------ simulation

	// Push particle o out of the body (hull or box) through the nearest face; the velocity into it
	// (relative to the body) is removed and the rest damped (the water runs off as a film); drops
	// that hit it die soon after.
	_collideBody( o, isMist ) {

		const B = this.body, P = this.pos, V = this.vel, I = this.info;
		const q = _q.set( P[ o ], P[ o + 1 ], P[ o + 2 ] ).applyMatrix4( B.inv );
		const H = B.hull, W = B.hullWL, S = B.sheer;
		const sat = ( x ) => x < 0 ? 0 : x > 1 ? 1 : x;
		// hull: the outline at this height (waterline -> sheer), half breadth at q.z (elliptic bow)
		const sheer = S.x + ( S.y - S.x ) * sat( ( q.z - H.x ) / Math.max( H.z - H.x, 0.01 ) );
		const fh = sat( q.y / Math.max( sheer, 0.1 ) );
		const zSh = W.x + ( H.y - W.x ) * fh, zSt = W.y + ( H.z - W.y ) * fh, HB = W.z + ( H.w - W.z ) * fh;
		const bowL = Math.max( zSt - zSh, 0.01 );
		const e = sat( ( q.z - zSh ) / bowL );
		const c = Math.sqrt( Math.max( 1 - e * e, 0.02 ) );
		const hb = HB * c;
		const inHull = q.z > H.x && q.z < zSt && Math.abs( q.x ) < hb && q.y < sheer && q.y > S.z;
		const b0 = B.boxMin, b1 = B.boxMax;
		const inBox = q.x > b0.x && q.x < b1.x && q.y > b0.y && q.y < b1.y && q.z > b0.z && q.z < b1.z;
		if ( ! inHull && ! inBox ) return;
		const n = _bodyN.set( 0, 1, 0 );
		if ( inHull ) {

			const sx = q.x > 0 ? 1 : - 1;
			if ( hb - Math.abs( q.x ) < sheer - q.y ) {

				// through the side; on the bow the side faces forward too (- d hb / dz)
				n.set( sx, 0, HB * e / ( c * bowL ) ).normalize();
				q.x = sx * ( hb + 0.02 );

			} else q.y = sheer + 0.02;

		} else {

			const dx = Math.min( q.x - b0.x, b1.x - q.x );
			const dz = Math.min( q.z - b0.z, b1.z - q.z );
			const dy = b1.y - q.y;
			if ( dy < dx && dy < dz ) q.y = b1.y + 0.02;
			else if ( dx < dz ) {

				const right = q.x > ( b0.x + b1.x ) * 0.5;
				n.set( right ? 1 : - 1, 0, 0 );
				q.x = right ? b1.x + 0.02 : b0.x - 0.02;

			} else {

				const front = q.z > ( b0.z + b1.z ) * 0.5;
				n.set( 0, 0, front ? 1 : - 1 );
				q.z = front ? b1.z + 0.02 : b0.z - 0.02;

			}

		}

		n.transformDirection( B.mat );
		const bv = B.vel;
		let vx = V[ o ] - bv.x, vy = V[ o + 1 ] - bv.y, vz = V[ o + 2 ] - bv.z;
		const vn = vx * n.x + vy * n.y + vz * n.z;
		if ( vn < 0 ) {

			vx -= n.x * vn;
			vy -= n.y * vn;
			vz -= n.z * vn;

		}

		V[ o ] = bv.x + vx * 0.5;
		V[ o + 1 ] = bv.y + vy * 0.5;
		V[ o + 2 ] = bv.z + vz * 0.5;
		q.applyMatrix4( B.mat );
		P[ o ] = q.x;
		P[ o + 1 ] = q.y;
		P[ o + 2 ] = q.z;
		// water that hits it wets it and runs off (gone); mist flows around it and settles
		I[ o + 1 ] = Math.min( I[ o + 1 ], isMist ? P[ o + 3 ] + 0.25 : P[ o + 3 ] );

	}

	// integrate, then hand the live ones to the sprites
	update( dt, camera = null, viewHeight = 720 ) {

		this.time += dt;
		const P = this.pos, V = this.vel, I = this.info, N = this.N;
		const wd = G.windDir.value, ws = G.windSpeed.value * 0.7;
		const ap = this.aPos.array, av = this.aVel.array, ai = this.aInfo.array;
		let live = 0;
		for ( let i = 0; i < N; i ++ ) {

			const o = i * 4;
			let life = I[ o + 1 ];
			if ( life <= 0 ) continue;
			if ( dt > 0 ) {

				const age = P[ o + 3 ] + dt;
				const k = I[ o ], seed = I[ o + 3 ] - Math.floor( I[ o + 3 ] );
				const isMist = k === SPRAY.MIST;
				// wind near the surface (~70% of the 10 m wind), gusty
				const gust = Math.sin( this.time * 0.7 + P[ o ] * 0.05 ) * 0.25 + 0.85;
				const wx = wd.x * ws * gust, wz = wd.y * ws * gust;
				// drag toward the wind: small drops follow the air, mist drifts with it (first keeping
				// the air pushed along by whatever threw it)
				const tau = KIND.tau[ k ] * ( isMist ? Math.exp( age * - 1.2 ) * 4 + 1 : 1 );
				const tb = KIND.turb[ k ];
				V[ o ] += ( ( wx - V[ o ] ) / tau + Math.sin( age * 2.1 + seed * 40 ) * tb ) * dt;
				V[ o + 1 ] += ( - V[ o + 1 ] / tau + Math.sin( age * 1.7 + seed * 17 ) * 0.5 * tb - KIND.grav[ k ] ) * dt;
				V[ o + 2 ] += ( ( wz - V[ o + 2 ] ) / tau + Math.cos( age * 1.9 + seed * 29 ) * tb ) * dt;
				P[ o ] += V[ o ] * dt;
				P[ o + 1 ] += V[ o + 1 ] * dt;
				P[ o + 2 ] += V[ o + 2 ] * dt;
				P[ o + 3 ] = age;
				if ( this.body.on ) {

					this._collideBody( o, isMist );
					life = I[ o + 1 ];

				}

				// the water surface and the ground below, once it falls toward them: drops die in the
				// water / on the sand; mist skims over it
				if ( V[ o + 1 ] < 0 && P[ o + 1 ] < I[ o + 2 ] + 1.5 ) {

					const x = P[ o ], z = P[ o + 2 ];
					const hw = this.waves.heightAt( x, z );
					const top = Math.max( hw, this.terrain ? this.terrain.heightAt( x, z ) : - 1e9 );
					I[ o + 2 ] = hw;
					if ( P[ o + 1 ] < top && age > 0.04 ) {

						if ( KIND.dies[ k ] ) life = 0;
						else {

							P[ o + 1 ] = top + 0.02;
							V[ o + 1 ] = Math.max( V[ o + 1 ], 0 );
							V[ o ] *= 0.95;
							V[ o + 2 ] *= 0.95;

						}

					}

				}

				if ( age > life ) life = 0;
				I[ o + 1 ] = life;
				// mist and spray clouds grow as they dilute
				V[ o + 3 ] *= 1 + dt * KIND.grow[ k ];
				if ( life <= 0 ) continue;

			}

			const d = live * 4;
			for ( let c = 0; c < 4; c ++ ) {

				ap[ d + c ] = P[ o + c ];
				av[ d + c ] = V[ o + c ];
				ai[ d + c ] = I[ o + c ];

			}

			live ++;

		}

		this.live = live;
		const g = this.mesh.geometry;
		g.instanceCount = live;
		this.mesh.visible = live > 0;
		if ( live > 0 ) for ( const a of [ this.aPos, this.aVel, this.aInfo ] ) {

			a.clearUpdateRanges();
			a.addUpdateRange( 0, live * 4 );
			a.needsUpdate = true;

		}

		this.uniforms.sprayViewHeight.value = viewHeight;

	}

	// ------------------------------------------------------------------ rendering

	_buildMesh() {

		// one camera-facing quad per live particle (instanced)
		const geo = new THREE.InstancedBufferGeometry();
		geo.setAttribute( 'position', new THREE.BufferAttribute( new Float32Array( [ - 1, - 1, 0, 1, - 1, 0, 1, 1, 0, - 1, 1, 0 ] ), 3 ) );
		geo.setIndex( [ 0, 1, 2, 0, 2, 3 ] );
		geo.boundingSphere = new THREE.Sphere( new THREE.Vector3(), 1e7 );
		const inst = ( name ) => {

			const a = new THREE.InstancedBufferAttribute( new Float32Array( this.N * 4 ), 4 );
			a.setUsage( THREE.DynamicDrawUsage );
			geo.setAttribute( name, a );
			return a;

		};

		this.aPos = inst( 'iPos' );
		this.aVel = inst( 'iVel' );
		this.aInfo = inst( 'iInfo' );
		geo.instanceCount = 0;

		this.uniforms = {
			...THREE.UniformsUtils.clone( THREE.UniformsLib.fog ),
			sprayPuff: { value: makePuffTexture() },
			sprayDots: { value: makeDotsTexture() },
			spraySunDir: G.sunDir,
			spraySun: G.sunColor,
			spraySky: G.skyIrradiance,
			sprayIntensity: { value: 1 },
			sprayMaxDistance: { value: 320 },
			sprayViewHeight: { value: 720 },
		};
		const mat = this.material = new THREE.ShaderMaterial( {
			name: 'Spray',
			uniforms: this.uniforms,
			vertexShader: VERTEX,
			fragmentShader: FRAGMENT,
			transparent: true,
			depthWrite: false,
			side: THREE.DoubleSide,
			fog: true,
			// premultiplied: colour one / one-minus-src-alpha (alpha likewise)
			blending: THREE.CustomBlending,
			blendSrc: THREE.OneFactor,
			blendDst: THREE.OneMinusSrcAlphaFactor,
			blendSrcAlpha: THREE.OneFactor,
			blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
			premultipliedAlpha: true,
		} );
		mat.forceSinglePass = true;

		const mesh = this.mesh = new THREE.Mesh( geo, mat );
		mesh.frustumCulled = false;
		mesh.matrixAutoUpdate = false;
		mesh.renderOrder = 20;
		mesh.visible = false;
		mesh.name = 'Spray';

	}

	dispose() {

		this.mesh.geometry.dispose();
		this.material.dispose();
		this.uniforms.sprayPuff.value.dispose();
		this.uniforms.sprayDots.value.dispose();

	}

}

// mipmapped RGBA8 texture from CPU data (repeat wrap)
function mipTexture( data, size ) {

	const t = new THREE.DataTexture( data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType );
	t.wrapS = t.wrapT = THREE.RepeatWrapping;
	t.minFilter = THREE.LinearMipmapLinearFilter;
	t.magFilter = THREE.LinearFilter;
	t.generateMipmaps = true;
	t.needsUpdate = true;
	return t;

}

// Small tileable value-noise texture for mist puffs (generated once on the CPU).
function makePuffTexture( size = 64 ) {

	const data = new Uint8Array( size * size * 4 );
	const rnd = ( i, j, o ) => {

		const s = Math.sin( ( i % o ) * 127.1 + ( j % o ) * 311.7 + o * 17.3 ) * 43758.5453;
		return s - Math.floor( s );

	};

	const vnoise = ( x, y, o ) => {

		const i = Math.floor( x ), j = Math.floor( y );
		const fx = x - i, fy = y - j;
		const ux = fx * fx * ( 3 - 2 * fx ), uy = fy * fy * ( 3 - 2 * fy );
		const a = rnd( i, j, o ), b = rnd( i + 1, j, o ), c = rnd( i, j + 1, o ), d = rnd( i + 1, j + 1, o );
		return ( a * ( 1 - ux ) + b * ux ) * ( 1 - uy ) + ( c * ( 1 - ux ) + d * ux ) * uy;

	};

	for ( let j = 0; j < size; j ++ ) for ( let i = 0; i < size; i ++ ) {

		let s = 0, a = 0.5, n = 0;
		for ( let o = 4; o <= 32; o *= 2 ) {

			s += vnoise( i / size * o, j / size * o, o ) * a;
			n += a;
			a *= 0.55;

		}

		const v = Math.max( 0, Math.min( 1, ( s / n - 0.2 ) * 1.6 ) );
		const k = ( j * size + i ) * 4;
		data[ k ] = data[ k + 1 ] = data[ k + 2 ] = Math.round( v * 255 );
		data[ k + 3 ] = 255;

	}

	return mipTexture( data, size );

}

// Tileable texture of scattered drops (r: coverage), for clusters of drops. Heavy-tailed radii: many
// tiny drops, a few large ones.
function makeDotsTexture( size = 128, count = 150 ) {

	const data = new Uint8Array( size * size * 4 );
	let seed = 12345;
	const rnd = () => ( ( seed = ( seed * 1664525 + 1013904223 ) >>> 0 ) / 4294967296 );
	const cov = new Float32Array( size * size );
	for ( let k = 0; k < count; k ++ ) {

		const cx = rnd() * size, cy = rnd() * size;
		const r = Math.min( 0.9 * Math.pow( 1 - rnd() * 0.97, - 0.55 ), 6 );
		const R = Math.ceil( r + 1.5 );
		for ( let dy = - R; dy <= R; dy ++ ) for ( let dx = - R; dx <= R; dx ++ ) {

			const x = ( ( Math.floor( cx ) + dx ) % size + size ) % size, y = ( ( Math.floor( cy ) + dy ) % size + size ) % size;
			const d = Math.hypot( Math.floor( cx ) + dx + 0.5 - cx, Math.floor( cy ) + dy + 0.5 - cy );
			const c = Math.max( 0, Math.min( 1, r + 0.5 - d ) );
			cov[ y * size + x ] = Math.max( cov[ y * size + x ], c );

		}

	}

	for ( let i = 0; i < size * size; i ++ ) {

		const v = Math.round( cov[ i ] * 255 );
		data[ i * 4 ] = data[ i * 4 + 1 ] = data[ i * 4 + 2 ] = v;
		data[ i * 4 + 3 ] = 255;

	}

	return mipTexture( data, size );

}
