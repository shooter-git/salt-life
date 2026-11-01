import { BufferGeometry, Color, DoubleSide, Float32BufferAttribute, InstancedBufferAttribute, InstancedMesh, Matrix4, MeshStandardMaterial, Vector3 } from '../../engine/index.js';
import { cylinder, lathe, mat4, mergePrepared, prepare, triangleCount } from './GeoKit.js';
import { UNDERWATER_GLSL, underwaterUniforms } from '../../materials/Underwater.js';
import { lobsterGeometry } from '../fish/CreatureGeometry.js';

// (M16) The lobster traps, as they're built in the Caribbean: rusty chicken wire on a frame of bleached poles, after the photographs from
// Barbados (docs/m16/traps.md), each racked and rusted its own way; and their buoys and warps. How many she carries changes as you set and haul them and as you buy more, and they're out on
// the sea and hanging off the davit too, so they're their own instanced meshes in the world's frame, not part of her merged
// fittings: three draw calls at most, one of each, and nothing's built until there's a trap to draw (TrapWork).
//   const m = new TrapMeshes( { ground, scene, shadows } )
//   m.begin(); m.trap( matrix, wear ); m.buoy( matrix, colours, end, hide ); m.lobster( matrix ); m.commit()

export const TRAP = { L: 0.95, W: 0.55, H: 0.37 };
// its wire, from the least rusted to the most
const RUST = [ new Color( 0x6e6252 ), new Color( 0x4c3220 ) ];
// the most of each drawn at once: yours (8), and the nearest of the others'
export const MAX = { trap: 14, buoy: 16, lobster: 3 };

// where they stow on her deck, fore-and-aft along the quarters and stacked as real boats stack them, in the order they fill:
// [ x, level, z, yaw, wear ]. The first two where the deck's old stack was, the rest keeping the room forward of it to fish
export const STOW = [
	[ 0.66, 0, - 3.25, 0.02, 0.13 ],
	[ 0.66, 1, - 3.23, - 0.03, 0.82 ],
	[ - 0.68, 0, - 3.25, 0.03, 0.47 ],
	[ - 0.68, 1, - 3.22, 0.04, 0.29 ],
	[ 0.64, 0, - 2.2, - 0.04, 0.68 ],
	[ 0.64, 1, - 2.18, 0.03, 0.05 ],
	[ 0.65, 2, - 3.27, 0.05, 0.91 ],
	[ - 0.67, 2, - 3.2, - 0.02, 0.37 ],
];
const LEVEL = TRAP.H + 0.035;
export const stowY = ( L, level ) => L.deckY + 0.03 + level * LEVEL;

// a trap's stow on her deck, as a matrix in her frame, into out
export function stowMatrix( L, i, out = new Matrix4() ) {

	const [ x, level, z, yaw ] = STOW[ i ];
	return out.copy( mat4( x, stowY( L, level ), z, 0, yaw, 0 ) );

}

export const stowWear = ( i ) => STOW[ i % STOW.length ][ 4 ];

// the boxes for the first n on her deck, as BoatModel's colliders (walkable: a stack's a step up, as it was)
export function trapColliders( L, n ) {

	const out = [];
	for ( let i = 0; i < n; i ++ ) {

		const [ x, level, z ] = STOW[ i ], y0 = stowY( L, level );
		out.push( { tag: 'trap', center: new Vector3( x, y0 + TRAP.H / 2, z ), half: new Vector3( TRAP.W / 2, TRAP.H / 2, TRAP.L / 2 ), walkable: true, solid: true } );

	}

	return out;

}

// ------------------------------------------------------------------ the trap (its frame: the bottom's middle at the origin)

// aux.w: 1 takes the instance's first colour, 2 its second, 3 is a warp (see the material)
function tinted( g, w ) {

	const aux = g.attributes.aux;
	for ( let i = 0; i < aux.count; i ++ ) aux.setW( i, w );
	return g;

}

const V = ( x, y, z ) => new Vector3( x, y, z );

