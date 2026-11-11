// (M17) Plain-node tests of sight-fishing on the flats (docs/m17/sight.md): how plainly a fish shows (game/Sight.js:
// Fresnel's glare by the angle you look down, through the glasses and not; the bottom, the sun, a cloud's shadow, the
// wind and the rain; each eye height's range), what tells a school you're there (your speed, your height, your shadow,
// the push of water ahead of a hull, a paddle's knock, a cast on its head, the line over its back), a seen fish's own
// take (Bites.seenTake: it eats, refuses or spooks by what it is and what it's shown, and where), the grand slam
// (Trophies.js: within one island day, not across a sleep, kept as a trophy and through a save), and the flats' fish
// drawn within their room (world/Fish.js' flats pool: at most so many fish, so many triangles on low).
import { fresnel, glareLeft, seenOnFlats, noticeRange, shadowLine, nearLine, pushAhead, scareOf, castScare, SIGHT, sightOf, knockOf } from '../src/game/Sight.js';
import { seenTake } from '../src/game/Bites.js';
import { FISH } from '../src/game/FishTable.js';
import { SLAMS, slamDay, slamCatch, slamSlept, slamRows, trophyRows, cleanTrophies, slamToday } from '../src/game/Trophies.js';
import { FLATS_POOL, flatsTriangles } from '../src/world/fish/FlatsPool.js';
import { SPECIES } from '../src/world/fish/FishSpecies.js';
import { fishGeometry } from '../src/world/fish/FishGeometry.js';

let fails = 0;
const ok = ( c, msg ) => {

	if ( ! c ) { fails ++; console.log( 'FAIL', msg ); } else console.log( 'ok  ', msg );

};
const DEG = Math.PI / 180;

// ---- the glare: Fresnel's for seawater, as the sources' table has it (docs/m17/sources-tide-fish.md)
for ( const [ e, R, Rp ] of [ [ 2, 0.81, 0.75 ], [ 5, 0.59, 0.49 ], [ 10, 0.35, 0.24 ], [ 20, 0.14, 0.05 ], [ 90, 0.02, 0.02 ] ] ) {

	const f = fresnel( e * DEG );
	ok( Math.abs( f.R - R ) < 0.012 && Math.abs( f.Rp - Rp ) < 0.012, `${ e } degrees down: reflectance ${ f.R.toFixed( 3 ) } (${ R }), p-polarized ${ f.Rp.toFixed( 3 ) } (${ Rp })` );

}

ok( glareLeft( 36.7 * DEG ) < 0.035 && glareLeft( 3 * DEG ) > 0.85 && glareLeft( 15 * DEG ) < glareLeft( 8 * DEG ), `the glasses take nearly all the glare at Brewster's angle (${ glareLeft( 36.7 * DEG ).toFixed( 3 ) } left), little along the surface (${ glareLeft( 3 * DEG ).toFixed( 2 ) })` );

// ---- how far a bonefish shows, by eye height (the range where it's seen half the time)
const BASE = { L: 0.55, depth: 0.4, bottom: SIGHT.bottom.sand, back: FISH.bonefish.sight.back, glasses: true, sun: Math.sin( 60 * DEG ), behind: 1, shade: 0, overcast: 0, wind: 3, rain: 0, night: 0, tailUp: 0, sign: 0 };
const range = ( q, key = 'body' ) => {

	let last = 0;
	for ( let d = 0.5; d < 200; d += 0.25 ) if ( seenOnFlats( { ...BASE, ...q, d } )[ key ] >= 0.5 ) last = d;
	return last;

};

