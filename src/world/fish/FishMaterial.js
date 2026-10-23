import * as THREE from '../../engine/index.js';
import { G } from '../../core/Globals.js';
import { LOD_FADE_GLSL } from '../../materials/LODFade.js';
import { UNDERWATER_GLSL, underwaterUniforms } from '../../materials/Underwater.js';
import { SPECIES, SKIN, PATTERN } from './FishSpecies.js';
import { PART } from './FishGeometry.js';

// The swimming fish's material (Tidewater's WGSL, in GLSL on MeshStandardMaterial: Salt Life; the
// fish on the stall and the racks are village/FishProps.js).
//
// Everything is procedural: a per-species table of colours and anatomy landmarks (eye, gill cover,
// lateral line, jaw hinge) and the species' markings in the fragment stage. Body skin:
// counter-shading from the dark back to the pale belly, overlapping scales in rows (colour and
// relief, faded out when smaller than a pixel), the lateral line, the edge of the gill cover,
// silvery guanine reflection with an iridescent sheen. Fins: ray-striped membranes, darker and
// thinner toward the edge, lit through from behind. Eyes: pupil, iris with radial streaks and a
// glossy cornea. The vertex stage poses the model: a travelling swimming wave with pectoral
// sculling (rays undulate or flap, the turtle strokes).
//
// Port notes: the species table (25 species x 8 vec4) is a float texture (200 vec4 uniforms would
// pass WebGL's guaranteed limit); no motion vectors; the underwater shading is the shared one
// (materials/Underwater.js); translucency goes to the emissive term in the sun's colour; lite
// (low-powered devices): no scale rows, relief or sheen.
//
// The instances' records (KindBatch, 4 vec4: Fish.js): r0 = ( position, length ), r1 =
// orientation, r2 = ( wave phase, amplitude, turning bend, pattern + seed * 0.9 ), r3 unused.

const ROWS = 8; // vec4 rows per species in the table
const NAMES = Object.keys( PATTERN ).sort( ( a, b ) => PATTERN[ a ] - PATTERN[ b ] );

let _table = null;
// the species table: a ROWS x species RGBA float texture
export function skinTable() {

	if ( _table ) return _table;
	const data = new Float32Array( NAMES.length * ROWS * 4 );
	const lin = ( hex ) => new THREE.Color( hex );
	NAMES.forEach( ( name, s ) => {

		const S = SPECIES[ name ], K = SKIN[ name ];
		const b = lin( K.back ), f = lin( K.flank ), be = lin( K.belly ), fi = lin( K.fin ), e = lin( K.edge ), ir = lin( S.iris );
		const L = S.body;
		const rows = [
			// guanine reflection: a metal-like specular layer, kept moderate so that silvery fish stay
			// bright in the dim underwater environment lighting
			[ b.r, b.g, b.b, S.metal * 0.55 ],
			[ f.r, f.g, f.b, S.irid ],
			[ be.r, be.g, be.b, K.rough ],
			[ fi.r, fi.g, fi.b, S.mouth.tip ],
			[ e.r, e.g, e.b, S.scales ],
			[ ir.r, ir.g, ir.b, S.scaleVis ],
			[ 0.5 - S.eye.u * L, S.eye.y, S.eye.r, 0.5 - S.opercle * L ],
			[ S.lateral, S.arch, 0.5 - S.mouth.corner * L, S.mouth.y ],
		];
		rows.forEach( ( r, k ) => data.set( r, ( s * ROWS + k ) * 4 ) );

	} );
	const t = _table = new THREE.DataTexture( data, ROWS, NAMES.length, THREE.RGBAFormat, THREE.FloatType );
	t.minFilter = t.magFilter = THREE.NearestFilter;
	t.generateMipmaps = false;
	t.needsUpdate = true;
	return t;

}

const f = ( x ) => {

	const s = String( x );
	return s.includes( '.' ) || s.includes( 'e' ) ? s : s + '.0';

};
const PT = ( name ) => f( PATTERN[ name ] );
const PA = ( name ) => f( PART[ name ] );

const FISH_GLSL = /* glsl */`
uniform highp sampler2D fishSkin;
vec3 fishRotateQ( vec4 q, vec3 v ) { return v + cross( q.xyz, cross( q.xyz, v ) + v * q.w ) * 2.0; }
vec4 fishRow( float pattern, int k ) { return texelFetch( fishSkin, ivec2( k, clamp( int( pattern ), 0, ${ NAMES.length - 1 } ) ), 0 ); }
float fishPartOf( vec4 d ) { return floor( d.y + 0.01 ); }
float fishHash( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
// value noise 2D (cheap, for blotches and skin variation)
float fishVnoise( vec2 p ) {
	vec2 i = floor( p ); vec2 fr = fract( p );
	vec2 w = fr * fr * ( 3.0 - fr * 2.0 );
	float a = fishHash( i ); float b = fishHash( i + vec2( 1.0, 0.0 ) ); float c = fishHash( i + vec2( 0.0, 1.0 ) ); float d = fishHash( i + vec2( 1.0, 1.0 ) );
	return mix( mix( a, b, w.x ), mix( c, d, w.x ), w.y );
}
float fishSs( float a, float b, float x ) { float t = clamp( ( x - a ) / ( b - a ), 0.0, 1.0 ); return t * t * ( 3.0 - 2.0 * t ); }
// posterior edge of the gill cover (local z) at height fraction h: convex backward, sweeping forward
// under the throat
float fishOpercleEdge( float zOp, float h ) { return zOp - 0.028 * ( 1.0 - h * h ) + fishSs( -0.35, -1.0, h ) * 0.07; }
float fishOpercleMask( float h ) { return fishSs( -0.98, -0.9, h ) * ( 1.0 - fishSs( 0.45, 0.62, h ) ); }
float fishBand( float x, float center, float width, float soft ) { return 1.0 - fishSs( width, width + soft, abs( x - center ) ); }
`;

// the swimming wave: fish: travelling body wave (amplitude grows toward the tail) plus the turning
// bend, sculling pectorals; rays: the disc margins undulate (stingray) or flap (eagle ray); turtle:
// the front flippers stroke, the hind ones paddle
const SWIM_GLSL = /* glsl */`
vec3 fishSwimOffset( float ph, vec4 d, vec3 p, float env, float amp, float bend, bool eagle ) {
	float u = d.x;
	float part = fishPartOf( d );
	bool isDisc = part == ${ PA( 'DISC' ) };
	bool isFlip = part == ${ PA( 'FLIPPER' ) };
	bool turtle = part > ${ f( PART.WHIP + 0.5 ) };
	float side = d.z; // rays: distance from the midline; flippers: along the flipper
	float lat = sin( ph - u * 5.6 ) * env * amp + bend;
	float flap = part == ${ PA( 'PECTORAL' ) } ? sin( ph * 0.7 + 1.3 ) * d.z * 0.035 : 0.0;
	vec3 fish = vec3( lat + flap * sign( p.x ), 0.0, 0.0 );
	float k = eagle ? 1.2 : 8.0;
	vec3 disc = vec3( 0.0, sin( ph - u * k ) * pow( side, 1.6 ) * amp, 0.0 );
	bool front = d.w < 1.5;
	vec3 stroke = vec3( 0.0, sin( ph ) * ( front ? 0.3 : 0.07 ), cos( ph ) * ( front ? 0.14 : 0.0 ) ) * side;
	return isDisc ? disc : ( isFlip ? stroke : ( turtle ? vec3( 0.0 ) : fish ) );
}
attribute vec2 aInst;
attribute vec4 aData;
varying vec3 vFishLocal; // rest pose position (model units)
varying vec4 vFishData; // aData
flat varying vec4 vFishInfo; // pattern, seed, length (m)
flat varying float vFishFade; // KindBatch's fade code
varying vec3 vFishP; // world position
varying vec3 vFishN; // world normal
void fishPose( out vec3 world, out vec3 nrm ) {
	int ri = int( aInst.x + 0.5 );
	vec4 r0 = fishRecordsAt( ri, 0 ); vec4 q = fishRecordsAt( ri, 1 ); vec4 r2 = fishRecordsAt( ri, 2 );
	vec4 d = aData;
	float u = d.x;
	vec3 p = position;
	vFishLocal = p;
	vFishData = d;
	vFishInfo = vec4( floor( r2.w ), fract( r2.w ), r0.w, 0.0 );
	vFishFade = aInst.y;
	float pattern = floor( r2.w );
	float env = ( u * u * 0.85 + 0.08 ) * ( fishSs( 0.0, 0.25, u ) * 0.7 + 0.3 );
	float bend = r2.z * ( u * u );
	bool eagle = pattern == ${ PT( 'eagleRay' ) };
	p += fishSwimOffset( r2.x, d, p, env, r2.y, bend, eagle );
	nrm = fishRotateQ( q, normal );
	world = fishRotateQ( q, p * r0.w ) + r0.xyz;
	vFishP = world;
	vFishN = nrm;
}
`;

