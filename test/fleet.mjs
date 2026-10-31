// (M16) Your fleet and Marta: her list, the sportfisher's unlock, buying, trade-in and selling, each boat's tracks, fuel and
// hull, slips and upkeep, berths, the away records per boat, name and paint, and old saves coming across.
import { readFileSync } from 'node:fs';
import { BOATS } from '../src/world/boat/Boats.js';
import { GameState } from '../src/game/GameState.js';
import { UPGRADES, UNLOCK, unlockProgress, gearStats, defaultUpgrades, fuelOf, fuelPrice, FUEL_PRICE, HAUL_FEE } from '../src/game/Gear.js';
import { Hull, HULLS, REPAIR_FULL, repairFee, stormWear, FLOOD_L } from '../src/game/Hull.js';
import { FLEET, TRADE, SALE, MONTH, MOST_MONTHS, DUES_LEAVE, PAINTS, NAME_MAX, monthly, gearWorth } from '../src/game/fleet/Fleet.js';
import { BERTHS, ashoreOf, berthOf } from '../src/game/fleet/Berths.js';
import { SHAPES, mooredGeometry, standsGeometry } from '../src/game/fleet/MooredModels.js';
import { fleetRows } from '../src/game/fleet/FleetPanel.js';
import { YARD, CRADLE, yardPose } from '../src/world/village/StormPlaces.js';
import { WORLD } from '../src/world/WorldLayout.js';
import { boatLeft, leftOf, othersAway, tellOthers, awayOf } from '../src/game/Away.js';
import { TerrainData } from '../src/world/TerrainData.js';
import { decodeIsland } from '../src/world/terrain/IslandDecode.js';

let bad = 0;
const ok = ( c, what ) => {

	if ( ! c ) bad ++;
	console.log( ( c ? 'ok   ' : 'FAIL ' ) + what );

};

const fresh = ( money = 0, boat = 'lobster' ) => {

	const s = new GameState( null );
	s.money = money;
	s.boat = boat;
	s.fleet = { [ boat ]: s.fleet[ Object.keys( s.fleet )[ 0 ] ] };
	return s;

};

// ---- her list
for ( const id of Object.keys( BOATS ) ) ok( FLEET[ id ] && FLEET[ id ].price > 0, `${ id }: on Marta's list at $${ FLEET[ id ].price }` );
ok( FLEET.console.price === 2500 && FLEET.lobster.price === 6000 && FLEET.sportfisher.price === 25000, 'the doc\'s prices' );

// ---- the sportfisher's unlock: 12 on the lobster boat, 7 of rod and reel, at the doc's prices
{

	const u = unlockProgress( defaultUpgrades() );
	ok( u.of === 19 && u.done === 0 && ! u.met, 'nothing done: 0 of 19' );
	let boat = 0, rod = 0, boatN = 0, rodN = 0;
	for ( const [ k, n ] of Object.entries( UNLOCK ) ) for ( let i = 1; i <= n; i ++ ) {

		if ( UPGRADES[ k ].on === 'lobster' ) {

			boat += UPGRADES[ k ].levels[ i ].cost;
			boatN ++;

		} else {

			rod += UPGRADES[ k ].levels[ i ].cost;
			rodN ++;

		}

	}

	ok( boatN === 12 && boat === 3050, `the lobster boat's ${ boatN } upgrades, $${ boat } from new` );
	ok( rodN === 7 && rod === 1435, `rod, reel and line, ${ rodN } upgrades, $${ rod } from new` );
	const s = fresh( 1e6 );
	ok( ! s.unlocked( 'sportfisher' ) && s.quoteBoat( 'sportfisher' ).why === 'locked', 'she can\'t be bought until she\'s earned' );
	ok( s.buyBoat( 'sportfisher' ) === null && ! s.owns( 'sportfisher' ), 'not at any money' );
	for ( const [ k, n ] of Object.entries( UNLOCK ) ) for ( let i = 0; i < n; i ++ ) {

		if ( k === 'line' && i === 2 ) ok( s.unlock.done === 18, `one to go: ${ s.unlock.done } of 19 (${ s.unlock.left[ 0 ] })` );
		ok( s.buy( k ), `(${ k } ${ i + 1 })` );

	}

	ok( s.unlock.met && s.unlocked( 'sportfisher' ) && s.earned, 'every one bought: unlocked' );
	// levels past those asked don't count, and speargun etc. aren't asked for
	ok( ! ( 'speargun' in UNLOCK ) && ! ( 'castNet' in UNLOCK ) && ! ( 'lobster' in UNLOCK ), 'the speargun, cast net and tickle stick aren\'t asked for' );
	ok( unlockProgress( { ...defaultUpgrades(), rod: 5 } ).done === 2, 'a level past the unlock\'s counts for no more' );
	// stays earned once the lobster boat's sold
	s.addBoat( 'kayak' );
	s.selectBoat( 'kayak' );
	s.sellBoat( 'lobster' );
	ok( s.upgrades.hold === 0 && s.unlocked( 'sportfisher' ), 'selling the lobster boat doesn\'t lock her again' );
	const j = JSON.parse( JSON.stringify( s.toJSON() ) ), r = new GameState( null );
	ok( r.fromJSON( j ) && r.earned, 'and the save keeps that' );
	const v1 = new GameState( null ), all = {};
	for ( const [ k, n ] of Object.entries( UNLOCK ) ) all[ k ] = n;
	ok( v1.fromJSON( { v: 1, upgrades: all } ) && v1.earned, 'an old save with everything bought has earned her' );

}

