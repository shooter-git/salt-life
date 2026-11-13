import * as THREE from '../engine/index.js';
import { G } from '../core/Globals.js';
import { wakeTan } from './WakeWaves.js';

export { wakeTan };

// The boat's wake: foam left behind the hull. Tidewater simulated a Kelvin wake on a 512² grid with
// compute shaders; here the boat sheds patches of lacy foam at its quarters (spreading outward, the
// arms of the wake) and astern (the propeller wash), which ride the waves, spread and fade.
// One instanced draw of soft quads.
//
// ((M16) Measured against the Regulator 23's running photographs: a band of fine streaks from the transom, white near her and
// feathering off. A patch is long along her track, so at speed they run together and last their whole life on the same count. The
// arms open at a real wake's angle: 19.47 degrees (Kelvin) up to a hull Froude number of about 0.5, then narrowing as 1 / Fr, about 5
// degrees for her at 36 kn (Rabaud & Moisy 2013, https://arxiv.org/abs/1304.2653).)
//
// ((M17) The arms' crests are waves on the sea's surface now (WakeWaves, through Waves: drawn and floated on alike), followed from
// her track by track(), the boats in company's too; the foam's as it was.)

const MAX = 160;
const LIFE = 9; // s
const LIFE_LOW = 6; // s (a phone's: the same patches, overlapping as much, less of them at a time on the screen)
const OVERLAP = 2.2; // a patch's length, in the distance between patches
const FAR = 60; // m in a frame: she was moved, not run
const _fwd = new THREE.Vector3();

export class Wake {

