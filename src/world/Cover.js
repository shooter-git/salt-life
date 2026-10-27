import * as THREE from '../engine/index.js';

// (M11) What covers the island from above: the pier and its T-head, the boardwalks, the roofs, the
// porches, the stalls and the village's clutter, as the rain finds them. Drawn once from straight
// above after the start (build): each texel keeps the height of the highest surface over it and
// what that surface is (wood, tin, thatch, canvas, stone, or the hard bits: rails, lamps, rope).
// The terrain isn't in it, nor the boat (she moves: her own boxes), the rocks or the plants.
//
// One RGBA8 texel each: the height in centimetres from BASE below the sea in r and g, the kind in b.
// The same bytes are kept for the CPU (heightAt, kindAt, over) and uploaded for the GPU (glsl:
// coverAt, coverHeightAt, read texel by texel: an eave's edge stays sharp). Until it's built
// nothing covers anything, as before M11.
//   const cover = new CoverMap();   material uniforms: { ...cover.uniforms }, its GLSL: cover.glsl
//   await cover.build( renderer, [ { mesh, kind } ], { slot, prepare } )
//   cover.heightAt( x, z ) (m, NO_COVER where nothing covers), cover.kindAt( x, z ), cover.over( x, y, z )

export const COVER = { NONE: 0, WOOD: 1, TIN: 2, THATCH: 3, CANVAS: 4, STONE: 5, HARD: 6 };
export const NO_COVER = - 1000; // m: what heightAt gives where nothing covers
const BASE = 100; // m below the sea the heights are counted from (up to 555 m above it)
const TEXEL = 0.2; // m: the map's texel, unless the covers spread further than MAX_SIDE of them
const MAX_SIDE = 1024;
const PAD = 1; // m: the map's margin around the covers
// a texel's centre can fall between two of the pier's planks (centimetres apart): a hole one texel
// across between covers no more than this apart in height (m) is closed (close)
const SEAM = 0.25;
// triangles drawn in one frame of the build at most (All the Spaces' checks count every triangle
// drawn between two frames as one frame's: 300k on the low tier)
const SLOT_TRIANGLES = 200000;

const f = ( x ) => {

	const s = String( x );
	return s.includes( '.' ) || s.includes( 'e' ) ? s : s + '.0';

};

// a height (m) as the map keeps it, 1..65535 (0 is nothing), and back
export const encodeHeight = ( y ) => Math.min( 65535, Math.max( 1, Math.round( ( y + BASE ) * 100 ) ) );
export const decodeHeight = ( v ) => v > 0 ? v / 100 - BASE : NO_COVER;

// (each material that reads the map: its uniforms, { ...cover.uniforms }, and this)
export const COVER_GLSL = /* glsl */`
uniform highp sampler2D coverMap;
uniform vec4 coverInfo; // origin x, origin z (m), texels per metre
uniform vec2 coverSize; // texels along x, along z (0 until it's built)
vec4 coverTexel( vec2 xz ) {
	vec2 f = ( xz - coverInfo.xy ) * coverInfo.z;
	if ( f.x < 0.0 || f.y < 0.0 || f.x >= coverSize.x || f.y >= coverSize.y ) return vec4( 0.0 );
	return texelFetch( coverMap, ivec2( f ), 0 );
}
// what covers xz: the top of it (m, ${ f( NO_COVER ) } where nothing does) and what it is (COVER)
vec2 coverAt( vec2 xz ) {
	vec4 t = floor( coverTexel( xz ) * 255.0 + 0.5 );
	float v = t.r * 256.0 + t.g;
	return v > 0.5 ? vec2( v * 0.01 - ${ f( BASE ) }, t.b ) : vec2( ${ f( NO_COVER ) }, 0.0 );
}
float coverHeightAt( vec2 xz ) {
	return coverAt( xz ).x;
}
`;