// ---- buying, trade-in, selling
{

	const s = fresh( 3000 );
	s.upgrades.hold = 2;
	const worth = Math.round( FLEET.lobster.price * TRADE.boat + 520 * TRADE.gear );
	ok( gearWorth( s.upgrades, 'lobster' ) === 520, 'what\'s on her: the hold, $520' );
	ok( s.boatWorth( 'lobster' ) === worth, `a kept lobster boat: part of her list price and of her upgrades, $${ worth }` );
	ok( s.quoteBoat( 'console' ).can && s.quoteBoat( 'console' ).net === 2500, 'the center console, $2,500' );
	const r = s.buyBoat( 'console' );
	ok( r && s.owns( 'console' ) && s.money === 500 && s.boat === 'lobster' && s.fleet.console.paid === 2500, 'bought: she\'s yours, paid for, and you\'re still in the one you were' );
	ok( s.buyBoat( 'console' ) === null, 'you can\'t buy her twice' );
	s.money = 0;
	ok( s.quoteBoat( 'kayak' ).why === 'money', 'nor one you can\'t pay for' );
	s.upgrades.consoleTop = 1;
	const cw = s.boatWorth( 'console', SALE );
	ok( cw === Math.round( 2500 * SALE.boat + 350 * SALE.gear ), `selling: less than a trade-in, $${ cw } against $${ s.boatWorth( 'console' ) }` );
	s.fleet.console.hull = 0.5;
	ok( s.boatWorth( 'console', SALE ) === cw - repairFee( 0.5, 'console' ), 'less what she\'d cost to repair' );
	ok( s.sellBoat( 'lobster' ) === null, 'you can\'t sell the one you\'re in' );
	const paid = s.boatWorth( 'console', SALE );
	ok( s.sellBoat( 'console' ) === paid && ! s.owns( 'console' ) && s.upgrades.consoleTop === 0 && s.money === paid, 'sold: paid, gone, her upgrades with her' );
	ok( s.sellBoat( 'lobster' ) === null, 'nor your last' );

	// trade-in of another: she goes; of the one you're in: dropped once you've got into the new one (FleetDesk)
	const t = fresh( 10000 );
	t.addBoat( 'console' );
	t.fleet.console.paid = 2500;
	const q = t.quoteBoat( 'kayak', 'console' );
	ok( q.net < 0 && t.buyBoat( 'kayak', 'console' ) && ! t.owns( 'console' ) && t.money === 10000 - q.net, 'a trade-in worth more than she\'s selling: she pays you the difference' );
	const u = fresh( 3000 );
	const Q = u.quoteBoat( 'console', 'lobster' );
	ok( u.buyBoat( 'console', 'lobster' ) && u.owns( 'lobster' ) && u.boat === 'lobster' && u.money === 3000 - Q.net, 'trading in the one you\'re in: she stays till you\'re out of her' );
	u.selectBoat( 'console' );
	ok( u.dropBoat( 'lobster' ) && ! u.owns( 'lobster' ) && ! u.dropBoat( 'console' ), 'then she goes (never the one you\'re in)' );

	const kay = fresh( 0, 'kayak' );
	ok( kay.boatWorth( 'kayak' ) === 0, 'a kayak that came free is worth nothing but her gear' );

}

