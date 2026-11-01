import { BufferGeometry, Color, DoubleSide, Float32BufferAttribute, InstancedBufferAttribute, InstancedMesh, Matrix4, MeshStandardMaterial, Vector3 } from '../../engine/index.js';
import { box, cylinder, lathe, mat4, mergePrepared, prepare, sphere, triangleCount } from './GeoKit.js';
import { UNDERWATER_GLSL, underwaterUniforms } from '../../materials/Underwater.js';
import { lobsterGeometry } from '../fish/CreatureGeometry.js';

// (M16) The lobster traps, as they were on her deck until M14 (git at 290b51b^: DeckGear.buildTraps, BoatMaterials.createTrap), and
// their buoys and warps. How many she carries changes as you set and haul them and as you buy more, and they're out on
// the sea and hanging off the davit too, so they're their own instanced meshes in the world's frame, not part of her merged
// fittings: three draw calls at most, one of each, and nothing's built until there's a trap to draw (TrapWork).
//   const m = new TrapMeshes( { ground, scene, shadows } )
//   m.begin(); m.trap( matrix, colour ); m.buoy( matrix, colours, end, hide ); m.lobster( matrix ); m.commit()

export const TRAP = { L: 0.95, W: 0.55, H: 0.37 };
const WIRE = [ 0xd8b21c, 0x2f7a3c, 0x1f2326 ];
// the most of each drawn at once: yours (8), and the nearest of the others'
export const MAX = { trap: 14, buoy: 16, lobster: 3 };

// where they stow on her deck, fore-and-aft along the quarters and stacked as real boats stack them, in the order they fill:
// [ x, level, z, yaw, wire colour ]. The first two where the deck's old stack was, the rest keeping the room forward of it to fish
export const STOW = [
	[ 0.66, 0, - 3.25, 0.02, 0 ],
	[ 0.66, 1, - 3.23, - 0.03, 1 ],
	[ - 0.68, 0, - 3.25, 0.03, 2 ],
	[ - 0.68, 1, - 3.22, 0.04, 0 ],
	[ 0.64, 0, - 2.2, - 0.04, 0 ],
	[ 0.64, 1, - 2.18, 0.03, 2 ],
	[ 0.65, 2, - 3.27, 0.05, 1 ],
	[ - 0.67, 2, - 3.2, - 0.02, 1 ],
];
const LEVEL = TRAP.H + 0.035;
export const stowY = ( L, level ) => L.deckY + 0.03 + level * LEVEL;

// a trap's stow on her deck, as a matrix in her frame, into out
export function stowMatrix( L, i, out = new Matrix4() ) {

	const [ x, level, z, yaw ] = STOW[ i ];
	return out.copy( mat4( x, stowY( L, level ), z, 0, yaw, 0 ) );

}

export const stowColour = ( i ) => WIRE[ STOW[ i % STOW.length ][ 4 ] ];

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

// A face quad (meters UV); aux carries the face size for the frame border.
function trapFace( a, b, c, d, w, h, pattern, wire ) {

	const g = new BufferGeometry();
	g.setAttribute( 'position', new Float32BufferAttribute( [ a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, d.x, d.y, d.z ], 3 ) );
	g.setAttribute( 'uv', new Float32BufferAttribute( [ 0, 0, w, 0, w, h, 0, h ], 2 ) );
	g.setIndex( [ 0, 1, 2, 0, 2, 3 ] );
	g.computeVertexNormals();
	return tinted( prepare( g, { rough: w, metal: h, pattern, color: 0xffffff } ), wire );

}

// aux.w: 1 takes the instance's first colour, 2 its second, 3 is a warp (see the material)
function tinted( g, w ) {

	const aux = g.attributes.aux;
	for ( let i = 0; i < aux.count; i ++ ) aux.setW( i, w );
	return g;

}

const V = ( x, y, z ) => new Vector3( x, y, z );

