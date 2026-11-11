// (M17, stream 7) The life list and the slams (docs/m17/life-list.md): every kind counted from the fish table and each with
// Joe's line of where to look; each kind's first and best with their island day and place, kept through a save; an old save's
// log loading with no place or day; a protected kind let go counting as caught; the super grand slam and the billfish grand
// slam each inside one island day, not across sunrise or a night's sleep (a sleep seen with the flats' fish not made yet);
// a guest's fish counting for the guest, aboard someone else's boat; and the records board's line. Two real games:
// tools/two-players/life.mjs.
import { register } from 'node:module';

register( 'data:text/javascript,' + encodeURIComponent( `
export async function resolve( specifier, context, next ) {

	if ( specifier === '@allthespaces/portal/three' ) return { url: 'data:text/javascript,export const gltfLoader = {};', shortCircuit: true };
	return next( specifier, context );

}` ) );
globalThis.window = globalThis.window || { devicePixelRatio: 1 };
const { FISH, FISH_IDS } = await import( '../src/game/FishTable.js' );
const { GameState } = await import( '../src/game/GameState.js' );
const { KINDS, lifeList, lifeCount, whenWhere, cleanLog, lifeOf, caught } = await import( '../src/game/LifeList.js' );
const { SLAMS, slamDay, slamCatch, slamSlept, slamRows, slamNote, slamTold, cleanTrophies } = await import( '../src/game/Trophies.js' );
const { biteHint } = await import( '../src/game/Orders.js' );
const { FlatsFishing } = await import( '../src/game/FlatsFishing.js' );
const { lifeLines } = await import( '../src/together/RecordsBoard.js' );
const { islandTime } = await import( '../src/game/Weather.js' );

let bad = 0;
const ok = ( c, what ) => {

	if ( ! c ) bad ++;
	console.log( ( c ? 'ok   ' : 'FAIL ' ) + what );

};

const fresh = () => {

	const s = new GameState( { getItem: () => null, setItem() {}, removeItem() {} } );
	s.save = () => {};
	return s;

};

// ---- the count of kinds, and a line for each
{

	ok( KINDS === FISH_IDS.length && KINDS === 39, `the life list counts the table's kinds: ${ KINDS }` );
	const none = FISH_IDS.filter( ( k ) => ! FISH[ k ].hint || FISH[ k ].hint.length < 15 );
	ok( ! none.length, `every kind has Joe's line of where to look${ none.length ? `: not ${ none.join( ', ' ) }` : '' }` );
	// (Joe's slate draws his hint for the day's two asks: Orders' TWILIGHT and MORE, at the slate's chalk size)
	const SLATE = [ 'yellowtail', 'jack', 'tuna', 'muttonSnapper', 'graySnapper', 'trout', 'redfish', 'sergeant', 'grunt', 'tang', 'wrasse', 'lionfish', 'angel', 'barracuda', 'blackGrouper', 'redSnapper', 'mahi', 'mullet', 'needlefish', 'silkSnapper', 'lobster', 'wahoo', 'yellowfin' ];
	const long = SLATE.filter( ( k ) => biteHint( k ).length > 41 );
	ok( ! long.length && SLATE.every( ( k ) => biteHint( k ) === FISH[ k ].hint ), `the slate's kinds' lines are his hints, each 41 characters or fewer${ long.length ? `: not ${ long.join( ', ' ) }` : '' }` );
	ok( FISH.swordfish.hint.includes( 'deep-dropped' ) && FISH.trout.hint.includes( 'grass' ), 'the two hints in the table\'s rows kept as they were' );
	const s = fresh(), L = lifeList( s );
	ok( L.n === 0 && L.of === 39 && L.left.length === 39 && L.left.every( ( e ) => e.hint ), 'a new game: 0 of 39, all 39 still to catch, each with its line' );

}

