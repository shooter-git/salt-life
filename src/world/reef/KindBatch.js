import * as THREE from '../../engine/index.js';
import { releaseTexture } from '../../core/ReleaseAfterUpload.js';

// (Salt Life) Many instances of many models ("kinds": a model at one level of detail), on WebGL 2:
// Tidewater's ReefBatch drew them with one indirect draw per kind in use from storage buffers.
//
// All the kinds' geometry is in one set of buffers (position, normal, aData; the index global, as
// WebGL has no base vertex). Each kind is its own mesh drawing its index range, instanced: its
// per-instance attribute aInst lists ( record index, fade code ) for this frame. The instances'
// records (`stride` vec4 each) are in one float texture, written by the owner; the vertex shader
// reads them with reefRecord( index, k ).
//   fade code: 1 drawn whole; 0..1 fading in (the share drawn); 2..3 fading out (2 + the share
//   that fading in has: they dither apart, see LODFade)
//
//   const b = new KindBatch( 'Reef.hard', { geometry, kinds, records, stride: 4, capacity } );
//   b.begin(); b.add( kind, i ); b.addFade( kind, i, fade, outgoing ); b.commit();
//   for ( const m of b.meshes ) parent.add( m );  (after setMaterial( main, depth ))

export const ROW = 512; // instances per texture row

export class KindBatch {

	// geometry: { position, normal, aData, index } typed arrays (index global); kinds: [ { start,
	// count (indices), shadowOnly } ]; records: Float32Array ( stride * 4 floats an instance; null:
	// `count` instances, written later through `records`; padded to whole rows of ROW instances, it
	// is used as it is, not copied); count: instances (default: as many as `records` holds);
	// capacity: per kind, the most instances it can list at once (an array, or a number for all)
	constructor( name, { geometry, kinds, records = null, stride = 4, count = 0, capacity } ) {

		this.name = name;
		this.stride = stride;
		const n = Math.max( 1, count || ( records ? records.length / ( stride * 4 ) : 0 ) );
		this.count = n;
		const rows = Math.ceil( n / ROW );
		const size = ROW * stride * rows * 4;
		let data = records;
		if ( ! records || records.length !== size ) {

			data = new Float32Array( size );
			if ( records ) data.set( records.length > size ? records.subarray( 0, size ) : records );

		}

		this.records = data;
		const tex = this.texture = new THREE.DataTexture( data, ROW * stride, rows, THREE.RGBAFormat, THREE.FloatType );
		tex.minFilter = tex.magFilter = THREE.NearestFilter;
		tex.generateMipmaps = false;
		tex.needsUpdate = true;

		const shared = {
			position: new THREE.BufferAttribute( geometry.position, 3 ),
			normal: new THREE.BufferAttribute( geometry.normal, 3 ),
			aData: new THREE.BufferAttribute( geometry.aData, 4 ),
		};
		const index = new THREE.BufferAttribute( geometry.index, 1 );
		this.shared = [ ...Object.values( shared ), index ];
		this.kinds = kinds.map( ( k, i ) => {

			const cap = Math.max( 1, Array.isArray( capacity ) ? capacity[ i ] : capacity );
			const g = new THREE.InstancedBufferGeometry();
			for ( const a in shared ) g.setAttribute( a, shared[ a ] );
			g.setIndex( index );
			g.setDrawRange( k.start, k.count );
			const list = new THREE.InstancedBufferAttribute( new Float32Array( cap * 2 ), 2 );
			list.setUsage( THREE.DynamicDrawUsage );
			g.setAttribute( 'aInst', list );
			g.instanceCount = 0;
			g.boundingSphere = new THREE.Sphere( new THREE.Vector3(), 1e5 );
			return { ...k, geometry: g, list, cap, n: 0, last: - 1, mesh: null, triangles: k.count / 3 };

		} );
		this.visibleInstances = 0;
		this.visibleTriangles = 0;
		this.shadowTriangles = 0;

	}

	// the material for the kinds drawn, and the depth material of those that cast shadows (null:
	// none cast)
	setMaterial( material, depthMaterial = null, { castShadow = false } = {} ) {

		this.meshes = [];
		for ( const k of this.kinds ) {

			const mesh = new THREE.Mesh( k.geometry, material );
			mesh.name = this.name + '.' + ( k.type || 'kind' ) + ( k.lod >= 0 ? k.lod : '' );
			mesh.frustumCulled = false;
			mesh.matrixAutoUpdate = false;
			mesh.visible = false;
			mesh.castShadow = !! ( castShadow && depthMaterial && k.shadowOnly );
			mesh.receiveShadow = ! k.shadowOnly;
			if ( depthMaterial ) mesh.customDepthMaterial = depthMaterial;
			// (drawn in the shadow passes only: the sun's shadow camera sees layer 1, the camera not)
			if ( k.shadowOnly ) mesh.layers.set( 1 );
			k.mesh = mesh;
			this.meshes.push( mesh );

		}

	}

