import * as THREE from '../engine/index.js';
import { G } from '../core/Globals.js';
import { Glare, horizonOf, seen, lightsOn } from './Glare.js';

// (M15) The lighthouse on the north-west headland, over the windward reef it warns ships off: a masonry tower
// in red and white bands on an octagonal stone plinth, its gallery and railing, a glazed lantern (its frames
// red, its panes catching the sky) under a red dome with a ventilator ball, as the Bahamas' and the Antilles'
// old lights are. At night it's lit: Fl W 10s (one white flash every ten seconds), from a lens turning two
// panels round in twenty; the glow of the lens in its lantern; its beams swept through the air near it; and
// its flash seen from far out, as the sea's mark to steer home by. Its light stands about 75 m over the sea,
// over the horizon from about 40 km out (by the earth's curve, your eye's height and its); nearer, the air
// dims it as it does anything (the weather's visibility), but a light at night is seen far past where the
// day's haze hides the land.
//   const l = new Lighthouse( { scene, terrain, colliders } )   (before the terrain's drawn: it levels its pad)
//   l.update( camera, visibility, heightPx )   (visibility: Sky's, x a clear day's; heightPx: the canvas's)

export const LIGHTHOUSE = {
	x: - 250, z: - 764, pad: 5.5, // m: where, and the level ground round it
	plinth: { r: 3.3, h: 1.1 }, // m: its octagonal stone foot
	tower: { r0: 2.45, r1: 1.75, h: 15 }, // m: its foot's radius, its top's, its height over the plinth
	bands: 5, // red and white, from the foot up
	lantern: { r: 1.35, h: 2.3 }, // m: the glazed room
	period: 20, panels: 2, // s for a turn of the lens, its panels: a flash every period / panels s
	lobe: 3.2 * Math.PI / 180, // the beam's half-width: how long a flash lasts (a third of a second)
	glow: 0.08, // the lens's glow between the flashes, of a flash's
	visible: 30000, // m: how far a clear night lets it be seen (its luminous range, about 16 sea miles)
	beam: { length: 420, spread: 0.075 }, // m, and its half-angle (rad): the beams seen in the air near it
	colours: { white: 0xece8de, red: 0xa8302a, stone: 0x8f877a, frame: 0x7a1f1a, roof: 0x8a2420, rail: 0x2a2826 },
};

export { horizonOf };

// how much of a flash is seen at time t (s) from a bearing (rad, about the light: atan2( - dz, dx ) of the
// way to the one seeing it), 0..1: its panels' beams turning past
export function flashAt( t, bearing ) {

	const L = LIGHTHOUSE, turn = ( t / L.period ) * Math.PI * 2;
	let k = 0;
	for ( let p = 0; p < L.panels; p ++ ) {

		let a = bearing - ( turn + p * Math.PI * 2 / L.panels );
		a = Math.atan2( Math.sin( a ), Math.cos( a ) );
		k = Math.max( k, Math.exp( - ( ( a / L.lobe ) ** 2 ) ) );

	}

	return k;

}



// a lathe's points from [ r, y ] pairs
const lathe = ( pts, seg ) => new THREE.LatheGeometry( pts.map( ( [ r, y ] ) => new THREE.Vector2( r, y ) ), seg );

// geometry with a colour on every vertex
function coloured( g, colour ) {

	const c = new THREE.Color( colour ), n = g.attributes.position.count, a = new Float32Array( n * 3 );
	for ( let i = 0; i < n; i ++ ) a.set( [ c.r, c.g, c.b ], i * 3 );
	g.setAttribute( 'color', new THREE.BufferAttribute( a, 3 ) );
	return g.index ? g.toNonIndexed() : g;

}

function merge( list ) {

	let n = 0;
	for ( const g of list ) n += g.attributes.position.count;
	const pos = new Float32Array( n * 3 ), nor = new Float32Array( n * 3 ), col = new Float32Array( n * 3 );
	let o = 0;
	for ( const g of list ) {

		pos.set( g.attributes.position.array, o * 3 );
		nor.set( g.attributes.normal.array, o * 3 );
		col.set( g.attributes.color.array, o * 3 );
		o += g.attributes.position.count;

	}

	const g = new THREE.BufferGeometry();
	g.setAttribute( 'position', new THREE.BufferAttribute( pos, 3 ) );
	g.setAttribute( 'normal', new THREE.BufferAttribute( nor, 3 ) );
	g.setAttribute( 'color', new THREE.BufferAttribute( col, 3 ) );
	return g;

}