	// boat: BoatController (position, velocity, getYaw(), rpm, throttle); waves: Waves (heights)
	constructor( { scene, boat, waves, tier = 'low' } ) {

		this.boat = boat;
		this.waves = waves;
		this.max = tier === 'low' ? 80 : MAX;
		this.life = tier === 'low' ? LIFE_LOW : LIFE;
		const geo = new THREE.PlaneGeometry( 1, 1 ).rotateX( - Math.PI / 2 );
		const inst = new THREE.InstancedBufferGeometry().copy( geo );
		this.data = new Float32Array( this.max * 4 ); // x, z (about the mesh: at), age, (unused)
		// ((M15) where they are, in doubles, and drawn about a point by the boat, to a metre (the mesh put
		// there): in 32-bit floats tens of km out (4 mm a step at 40 km) the patches stuck as they spread)
		this.xz = new Float64Array( this.max * 2 );
		this.at = new THREE.Vector3();
		this.attr = new THREE.InstancedBufferAttribute( this.data, 4 ).setUsage( THREE.DynamicDrawUsage );
		inst.setAttribute( 'puff', this.attr );
		this.size = new Float32Array( this.max * 3 ); // start size, spread rate, how fast it fades
		this.sizeAttr = new THREE.InstancedBufferAttribute( this.size, 3 ).setUsage( THREE.DynamicDrawUsage );
		inst.setAttribute( 'puffSize', this.sizeAttr );
		this.lie = new Float32Array( this.max * 4 ); // the way it lies (x, z), its length, how strong
		this.lieAttr = new THREE.InstancedBufferAttribute( this.lie, 4 ).setUsage( THREE.DynamicDrawUsage );
		inst.setAttribute( 'puffLie', this.lieAttr );
		this.heights = new Float32Array( this.max * 2 ); // at either end: a long patch lies on the waves
		this.heightAttr = new THREE.InstancedBufferAttribute( this.heights, 2 ).setUsage( THREE.DynamicDrawUsage );
		inst.setAttribute( 'puffY', this.heightAttr );
		this.vel = new Float32Array( this.max * 3 ); // x, z, how fast it slows
		for ( let i = 0; i < this.max; i ++ ) this.data[ i * 4 + 2 ] = this.life; // all expired
		inst.instanceCount = this.max;

		this.material = new THREE.ShaderMaterial( {
			uniforms: THREE.UniformsUtils.merge( [ THREE.UniformsLib.fog, {
				wakeLife: { value: this.life },
				wakeAt: { value: new THREE.Vector2() },
			} ] ),
			vertexShader: /* glsl */`
#include <common>
#include <fog_pars_vertex>
attribute vec4 puff;
attribute vec3 puffSize;
attribute vec4 puffLie;
attribute vec2 puffY;
uniform float wakeLife;
uniform vec2 wakeAt;
varying vec2 vUv;
varying vec2 vLace;
varying float vFade;
void main() {
	float age = puff.z;
	float s = puffSize.x + puffSize.y * age, len = max( s, puffLie.z );
	vec2 across = vec2( puffLie.y, - puffLie.x );
	vec2 at = across * position.x * s + puffLie.xy * position.z * len;
	// (its lace where it lies on the water, across and along its track: the same for the patches overlapping there, so the gaps in it
	// stay open, however many there are)
	vec2 onSea = at + puff.xy + wakeAt;
	vLace = vec2( dot( onSea, across ), dot( onSea, puffLie.xy ) );
	vec3 p = vec3( at.x + puff.x, mix( puffY.x, puffY.y, position.z + 0.5 ) + 0.03, at.y + puff.y );
	vUv = uv;
	vFade = age < wakeLife ? pow( 1.0 - age / wakeLife, puffSize.z ) * min( age * 12.0, 1.0 ) * puffLie.w : 0.0;
	vec4 mvPosition = modelViewMatrix * vec4( p, 1.0 );
	gl_Position = projectionMatrix * mvPosition;
	// (flat between its ends, it mustn't go under the waves it's lying on: it's drawn where it is, but the depth test takes it as
	// nearer you, more from further off, where a crest in front would hide all of it)
	vec4 nearer = projectionMatrix * vec4( mvPosition.xy, mvPosition.z + 0.7 + 0.03 * length( mvPosition.xyz ), 1.0 );
	gl_Position.z = nearer.z / nearer.w * gl_Position.w;
	#include <fog_vertex>
}`,
			fragmentShader: /* glsl */`
#include <common>
#include <fog_pars_fragment>
uniform vec3 wakeLight;
varying vec2 vUv;
varying vec2 vLace;
varying float vFade;
float wakeNoise( vec2 p ) {
	vec2 i = floor( p ), f = fract( p );
	vec2 u = f * f * ( 3.0 - 2.0 * f );
	float a = fract( sin( dot( i, vec2( 127.1, 311.7 ) ) ) * 43758.5453 );
	float b = fract( sin( dot( i + vec2( 1.0, 0.0 ), vec2( 127.1, 311.7 ) ) ) * 43758.5453 );
	float c = fract( sin( dot( i + vec2( 0.0, 1.0 ), vec2( 127.1, 311.7 ) ) ) * 43758.5453 );
	float d = fract( sin( dot( i + vec2( 1.0, 1.0 ), vec2( 127.1, 311.7 ) ) ) * 43758.5453 );
	return mix( mix( a, b, u.x ), mix( c, d, u.x ), u.y );
}
void main() {
	if ( vFade <= 0.0 ) discard;
	vec2 q = abs( vUv * 2.0 - 1.0 );
	// (fine streaks along her track, by the metre: not lumps as big as the patch)
	float n = wakeNoise( vLace / vec2( 0.45, 3.0 ) ) * 0.5 + wakeNoise( vLace / vec2( 0.14, 0.9 ) + 3.7 ) * 0.3 + wakeNoise( vLace / vec2( 0.05, 0.25 ) + 7.1 ) * 0.2;
	// lacy patch: dense along its middle, a net of bubbles toward its sides, thinning as it ages; only its very ends taper, so the
	// patches overlapping run on with no waist where they meet
	float cover = ( 1.0 - smoothstep( 0.3, 1.0, q.x ) ) * ( 1.0 - smoothstep( 0.65, 1.0, q.y ) ) * vFade * 0.8;
	float a = smoothstep( 1.0 - cover, 1.0 - cover + 0.3, n ) * 0.7;
	if ( a < 0.01 ) discard;
	gl_FragColor = vec4( wakeLight, a );
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
}`,
			transparent: true,
			depthWrite: false,
			fog: true,
		} );
		this.material.uniforms.wakeLight = { value: new THREE.Color() };
		this.mesh = new THREE.Mesh( inst, this.material );
		this.mesh.name = 'Wake';
		this.mesh.frustumCulled = false;
		this.mesh.renderOrder = 2; // over the water
		scene.add( this.mesh );
		this._next = 0;
		this._t = 0;
		this._fwd = new THREE.Vector3();

	}

