import { FISH } from './FishTable.js';
import { KEEPER_KG } from './Bait.js';
import { placeName } from './Places.js';
import { LB } from './Units.js';

// (M19) Pearl's day's challenges at her fish camp (stream STALLS: docs/m19/stalls.md): one for the rod, one for the speargun and
// one for the cast net, the same for everyone on the island's clock (seeded by the trading day, as Orders.js' orders are),
// done by the catch itself (GameState.onCatch: every way a fish is caught tells it) and paid in cash at her camp, whenever you're
// next by with her there (GameState.collectChallenges). A day's done ones are kept with what's owed in the save's
// `challenges` ({ day, done: { rod, spear, net }, owed }); a new trading day starts the list again, what's owed kept.
//   challengesFor( day ) -> [ { id: 'rod' | 'spear' | 'net', what (her board's words), pay, ... } ]
//   meets( c, ev ) -> does this catch (onCatch's) do it?
//   const c = new Challenges( game )   c.update( dt )   c.today() -> { list (each with done), owed }
// The asks are chosen by hand from what the island's waters give each way of fishing; never a protected fish taken, a
// speared one at its legal size (FishTable's minCm). What she pays is judgement: about an hour's fishing's worth
// (tools/earnings.mjs: a kayak's $40 to $90 an hour), more for the rarer ask.
export const ROD = [
	{ kind: 'over', species: 'yellowtail', kg: 0.9, pay: 60 },
	{ kind: 'over', species: 'muttonSnapper', kg: 3, pay: 80 },
	{ kind: 'over', species: 'barracuda', kg: 6, pay: 70 },
	{ kind: 'over', species: 'jack', kg: 4, pay: 60 },
	{ kind: 'over', species: 'redSnapper', kg: 4, pay: 80 },
	{ kind: 'over', species: 'mahi', kg: 8, pay: 100 },
	{ kind: 'from', species: 'graySnapper', place: 'creek', pay: 60 },
	{ kind: 'from', species: 'pompano', place: 'northBeach', pay: 70 },
	{ kind: 'from', species: 'muttonSnapper', place: 'windReef', pay: 80 },
	{ kind: 'release', species: 'bonefish', pay: 90 },
	{ kind: 'release', species: 'tarpon', pay: 120 },
	{ kind: 'release', species: 'permit', pay: 150 },
	{ kind: 'fly', species: 'bonefish', pay: 120 },
	{ kind: 'fly', species: 'barracuda', pay: 100 },
];
export const SPEAR = [
	{ species: 'lionfish', pay: 50 }, // (an invader: any size, as many as you like)
	{ species: 'wrasse', pay: 70 },
	{ species: 'muttonSnapper', pay: 80 },
	{ species: 'graySnapper', pay: 50 },
	{ species: 'yellowtail', pay: 50 },
	{ species: 'blackGrouper', pay: 110 },
	{ species: 'redSnapper', pay: 80 },
];
export const NET = [
	{ kind: 'keeper', pay: 40 },
	{ kind: 'baits', n: 12, pay: 50 },
	{ kind: 'species', species: 'whiteMullet', pay: 40 },
	{ kind: 'species', species: 'sergeant', pay: 40 },
];

function rng( seed ) {

	let a = ( seed * 2654435761 ^ 0x3c1f ) >>> 0;
	return () => {

		a = ( a + 0x6d2b79f5 ) >>> 0;
		let t = Math.imul( a ^ ( a >>> 15 ), 1 | a );
		t = ( t + Math.imul( t ^ ( t >>> 7 ), 61 | t ) ) ^ t;
		return ( ( t ^ ( t >>> 14 ) ) >>> 0 ) / 4294967296;

	};

}

const pick = ( list, r ) => list[ Math.floor( r() * list.length ) % list.length ];
const name = ( id ) => FISH[ id ].name.toLowerCase();
const article = ( w ) => ( /^[aeiou]/.test( w ) ? 'an ' : 'a ' ) + w;

