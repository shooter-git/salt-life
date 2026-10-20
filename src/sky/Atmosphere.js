import * as THREE from '../engine/index.js';

// Physically based sky (Hillaire 2020, "A Scalable and Production Ready Sky and Atmosphere
// Rendering Technique"). All distances in km inside the atmosphere code.
//
// Port notes (WebGPU compute -> WebGL 2): the three LUTs are fragment passes into half float render
// targets (transmittance and multiple scattering once, the sky view LUT when the sun or the camera
// height has changed). Tidewater integrated the sky irradiance, the sun's transmittance and the
// horizon colour on the GPU and read them back; reading pixels back stalls a GPU-less device for
// seconds, so the same model runs on the CPU instead (small LUTs of its own and a table over the
// sun's height, built once): `atmosphere.lighting( sunY )`.
//
// GLSL (`ATMOSPHERE_GLSL`, prefix `atmosphere`; its uniforms are `atmosphere.uniforms`):
//   vec3 atmosphereSkyLuminance( vec3 dir )                  sky luminance (no sun disk), sky view LUT
//   vec3 atmosphereSampleTransmittance( float rKm, float mu ) transmittance LUT
//   vec3 atmosphereTransmittanceToSpace( vec3 dir )           from the viewer toward dir
//   float atmosphereRaySphereNearest( vec3 ro, vec3 rd, float radius )
//   ATMO_RG / ATMO_RT (km)

const RG = 6360.0;
const RT = 6460.0;

export const SUN_ILLUMINANCE = 11.0; // scene units (sun irradiance outside the atmosphere)
export const SUN_ANGULAR_RADIUS = 0.004675 * 1.15;

const T_W = 256, T_H = 64;
const MS_RES = 32;
const SV_W = 192, SV_H = 108;
const LOG_STEP = Math.log( 1.02 );

export const f = ( x ) => {

	const s = String( x );
	return s.includes( '.' ) || s.includes( 'e' ) ? s : s + '.0';

};

// ---------------------------------------------------------------- a full screen pass into a render target

const _quadGeometry = new THREE.BufferGeometry();
_quadGeometry.setAttribute( 'position', new THREE.Float32BufferAttribute( [ - 1, - 1, 0, 3, - 1, 0, - 1, 3, 0 ], 3 ) );
const _quadCamera = new THREE.OrthographicCamera();
const PASS_VERTEX = /* glsl */`
void main() { gl_Position = vec4( position.xy, 0.0, 1.0 ); }
`;

// One fragment pass: a single triangle over the target (or one layer of a 3D target). With
// `clear: false` the target keeps what it holds where the shader discards (progressive refreshes).
export class Pass {

	constructor( fragmentShader, uniforms = {}, defines = {} ) {

		this.material = new THREE.ShaderMaterial( { vertexShader: PASS_VERTEX, fragmentShader, uniforms, defines, depthTest: false, depthWrite: false, toneMapped: false } );
		this.uniforms = this.material.uniforms;
		this.mesh = new THREE.Mesh( _quadGeometry, this.material );
		this.mesh.frustumCulled = false;

	}

	render( renderer, target, clear = true, layer = 0 ) {

		const oldTarget = renderer.getRenderTarget(), oldFace = renderer.getActiveCubeFace(), oldMip = renderer.getActiveMipmapLevel();
		const oldClear = renderer.autoClear;
		renderer.autoClear = clear;
		renderer.setRenderTarget( target, layer );
		renderer.render( this.mesh, _quadCamera );
		renderer.setRenderTarget( oldTarget, oldFace, oldMip );
		renderer.autoClear = oldClear;

	}

	dispose() {

		this.material.dispose();

	}

}

// a half float, linearly filtered target without depth
export function floatTarget( w, h, options = {} ) {

	return new THREE.WebGLRenderTarget( w, h, {
		type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
		wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping, depthBuffer: false, generateMipmaps: false, ...options,
	} );

}

// ---------------------------------------------------------------- GLSL