// ---- each boat's tracks: hers only, her own stats, sized to her
{

	const per = {};
	for ( const [ k, t ] of Object.entries( UPGRADES ) ) if ( t.on ) ( per[ t.on ] = per[ t.on ] || [] ).push( k );
	ok( per.kayak.length >= 5 && per.console.length >= 5 && per.sportfisher.length >= 8 && per.lobster.length >= 8, `tracks: kayak ${ per.kayak.length }, console ${ per.console.length }, lobster ${ per.lobster.length }, sportfisher ${ per.sportfisher.length }` );
	const s = fresh( 1e5 );
	ok( s.buy( 'consoleTop' ) === null && s.buy( 'sfTower' ) === null, 'another boat\'s gear isn\'t sold to the one you\'re in' );
	s.addBoat( 'console' );
	s.selectBoat( 'console' );
	ok( s.buy( 'consoleTop' ) && s.stats.tTop && ! gearStats( s.upgrades, 'lobster' ).tTop, 'bought for her: it\'s hers, and stays with her' );
	ok( s.buy( 'consoleEngine' ) && s.stats.speedMul === 1.25 && s.stats.twin, 'twin outboards: faster' );
	s.buy( 'consoleWell' );
	ok( s.stats.baitMax === 80, 'a livewell' );
	ok( gearStats( defaultUpgrades(), 'kayak' ).holdKg === 12 && gearStats( { ...defaultUpgrades(), kayakCrate: 1 }, 'kayak' ).holdKg === 25, 'a kayak\'s bag, then her crate' );
	ok( gearStats( { ...defaultUpgrades(), sfFishBox: 1 }, 'sportfisher' ).holdKg === 600, 'a sportfisher\'s big box' );
	ok( gearStats( defaultUpgrades(), 'lobster' ).holdKg === 30, 'the lobster boat\'s as it was' );

}

// ---- gasoline and diesel
{

	ok( fuelOf( 'kayak' ) === null && fuelOf( 'console' ).name === 'Gasoline' && fuelOf( 'lobster' ).name === 'Diesel' && fuelOf( 'sportfisher' ).name === 'Diesel', 'what each burns' );
	ok( fuelPrice( 'lobster' ) === FUEL_PRICE && fuelPrice( 'console' ) > FUEL_PRICE, `diesel $${ fuelPrice( 'lobster' ) } a litre, gasoline $${ fuelPrice( 'console' ) }` );
	ok( fuelPrice( 'lobster', 2 ) === 2 && fuelPrice( 'console', 2 ) > 2, 'a dearer seller\'s dearer on both' );
	const s = fresh( 1000 );
	s.addBoat( 'console' );
	s.selectBoat( 'console' );
	s.fuel = 100;
	ok( s.refuelCost() === Math.ceil( 100 * fuelPrice( 'console' ) ), 'she fills at her own fuel\'s price' );
	const m = s.money, l = s.refuel();
	ok( l === 100 && s.money === m - Math.ceil( 100 * fuelPrice( 'console' ) ), 'and pays it' );

}

// ---- each boat's Hull
{

	ok( HULLS.lobster.floodL === FLOOD_L && HULLS.lobster.repair === REPAIR_FULL && repairFee( 1 ) === REPAIR_FULL, 'the lobster boat\'s are M10\'s' );
	ok( repairFee( 1, 'sportfisher' ) > repairFee( 1, 'lobster' ) && repairFee( 1, 'lobster' ) > repairFee( 1, 'console' ) && repairFee( 1, 'console' ) > repairFee( 1, 'kayak' ), 'a repair costs by her size' );
	ok( stormWear( 35, 'sportfisher' ) < stormWear( 35, 'lobster' ), 'a storm works a big boat less' );
	const k = new Hull( { store: { hull: 0 }, boat: 'kayak', random: () => 0.99 } );
	let ev = [];
	for ( let i = 0; i < 60; i ++ ) {

		k.step( 0.1, { driven: true, throttle: 1, fuel: false, rain: 1 } );
		ev = ev.concat( k.drain() );

	}

	ok( k.engine === 'running' && ! ev.some( ( e ) => e.kind === 'crank' || e.kind === 'stall' || e.kind === 'failed' ), 'a kayak has nothing to crank, stall or run dry' );
	ok( k.bilge === 0, 'and no bilge to fill' );
	k.step( 0.1, { driven: false } );
	ok( k.engine === 'off', 'and stops when you do' );
	const h = new Hull( { store: { hull: 0.5 }, boat: 'console' } );
	h.bilge = 150;
	h.setBoat( 'lobster' );
	ok( h.bilge === 0 && h.floodL === FLOOD_L && h.figures === HULLS.lobster, 'into another boat: her figures, and a dry bilge' );

}

