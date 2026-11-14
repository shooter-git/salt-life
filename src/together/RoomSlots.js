// (M19) A player's own value in the room, in one of a few slots instead of a key of their own (stream TOGETHER: docs/m19/
// together.md). All the Spaces' room never lets a key go: one set to null still counts against its 256 keys (creation-room.ts,
// setShared), so 'flats.<id>' and 'rest.<id>', one for every player who ever wrote one, piled up toward them over a room's life.
// Now each is '<prefix>@<n>', n under SLOTS, its value the player's own with their id beside it ({ id, ...value }: an older game
// reads it as one more player's record), and a slot's anyone's to take once its player's gone from the room and what's in it is
// spent. Pure, for Node.
//   slotFor( prefix, entries, me, here, spent, mine ) -> the key to write yours to: the slot that's yours, else a free one, else a
//                                                       stale one; none free (SLOTS players here with live records), your own key
//   ownerOf( prefix, key, value ) -> whose it is: the slot's value's id, or a player's own key's suffix
//   entries: [ [ key, value ] ] of the room's under prefix; here: ids in the room now; spent( value ): nothing in it counts now;
//   mine: the slot you wrote last, kept while it's still yours
export const SLOTS = 16;
export const isSlot = ( prefix, key ) => key.startsWith( prefix + '@' );

export function ownerOf( prefix, key, value ) {

	if ( isSlot( prefix, key ) ) return value && typeof value === 'object' && typeof value.id === 'string' ? value.id : null;
	return key.slice( prefix.length ) || null;

}

export function slotFor( prefix, entries, me, here, spent = () => true, mine = null ) {

	const at = new Map( entries.filter( ( [ k ] ) => isSlot( prefix, k ) ) );
	const of = ( k ) => at.has( k ) ? at.get( k ) : null;
	if ( mine && isSlot( prefix, mine ) && ( ! of( mine ) || of( mine ).id === me ) ) return mine;
	const keys = Array.from( { length: SLOTS }, ( _, n ) => `${ prefix }@${ n }` );
	return keys.find( ( k ) => of( k ) && of( k ).id === me ) ||
		keys.find( ( k ) => ! of( k ) ) ||
		keys.find( ( k ) => ! here.includes( of( k ).id ) && spent( of( k ) ) ) ||
		prefix + me;

}

// (M19) A change to the group's save (the SDK's shared.update: it re-reads and re-applies `change` three times when saves cross,
// and fails past that), tried again when it fails: up to AGAIN.n more times, each later than the last and at a random moment
// within it, so the saves that crossed come apart. `change` is applied to what's there each time, so nothing's lost. -> its result
//   updateAgain( update, key, change, { n, ms, wait } )   (wait( ms ) -> a promise: setTimeout's, or the tests' own)
export const AGAIN = { n: 4, ms: 800 };
export function updateAgain( update, key, change, { n = AGAIN.n, ms = AGAIN.ms, wait = ( t ) => new Promise( ( r ) => setTimeout( r, t ) ), rng = Math.random } = {} ) {

	const go = ( k ) => Promise.resolve().then( () => update( key, change ) ).catch( ( e ) => {

		if ( k >= n ) throw e;
		return wait( ms * ( k + 1 ) * ( 0.5 + rng() ) ).then( () => go( k + 1 ) );

	} );
	return go( 0 );

}