const at = ( g, x, y, z, ry = 0 ) => {

	g.rotateY( ry );
	g.translate( x, y, z );
	return g;

};

export class Lighthouse {

	constructor( { scene, terrain, colliders = null } ) {

		const L = LIGHTHOUSE, C = L.colours, P = L.plinth, T = L.tower, N = L.lantern;
		// its pad: the ground about it levelled (as the village's are), to its middle's height
		let sum = 0, n = 0;
		for ( let a = 0; a < 12; a ++ ) for ( const r of [ 0, L.pad * 0.5, L.pad ] ) {

			sum += terrain.heightAt( L.x + Math.cos( a / 2 ) * r, L.z + Math.sin( a / 2 ) * r );
			n ++;

		}

		const y0 = this.ground = sum / n;
		terrain.flatten( L.x, L.z, L.pad, y0, 6 );
		this.group = new THREE.Group();
		this.group.name = 'Lighthouse';
		this.group.position.set( L.x, y0, L.z );
		scene.add( this.group );

		const body = new THREE.MeshStandardMaterial( { vertexColors: true, roughness: 0.82, metalness: 0 } );
		body.name = 'Lighthouse';
		const parts = [];
		// the plinth: an octagon of dressed stone, a step at its foot
		parts.push( coloured( lathe( [ [ 0, - 0.6 ], [ P.r + 0.35, - 0.6 ], [ P.r + 0.35, 0.25 ], [ P.r, 0.3 ], [ P.r, P.h ], [ 0, P.h ] ], 8 ), C.stone ) );
		// the tower, in its bands (each its own lathe, one colour): tapering, its top flaring out in a corbelled
		// cornice to carry the gallery
		const yb = P.h, yt = P.h + T.h;
		const rAt = ( y ) => T.r0 + ( T.r1 - T.r0 ) * ( ( y - yb ) / T.h );
		for ( let b = 0; b < L.bands; b ++ ) {

			const a = yb + T.h * b / L.bands, c = yb + T.h * ( b + 1 ) / L.bands;
			parts.push( coloured( lathe( [ [ rAt( a ), a ], [ rAt( c ), c ] ], 40 ), b % 2 ? C.red : C.white ) );

		}

		parts.push( coloured( lathe( [ [ T.r1, yt ], [ T.r1 + 0.25, yt + 0.2 ], [ T.r1 + 0.55, yt + 0.42 ], [ T.r1 + 0.62, yt + 0.5 ] ], 40 ), C.white ) );
		// the gallery's deck
		const yg = yt + 0.5, R = T.r1 + 0.62;
		parts.push( coloured( lathe( [ [ 0, yg ], [ R + 0.12, yg ], [ R + 0.12, yg + 0.14 ], [ 0, yg + 0.14 ] ], 40 ), C.stone ) );
		// the door, and a window on the landing up each third, their frames dark in the white
		const door = new THREE.BoxGeometry( 1.0, 2.1, 0.2 );
		parts.push( coloured( at( door, 0, yb + 1.05, T.r0 - 0.04 + 0.06 ), C.rail ) );
		for ( let k = 1; k < 4; k ++ ) {

			const y = yb + T.h * k / 4.2, w = new THREE.BoxGeometry( 0.5, 0.9, 0.2 );
			const ang = k * 2.1;
			parts.push( coloured( at( w, 0, y, rAt( y ) - 0.04, ang ), C.rail ) );

		}

		// the railing: posts and two rails round the gallery
		const yr = yg + 0.14;
		for ( let k = 0; k < 24; k ++ ) {

			const a = k / 24 * Math.PI * 2, p = new THREE.CylinderGeometry( 0.03, 0.03, 1.05, 5 );
			parts.push( coloured( at( p, Math.cos( a ) * ( R + 0.05 ), yr + 0.52, Math.sin( a ) * ( R + 0.05 ) ), C.rail ) );

		}

		for ( const h of [ 0.55, 1.05 ] ) {

			const ring = new THREE.TorusGeometry( R + 0.05, 0.025, 4, 48 );
			ring.rotateX( Math.PI / 2 );
			parts.push( coloured( at( ring, 0, yr + h, 0 ), C.rail ) );

		}

		// the lantern: a low wall, then its glazing's frames (twelve sides, two rows of panes), its roof a red dome
		// with a ventilator ball and a lightning rod
		const yl = yr, sides = 12;
		parts.push( coloured( lathe( [ [ N.r, yl ], [ N.r, yl + 0.55 ], [ 0, yl + 0.55 ] ], sides ), C.white ) );
		const yw = yl + 0.55, hw = N.h - 0.55;
		for ( let k = 0; k < sides; k ++ ) {

			const a = ( k + 0.5 ) / sides * Math.PI * 2, bar = new THREE.BoxGeometry( 0.07, hw, 0.07 );
			parts.push( coloured( at( bar, Math.sin( a ) * N.r, yw + hw / 2, Math.cos( a ) * N.r, a ), C.frame ) );

		}

		for ( const h of [ 0, hw / 2, hw ] ) parts.push( coloured( lathe( [ [ N.r + 0.03, yw + h - 0.04 ], [ N.r + 0.03, yw + h + 0.04 ] ], sides ), C.frame ) );
		const yd = yw + hw;
		parts.push( coloured( lathe( [ [ N.r + 0.18, yd ], [ N.r + 0.18, yd + 0.08 ], [ N.r * 0.95, yd + 0.38 ], [ N.r * 0.7, yd + 0.75 ], [ N.r * 0.32, yd + 1.0 ], [ 0.14, yd + 1.08 ], [ 0, yd + 1.08 ] ], 24 ), C.roof ) );
		const ball = new THREE.SphereGeometry( 0.26, 12, 8 );
		parts.push( coloured( at( ball, 0, yd + 1.3, 0 ), C.rail ) );
		parts.push( coloured( at( new THREE.CylinderGeometry( 0.02, 0.02, 1.4, 4 ), 0, yd + 2.1, 0 ), C.rail ) );
		const mesh = new THREE.Mesh( merge( parts ), body );
		mesh.castShadow = mesh.receiveShadow = true;
		this.group.add( mesh );
		for ( const g of parts ) g.dispose();

		// the panes: glass catching the sky
		const glass = new THREE.MeshStandardMaterial( { color: 0x2c3a40, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.35, depthWrite: false, envMapIntensity: 1 } );
		glass.name = 'LighthouseGlass';
		const panes = new THREE.Mesh( new THREE.CylinderGeometry( N.r - 0.02, N.r - 0.02, hw, sides, 1, true ), glass );
		panes.position.y = yw + hw / 2;
		panes.rotation.y = Math.PI / sides;
		panes.renderOrder = 3;
		this.group.add( panes );
		// the lens inside it: a stack of glass rings, lit at night
		const lensMat = this.lensMat = new THREE.MeshBasicMaterial( { color: 0x6f7470, toneMapped: true } );
		const lens = new THREE.Mesh( new THREE.CylinderGeometry( 0.45, 0.45, 1.15, 16, 1 ), lensMat );
		lens.position.y = yw + hw * 0.5;
		this.group.add( lens );
		this.focal = yw + hw * 0.5; // (over the ground)

		// at night: its beams through the air near it (two cones from the lens, turning with it), and its flash
		this.beams = this.beamMesh();
		this.beams.position.y = this.focal;
		this.group.add( this.beams );
		this.glare = new Glare( 0xfff4de, 'LighthouseGlare' );
		scene.add( this.glare.sprite );

		this.footprints = [ { x: L.x, z: L.z, r: P.r + 2.5 } ];
		if ( colliders ) colliders.addCylinder( L.x, L.z, P.r + 0.35, y0 - 0.6, y0 + yd + 1.2, { tag: 'lighthouse' } );
		this._c = new THREE.Vector3();
		this._lit = 0;

	}

