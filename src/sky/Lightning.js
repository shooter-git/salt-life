import * as THREE from '../engine/index.js';
import { strikeIn, distantStrikesIn } from '../game/Weather.js';
import { mulberry32 } from '../util/Noise.js';

// (M9) The lightning in a thunderstorm.
//   - The strikes are the weather's (Weather.strikeIn): one or none in each real second, from the second
//     alone and how thundery it is, so everyone on one clock sees the same strike at the same moment, at
//     the same place (from the island's middle).
//   - Its flash: two to five return strokes tens of milliseconds apart, each a bright stab that fades in
//     a few tens of ms. It lights the cloud from inside about the strike, and the island with it (Sky's
//     flash and flashDir), dimmer the farther it is.
//   - A third of them come down to the sea or the land as a bolt: a branching channel from the cloud's
//     base, built when it strikes and drawn as glowing ribbons a few pixels across at any distance (one
//     draw, unfogged: seen through the rain's murk, dimmed by it). It flickers with the strokes.
//   - The thunder reaches the listener its distance at 343 m/s after (onThunder( strike, distance,
//     direction ): a crack near by, a rumble far off; SoundScape), (M12) and none from farther than HEARD.
//   - (M12) Thunderstorms on the horizon strike too (Weather.distantStrikesIn: the thundery showers about
//     the island, out to 60 km, `cells`), seen as a distant flash does (flashSeen): the storm's own cloud
//     lit from inside, low on the horizon, through the air between; next to no light on the island; and
//     past 20 km or so, no thunder: lightning on the horizon at night, silent.
//   const l = new Lightning( { scene, sky } )   l.update( thunder, camera, track, base, visibility, now, cells )
//   l.onThunder = ( strike, m, dir ) => …

const SOUND = 343; // m/s
const STROKES = [ 2, 5 ]; // return strokes a flash, at least and at most
const STROKE_GAP = [ 0.035, 0.13 ]; // s between them
const STROKE_FADE = 0.05; // s: each stroke's light fades with this time constant
const CHANNEL_GLOW = 0.15; // the channel's own glow between strokes, of a stroke's
// how bright a flash is at a distance (m: 1 at NEAR), and an intra-cloud flash of a bolt's
const NEAR = 2500;
const IN_CLOUD = 0.55;
// (M12) a flash farther off than GLOW_NEAR (m): its glow dims only as the air between takes it (EXTINCTION
// m in clear air, nearer in rain); farther than FILL_NEAR, its light on the island falls as the square
// of the distance (nearer, the cloud it lights is broad overhead), and through the air between; its glow
// as tight about the strike as its lit cloud is (LIT_R m across, about), and a storm's own cloud on the
// horizon (from FAR_FROM to FAR_FULL m off: the cloud overhead doesn't reach it), up to CB_TOP
const GLOW_NEAR = 8000;
const FILL_NEAR = 4000;
const EXTINCTION = 30000;
const LIT_R = 4000;
const SPREAD_MIN = 7;
const FAR_FROM = 6000, FAR_FULL = 14000;
const CB_TOP = 12000;
// (M12) a thunderstorm's base on the horizon (m): the cloud overhead's isn't its
const STORM_BASE = 1200;
// the bolt: the most segments it has (its main channel and branches), the farthest it's drawn (m: past
// this it's drawn nearer, as large in view, inside the camera's far plane)
const SEGMENTS = 200;
const MAX_DRAWN = 9000;
// m: thunder farther off than this isn't heard ((M12) it's refracted up, over the listener: seldom past 20
// km or so; it fades from 14 km, SoundScape.thunder)
export const HEARD = 22000;

const smooth = ( a, b, x ) => {

	const t = Math.min( 1, Math.max( 0, ( x - a ) / ( b - a ) ) );
	return t * t * ( 3 - 2 * t );

};

// (M12) a flash as it's seen from `dist` (m) off, at its strongest: glow, the lit cloud's brightness as the
// sky draws it about the strike (as NEAR / dist close by; past GLOW_NEAR only as the air between takes it,
// visibility: x a clear day's); fill, the light it throws on the island (as the square of the distance
// past FILL_NEAR, and the air between); spread, how tight the glow is about the strike (the lobe's
// sharpness: its lit cloud, LIT_R, as it's seen); far, how much it's a storm of its own on the horizon
// (its own cloud lit, not the cloud overhead: it lights the island from its side, Sky), and that cloud's
// top (tan of its height seen from here)
export function flashSeen( dist, power, ground, visibility = 1, out = {} ) {

	const d = Math.max( 600, dist ), k = power * ( ground ? 1 : IN_CLOUD ), ext = EXTINCTION * Math.max( 0.2, visibility );
	const at = ( from ) => k * Math.min( 2.5, NEAR / Math.min( d, from ) );
	out.glow = at( GLOW_NEAR ) * Math.exp( - Math.max( 0, d - GLOW_NEAR ) / ext );
	out.fill = at( FILL_NEAR ) * ( d > FILL_NEAR ? ( FILL_NEAR / d ) ** 2 * Math.exp( - ( d - FILL_NEAR ) / ext ) : 1 );
	const th = Math.atan( LIT_R / d );
	out.spread = Math.max( SPREAD_MIN, 2 / ( th * th ) );
	out.far = smooth( FAR_FROM, FAR_FULL, d );
	out.top = CB_TOP / d;
	return out;

}