// A sheet of the wire from corner to corner (uv in metres, from somewhere along the roll; aux.x how rusted it's got). With a bulge it's
// four triangles about its slack middle, without one it's two
function wireFace( [ a, b, c, d ], rust, bulge, from ) {

	const w = a.distanceTo( b ), h = a.distanceTo( d ), g = new BufferGeometry();
	const pos = [ a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, d.x, d.y, d.z ], uv = [ 0, 0, w, 0, w, h, 0, h ];
	if ( bulge ) {

		const m = a.clone().add( b ).add( c ).add( d ).multiplyScalar( 0.25 ).add( bulge );
		pos.push( m.x, m.y, m.z );
		uv.push( w / 2, h / 2 );

	}

	g.setAttribute( 'position', new Float32BufferAttribute( pos, 3 ) );
	g.setAttribute( 'uv', new Float32BufferAttribute( uv.map( ( v ) => v + from ), 2 ) );
	g.setIndex( bulge ? [ 0, 1, 4, 1, 2, 4, 2, 3, 4, 3, 0, 4 ] : [ 0, 1, 2, 0, 2, 3 ] );
	g.computeVertexNormals();
	return tinted( prepare( g, { rough: rust, pattern: 0 } ), 1 );

}

const POLE_DARK = new Color( 0x5e574b );

// A pole through the points, three sides a stretch (six triangles): uv round it and along it in metres, aux.y its length where its ends
// are wired to the rails (a rail's are its uprights', drawn on them), and the grey of it going darker here and there
function pole( pts, r, tone, age, tied ) {

	const n = 3, pos = [], normal = [], uv = [], col = [], index = [], c = new Color(), t = V( 0, 0, 0 ), s = V( 0, 0, 0 ), u = V( 0, 0, 0 ), o = V( 0, 0, 0 );
	let along = tied ? 0 : 1;
	pts.forEach( ( p, i ) => {

		t.subVectors( pts[ Math.min( i + 1, pts.length - 1 ) ], pts[ Math.max( i - 1, 0 ) ] ).normalize();
		s.set( t.y, - t.z, t.x * 0.7 + 0.3 ).cross( t ).normalize();
		u.crossVectors( t, s );
		c.setHex( tone ).lerp( POLE_DARK, age() );
		for ( let k = 0; k < n; k ++ ) {

			const f = k / n * Math.PI * 2;
			o.copy( s ).multiplyScalar( Math.cos( f ) ).addScaledVector( u, Math.sin( f ) );
			pos.push( p.x + o.x * r, p.y + o.y * r, p.z + o.z * r );
			normal.push( o.x, o.y, o.z );
			uv.push( f * r, along );
			col.push( c.r, c.g, c.b );
			if ( i ) index.push( ( i - 1 ) * n + k, i * n + ( k + 1 ) % n, i * n + k, ( i - 1 ) * n + k, ( i - 1 ) * n + ( k + 1 ) % n, i * n + ( k + 1 ) % n );

		}

		if ( i < pts.length - 1 ) along += p.distanceTo( pts[ i + 1 ] );

	} );
	const g = new BufferGeometry();
	g.setAttribute( 'position', new Float32BufferAttribute( pos, 3 ) );
	g.setAttribute( 'normal', new Float32BufferAttribute( normal, 3 ) );
	g.setAttribute( 'uv', new Float32BufferAttribute( uv, 2 ) );
	g.setAttribute( 'color', new Float32BufferAttribute( col, 3 ) );
	g.setIndex( index );
	return prepare( g, { rough: 0.9, metal: tied ? along : 99, pattern: 3 } );

}