// ---- each kind's first and best: the island day and the place, through a save; a protected kind let go counts
{

	const s = fresh();
	s.addFish( 'yellowtail', 0.8, 18, { day: 2, place: 'bay' } );
	s.addFish( 'yellowtail', 1.3, 6, { day: 5, place: 'windReef' } );
	s.addFish( 'yellowtail', 1.0, 7, { day: 6, place: 'bay' } );
	const y = s.log.yellowtail;
	ok( y.count === 3 && y.first[ 0 ] === 2 && y.first[ 1 ] === 'bay' && y.bestKg === 1.3 && y.bestDay === 5 && y.bestAt === 'windReef', 'a kind\'s first (day 3, the bay) kept, its best moved to day 6 on the windward reef, and not by a smaller one after' );
	s.addFish( 'bonefish', 2.2, 10, { day: 6, place: 'coast' } );
	ok( s.lastCatch.released && caught( s, 'bonefish' ) && lifeCount( s ) === 2, 'a bonefish, measured and let go: caught, on the list' );
	s.addHaul( [ { species: 'silverside', kg: 0.04, cm: 12 } ], 9, 'bay', 7 );
	ok( s.log.silverside && s.log.silverside.first[ 0 ] === 7 && s.log.silverside.bestAt === 'bay' && lifeCount( s ) === 3, 'a cast net\'s bait fish too, with its day and place' );
	// (a billfish let go: its trophy too, as Trophies.letGo keeps it)
	s.addFish( 'sailfish', 30, 11, { day: 8, place: 'dropoff' } );
	s.trophies.sailfish = { n: 1, kg: 30, cm: 220, day: 8, place: 'dropoff', tagged: false };
	const L = lifeList( s );
	ok( L.n === 4 && L.left.length === 35 && L.caught.map( ( e ) => e.species ).join() === FISH_IDS.filter( ( k ) => s.log[ k ] ).join(), 'four of 39, in the table\'s order' );
	const e = L.caught.find( ( q ) => q.species === 'yellowtail' );
	ok( whenWhere( e.first ) === 'day 3, the bay' && whenWhere( e.best ) === 'day 6, the windward reef', `told as "first ${ whenWhere( e.first ) } · best ${ whenWhere( e.best ) }"` );
	const back = fresh();
	back.fromJSON( JSON.parse( JSON.stringify( s.toJSON() ) ) );
	const same = ( a, b ) => JSON.stringify( Object.keys( a ).sort().map( ( k ) => [ k, Object.entries( a[ k ] ).sort() ] ) ) === JSON.stringify( Object.keys( b ).sort().map( ( k ) => [ k, Object.entries( b[ k ] ).sort() ] ) );
	ok( same( back.log, s.log ) && lifeCount( back ) === 4, 'kept through a save, as it was' );

}

// ---- an old save's log: no place or day, shown blank until that kind's next best; its first stays unknown
{

	const old = { v: 2, money: 40, log: { grunt: { count: 4, bestKg: 0.9, bestCm: 36 }, tuna: { count: 1, bestKg: 6.2 }, oldKind: { count: 2, bestKg: 1 } } };
	const s = fresh();
	s.fromJSON( JSON.parse( JSON.stringify( old ) ) );
	const L = lifeList( s ), g = L.caught.find( ( e ) => e.species === 'grunt' );
	ok( L.n === 2 && g.count === 4 && g.first.day === null && g.first.place === null && g.best.day === null && whenWhere( g.best ) === '' && whenWhere( g.first ) === '', 'an old save\'s log loads: two kinds, no place or day, told blank' );
	ok( s.log.tuna.bestCm > 0 && s.log.oldKind && s.log.oldKind.count === 2, 'its best\'s length worked out as before, and a kind the table hasn\'t now kept as it was' );
	s.addFish( 'grunt', 0.5, 9, { day: 12, place: 'bay' } );
	ok( s.log.grunt.bestDay === undefined && ! ( 'first' in s.log.grunt ), 'a smaller one after: still blank' );
	s.addFish( 'grunt', 1.1, 9, { day: 13, place: 'bay' } );
	ok( s.log.grunt.bestDay === 13 && s.log.grunt.bestAt === 'bay' && ! ( 'first' in s.log.grunt ), 'its next best: day 14, the bay; its first still unknown' );
	const c = cleanLog( { grunt: { count: 2, bestKg: 1, bestCm: 30, bestDay: - 3, bestAt: 'atlantis', first: [ 1.5, 'bay' ] }, nope: 7 } );
	ok( c.grunt.bestDay === null && c.grunt.bestAt === null && c.grunt.first[ 0 ] === null && c.grunt.first[ 1 ] === 'bay' && ! ( 'nope' in c ), 'a day or a place that isn\'t one isn\'t kept' );

}