// eye colour: pupil, iris with radial streaks, dark rim
const FRAG_GLSL = /* glsl */`
uniform vec3 fishSunColor;
varying vec3 vFishLocal;
varying vec4 vFishData;
flat varying vec4 vFishInfo;
flat varying float vFishFade;
varying vec3 vFishP;
varying vec3 vFishN;
vec3 fishEyeCol( float r, float ang, vec3 irisC, float cloudy ) {
	float streak = sin( ang * 26.0 ) * 0.5 + 0.5;
	float irisL = dot( irisC, vec3( 0.3, 0.59, 0.11 ) );
	vec3 iris = irisC * min( 1.0, 0.36 / max( irisL, 1e-3 ) ) * mix( 0.6, 1.05, streak ) * ( fishSs( 0.55, 0.72, r ) * 0.45 + 0.5 );
	float ring = fishSs( 0.8, 0.97, r );
	vec3 e = mix( iris, vec3( 0.025, 0.025, 0.028 ), ring );
	e = mix( e, vec3( 0.004, 0.005, 0.007 ), 1.0 - fishSs( 0.5, 0.56, r ) );
	e = mix( e, vec3( 0.42, 0.44, 0.46 ), cloudy * 0.55 * ( 1.0 - fishSs( 0.7, 1.0, r ) ) );
	return e;
}
// a world-space normal perturbed by a height field's screen-space derivatives (Mikkelsen)
vec3 fishBump( vec3 P, vec3 N, float dhdx, float dhdy ) {
	vec3 dpx = dFdx( P ); vec3 dpy = dFdy( P );
	vec3 r1 = cross( dpy, N ); vec3 r2 = cross( N, dpx );
	float det = dot( dpx, r1 );
	vec3 grad = sign( det ) * ( dhdx * r1 + dhdy * r2 );
	// (Salt Life: a collapsed footprint gives a zero vector; normalize() would make it NaN)
	vec3 b = abs( det ) * N - grad;
	float b2 = dot( b, b );
	return b2 > 1e-30 ? b * inversesqrt( b2 ) : N;
}
`;

// shared by colour and relief (scales), then the relief (bump height, m)
const COMMON = /* glsl */`
	if ( vFishFade < 1.0 ) { if ( ! lodFadeVisible( gl_FragCoord.xy, vFishFade, false ) ) discard; }
	else if ( vFishFade >= 2.0 ) { if ( ! lodFadeVisible( gl_FragCoord.xy, vFishFade - 2.0, true ) ) discard; }
	vec4 D = vFishData; vec3 Lp = vFishLocal; vec4 I = vFishInfo;
	vec3 fN = normalize( vFishN ) * faceDirection;
	float pattern = floor( I.x + 0.5 );
	float part = fishPartOf( D );
	float scaleSize = fishRow( pattern, 4 ).w; float scaleVis = fishRow( pattern, 5 ).w;
	vec3 Pv = ( viewMatrix * vec4( vFishP, 1.0 ) ).xyz;
	float px = length( fwidth( Pv ) );
#ifdef FISH_LITE
	float sf = 0.0, sa = 0.0, sb = 0.0, sfade = 0.0, sline = 0.0;
	float bumpH = 0.0;
#else
	// scale rows: posterior margins are arcs, rows offset by half a scale
	float sss = max( scaleSize, 0.004 );
	// gentle waviness of the scale rows (in scale units: big scales stay in orderly rows)
	float warp = ( sin( Lp.z * 23.0 + D.z * 31.0 ) * 0.35 + sin( Lp.z * 41.0 - D.z * 17.0 ) * 0.25 ) * mix( 1.0, 0.3, fishSs( 0.015, 0.045, scaleSize ) );
	float sa = ( 0.5 - Lp.z ) / sss + warp; float sb = D.z / ( sss * 0.8 ) + warp * 0.6;
	float rowI = floor( sb );
	float fb = fract( sb ) * 2.0 - 1.0;
	float sf = fract( sa + rowI * 0.5 + fb * fb * 0.32 );
	// pixel footprint (m) against the scale size (m): fade out sub-pixel detail
	// (Salt Life: from 10 px a scale, gone under 3.5 px: smaller scales only shimmered)
	float sfade = ( 1.0 - fishSs( 0.1, 0.28, px / ( sss * I.z ) ) ) * ( scaleSize > 0.001 ? 1.0 : 0.0 );
	// the thin lines at the scales' margins need a scale ~20 px across (gone under ~7 px)
	float sline = 1.0 - fishSs( 0.05, 0.15, fwidth( sa ) );

	// ---- relief
	float bumpH = 0.0;
	{
		bool isBodyR = part == ${ PA( 'BODY' ) };
		float L = I.z;
		// scales: each rises toward its free posterior margin
		// (Salt Life: the drop at the margin over a fifth of the scale at most: steeper, it glinted in
		// rows of single pixels)
		float sc = fishSs( 0.0, 0.8, sf ) * ( 1.0 - fishSs( mix( 0.55, 0.8, sline ), 1.0, sf ) ) * sfade * scaleVis;
		// gill cover: raised in front of its edge
		vec4 eyeOp = fishRow( pattern, 6 );
		float hh = D.w;
		float zE = fishOpercleEdge( eyeOp.w, hh );
		float onOpR = fishOpercleMask( hh );
		float op = fishSs( -0.004, 0.004, Lp.z - zE ) * onOpR;
		float grainFade = 1.0 - fishSs( 0.15, 0.45, px / ( 0.004 * I.z ) );
		float grain = ( fishVnoise( vec2( Lp.z, D.z ) * 420.0 ) - 0.5 ) * 0.00022 * grainFade;
		float bodyH = sc * 0.0016 + op * 0.0025 + grain;
		// fin rays: ridges
		bool isFinR = part > 0.5 && part < 7.5;
		float rd = abs( fract( D.w + 0.5 ) - 0.5 );
		float ray = ( 1.0 - fishSs( 0.0, 0.25, rd ) ) * 0.0004;
		bumpH = ( isBodyR ? bodyH : ( isFinR ? ray : 0.0 ) ) * L;
	}
#endif
	float dhdx = dFdx( bumpH ); float dhdy = dFdy( bumpH );
`;

