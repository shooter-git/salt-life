import * as THREE from '../../engine/index.js';
import { f } from './VegNodes.js';
import { CANOPY_GLSL } from './VegMaterials.js';
import { renderOffscreen } from './LeafTextures.js';

// Octahedral impostors for the broadleaf trees and shrubs.
//
// At startup every plant variant is rendered from N x N directions on the upper hemisphere
// (hemi-octahedral layout) into two atlases (WebGLRenderTargets, mipmapped by three, never read
// back):
//   A: leaf brightness structure, leaf (1) / bark (0) flag, per-card colour random, coverage
//   B: plant-local normal * 0.5 + 0.5, exposure (ambient occlusion)
// Colours are applied at runtime with the same species palette as the near geometry, and the
// variants use the same lobe tables, so the far plants keep the near plants' crowns.
// At runtime each plant is one camera-facing quad; the fragment shader picks the three frames
// around the view direction (barycentric blend) and re-projects the view ray onto each frame's
// plane (exact for any view direction, non-uniform instance scale included).

export const OCT_N = 6; // frames per side
const THIN = [ 140, 320 ]; // m: distance range over which the forest is thinned
const THIN_FRACTION = 0.5; // share of the crowns removed at the far end
const SHRUB_MAX = 180; // m: shrub impostors are dropped beyond (too small to matter)

// hemi-octahedral decode: (u, v) in [-1, 1]^2 -> unit direction with y >= 0
export function octDecode( u, v, out = new THREE.Vector3() ) {

	const x = ( u - v ) * 0.5, z = ( u + v ) * 0.5;
	return out.set( x, 1 - Math.abs( x ) - Math.abs( z ), z ).normalize();

}

export function frameBasis( d ) {

	const right = new THREE.Vector3().crossVectors( new THREE.Vector3( 0, 1, 0 ), d );
	if ( right.lengthSq() < 1e-8 ) right.set( 1, 0, 0 );
	right.normalize();
	const up = new THREE.Vector3().crossVectors( d, right ).normalize();
	return { right, up };

}

// GLSL counterparts
const OCT_GLSL = /* glsl */`
vec3 vegOctDecode( float u, float v ) {
	float x = ( u - v ) * 0.5; float z = ( u + v ) * 0.5;
	return normalize( vec3( x, 1.0 - abs( x ) - abs( z ), z ) );
}
vec2 vegOctEncode( vec3 d ) {
	vec3 p = d / ( abs( d.x ) + abs( d.y ) + abs( d.z ) );
	return vec2( p.x + p.z, p.z - p.x );
}
`;

// Bakes and draws the impostors of a set of plant groups (group 0 trees, group 1 shrubs).
export class ImpostorAtlas {

	// groups: [ { variants: [ BufferGeometry ], center: Vector3 (on the plant axis), radius (frame
	// size), rh (horizontal radius), hv (half height) } ], bakeMaterials: { albedo, normal },
	// framePx: atlas pixels per frame (device tier)
	constructor( groups, bakeMaterials, { framePx = 128, blendDist = 100 } = {} ) {

		this.groups = groups;
		this.bakeMaterials = bakeMaterials;
		this.blendDist = blendDist;
		let v = 0;
		for ( const g of groups ) {

			g.variantBase = v;
			v += g.variants.length;

		}

		this.variantCount = v;
		const W = v * OCT_N * framePx, H = OCT_N * framePx;
		const make = ( name ) => {

			const rt = new THREE.WebGLRenderTarget( W, H, {
				depthBuffer: true,
				generateMipmaps: true,
				minFilter: THREE.LinearMipmapLinearFilter,
				magFilter: THREE.LinearFilter,
			} );
			rt.texture.name = name;
			return rt;

		};

		this.rtA = make( 'vegImpostorA' );
		this.rtB = make( 'vegImpostorB' );
		// one depth buffer for both bakes
		this.depth = this.rtA.depthTexture = this.rtB.depthTexture = new THREE.DepthTexture( W, H );
		this.width = W;
		this.height = H;
		this.baked = false;

	}

	// frame transforms: local plant -> atlas plane (cell centre) for variant v, frame (i, j), in units
	// of the group's radius (every cell is 2 x 2, so all groups share one view)
	_frameMatrices( g, vi ) {

		const mats = [];
		const R = g.radius, C = g.center;
		const unit = new THREE.Matrix4().makeScale( 1 / R, 1 / R, 1 / R );
		for ( let j = 0; j < OCT_N; j ++ ) for ( let i = 0; i < OCT_N; i ++ ) {

			const d = octDecode( - 1 + 2 * i / ( OCT_N - 1 ), - 1 + 2 * j / ( OCT_N - 1 ) );
			const { right, up } = frameBasis( d );
			const cx = ( ( g.variantBase + vi ) * OCT_N + i + 0.5 ) * 2 * R, cy = ( j + 0.5 ) * 2 * R;
			const m = new THREE.Matrix4().set(
				right.x, right.y, right.z, - C.dot( right ) + cx,
				up.x, up.y, up.z, - C.dot( up ) + cy,
				d.x, d.y, d.z, - C.dot( d ),
				0, 0, 0, 1 );
			mats.push( m.premultiply( unit ) );

		}

		return mats;

	}