// 158 triangles: 21 stretches of pole, the wire's sides, top and floor, the funnel in its side and a stone to hold it down. The frame's hand
// made and out of true here; TrapMeshes' material racks each one further its own way (iEnd)
export function trapGeometry() {

	const { L: TL, W, H } = TRAP, hw = W / 2 - 0.03, hl = TL / 2 - 0.045, r = 0.0115, parts = [];
	let state = 90217;
	const rnd = () => ( state = ( state * 16807 ) % 2147483647 ) / 2147483647;
	const off = ( a ) => ( rnd() - 0.5 ) * 2 * a;
	const age = () => rnd() * rnd();
	const tones = [ 0xa8a296, 0x9a9488, 0xb2ac9f, 0x8e887c ];
	const tone = () => tones[ Math.floor( rnd() * tones.length ) ];
	// the frame's corners: [ side ][ low, high ][ end ]
	const C = [ - 1, 1 ].map( ( sx ) => [ r + 0.014, H - r ].map( ( y ) => [ - 1, 1 ].map( ( sz ) => V( sx * hw + off( 0.012 ), y + off( 0.004 ), sz * hl + off( 0.012 ) ) ) ) );
	// the long rails, two stretches with a bend, on top of the end rails and running past them; the end rails past the long ones
	for ( const a of [ 0, 1 ] ) for ( const b of [ 0, 1 ] ) {

		const p = C[ a ][ b ][ 0 ], q = C[ a ][ b ][ 1 ], d = q.clone().sub( p ).normalize();
		const m = p.clone().lerp( q, 0.4 + rnd() * 0.25 ).add( V( off( 0.02 ), off( 0.014 ), 0 ) );
		parts.push( pole( [ p.clone().addScaledVector( d, - 0.01 - rnd() * 0.03 ), m, q.clone().addScaledVector( d, 0.01 + rnd() * 0.03 ) ], r * ( 0.9 + rnd() * 0.25 ), tone(), age, false ) );

	}

	for ( const b of [ 0, 1 ] ) for ( const e of [ 0, 1 ] ) {

		const p = C[ 0 ][ b ][ e ].clone().add( V( 0, - 0.016, 0 ) ), q = C[ 1 ][ b ][ e ].clone().add( V( 0, - 0.016, 0 ) ), d = q.clone().sub( p ).normalize();
		parts.push( pole( [ p.addScaledVector( d, - 0.012 - rnd() * 0.012 ), q.addScaledVector( d, 0.012 + rnd() * 0.012 ) ], r * ( 0.85 + rnd() * 0.2 ), tone(), age, false ) );

	}

	// the uprights, the corners' and two more a side at no even spacing, none quite plumb; and a bar across the top
	const upright = ( a, b ) => parts.push( pole( [ a, b ], r * ( 0.8 + rnd() * 0.25 ), tone(), age, true ) );
	for ( const a of [ 0, 1 ] ) {

		const [ lo, hi ] = C[ a ];
		upright( lo[ 0 ], hi[ 0 ] );
		upright( lo[ 1 ], hi[ 1 ] );
		for ( const t of [ 0.27 + rnd() * 0.12, 0.62 + rnd() * 0.12 ] ) upright( lo[ 0 ].clone().lerp( lo[ 1 ], t + off( 0.03 ) ), hi[ 0 ].clone().lerp( hi[ 1 ], t + off( 0.04 ) ) );

	}

	const t = 0.45 + rnd() * 0.1;
	parts.push( pole( [ C[ 0 ][ 1 ][ 0 ].clone().lerp( C[ 0 ][ 1 ][ 1 ], t ).add( V( 0, - 0.018, 0 ) ), C[ 1 ][ 1 ][ 0 ].clone().lerp( C[ 1 ][ 1 ][ 1 ], t + off( 0.05 ) ).add( V( 0, - 0.018, 0 ) ) ], r * 0.8, tone(), age, true ) );
	// the wire, stapled over the frame: thin and see-through round the sides, the floor rusted dark and sagging as it does in the photographs
	const wire = ( q, rust, bulge = null ) => parts.push( wireFace( q, rust, bulge, rnd() * 3 ) );
	const lo = ( a, e ) => C[ a ][ 0 ][ e ], hi = ( a, e ) => C[ a ][ 1 ][ e ];
	wire( [ lo( 0, 0 ), lo( 0, 1 ), hi( 0, 1 ), hi( 0, 0 ) ], 0.3, V( - 0.018, - 0.012, 0.01 ) );
	wire( [ lo( 1, 1 ), lo( 1, 0 ), hi( 1, 0 ), hi( 1, 1 ) ], 0.22, V( - 0.012, 0.006, - 0.02 ) );
	wire( [ lo( 0, 1 ), lo( 1, 1 ), hi( 1, 1 ), hi( 0, 1 ) ], 0.35 );
	wire( [ lo( 1, 0 ), lo( 0, 0 ), hi( 0, 0 ), hi( 1, 0 ) ], 0.28 );
	wire( [ hi( 0, 1 ), hi( 1, 1 ), hi( 1, 0 ), hi( 0, 0 ) ], 0.32, V( 0.01, - 0.026, - 0.02 ) );
	wire( [ lo( 0, 0 ), lo( 1, 0 ), lo( 1, 1 ), lo( 0, 1 ) ], 0.92, V( 0.015, - 0.018, 0.03 ) );
	// the funnel, in through the one side
	{

		const x = C[ 1 ][ 0 ][ 0 ].x, zc = - 0.17, yc = H * 0.46, f = 0.13, g = 0.1;
		const o = [ V( x, yc - g, zc - f ), V( x, yc - g, zc + f ), V( x, yc + g, zc + f + 0.01 ), V( x, yc + g, zc - f ) ];
		const i = [ V( 0.04, yc - 0.04, zc - 0.05 ), V( 0.03, yc - 0.05, zc + 0.05 ), V( 0.05, yc + 0.03, zc + 0.05 ), V( 0.04, yc + 0.04, zc - 0.05 ) ];
		for ( let k = 0; k < 4; k ++ ) {

			const k1 = ( k + 1 ) % 4;
			wire( [ o[ k ], o[ k1 ], i[ k1 ], i[ k ] ], 0.5 );

		}

	}

	// the stone that sinks it, wired to the floor
	const stone = new BufferGeometry(), a = V( - 0.09, 0.022, 0.21 ), b = V( 0.06, 0.018, 0.27 ), c = V( 0.01, 0.024, 0.13 ), d = V( - 0.005, 0.066, 0.21 );
	stone.setAttribute( 'position', new Float32BufferAttribute( [ a, b, d, b, c, d, c, a, d, a, c, b ].flatMap( ( v ) => [ v.x, v.y, v.z ] ), 3 ) );
	stone.computeVertexNormals();
	parts.push( prepare( stone, { color: 0x5f584c, rough: 0.95, pattern: 2 } ) );
	return mergePrepared( parts );

}

