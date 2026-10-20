import * as THREE from './engine/index.js';
import { createStage } from '@allthespaces/portal/three';
import { G } from './core/Globals.js';
import { Input } from './core/Input.js';
import { SaveStore } from './core/SaveStore.js';
import { TerrainData } from './world/TerrainData.js';
import { decodeIsland } from './world/terrain/IslandDecode.js';
import { setDetailData } from './world/terrain/DetailTextures.js';
import { WORLD } from './world/WorldLayout.js';
import { Colliders } from './world/Colliders.js';
import { Village } from './world/Village.js';
import { Terrain } from './world/Terrain.js';
import { Rocks } from './world/Rocks.js';
import { Vegetation } from './world/Vegetation.js';
import { BoatModel } from './world/BoatModel.js';
import { Sky } from './sky/Sky.js';
import { Waves } from './ocean/Waves.js';
import { WaterQuery } from './ocean/WaterQuery.js';
import { WaterSurface } from './ocean/WaterSurface.js';
import { ShoreWaves } from './ocean/ShoreWaves.js';
import { computeShoreField } from './world/ShoreField.js';
import { Player } from './player/Player.js';
import { BoatController } from './player/BoatController.js';
import { GameState } from './game/GameState.js';
import { FishStand } from './game/FishStand.js';
import { Chandlery } from './game/Chandlery.js';
import { TouchControls } from './ui/TouchControls.js';
import { Hud } from './ui/Hud.js';
import { Wake } from './ocean/Wake.js';
import { PostChain } from './post/PostChain.js';
import { releaseGeometries, releaseTextures, uploadTextures, watchContext } from './core/ReleaseAfterUpload.js';

// Salt Life: the island, the sea and the boat, drawn with three.js inside All the Spaces. It follows
// Tidewater's App (same systems, same order each frame); what isn't ported yet is simply not here.
//
// `portal` is the All the Spaces SDK (connect()): its tier ('low' | 'mid' | 'high') sizes everything.

const SHADOW_SIZE = { mid: 1024, high: 2048 };
const ISLAND = { low: 'world/island-1024.bin', mid: 'world/island.bin', high: 'world/island.bin' };
// WebGL drawn on the CPU draws at most a phone screen's pixels (a laptop's is three times as many)
const CPU_PIXELS = 360_000;
const LENS_REACH = 0.02; // m below the surface before the view counts as under water
const UNDERWATER = new THREE.Color( 0.03, 0.17, 0.2 );
const _c = new THREE.Color();
const _c3 = new THREE.Vector3();
const _size = new THREE.Vector2();

export class App {

	constructor( portal ) {

		this.portal = portal;
		// ?tier=low|mid|high tries another device tier when running on its own (pnpm dev)
		const asked = portal.standalone && new URLSearchParams( location.search ).get( 'tier' );
		this.tier = [ 'low', 'mid', 'high' ].includes( asked ) ? asked : portal.tier;
		this.settings = {
			timeOfDay: 16.2,
			sunAzimuth: 0, // degrees: turns the sun's daily path about the vertical
			timeSpeed: 0, // hours per real second (T lets the day run)
			exposure: 0.55,
		};

	}