	// Renders both atlases with the renderer: one orthographic view of the whole atlas plane (cells
	// in radius units), one render per atlas (three then builds its mipmaps). A generator: yields
	// between the two atlases, so a caller can spread the work over two tasks.
	* bakeSteps( renderer ) {

		const camera = new THREE.OrthographicCamera( 0, this.variantCount * OCT_N * 2, OCT_N * 2, 0, 0.1, 10 );
		camera.position.set( 0, 0, 5 );
		camera.lookAt( 0, 0, - 1 );
		camera.updateMatrixWorld();
		camera.updateProjectionMatrix();
		const scene = new THREE.Scene();
		const meshes = [];
		for ( const g of this.groups ) g.variants.forEach( ( geo, vi ) => {

			const mats = this._frameMatrices( g, vi );
			const mesh = new THREE.InstancedMesh( geo, this.bakeMaterials.albedo, mats.length );
			mats.forEach( ( m, k ) => mesh.setMatrixAt( k, m ) );
			mesh.frustumCulled = false;
			scene.add( mesh );
			meshes.push( mesh );

		} );
		scene.updateMatrixWorld( true );

		let first = true;
		for ( const [ rt, mat ] of [ [ this.rtA, this.bakeMaterials.albedo ], [ this.rtB, this.bakeMaterials.normal ] ] ) {

			if ( ! first ) yield;
			first = false;
			for ( const m of meshes ) m.material = mat;
			renderOffscreen( renderer, rt, ( r ) => r.render( scene, camera ) );

		}

		for ( const m of meshes ) m.dispose();
		this.baked = true;

	}

	bake( renderer ) {

		const steps = this.bakeSteps( renderer );
		while ( ! steps.next().done );

	}

