import { FISH, releaseBonus } from './FishTable.js';
import { placeName, PLACES } from './Places.js';

// (M16) The billfish are let go, as the rules say, as everyone does: a sailfish, a white marlin or a blue marlin is
// measured alongside and sent off alive. The island's billfish fund pays for it (FishTable.releaseBonus), and your log
// keeps it: its best of each kind, with its picture (the catch card's studio portrait, looked at again from the log:
// Game.showTrophy). The tag kit (the `landing` track: the rigs') pays half as much again.
//   letGo( state, info ) -> the bonus (0: not a billfish)       info: GameState.lastCatch
//   trophyRows( state )   the log's list, biggest first         trophyCardOf( state, species )   the card's info
//   trophyNote( info )    what the catch card says of it        cleanTrophies( saved )

const TAG_KIT = 2; // (the landing track's level with the dehooker and the tag kit)

export function letGo( state, info ) {

	if ( ! info.released || ! FISH[ info.species ].release ) return 0;
	const tagged = ( state.upgrades.landing | 0 ) >= TAG_KIT;
	const bonus = releaseBonus( info.species, info.kg, tagged );
	const t = state.trophies[ info.species ] || ( state.trophies[ info.species ] = { n: 0, kg: 0, cm: 0, day: null, place: null, tagged: false } );
	t.n ++;
	if ( info.kg > t.kg ) Object.assign( t, { kg: info.kg, cm: info.cm, day: info.day, place: info.place, tagged } );
	state.money += bonus;
	state.save();
	state.emit();
	return bonus;

}

// when and where it was let go: 'from the drop-off, day 12'
const whereOf = ( t ) => [ t.place && PLACES[ t.place ] ? `from ${ placeName( t.place ) }` : '', Number.isFinite( t.day ) ? `day ${ t.day + 1 }` : '' ].filter( Boolean ).join( ', ' );

export const trophyRows = ( state ) => Object.entries( state.trophies ).filter( ( [ k ] ) => FISH[ k ] ).sort( ( a, b ) => b[ 1 ].kg - a[ 1 ].kg )
	.map( ( [ species, t ] ) => ( { species, name: FISH[ species ].name, kg: t.kg, cm: t.cm, meta: `${ t.n } let go · your best ${ whereOf( t ) }${ t.tagged ? ', tagged' : '' }` } ) );

export function trophyCardOf( state, species ) {

	const t = state.trophies[ species ];
	if ( ! t || ! FISH[ species ] ) return null;
	return { species, kg: t.kg, cm: t.cm, value: 0, released: true, kept: false, why: 'protected', method: 'rod', trophyView: true, n: t.n, day: t.day, place: t.place, tagged: 0, wasTagged: t.tagged };

}

export function trophyNote( info ) {

	if ( info.trophyView ) return `${ info.n > 1 ? `Your best of the ${ info.n } you've` : 'The one you\'ve' } let go, ${ whereOf( info ) }${ info.wasTagged ? ', tagged' : '' }`;
	return `Let go alive, as everyone does. The billfish fund pays <b>$${ info.bonus }</b> for it${ info.tagged ? `, Marta's log <b>$${ info.tagged }</b>` : '' }, and it's a trophy in your log`;

}

export function cleanTrophies( saved ) {

	const out = {};
	for ( const [ k, t ] of Object.entries( saved && typeof saved === 'object' ? saved : {} ) ) {

		if ( ! FISH[ k ] || ! t || ! Number.isInteger( t.n ) || t.n < 1 || ! Number.isFinite( t.kg ) ) continue;
		out[ k ] = { n: t.n, kg: t.kg, cm: Number.isFinite( t.cm ) ? t.cm : 0, day: Number.isFinite( t.day ) ? t.day : null, place: PLACES[ t.place ] ? t.place : null, tagged: !! t.tagged };

	}

	return out;

}
