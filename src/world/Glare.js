import * as THREE from '../engine/index.js';
import { G } from '../core/Globals.js';

// (M15) A light seen at night, as a glare: a soft disc of light, additive, its size kept to at least a few
// pixels however far off, drawn at most NEAREST m along its line of sight (the far plane's 12 km), as bright as
// the light is, over the earth's curve and through the night's air. For the lighthouse and the harbour lights.
//   const g = new Glare( colour );  scene.add( g.sprite )
//   g.place( camera, x, y, z, bright, size, heightPx, px )   (bright 0..1: the light now; size m: its lantern;
//     px: the least it's drawn, pixels)
//   seen( d, hLight, hEye, range, visibility ) -> 0..1: how much of it reaches you d m off

const NEAREST = 11000;
const EARTH = 6371000;
let _map = null;

// how far apart two heights over the sea (m) see each other over the earth's curve (m)
export const horizonOf = ( h1, h2 ) => Math.sqrt( 2 * EARTH * Math.max( 0, h1 ) ) + Math.sqrt( 2 * EARTH * Math.max( 0.5, h2 ) );

// how much of a light reaches you d m off: over the horizon (the curve), and the air between (`range` m is
// how far a clear night lets it be seen, x the weather's visibility)
export const seen = ( d, hLight, hEye, range, visibility = 1 ) => ( 1 - Math.min( 1, Math.max( 0, ( d - horizonOf( hLight, hEye ) ) / 300 ) ) ) * Math.exp( - 3 * d / ( range * Math.max( 0.05, visibility ) ) );

function glareMap() {

	if ( _map ) return _map;
	const S = 128, c = document.createElement( 'canvas' );
	c.width = c.height = S;
	const g = c.getContext( '2d' ), grad = g.createRadialGradient( S / 2, S / 2, 0, S / 2, S / 2, S / 2 );
	// (a solid core, a fifth of it across, so a point of it a few pixels wide still shows its colour, then its halo)
	grad.addColorStop( 0, 'rgba(255,255,255,1)' );
	grad.addColorStop( 0.2, 'rgba(255,255,255,0.95)' );
	grad.addColorStop( 0.42, 'rgba(255,255,255,0.22)' );
	grad.addColorStop( 1, 'rgba(255,255,255,0)' );
	g.fillStyle = grad;
	g.fillRect( 0, 0, S, S );
	_map = new THREE.CanvasTexture( c );
	_map.colorSpace = THREE.SRGBColorSpace;
	return _map;

}

export class Glare {

	// (gain: its colour this many times over: a coloured light's one channel needs it to show as a white's three)
	constructor( colour = 0xfff4de, name = 'Glare', gain = 1 ) {

		this.material = new THREE.SpriteMaterial( { map: glareMap(), color: new THREE.Color( colour ).multiplyScalar( gain ), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false } );
		this.material.name = name;
		this.sprite = new THREE.Sprite( this.material );
		this.sprite.name = name;
		this.sprite.renderOrder = 5;
		this.sprite.frustumCulled = false;
		this.sprite.visible = false;

	}

	place( camera, x, y, z, bright, size, heightPx = 720, px = 6 ) {

		const c = camera.position, dx = c.x - x, dy = c.y - y, dz = c.z - z, d = Math.max( 1, Math.hypot( dx, dy, dz ) );
		const s = Math.min( 1, NEAREST / d ), rad = 2 * Math.tan( camera.fov * Math.PI / 360 ) / Math.max( 1, heightPx );
		this.sprite.position.set( c.x - dx * s, c.y - dy * s, c.z - dz * s );
		this.sprite.scale.setScalar( Math.max( size * s, d * s * rad * px ) );
		this.material.opacity = Math.min( 1, bright * 1.6 );
		this.sprite.visible = bright > 0.004;

	}

}

// how lit the island's lights are now, 0..1: from dusk to dawn (G.night)
export const lightsOn = () => Math.min( 1, Math.max( 0, ( G.night.value - 0.15 ) / 0.25 ) );
