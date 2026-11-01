import { Vector3 } from '../../../engine/index.js';
import { SF } from './SportfisherLines.js';
import { V, deckY, houseFootX, houseWallX, HOUSE_CORNER, CHAIR_Z } from './SportfisherHull.js';
import { CABIN } from './SportfisherHouse.js';
import { bridgeX, BRIDGE_HATCH, BRIDGE_LADDER, HELM, TOWER } from './SportfisherBridge.js';

// (M16) Where you can stand on her. A lobster boat has a sole and some boxes; she has five levels over one another: the
// cockpit and mezzanine, the salon, the cabins below it, the deck round the house, the flybridge, and the tower's platform.
//   floors        [ { x0, x1, z0, z1, y( x, z ) } ]: what's underfoot where. soleY picks the highest not over your reach
//   colliders     the solid boxes (Player walks into them, by height, so a wall on one deck's no wall on another)
//   ladders       the two climbs (world/boat/sportfisher/LadderClimb.js)
//   levelOf( y )  which deck someone standing at y is on

const flat = ( y ) => () => y;

export function buildFloors( L ) {

	const F = [];
	const add = ( x0, x1, z0, z1, y ) => F.push( { x0, x1, z0, z1, y: typeof y === 'function' ? y : flat( y ) } );
	const zT = L.zAft + 0.2, W = 3;

	add( - W, W, zT - 0.02, SF.mezzZ - 0.26, SF.cockpit );
	add( - 1.12, 1.12, SF.mezzZ - 0.26, SF.mezzZ, ( SF.cockpit + SF.mezz ) / 2 ); // (the step)
	add( - 1.12, 1.12, SF.mezzZ, SF.houseAft + 0.06, SF.mezz );
	// the boxes either side of the mezzanine, a step up to the side decks (and over the side into the cockpit, as you can)
	add( - W, - 1.12, SF.mezzZ - 0.26, SF.houseAft + 0.02, 1.26 );
	add( 1.12, W, SF.mezzZ - 0.26, SF.houseAft + 0.02, 1.26 );

	// the salon, a sill up from the mezzanine; the stairs down its middle at the forward end
	add( - W, W, SF.houseAft + 0.02, 0.72, SF.salon );
	add( - W, - 0.42, 0.72, SF.salonFront, SF.salon );
	add( 0.48, W, 0.72, SF.salonFront, SF.salon );
	const stair = ( x, z ) => SF.salon + ( SF.lower - SF.salon ) * Math.min( 1, Math.max( 0, ( z - 0.72 ) / ( 2.2 - 0.72 ) ) );
	add( - 0.42, 0.48, 0.72, 2.2, stair );
	add( - W, W, SF.salonFront, SF.lowerForward, SF.lower );

	// round the house and over the foredeck
	add( - W, W, SF.houseAft, 8.4, ( x, z ) => deckY( L, x, z ) );

	// the flybridge, the hatch taken out by a collider, and the platform up the tower
	add( - W, W, SF.bridgeAft, SF.bridgeFront, SF.bridge );
	add( - TOWER.hx, TOWER.hx, TOWER.z0 - 0.3, TOWER.z1, SF.tower );

	return F;

}

// are you over a floor that's real here? the deck round the house isn't under the house
const inside = ( L, f, x, z ) => {

	if ( x < f.x0 || x > f.x1 || z < f.z0 || z > f.z1 ) return false;
	if ( f.z1 === 8.4 && Math.abs( x ) < houseFootX( L, z ) ) return false;
	return true;

};

export function soleAt( L, floors, x, z, maxY ) {

	let g = - Infinity;
	for ( const f of floors ) {

		if ( ! inside( L, f, x, z ) ) continue;
		const y = f.y( x, z );
		if ( y <= maxY && y > g ) g = y;

	}

	return g === - Infinity ? SF.cockpit : g;

}

