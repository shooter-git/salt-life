import * as THREE from '../engine/index.js';
import { G } from '../core/Globals.js';
import { turtleGeometry } from './fish/CreatureGeometry.js';
import { PART } from './fish/FishGeometry.js';
import { femalesOf, planCrawl, timeline, femaleAt, hatchingsOf, tracksOf, hatchTrackFade, soundBeats, Clutch, Minding, CRAWL, HATCHLING, LURE, TRACK_LAG } from '../game/Turtles.js';
import { secondsBetween } from '../game/IslandClock.js';
import { NORTH_BEACH } from './terrain/NorthBeach.js';

// (M15) The green turtles on the turtle beach (game/Turtles.js: who, when, where, what each is doing; the beach:
// terrain/NorthBeach.js). After photographs and films of green turtles nesting (Tortuguero, Raine Island,
// Ascension):
//   - A female: the swimming turtle's model (fish/CreatureGeometry.js) a metre of shell long, her flippers moved
//     in its shader: on land the front pair sweep together (an adult green turtle's gait: a heave forward with
//     each stroke, the plastron dragging), the rear pair push; digging her body pit she throws sand back with all
//     four; the egg chamber she scoops with her rear flippers in turn; laying, still, her head lifting for a
//     breath now and then; covering, sand thrown back hard. Wet and glossy out of the sea, sand caked on her shell
//     as she digs. Sinking into her pit as she digs it.
//   - The sand she throws: grains in sprays (SandSpray).
//   - Her tracks: a metre wide, the flipper marks either side in pairs (symmetrical: the green turtle's) and the
//     plastron's drag between them, the sand pushed up at the edges; up the beach and back down another way; the
//     nest's patch of thrown sand where she hid it. They stay through the next day, washed off below the waves'
//     reach first.
//   - Hatchlings: dark, five centimetres, scrambling in an alternating gait down to the sea.
//   - (M16) Each hatchling's own track, drawn as it goes (HatchlingTracks), and the turtles minding whoever's about
//     and any light (game/Turtles.js Minding, Clutch.lure; _watch says who and what they are).
// Drawn while you're within NEAR of the beach.
//   const t = new NestingTurtles( { scene, terrain } ); t.update( dt, camera, hour, day, app )
//
// (M16) Its sounds: App sets the sound's hooks on `sounds`, any of these,
// each called ( x, y, z, strength ), strength 0..1, world metres, as it happens; nothing fires unless you're near:
//   sounds.breath       her breath, at the top of each lift of her head (a gasp out and in): when she's resting on
//                       the crawl, and all the while she digs, lays (quieter, 0.6) and covers (hardest, 1)
//   sounds.sandThrown   a throw of her flippers: both front ones together digging (0.8) and hiding it (1); a rear
//                       one's scoop or pull (0.45 to 0.5). At where the sand comes from, behind her
//   sounds.crawlStroke  her front flippers biting into the sand, each stroke of the crawl (0.75 up, 0.6 down)
//   sounds.scramble     a nest's hatchlings, about every half second while any are on the sand: at the middle of
//                       them, strength how many of the clutch are out (0..1); once at 0 when the last has gone

const NEAR = 380;
const ADULT = 1.35; // the model's length 1 to hers (her shell ~1 m)
const YOUNG = 0.08; // (a hatchling's shell near 6 cm, 8 with its flippers out)
const MIDDLE = new THREE.Vector2( ( NORTH_BEACH.ends[ 0 ] + NORTH_BEACH.ends[ 1 ] ) / 2, - 838 );
const SAND = new THREE.Color().setRGB( 0.83, 0.75, 0.6, THREE.SRGBColorSpace );
const TAU = Math.PI * 2;
const ss = ( a, b, x ) => {

	const t = Math.min( 1, Math.max( 0, ( x - a ) / ( b - a ) ) );
	return t * t * ( 3 - 2 * t );

};
const f = ( x ) => Number( x ).toFixed( 4 );

