import * as THREE from '../engine/index.js';

// Renders the sky (atmosphere + clouds, no sun disk) into a cube map and prefilters it for image based
// lighting (`scene.environment`). Refreshed when the sun moves or periodically so drifting clouds stay
// in sync. The work is spread over frames so none pays for a whole refresh: a cube face per frame,
// then the prefilter.
//
// Port notes: Tidewater filtered its own GGX cube and SH irradiance in compute (one roughness level
// per frame, into a back buffer). Here three's PMREM does the prefilter (its GGX importance sampling
// into the cubeUV atlas, which MeshStandardMaterial reads for both the specular and the diffuse
// light); the PMREM target is made once and filtered in place on every refresh, so the materials
// keep the same texture.

export class Environment {

	// skyMaterial: the sky's environment variant (no sun or moon disc, panorama clouds)
	constructor( renderer, scene, skyMaterial, { size = 128, interval = 3 } = {} ) {

		this.renderer = renderer;
		this.scene = scene;
		this.size = size;
		this.interval = interval; // s between refreshes for the drifting clouds

		this.cubeTarget = new THREE.WebGLCubeRenderTarget( size, { type: THREE.HalfFloatType, generateMipmaps: false, depthBuffer: false } );
		this.cubeCamera = new THREE.CubeCamera( 0.1, 10, this.cubeTarget );
		this.envScene = new THREE.Scene();
		const box = new THREE.Mesh( new THREE.BoxGeometry( 1, 1, 1 ), skyMaterial );
		box.frustumCulled = false;
		this.envScene.add( box );
		this.pmrem = new THREE.PMREMGenerator( renderer );
		this.pmrem.compileCubemapShader();
		this.target = null; // the PMREM (scene.environment)

		this.lastSun = new THREE.Vector3( 0, - 2, 0 );
		this.timer = 0;
		this.step = - 1; // progress of the refresh under way (-1: idle, 0: faces drawn)
		this.primed = false;
		this.passes = 0; // passes drawn by the last update

	}

	// sun: the true sun direction (a refresh once it has moved ~1 degree); soon: refresh on the next
	// frames (the clouds have faded in); force: refresh now, at once
	update( dt, sun, soon = false, force = false ) {

		this.timer -= dt;
		this.passes = 0;
		if ( soon ) this.timer = 0;

		if ( force || ! this.primed ) {

			this.primed = true;
			this.lastSun.copy( sun );
			for ( let i = 0; i < 6; i ++ ) this._face( i );
			this._filter();
			this.step = - 1;
			this.timer = this.interval;
			return;

		}

		if ( this.step >= 0 ) {

			// a face per frame, then the prefilter
			if ( this.step < 6 ) this._face( this.step ++ );
			else {

				this._filter();
				this.step = - 1;

			}

			return;

		}

		if ( sun.dot( this.lastSun ) > 0.99985 && this.timer > 0 ) return;
		this.lastSun.copy( sun );
		this.timer = this.interval;
		this.step = 0;
		this._face( this.step ++ );

	}

	_face( i ) {

		const r = this.renderer, cam = this.cubeCamera;
		if ( cam.coordinateSystem !== r.coordinateSystem ) {

			cam.coordinateSystem = r.coordinateSystem;
			cam.updateCoordinateSystem();

		}

		cam.updateMatrixWorld();
		const target = r.getRenderTarget(), face = r.getActiveCubeFace(), mip = r.getActiveMipmapLevel();
		r.setRenderTarget( this.cubeTarget, i );
		r.render( this.envScene, cam.children[ i ] );
		r.setRenderTarget( target, face, mip );
		this.passes ++;

	}

	_filter() {

		this.target = this.pmrem.fromCubemap( this.cubeTarget.texture, this.target );
		if ( this.scene.environment !== this.target.texture ) this.scene.environment = this.target.texture;
		this.passes += 2 * Math.log2( this.size ) + 2;

	}

	dispose() {

		this.pmrem.dispose();
		this.cubeTarget.dispose();
		if ( this.target ) this.target.dispose();

	}

}