// ---- the slams: the super grand slam and the billfish grand slam, each inside one island day
const fish = ( species, kg, place = 'coast' ) => ( { species, kg, place, released: !! FISH[ species ].protected } );
{

	ok( SLAMS.superGrand && SLAMS.billfish && Object.values( SLAMS ).every( ( S ) => S.kinds.every( ( k ) => FISH[ k ] ) ), 'three slams, each of the table\'s kinds' );
	const s = fresh();
	ok( ! slamCatch( s, fish( 'bonefish', 2 ), 4 ).length && ! slamCatch( s, fish( 'permit', 9 ), 4 ).length, 'a bonefish, a permit' );
	ok( slamCatch( s, fish( 'tarpon', 30 ), 4 ).join() === 'grand', 'a tarpon: the grand slam' );
	const got = slamCatch( s, fish( 'snook', 5, 'creek' ), 4 );
	ok( got.join() === 'superGrand' && s.trophies[ 'slam:superGrand' ].n === 1 && s.trophies[ 'slam:superGrand' ].kinds.snook === 5, 'and a snook the same day: the super grand slam' );
	ok( ! /all let go/.test( slamNote( got ) ) && /Super grand slam!/.test( slamNote( got ) ), `told without "all let go" (a snook may be kept): "${ slamNote( got ) }"` );
	// (the snook first: the tarpon makes both at once, and the biggest is the one told)
	const t = fresh();
	for ( const k of [ 'snook', 'bonefish', 'permit' ] ) slamCatch( t, fish( k, 3 ), 9 );
	const both = slamCatch( t, fish( 'tarpon', 25 ), 9 );
	ok( both.sort().join() === 'grand,superGrand' && slamTold( both ).join() === 'superGrand', 'the snook first: the tarpon makes both, the super grand slam told' );
	// (the billfish grand slam)
	const b = fresh();
	ok( ! slamCatch( b, fish( 'sailfish', 30, 'dropoff' ), 20 ).length && ! slamCatch( b, fish( 'whiteMarlin', 28, 'dropoff' ), 20 ).length, 'a sailfish, a white marlin' );
	const bill = slamCatch( b, fish( 'blueMarlin', 180, 'blue' ), 20 );
	ok( bill.join() === 'billfish' && /all let go/.test( slamNote( bill ) ) && b.trophies[ 'slam:billfish' ].place === 'blue', `and a blue marlin the same day: the billfish grand slam, "${ slamNote( bill ) }"` );
	const rows = slamRows( b );
	ok( rows.length === 1 && rows[ 0 ].meta === 'Day 21, the blue water: a sailfish, a white marlin and a blue marlin in one day', `a trophy row with its day: "${ rows[ 0 ].meta }"` );
	ok( ! slamCatch( b, fish( 'blueMarlin', 200, 'blue' ), 20 ).length && b.trophies[ 'slam:billfish' ].n === 1, 'once a day' );
	const back = cleanTrophies( JSON.parse( JSON.stringify( { ...s.trophies, ...b.trophies } ) ) );
	ok( back[ 'slam:superGrand' ].n === 1 && back[ 'slam:billfish' ].kinds.blueMarlin === 180, 'kept through a save' );
	ok( s.money === 0 && b.money === 0, 'a slam pays nothing' );
	ok( lifeOf( s ).sl.join() === 'grand,superGrand' && lifeOf( b ).sl.join() === 'billfish', 'what the board\'s sent: the slams had' );

}