const _v = new THREE.Vector3();

const VERTEX = /* glsl */`
attribute vec3 boltA;
attribute vec3 boltB;
attribute vec2 boltSide; // ( side -1 / 1, at A 0 / B 1 )
attribute float boltWidth; // its core's width (px)
uniform vec2 boltViewport;
varying float vAcross;
varying float vWidth;
void main() {
	vec4 a = projectionMatrix * viewMatrix * vec4( boltA, 1.0 );
	vec4 b = projectionMatrix * viewMatrix * vec4( boltB, 1.0 );
	vec4 p = boltSide.y > 0.5 ? b : a;
	vec2 sa = a.xy / max( a.w, 1e-4 ) * boltViewport, sb = b.xy / max( b.w, 1e-4 ) * boltViewport;
	vec2 d = sb - sa;
	vec2 n = normalize( vec2( - d.y, d.x ) + 1e-6 );
	// (the core and its halo: three times its width either side)
	float hw = boltWidth * 3.0;
	p.xy += n * boltSide.x * hw / boltViewport * p.w;
	gl_Position = p;
	vAcross = boltSide.x * hw;
	vWidth = boltWidth;
}
`;

const FRAGMENT = /* glsl */`
uniform vec3 boltColor;
uniform float boltBright;
varying float vAcross;
varying float vWidth;
void main() {
	float x = vAcross / vWidth;
	float core = exp( - x * x * 1.4 );
	float halo = exp( - x * x * 0.3 ) * 0.1;
	gl_FragColor = vec4( boltColor * boltBright * ( core + halo ), 1.0 );
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}
`;

export class Lightning {

	constructor( { scene, sky } ) {

		this.sky = sky;
		this.onThunder = null;
		this.flashes = []; // { strike, t0 (s, the page's clock), strokes: [ { t, p } ], dir, light }
		this._thunder = []; // { strike, at (s, the page's clock), dist, dir }
		this._second = 0; // the last second looked at (s since 1970)
		this.stats = { strikes: 0 };

		// the bolt: a quad a segment, its corners spread across it in the view (boltSide)
		const g = this.geometry = new THREE.BufferGeometry();
		const n = SEGMENTS * 4;
		const attr = ( k, size ) => g.setAttribute( k, new THREE.BufferAttribute( new Float32Array( n * size ), size ).setUsage( THREE.DynamicDrawUsage ) );
		attr( 'boltA', 3 );
		attr( 'boltB', 3 );
		attr( 'boltWidth', 1 );
		const side = new Float32Array( n * 2 ), index = new Uint16Array( SEGMENTS * 6 );
		for ( let i = 0; i < SEGMENTS; i ++ ) {

			side.set( [ - 1, 0, 1, 0, - 1, 1, 1, 1 ], i * 8 );
			index.set( [ i * 4, i * 4 + 1, i * 4 + 2, i * 4 + 2, i * 4 + 1, i * 4 + 3 ], i * 6 );

		}

		g.setAttribute( 'boltSide', new THREE.BufferAttribute( side, 2 ) );
		// (a position for three's bookkeeping: the bolt is placed by boltA and boltB)
		g.setAttribute( 'position', new THREE.BufferAttribute( new Float32Array( n * 3 ), 3 ) );
		g.setIndex( new THREE.BufferAttribute( index, 1 ) );
		g.setDrawRange( 0, 0 );
		this.uniforms = {
			boltViewport: { value: new THREE.Vector2( 960, 540 ) },
			boltColor: { value: new THREE.Color( 0.85, 0.88, 1.0 ) },
			boltBright: { value: 0 },
		};
		this.mesh = new THREE.Mesh( g, new THREE.ShaderMaterial( {
			name: 'Lightning', vertexShader: VERTEX, fragmentShader: FRAGMENT, uniforms: this.uniforms,
			blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide, // (its quads face either way)
		} ) );
		this.mesh.name = 'Lightning';
		this.mesh.frustumCulled = false;
		this.mesh.renderOrder = 1e6 + 2; // (after the sky and the sea)
		this.mesh.visible = false;
		scene.add( this.mesh );
		this._bolt = null; // the flash whose bolt is built

	}

