import * as THREE from '../../engine/index.js';
import { VEG_GLSL, vegUniforms, f } from './VegNodes.js';

// Leaf-cluster cards baked once on the GPU (instead of evaluating the leaf shapes per fragment):
// a 2 x 2 atlas of tiles, each tile a card of many small twig-end leaf whorls (tropical almond /
// sea hibiscus style: 8-25 cm leaves clustered at the twig tips) on a jittered grid with empty
// cells, in two offset layers: clumps with sky holes, no regular pattern. 4x supersampled,
// mipmapped. Rendered into a WebGLRenderTarget (never read back).
//   R coverage, G brightness structure (leaf tip lightening, midrib) / 1.4, B per-leaf random
// Tiles: 0 tree, broad leaves   1 tree, narrow leaves   2 shrub, round leaves   3 shrub, narrow leaves
//
// GLSL: materials sampling the atlas add `leafAtlas.glsl` and `leafAtlas.uniforms`, and call
//   vec4 vegLeafSample( vec2 st, float tile )   (coverage, bright, cell, 1)
export const LEAF_TILES = [
	{ grid: 4, leaves: 6, width: 0.34 },
	{ grid: 4, leaves: 8, width: 0.2 },
	{ grid: 3, leaves: 6, width: 0.45 },
	{ grid: 3, leaves: 8, width: 0.22 },
];
const SIZE = 1024; // (smaller where WebGL is drawn on the CPU: see LeafAtlas)

// leaf rosettes tiled G x G over a card: each cell holds one rosette with its own rotation /
// size; leaves have a short petiole gap at the centre. Returns ( d: signed distance to the leaf
// edge (in rosette units, > 0 inside), bright, cell ).
const ROSETTE = /* glsl */`
struct VegRosette { float d; float bright; float cell; };
VegRosette vegRosette( vec2 st, float G, float nLeaves, float width, float rot ) {
	vec2 cuv = st * G;
	vec2 cell = floor( cuv );
	float h1 = vegHash12( cell + rot * 17.3 );
	float h2 = vegHash12( cell * 1.7 + rot * 31.1 + 5.2 );
	float h3 = vegHash12( cell * 2.3 + rot * 7.7 + 1.9 );
	// whorls of different sizes, off the cell centres; some cells stay empty (sky holes)
	float sc = mix( 0.62, 1.05, h2 ) * ( h3 < 0.2 ? 0.001 : 1.0 );
	vec2 off = vec2( h1 - 0.5, h3 - 0.5 ) * 0.34;
	vec2 p = ( fract( cuv ) - 0.5 - off ) * 2.0 / sc;
	float r = length( p );
	float ang = atan( p.y, p.x ) + rot + h1 * 6.2832;
	float sector = ang * ( nLeaves / 6.2832 );
	float k = floor( sector + 0.5 );
	// irregular leaf spacing and lengths so clusters don't read as flowers
	float lr = vegHash12( vec2( k, h1 * 13.7 ) );
	float jit = ( lr - 0.5 ) * 0.8;
	float L = mix( 0.5, 1.0, fract( lr * 7.13 ) );
	// each blade curves a little to one side (leaves, not a star)
	float curve = ( fract( lr * 3.31 ) - 0.5 ) * 0.9;
	float da = ( sector - k - jit ) * ( 6.2832 / nLeaves ) - curve * ( r / L ) * ( r / L ) * 0.35;
	float along = r * cos( da );
	float across = abs( r * sin( da ) );
	float x = along / L;
	float bx = clamp( ( x - 0.18 ) / 0.82, 0.0, 1.0 ); // blade after a short petiole
	// obovate (widest beyond the middle) with a short pointed tip
	float shape = pow( max( sin( pow( bx, 0.62 ) * 3.14159 ), 0.0 ), 0.8 ) * ( ss( 1.0, 0.86, bx ) * 0.25 + 0.75 );
	float hw = shape * width * L;
	bool inBlade = x > 0.16 && x < 1.0;
	float dBlade = inBlade ? hw - across : -1.0;
	float dPet = x < 0.2 ? 0.012 - across : -1.0;
	VegRosette o;
	o.d = max( dBlade, dPet );
	float vein = ss( 0.03, 0.0, across ) * ss( 0.05, 0.25, bx ) * ss( 1.0, 0.7, bx );
	o.bright = ( ( h1 * 0.7 + lr * 0.3 ) * 0.22 + 0.88 ) * mix( 0.82, 1.08, bx ) * ( vein * 0.09 + 1.0 );
	o.cell = h1 * 0.7 + lr * 0.3;
	return o;
}
`;

export class LeafAtlas {