const SURFACE = /* glsl */`
	${ COMMON }
	float rough = 0.4;
	float metal = 0.0;
	float transl = 0.0;
	float seed = I.y; float L = I.z;
	float pat = pattern;
	float P = part;
	float u = D.x; float h = D.w; float sd = D.z;
	float z = Lp.z; float y = Lp.y;
	float t = D.z; float w = D.w; // fins: along / across the rays
	bool isBody = P == ${ PA( 'BODY' ) };
	bool isFin = P > 0.5 && P < 7.5;
	float bodyK = isBody ? 1.0 : 0.0;
	vec4 r0 = fishRow( pat, 0 ); vec4 r1 = fishRow( pat, 1 ); vec4 r2 = fishRow( pat, 2 ); vec4 r3 = fishRow( pat, 3 );
	vec4 r4 = fishRow( pat, 4 ); vec4 r5 = fishRow( pat, 5 ); vec4 r6 = fishRow( pat, 6 ); vec4 r7 = fishRow( pat, 7 );
	vec3 back = r0.xyz; vec3 flank = r1.xyz; vec3 belly = r2.xyz;
	vec3 finC = r3.xyz; vec3 edgeC = r4.xyz; vec3 irisC = r5.xyz;
	vec4 eye = r6; vec4 lat = r7;
	vec4 flags = vec4( 0.0 );
	float n1 = fishVnoise( vec2( z, y ) * 38.0 + seed * 17.0 );
	float n2 = fishVnoise( vec2( z, sd ) * 11.0 + seed * 5.0 );
	float fwW = fwidth( w ); float fwH = fwidth( h );

	// ---- counter-shading
	float tBack = fishSs( 0.2, 0.75, h );
	float tBelly = 1.0 - fishSs( -0.7, -0.1, h );
	vec3 c = mix( mix( flank, back, tBack ), belly, tBelly );
	float silver = 1.0 - tBack * 0.75; // guanine reflection weight
	metal = r0.w * silver * bodyK;
	rough = r2.w;
	// scales: a thin shadow line under each free margin, the exposed field slightly brighter toward
	// the margin
	float scaleShade = fishSs( 0.3, 0.9, sf ) * sfade * scaleVis;
	float pocket = fishSs( 0.88, 0.97, sf ) * ( 1.0 - fishSs( 0.97, 1.0, sf ) ) * sfade * sline * scaleVis;
	float cellK = ( fishHash( vec2( floor( sa + floor( sb ) * 0.5 ), floor( sb ) ) ) - 0.5 ) * 0.06 * sfade * scaleVis;
	// (on silvery skin the pocket is a thin line: the mirror-like scale reflects its own light)
	c *= mix( 1.0, 0.96 + scaleShade * 0.07 - pocket * mix( 0.14, 0.06, r0.w ) + cellK, bodyK );
	// (Salt Life) where the scales are too small to draw one by one, their net: the brick lattice's
	// first harmonics (peaks at the scales' middles, troughs along their margins), band-limited, so it
	// holds to ~3 px a scale without shimmering
	#ifndef FISH_LITE
	float netF = max( fwidth( sa ), fwidth( sb ) );
	float net = ( cos( 6.2832 * ( sa - sb * 0.5 ) ) + cos( 6.2832 * ( sa + sb * 0.5 ) ) + cos( 6.2832 * sb ) + 1.5 ) / 4.5;
	float netK = ( 1.0 - fishSs( 0.2, 0.45, netF ) ) * ( 1.0 - sfade ) * scaleVis * bodyK * ( scaleSize > 0.001 ? 1.0 : 0.0 );
	c *= 1.0 + ( net - 0.6 ) * mix( 0.22, 0.1, r0.w ) * netK;
	rough *= 1.0 - ( net - 0.6 ) * 0.25 * netK;
	#endif
	c *= mix( 1.0, n1 * 0.14 + 0.93, bodyK );
	c *= mix( 1.0, n2 * 0.2 + 0.9, bodyK );
	rough = mix( rough, rough * mix( 0.8, 1.25, n2 ), bodyK );

	// ---- fins: ray-striped membranes, darker and thinner toward the edge
	if ( isFin && P != ${ PA( 'FINLET' ) } ) {
		vec3 fin = mix( finC, edgeC, fishSs( 0.4, 1.0, t ) );
		float rd = abs( fract( w + 0.5 ) - 0.5 );
		float rayW = P == ${ PA( 'DORSAL1' ) } ? 0.1 : 0.06;
		float ray = ( 1.0 - fishSs( rayW, fwW * 1.2 + rayW + 0.04, rd ) ) * ( 1.0 - fishSs( 0.2, 0.6, fwW ) );
		fin *= mix( 0.9, 1.06, ray );
		// thicker and darker where the fin joins the body, thinnest at the edge
		fin *= fishSs( 0.0, 0.15, t ) * 0.2 + 0.8;
		c = fin;
		transl = mix( 0.8, 0.55, ray ) * ( fishSs( 0.0, 0.3, t ) * 0.4 + 0.6 );
		// paired fins: the fin colour, a little lighter toward the edge (thin membrane)
		bool paired = P == ${ PA( 'PECTORAL' ) } || P == ${ PA( 'PELVIC' ) };
		c = paired ? c * mix( 0.85, 1.1, fishSs( 0.2, 1.0, t ) ) : c;
		transl *= paired ? 0.45 : 1.0;
		rough = 0.4;
	}

	// ---- species markings (body; some on fins)
	if ( pat == ${ PT( 'silverside' ) } ) {
		// silver lateral band with a dark upper edge; translucent green back
		float bandK = fishBand( h, 0.02, 0.1, fwH + 0.05 ) * bodyK;
		c = mix( c, vec3( 0.78, 0.82, 0.84 ), bandK * 0.8 );
		c = mix( c, vec3( 0.12, 0.2, 0.2 ), fishBand( h, 0.14, 0.015, fwH + 0.02 ) * bodyK * 0.6 );
		metal += bandK * 0.25;
	} else if ( pat == ${ PT( 'chromis' ) } ) {
		// dark margins on the tail lobes, azure line from the snout through the eye
		float lobe = P == ${ PA( 'CAUDAL' ) } ? fishSs( 5.5, 7.5, abs( w - 8.0 ) ) : 0.0;
		c = mix( c, vec3( 0.01, 0.015, 0.03 ), lobe );
		float lineK = fishBand( y - ( z - eye.x ) * 0.35, eye.y + 0.015, 0.004, 0.003 ) * fishSs( eye.x - 0.02, eye.x + 0.05, z ) * bodyK;
		c = mix( c, vec3( 0.3, 0.6, 0.95 ), lineK * 0.7 );
	} else if ( pat == ${ PT( 'grunt' ) } ) {
		// French grunt: yellow with oblique blue-silver stripes (straight above the lateral line);
		// bluestriped grunt: straight blue stripes. Red mouth.
		bool blue = fract( seed * 3.7 ) < 0.4;
		float above = fishSs( 0.35, 0.45, h );
		float slope = blue ? 0.0 : mix( 0.45, 0.0, above );
		float sv = sin( ( y - z * slope ) * ( blue ? 190.0 : 150.0 ) );
		float stripe = fishSs( 0.45, 0.8, sv ) * bodyK * ( 1.0 - tBelly * 0.7 );
		vec3 lineC = blue ? vec3( 0.12, 0.26, 0.55 ) : vec3( 0.52, 0.6, 0.7 );
		c = mix( c, lineC, stripe * ( blue ? 0.9 : 0.7 ) );
	} else if ( pat == ${ PT( 'yellowtail' ) } ) {
		// yellow stripe from the snout widening into the yellow tail; yellow spots on the back
		float wS = mix( 0.006, 0.035, fishSs( 0.1, -0.25, z ) );
		float stripe = fishBand( y - 0.004, 0.0, wS, 0.004 ) * bodyK;
		vec2 qq = vec2( z, y ) * 70.0;
		vec2 cell = floor( qq );
		vec2 j = ( vec2( fishHash( cell + 3.1 ), fishHash( cell + 7.7 ) ) - 0.5 ) * 0.5;
		float rr = fishHash( cell + 1.3 ) * 0.14 + 0.1;
		float spots = ( 1.0 - fishSs( rr, rr + 0.12, length( fract( qq ) - 0.5 - j ) ) ) * step( 0.4, fishHash( cell + seed ) ) * tBack * bodyK;
		c = mix( c, vec3( 0.85, 0.62, 0.05 ), max( stripe, spots * 0.8 ) );
		c = mix( c, vec3( 0.86, 0.66, 0.06 ), P == ${ PA( 'CAUDAL' ) } ? 1.0 : 0.0 );
	} else if ( pat == ${ PT( 'tang' ) } ) {
		// fine dark wavy lines, pale scalpel at the tail base
		float lines = fishSs( 0.75, 0.95, sin( y * 170.0 + z * 30.0 + n1 * 3.0 ) ) * 0.3 * bodyK;
		c *= 1.0 - lines;
		float spine = ( 1.0 - fishSs( 0.01, 0.02, length( vec2( z + 0.27, y * 1.5 ) ) ) ) * bodyK;
		c = mix( c, vec3( 0.85, 0.8, 0.55 ), spine );
		c = mix( c, edgeC, isFin ? fishSs( 0.8, 1.0, t ) : 0.0 );
	} else if ( pat == ${ PT( 'sergeant' ) } ) {
		// five black bars from behind the head to the tail stalk (a faint sixth on the peduncle), a
		// dark spot at the base of the pectoral fin
		float barsP = fishSs( 0.45, 0.7, sin( ( z - 0.215 ) * 52.0 + 1.57 ) ) * fishSs( -0.29, -0.24, z ) * ( 1.0 - fishSs( 0.225, 0.26, z ) );
		float sixth = fishBand( z, -0.33, 0.012, 0.01 ) * 0.4;
		float bars = max( barsP, sixth ) * ( 1.0 - tBelly * 0.8 );
		c = mix( c, vec3( 0.02, 0.02, 0.03 ), bars * ( isBody ? 0.92 : ( isFin ? 0.4 : 0.0 ) ) );
		float pecSpot = ( 1.0 - fishSs( 0.012, 0.02, length( vec2( z - eye.w + 0.03, y + 0.005 ) ) ) ) * bodyK;
		c = mix( c, vec3( 0.03, 0.035, 0.05 ), pecSpot * 0.8 );
	} else if ( pat == ${ PT( 'wrasse' ) } ) {
		// bluehead wrasse: yellow initial phase with a dark midlateral stripe; blue-headed males
		bool male = fract( seed * 7.1 ) < 0.15;
		float stripe = fishBand( h, 0.05, 0.1, fwH + 0.04 ) * bodyK * fishSs( 0.25, 0.1, z );
		vec3 female = mix( c, vec3( 0.04, 0.04, 0.03 ), stripe * 0.9 );
		float head = fishSs( 0.12, 0.17, z );
		float collar = fishBand( z, 0.13, 0.012, 0.006 );
		vec3 maleC = mix( mix( vec3( 0.1, 0.42, 0.28 ), vec3( 0.05, 0.14, 0.62 ), head ), vec3( 0.02, 0.02, 0.02 ), collar * bodyK );
		c = male ? maleC : female;
	} else if ( pat == ${ PT( 'parrot' ) } ) {
		// stoplight (terminal phase: green, pink / orange marks, yellow spot on the gill cover) or
		// queen parrotfish (blue-green, orange-pink marks around the mouth)
		bool queen = fract( seed * 4.3 ) < 0.4;
		vec3 base = queen ? vec3( 0.06, 0.34, 0.42 ) : vec3( 0.1, 0.42, 0.26 );
		c = mix( c, base * mix( 0.8, 1.1, scaleShade ), bodyK * 0.75 );
		float mark = fishBand( y - ( z - 0.3 ) * 0.4, -0.03, 0.008, 0.008 ) * fishSs( 0.18, 0.35, z ) * bodyK;
		c = mix( c, queen ? vec3( 0.75, 0.42, 0.28 ) : vec3( 0.85, 0.45, 0.32 ), mark );
		float spot = ( 1.0 - fishSs( 0.01, 0.02, length( vec2( z - eye.w - 0.02, y - 0.05 ) ) ) ) * bodyK;
		c = mix( c, vec3( 0.88, 0.72, 0.12 ), spot * ( queen ? 0.0 : 1.0 ) );
	} else if ( pat == ${ PT( 'angel' ) } ) {
		// French angelfish: black, yellow rims on the scales, yellow face and eye ring
		float rims = fishSs( 0.72, 0.95, sf ) * max( sfade, 0.35 ) * bodyK;
		c = mix( c, vec3( 0.62, 0.48, 0.06 ), rims * 0.6 );
		float face = fishSs( 0.4, 0.43, z ) * bodyK;
		c = mix( c, vec3( 0.55, 0.45, 0.2 ), face * 0.6 );
		float er0 = length( vec2( z - eye.x, y - eye.y ) ) / eye.z;
		float ringA = fishSs( 1.05, 1.2, er0 ) * ( 1.0 - fishSs( 1.45, 1.65, er0 ) ) * bodyK;
		c = mix( c, vec3( 0.7, 0.52, 0.06 ), ringA * 0.85 );
	} else if ( pat == ${ PT( 'barracuda' ) } ) {
		// dark oblique bars on the upper flank, black blotches on the lower rear flank
		float bars = fishSs( 0.35, 0.8, sin( z * 58.0 + h * 1.5 + n1 ) ) * fishSs( 0.2, 0.55, h ) * bodyK;
		c *= 1.0 - bars * 0.45;
		float bl = fishSs( 0.6, 0.78, n2 ) * fishSs( 0.1, -0.25, z ) * ( 1.0 - fishSs( -0.3, 0.2, h ) ) * bodyK;
		c = mix( c, vec3( 0.03, 0.03, 0.035 ), bl * 0.9 );
		c = mix( c, vec3( 0.75, 0.78, 0.8 ), P == ${ PA( 'CAUDAL' ) } ? fishSs( 0.85, 1.0, t ) * fishSs( 5.0, 7.0, abs( w - 8.0 ) ) : 0.0 );
	} else if ( pat == ${ PT( 'redSnapper' ) } ) {
		// rose red back fading to a silvery pink belly; rows of scales show as fine oblique lines
		// (Salt Life: only where the scales are too small to draw)
		float rows = fishSs( 0.6, 0.95, sin( y * 210.0 + z * 120.0 ) ) * ( 1.0 - sfade ) * bodyK * 0.1;
		c *= 1.0 - rows;
	} else if ( pat == ${ PT( 'grouper' ) } ) {
		// Nassau grouper: dark brown bars, a band from the snout through the eye, a black saddle on
		// the tail stalk, dark spots around the eye
		float zz = 0.5 - z;
		float wob = ( n2 - 0.5 ) * 0.03;
		float bars = fishSs( 0.2, 0.6, sin( ( zz + wob ) * 34.0 - 1.2 ) ) * fishSs( 0.3, 0.38, zz ) * fishSs( 0.86, 0.78, zz ) * ( 1.0 - tBelly * 0.85 );
		float stripe = fishBand( y - eye.y - ( z - eye.x ) * 0.25, 0.0, 0.008, 0.006 ) * fishSs( eye.x - 0.08, eye.x, z ) * fishSs( 0.5, 0.45, z );
		float saddle = fishSs( 0.4, 0.7, h ) * fishBand( zz, 0.8, 0.025, 0.01 );
		float spots = fishSs( 0.72, 0.85, fishVnoise( vec2( z, y ) * 160.0 + seed * 3.0 ) ) * fishSs( eye.x - 0.12, eye.x, z );
		float dark = max( max( bars * 0.85, stripe * 0.85 ), max( saddle, spots * 0.7 ) ) * bodyK;
		c = mix( c, vec3( 0.13, 0.085, 0.05 ), dark );
		float pale = fishSs( 0.86, 0.93, fishVnoise( vec2( z, y ) * 150.0 + 9.0 ) ) * bodyK * 0.2;
		c = mix( c, vec3( 0.85, 0.8, 0.72 ), pale );
	} else if ( pat == ${ PT( 'tuna' ) } ) {
		// blackfin tuna: sharp dark back, bronze band, pale bars on the belly, dusky yellow finlets
		float bronze = fishBand( h, 0.28, 0.05, fwH + 0.06 ) * fishSs( 0.3, 0.2, z ) * bodyK;
		c = mix( c, vec3( 0.42, 0.34, 0.14 ), bronze * 0.6 );
		c = mix( c, back, fishSs( 0.28, 0.4, h ) * bodyK );
		float bars = fishSs( 0.6, 0.9, sin( z * 95.0 ) ) * fishSs( 0.0, -0.3, h ) * fishSs( 0.2, 0.1, z ) * bodyK;
		c = mix( c, vec3( 0.85, 0.88, 0.9 ), bars * 0.35 );
		c = mix( c, vec3( 0.55, 0.48, 0.16 ), P == ${ PA( 'FINLET' ) } ? 0.85 : 0.0 );
	} else if ( pat == ${ PT( 'mahi' ) } ) {
		// mahi-mahi: blue-green back, golden flanks with scattered blue spots
		vec2 cell = floor( vec2( z, y ) * 55.0 );
		vec2 jit = vec2( fishHash( cell + 3.1 ), fishHash( cell + 7.7 ) ) - 0.5;
		vec2 fc = fract( vec2( z, y ) * 55.0 ) - 0.5 - jit * 0.55;
		float rs = mix( 0.1, 0.24, fishHash( cell + 1.3 ) );
		float spots = ( 1.0 - fishSs( rs * 0.75, rs * 0.75 + 0.14, length( fc * vec2( 1.0, 1.25 ) ) ) ) * step( 0.45, fishHash( cell + seed * 7.0 ) ) * bodyK * ( 1.0 - tBelly );
		c = mix( c, vec3( 0.04, 0.1, 0.24 ), spots * 0.7 );
		c = mix( c, vec3( 0.2, 0.5, 0.3 ), fishSs( 0.0, 0.5, h ) * bodyK * 0.35 );
		// (Salt Life) the long dorsal and the anal fin deep blue, the paired fins pale yellow, the tail
		// yellow-green to its blue edge
		bool pairedM = P == ${ PA( 'PECTORAL' ) } || P == ${ PA( 'PELVIC' ) };
		c = ( P == ${ PA( 'DORSAL1' ) } || P == ${ PA( 'ANAL' ) } ) ? c * 0.6 : c;
		c = pairedM ? mix( flank * 0.85, c, 0.25 ) : c;
		c = P == ${ PA( 'CAUDAL' ) } ? mix( mix( flank, back, 0.4 ) * 0.8, edgeC, fishSs( 0.45, 1.0, t ) ) : c;
	} else if ( pat == ${ PT( 'mullet' ) } ) {
		// faint dark stripes along the scale rows of the upper flank
		float lines = fishSs( 0.7, 0.95, sin( sd * 280.0 ) ) * fishSs( -0.1, 0.3, h ) * bodyK * 0.25;
		c *= 1.0 - lines;
	} else if ( pat == ${ PT( 'needlefish' ) } ) {
		// dark blue lateral stripe, dark beak
		float stripe = fishBand( h, 0.0, 0.06, fwH + 0.05 ) * bodyK;
		c = mix( c, vec3( 0.12, 0.25, 0.45 ), stripe * 0.6 );
		c = mix( c, vec3( 0.12, 0.16, 0.16 ), fishSs( 0.32, 0.36, z ) * bodyK * 0.7 );
	} else if ( pat == ${ PT( 'jack' ) } ) {
		// (Salt Life) crevalle jack: a brassy green back over silvery gold; a black spot at the top corner
		// of the gill cover and a black blotch at the base of the pectoral fin; a dark ridge of scutes
		// along the tail stalk; the anal fin and the lower tail lobe yellow
		float opSpot = ( 1.0 - fishSs( 0.011, 0.019, length( vec2( ( z - eye.w - 0.006 ) * 1.3, y - eye.y - 0.004 ) ) ) ) * bodyK;
		vec2 pc = vec2( z - ${ f( 0.5 - 0.3 * SPECIES.jack.body ) }, y + 0.012 );
		float pecB = ( 1.0 - fishSs( 0.008, 0.015, length( pc * vec2( 1.0, 1.4 ) ) ) ) * bodyK;
		float stalk = fishSs( ${ f( 0.5 - 0.72 * SPECIES.jack.body ) }, ${ f( 0.5 - 0.8 * SPECIES.jack.body ) }, z );
		float scutes = fishBand( h, 0.0, 0.1, fwH + 0.05 ) * stalk * bodyK;
		c = mix( c, vec3( 0.75, 0.62, 0.16 ), fishSs( -0.15, -0.65, h ) * bodyK * 0.3 );
		c = mix( c, vec3( 0.22, 0.2, 0.1 ), scutes * 0.6 );
		c = mix( c, vec3( 0.015, 0.015, 0.02 ), max( opSpot * 0.95, pecB * 0.8 ) );
		bool yellowFin = P == ${ PA( 'ANAL' ) } || ( P == ${ PA( 'CAUDAL' ) } && w < 7.5 );
		c = yellowFin ? mix( c, vec3( 0.78, 0.6, 0.1 ), 0.65 ) : c;
	} else if ( pat == ${ PT( 'tarpon' ) } ) {
		// huge scales with dark edges
		float rims = fishSs( 0.8, 0.97, sf ) * sfade * bodyK;
		c *= 1.0 - rims * 0.35;
	} else if ( pat == ${ PT( 'hogfish' ) } ) {
		// (Salt Life) hogfish: mottled pinkish tan, a black spot at the rear base of the soft dorsal fin;
		// a big male's snout and brow dark maroon back to the first dorsal spines
		bool male = fract( seed * 5.3 ) < 0.3;
		float mott = fishSs( 0.45, 0.85, fishVnoise( vec2( z, y ) * 55.0 + seed * 7.0 ) ) * bodyK;
		c = mix( c, c * vec3( 0.68, 0.5, 0.46 ), mott * 0.7 );
		float spot = 1.0 - fishSs( 0.014, 0.022, length( vec2( z - ${ f( 0.5 - 0.82 * SPECIES.hogfish.body ) }, y - 0.088 ) ) );
		c = mix( c, vec3( 0.02, 0.015, 0.015 ), spot * ( isBody || P == ${ PA( 'DORSAL2' ) } ? 0.92 : 0.0 ) );
		// (back over the brow to the first spines; on the cheek only ahead of the eye)
		float face = fishSs( ${ f( 0.5 - 0.31 * SPECIES.hogfish.body ) }, ${ f( 0.5 - 0.26 * SPECIES.hogfish.body ) }, z + max( h, 0.0 ) * 0.03 ) * fishSs( -0.45, -0.1, h + ( z - eye.x ) * 4.0 ) * bodyK;
		c = mix( c, vec3( 0.12, 0.035, 0.035 ), face * ( male ? 0.85 : 0.0 ) );
		c = ( isFin && P != ${ PA( 'PECTORAL' ) } ) ? mix( c, edgeC * 0.8, fishSs( 0.75, 1.0, t ) * 0.6 ) : c;
	} else if ( pat == ${ PT( 'blackGrouper' ) } ) {
		// black grouper: dark rectangular blotches in offset rows on olive grey, brassy hexagonal spots
		// over the head and the lower flank; the soft dorsal, the anal fin and the tail edged black (the
		// tail with a thin white rim), the pectorals edged orange
		vec2 q = vec2( ( 0.5 - z ) * 15.0, h * 2.2 + 3.0 );
		float row = floor( q.y );
		float qx = q.x + row * 0.5;
		vec2 fr = vec2( fract( qx ), fract( q.y ) ) - 0.5;
		vec2 cellG = vec2( floor( qx ), row ) + seed * 3.0;
		vec2 ext = vec2( 0.24, 0.26 ) + vec2( fishHash( cellG + 4.1 ), fishHash( cellG + 8.3 ) ) * 0.14;
		float rect = ( 1.0 - fishSs( 0.0, 0.08, max( abs( fr.x ) - ext.x, abs( fr.y ) - ext.y ) + ( n1 - 0.5 ) * 0.05 ) ) * step( 0.18, fishHash( cellG ) );
		float blot = rect * fishSs( eye.w + 0.01, eye.w - 0.03, z ) * ( 1.0 - tBelly * 0.85 ) * bodyK;
		c = mix( c, vec3( 0.045, 0.045, 0.035 ), blot * 0.75 );
		vec2 qs = vec2( z, y ) * 150.0;
		vec2 fs = fract( qs + vec2( 0.0, floor( qs.x ) * 0.5 ) ) - 0.5;
		float hex = ( 1.0 - fishSs( 0.22, 0.34, max( abs( fs.x ) * 1.15 + abs( fs.y ) * 0.58, abs( fs.y ) * 1.15 ) ) );
		float brassK = max( fishSs( eye.w - 0.04, eye.w + 0.02, z ), fishSs( -0.1, -0.5, h ) ) * bodyK;
		c = mix( c, vec3( 0.42, 0.3, 0.1 ), hex * brassK * 0.45 );
		bool edged = P == ${ PA( 'DORSAL2' ) } || P == ${ PA( 'ANAL' ) } || P == ${ PA( 'CAUDAL' ) };
		c = edged ? mix( c, vec3( 0.012 ), fishSs( 0.74, 0.86, t ) ) : c;
		c = P == ${ PA( 'CAUDAL' ) } ? mix( c, vec3( 0.75, 0.75, 0.72 ), fishSs( 0.95, 1.0, t ) ) : c;
		c = P == ${ PA( 'PECTORAL' ) } ? mix( c, vec3( 0.75, 0.32, 0.06 ), fishSs( 0.7, 0.95, t ) * 0.85 ) : c;
	} else if ( pat == ${ PT( 'muttonSnapper' ) } ) {
		// mutton snapper: olive green above, pink to red below; a small black spot above the lateral
		// line under the front of the soft dorsal fin; two bright blue lines on the cheek under the eye;
		// red-orange pelvic and anal fins, the tail dusky red with a dark margin
		c = mix( c, vec3( 0.6, 0.2, 0.13 ), fishSs( 0.05, -0.55, h ) * ( 1.0 - fishSs( -0.6, -0.9, h ) ) * bodyK * 0.35 );
		float spot = ( 1.0 - fishSs( 0.011, 0.017, length( vec2( z - ${ f( 0.5 - 0.62 * SPECIES.muttonSnapper.body ) }, y - 0.074 ) ) ) ) * bodyK;
		c = mix( c, vec3( 0.02, 0.02, 0.025 ), spot * 0.9 );
		float cheek = fishSs( eye.w, eye.w + 0.02, z ) * fishSs( 0.48, 0.44, z ) * bodyK;
		float l1 = fishBand( y - eye.y + eye.z * 1.7 + ( z - eye.x ) * 0.32, 0.0, 0.0022, 0.0018 );
		float l2 = fishBand( y - eye.y + eye.z * 2.7 + ( z - eye.x ) * 0.32, 0.0, 0.0018, 0.0016 );
		c = mix( c, vec3( 0.12, 0.42, 0.85 ), max( l1, l2 * 0.8 ) * cheek * 0.9 );
		c = P == ${ PA( 'CAUDAL' ) } ? mix( c * vec3( 1.0, 0.75, 0.7 ), vec3( 0.12, 0.04, 0.03 ), fishSs( 0.8, 0.98, t ) * 0.8 ) : c;
	} else if ( pat == ${ PT( 'lionfish' ) } ) {
		// red lionfish: maroon bars on cream, wide and narrow in turn and a little slanted; the spines
		// banded maroon and white; rows of dark spots on the soft fins and the tail; the fans' rays banded
		vec3 maroon = vec3( 0.28, 0.035, 0.022 );
		float ph = ( 0.5 - z ) * 10.9 + h * 0.15 + n1 * 0.08;
		float fb = fract( ph );
		float bars = max( fishBand( fb, 0.3, 0.16, 0.05 ), fishBand( fb, 0.78, 0.03, 0.02 ) * 0.9 );
		c = mix( c, maroon, bars * bodyK * mix( 0.92, 0.6, tBelly ) );
		float banded = fishSs( -0.25, 0.25, sin( t * 26.0 + w * 0.7 ) );
		c = P == ${ PA( 'DORSAL1' ) } ? mix( c, maroon, banded * 0.85 ) : c;
		c = P == ${ PA( 'PECTORAL' ) } ? mix( c, maroon * 1.2, banded * 0.75 ) : c;
		vec2 qd = vec2( z, y ) * 95.0;
		float dots = 1.0 - fishSs( 0.2, 0.36, length( fract( qd + vec2( 0.0, floor( qd.x ) * 0.5 ) ) - 0.5 ) );
		bool spotted = P == ${ PA( 'DORSAL2' ) } || P == ${ PA( 'ANAL' ) } || P == ${ PA( 'CAUDAL' ) };
		c = spotted ? mix( c, maroon, dots * 0.8 ) : c;
		c = P == ${ PA( 'PELVIC' ) } ? mix( maroon * 0.7, vec3( 0.85, 0.82, 0.8 ), dots * 0.7 ) : c;
	}

	// ---- lateral line (a row of pores along a dark line)
	float hl = lat.x + lat.y * ( 1.0 - fishSs( 0.12, 0.55, u ) );
	float lineK = fishBand( h, hl, fwH * 0.5 + 0.012, fwH + 0.008 ) * bodyK * fishSs( 0.18, 0.25, u ) * fishSs( 0.9, 0.8, u );
	c *= 1.0 - lineK * 0.3;

	// ---- gill cover edge and the preopercle (dark creases)
	float zE2 = fishOpercleEdge( eye.w, h );
	float dOp = z - zE2;
	float onOp = fishOpercleMask( h ) * bodyK;
	float crease = ( 1.0 - fishSs( 0.0015, 0.004, abs( dOp ) ) ) * onOp;
	c *= 1.0 - crease * 0.45;
	float pre = ( 1.0 - fishSs( 0.001, 0.003, abs( dOp - 0.04 ) ) ) * onOp * fishSs( 0.6, 0.2, h );
	c *= 1.0 - pre * 0.2;

	// ---- lips (the mouth line from the snout to the corner), the edge of the upper jaw bone and
	// the nostrils
	float hz = lat.z; float hy = lat.w; float tipY = r3.w;
	float mt = clamp( ( z - hz ) / ( 0.5 - hz ), 0.0, 1.0 );
	float yLip = mix( hy, tipY, mt );
	float lips = ( 1.0 - fishSs( 0.0015, 0.0035, abs( y - yLip ) ) ) * step( hz - 0.004, z ) * bodyK;
	c *= 1.0 - lips * 0.55;
	float maxZ = hz + 0.006 - ( y - hy ) * 0.35;
	float maxilla = ( 1.0 - fishSs( 0.001, 0.0025, abs( z - maxZ ) ) ) * fishSs( hy - 0.002, hy + 0.002, y ) * fishSs( hy + 0.04, hy + 0.025, y ) * bodyK;
	c *= 1.0 - maxilla * 0.3;
	float nostril = ( 1.0 - fishSs( 0.1, 0.2, length( vec2( z - eye.x - eye.z * 1.7, y - eye.y - eye.z * 0.25 ) ) / eye.z ) ) * bodyK;
	c *= 1.0 - nostril * 0.6;

	// ---- painted eye (under the dome where there is one)
	float er = length( vec2( z - eye.x, y - eye.y ) ) / eye.z;
	float painted = ( 1.0 - fishSs( 0.95, 1.1, er ) ) * bodyK;
	c = mix( c, fishEyeCol( er, atan( y - eye.y, z - eye.x ), irisC, flags.x ), painted );
	metal *= 1.0 - painted;

	// ---- eye dome: pupil, iris, glossy cornea; mouth; rays; turtle
	if ( P == ${ PA( 'EYE' ) } ) {
		float r = length( vec2( t, w ) );
		c = fishEyeCol( r, atan( w, t ), irisC, flags.x );
		c = mix( c, flank * 0.6, fishSs( 0.93, 1.0, r ) );
		rough = 0.04;
		metal = 0.0;
	} else if ( P == ${ PA( 'MOUTH' ) } ) {
		// inside of the mouth: pale pink lips to a dark throat (grunts are red inside)
		vec3 lip = pat == ${ PT( 'grunt' ) } ? vec3( 0.6, 0.08, 0.06 ) : vec3( 0.5, 0.3, 0.3 );
		c = mix( lip, vec3( 0.03, 0.012, 0.012 ), fishSs( 0.05, 0.85, t ) );
		metal = 0.0;
		rough = 0.35;
	} else if ( P == ${ PA( 'DISC' ) } || P == ${ PA( 'WHIP' ) } ) {
		// rays: sandy, finely mottled back (stingray) or black with white rings (eagle ray); white
		// belly
		bool top = w > 0.0;
		float eagleK = pat == ${ PT( 'eagleRay' ) } ? 1.0 : 0.0;
		vec2 qq = vec2( Lp.x, Lp.z ) * 20.0;
		vec2 cell = floor( qq );
		vec2 jit = ( vec2( fishHash( cell + 1.7 ), fishHash( cell + 5.3 ) ) - 0.5 ) * 0.4;
		float rad = fishHash( cell + 9.1 ) * 0.14 + 0.12;
		float ring = abs( length( fract( qq ) - 0.5 - jit ) - rad );
		float spots = ( 1.0 - fishSs( 0.035, 0.075, ring ) ) * step( 0.45, fishHash( cell ) );
		float mottle = fishVnoise( vec2( Lp.x, Lp.z ) * 60.0 ) * 0.25 + n2 * 0.2 + 0.7;
		vec3 dorsal = mix( back * mottle, mix( back, vec3( 0.75, 0.78, 0.8 ), spots * 0.85 ), eagleK );
		dorsal = mix( dorsal, edgeC, fishSs( 0.8, 1.0, t ) * 0.4 * ( 1.0 - eagleK ) );
		c = top ? dorsal : belly;
		c = P == ${ PA( 'WHIP' ) } ? finC : c;
		metal = 0.0;
		rough = r2.w;
	} else if ( P == ${ PA( 'CARAPACE' ) } ) {
		// green turtle shell: scutes (vertebral row, costals, marginals) with dark seams and
		// radiating olive / brown / amber streaks
		float X = t; float Y = w;
		float ax = abs( X );
		float rr = length( vec2( X, Y ) );
		bool vert = ax < 0.3;
		vec4 ySeams = vert ? vec4( -0.58, -0.22, 0.14, 0.5 ) : vec4( -0.42, -0.02, 0.36, 2.0 );
		float yc = Y + ax * ax * 0.25;
		float dY = min( min( abs( yc - ySeams.x ), abs( yc - ySeams.y ) ), min( abs( yc - ySeams.z ), abs( yc - ySeams.w ) ) );
		float dX = abs( ax - 0.3 );
		bool marg = rr > 0.84;
		float angle = atan( Y, X );
		float dM = min( abs( rr - 0.84 ), abs( fract( angle * ${ f( 12 / Math.PI ) } ) - 0.5 ) * 0.25 );
		float seam = min( marg ? dM : min( dY, dX ), abs( rr - 0.84 ) );
		float streak = sin( atan( yc - ( floor( yc * 2.8 ) + 0.5 ) / 2.8, X - sign( X ) * 0.55 ) * 11.0 + n2 * 6.0 ) * 0.5 + 0.5;
		float blotch = fishSs( 0.45, 0.8, fishVnoise( vec2( X, Y ) * 9.0 ) );
		vec3 shell = mix( back, flank, streak * 0.55 + blotch * 0.45 );
		shell = mix( shell, vec3( 0.2, 0.14, 0.06 ), fishSs( 0.6, 0.9, n1 ) * 0.4 );
		shell *= mix( 0.45, 1.0, fishSs( 0.003, 0.012, seam ) );
		c = shell;
		metal = 0.0;
		rough = 0.35;
	} else if ( P == ${ PA( 'SKIN' ) } || P == ${ PA( 'FLIPPER' ) } ) {
		// scaly grey-brown skin with pale scale margins; pale yellow plastron
		vec2 qq = vec2( Lp.x + Lp.y, Lp.z ) * 55.0;
		float rowS = floor( qq.y );
		vec2 q2 = qq + vec2( rowS * 0.5, 0.0 );
		vec2 ff = fract( q2 ) - 0.5;
		float scale = fishSs( 0.32, 0.47, max( abs( ff.x ), abs( ff.y ) ) );
		float tone = fishHash( floor( q2 ) ) * 0.35 + 0.8;
		vec3 skin = mix( finC * tone, edgeC, scale * 0.45 );
		c = ( w > 1.5 && P == ${ PA( 'SKIN' ) } ) ? belly * mix( 0.85, 1.05, n1 ) : skin;
		metal = 0.0;
		rough = 0.5;
	}

#ifndef FISH_LITE
	#ifndef FISH_PHYSICAL
	// iridescent sheen on silvery skin at grazing angles (FISH_PHYSICAL: three's thin film instead)
	vec3 V = normalize( cameraPosition - vFishP );
	float cosV = abs( dot( fN, V ) );
	float irid = r1.w * bodyK * silver * ( 1.0 - cosV );
	vec3 hueA = vec3( 0.55, 0.95, 0.8 ); vec3 hueB = vec3( 0.95, 0.6, 1.0 );
	c = mix( c, c * mix( hueA, hueB, cosV ) * 1.25, irid * 0.6 );
	#endif
	vec3 fishN = fishBump( vFishP, fN, dhdx, dhdy );
#else
	vec3 fishN = fN;
#endif
	vec3 fishAlbedo = c;
	float fishRough = rough;
	float fishMetal = metal;
	// translucency: lightColor * albedo * transl * 0.5
	vec3 fishTrans = c * ( transl * 0.5 );
`;