// medium, parameterizations and ray / sphere helpers (no textures: usable by the passes that write the LUTs)
const CORE_GLSL = /* glsl */`
#define ATMO_RG ${ f( RG ) }
#define ATMO_RT ${ f( RT ) }
#ifndef PI
#define PI 3.141592653589793
#endif
uniform float atmoRayleighScale;
uniform float atmoMieScale;
uniform float atmoMieG;
uniform float atmoOzoneScale;
uniform vec3 atmoGroundAlbedo;
uniform float atmoViewHeight; // km
uniform vec3 atmoSunIlluminance;
// the real sun (may be below the horizon: twilight, night). The key light becomes the moon at night;
// the sky itself is always scattered sunlight.
uniform vec3 atmoSunDir;

struct AtmosphereMedium {
	vec3 rayScat;
	float mieScat;
	vec3 extinction;
	vec3 scattering;
};

AtmosphereMedium atmosphereMedium( float hKm ) {
	float rayDensity = exp( - hKm / 8.0 );
	float mieDensity = exp( - hKm / 1.2 );
	float ozoneDensity = max( 0.0, 1.0 - abs( hKm - 25.0 ) / 15.0 );
	AtmosphereMedium m;
	m.rayScat = vec3( 5.802e-3, 13.558e-3, 33.1e-3 ) * rayDensity * atmoRayleighScale;
	m.mieScat = 3.996e-3 * mieDensity * atmoMieScale;
	float mieExt = 4.440e-3 * mieDensity * atmoMieScale;
	vec3 ozoneAbs = vec3( 0.650e-3, 1.881e-3, 0.085e-3 ) * ozoneDensity * atmoOzoneScale;
	m.extinction = m.rayScat + mieExt + ozoneAbs;
	m.scattering = m.rayScat + m.mieScat;
	return m;
}

// (r, mu) -> transmittance LUT uv
vec2 atmosphereTransmittanceUV( float r, float mu ) {
	float H = sqrt( ATMO_RT * ATMO_RT - ATMO_RG * ATMO_RG );
	float rho = sqrt( max( r * r - ATMO_RG * ATMO_RG, 0.0 ) );
	float disc = r * r * ( mu * mu - 1.0 ) + ATMO_RT * ATMO_RT;
	float d = max( 0.0, - r * mu + sqrt( max( disc, 0.0 ) ) );
	float dMin = ATMO_RT - r;
	float dMax = rho + H;
	float xMu = ( d - dMin ) / ( dMax - dMin );
	float xR = rho / H;
	// unit -> sub-uv
	return vec2( ( xMu + ${ f( 0.5 / T_W ) } ) * ${ f( T_W / ( T_W + 1 ) ) }, ( xR + ${ f( 0.5 / T_H ) } ) * ${ f( T_H / ( T_H + 1 ) ) } );
}

// nearest positive ray-sphere intersection from ro (km, planet centered), -1 if none
float atmosphereRaySphereNearest( vec3 ro, vec3 rd, float radius ) {
	float b = dot( ro, rd );
	float c = dot( ro, ro ) - radius * radius;
	float disc = b * b - c;
	float sq = sqrt( max( disc, 0.0 ) );
	float t0 = - b - sq;
	float t1 = - b + sq;
	if ( disc < 0.0 ) return - 1.0;
	return t0 > 0.0 ? t0 : ( t1 > 0.0 ? t1 : - 1.0 );
}
`;

const TRANSMITTANCE_GLSL = /* glsl */`
uniform sampler2D atmoTransmittanceLUT;
vec3 atmosphereSampleTransmittance( float r, float mu ) {
	return textureLod( atmoTransmittanceLUT, atmosphereTransmittanceUV( r, mu ), 0.0 ).rgb;
}
// Transmittance from the viewer toward direction dir (for sun disk / sun light color).
vec3 atmosphereTransmittanceToSpace( vec3 dir ) {
	return atmosphereSampleTransmittance( atmoViewHeight, dir.y );
}
`;

const MULTISCAT_GLSL = /* glsl */`
uniform sampler2D atmoMultiScatLUT;
vec3 atmosphereSampleMultiScat( float r, float cosSun ) {
	vec2 uv = vec2( cosSun * 0.5 + 0.5, ( r - ATMO_RG ) / ( ATMO_RT - ATMO_RG ) );
	vec2 suv = uv * ${ f( ( MS_RES - 1 ) / MS_RES ) } + ${ f( 0.5 / MS_RES ) };
	return textureLod( atmoMultiScatLUT, suv, 0.0 ).rgb;
}
`;

// the public chunk: sky view LUT lookups + transmittance
export const ATMOSPHERE_GLSL = CORE_GLSL + TRANSMITTANCE_GLSL + /* glsl */`
uniform sampler2D atmoSkyViewLUT;
// Sky luminance (no sun disk) for world direction dir (normalized).
vec3 atmosphereSkyLuminance( vec3 dir ) {
	float viewH = atmoViewHeight;
	float vHorizon = sqrt( max( viewH * viewH - ATMO_RG * ATMO_RG, 0.0 ) );
	float beta = acos( vHorizon / viewH );
	float zenithHorizonAngle = PI - beta;
	float viewZenithAngle = acos( clamp( dir.y, -1.0, 1.0 ) );

	float vCoordA = ( 1.0 - sqrt( max( 1.0 - viewZenithAngle / zenithHorizonAngle, 0.0 ) ) ) * 0.5;
	float vCoordB = sqrt( max( ( viewZenithAngle - zenithHorizonAngle ) / beta, 0.0 ) ) * 0.5 + 0.5;
	float v = viewZenithAngle < zenithHorizonAngle ? vCoordA : vCoordB;

	// azimuth relative to sun
	vec2 sunH = normalize( atmoSunDir.xz + vec2( 1e-5, 0.0 ) );
	vec2 dirH = normalize( dir.xz + vec2( 1e-5, 0.0 ) );
	float lightViewCos = dot( sunH, dirH );
	float u = sqrt( clamp( lightViewCos * -0.5 + 0.5, 0.0, 1.0 ) );

	vec2 suv = vec2( u * ${ f( ( SV_W - 1 ) / SV_W ) } + ${ f( 0.5 / SV_W ) }, v * ${ f( ( SV_H - 1 ) / SV_H ) } + ${ f( 0.5 / SV_H ) } );
	return textureLod( atmoSkyViewLUT, suv, 0.0 ).rgb;
}
`;