// ------------------------------------------------------------------ the buoy (its frame: at the waterline it floats to)

// A foam bullet in the owner's colours as on her deck (DeckGear.buoyGeometry), lighter, and its spindle stick; floating a third out of
// the water, spindle up. And its warp: a thin line from the origin to the instance's `end`, stretched in the vertex shader
export function buoyGeometry() {

	const parts = [], seg = 8, y0 = - 0.2;
	const band = ( profile, w, color ) => {

		const g = lathe( profile.map( ( [ r, y ] ) => [ r, y + y0 ] ), seg );
		parts.push( tinted( prepare( g, { color, rough: 0.55, pattern: 2 } ), w ) );

	};

	band( [ [ 0, 0 ], [ 0.055, 0.025 ], [ 0.075, 0.1 ], [ 0.075, 0.17 ] ], 1, 0xffffff );
	band( [ [ 0.075, 0.17 ], [ 0.075, 0.27 ] ], 0, 0xf4f1ea );
	band( [ [ 0.075, 0.27 ], [ 0.068, 0.39 ], [ 0.03, 0.455 ], [ 0, 0.46 ] ], 2, 0xffffff );
	const stick = cylinder( 0.011, 0.013, 0.81, 5 );
	stick.translate( 0, 0.35 + y0, 0 );
	parts.push( prepare( stick, { color: 0x9c7a4c, rough: 0.75, pattern: 2 } ) );
	// (its warp: y 0 at the origin .. 1 at its end; three strands' worth of 5 mm line, bright as pot warp is)
	const warp = cylinder( 0.005, 0.005, 1, 3, 1 );
	warp.translate( 0, 0.5, 0 );
	parts.push( tinted( prepare( warp, { color: 0xe4c235, rough: 0.85, pattern: 2 } ), 3 ) );
	return mergePrepared( parts );

}

// ------------------------------------------------------------------ a lobster in the trap (nose +z, a metre long: scaled to it)

export function lobsterInTrap() {

	const g = prepare( lobsterGeometry( { lod: 2 } ), { color: 0xffffff, rough: 0.5, pattern: 2 } );
	const p = g.attributes.position, c = g.attributes.color, col = new Color();
	// (a spiny lobster's shell: red-brown over olive, cream spots along the tail)
	for ( let i = 0; i < p.count; i ++ ) {

		const spot = p.getZ( i ) < 0 && Math.sin( p.getZ( i ) * 70 ) * Math.sin( p.getX( i ) * 90 ) > 0.45;
		col.set( spot ? 0xd8c088 : p.getY( i ) > 0.01 ? 0x8a4a2a : 0xb88a58 );
		c.setXYZ( i, col.r, col.g, col.b );

	}

	return g;

}

// ------------------------------------------------------------------ the material

