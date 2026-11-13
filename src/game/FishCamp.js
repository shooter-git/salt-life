import { Vector3 } from '../engine/index.js';
import { Builder } from '../world/village/GeoBuilder.js';
import { buildShed, roofHoles } from '../world/village/Buildings.js';
import { InstancedProps, Rand, WOOD, HARD, C, lin, cleat, tireFender, ropeCoil, bucket, cleaningTable, buoyString, oar, rowboat, netRack, fishRack, waterTank, woodpile, lantern, bench } from '../world/Props.js';
import { stonePart } from '../world/debris/DebrisShapes.js';
import { mulberry32 } from '../util/Noise.js';
import { Vendor } from './Vendor.js';
import { paintedBoard } from './Signpost.js';
import { PearlsBoat, HAND } from './PearlsBoat.js';
import { CampLights } from './CampLights.js';
import { BOAT, lightsAt, lightsOn } from './PearlsDay.js';

// (M15) The fish camp on the north beach, at the foot of the way over (world/terrain/NorthTrail.js), after the
// landing beaches of the Caribbean's windward coasts (Tobago's Charlotteville, Grenada's Gouyave, St Lucia's
// Anse La Raye): a plank shed with a rusted tin roof on the backshore, its front to the sea, a lean-to over
// the counter where Pearl buys the catch; a timber jetty out over the beach's flat to water a boat can lie
// alongside in (2.5 m at its head, 38 m out), its fuel drums at its foot; fish pots stacked by the shed, a
// net on its rack, fish drying, two boats hauled up on the sand, a fire pit, a woodpile, a rain barrel.
// Built when you first come within CAMP.build of it (the village's builders and materials: Buildings,
// Props), after the debris is placed (so nothing of the bay's moves for it); Pearl's stand-in figure at once,
// her character (game/Vendor.js, App.loadVendorCharacter) once the camp's built. She buys fish at CAMP.rate of
// Joe's price (she takes it round to the market herself, as the island's fish vendors do: at the Caribbean's
// landing beaches it's mostly women who buy the catch off the boats and sell it on) and sells diesel at CAMP.fuel
// a litre (it comes over in drums), from CAMP.hours[ 0 ] to CAMP.hours[ 1 ].
// (M16) And her day: the pirogue coming and going (game/PearlsBoat.js), the camp's lights at night (game/CampLights.js),
// both from the clock (game/PearlsDay.js); the shed's and the lean-to's tin in a hurricane, as the village's roofs (their
// holes added to Village.roofHoles, its setDamage and the flying sheets take them from there). All built with the camp.
//   const camp = new FishCamp( { scene, terrain, colliders, village, app } ); camp.update( camera ); camp.vendor
//   camp.live( dt )   (each frame once it's built)   camp.lightsAt( hour, day ) -> LAMPS with their `on`; camp.lightsOn( hour, day )

export const CAMP = {
	shed: { x: 99, z: - 832.6, yaw: Math.PI, w: 3.6, d: 2.8 }, // its front (and door) to the sea, north
	keeper: { x: 99.6, z: - 835.1, yaw: Math.PI }, // under the lean-to, behind the counter
	jetty: { x: 116.5, z0: - 846.5, z1: - 885, deck: 1.55, width: 1.6, head: 4.5, headWidth: 3.2 },
	hours: [ 6, 17 ],
	rate: 0.8, // of Joe's price
	fuel: 2.0, // $ a litre (Marta's: Gear.FUEL_PRICE)
	build: 700, // m from it: built when you're first this near
};

const _v = new Vector3(), _h = new Vector3();
const IN_BERTH = 7; // m: a boat this near her berth's in it (PearlsBoat's own)

export class FishCamp {

