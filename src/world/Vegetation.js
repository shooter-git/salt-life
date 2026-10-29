import * as THREE from '../engine/index.js';
import { G } from '../core/Globals.js';
import { VegSite, scatterSteps, grassMaskSteps, RULES } from './vegetation/Scatter.js';
import { VegType, LodLevel } from './vegetation/InstanceLOD.js';
import { GrassField, GRASS_TIERS } from './vegetation/GrassField.js';
import { vegUniforms, uCamPos, uGustOffset } from './vegetation/VegNodes.js';
import {
	buildPalmNear, buildPalmFar, buildYoungPalm, buildFern, buildTreeNear, buildShrubNear, buildBanana, buildElephantEar, buildHeliconia, buildStrelitzia,
	lobeVariantGeometry, LOBE_TABLE, TREE_VARIANTS, SHRUB_VARIANTS, UNDERSTORY, BROADLEAF, buildMonsteraMesh, buildPlantKind, buildMangroveRoots,
} from './vegetation/PlantGeometry.js';
import { vegMaterial, PLANT_LEAF, canopyMaterialDef, rootMaterialDef, createCanopyBakeMaterials, impostorColor, uCanopyNear } from './vegetation/VegMaterials.js';
import { ImpostorAtlas, buildImpostorQuad } from './vegetation/Impostors.js';
import { LeafAtlas } from './vegetation/LeafTextures.js';
import { getDetailTexture } from './terrain/DetailTextures.js';

// GLSL variant index of an instance (VegNodes.vegVariantOf)
const variantOf = ( seed, isShrub ) => `vegVariantOf( ${ seed }, ${ isShrub } )`;

// Island vegetation: coconut palms along the back of the beach (leaning to the sea), a closed
// rainforest canopy on the hillsides and gullies thinning into scattered trees and shrub
// thickets at the forest edge, banana groves, young palms and ferns in the understory, and a
// camera-following field of tall meadow grass, dune grass, sea oats and beach creeper.
//
// Everything is instanced and procedural. Wind (G.windDir / G.windSpeed) drives trunk sway,
// frond / branch bending, leaf flutter and travelling gusts across the grass.
//
// Draw calls (main pass): palm near, palm far, young palms, ferns, bananas (two variants), monstera,
// elephant ear, heliconia, bird of paradise, canopy near (trees), shrubs near, canopy impostors
// (octahedral, trees + shrubs), grass near / mid / far = 16 (fewer when a level is empty). Shadow casters: palm near, bananas, the broadleaf plants, the near canopy and shrubs.
// (Tidewater merged the understory, bananas, broadleaf kinds and trees + shrubs into a mesh each; every
// instance of a merged mesh runs all its plants' vertices, which WebGL budgets can't afford: they
// are separate meshes here, a few more draw calls for a fraction of the triangles.)
//
// Device tiers (TIERS) scale the ranges: high is Tidewater's; mid shortens them and thins the
// grass; low has no grass field and no ferns, short ranges and the impostors close in.
//
// Options: { scene, terrain (TerrainData), renderer, tier, ground? (Terrain: its float height
// texture is shared with the grass), village? } - with a village (Village.js) its building
// footprints and boardwalks are kept clear; otherwise a default boardwalk polyline is used.
// Building takes a few hundred ms of scattering: `await init()` spreads it over several tasks and
// bakes the leaf and impostor atlases (render targets) with the renderer.

// Building footprints + boardwalk polylines from a Village instance (duck-typed).
function villageObstacles( village ) {

	if ( ! village ) return {};
	const footprints = typeof village.getFootprints === 'function' ? village.getFootprints() : [];
	const paths = [];
	for ( const p of [ village.path, ...( village.sidePaths || [] ) ] ) {

		if ( ! p || ! p.samples ) continue;
		const pts = [];
		for ( let i = 0; i < p.samples.length; i += 5 ) pts.push( [ p.samples[ i ].p.x, p.samples[ i ].p.z ] );
		const last = p.samples[ p.samples.length - 1 ];
		pts.push( [ last.p.x, last.p.z ] );
		paths.push( { points: pts, width: p.width ?? 1.8 } );

	}

	return { footprints, paths: paths.length ? paths : null };

}