// ---- the turtle's material: the swimming turtle's colours (FishSpecies' SKIN.turtle), her flippers posed
function turtleMaterial( young ) {

	const m = new THREE.MeshStandardMaterial( { roughness: 0.55, metalness: 0 } );
	m.name = young ? 'Hatchlings' : 'NestingTurtle';
	const u = m.userData.u = {
		tFront: { value: new THREE.Vector4() }, // the front flippers: yaw right, yaw left, lift right, lift left (rad)
		tRear: { value: new THREE.Vector4() },
		tHead: { value: 0 }, // her head's pitch (rad, + up)
		tSand: { value: 0 }, // sand on her 0..1
		tWet: { value: 1 }, // wet from the sea 0..1
	};
	if ( young ) m.defines = { YOUNG: '' };
	m.onBeforeCompile = ( sh ) => {

		Object.assign( sh.uniforms, u );
		sh.vertexShader = sh.vertexShader
			.replace( '#include <common>', /* glsl */`#include <common>
attribute vec4 aData;
uniform vec4 tFront;
uniform vec4 tRear;
uniform float tHead;
#ifdef YOUNG
attribute float iGait;
#endif
varying vec4 vTData;
varying vec3 vTLocal;
mat3 tRotY( float a ) { float c = cos( a ), s = sin( a ); return mat3( c, 0.0, - s, 0.0, 1.0, 0.0, s, 0.0, c ); }
mat3 tRotZ( float a ) { float c = cos( a ), s = sin( a ); return mat3( c, s, 0.0, - s, c, 0.0, 0.0, 0.0, 1.0 ); }
mat3 tRotX( float a ) { float c = cos( a ), s = sin( a ); return mat3( 1.0, 0.0, 0.0, 0.0, c, - s, 0.0, s, c ); }` )
			.replace( '#include <beginnormal_vertex>', /* glsl */`
	vec3 objectNormal = vec3( normal );
	mat3 tR = mat3( 1.0 );
	vec3 tJ = vec3( 0.0 );
	if ( abs( aData.y - ${ f( PART.FLIPPER ) } ) < 0.5 ) {
		// a flipper: swept about its shoulder (yaw, + forward) and lifted (+ up), more toward its tip
		float id = aData.w, t = aData.z, side = mod( id, 2.0 ) < 0.5 ? 1.0 : - 1.0;
		bool front = id < 1.5;
		tJ = front ? vec3( side * 0.2, - 0.03, 0.18 ) : vec3( side * 0.16, - 0.03, - 0.3 );
		vec4 P = front ? tFront : tRear;
		float yaw = side > 0.0 ? P.x : P.y, lift = side > 0.0 ? P.z : P.w;
#ifdef YOUNG
		// (a hatchling's gait: alternating, the diagonal pairs together)
		float ph = iGait * 6.2832 + ( side > 0.0 ? 0.0 : 3.1416 ) + ( front ? 0.0 : 3.1416 );
		yaw = sin( ph ) * ( front ? 0.7 : 0.4 );
		lift = max( 0.0, cos( ph ) ) * 0.35 - 0.05;
#endif
		tR = tRotZ( side * lift * ( 0.4 + 0.6 * t ) ) * tRotY( - side * yaw * ( 0.75 + 0.25 * t ) );
	} else if ( abs( aData.y - ${ f( PART.SKIN ) } ) < 0.5 && position.z > 0.24 ) {
		// her head and neck, lifted about the neck's root
		tJ = vec3( 0.0, 0.0, 0.24 );
		tR = tRotX( tHead * smoothstep( 0.24, 0.36, position.z ) );
	} else if ( abs( aData.y - ${ f( PART.EYE ) } ) < 0.5 ) {
		tJ = vec3( 0.0, 0.0, 0.24 );
		tR = tRotX( tHead );
	}
	objectNormal = tR * objectNormal;` )
			.replace( '#include <begin_vertex>', /* glsl */`
	vec3 transformed = tJ + tR * ( position - tJ );
	vTData = aData;
	vTLocal = position;` );
		sh.fragmentShader = sh.fragmentShader
			.replace( '#include <common>', /* glsl */`#include <common>
uniform float tSand;
uniform float tWet;
varying vec4 vTData;
varying vec3 vTLocal;
float tHash( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
float tNoise( vec2 p ) {
	vec2 i = floor( p ), q = fract( p ), w = q * q * ( 3.0 - 2.0 * q );
	return mix( mix( tHash( i ), tHash( i + vec2( 1.0, 0.0 ) ), w.x ), mix( tHash( i + vec2( 0.0, 1.0 ) ), tHash( i + vec2( 1.0, 1.0 ) ), w.x ), w.y );
}
vec3 tSrgb( float r, float g, float b ) { return pow( vec3( r, g, b ), vec3( 2.2 ) ); }` )
			.replace( '#include <color_fragment>', /* glsl */`
	float tP = vTData.y;
	vec3 tc;
	float tr = 0.6;
#ifdef YOUNG
	// a hatchling: near black above, white beneath and along its flippers' edges
	bool under = vTLocal.y < - 0.05;
	tc = under ? tSrgb( 0.85, 0.84, 0.8 ) : tSrgb( 0.09, 0.09, 0.085 );
	if ( abs( tP - ${ f( PART.FLIPPER ) } ) < 0.5 ) tc = mix( tc, tSrgb( 0.8, 0.8, 0.76 ), smoothstep( 0.7, 0.95, vTData.z ) );
	tr = 0.45;
#else
	if ( abs( tP - ${ f( PART.CARAPACE ) } ) < 0.5 ) {
		// the green turtle's shell: scutes (the vertebral row, the costals, the marginals) with dark seams, their
		// radiating olive, brown and amber streaks, old and scuffed (a nesting female's is worn and barnacled)
		float X = vTData.z, Y = vTData.w, ax = abs( X ), rr = length( vec2( X, Y ) );
		bool vert = ax < 0.3;
		vec4 ySeams = vert ? vec4( - 0.58, - 0.22, 0.14, 0.5 ) : vec4( - 0.42, - 0.02, 0.36, 2.0 );
		float yc = Y + ax * ax * 0.25;
		float dY = min( min( abs( yc - ySeams.x ), abs( yc - ySeams.y ) ), min( abs( yc - ySeams.z ), abs( yc - ySeams.w ) ) );
		float dX = abs( ax - 0.3 );
		bool marg = rr > 0.84;
		float dM = min( abs( rr - 0.84 ), abs( fract( atan( Y, X ) * ${ f( 12 / Math.PI ) } ) - 0.5 ) * 0.25 );
		float seam = min( marg ? dM : min( dY, dX ), abs( rr - 0.84 ) );
		float streak = sin( atan( yc - ( floor( yc * 2.8 ) + 0.5 ) / 2.8, X - sign( X ) * 0.55 ) * 11.0 + tNoise( vec2( X, Y ) * 7.0 ) * 6.0 ) * 0.5 + 0.5;
		vec3 shell = mix( tSrgb( 0.3, 0.26, 0.18 ), tSrgb( 0.56, 0.47, 0.3 ), streak * 0.5 + tNoise( vec2( X, Y ) * 9.0 ) * 0.35 );
		shell *= mix( 0.45, 1.0, smoothstep( 0.003, 0.014, seam ) );
		// (worn pale where she's scraped, barnacles here and there toward the back)
		shell = mix( shell, tSrgb( 0.55, 0.52, 0.45 ), smoothstep( 0.72, 0.85, tNoise( vec2( X, Y ) * 23.0 ) ) * 0.4 );
		shell = mix( shell, tSrgb( 0.75, 0.72, 0.64 ), smoothstep( 0.86, 0.92, tNoise( vec2( X, Y ) * 41.0 + 7.0 ) ) * smoothstep( 0.0, - 0.6, Y ) );
		tc = shell;
		tr = 0.62;
	} else if ( abs( tP - ${ f( PART.EYE ) } ) < 0.5 ) {
		tc = vec3( 0.02 );
		tr = 0.1;
	} else {
		// scaly grey-brown skin with pale scale margins; the plastron pale yellow
		vec2 qq = vec2( vTLocal.x + vTLocal.y, vTLocal.z ) * 55.0;
		vec2 q2 = qq + vec2( floor( qq.y ) * 0.5, 0.0 );
		vec2 ff = fract( q2 ) - 0.5;
		float scale = smoothstep( 0.32, 0.47, max( abs( ff.x ), abs( ff.y ) ) );
		vec3 skin = mix( tSrgb( 0.3, 0.27, 0.22 ) * ( tHash( floor( q2 ) ) * 0.35 + 0.8 ), tSrgb( 0.62, 0.6, 0.53 ), scale * 0.45 );
		bool plastron = vTData.w > 1.5 && abs( tP - ${ f( PART.SKIN ) } ) < 0.5;
		tc = plastron ? tSrgb( 0.78, 0.72, 0.52 ) * mix( 0.85, 1.05, tNoise( vTLocal.xz * 14.0 ) ) : skin;
		tr = 0.6;
	}
	// sand on her: caked on the flippers and the shell's lower edges, thrown over her back as she digs
	float sandK = tSand * smoothstep( 0.35, 0.7, tNoise( vTLocal.xz * 11.0 + 3.1 ) + ( 0.15 - vTLocal.y ) * 1.5 );
	tc = mix( tc, tSrgb( 0.8, 0.72, 0.57 ) * mix( 0.75, 1.0, tNoise( vTLocal.xz * 37.0 ) ), clamp( sandK, 0.0, 0.9 ) );
	tr = mix( tr, 0.9, clamp( sandK, 0.0, 1.0 ) );
#endif
	// wet from the sea: darker and glossy
	tc *= mix( 1.0, 0.72, tWet );
	tr = mix( tr, 0.34, tWet );
	diffuseColor.rgb = tc;` )
			.replace( '#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n\troughnessFactor = tr;' );

	};

	return m;

}

// ---- the sand she throws: grains flung in a burst at the end of each stroke and falling back, lit as the sand
// is (tiny instanced chips; a pool, the oldest reused)
class SandSpray {

	constructor( group ) {

		this.n = 700;
		this.pos = new Float32Array( this.n * 3 );
		this.vel = new Float32Array( this.n * 3 );
		this.floor = new Float32Array( this.n );
		this.life = new Float32Array( this.n );
		this.next = 0;
		const g = new THREE.TetrahedronGeometry( 0.011 );
		this.mesh = new THREE.InstancedMesh( g, new THREE.MeshStandardMaterial( { color: SAND, roughness: 1, metalness: 0 } ), this.n );
		this.mesh.name = 'TurtleSand';
		this.mesh.frustumCulled = false;
		this.mesh.count = 0;
		group.add( this.mesh );
		this._o = new THREE.Object3D();

	}

	// a burst of n grains from about ( x, y, z ), flung back along ( dx, dz ) (unit) and up, spread
	fling( n, x, y, z, dx, dz, ground ) {

		for ( let k = 0; k < n; k ++ ) {

			const i = this.next;
			this.next = ( this.next + 1 ) % this.n;
			const sp = 0.6 + Math.random() * 2.2, side = ( Math.random() - 0.5 ) * 1.4;
			this.pos[ i * 3 ] = x + ( Math.random() - 0.5 ) * 0.3;
			this.pos[ i * 3 + 1 ] = y + Math.random() * 0.08;
			this.pos[ i * 3 + 2 ] = z + ( Math.random() - 0.5 ) * 0.3;
			this.vel[ i * 3 ] = ( dx - dz * side ) * sp;
			this.vel[ i * 3 + 1 ] = 0.6 + Math.random() * 2.4;
			this.vel[ i * 3 + 2 ] = ( dz + dx * side ) * sp;
			this.floor[ i ] = ground( x + dx * sp * 0.6, z + dz * sp * 0.6 );
			this.life[ i ] = 1.6;

		}

	}

