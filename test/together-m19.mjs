// (M19) Stream TOGETHER (docs/m19/together.md), in plain Node:
//   - the room's keys: everyone's flats and rest records in a few slots, taken over once their player's gone and what's in them is
//     spent, so a room's keys stop piling up one a player ever; a slot two players took at once lost by one, who takes another;
//   - a change to the group's save tried again when more saves cross than the SDK's update lets through;
//   - others' copies of an anchored lobster boat, or console, without her anchor on her roller;
//   - the boats in company leaving foam on your sea.
//   node test/together-m19.mjs
import { Scene } from '../src/engine/index.js';
import { SLOTS, slotFor, ownerOf, isSlot, updateAgain, AGAIN } from '../src/together/RoomSlots.js';
import { fitWire, fitStats } from '../src/together/BoatCopies.js';
import { BoatModel } from '../src/world/BoatModel.js';
import { ConsoleModel } from '../src/world/boat/console/ConsoleModel.js';
import { gearStats, defaultUpgrades } from '../src/game/Gear.js';
import { Wake } from '../src/ocean/Wake.js';

let fails = 0;
const ok = ( c, msg ) => {

	if ( ! c ) {

		fails ++;
		console.log( 'FAIL', msg );

	} else console.log( 'ok  ', msg );

};

// ---- the room's keys
{

	const room = new Map(), P = 'flats.';
	const write = ( me, here, rec, spent = ( v ) => ! v.live ) => {

		const key = slotFor( P, [ ...room ], me, here, spent, null );
		room.set( key, { id: me, ...rec } );
		return key;

	};

	// two hundred players over the room's life, eight here at a time, each writing a live record and going spent when they leave
	let keysMost = 0;
	for ( let n = 0; n < 200; n ++ ) {

		const here = Array.from( { length: 8 }, ( _, i ) => `p${ n - i }` ).filter( ( id ) => + id.slice( 1 ) >= 0 );
		for ( const [ k, v ] of room ) if ( ! here.includes( v.id ) ) room.set( k, { ...v, live: false } );
		write( `p${ n }`, here, { live: true } );
		keysMost = Math.max( keysMost, room.size );

	}

	ok( keysMost <= SLOTS && [ ...room.keys() ].every( ( k ) => isSlot( P, k ) ), `200 players over a room's life, 8 at a time: never more than ${ keysMost } keys (${ SLOTS } slots), where it was one a player ever` );
	const here = [ 'a', 'b' ];
	room.clear();
	const ka = write( 'a', here, { live: true } ), kb = write( 'b', here, { live: true } );
	ok( ka !== kb && write( 'a', here, { live: true } ) === ka, 'each in a slot of their own, and back in it after' );
	ok( ownerOf( P, ka, room.get( ka ) ) === 'a' && ownerOf( P, 'flats.sam-1', { s: {} } ) === 'sam-1' && ownerOf( P, ka, null ) === null, 'whose: the slot\'s id, or an older game\'s own key, or nobody\'s (empty)' );
	// a slot that's still live, its player gone: kept for them; spent: taken
	room.clear();
	for ( let i = 0; i < SLOTS; i ++ ) room.set( `${ P }@${ i }`, { id: `gone${ i }`, live: i !== 3 } );
	ok( slotFor( P, [ ...room ], 'c', [ 'c' ], ( v ) => ! v.live ) === `${ P }@3`, 'all taken, their players gone: the one that\'s spent is taken over' );
	room.set( `${ P }@3`, { id: 'gone3', live: true } );
	ok( slotFor( P, [ ...room ], 'c', [ 'c' ], ( v ) => ! v.live ) === P + 'c', 'none spent: your own key, as before, sooner than another\'s live record' );
	// two players took the same slot at once: the one whose write was lost keeps nothing of it
	room.clear();
	const k1 = slotFor( P, [ ...room ], 'x', [ 'x', 'y' ] );
	room.set( k1, { id: 'y' } );
	ok( slotFor( P, [ ...room ], 'x', [ 'x', 'y' ], () => true, k1 ) !== k1, 'a slot taken from under you as you took it: yours goes into another' );

}