// bounding sphere of a geometry around its vertical axis (impostor frames are centred on it)
function axisSphere( geometry ) {

	const p = geometry.attributes.position;
	const v = new THREE.Vector3();
	let y0 = Infinity, y1 = - Infinity;
	for ( let i = 0; i < p.count; i ++ ) {

		v.fromBufferAttribute( p, i );
		y0 = Math.min( y0, v.y );
		y1 = Math.max( y1, v.y );

	}

	const center = new THREE.Vector3( 0, ( y0 + y1 ) * 0.5, 0 );
	let r = 0, rh = 0;
	for ( let i = 0; i < p.count; i ++ ) {

		v.fromBufferAttribute( p, i );
		r = Math.max( r, v.distanceTo( center ) );
		rh = Math.max( rh, Math.hypot( v.x, v.z ) );

	}

	// radius: frame size of the atlas; rh / hv: horizontal radius and half height (quad extents)
	return { center, radius: r * 1.02, rh: rh * 1.03, hv: ( y1 - y0 ) * 0.5 * 1.03 };

}

// Ranges (m) per device tier. high: Tidewater's.
//   palmNear: full detail palms; treeNear / shrubNear: trees / shrubs geometry -> impostor;
//   underFade: young palms (shrink out), fernFade: ferns, broadFade: monstera / elephant ear /
//   heliconia, bananaFade; palmFar / canopyFar: palms (far level) / impostors fade out; framePx: impostor
//   atlas pixels per frame; blendDist: impostors blend three frames within; shadows: which types
//   cast: palms, bananas and the broadleaf plants / the near canopy (its leaf cards are the most
//   expensive part of the shadow pass); margin: the near levels hold the instances within their
//   range + margin (refilled after the camera moved 60 % of it)
const TIERS = {
	low: {
		palmNear: 35, treeNear: 14, shrubNear: 10, underFade: [ 40, 50 ], fernFade: null, broadFade: [ 12, 16 ], bananaFade: [ 22, 28 ], rootFade: [ 20, 28 ], margin: 5,
		palmFar: [ 260, 320 ], canopyFar: [ 900, 1100 ], framePx: 96, blendDist: 40, grass: null, shadows: { plants: false, canopy: false },
	},
	mid: {
		palmNear: 70, treeNear: 30, shrubNear: 22, underFade: [ 70, 85 ], fernFade: [ 26, 36 ], broadFade: [ 32, 42 ], bananaFade: [ 50, 62 ], rootFade: [ 55, 70 ], margin: 8,
		palmFar: [ 1400, 1600 ], canopyFar: [ 2200, 2400 ], framePx: 128, blendDist: 70, grass: GRASS_TIERS.mid, shadows: { plants: true, canopy: false },
	},
	high: {
		palmNear: 120, treeNear: 65, shrubNear: 45, underFade: [ 120, 140 ], fernFade: [ 42, 58 ], broadFade: [ 85, 105 ], bananaFade: [ 100, 120 ], rootFade: [ 110, 140 ], margin: 10,
		palmFar: [ 2600, 2800 ], canopyFar: [ 2600, 2800 ], framePx: 128, blendDist: 100, grass: GRASS_TIERS.high, shadows: { plants: true, canopy: true },
	},
};

// spread over tasks: yield to the event loop after this much work (ms)
const SLICE_MS = 30;
const _view = new THREE.Vector3();

export class Vegetation {

	// smallBakes: the leaf atlas and the impostors baked at half size (WebGL drawn on the CPU).
	// bakeSlot: () => a promise that resolves when a bake may draw (the app's: a frame without the
	// world, so no frame counts both; by default the next task)
	constructor( { scene, terrain, renderer, tier = 'low', ground = null, village = null, rocks = null, smallBakes = false, bakeSlot = null } ) {

		this.scene = scene;
		this.terrain = terrain;
		this.renderer = renderer;
		this.ground = ground;
		this.village = village;
		this.rocks = rocks; // ((M14) its overhangs kept clear: Rocks.clears)
		this.tier = TIERS[ tier ] ? tier : 'low';
		this.cfg = TIERS[ this.tier ];
		this.smallBakes = smallBakes;
		this.bakeSlot = bakeSlot || ( () => new Promise( ( resolve ) => setTimeout( resolve, 0 ) ) );
		this.ready = false;
		this.group = new THREE.Group();
		this.group.name = 'Vegetation';
		this.group.matrixAutoUpdate = false;
		this.types = [];
		this.materials = [];
		this.grass = null;
		this.timings = {};
		this._camPos = new THREE.Vector3();

	}

