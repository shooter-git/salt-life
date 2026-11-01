import { BOATS } from '../../world/boat/Boats.js';
import { UPGRADES } from '../Gear.js';

// (M16) Your fleet and Marta's list, as figures: what each boat costs to buy, keep and haul, and what she'll give for one.
// Pure, for the tests under Node. The save's side is GameState (buyBoat, sellBoat, chargeDues...), the game's FleetDesk,
// and where each figure's from docs/m16/fleet.md. Prices are tuned against what the fish fetch: docs/m16/opening.md, tools/earnings.mjs.
//
//   price      Marta's list ($), new
//   slip       a month at her dock: nothing for a kayak on the sand
//   upkeep     a month's looking after, a tenth of her price over a year
//   haul       the haul-out ahead of a hurricane: by the foot, as a yard bills it (the lobster boat's is M13's $40)
//   paintJob   painting her
export const FLEET = {
	kayak: { price: 150, slip: 0, upkeep: 0, haul: 5, paintJob: 20, what: 'Paddled. No fuel, no cost to run. The flats and the sheltered shallows, and a squall\'s a real danger.' },
	console: { price: 1800, slip: 35, upkeep: 15, haul: 35, paintJob: 120, what: 'Your first engine: gasoline outboards. Fast, out to the reef, the wrecks and the near offshore. No cabin: a squall soaks you.' },
	lobster: { price: 6000, slip: 40, upkeep: 50, haul: 40, paintJob: 200, what: 'Diesel and a wheelhouse: the first real shelter from the weather, a big hold, nearshore and the reef\'s edge.' },
	sportfisher: { price: 25000, slip: 72, upkeep: 208, haul: 90, paintJob: 900, what: 'Twin diesels, bunks and a tower. Past the reef for the bluewater fish, days at a time.' },
};

// a month, in the island's days; and how many of them she'll bill at once (a room days ahead of you, or a long time gone)
export const MONTH = 30;
export const MOST_MONTHS = 3;
// a bill leaves you this much, the rest on the tab: enough for a tank on a small boat
export const DUES_LEAVE = 20;

// what she gives: of what you paid, and of her upgrades' cost. A trade-in's better than a sale: she's making a sale
// herself. Less what it'd cost to repair her
export const TRADE = { boat: 0.6, gear: 0.4 };
export const SALE = { boat: 0.5, gear: 0.3 };

// her topsides, as a yard would mix them (null: as she came)
export const PAINTS = [
	{ id: 'white', name: 'Off-white', hex: 0xf2efe6 },
	{ id: 'cream', name: 'Cream', hex: 0xe6dcc4 },
	{ id: 'seafoam', name: 'Seafoam', hex: 0xb4d4cf },
	{ id: 'sky', name: 'Pale blue', hex: 0x9cbfd6 },
	{ id: 'blue', name: 'Offshore blue', hex: 0x1f4e79 },
	{ id: 'navy', name: 'Navy', hex: 0x14283f },
	{ id: 'green', name: 'Hunter green', hex: 0x24452f },
	{ id: 'red', name: 'Barn red', hex: 0x7c2a22 },
];
export const paintOf = ( id ) => PAINTS.find( ( p ) => p.id === id ) || null;

// a name, as it'd go on her transom
export const NAME_MAX = 24;
export const cleanName = ( s ) => String( s ?? '' ).replace( /[\u0000-\u001f<>&"]/g, '' ).replace( /\s+/g, ' ' ).trim().slice( 0, NAME_MAX );

// her gear's cost so far: the tracks on her, at the levels in `upgrades`
export function gearWorth( upgrades, id ) {

	let n = 0;
	for ( const [ k, t ] of Object.entries( UPGRADES ) ) {

		if ( t.on !== id ) continue;
		for ( let i = 1; i <= Math.min( upgrades[ k ] | 0, t.levels.length - 1 ); i ++ ) n += t.levels[ i ].cost;

	}

	return n;

}

// what a month of your boats comes to
export const monthly = ( fleet ) => Object.keys( fleet ).reduce( ( s, id ) => s + ( FLEET[ id ] ? FLEET[ id ].slip + FLEET[ id ].upkeep : 0 ), 0 );

// as she's called: the name you gave her, or what she is ('the lobster boat')
export const kindOf = ( id ) => BOATS[ id ].name.toLowerCase();