// Chicken wire cut from the UVs (metres) where pattern's 0, thinning to a screen door far off where its strands are under a pixel; solid
// where it's 2, a pole where it's 3; the instance's colours; a warp stretched to its end, a trap racked by its wear (iEnd); and under the
// sea as the reef and the fish are (Underwater.js)
const HEX_CELL = 0.021, TRAP_FILL = 4;
const glsl = ( hex ) => {

	const c = new Color( hex );
	return `vec3( ${ c.r.toFixed( 4 ) }, ${ c.g.toFixed( 4 ) }, ${ c.b.toFixed( 4 ) } )`;

};

export function createTrapMaterial( ground ) {

	const m = new MeshStandardMaterial( { vertexColors: true, roughness: 0.55, metalness: 0, side: DoubleSide, alphaTest: 0.5 } );
	m.name = 'lobsterTrap';
	const uw = ground ? underwaterUniforms( ground ) : null;
	m.customProgramCacheKey = () => 'lobsterTrap' + ( uw ? ':uw' : '' );
	m.onBeforeCompile = ( shader ) => {

		if ( uw ) Object.assign( shader.uniforms, uw );
		shader.vertexShader = shader.vertexShader
			.replace( '#include <common>', `#include <common>
attribute vec4 aux;
attribute vec3 iOne;
attribute vec3 iTwo;
attribute vec4 iEnd;
varying vec4 vAux;
varying vec2 vTrapUv;
varying vec3 vTrapWorld;
varying vec3 vTrapN;
varying vec3 vTrapWear;` )
			.replace( '#include <beginnormal_vertex>', `#include <beginnormal_vertex>
	vAux = aux;
	vTrapUv = uv;
	vTrapWear = iEnd.xyz;` )
			.replace( '#include <begin_vertex>', `vec3 transformed = position;
	// (a warp: its strand from the origin to iEnd; the rest hidden when iEnd.w says)
	if ( aux.w > 2.5 ) transformed = vec3( position.x, 0.0, position.z ) + iEnd.xyz * position.y;
	else if ( iEnd.w > 0.5 ) transformed = vec3( 0.0 );
	else if ( iEnd.w < - 0.5 ) {
		// (a trap, racked its own way: joints stay met, it's all one smooth bend of the whole; its feet stay down)
		vec3 k = iEnd.xyz * 2.0 - 1.0, o = position;
		float ly = clamp( o.y / ${ TRAP.H.toFixed( 3 ) }, 0.0, 1.0 ), lx = o.x / ${ ( TRAP.W / 2 ).toFixed( 3 ) }, lz = o.z / ${ ( TRAP.L / 2 ).toFixed( 3 ) };
		transformed.x += ly * ( k.x * 0.028 + k.z * 0.014 * lz ) + k.y * 0.012 * lx + k.z * 0.008 * sin( lz * 2.6 + k.x * 5.0 );
		transformed.z += ly * k.y * 0.034 + k.x * 0.024 * sin( lz * 3.14 ) + k.z * 0.012 * lz;
		transformed.y += ly * ( k.z * 0.022 * lx * lz - ( 0.008 + 0.024 * iEnd.y ) * ( 1.0 - lx * lx ) * ( 1.0 - lz * lz ) + 0.007 * sin( lz * 7.0 + k.y * 9.0 ) );
	}` )
			.replace( '#include <project_vertex>', `#include <project_vertex>
	vTrapWorld = ( modelMatrix * instanceMatrix * vec4( transformed, 1.0 ) ).xyz;
	vTrapN = normalize( mat3( modelMatrix ) * mat3( instanceMatrix ) * objectNormal );` )
			.replace( '#include <color_vertex>', `#include <color_vertex>
	if ( aux.w > 0.5 && aux.w < 1.5 ) vColor.rgb = iOne;
	else if ( aux.w > 1.5 && aux.w < 2.5 ) vColor.rgb = iTwo;` );
		shader.fragmentShader = shader.fragmentShader
			.replace( '#include <common>', `#include <common>
varying vec4 vAux;
varying vec2 vTrapUv;
varying vec3 vTrapWorld;
varying vec3 vTrapN;
varying vec3 vTrapWear;
float trapHash( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
float trapNoise( vec2 p ) {
	vec2 i = floor( p ), f = fract( p );
	f = f * f * ( 3.0 - 2.0 * f );
	return mix( mix( trapHash( i ), trapHash( i + vec2( 1.0, 0.0 ) ), f.x ), mix( trapHash( i + vec2( 0.0, 1.0 ) ), trapHash( i + vec2( 1.0, 1.0 ) ), f.x ), f.y );
}
${ uw ? UNDERWATER_GLSL : '' }` )
			.replace( '#include <color_fragment>', `#include <color_fragment>
	if ( vAux.z < 0.5 ) {
		float rusted = vAux.x;
		vec2 u = vTrapUv + vTrapWear.xy * 7.0;
		// (slack: its rows wander; rust crusts it thick in places and has eaten it away in others)
		u += 0.005 * sin( u.yx * vec2( 17.0, 23.0 ) + vTrapWear.z * 6.28 );
		float crust = trapNoise( u * 13.0 );
		vec2 h = u / ${ HEX_CELL.toFixed( 3 ) };
		vec2 s6 = vec2( 1.0, 1.732 );
		vec2 ca = mod( h, s6 ) - s6 * 0.5, cb = mod( h - s6 * 0.5, s6 ) - s6 * 0.5;
		vec2 c6 = dot( ca, ca ) < dot( cb, cb ) ? ca : cb, p6 = abs( c6 );
		float rim = 0.5 - max( p6.x, dot( p6, vec2( 0.5, 0.866 ) ) );
		// (a hexagon's two long sides are the wire's twists, twice as thick)
		float lw = mix( 0.032, 0.13, rusted ) * ( 0.65 + 0.9 * crust ) * ( p6.x > dot( p6, vec2( 0.5, 0.866 ) ) ? 1.6 : 1.0 );
		float fw = max( max( fwidth( h.x ), fwidth( h.y ) ), 0.0001 );
		float cover = mix( clamp( ( lw - rim ) / fw + 0.5, 0.0, 1.0 ), lw * 4.2, smoothstep( 0.3, 0.9, fw ) );
		// (here and there a whole cell's rusted through)
		cover *= step( trapNoise( ( h - c6 ) * 0.22 + vTrapWear.yz * 31.0 ) + 0.1 * trapHash( h - c6 ), 0.84 );
		float door = fract( 52.9829189 * fract( dot( gl_FragCoord.xy, vec2( 0.06711056, 0.00583715 ) ) ) );
		diffuseColor.a = step( door, cover );
		vec3 wire = mix( diffuseColor.rgb, ${ glsl( 0x8d8a80 ) }, smoothstep( 0.5, 0.85, trapNoise( u * 3.1 + vTrapWear.xz * 17.0 ) ) * ( 1.0 - rusted ) * 0.75 );
		wire = mix( wire, ${ glsl( 0x7c4018 ) }, smoothstep( 0.5, 0.85, trapNoise( u * 29.0 ) ) * 0.4 );
		diffuseColor.rgb = mix( wire, ${ glsl( 0x2a1a10 ) }, rusted * ( 0.35 + 0.5 * crust ) );
	} else if ( vAux.z > 2.5 ) {
		// (a pole: its grain, and the rusty wire tying it where it meets the rails)
		float grain = trapNoise( vec2( vTrapUv.x * 70.0, vTrapUv.y * 6.0 ) + vTrapWear.xy * 9.0 );
		diffuseColor.rgb *= ( 0.55 + 0.75 * grain ) * ( 0.7 + 0.5 * trapNoise( vec2( vTrapUv.x * 12.0, vTrapUv.y * 13.0 ) + vTrapWear.yz * 5.0 ) );
		float tie = min( vTrapUv.y, vAux.y - vTrapUv.y );
		if ( tie > 0.012 && tie < 0.034 ) diffuseColor.rgb = mix( diffuseColor.rgb, ${ glsl( 0x6e3a18 ) }, step( 0.5, fract( vTrapUv.y * 170.0 ) ) );
	}
	${ uw ? 'diffuseColor.rgb = uwShade( diffuseColor.rgb, vTrapWorld, normalize( vTrapN ) );' : '' }` )
			.replace( '#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
	roughnessFactor = vAux.z < 0.5 ? 0.85 : max( vAux.x, 0.04 );` )
			.replace( '#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
	metalnessFactor = vAux.z > 1.5 && vAux.z < 2.5 ? vAux.y : 0.0;` )
			// (wire and poles in shade: the sky's fill raised, as the wreck's, or they'd go black on her shaded side; it falls with the sky at night)
			.replace( '#include <lights_fragment_end>', `#include <lights_fragment_end>
	if ( vAux.z < 0.5 || vAux.z > 2.5 ) reflectedLight.indirectDiffuse *= ${ TRAP_FILL.toFixed( 1 ) };` );

	};

	return m;

}