// ---- slips and upkeep
{

	ok( monthly( { kayak: {} } ) === 0, 'a kayak costs nothing to keep' );
	ok( FLEET.sportfisher.slip + FLEET.sportfisher.upkeep > FLEET.lobster.slip + FLEET.lobster.upkeep && FLEET.lobster.slip + FLEET.lobster.upkeep > FLEET.console.slip + FLEET.console.upkeep, 'more for the big ones' );
	const s = fresh( 1000 );
	const M = monthly( s.fleet );
	ok( s.chargeDues( 5 ) === null && s.dues.day === 5, 'the first day starts the month' );
	ok( s.chargeDues( 5 + MONTH - 1 ) === null && s.money === 1000, 'nothing till it\'s up' );
	const b = s.chargeDues( 5 + MONTH );
	ok( b && b.paid === M && s.money === 1000 - M && s.dues.day === 5 + MONTH, `a month: $${ M }` );
	ok( s.chargeDues( 3 ) === null && s.dues.day === 5 + MONTH, 'a clock behind (a room on an earlier day) owes nothing' );
	s.money = 30;
	const c = s.chargeDues( 5 + MONTH * 2 );
	ok( c.paid === 30 - DUES_LEAVE && s.money === DUES_LEAVE && c.owed === M - c.paid && s.dues.owed === c.owed, 'short: she leaves you something, the rest on her tab' );
	s.money = 1e5;
	ok( s.quoteBoat( 'console' ).why === 'owed', 'no more boats till it\'s settled' );
	const paid = s.settleDues();
	ok( paid === c.owed && s.dues.owed === 0 && s.quoteBoat( 'console' ).can, 'settled' );
	const far = s.money, D = s.chargeDues( s.dues.day + MONTH * 12 );
	ok( D.months === MOST_MONTHS && far - s.money === M * MOST_MONTHS, `a long time gone: she bills ${ MOST_MONTHS } months at most` );
	const k = fresh( 500, 'kayak' );
	k.chargeDues( 1 );
	ok( k.chargeDues( 1 + MONTH ) === null && k.money === 500, 'a kayak\'s never billed' );
	const j = JSON.parse( JSON.stringify( s.toJSON() ) ), r = new GameState( null );
	ok( r.fromJSON( j ) && r.dues.day === s.dues.day, 'the save keeps it' );

}