// (Salt Life) A fish out of the water as a prop (village/FishProps.js builds them: bent and placed
// on the CPU): the fish on the line, the catch card's portrait, the fish on ice and hanging at the
// stalls. The same skin as the swimming fish, from per-vertex attributes: aRest (the rest pose
// position, model units), aData (as the swimming models'), aFish ( pattern, seed, length at unit
// scale (m), wetness ); the mesh's scale multiplies the length (a fish baked at unit length and
// scaled to the catch). No underwater shading: they are never under water.
//
// Out of the water a fish is a wet thing in daylight: a film of slime over the skin (a clearcoat, its
// own smooth surface over the scales' relief, as wet as the fish), thin-film colours on its silver
// (three's iridescence, where the swimming fish fake it), and fins: thin membranes the light and the
// world behind show through, thicker along their rays and at the base. The fins are a second
// material (fins: true) drawn after everything opaque (FishProps puts their triangles in a group of
// their own). The colours are a little less vivid than the swimming fish's, which the water greys.
// lite (the low tier): three's standard material, no clearcoat or thin film, the glossier skin only.
const PROP_GLSL = /* glsl */`
attribute vec3 aRest;
attribute vec4 aData;
attribute vec4 aFish;
varying vec3 vFishLocal;
varying vec4 vFishData;
flat varying vec4 vFishInfo;
flat varying float vFishFade;
varying vec3 vFishP;
varying vec3 vFishN;
`;