// ----- transmittance LUT
const TRANSMITTANCE_PASS = CORE_GLSL + /* glsl */`
void main() {
	vec2 uv = gl_FragCoord.xy / vec2( ${ f( T_W ) }, ${ f( T_H ) } );
	float xMu = ( uv.x - ${ f( 0.5 / T_W ) } ) * ${ f( T_W / ( T_W - 1 ) ) };
	float xR = ( uv.y - ${ f( 0.5 / T_H ) } ) * ${ f( T_H / ( T_H - 1 ) ) };
	float H = sqrt( ATMO_RT * ATMO_RT - ATMO_RG * ATMO_RG );
	float rho = xR * H;
	float r = sqrt( rho * rho + ATMO_RG * ATMO_RG );
	float dMin = ATMO_RT - r;
	float dMax = rho + H;
	float d = dMin + xMu * ( dMax - dMin );
	float mu = clamp( d == 0.0 ? 1.0 : ( H * H - rho * rho - d * d ) / ( 2.0 * r * d ), -1.0, 1.0 );

	vec3 ro = vec3( 0.0, r, 0.0 );
	vec3 rd = vec3( sqrt( max( 1.0 - mu * mu, 0.0 ) ), mu, 0.0 );
	float tMax = atmosphereRaySphereNearest( ro, rd, ATMO_RT );
	const int steps = 40;
	float dt = tMax / float( steps );
	vec3 od = vec3( 0.0 );
	for ( int i = 0; i < steps; i ++ ) {
		float t = ( float( i ) + 0.5 ) * dt;
		vec3 p = ro + rd * t;
		float h = length( p ) - ATMO_RG;
		od += atmosphereMedium( h ).extinction * dt;
	}
	gl_FragColor = vec4( exp( - od ), 1.0 );
}
`;

// ----- multiple scattering LUT
const MULTISCAT_PASS = CORE_GLSL + TRANSMITTANCE_GLSL + /* glsl */`
void main() {
	vec2 uv = ( gl_FragCoord.xy / ${ f( MS_RES ) } - ${ f( 0.5 / MS_RES ) } ) * ${ f( MS_RES / ( MS_RES - 1 ) ) };
	float cosSun = uv.x * 2.0 - 1.0;
	float r = ATMO_RG + clamp( uv.y, 0.001, 0.999 ) * ( ATMO_RT - ATMO_RG );
	vec3 sunDir = normalize( vec3( 0.0, cosSun, - sqrt( max( 1.0 - cosSun * cosSun, 0.0 ) ) ) );
	vec3 ro = vec3( 0.0, r, 0.0 );

	vec3 Lsum = vec3( 0.0 );
	vec3 fmsSum = vec3( 0.0 );
	const int SQ = 8;
	float isoPhase = 1.0 / ( 4.0 * PI );

	for ( int i = 0; i < SQ * SQ; i ++ ) {
		float ii = ( float( i % SQ ) + 0.5 ) / float( SQ );
		float jj = ( float( i / SQ ) + 0.5 ) / float( SQ );
		float theta = ii * 2.0 * PI;
		float phi = acos( 1.0 - jj * 2.0 );
		vec3 rd = vec3( cos( theta ) * sin( phi ), cos( phi ), sin( theta ) * sin( phi ) );

		float tBottom = atmosphereRaySphereNearest( ro, rd, ATMO_RG );
		float tTop = atmosphereRaySphereNearest( ro, rd, ATMO_RT );
		bool hitGround = tBottom > 0.0;
		float tMax = hitGround ? tBottom : tTop;
		const int steps = 20;
		float dt = tMax / float( steps );
		vec3 throughput = vec3( 1.0 );
		vec3 L = vec3( 0.0 );
		vec3 fms = vec3( 0.0 );

		for ( int s = 0; s < steps; s ++ ) {
			float t = ( float( s ) + 0.3 ) * dt;
			vec3 p = ro + rd * t;
			float pr = length( p );
			AtmosphereMedium m = atmosphereMedium( pr - ATMO_RG );
			vec3 up = p / pr;
			float cosSunP = dot( up, sunDir );
			vec3 Tsun = atmosphereSampleTransmittance( pr, cosSunP );
			float shadowT = atmosphereRaySphereNearest( p, sunDir, ATMO_RG );
			float earthShadow = shadowT > 0.0 ? 0.0 : 1.0;
			vec3 S = Tsun * earthShadow * m.scattering * isoPhase;
			vec3 Tstep = exp( - m.extinction * dt );
			vec3 ext = max( m.extinction, vec3( 1e-6 ) );
			L += throughput * ( S - S * Tstep ) / ext;
			fms += throughput * ( m.scattering - m.scattering * Tstep ) / ext;
			throughput *= Tstep;
		}

		if ( hitGround ) {
			vec3 p = ro + rd * tMax;
			vec3 up = normalize( p );
			float cosS = dot( up, sunDir );
			vec3 Tsun = atmosphereSampleTransmittance( ATMO_RG, cosS );
			L += Tsun * throughput * max( cosS, 0.0 ) * atmoGroundAlbedo / PI;
		}

		Lsum += L * ( 4.0 * PI / float( SQ * SQ ) );
		fmsSum += fms * ( 4.0 * PI / float( SQ * SQ ) );
	}

	vec3 Lin = Lsum * isoPhase;
	vec3 fmsAvg = fmsSum * isoPhase;
	vec3 Lms = Lin / ( vec3( 1.0 ) - fmsAvg );
	gl_FragColor = vec4( Lms, 1.0 );
}
`;

