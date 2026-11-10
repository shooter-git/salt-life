// (M17) The fishing lines at their labels, the reels' drags as real reels have them and set as anglers set them, the
// holds and the dehooker's reach, an old kit from a game still on the old figures, a guest on her owner's rods, and the
// fight swept: every kind of fish at its weights on the gear it's meant for, as landable as it was at M17's base
// (dfb8b83), when the lines held about 1.9 times their labels. docs/m17/lines.md.
//
//   node test/lines.mjs

import { readFileSync } from 'node:fs';
import { FISH } from '../src/game/FishTable.js';
import { CatchMinigame, DRAG_SET, LINE_MATCH } from '../src/game/CatchMinigame.js';
import { gearStats, defaultUpgrades, LB, OLD_DRAG_KG, OLD_LINE_KG, UPGRADES } from '../src/game/Gear.js';
import { DEHOOK, ELECTRIC, HOLD_KG, Rigs } from '../src/game/rigs/Rigs.js';
import { cell, SIZES, SPECIES, sweep, uncompact } from '../tools/fight-sweep.mjs';

let failed = 0;
const ok = ( c, what ) => {

	console.log( `${ c ? 'ok  ' : 'FAIL' } ${ what }` );
	if ( ! c ) failed ++;

};
const near = ( a, b, e = 1e-9 ) => Math.abs( a - b ) <= e;

// ---- the lines, at their labels
{

	ok( LB === 0.45359237, 'a pound is 0.45359237 kg' );
	for ( const l of UPGRADES.line.levels ) ok( near( l.lineKg, l.lineLb * LB ) && l.label.startsWith( `${ l.lineLb } lb ` ), `${ l.label}: ${ l.lineKg.toFixed( 2 ) } kg, its label's ${ l.lineLb } lb x 0.4536` );
	ok( UPGRADES.line.levels.every( ( l ) => ! OLD_LINE_KG.includes( l.lineKg ) ), 'none of them is an old figure (so an old kit can be told from a new one)' );

}

// ---- the reels' drags, and the drag as it's set
{

	const lb = ( kg ) => kg / LB;
	const reels = UPGRADES.reel.levels, conv = reels[ 2 ], two = reels[ 3 ], line = UPGRADES.line.levels;
	ok( reels[ 0 ].dragKg === null && reels[ 1 ].dragKg === null, 'the spinning reels have no drag to speak of, as before' );
	ok( near( lb( conv.dragKg ), 33 ), `the conventional reel's most is a 30-class lever drag's 33 lb (Penn Fathom II LD 30): ${ conv.dragKg.toFixed( 1 ) } kg` );
	ok( two.dragKg === 20, `the two-speed's a 50-class two-speed's 20 kg (Shimano Tiagra 50W LRSA, in most listings): ${ two.dragKg } kg, not an 80-class reel's 24` );
	ok( near( lb( ELECTRIC.drag ), 48, 0.6 ), `the electric reel's a deep-drop reel's 48 lb (Daiwa Tanacom 1000): ${ ELECTRIC.drag } kg` );
	ok( DRAG_SET.strike >= 0.35 && DRAG_SET.strike <= 0.40 && DRAG_SET.full >= 0.50 && DRAG_SET.full <= 0.55, `the drag's set at strike (${ DRAG_SET.strike }) and full (${ DRAG_SET.full }) of the line, Caputi's 35 to 40% and 50 to 55%` );
	ok( conv.dragKg >= DRAG_SET.full * line[ 2 ].lineKg && two.dragKg >= DRAG_SET.full * line[ 4 ].lineKg && ELECTRIC.drag >= DRAG_SET.full * line[ 4 ].lineKg, 'each reel holds full drag on the line it\'s offered with (30 lb on the conventional, 80 lb on the two-speed and the electric)' );
	// (the drag slips at what it's set to, as the fish tires: strike when it's fresh, full once it's half spent)
	const g = new CatchMinigame( { species: 'tuna', kg: 20, lineKg: line[ 3 ].lineKg, dragKg: two.dragKg, holdKg: HOLD_KG.chair, spoolM: 600, rng: () => 0.5 } );
	ok( near( g._give( 0 ), DRAG_SET.strike ) && near( g._give( DRAG_SET.spent ), DRAG_SET.full ) && near( g._give( 1 ), DRAG_SET.full ), `fresh it slips at strike, half spent and on at full (${ g._give( 0 ).toFixed( 3 ) }, ${ g._give( 0.25 ).toFixed( 3 ) }, ${ g._give( 0.5 ).toFixed( 3 ) })` );
	const hand = new CatchMinigame( { species: 'tuna', kg: 20, lineKg: line[ 3 ].lineKg, dragKg: two.dragKg, holdKg: HOLD_KG.hand, spoolM: 600, rng: () => 0.5 } );
	ok( near( hand._give( 1 ), HOLD_KG.hand / line[ 3 ].lineKg ), `by hand you hold ${ HOLD_KG.hand } kg of it, ${ Math.round( 100 * hand._give( 1 ) ) }% of 60 lb, under full` );
	const light = new CatchMinigame( { species: 'tuna', kg: 3, lineKg: line[ 0 ].lineKg, dragKg: two.dragKg, holdKg: HOLD_KG.chair, spoolM: 600, rng: () => 0.5 } );
	ok( light._give( 1 ) <= DRAG_SET.full + 1e-9, 'on 8 lb the two-speed\'s drag is set under the line, not over it (it was 24 kg on a 7 kg line)' );

}