export function trapGeometry() {

	const { L: TL, W, H } = TRAP, hw = W / 2, hl = TL / 2, parts = [];
	// box faces, and the parlor divider: the wire, in the instance's colour
	const face = ( a, b, c, d, w, h ) => parts.push( trapFace( a, b, c, d, w, h, 0, 1 ) );
	face( V( - hw, 0, hl ), V( hw, 0, hl ), V( hw, H, hl ), V( - hw, H, hl ), W, H );
	face( V( hw, 0, - hl ), V( - hw, 0, - hl ), V( - hw, H, - hl ), V( hw, H, - hl ), W, H );
	face( V( hw, 0, hl ), V( hw, 0, - hl ), V( hw, H, - hl ), V( hw, H, hl ), TL, H );
	face( V( - hw, 0, - hl ), V( - hw, 0, hl ), V( - hw, H, hl ), V( - hw, H, - hl ), TL, H );
	face( V( - hw, H, hl ), V( hw, H, hl ), V( hw, H, - hl ), V( - hw, H, - hl ), W, TL );
	face( V( - hw, 0, - hl ), V( hw, 0, - hl ), V( hw, 0, hl ), V( - hw, 0, hl ), W, TL );
	face( V( - hw, 0, 0.08 ), V( hw, 0, 0.08 ), V( hw, H, 0.08 ), V( - hw, H, 0.08 ), W, H );
	// net heads funneling in from both sides of the kitchen
	for ( const s of [ 1, - 1 ] ) {

		const zc = - 0.2, yc = H * 0.5;
		const o = [ V( s * hw, yc - 0.12, zc - 0.15 ), V( s * hw, yc - 0.12, zc + 0.15 ), V( s * hw, yc + 0.12, zc + 0.15 ), V( s * hw, yc + 0.12, zc - 0.15 ) ];
		const i = [ V( s * 0.07, yc - 0.045, zc - 0.06 ), V( s * 0.07, yc - 0.045, zc + 0.06 ), V( s * 0.07, yc + 0.045, zc + 0.06 ), V( s * 0.07, yc + 0.045, zc - 0.06 ) ];
		for ( let k = 0; k < 4; k ++ ) {

			const k1 = ( k + 1 ) % 4, g = trapFace( o[ k ], o[ k1 ], i[ k1 ], i[ k ], o[ k ].distanceTo( o[ k1 ] ), o[ k ].distanceTo( i[ k ] ), 1, 0 );
			const c = g.attributes.color, net = new Color( 0x264f6e );
			for ( let n = 0; n < c.count; n ++ ) c.setXYZ( n, net.r, net.g, net.b );
			parts.push( g );

		}

	}

	// runners (weathered oak), ballast bricks and the bait bag hanging in the kitchen: solid (pattern 2)
	const solid = ( g, color, rough ) => parts.push( prepare( g, { color, rough, pattern: 2 } ) );
	for ( const rx of [ - 0.2, 0, 0.2 ] ) {

		// top 4 mm above the wire floor, bottom 2 mm above the deck (both were coplanar: z-fighting)
		const r = box( 0.05, 0.032, TL + 0.02 );
		r.translate( rx, - 0.012, 0 );
		solid( r, 0x9a9a92, 0.8 );

	}

	for ( const bz of [ - 0.3, 0.3 ] ) {

		const b = box( 0.2, 0.06, 0.09 );
		b.translate( 0.05, 0.035, bz );
		solid( b, 0x8e3a26, 0.9 );

	}

	const bag = sphere( 0.06, 6, 4 );
	bag.scale( 1, 1.3, 1 );
	bag.translate( 0, H - 0.1, - 0.2 );
	solid( bag, 0xb3261e, 0.8 );
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

// Wire and netting alpha-tested from the UVs (metres), solid where pattern's 2; the instance's colours; a warp stretched to its
// end; and under the sea as the reef and the fish are (Underwater.js)
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
varying vec3 vTrapN;` )
			.replace( '#include <beginnormal_vertex>', `#include <beginnormal_vertex>
	vAux = aux;
	vTrapUv = uv;` )
			.replace( '#include <begin_vertex>', `vec3 transformed = position;
	// (a warp: its strand from the origin to iEnd; the rest hidden when iEnd.w says)
	if ( aux.w > 2.5 ) transformed = vec3( position.x, 0.0, position.z ) + iEnd.xyz * position.y;
	else if ( iEnd.w > 0.5 ) transformed = vec3( 0.0 );` )
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
${ uw ? UNDERWATER_GLSL : '' }` )
			.replace( '#include <color_fragment>', `#include <color_fragment>
	if ( vAux.z < 1.5 ) {
		float net = step( 0.5, vAux.z );
		vec2 u = vTrapUv;
		vec2 diag = vec2( u.x + u.y, u.x - u.y ) * 0.7071;
		vec2 q = mix( u / 0.038, diag / 0.05, net );
		vec2 fr = abs( fract( q ) - 0.5 );
		vec2 fw = fwidth( q );
		float lineEdge = mix( ${ ( 0.5 - 0.0045 / 0.038 ).toFixed( 5 ) }, ${ ( 0.5 - 0.002 / 0.05 ).toFixed( 5 ) }, net );
		float lineX = smoothstep( lineEdge - fw.x, lineEdge, fr.x );
		float lineY = smoothstep( lineEdge - fw.y, lineEdge, fr.y );
		float b = 0.014;
		float inner = step( b, u.x ) * step( b, u.y ) * step( u.x, vAux.x - b ) * step( u.y, vAux.y - b );
		float border = ( 1.0 - inner ) * ( 1.0 - net );
		diffuseColor.a = max( max( lineX, lineY ), border );
		diffuseColor.rgb *= mix( 1.0, 0.8, border );
	}
	${ uw ? 'diffuseColor.rgb = uwShade( diffuseColor.rgb, vTrapWorld, normalize( vTrapN ) );' : '' }` )
			.replace( '#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
	roughnessFactor = vAux.z < 1.5 ? 0.55 : max( vAux.x, 0.04 );` )
			.replace( '#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
	metalnessFactor = vAux.z < 1.5 ? 0.0 : vAux.y;` );

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

	trap( m, colour ) {

		const i = this._put( this.traps, m );
		if ( i < 0 ) return;
		_c.set( colour );
		this.traps.geometry.attributes.iOne.setXYZ( i, _c.r, _c.g, _c.b );

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
