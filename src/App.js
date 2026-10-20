import * as THREE from './engine/index.js';
import { createStage } from '@allthespaces/portal/three';
import { G } from './core/Globals.js';
import { Input } from './core/Input.js';
import { SaveStore } from './core/SaveStore.js';
import { TerrainData } from './world/TerrainData.js';
import { decodeIsland } from './world/terrain/IslandBake.js';
import { WORLD } from './world/WorldLayout.js';
import { Colliders } from './world/Colliders.js';
import { Terrain } from './world/Terrain.js';
import { BoatModel } from './world/BoatModel.js';
import { Sky } from './sky/Sky.js';
import { Waves } from './ocean/Waves.js';
import { WaterQuery } from './ocean/WaterQuery.js';
import { WaterSurface } from './ocean/WaterSurface.js';
import { Player } from './player/Player.js';
import { BoatController } from './player/BoatController.js';
import { GameState } from './game/GameState.js';
import { TouchControls } from './ui/TouchControls.js';
import { Hud } from './ui/Hud.js';

// Salt Life: the island, the sea and the boat, drawn with three.js inside All the Spaces. It follows
// Tidewater's App (same systems, same order each frame); what isn't ported yet is simply not here.
//
// `portal` is the All the Spaces SDK (connect()): its tier ('low' | 'mid' | 'high') sizes everything.

const SHADOW_SIZE = { mid: 1024, high: 2048 };
const ISLAND = { low: 'world/island-1024.bin', mid: 'world/island.bin', high: 'world/island.bin' };
const LENS_REACH = 0.02; // m below the surface before the view counts as under water
const UNDERWATER = new THREE.Color( 0.03, 0.17, 0.2 );
const _c = new THREE.Color();

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
		const [ bytes ] = await Promise.all( [
			// low-powered devices get the island at 2 m (a quarter of the memory), as their ground is drawn
			fetch( ISLAND[ tier ] ?? ISLAND.low ).then( ( r ) => {

				if ( ! r.ok ) throw new Error( `${ r.url }: ${ r.status }` );
				return r.arrayBuffer();

			} ),
			this.store.load(),
		] );
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
		this.terrain = new Terrain( { scene, terrainData: this.terrainData, tier } );

		// ---------------------------------------------------------------- ocean
		await progress( 0.6, 'Rolling in the swell' );
		this.waves = new Waves( { tier, terrain: this.terrainData } );
		this.query = new WaterQuery( this.waves, this.terrainData );
		this.water = new WaterSurface( { scene, waves: this.waves, terrain: this.terrain, tier } );

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
		this.player = new Player( { camera, input: this.input, terrain: this.terrainData, colliders: this.colliders, query: this.query, boat: this.boatCtl } );

		// ---------------------------------------------------------------- shaders
		await progress( 0.8, 'Preparing the shaders' );
		this.frame( 0 ); // places the camera, the LOD grids and the sky for the compile
		await renderer.compileAsync( scene, camera );
		this.frame( 1 / 60 );

	}

	start() {

		this.stage.loop( ( dt ) => this.frame( dt ) );
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
		this.water.update( this.camera );
		this.boat.update( dt );

		// ---- render
		this.renderer.toneMappingExposure = s.exposure;
		this.renderer.render( this.scene, this.camera );

		this.touch.update( this.player );
		this.hud.update( dt, { player: this.player, device: input.lastDevice } );
		input.endFrame();

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

function saveErrorText( e ) {

	if ( e && e.name === 'BridgeError' && e.code === 'too-big' ) return 'Couldn\'t save: too much to keep';
	if ( e && /newer version|somewhere else/.test( e.message ) ) return 'Your progress was saved on another device. Rejoin to carry on.';
	return 'Couldn\'t save just now';

}
