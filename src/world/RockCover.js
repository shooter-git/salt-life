import * as THREE from '../engine/index.js';
import { BASE, COVER, NO_COVER, decodeHeight, coverPassMaterial } from './Cover.js';

// (M14) What keeps the rain off about you that the cover map doesn't have (world/Cover.js: the village
// and the pier): the rocks. Those about the camera are drawn from straight above and from straight below
// into a square SIDE m across, again each time you've moved STEP from its middle while it rains or
// anything's still wet: each texel keeps the top of the rock over it and the lowest of its underside. So
// what's under a rock's overhang is known (dry), and (rockCoverBlocks, a ray up into where the rain comes
// from) what's in its lee as a wind drives the rain past it. As the cover map keeps them: the height in
// centimetres from BASE below the sea in r and g, the tops in the map's left half and the undersides in
// its right, read texel by texel; read back for the CPU after each draw (topAt, bottomAt, over).
//   const rocks = new RockCover();   material uniforms: { ...rocks.uniforms }, its GLSL: rocks.glsl
//   rocks.update( renderer, x, z, list )   (each frame it's wanted: list( x0, z0, x1, z1 ), the rocks
//     there as [ { geometry, matrix } ], is asked for when it's redrawn)
//   rocks.topAt( x, z ), rocks.bottomAt( x, z ) (m, NO_COVER where no rock is), rocks.over( x, y, z )

export const ROCK_SIDE = 32; // m: the square about the camera
export const ROCK_TEXEL = 0.125; // m
const N = Math.round( ROCK_SIDE / ROCK_TEXEL ); // texels across
const STEP = 4; // m from its middle the camera goes before it's drawn again
// the ray up into the rain (rockCoverBlocks): at most STEPS steps, each rising at least MIN_RISE (m)
const STEPS = 16, MIN_RISE = 0.25;

const f = ( x ) => {

	const s = String( x );
	return s.includes( '.' ) || s.includes( 'e' ) ? s : s + '.0';

};

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
// the top of the rock over xz, and the lowest of its underside (m; ${ f( NO_COVER ) } where there's none)
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

	// the top of the rock over ( x, z ), and the lowest of its underside (m), NO_COVER where none is
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

	// Draws it again about ( x, z ) once the camera's gone STEP from where it was last drawn. list( x0, z0,
	// x1, z1 ): the rocks over that square, [ { geometry, matrix } ]. The pass is the cover map's (the same
	// program, made when it was built)
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
		if ( ! this.target ) {

			this.target = new THREE.WebGLRenderTarget( N * 2, N, {
				type: THREE.UnsignedByteType, format: THREE.RGBAFormat, depthBuffer: true,
				minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false,
			} );
			this.material = coverPassMaterial( COVER.STONE );
			this.scene = new THREE.Scene();
			this.scene.matrixWorldAutoUpdate = false;
			this.above = new THREE.OrthographicCamera();
			this.below = new THREE.OrthographicCamera();

		}

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
		// z0, the first row); from below, the lowest: its up the world's +z
		const A = this.above, B = this.below;
		A.left = x0; A.right = x1; A.top = - z1; A.bottom = - z0; A.near = 0; A.far = top - bottom;
		A.position.set( 0, top, 0 );
		A.rotation.set( - Math.PI / 2, 0, 0 );
		B.left = x0; B.right = x1; B.top = z1; B.bottom = z0; B.near = 0; B.far = top - bottom;
		B.position.set( 0, bottom, 0 );
		B.rotation.set( Math.PI / 2, 0, 0 );
		for ( const c of [ A, B ] ) {

			c.updateMatrixWorld( true );
			c.updateProjectionMatrix();

		}

		const T = this.target;
		const was = { target: renderer.getRenderTarget(), autoClear: renderer.autoClear, color: renderer.getClearColor( new THREE.Color() ), alpha: renderer.getClearAlpha() };
		T.scissorTest = false;
		T.viewport.set( 0, 0, N * 2, N );
		renderer.setRenderTarget( T );
		renderer.setClearColor( 0x000000, 0 );
		renderer.clear( true, true, false );
		renderer.autoClear = false;
		T.viewport.set( 0, 0, N, N );
		renderer.setRenderTarget( T );
		renderer.render( scene, A );
		renderer.clearDepth();
		T.viewport.set( N, 0, N, N );
		renderer.setRenderTarget( T );
		renderer.render( scene, B );
		T.viewport.set( 0, 0, N * 2, N );
		renderer.setRenderTarget( was.target );
		renderer.autoClear = was.autoClear;
		renderer.setClearColor( was.color, was.alpha );
		scene.clear();

		U.rockCover.value = T.texture;
		U.rockCoverInfo.value.set( x0, z0, 1 / ROCK_TEXEL, N );
		U.rockCoverTop.value = box.max.y;
		this.stats = { rocks: parts.length, triangles: triangles * 2, ms: Math.round( ( performance.now() - t0 ) * 10 ) / 10 };

		// (and for the CPU, once it's read back: the last drawn's)
		const data = new Uint8Array( N * 2 * N * 4 );
		renderer.readRenderTargetPixelsAsync( T, 0, 0, N * 2, N, data ).then( () => {

			if ( gen === this._gen ) this.setData( data, x0, z0 );

		} ).catch( () => {} );
		return true;

	}

	dispose() {

		if ( this.target ) this.target.dispose();
		if ( this.material ) this.material.dispose();

	}

}