// ---- the holds and the dehooker
{

	ok( HOLD_KG.hand === 10 && HOLD_KG.harness === 18 && HOLD_KG.chair === 40, 'the holds stand: 10 kg by hand (judgment), 18 in a harness (a strong angler), 40 in the chair (Marlin: 36 kg and more)' );
	ok( DEHOOK.landBig <= 9.14 && DEHOOK.landSmall >= 1.8 && DEHOOK.landSmall <= 3.7 && DEHOOK.byHand <= 1, `the dehooker: a big one let go ${ DEHOOK.landBig } m off with the leader taken (IGFA's leader up to 9.14 m), a small one at ${ DEHOOK.landSmall } m on the pole (6 to 12 ft), by hand at ${ DEHOOK.byHand } m alongside` );
	const stub = ( stats ) => Object.assign( Object.create( Rigs.prototype ), { game: { state: { stats, leaderPick: null }, rod: { rig: 'troll', hookM: 0 }, hookBait: null }, app: { boatCtl: { speed: 0 }, player: { riding: false }, boat: {} }, inChair: false, kit: null } );
	const u = defaultUpgrades(), hands = gearStats( { ...u, landing: 1 } ), kit = gearStats( { ...u, landing: 2 } );
	const at = ( stats, species, kg ) => stub( stats ).fightTerms( { species, kg } ).landAt;
	ok( at( hands, 'sailfish', 40 ) === DEHOOK.byHand && at( hands, 'bonefish', 3 ) === DEHOOK.byHand, 'one let go by hand is unhooked alongside' );
	ok( at( kit, 'sailfish', 40 ) === DEHOOK.landBig && at( kit, 'bonefish', 3 ) === DEHOOK.landSmall, 'with the dehooker, at the leader or the pole\'s reach' );
	ok( at( kit, 'tuna', 40 ) === 3 && at( kit, 'tuna', 10 ) === 1.2 && at( hands, 'tuna', 40 ) === 3, 'one you keep is gaffed, or lifted, as ever' );

}

