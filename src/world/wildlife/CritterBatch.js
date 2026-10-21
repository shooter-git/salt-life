import * as THREE from '../../engine/index.js';
import { buildCritters, BODY_VERTS, LIMBS, CRITTER } from './CritterShapes.js';
import { InstanceRecords, instancedMesh, KIT_GLSL, srgb, glslFloat as f } from './Kit.js';

// One instanced draw for the beach critters: ghost crabs, hermit crabs and burrows.
// (Salt Life) Burrows, and crabs less than FAR_PX pixels across, are drawn by a second draw of the
// body alone (the template's first BODY_TRIS triangles: 216 rather than 504).
//
// Instance record (4 vec4), written through write():
//   0 position (ground), scale     1 orientation
//   2 species, gait phase, stride (0 still .. 1 full), body lift
//   3 out (ghost crab: 0 down the burrow .. 1 out; hermit crab: 0 withdrawn .. 1 out), eyes up,
//     claws raised, seed
// (Salt Life: Tidewater's records also held the previous pose for motion vectors.)

const REC = 4;
const FAR_PX = 6; // (radius in pixels)

// tetrapod gait: legs 0, 2, 5, 7 swing together, 1, 3, 4, 6 half a cycle later
const GAIT = [ 0, Math.PI, 0, Math.PI, Math.PI, 0, Math.PI, 0 ];

export class CritterBatch {

	constructor( { capacity = 160 } = {} ) {

		const T = buildCritters();
		this.template = T;
		// (Salt Life) the body grids in a float texture: 2 texels per vertex, a row per species
		const S = T.bodyData.length / ( BODY_VERTS * 8 );
		const bt = this.bodyTexture = new THREE.DataTexture( T.bodyData, BODY_VERTS * 2, S, THREE.RGBAFormat, THREE.FloatType );
		bt.minFilter = bt.magFilter = THREE.NearestFilter;
		bt.generateMipmaps = false;
		bt.needsUpdate = true;
		this.limbs = T.limbs;
		this.cull = null; // a ViewCull set by Wildlife, or null
		this.records = new InstanceRecords( 'critterInstances', capacity, REC );
		this.material = this.createMaterial();
		this.mesh = instancedMesh( 'Critters', T.geometry, this.material, this.records, { castShadow: false } );
		this.triangles = T.triangles;
		// bodies only: records from the end of the table (critterBase: the first one's row)
		this.farBase = { value: capacity };
		this.farMaterial = this.createMaterial( this.farBase );
		const gf = new THREE.InstancedBufferGeometry();
		gf.setIndex( T.geometry.index );
		for ( const k in T.geometry.attributes ) gf.setAttribute( k, T.geometry.attributes[ k ] );
		gf.setDrawRange( 0, T.bodyTriangles * 3 );
		gf.instanceCount = 0;
		gf.boundingSphere = new THREE.Sphere( new THREE.Vector3(), 1e5 );
		this.records.backGeometry = gf;
		const fm = this.farMesh = new THREE.Mesh( gf, this.farMaterial );
		fm.name = 'CrittersFar';
		fm.frustumCulled = false;
		fm.matrixAutoUpdate = false;
		fm.receiveShadow = true;

	}

	begin() {

		this.records.begin();

	}

	// c: { x, y, z, scale, q, species, phase, stride, lift, out, eyes, claws, seed, px, py, pz, pPhase, pq }
	write( c ) {

		// (scale: about the body's half width; the legs reach twice that)
		if ( this.cull && ! this.cull.keep( c.x, c.y, c.z, c.scale * 2.2 ) ) return;
		const far = c.species === CRITTER.BURROW || ( this.cull && this.cull.pixels( c.x, c.y, c.z, c.scale * 2.2 ) < FAR_PX );
		const o = far ? this.records.pushBack() : this.records.push();
		if ( o < 0 ) return;
		const d = this.records.data;
		d[ o ] = c.x; d[ o + 1 ] = c.y; d[ o + 2 ] = c.z; d[ o + 3 ] = c.scale;
		d[ o + 4 ] = c.q[ 0 ]; d[ o + 5 ] = c.q[ 1 ]; d[ o + 6 ] = c.q[ 2 ]; d[ o + 7 ] = c.q[ 3 ];
		d[ o + 8 ] = c.species; d[ o + 9 ] = c.phase; d[ o + 10 ] = c.stride; d[ o + 11 ] = c.lift;
		d[ o + 12 ] = c.out; d[ o + 13 ] = c.eyes; d[ o + 14 ] = c.claws; d[ o + 15 ] = c.seed;

	}

	commit() {

		this.records.commit();
		this.farBase.value = this.records.max - this.records.back;

	}

	get count() {

		return this.records.count + this.records.back;

	}