// the build's pass: each surface's height, the highest kept (the depth test, looking down), and its kind
const PASS_VERTEX = /* glsl */`
varying float vCoverY;
void main() {
	vec4 w = modelMatrix * vec4( position, 1.0 );
	vCoverY = w.y;
	gl_Position = projectionMatrix * viewMatrix * w;
}
`;
const PASS_FRAGMENT = /* glsl */`
uniform float coverKind;
varying float vCoverY;
void main() {
	float v = clamp( floor( ( vCoverY + ${ f( BASE ) } ) * 100.0 + 0.5 ), 1.0, 65535.0 );
	float hi = floor( v / 256.0 );
	gl_FragColor = vec4( hi / 255.0, ( v - hi * 256.0 ) / 255.0, coverKind / 255.0, 1.0 );
}
`;

export class CoverMap {

	constructor() {

		this.data = null;
		this.width = 0;
		this.height = 0;
		this.originX = 0;
		this.originZ = 0;
		this.texel = TEXEL;
		this.texture = null;
		const empty = new THREE.DataTexture( new Uint8Array( 4 ), 1, 1 );
		empty.needsUpdate = true;
		this.uniforms = {
			coverMap: { value: empty },
			coverInfo: { value: new THREE.Vector4( 0, 0, 1, 0 ) },
			coverSize: { value: new THREE.Vector2( 0, 0 ) },
		};
		this.glsl = COVER_GLSL;
		this.stats = null;

	}

	// the map's bytes (width x height RGBA, row 0 at originZ), its origin and texel (m)
	setData( data, width, height, originX, originZ, texel ) {

		this.data = data;
		this.width = width;
		this.height = height;
		this.originX = originX;
		this.originZ = originZ;
		this.texel = texel;
		if ( this.texture ) this.texture.dispose();
		const t = this.texture = new THREE.DataTexture( data, width, height, THREE.RGBAFormat, THREE.UnsignedByteType );
		t.minFilter = t.magFilter = THREE.NearestFilter;
		t.generateMipmaps = false;
		t.needsUpdate = true;
		const U = this.uniforms;
		U.coverMap.value = t;
		U.coverInfo.value.set( originX, originZ, 1 / texel, 0 );
		U.coverSize.value.set( width, height );

	}

	// Closes the holes one texel across between two covers at about the same height (SEAM), along x or
	// along z: where the pass looked between two planks. They take the two's height between them and
	// the kind of the first. Decided from the map as drawn, so a wider gap isn't closed a texel at a
	// time. Returns how many were closed
	static close( data, width, height ) {

		const v = ( k ) => data[ k * 4 ] * 256 + data[ k * 4 + 1 ];
		const fills = [];
		// (a and b either side of the hole k: whether they close it)
		const seam = ( k, a, b ) => {

			const va = v( a ), vb = v( b );
			if ( ! va || ! vb || Math.abs( va - vb ) > SEAM * 100 ) return false;
			fills.push( k, Math.round( ( va + vb ) / 2 ), data[ a * 4 + 2 ] );
			return true;

		};
		for ( let j = 0; j < height; j ++ ) for ( let i = 0; i < width; i ++ ) {

			const k = j * width + i;
			if ( v( k ) ) continue;
			if ( i > 0 && i < width - 1 && seam( k, k - 1, k + 1 ) ) continue;
			if ( j > 0 && j < height - 1 ) seam( k, k - width, k + width );

		}

		for ( let n = 0; n < fills.length; n += 3 ) {

			const o = fills[ n ] * 4, h = fills[ n + 1 ];
			data[ o ] = h >> 8;
			data[ o + 1 ] = h & 255;
			data[ o + 2 ] = fills[ n + 2 ];
			data[ o + 3 ] = 255;

		}

		return fills.length / 3;

	}

	// the texel's index under ( x, z ), -1 off the map
	_index( x, z ) {

		if ( ! this.data ) return - 1;
		const i = Math.floor( ( x - this.originX ) / this.texel ), j = Math.floor( ( z - this.originZ ) / this.texel );
		return i < 0 || j < 0 || i >= this.width || j >= this.height ? - 1 : j * this.width + i;

	}

