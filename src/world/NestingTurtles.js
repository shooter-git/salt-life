import * as THREE from '../engine/index.js';
import { G } from '../core/Globals.js';
import { turtleGeometry } from './fish/CreatureGeometry.js';
import { PART } from './fish/FishGeometry.js';
import { femalesOf, planCrawl, timeline, femaleAt, hatchingsOf, hatchlingsAt, tracksOf, CRAWL } from '../game/Turtles.js';
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
// Drawn while you're within NEAR of the beach.
//   const t = new NestingTurtles( { scene, terrain } ); t.update( dt, camera, hour, day )

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

// ---- the turtles
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

	update( dt, camera, hour, day ) {

		const near = Math.hypot( camera.position.x - MIDDLE.x, camera.position.z - MIDDLE.y ) < NEAR;
		this.group.visible = near;
		if ( ! near ) return;
		const seen = new Set();
		// tonight's females (and last night's, if one's still ashore past midnight)
		for ( const d of [ day - 1, day ] ) for ( const f of femalesOf( d ) ) {

			const p = this.plan( f ), st = femaleAt( f, p, hour, day, p.line );
			if ( ! st ) continue;
			seen.add( f.id );
			this._female( f, p, st, dt );

		}

		for ( const [ id, F ] of this.females ) if ( ! seen.has( id ) ) {

			this.group.remove( F.mesh, F.bank );
			F.mesh.material.dispose();
			this.females.delete( id );

		}

		// the nests hatching
		const hseen = new Set();
		for ( const d of [ day - 1, day ] ) for ( const h of hatchingsOf( d ) ) {

			const p = this.plan( h.female ), pts = hatchlingsAt( h, p, hour, day, this.ground );
			if ( ! pts.some( Boolean ) ) continue;
			hseen.add( h.id );
			this._hatching( h, p, pts );

		}

		for ( const [ id, H ] of this.hatchings ) if ( ! hseen.has( id ) ) {

			this.group.remove( H.mesh );
			this.hatchings.delete( id );

		}

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
			F = this.females.set( f.id, { mesh, bank, t: 0, sand: 0, wet: 1 } ).get( f.id );

		}

		F.t += dt;
		const u = F.mesh.material.userData.u, o = pose( st, F.t ), g = this.ground;
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
		const bankK = { pit: st.u, chamber: 1, lay: 1, cover: 1 - st.u * 0.5 }[ st.phase ] ?? 0;
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

	}

	_hatching( h, p, pts ) {

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

			// how far she's made them yet tonight (all of them once she's back in the sea)
			const st = femaleAt( f, p, hour, day, p.line );
			const phase = st ? st.phase : 'gone';
			const before = [ 'emerge', 'up' ].includes( phase );
			let sUp = 1e4, sDown = 1e4;
			if ( st && before ) {

				sUp = phase === 'up' ? st.s : 0;
				sDown = - 1;

			} else if ( st && phase !== 'down' && phase !== 'enter' ) sDown = - 1;
			else if ( st && phase === 'down' ) sDown = st.s;
			T.up.material.userData.u.tDrawn.value = sUp;
			T.down.material.userData.u.tDrawn.value = sDown;
			if ( T.nest ) T.nest.visible = ! st || [ 'cover', 'down', 'enter' ].includes( phase );
			// (fresh all night, the backshore's fading over the next day; washed off below the waves' reach by morning)
			const fade = 1 - ss( 0.35, 1.4, age ), wash = ss( 0.05, 0.3, age );
			for ( const m of T.meshes ) {

				m.material.userData.u.tFade.value = fade * 0.9;
				m.material.userData.u.tWash.value = wash;

			}

		}

	}

}