	constructor( { scene, terrain, colliders, village, app = null } ) {

		this.app = app;
		this.scene = scene;
		this.terrain = terrain;
		this.colliders = colliders;
		this.village = village;
		const k = CAMP.keeper;
		this.vendor = new Vendor( {
			name: 'Pearl · Fish camp',
			kind: 'camp',
			position: new Vector3( k.x, terrain.heightAt( k.x, k.z ), k.z ),
			yaw: k.yaw,
			radius: 2.8,
			greeting: 'Come round from the bay? I\'ll take what you caught, and there\'s diesel in the drums.',
			idle: 'Nothing today? Diesel\'s in the drums by the jetty if you need it.',
			// (Rocketbox's, as Joe and Marta are theirs (tools/characters/build.sh): Female_Party_02's face and hair on
			// Sports_Female_02's body, its skin made hers: a vest, cargo trousers and trainers for the heat and the work)
			character: { url: 'models/characters/pearl.glb', idle: 'idle_neutral_01', talk: 'gestic_talk_relaxed_01', greet: 'wave_01' },
			look: { shirt: 0xc8c8c4, trousers: 0x2a2e36, apron: 0xc8c8c4, hat: 0x1a1410, hair: 0x1a1410, skin: 0x9a6a46 },
			hours: CAMP.hours,
		} );
		// (her character loaded the first time you come near the camp, not with Joe's and Marta's: App)
		this.vendor.lazy = true;
		scene.add( this.vendor.group );
		this.built = false;

	}

	update( camera ) {

		if ( this.built || ! this.village || ! this.village.materials ) return;
		const p = camera.position, S = CAMP.shed;
		if ( Math.hypot( p.x - S.x, p.z - S.z ) > CAMP.build ) return;
		this.built = true;
		this._build();

	}

	// (M16) a frame of her day
	live( dt ) {

		const app = this.app;
		if ( ! app || ! this.built ) return;
		const s = app.settings, pick = app.weatherPick ? app.weatherPick() : null, since = s.weatherSince;
		const part = this.village.parts.find( ( p ) => p.part === 'camp' ), hidden = !! part && part.hidden, b = app.boatCtl;
		// (your boat, in the berth she'd come in to: stopped there, not passing. (M17) Or anyone's, on your screen: someone else's
		// boat stopped there, or one whose owner's away, as Together has her. Every game knows the same boats, so she lies off on
		// all of them)
		const B = BOAT.berth, mine = b && ! ( b.driven && b.speed > 1.5 ) ? b.position : null;
		const yours = ( mine && Math.hypot( mine.x - B.x, mine.z - B.z ) < IN_BERTH ) || ! app.together ? mine : app.together.stoppedNear( B.x, B.z, IN_BERTH ) || mine;
		this.boat.update( dt, app.camera, s.timeOfDay, s.day, pick, since, yours, hidden );
		if ( app.loadPerson ) this.boat.crew( dt, app.camera, ( url ) => app.loadPerson( url, HAND.clips ) );
		this.lights.update( dt, app.camera, s.timeOfDay, s.day, pick, since, app.sky ? app.sky.visibility : 1, app.renderer ? app.renderer.domElement.height : 720, hidden );

	}

	// (for the turtles: a light on the beach turns a turtle back) where they are, and how lit each is (0..1)
	lightsAt( hour, day = this.app ? this.app.settings.day : 1 ) {

		const app = this.app;
		return lightsAt( hour, day, app && app.weatherPick ? app.weatherPick() : null, app ? app.settings.weatherSince : 0 );

	}

	lightsOn( hour, day = this.app ? this.app.settings.day : 1 ) {

		const app = this.app;
		return lightsOn( hour, day, app && app.weatherPick ? app.weatherPick() : null, app ? app.settings.weatherSince : 0 );

	}