	// the top of what covers ( x, z ) (m), NO_COVER where nothing does
	heightAt( x, z ) {

		const k = this._index( x, z );
		return k < 0 ? NO_COVER : decodeHeight( this.data[ k * 4 ] * 256 + this.data[ k * 4 + 1 ] );

	}

	// what covers it (COVER)
	kindAt( x, z ) {

		const k = this._index( x, z );
		return k < 0 || ! ( this.data[ k * 4 ] || this.data[ k * 4 + 1 ] ) ? COVER.NONE : this.data[ k * 4 + 2 ];

	}

	// whether something covers the point ( x, y, z ): a roof, a deck or an awning over it, more than
	// `clear` above (m)
	over( x, y, z, clear = 0.1 ) {

		return this.heightAt( x, z ) > y + clear;

	}

	// Draws the covers from straight above and reads them back. parts: [ { mesh, kind } ] (world
	// matrices as they are; their geometry on the GPU already will do: its bounds are what's read).
	// slot(): a promise of a frame of its own for each batch drawn (SLOT_TRIANGLES); prepare( scene,
	// camera ): the pass's program made and first used (App.readyToDraw's way)
	async build( renderer, parts, { slot = () => Promise.resolve(), prepare = null } = {} ) {

		const t0 = performance.now();
		const box = new THREE.Box3(), b = new THREE.Box3();
		const used = [];
		for ( const p of parts ) {

			const m = p.mesh, g = m && m.geometry;
			if ( ! g || ! m.isMesh || m.isInstancedMesh || m.isSkinnedMesh || ! g.attributes.position ) continue;
			if ( ! g.boundingBox ) g.computeBoundingBox();
			m.updateWorldMatrix( true, false );
			box.union( b.copy( g.boundingBox ).applyMatrix4( m.matrixWorld ) );
			used.push( p );

		}

		if ( ! used.length ) return;
		const x0 = box.min.x - PAD, z0 = box.min.z - PAD, ex = box.max.x - box.min.x + PAD * 2, ez = box.max.z - box.min.z + PAD * 2;
		const texel = Math.max( TEXEL, Math.max( ex, ez ) / MAX_SIDE );
		const width = Math.ceil( ex / texel ), height = Math.ceil( ez / texel );
		const top = box.max.y + 1, bottom = box.min.y - 1;

		// looking straight down: the camera's x is the world's, its up the world's -z (so its y is -z).
		// Its bottom edge is z0, the map's first row
		const camera = new THREE.OrthographicCamera( x0, x0 + width * texel, - ( z0 + height * texel ), - z0, 0, top - bottom );
		camera.position.set( 0, top, 0 );
		camera.rotation.set( - Math.PI / 2, 0, 0 );
		camera.updateMatrixWorld( true );
		camera.updateProjectionMatrix();

		const materials = new Map();
		const material = ( kind ) => {

			if ( ! materials.has( kind ) ) materials.set( kind, new THREE.ShaderMaterial( {
				name: 'CoverPass',
				uniforms: { coverKind: { value: kind } },
				vertexShader: PASS_VERTEX,
				fragmentShader: PASS_FRAGMENT,
				side: THREE.DoubleSide,
			} ) );
			return materials.get( kind );

		};

		// the parts in batches of at most SLOT_TRIANGLES each
		const batches = [ [] ];
		let triangles = 0, total = 0;
		for ( const p of used ) {

			const g = p.mesh.geometry;
			const n = Math.floor( Math.min( g.index ? g.index.count : g.attributes.position.count, g.drawRange.count ) / 3 );
			if ( triangles + n > SLOT_TRIANGLES && batches[ batches.length - 1 ].length ) {

				batches.push( [] );
				triangles = 0;

			}

			const proxy = new THREE.Mesh( g, material( p.kind ) );
			proxy.matrixAutoUpdate = false;
			proxy.matrixWorldAutoUpdate = false;
			proxy.matrixWorld.copy( p.mesh.matrixWorld );
			proxy.frustumCulled = false;
			batches[ batches.length - 1 ].push( proxy );
			triangles += n;
			total += n;

		}

		const target = new THREE.WebGLRenderTarget( width, height, {
			type: THREE.UnsignedByteType, format: THREE.RGBAFormat, depthBuffer: true,
			minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false,
		} );
		const scene = new THREE.Scene();
		scene.matrixWorldAutoUpdate = false;
		if ( prepare ) {

			scene.add( batches[ 0 ][ 0 ] );
			await prepare( scene, camera );
			scene.clear();

		}

		const was = { target: renderer.getRenderTarget(), autoClear: renderer.autoClear, color: renderer.getClearColor( new THREE.Color() ), alpha: renderer.getClearAlpha() };
		for ( let k = 0; k < batches.length; k ++ ) {

			await slot();
			scene.clear();
			for ( const proxy of batches[ k ] ) scene.add( proxy );
			renderer.setRenderTarget( target );
			renderer.setClearColor( 0x000000, 0 );
			renderer.autoClear = k === 0;
			renderer.render( scene, camera );
			renderer.setRenderTarget( was.target );
			renderer.autoClear = was.autoClear;
			renderer.setClearColor( was.color, was.alpha );

		}

		scene.clear();
		const data = new Uint8Array( width * height * 4 );
		await renderer.readRenderTargetPixelsAsync( target, 0, 0, width, height, data );
		target.dispose();
		for ( const m of materials.values() ) m.dispose();
		const closed = CoverMap.close( data, width, height );
		this.setData( data, width, height, x0, z0, texel );
		this.stats = { width, height, texel, triangles: total, batches: batches.length, closed, ms: Math.round( performance.now() - t0 ) };

	}

}