const kayak = range( { h: 0.81 } ), wade = range( { h: 1.62 } ), bow = range( { h: 2.5 } ), roof = range( { h: 3.8 } );
ok( kayak >= 8 && kayak <= 13, `from the kayak's seat (0.81 m) a bonefish on white sand shows to ${ kayak } m: close in` );
ok( wade >= 13 && wade <= 22, `wading (1.62 m) to ${ wade } m` );
ok( bow >= 20 && bow <= 32, `from a bow (2.5 m) to ${ bow } m` );
ok( roof >= 28 && roof <= 42 && roof > bow && bow > wade && wade > kayak, `from the lobster boat's roof (3.8 m) to ${ roof } m: height's what shows you the water` );
const bare = range( { h: 1.62, glasses: false } );
ok( bare < wade && range( { h: 3.8, glasses: false } ) < roof * 0.97, `without the glasses less (wading ${ bare } m), and the more so the higher you are` );
ok( range( { h: 0.81, shade: 1 } ) <= 4 && range( { h: 1.62, shade: 1 } ) <= 6, `under a cloud's shadow almost nothing (${ range( { h: 0.81, shade: 1 } ) } m from the kayak, ${ range( { h: 1.62, shade: 1 } ) } wading)` );
ok( range( { h: 1.62, shade: 1 }, 'shadow' ) === 0, 'and no shadow on the sand under a cloud' );
ok( range( { h: 0.81, rain: 1 } ) === 0 && range( { h: 0.81, rain: 1, tailUp: 0.12 }, 'tail' ) === 0 && range( { h: 0.81, rain: 1, sign: 1 }, 'sign' ) === 0, 'rain on the water shows nothing' );
ok( range( { h: 1.62, bottom: SIGHT.bottom.grass } ) < 4, `over turtle grass a bonefish hides (${ range( { h: 1.62, bottom: SIGHT.bottom.grass } ) } m wading)` );
ok( range( { h: 1.62, sun: 0.3, behind: - 1 } ) < wade * 0.5, `with the sun low in your face it's lost in the glitter (${ range( { h: 1.62, sun: 0.3, behind: - 1 } ) } m)` );
const shadow = range( { h: 1.62 }, 'shadow' );
ok( shadow >= wade * 0.8, `its shadow on the sand shows about as far (${ shadow } m)` );
const tails = [ 1, 4, 8, 12 ].map( ( w ) => range( { h: 0.81, wind: w, tailUp: 0.12 }, 'tail' ) );
ok( tails[ 0 ] >= 25 && tails[ 0 ] > kayak * 2 && tails[ 3 ] === 0 && tails[ 2 ] < tails[ 0 ], `glassy water shows a tail out to ${ tails[ 0 ] } m from the kayak, far past the fish; a breeze less (${ tails.join( ', ' ) } m at 1, 4, 8, 12 m/s)` );
const signs = [ 1, 3, 5, 7 ].map( ( w ) => range( { h: 0.81, wind: w, sign: 1 }, 'sign' ) );
ok( signs[ 0 ] >= 20 && signs[ 3 ] === 0 && signs[ 2 ] < signs[ 0 ], `nervous water: ${ signs.join( ', ' ) } m at 1, 3, 5, 7 m/s` );
ok( range( { h: 0.81, back: FISH.tarpon.sight.back, L: 1.6, depth: 1 } ) > kayak * 1.5, 'a tarpon, big and dark-backed, shows further than a bonefish' );