	async init( progress = async () => {} ) {

		const portal = this.portal, tier = this.tier;

		// ---------------------------------------------------------------- saves and the island
		await progress( 0.05, 'Fetching the island' );
		this.store = new SaveStore( portal, { onError: ( e ) => this.hud && this.hud.toast( saveErrorText( e ) ) } );
		const [ bytes, detail ] = await Promise.all( [
			// low-powered devices get the island at 2 m (a quarter of the memory), as their ground is drawn
			fetch( ISLAND[ tier ] ?? ISLAND.low ).then( ( r ) => {

				if ( ! r.ok ) throw new Error( `${ r.url }: ${ r.status }` );
				return r.arrayBuffer();

			} ),
			fetch( 'world/detail.bin' ).then( ( r ) => {

				if ( ! r.ok ) throw new Error( `${ r.url }: ${ r.status }` );
				return r.arrayBuffer();

			} ),
			this.store.load(),
		] );
		setDetailData( new Uint8Array( detail ) );
		this.state = new GameState( this.store );

		await progress( 0.25, 'Shaping the island' );
		this.terrainData = new TerrainData( 7, decodeIsland( new Uint8Array( bytes ) ) );

		// ---------------------------------------------------------------- stage
		const stage = this.stage = createStage( portal, { fov: 70, shadows: tier !== 'low' } );
		const { renderer, camera } = stage;
		// Tidewater's grading: ACES (the SDK's default AgX greys out the sand and the sea)
		renderer.toneMapping = THREE.ACESFilmicToneMapping;
		renderer.toneMappingExposure = this.settings.exposure;
		// the near clip plane is the lens: it slices the water surface at the waterline
		camera.near = 0.1;
		camera.far = 12000;
		camera.updateProjectionMatrix();
		this.renderer = renderer;
		// WebGL drawn on the CPU (no graphics card, or a blocklisted one): frames are paced (pacedFrame)
		this.cpuGL = drawsOnCpu( renderer.getContext() );
		this._drawn = null; // the last frame's fence
		this._owed = 0; // s not yet played while waiting for it
		this._rest = false; // the frame after a drawn one is skipped
		if ( this.cpuGL ) this.fitCpuPixels();

		this.camera = camera;
		const scene = this.scene = new THREE.Scene();

		this.input = new Input( renderer.domElement, { portal } );
		this.touch = new TouchControls( this.input );
		if ( portal.viewport.touch ) this.touch.show( true );
		this.hud = new Hud();
		renderer.domElement.addEventListener( 'click', () => this.input.requestLock() );

		// ---------------------------------------------------------------- sky
		await progress( 0.4, 'Lighting the sky' );
		this.sky = new Sky( { scene, renderer, tier } );
		// the eye adapts at dusk and at night: the whole scene's exposure follows (Tidewater's auto exposure)
		this.sky.sceneAdaptation = true;
		if ( SHADOW_SIZE[ tier ] ) {

			const s = this.sky.sun;
			s.castShadow = true;
			s.shadow.mapSize.setScalar( SHADOW_SIZE[ tier ] );
			const r = tier === 'high' ? 50 : 32;
			Object.assign( s.shadow.camera, { left: - r, right: r, top: r, bottom: - r, near: 1, far: 400 } );
			s.shadow.bias = - 0.0004;
			s.shadow.normalBias = 0.04;

		}

		// ---------------------------------------------------------------- island
		await progress( 0.5, 'Laying out the ground' );
		this.colliders = new Colliders();
		// the village flattens building pads into the heightmap: build it before the ground (whose
		// textures are made from the heights) and everything placed on it
		this.village = new Village( { scene, terrain: this.terrainData, colliders: this.colliders, tier } );
		await this.village.init( renderer );
		// Joe's fish stand and Marta's chandlery (Tidewater's Game builds them; the fishing game isn't
		// ported yet): their scanned props load while the rest of the island is made
		this.stand = new FishStand( { scene, terrain: this.terrainData, colliders: this.colliders, tier } );
		this.chandlery = new Chandlery( { scene, terrain: this.terrainData, colliders: this.colliders, tier } );
		this.terrain = new Terrain( { scene, terrainData: this.terrainData, tier } );
		uploadTextures( renderer, [ this.terrain.heightTexture, this.terrain.normalTexture, this.terrain.splatTexture ] );
		// boulders, blocks, talus and outcrops (shaded like the ground's rock)
		this.rocks = new Rocks( { scene, terrain: this.terrain, colliders: this.colliders, village: this.village, castShadow: tier !== 'low', lite: tier === 'low' } );
		this.vegetation = new Vegetation( { scene, terrain: this.terrainData, ground: this.terrain, renderer, tier, village: this.village } );
		await this.vegetation.init();
		// the island's masks are read only while it's being made (the ground's maps, the rocks and the
		// plants placed on it); from here on only its heights are
		for ( const k of [ 'rock', 'sand', 'path', 'gully', 'seagrass', 'rubble', 'scarp' ] ) this.terrainData[ k ] = null;

		// ---------------------------------------------------------------- ocean
		await progress( 0.6, 'Rolling in the swell' );
		this.waves = new Waves( { tier, terrain: this.terrainData } );
		// the breaking shore waves: their phase from the wave travel-time field around the island
		this.shoreField = computeShoreField( this.terrainData, { res: 512, swellDir: [ WORLD.swellDir.x, WORLD.swellDir.y ] } );
		this.shore = new ShoreWaves( { field: this.shoreField } );
		this.query = new WaterQuery( this.waves, this.terrainData, this.shore );
		this.water = new WaterSurface( { scene, waves: this.waves, terrain: this.terrain, shore: this.shore, tier } );

		// ---------------------------------------------------------------- boat and player
		await progress( 0.7, 'Mooring the boat' );
		this.boat = new BoatModel();
		scene.add( this.boat.group );
		this.boat.group.position.copy( WORLD.boatDock.position );
		this.boat.group.rotation.y = WORLD.boatDock.heading;
		this.boat.group.traverse( ( o ) => {

			if ( o.isMesh ) o.castShadow = o.castShadow && tier !== 'low';

		} );
		this.boatCtl = new BoatController( { model: this.boat, query: this.query, terrain: this.terrainData, colliders: this.colliders } );
		this.wake = new Wake( { scene, boat: this.boatCtl, waves: this.waves, tier } );
		if ( tier === 'low' ) {

			this.nearDetail = [];
			// (the display fish are one mesh spanning the village: left out on these devices)
			for ( const f of this.village.fish || [] ) f.visible = false;
			this.stand.group?.traverse( ( o ) => o.isMesh && this.nearDetail.push( { o, dist: 60 } ) );
			this.chandlery.group?.traverse( ( o ) => o.isMesh && this.nearDetail.push( { o, dist: 60 } ) );
			for ( const k of [ 'fittings', 'trap', 'wood', 'wheel', 'throttle', 'radar', 'propeller', 'rudder' ] ) if ( this.boat.meshes[ k ] ) this.nearDetail.push( { o: this.boat.meshes[ k ], dist: 70 } );
			for ( const d of this.nearDetail ) if ( ! d.o.geometry.boundingSphere ) d.o.geometry.computeBoundingSphere();

		}

		// laptops: bloom and SMAA (phones draw straight to the screen)
		this.post = tier === 'high' ? new PostChain( renderer, scene, camera ) : null;
		this.player = new Player( { camera, input: this.input, terrain: this.terrainData, colliders: this.colliders, query: this.query, boat: this.boatCtl } );

		// ---------------------------------------------------------------- shaders
		await progress( 0.8, 'Preparing the shaders' );
		// the CPU copies of the big static data go once it's on the GPU (phones' script memory)
		releaseGeometries( this.village.group );
		releaseTextures( this.terrain.mesh );
		// the stalls' scans (mid and high) arrive after the game has started: they're not needed to
		// begin, and the download before it does is limited
		Promise.all( [ this.stand.ready, this.chandlery.ready ] ).then( () => {

			for ( const root of [ this.stand.group, this.chandlery.group ] ) {

				releaseGeometries( root );
				releaseTextures( root );

			}

			return renderer.compileAsync( scene, camera );

		} ).catch( ( e ) => console.warn( 'stalls', e ) );
		watchContext( renderer );
		// WebGL drawn on the CPU draws the loading frames tiny: they're for placing everything,
		// uploading it and making the GPU's programs, which a few pixels do as well, and there a
		// full-size frame takes seconds (on a laptop's screen, enough to miss the 45 s a creation has
		// to load). The game's first frame is then drawn by its loop.
		const full = this.cpuGL ? { ratio: renderer.getPixelRatio(), size: renderer.getSize( new THREE.Vector2() ) } : null;
		if ( full ) {

			renderer.setPixelRatio( 1 );
			renderer.setSize( 8, 8, false );

		}

		this.frame( 0 ); // places the camera, the LOD grids and the sky for the compile
		// (with the near detail it hid: compiled now, not the first time it shows)
		const near = ( this.nearDetail || [] ).filter( ( d ) => ! d.o.visible );
		for ( const d of near ) d.o.visible = true;
		await renderer.compileAsync( scene, camera );
		for ( const d of near ) d.o.visible = false;
		await this.sky.compiled;
		// a shader's first use asks the GPU for its uniforms and attributes, which waits for all the
		// drawing queued before it: seconds on a device that draws on its CPU. Every one is used here,
		// before the game starts (the sky's passes would otherwise first run mid-game)
		for ( const p of renderer.info.programs ) {

			p.getUniforms();
			p.getAttributes();

		}

		this.frame( 1 / 60 );
		if ( full ) {

			renderer.setPixelRatio( full.ratio );
			renderer.setSize( full.size.x, full.size.y, false );

		}

	}

