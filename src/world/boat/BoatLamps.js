import * as THREE from '../../engine/index.js';
import { G } from '../../core/Globals.js';

// (Salt Life) A boat's lamps at night, as a boat shows them: what other boats (and you, from the shore)
// see of it in the dark, and its searchlight.
//  - Under way: the sidelights (red to port, green to starboard, each from dead ahead to 22.5° abaft the
//    beam), the white masthead light ahead (225°) and the white stern light (135° aft): seen only from
//    their own sectors, so a boat's lights say which way it's heading. Moored or at anchor: one
//    all-round white anchor light at the masthead.
//  - The searchlight on the wheelhouse roof: a beam ahead (a soft cone in the night air), its lens
//    glaring when it points at you, and its light on the water and what it meets (a LocalLights spot).
// The lights are glowing points that keep a few pixels across at any distance (one draw), the beam a
// cone (one draw); both fade in at dusk. One BoatLamps per boat (yours, and each other player's: their
// own materials, so each boat's state is its own; one program each).
//   const l = new BoatLamps( boat );  boatGroup.add( l.group );  l.set( { underway, spot } )
//   l.addLight( localLights ) / l.removeLight( localLights )   (the searchlight's light)
// boat: the BoatModel (its lines and fittings say where the lamps are).

const SPOT_DIR = new THREE.Vector3( 0, - Math.sin( 0.15 ), Math.cos( 0.15 ) ); // ahead and down: on the water ~10-60 m ahead
const BEAM = 30; // m
const BEAM_ANGLE = 0.16; // rad, the cone's half angle

const POINTS_VS = /* glsl */`
attribute vec3 lampColor;
attribute vec4 lampSector; // xyz: the middle of the sector it's seen from (boat frame); w: cos of half its width
attribute float lampKind; // 0 under way, 1 at anchor, 2 the searchlight
uniform float lampNight;
uniform float lampUnderway;
uniform float lampSpot;
uniform float lampScale; // device pixels per CSS pixel
varying vec3 vColor;
varying float vAlpha;
void main() {
	vec4 world = modelMatrix * vec4( position, 1.0 );
	vec3 toEye = cameraPosition - world.xyz;
	float dist = length( toEye );
	// the eye in the boat's frame: within the lamp's sector? (a soft edge, as a lens's cut-off)
	vec3 eyeDir = normalize( transpose( mat3( modelMatrix ) ) * toEye );
	float inSector = smoothstep( lampSector.w - 0.04, lampSector.w + 0.04, dot( eyeDir, normalize( lampSector.xyz ) ) );
	float on = lampKind < 0.5 ? lampUnderway : lampKind < 1.5 ? 1.0 - lampUnderway : lampSpot;
	// the searchlight glares when it points at you
	float glare = lampKind > 1.5 ? pow( max( dot( eyeDir, normalize( lampSector.xyz ) ), 0.0 ), 8.0 ) * 2.5 + 0.4 : 1.0;
	vColor = lampColor;
	vAlpha = on * inSector * lampNight * glare;
	vec4 mv = viewMatrix * world;
	gl_Position = projectionMatrix * mv;
	// a few pixels at any distance (a lamp is a point of light: nav lights are made to be seen for
	// miles), bigger up close
	gl_PointSize = clamp( 120.0 / max( dist, 0.5 ), 4.5, 26.0 ) * lampScale * ( lampKind > 1.5 ? 1.6 : 1.0 ) * step( 0.002, vAlpha );
}
`;

const POINTS_FS = /* glsl */`
varying vec3 vColor;
varying float vAlpha;
void main() {
	vec2 c = gl_PointCoord * 2.0 - 1.0;
	float r2 = dot( c, c );
	if ( r2 > 1.0 ) discard;
	// a hot core (past white: it blooms, as a lamp does in the dark) and a soft halo
	float k = exp( - r2 * 6.0 ) * 2.4 + exp( - r2 * 2.0 ) * 0.4;
	gl_FragColor = vec4( vColor * k * vAlpha, 1.0 );
}
`;

const BEAM_VS = /* glsl */`
varying float vAlong;
varying vec3 vNormal;
varying vec3 vView;
varying float vY;
void main() {
	vAlong = position.z / ${ BEAM.toFixed( 1 ) };
	vec4 world = modelMatrix * vec4( position, 1.0 );
	vY = world.y;
	vNormal = normalize( mat3( modelMatrix ) * normal );
	vView = normalize( cameraPosition - world.xyz );
	gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const BEAM_FS = /* glsl */`