	update( dt ) {

		let n = 0;
		const o = this._o;
		for ( let i = 0; i < this.n; i ++ ) {

			if ( this.life[ i ] <= 0 ) continue;
			this.life[ i ] -= dt;
			this.vel[ i * 3 + 1 ] -= 9.8 * dt;
			for ( let a = 0; a < 3; a ++ ) this.pos[ i * 3 + a ] += this.vel[ i * 3 + a ] * dt;
			if ( this.pos[ i * 3 + 1 ] < this.floor[ i ] || this.life[ i ] <= 0 ) {

				this.life[ i ] = 0;
				continue;

			}

			o.position.fromArray( this.pos, i * 3 );
			o.rotation.set( i, i * 1.7, 0 );
			o.updateMatrix();
			this.mesh.setMatrixAt( n ++, o.matrix );

		}

		this.mesh.count = n;
		this.mesh.instanceMatrix.needsUpdate = true;

	}

}

// ---- her tracks: a ribbon along her way, its pattern in its shader (s: m along it, across: -1..1), drawn up to
// how far she's gone; the nest's patch a disc
const TRACK_HALF = 0.55;
const trackShader = ( m, nest ) => {

	const u = m.userData.u = { tDrawn: { value: 1e4 }, tFade: { value: 1 }, tWash: { value: 0 } };
	m.onBeforeCompile = ( sh ) => {

		Object.assign( sh.uniforms, u );
		sh.vertexShader = sh.vertexShader
			.replace( '#include <common>', '#include <common>\nattribute vec2 aTrack;\nvarying vec2 vTrack;\nvarying float vTrackY;' )
			.replace( '#include <begin_vertex>', '#include <begin_vertex>\n\tvTrack = aTrack;\n\tvTrackY = ( modelMatrix * vec4( transformed, 1.0 ) ).y;' );
		sh.fragmentShader = sh.fragmentShader
			.replace( '#include <common>', /* glsl */`#include <common>
uniform float tDrawn;
uniform float tFade;
uniform float tWash;
varying vec2 vTrack;
varying float vTrackY;
float trHash( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
float trNoise( vec2 p ) {
	vec2 i = floor( p ), q = fract( p ), w = q * q * ( 3.0 - 2.0 * q );
	return mix( mix( trHash( i ), trHash( i + vec2( 1.0, 0.0 ) ), w.x ), mix( trHash( i + vec2( 0.0, 1.0 ) ), trHash( i + vec2( 1.0, 1.0 ) ), w.x ), w.y );
}
// the sand's relief (m): ${ nest ? 'the nest\'s thrown sand: mounds and hollows' : 'the flipper marks in pairs, the drag between, the edges pushed up' }
float trHeight( vec2 t ) {
${ nest ? /* glsl */`
	float r = length( t );
	return ( trNoise( t * 2.2 ) - 0.5 ) * 0.12 + ( trNoise( t * 6.0 + 3.0 ) - 0.5 ) * 0.04 - 0.05 * smoothstep( 0.9, 0.2, r );` : /* glsl */`
	float a = abs( t.y );
	float q = ( t.x + a * ${ f( TRACK_HALF * 0.45 ) } ) / ${ f( CRAWL.reach ) } + ( trNoise( vec2( t.x * 0.7, 1.3 ) ) - 0.5 ) * 0.5;
	float m = fract( q ), stroke = floor( q ), deep = 0.6 + 0.8 * trHash( vec2( stroke, sign( t.y ) ) );
	float groove = smoothstep( 0.0, 0.18, m ) * smoothstep( 0.55, 0.25, m ) * smoothstep( 0.3, 0.45, a ) * smoothstep( 1.0, 0.85, a ) * deep;
	float drag = smoothstep( 0.42, 0.18, a );
	float ridge = smoothstep( 0.78, 0.94, a ) * smoothstep( 1.08, 0.96, a );
	return - 0.035 * groove - 0.018 * drag + 0.025 * ridge + ( trNoise( t * 9.0 ) - 0.5 ) * 0.008;` }
}` )
			.replace( '#include <color_fragment>', /* glsl */`
	${ nest ? '' : 'if ( vTrack.x > tDrawn ) discard;' }
	float trH = trHeight( vTrack );
	// (the sand turned up is damper and darker; the grooves in their own shadow)
	diffuseColor.rgb = SAND_C * mix( 0.78, 1.0, smoothstep( - 0.03, 0.015, trH ) );
	float trEdge = ${ nest ? 'smoothstep( 1.0, 0.75, length( vTrack ) )' : 'smoothstep( 1.0, 0.82, abs( vTrack.y ) )' };
	// (washed off below the waves' reach once the tide's had them; faded as the day's wind fills them in)
	diffuseColor.a = trEdge * tFade * mix( 1.0, smoothstep( 0.6, 1.2, vTrackY ), tWash );` )
			.replace( '#include <normal_fragment_maps>', /* glsl */`
	{
		// (the relief as a bump: its slope on the screen, about the surface)
		vec2 e = vec2( 0.03, 0.0 );
		vec2 at = vec2( vTrack.x, vTrack.y );
		float h0 = trHeight( at ), hx = trHeight( at + e.xy ) - h0, hy = trHeight( at + e.yx ) - h0;
		vec3 pW = - vViewPosition, dpx = dFdx( pW ), dpy = dFdy( pW );
		vec2 dU = vec2( dFdx( at.x ), dFdy( at.x ) ), dV = vec2( dFdx( at.y ), dFdy( at.y ) );
		vec2 dH = ( vec2( hx, hy ) / e.x ).x * dU + ( vec2( hx, hy ) / e.x ).y * dV;
		vec3 r1 = cross( dpy, normal ), r2 = cross( normal, dpx );
		float det = dot( dpx, r1 ) * faceDirection;
		vec3 grad = sign( det ) * ( dH.x * r1 + dH.y * r2 );
		normal = normalize( abs( det ) * normal - grad );
	}` )
			.replace( '#include <common>', `#include <common>\nconst vec3 SAND_C = vec3( ${ SAND.r.toFixed( 4 ) }, ${ SAND.g.toFixed( 4 ) }, ${ SAND.b.toFixed( 4 ) } );` );

	};

};

function trackMaterial( nest ) {

	const m = new THREE.MeshStandardMaterial( { roughness: 0.95, metalness: 0, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: - 2, polygonOffsetUnits: - 2 } );
	m.name = nest ? 'TurtleNest' : 'TurtleTrack';
	trackShader( m, nest );
	return m;

}

// a ribbon along a polyline, on the ground: aTrack = ( s m along it, across -1..1 )
function ribbon( pts, ground ) {

	const pos = [], tr = [], idx = [];
	let s = 0;
	const across = [ - 1, - 0.5, 0, 0.5, 1 ];
	// (resampled every 0.25 m)
	const res = [];
	for ( let i = 1; i < pts.length; i ++ ) {

		const [ x0, z0 ] = pts[ i - 1 ], [ x1, z1 ] = pts[ i ], l = Math.hypot( x1 - x0, z1 - z0 ), n = Math.max( 1, Math.ceil( l / 0.25 ) );
		for ( let k = 0; k < n; k ++ ) res.push( [ x0 + ( x1 - x0 ) * k / n, z0 + ( z1 - z0 ) * k / n, Math.atan2( x1 - x0, z1 - z0 ), s + l * k / n ] );
		s += l;

	}

	const last = pts[ pts.length - 1 ], prev = pts[ Math.max( 0, pts.length - 2 ) ];
	res.push( [ last[ 0 ], last[ 1 ], Math.atan2( last[ 0 ] - prev[ 0 ], last[ 1 ] - prev[ 1 ] ), s ] );
	for ( const [ x, z, h, sAt ] of res ) for ( const a of across ) {

		const px = x + Math.cos( h ) * a * TRACK_HALF, pz = z - Math.sin( h ) * a * TRACK_HALF;
		pos.push( px, ground( px, pz ) + 0.015, pz );
		tr.push( sAt, a );

	}

	for ( let i = 0; i < res.length - 1; i ++ ) for ( let k = 0; k < across.length - 1; k ++ ) {

		const a = i * across.length + k, b = a + 1, c = a + across.length, d = c + 1;
		idx.push( a, c, b, b, c, d );

	}

	const g = new THREE.BufferGeometry();
	g.setAttribute( 'position', new THREE.Float32BufferAttribute( pos, 3 ) );
	g.setAttribute( 'aTrack', new THREE.Float32BufferAttribute( tr, 2 ) );
	g.setIndex( idx );
	g.computeVertexNormals();
	return g;

}