function rodWhat( c ) {

	if ( c.kind === 'over' ) return `${ article( name( c.species ) ) } over ${ Math.round( c.kg / LB ) } lb, on a rod`;
	if ( c.kind === 'from' ) return `${ article( name( c.species ) ) } from ${ placeName( c.place ) }, on a rod`;
	if ( c.kind === 'release' ) return `${ article( name( c.species ) ) } caught and let go`;
	return `${ article( name( c.species ) ) } on the fly`;

}

function spearWhat( c ) {

	const min = FISH[ c.species ].minCm;
	return `${ article( name( c.species ) ) } speared${ min ? `, a legal one (${ Math.round( min / 2.54 ) } in and over)` : '' }`;

}

function netWhat( c ) {

	if ( c.kind === 'keeper' ) return 'a keeper mullet in the cast net, a pound and over';
	if ( c.kind === 'baits' ) return `${ c.n } live baits in one throw of the net`;
	return `${ article( name( c.species ) ) } in the cast net`;

}

export function challengesFor( day ) {

	const r = rng( Math.floor( day ) * 31 + 7 );
	const rod = pick( ROD, r ), spear = pick( SPEAR, r ), net = pick( NET, r );
	return [
		{ id: 'rod', ...rod, what: rodWhat( rod ) },
		{ id: 'spear', ...spear, what: spearWhat( spear ) },
		{ id: 'net', ...net, what: netWhat( net ) },
	];

}

// does this catch do it? ev: GameState.onCatch's: a fish { species, kg, cm, method, rig, released, place }, or a throw of the
// net { method: 'net', haul: { bait: { species: n } }, fish: [ { species, kg, kept } ] }
export function meets( c, ev ) {

	if ( ! ev ) return false;
	if ( c.id === 'net' ) {

		if ( ev.method !== 'net' ) return false;
		const fish = ev.fish || [];
		if ( c.kind === 'keeper' ) return fish.some( ( f ) => f.species === 'mullet' && f.kg >= KEEPER_KG );
		if ( c.kind === 'baits' ) return Object.values( ( ev.haul && ev.haul.bait ) || {} ).reduce( ( n, k ) => n + ( k | 0 ), 0 ) >= c.n;
		return fish.some( ( f ) => f.species === c.species );

	}

	if ( ev.species !== c.species ) return false;
	if ( c.id === 'spear' ) return ev.method === 'spear' && ! ev.released;
	if ( ev.method !== 'rod' ) return false;
	if ( c.kind === 'over' ) return ev.kg >= c.kg;
	if ( c.kind === 'from' ) return ev.place === c.place;
	if ( c.kind === 'release' ) return !! ev.released;
	return ev.rig === 'fly';

}

export class Challenges {

	constructor( game ) {

		this.game = game;
		this._heard = null;

	}

	// listening for the catch, once the save's there (and again for a new one: a reset)
	update() {

		const st = this.game.state;
		if ( ! st || ! st.onCatch || this._heard === st ) return;
		this._heard = st;
		st.onCatch( ( ev ) => this.caught( ev ) );

	}

	// the trading day's list, and which of it you've done
	today() {

		const day = this.game.tradeDay, C = this.game.state.challenges;
		return { day, owed: C.owed | 0, list: challengesFor( day ).map( ( c ) => ( { ...c, done: C.day === day && !! C.done[ c.id ] } ) ) };

	}

	caught( ev ) {

		const g = this.game, st = g.state, day = g.tradeDay;
		if ( st.challenges.day !== day ) st.challenges = { day, done: {}, owed: st.challenges.owed | 0 };
		const C = st.challenges;
		let said = false;
		for ( const c of challengesFor( day ) ) {

			if ( C.done[ c.id ] || ! meets( c, ev ) ) continue;
			C.done[ c.id ] = true;
			C.owed += c.pay;
			said = true;
			if ( g.toast ) g.toast( `Pearl's challenge done: ${ c.what } · $${ c.pay } at her camp`, 4000 );

		}

		if ( said ) {

			st.save();
			st.emit();

		}

	}

}