// ----- sky view LUT (when the sun or the camera height changed)
const SKYVIEW_PASS = CORE_GLSL + TRANSMITTANCE_GLSL + MULTISCAT_GLSL + /* glsl */`
void main() {
	vec2 uv = gl_FragCoord.xy / vec2( ${ f( SV_W ) }, ${ f( SV_H ) } );
	float u = ( uv.x - ${ f( 0.5 / SV_W ) } ) * ${ f( SV_W / ( SV_W - 1 ) ) };
	float v = ( uv.y - ${ f( 0.5 / SV_H ) } ) * ${ f( SV_H / ( SV_H - 1 ) ) };

	float viewH = atmoViewHeight;
	float vHorizon = sqrt( max( viewH * viewH - ATMO_RG * ATMO_RG, 0.0 ) );
	float beta = acos( vHorizon / viewH );
	float zenithHorizonAngle = PI - beta;

	float vzA = 0.0;
	if ( v < 0.5 ) {
		float c = v * 2.0;
		c = 1.0 - c;
		c = c * c;
		c = 1.0 - c;
		vzA = zenithHorizonAngle * c;
	} else {
		float c = v * 2.0 - 1.0;
		c = c * c;
		vzA = zenithHorizonAngle + beta * c;
	}

	float cosViewZenith = cos( vzA );
	float sinViewZenith = sin( vzA );
	float cu = u * u;
	float lightViewCos = - ( cu * 2.0 - 1.0 );
	float lightViewSin = sqrt( max( 1.0 - lightViewCos * lightViewCos, 0.0 ) );

	// local frame: up = +y, sun azimuth along +x
	float sunCosZ = atmoSunDir.y;
	float sunSinZ = sqrt( max( 1.0 - sunCosZ * sunCosZ, 0.0 ) );
	vec3 sunDir = vec3( sunSinZ, sunCosZ, 0.0 );
	vec3 rd = vec3( sinViewZenith * lightViewCos, cosViewZenith, sinViewZenith * lightViewSin );
	vec3 ro = vec3( 0.0, viewH, 0.0 );

	float tBottom = atmosphereRaySphereNearest( ro, rd, ATMO_RG );
	float tTop = atmosphereRaySphereNearest( ro, rd, ATMO_RT );
	float tMax = tBottom > 0.0 ? tBottom : tTop;
	const int steps = 32;
	float cosTheta = dot( rd, sunDir );
	float rayPhase = ${ f( 3 / ( 16 * Math.PI ) ) } * ( cosTheta * cosTheta + 1.0 );
	float g = atmoMieG;
	float g2 = g * g;
	// Cornette-Shanks
	float miePhase = ${ f( 3 / ( 8 * Math.PI ) ) } * ( ( 1.0 - g2 ) * ( cosTheta * cosTheta + 1.0 ) )
		/ ( ( g2 + 2.0 ) * pow( max( g2 + 1.0 - g * cosTheta * 2.0, 1e-4 ), 1.5 ) );

	vec3 throughput = vec3( 1.0 );
	vec3 L = vec3( 0.0 );

	for ( int i = 0; i < steps; i ++ ) {
		// quadratic step distribution
		float t0 = float( i ) / float( steps );
		float t1 = ( float( i ) + 1.0 ) / float( steps );
		float ta = t0 * t0 * tMax;
		float tb = t1 * t1 * tMax;
		float t = mix( ta, tb, 0.3 );
		float dt = tb - ta;
		vec3 p = ro + rd * t;
		float pr = length( p );
		AtmosphereMedium m = atmosphereMedium( pr - ATMO_RG );
		vec3 up = p / pr;
		float cosSunP = dot( up, sunDir );
		vec3 Tsun = atmosphereSampleTransmittance( pr, cosSunP );
		float shadowT = atmosphereRaySphereNearest( p, sunDir, ATMO_RG );
		float earthShadow = shadowT > 0.0 ? 0.0 : 1.0;
		vec3 ms = atmosphereSampleMultiScat( pr, cosSunP );
		vec3 phaseScat = m.rayScat * rayPhase + vec3( m.mieScat * miePhase );
		vec3 S = Tsun * earthShadow * phaseScat + ms * m.scattering;
		vec3 Tstep = exp( - m.extinction * dt );
		vec3 ext = max( m.extinction, vec3( 1e-6 ) );
		L += throughput * ( S - S * Tstep ) / ext;
		throughput *= Tstep;
	}

	gl_FragColor = vec4( L * atmoSunIlluminance, 1.0 );
}
`;

