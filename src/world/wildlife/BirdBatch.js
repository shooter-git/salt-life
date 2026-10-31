import * as THREE from '../../engine/index.js';
import { G } from '../../core/Globals.js';
import { SPECIES, buildBird } from './BirdShapes.js';
import { InstanceRecords, instancedMesh, KIT_GLSL, srgb } from './Kit.js';
// (cull: a ViewCull set by Wildlife, or null)

// One instanced draw for every bird (gulls, terns, pelicans, frigatebirds, sanderlings), plus
// the shadow pass (high: a depth material with the same pose).
// (Salt Life) Birds less than FAR_PX pixels across are drawn by a second draw with a coarser
// index over the same vertices (BirdShapes' `far`: 150 triangles rather than 592), no shadows.
//
// Instance record (11 vec4), written by the simulations through write():
//   0 position, scale          1 body orientation     2-4 left wing: shoulder, elbow, wrist
//   5 head rotation            6 head offset, fold    7 left knee, tail pitch
//   8 left foot, tail spread   9 right knee, species  10 right foot, seed
// (Salt Life: Tidewater's records also held the previous pose for motion vectors; no temporal
// filter here.)
// Wing rotations are cumulative (shoulder, shoulder * elbow, shoulder * elbow * wrist) in the
// body frame; the right wing mirrors them. Knees / feet are in the body frame.
// (M15) Their positions are kept about an origin near the camera (begin( origin ): a 32-bit float's step is
// 4 mm 40 km out, and birds working bait are out there), the meshes drawn there (three takes it the rest of
// the way, in doubles).

const REC = 11;
const FAR_PX = 10; // (radius in pixels)

export class BirdBatch {

	// castShadow: into the sun's shadow map (mid and high)
	constructor( { castShadow = false, capacity = 160 } = {} ) {

		// ---- species rest shapes, one storage buffer (species-major)
		const built = SPECIES.map( ( sp ) => buildBird( sp ) );
		const NV = built[ 0 ].count;
		this.cull = null;
		this.castShadow = castShadow;
		this.radius = SPECIES.map( ( sp ) => Math.max( sp.span, sp.length ) * 0.6 );
		this.NV = NV;
		const sp = new Float32Array( SPECIES.length * NV * 16 );
		built.forEach( ( b, s ) => {

			for ( let i = 0; i < NV; i ++ ) {

				const o = ( s * NV + i ) * 16;
				sp.set( b.A.subarray( i * 4, i * 4 + 4 ), o );
				sp.set( b.B.subarray( i * 4, i * 4 + 4 ), o + 4 );
				sp.set( b.C.subarray( i * 4, i * 4 + 4 ), o + 8 );
				sp.set( b.D.subarray( i * 4, i * 4 + 4 ), o + 12 );

			}

		} );
		// (Salt Life) a float texture: 4 texels per vertex, a row per species
		const st = this.speciesTexture = new THREE.DataTexture( sp, NV * 4, SPECIES.length, THREE.RGBAFormat, THREE.FloatType );
		st.minFilter = st.magFilter = THREE.NearestFilter;
		st.generateMipmaps = false;
		st.needsUpdate = true;

		// joints per species: shoulder (+ leg radius), elbow, wrist, neck pivot, tail base, hip, eye
		const J = [];
		SPECIES.forEach( ( s, k ) => {

			const j = built[ k ].joints;
			J.push( new THREE.Vector4( ...j.S, s.legs.r ) );
			J.push( new THREE.Vector4( ...j.E, 0 ) );
			J.push( new THREE.Vector4( ...j.W, 0 ) );
			J.push( new THREE.Vector4( ...s.pivot, 0 ) );
			J.push( new THREE.Vector4( 0, s.tail.y, s.tail.z, 0 ) );
			J.push( new THREE.Vector4( ...s.legs.hip, 0 ) );
			J.push( new THREE.Vector4( 0, s.eye[ 1 ], s.eye[ 0 ], s.eye[ 2 ] ) );
			J.push( new THREE.Vector4() );

		} );
		this.joints = J;
		this.built = built;

		// ---- template geometry (species 0 as the nominal attributes)
		const g = new THREE.BufferGeometry();
		const p = new Float32Array( NV * 3 ), n = new Float32Array( NV * 3 );
		for ( let i = 0; i < NV; i ++ ) {

			p.set( built[ 0 ].C.subarray( i * 4, i * 4 + 3 ), i * 3 );
			n.set( [ 0, 1, 0 ], i * 3 );

		}

		g.setAttribute( 'position', new THREE.BufferAttribute( p, 3 ) );
		g.setAttribute( 'normal', new THREE.BufferAttribute( n, 3 ) );
		g.setIndex( built[ 0 ].index );

		this.records = new InstanceRecords( 'birdInstances', capacity, REC );
		this.material = this.createMaterial();
		this.mesh = instancedMesh( 'Birds', g, this.material, this.records, { castShadow } );
		this.mesh.customDepthMaterial = this.depthMaterial;
		this.triangles = built[ 0 ].index.length / 3;
		// the far birds: their records from the end of the table (birdBase: the first one's row)
		this.farBase = { value: capacity };
		this.farMaterial = this.createMaterial( this.farBase );
		const gf = new THREE.InstancedBufferGeometry();
		gf.setIndex( built[ 0 ].far );
		for ( const k in g.attributes ) gf.setAttribute( k, g.attributes[ k ] );
		gf.instanceCount = 0;
		gf.boundingSphere = new THREE.Sphere( new THREE.Vector3(), 1e5 );
		this.records.backGeometry = gf;
		const fm = this.farMesh = new THREE.Mesh( gf, this.farMaterial );
		fm.name = 'BirdsFar';
		fm.frustumCulled = false;
		fm.matrixAutoUpdate = false;
		fm.receiveShadow = true;
		this.farTriangles = built[ 0 ].far.length / 3;

	}