	_build() {

		const T = this.terrain, g = ( x, z ) => T.heightAt( x, z ), colliders = this.colliders;
		const B = new Builder(), inst = new InstancedProps( B ), rand = new Rand( mulberry32( 6070 ) );
		B.lite = this.village.tier === 'low';
		const box = ( x, y, z, hx, hy, hz, ry, tag, walkable = false ) => colliders.addBox( _v.set( x, y, z ), _h.set( hx, hy, hz ), ry, { tag, walkable } );
		const ctx = { B, terrain: T, colliders, rand, lights: [], inst, checks: [], holes: [], thatchHoles: [], nets: [] };

		// ---- the shed: faded teal boards, a red door, its roof's tin rusted through in places
		const S = CAMP.shed;
		const shed = buildShed( ctx, { ...S, wall: lin( 0x6f9c95 ), paint: 0.62, door: lin( 0xa8432f ), roof: lin( 0x7a4a34 ), name: 'campShed' } );
		const floor = shed.floorY;
		// (M16) a small window in its front, by the door: a frame, four dark panes, lit from inside some nights
		const glow = { window: { x: S.x - 1.0, y: floor + 1.22, z: S.z - S.d / 2 - 0.022, w: 0.5, h: 0.56 }, gaps: [] };
		{

			const W = glow.window, fr = WOOD( rand.next(), 0.9, 0.5, 0 ), tint = lin( 0x56786f );
			B.box( 'glass', W.x, W.y, W.z + 0.012, W.w, W.h, 0.012, { tint: lin( 0x8a7a5e ), data: [ rand.next(), 0, 0, 0 ] } );
			for ( const sy of [ - 1, 1 ] ) B.box( 'wood', W.x, W.y + sy * ( W.h / 2 + 0.02 ), W.z - 0.006, W.w + 0.11, 0.045, 0.03, { grain: 1, tint, data: fr } );
			for ( const sx of [ - 1, 1 ] ) B.box( 'wood', W.x + sx * ( W.w / 2 + 0.03 ), W.y, W.z - 0.006, 0.04, W.h + 0.08, 0.03, { grain: 1, tint, data: fr } );
			B.box( 'wood', W.x, W.y, W.z - 0.012, 0.022, W.h, 0.016, { grain: 1, tint, data: fr } );
			B.box( 'wood', W.x, W.y, W.z - 0.012, W.w, 0.022, 0.016, { grain: 1, tint, data: fr } );
			// (the gaps between its boards the lamp shows through at night, each its own: front, and a few on the west side)
			const z = S.z - S.d / 2 - 0.009;
			for ( let k = 0; k < 9; k ++ ) {

				const x = S.x + 1.72 - k * 0.415 + ( rand.next() - 0.5 ) * 0.05, y0 = floor + 0.1 + rand.next() * 0.7;
				if ( Math.abs( x - ( S.x - 1 ) ) < 0.35 || Math.abs( x - ( S.x - 0.15 ) ) < 0.45 ) continue;
				glow.gaps.push( { x, z, y0, y1: y0 + 0.5 + rand.next() * 1.0, w: 0.005 + rand.next() * 0.008, b: 0.55 + rand.next() * 0.6 } );

			}

			for ( let k = 0; k < 4; k ++ ) {

				const y0 = floor + 0.2 + rand.next() * 0.6;
				glow.gaps.push( { side: true, x: S.x - S.w / 2 - 0.009, z: S.z - 1.05 + k * 0.72 + ( rand.next() - 0.5 ) * 0.08, y0, y1: y0 + 0.45 + rand.next() * 0.7, w: 0.005 + rand.next() * 0.006, b: 0.5 + rand.next() * 0.5 } );

			}

		}

		// its lean-to over the counter: two posts out front, the tin sloping down to them from the shed's eave
		{

			const front = S.z - S.d / 2, out = front - 2.6, top = floor + 2.3, low = g( S.x, out ) + 2.05;
			const wd = WOOD( rand.next(), 0.9 );
			for ( const sx of [ - 1.75, 1.75 ] ) {

				const px = S.x + sx, gy = g( px, out + 0.1 );
				B.box( 'wood', px, ( gy - 0.3 + low ) / 2, out + 0.1, 0.1, low - gy + 0.3, 0.1, { grain: 1, data: wd } );
				colliders.addCylinder( px, out + 0.1, 0.08, gy - 0.3, low, { tag: 'campPost' } );

			}

			B.box( 'wood', S.x, low - 0.06, out + 0.1, 3.8, 0.12, 0.1, { grain: 1, data: wd } );
			// its board, hand-painted, along the lean-to's front beam
			// ((M19) and bait, and the day's challenges)
			const board = paintedBoard( { width: 1.9, height: 0.46, lines: [ 'Pearl\'s fish camp', 'fish bought · bait · diesel' ], paint: 0x2a6f8f } );
			// ((M19) 0.16 m higher, clear of the lean-to's roof: its lower line was under it from the beach)
			board.position.set( S.x - 0.6, low + 0.32, out + 0.04 );
			board.rotation.set( - 0.08, Math.PI, 0.015 );
			this.scene.add( board );
			this.board = board;
			const rf = [ new Vector3( S.x - 2.0, top + 0.03, front ), new Vector3( S.x + 2.0, top + 0.03, front ), new Vector3( S.x + 2.0, low + 0.02, out - 0.2 ), new Vector3( S.x - 2.0, low + 0.02, out - 0.2 ) ];
			// ((M16) its u up from the eave, as the roof material's holes reckon it: a sheet goes from there, and it's open beneath)
			const rfUp = new Vector3( 0, top - low, front - out ).normalize(), rfTint = lin( 0x8a5a40 ), rfData = [ rand.next(), 0.85, 0, 0 ];
			B.slab( 'roofMetal', rf, 0.035, { up: new Vector3( 0, 1, 0 ), uDir: rfUp, tint: rfTint, data: rfData } );
			roofHoles( ctx, [ { pts: rf, uDir: rfUp, seed: rfData[ 0 ], T: 0.035, tint: rfTint, data: rfData } ], 'campLeanTo', null );
			// the counter: planks on two trestles, between Pearl and whoever's selling
			const cz = out + 0.55, cy = g( S.x, cz ) + 0.92;
			for ( let i = 0; i < 4; i ++ ) B.box( 'wood', S.x + 0.4, cy, cz - 0.2 + i * 0.135, 2.0, 0.045, 0.125, { grain: 0, data: WOOD( rand.next(), 0.8 ) } );
			for ( const sx of [ - 0.45, 1.25 ] ) {

				B.beam( 'wood', [ S.x + sx, cy - 0.03, cz - 0.22 ], [ S.x + sx, g( S.x + sx, cz ) - 0.05, cz - 0.36 ], 0.06, 0.06, { data: wd } );
				B.beam( 'wood', [ S.x + sx, cy - 0.03, cz + 0.22 ], [ S.x + sx, g( S.x + sx, cz ) - 0.05, cz + 0.36 ], 0.06, 0.06, { data: wd } );

			}

			box( S.x + 0.4, cy - 0.45, cz, 1.0, 0.47, 0.3, 0, 'campCounter' );
			// on it: a cooler of ice, a bucket; a spring scale hung from the lean-to's beam
			B.box( 'hard', S.x + 1.05, cy + 0.2, cz, 0.62, 0.36, 0.4, { tint: lin( 0xe8e4da ), data: HARD( rand.next(), 0, 0, 0.45 ) } );
			B.box( 'hard', S.x + 1.05, cy + 0.395, cz, 0.64, 0.035, 0.42, { tint: lin( 0x2f6f9a ), data: HARD( rand.next(), 0, 0, 0.4 ) } );
			bucket( B, S.x - 0.25, cy + 0.025, cz + 0.05, lin( 0xc94a3a ), rand.next() );
			B.rod( 'hard', [ S.x + 0.1, low - 0.12, out + 0.1 ], [ S.x + 0.1, low - 0.45, out + 0.1 ], 0.006, 0.006, { data: HARD( rand.next(), 0.3, 0.8, 0.4 ) } );
			B.cyl( 'hard', S.x + 0.1, low - 0.75, out + 0.1, 0.04, 0.04, 0.3, { tint: lin( 0xc9b04a ), data: HARD( rand.next(), 0.1, 0.6, 0.35 ) } );
			B.torus( 'hard', S.x + 0.1, low - 0.8, out + 0.1, 0.05, 0.006, { rx: Math.PI / 2, data: HARD( rand.next(), 0.3, 0.8, 0.4 ) } );
			// ((M16) its glass unlit: it's lit when it's lit, CampLights)
			const seedL = rand.next();
			glow.lantern = lantern( B, S.x - 1.4, low - 0.35, out + 0.12, seedL, 1, [ seedL, 0, 0, 0 ] );
			// floats strung along the shed's front, under its eave
			buoyString( B, [ S.x - 1.6, floor + 2.0, front - 0.06 ], [ S.x - 0.4, floor + 2.0, front - 0.06 ], 4, rand, 0.18 );
			// a bench along its west wall
			bench( B, S.x - S.w / 2 - 0.45, g( S.x - S.w / 2 - 0.45, S.z ), S.z, Math.PI / 2, 1.6, rand.next() );
			box( S.x - S.w / 2 - 0.45, g( S.x - S.w / 2 - 0.45, S.z ) + 0.22, S.z, 0.22, 0.24, 0.8, 0, 'campBench' );

		}

		// ---- the jetty: piles in pairs every 2.5 m, caps, three stringers, boards across; its head wider, a ladder
		// down its east side and cleats and tyre fenders on its face (the boat lies alongside there)
		{

			const J = CAMP.jetty, y = J.deck, len = J.z0 - J.z1, wd = () => WOOD( rand.next(), 0.88 );
			const widthAt = ( s ) => s > len - J.head ? J.headWidth : J.width;
			for ( let s = 0; s < len; s += 0.165 ) {

				const w = widthAt( s + 0.08 ), z = J.z0 - s - 0.08, skew = ( rand.next() - 0.5 ) * 0.04;
				B.box( 'wood', J.x + ( w > J.width ? ( w - J.width ) / 2 : 0 ), y - 0.03, z, w + ( rand.next() - 0.5 ) * 0.06, 0.05, 0.145, { grain: 0, ry: skew, data: wd() } );

			}

			for ( const sx of [ - 0.6, 0, 0.6 ] ) B.box( 'wood', J.x + sx, y - 0.14, J.z0 - len / 2, 0.08, 0.16, len, { grain: 1, data: wd() } );
			for ( let s = 0; s <= len + 0.01; s += 2.5 ) {

				const z = J.z0 - s, w = widthAt( Math.min( len - 0.01, s ) ), x0 = J.x - J.width / 2 - 0.08, x1 = J.x + w - J.width / 2 + 0.08;
				B.box( 'wood', ( x0 + x1 ) / 2, y - 0.28, z, x1 - x0 + 0.2, 0.14, 0.14, { grain: 1, data: wd() } );
				for ( const px of [ x0, x1 ] ) {

					const gy = g( px, z ), r = 0.11 + rand.next() * 0.02;
					B.cyl( 'wood', px, gy - 0.6, z, r * 0.9, r, y + 0.22 - gy + 0.6, { grain: 1, data: WOOD( rand.next(), 0.95 ) } );
					colliders.addCylinder( px, z, r, gy - 0.6, y + 0.22, { tag: 'campPile' } );

				}

			}

			// walk it: its deck (and the head's wider part)
			box( J.x, y - 0.1, J.z0 - len / 2, J.width / 2, 0.1, len / 2, 0, 'campJetty', true );
			box( J.x + ( J.headWidth - J.width ) / 2, y - 0.1, J.z1 + J.head / 2, J.headWidth / 2, 0.1, J.head / 2, 0, 'campJetty', true );
			// its face, east: cleats, fenders, the ladder
			const ex = J.x + J.headWidth - J.width / 2;
			for ( const z of [ J.z1 + 0.6, J.z1 + J.head - 0.5 ] ) cleat( B, ex - 0.18, y, z, Math.PI / 2, rand.next() );
			for ( const z of [ J.z1 + 1.4, J.z1 + 3.0 ] ) tireFender( B, ex + 0.1, y - 0.1, z, Math.PI / 2, 0.75, rand.next() );
			// (M16) its west face, for the camp's own boat: she lies along it, bow to the sea (PearlsDay's BOAT), leaving the head's east face to you
			const wx = J.x - J.width / 2;
			for ( const z of [ BOAT.berth.z - 2.4, BOAT.berth.z + 2.6 ] ) cleat( B, wx + 0.18, y, z, Math.PI / 2, rand.next() );
			for ( const z of [ BOAT.berth.z - 1.5, BOAT.berth.z + 1.1 ] ) tireFender( B, wx - 0.1, y - 0.1, z, - Math.PI / 2, 0.8, rand.next() );
			for ( const sz of [ - 0.25, 0.25 ] ) B.rod( 'wood', [ ex + 0.12, y + 0.4, J.z1 + 2.2 + sz ], [ ex + 0.12, y - 2.2, J.z1 + 2.2 + sz ], 0.03, 0.03, { data: wd() } );
			for ( let r = 0; r < 7; r ++ ) B.rod( 'wood', [ ex + 0.12, y - 0.3 - r * 0.3, J.z1 + 1.95 ], [ ex + 0.12, y - 0.3 - r * 0.3, J.z1 + 2.45 ], 0.022, 0.022, { data: wd() } );
			ropeCoil( B, J.x - 0.35, y, J.z1 + 1.2, 0.08, 0.28, 5, rand.next() );
			// the fuel at its foot: drums, one with its hand pump and hose; jerrycans
			const fx = J.x - 2.3, fz = J.z0 + 0.6, fy = g( fx, fz );
			const drums = [ [ 0, 0 ], [ 0.66, 0.1 ], [ 0.3, 0.62 ] ];
			for ( const [ dx, dz ] of drums ) {

				inst.add( 'barrel', fx + dx, g( fx + dx, fz + dz ) - 0.02, fz + dz, rand.next() * 6, [ 0.75 + rand.next() * 0.2, 0.3 + rand.next() * 0.1, 0.22 ] );
				colliders.addCylinder( fx + dx, fz + dz, 0.32, fy - 0.1, fy + 0.9, { tag: 'campDrum' } );

			}

			B.cyl( 'hard', fx, fy + 0.88, fz, 0.035, 0.035, 0.55, { tint: lin( 0xb0302a ), data: HARD( rand.next(), 0.4, 0.6, 0.5 ) } );
			B.beam( 'hard', [ fx, fy + 1.4, fz ], [ fx + 0.32, fy + 1.5, fz ], 0.025, 0.025, { tint: lin( 0xb0302a ), data: HARD( rand.next(), 0.4, 0.6, 0.5 ) } );
			B.tube( 'rope', [ [ fx + 0.03, fy + 1.3, fz ], [ fx - 0.2, fy + 0.9, fz - 0.3 ], [ fx - 0.25, fy + 0.4, fz - 0.45 ], [ fx - 0.1, fy + 0.05, fz - 0.6 ] ].map( ( p ) => new Vector3( ...p ) ), 0.018, { tint: lin( 0x1a1a1a ), data: [ rand.next(), 0.6 ] } );

		}

		// ---- about the camp: pots, the net, fish drying, boats hauled up, a fire pit, wood, a rain barrel
		{

			// fish pots stacked by the shed's east wall (the island's own Antillean pots: wire on a wood frame)
			const px = S.x + S.w / 2 + 0.75, pz = S.z - 0.2;
			for ( let k = 0; k < 5; k ++ ) {

				const a = k < 3 ? ( k - 1 ) * 0.98 : ( k - 3.5 ) * 0.98;
				inst.add( 'trap', px, g( px, pz + a ) - 0.02 + ( k < 3 ? 0 : 0.31 ), pz + a, Math.PI / 2 + ( rand.next() - 0.5 ) * 0.15, [ 0.85 + rand.next() * 0.2, 0.85 + rand.next() * 0.15, 0.8 + rand.next() * 0.15 ] );

			}

			box( px, g( px, pz ) + 0.32, pz, 0.32, 0.32, 1.5, 0, 'campPots' );
			// the net on its rack, west of the shed; a cast net on the counter's end
			netRack( B, S.x - 6.4, g( S.x - 6.4, S.z - 3.2 ), S.z - 3.2, 0.25, 3.2, lin( 0x3f6f5f ), rand.next(), g );
			box( S.x - 6.4, g( S.x - 6.4, S.z - 3.2 ) + 1.0, S.z - 3.2, 1.7, 1.0, 0.15, 0.25, 'campNet' );
			// fish split and drying, east of it
			const rx = S.x + 7.5, rz = S.z + 0.4;
			fishRack( B, rx, g( rx, rz ), rz, 0, 2.6, rand.next(), rand );
			box( rx, g( rx, rz ) + 1.0, rz, 1.4, 1.0, 0.75, 0, 'campRack' );
			// a cleaning table by the rack, a tap of sea water in a bucket under it
			cleaningTable( B, S.x + 4.3, g( S.x + 4.3, S.z - 3.4 ), S.z - 3.4, 0, rand.next() );
			box( S.x + 4.3, g( S.x + 4.3, S.z - 3.4 ) + 0.45, S.z - 3.4, 0.7, 0.46, 0.32, 0, 'campTable' );
			bucket( B, S.x + 4.8, g( S.x + 4.8, S.z - 3.0 ), S.z - 3.0, lin( 0x2f6f9a ), rand.next() );
			// two boats hauled up the sand above the waterline, bows to the land, oars across
			const boats = [ [ 121.4, - 837.6, 0.12, lin( 0xd8c35a ), lin( 0x2f6f9a ) ], [ 125.0, - 839.4, - 0.18, lin( 0x2f8f9a ), lin( 0xa0402e ) ] ];
			for ( const [ bx, bz, ry, hull, bottom ] of boats ) {

				const gy = g( bx, bz );
				rowboat( B, bx, gy + 0.04, bz, ry, { seed: rand.next(), hull, bottom, trim: C.white, rz: ( rand.next() - 0.5 ) * 0.1 } );
				box( bx, gy + 0.4, bz, 0.72, 0.45, 2.0, ry, 'campBoat' );

			}

			oar( B, [ 119.8, g( 119.8, - 836.2 ) + 0.06, - 836.2 ], [ 120.6, g( 120.6, - 838.6 ) + 0.05, - 838.6 ], rand.next() );
			// the fire pit: a ring of stones, its charred wood, a log to sit on
			const fx = S.x + 6.2, fz = S.z - 6.0, fy = g( fx, fz );
			glow.fire = [ fx, fy, fz ];
			// (M16) the pirogue's rollers, lying where she's hauled up the beach: lengths of coconut trunk
			{

				const H = BOAT.haul;
				for ( const [ dz, dx ] of [ [ - 2.6, 0.1 ], [ - 0.4, - 0.08 ], [ 1.7, 0.05 ] ] ) {

					const hz = H.z + dz, hx = H.x + dx;
					B.rod( 'wood', [ hx - 1, g( hx - 1, hz ) + 0.05, hz + 0.05 ], [ hx + 1, g( hx + 1, hz ) + 0.05, hz - 0.04 ], 0.1, 0.09, { segs: 6, tint: lin( 0x6f6252 ), data: WOOD( rand.next(), 1 ) } );

				}

			}

			for ( let k = 0; k < 9; k ++ ) {

				const a = k / 9 * Math.PI * 2 + rand.next() * 0.3, s = 0.11 + rand.next() * 0.06;
				B.part( 'stone', stonePart( k % 4, B.lite ? 0 : 1 ), fx + Math.cos( a ) * 0.48, fy + s * 0.25, fz + Math.sin( a ) * 0.48, { sx: s * 1.3, sy: s * 0.8, sz: s, ry: rand.next() * 6, tint: lin( 0x7a746a ), data: [ rand.next(), 0, 0, 0 ] } );

			}

			for ( let k = 0; k < 4; k ++ ) {

				const a = rand.next() * Math.PI;
				B.rod( 'wood', [ fx - Math.cos( a ) * 0.3, fy + 0.04, fz - Math.sin( a ) * 0.3 ], [ fx + Math.cos( a ) * 0.3, fy + 0.08, fz + Math.sin( a ) * 0.3 ], 0.035, 0.03, { tint: lin( 0x2a2420 ), data: WOOD( rand.next(), 1 ) } );

			}

			B.rod( 'wood', [ fx - 0.9, fy + 0.18, fz + 1.3 ], [ fx + 0.9, fy + 0.18, fz + 1.4 ], 0.17, 0.16, { segs: 8, data: WOOD( rand.next(), 0.95 ) } );
			box( fx, fy + 0.18, fz + 1.35, 0.9, 0.18, 0.18, 0, 'campLog' );
			// wood stacked behind the shed, the rain barrel at its corner
			woodpile( B, S.x + 1.2, g( S.x + 1.2, S.z + S.d / 2 + 0.6 ), S.z + S.d / 2 + 0.6, 0, rand );
			waterTank( B, S.x - S.w / 2 - 0.5, g( S.x - S.w / 2 - 0.5, S.z + 0.9 ), S.z + 0.9, rand.next(), false );
			colliders.addCylinder( S.x - S.w / 2 - 0.5, S.z + 0.9, 0.45, g( S.x - S.w / 2 - 0.5, S.z + 0.9 ), g( S.x - S.w / 2 - 0.5, S.z + 0.9 ) + 1.2, { tag: 'campBarrel' } );

		}

		this.triangles = Object.values( B.batches ).reduce( ( n, b ) => n + ( b ? b.icount / 3 : 0 ), 0 );
		this.village._assembleBuilder( B, 'camp' );
		// (M16) its roofs, as the village's take a hurricane (their fates by ids of their own: the same on any tier)
		ctx.holes.forEach( ( h, k ) => {

			h.id = 900 + k;

		} );
		const from = this.village.addRoofHoles( ctx.holes ), app = this.app;
		if ( app && app.flyingSheets ) app.flyingSheets.add( this.village.sheetFlyers( from ) );
		// (M16) her boat and her lights
		this.boat = new PearlsBoat( { scene: this.scene, terrain: T, colliders, material: this.village.materials.wood, tier: this.village.tier, waves: app && app.waves, query: app && app.query } );
		this.lights = new CampLights( { scene: this.scene, lights: app && app.localLights, at: glow } );

	}

}