	// Scatter, build and bake; resolves when the vegetation is in the scene
	async init() {

		const cfg = this.cfg, terrain = this.terrain;
		const t0 = performance.now();
		let slice = performance.now(), longest = 0;
		const run = async ( steps ) => {

			let r;
			for ( ;; ) {

				r = steps.next();
				if ( r.done ) return r.value;
				const now = performance.now();
				if ( now - slice > SLICE_MS ) {

					longest = Math.max( longest, now - slice );
					await new Promise( ( resolve ) => setTimeout( resolve, 0 ) );
					slice = performance.now();

				}

			}

		};

		vegUniforms.vegDetail.value = getDetailTexture();
		// ((M15) placed on the ground as it was before the sea caves' floors were cut, as the rocks are)
		const site = new VegSite( terrain.uncut || terrain, villageObstacles( this.village ) );
		this.site = site;
		const recs = await run( scatterSteps( site, 99, { ferns: !! cfg.fernFade } ) );
		// ((M14) none under the rocks' overhangs or in their mouths: taken out after, so the rest are as they were)
		if ( this.rocks ) for ( const k of Object.keys( recs ) ) if ( Array.isArray( recs[ k ] ) ) recs[ k ] = recs[ k ].filter( ( p ) => ! this.rocks.clears( p.x, p.z ) );
		this.records = recs;
		const t1 = performance.now();
		const grassMask = cfg.grass ? await run( grassMaskSteps( site ) ) : null;
		// ((M14) nor any grass there, a texel about it too, so the filtering doesn't bleed in)
		if ( grassMask && this.rocks ) {

			const { data, res } = grassMask, t = site.terrain, texel = t.size / res, R = this.rocks;
			for ( const o of R.overhangs ) {

				const i0 = Math.floor( ( o.x - o.radius - 2 - t.origin ) / texel ), i1 = Math.ceil( ( o.x + o.radius + 2 - t.origin ) / texel );
				const j0 = Math.floor( ( o.z - o.radius - 2 - t.origin ) / texel ), j1 = Math.ceil( ( o.z + o.radius + 2 - t.origin ) / texel );
				for ( let j = Math.max( 0, j0 ); j <= Math.min( res - 1, j1 ); j ++ ) for ( let i = Math.max( 0, i0 ); i <= Math.min( res - 1, i1 ); i ++ ) {

					const x = t.origin + ( i + 0.5 ) * texel, z = t.origin + ( j + 0.5 ) * texel;
					if ( [ [ 0, 0 ], [ texel, 0 ], [ - texel, 0 ], [ 0, texel ], [ 0, - texel ] ].some( ( [ dx, dz ] ) => R.clears( x + dx, z + dz ) ) ) data.fill( 0, ( j * res + i ) * 4, ( j * res + i ) * 4 + 4 );

				}

			}

		}
		this.timings.scatter = t1 - t0;
		this.timings.mask = performance.now() - t1;
		await new Promise( ( resolve ) => setTimeout( resolve, 0 ) );
		slice = performance.now();

		// materials: one per LOD level (factories take the level's LOD window uniform)
		const plantMat = ( lodRange ) => this._keep( vegMaterial( PLANT_LEAF, lodRange ) );
		this.leafAtlas = new LeafAtlas( this.smallBakes ? { size: 512 } : {} );
		const canopyDef = canopyMaterialDef( this.leafAtlas );
		const canopyMat = ( lodRange ) => this._keep( vegMaterial( canopyDef, lodRange ) );
		uCanopyNear.value.set( cfg.treeNear, cfg.shrubNear );
		vegUniforms.vegFernFade.value.set( ...( cfg.fernFade ?? [ 0, 0 ] ) );

		// geometry
		const palmNear = buildPalmNear();
		const palmFar = buildPalmFar( 11, { lite: this.tier === 'low' } );
		const under = { young: buildPlantKind( UNDERSTORY.YOUNG, buildYoungPalm, 5 ), fern: buildPlantKind( UNDERSTORY.FERN, buildFern, 3 ) };
		const monsteraMesh = buildMonsteraMesh();
		const bananaMeshes = [ buildPlantKind( UNDERSTORY.BANANA, buildBanana, 9 ), buildPlantKind( UNDERSTORY.BANANA_B, buildBanana, 23 ) ];
		const broad = {
			elephantEars: buildPlantKind( BROADLEAF.ELEPHANT, buildElephantEar, 43 ),
			heliconias: buildPlantKind( BROADLEAF.HELICONIA, buildHeliconia, 47 ),
			strelitzias: buildPlantKind( BROADLEAF.STRELITZIA, buildStrelitzia, 53 ),
		};
		const tree = buildTreeNear(), shrub = buildShrubNear();

		// impostor atlas of the tree and shrub crown variants (same lobe tables as the near mesh)
		const treeGeo = tree.geometry, shrubGeo = shrub.geometry;
		const treeVariants = [], shrubVariants = [];
		for ( let v = 0; v < TREE_VARIANTS; v ++ ) treeVariants.push( lobeVariantGeometry( treeGeo, LOBE_TABLE, v * 8 ) );
		for ( let v = 0; v < SHRUB_VARIANTS; v ++ ) shrubVariants.push( lobeVariantGeometry( shrubGeo, LOBE_TABLE, ( TREE_VARIANTS + v ) * 8 ) );
		this.bakeMaterials = createCanopyBakeMaterials( this.leafAtlas );
		this.atlas = new ImpostorAtlas( [
			{ variants: treeVariants, ...axisSphere( treeGeo ) },
			{ variants: shrubVariants, ...axisSphere( shrubGeo ) },
		], this.bakeMaterials, { framePx: this.smallBakes ? cfg.framePx / 2 : cfg.framePx, blendDist: cfg.blendDist } );
		// (GLSL expressions: see ImpostorAtlas.materialDef)
		const impostorDef = this.atlas.materialDef( {
			isGroup1: ( iDat ) => `${ iDat }.y < 0.0`,
			variantOf: ( seed, isShrub ) => variantOf( seed, isShrub ),
			colorOf: ( { seed, cr, leaf, bright, isGroup1 } ) => `${ impostorColor }( ${ seed }, ${ cr }, ${ leaf }, ${ bright }, ${ isGroup1 } )`,
			nearDist: ( isShrub ) => `( ${ isShrub } ? vegCanopyNear.y : vegCanopyNear.x )`,
		} );
		const impostorMat = ( lodRange ) => this._keep( vegMaterial( impostorDef, lodRange ) );

		const add = ( t ) => {

			this.types.push( t );
			for ( const m of t.meshes ) this.group.add( m );
			return t;

		};

		const shadows = cfg.shadows.plants;
		const near = { margin: cfg.margin, refreshDistance: cfg.margin * 0.6 };
		this.palms = add( new VegType( 'palms', recs.palms, {
			nearRange: cfg.palmNear, ...near, farExcludeNear: true, sortNear: true,
			near: [ { geometry: palmNear.geometry, material: plantMat, castShadow: shadows, name: 'veg-palm' } ],
			far: { parts: [ { geometry: palmFar.geometry, material: plantMat, name: 'veg-palm-far' } ], fade: cfg.palmFar },
		} ) );

		// banana clumps (two variants, a mesh each; their heights are in the mesh: H ~ 0)
		this.bananas = [ UNDERSTORY.BANANA, UNDERSTORY.BANANA_B ].map( ( kind, v ) => {

			const bananaRecs = recs.bananas.filter( ( r ) => ( r.seed < 0.5 ) === ( v === 0 ) ).map( ( r ) => ( { ...r, H: 0.02, seed: kind + r.seed * 0.999, qr: cfg.bananaFade[ 1 ] + cfg.margin } ) );
			return add( new VegType( v ? 'bananasB' : 'bananas', bananaRecs, {
				fade: cfg.bananaFade, ...near, sortNear: true,
				near: [ { geometry: bananaMeshes[ v ].geometry, material: plantMat, castShadow: shadows, name: v ? 'veg-banana-b' : 'veg-banana' } ],
			} ) );

		} );
		// understory: young palms and ferns (a mesh each; the plant kind rides on the seed, the ferns
		// fade out earlier: vegFernFade)
		this.understory = add( new VegType( 'understory', recs.youngPalms.map( ( r ) => ( { ...r, seed: UNDERSTORY.YOUNG + r.seed * 0.999, qr: cfg.underFade[ 1 ] + cfg.margin } ) ), {
			fade: cfg.underFade, ...near, sortNear: true,
			near: [ { geometry: under.young.geometry, material: plantMat, castShadow: false, name: 'veg-understory' } ],
		} ) );
		if ( cfg.fernFade ) this.ferns = add( new VegType( 'ferns', recs.ferns.map( ( r ) => ( { ...r, seed: UNDERSTORY.FERN + r.seed * 0.999, qr: cfg.fernFade[ 1 ] + 6 } ) ), {
			fade: cfg.fernFade, margin: 6, refreshDistance: 4, sortNear: true,
			near: [ { geometry: under.fern.geometry, material: plantMat, castShadow: false, name: 'veg-ferns' } ],
		} ) );

		// broadleaf understory: monstera, elephant ear, heliconia, bird of paradise (a mesh each, the
		// kind on the seed)
		const monsteraRecs = recs.monsteras.map( ( r ) => ( { ...r, seed: BROADLEAF.MONSTERA + r.seed * 0.999, qr: cfg.broadFade[ 1 ] + cfg.margin } ) );
		this.monsteras = add( new VegType( 'monsteras', monsteraRecs, {
			fade: cfg.broadFade, ...near, sortNear: true,
			near: [ { geometry: monsteraMesh.geometry, material: plantMat, castShadow: shadows, name: 'veg-monstera' } ],
		} ) );
		const BROAD_KIND = { elephantEars: BROADLEAF.ELEPHANT, heliconias: BROADLEAF.HELICONIA, strelitzias: BROADLEAF.STRELITZIA };
		this.broadleaf = Object.entries( BROAD_KIND ).map( ( [ name, kind ] ) => add( new VegType( name, recs[ name ].map( ( r ) => ( { ...r, seed: kind + r.seed * 0.999, qr: cfg.broadFade[ 1 ] + cfg.margin } ) ), {
			fade: cfg.broadFade, ...near, sortNear: true,
			near: [ { geometry: broad[ name ].geometry, material: plantMat, castShadow: shadows, name: 'veg-' + name } ],
		} ) ) );

		// canopy: trees + shrubs (shrubs flagged by a negative vertical scale in iDat.y); near
		// geometry within treeNear / shrubNear, octahedral impostors beyond. The trees' near level
		// draws the tree geometry (the shrubs never enter it: a ~0 query radius), the shrubs have a
		// near level of their own.
		const canopyRecs = [
			...recs.trees.map( ( r ) => ( { ...r, qr: cfg.treeNear + cfg.margin } ) ),
			...recs.shrubs.map( ( r ) => ( { ...r, qr: 1e-3 } ) ),
		];
		this.canopy = add( new VegType( 'canopy', canopyRecs, {
			nearRange: cfg.treeNear, ...near, sortNear: true, sortFar: true, farRefresh: 16,
			near: [ { geometry: tree.geometry, material: canopyMat, castShadow: cfg.shadows.canopy, name: 'veg-canopy' } ],
			far: { parts: [ { geometry: buildImpostorQuad(), material: impostorMat, name: 'veg-canopy-far' } ], fade: cfg.canopyFar },
		} ) );
		this.shrubs = add( new VegType( 'shrubs', recs.shrubs.map( ( r ) => ( { ...r, qr: cfg.shrubNear + cfg.margin } ) ), {
			fade: [ cfg.shrubNear, cfg.shrubNear + 0.01 ], ...near, sortNear: true,
			near: [ { geometry: shrub.geometry, material: canopyMat, castShadow: cfg.shadows.canopy, name: 'veg-shrubs' } ],
		} ) );
		// ((M15) the mangroves' prop roots: their crowns are canopy trees (Scatter), the roots their own, out to
		// rootFade, past the trees' near range: from a boat it's the roots you see)
		if ( recs.mangroves && recs.mangroves.length ) {

			const rootMat = ( lodRange ) => this._keep( vegMaterial( rootMaterialDef( this.leafAtlas ), lodRange ) );
			this.mangroveRoots = add( new VegType( 'mangroveRoots', recs.mangroves.map( ( r ) => ( { ...r, qr: cfg.rootFade[ 1 ] + cfg.margin } ) ), {
				fade: cfg.rootFade, ...near, sortNear: true,
				near: [ { geometry: buildMangroveRoots().geometry, material: rootMat, castShadow: cfg.shadows.canopy, name: 'veg-mangrove-roots' } ],
			} ) );

		}

		// alpha-tested foliage after the opaque ground (terrain, rocks, buildings) and the far crowns
		// after the near ones, so the early depth test rejects what those already cover
		for ( const t of this.types ) for ( const m of t.meshes ) m.renderOrder = 1;
		for ( const m of this.canopy.far.meshes ) {

			m.renderOrder = 2;
			m.castShadow = false;
			m.receiveShadow = false;

		}

		if ( cfg.grass ) {

			const heights = this.ground ?? ownHeights( terrain );
			this.grass = new GrassField( { terrain, mask: grassMask, heights, config: cfg.grass } );
			this._keep( this.grass.material );
			for ( const m of this.grass.meshes ) this.group.add( m );

		}

		this.geometryTriangles = {
			palmNear: palmNear.triangles, palmFar: palmFar.triangles, youngPalm: under.young.triangles, fern: under.fern.triangles,
			elephantEar: broad.elephantEars.triangles, heliconia: broad.heliconias.triangles, strelitzia: broad.strelitzias.triangles,
			monstera: monsteraMesh.triangles, banana: bananaMeshes[ 0 ].triangles, bananaB: bananaMeshes[ 1 ].triangles,
			tree: tree.triangles, shrub: shrub.triangles, impostor: 2,
			...( this.grass ? { grassNearPatch: this.grass.patchTris[ 0 ], grassMidPatch: this.grass.patchTris[ 1 ], grassFarPatch: this.grass.patchTris[ 2 ] } : {} ),
		};
		this.timings.build = performance.now() - slice;
		// (each bake's drawing in a slot of its own: bakeSlot)
		await this.bakeSlot();

		// the leaf atlas first: the impostor bake samples it
		let tb = performance.now();
		this.leafAtlas.bake( this.renderer );
		this.timings.leafBake = performance.now() - tb;
		await this.bakeSlot();
		tb = performance.now();
		this.timings.impostorBake = 0;
		const bake = this.atlas.bakeSteps( this.renderer );
		while ( ! bake.next().done ) {

			this.timings.impostorBake = Math.max( this.timings.impostorBake, performance.now() - tb );
			await this.bakeSlot();
			tb = performance.now();

		}

		this.timings.impostorBake = Math.max( this.timings.impostorBake, performance.now() - tb );
		this.bakeMaterials.albedo.dispose();
		this.bakeMaterials.normal.dispose();

		this.group.updateMatrixWorld( true );
		this.scene.add( this.group );
		this.ready = true;
		this.timings.longestSlice = Math.max( longest, this.timings.build, this.timings.leafBake, this.timings.impostorBake );
		this.timings.total = performance.now() - t0;

	}