uniform float beamOn;
uniform float beamSea;
varying float vAlong;
varying vec3 vNormal;
varying vec3 vView;
varying float vY;
void main() {
	// light scattered in the night air: strongest by the lamp, fading along the beam, soft at the cone's
	// edges (where you look through less of it)
	float edge = pow( abs( dot( normalize( vNormal ), normalize( vView ) ) ), 1.6 );
	float fall = pow( clamp( 1.0 - vAlong, 0.0, 1.0 ), 1.7 ) * smoothstep( 0.0, 0.04, vAlong );
	// (in the air only: where it meets the sea, it's the pool of light on the water)
	float a = beamOn * edge * fall * 0.22 * smoothstep( beamSea - 0.2, beamSea + 0.5, vY );
	gl_FragColor = vec4( vec3( 1.0, 0.93, 0.8 ) * a, 1.0 );
}
`;

export class BoatLamps {

	constructor( boat ) {

		const L = boat.lines;
		this.group = new THREE.Group();
		this.group.name = 'BoatLamps';
		const sternY = L.sheerY( 0 ) + 0.1;
		const cosOf = ( deg ) => Math.cos( THREE.MathUtils.degToRad( deg ) );
		const side = ( s ) => [ s * Math.sin( THREE.MathUtils.degToRad( 56.25 ) ), 0, Math.cos( THREE.MathUtils.degToRad( 56.25 ) ) ];
		const sp = boat.searchlight || new THREE.Vector3( 0.42, 3.4, 1.15 );
		// [ position (boat frame), colour, sector middle, half its width (deg), kind ]
		const lamps = [
			[ [ 0.47, 3.45, - 0.47 ], [ 1.0, 0.08, 0.05 ], side( 1 ), 56.25, 0 ], // port: red
			[ [ - 0.47, 3.45, - 0.47 ], [ 0.1, 1.0, 0.35 ], side( - 1 ), 56.25, 0 ], // starboard: green
			[ [ 0, 3.97, - 0.5 ], [ 1.0, 0.96, 0.88 ], [ 0, 0, 1 ], 112.5, 0 ], // masthead
			[ [ 0, sternY, L.zAft - 0.05 ], [ 1.0, 0.96, 0.88 ], [ 0, 0, - 1 ], 67.5, 0 ], // stern
			[ [ 0, 4.05, - 0.5 ], [ 1.0, 0.96, 0.88 ], [ 0, 1, 0 ], 180, 1 ], // anchor light, all round
			[ [ sp.x, sp.y, sp.z ], [ 1.0, 0.95, 0.84 ], SPOT_DIR.toArray(), 40, 2 ], // the searchlight's lens
		];
		const pos = [], col = [], sec = [], kind = [];
		for ( const [ p, c, s, deg, k ] of lamps ) {

			pos.push( ...p );
			col.push( ...c );
			sec.push( ...s, deg >= 180 ? - 2 : cosOf( deg ) );
			kind.push( k );

		}

		const g = new THREE.BufferGeometry();
		g.setAttribute( 'position', new THREE.Float32BufferAttribute( pos, 3 ) );
		g.setAttribute( 'lampColor', new THREE.Float32BufferAttribute( col, 3 ) );
		g.setAttribute( 'lampSector', new THREE.Float32BufferAttribute( sec, 4 ) );
		g.setAttribute( 'lampKind', new THREE.Float32BufferAttribute( kind, 1 ) );
		this.uniforms = {
			lampNight: { value: 0 }, lampUnderway: { value: 0 }, lampSpot: { value: 0 },
			lampScale: { value: Math.min( window.devicePixelRatio || 1, 2 ) },
		};
		this.points = new THREE.Points( g, new THREE.ShaderMaterial( {
			uniforms: this.uniforms, vertexShader: POINTS_VS, fragmentShader: POINTS_FS,
			transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
		} ) );
		this.points.name = 'BoatLampPoints';
		this.points.frustumCulled = false;
		this.points.renderOrder = 3;
		this.group.add( this.points );

		// the beam: an open cone from the lens, along the light
		const cone = new THREE.ConeGeometry( Math.tan( BEAM_ANGLE ) * BEAM, BEAM, 24, 1, true );
		cone.translate( 0, - BEAM / 2, 0 ); // the apex at the origin, the cone along -y
		cone.rotateX( - Math.PI / 2 ); // along +z
		this.beamUniforms = { beamOn: { value: 0 }, beamSea: G.seaLevel };
		this.beam = new THREE.Mesh( cone, new THREE.ShaderMaterial( {
			uniforms: this.beamUniforms, vertexShader: BEAM_VS, fragmentShader: BEAM_FS,
			transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
		} ) );
		this.beam.name = 'SearchlightBeam';
		this.beam.position.copy( sp );
		this.beam.quaternion.setFromUnitVectors( new THREE.Vector3( 0, 0, 1 ), SPOT_DIR );
		this.beam.frustumCulled = false;
		this.beam.renderOrder = 3;
		this.beam.visible = false;
		this.group.add( this.beam );

		this.underway = false;
		this.spot = false;
		this._spotAt = sp.clone();
		this.light = null;

	}

	// under way (or moored), the searchlight on (or off); the night's level from the sky
	set( { underway = this.underway, spot = this.spot } = {} ) {

		this.underway = underway;
		this.spot = spot;
		const night = THREE.MathUtils.smoothstep( G.night.value, 0.1, 0.6 );
		const U = this.uniforms;
		U.lampNight.value = night;
		U.lampUnderway.value = underway ? 1 : 0;
		U.lampSpot.value = spot ? 1 : 0;
		this.beamUniforms.beamOn.value = spot ? night : 0;
		this.beam.visible = spot && night > 0.01;
		if ( this.light ) this.light.enabled = spot;

	}

	// the searchlight's light (LocalLights: on the water and whatever it meets, out to 60 m)
	addLight( lights ) {

		if ( this.light ) return this.light;
		const obj = this.group, at = this._spotAt;
		this.light = lights.add( {
			position: new THREE.Vector3(), dir: new THREE.Vector3(), color: new THREE.Color( 1.0, 0.92, 0.78 ),
			intensity: 150, range: 60, kind: 'searchlight', enabled: this.spot,
			cosInner: Math.cos( BEAM_ANGLE * 0.6 ), cosOuter: Math.cos( BEAM_ANGLE * 1.3 ),
			update() {

				obj.updateWorldMatrix( true, false );
				this.position.copy( at ).applyMatrix4( obj.matrixWorld );
				this.dir.copy( SPOT_DIR ).transformDirection( obj.matrixWorld );

			},
		} );
		return this.light;

	}

	removeLight( lights ) {

		if ( this.light ) lights.remove( this.light );
		this.light = null;

	}

	dispose() {

		this.points.geometry.dispose();
		this.points.material.dispose();
		this.beam.geometry.dispose();
		this.beam.material.dispose();

	}

}
