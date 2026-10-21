import { DoubleSide, Matrix4, MeshStandardMaterial } from '../engine/index.js';
import { FishProps } from '../world/village/FishProps.js';
import { SPECIES } from '../world/fish/FishSpecies.js';
import { FISH, fishLengthCm } from './FishTable.js';

// Real fish (the world's fish models, baked like the village's: world/village/FishProps) for the game:
//  - the fish you just landed, hanging from the line by the gills and struggling, for a moment
//  - fish on ice at the buyer's stall (static)
// A hanging fish is baked the first time its species is caught, at unit length in three curls of its
// body (the struggle flips between them); its mesh is then placed, turned and scaled. (Tidewater drew
// both through one instanced batch with the curl in its vertex shader, on its WebGPU engine.)
const CURLS = [ - 0.7, 0, 0.7 ];
const ORIGIN = new Matrix4();

// body length (m) for a weight: the species' length-weight relation (FishTable.fishLengthCm), so the
// fish on the line is the size the catch card reports
export function fishLength( species, kg ) {

	return fishLengthCm( species, kg ) / 100;

}

export class CatchDisplay {

	// stall: the fish on ice, { species, frame (Matrix4, world), L, pose ('side' | 'sideFlip'), ice }
	constructor( { scene, stall = [] } ) {

		this.scene = scene;
		this.material = new MeshStandardMaterial( { vertexColors: true, roughness: 0.38, metalness: 0, side: DoubleSide } );
		this.material.name = 'GameFish';
		this.hanging = {}; // species -> its meshes, one per curl
		this.shown = null;
		this.t = 0;
		this.stallMesh = null;
		if ( stall.length ) {

			const fp = new FishProps();
			for ( const s of stall ) fp.add( 'whole', FISH[ s.species ].model, s.frame, s.pose || 'side', s.L, { wet: 0.7 } );
			for ( const s of stall.filter( ( x ) => x.ice ) ) fp.add( 'ice', null, s.ice, 'flat', 0.5, { seed: 0.3 } );
			this.stallMesh = this.bake( fp );
			this.stallMesh.name = 'StallFish';
			scene.add( this.stallMesh );

		}

	}

	bake( fp ) {

		const mesh = fp.build();
		fp.material.dispose();
		mesh.material = this.material;
		mesh.castShadow = false;
		return mesh;

	}

	meshesOf( species ) {

		let list = this.hanging[ species ];
		if ( list ) return list;
		const model = FISH[ species ].model;
		list = this.hanging[ species ] = CURLS.map( ( curl ) => {

			const fp = new FishProps();
			fp.add( 'whole', model, ORIGIN, 'gill', 1, { anchor: FishProps.gillAnchor( model ), curl, wet: 1 } );
			const mesh = this.bake( fp );
			mesh.name = 'CaughtFish';
			mesh.visible = false;
			mesh.frustumCulled = false;
			this.scene.add( mesh );
			return mesh;

		} );
		return list;

	}

	// hang `species` from `mouth` (world point: the end of the line), facing the camera
	show( species, kg, mouth, faceYaw, dt ) {

		if ( ! FISH[ species ] ) return;
		if ( this.shown !== species ) this.hide();
		this.shown = species;
		this.t += dt;
		const L = fishLength( species, kg );
		// struggling: the body curls side to side and the whole fish swings on the line, tiring
		const flap = Math.sin( this.t * 11 ) * 0.9 * Math.exp( - this.t * 0.5 );
		const swing = Math.sin( this.t * 2.6 ) * 0.25 * Math.exp( - this.t * 0.4 );
		const pick = flap < - 0.3 ? 0 : flap > 0.3 ? 2 : 1;
		this.meshesOf( species ).forEach( ( mesh, i ) => {

			mesh.visible = i === pick;
			if ( i !== pick ) return;
			mesh.position.copy( mouth );
			mesh.rotation.set( 0, faceYaw + swing, 0 );
			mesh.scale.setScalar( L );

		} );

	}

	hide() {

		if ( this.shown === null ) return;
		for ( const mesh of this.hanging[ this.shown ] || [] ) mesh.visible = false;
		this.shown = null;
		this.t = 0;

	}

}

export { SPECIES };
