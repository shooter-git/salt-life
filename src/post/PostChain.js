import * as THREE from '../engine/index.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// The post chain on laptops (high tier): the scene in half float, a soft bloom (the sun's glint on the
// sea, lit windows and lanterns at night) and SMAA, then tone mapping and sRGB output. Tidewater's own
// chain (GTAO, TAAU, motion blur, auto exposure, lens flare) needed its WebGPU engine; phones keep
// drawing straight to the screen.

export class PostChain {

	constructor( renderer, scene, camera ) {

		this.renderer = renderer;
		const size = renderer.getDrawingBufferSize( new THREE.Vector2() );
		const target = new THREE.WebGLRenderTarget( size.x, size.y, { type: THREE.HalfFloatType } );
		this.composer = new EffectComposer( renderer, target );
		this.renderPass = new RenderPass( scene, camera );
		this.bloom = new UnrealBloomPass( new THREE.Vector2( size.x, size.y ), 0.18, 0.55, 0.92 );
		this.smaa = new SMAAPass( size.x, size.y );
		this.composer.addPass( this.renderPass );
		this.composer.addPass( this.bloom );
		this.composer.addPass( new OutputPass() );
		this.composer.addPass( this.smaa );
		this._size = size.clone();

	}

	render() {

		// follow the stage's resizes (rotation, dynamic resolution)
		const size = this.renderer.getDrawingBufferSize( new THREE.Vector2() );
		if ( ! size.equals( this._size ) ) {

			this._size.copy( size );
			this.composer.setPixelRatio( 1 );
			this.composer.setSize( size.x, size.y );

		}

		this.composer.render();

	}

	dispose() {

		this.composer.dispose();

	}

}