// ---- what tells them you're there
const nr = ( kind, q ) => noticeRange( kind, { eye: 1.62, wind: 4, depth: 0.4, ...q } );
ok( nr( 'bonefish', { speed: 0 } ) < 5 && nr( 'bonefish', { speed: 2 } ) > nr( 'bonefish', { speed: 0.3 } ) * 2, `a bonefish notices a still wader at ${ nr( 'bonefish', { speed: 0 } ).toFixed( 1 ) } m, a slow one at ${ nr( 'bonefish', { speed: 0.3 } ).toFixed( 1 ) }, one splashing along at ${ nr( 'bonefish', { speed: 2 } ).toFixed( 1 ) }` );
ok( nr( 'bonefish', { eye: 2.5 } ) > nr( 'bonefish', { eye: 0.81 } ), 'a taller angler is seen further (Snell\'s window)' );
ok( nr( 'bonefish', { wind: 1 } ) > nr( 'bonefish', { wind: 8 } ), 'glassy water shows you, a chop hides you' );
ok( nr( 'permit', {} ) > nr( 'bonefish', {} ) && nr( 'barracuda', {} ) < nr( 'bonefish', {} ) * 0.6, 'a permit\'s the warier, a barracuda hardly wary' );
const noon = shadowLine( 1.8, { x: 0, y: 0.97, z: 0.24 } ), evening = shadowLine( 1.8, { x: 0.94, y: 0.34, z: 0 } );
ok( noon.len < 0.6 && evening.len > 4.5 && evening.dx < - 0.99, `your shadow standing: ${ noon.len.toFixed( 1 ) } m at noon, ${ evening.len.toFixed( 1 ) } m long in the evening, away from the sun` );
ok( Math.abs( nearLine( 0, 0, 10, 0, 5, 3 ) - 3 ) < 1e-9 && Math.abs( nearLine( 0, 0, 10, 0, 13, 4 ) - 5 ) < 1e-9, 'how far a point is from a line on the water' );
ok( pushAhead( 1.5, 0.4 ) > 6 && pushAhead( 1.5, 2 ) === 0 && pushAhead( 0.1, 0.4 ) === 0, `a hull at 1.5 m/s pushes water ${ pushAhead( 1.5, 0.4 ).toFixed( 1 ) } m ahead over a flat, none in deep water or drifting` );
ok( knockOf( 1 ) > knockOf( 0.3 ) * 3, 'a hard stroke knocks the hull more often than a careful one' );
const school = { x: 0, z: 12, r: 2, depth: 0.4 }, SUN_HIGH = { x: 0, y: 0.95, z: 0.3 };
const at = ( q ) => ( { x: 0, z: 0, vx: 0, vz: 0, eye: 0.81, tall: 0.9, knock: 0, hull: true, ...q } );
ok( scareOf( 'bonefish', school, at( { vz: 0.3 } ), SUN_HIGH, { wind: 4 } ) === null, 'a kayak drifting up on a school 12 m off: not noticed' );
ok( scareOf( 'bonefish', school, at( { vz: 1.8 } ), SUN_HIGH, { wind: 4 } ) === 'speed', 'paddled at it hard: spooked by speed' );
ok( scareOf( 'bonefish', { ...school, z: 6 }, at( { vz: 0.7, eye: 1.62, hull: false } ), SUN_HIGH, { wind: 4 } ) === 'speed', 'waded up on fast to 6 m: spooked' );
ok( scareOf( 'bonefish', { ...school, z: 10.5 }, at( { vz: 1.4 } ), SUN_HIGH, { wind: 7 } ) === 'push', 'a kayak coming on in a chop: spooked by the push of water ahead of her' );
ok( scareOf( 'bonefish', { x: - 5.5, z: 0.5, r: 1.5, depth: 0.4 }, at( { tall: 1.8, eye: 1.62, hull: false } ), { x: 0.94, y: 0.34, z: 0 }, { wind: 4 } ) === 'shadow', 'a still wader\'s evening shadow over a school: spooked by the shadow' );
ok( scareOf( 'bonefish', { x: - 5.5, z: 0.5, r: 1.5, depth: 0.4 }, at( { tall: 1.8, eye: 1.62, hull: false } ), { x: 0.94, y: 0.34, z: 0 }, { wind: 4, shade: 1 } ) === null, 'under a cloud there\'s no shadow to throw' );
ok( scareOf( 'bonefish', school, at( { knock: 1 } ), SUN_HIGH, { wind: 4 } ) === 'knock' && scareOf( 'bonefish', { ...school, z: 40 }, at( { knock: 1 } ), SUN_HIGH, { wind: 4 } ) === null, 'a knock on the hull spooks a school 12 m off, not one 40 m off' );
const tip = { x: 0, z: 0 };
ok( castScare( 'bonefish', 0, 10, { x: 0.2, z: 10.1 }, tip ) === 'cast', 'a shrimp landed on its head: spooked' );
ok( castScare( 'bonefish', 0.3, 10, { x: 0, z: 12 }, tip ) === 'line', 'cast past it, the line over its back: spooked' );
ok( castScare( 'bonefish', 0, 10, { x: 0.3, z: 11.6 }, { x: - 8, z: 6 } ) === null, 'put a metre and a half ahead of it from the side: fine' );
ok( castScare( 'bonefish', 0, 10, { x: 0.75, z: 10 }, tip, 'plug' ) === 'cast' && castScare( 'bonefish', 0, 10, { x: 0.75, z: 10 }, tip ) === null, 'a plug\'s splash spooks it further off than a shrimp\'s' );