	// GLSL: the k-th vec4 of record `index` (the material binds `name` as a sampler2D)
	glsl( name ) {

		return /* glsl */`
uniform highp sampler2D ${ name };
vec4 ${ name }At( int index, int k ) { return texelFetch( ${ name }, ivec2( ( index % ${ ROW } ) * ${ this.stride } + k, index / ${ ROW } ), 0 ); }
`;

	}

	begin() {

		for ( const k of this.kinds ) k.n = 0;

	}

	add( kind, index ) {

		const k = this.kinds[ kind ];
		if ( k.n >= k.cap ) return;
		const a = k.list.array, o = k.n ++ * 2;
		a[ o ] = index;
		a[ o + 1 ] = 1;

	}

	addFade( kind, index, fade, outgoing ) {

		const k = this.kinds[ kind ];
		if ( k.n >= k.cap ) return;
		const a = k.list.array, o = k.n ++ * 2;
		a[ o ] = index;
		a[ o + 1 ] = outgoing ? 2 + Math.min( Math.max( fade, 0 ), 0.999 ) : Math.min( Math.max( fade, 0 ), 0.999 );

	}

	// the lists to the GPU (only those that changed size or content: all that have instances)
	commit() {

		let vis = 0, tris = 0, shadow = 0;
		for ( const k of this.kinds ) {

			k.geometry.instanceCount = k.n;
			if ( k.mesh ) k.mesh.visible = k.n > 0;
			if ( k.n > 0 ) {

				k.list.clearUpdateRanges();
				k.list.addUpdateRange( 0, k.n * 2 );
				k.list.needsUpdate = true;

			}

			if ( k.shadowOnly ) shadow += k.n * k.triangles;
			else {

				vis += k.n;
				tris += k.n * k.triangles;

			}

		}

		this.visibleInstances = vis;
		this.visibleTriangles = tris;
		this.shadowTriangles = shadow;

	}

	// the geometry's CPU copies dropped once it's on the GPU; records: the records' too (an owner
	// that never writes them again)
	releaseAfterUpload( { records = false } = {} ) {

		const free = function () {

			this.array = null;

		};

		for ( const a of this.shared ) a.onUpload( free );
		if ( records ) {

			releaseTexture( this.texture );
			const release = this.texture.onUpdate;
			this.texture.onUpdate = ( t ) => {

				if ( release ) release.call( this.texture, t );
				this.records = null;

			};

		}

	}

	hide() {

		for ( const k of this.kinds ) if ( k.mesh ) k.mesh.visible = false;
		this.visibleInstances = 0;

	}

	dispose() {

		for ( const k of this.kinds ) k.geometry.dispose();
		this.texture.dispose();

	}

}

// The kinds' geometries (BufferGeometry: position, normal, aData; indexed) merged for a KindBatch:
// { position, normal, aData, index, kinds: [ { start, count, ...the kind's other fields } ] }.
// Geometries shared by several kinds are stored once.
export function mergeKinds( kinds ) {

	let nv = 0, ni = 0;
	const seen = new Set();
	for ( const k of kinds ) {

		if ( seen.has( k.geometry ) ) continue;
		seen.add( k.geometry );
		nv += k.geometry.attributes.position.count;
		ni += k.geometry.index.count;

	}

	const position = new Float32Array( nv * 3 ), normal = new Float32Array( nv * 3 ), aData = new Float32Array( nv * 4 );
	const index = new Uint32Array( ni );
	const placed = new Map();
	let v0 = 0, i0 = 0;
	const meta = kinds.map( ( k ) => {

		const g = k.geometry;
		let at = placed.get( g );
		if ( ! at ) {

			const n = g.attributes.position.count, I = g.index.array;
			position.set( g.attributes.position.array.subarray( 0, n * 3 ), v0 * 3 );
			normal.set( g.attributes.normal.array.subarray( 0, n * 3 ), v0 * 3 );
			aData.set( g.attributes.aData.array.subarray( 0, n * 4 ), v0 * 4 );
			for ( let i = 0; i < I.length; i ++ ) index[ i0 + i ] = I[ i ] + v0;

			at = { start: i0, count: I.length };
			placed.set( g, at );
			v0 += n;
			i0 += I.length;

		}

		const { geometry, ...rest } = k;
		return { ...rest, start: at.start, count: at.count };

	} );
	return { position, normal, aData, index, kinds: meta };

}