// ---- the group's save tried again
{

	const tried = async ( fails, n = AGAIN.n ) => {

		let calls = 0, value = { a: 1 };
		const update = ( key, change ) => {

			calls ++;
			if ( calls <= fails ) return Promise.reject( new Error( 'crossed' ) );
			value = change( value );
			return Promise.resolve( value );

		};
		const r = await updateAgain( update, 'records', ( cur ) => ( { ...cur, b: 2 } ), { n, wait: () => Promise.resolve() } ).catch( () => null );
		return { r, calls };

	};

	const a = await tried( 3 ), b = await tried( 9 );
	ok( a.r && a.r.b === 2 && a.r.a === 1 && a.calls === 4, `lost to three crossing saves, it's tried again and saved, what was there kept (${ a.calls } tries)` );
	ok( b.r === null && b.calls === AGAIN.n + 1, `and given up past ${ AGAIN.n } more (${ b.calls } tries)` );

}

// ---- copies of an anchored boat
{

	const lob = new BoatModel();
	lob.setAnchorStowed( false );
	const f = fitWire( 'lobster', {}, null, lob.fitNow() ), s = fitStats( 'lobster', f );
	ok( s.anchorDown === true && f >= 256, `the lobster boat's anchor down, in her pose's fit (${ f })` );
	const views = new Map(), shared = ( k, make ) => views.get( k ) || views.set( k, make() ).get( k );
	const copy = lob.group.clone();
	lob.dressCopy( copy, s, shared );
	const drawn = copy.getObjectByName( lob.meshes.fittings.name ).geometry.drawRange.count;
	lob.dressCopy( copy, fitStats( 'lobster', fitWire( 'lobster', {}, null, { anchorDown: false } ) ), shared );
	const stowed = copy.getObjectByName( lob.meshes.fittings.name ).geometry.drawRange.count;
	ok( drawn === lob._stowedFrom && stowed === Infinity, 'her copy without her anchor on her roller while it\'s down, and with it when it\'s up' );
	const con = new ConsoleModel();
	con.fit( gearStats( { ...defaultUpgrades(), consoleTop: 1 }, 'console' ) );
	con.setAnchorStowed( false );
	const cs = fitStats( 'console', fitWire( 'console', gearStats( { ...defaultUpgrades(), consoleTop: 1 }, 'console' ), null, con.fitNow() ) );
	const cc = con.group.clone(), cv = new Map();
	con.dressCopy( cc, cs, ( k, make ) => cv.get( k ) || cv.set( k, make() ).get( k ) );
	ok( cs.anchorDown && cc.getObjectByName( 'boat-fittings' ).geometry.drawRange.count === con.meshes.fittings.geometry.drawRange.count, 'the console\'s too' );

}

// ---- the boats in company leave foam
{

	const boat = { model: { group: { position: { x: 0, z: 0 } }, wake: null, dimensions: null }, velocity: { x: 0, z: 0 }, getYaw: () => 0, rpm: 0 };
	const w = new Wake( { scene: new Scene(), boat, waves: { heightAt: () => 0, wakes: null }, tier: 'low' } );
	const con = new ConsoleModel();
	let x = 50;
	for ( let i = 0; i < 120; i ++ ) {

		x += 8 / 30;
		w._company = [ { id: 'sam', x, z: 20, yaw: Math.PI / 2, vx: 8, vz: 0, W: con.wake, dims: con.dimensions } ];
		w._theirs = w._theirs || new Map();
		w.update( 1 / 30 );

	}

	let live = 0, near = 0;
	for ( let i = 0; i < w.max; i ++ ) if ( w.data[ i * 4 + 2 ] < w.life ) {

		live ++;
		if ( Math.abs( w.xz[ i * 2 + 1 ] - 20 ) < 10 && w.xz[ i * 2 ] < x + 2 ) near ++;

	}

	ok( live > 20 && near === live, `a console in company at 8 m/s leaves her foam on your sea, along her track (${ live } patches), on low too, though you're still` );

}

console.log( fails ? `${ fails } FAILED` : 'all passed' );
process.exit( fails ? 1 : 0 );
