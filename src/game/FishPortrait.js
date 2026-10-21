import {
	Scene, PerspectiveCamera, OrthographicCamera, Matrix4, Quaternion, Vector2, Vector3, Mesh, BufferGeometry, Float32BufferAttribute,
	ShaderMaterial, DirectionalLight, HemisphereLight, FramebufferTexture, LinearFilter,
} from '../engine/index.js';
import { FishProps } from '../world/village/FishProps.js';
import { FISH, fishLengthCm } from './FishTable.js';
import { holdLocalLights } from '../materials/LocalLights.js';

// The catch card's studio portrait of the fish: the real game model (world/fish, baked by the
// village's FishProps like the fish on ice and on the line), side-on and horizontal (nose left, as in
// a field guide), in its own light.
//
// Tidewater drew it with its WebGPU engine into the card's own canvas. Here it is drawn into the game's
// canvas, inside the card's stage (a scissored viewport), with no second WebGL context and no
// read-back: when the card opens, the world's last frame is copied to a texture on the GPU, and while
// the card is up that frame, blurred and dimmed, and the fish are all that's drawn (cheaper than the
// world). The card's DOM above has no backdrop blur of its own then (GameHUD: .is-gl).
//
//   const fp = new FishPortrait( material );  fp.compile( renderer, environment )  (with the load's shaders)
//   fp.attach( canvas )     the card's stage canvas: the fish is drawn over its box; detach() stops it
//   fp.show( species, kg )  start the card's animation (slide in, tail flick, slow turn)
//   fp.update( dt );  if ( fp.active ) fp.render( renderer, drawWorld )  (App, in place of the world)

// model frame (nose +z, back +y, left flank +x) -> nose toward -x (left on screen), back up, left
// flank toward +z (the camera). FishProps applies a pose after the frame: 'side', undone here.
const PORTRAIT = new Matrix4().makeBasis( new Vector3( 0, 0, 1 ), new Vector3( 0, 1, 0 ), new Vector3( - 1, 0, 0 ) );
const SIDE = new Matrix4().makeBasis( new Vector3( 0, 1, 0 ), new Vector3( 0, 0, 1 ), new Vector3( 1, 0, 0 ) );
const FRAME = PORTRAIT.clone().multiply( SIDE.clone().invert() );
const CURLS = [ - 0.8, - 0.4, 0, 0.4, 0.8 ]; // the tail flick, baked (FishProps bends the body as it builds)
const VFOV = 16; // degrees: a long lens, little perspective distortion
const EXPOSURE = 1.15;
const FADE_IN = 0.42; // s: the world dims and blurs as the card comes up

const _q = new Quaternion(), _q2 = new Quaternion(), _a = new Vector3(), _size = new Vector2();

// the world's frame behind the card: blurred (a golden-angle disc of samples), a little desaturated
// and darkened toward the edges (Tidewater's scrim: rgba(10, 22, 34, 0.55) in the middle to
// rgba(4, 9, 15, 0.86) at the edges, over a 10 px blur)
const BACKDROP = {
	vertexShader: /* glsl */`
		varying vec2 vUv;
		void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4( position.xy, 0.0, 1.0 ); }`,
	fragmentShader: /* glsl */`
		uniform sampler2D frame;
		uniform vec2 texel;
		uniform float radius; // px
		uniform float fade; // 0 the frame as it was .. 1 dimmed and blurred
		varying vec2 vUv;
		void main() {
			vec3 sum = texture2D( frame, vUv ).rgb;
			float r = radius * fade;
			for ( int i = 1; i < 16; i ++ ) {
				float f = float( i );
				float a = f * 2.39996;
				sum += texture2D( frame, vUv + vec2( cos( a ), sin( a ) ) * sqrt( f / 15.0 ) * r * texel ).rgb;
			}
			vec3 c = sum / 16.0;
			c = mix( c, vec3( dot( c, vec3( 0.299, 0.587, 0.114 ) ) ), 0.2 * fade );
			float k = smoothstep( 0.0, 1.0, length( ( vUv - 0.5 ) / vec2( 0.7, 0.6 ) ) );
			vec4 scrim = mix( vec4( 10.0, 22.0, 34.0, 0.55 * 255.0 ), vec4( 4.0, 9.0, 15.0, 0.86 * 255.0 ), k ) / 255.0;
			gl_FragColor = vec4( mix( c, scrim.rgb, scrim.a * fade ), 1.0 );
		}`,
};

export class FishPortrait {

