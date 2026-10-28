import * as THREE from '../engine/index.js';
import { BASE, COVER, NO_COVER, decodeHeight, coverPassMaterial } from './Cover.js';

// (M14) What keeps the rain off about you that the cover map doesn't have (world/Cover.js: the village
// and the pier): the rocks. Those about the camera are drawn from straight above into a square SIDE m
// across, again each time you've moved STEP from its middle while it rains or anything's still wet: each
// texel keeps the top of the rock over it, and (drawn again, its top peeled away) the underside of that
// topmost layer of rock, so the gap under an overhang whose foot runs on beneath it is a gap. So what's
// under a rock's overhang is known (dry), and (rockCoverBlocks, a ray up into where the rain comes from)
// what's in its lee as a wind drives the rain past it, or in under its overhang. As the cover map keeps
// them: the height in centimetres from BASE below the sea in r and g, the tops in the map's left half and
// the undersides in its right, read texel by texel; read back for the CPU after each draw (topAt,
// bottomAt, over).
//   const rocks = new RockCover();   material uniforms: { ...rocks.uniforms }, its GLSL: rocks.glsl
//   await rocks.prepare( renderer, compile )   (its peeling pass's program made: compile( scene, camera ))
//   rocks.update( renderer, x, z, list )   (each frame it's wanted: list( x0, z0, x1, z1 ), the rocks
//     there as [ { geometry, matrix } ], is asked for when it's redrawn)
//   rocks.topAt( x, z ), rocks.bottomAt( x, z ) (m, NO_COVER where no rock is), rocks.over( x, y, z )

export const ROCK_SIDE = 32; // m: the square about the camera
export const ROCK_TEXEL = 0.125; // m
const N = Math.round( ROCK_SIDE / ROCK_TEXEL ); // texels across
const STEP = 4; // m from its middle the camera goes before it's drawn again
// the ray up into the rain (rockCoverBlocks): at most STEPS steps, each rising at least MIN_RISE (m)
const STEPS = 16, MIN_RISE = 0.25;