	begin( origin = null ) {

		this.records.begin();
		// ((M15) the origin they're drawn about)
		const o = this.origin || ( this.origin = { x: 0, y: 0, z: 0 } );
		if ( origin && ( origin.x !== o.x || origin.z !== o.z ) ) {

			o.x = origin.x; o.z = origin.z;
			for ( const m of [ this.mesh, this.farMesh ] ) {

				m.position.set( o.x, 0, o.z );
				m.updateMatrix();

			}

		}

	}

	// b: pose (see Flight / pose helpers): pos, scale, q, QA, QB, QC, qH, headOff, fold, kneeL, footL,
	// kneeR, footR, tailPitch, tailSpread, species, seed, and the previous pos / scale / q / QA / QB / QC
	write( b ) {

		const r = this.radius[ b.species ] * b.scale;
		if ( this.cull && ! this.cull.keep( b.pos[ 0 ], b.pos[ 1 ], b.pos[ 2 ], r, ! this.castShadow ) ) return;
		const far = this.cull && this.cull.pixels( b.pos[ 0 ], b.pos[ 1 ], b.pos[ 2 ], r ) < FAR_PX;
		const o = far ? this.records.pushBack() : this.records.push();
		if ( o < 0 ) return;
		const d = this.records.data;
		const v4 = ( k, a, w ) => {

			const i = o + k * 4;
			d[ i ] = a[ 0 ]; d[ i + 1 ] = a[ 1 ]; d[ i + 2 ] = a[ 2 ]; d[ i + 3 ] = w === undefined ? a[ 3 ] : w;

		};

		// ((M15) about the origin)
		const O = this.origin || ( this.origin = { x: 0, y: 0, z: 0 } );
		d[ o ] = b.pos[ 0 ] - O.x; d[ o + 1 ] = b.pos[ 1 ]; d[ o + 2 ] = b.pos[ 2 ] - O.z; d[ o + 3 ] = b.scale;
		v4( 1, b.q );
		v4( 2, b.QA );
		v4( 3, b.QB );
		v4( 4, b.QC );
		v4( 5, b.qH );
		v4( 6, b.headOff, b.fold );
		v4( 7, b.kneeL, b.tailPitch );
		v4( 8, b.footL, b.tailSpread );
		v4( 9, b.kneeR, b.species );
		v4( 10, b.footR, b.seed );

	}

	commit() {

		this.records.commit();
		this.farBase.value = this.records.max - this.records.back;

	}

	get count() {

		return this.records.count + this.records.back;

	}