// keeps a walker of radius r on the deck they're on (p: boat frame). The rails and the sides, by level
export function keepOnDeck( L, p, r ) {

	if ( p.y > ( SF.tower + SF.bridge ) / 2 ) {

		p.x = Math.min( TOWER.hx - r * 0.6, Math.max( - TOWER.hx + r * 0.6, p.x ) );
		p.z = Math.min( TOWER.z1 - r * 0.6, Math.max( TOWER.z0 - 0.02, p.z ) );
		return;

	}

	if ( p.y > SF.bridge - 0.2 ) {

		p.z = Math.min( SF.bridgeFront - 0.7, Math.max( SF.bridgeAft + 0.09 + r, p.z ) );
		const h = Math.max( 0.15, bridgeX( p.z ) - 0.22 - r );
		p.x = Math.min( h, Math.max( - h, p.x ) );
		return;

	}

	p.z = Math.min( p.y < 0.9 && p.z > SF.houseAft ? SF.lowerForward - r : 8.05, Math.max( L.zAft + 0.2 + r, p.z ) );
	// on the deck round the house: off its front, the shortest way
	if ( p.y > 1.2 && p.z > SF.houseAft ) {

		const foot = houseFootX( L, p.z );
		if ( p.z > HOUSE_CORNER && p.z < SF.houseFront + r * 0.4 && Math.abs( p.x ) < foot + r * 0.4 ) {

			const w0 = houseFootX( L, HOUSE_CORNER ), f = Math.min( 1, Math.abs( p.x ) / w0 ), zOut = HOUSE_CORNER + ( SF.houseFront - HOUSE_CORNER ) * Math.sqrt( 1 - f * f ) + r * 0.4;
			if ( zOut - p.z < foot + r * 0.4 - Math.abs( p.x ) ) p.z = zOut;
			else p.x = ( Math.sign( p.x ) || 1 ) * ( foot + r * 0.4 );

		}

	}

	const t = L.tAtSheerZ( p.z );
	let h;
	if ( p.z < SF.houseAft && p.y < L.sheerY( t ) - 0.2 ) h = L.sheerX( t ) - SF.gunwale - r; // the cockpit's side
	else if ( p.y < 0.9 ) h = L.hullXAt( p.z, p.y + 0.25 ) - 0.07 - r; // the cabins: her sides, close in forward
	else h = L.sheerX( t ) - L.shell - r * 0.8; // the deck, along the rail
	h = Math.max( 0.15, h );
	p.x = Math.min( h, Math.max( - h, p.x ) );

}