	// Runtime material definition (VegMaterials.vegMaterial). The callbacks return GLSL
	// expressions (strings):
	// isGroup1( iDat ): bool (per instance) selecting group 1 (shrubs) over group 0 (trees);
	// variantOf( seed, isGroup1 ): variant index within the group;
	// colorOf( { seed, cr, leaf, bright, isGroup1 } ): linear albedo;
	// nearDist( isGroup1 ): the near plants' hand-over distance.
	materialDef( { isGroup1, variantOf, colorOf, nearDist } ) {

		const [ g0, g1 ] = this.groups;
		const cells = this.variantCount * OCT_N;
		const sel = ( a, b ) => `( g1Flag ? ${ f( b ) } : ${ f( a ) } )`;
		const common = /* glsl */`
	bool g1Flag = ${ isGroup1( 'iDatI' ) };
	float R = ${ sel( g0.radius, g1.radius ) };
	float Rh = ${ sel( g0.rh, g1.rh ) };
	float Hv = ${ sel( g0.hv, g1.hv ) };
	float Cy = ${ sel( g0.center.y, g1.center.y ) };
	float vBase = ${ sel( g0.variantBase, g1.variantBase ) };`;

		return {
			name: 'veg-impostor',
			attributes: 'attribute vec4 iPos;\nattribute vec4 iDat;\n',
			// crown sway offset (xyz) and the effective scale (w) for the fragment stage
			varyings: 'vec4 vImp; vec4 vIPos4; vec4 vIDat',
			uniforms: { vegImpA: { value: this.rtA.texture }, vegImpB: { value: this.rtB.texture } },
			// ---- vertex: camera-facing quad around the plant centre, swaying with the wind
			vertex: /* glsl */`
	vec4 iPosI = iPos;
	vec4 iDatI = iDat;
${ common }
	vec3 base = iPosI.xyz;
	float sy = abs( iDatI.y );
	// LOD window: from the near plant's hand-over distance to the fade-out, else collapsed
	float d = length( vegCamPos - base );
	float vis = d >= ( ${ nearDist( 'g1Flag' ) } ) * ( 1.0 - VEG_LOD_BAND / 2.0 ) && d < ( g1Flag ? ${ f( SHRUB_MAX ) } : vegLodRange.z ) ? 1.0 : 0.0;
	// far away the forest is thinned out: fewer, proportionally larger crowns (grown about
	// the base) keep the canopy closed
	float thin = ss( ${ f( THIN[ 0 ] ) }, ${ f( THIN[ 1 ] ) }, d );
	float keep = fract( iDatI.w * 91.7 ) < thin * ${ f( THIN_FRACTION ) } ? 0.0 : 1.0;
	float grow = thin * ${ f( 1 / Math.sqrt( 1 - THIN_FRACTION ) - 1 ) } + 1.0;
	float s = iPosI.w * grow;
	vec3 C = base + vec3( 0.0, Cy * s * sy, 0.0 );
	// sway of the whole crown (matches the near plants' trunk sway amplitude)
	float w = vegWindStrength();
	float g = vegGustAt( base.xz );
	float ph0 = iDatI.w * 6.2832;
	float sway = ( w * w * 0.009 * ( g * 0.8 + 0.3 ) + sin( vegTime * 0.9 + ph0 ) * w * 0.0045 * ( g + 0.4 ) ) * iDatI.z * 0.45;
	vec3 swayV = vegWindDir3() * sway;
	vec3 Cs = C + swayV;
	vImp = vec4( swayV, s );
	vIPos4 = iPosI;
	vIDat = iDatI;
	vec3 toCam = normalize( cameraPosition - Cs );
	vec3 right = normalize( cross( VEG_UP, toCam ) + vec3( 1e-4, 0.0, 0.0 ) );
	vec3 up = cross( toCam, right );
	// quad fitted to the plant's projected extent: its horizontal radius across, from above
	// the crown disc, from the side the (stretched) height
	float k = s * vis * keep;
	float ty = abs( toCam.y );
	float halfW = Rh * k;
	float halfH = ( Hv * sy * sqrt( max( 1.0 - ty * ty, 0.0 ) ) + Rh * ty ) * k;
	vec3 vegWorldPos = Cs + right * ( position.x * halfW ) + up * ( position.y * halfH );
	// (the quad faces the camera: its normal lights the translucency)
	vec3 vegWorldNormal = toCam;`,
			fragmentPars: CANOPY_GLSL + OCT_GLSL + /* glsl */`
uniform sampler2D vegImpA;
uniform sampler2D vegImpB;
// frame sampler: the frame's direction, the view ray re-projected on its plane
void vegImpSample( vec2 ij, vec3 O, vec3 D, float variant, float Rf, out vec4 sA, out vec4 sB ) {
	vec3 d = vegOctDecode( ij.x / ${ f( OCT_N - 1 ) } * 2.0 - 1.0, ij.y / ${ f( OCT_N - 1 ) } * 2.0 - 1.0 );
	vec3 right = normalize( cross( VEG_UP, d ) );
	vec3 up = cross( d, right );
	float t = - dot( O, d ) / dot( D, d );
	vec3 P = O + D * t;
	float a = dot( P, right ) / Rf; float b = dot( P, up ) / Rf;
	float cu = variant * ${ f( OCT_N ) } + ij.x + ( a * 0.5 + 0.5 );
	float cv = ij.y + ( b * 0.5 + 0.5 );
	bool inCell = abs( a ) < 1.0 && abs( b ) < 1.0;
	// (WebGL render targets keep the bottom row first, like the atlas plane: no flip)
	vec2 st = vec2( cu / ${ f( cells ) }, cv / ${ f( OCT_N ) } );
	float k = inCell ? 1.0 : 0.0;
	sA = texture( vegImpA, st ) * k;
	sB = texture( vegImpB, st ) * k;
}
`,
			// ---- fragment: frame selection + re-projection
			surface: /* glsl */`
	vec4 iPosI = vIPos4;
	vec4 iDatI = vIDat;
${ common }
	vec3 base = iPosI.xyz;
	float si = vImp.w;
	float sy = abs( iDatI.y );
	float yaw = iDatI.x;
	float cyw = cos( yaw ); float syw = sin( yaw );
	vec3 C = base + vec3( 0.0, Cy * si * sy, 0.0 ) + vImp.xyz;
	// world -> plant-local (unstretched, centred): rotate by -yaw, divide by the scale
	vec3 Ow = cameraPosition - C;
	vec3 Dw = vegP - cameraPosition;
	vec3 scl = vec3( si, si * sy, si );
	vec3 O = vec3( Ow.x * cyw - Ow.z * syw, Ow.y, Ow.x * syw + Ow.z * cyw ) / scl;
	vec3 D = vec3( Dw.x * cyw - Dw.z * syw, Dw.y, Dw.x * syw + Dw.z * cyw ) / scl;
	vec3 vdir = normalize( O );
	vec3 vd = normalize( vec3( vdir.x, max( vdir.y, 0.02 ), vdir.z ) );
	vec2 gg = ( vegOctEncode( vd ) * 0.5 + 0.5 ) * ${ f( OCT_N - 1 ) };
	vec2 gi = floor( clamp( gg, vec2( 0.0 ), vec2( ${ f( OCT_N - 1.001 ) } ) ) );
	vec2 fr = gg - gi;
	bool upper = fr.x + fr.y > 1.0;
	// triangle of the cell containing g, barycentric weights
	vec2 i0 = upper ? gi + 1.0 : gi;
	vec2 i1 = upper ? gi + vec2( 0.0, 1.0 ) : gi + vec2( 1.0, 0.0 );
	vec2 i2 = upper ? gi + vec2( 1.0, 0.0 ) : gi + vec2( 0.0, 1.0 );
	float w0 = upper ? fr.x + fr.y - 1.0 : 1.0 - fr.x - fr.y;
	float w1 = upper ? 1.0 - fr.x : fr.x;
	float w2 = upper ? 1.0 - fr.y : fr.y;
	float variant = vBase + ${ variantOf( 'iDatI.w', 'g1Flag' ) };
	vec4 vA = vec4( 0.0 ); vec4 vB = vec4( 0.0 );
	// near: blend the three frames around the view direction; far: the dominant frame only
	if ( length( vegCamPos - base ) < ${ f( this.blendDist ) } ) {
		vec4 a0; vec4 b0; vec4 a1; vec4 b1; vec4 a2; vec4 b2;
		vegImpSample( i0, O, D, variant, R, a0, b0 );
		vegImpSample( i1, O, D, variant, R, a1, b1 );
		vegImpSample( i2, O, D, variant, R, a2, b2 );
		vA = a0 * w0 + a1 * w1 + a2 * w2;
		vB = b0 * w0 + b1 * w1 + b2 * w2;
	} else {
		vec2 iMax = w0 >= max( w1, w2 ) ? i0 : ( w1 >= w2 ? i1 : i2 );
		vegImpSample( iMax, O, D, variant, R, vA, vB );
	}
	// cross-fade from the near geometry (incoming level of the band around nearDist)
	float nd = ${ nearDist( 'g1Flag' ) };
	float fade = ss( nd * ( 1.0 - VEG_LOD_BAND / 2.0 ), nd * ( 1.0 + VEG_LOD_BAND / 2.0 ), length( vegCamPos - base ) );
	if ( ! ( vA.w > 0.42 && bayer4( vegPixel ) < fade ) ) discard;

	float cov = max( vA.w, 1e-3 );
	float bright = vA.x / cov; float leaf = vA.y / cov; float cr = vA.z / cov;
	// exposure (baked crown AO): the inside and underside of the crown in deep shade
	float ex = vB.w / cov;
	vec3 albedo = ${ colorOf( { seed: 'iDatI.w', cr: 'cr', leaf: 'leaf', bright: 'bright', isGroup1: 'g1Flag' } ) } * mix( 0.26, 1.0, ex * ex ) * ( bright * 0.6 + 0.7 );
	vegAlbedo = albedo;
	// B is written where A has coverage: un-premultiply the filtered edges by A's coverage
	vec3 nl = vB.xyz / max( vA.w, 1e-3 ) * 2.0 - 1.0;
	// local -> world: inverse-transpose of the stretch, then the yaw rotation
	vec3 ns = vec3( nl.x, nl.y / sy, nl.z );
	vec3 nw = normalize( vec3( ns.x * cyw + ns.z * syw, ns.y, ns.z * cyw - ns.x * syw ) );
	vegNormalW = normalize( nw + vegV * 0.12 );
	vegRough = 0.85;
	vegSpec = 0.12;
	// backlit crowns glow at the edges (light through the leaves), like the near canopy
	vegTransN = vegN;
	vegTrans = ( albedo * vec3( 1.25, 1.45, 0.55 ) + vec3( 0.012, 0.018, 0.0 ) ) * 0.35 * ( 1.0 - vegNight );`,
			shadow: null,
		};

	}

	dispose() {

		this.rtA.dispose();
		this.rtB.dispose();
		this.depth.dispose();

	}

}

// Quad geometry for the impostor instances (corners at +-1)
export function buildImpostorQuad() {

	const g = new THREE.BufferGeometry();
	g.setAttribute( 'position', new THREE.Float32BufferAttribute( [ - 1, - 1, 0, 1, - 1, 0, 1, 1, 0, - 1, 1, 0 ], 3 ) );
	g.setAttribute( 'normal', new THREE.Float32BufferAttribute( [ 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1 ], 3 ) );
	g.setAttribute( 'uv', new THREE.Float32BufferAttribute( [ 0, 0, 1, 0, 1, 1, 0, 1 ], 2 ) );
	g.setIndex( [ 0, 1, 2, 0, 2, 3 ] );
	g.boundingSphere = new THREE.Sphere( new THREE.Vector3(), 1e7 );
	return g;

}
