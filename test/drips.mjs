// (M11) Plain-node tests of where the drips come from (fx/Drips.js): the eaves found in a cover map (a
// gable roof laid out by hand, as the cover pass writes it), the palms' fronds, the wheelhouse roof on
// the real boat, and what each lands on; how hard it drips, in the rain and after it; and the drops'
// rhythm as the CPU hears them land (the GPU's to the bit).
import { CoverMap, COVER, encodeHeight } from '../src/world/Cover.js';
import { eavePoints, palmPoints, wheelhousePoints, dripFlow, dripRand, dripRhythm, landingIn, STRIDE, LANDS } from '../src/fx/Drips.js';
import { BoatModel } from '../src/world/BoatModel.js';
import { HOUSE } from '../src/world/boat/Wheelhouse.js';

let fails = 0;
const ok = ( c, msg ) => {

	if ( ! c ) { fails ++; console.log( 'FAIL', msg ); } else console.log( 'ok  ', msg );

};
const each = ( arr ) => Array.from( { length: arr.length / STRIDE }, ( _, n ) => ( { x: arr[ n * STRIDE ], y: arr[ n * STRIDE + 1 ], z: arr[ n * STRIDE + 2 ], below: arr[ n * STRIDE + 3 ], seed: arr[ n * STRIDE + 4 ], on: arr[ n * STRIDE + 5 ] } ) );

// ---- a map of 0.5 m texels from ( 0, 0 ):
//   a tin gable roof over texels i 3..32, j 2..7, its ridge along x between j 4 and 5 (falling 0.3 m a
//     texel to its eaves at j 2 and 7);
//   a wooden deck (i 3..32, j 11..13, level at 2.3 m), under a tin awning's eave (the awning over i 3..12,
//     j 14..16, falling toward the deck);
//   a thatch roof whose eave has a gutter under it (i 3..10, j 18..20, falling to j 20; the gutter at j 21,
//     0.1 m below the eave)
const W = 40, H = 26, T = 0.5, GROUND = 0.5;
const data = new Uint8Array( W * H * 4 );
const put = ( i, j, y, kind ) => {

	const v = encodeHeight( y ), k = ( j * W + i ) * 4;
	data[ k ] = v >> 8;
	data[ k + 1 ] = v & 255;
	data[ k + 2 ] = kind;
	data[ k + 3 ] = 255;

};
for ( let i = 3; i <= 32; i ++ ) for ( let j = 2; j <= 7; j ++ ) put( i, j, 6 - 0.3 * Math.abs( j - 4.5 ), COVER.TIN );
for ( let i = 3; i <= 32; i ++ ) for ( let j = 11; j <= 13; j ++ ) put( i, j, 2.3, COVER.WOOD );
for ( let i = 3; i <= 12; i ++ ) for ( let j = 14; j <= 16; j ++ ) put( i, j, 4.5 + 0.3 * ( j - 14 ), COVER.TIN );
for ( let i = 3; i <= 10; i ++ ) for ( let j = 18; j <= 20; j ++ ) put( i, j, 5 - 0.3 * ( j - 18 ), COVER.THATCH );
for ( let i = 3; i <= 10; i ++ ) put( i, 21, 4.3, COVER.HARD );
const cover = new CoverMap();
cover.setData( data, W, H, 0, 0, T );
const eaves = each( eavePoints( cover, () => GROUND ) );
const onEave = ( p, z ) => Math.abs( p.z - z ) < 0.05;
const front = eaves.filter( ( p ) => onEave( p, 1.0 - 0.04 ) ), back = eaves.filter( ( p ) => onEave( p, 4.0 + 0.04 ) );
const awning = eaves.filter( ( p ) => onEave( p, 7.0 - 0.04 ) );
ok( eaves.length > 0 && front.length + back.length + awning.length === eaves.length, `the gable roof drips off its two eaves, the awning off its one, nowhere else (${ front.length } + ${ back.length }, ${ awning.length })` );
ok( front.length >= 5 && back.length >= 5 && front.length <= 18 && back.length <= 18, 'about one texel in three of an eave' );
ok( [ ...front, ...back ].every( ( p ) => p.x > 1.5 - 0.01 && p.x < 16.5 + 0.01 ), 'none off the gable\'s rakes (the roof is level along them)' );
ok( [ ...front, ...back ].every( ( p ) => Math.abs( p.y - ( 6 - 0.3 * 2.5 - 0.03 ) ) < 0.02 && p.below === GROUND && p.on === LANDS.SOFT ), 'the gable\'s fall from just under the eave\'s edge onto the ground, which says nothing' );
ok( awning.length > 0 && awning.every( ( p ) => Math.abs( p.below - 2.3 ) < 0.01 && p.on === LANDS.DULL ), 'the awning\'s fall onto the deck: dull, as on wood' );
ok( ! eaves.some( ( p ) => p.z > 7.5 ), 'the deck doesn\'t drip, and the thatch over a gutter doesn\'t either (the gutter takes it)' );
ok( new Set( eaves.map( ( p ) => p.seed ) ).size === eaves.length, 'each has its own seed (its own rhythm)' );
ok( eavePoints( new CoverMap(), () => 0 ).length === 0, 'no map yet: no eaves' );