	// (M17) her wake's far arms as waves (WakeWaves: the sea's and the CPU's): the boat you're in and the boats in company under
	// way, followed each frame before the water's heights are worked out (App.frame), so what's drawn and what floats agree.
	// A kayak's are ripples, left out
	track( together, cam ) {

		const wakes = this.waves.wakes, b = this.boat, m = b.model, t = G.time.value;
		if ( m && m.id !== 'kayak' && m.dimensions && m.hydro && b.velocity ) wakes.follow( 'own', b.position.x, b.position.z, b.velocity.x, b.velocity.z, m.dimensions.waterlineLength, m.hydro.displacedVolume, t );
		const company = this._company || ( this._company = [] );
		company.length = 0;
		this._theirs = this._theirs || new Map();
		if ( together ) for ( const [ id, o ] of together.others ) {

			const c = o.cur, f = c && c.boat && ( c.drawn || c.boat );
			if ( ! f || ! f.pos ) continue;
			wakes.followDrawn( id, f.pos.x, f.pos.z, c.boatId, t );
			// ((M19) and her foam: her way as the waves' track has it, her heading as she's drawn, her model's figures)
			const l = wakes.tracks.get( id ) && wakes.tracks.get( id ).last, e = together.copies && together.copies.types && together.copies.types.get( c.boatId );
			const M = e && e.model;
			if ( ! l || ! M || ! M.wake || ! f.quat ) continue;
			_fwd.set( 0, 0, 1 ).applyQuaternion( f.quat );
			company.push( { id, x: f.pos.x, z: f.pos.z, yaw: Math.atan2( _fwd.x, _fwd.z ), vx: l.vx || 0, vz: l.vz || 0, W: M.wake, dims: M.dimensions } );

		}

		wakes.update( t, cam );

	}

	_spawn( x, z, vx, vz, size, spread, dx, dz, len, strong, fade, slows ) {

		const i = this._next;
		this._next = ( i + 1 ) % this.max;
		// (its front end where it's shed: it lies out behind that)
		this.xz[ i * 2 ] = x + dx * len * 0.5;
		this.xz[ i * 2 + 1 ] = z + dz * len * 0.5;
		this.data[ i * 4 + 2 ] = 0;
		this.size[ i * 3 ] = size;
		this.size[ i * 3 + 1 ] = spread;
		this.size[ i * 3 + 2 ] = fade;
		this.lie[ i * 4 ] = dx;
		this.lie[ i * 4 + 1 ] = dz;
		this.lie[ i * 4 + 2 ] = len;
		this.lie[ i * 4 + 3 ] = strong;
		this.vel[ i * 3 ] = vx;
		this.vel[ i * 3 + 1 ] = vz;
		this.vel[ i * 3 + 2 ] = slows;

	}

	// foam shed by a boat at ( px, pz ) heading yaw going ( vx, vz ), her engine's revs rpm, her wake's own figures W (Vessel.wake)
	// and her dimensions; st: her own count and where she was last ((M19) yours, and each boat in company's)
	_shed( st, px, pz, yaw, vx, vz, rpm, W, dims, dt ) {

		if ( ! W ) return;
		const speed = Math.hypot( vx, vz );
		const fx = Math.sin( yaw ), fz = Math.cos( yaw ); // the boat's forward (+Z in its frame)
		const rx = fz, rz = - fx; // its port side
		// shed foam with distance travelled: the faster, the more, as far as they last their life
		// ((M16) a boat can say her own: how big, and where her wash is if she's two engines; Vessel.wake)
		const life = this.life;
		const rate = speed > 0.8 ? Math.min( speed * ( W.shed ?? 0.9 ) + rpm * 3, this.max / 3 / life ) : 0;
		// (spread along the way she came since the last frame: a slow frame mustn't drop them in a heap)
		const last = st.last || ( st.last = { x: px, z: pz } );
		let moveX = px - last.x, moveZ = pz - last.z;
		if ( Math.hypot( moveX, moveZ ) > FAR ) moveX = moveZ = 0;
		const fromX = px - moveX, fromZ = pz - moveZ;
		last.x = px;
		last.z = pz;
		st.t += dt * rate;
		const n = Math.floor( st.t );
		if ( n > 0 ) {

			st.t -= n;
			// astern along her track, not her heading: in a turn she slides
			const backX = speed > 0.01 ? - vx / speed : - fx, backZ = speed > 0.01 ? - vz / speed : - fz;
			const crossX = - backZ, crossZ = backX;
			const tan = wakeTan( speed, ( dims && dims.waterlineLength ) || W.length || 6 );
			const len = Math.max( 1, speed / rate * OVERLAP ), strong = 0.45 + 0.55 * THREE.MathUtils.smoothstep( speed, 2, 10 );
			const armLen = len * Math.hypot( 1, tan ), norm = 1 / Math.hypot( 1, tan );
			for ( let j = 1; j <= n; j ++ ) {

				const k = j / n, x = fromX + moveX * k, z = fromZ + moveZ * k;
				const jitter = ( Math.random() - 0.5 ) * 0.6;
				// the arms of the wake from the quarters: a line opening off her track, each patch of it going out sideways
				for ( const side of [ - 1, 1 ] ) {

					const out = side * speed * tan;
					this._spawn( x + fx * W.quarterZ + rx * side * W.quarterX, z + fz * W.quarterZ + rz * side * W.quarterX, crossX * out, crossZ * out, ( W.armSize ?? 1.0 ) + jitter * 0.3, 0.3, ( backX + crossX * side * tan ) * norm, ( backZ + crossZ * side * tan ) * norm, armLen, strong, 3, 0 );

				}

				// the propeller wash astern: the band that's white longest
				const wx = jitter + ( this._next & 1 ? 1 : - 1 ) * ( W.washX ?? 0 );
				this._spawn( x + fx * W.washZ + rx * wx, z + fz * W.washZ + rz * wx, backX * 0.4, backZ * 0.4, W.washSize ?? 1.6, W.washSpread ?? 0.35, backX, backZ, len, strong, 1.3, 0.4 );

			}

		}

	}