	// the beams: two cones out from the lens on opposite sides, glowing in the air (brighter looking along one,
	// fading out along it); drawn additively, no depth written
	beamMesh() {

		const B = LIGHTHOUSE.beam, cone = new THREE.ConeGeometry( B.length * Math.tan( B.spread ), B.length, 24, 1, true );
		cone.translate( 0, - B.length / 2, 0 );
		cone.rotateZ( Math.PI / 2 ); // (its tip at the lens, along +x)
		const g = new THREE.BufferGeometry();
		const a = cone.toNonIndexed(), b = a.clone();
		b.rotateY( Math.PI );
		const n = a.attributes.position.count, pos = new Float32Array( n * 6 ), nor = new Float32Array( n * 6 );
		pos.set( a.attributes.position.array, 0 );
		pos.set( b.attributes.position.array, n * 3 );
		nor.set( a.attributes.normal.array, 0 );
		nor.set( b.attributes.normal.array, n * 3 );
		g.setAttribute( 'position', new THREE.BufferAttribute( pos, 3 ) );
		g.setAttribute( 'normal', new THREE.BufferAttribute( nor, 3 ) );
		const m = this.beamMat = new THREE.ShaderMaterial( {
			uniforms: { beamLit: { value: 0 }, beamLength: { value: B.length }, beamCam: { value: new THREE.Vector3() }, beamFocal: { value: new THREE.Vector3() } },
			vertexShader: /* glsl */`
				varying vec3 vW;
				varying vec3 vN;
				varying float vAlong;
				uniform float beamLength;
				void main() {
					vAlong = abs( position.x ) / beamLength;
					vec4 w = modelMatrix * vec4( position, 1.0 );
					vW = w.xyz;
					vN = normalize( mat3( modelMatrix ) * normal );
					gl_Position = projectionMatrix * viewMatrix * w;
				}`,
			fragmentShader: /* glsl */`
				varying vec3 vW;
				varying vec3 vN;
				varying float vAlong;
				uniform float beamLit;
				uniform vec3 beamCam;
				uniform vec3 beamFocal;
				void main() {
					// (scattered forward: brighter looking along it, toward the lens; fading out along it; and toward
					// its sides, where the line of sight through it is short: by how squarely its surface is seen)
					vec3 v = normalize( beamCam - vW ), b = normalize( vW - beamFocal );
					float fwd = 0.2 + 0.8 * pow( max( 0.0, - dot( v, b ) ) * 0.5 + 0.5, 6.0 );
					float side = pow( abs( dot( normalize( vN ), v ) ), 2.0 );
					float a = beamLit * fwd * side * ( 1.0 - smoothstep( 0.0, 1.0, vAlong ) ) * 0.016;
					gl_FragColor = vec4( vec3( 1.0, 0.96, 0.86 ) * a, 1.0 );
				}`,
			transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
		} );
		m.name = 'LighthouseBeam';
		const mesh = new THREE.Mesh( g, m );
		mesh.name = 'LighthouseBeams';
		mesh.frustumCulled = false;
		mesh.renderOrder = 4;
		mesh.visible = false;
		return mesh;

	}