// ---- an old kit, and a guest on her owner's rods
{

	const her = gearStats( { ...defaultUpgrades(), line: 3, reel: 3, rod: 3, sfElectricReel: 1, sfChair: 1, leader: 3 }, 'sportfisher' );
	const owner = Object.assign( Object.create( Rigs.prototype ), { game: { state: { stats: her, bait: { ballyhoo: 12 }, upgrades: { lures: 3 } } }, app: { boat: { seated: false } }, spots: () => [ 0, 1, 2, 3, 4 ] } );
	const sent = owner.kitOf(), got = Rigs.cleanKit( JSON.parse( JSON.stringify( sent ) ) );
	ok( got.t.lineKg === her.lineKg && got.t.dragKg === her.dragKg && got.t.standUp, `her kit comes through as it was sent: ${ got.t.lineKg.toFixed( 2 ) } kg line, ${ got.t.dragKg.toFixed( 2 ) } kg drag` );
	const old = Rigs.cleanKit( { t: { lineKg: 50, dragKg: 24, reelSpeed: 2.6, spoolM: 600, twoSpeed: true, standUp: true, electricReel: true, leader: 3 }, b: {} } );
	ok( near( old.t.lineKg, 60 * LB ) && old.t.dragKg === UPGRADES.reel.levels[ 3 ].dragKg, `an old game's 50 kg line comes in as the 60 lb braid (${ old.t.lineKg.toFixed( 2 ) } kg), its 24 kg drag as the two-speed's ${ old.t.dragKg } kg, not as a 110 lb line` );
	const all = OLD_LINE_KG.map( ( kg, i ) => Rigs.cleanKit( { t: { lineKg: kg, dragKg: OLD_DRAG_KG[ i % 2 ] } } ).t );
	ok( all.every( ( t, i ) => near( t.lineKg, UPGRADES.line.levels[ i ].lineKg ) ) && near( all[ 0 ].dragKg, UPGRADES.reel.levels[ 2 ].dragKg ), 'each old line as its label, the old conventional\'s drag as the new' );
	ok( Rigs.cleanKit( { t: { lineKg: 20 } } ).t.lineKg === 20, 'any other figure as it comes' );
	// (a guest on her rods: her tackle, his own hands; in her chair. As her owner would fight it, on the same throw of the dice)
	const mine = gearStats( defaultUpgrades(), 'kayak' );
	const guest = Object.assign( Object.create( Rigs.prototype ), { game: { state: { stats: mine, leaderPick: null }, rod: { rig: 'troll', hookM: 0 }, hookBait: null }, app: { boatCtl: { speed: 0 }, player: { riding: true, boat: { model: { chair: {} } } } }, inChair: false, kit: got.t } );
	const self = Object.assign( Object.create( Rigs.prototype ), { game: { state: { stats: her, leaderPick: null }, rod: { rig: 'troll', hookM: 0 }, hookBait: null }, app: { boatCtl: { speed: 0 }, player: { riding: false }, boat: { chair: {} } }, inChair: false, kit: null } );
	const keys = [ 'lineKg', 'reelSpeed', 'dragKg', 'holdKg', 'spoolM', 'twoSpeed', 'electric', 'chair' ];
	for ( const chair of [ false, true ] ) {

		guest.inChair = self.inChair = chair;
		const a = guest.fightTerms( { species: 'blueMarlin', kg: 150 } ), b = self.fightTerms( { species: 'blueMarlin', kg: 150 } );
		ok( keys.every( ( k ) => a[ k ] === b[ k ] ), `a guest on her rods${ chair ? ', in her chair' : ', standing' } fights on her tackle as her owner would (${ a.lineKg.toFixed( 1 ) } kg line, ${ a.dragKg.toFixed( 1 ) } kg drag, ${ a.holdKg } kg held)` );
		const run = ( T ) => {

			let s = 9;
			const f = new CatchMinigame( { species: 'blueMarlin', kg: 150, ...T, cut: 0, wear: 0, distance: 60, rng: () => ( ( s = ( s * 1664525 + 1013904223 ) >>> 0 ) / 4294967296 ) } );
			let st = 'fighting';
			while ( st === 'fighting' && f.time < 3600 ) st = f.update( 1 / 30, f.tension < 0.68 && f.surge < 0.6 );
			return `${ st } ${ f.time.toFixed( 1 ) }`;

		};
		const ra = run( { ...a, landAt: b.landAt, tired: b.tired } ), rb = run( b );
		ok( ra === rb, `... and the fight goes as hers would (${ ra } s)` );

	}

}