// ------------------------------------------------------------------ what's drawn

const _c = new Color();

export class TrapMeshes {

	constructor( { ground = null, scene, shadows = true } ) {

		this.material = createTrapMaterial( ground );
		const add = ( geo, n, name, cast ) => {

			geo.setAttribute( 'iOne', new InstancedBufferAttribute( new Float32Array( n * 3 ), 3 ) );
			geo.setAttribute( 'iTwo', new InstancedBufferAttribute( new Float32Array( n * 3 ), 3 ) );
			geo.setAttribute( 'iEnd', new InstancedBufferAttribute( new Float32Array( n * 4 ), 4 ) );
			const mesh = new InstancedMesh( geo, this.material, n );
			mesh.name = name;
			mesh.frustumCulled = false;
			mesh.castShadow = cast && shadows;
			mesh.receiveShadow = true;
			mesh.count = 0;
			scene.add( mesh );
			return mesh;

		};

		// (no shadow from the wire: a box of it would black out what's in the trap, and the mesh is far finer than the shadow map)
		this.traps = add( trapGeometry(), MAX.trap, 'LobsterTraps', false );
		this.buoys = add( buoyGeometry(), MAX.buoy, 'TrapBuoys', true );
		this.lobsters = add( lobsterInTrap(), MAX.lobster, 'TrappedLobsters', false );

	}