const PROP_SURFACE = /* glsl */`
	float fishWet = vFishInfo.w;
	#ifndef FISH_PHYSICAL
	// (FISH_PHYSICAL: wet is the clearcoat; a glossier skin under it glinted along every scale)
	fishRough = mix( fishRough, fishRough * 0.5, fishWet );
	#endif
	// fin membranes: see-through toward the edge, thicker along the rays and at the base; the tail
	// thicker, the paired fins thinnest
	float finK = isFin && P != ${ PA( 'FINLET' ) } ? 1.0 : 0.0;
	float finRd = abs( fract( w + 0.5 ) - 0.5 );
	float finRay = ( 1.0 - fishSs( 0.07, fwW + 0.15, finRd ) ) * ( 1.0 - fishSs( 0.25, 0.6, fwW ) );
	float finThick = P == ${ PA( 'CAUDAL' ) } ? 0.18 : ( ( P == ${ PA( 'PECTORAL' ) } || P == ${ PA( 'PELVIC' ) } ) ? - 0.16 : 0.0 );
	float fishAlpha = mix( 1.0, clamp( mix( 0.94, 0.4, fishSs( 0.05, 0.95, t ) ) + finRay * 0.18 + finThick, 0.22, 1.0 ), finK );
	// the fins a little less vivid than the paint (thin, they take the colours behind them)
	float fishLum = dot( fishAlbedo, vec3( 0.2126, 0.7152, 0.0722 ) );
	fishAlbedo = mix( fishAlbedo, vec3( fishLum ), finK * 0.25 );
	// the scales' relief gentler under the wet film
	fishN = normalize( mix( fN, fishN, 0.5 ) );
	fishTrans *= mix( 1.0, 0.6, finK );
	#ifdef FISH_PHYSICAL
	float fishIrid = r1.w * bodyK * silver;
	#endif
	normal = normalize( ( viewMatrix * vec4( fishN, 0.0 ) ).xyz );
	diffuseColor.rgb = fishAlbedo;
	diffuseColor.a = fishAlpha;
	roughnessFactor = fishRough;
	metalnessFactor = fishMetal;
`;