// ---- the sweep: as landable as at the base on the gear each stage is meant to have (test the rest with tools/fight-sweep.mjs)
{

	const S = JSON.parse( readFileSync( new URL( '../docs/m17/lines-sweep.json', import.meta.url ), 'utf8' ) );
	const gear = S.meta.gear, before = S.before;
	const t0 = Date.now();
	const now = sweep( { n: S.meta.n, only: gear, dh: false } );
	const s = ( Date.now() - t0 ) / 1000;
	let cells = 0, kept = 0;
	const worse = [], spin = [], slow = [], gains = [];
	for ( const id of SPECIES ) for ( const q of SIZES ) for ( const k of gear ) {

		const b = uncompact( before[ id ][ q ][ k ] ), a = now[ id ][ q ][ k ];
		cells ++;
		const name = `${ id } ${ now[ id ][ q ].kg.toFixed( 1 ) } kg on ${ k }`;
		if ( b.caught >= 0.5 ) {

			kept ++;
			if ( a.caught < b.caught - 0.15 ) worse.push( `${ name }: ${ b.caught } -> ${ a.caught }` );

		}

		if ( a.caught > b.caught + 0.15 ) gains.push( `${ name } ${ Math.round( 100 * b.caught ) }% -> ${ Math.round( 100 * a.caught ) }%` );
		// ((on 8 lb exactly; on the others the fish are under 3% weaker, so one at the edge of what a line holds lands a
		// little more often)
		if ( /R[01]\//.test( k ) && ( b.caught - a.caught > 0.1 || ( /^L0/.test( k ) && a.caught !== b.caught ) || ( a.caught >= 0.5 && b.caught >= 0.5 && Math.abs( a.t / b.t - 1 ) > 0.05 ) ) ) spin.push( name );
		if ( b.caught >= 0.5 && a.caught >= 0.5 && ( a.t > b.t * 1.3 || a.t < b.t * 0.6 ) ) slow.push( `${ name }: ${ b.t.toFixed( 0 ) } -> ${ a.t.toFixed( 0 ) } s` );

	}

	console.log( `     swept ${ cells } cells (${ SPECIES.length } kinds x ${ SIZES.length } sizes x ${ gear.length } rigs, ${ S.meta.n } fights each) in ${ s.toFixed( 1 ) } s; landed at the base in ${ kept }` );
	ok( worse.length === 0, `none landed at the base is harder now${ worse.length ? ': ' + worse.join( '; ' ) : '' }` );
	ok( spin.length === 0, `a spinning reel's fights (no drag) are as they were, on 8 lb exactly, the fish's pull read against the real line (LINE_MATCH ${ LINE_MATCH.toFixed( 4 ) })${ spin.length ? ': ' + spin.join( '; ' ) : '' }` );
	ok( slow.length === 0, `and no fight that lands is far longer or shorter${ slow.length ? ': ' + slow.join( '; ' ) : '' }` );
	console.log( `     landed more often now (${ gains.length }): ${ gains.join( '; ' ) }` );
	// (the gains are where the old figures held a fish back: standing on 60 lb, now the harness holds the line's full drag;
	// and the conventional on 30 lb, its drag set up to full as the fish tires)
	ok( gains.every( ( g ) => / on (L3\/R3\/harness|L2\/R2\/hand) / .test( g ) ), 'and the only gains are standing on 60 lb and the conventional on 30 lb' );
	// (a 200 kg one standing takes about three times the chair's time: test/tackle.mjs)
	const blue = now.blueMarlin[ 0.5 ];
	ok( blue[ 'L3/R3/harness' ].caught >= 0.8, `a ${ blue.kg.toFixed( 0 ) } kg blue marlin standing on 60 lb: landed now (${ Math.round( 100 * blue[ 'L3/R3/harness' ].caught ) }%, ${ ( blue[ 'L3/R3/harness' ].t / 60 ).toFixed( 1 ) } min; from the chair ${ ( blue[ 'L3/R3/chair' ].t / 60 ).toFixed( 1 ) })` );

}

// ---- the 80 lb line: its full drag (19 kg) past the harness's 18, so the biggest blue marlin are the chair's
{

	const big = { line: 4, reel: 3, electric: false }, mid = { line: 3, reel: 3, electric: false };
	const at = ( c, hold, kg ) => cell( { ...c, key: hold, hold }, 'blueMarlin', kg, 20 );
	const chair = at( big, 'chair', 260 ), stand = at( big, 'harness', 260 ), was = at( mid, 'chair', 260 );
	ok( chair.caught >= 0.8 && stand.caught <= 0.1 && was.caught <= 0.1, `a 260 kg blue marlin on 80 lb: from the chair ${ Math.round( 100 * chair.caught ) }% in ${ ( chair.t / 60 ).toFixed( 1 ) } min, standing ${ Math.round( 100 * stand.caught ) }%; on 60 lb from the chair ${ Math.round( 100 * was.caught ) }%` );
	const c2 = at( big, 'chair', 200 ), s2 = at( big, 'harness', 200 );
	ok( c2.caught >= 0.9 && s2.caught >= 0.9 && s2.t > 1.5 * c2.t, `a 200 kg one on 80 lb: standing ${ ( s2.t / 60 ).toFixed( 1 ) } min, from the chair ${ ( c2.t / 60 ).toFixed( 1 ) }` );

}

// ---- the fish's own figures are untouched (FishTable's fight, stamina and kg)
{

	ok( FISH.blueMarlin.fight === 1 && FISH.blueMarlin.stamina === 300 && FISH.tuna.fight === 0.85 && FISH.tuna.stamina === 16, 'the fish table\'s fight figures stand' );

}

if ( failed ) {

	console.log( `\n${ failed } FAILED` );
	process.exit( 1 );

}

console.log( '\nall ok' );