	// base: the uniform holding the row of instance 0 (0: the crabs drawn whole)
	createMaterial( base = { value: 0 } ) {

		const R = this.records;
		const F = ( k ) => `texelFetch( critterInstances, ivec2( ${ k }, gl_InstanceID + critterBase ), 0 )`;
		const gait = GAIT.map( ( g ) => new THREE.Vector4( g, 0, 0, 0 ) );
		const uniforms = {
			critterBase: base,
			critterInstances: { value: R.texture },
			critterBodies: { value: this.bodyTexture },
			critterLimbs: { value: this.limbs },
			critterGait: { value: gait },
		};

		const vert = /* glsl */`
${ KIT_GLSL }
uniform int critterBase;
uniform highp sampler2D critterInstances;
uniform highp sampler2D critterBodies;
uniform vec4 critterLimbs[ ${ this.limbs.length } ];
uniform vec4 critterGait[ 8 ];
attribute vec4 aLimb;
attribute vec2 aRing;
varying vec4 vCritInfo; // part (0 body, 1 leg, 2 claw, 3 eye), u, v, species + seed
varying vec3 vCritLocal;

vec3 critterDir( float az, float el ) { return vec3( cos( az ) * cos( el ), sin( el ), sin( az ) * cos( el ) ); }

// joints of limb k for gait phase ph: j0 (at the body) .. j3 (tip), and the limb's radius
void critterJoints( int si, int k, float ph, float stride, float lift, float outK, float eyes, float claws,
	out vec3 j0, out vec3 j1, out vec3 j2, out vec3 j3, out float jr ) {
	vec4 a = critterLimbs[ si * ${ LIMBS * 2 } + k * 2 ];
	vec4 L = critterLimbs[ si * ${ LIMBS * 2 } + k * 2 + 1 ];
	float kf = float( k );
	bool isLeg = kf < 7.5; bool isClaw = kf > 7.5 && kf < 9.5;
	float side = a.x > 0.0 ? 1.0 : - 1.0;
	float p = ph + critterGait[ min( k, 7 ) ].x;
	float swing = max( sin( p ), 0.0 ) * stride;
	float az = a.w + cos( p ) * stride * 0.28 * ( isLeg ? 1.0 : 0.0 );
	j0 = vec3( a.x, a.y + lift, a.z );
	j1 = vec3( 0.0 ); j2 = vec3( 0.0 ); j3 = vec3( 0.0 );
	if ( isLeg ) {
		// merus up and out, carpus level, dactyl reaching down to the ground
		j1 = j0 + critterDir( az, 0.62 + swing * 0.22 ) * L.x;
		j2 = j1 + critterDir( az, - 0.15 + swing * 0.15 ) * L.y;
		float e3 = asin( clamp( - j2.y / max( L.z, 1e-4 ), - 0.99, - 0.25 ) ) + swing * 0.25;
		j3 = j2 + critterDir( az, e3 ) * L.z;
	} else if ( isClaw ) {
		// chelipeds folded in front of the mouth, lifted when feeding / threatening
		float inward = side * 0.95;
		j1 = j0 + critterDir( az, - 0.35 + claws * 0.5 ) * L.x;
		j2 = j1 + critterDir( az + inward, 0.25 + claws * 0.6 ) * L.y;
		j3 = j2 + critterDir( az + inward * 1.55, - 0.25 + claws * 0.4 ) * L.z;
	} else {
		// eyestalks: up when alert, folded along the front edge when running for the burrow
		float el = mix( 0.05, 1.3, eyes );
		j1 = j0 + critterDir( az, el * 0.8 ) * L.x;
		j2 = j1 + critterDir( az, el ) * L.y;
		j3 = j2;
	}
	// hermit crabs pull everything back into the aperture
	vec3 hole = vec3( 0.0, lift + 0.32, 0.5 );
	bool isHermit = si == ${ CRITTER.HERMIT };
	float k2 = isHermit ? outK : 1.0;
	j0 = mix( hole, j0, k2 ); j1 = mix( hole, j1, k2 ); j2 = mix( hole, j2, k2 ); j3 = mix( hole, j3, k2 );
	jr = L.w * ( isHermit ? outK * 0.7 + 0.3 : 1.0 );
}

void critterPose( out vec3 worldPos, out vec3 worldN ) {
	vec4 r0 = ${ F( 0 ) }; vec4 q = ${ F( 1 ) }; vec4 r2 = ${ F( 2 ) }; vec4 r3 = ${ F( 3 ) };
	int si = int( r2.x + 0.5 );
	float lift = r2.w; float outK = r3.x;
	vec3 pl = vec3( 0.0 ); vec3 nl = vec3( 0.0, 1.0, 0.0 );
	vec4 info = vec4( 0.0 );
	float k = aLimb.x;

	if ( k < 0.0 ) {

		// body grid: carapace / shell (lifted on the legs) or the burrow mound
		vec4 A = texelFetch( critterBodies, ivec2( gl_VertexID * 2, si ), 0 );
		vec4 B = texelFetch( critterBodies, ivec2( gl_VertexID * 2 + 1, si ), 0 );
		float up = si == ${ CRITTER.BURROW } ? 0.0 : lift;
		pl = A.xyz + vec3( 0.0, up, 0.0 );
		nl = B.xyz;
		info = vec4( 0.0, A.w, B.w, 0.0 );

	} else {

		vec3 j0, j1, j2, j3; float jr;
		critterJoints( si, int( k ), r2.y, r2.z, lift, outK, r3.y, r3.z, j0, j1, j2, j3, jr );
		// a vertex of the limb at ( segment, t, radius ) around the segment
		float seg = aLimb.y, t = aLimb.z, rs = aLimb.w;
		vec3 a = seg < 0.5 ? j0 : ( seg < 1.5 ? j1 : j2 );
		vec3 b = seg < 0.5 ? j1 : ( seg < 1.5 ? j2 : j3 );
		vec3 d0 = b - a;
		vec3 d = d0 / max( length( d0 ), 1e-5 );
		vec3 rf = abs( d.y ) > 0.9 ? vec3( 1.0, 0.0, 0.0 ) : vec3( 0.0, 1.0, 0.0 );
		vec3 ax = normalize( cross( d, rf ) );
		vec3 ay = cross( ax, d );
		vec3 radial = ax * aRing.x + ay * aRing.y;
		nl = normalize( radial + d * ( rs < 0.01 ? 1.0 : 0.0 ) );
		pl = mix( a, b, t ) + radial * ( jr * rs );
		float part = k < 7.5 ? 1.0 : ( k < 9.5 ? 2.0 : 3.0 );
		info = vec4( part, seg + t, rs, 0.0 );

	}

	// ghost crabs sink into their burrow (the sand hides what is below)
	pl.y -= si == ${ CRITTER.GHOST } ? ( 1.0 - outK ) * 1.3 : 0.0;
	vCritLocal = pl;
	vCritInfo = vec4( info.xyz, r2.x + fract( r3.w ) * 0.9 );
	worldPos = r0.xyz + rotateQ( q, pl * r0.w );
	worldN = rotateQ( q, nl );
}
`;

		const m = new THREE.MeshStandardMaterial( { roughness: 0.6, metalness: 0 } );
		m.name = 'Critters';
		m.onBeforeCompile = ( shader ) => {

			Object.assign( shader.uniforms, uniforms );
			shader.vertexShader = shader.vertexShader
				.replace( '#include <common>', '#include <common>\n' + vert )
				.replace( '#include <beginnormal_vertex>', 'vec3 critWorld; vec3 critN;\n\tcritterPose( critWorld, critN );\n\tvec3 objectNormal = critN;' )
				.replace( '#include <begin_vertex>', 'vec3 transformed = critWorld;' );
			shader.fragmentShader = shader.fragmentShader
				.replace( '#include <common>', '#include <common>\n' + KIT_GLSL + 'varying vec4 vCritInfo;\nvarying vec3 vCritLocal;\n' )
				.replace( '#include <color_fragment>', '#include <color_fragment>\n' + SHELLS )
				.replace( '#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n\troughnessFactor = critRough;' );

		};
		m.customProgramCacheKey = () => 'critters';
		return m;

	}

}