	update( dt ) {

		const b = this.boat;
		const p = b.model.group.position;
		this._shed( this._own || ( this._own = { t: 0, last: null } ), p.x, p.z, b.getYaw(), b.velocity ? b.velocity.x : 0, b.velocity ? b.velocity.z : 0, b.rpm || 0, b.model.wake, b.model.dimensions, dt );
		// ((M19) and the boats in company under way, from where they're drawn on your screen (track): their foam's on your sea too,
		// on low as on the rest, where before only the boat you're in left any)
		if ( this._company ) for ( const c of this._company ) {

			let st = this._theirs.get( c.id );
			if ( ! st ) this._theirs.set( c.id, st = { t: 0, last: null } );
			st.seen = true;
			this._shed( st, c.x, c.z, c.yaw, c.vx, c.vz, 0, c.W, c.dims, dt );

		}

		if ( this._theirs ) for ( const [ id, st ] of this._theirs ) {

			if ( ! st.seen ) this._theirs.delete( id );
			st.seen = false;

		}

		const t = G.time.value, at = this.at.set( Math.round( p.x ), 0, Math.round( p.z ) ), xz = this.xz, life = this.life;
		this.mesh.position.copy( at );
		// (the lace's origin, near enough to stay in a float: a faint seam every 256 m)
		this.material.uniforms.wakeAt.value.set( ( ( at.x % 256 ) + 256 ) % 256, ( ( at.z % 256 ) + 256 ) % 256 );
		// (the waves under each read every other frame: two reads a patch, the cost of the one each had)
		const turn = this._turn = ( this._turn || 0 ) ^ 1;
		for ( let i = 0; i < this.max; i ++ ) {

			const age = this.data[ i * 4 + 2 ];
			if ( age >= life ) continue;
			this.data[ i * 4 + 2 ] = age + dt;
			const damp = Math.exp( - age * this.vel[ i * 3 + 2 ] );
			xz[ i * 2 ] += this.vel[ i * 3 ] * dt * damp;
			xz[ i * 2 + 1 ] += this.vel[ i * 3 + 1 ] * dt * damp;
			this.data[ i * 4 ] = xz[ i * 2 ] - at.x;
			this.data[ i * 4 + 1 ] = xz[ i * 2 + 1 ] - at.z;
			if ( age > 0 && ( i & 1 ) !== turn ) continue;
			const half = Math.max( this.size[ i * 3 ], this.lie[ i * 4 + 2 ] ) * 0.5, dx = this.lie[ i * 4 ] * half, dz = this.lie[ i * 4 + 1 ] * half;
			this.heights[ i * 2 ] = this.waves.heightAt( xz[ i * 2 ] - dx, xz[ i * 2 + 1 ] - dz, t );
			this.heights[ i * 2 + 1 ] = this.waves.heightAt( xz[ i * 2 ] + dx, xz[ i * 2 + 1 ] + dz, t );

		}

		this.attr.needsUpdate = true;
		this.sizeAttr.needsUpdate = true;
		this.lieAttr.needsUpdate = true;
		this.heightAttr.needsUpdate = true;
		// lit like the foam on the water: the sun by its height in the sky, the sky's fill
		const L = this.material.uniforms.wakeLight.value;
		L.copy( G.sunColor.value ).multiplyScalar( Math.max( G.sunDir.value.y, 0 ) ).add( G.skyIrradiance.value ).multiplyScalar( 0.72 );

	}

}