	_keep( material ) {

		this.materials.push( material );
		return material;

	}

	update( dt, camera ) {

		if ( ! this.ready ) return;
		camera.updateMatrixWorld();
		const p = camera.getWorldPosition( this._camPos );
		uCamPos.value.copy( p );

		// travelling gust field offset (integrated so speed/direction changes never jump)
		const wd = G.windDir.value;
		const speed = 0.7 * G.windSpeed.value + 1.5;
		uGustOffset.value.x += wd.x * speed * dt;
		uGustOffset.value.y += wd.y * speed * dt;

		// the view, for the far levels (InstanceLOD: what's behind the camera is left out)
		const f = camera.getWorldDirection( _view );
		const half = Math.atan( Math.tan( camera.fov * Math.PI / 360 ) * camera.aspect );
		for ( const t of this.types ) t.setView( Math.atan2( f.x, f.z ), half );

		// near-level refills happen only after the camera moved a few metres; at most two
		// types per frame (most overdue first) so fast flights never stack up refills.
		// Teleports (anything far past the margin) and turns of the view refill everything at once.
		let a = null, b = null, da = 0, db = 0;
		for ( const t of this.types ) {

			const d = t.overdue( p );
			if ( d > t.margin - t.refreshDistance ) t.update( p, true );
			else if ( d > da ) {

				b = a; db = da; a = t; da = d;

			} else if ( d > db ) {

				b = t; db = d;

			}

		}

		if ( a ) a.update( p, true );
		if ( b ) b.update( p, true );

		if ( this.grass ) this.grass.update( camera );

	}