	// base: the uniform holding the row of instance 0 (0: the near birds)
	createMaterial( base = { value: 0 } ) {

		const R = this.records, NV = this.NV;
		const F = ( k ) => `texelFetch( birdInstances, ivec2( ${ k }, gl_InstanceID + birdBase ), 0 )`;
		const uniforms = {
			birdBase: base,
			birdInstances: { value: R.texture },
			birdSpecies: { value: this.speciesTexture },
			birdJoints: { value: this.joints },
			birdSunDir: G.sunDir,
			birdSunColor: G.sunColor,
		};
		const decl = /* glsl */`
uniform int birdBase;
uniform highp sampler2D birdInstances;
uniform highp sampler2D birdSpecies;
uniform vec4 birdJoints[ ${ this.joints.length } ];
`;

		// the pose: rest shape -> posed body frame (head bone, tail, three wing bones, legs) -> world
		const pose = /* glsl */`
${ KIT_GLSL }
varying vec3 vBirdRest;
varying vec3 vBirdRestN;
varying vec4 vBirdInfo; // part, u, v, species + seed
varying float vBirdFold;
void birdPose( out vec3 worldPos, out vec3 worldN ) {
	vec4 r0 = ${ F( 0 ) }; vec4 q = ${ F( 1 ) }; vec4 QA = ${ F( 2 ) }; vec4 QB = ${ F( 3 ) }; vec4 QC = ${ F( 4 ) };
	vec4 qH = ${ F( 5 ) }; vec4 r6 = ${ F( 6 ) }; vec4 r7 = ${ F( 7 ) }; vec4 r8 = ${ F( 8 ) }; vec4 r9 = ${ F( 9 ) }; vec4 r10 = ${ F( 10 ) };
	int si = int( r9.w + 0.5 );
	int base = gl_VertexID * 4;
	vec4 A = texelFetch( birdSpecies, ivec2( base, si ), 0 ); vec4 B = texelFetch( birdSpecies, ivec2( base + 1, si ), 0 );
	vec4 C = texelFetch( birdSpecies, ivec2( base + 2, si ), 0 ); vec4 D = texelFetch( birdSpecies, ivec2( base + 3, si ), 0 );
	int jb = si * 8;
	float part = A.w;
	float fold = r6.w;
	vec3 pl = vec3( 0.0 ); vec3 nl = vec3( 0.0, 1.0, 0.0 );

	if ( part < 3.5 ) {

		// body, neck, head and bill: the head bone turns about the neck pivot
		vec3 piv = birdJoints[ jb + 3 ].xyz;
		vec3 hp = piv + r6.xyz + rotateQ( qH, A.xyz - piv );
		float w = part < 2.5 ? B.w : 0.0;
		pl = mix( hp, A.xyz, w );
		nl = mix( rotateQ( qH, B.xyz ), B.xyz, w );

	} else if ( part < 4.5 ) {

		// tail: spread about the centre line, pitched about the tail base
		vec3 T = birdJoints[ jb + 4 ].xyz;
		vec3 d = ( A.xyz - T ) * vec3( r8.w, 1.0, 1.0 );
		float c = cos( r7.w ); float s = sin( r7.w );
		pl = T + vec3( d.x, d.y * c + d.z * s, d.z * c - d.y * s );
		nl = vec3( B.x, B.y * c + B.z * s, B.z * c - B.y * s );

	} else if ( part < 7.5 ) {

		// wings: three bones, mirrored for the right wing, blended at the joints, and morphed
		// into the folded shape
		float side = sign( A.x );
		vec4 mir = vec4( 1.0, side, side, 1.0 );
		vec3 sx = vec3( side, 1.0, 1.0 );
		vec3 S = birdJoints[ jb ].xyz * sx; vec3 E = birdJoints[ jb + 1 ].xyz * sx; vec3 Wj = birdJoints[ jb + 2 ].xyz * sx;
		float seg = part - 5.0;
		vec4 a = QA * mir; vec4 b = QB * mir; vec4 c = QC * mir;
		vec3 Ep = S + rotateQ( a, E - S );
		vec3 Wp = Ep + rotateQ( b, Wj - E );
		vec3 pa = S + rotateQ( a, A.xyz - S );
		vec3 pb = Ep + rotateQ( b, A.xyz - E );
		vec3 pc = Wp + rotateQ( c, A.xyz - Wj );
		vec3 p = seg < 0.5 ? pa : ( seg < 1.5 ? mix( pb, pa, B.w ) : mix( pc, pb, B.w ) );
		vec3 na = rotateQ( a, B.xyz ); vec3 nb = rotateQ( b, B.xyz ); vec3 nc = rotateQ( c, B.xyz );
		vec3 n = seg < 0.5 ? na : ( seg < 1.5 ? mix( nb, na, B.w ) : mix( nc, nb, B.w ) );
		pl = mix( p, C.xyz, fold );
		nl = mix( n, D.xyz, fold );

	} else {

		// legs: tube hip -> knee -> ankle, the foot at the ankle
		float side = A.x; float seg = A.y;
		vec3 hip = birdJoints[ jb + 5 ].xyz * vec3( side, 1.0, 1.0 );
		bool left = side > 0.0;
		vec3 knee = left ? r7.xyz : r9.xyz;
		vec3 foot = left ? r8.xyz : r10.xyz;
		vec3 c = seg < 0.5 ? hip : ( seg < 1.5 ? knee : foot );
		vec3 d0 = seg < 0.5 ? knee - hip : ( seg < 1.5 ? foot - hip : foot - knee );
		vec3 dir = d0 / max( length( d0 ), 1e-5 );
		vec3 ax = normalize( cross( dir, vec3( 1.0, 0.0, 0.001 ) ) );
		vec3 ay = cross( dir, ax );
		vec3 radial = ax * B.x + ay * B.y;
		// collapsed legs (tucked in flight) vanish: the radius follows the leg's length
		float r = birdJoints[ jb ].w * B.z * ss( 0.0, 0.01, length( knee - hip ) + length( foot - knee ) );
		vec3 ring = c + radial * r;
		bool isFoot = seg > 2.5;
		pl = isFoot ? foot + C.xyz * ss( 0.0, 0.01, length( foot - knee ) ) : ring;
		nl = isFoot ? vec3( 0.0, 1.0, 0.0 ) : radial;

	}

	vBirdRest = part > 7.5 ? C.xyz : A.xyz;
	vBirdRestN = B.xyz;
	vBirdInfo = vec4( part, C.w, D.w, r9.w + fract( r10.w ) * 0.9 );
	vBirdFold = fold;
	worldPos = r0.xyz + rotateQ( q, pl * r0.w );
	worldN = rotateQ( q, nl );
}
`;

		const m = new THREE.MeshStandardMaterial( { roughness: 0.72, metalness: 0 } );
		m.name = 'Birds';
		m.onBeforeCompile = ( shader ) => {

			Object.assign( shader.uniforms, uniforms );
			shader.vertexShader = shader.vertexShader
				.replace( '#include <common>', '#include <common>\n' + decl + pose )
				.replace( '#include <beginnormal_vertex>', 'vec3 birdWorld; vec3 birdN;\n\tbirdPose( birdWorld, birdN );\n\tvec3 objectNormal = birdN;' )
				.replace( '#include <begin_vertex>', 'vec3 transformed = birdWorld;' );
			shader.fragmentShader = shader.fragmentShader
				.replace( '#include <common>', '#include <common>\n' + KIT_GLSL + 'uniform vec4 birdJoints[ ' + this.joints.length + ' ];\nuniform vec3 birdSunDir;\nuniform vec3 birdSunColor;\nvarying vec3 vBirdRest;\nvarying vec3 vBirdRestN;\nvarying vec4 vBirdInfo;\nvarying float vBirdFold;\n' )
				.replace( '#include <color_fragment>', '#include <color_fragment>\n' + PLUMAGE )
				.replace( '#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n\troughnessFactor = birdRough;' )
				// light through the thin wing and tail feathers when they are between the sun and the eye
				.replace( '#include <emissivemap_fragment>', /* glsl */`#include <emissivemap_fragment>
	float birdBack = clamp( - dot( normal, normalize( ( viewMatrix * vec4( birdSunDir, 0.0 ) ).xyz ) ), 0.0, 1.0 );
	totalEmissiveRadiance += birdC * birdTrans * ( birdBack * 0.8 + 0.2 ) * birdSunColor * 0.25;` );

		};
		m.customProgramCacheKey = () => 'birds';

		// the shadow pass: the same pose (the near birds)
		if ( this.depthMaterial ) return m;
		const depth = this.depthMaterial = new THREE.MeshDepthMaterial( { depthPacking: THREE.RGBADepthPacking } );
		depth.onBeforeCompile = ( shader ) => {

			Object.assign( shader.uniforms, uniforms );
			shader.vertexShader = shader.vertexShader
				.replace( '#include <common>', '#include <common>\n' + decl + pose )
				.replace( '#include <begin_vertex>', 'vec3 birdWorld; vec3 birdN;\n\tbirdPose( birdWorld, birdN );\n\tvec3 transformed = birdWorld;' );

		};
		depth.customProgramCacheKey = () => 'birdsDepth';
		return m;

	}

}