// a disc on the ground about ( x, z ), r m: aTrack its offset in r's
function disc( x, z, r, ground ) {

	const pos = [ x, ground( x, z ) + 0.02, z ], tr = [ 0, 0 ], idx = [], rings = 4, seg = 20;
	for ( let k = 1; k <= rings; k ++ ) for ( let j = 0; j < seg; j ++ ) {

		const a = j / seg * TAU, q = k / rings, px = x + Math.cos( a ) * r * q, pz = z + Math.sin( a ) * r * q;
		pos.push( px, ground( px, pz ) + 0.02, pz );
		tr.push( Math.cos( a ) * q, Math.sin( a ) * q );

	}

	for ( let j = 0; j < seg; j ++ ) idx.push( 0, 1 + ( j + 1 ) % seg, 1 + j );
	for ( let k = 1; k < rings; k ++ ) for ( let j = 0; j < seg; j ++ ) {

		const a = 1 + ( k - 1 ) * seg + j, b = 1 + ( k - 1 ) * seg + ( j + 1 ) % seg, c = a + seg, d = b + seg;
		idx.push( a, d, b, a, c, d );

	}

	const g = new THREE.BufferGeometry();
	g.setAttribute( 'position', new THREE.Float32BufferAttribute( pos, 3 ) );
	g.setAttribute( 'aTrack', new THREE.Float32BufferAttribute( tr, 2 ) );
	g.setIndex( idx );
	g.computeVertexNormals();
	return g;

}

// ---- her body pit's bank: the sand she's thrown out of it, heaped behind her and at her sides (the beach itself
// can't be dug: she's let down into it only a little, and this banks up round her), in her frame (+z ahead)
function pitBank() {

	const pos = [], idx = [], rings = [ 0.44, 0.55, 0.68, 0.82, 0.96, 1.1, 1.26, 1.42 ], seg = 36, lift = [ - 0.05, 0.05, 0.11, 0.1, 0.06, 0.025, 0.004, - 0.03 ];
	for ( let k = 0; k < rings.length; k ++ ) for ( let j = 0; j < seg; j ++ ) {

		// (lumpy, each heap of a throw its own: longer and higher behind her than at her sides, low in front,
		// where the pit's front wall is)
		const a = j / seg * TAU, back = 0.5 - 0.5 * Math.cos( a );
		const lump = 1 + 0.25 * Math.sin( a * 5 + k * 0.7 ) * Math.sin( a * 3 + 1.3 ) + 0.15 * Math.sin( a * 11 + k );
		const r = rings[ k ] * ( 0.9 + 0.35 * back ) * ( 1 + 0.08 * Math.sin( a * 4 + 0.5 ) );
		pos.push( Math.sin( a ) * r * 0.9, lift[ k ] * ( 0.3 + 0.9 * back ) * lump, Math.cos( a ) * r );

	}

	for ( let k = 0; k < rings.length - 1; k ++ ) for ( let j = 0; j < seg; j ++ ) {

		const a = k * seg + j, b = k * seg + ( j + 1 ) % seg, c = a + seg, d = b + seg;
		idx.push( a, c, b, b, c, d );

	}

	const g = new THREE.BufferGeometry();
	g.setAttribute( 'position', new THREE.Float32BufferAttribute( pos, 3 ) );
	g.setIndex( idx );
	g.computeVertexNormals();
	return g;

}

function bankMaterial() {

	const m = new THREE.MeshStandardMaterial( { color: SAND, roughness: 0.95, metalness: 0 } );
	m.name = 'TurtlePit';
	m.onBeforeCompile = ( sh ) => {

		sh.vertexShader = sh.vertexShader.replace( '#include <common>', '#include <common>\nvarying vec3 vBankW;' ).replace( '#include <begin_vertex>', '#include <begin_vertex>\n\tvBankW = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;' );
		sh.fragmentShader = sh.fragmentShader.replace( '#include <common>', '#include <common>\nvarying vec3 vBankW;\nfloat bkHash( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }\nfloat bkNoise( vec2 p ) { vec2 i = floor( p ), q = fract( p ), w = q * q * ( 3.0 - 2.0 * q ); return mix( mix( bkHash( i ), bkHash( i + vec2( 1.0, 0.0 ) ), w.x ), mix( bkHash( i + vec2( 0.0, 1.0 ) ), bkHash( i + vec2( 1.0, 1.0 ) ), w.x ), w.y ); }' )
			// (thrown sand: the damp sand from under the surface darker in it, in clots)
			.replace( '#include <color_fragment>', '#include <color_fragment>\n\tdiffuseColor.rgb *= 0.86 + 0.14 * bkNoise( vBankW.xz * 9.0 ) - 0.1 * smoothstep( 0.6, 0.8, bkNoise( vBankW.xz * 23.0 + 4.0 ) );' );

	};

	return m;

}

// ---- what she's doing with her flippers and head, and how she lies, in each phase
const FRONT_STROKE = ( p, lift = 0.35 ) => p < 0.55 ? [ 0.8 - 1.75 * p / 0.55, - 0.12 ] : [ - 0.95 + 1.75 * ( p - 0.55 ) / 0.45, lift * Math.sin( Math.PI * ( p - 0.55 ) / 0.45 ) ];

function pose( st, t ) {

	// returns { front: [ yR, yL, lR, lL ], rear: [ … ], head, lurch, throwFront, throwRear }
	const o = { front: [ 0.25, 0.25, - 0.12, - 0.12 ], rear: [ 0, 0, - 0.05, - 0.05 ], head: 0, lurch: 0, throwFront: false, throwRear: false };
	const breath = ( period ) => Math.max( 0, Math.sin( t * TAU / period ) ) ** 6 * 0.35;
	switch ( st.phase ) {

		case 'up': case 'down': {

			if ( st.stroke >= 0 ) {

				const [ y, l ] = FRONT_STROKE( st.stroke );
				o.front = [ y, y, l, l ];
				const r = - 0.35 + 0.7 * Math.abs( st.stroke - 0.5 ) * 2;
				o.rear = [ r, r, - 0.05, - 0.05 ];
				o.lurch = Math.sin( Math.PI * Math.min( 1, st.stroke / 0.55 ) ) * ( st.stroke < 0.55 ? 1 : 0 );
				o.head = 0.12 * Math.sin( st.stroke * TAU );

			} else o.head = breath( 2.2 ) + 0.05;
			break;

		}

		case 'emerge': case 'enter': case 'abort': o.head = 0.2 + breath( 2 ); break;
		case 'choose': o.head = - 0.25 + 0.15 * Math.sin( t * 2.1 ); break;
		case 'pit': {

			// all four throwing sand back, together
			const p = ( t / 1.1 ) % 1, [ y, l ] = FRONT_STROKE( p, 0.55 );
			o.front = [ y, y, l, l ];
			o.rear = [ - y * 0.5, - y * 0.5, - 0.05, - 0.05 ];
			o.throwFront = p > 0.4 && p < 0.6;
			o.head = breath( 3.1 ) * 0.6;
			break;

		}

		case 'chamber': {

			// her rear flippers in turn, scooping the chamber out from under her
			const p = ( t / 2.4 ) % 1, R = Math.sin( p * TAU ), L = Math.sin( p * TAU + Math.PI );
			o.rear = [ 0.2 + 0.25 * R, 0.2 + 0.25 * L, - 0.55 * Math.max( 0, R ) + 0.15, - 0.55 * Math.max( 0, L ) + 0.15 ];
			o.front = [ 0.35, 0.35, 0.1, 0.1 ];
			o.throwRear = Math.abs( R ) > 0.95;
			o.head = breath( 4 ) * 0.5;
			break;

		}

		case 'lay': o.rear = [ 0.15, 0.15, - 0.4, - 0.4 ]; o.front = [ 0.35, 0.35, 0.1, 0.1 ]; o.head = breath( 5 ); break;
		case 'cover': {

			if ( st.u < 0.4 ) {

				// her rear flippers pulling sand in over the eggs, in turn
				const p = ( t / 1.6 ) % 1, R = Math.sin( p * TAU ), L = - R;
				o.rear = [ 0.4 * R, 0.4 * L, - 0.25, - 0.25 ];
				o.throwRear = Math.abs( R ) > 0.97;

			} else {

				// then the front flippers throwing sand back hard, to hide it
				const p = ( t / 0.95 ) % 1, [ y, l ] = FRONT_STROKE( p, 0.6 );
				o.front = [ y, y, l, l ];
				o.throwFront = p > 0.42 && p < 0.58;

			}

			o.head = breath( 3 ) * 0.6;
			break;

		}

	}

	// (down in her pit, her front flippers reach up to its edge, on the sand)
	if ( st.dig > 0 ) for ( const k of [ 2, 3 ] ) o.front[ k ] += st.dig * 0.22;
	return o;

}