	// material: the fish's (CatchDisplay's GameFish: vertex colours)
	constructor( material ) {

		this.material = material;
		this.scene = new Scene();
		this.camera = new PerspectiveCamera( VFOV, 2.4, 0.05, 50 );
		// the studio: a warm key light from the upper front left, a cool rim behind, a soft fill
		const key = new DirectionalLight( 0xfff1e0, 3.0 );
		key.position.set( - 0.45, 0.78, 0.55 );
		const rim = new DirectionalLight( 0xcfe2ff, 1.4 );
		rim.position.set( 0.6, 0.35, - 0.75 );
		this.scene.add( key, rim, new HemisphereLight( 0xe4ecf0, 0x403a34, 0.9 ) );
		this.meshes = {}; // species -> one mesh per curl

		const quad = new BufferGeometry();
		quad.setAttribute( 'position', new Float32BufferAttribute( [ - 1, - 1, 0, 3, - 1, 0, - 1, 3, 0 ], 3 ) );
		this.backdrop = new Mesh( quad, new ShaderMaterial( {
			...BACKDROP, depthTest: false, depthWrite: false, toneMapped: false,
			uniforms: { frame: { value: null }, texel: { value: new Vector2() }, radius: { value: 14 }, fade: { value: 0 } },
		} ) );
		this.backdrop.frustumCulled = false;
		this.backScene = new Scene();
		this.backScene.add( this.backdrop );
		this.backCamera = new OrthographicCamera();

		this.stage = null; // the card's stage element: where the fish is drawn
		this.live = false; // drawing for a card
		this.species = null;
		this.kg = 0;
		this.t = 0;
		this.frame = null; // FramebufferTexture: the world's last frame (while a card is up)
		this._capture = false;

	}

	get active() {

		return this.live && this.species !== null;

	}

	// with the load's shaders: the fish material in this light, and the backdrop (a stand-in fish:
	// any geometry with vertex colours gives the same program)
	compile( renderer, environment = null ) {

		const g = new BufferGeometry();
		g.setAttribute( 'position', new Float32BufferAttribute( [ 0, 0, 0, 0.1, 0, 0, 0, 0.1, 0 ], 3 ) );
		g.setAttribute( 'normal', new Float32BufferAttribute( [ 0, 0, 1, 0, 0, 1, 0, 0, 1 ], 3 ) );
		g.setAttribute( 'color', new Float32BufferAttribute( [ 1, 1, 1, 1, 1, 1, 1, 1, 1 ], 3 ) );
		const stand = new Mesh( g, this.material );
		const frame = new FramebufferTexture( 1, 1 );
		this.scene.environment = environment;
		this.scene.add( stand );
		this.backdrop.material.uniforms.frame.value = frame;
		const done = Promise.all( [ renderer.compileAsync( this.scene, this.camera ), renderer.compileAsync( this.backScene, this.backCamera ) ] );
		return done.finally( () => {

			this.scene.remove( stand );
			g.dispose();
			frame.dispose();
			this.backdrop.material.uniforms.frame.value = null;

		} );

	}

	// the card's stage canvas (GameHUD): the fish is drawn over its box, in the game's canvas
	attach( canvas ) {

		if ( ! canvas || ! canvas.parentElement ) return false;
		this.stage = canvas.parentElement;
		this.live = true;
		return true;

	}

	show( species, kg ) {

		if ( ! FISH[ species ] ) return;
		this.species = species;
		this.kg = kg;
		this.t = 0;
		this._capture = true;

	}

	detach() {

		this.live = false;
		this.species = null;
		this.stage = null;
		for ( const list of Object.values( this.meshes ) ) for ( const m of list ) m.visible = false;
		// (the copied frame is the size of the screen: only kept while a card is up)
		if ( this.frame ) this.frame.dispose();
		this.frame = null;
		this.backdrop.material.uniforms.frame.value = null;

	}

	update( dt ) {

		if ( this.active ) this.t += dt;

	}

	// (no catalogue thumbnails in Salt Life)
	thumbnail() {

		return Promise.resolve( null );

	}

	thumbUrl() {

		return null;

	}

	// the species' fish, baked at unit length in each curl, the first time it is caught
	_meshes( species ) {

		let list = this.meshes[ species ];
		if ( list ) return list;
		list = this.meshes[ species ] = CURLS.map( ( curl ) => {

			const fp = new FishProps();
			fp.add( 'whole', FISH[ species ].model, FRAME, 'side', 1, { curl, wet: 1, seed: 0.37 } );
			const mesh = fp.build( { lod: 0 } );
			fp.material.dispose();
			mesh.material = this.material;
			mesh.castShadow = mesh.receiveShadow = false;
			mesh.frustumCulled = false;
			mesh.visible = false;
			this.scene.add( mesh );
			return mesh;

		} );
		return list;

	}

	_frame( renderer ) {

		renderer.getDrawingBufferSize( _size );
		const w = Math.max( 1, _size.x ), h = Math.max( 1, _size.y );
		if ( ! this.frame || this.frame.image.width !== w || this.frame.image.height !== h ) {

			if ( this.frame ) this.frame.dispose();
			this.frame = new FramebufferTexture( w, h );
			this.frame.minFilter = this.frame.magFilter = LinearFilter;
			this._capture = true;

		}

		return this.frame;

	}