	// per frame: lit from dusk to dawn; the lens's turn; the flash as seen from the camera
	update( camera, visibility = 1, heightPx = 720 ) {

		const L = LIGHTHOUSE, lit = this._lit = lightsOn();
		const on = lit > 0;
		this.beams.visible = on;
		if ( ! on ) this.glare.sprite.visible = false;
		const t = G.time.value, turn = ( t / L.period ) * Math.PI * 2;
		this.beams.rotation.y = turn;
		this.lensMat.color.setRGB( 0.44 + 2.2 * lit, 0.45 + 2.1 * lit, 0.44 + 1.9 * lit );
		if ( ! on ) return;
		const fx = L.x, fy = this.ground + this.focal, fz = L.z;
		const c = camera.position, dx = c.x - fx, dz = c.z - fz, dy = c.y - fy, d = Math.hypot( dx, dy, dz );
		this.beamMat.uniforms.beamLit.value = lit * Math.max( 0, 1 - d / 4000 );
		this.beamMat.uniforms.beamCam.value.copy( c );
		this.beamMat.uniforms.beamFocal.value.set( fx, fy, fz );
		// the flash: how near a panel's beam is to pointing at the camera (its bearing; the beams lie along +x
		// turned by rotation.y)
		const k = flashAt( t, Math.atan2( - dz, dx ) );
		// as it's seen from here: over the horizon, through the air; its lantern's size, or a few pixels (more in
		// a flash)
		const bright = lit * seen( d, fy - G.seaLevel.value, c.y - G.seaLevel.value, L.visible, visibility ) * ( L.glow + ( 1 - L.glow ) * k );
		this.glare.place( camera, fx, fy, fz, bright, 3.5 + 6 * k, heightPx, 6 + 26 * k );

	}

}