const _props = {};
export function createPropMaterial( { lite = false, fins = false } = {} ) {

	const key = 'fishProp' + ( lite ? 'Lite' : '' ) + ( fins ? 'Fins' : '' );
	if ( _props[ key ] ) return _props[ key ];
	const options = { roughness: 0.4, metalness: 0, side: THREE.DoubleSide };
	const m = _props[ key ] = lite ? new THREE.MeshStandardMaterial( options ) : new THREE.MeshPhysicalMaterial( {
		...options,
		clearcoat: 1, clearcoatRoughness: 0.06,
		iridescence: 1, iridescenceIOR: 1.6, iridescenceThicknessRange: [ 180, 420 ],
	} );
	m.name = fins ? 'FishPropFins' : 'FishProp';
	if ( ! lite ) m.defines = { FISH_PHYSICAL: '' };
	if ( fins ) {

		// (single sheets: one pass of both faces; three's two passes for double-sided transparency
		// cost a second program and order nothing here)
		m.transparent = true;
		m.depthWrite = false;
		m.forceSinglePass = true;

	}

	const uniforms = { fishSkin: { value: skinTable() }, fishSunColor: G.sunColor };
	m.onBeforeCompile = ( shader ) => {

		Object.assign( shader.uniforms, uniforms );
		shader.vertexShader = shader.vertexShader
			.replace( '#include <common>', '#include <common>\n' + FISH_GLSL + PROP_GLSL )
			.replace( '#include <project_vertex>', /* glsl */`#include <project_vertex>
	vFishLocal = aRest;
	vFishData = aData;
	vFishInfo = vec4( aFish.x, aFish.y, aFish.z * length( modelMatrix[ 0 ].xyz ), aFish.w );
	vFishFade = 1.0;
	vFishP = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
	vFishN = normalize( mat3( modelMatrix ) * objectNormal );` );
		shader.fragmentShader = shader.fragmentShader
			.replace( '#include <common>', '#include <common>\n' + FISH_GLSL + LOD_FADE_GLSL + FRAG_GLSL )
			.replace( '#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + SURFACE + PROP_SURFACE )
			.replace( '#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance += fishTrans * fishSunColor * 0.5;' )
			// the wet film as wet as the fish; the thin film on the silver only
			.replace( '#include <lights_physical_fragment>', /* glsl */`#include <lights_physical_fragment>
	#ifdef USE_CLEARCOAT
	material.clearcoat *= fishWet;
	#endif
	#ifdef USE_IRIDESCENCE
	material.iridescence *= fishIrid;
	#endif` );

	};
	m.customProgramCacheKey = () => key;
	return m;

}

// The material of the swimming fish (batch: the KindBatch of the fish kinds; ground: the Terrain,
// for the shared underwater shading).
export function createSwimMaterial( batch, { ground, lite = false } ) {

	const m = new THREE.MeshStandardMaterial( { roughness: 0.4, metalness: 0, side: THREE.DoubleSide } );
	m.name = 'Fish';
	if ( lite ) m.defines = { FISH_LITE: '' };
	const uniforms = { fishRecords: { value: batch.texture }, fishSkin: { value: skinTable() }, fishSunColor: G.sunColor, ...underwaterUniforms( ground ) };
	m.onBeforeCompile = ( shader ) => {

		Object.assign( shader.uniforms, uniforms );
		shader.vertexShader = shader.vertexShader
			.replace( '#include <common>', '#include <common>\n' + FISH_GLSL + batch.glsl( 'fishRecords' ) + SWIM_GLSL )
			.replace( '#include <beginnormal_vertex>', 'vec3 fishWorld; vec3 fishNrm;\n\tfishPose( fishWorld, fishNrm );\n\tvec3 objectNormal = fishNrm;' )
			.replace( '#include <begin_vertex>', 'vec3 transformed = fishWorld;' );
		shader.fragmentShader = shader.fragmentShader
			.replace( '#include <common>', '#include <common>\n' + FISH_GLSL + LOD_FADE_GLSL + UNDERWATER_GLSL + FRAG_GLSL )
			.replace( '#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + SURFACE + '\tnormal = normalize( ( viewMatrix * vec4( fishN, 0.0 ) ).xyz );\n\tdiffuseColor.rgb = uwShade( fishAlbedo, vFishP, fN );\n\troughnessFactor = fishRough;\n\tmetalnessFactor = fishMetal;' )
			.replace( '#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance += uwShade( fishTrans, vFishP, vec3( 0.0, 1.0, 0.0 ) ) * fishSunColor * 0.5;' );

	};
	m.customProgramCacheKey = () => 'fish' + ( lite ? 'Lite' : '' );
	return m;

}