// ---- (M16) the hatchlings' tracks: one mesh, one draw, whichever nests are hatching, each hatchling's a thin strip
// along its route (Clutch) with the marks in its shader. After photographs of them (USGS, Femmer): two rows of little
// scooped dimples, alternating, each with its lip, 8 to 10 cm across the pair, a faint drag down the middle in places;
// wandering, crossing. It only darkens and lightens what's under it (blended twice the shade times what's there, 0.5
// leaving it as it was), so it's lit as the sand is by the moon, the flashlight or the sun, for no light's sum here.
const QUADS = 994, NEST_SLOTS = 2, MOST_K = 14, TRACK_VERTS = 2320, TRACK_WIDE = 0.085, TRACK_LIFT = 0.03;
class HatchlingTracks {

	constructor( group, ground ) {

		this.ground = ground;
		this.pos = new Float32Array( TRACK_VERTS * 3 );
		this.t = new Float32Array( TRACK_VERTS * 4 );
		this.head = new Float32Array( TRACK_VERTS );
		const g = this.geometry = new THREE.BufferGeometry();
		g.setAttribute( 'position', new THREE.BufferAttribute( this.pos, 3 ).setUsage( THREE.DynamicDrawUsage ) );
		g.setAttribute( 'aT', new THREE.BufferAttribute( this.t, 4 ).setUsage( THREE.DynamicDrawUsage ) );
		g.setAttribute( 'aH', new THREE.BufferAttribute( this.head, 1 ).setUsage( THREE.DynamicDrawUsage ) );
		g.setIndex( new THREE.BufferAttribute( new Uint16Array( QUADS * 6 + 12 ), 1 ).setUsage( THREE.DynamicDrawUsage ) );
		this.u = { tNow: { value: 0 }, tFade: { value: 1 }, tWash: { value: 0 }, tLight: { value: new THREE.Vector2( 1, 0 ) } };
		const m = new THREE.ShaderMaterial( {
			name: 'HatchlingTracks', uniforms: this.u, transparent: true, depthWrite: false, toneMapped: false, fog: false,
			polygonOffset: true, polygonOffsetFactor: - 2, polygonOffsetUnits: - 2,
			blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.DstColorFactor, blendDst: THREE.SrcColorFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
			vertexShader: /* glsl */`
attribute vec4 aT;
attribute float aH;
varying vec4 vT;
varying float vH;
varying float vY;
varying float vD;
void main() {
	vT = aT;
	vH = aH;
	vY = position.y;
	vec4 mv = modelViewMatrix * vec4( position, 1.0 );
	vD = - mv.z;
	gl_Position = projectionMatrix * mv;
}`,
			fragmentShader: /* glsl */`
uniform float tNow;
uniform float tFade;
uniform float tWash;
uniform vec2 tLight;
varying vec4 vT;
varying float vH;
varying float vY;
varying float vD;
float thHash( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
void main() {
	if ( vT.z > tNow ) discard;
	float shade = 0.5;
	if ( vT.w < 0.0 ) {
		// the nest's mouth: a little crater, scuffed
		float r = length( vT.xy ) * ( 1.0 + 0.25 * sin( atan( vT.y, vT.x ) * 3.0 + 1.0 ) );
		float n = thHash( floor( vT.xy * 60.0 ) );
		shade += - 0.2 * smoothstep( 0.17, 0.05, r ) + 0.05 * smoothstep( 0.1, 0.18, r ) * smoothstep( 0.32, 0.18, r ) + ( n - 0.5 ) * 0.05 * smoothstep( 0.34, 0.2, r );
	} else {
		float s = vT.x, id = vT.w;
		float a = vT.y - 0.016 * sin( s * 4.3 + id * 1.7 ) - 0.008 * sin( s * 11.0 + id * 2.9 );
		float row = 0.03 + 0.008 * fract( id * 0.618 );
		float pitch = 0.044 + 0.012 * fract( id * 0.37 );
		float sd = a < 0.0 ? - 1.0 : 1.0;
		float q = s / pitch + ( sd > 0.0 ? 0.0 : 0.5 );
		float n = floor( q );
		float j1 = thHash( vec2( n, id + sd ) ), j2 = thHash( vec2( n + 7.0, id - sd ) );
		// a dimple in its cell, swept back at its ends, each its own
		vec2 p = vec2( ( q - n - 0.5 ) * pitch + ( j1 - 0.5 ) * 0.008, abs( a ) - row - ( j2 - 0.5 ) * 0.008 );
		p.x += p.y * p.y * 10.0;
		vec2 e = p / vec2( 0.0105, 0.0135 + 0.003 * j2 );
		float r2 = dot( e, e ), deep = 0.6 + 0.8 * j1;
		float ch = cos( vH ), sh = sin( vH );
		vec2 lt = vec2( dot( tLight, vec2( sh, ch ) ), dot( tLight, vec2( ch, - sh ) ) * sd );
		float wall = dot( e, lt ) / sqrt( r2 + 0.05 ) * smoothstep( 1.5, 0.3, r2 );
		float lip = smoothstep( 1.0, 1.6, r2 ) * smoothstep( 2.7, 1.6, r2 );
		float marks = - 0.13 * deep * smoothstep( 1.3, 0.2, r2 ) + 0.11 * wall * deep + 0.045 * lip - 0.03 * smoothstep( 0.007, 0.002, abs( a ) ) * smoothstep( 0.4, 0.8, thHash( vec2( floor( s * 3.0 ), id ) ) );
		// (too small to tell apart: the band of them, darker)
		float foot = max( fwidth( s ), fwidth( a ) );
		float band = - 0.055 * smoothstep( 0.055, 0.03, abs( a ) );
		// (they lie over one another by the nest, a fan's closeness there: all together about as dark as a few)
		shade += mix( marks, band, smoothstep( 0.01, 0.03, foot ) ) * clamp( s / 7.0, 0.14, 1.0 );
	}
	float keep = tFade * mix( 1.0, smoothstep( 0.6, 1.2, vY ), tWash ) * smoothstep( 0.02, 0.2, vY ) * ( 1.0 - smoothstep( 45.0, 80.0, vD ) );
	gl_FragColor = vec4( vec3( mix( 0.5, shade, keep ) ), 1.0 );
}`,
		} );
		this.mesh = new THREE.Mesh( g, m );
		this.mesh.name = 'HatchlingTracks';
		this.mesh.frustumCulled = false;
		this.mesh.renderOrder = 3;
		this.mesh.visible = false;
		group.add( this.mesh );
		this.nests = [];

	}