// ---- a seen fish's take
let seed = 7;
const rng = () => ( seed = ( seed * 16807 ) % 2147483647 ) / 2147483647;
const tally = ( kind, bait, where, n = 4000 ) => {

	const t = { none: 0, spook: 0, eat: 0, refuse: 0 };
	for ( let i = 0; i < n; i ++ ) t[ seenTake( kind, bait, where, rng ).act ] ++;
	for ( const k in t ) t[ k ] /= n;
	return t;

};
const pct = ( t ) => Object.entries( t ).map( ( [ k, v ] ) => `${ k } ${ Math.round( v * 100 ) }%` ).join( ', ' );
const boneWell = tally( 'bonefish', null, { ahead: 1.4, side: 0.2, mode: 'cruise' } );
ok( boneWell.eat > 0.35 && boneWell.eat < 0.7, `a cruising bonefish shown a shrimp a metre and a half ahead: ${ pct( boneWell ) }` );
const boneTail = tally( 'bonefish', null, { ahead: 0.6, side: 0.1, mode: 'tail' } );
ok( boneTail.eat > boneWell.eat, `one tailing, shown it close: keener (${ pct( boneTail ) })` );
ok( tally( 'bonefish', null, { ahead: 2.2, side: 0.2, mode: 'tail' } ).none > 0.95, 'a tailing fish doesn\'t see one put two metres off: it\'s head down' );
ok( tally( 'bonefish', null, { ahead: 0.2, side: 0.1, mode: 'cruise' } ).spook === 1, 'on its head: spooked' );
ok( tally( 'bonefish', null, { ahead: - 2, side: 0.3, mode: 'cruise' } ).none === 1, 'behind it: not seen' );
ok( tally( 'bonefish', 'plug', { ahead: 1.4, side: 0.2, mode: 'cruise' } ).eat < 0.03, 'a bonefish won\'t take a plug' );
const permit = tally( 'permit', null, { ahead: 1, side: 0.1, mode: 'cruise' } );
ok( permit.eat < 0.25 && permit.refuse + permit.spook > 0.7, `a permit shown it well: ${ pct( permit ) }: the hardest to fool` );
const laid = tally( 'tarpon', 'plug', { ahead: 0.6, side: 0.1, mode: 'laid' } ), laidFar = tally( 'tarpon', 'plug', { ahead: 3, side: 0.1, mode: 'laid' } );
ok( laid.eat > 0.2 && laidFar.eat < laid.eat, `a laid-up tarpon takes a plug two feet ahead of its nose (${ pct( laid ) }), less put further off` );
ok( tally( 'barracuda', 'plug', { ahead: - 2, side: 1.5, mode: 'hold' } ).eat > 0.1, 'a barracuda turns on a plug\'s splash behind it' );
ok( tally( 'lemonShark', 'cutMullet', { ahead: 1.5, side: 0.3, mode: 'cruise' } ).eat > 0.4 && sightOf( 'lemonShark' ).bites, 'a lemon shark takes cut bait, and bites through the line' );
const eat = seenTake( 'bonefish', null, { ahead: 1.4, side: 0, mode: 'cruise' }, () => 0.01 );
ok( eat.act === 'eat' && eat.t > eat.turn && eat.t < 4, `it turns to it in ${ eat.turn.toFixed( 1 ) } s and is on it in ${ eat.t.toFixed( 1 ) } s` );