// the peeling pass: drawn from above as the cover map's pass is, but leaving out what's at the top already
// drawn there (peelTop, the tops: the same texels), so the highest left is the top layer's underside
const PEEL_VERTEX = /* glsl */`
varying vec3 vPeelP;
void main() {
	vec4 w = modelMatrix * vec4( position, 1.0 );
	vPeelP = w.xyz;
	gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const f = ( x ) => {

	const s = String( x );
	return s.includes( '.' ) || s.includes( 'e' ) ? s : s + '.0';

};

const PEEL_FRAGMENT = /* glsl */`
uniform highp sampler2D peelTop;
uniform vec4 peelInfo; // origin x, origin z (m), texels per metre, texels across
uniform float coverKind;
varying vec3 vPeelP;
void main() {
	ivec2 i = clamp( ivec2( floor( ( vPeelP.xz - peelInfo.xy ) * peelInfo.z ) ), ivec2( 0 ), ivec2( int( peelInfo.w ) - 1 ) );
	vec2 t = floor( texelFetch( peelTop, i, 0 ).rg * 255.0 + 0.5 );
	if ( vPeelP.y > ( t.r * 256.0 + t.g ) * 0.01 - ${ f( BASE ) } - 0.02 ) discard;
	float v = clamp( floor( ( vPeelP.y + ${ f( BASE ) } ) * 100.0 + 0.5 ), 1.0, 65535.0 );
	float hi = floor( v / 256.0 );
	gl_FragColor = vec4( hi / 255.0, ( v - hi * 256.0 ) / 255.0, coverKind / 255.0, 1.0 );
}
`;

// (each material that reads it: its uniforms, { ...rocks.uniforms }, and this)
export const ROCK_COVER_GLSL = /* glsl */`
uniform highp sampler2D rockCover;
uniform vec4 rockCoverInfo; // origin x, origin z (m), texels per metre, texels across (0: no rock in it)
uniform float rockCoverTop; // the highest top in it (m)
float rockCoverH( ivec2 i ) {
	vec2 t = floor( texelFetch( rockCover, i, 0 ).rg * 255.0 + 0.5 );
	float v = t.r * 256.0 + t.g;
	return v > 0.5 ? v * 0.01 - ${ f( BASE ) } : ${ f( NO_COVER ) };
}
// the texel under xz, x -1 off the map
ivec2 rockCoverTexel( vec2 xz ) {
	vec2 t = ( xz - rockCoverInfo.xy ) * rockCoverInfo.z;
	return t.x < 0.0 || t.y < 0.0 || t.x >= rockCoverInfo.w || t.y >= rockCoverInfo.w ? ivec2( - 1 ) : ivec2( t );
}
// the top of the rock over xz, and the underside of that topmost layer of it (m; ${ f( NO_COVER ) } where
// there's none)
vec2 rockCoverAt( vec2 xz ) {
	ivec2 i = rockCoverTexel( xz );
	return i.x < 0 ? vec2( ${ f( NO_COVER ) } ) : vec2( rockCoverH( i ), rockCoverH( i + ivec2( int( rockCoverInfo.w ), 0 ) ) );
}
float rockUndersideAt( vec2 xz ) {
	ivec2 i = rockCoverTexel( xz );
	return i.x < 0 ? ${ f( NO_COVER ) } : rockCoverH( i + ivec2( int( rockCoverInfo.w ), 0 ) );
}
// whether the rain coming to p along -d (d: up into where it comes from) goes through a rock first: in a
// rock's lee, or under its overhang. Stepped up the ray to the highest top, each step's rise against the
// rock over where it starts (so a lip thinner than a step isn't stepped over)
bool rockCoverBlocks( vec3 p, vec3 d ) {
	if ( rockCoverInfo.w < 0.5 || p.y >= rockCoverTop ) return false;
	vec3 s = d * ( max( ( rockCoverTop - p.y ) / ${ f( STEPS ) }, ${ f( MIN_RISE ) } ) / d.y );
	vec3 q = p;
	for ( int i = 0; i < ${ STEPS }; i ++ ) {
		vec2 tb = rockCoverAt( q.xz );
		if ( q.y < tb.x && q.y + s.y > tb.y ) return true;
		q += s;
		if ( q.y > rockCoverTop ) break;
	}
	return false;
}
`;

export class RockCover {

	constructor() {

		this.data = null; // the CPU's copy (read back), and where it's from
		this.originX = 0;
		this.originZ = 0;
		this.side = N;
		this.texel = ROCK_TEXEL;
		this.drawn = null; // where it was last drawn about ( x, z ), and when it was read back
		this.target = null;
		this.prepared = false; // its peeling pass made (prepare)
		const empty = new THREE.DataTexture( new Uint8Array( 4 ), 1, 1 );
		empty.needsUpdate = true;
		this.uniforms = {
			rockCover: { value: empty },
			rockCoverInfo: { value: new THREE.Vector4( 0, 0, 1 / ROCK_TEXEL, 0 ) },
			rockCoverTop: { value: NO_COVER },
		};
		this.glsl = ROCK_COVER_GLSL;
		this.stats = null;
		this._gen = 0;
		this._list = [];

	}

	// the map's bytes (2 side x side RGBA: the tops, then the undersides; row 0 at originZ) and its origin
	// (m), for the CPU
	setData( data, originX, originZ ) {

		this.data = data;
		this.originX = originX;
		this.originZ = originZ;

	}

	// the texel's index under ( x, z ) in the tops' half, -1 off the map
	_index( x, z ) {

		if ( ! this.data ) return - 1;
		const i = Math.floor( ( x - this.originX ) / ROCK_TEXEL ), j = Math.floor( ( z - this.originZ ) / ROCK_TEXEL );
		return i < 0 || j < 0 || i >= N || j >= N ? - 1 : j * N * 2 + i;

	}

	_height( k ) {

		return decodeHeight( this.data[ k * 4 ] * 256 + this.data[ k * 4 + 1 ] );

	}

	// the top of the rock over ( x, z ), and the underside of that topmost layer of it (m), NO_COVER where
	// none is
	topAt( x, z ) {

		const k = this._index( x, z );
		return k < 0 ? NO_COVER : this._height( k );

	}

	bottomAt( x, z ) {

		const k = this._index( x, z );
		return k < 0 ? NO_COVER : this._height( k + N );

	}

	// whether a rock's over the point ( x, y, z ), more than `clear` above it (m)
	over( x, y, z, clear = 0.1 ) {

		return this.bottomAt( x, z ) > y + clear;

	}

	// its targets, its passes' materials, the scene and the camera they're drawn with (once)
	_make() {

		if ( this.target ) return;
		const opts = { type: THREE.UnsignedByteType, format: THREE.RGBAFormat, depthBuffer: true, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false };
		this.target = new THREE.WebGLRenderTarget( N * 2, N, opts );
		this.tops = new THREE.WebGLRenderTarget( N, N, opts );
		this.material = coverPassMaterial( COVER.STONE );
		this.peel = new THREE.ShaderMaterial( {
			name: 'CoverPeel',
			uniforms: { coverKind: { value: COVER.STONE }, peelTop: { value: this.tops.texture }, peelInfo: { value: new THREE.Vector4( 0, 0, 1, N ) } },
			vertexShader: PEEL_VERTEX,
			fragmentShader: PEEL_FRAGMENT,
			side: THREE.DoubleSide,
		} );
		this.scene = new THREE.Scene();
		this.scene.matrixWorldAutoUpdate = false;
		this.above = new THREE.OrthographicCamera();

	}

	// the peeling pass's program made and first used before it's wanted (the tops' is the cover map's):
	// compile( scene, camera ), as App readies the rest
	async prepare( renderer, compile ) {

		this._make();
		const m = new THREE.Mesh( new THREE.PlaneGeometry( 1, 1 ), this.peel );
		m.frustumCulled = false;
		const scene = new THREE.Scene();
		scene.add( m );
		this.above.updateMatrixWorld( true );
		await compile( scene, this.above );
		m.geometry.dispose();
		this.prepared = true;

	}

	// Draws it again about ( x, z ) once the camera's gone STEP from where it was last drawn. list( x0, z0,
	// x1, z1 ): the rocks over that square, [ { geometry, matrix } ]. The tops' pass is the cover map's (the
	// same program, made when it was built), the undersides' made by prepare
	update( renderer, x, z, list ) {

		const d = this.drawn;
		if ( d && Math.abs( x - d.x ) < STEP && Math.abs( z - d.z ) < STEP ) return false;
		const x0 = Math.floor( ( x - ROCK_SIDE / 2 ) / ROCK_TEXEL ) * ROCK_TEXEL, z0 = Math.floor( ( z - ROCK_SIDE / 2 ) / ROCK_TEXEL ) * ROCK_TEXEL;
		this.drawn = { x, z };
		const parts = list( x0, z0, x0 + ROCK_SIDE, z0 + ROCK_SIDE );
		const U = this.uniforms, gen = ++ this._gen;
		if ( ! parts.length ) {

			// (none: nothing to draw, nothing over anything)
			U.rockCoverInfo.value.w = 0;
			U.rockCoverTop.value = NO_COVER;
			this.setData( null, x0, z0 );
			this.stats = { rocks: 0, triangles: 0 };
			return true;

		}

		const t0 = performance.now();
		this._make();
		// the rocks, and how high and low they reach
		const box = new THREE.Box3(), b = new THREE.Box3();
		const scene = this.scene, pool = this._list;
		let triangles = 0;
		scene.clear();
		parts.forEach( ( p, k ) => {

			const g = p.geometry;
			if ( ! g.boundingBox ) g.computeBoundingBox();
			box.union( b.copy( g.boundingBox ).applyMatrix4( p.matrix ) );
			let m = pool[ k ];
			if ( ! m ) {

				m = pool[ k ] = new THREE.Mesh( g, this.material );
				m.matrixAutoUpdate = false;
				m.matrixWorldAutoUpdate = false;
				m.frustumCulled = false;

			}

			m.geometry = g;
			m.matrixWorld.copy( p.matrix );
			scene.add( m );
			triangles += ( g.index ? g.index.count : g.attributes.position.count ) / 3;

		} );
		const top = box.max.y + 1, bottom = box.min.y - 1, x1 = x0 + ROCK_SIDE, z1 = z0 + ROCK_SIDE;

		// from above, the highest kept: the camera's x the world's, its up the world's -z (its bottom edge at
		// z0, the first row); the tops drawn into their own target and into the map's left half, then drawn
		// again peeling them away (the depth test keeping the highest left) into its right
		const A = this.above;
		A.left = x0; A.right = x1; A.top = - z1; A.bottom = - z0; A.near = 0; A.far = top - bottom;
		A.position.set( 0, top, 0 );
		A.rotation.set( - Math.PI / 2, 0, 0 );
		A.updateMatrixWorld( true );
		A.updateProjectionMatrix();
		this.peel.uniforms.peelInfo.value.set( x0, z0, 1 / ROCK_TEXEL, N );

		const T = this.target, TT = this.tops;
		const was = { target: renderer.getRenderTarget(), autoClear: renderer.autoClear, color: renderer.getClearColor( new THREE.Color() ), alpha: renderer.getClearAlpha() };
		renderer.setClearColor( 0x000000, 0 );
		renderer.autoClear = false;
		renderer.setRenderTarget( TT );
		renderer.clear( true, true, false );
		renderer.render( scene, A );
		T.scissorTest = false;
		T.viewport.set( 0, 0, N * 2, N );
		renderer.setRenderTarget( T );
		renderer.clear( true, true, false );
		T.viewport.set( 0, 0, N, N );
		renderer.setRenderTarget( T );
		renderer.render( scene, A );
		renderer.clearDepth();
		scene.overrideMaterial = this.peel;
		T.viewport.set( N, 0, N, N );
		renderer.setRenderTarget( T );
		renderer.render( scene, A );
		scene.overrideMaterial = null;
		T.viewport.set( 0, 0, N * 2, N );
		renderer.setRenderTarget( was.target );
		renderer.autoClear = was.autoClear;
		renderer.setClearColor( was.color, was.alpha );
		scene.clear();

		U.rockCover.value = T.texture;
		U.rockCoverInfo.value.set( x0, z0, 1 / ROCK_TEXEL, N );
		U.rockCoverTop.value = box.max.y;
		this.stats = { rocks: parts.length, triangles: triangles * 3, ms: Math.round( ( performance.now() - t0 ) * 10 ) / 10 };

		// (and for the CPU, once it's read back: the last drawn's)
		const data = new Uint8Array( N * 2 * N * 4 );
		renderer.readRenderTargetPixelsAsync( T, 0, 0, N * 2, N, data ).then( () => {

			if ( gen === this._gen ) this.setData( data, x0, z0 );

		} ).catch( () => {} );
		return true;

	}

	dispose() {

		if ( this.target ) this.target.dispose();
		if ( this.tops ) this.tops.dispose();
		if ( this.material ) this.material.dispose();
		if ( this.peel ) this.peel.dispose();

	}

}