// ---------------------------------------------------------------- the atmosphere

export class Atmosphere {

	constructor( renderer ) {

		this.renderer = renderer;
		this.transmittanceLUT = floatTarget( T_W, T_H );
		this.multiScatLUT = floatTarget( MS_RES, MS_RES );
		this.skyViewLUT = floatTarget( SV_W, SV_H );

		// three-style { value } handles (same names as Tidewater's); materials take `uniforms` as they are
		this.uniforms = {
			atmoRayleighScale: { value: 1 },
			atmoMieScale: { value: 1 },
			atmoMieG: { value: 0.8 },
			atmoOzoneScale: { value: 1 },
			atmoGroundAlbedo: { value: new THREE.Color( 0.06, 0.08, 0.1 ) },
			atmoViewHeight: { value: RG + 0.002 }, // km
			atmoSunIlluminance: { value: new THREE.Color( SUN_ILLUMINANCE, SUN_ILLUMINANCE, SUN_ILLUMINANCE ) },
			atmoSunDir: { value: new THREE.Vector3( 0.3, 0.6, - 0.7 ).normalize() },
			atmoTransmittanceLUT: { value: this.transmittanceLUT.texture },
			atmoMultiScatLUT: { value: this.multiScatLUT.texture },
			atmoSkyViewLUT: { value: this.skyViewLUT.texture },
		};
		const U = this.uniforms;
		this.rayleighScale = U.atmoRayleighScale;
		this.mieScale = U.atmoMieScale;
		this.mieG = U.atmoMieG;
		this.ozoneScale = U.atmoOzoneScale;
		this.groundAlbedo = U.atmoGroundAlbedo;
		this.viewHeight = U.atmoViewHeight;
		this.sunIlluminance = U.atmoSunIlluminance;
		this.sunDir = U.atmoSunDir;

		this.transmittancePass = new Pass( TRANSMITTANCE_PASS, U );
		this.multiScatPass = new Pass( MULTISCAT_PASS, U );
		this.skyViewPass = new Pass( SKYVIEW_PASS, U );

		this.needsStatic = true;
		this._svSun = new THREE.Vector3( 0, - 2, 0 );
		this._svHeight = - 1;
		// the sky view LUT is re-made once the sun has moved this far (cosine of ~0.1 degree)
		this.sunTolerance = 0.9999985;
		this.passes = 0; // passes drawn by the last update

		this.cpu = new AtmosphereCPU();

	}

	update( cameraY ) {

		// camera height quantized (2 m near the sea, 2 % higher up): the sky view LUT is rebuilt only
		// when a parameter changes, not every frame the camera bobs
		const y = Math.max( 0.5, cameraY + 0.5 );
		const yq = y < 100 ? Math.round( y / 2 ) * 2 : Math.exp( Math.round( Math.log( y ) / LOG_STEP ) * LOG_STEP );
		this.viewHeight.value = RG + Math.max( 0.001, yq / 1000 );

		this.passes = 0;
		let dirty = false;
		if ( this.needsStatic ) {

			this.needsStatic = false;
			dirty = true;
			this.transmittancePass.render( this.renderer, this.transmittanceLUT );
			this.multiScatPass.render( this.renderer, this.multiScatLUT );
			this.passes += 2;

		}

		// sky view LUT: only when the sun or the height changed
		const sun = this.sunDir.value;
		if ( dirty || this._svSun.dot( sun ) < this.sunTolerance || this._svHeight !== this.viewHeight.value ) {

			this._svSun.copy( sun );
			this._svHeight = this.viewHeight.value;
			this.skyViewPass.render( this.renderer, this.skyViewLUT );
			this.passes ++;

		}

	}

	// The CPU side of the same model at sea level, in scene units (times the sun's illuminance) for a
	// sun at height sunY: { sunTransmittance, skyIrradiance (E / PI), horizon }
	lighting( sunY, out ) {

		return this.cpu.lighting( sunY, out );

	}

	invalidate() {

		this.needsStatic = true;

	}

	dispose() {

		for ( const t of [ this.transmittanceLUT, this.multiScatLUT, this.skyViewLUT ] ) t.dispose();
		for ( const p of [ this.transmittancePass, this.multiScatPass, this.skyViewPass ] ) p.dispose();

	}

}

// ---------------------------------------------------------------- the same model on the CPU

// Hillaire's model at low resolution: transmittance and multiple scattering LUTs of its own, then, for
// 96 sun heights, the sky irradiance (cosine weighted mean of the luminance over the upper hemisphere:
// E / PI, what Tidewater's frame.skyIrradiance held), the horizon colour (mean around the horizon at
// 0.03 elevation) and the sun's transmittance at sea level. The LUTs are built on first use, each row of
// the table when a sun height first needs it (~1 ms); lookups interpolate the table.
const C_TW = 48, C_TH = 12, C_MS = 10, C_SUN = 96, C_SUN_MIN = - 0.35;

