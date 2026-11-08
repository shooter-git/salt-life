// (M16) The boats there are: what's known of one without building it (data only, so the game's logic and tests read it
// freely). Her model (a world/boat/Vessel) is only made when she's the boat you're in: loadBoat.
//
//   name, feet     as Marta's list says it
//   fuel           what her engine burns: 'gasoline', 'diesel', or null with no engine
//   stats          what she is before any of her upgrades (game/Gear.js gearStats: her tracks' levels go over these)
//   load           makes her model
export const BOATS = {
	kayak: {
		name: 'Fishing kayak', feet: 12, fuel: null,
		stats: { holdKg: 12, fuelL: 0, speedMul: 1, baitMax: 12, finder: false, deckLights: false, anchorM: 0, pumpLs: 0 },
		load: () => import( './kayak/KayakModel.js' ).then( ( m ) => new m.KayakModel() ),
	},
	console: {
		name: 'Center console', feet: 23, fuel: 'gasoline',
		stats: { holdKg: 60, fuelL: 200, speedMul: 1, baitMax: 24, finder: false, deckLights: false, anchorM: 0, pumpLs: 0.3 },
		load: () => import( './console/ConsoleModel.js' ).then( ( m ) => new m.ConsoleModel() ),
	},
	lobster: {
		name: 'Lobster boat', feet: 27, fuel: 'diesel',
		stats: {},
		load: () => import( '../BoatModel.js' ).then( ( m ) => new m.BoatModel() ),
	},
	sportfisher: {
		name: 'Offshore sportfisher', feet: 48, fuel: 'diesel',
		stats: { holdKg: 300, fuelL: 2200, speedMul: 1, baitMax: 120, finder: true, deckLights: true, anchorM: 0, pumpLs: 1, livewell: true },
		load: ( tier ) => import( './sportfisher/SportfisherModel.js' ).then( ( m ) => new m.SportfisherModel( tier ) ),
	},
};

// what a new game starts in
export const START_BOAT = 'kayak';

// (tier: the device's: a boat may have a lighter version for phones). ((M17) Her lines' sections, kept as she was built,
// let go once she is, as the sportfisher's were after her floating: 0.7 to 0.9 MB of script memory held for as long as
// she's the boat you're in. The few asked of her afterwards, her ladder's, are worked out again)
export const loadBoat = ( id, tier ) => BOATS[ id ].load( tier ).then( ( model ) => {

	if ( model.lines && model.lines._sectionCache ) model.lines._sectionCache.clear();
	return model;

} );