	// Plant placement is computed once in init(): build Vegetation after terrain edits. The grass
	// reads the terrain's height texture (re-uploaded by its owner).
	refreshTerrain() {

		if ( this.grass && this.grass.heights.heightUniforms.terrainHeightMap.value.userData.vegOwned ) this.grass.heights.heightUniforms.terrainHeightMap.value.needsUpdate = true;

	}

	stats() {

		const types = {};
		let tris = 0, draws = 0;
		for ( const t of this.types ) {

			const lv = {};
			for ( const [ name, l ] of [ [ 'near', t.near ], [ 'far', t.far ] ] ) {

				if ( ! l ) continue;
				lv[ name ] = { instances: l.count, triangles: l.triangles, meshes: l.meshes.length };
				tris += l.triangles;
				if ( l.count > 0 ) draws += l.meshes.length;

			}

			types[ t.name ] = { total: t.inst.count, ...lv };

		}

		const g = this.grass;
		if ( g ) {

			types.grass = { nearCells: g.levels[ 0 ].count, midCells: g.levels[ 1 ].count, farCells: g.levels[ 2 ].count, triangles: g.triangles };
			tris += g.triangles;
			draws += g.levels.filter( ( l ) => l.count > 0 ).length;

		}

		return { types, triangles: tris, drawCalls: draws, villagePalms: this.records.villagePalms, rules: RULES, timings: this.timings };

	}