class AtmosphereCPU {

	constructor() {

		this.mieG = 0.8;
		this.groundAlbedo = [ 0.06, 0.08, 0.1 ];
		this.viewHeight = RG + 0.002;
		this._m = { rayScat: [ 0, 0, 0 ], mieScat: 0, extinction: [ 0, 0, 0 ], scattering: [ 0, 0, 0 ] };
		this._t = [ 0, 0, 0 ];
		this._ms = [ 0, 0, 0 ];
		this.table = null;

	}

	medium( hKm ) {

		const m = this._m;
		const rayDensity = Math.exp( - hKm / 8 );
		const mieDensity = Math.exp( - hKm / 1.2 );
		const oz = Math.max( 0, 1 - Math.abs( hKm - 25 ) / 15 );
		m.rayScat[ 0 ] = 5.802e-3 * rayDensity; m.rayScat[ 1 ] = 13.558e-3 * rayDensity; m.rayScat[ 2 ] = 33.1e-3 * rayDensity;
		m.mieScat = 3.996e-3 * mieDensity;
		const mieExt = 4.440e-3 * mieDensity;
		m.extinction[ 0 ] = m.rayScat[ 0 ] + mieExt + 0.650e-3 * oz;
		m.extinction[ 1 ] = m.rayScat[ 1 ] + mieExt + 1.881e-3 * oz;
		m.extinction[ 2 ] = m.rayScat[ 2 ] + mieExt + 0.085e-3 * oz;
		for ( let c = 0; c < 3; c ++ ) m.scattering[ c ] = m.rayScat[ c ] + m.mieScat;
		return m;

	}

	// ---- transmittance LUT (the GPU parameterization, texel centres at the ends)
	_buildTransmittance() {

		const lut = this.tLUT = new Float32Array( C_TW * C_TH * 3 );
		const H = Math.sqrt( RT * RT - RG * RG );
		for ( let j = 0; j < C_TH; j ++ ) for ( let i = 0; i < C_TW; i ++ ) {

			const xMu = i / ( C_TW - 1 ), xR = j / ( C_TH - 1 );
			const rho = xR * H;
			const r = Math.sqrt( rho * rho + RG * RG );
			const dMin = RT - r, dMax = rho + H;
			const d = dMin + xMu * ( dMax - dMin );
			const mu = Math.min( 1, Math.max( - 1, d === 0 ? 1 : ( H * H - rho * rho - d * d ) / ( 2 * r * d ) ) );
			const sx = Math.sqrt( Math.max( 1 - mu * mu, 0 ) );
			const tMax = raySphere( 0, r, 0, sx, mu, 0, RT );
			const steps = 24, dt = tMax / steps;
			let o0 = 0, o1 = 0, o2 = 0;
			for ( let s = 0; s < steps; s ++ ) {

				const t = ( s + 0.5 ) * dt;
				const m = this.medium( Math.sqrt( sx * t * sx * t + ( r + mu * t ) * ( r + mu * t ) ) - RG );
				o0 += m.extinction[ 0 ] * dt; o1 += m.extinction[ 1 ] * dt; o2 += m.extinction[ 2 ] * dt;

			}

			const k = ( j * C_TW + i ) * 3;
			lut[ k ] = Math.exp( - o0 ); lut[ k + 1 ] = Math.exp( - o1 ); lut[ k + 2 ] = Math.exp( - o2 );

		}

	}

	transmittance( r, mu, out = this._t ) {

		const H = Math.sqrt( RT * RT - RG * RG );
		const rho = Math.sqrt( Math.max( r * r - RG * RG, 0 ) );
		const disc = r * r * ( mu * mu - 1 ) + RT * RT;
		const d = Math.max( 0, - r * mu + Math.sqrt( Math.max( disc, 0 ) ) );
		const dMin = RT - r, dMax = rho + H;
		return bilinear( this.tLUT, C_TW, C_TH, ( d - dMin ) / ( dMax - dMin ), rho / H, out );

	}