	// thunder: how thundery it is (0..1, the weather's); track: (M12) the way the weather goes (the
	// storm comes from up it: WeatherDriver.track); base: the cloud's base (m); visibility: how far you
	// see (x a clear day's); (M12) cells: the showers about the island (WeatherDriver.cells), whose
	// thunderstorms strike on the horizon
	update( thunder, camera, track, base = 2000, visibility = 1, now = Date.now(), cells = null ) {

		const t = now / 1000, second = Math.floor( t );
		this._visibility = visibility;
		// the strikes of this second and the next, once each (after a long gap, from now on)
		if ( second - this._second > 5 ) this._second = second - 1;
		for ( let s = this._second + 1; s <= second + 1; s ++ ) {

			const strike = thunder > 0.01 ? strikeIn( s, thunder, track ) : null;
			if ( strike ) this._strike( strike, camera, base );
			if ( cells ) for ( const far of distantStrikesIn( s, cells, this._far || ( this._far = [] ) ) ) this._strike( far, camera, base );

		}

		this._second = second + 1;

		// the flashes: their strokes now, summed; the brightest lights the sky from its way ((M12) as tight
		// about it as it's seen from here, its own cloud on the horizon if it's far), and they all light the
		// island, the farther the less
		const sky = this.sky;
		let light = 0, fill = 0, best = null, bestLight = 0;
		for ( let i = this.flashes.length - 1; i >= 0; i -- ) {

			const f = this.flashes[ i ], dt = t - f.strike.at;
			if ( dt > 1.5 ) {

				this.flashes.splice( i, 1 );
				continue;

			}

			if ( dt < 0 ) continue;
			let k = 0;
			for ( const s of f.strokes ) if ( dt >= s.t ) k += s.p * Math.exp( - ( dt - s.t ) / STROKE_FADE );
			if ( dt < f.strokes[ f.strokes.length - 1 ].t + 0.25 ) k += CHANNEL_GLOW;
			f.now = k * f.light;
			light += f.now;
			fill += k * f.fill;
			if ( f.now > bestLight ) {

				bestLight = f.now;
				best = f;

			}

		}

		sky.flash = light;
		sky.flashFill = fill;
		if ( best ) {

			sky.flashDir.copy( best.dir );
			sky.flashShape.set( best.spread, best.top, best.far, 0 );

		}

		// the bolt of the brightest ground strike
		const bolt = best && best.strike.ground ? best : this.flashes.find( ( f ) => f.strike.ground && f.now > 0 );
		if ( bolt && bolt !== this._bolt ) this._build( bolt, camera, bolt.base );
		this._bolt = bolt || null;
		this.mesh.visible = !! bolt && bolt.now > 0.01;
		if ( bolt ) {

			// (through the rain's murk: dimmer the farther it is and the less you see)
			const murk = Math.exp( - bolt.dist / ( 7000 * Math.max( 0.2, visibility ) ) );
			this.uniforms.boltBright.value = 4 * Math.min( 3, bolt.now / bolt.light ) * ( 0.25 + 0.75 * murk ) * ( 0.4 + 0.6 * bolt.strike.power );

		}

		// the thunder, heard as it gets here
		for ( let i = this._thunder.length - 1; i >= 0; i -- ) {

			const h = this._thunder[ i ];
			if ( t < h.at ) continue;
			this._thunder.splice( i, 1 );
			if ( this.onThunder && t - h.at < 2 ) this.onThunder( h.strike, h.dist, h.dir );

		}

	}

	// the viewport's size (px) the bolt's widths are measured in
	setViewport( w, h ) {

		this.uniforms.boltViewport.value.set( w / 2, h / 2 );

	}