	start() {

		this.stage.loop( ( dt ) => this.cpuGL ? this.pacedFrame( dt ) : this.frame( dt ) );
		this._started = true;
		this.hud.showHint( this.input.lastDevice );

	}

	frame( dt ) {

		const s = this.settings;
		G.dt.value = dt;
		G.time.value += dt;
		if ( s.timeSpeed !== 0 ) s.timeOfDay = ( s.timeOfDay + dt * s.timeSpeed + 24 ) % 24;

		// ---- player / boat (boat physics first so the cameras follow this frame's pose)
		const input = this.input;
		input.update( dt );
		if ( input.hit( 'KeyT' ) ) this.toggleTime();
		this.boatCtl.update( dt );
		this.player.update( dt );
		this.sky.update( s.timeOfDay, s.sunAzimuth, this.camera );

		// ---- water
		this.query.setCamera( this.camera.position.x, this.camera.position.z );
		this.boatCtl.queueQueries();
		this.query.update();
		const h = this.query.cpu[ 0 ];
		this.cameraWaterHeight = Number.isFinite( h ) ? h : 0;
		G.cameraWaterHeight.value = this.cameraWaterHeight;
		const under = this.camera.position.y < this.cameraWaterHeight - LENS_REACH;
		G.cameraUnderwater.value = under ? 1 : 0;
		if ( under ) {

			// under water: the light is green-blue and gone within a few tens of metres
			_c.copy( UNDERWATER ).multiplyScalar( 0.15 + 0.85 * ( 1 - G.night.value ) );
			this.scene.fog.color.copy( _c );
			this.scene.fog.near = 0;
			this.scene.fog.far = 28;

		} else {

			this.scene.fog.near = this.sky.fogNear;
			this.scene.fog.far = this.sky.fogFar;

		}

		// ---- world
		this.terrain.update( this.camera );
		this.village.update( dt );
		this.rocks.update( this.camera );
		this.vegetation.update( dt, this.camera );
		this.water.update( this.camera );
		this.boat.update( dt );
		this.wake.update( dt );

		// ---- render
		if ( this.nearDetail ) this.updateNearDetail();
		this.renderer.toneMappingExposure = s.exposure * this.sky.adaptation;
		if ( this.post ) this.post.render();
		else this.renderer.render( this.scene, this.camera );

		this.touch.update( this.player );
		this.hud.update( dt, { player: this.player, device: input.lastDevice } );
		input.endFrame();

	}