	// ---- multiple scattering LUT (the GPU pass at 10 x 10, 36 directions of 12 steps)
	_buildMultiScat() {

		const lut = this.msLUT = new Float32Array( C_MS * C_MS * 3 );
		const SQ = 6, iso = 1 / ( 4 * Math.PI ), T = [ 0, 0, 0 ];
		const thr = [ 0, 0, 0 ], L = [ 0, 0, 0 ], fms = [ 0, 0, 0 ], Lsum = [ 0, 0, 0 ], fmsSum = [ 0, 0, 0 ];
		for ( let j = 0; j < C_MS; j ++ ) for ( let i = 0; i < C_MS; i ++ ) {

			const cosSun = ( i / ( C_MS - 1 ) ) * 2 - 1;
			const r = RG + Math.min( 0.999, Math.max( 0.001, j / ( C_MS - 1 ) ) ) * ( RT - RG );
			const sy = cosSun, sz = - Math.sqrt( Math.max( 1 - cosSun * cosSun, 0 ) );
			Lsum.fill( 0 ); fmsSum.fill( 0 );
			for ( let k = 0; k < SQ * SQ; k ++ ) {

				const theta = ( ( k % SQ ) + 0.5 ) / SQ * 2 * Math.PI;
				const phi = Math.acos( 1 - ( ( Math.floor( k / SQ ) + 0.5 ) / SQ ) * 2 );
				const dx = Math.cos( theta ) * Math.sin( phi ), dy = Math.cos( phi ), dz = Math.sin( theta ) * Math.sin( phi );
				const tBottom = raySphere( 0, r, 0, dx, dy, dz, RG );
				const hitGround = tBottom > 0;
				const tMax = hitGround ? tBottom : raySphere( 0, r, 0, dx, dy, dz, RT );
				const steps = 12, dt = tMax / steps;
				thr.fill( 1 ); L.fill( 0 ); fms.fill( 0 );
				for ( let s = 0; s < steps; s ++ ) {

					const t = ( s + 0.3 ) * dt;
					const px = dx * t, py = r + dy * t, pz = dz * t;
					const pr = Math.sqrt( px * px + py * py + pz * pz );
					const m = this.medium( pr - RG );
					this.transmittance( pr, ( py * sy + pz * sz ) / pr, T );
					const shadow = raySphere( px, py, pz, 0, sy, sz, RG ) > 0 ? 0 : 1;
					for ( let c = 0; c < 3; c ++ ) {

						const S = T[ c ] * shadow * m.scattering[ c ] * iso;
						const Ts = Math.exp( - m.extinction[ c ] * dt );
						const ext = Math.max( m.extinction[ c ], 1e-6 );
						L[ c ] += thr[ c ] * ( S - S * Ts ) / ext;
						fms[ c ] += thr[ c ] * ( m.scattering[ c ] - m.scattering[ c ] * Ts ) / ext;
						thr[ c ] *= Ts;

					}

				}

				if ( hitGround ) {

					const px = dx * tMax, py = r + dy * tMax, pz = dz * tMax;
					const cosS = ( py * sy + pz * sz ) / Math.sqrt( px * px + py * py + pz * pz );
					this.transmittance( RG, cosS, T );
					for ( let c = 0; c < 3; c ++ ) L[ c ] += T[ c ] * thr[ c ] * Math.max( cosS, 0 ) * this.groundAlbedo[ c ] / Math.PI;

				}

				for ( let c = 0; c < 3; c ++ ) {

					Lsum[ c ] += L[ c ] * ( 4 * Math.PI / ( SQ * SQ ) );
					fmsSum[ c ] += fms[ c ] * ( 4 * Math.PI / ( SQ * SQ ) );

				}

			}

			const o = ( j * C_MS + i ) * 3;
			for ( let c = 0; c < 3; c ++ ) lut[ o + c ] = ( Lsum[ c ] * iso ) / ( 1 - fmsSum[ c ] * iso );

		}

	}

	// sky luminance along (dx, dy, dz) for a sun at height sunY (its azimuth along +x): the sky view pass
	// in 16 steps
	_luminance( dx, dy, dz, sunY, out ) {

		const viewH = this.viewHeight;
		const sx = Math.sqrt( Math.max( 1 - sunY * sunY, 0 ) );
		const tBottom = raySphere( 0, viewH, 0, dx, dy, dz, RG );
		const tMax = tBottom > 0 ? tBottom : raySphere( 0, viewH, 0, dx, dy, dz, RT );
		const steps = 16;
		const cosTheta = dx * sx + dy * sunY;
		const rayPhase = 3 / ( 16 * Math.PI ) * ( cosTheta * cosTheta + 1 );
		const g = this.mieG, g2 = g * g;
		const miePhase = 3 / ( 8 * Math.PI ) * ( ( 1 - g2 ) * ( cosTheta * cosTheta + 1 ) ) / ( ( g2 + 2 ) * Math.pow( Math.max( g2 + 1 - g * cosTheta * 2, 1e-4 ), 1.5 ) );
		const thr = [ 1, 1, 1 ], T = this._t, MS = this._ms;
		out[ 0 ] = out[ 1 ] = out[ 2 ] = 0;
		for ( let i = 0; i < steps; i ++ ) {

			const t0 = i / steps, t1 = ( i + 1 ) / steps;
			const ta = t0 * t0 * tMax, tb = t1 * t1 * tMax;
			const t = ta + ( tb - ta ) * 0.3, dt = tb - ta;
			const px = dx * t, py = viewH + dy * t, pz = dz * t;
			const pr = Math.sqrt( px * px + py * py + pz * pz );
			const m = this.medium( pr - RG );
			const cosSunP = ( px * sx + py * sunY ) / pr;
			this.transmittance( pr, cosSunP, T );
			const shadow = raySphere( px, py, pz, sx, sunY, 0, RG ) > 0 ? 0 : 1;
			bilinear( this.msLUT, C_MS, C_MS, cosSunP * 0.5 + 0.5, ( pr - RG ) / ( RT - RG ), MS );
			for ( let c = 0; c < 3; c ++ ) {

				const S = T[ c ] * shadow * ( m.rayScat[ c ] * rayPhase + m.mieScat * miePhase ) + MS[ c ] * m.scattering[ c ];
				const Ts = Math.exp( - m.extinction[ c ] * dt );
				out[ c ] += thr[ c ] * ( S - S * Ts ) / Math.max( m.extinction[ c ], 1e-6 );
				thr[ c ] *= Ts;

			}

		}

		return out;

	}

