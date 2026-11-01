// (M16) Everywhere someone can stand on each boat: { name, x, y, z } in her frame, y the deck you're on, near enough. A check of
// what's walked (tools/two-players/aboard.mjs) and of what's drawn under it (test/together-boats.mjs).
export const AREAS = {
	// (sat in, nobody walks her: a rider on her tank well)
	kayak: ( M ) => [ { name: 'tank well', x: M.perch.x, y: M.perch.y, z: M.perch.z } ],
	console: () => [
		{ name: 'cockpit, starboard', x: 0.85, y: 0.32, z: - 1.4 },
		{ name: 'cockpit, port', x: - 0.85, y: 0.32, z: - 1.4 },
		{ name: 'beside the console, starboard', x: 0.82, y: 0.32, z: 0.3 },
		{ name: 'beside the console, port', x: - 0.82, y: 0.32, z: 0.3 },
		{ name: 'the console\'s seat', x: 0, y: 0.65, z: 0.7 },
		{ name: 'the bow\'s sole', x: 0, y: 0.32, z: 2 },
		{ name: 'the bow\'s seat, starboard', x: 0.6, y: 0.67, z: 2.2 },
		{ name: 'the bow\'s seat, port', x: - 0.6, y: 0.67, z: 2.2 },
		{ name: 'foredeck', x: 0, y: 1.65, z: 3.7 },
		{ name: 'through the door', x: - 0.74, y: 0.32, z: - 2.6 },
		{ name: 'platform', x: 0, y: 0.512, z: - 3.3 },
	],
	lobster: () => [
		{ name: 'cockpit', x: 0, y: 0.35, z: - 1.75 },
		{ name: 'cockpit, starboard quarter', x: 0.95, y: 0.35, z: - 2.8 },
		{ name: 'cockpit, port quarter', x: - 0.95, y: 0.35, z: - 2.8 },
		{ name: 'in the house', x: 0.1, y: 0.35, z: 0.45 },
		{ name: 'the house\'s bench', x: 0.9, y: 0.82, z: 0.4 },
		{ name: 'foredeck, aft', x: 0, y: 1.33, z: 1.9 },
		{ name: 'foredeck', x: 0, y: 1.45, z: 2.8 },
		{ name: 'the bow', x: 0, y: 1.57, z: 3.7 },
		{ name: 'the house\'s roof', x: 0, y: 2.41, z: 0.2 },
	],
	sportfisher: ( M ) => {

		const L = M.lines, side = L.sheerX( L.tAtSheerZ( 0 ) ) - 0.25, T = M.stations.tower;
		return [
			{ name: 'cockpit', x: 0, y: 0.5, z: - 4.1 },
			{ name: 'cockpit, starboard quarter', x: 1.5, y: 0.5, z: - 5.2 },
			{ name: 'cockpit, port quarter', x: - 1.5, y: 0.5, z: - 5.2 },
			{ name: 'mezzanine', x: 0, y: 0.9, z: - 2.9 },
			{ name: 'mezzanine\'s box', x: 1.6, y: 1.26, z: - 2.9 },
			{ name: 'salon', x: 0, y: 1.02, z: - 0.5 },
			{ name: 'cabin passage', x: 0, y: 0.15, z: 2.5 },
			{ name: 'guest cabin', x: M.bunks[ 0 ].x, y: M.bunks[ 0 ].y, z: M.bunks[ 0 ].z },
			{ name: 'forward cabin', x: M.bunks[ 1 ].x, y: M.bunks[ 1 ].y, z: M.bunks[ 1 ].z },
			{ name: 'side deck, starboard', x: side, y: M.soleY( side, 0, 3 ), z: 0 },
			{ name: 'side deck, port', x: - side, y: M.soleY( - side, 0, 3 ), z: 0 },
			{ name: 'foredeck', x: 0, y: M.soleY( 0, 5.5, 3 ), z: 5.5 },
			{ name: 'the bow', x: 0, y: M.soleY( 0, 7.6, 3 ), z: 7.6 },
			{ name: 'bridge, at the helm', x: M.helm.rise[ 0 ], y: 3.1, z: M.helm.rise[ 1 ] },
			{ name: 'bridge, aft', x: 0, y: 3.1, z: - 2.6 },
			{ name: 'tower', x: T.x, y: T.y, z: T.z },
		];

	},
};
// (under way, as well as the main deck, on a boat of several: by name)
export const UNDER_WAY = {
	kayak: [ 'tank well' ],
	console: [ 'cockpit, starboard' ],
	lobster: [ 'cockpit' ],
	sportfisher: [ 'cockpit', 'salon', 'bridge, aft', 'tower' ],
};