// ---- the grand slam
const fresh = () => ( { trophies: {}, save() {} } );
const fish = ( species, kg, place = 'flats' ) => ( { species, kg, place, released: true } );
ok( slamDay( 4, 5 ) === 3 && slamDay( 4, 6 ) === 4, 'the island day runs sunrise to sunrise' );
{

	const s = fresh();
	ok( slamCatch( s, fish( 'bonefish', 2.1 ), 3 ).length === 0 && slamCatch( s, fish( 'permit', 8 ), 3 ).length === 0, 'a bonefish and a permit: not yet' );
	const got = slamCatch( s, fish( 'tarpon', 30 ), 3 );
	ok( got.length === 1 && got[ 0 ] === 'grand' && s.trophies[ 'slam:grand' ].n === 1, 'and a tarpon the same day: a grand slam' );
	ok( slamCatch( s, fish( 'tarpon', 35 ), 3 ).length === 0 && s.trophies[ 'slam:grand' ].n === 1, 'once a day' );
	ok( slamToday( s, 3 ).grand.done && slamToday( s, 4 ).grand.left.length === 3, 'the day\'s tally: done today, all three to get tomorrow' );
	const rows = trophyRows( s );
	ok( rows[ 0 ] && rows[ 0 ].slam === 'grand' && rows[ 0 ].species === null && /bonefish, a permit and a tarpon/.test( rows[ 0 ].meta ), `it's a trophy in the log: "${ rows[ 0 ] && rows[ 0 ].meta }"` );
	const back = cleanTrophies( JSON.parse( JSON.stringify( s.trophies ) ) );
	ok( back[ 'slam:grand' ] && back[ 'slam:grand' ].n === 1 && back.today && back.today.done.grand && back[ 'slam:grand' ].kinds.tarpon === 30, 'kept through a save, with the day\'s tally' );
	ok( Object.keys( cleanTrophies( { 'slam:nope': { n: 1 }, today: { day: - 4 } } ) ).length === 0, 'nothing kept that isn\'t a slam, or a day' );

}

{

	const s = fresh();
	slamCatch( s, fish( 'bonefish', 2 ), 3 );
	slamCatch( s, fish( 'permit', 6 ), 3 );
	ok( slamCatch( s, fish( 'tarpon', 20 ), 4 ).length === 0, 'the third the next day: no slam' );
	const t = fresh();
	slamCatch( t, fish( 'bonefish', 2 ), 5 );
	slamCatch( t, fish( 'permit', 6 ), 5 );
	slamSlept( t );
	ok( slamCatch( t, fish( 'tarpon', 20 ), 5 ).length === 0, 'nor across a sleep, though the clock\'s the same day' );
	ok( slamCatch( fresh(), fish( 'redfish', 2 ), 5 ).length === 0 && Object.keys( SLAMS ).every( ( id ) => SLAMS[ id ].kinds.every( ( k ) => FISH[ k ] ) ), 'only the slams\' kinds count, and each slam names the table\'s kinds' );

}

// ---- the flats' fish drawn: within their room on low
let most = 0;
for ( const n of Object.values( FLATS_POOL.low.kinds ) ) most += n.groups * n.count;
const tris = Object.fromEntries( [ 'bonefish', 'permit', 'tarpon', 'snook', 'barracuda', 'blacktipShark', 'lemonShark' ].map( ( m ) => [ m, [ 0, 1, 2, 3 ].map( ( lod ) => fishGeometry( SPECIES[ m ], { lod, pose: 'swim' } ).index.count / 3 ) ] ) );
const worst = flatsTriangles( 'low', tris );
ok( worst <= 13000, `on low the flats' fish draw at most ${ most } fish, at worst ${ worst } triangles (the room the checks' camera leaves: about 13k)` );

if ( fails ) {

	console.log( `\n${ fails } failed` );
	process.exit( 1 );

}