// ---- where they're kept
{

	const P = WORLD.pier, head = { x0: P.x - P.headWidth / 2, x1: P.x + P.headWidth / 2, z0: P.zEnd - P.headDepth, z1: P.zEnd };
	const box = ( id ) => {

		const b = berthOf( id ), S = SHAPES[ id ], c = Math.abs( Math.cos( b.heading ) ), s = Math.abs( Math.sin( b.heading ) );
		const hx = c * S.beam / 2 + s * S.length / 2, hz = s * S.beam / 2 + c * S.length / 2;
		return { x0: b.position.x - hx, x1: b.position.x + hx, z0: b.position.z - hz, z1: b.position.z + hz };

	};

	const over = ( a, b ) => a.x0 < b.x1 && b.x0 < a.x1 && a.z0 < b.z1 && b.z0 < a.z1;
	const ids = Object.keys( BOATS );
	ok( ids.every( ( id ) => BERTHS[ id ] ), 'a berth for every boat' );
	ok( berthOf( 'lobster' ).position === WORLD.boatDock.position, 'the lobster boat\'s is where she\'s always been' );
	for ( const id of ids ) ok( ! over( box( id ), head ), `${ id }: clear of the pier head` );
	for ( let i = 0; i < ids.length; i ++ ) for ( let j = i + 1; j < ids.length; j ++ ) ok( ! over( box( ids[ i ] ), box( ids[ j ] ) ), `${ ids[ i ] } and ${ ids[ j ] }: clear of each other` );
	const sfb = box( 'sportfisher' );
	ok( sfb.z0 > head.z1 && sfb.z0 - head.z1 < 1.2 && sfb.x1 - sfb.x0 >= 14, 'the sportfisher lies alongside the pier head\'s seaward face' );
	for ( const file of [ 'island.bin', 'island-1024.bin' ] ) {

		const T = new TerrainData( 7, decodeIsland( new Uint8Array( readFileSync( new URL( `../public/world/${ file }`, import.meta.url ) ) ) ) );
		for ( const id of ids ) {

			const b = berthOf( id ), S = SHAPES[ id ], c = Math.cos( b.heading ), s = Math.sin( b.heading );
			if ( b.ashore ) {

				const r = ashoreOf( id, T );
				ok( T.heightAt( r.position.x, r.position.z ) >= 0.45 && Math.abs( r.position.z - b.position.z ) < 25, `${ file }: ${ id } lies up the sand, clear of the wash, ${ Math.abs( r.position.z - b.position.z ).toFixed( 0 ) } m from the water` );
				continue;

			}

			const deep = Math.min( ...[ - 0.5, 0, 0.5 ].map( ( k ) => - T.heightAt( b.position.x + s * k * S.length, b.position.z + c * k * S.length ) ) );
			ok( deep > S.draft + 0.05, `${ file }: ${ id } floats there (${ deep.toFixed( 2 ) } m under her, her draft ${ S.draft })` );

		}

		for ( const id of [ 'kayak', 'console', 'sportfisher' ] ) {

			const y = yardPose( id, T, SHAPES[ id ].draft, SHAPES[ id ].length );
			ok( y.position.y - SHAPES[ id ].draft > T.heightAt( YARD[ id ].x, YARD[ id ].z ) + 0.2, `${ file }: ${ id }'s keel clear of the yard` );
			ok( T.heightAt( YARD[ id ].x, YARD[ id ].z ) > 2, `${ file }: ${ id }'s spot above a surge` );

		}

	}

	for ( const id of [ 'kayak', 'console', 'sportfisher' ] ) {

		const S = SHAPES[ id ], Y = YARD[ id ], B = { x0: Y.x - S.beam / 2 - 1, x1: Y.x + S.beam / 2 + 1, z0: Y.z - S.length / 2 - 1, z1: Y.z + S.length / 2 + 1 };
		const C = { x0: CRADLE.x - 2, x1: CRADLE.x + 2, z0: CRADLE.z - 4.5, z1: CRADLE.z + 4.5 };
		ok( ! over( B, C ), `${ id }: her spot in the yard's clear of the lobster boat's cradle` );

	}


}

// ---- what's drawn of them
for ( const id of Object.keys( BOATS ) ) {

	const plain = mooredGeometry( id, {} ).attributes.position.count / 3;
	const full = mooredGeometry( id, { paint: 0x14283f, stats: { tTop: true, twin: true, tower: true, outriggers: true, fightingChair: true, holdKg: 99 } } ), n = full.attributes.position.count / 3;
	ok( n < 900 && plain < 900, `${ id }: drawn lightly, ${ plain } triangles, ${ n } with everything fitted` );
	const pos = full.attributes.position;
	full.computeBoundingBox();
	ok( pos.array.every( Number.isFinite ) && full.attributes.normal.array.every( Number.isFinite ), `${ id }: well-formed` );
	const L = full.boundingBox.max.z - full.boundingBox.min.z, feet = L / 0.3048;
	ok( Math.abs( feet - BOATS[ id ].feet ) < 2.5, `${ id }: ${ feet.toFixed( 1 ) } ft against the list's ${ BOATS[ id ].feet }` );

}

ok( standsGeometry( 'sportfisher', 5, () => 3 ).attributes.position.count > 0, 'and what she sits on in the yard' );