	constructor( { size = SIZE } = {} ) {

		this.size = size;
		this.rt = new THREE.WebGLRenderTarget( size, size, {
			depthBuffer: false,
			generateMipmaps: true,
			minFilter: THREE.LinearMipmapLinearFilter,
			magFilter: THREE.LinearFilter,
			wrapS: THREE.RepeatWrapping,
			wrapT: THREE.RepeatWrapping,
			anisotropy: 4,
		} );
		this.rt.texture.name = 'vegLeafClusters';
		this.texture = this.rt.texture;
		this.baked = false;
		this.uniforms = { vegLeafTex: { value: this.texture } };
		// (the bake stores the tiles with v flipped, like Tidewater's: the sample flips it back)
		this.glsl = /* glsl */`
uniform sampler2D vegLeafTex;
// sample tile ( 0..3 ) at card uv st -> ( coverage, bright, cell, 1 )
vec4 vegLeafSample( vec2 st, float tile ) {
	vec2 tuv = ( vec2( fract( tile * 0.5 ) * 2.0, floor( tile * 0.5 ) ) + clamp( st, vec2( 0.004 ), vec2( 0.996 ) ) ) * 0.5;
	return texture( vegLeafTex, vec2( tuv.x, 1.0 - tuv.y ) );
}
`;

	}

	// renders the atlas into its render target (a fullscreen triangle pair; mipmaps by three)
	bake( renderer ) {

		const px = 1 / ( this.size / 2 ); // texel size in tile uv
		let body = '';
		for ( let t = 0; t < 4; t ++ ) {

			const T = LEAF_TILES[ t ];
			body += `\tif ( tid == ${ t }.0 ) {\n`;
			// 2 x 2 supersampling
			for ( let s = 0; s < 4; s ++ ) {

				const ox = ( ( s % 2 ) - 0.5 ) * px * 0.5, oy = ( Math.floor( s / 2 ) - 0.5 ) * px * 0.5;
				body += /* glsl */`\t\t{
			vec2 q = local + vec2( ${ f( ox ) }, ${ f( oy ) } );
			VegRosette A = vegRosette( q, ${ f( T.grid ) }, ${ f( T.leaves ) }, ${ f( T.width ) }, 0.0 );
			VegRosette B = vegRosette( q + ${ f( 0.5 / T.grid ) }, ${ f( T.grid ) }, ${ f( T.leaves ) }, ${ f( T.width ) }, 2.1 );
			bool inA = A.d > 0.0; bool inB = B.d > 0.0;
			if ( inA || inB ) {
				cov += 0.25;
				bright += ( inA ? A.bright : B.bright ) * 0.25;
				cellR += ( inA ? A.cell : B.cell ) * 0.25;
			}
		}\n`;

			}

			body += '\t}\n';

		}

		const material = new THREE.ShaderMaterial( {
			name: 'veg-leaf-atlas-bake',
			uniforms: vegUniforms,
			depthTest: false,
			depthWrite: false,
			vertexShader: /* glsl */`
varying vec2 vUv;
void main() {
	vUv = uv;
	gl_Position = vec4( position.xy, 0.0, 1.0 );
}`,
			fragmentShader: VEG_GLSL + ROSETTE + /* glsl */`
varying vec2 vUv;
void main() {
	// three's quad uv: v up
	vec2 st = vec2( vUv.x, 1.0 - vUv.y );
	vec2 tile = floor( st * 2.0 );
	float tid = tile.x + tile.y * 2.0;
	vec2 local = fract( st * 2.0 );
	float cov = 0.0; float bright = 0.0; float cellR = 0.0;
${ body }
	// colour channels are stored un-premultiplied (valid where covered)
	float inv = 1.0 / max( cov, 1e-3 );
	gl_FragColor = vec4( cov, bright * inv / 1.4, cellR * inv, 1.0 );
}
`,
		} );
		const quad = new THREE.Mesh( new THREE.PlaneGeometry( 2, 2 ), material );
		quad.frustumCulled = false;
		const scene = new THREE.Scene();
		scene.add( quad );
		renderOffscreen( renderer, this.rt, ( r ) => r.render( scene, _camera ) );
		quad.geometry.dispose();
		material.dispose();
		this.baked = true;

	}

	dispose() {

		this.rt.dispose();

	}

}

const _camera = new THREE.OrthographicCamera( - 1, 1, 1, - 1, 0, 1 );

// Renders into `target` (cleared to transparent black) and restores the renderer's state
export function renderOffscreen( renderer, target, draw ) {

	const prevTarget = renderer.getRenderTarget();
	const prevColor = renderer.getClearColor( new THREE.Color() );
	const prevAlpha = renderer.getClearAlpha();
	const prevAuto = renderer.autoClear;
	const prevShadow = renderer.shadowMap.autoUpdate;
	renderer.shadowMap.autoUpdate = false;
	renderer.setRenderTarget( target );
	renderer.setClearColor( 0x000000, 0 );
	renderer.clear( true, true, true );
	renderer.autoClear = false;
	draw( renderer );
	renderer.autoClear = prevAuto;
	renderer.setRenderTarget( prevTarget );
	renderer.setClearColor( prevColor, prevAlpha );
	renderer.shadowMap.autoUpdate = prevShadow;

}