// (M11) What the rain falls on about a listener at ( x, y, z ), for its sound: the shares of the sea and
// of wood around (the spot, 3 m out and 8 m out, the nearer weighing more; the rest is the ground and the
// roofs); how much of the sea and the wood is right by (the spot and 3 m out); and how much of that is
// under a cover over your head (the pier's deck above you, a roof, an awning). terrainAt( x, z ): the
// ground's height; sea: the sea's level
const AROUND = [ [ 0, 1, 2 ], [ 3, 8, 1 ], [ 8, 12, 0.5 ] ]; // radius (m), samples, the weight of each
export function surroundings( cover, terrainAt, sea, x, y, z, out = {} ) {

	let all = 0, water = 0, wood = 0, near = 0, nearWater = 0, nearWood = 0, over = 0, tin = 0, tinOver = 0;
	for ( const [ r, n, w ] of AROUND ) for ( let k = 0; k < n; k ++ ) {

		const a = k / n * Math.PI * 2 + r * 0.37;
		const sx = x + Math.cos( a ) * r, sz = z + Math.sin( a ) * r;
		const ground = terrainAt( sx, sz ), top = cover.heightAt( sx, sz );
		const covered = top > Math.max( ground, sea );
		const isWood = covered && cover.kindAt( sx, sz ) === COVER.WOOD, isWater = ! covered && ground < sea;
		all += w;
		if ( isWater ) water += w;
		if ( isWood ) wood += w;
		if ( r > 3 ) continue;
		near += w;
		if ( isWater ) nearWater += w;
		if ( isWood ) nearWood += w;
		if ( top > y + 0.3 ) {

			over += w;
			// ((M14) and how much of it's tin, and whether right over you is: a small roof drums over your head)
			if ( cover.kindAt( sx, sz ) === COVER.TIN ) {

				tin += w;
				if ( r === 0 ) tinOver = 1;

			}

		}

	}

	out.water = water / all;
	out.wood = wood / all;
	out.nearWater = nearWater / near;
	out.nearWood = nearWood / near;
	out.under = over / near;
	out.tin = tin / near;
	out.tinOver = tinOver;
	return out;

}