	_strike( strike, camera, base ) {

		this.stats.strikes ++;
		if ( strike.cell !== undefined ) base = STORM_BASE;
		const rng = mulberry32( strike.seed );
		const n = STROKES[ 0 ] + Math.floor( rng() * ( STROKES[ 1 ] - STROKES[ 0 ] + 1 ) );
		const strokes = [];
		let at = 0;
		for ( let i = 0; i < n; i ++ ) {

			strokes.push( { t: at, p: i === 0 ? 1 : 0.35 + 0.6 * rng() } );
			at += STROKE_GAP[ 0 ] + ( STROKE_GAP[ 1 ] - STROKE_GAP[ 0 ] ) * rng();

		}

		const c = camera.position, dist = Math.hypot( strike.x - c.x, strike.z - c.z );
		// (toward its middle: the channel's for a bolt, the cloud's lower part for one in the cloud)
		const dir = new THREE.Vector3( strike.x - c.x, ( strike.ground ? 0.45 : 0.8 ) * base - c.y, strike.z - c.z ).normalize();
		const seen = flashSeen( dist, strike.power, strike.ground, this._visibility ?? 1 );
		this.flashes.push( { strike, strokes, dir, light: seen.glow, fill: seen.fill, spread: seen.spread, far: seen.far, top: seen.top, dist, base, now: 0 } );
		const heard = Math.hypot( dist, base * 0.5 );
		if ( heard < HEARD ) this._thunder.push( { strike, at: strike.at + heard / SOUND, dist: heard, dir: dir.clone() } );

	}

	// the bolt: its main channel stepping down from the cloud's base to the ground in jagged runs, with
	// branches forking off it that peter out; drawn nearer (as large in view) when it's past MAX_DRAWN
	_build( flash, camera, base ) {

		const s = flash.strike, rng = mulberry32( ( s.seed ^ 0x9e3779b9 ) >>> 0 ), c = camera.position;
		const far = Math.hypot( s.x - c.x, s.z - c.z ), k = far > MAX_DRAWN ? MAX_DRAWN / far : 1;
		const at = ( x, y, z, out ) => out.set( c.x + ( x - c.x ) * k, c.y + ( y - c.y ) * k, c.z + ( z - c.z ) * k );
		const A = this.geometry.attributes.boltA.array, B = this.geometry.attributes.boltB.array, W = this.geometry.attributes.boltWidth.array;
		let count = 0;
		const segment = ( x0, y0, z0, x1, y1, z1, w ) => {

			if ( count >= SEGMENTS ) return;
			at( x0, y0, z0, _v );
			for ( let j = 0; j < 4; j ++ ) A.set( [ _v.x, _v.y, _v.z ], ( count * 4 + j ) * 3 );
			at( x1, y1, z1, _v );
			for ( let j = 0; j < 4; j ++ ) B.set( [ _v.x, _v.y, _v.z ], ( count * 4 + j ) * 3 );
			W.fill( w, count * 4, count * 4 + 4 );
			count ++;

		};

		// a channel from ( x, y, z ) down `drop` metres in `steps` jagged steps, `w` px across; forking
		const channel = ( x, y, z, drop, steps, w, depth ) => {

			const dy = drop / steps, lean = ( rng() - 0.5 ) * 0.5, ang = rng() * Math.PI * 2;
			const lx = Math.cos( ang ) * lean, lz = Math.sin( ang ) * lean;
			for ( let i = 0; i < steps && y > 0; i ++ ) {

				const h = Math.min( y, dy * ( 0.6 + 0.8 * rng() ) );
				const jag = h * 0.7;
				const nx = x + ( lx + ( rng() - 0.5 ) * 2 ) * jag, nz = z + ( lz + ( rng() - 0.5 ) * 2 ) * jag;
				segment( x, y, z, nx, y - h, nz, w );
				if ( depth < 2 && rng() < ( depth ? 0.12 : 0.22 ) ) channel( nx, y - h, nz, ( y - h ) * ( 0.25 + 0.4 * rng() ), 4 + Math.floor( rng() * 6 ), w * 0.55, depth + 1 );
				x = nx;
				z = nz;
				y -= h;

			}

		};

		channel( s.x, base, s.z, base, 26 + Math.floor( rng() * 14 ), 1.6, 0 );
		// (and it spreads out under the cloud's base a little: a few streaks across)
		for ( let i = 0; i < 3; i ++ ) {

			const a = rng() * Math.PI * 2, r = base * ( 0.1 + 0.25 * rng() );
			segment( s.x, base, s.z, s.x + Math.cos( a ) * r, base * ( 0.92 + 0.06 * rng() ), s.z + Math.sin( a ) * r, 0.8 );

		}

		const g = this.geometry;
		for ( const k of [ 'boltA', 'boltB', 'boltWidth' ] ) {

			g.attributes[ k ].needsUpdate = true;
			g.attributes[ k ].clearUpdateRanges();
			g.attributes[ k ].addUpdateRange( 0, count * 4 * g.attributes[ k ].itemSize );

		}

		g.setDrawRange( 0, count * 6 );

	}

	dispose() {

		this.geometry.dispose();
		this.mesh.material.dispose();
		this.mesh.removeFromParent();

	}

}