	begin() {

		this.traps.count = this.buoys.count = this.lobsters.count = 0;

	}

	_put( mesh, m ) {

		if ( mesh.count >= mesh.instanceMatrix.count ) return - 1;
		const i = mesh.count ++;
		mesh.setMatrixAt( i, m );
		return i;

	}

	// wear, 0 to 1: how this one's rusted and racked, the same wherever it's drawn
	trap( m, wear ) {

		const i = this._put( this.traps, m );
		if ( i < 0 ) return;
		const G = this.traps.geometry.attributes;
		_c.copy( RUST[ 0 ] ).lerp( RUST[ 1 ], wear );
		G.iOne.setXYZ( i, _c.r, _c.g, _c.b );
		G.iEnd.setXYZW( i, ( wear * 7.13 ) % 1, ( wear * 13.71 + 0.3 ) % 1, ( wear * 29.37 + 0.6 ) % 1, - 1 );

	}

	// colours: [ one, two ]; end: its warp's far end, in its own frame (null: no warp); hide: only the warp's drawn
	buoy( m, colours, end = null, hide = false ) {

		const i = this._put( this.buoys, m );
		if ( i < 0 ) return;
		const G = this.buoys.geometry.attributes;
		_c.set( colours[ 0 ] );
		G.iOne.setXYZ( i, _c.r, _c.g, _c.b );
		_c.set( colours[ 1 ] );
		G.iTwo.setXYZ( i, _c.r, _c.g, _c.b );
		if ( end ) G.iEnd.setXYZW( i, end.x, end.y, end.z, hide ? 1 : 0 );
		else G.iEnd.setXYZW( i, 0, 0, 0, hide ? 1 : 0 );

	}

	lobster( m ) {

		this._put( this.lobsters, m );

	}

	commit() {

		for ( const mesh of [ this.traps, this.buoys, this.lobsters ] ) {

			if ( ! mesh.count ) continue;
			mesh.instanceMatrix.needsUpdate = true;
			for ( const k of [ 'iOne', 'iTwo', 'iEnd' ] ) mesh.geometry.attributes[ k ].needsUpdate = true;

		}

	}

	get triangles() {

		return triangleCount( this.traps.geometry ) * this.traps.count + triangleCount( this.buoys.geometry ) * this.buoys.count + triangleCount( this.lobsters.geometry ) * this.lobsters.count;

	}

	dispose() {

		for ( const mesh of [ this.traps, this.buoys, this.lobsters ] ) {

			mesh.removeFromParent();
			mesh.geometry.dispose();
			mesh.dispose();

		}

		this.material.dispose();

	}

}
