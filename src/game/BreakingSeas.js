// (M16) A breaking sea coming aboard. The long seas of a gale don't hurt a small boat: she rides up a 12 ft, 9 s wave as
// up a hill, her deck dry (test/north-sea.mjs: her stem never under). What hurts is a crest breaking on her: water on
// deck, the boat knocked over and flung. So here: from a gale's sea (FROM m, past 9.5 ft), when one of the rollers you
// can see (Whitecaps.foamAt) is at her bow, her middle or her stern, up on the crest of a long wave (ON_CREST of its
// height), she takes it. Water in her bilge (her `sea` litres at a gale's 12 ft, by the height of the sea: Hull.HULLS); a
// hard slam's wear and maybe its stall in a worn boat (Hull.slam); knocked over about her keel, away from the wind (her
// `knock` rad/s). (M16) Each boat as herself: the console's deck and the sportfisher's cockpit clear by their scuppers, so
// little of it reaches the bilge, where the lobster boat's open cockpit lets it down round her engine box; a light boat's
// thrown further than a heavy one, and a kayak's bilge is the sea.
//
// A gale: about one a minute under way, at anchor or adrift: the lobster boat's engine is flooded in eight minutes or so
// if you stand at the wheel (Hull's FLOOD_L), the bucket holding it if you leave the wheel, and she won't come out for you in it (Marta).
// Past the far grounds half as much again each time. A fair day, a breezy day, a near gale: never. Only aboard and
// only out in it: not where the shallows have faded the open sea.
//   const seas = new BreakingSeas( { waves, caps, hull } );  seas.step( dt, boat, hs, t ) -> strength of a hit, or 0
//   seas.update( dt, app ): what the game calls, aboard

import { G } from '../core/Globals.js';
import { seaHeight } from './Weather.js';
import { HULLS } from './Hull.js';

const FROM = 2.9, HS = 3.66, ON_CREST = 0.3, COOL = 6, EVERY = 0.1;
export const BREAKING = { FROM, HS, ON_CREST, COOL };
const POINTS = [ 0.36, 0, - 0.33 ]; // of her length, along her from her middle: where a sea can come aboard
export const breakingLitres = ( hs, boat = 'lobster' ) => ( hs < FROM ? 0 : HULLS[ boat ].sea * hs / HS );

export class BreakingSeas {

	constructor( { waves, caps, hull } ) {

		this.waves = waves;
		this.caps = caps;
		this.hull = hull;
		this._t = 0;
		this._cool = 0;
		this.hits = 0;
		this._f = { roller: 0, foam: 0 };

	}

	// (the game, each frame: the sea where she is, you aboard her; a hit heard, and its spray thrown)
	update( dt, app ) {

		const live = app.weather && app.weather.live, b = app.boatCtl, mode = app.player.mode;
		if ( ! live || b.hauled || b.moored || ( mode !== 'deck' && mode !== 'boat' ) ) return 0;
		const hs = seaHeight( live.swell, live.windSea, live.blow ) * this.waves.leeAt( b.position.x, b.position.z )[ 0 ];
		const hit = this.step( dt, b, hs, G.time.value );
		if ( hit > 0 && app.audio ) app.audio.hullSlap( 1 );
		return hit;

	}

	// hs: the significant height of the sea where she is (m); t: the sea's time. boat: BoatController
	step( dt, boat, hs, t ) {

		this._cool = Math.max( 0, this._cool - dt );
		this._t -= dt;
		if ( hs < FROM || this._cool > 0 || this._t > 0 ) return 0;
		this._t = EVERY;
		const p = boat.position, waves = this.waves;
		if ( waves.fadeAt( p.x, p.z ) < 0.9 ) return 0;
		// (up on a long wave's crest: the sea here over its level, against its height)
		if ( waves.heightAt( p.x, p.z, t ) - G.seaLevel.value < ON_CREST * hs / 2 ) return 0;
		const yaw = boat.getYaw(), fx = Math.sin( yaw ), fz = Math.cos( yaw );
		const L = boat.model.lines.length;
		let hit = 0;
		for ( const along of POINTS ) hit = Math.max( hit, this.caps.foamAt( p.x + fx * along * L, p.z + fz * along * L, t, this._f ).roller );
		if ( hit < 0.5 ) return 0;
		this._cool = COOL;
		this.hits ++;
		const hull = this.hull;
		hull.slam( 0.96 );
		const her = hull.figures;
		hull.bilge = Math.min( her.bilgeMax, hull.bilge + breakingLitres( hs, hull.boat ) );
		// (thrown over about her keel, away from the side the wind's on)
		const w = G.windDir.value, side = w.x * fz - w.y * fx >= 0 ? 1 : - 1, k = side * her.knock * Math.min( 2, hs / HS );
		boat.angular.x += fx * k;
		boat.angular.z += fz * k;
		return hit;

	}

}
