// Frees the CPU copies of large static data once it is on the GPU: three.js keeps every texture's
// pixels and every geometry's vertex arrays in JS memory (to upload them again after a lost WebGL
// context), which for this island is tens of megabytes of a phone's script-memory budget.
//
// Without those copies a lost context can't be restored in place, so the page reloads instead (the
// game state lives in the person's saves): watchContext( renderer ).

const MIN_BYTES = 256 * 1024;

// textures: data textures (and array / 3D ones) bigger than MIN_BYTES, after their first upload
export function releaseTexture( texture ) {

	const img = texture.image;
	if ( ! img || ! img.data || img.data.byteLength < MIN_BYTES || texture._releases ) return;
	texture._releases = true;
	const prev = texture.onUpdate;
	texture.onUpdate = function ( t ) {

		if ( prev ) prev.call( this, t );
		texture.image = { width: img.width, height: img.height, depth: img.depth, data: null };
		texture.onUpdate = prev || null;

	};

}

// uploads `textures` now rather than at the first frame, so their CPU copies go now (while the rest
// of the island is being made, which is when script memory peaks)
export function uploadTextures( renderer, textures ) {

	for ( const t of textures ) {

		releaseTexture( t );
		renderer.initTexture( t );

	}

}

// geometries: their bounds are computed first (three culls with them), then each attribute frees
// its array after its upload
export function releaseGeometry( geometry ) {

	if ( geometry._releases ) return;
	geometry._releases = true;
	if ( ! geometry.boundingSphere ) geometry.computeBoundingSphere();
	if ( ! geometry.boundingBox ) geometry.computeBoundingBox();
	const free = function () {

		this.array = null;

	};
	for ( const a of Object.values( geometry.attributes ) ) if ( a.array && a.array.byteLength >= 4096 && ! a.isInterleavedBufferAttribute ) a.onUpload( free );
	if ( geometry.index && geometry.index.array.byteLength >= 4096 ) geometry.index.onUpload( free );

}

// every material texture and uniform texture under `root` (but those in `keep`)
export function releaseTextures( root, { keep = [] } = {} ) {

	const release = ( t ) => keep.includes( t ) || releaseTexture( t );
	root.traverse( ( o ) => {

		const mats = o.material ? ( Array.isArray( o.material ) ? o.material : [ o.material ] ) : [];
		for ( const m of mats ) {

			for ( const v of Object.values( m ) ) if ( v && v.isTexture ) release( v );
			// (ShaderMaterial uniforms, and onBeforeCompile materials that keep theirs in userData.uniforms)
			for ( const U of [ m.uniforms, m.userData && m.userData.uniforms ] ) if ( U ) for ( const u of Object.values( U ) ) if ( u && u.value && u.value.isTexture ) release( u.value );

		}

	} );

}

export function releaseGeometries( root ) {

	root.traverse( ( o ) => {

		// ((M14) but those whose vertices move: userData.keepArrays, the village's shutters)
		if ( o.isMesh && ! o.isInstancedMesh && ! o.userData.keepArrays && o.geometry && ! o.geometry.isInstancedBufferGeometry ) releaseGeometry( o.geometry );

	} );

}

// a lost context can't be restored without the copies: start again
export function watchContext( renderer ) {

	const canvas = renderer.domElement;
	canvas.addEventListener( 'webglcontextlost', ( e ) => e.preventDefault() );
	canvas.addEventListener( 'webglcontextrestored', () => location.reload() );

}