	// which clutches are drawn: the buffers laid out for them and written. epoch: the day their times count from
	lay( clutches, epoch ) {

		this.nests = clutches;
		this.epoch = epoch;
		const ix = this.geometry.index.array;
		let v = 0, i = 0;
		for ( const c of clutches ) {

			// (never past the buffers: a nest laid out finer on a night it had to itself)
			if ( v + c.count * ( c.k + 1 ) * 2 + 4 > TRACK_VERTS || i + ( c.count * c.k + 1 ) * 6 > ix.length ) break;
			c.base = v;
			c.offset = secondsBetween( 0, epoch, c.h.hour, c.h.day );
			for ( let n = 0; n < c.count; n ++ ) {

				for ( let q = 0; q < c.k; q ++ ) {

					const a = v + q * 2;
					ix[ i ++ ] = a;
					ix[ i ++ ] = a + 2;
					ix[ i ++ ] = a + 1;
					ix[ i ++ ] = a + 1;
					ix[ i ++ ] = a + 2;
					ix[ i ++ ] = a + 3;

				}

				v += ( c.k + 1 ) * 2;

			}

			// the nest's mouth
			c.mouth = v;
			for ( const a of [ v, v + 2, v + 1, v + 1, v + 2, v + 3 ] ) ix[ i ++ ] = a;
			v += 4;
			this.write( c, false );

		}

		this.geometry.setDrawRange( 0, i );
		this.geometry.index.needsUpdate = true;
		this._touch();
		this.mesh.visible = i > 0;

	}

	_touch() {

		const a = this.geometry.attributes;
		a.position.needsUpdate = a.aT.needsUpdate = a.aH.needsUpdate = true;

	}

	// one clutch's strips from its routes as they are now
	write( c, touch = true ) {

		const g = this.ground, P = this.pos, T = this.t, H = this.head, k = c.k;
		let v = c.base;
		for ( let n = 0; n < c.count; n ++ ) {

			const r = c.routes[ n ];
			let s = 0;
			for ( let j = 0; j <= k; j ++ ) {

				const a = Math.max( 0, j - 1 ), b = Math.min( k, j + 1 );
				const dx = r[ b * 3 ] - r[ a * 3 ], dz = r[ b * 3 + 1 ] - r[ a * 3 + 1 ];
				const h = dx || dz ? Math.atan2( dx, dz ) : ( j ? H[ v - 1 ] : 0 );
				if ( j ) s += Math.hypot( r[ j * 3 ] - r[ j * 3 - 3 ], r[ j * 3 + 1 ] - r[ j * 3 - 2 ] );
				const x = r[ j * 3 ], z = r[ j * 3 + 1 ], cx = Math.cos( h ) * TRACK_WIDE, cz = - Math.sin( h ) * TRACK_WIDE, t = r[ j * 3 + 2 ] + c.offset;
				for ( const side of [ - 1, 1 ] ) {

					const px = x + cx * side, pz = z + cz * side;
					P[ v * 3 ] = px;
					P[ v * 3 + 1 ] = g( px, pz ) + TRACK_LIFT;
					P[ v * 3 + 2 ] = pz;
					T[ v * 4 ] = s;
					T[ v * 4 + 1 ] = side * TRACK_WIDE;
					T[ v * 4 + 2 ] = t;
					T[ v * 4 + 3 ] = n;
					H[ v ] = h;
					v ++;

				}

			}

		}

		// the mouth
		const [ nx, nz ] = c.nest, R = 0.36;
		let m = c.mouth;
		for ( const [ ax, az ] of [ [ - 1, - 1 ], [ 1, - 1 ], [ - 1, 1 ], [ 1, 1 ] ] ) {

			const px = nx + ax * R, pz = nz + az * R;
			P[ m * 3 ] = px;
			P[ m * 3 + 1 ] = g( px, pz ) + TRACK_LIFT;
			P[ m * 3 + 2 ] = pz;
			T[ m * 4 ] = ax * R;
			T[ m * 4 + 1 ] = az * R;
			T[ m * 4 + 2 ] = c.offset + Math.min( ...c.start );
			T[ m * 4 + 3 ] = - 1;
			H[ m ] = 0;
			m ++;

		}

		if ( touch ) this._touch();

	}

	update( hour, day, fade, wash ) {

		const u = this.u;
		u.tNow.value = secondsBetween( 0, this.epoch, hour, day ) - TRACK_LAG;
		u.tFade.value = 1 - fade;
		u.tWash.value = wash;
		const L = G.sunDir.value, l = Math.hypot( L.x, L.z ) || 1;
		u.tLight.value.set( L.x / l, L.z / l );

	}

}

// ---- the turtles
const smooth01 = ( x ) => {

	const t = Math.min( 1, Math.max( 0, x ) );
	return t * t * ( 3 - 2 * t );

};
const FORWARD = new THREE.Vector3(), SPOT_FORWARD = [ 0, - Math.sin( 0.15 ), Math.cos( 0.15 ) ];

export class NestingTurtles {

	constructor( { scene, terrain } ) {

		this.terrain = terrain;
		this.ground = ( x, z ) => terrain.heightAt( x, z );
		this.group = new THREE.Group();
		this.group.name = 'Turtles';
		scene.add( this.group );
		this.adultGeo = turtleGeometry( { lod: 0 } );
		this.youngGeo = turtleGeometry( { lod: 1 } );
		this.females = new Map();
		this.hatchings = new Map();
		this.tracks = new Map();
		this.spray = new SandSpray( this.group );
		this.plans = new Map();
		this._o = new THREE.Object3D();
		// (M16)
		this.minding = new Minding();
		this.clutches = new Map();
		this.people = [];
		this.lights = [];
		this.sounds = { breath: null, sandThrown: null, crawlStroke: null, scramble: null };
		this._me = { x: 0, z: 0, speed: 0 };

	}

	_sound( name, x, y, z, strength ) {

		const fn = this.sounds[ name ];
		if ( fn ) fn( x, y, z, strength );

	}

	// (M16) who's about and what's lit on the beach, as this game knows it: you, the others (Together's, as they
	// reach you), the flashlight and whatever lamps are lit (LocalLights: a boat's and the camp's are among them)
	_watch( app, seconds ) {

		const people = this.people, lights = this.lights;
		people.length = 0;
		lights.length = 0;
		if ( ! app || ! app.player ) return;
		const by = ( x, z, r = 260 ) => Math.hypot( x - MIDDLE.x, z - MIDDLE.y ) < r;
		// you
		const p = app.player.position, me = this._me;
		const v = seconds > 0 ? Math.min( 8, Math.hypot( p.x - me.x, p.z - me.z ) / seconds ) : me.speed;
		me.speed += ( v - me.speed ) * Math.min( 1, seconds * 6 );
		me.x = p.x;
		me.z = p.z;
		if ( by( p.x, p.z ) ) people.push( me );
		// lamps
		const LL = app.localLights;
		const lit = smooth01( ( G.night.value - 0.15 ) / 0.6 );
		if ( LL ) {

			const fl = LL.flashlight;
			if ( fl.on && by( fl.position.x, fl.position.z ) ) lights.push( { x: fl.position.x, y: fl.position.y, z: fl.position.z, intensity: fl.intensity, range: fl.range, dir: [ fl.dir.x, fl.dir.y, fl.dir.z ], cosInner: fl.cosInner, cosOuter: fl.cosOuter } );
			if ( lit > 0.05 ) for ( const s of LL.sources ) {

				if ( s.enabled === false || ( s.scale ?? 1 ) <= 0 || ! by( s.position.x, s.position.z, 300 ) ) continue;
				const scale = ( s.scale ?? 1 ) * lit;
				if ( s.kind === 'boatFlood' ) lights.push( this._flood( s.position.x, s.position.y, s.position.z, scale ) );
				else if ( s.intensity * scale > 0.4 ) lights.push( { x: s.position.x, y: s.position.y, z: s.position.z, intensity: s.intensity * scale, range: s.range * 2, dir: s.dir ? [ s.dir.x, s.dir.y, s.dir.z ] : null, cosInner: s.cosInner, cosOuter: s.cosOuter } );

			}

		}

		// the others: where they are, and what they've lit (only what reaches you: their pose)
		const others = app.together && app.together.others;
		if ( others ) for ( const o of others.values() ) {

			const c = o.cur;
			if ( ! c || ! by( c.pos.x, c.pos.z ) ) continue;
			people.push( { x: c.pos.x, z: c.pos.z, speed: c.speed || 0 } );
			if ( c.torch ) lights.push( { x: c.pos.x, y: c.pos.y + 1.4, z: c.pos.z, intensity: 55, range: 30, dir: [ - Math.sin( c.yaw ), - 0.15, - Math.cos( c.yaw ) ], cosInner: 0.988, cosOuter: 0.819 } );
			if ( c.boat ) {

				if ( c.flood > 0 ) lights.push( this._flood( c.boat.pos.x, c.boat.pos.y + 2.5, c.boat.pos.z, c.flood ) );
				if ( c.spot ) {

					FORWARD.fromArray( SPOT_FORWARD ).applyQuaternion( c.boat.quat );
					lights.push( { x: c.boat.pos.x, y: c.boat.pos.y + 3, z: c.boat.pos.z, intensity: 150, range: 60, dir: FORWARD.toArray(), cosInner: Math.cos( 0.096 ), cosOuter: Math.cos( 0.208 ) } );

				}

			}

		}

	}