// ---- away, per boat
{

	const rec = boatLeft( { x: 1, z: 2, heading: 0, anchor: null, moored: false, aboard: null, T: 100, at: 5, boat: 'console' } );
	ok( rec.boat === 'console' && leftOf( JSON.stringify( rec ) ).boat === 'console', 'the record says which she is' );
	ok( leftOf( JSON.stringify( { v: 1, x: 1, z: 2, T: 3 } ) ).boat === 'lobster', 'a record from before is the lobster boat' );
	const P = berthOf( 'sportfisher' ).position, calm = () => ( { wind: 5, rain: 0, thunder: 0, windAngle: 0 } );
	const none = othersAway( { sportfisher: { hauled: false } }, 100, 120, { berth: berthOf, haul: ( id ) => FLEET[ id ].haul, weather: calm, news: () => null } );
	ok( none.sportfisher.where === 'dock' && none.sportfisher.fee === 0 && none.sportfisher.wear === 0 && none.sportfisher.x === P.x, 'a calm spell: she\'s at her own berth, as she was' );
	const news = ( t ) => ( { stage: t > 105 ? 'warning' : 'watch', onset: 200 } );
	const H = othersAway( { sportfisher: { hauled: false }, kayak: { hauled: false }, console: { hauled: true } }, 100, 120, { berth: berthOf, haul: ( id ) => FLEET[ id ].haul, weather: calm, news } );
	ok( H.sportfisher.where === 'cradle' && H.sportfisher.fee === FLEET.sportfisher.haul && H.kayak.fee === FLEET.kayak.haul, 'a hurricane\'s warning: Marta hauls each out, for her own fee' );
	ok( H.console.where === 'cradle' && H.console.fee === 0, 'one already hauled costs nothing more' );
	const said = tellOthers( H, { sportfisher: 'Reel Therapy', kayak: 'the fishing kayak', console: 'the center console' } );
	ok( said.length === 2 && said[ 0 ].includes( 'Reel Therapy' ) && said[ 0 ].includes( `$${ FLEET.sportfisher.haul }` ), 'and says so, by what you call her' );
	const storm = () => ( { wind: 35, rain: 0, thunder: 0, windAngle: 0, id: 'gale' } );
	const big = awayOf( { x: 0, z: 0, heading: 0, anchor: null, moored: true, T: 0 }, 2, { dock: { x: 0, z: 0 }, weather: storm, news: () => null, boat: 'sportfisher' } );
	const lob = awayOf( { x: 0, z: 0, heading: 0, anchor: null, moored: true, T: 0 }, 2, { dock: { x: 0, z: 0 }, weather: storm, news: () => null } );
	ok( big.wear > 0 && big.wear < lob.wear, `a gale at her berth wears each by her own figures (sportfisher ${ big.wear.toFixed( 3 ) }, lobster ${ lob.wear.toFixed( 3 ) })` );
	ok( HAUL_FEE === FLEET.lobster.haul, 'the lobster boat\'s haul-out as it was' );

}

// ---- name and paint
{

	const s = fresh( 500 );
	ok( s.boatName() === 'the lobster boat', 'she\'s what she is until she\'s named' );
	ok( s.nameBoat( 'lobster', '  Miss <b>Behavin\'  ' ) && ! /[<>]/.test( s.fleet.lobster.name ) && s.fleet.lobster.name.startsWith( 'Miss' ), 'her name, no markup in it' );
	s.nameBoat( 'lobster', 'x'.repeat( 60 ) );
	ok( s.fleet.lobster.name.length === NAME_MAX, 'nor too long for a transom' );
	s.nameBoat( 'lobster', 'Reel Therapy' );
	ok( s.boatName() === 'Reel Therapy', 'as you call her' );
	const m = s.money;
	ok( s.paintBoat( 'lobster', 'blue' ) && s.fleet.lobster.paint === 'blue' && s.money === m - FLEET.lobster.paintJob, 'painted, for the yard\'s price' );
	ok( ! s.paintBoat( 'lobster', 'blue' ) && ! s.paintBoat( 'lobster', 'tartan' ), 'not the same again, nor a colour they\'ve not got' );
	s.money = 0;
	ok( ! s.paintBoat( 'lobster', 'red' ), 'nor without the money' );
	ok( PAINTS.length >= 6, `${ PAINTS.length } colours` );
	s.nameBoat( 'lobster', '' );
	ok( s.fleet.lobster.name === null, 'and she can go nameless again' );
	s.nameBoat( 'lobster', 'Reel Therapy' );
	const j = JSON.parse( JSON.stringify( s.toJSON() ) ), r = new GameState( null );
	ok( r.fromJSON( j ) && r.fleet.lobster.name === 'Reel Therapy' && r.fleet.lobster.paint === 'blue', 'the save keeps them' );

}