// ---- the palms: a ring under the crown
const palm = { x: 10, y: 1, z: - 4, s: 1, la: 0, l: 0.1, H: 10, seed: 0.3 };
const fronds = each( palmPoints( [ palm ], () => GROUND ) );
const crown = { x: 10 + 0.1 * 10, y: 11, z: - 4 };
ok( fronds.length === 7, 'seven places under a palm\'s crown' );
ok( fronds.every( ( p ) => {

	const r = Math.hypot( p.x - crown.x, p.z - crown.z );
	return r >= 2.6 - 1e-6 && r <= 3.8 + 1e-6 && crown.y - p.y >= 1.2 - 1e-6 && crown.y - p.y <= 2.4 + 1e-6 && p.below === GROUND && p.on === LANDS.SOFT;

} ), 'out where its fronds\' tips hang (2.6 to 3.8 m from the leaning crown, 1.2 to 2.4 m under it), onto the sand' );
const overRoof = each( palmPoints( [ { ...palm, x: 8, z: 1.5 } ], () => GROUND, cover ) ).filter( ( p ) => p.below > 4 );
ok( overRoof.length > 0 && overRoof.every( ( p ) => p.on === LANDS.TIN ), 'a palm over the tin roof drips onto it: tin rings' );
ok( palmPoints( [ { ...palm, H: 1.5 } ], () => GROUND ).length === 0, 'a palm too short to drip far: none' );

// ---- the wheelhouse roof, on the real boat
const boat = new BoatModel();
const house = each( wheelhousePoints( boat.lines ) );
const sides = house.filter( ( p ) => Math.abs( p.x ) > 1.2 ), aft = house.filter( ( p ) => Math.abs( p.x ) <= 1.2 );
ok( sides.length > 8 && aft.length >= 6, `the wheelhouse drips off its sides (${ sides.length }) and its back (${ aft.length })` );
ok( house.every( ( p ) => p.y > 2.3 && p.y < 2.4 && p.on === LANDS.DULL ), 'from its roof\'s edge, landing dull on her' );
ok( sides.every( ( p ) => p.below > 0.95 && p.below < 1.3 && p.z >= HOUSE.roofZ0 && p.z <= HOUSE.roofZ1 ), 'its sides onto the gunwales beside the house' );
ok( aft.every( ( p ) => p.below === boat.lines.deckY && p.z < HOUSE.roofZ0 ), 'its back into the cockpit' );

// ---- how hard it drips
ok( dripFlow( 0, 0 ) === 0 && dripFlow( 0, 0.5 ) === 0, 'a dry day, or once it\'s mostly dried: no drips' );
ok( dripFlow( 0.4, 1 ) === 1 && dripFlow( 0.1, 0.3 ) > 0.2, 'a shower sets everything dripping' );
ok( dripFlow( 0, 0.9 ) > 0.5 && dripFlow( 0, 0.7 ) < dripFlow( 0, 0.9 ), 'after it, they drip on, thinning as everything dries' );

// ---- the rhythm, as heard: the hash the GPU shares (24 bits, so a float32 holds it exactly)
const seeds = Array.from( { length: 400 }, ( _, i ) => Math.fround( ( i * 0.6180339887 ) % 1 ) );
const rs = seeds.flatMap( ( s ) => [ 1, 2, 17, 4000 ].map( ( k ) => dripRand( s, k ) ) );
ok( rs.every( ( r ) => r >= 0 && r < 1 && Number.isInteger( r * 16777216 ) && Math.fround( r ) === r ), 'its numbers are 0..1 in 24 bits: the same as a float32 on the GPU' );
const mean = rs.reduce( ( a, r ) => a + r, 0 ) / rs.length;
ok( Math.abs( mean - 0.5 ) < 0.03 && dripRand( seeds[ 3 ], 9 ) === dripRand( seeds[ 3 ], 9 ), `spread evenly (mean ${ mean.toFixed( 3 ) }), the same each time` );
// a place 3 m up: its drops land once a period, at the end of their fall; found by frames as they come
const seed = seeds[ 7 ], top = 3.3, bottom = 0.3;
const { fallT, period, phase } = dripRhythm( top, bottom, seed );
let heard = [];
for ( let t = 0; t < 60; t += 1 / 60 ) {

	const c = landingIn( t, t + 1 / 60, top, bottom, seed );
	if ( c >= 0 ) heard.push( { c, t } );

}

const expected = Math.floor( ( 60 - fallT ) / period + phase ) - Math.floor( ( 0 - fallT ) / period + phase );
ok( heard.length === expected && heard.every( ( h, i ) => i === 0 || h.c === heard[ i - 1 ].c + 1 ), `each drop heard once, in turn (${ heard.length } in a minute, a period of ${ period.toFixed( 2 ) } s)` );
ok( heard.every( ( h ) => {

	// (as the GPU draws it: in that cycle, at the end of its fall)
	const k = ( h.t + 1 / 60 ) / period + phase;
	return Math.floor( k ) === h.c && ( k - h.c ) * period >= fallT - 1e-9 && ( k - h.c ) * period < fallT + 1 / 60 + 1e-9;

} ), 'each the moment its drop reaches the ground, as it\'s drawn' );
const kept = ( flow ) => {

	let n = 0, all = 0;
	for ( const s of seeds ) for ( let c = 0; c < 50; c ++ ) {

		all ++;
		if ( dripRand( s, c + 16 ) < flow ) n ++;

	}

	return n / all;

};
ok( Math.abs( kept( 0.3 ) - 0.3 ) < 0.03 && kept( 1 ) === 1 && kept( 0 ) === 0, 'how hard it drips is the share of drops that fall' );

console.log( fails ? `${ fails } FAILED` : 'all passed' );
process.exit( fails ? 1 : 0 );