	// a boat's deck floodlights, close in: aimed at her cockpit, but a turtle sees the glare from the beach (a white
	// light in the open, plain from 30 m or so)
	_flood( x, y, z, scale ) {

		return { x, y, z, intensity: 50 * scale, range: 45, dir: null };

	}

	plan( f ) {

		let p = this.plans.get( f.id );
		if ( ! p ) {

			p = planCrawl( f, this.ground );
			p.line = timeline( f, p );
			this.plans.set( f.id, p );

		}

		return p;

	}

	update( dt, camera, hour, day, app ) {

		const near = Math.hypot( camera.position.x - MIDDLE.x, camera.position.z - MIDDLE.y ) < NEAR;
		this.group.visible = near;
		if ( ! near ) {

			this._last = null;
			return;

		}

		// (M16) how long since last time, in her time (it's her clock: a slow frame's still that much of her night)
		const seconds = this._last ? Math.min( 0.5, Math.max( 0, secondsBetween( this._last[ 0 ], this._last[ 1 ], hour, day ) ) ) : 0;
		this._last = [ hour, day ];
		this._cam = camera.position;
		this._watch( app, seconds );
		const seen = new Set();
		// tonight's females (and last night's, if one's still ashore past midnight)
		for ( const d of [ day - 1, day ] ) for ( const f of femalesOf( d ) ) {

			const p = this.plan( f );
			let st = femaleAt( f, p, hour, day, p.line, this.minding.turned.get( f.id ) );
			if ( ! st ) continue;
			// (M16) what she makes of who's about; if it's too much, she turns back from here
			if ( ! st.turned && this.minding.tick( f, st, secondsBetween( f.arrive, f.day, hour, day ), seconds, this.people, this.lights, this.ground ) ) st = femaleAt( f, p, hour, day, p.line, this.minding.turned.get( f.id ) );
			if ( ! st ) continue;
			seen.add( f.id );
			this._female( f, p, st, dt );

		}

		for ( const [ id, F ] of this.females ) if ( ! seen.has( id ) ) {

			this.group.remove( F.mesh, F.bank );
			F.mesh.material.dispose();
			this.females.delete( id );

		}

		this._nests( hour, day, seconds );
		this._tracks( hour, day );
		this.spray.update( dt );

	}

	_female( f, p, st, dt ) {

		let F = this.females.get( f.id );
		if ( ! F ) {

			const mesh = new THREE.Mesh( this.adultGeo, turtleMaterial( false ) );
			mesh.name = 'NestingTurtle';
			mesh.castShadow = true;
			mesh.receiveShadow = true;
			this.group.add( mesh );
			const bank = new THREE.Mesh( this.bankGeo || ( this.bankGeo = pitBank() ), this.bankMat || ( this.bankMat = bankMaterial() ) );
			bank.name = 'TurtlePit';
			bank.receiveShadow = true;
			bank.visible = false;
			this.group.add( bank );
			F = this.females.set( f.id, { mesh, bank, sand: 0, wet: 1, prev: null } ).get( f.id );

		}

		// (M16: her pose from her own clock, as the sounds are, not a count of frames)
		const u = F.mesh.material.userData.u, o = pose( st, st.t ), g = this.ground;
		u.tFront.value.fromArray( o.front );
		u.tRear.value.fromArray( o.rear );
		u.tHead.value = o.head;
		// (wet out of the sea, drying as she goes; sand on her as she digs)
		const ashore = st.phase !== 'emerge' && st.phase !== 'enter';
		F.wet += ( ( ashore ? 0.1 : 1 ) - F.wet ) * Math.min( 1, dt * 0.06 );
		// (the sand she throws lands on her back: by the time she's covered the nest she's caked in it)
		if ( [ 'pit', 'chamber', 'cover' ].includes( st.phase ) ) F.sand = Math.min( 1, F.sand + dt * 0.05 );
		else if ( st.phase === 'up' ) F.sand = Math.max( F.sand, 0.3 );
		u.tSand.value = F.sand;
		u.tWet.value = F.wet;
		// where she lies: on the sand, tilted with it, heaving with each stroke, down in her pit
		const s = ADULT, hd = st.heading, cx = Math.sin( hd ), cz = Math.cos( hd );
		const hF = g( st.x + cx * 0.45 * s, st.z + cz * 0.45 * s ), hB = g( st.x - cx * 0.4 * s, st.z - cz * 0.4 * s );
		const hR = g( st.x + cz * 0.35 * s, st.z - cx * 0.35 * s ), hL = g( st.x - cz * 0.35 * s, st.z + cx * 0.35 * s );
		const pit = st.dig * 0.1;
		const m = F.mesh;
		// (the bank she's thrown up about her pit: growing as she digs, left as she covers and goes)
		const bankK = st.turned ? ( st.phase === 'abort' ? st.dig : 0 ) : { pit: st.u, chamber: 1, lay: 1, cover: 1 - st.u * 0.5 }[ st.phase ] ?? 0;
		F.bank.visible = bankK > 0.02;
		if ( F.bank.visible ) {

			F.bank.position.set( st.x, ( hF + hB ) / 2, st.z );
			F.bank.rotation.set( 0, hd, 0 );
			F.bank.scale.set( s, Math.max( 0.05, bankK ), s );

		}

		m.scale.setScalar( s );
		m.position.set( st.x, ( hF + hB ) / 2 + 0.08 * s + o.lurch * 0.035 - pit - ( 1 - st.out ) * 0.4, st.z );
		m.rotation.set( - Math.atan2( hF - hB, 0.85 * s ) + ( st.dig > 0 ? - 0.06 : 0 ), hd, Math.atan2( hR - hL, 0.7 * s ), 'YXZ' );
		// sand thrown back over her and behind her
		// (a burst from each front flipper as its stroke ends; a few from the rear ones as they scoop)
		if ( o.throwFront && ! F.threw ) for ( const side of [ - 1, 1 ] ) {

			const x = st.x + cz * side * 0.6 * s - cx * 0.1, z = st.z - cx * side * 0.6 * s - cz * 0.1;
			this.spray.fling( 28, x, g( x, z ) + 0.04, z, - cx * 0.9 + cz * side * 0.4, - cz * 0.9 - cx * side * 0.4, g );

		}

		F.threw = o.throwFront;
		if ( o.throwRear && Math.random() < dt * 8 ) this.spray.fling( 6, st.x - cx * 0.45 * s, g( st.x, st.z ) + 0.03 - pit, st.z - cz * 0.45 * s, - cx, - cz, g );
		// (M16) the moments of it that sound (the file's head: `sounds`)
		for ( const [ name, strength ] of soundBeats( F.prev, st ) ) {

			const back = name === 'sandThrown' ? 0.5 * s : name === 'breath' ? - 0.5 * s : 0, x = st.x - cx * back, z = st.z - cz * back;
			this._sound( name, x, g( x, z ) + 0.2, z, strength );

		}

		F.prev = st;

	}