// ---- other boats' fleet records in the yard, and repairs at her berth
{

	const s = fresh( 500 );
	s.addBoat( 'console' );
	ok( s.haulBoat( 'console', 35 ) && s.fleet.console.hauled && s.money === 465, 'a boat you\'re not in, hauled out for her fee' );
	ok( ! s.haulBoat( 'console', 35 ) && ! s.haulBoat( 'lobster', 40 ), 'not twice, nor by this (the boat you\'re in has her own: Game.haul)' );
	s.selectBoat( 'console' );
	ok( s.hauled, 'getting into her, she\'s on her blocks' );
	s.selectBoat( 'lobster' );
	s.fleet.console.hull = 0.5;
	const paid = s.repairBoat( 'console' );
	ok( paid === repairFee( 0.5, 'console' ) && s.fleet.console.hull === 0, 'and repaired where she lies' );

}

// ---- Marta's list, as it's drawn
{

	const s = fresh( 3000 );
	s.addBoat( 'kayak' );
	const hud = { game: { state: s, towJob: () => null, app: { weather: { news: null } } }, _fleetOpen: null };
	const halfway = { hold: 2, fuel: 2, engine: 2, baitWell: 2, fishFinder: 1, lights: 1, anchor: 1, bilgePump: 0, rod: 0, reel: 0, line: 0 };
	Object.assign( s.upgrades, halfway );
	let h = fleetRows( hud );
	ok( h.includes( 'Offshore sportfisher' ) && h.includes( 'Finish your upgrades to unlock it · 11 of 19' ) && h.includes( 'is-shadow' ), 'the sportfisher: a silhouette, her name, how far you are' );
	ok( ! h.includes( 'data-buyboat="sportfisher"' ) && ! h.includes( '$25,000' ), 'no price and no way to buy her yet' );
	ok( h.includes( 'data-buyboat="console"' ) && h.includes( 'Center console · $2,500' ), 'the center console, at her price' );
	ok( h.includes( 'data-takeout="kayak"' ) && h.includes( 'data-sellboat="kayak"' ) && ! h.includes( 'data-takeout="lobster"' ), 'yours to take out or sell: not the one you\'re in' );
	s.earned = true;
	h = fleetRows( hud );
	ok( ! h.includes( 'is-shadow' ) && h.includes( '$25,000' ) && h.includes( 'data-buyboat="sportfisher"' ), 'earned: her picture and her price' );
	ok( h.includes( 'data-trade="lobster"' ), 'and the lobster boat can be traded in for her' );
	hud.game.towJob = () => ( { fee: 77, metres: 1000 } );
	ok( fleetRows( hud ).includes( '$77' ), 'a boat out at sea: what it\'d cost to fetch her' );
	hud.game.towJob = () => null;
	hud.game.app.weather.news = { stage: 'warning' };
	ok( fleetRows( hud ).includes( `data-haulboat="kayak"` ), 'a hurricane coming: each can be hauled from her row' );
	hud._fleetOpen = 'lobster';
	s.nameBoat( 'lobster', 'Reel & Tackle' );
	h = fleetRows( hud );
	ok( h.includes( 'data-boatname="lobster"' ) && h.includes( 'data-paint="navy"' ), 'name and paint' );
	s.dues.owed = 40;
	ok( fleetRows( hud ).includes( 'You owe Marta $40' ), 'what\'s on her tab' );

}

// ---- an old save comes across
{

	const s = new GameState( null );
	ok( s.fromJSON( { v: 1, money: 10, upgrades: { hold: 2 }, fuel: 9, hull: 0.5, hauled: true } ) && s.boat === 'lobster' && s.owns( 'kayak' ) && ! s.owns( 'console' ), 'v1: the lobster boat as it was, the kayak, the rest to buy' );
	ok( s.boatWorth( 'lobster' ) > 0 && s.boatWorth( 'kayak' ) === 0, 'a kept lobster boat\'s worth something, a free kayak nothing' );
	ok( s.dues.day === null && s.dues.owed === 0 && ! s.earned, 'no bill waiting' );
	const k = new GameState( null );
	ok( k.fromJSON( { v: 2, boat: 'kayak', fleet: { kayak: { name: 'Blue', paint: 'tartan', paid: 'x' } }, upgrades: {} } ) && k.fleet.kayak.paint === null && k.fleet.kayak.paid === null && k.fleet.kayak.name === 'Blue', 'a save with rubbish in her record loads clean' );

}

console.log( bad ? `\n${ bad } failed` : '\nfleet: all passed' );
process.exit( bad ? 1 : 0 );