export function buildColliders( L ) {

	const boxes = [];
	const add = ( tag, x0, y0, z0, x1, y1, z1, walkable = false, solid = true ) => {

		boxes.push( { tag, center: V( ( x0 + x1 ) / 2, ( y0 + y1 ) / 2, ( z0 + z1 ) / 2 ), half: V( Math.abs( x1 - x0 ) / 2, Math.abs( y1 - y0 ) / 2, Math.abs( z1 - z0 ) / 2 ), walkable, solid } );

	};

	const roof = SF.roofY, salon = SF.salon, lower = SF.lower, b = SF.bridge;

	// the house: its sides, in steps along her curve, held in a little from the paint so the side deck's wide enough to walk
	// (its front's kept off by keepOnDeck: a box here would stand in the cabins under it)
	const seg = [ - 2.4, - 1.4, - 0.4, 0.6, SF.salonFront ];
	for ( let i = 0; i < seg.length - 1; i ++ ) {

		const z0 = seg[ i ], z1 = seg[ i + 1 ], w = Math.max( houseFootX( L, z0 ), houseFootX( L, z1 ) );
		for ( const s of [ 1, - 1 ] ) add( 'houseSide', s * ( w - 0.26 ), SF.salon - 0.5, z0, s * ( w - 0.1 ), roof, z1 );

	}

	// the aft bulkhead, its door left open
	const w0 = houseWallX( L, SF.houseAft, 2 );
	add( 'bulkhead', - w0, SF.mezz, SF.houseAft - 0.02, - 0.5, roof, SF.houseAft + 0.08 );
	add( 'bulkhead', 0.24, SF.mezz, SF.houseAft - 0.02, w0, roof, SF.houseAft + 0.08 );
	add( 'bulkhead', - 0.5, 2.92, SF.houseAft - 0.02, 0.24, roof, SF.houseAft + 0.08 );
	// the salon's forward bulkhead, either side of the stairs; and the stairs' sides
	const zF = SF.salonFront - 0.05;
	add( 'bulkhead', - 2.2, salon, zF, - 0.42, roof, zF + 0.05 );
	add( 'bulkhead', 0.48, salon, zF, 2.2, roof, zF + 0.05 );
	add( 'stairSide', - 0.5, salon + 0.1, 0.72, - 0.42, 2.7, 2.2 );
	add( 'stairSide', 0.48, salon + 0.1, 0.72, 0.56, 2.7, 2.2 );

	// what's on the salon's sole: the settee, the galley and its island, the dinette
	const xW = houseWallX( L, - 1, 1.6 ) - 0.06, xG = houseWallX( L, 0.6, 1.6 ) - 0.06, xD = houseWallX( L, 0.7, 1.6 ) - 0.06;
	const zA = SF.houseAft + 0.09;
	add( 'settee', 0.34, salon, zA, xW, salon + 0.86, zA + 0.5 );
	add( 'settee', xW - 0.5, salon, zA + 0.5, xW, salon + 0.86, - 0.05 );
	add( 'table', xW - 1.25, salon, - 1.45, xW - 0.65, salon + 0.44, - 0.85 );
	add( 'galley', - xG, salon, - 0.15, - xG + 0.58, salon + 0.92, zF );
	add( 'galley', - xG + 0.58, salon, zF - 0.58, - 0.5, salon + 0.92, zF );
	add( 'island', - 1.04, salon, - 0.6, - 0.5, salon + 0.92, 0.54 );
	add( 'dinette', 0.62, salon, 0.05, xD, salon + 0.86, zF );

	// the cabins: the passage's walls, the bunks, the head, the berth
	for ( const x of [ 0.48, - 0.5 ] ) {

		add( 'cabinWall', x, lower, SF.salonFront, x + 0.04, 2.0, 2.45 );
		add( 'cabinWall', x, lower, 3.1, x + 0.04, 2.0, 3.45 );

	}

	add( 'cabinWall', - 2.2, lower, 3.45, - 0.36, 2.0, 3.49 );
	add( 'cabinWall', 0.42, lower, 3.45, 2.2, 2.0, 3.49 );
	add( 'bunk', CABIN.bunkX, lower, 1.68, 2.4, 1.5, 3.38 );
	add( 'head', - 1.28, lower, 1.63, - 0.5, lower + 0.84, 2.27 );
	add( 'berth', - 0.82, lower, 3.95, 0.82, lower + 0.72, 5.15 );

	// the flybridge: its helm pod, the benches, the hatch's rail, the two helm seats
	add( 'console', - HELM.halfW, b, HELM.consoleZ0, HELM.halfW, b + 1.1, HELM.consoleZ1 );
	for ( const s of [ 1, - 1 ] ) add( 'bench', Math.min( s * 0.86, s * 1.68 ), b, - 0.3, Math.max( s * 0.86, s * 1.68 ), b + 0.46, 1.25, true );
	const H = BRIDGE_HATCH;
	add( 'hatchRail', H.x0, b, H.z0, H.x1, b + 0.92, H.z1 );

	// the fighting chair
	add( 'chair', - 0.3, SF.cockpit, CHAIR_Z - 0.3, 0.3, SF.cockpit + 1.05, CHAIR_Z + 0.3 );

	return boxes;

}

// the two climbs. foot, head: the line of the climb (where your feet go), off the rungs; on, off: where you stand to take
// to it at each end. height: how exposed it is above her centre of roll (LadderClimb: the seaway takes its toll by it)
export function buildLadders() {

	const B = BRIDGE_LADDER, T = TOWER;
	return [
		{ id: 'bridge', text: 'Climb up to the bridge', downText: 'Climb down to the cockpit', foot: B.foot.clone(), head: B.head.clone(), on: new Vector3( B.x, SF.cockpit, - 3.85 ), off: new Vector3( B.x, SF.bridge, - 2.2 ), speed: 0.8 },
		{ id: 'tower', text: 'Climb the tower', downText: 'Climb down to the bridge', foot: T.foot.clone(), head: T.head.clone(), on: new Vector3( 0, SF.bridge, - 2.9 ), off: new Vector3( 0, SF.tower, - 0.85 ), speed: 0.55, needs: 'tower' },
	];

}