// ---- plumage, bills, legs, eyes (Tidewater's, in GLSL): sets diffuseColor and birdRough, birdC,
// birdTrans (translucency of the wing and tail feathers)
const PLUMAGE = /* glsl */`
	vec4 vInfo = vBirdInfo;
	float part = floor( vInfo.x + 0.5 );
	float u = vInfo.y; float v = abs( vInfo.z );
	float species = floor( vInfo.w ); float seed = fract( vInfo.w ) / 0.9;
	vec3 P = vBirdRest; vec3 N = vBirdRestN;
	float fold = vBirdFold;
	bool isBody = part < 2.5; bool isBill = part == 3.0; bool isTail = part == 4.0;
	bool isWing = part > 4.5 && part < 7.5; bool isLeg = part > 7.5;
	bool top = N.y > 0.0;
	vec3 c = vec3( 0.5 );
	float birdRough = 0.72;
	float birdTrans = ( isWing || isTail ) ? 0.35 : 0.0;
	// feather texture: fine noise in the rest frame (scaled to the bird's size)
	float fnz = wlNoise( P * 160.0 );

	if ( species == 0.0 ) {

		// laughing gull: slate mantle and upperwing, black primaries with a white trailing
		// edge, white body and tail; breeding birds have a black hood, winter birds a grey smudge
		vec3 white = ${ srgb( 0.93, 0.93, 0.92 ) }; vec3 slate = ${ srgb( 0.38, 0.4, 0.43 ) }; vec3 black = ${ srgb( 0.05, 0.05, 0.055 ) };
		bool hooded = seed < 0.5;
		float mantle = ss( 0.1, 0.45, N.y ) * ss( - 0.1, - 0.07, P.z ) * ss( 0.1, 0.075, P.z );
		float head = ss( 0.1, 0.115, P.z );
		float eyeArc = ss( 0.006, 0.004, length( vec2( P.z - 0.139, P.y - 0.037 ) ) ) * ss( 0.002, 0.004, length( vec2( P.z - 0.141, P.y - 0.032 ) ) );
		float hood = hooded ? head * ( 1.0 - eyeArc ) : head * ss( 0.012, 0.004, length( vec2( P.z - 0.126, P.y - 0.03 ) ) ) * 0.45;
		vec3 body = mix( mix( white, slate, mantle ), hooded ? black : ${ srgb( 0.45, 0.45, 0.47 ) }, hood );
		float tipK = ss( 0.68, 0.76, u );
		float edge = ss( 0.9, 0.97, v ) * ( 1.0 - tipK ) * ( 1.0 - fold );
		vec3 wingTop = mix( mix( slate, white, edge ), black, tipK );
		vec3 wingBot = mix( mix( white, ${ srgb( 0.72, 0.73, 0.75 ) }, ss( 0.3, 0.9, u ) * 0.6 ), black, ss( 0.78, 0.9, u ) );
		c = isWing ? ( top ? wingTop : wingBot ) : ( isTail ? white : body );
		if ( isBill ) c = hooded ? ${ srgb( 0.42, 0.07, 0.07 ) } : ${ srgb( 0.12, 0.08, 0.08 ) };
		if ( isLeg ) c = ${ srgb( 0.16, 0.07, 0.07 ) };

	} else if ( species == 1.0 ) {

		// royal tern: pale grey mantle and upperwing with a dusky primary wedge, white body,
		// shaggy black crest behind a white forehead, orange bill, black legs
		vec3 white = ${ srgb( 0.95, 0.95, 0.94 ) }; vec3 grey = ${ srgb( 0.74, 0.77, 0.8 ) };
		float mantle = ss( 0.15, 0.5, N.y ) * ss( - 0.095, - 0.07, P.z ) * ss( 0.1, 0.075, P.z );
		float cap = ss( 0.108, 0.12, P.z ) * ss( 0.158, 0.145, P.z ) * ss( 0.028, 0.033, P.y );
		vec3 body = mix( mix( white, grey, mantle ), ${ srgb( 0.04, 0.04, 0.045 ) }, cap );
		float wedge = ss( 0.66, 0.8, u ) * ( ss( 0.2, 0.0, v ) * 0.5 + 0.5 );
		vec3 wingTop = mix( grey, ${ srgb( 0.32, 0.33, 0.35 ) }, wedge );
		vec3 wingBot = mix( white, ${ srgb( 0.55, 0.56, 0.58 ) }, ss( 0.82, 0.95, u ) * ss( 0.4, 1.0, v ) );
		c = isWing ? ( top ? wingTop : wingBot ) : ( isTail ? mix( white, grey, 0.3 ) : body );
		if ( isBill ) c = ${ srgb( 0.95, 0.45, 0.1 ) };
		if ( isLeg ) c = ${ srgb( 0.05, 0.05, 0.05 ) };

	} else if ( species == 2.0 ) {

		// brown pelican: silvery grey-brown back, dark belly, cream-white head and neck
		// (chestnut hind neck in breeding birds), dark flight feathers, grey bill, dark pouch
		vec3 back = mix( ${ srgb( 0.44, 0.42, 0.38 ) }, ${ srgb( 0.68, 0.67, 0.63 ) }, ss( 0.0, 0.6, fnz ) * ss( 0.0, 0.6, N.y ) );
		vec3 belly = ${ srgb( 0.24, 0.22, 0.2 ) };
		float neckZone = ss( 0.12, 0.17, P.z );
		vec3 headC = mix( ${ srgb( 0.92, 0.9, 0.82 ) }, ${ srgb( 0.95, 0.86, 0.55 ) }, ss( 0.27, 0.3, P.z ) * ss( 0.13, 0.15, P.y ) );
		vec3 hindNeck = seed < 0.4 ? ${ srgb( 0.28, 0.14, 0.09 ) } : ${ srgb( 0.9, 0.88, 0.82 ) };
		vec3 neckCol = mix( hindNeck, headC, ss( 0.2, 0.235, P.z ) );
		vec3 body = mix( mix( belly, back, ss( - 0.35, 0.25, N.y ) ), mix( neckCol, headC, ss( 0.22, 0.25, P.z ) ), neckZone );
		float flight = max( ss( 0.52, 0.6, u ), ss( 0.45, 0.62, v ) * ( 1.0 - fold ) );
		vec3 wingTop = mix( mix( ${ srgb( 0.56, 0.55, 0.51 ) }, ${ srgb( 0.72, 0.71, 0.67 ) }, ( fnz * 0.5 + 0.5 ) * 0.6 ), ${ srgb( 0.1, 0.09, 0.085 ) }, flight );
		vec3 wingBot = mix( ${ srgb( 0.2, 0.19, 0.18 ) }, ${ srgb( 0.45, 0.44, 0.42 ) }, ss( 0.2, 0.35, v ) * ss( 0.6, 0.4, v ) * ss( 0.6, 0.3, u ) );
		c = isWing ? ( top ? wingTop : wingBot ) : ( isTail ? ${ srgb( 0.2, 0.19, 0.18 ) } : body );
		float pouch = ss( 0.3, 0.38, v ) * ss( 0.7, 0.62, v );
		if ( isBill ) c = mix( mix( ${ srgb( 0.58, 0.54, 0.5 ) }, ${ srgb( 0.75, 0.55, 0.45 ) }, ss( 0.6, 1.0, u ) ), ${ srgb( 0.22, 0.21, 0.2 ) }, pouch );
		if ( isLeg ) c = ${ srgb( 0.12, 0.12, 0.12 ) };
		birdTrans *= 0.5;

	} else if ( species == 3.0 ) {

		// magnificent frigatebird: black with a faint gloss; females a white breast and a
		// brown bar on the upperwing, juveniles a white head and breast; males a red throat
		vec3 black = ${ srgb( 0.035, 0.035, 0.04 ) };
		bool female = seed < 0.45; bool juvenile = seed > 0.85;
		float breast = ss( 0.2, - 0.3, N.y ) * ss( - 0.06, 0.0, P.z ) * ss( 0.14, 0.1, P.z );
		float headW = ss( 0.13, 0.16, P.z );
		vec3 white = ${ srgb( 0.9, 0.9, 0.88 ) };
		vec3 body = mix( black, white, juvenile ? max( breast, headW ) : ( female ? breast : 0.0 ) );
		float throat = ss( 0.13, 0.16, P.z ) * ss( 0.0, - 0.5, N.y ) * ( ( female || juvenile ) ? 0.0 : 1.0 );
		float bar = ss( 0.08, 0.14, u ) * ss( 0.45, 0.38, u ) * ss( 0.12, 0.22, v ) * ss( 0.5, 0.4, v ) * ( ( female || juvenile ) ? 1.0 : 0.4 );
		vec3 wingTop = mix( black, ${ srgb( 0.32, 0.25, 0.18 ) }, bar );
		c = isWing ? ( top ? wingTop : black ) : ( isTail ? black : mix( body, ${ srgb( 0.55, 0.06, 0.05 ) }, throat ) );
		if ( isBill ) c = ${ srgb( 0.5, 0.52, 0.56 ) };
		if ( isLeg ) c = ${ srgb( 0.35, 0.28, 0.28 ) };
		birdRough = 0.55;
		birdTrans *= 0.3;

	} else {

		// sanderling (winter): pale grey above with dark feather centres, white below, dark
		// shoulder and primaries, bold white wing bar, black bill and legs
		vec3 white = ${ srgb( 0.95, 0.95, 0.94 ) }; vec3 grey = mix( ${ srgb( 0.62, 0.62, 0.6 ) }, ${ srgb( 0.48, 0.48, 0.47 ) }, ss( 0.2, 0.7, fnz ) );
		float upper = ss( - 0.05, 0.35, N.y ) * max( ss( 0.092, 0.08, P.z ), ss( 0.2, 0.6, N.y ) );
		vec3 body = mix( white, grey, upper );
		float bar = ss( 0.18, 0.26, u ) * ss( 0.78, 0.7, u ) * ss( 0.42, 0.48, v ) * ss( 0.66, 0.6, v ) * ( 1.0 - fold );
		float shoulder = ss( 0.2, 0.3, u ) * ss( 0.55, 0.45, u ) * ss( 0.3, 0.1, v );
		vec3 wingTop = mix( mix( mix( grey, ${ srgb( 0.12, 0.12, 0.12 ) }, ss( 0.62, 0.72, u ) ), white, bar ), ${ srgb( 0.1, 0.1, 0.1 ) }, shoulder * 0.8 );
		c = isWing ? ( top ? wingTop : white ) : ( isTail ? mix( grey, ${ srgb( 0.2, 0.2, 0.2 ) }, ss( 0.25, 0.0, abs( u - 0.5 ) ) ) : body );
		if ( isBill || isLeg ) c = ${ srgb( 0.04, 0.04, 0.04 ) };

	}

	// eye: dark, with a pale iris for pelicans
	vec4 eye = birdJoints[ int( species ) * 8 + 6 ];
	float ed = length( vec2( P.z - eye.z, P.y - eye.y ) );
	bool onHead = part < 2.5 && abs( P.x ) > 0.004;
	float iris = ss( eye.w, eye.w * 0.8, ed ) * ( onHead ? 1.0 : 0.0 );
	float pupil = ss( eye.w * 0.6, eye.w * 0.45, ed ) * ( onHead ? 1.0 : 0.0 );
	c = mix( mix( c, species == 2.0 ? ${ srgb( 0.8, 0.75, 0.55 ) } : ${ srgb( 0.05, 0.03, 0.02 ) }, iris ), ${ srgb( 0.01, 0.01, 0.01 ) }, pupil );
	birdRough = mix( ( isBill || isLeg ) ? 0.4 : birdRough, 0.15, iris );
	// fine feather texture, darker feather bases toward the trailing edge of the wings
	c *= ( fnz * 0.06 + 1.0 ) * ( isWing ? mix( 1.0, 0.92, ss( 0.5, 1.0, v ) * ( 1.0 - fold ) ) : 1.0 );
	diffuseColor.rgb = c;
	vec3 birdC = c;
`;