	// WebGL drawn on the CPU: a frame begins only once the last one has been drawn (asked without
	// waiting; its time is carried over meanwhile), and never straight after one, so the page answers
	// in between (showing a frame holds it up for as long as the frame took to draw). Left to queue up
	// there, frames come slower, and the page stops answering while the queue drains, for many seconds;
	// waiting for each frame instead would leave the page no time to answer either
	pacedFrame( dt ) {

		const gl = this.renderer.getContext();
		if ( this._drawn ) {

			if ( this._rest || gl.clientWaitSync( this._drawn, 0, 0 ) === gl.TIMEOUT_EXPIRED ) {

				this._rest = false;
				this._owed += dt;
				return;

			}

			gl.deleteSync( this._drawn );

		}

		// (whenever the stage has sized the canvas again)
		const canvas = this.renderer.domElement;
		if ( canvas.width * canvas.height > CPU_PIXELS * 1.05 ) this.fitCpuPixels();
		this.frame( Math.min( 0.1, dt + this._owed ) );
		this._owed = 0;
		this._drawn = gl.fenceSync( gl.SYNC_GPU_COMMANDS_COMPLETE, 0 );
		this._rest = true;
		gl.flush();

	}

	// WebGL drawn on the CPU: the canvas's resolution brought down to CPU_PIXELS (the stage sizes it
	// for the screen; its dynamic resolution doesn't see paced frames)
	fitCpuPixels() {

		const r = this.renderer, size = r.getSize( _size ), ratio = r.getPixelRatio();
		const pixels = size.x * size.y * ratio * ratio;
		if ( pixels > CPU_PIXELS ) r.setPixelRatio( ratio * Math.sqrt( CPU_PIXELS / pixels ) );

	}

	// low-powered devices: small detail (the boat's fittings and gear, the stalls) only near the camera,
	// for their triangle budget
	updateNearDetail() {

		const cam = this.camera.position;
		for ( const d of this.nearDetail ) {

			const s = d.o.geometry.boundingSphere;
			_c3.copy( s.center ).applyMatrix4( d.o.matrixWorld );
			d.o.visible = _c3.distanceTo( cam ) - s.radius < d.dist;

		}

	}

	// T: let the day run (about 8 minutes per day) or stop it
	toggleTime() {

		const s = this.settings;
		if ( s.timeSpeed !== 0 ) {

			this._timeSpeed = s.timeSpeed;
			s.timeSpeed = 0;

		} else {

			s.timeSpeed = this._timeSpeed || 0.05;

		}

		this.hud.toast( s.timeSpeed !== 0 ? 'Time running' : 'Time paused' );

	}

}

// whether WebGL draws on the CPU here (SwiftShader, llvmpipe, Microsoft's basic renderer)
function drawsOnCpu( gl ) {

	let name = gl.getParameter( gl.RENDERER ) || '';
	// (Chrome names only "WebKit WebGL" there)
	if ( /webkit webgl/i.test( name ) ) {

		const info = gl.getExtension( 'WEBGL_debug_renderer_info' );
		if ( info ) name = gl.getParameter( info.UNMASKED_RENDERER_WEBGL ) || name;

	}

	return /swiftshader|llvmpipe|softpipe|software|basic render/i.test( name );

}

function saveErrorText( e ) {

	if ( e && e.name === 'BridgeError' && e.code === 'too-big' ) return 'Couldn\'t save: too much to keep';
	if ( e && /newer version|somewhere else/.test( e.message ) ) return 'Your progress was saved on another device. Rejoin to carry on.';
	return 'Couldn\'t save just now';

}