	// (M16) the nests hatching tonight, and those that did and whose tracks are still there. Each one's route is its
	// clutch's; the tracks drawn for the nearest two
	_nests( hour, day, seconds ) {

		if ( this._hatchDay !== day ) {

			this._hatchDay = day;
			this._hatch = [ ...hatchingsOf( day - 1 ), ...hatchingsOf( day ) ];

		}

		const live = this._live || ( this._live = [] ), hseen = this._hseen || ( this._hseen = new Set() );
		live.length = 0;
		hseen.clear();
		let fade = 0, wash = 0;
		for ( const h of this._hatch ) if ( hatchTrackFade( h, hour, day ) < 1 ) live.push( h );
		for ( const h of live ) {

			const t = secondsBetween( h.hour, h.day, hour, day );
			if ( t < 0 ) continue;
			let C = this.clutches.get( h.id );
			if ( ! C ) {

				// (each one's ribbon as long as the budget lets it: thinner on a night two nests hatch)
				const share = live.length > 1 ? QUADS / NEST_SLOTS : QUADS;
				C = new Clutch( h, this.plan( h.female ), this.ground, Math.max( 3, Math.min( MOST_K, Math.floor( share / h.count ) ) ) );
				this.clutches.set( h.id, C );
				this._layOut = true;

			}

			fade = Math.max( fade, hatchTrackFade( h, hour, day ) );
			wash = Math.max( wash, smooth01( ( t / secondsBetween( 0, 0, 0, 1 ) - 0.05 ) / 0.25 ) );
			if ( t <= HATCHLING.limit ) {

				const pts = C.at( t );
				const out = C.scramble( pts );
				C.heard = ( C.heard || 0 ) + seconds;
				if ( out && C.heard > 0.5 ) {

					C.heard = 0;
					C.wasOut = true;
					this._sound( 'scramble', out[ 0 ], this.ground( out[ 0 ], out[ 1 ] ) + 0.05, out[ 1 ], out[ 2 ] );

				} else if ( ! out && C.wasOut ) {

					C.wasOut = false;
					const [ nx, nz ] = C.nest;
					this._sound( 'scramble', nx, this.ground( nx, nz ) + 0.05, nz, 0 );

				}

				if ( out ) {

					hseen.add( h.id );
					this._hatching( h, pts );

				}

				// (a light on them, this game's knowledge of it: its tick's its own, a route's cost)
				C.lureT = ( C.lureT || 0 ) + seconds;
				if ( C.lureT >= LURE.tick ) {

					C.lureT = 0;
					if ( C.lure( t, this.lights ) ) C.dirty = true;

				}

			}

		}

		for ( const [ id, H ] of this.hatchings ) if ( ! hseen.has( id ) ) {

			this.group.remove( H.mesh );
			H.mesh.geometry.dispose();
			H.mesh.dispose();
			this.hatchings.delete( id );

		}

		for ( const [ id ] of this.clutches ) if ( ! live.some( ( h ) => h.id === id ) ) {

			this.clutches.delete( id );
			this._layOut = true;

		}

		// the tracks
		if ( ! this.clutches.size ) {

			if ( this.hatchTracks ) this.hatchTracks.mesh.visible = false;
			return;

		}

		const tr = this.hatchTracks || ( this.hatchTracks = new HatchlingTracks( this.group, this.ground ) );
		const cam = this._cam;
		const by = [ ...this.clutches.values() ].sort( ( a, b ) => Math.hypot( a.nest[ 0 ] - cam.x, a.nest[ 1 ] - cam.z ) - Math.hypot( b.nest[ 0 ] - cam.x, b.nest[ 1 ] - cam.z ) ).slice( 0, NEST_SLOTS );
		if ( this._layOut || by.some( ( c, i ) => tr.nests[ i ] !== c ) ) {

			this._layOut = false;
			tr.lay( by, day - 1 );

		} else for ( const c of by ) if ( c.dirty ) tr.write( c );

		for ( const c of this.clutches.values() ) c.dirty = false;
		tr.update( hour, day, fade, wash );

	}

	_hatching( h, pts ) {

		let H = this.hatchings.get( h.id );
		if ( ! H ) {

			const g = this.youngGeo.clone();
			g.setAttribute( 'iGait', new THREE.InstancedBufferAttribute( new Float32Array( h.count ), 1 ) );
			const mesh = new THREE.InstancedMesh( g, this.youngMaterial || ( this.youngMaterial = turtleMaterial( true ) ), h.count );
			mesh.name = 'Hatchlings';
			mesh.frustumCulled = false;
			this.group.add( mesh );
			H = this.hatchings.set( h.id, { mesh } ).get( h.id );

		}

		const mesh = H.mesh, gait = mesh.geometry.attributes.iGait, o = this._o;
		let n = 0;
		for ( const q of pts ) {

			if ( ! q ) continue;
			const [ x, z, a, ph ] = q;
			o.position.set( x, this.ground( x, z ) + 0.012, z );
			o.rotation.set( 0, a, 0 );
			o.scale.setScalar( YOUNG );
			o.updateMatrix();
			mesh.setMatrixAt( n, o.matrix );
			gait.array[ n ++ ] = ph;

		}

		mesh.count = n;
		mesh.instanceMatrix.needsUpdate = true;
		gait.needsUpdate = true;

	}

	_tracks( hour, day ) {

		const want = new Map();
		for ( const { female: f, age } of tracksOf( day, hour ) ) want.set( f.id, { f, age } );
		this.minding.forget( want );
		for ( const [ id, T ] of this.tracks ) if ( ! want.has( id ) ) {

			for ( const m of T.meshes ) {

				this.group.remove( m );
				m.geometry.dispose();
				m.material.dispose();

			}

			this.tracks.delete( id );

		}

		for ( const [ id, { f, age } ] of want ) {

			const p = this.plan( f );
			let T = this.tracks.get( id );
			if ( ! T ) {

				const up = new THREE.Mesh( ribbon( p.up, this.ground ), trackMaterial( false ) ), down = new THREE.Mesh( ribbon( p.down, this.ground ), trackMaterial( false ) );
				const meshes = [ up, down ];
				if ( p.nest ) meshes.push( new THREE.Mesh( disc( p.nest[ 0 ], p.nest[ 1 ], 1.5, this.ground ), trackMaterial( true ) ) );
				for ( const m of meshes ) {

					m.receiveShadow = true;
					m.renderOrder = 2;
					this.group.add( m );

				}

				T = this.tracks.set( id, { meshes, up, down, nest: meshes[ 2 ] } ).get( id );

			}

			// (M16) if she turned back: her way down's the one she took
			const tu = this.minding.turned.get( id );
			if ( tu && ! T.turned ) {

				T.turned = true;
				T.down.geometry.dispose();
				T.down.geometry = ribbon( tu.down, this.ground );

			}

			// how far she's made them yet tonight (all of them once she's back in the sea)
			const st = femaleAt( f, p, hour, day, p.line, tu );
			const phase = st ? st.phase : 'gone';
			const before = [ 'emerge', 'up' ].includes( phase );
			let sUp = 1e4, sDown = 1e4;
			if ( st && before ) {

				sUp = phase === 'up' ? st.s : 0;
				sDown = - 1;

			} else if ( st && phase !== 'down' && phase !== 'enter' ) sDown = - 1;
			else if ( st && phase === 'down' ) sDown = st.s;
			if ( tu && tu.s !== null ) sUp = tu.s;
			T.up.material.userData.u.tDrawn.value = sUp;
			T.down.material.userData.u.tDrawn.value = sDown;
			if ( T.nest ) T.nest.visible = tu ? tu.dig > 0.2 : ! st || [ 'cover', 'down', 'enter' ].includes( phase );
			// (fresh all night, the backshore's fading over the next day; washed off below the waves' reach by morning)
			const fade = 1 - ss( 0.35, 1.4, age ), wash = ss( 0.05, 0.3, age );
			for ( const m of T.meshes ) {

				m.material.userData.u.tFade.value = fade * 0.9;
				m.material.userData.u.tWash.value = wash;

			}

		}

	}

}