	// the card animation (Tidewater's): the fish slides in from the left with a tail flick and
	// settles, then turns slowly
	_pose( t ) {

		const ease = ( x ) => 1 - Math.pow( 1 - Math.min( 1, Math.max( 0, x ) ), 3 );
		const inT = ease( t / 0.7 );
		const settle = Math.exp( - Math.max( 0, t - 0.55 ) * 4 ) * Math.sin( Math.max( 0, t - 0.55 ) * 9 );
		return {
			x: - ( 1 - inT ) * 1.6 + settle * 0.05,
			y: ( 1 - inT ) * 0.25,
			yaw: - ( 1 - inT ) * 0.9 + Math.sin( t * 0.55 ) * 0.2 * inT,
			roll: ( 1 - inT ) * 0.5 + Math.sin( t * 0.4 + 1 ) * 0.05,
			pitch: ( 1 - inT ) * - 0.3 + Math.sin( t * 0.7 ) * 0.03,
			curl: Math.sin( t * 13 ) * 0.9 * Math.exp( - t * 1.6 ) * ( t < 0.1 ? t * 10 : 1 ),
		};

	}

	// in place of the world's frame while the card is up. drawWorld() draws the world: the frame the
	// card opens on is copied from it (and again if the canvas changes size). (Salt Life: that frame
	// shows the world alone, the card from the next: the world and the fish in one frame were more
	// triangles than a low-powered device's budget)
	render( renderer, drawWorld ) {

		const frame = this._frame( renderer );
		if ( this._capture ) {

			drawWorld();
			renderer.setRenderTarget( null );
			renderer.copyFramebufferToTexture( frame );
			this._capture = false;
			return;

		}

		// the world behind, blurred and dimmed
		const u = this.backdrop.material.uniforms;
		u.frame.value = frame;
		u.texel.value.set( 1 / frame.image.width, 1 / frame.image.height );
		u.radius.value = 14 * renderer.getPixelRatio();
		u.fade.value = Math.min( 1, this.t / FADE_IN );
		const autoClear = renderer.autoClear, exposure = renderer.toneMappingExposure;
		renderer.autoClear = true;
		renderer.render( this.backScene, this.backCamera );

		// the fish, in the stage's box
		const box = this.stage && this.stage.getBoundingClientRect();
		const cv = renderer.domElement.getBoundingClientRect();
		if ( box && box.width > 1 && box.height > 1 ) {

			const list = this._meshes( this.species );
			const p = this._pose( this.t );
			const pick = Math.round( ( Math.max( - 0.8, Math.min( 0.8, p.curl ) ) + 0.8 ) / 0.4 );
			const L = fishLengthCm( this.species, this.kg ) / 100;
			list.forEach( ( m, i ) => {

				m.visible = i === pick;
				if ( i !== pick ) return;
				_q.setFromAxisAngle( _a.set( 0, 1, 0 ), p.yaw );
				_q.multiply( _q2.setFromAxisAngle( _a.set( 0, 0, 1 ), p.pitch ) );
				_q.multiply( _q2.setFromAxisAngle( _a.set( 1, 0, 0 ), p.roll ) );
				m.quaternion.copy( _q );
				m.position.set( p.x * L, p.y * L, 0 );
				m.scale.setScalar( L );

			} );

			this._aim( L, box.width / box.height );
			const x = box.left - cv.left, y = cv.bottom - box.bottom;
			renderer.setViewport( x, y, box.width, box.height );
			renderer.setScissor( x, y, box.width, box.height );
			renderer.setScissorTest( true );
			renderer.autoClear = false;
			renderer.clearDepth();
			renderer.toneMappingExposure = EXPOSURE;
			// (the fish's material also takes the island's lamps at night: not in the studio)
			holdLocalLights( () => renderer.render( this.scene, this.camera ) );
			renderer.setScissorTest( false );
			renderer.setViewport( 0, 0, cv.width, cv.height );

		}

		renderer.autoClear = autoClear;
		renderer.toneMappingExposure = exposure;

	}

	// the camera: the fish's body length fills `fill` of the stage's width, seen a touch from above
	_aim( L, aspect, fill = 0.8 ) {

		const cam = this.camera;
		cam.aspect = aspect;
		const tanH = Math.tan( VFOV * Math.PI / 360 ) * aspect;
		const dist = ( L * 1.08 / fill ) / 2 / tanH;
		cam.near = Math.max( 0.02, dist - L * 2 );
		cam.far = dist + L * 4;
		cam.updateProjectionMatrix();
		cam.position.set( 0, dist * 0.06, dist );
		cam.lookAt( 0, 0, 0 );
		cam.updateMatrixWorld();

	}

}