	dispose() {

		this.scene.remove( this.group );
		for ( const t of this.types ) for ( const m of t.meshes ) m.geometry.dispose();
		for ( const m of this.materials ) {

			m.dispose();
			if ( m.userData.depth ) m.userData.depth.dispose();

		}

		this.atlas.dispose();
		this.leafAtlas.dispose();
		if ( this.grass ) this.grass.dispose();

	}

}

// The terrain heights as a float texture with Terrain's GLSL accessor (when no Terrain is given)
function ownHeights( terrain ) {

	const res = terrain.res;
	const tex = new THREE.DataTexture( terrain.heights, res, res, THREE.RedFormat, THREE.FloatType );
	tex.minFilter = tex.magFilter = THREE.NearestFilter;
	tex.generateMipmaps = false;
	tex.userData.vegOwned = true;
	tex.needsUpdate = true;
	return {
		heightUniforms: {
			terrainHeightMap: { value: tex },
			terrainHeightInfo: { value: new THREE.Vector4( terrain.origin, terrain.origin, 1 / terrain.texel, res ) },
		},
		heightGlsl: /* glsl */`
uniform highp sampler2D terrainHeightMap;
uniform vec4 terrainHeightInfo;
float terrainHeightAt( vec2 xz ) {
	vec2 f = ( xz - terrainHeightInfo.xy ) * terrainHeightInfo.z - 0.5;
	float res = terrainHeightInfo.w;
	if ( f.x < 0.0 || f.y < 0.0 || f.x >= res - 1.0 || f.y >= res - 1.0 ) return -90.0;
	ivec2 i = ivec2( floor( f ) );
	vec2 t = f - floor( f );
	float h00 = texelFetch( terrainHeightMap, i, 0 ).r;
	float h10 = texelFetch( terrainHeightMap, i + ivec2( 1, 0 ), 0 ).r;
	float h01 = texelFetch( terrainHeightMap, i + ivec2( 0, 1 ), 0 ).r;
	float h11 = texelFetch( terrainHeightMap, i + ivec2( 1, 1 ), 0 ).r;
	return mix( mix( h00, h10, t.x ), mix( h01, h11, t.x ), t.y );
}
`,
	};

}

export { LodLevel };