// ---- not across sunrise, nor a night's sleep (seen with the flats' fish not made yet, and offshore)
{

	ok( slamDay( 7, 5.5 ) === 6 && slamDay( 7, 5.9 ) === 7, 'the island day runs from sunrise (5.8) to sunrise' );
	const s = fresh();
	slamCatch( s, fish( 'sailfish', 30 ), slamDay( 7, 15 ) );
	slamCatch( s, fish( 'whiteMarlin', 30 ), slamDay( 7, 16 ) );
	ok( ! slamCatch( s, fish( 'blueMarlin', 150 ), slamDay( 8, 6 ) ).length, 'the blue marlin the next morning, after sunrise: no billfish slam' );
	const t = fresh();
	slamCatch( t, fish( 'sailfish', 30 ), slamDay( 8, 0.5 ) );
	slamCatch( t, fish( 'whiteMarlin', 30 ), slamDay( 8, 3 ) );
	ok( slamCatch( t, fish( 'blueMarlin', 150 ), slamDay( 7, 22 ) ).join() === 'billfish', 'one fished through the night before sunrise: the same day' );
	// (a sleep: the clock's jump, as FlatsFishing.update sees it, with no flats' fish made and far from them)
	const u = fresh(), settings = { day: 9, timeOfDay: 9 };
	const ff = Object.create( FlatsFishing.prototype );
	Object.assign( ff, { app: { settings, camera: { position: { x: 5000, y: 2, z: 3000 } }, fish: null }, game: { state: u }, _T: null } );
	ff.update( 0.016 );
	ok( ff._T === islandTime( 9, 9 ), 'the clock watched with the flats\' fish not made' );
	for ( const k of [ 'bonefish', 'permit', 'tarpon' ] ) slamCatch( u, fish( k, 3 ), slamDay( settings.day, settings.timeOfDay ) );
	settings.timeOfDay = 13; // (a rest of four hours: the same island day by the clock)
	ff.update( 0.016 );
	ok( ! u.trophies.today && ! slamCatch( u, fish( 'snook', 4 ), slamDay( 9, 13 ) ).length, 'a sleep ends the day: the snook after it makes no super grand slam' );
	settings.timeOfDay = 13.01;
	ff.update( 0.016 );
	slamCatch( u, fish( 'snook', 4 ), slamDay( 9, 13.01 ) );
	ok( u.trophies.today && u.trophies.today.got.snook, 'time going on at its pace isn\'t a sleep' );

}

// ---- a guest's fish counts for the guest, aboard someone else's boat
{

	const host = fresh(), guest = fresh(), settings = { day: 11, timeOfDay: 10 };
	// (riding Robin's boat, the guest's catch in her box: main's v2.3.0, together/SharedBox.js)
	guest.boxIs = () => ( { cap: 600, ice: 0, melt: 0, makes: 0, others: 0, word: 'hold', whose: 'Robin', by: [] } );
	// (the guest's own game lands it: FlatsFishing.caught on the guest's state, as Game.updateFight calls it)
	const theirs = Object.assign( Object.create( FlatsFishing.prototype ), { app: { settings }, game: { state: guest }, events: {} } );
	let last = [];
	for ( const [ k, kg ] of [ [ 'sailfish', 31 ], [ 'whiteMarlin', 27 ], [ 'blueMarlin', 160 ], [ 'yellowfin', 48 ] ] ) {

		guest.addFish( k, kg, settings.timeOfDay, { day: 11, place: 'dropoff' } );
		last = theirs.caught( guest.lastCatch );

	}

	ok( guest.inventory.some( ( f ) => f.species === 'yellowfin' ), 'a guest\'s 48 kg yellowfin, too big for their cooler: in Robin\'s hold, still theirs' );
	ok( guest.trophies[ 'slam:billfish' ] && guest.trophies[ 'slam:billfish' ].n === 1 && lifeCount( guest ) === 4, 'the guest\'s three billfish aboard Robin\'s boat: the guest\'s billfish grand slam, and four kinds on the guest\'s list' );
	ok( ! host.trophies[ 'slam:billfish' ] && lifeCount( host ) === 0 && ! last.length, 'none of it Robin\'s' );
	ok( ! theirs.events.slam, 'the Guide\'s grand slam tip isn\'t set by a billfish' );

}

// ---- the records board's line
{

	ok( lifeLines( {} ).length === 0 && lifeLines( { yellowtail: { kg: 1, who: 'Sam' } } ).length === 0, 'no line until someone\'s list is there' );
	const two = { '#robin-1': { who: 'Robin', k: 23, sl: [ 'billfish' ] }, '#sam-1': { who: 'Sam', k: 17, sl: [ 'grand', 'superGrand' ] } };
	const L = lifeLines( two );
	ok( L[ 0 ] === 'Most kinds: Robin, 23 of 39' && L[ 1 ] === 'Slams: Sam\'s super grand · Robin\'s billfish', `two players: "${ L.join( '" / "' ) }"` );
	ok( lifeLines( { '#a': { who: 'Ann', k: 5, sl: [] }, '#b': { who: 'Ben', k: 5, sl: [] } } ).join() === 'Most kinds: Ann and Ben, 5 of 39', 'a tie, and no slams: one line' );

}

console.log( `\n${ bad } failed` );
if ( bad ) process.exit( 1 );