	_build() {

		const t0 = performance.now();
		this._buildTransmittance();
		this._buildMultiScat();
		this.table = new Float32Array( C_SUN * 9 );
		this.done = new Uint8Array( C_SUN );
		this.buildMs = performance.now() - t0;

	}

	// one row of the table (on first use: ~1 ms)
	_row( s ) {

		this.done[ s ] = 1;
		const tab = this.table;
		const L = [ 0, 0, 0 ], T = [ 0, 0, 0 ];
		// cosine weighted hemisphere: 6 rings x 8 azimuths over half the sky (it is symmetric about the
		// sun's vertical plane)
		const NR = 6, NA = 8, ce = Math.sqrt( 1 - 0.03 * 0.03 );
		{

			const sunY = C_SUN_MIN + ( 1 - C_SUN_MIN ) * s / ( C_SUN - 1 );
			const o = s * 9;
			for ( let a = 0; a < NA; a ++ ) {

				const phi = ( a + 0.5 ) / NA * Math.PI;
				for ( let b = 0; b < NR; b ++ ) {

					const u = ( b + 0.5 ) / NR, rr = Math.sqrt( u );
					this._luminance( rr * Math.cos( phi ), Math.sqrt( 1 - u ), rr * Math.sin( phi ), sunY, L );
					for ( let c = 0; c < 3; c ++ ) tab[ o + c ] += L[ c ] / ( NA * NR );

				}

				this._luminance( ce * Math.cos( phi ), 0.03, ce * Math.sin( phi ), sunY, L );
				for ( let c = 0; c < 3; c ++ ) tab[ o + 3 + c ] += L[ c ] / NA;

			}

			this.transmittance( RG + 0.001, sunY, T );
			for ( let c = 0; c < 3; c ++ ) tab[ o + 6 + c ] = T[ c ];

		}

	}

	lighting( sunY, out = { sunTransmittance: new THREE.Color(), skyIrradiance: new THREE.Color(), horizon: new THREE.Color() } ) {

		if ( ! this.table ) this._build();
		const x = Math.min( Math.max( ( sunY - C_SUN_MIN ) / ( 1 - C_SUN_MIN ), 0 ), 1 ) * ( C_SUN - 1 );
		const i = Math.min( Math.floor( x ), C_SUN - 2 ), fr = x - i;
		if ( ! this.done[ i ] ) this._row( i );
		if ( ! this.done[ i + 1 ] ) this._row( i + 1 );
		const tab = this.table, a = i * 9, b = a + 9;
		const v = ( k ) => tab[ a + k ] + ( tab[ b + k ] - tab[ a + k ] ) * fr;
		out.skyIrradiance.setRGB( v( 0 ), v( 1 ), v( 2 ) ).multiplyScalar( SUN_ILLUMINANCE );
		out.horizon.setRGB( v( 3 ), v( 4 ), v( 5 ) ).multiplyScalar( SUN_ILLUMINANCE );
		out.sunTransmittance.setRGB( v( 6 ), v( 7 ), v( 8 ) );
		return out;

	}

}

// nearest positive intersection of the ray (o, d) with the planet centred sphere of radius R, -1 if none
function raySphere( ox, oy, oz, dx, dy, dz, R ) {

	const b = ox * dx + oy * dy + oz * dz;
	const c = ox * ox + oy * oy + oz * oz - R * R;
	const disc = b * b - c;
	if ( disc < 0 ) return - 1;
	const sq = Math.sqrt( disc );
	const t0 = - b - sq, t1 = - b + sq;
	return t0 > 0 ? t0 : ( t1 > 0 ? t1 : - 1 );

}

// bilinear lookup of an RGB float table (w x h) at unit coordinates (texel centres at the ends)
function bilinear( lut, w, h, u, v, out ) {

	const x = Math.min( Math.max( u, 0 ), 1 ) * ( w - 1 ), y = Math.min( Math.max( v, 0 ), 1 ) * ( h - 1 );
	const x0 = Math.min( Math.floor( x ), w - 2 ), y0 = Math.min( Math.floor( y ), h - 2 );
	const fx = x - x0, fy = y - y0;
	const a = ( y0 * w + x0 ) * 3, b = a + 3, c = a + w * 3, d = c + 3;
	for ( let k = 0; k < 3; k ++ ) {

		out[ k ] = ( lut[ a + k ] * ( 1 - fx ) + lut[ b + k ] * fx ) * ( 1 - fy ) + ( lut[ c + k ] * ( 1 - fx ) + lut[ d + k ] * fx ) * fy;

	}

	return out;

}