// ---- carapaces, shells, legs, eyes and burrows (Tidewater's, in GLSL): sets diffuseColor, critRough
const SHELLS = /* glsl */`
	vec4 vInfo = vCritInfo;
	float part = floor( vInfo.x + 0.5 );
	float u = vInfo.y; float v = vInfo.z;
	float species = floor( vInfo.w ); float seed = fract( vInfo.w ) / 0.9;
	vec3 P = vCritLocal;
	float n = wlNoise( P * 14.0 + seed * 17.0 );
	vec3 c = vec3( 0.5 );
	float critRough = 0.6;

	if ( species == ${ f( CRITTER.GHOST ) } ) {

		// ghost crab: pale straw carapace with fine granules, whitish legs and claws, black
		// club-shaped eyes on the stalks
		vec3 straw = mix( ${ srgb( 0.8, 0.73, 0.58 ) }, ${ srgb( 0.88, 0.83, 0.7 ) }, n * 0.5 + 0.5 );
		vec3 body = straw * mix( 0.86, 1.04, ss( 0.0, 0.18, P.y ) );
		vec3 legs = mix( ${ srgb( 0.86, 0.82, 0.72 ) }, ${ srgb( 0.7, 0.62, 0.5 ) }, ss( 0.8, 1.0, fract( u ) ) * 0.5 );
		vec3 claw = mix( ${ srgb( 0.9, 0.87, 0.8 ) }, ${ srgb( 0.78, 0.7, 0.75 ) }, ss( 1.6, 2.3, u ) );
		vec3 eye = mix( ${ srgb( 0.8, 0.75, 0.62 ) }, ${ srgb( 0.04, 0.04, 0.045 ) }, ss( 1.25, 1.4, u ) );
		c = part == 0.0 ? body : ( part == 1.0 ? legs : ( part == 2.0 ? claw : eye ) );
		critRough = ( part == 3.0 && u > 1.3 ) ? 0.15 : 0.55;

	} else if ( species == ${ f( CRITTER.HERMIT ) } ) {

		// hermit crab: turban shell (banded / mottled / chequered by seed), red-orange legs
		// with pale tips, a purple claw; the aperture shows the crab's dark body
		float turns = u + v * 3.2; // spiral: sutures along u + v * turns
		float suture = ss( 0.9, 0.97, fract( turns ) ) * ss( 0.05, 0.3, v );
		float kind = floor( fract( seed * 3.7 ) * 3.0 );
		vec3 c1 = kind == 0.0 ? ${ srgb( 0.9, 0.86, 0.78 ) } : ( kind == 1.0 ? ${ srgb( 0.72, 0.42, 0.2 ) } : ${ srgb( 0.85, 0.8, 0.7 ) } );
		vec3 c2 = kind == 0.0 ? ${ srgb( 0.12, 0.11, 0.1 ) } : ( kind == 1.0 ? ${ srgb( 0.35, 0.18, 0.08 ) } : ${ srgb( 0.55, 0.35, 0.22 ) } );
		float bands = kind == 0.0
			? ss( 0.3, 0.7, sin( u * ${ f( 6.2832 * 7 ) } + sin( v * 40.0 ) * 1.5 ) ) // zigzag
			: ss( 0.2, 0.8, sin( v * 31.0 + n * 2.0 ) );
		vec3 shellC = mix( c1, c2, bands * 0.8 ) * ( 1.0 - suture * 0.5 ) * ( n * 0.12 + 0.94 );
		float aperture = ss( 0.86, 0.93, v );
		vec3 body = mix( shellC, ${ srgb( 0.35, 0.12, 0.08 ) }, aperture );
		vec3 legs = mix( ${ srgb( 0.72, 0.28, 0.12 ) }, ${ srgb( 0.9, 0.78, 0.6 ) }, ss( 2.6, 3.0, u ) );
		vec3 claw = mix( ${ srgb( 0.42, 0.14, 0.4 ) }, ${ srgb( 0.85, 0.5, 0.2 ) }, ss( 2.5, 3.1, u ) );
		c = part == 0.0 ? body : ( part == 1.0 ? legs : ( part == 2.0 ? claw : ${ srgb( 0.1, 0.08, 0.06 ) } ) );
		critRough = part == 0.0 ? 0.45 : 0.5;

	} else {

		// burrow: dark shaft, damp dug-out sand around the lip, loose clumps fanned out; the
		// rim fades into the beach
		vec3 dry = ${ srgb( 0.86, 0.79, 0.64 ) } * ( n * 0.1 + 0.95 );
		vec3 damp = ${ srgb( 0.66, 0.58, 0.45 ) };
		float clumps = ss( 0.35, 0.55, wlNoise( P * 38.0 + seed * 5.0 ) );
		vec3 sand = mix( mix( damp, dry, ss( 0.4, 0.75, v ) ), dry * 1.06, clumps * 0.5 );
		float hole = ss( 0.36, 0.2, v );
		c = mix( sand, ${ srgb( 0.035, 0.03, 0.025 ) }, hole );
		critRough = 0.9;
		// screen-door fade at the outer edge (Salt Life: a static 4x4 Bayer pattern; Tidewater's
		// noise was resolved by its temporal filter)
		float fade = ss( 1.0, 0.72, v );
		ivec2 bp = ivec2( gl_FragCoord.xy ) & 3;
		int bi = bp.x + bp.y * 4;
		float bayer = float( ( bi == 0 ? 0 : bi == 1 ? 8 : bi == 2 ? 2 : bi == 3 ? 10 : bi == 4 ? 12 : bi == 5 ? 4 : bi == 6 ? 14 : bi == 7 ? 6 : bi == 8 ? 3 : bi == 9 ? 11 : bi == 10 ? 1 : bi == 11 ? 9 : bi == 12 ? 15 : bi == 13 ? 7 : bi == 14 ? 13 : 5 ) ) / 16.0 + 1.0 / 32.0;
		if ( bayer > fade ) discard;

	}

	diffuseColor.rgb = c;
`;
