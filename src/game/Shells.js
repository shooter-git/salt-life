// (M16) The shell collection: fourteen shells of the real Caribbean, each from where it really lives, checked against
// sources (docs/m16/north.md). Left out though they're the famous ones: the junonia, the lightning whelk and the sunray
// venus, shells of the Carolinas, Florida and the Gulf, not of these islands. Pure, for the tests under Node.
//   SHELLS: each one's name, its Latin name, its length drawn (cm), where it's found (at: in a word, for the panel's place; where: in full), what it is,
//   Marta's price for a spare, who buys a spare (null: the queen conch's a keepsake)
//   shell state (GameState.shells, its save field): readShells( saved ) -> { have: { kind: { day, id } }, wall: day | null }
//   keepShell( shells, f ): the first of its kind into the set: true (a spare: false, it goes with your finds)
//   shellsHave( shells ) -> how many of the set     setComplete( shells )     WALL_PAY: what Marta pays for it, framed

export const SHELLS = {
	queenConch: { name: 'Queen conch', sci: 'Aliger gigas', cm: 22, at: 'The bay, the north beach', where: 'The bay\'s sand and its east side, the north beach after a sea', what: 'the seagrass flats\' great snail, its lip pink; an empty one has the fisherman\'s cut in its spire', price: 0, who: null, note: 'Trade in queen conch shell needs a CITES permit, so it\'s no one\'s to buy: a keepsake.' },
	fightingConch: { name: 'Fighting conch', sci: 'Strombus pugilis', cm: 8, at: 'The bay\'s sand', where: 'The bay\'s sand and its east side', what: 'a small orange conch of the sand flats, spined at the shoulder', price: 2, who: 'marta' },
	sunriseTellin: { name: 'Sunrise tellin', sci: 'Tellina radiata', cm: 6, at: 'The bay\'s sand', where: 'The bay\'s sand', what: 'a thin, polished clam, rose rays on cream', price: 1, who: 'marta' },
	turkeyWing: { name: 'Turkey wing', sci: 'Arca zebra', cm: 7, at: 'Bay\'s east side, rocks', where: 'The bay\'s east side, its rocks', what: 'a boxy ark clam, striped like a turkey\'s wing', price: 1, who: 'marta' },
	nettedOlive: { name: 'Netted olive', sci: 'Americoliva reticularis', cm: 4, at: 'The bay\'s sand', where: 'The bay\'s sand', what: 'a polished cylinder, a fine purple net over cream', price: 3, who: 'marta' },
	topShell: { name: 'West Indian top shell', sci: 'Cittarium pica', cm: 8, at: 'The rocks', where: 'The rocks down either side of the bay', what: 'the islands\' "whelk": heavy, black flames on white, pearl inside', price: 2, who: 'marta' },
	bleedingTooth: { name: 'Bleeding tooth', sci: 'Nerita peloronta', cm: 3, at: 'The rocks', where: 'The rocks down either side of the bay', what: 'a nerite of the splash zone, two teeth in a red blotch', price: 1, who: 'marta' },
	yellowCowrie: { name: 'Atlantic yellow cowrie', sci: 'Naria acicularis', cm: 2, at: 'The rocks', where: 'The rocks down either side of the bay', what: 'a little glossy cowrie from under the stones', price: 3, who: 'marta' },
	measledCowrie: { name: 'Measled cowrie', sci: 'Macrocypraea zebra', cm: 7, at: 'Rocks, north pocket', where: 'The rocks, and the pocket west of the north beach', what: 'long and glossy, brown, white spots; ringed along its sides', price: 8, who: 'marta' },
	periwinkle: { name: 'Mangrove periwinkle', sci: 'Littoraria angulifera', cm: 3, at: 'Back of the mangroves', where: 'Along the back of the mangroves', what: 'the snail of the prop roots, thin and sharp-spired', price: 1, who: 'marta' },
	flamingoTongue: { name: 'Flamingo tongue', sci: 'Cyphoma gibbosum', cm: 3, at: 'After a blow, north', where: 'After a blow: the north beach, the pocket west of it, the rocks', what: 'the reef\'s sea-fan snail: its orange spots are the living animal\'s, the shell plain cream', price: 12, who: 'marta' },
	kingHelmet: { name: 'King helmet', sci: 'Cassis tuberosa', cm: 20, at: 'After a sea, north', where: 'After a sea: the north beach, the pocket west of it, the bay\'s east side', what: 'heavy as a stone, its shield toothed in dark brown', price: 25, who: 'marta' },
	triton: { name: 'Atlantic triton', sci: 'Charonia variegata', cm: 25, at: 'After a sea, north', where: 'After a sea: the north beach, the pocket west of it', what: 'the reef\'s great trumpet, its lip scalloped on dark blotches', price: 35, who: 'marta' },
	musicVolute: { name: 'Music volute', sci: 'Voluta musica', cm: 7, at: 'Rarely: the bay', where: 'Once in a long while: the bay\'s sand and its east side', what: 'staves and notes round a cream shell; from deep water, so few come ashore', price: 30, who: 'marta' },
};
export const SHELL_KINDS = Object.keys( SHELLS );
export const WALL_PAY = 200;

export function readShells( d ) {

	const have = {};
	if ( d && d.have && typeof d.have === 'object' ) for ( const [ k, v ] of Object.entries( d.have ) ) if ( SHELLS[ k ] && v ) have[ k ] = { day: v.day | 0, id: typeof v.id === 'string' ? v.id : '' };
	return { have, wall: d && Number.isFinite( d.wall ) ? d.wall : null };

}

export function keepShell( shells, f ) {

	if ( ! SHELLS[ f.kind ] || shells.have[ f.kind ] ) return false;
	shells.have[ f.kind ] = { day: f.day | 0, id: f.id };
	return true;

}

export const shellsHave = ( shells ) => Object.keys( shells.have ).length;
export const setComplete = ( shells ) => SHELL_KINDS.every( ( k ) => shells.have[ k ] );
