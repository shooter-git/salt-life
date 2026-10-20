import * as THREE from '../engine/index.js';
import { Sky as SkyDome } from 'three/addons/objects/Sky.js';
import { G } from '../core/Globals.js';

// The sky and the light it gives: three's analytic sky (Preetham, with its procedural clouds on
// devices that can afford them), the sun or the moon as the key light, a hemisphere light for the
// sky's fill, and a prefiltered environment map of the sky for reflections, re-made only when the sun
// has moved. Tidewater's physically based atmosphere and volumetric clouds were WebGPU compute work.

const _up = new THREE.Vector3( 0, 1, 0 );
const _c = new THREE.Color();
const SUN_WARM = new THREE.Color( 1.0, 0.42, 0.16 );
const SUN_NOON = new THREE.Color( 1.0, 0.95, 0.88 );
const MOON = new THREE.Color( 0.55, 0.65, 1.0 );
const FOG_DISTANCE = { low: [ 250, 1600 ], mid: [ 400, 3000 ], high: [ 600, 5000 ] };

export class Sky {

	constructor( { scene, renderer, tier = 'low' } ) {

		this.scene = scene;
		this.renderer = renderer;

		const dome = this.dome = new SkyDome();
		dome.scale.setScalar( 4000 );
		dome.frustumCulled = false;
		const u = this.uniforms = dome.material.uniforms;
		u.turbidity.value = 3.2;
		u.rayleigh.value = 1.3;
		u.mieCoefficient.value = 0.004;
		u.mieDirectionalG.value = 0.82;
		u.cloudCoverage.value = tier === 'low' ? 0 : 0.32;
		u.cloudDensity.value = 0.35;
		u.time = G.time;
		scene.add( dome );

		this.sun = new THREE.DirectionalLight( 0xffffff, 2 );
		this.sun.name = 'Sun';
		this.hemi = new THREE.HemisphereLight( 0x9cc4e4, 0x3a3326, 0.6 );
		scene.add( this.sun, this.sun.target, this.hemi );

		const [ near, far ] = FOG_DISTANCE[ tier ] ?? FOG_DISTANCE.low;
		this.fogNear = near;
		this.fogFar = far;
		this.fog = scene.fog = new THREE.Fog( 0x9fbcd0, near, far );

		// reflections: the sky alone, prefiltered (PMREM), re-made when the sun moves
		this.pmrem = new THREE.PMREMGenerator( renderer );
		this.envScene = new THREE.Scene();
		this.envScene.add( new THREE.Mesh( dome.geometry, dome.material ) );
		this.envTarget = null;
		this._envSun = new THREE.Vector3( 0, - 1, 0 );

		this.sunDir = new THREE.Vector3(); // true sun direction (the sky)
		this.moonDir = new THREE.Vector3();

	}

	// hours: time of day; azimuth (degrees) turns the sun's daily path about the vertical
	update( hours, azimuth = 0, camera = null ) {

		const dir = sunDirectionFromTime( hours, 24, 6, this.sunDir ).applyAxisAngle( _up, THREE.MathUtils.degToRad( azimuth ) );
		this.uniforms.sunPosition.value.copy( dir );
		if ( camera ) this.dome.position.copy( camera.position );

		// below the horizon the moon takes over as the key light
		const night = THREE.MathUtils.smoothstep( - dir.y, 0.02, 0.18 );
		G.night.value = night;
		this.moonDir.set( - dir.x, Math.abs( dir.y ) * 0.8 + 0.25, - dir.z ).normalize();
		const light = dir.y > - 0.07 ? dir : this.moonDir;
		G.sunDir.value.copy( light );

		// key light: reddened and dimmed near the horizon; moonlight at night
		const day = THREE.MathUtils.smoothstep( dir.y, - 0.04, 0.12 );
		if ( dir.y > - 0.07 ) {

			_c.copy( SUN_WARM ).lerp( SUN_NOON, THREE.MathUtils.smoothstep( dir.y, 0.0, 0.45 ) );
			this.sun.color.copy( _c );
			this.sun.intensity = 3.4 * day;

		} else {

			this.sun.color.copy( MOON );
			this.sun.intensity = 0.25 * night;

		}

		G.sunColor.value.copy( this.sun.color ).multiplyScalar( this.sun.intensity );
		const anchor = camera ? camera.position : _up.clone().set( 0, 0, 0 );
		this.sun.position.copy( anchor ).addScaledVector( light, 200 );
		this.sun.target.position.copy( anchor );

		// sky fill: blue by day, a little blue at night; the ground bounces warm light back
		this.hemi.color.setRGB( 0.55, 0.7, 0.9 ).multiplyScalar( 0.15 + 0.85 * day ).lerp( MOON, night * 0.5 );
		this.hemi.intensity = 0.3 + 0.15 * day;
		this.hemi.groundColor.setRGB( 0.32, 0.28, 0.2 ).multiplyScalar( 0.1 + 0.9 * day );
		G.skyIrradiance.value.copy( this.hemi.color ).multiplyScalar( this.hemi.intensity );

		// the horizon haze the fog fades into: pale blue by day, warm toward sunset, dark at night
		const sunset = THREE.MathUtils.smoothstep( dir.y, - 0.05, 0.05 ) * ( 1 - THREE.MathUtils.smoothstep( dir.y, 0.08, 0.3 ) );
		_c.setRGB( 0.62, 0.74, 0.86 ).lerp( new THREE.Color( 0.86, 0.62, 0.45 ), sunset * 0.6 ).multiplyScalar( 0.06 + 0.94 * day );
		this.fog.color.copy( _c );
		G.horizonColor.value.copy( _c );
		if ( this.scene.background && this.scene.background.isColor ) this.scene.background.copy( _c );

		this.scene.environmentIntensity = 0.1 + 0.2 * day;

		// re-make the reflections when the sun has moved more than ~2 degrees
		if ( ! this.envTarget || this._envSun.dot( dir ) < 0.9994 ) {

			this._envSun.copy( dir );
			const old = this.envTarget;
			// without the sun's disc: blurred, its energy would flood every reflection (the sun's own
			// highlight comes from the key light)
			this.uniforms.showSunDisc.value = 0;
			this.envTarget = this.pmrem.fromScene( this.envScene, 0, 0.1, 100 );
			this.uniforms.showSunDisc.value = 1;
			this.scene.environment = this.envTarget.texture;
			if ( old ) old.dispose();

		}

	}

	dispose() {

		this.pmrem.dispose();
		if ( this.envTarget ) this.envTarget.dispose();

	}

}

// Simple solar position model. Returns direction toward the sun (world: +x east, -z north, +y up).
export function sunDirectionFromTime( hours, latitudeDeg = 24, declinationDeg = 6, out = new THREE.Vector3() ) {

	const phi = THREE.MathUtils.degToRad( latitudeDeg );
	const dec = THREE.MathUtils.degToRad( declinationDeg );
	const H = THREE.MathUtils.degToRad( ( hours - 12 ) * 15 );
	const east = - Math.cos( dec ) * Math.sin( H );
	const north = Math.cos( phi ) * Math.sin( dec ) - Math.sin( phi ) * Math.cos( dec ) * Math.cos( H );
	const up = Math.sin( phi ) * Math.sin( dec ) + Math.cos( phi ) * Math.cos( dec ) * Math.cos( H );
	return out.set( east, up, - north ).normalize();

}
