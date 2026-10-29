// (M15) Something to find out there (game/Finds.js): weedlines, debris and birds working bait, the same for
// everyone wherever they look from, none about the island, drifting down the trades at a believable pace,
// coming and going without popping, and the bait likelier where it's likelier.
//
//   node test/finds.mjs

import { findsAbout, nearestWeed, FINDS } from '../src/game/Finds.js';
import { towardOf } from '../src/game/Weather.js';

let failed = 0;
const check = ( ok, what ) => {

	console.log( `${ ok ? 'ok  ' : 'FAIL' } ${ what }` );
	if ( ! ok ) failed ++;

};
const fresh = () => ( { weed: [], debris: [], bait: [] } );
const key = ( q ) => JSON.stringify( q );

// ---- the same for everyone: two looking from different places see the same thing where they overlap
{

	let same = true, n = 0;
	for ( let T = 50; T < 24 * 30; T += 3.7 ) {

		const a = findsAbout( T, 0, 15000, 3000, fresh() ), b = findsAbout( T, 1500, 16000, 3000, fresh() );
		for ( const kind of [ 'weed', 'debris', 'bait' ] ) for ( const q of a[ kind ] ) {

			const m = b[ kind ].find( ( r ) => r.n === q.n );
			// (the features in both cells looked at by both)
			if ( m ) {

				n ++;
				if ( key( m ) !== key( q ) ) same = false;

			}

		}

	}

	check( same && n > 50, `the same weed, debris and bait for whoever looks (${ n } seen from both places)` );

}

// ---- none about the island, and as much as there should be out there
{

	let near = 0, W = 0, D = 0, B = 0, worked = 0, n = 0;
	for ( let T = 50; T < 24 * 60; T += 0.53 ) {

		const f = findsAbout( T, 0, 0, 3500, fresh() );
		for ( const q of f.debris.concat( f.bait ) ) if ( Math.hypot( q.x, q.z ) < FINDS.near ) near ++;
		for ( const w of f.weed ) if ( Math.hypot( w.x0, w.z0 ) < FINDS.near && Math.hypot( w.x1, w.z1 ) < FINDS.near ) near ++;
		const o = findsAbout( T, 4000, 14000, 2000, fresh() );
		W += o.weed.length; D += o.debris.length; B += o.bait.length; n ++;
		if ( o.bait.length ) worked ++;

	}

	check( near === 0, 'nothing found within 3 km of the island\'s middle (its bay, its shelf close in)' );
	console.log( `     within 2 km of a place out there: ${ ( W / n ).toFixed( 1 ) } weedlines, ${ ( D / n ).toFixed( 2 ) } pieces of debris, ${ ( B / n ).toFixed( 2 ) } schools worked; birds working ${ Math.round( worked / n * 100 ) }% of the time` );
	check( W / n > 1 && W / n < 12 && D / n > 0.05 && D / n < 1.5 && worked / n > 0.05 && worked / n < 0.7, 'weed common, debris now and then, birds working some of the time' );

}

// ---- drifting down the trades, 0.3 m/s in real time (30 m a game hour)
{

	const T = 400, a = findsAbout( T, 0, 15000, 3000, fresh() ), b = findsAbout( T + 0.1, 0, 15000, 3000, fresh() );
	const d = towardOf( 0 );
	let ok = a.debris.length > 0 || a.weed.length > 0, moved = 0;
	for ( const q of a.weed ) {

		const m = b.weed.find( ( r ) => r.n === q.n );
		if ( m ) {

			moved = Math.hypot( m.x0 - q.x0, m.z0 - q.z0 );
			const along = ( ( m.x0 - q.x0 ) * d.x + ( m.z0 - q.z0 ) * d.y ) / moved;
			if ( Math.abs( moved - FINDS.drift * 0.1 ) > 1e-6 || along < 0.999 ) ok = false;

		}

	}

	check( ok && moved > 0, `weed drifting down the trades: ${ moved.toFixed( 1 ) } m in a tenth of a game hour (10 real seconds: ${ ( moved / 10 ).toFixed( 2 ) } m/s)` );

}

// ---- coming and going without popping: each one's life changes only a little in a real second
{

	// (those well inside where it's looked, 1.3 km, against all within 1.5: one drifting in from beyond isn't popping)
	let worst = 0;
	const at = ( q ) => Math.hypot( ( q.x ?? ( q.x0 + q.x1 ) / 2 ) - 2000, ( q.z ?? ( q.z0 + q.z1 ) / 2 ) - 15000 );
	let prev = null;
	for ( let T = 100; T < 100 + 24 * 6; T += 0.01 ) {

		const f = findsAbout( T, 2000, 15000, 3500, fresh() ), now = new Map();
		for ( const kind of [ 'weed', 'debris', 'bait' ] ) for ( const q of f[ kind ] ) if ( at( q ) < 1500 ) now.set( kind + q.n, { life: q.life, d: at( q ) } );
		if ( prev ) {

			for ( const [ k, q ] of now ) if ( q.d < 1300 ) worst = Math.max( worst, Math.abs( q.life - ( prev.has( k ) ? prev.get( k ).life : 0 ) ) );
			for ( const [ k, q ] of prev ) if ( q.d < 1300 && ! now.has( k ) ) worst = Math.max( worst, q.life );

		}

		prev = now;

	}

	check( worst < 0.2, `weed gathers and scatters, debris comes and goes, birds arrive and leave: at most ${ worst.toFixed( 2 ) } of it in a real second` );

}

// ---- bait likelier by the weed, over the drop-off, at dawn
{

	let withWeed = 0, without = 0, nW = 0, nO = 0, dawn = 0, noon = 0, slope = 0, deep = 0;
	for ( let T = 50; T < 24 * 400; T += 0.7 ) {

		const f = findsAbout( T, 6000, 14000, 2000, fresh() );
		const weedy = f.weed.some( ( w ) => w.life > 0.5 );
		if ( weedy ) { nW ++; withWeed += f.bait.length; } else { nO ++; without += f.bait.length; }
		const h = ( ( T % 24 ) + 24 ) % 24;
		if ( h > 5.5 && h < 7.5 ) dawn += f.bait.length;
		if ( h > 11 && h < 13 ) noon += f.bait.length;
		slope += findsAbout( T, 6000, 14000, 2000, fresh(), () => 200 ).bait.length;
		deep += findsAbout( T, 6000, 14000, 2000, fresh(), () => 1800 ).bait.length;

	}

	check( withWeed / nW > without / nO, `birds work bait more by weed (${ ( withWeed / nW ).toFixed( 2 ) } schools to ${ ( without / nO ).toFixed( 2 ) })` );
	check( dawn > noon, `and at dawn (${ dawn } to noon's ${ noon })` );
	check( slope > deep, `and over the drop-off (${ slope } to the deep's ${ deep })` );

}

// ---- the nearest weedline
{

	const f = findsAbout( 300, 0, 15000, 3000, fresh() );
	const w = f.weed[ 0 ], mx = ( w.x0 + w.x1 ) / 2, mz = ( w.z0 + w.z1 ) / 2;
	const near = nearestWeed( f.weed, mx + 3, mz );
	check( near && near.d <= 3 + 1e-9, 'the nearest weedline found, and how far' );

}

console.log( failed ? `${ failed } failed` : 'all passed' );
process.exit( failed ? 1 : 0 );
