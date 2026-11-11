// (M17, stream 4) Aboard together: what M16 left for a guest on someone else's boat. The dock's berths along the stem by each
// boat's size and the tide, the way out round the pier head, a kayak's place on the sand, the yard's second cradle; the
// console's ladder in her fit; a speck's height by her fit; the chair by the seat; a guest's catch in her box (main's v2.3.0);
// Marta's tray from the group's save; Pearl's berth with anyone's boat in it; a slow game's boat kept with the water.
// Two real games: tools/two-players/together.mjs.
import { register } from 'node:module';
import { readFileSync } from 'node:fs';

register( 'data:text/javascript,' + encodeURIComponent( `
export async function resolve( specifier, context, next ) {

	if ( specifier === '@allthespaces/portal/three' ) return { url: 'data:text/javascript,export const gltfLoader = {};', shortCircuit: true };
	return next( specifier, context );

}` ) );
globalThis.window = globalThis.window || { devicePixelRatio: 1 };
const { loadBoat } = await import( '../src/world/boat/Boats.js' );
const { BoatCopies, SIZE, airOf, bareOf, fitPaint, fitStats, fitWire, sizeOf, standInGeometry } = await import( '../src/together/BoatCopies.js' );
const B = await import( '../src/together/Berths.js' );
const { jobAt } = await import( '../src/together/Crew.js' );
const { seenHeight } = await import( '../src/together/Specks.js' );
const { Together } = await import( '../src/together/Together.js' );
const { GameState } = await import( '../src/game/GameState.js' );
const { BoatController } = await import( '../src/player/BoatController.js' );
const { WaterQuery } = await import( '../src/ocean/WaterQuery.js' );
const { G } = await import( '../src/core/Globals.js' );
const { TIDE_HIGHEST, TIDE_LOWEST } = await import( '../src/game/IslandClock.js' );
const { YARD, CRADLE, SPARE_YARD } = await import( '../src/world/village/StormPlaces.js' );
const { ashoreOf } = await import( '../src/game/fleet/Berths.js' );
const { WORLD } = await import( '../src/world/WorldLayout.js' );
const { TerrainData } = await import( '../src/world/TerrainData.js' );
const { decodeIsland } = await import( '../src/world/terrain/IslandDecode.js' );
const { Scene, Vector3 } = await import( '../src/engine/index.js' );
const { triangleCount } = await import( '../src/world/boat/GeoKit.js' );

let bad = 0;
const ok = ( c, what ) => {

	if ( ! c ) bad ++;
	console.log( ( c ? 'ok   ' : 'FAIL ' ) + what );

};

const P = WORLD.pier, HEAD = { x0: P.x - P.headWidth / 2, x1: P.x + P.headWidth / 2, z0: P.zEnd - P.headDepth, z1: P.zEnd };
const STEM = { x0: P.x - P.width / 2, x1: P.x + P.width / 2, z0: P.zStart, z1: HEAD.z0 };
// her hull as a box about where she lies, heading along z (as the spares have her)
const hull = ( x, z, s ) => ( { x0: x - s.beam / 2, x1: x + s.beam / 2, z0: z - s.length / 2, z1: z + s.length / 2 } );
const over = ( a, b ) => a.x0 < b.x1 && a.x1 > b.x0 && a.z0 < b.z1 && a.z1 > b.z0;

// ---- (6) the stem's berths: as many as it holds, by each boat's length and draft, with water under her at low tide
for ( const file of [ 'island.bin', 'island-1024.bin' ] ) {

	const T = new TerrainData( 7, decodeIsland( new Uint8Array( readFileSync( new URL( `../public/world/${ file }`, import.meta.url ) ) ) ) );
	const ground = ( x, z ) => T.heightAt( x, z );
	for ( const id of [ 'lobster', 'console', 'sportfisher', 'kayak' ] ) {

		const S = sizeOf( id ), taken = [];
		for ( let b; ( b = B.stemBerth( taken, S, ground ) ); ) taken.push( b );
		const clear = taken.every( ( b ) => ! over( hull( b.x, b.z, S ), STEM ) && ! over( hull( b.x, b.z, S ), HEAD ) );
		const apart = taken.every( ( a, i ) => taken.every( ( b, j ) => i === j || a.side !== b.side || ! over( hull( a.x, a.z, S ), hull( b.x, b.z, S ) ) ) );
		const deep = Math.min( ...taken.map( ( b ) => - Math.max( ground( b.x, b.z0 ), ground( b.x, b.z1 ), ground( b.x + b.side * S.beam / 2, b.z0 ) ) ) );
		const want = { lobster: 6, console: 6, sportfisher: 4, kayak: 10 }[ id ];
		ok( taken.length >= want && clear && apart && deep + TIDE_LOWEST > S.draft, `${ file }: the stem holds ${ taken.length } ${ id }s (M16: 4 of anything), clear of the pier and each other, ${ ( deep + TIDE_LOWEST - S.draft ).toFixed( 2 ) } m under her keel at the lowest tide` );

	}

	// (any mix: a sportfisher and lobster boats share it)
	const mix = [], kinds = [ 'sportfisher', 'lobster', 'lobster', 'console', 'sportfisher', 'lobster', 'console', 'lobster' ];
	for ( const id of kinds ) {

		const b = B.stemBerth( mix, sizeOf( id ), ground );
		if ( b ) mix.push( Object.assign( b, { id } ) );

	}

	const mixApart = mix.every( ( a, i ) => mix.every( ( b, j ) => i === j || a.side !== b.side || ! over( hull( a.x, a.z, sizeOf( a.id ) ), hull( b.x, b.z, sizeOf( b.id ) ) ) ) );
	ok( mix.length >= 7 && mixApart, `${ file }: two sportfishers, four lobster boats and two consoles: ${ mix.length } of the 8 along it, none touching` );

	// (6) a kayak on the sand: places beside where yours lies, each up past the high-water mark
	const rest = ashoreOf( 'kayak', T ).position, sand = [];
	for ( let b; ( b = B.sandBerth( sand, T ) ); ) sand.push( b );
	const dry = sand.every( ( b ) => T.heightAt( b.x, b.z ) >= TIDE_HIGHEST + 0.5 - 1e-6 && Math.abs( b.y - T.heightAt( b.x, b.z ) ) < 1e-6 );
	const apartSand = sand.every( ( a, i ) => sand.every( ( b, j ) => i === j || Math.abs( a.x - b.x ) > SIZE.kayak.beam + 0.5 ) && Math.abs( a.x - rest.x ) > SIZE.kayak.beam + 0.5 );
	ok( sand.length >= 4 && dry && apartSand && B.onTheSand( 'kayak', rest.x + 0.5, rest.z - 1, rest ) && ! B.onTheSand( 'console', rest.x, rest.z, rest ) && ! B.onTheSand( 'kayak', rest.x, rest.z + 20, rest ), `${ file }: ${ sand.length } places on the sand beside yours, each past the high-water mark (${ ( TIDE_HIGHEST + 0.5 ).toFixed( 2 ) } m)` );

	// (2) the yard's second cradle: each type's, on ground over a surge, clear of every other place in the yard
	const L = { kayak: 3.7, console: 7, lobster: 8.2, sportfisher: 14.6 };
	const yardBox = ( p, id ) => ( { x0: p.x - sizeOf( id ).beam / 2 - 0.6, x1: p.x + sizeOf( id ).beam / 2 + 0.6, z0: p.z - L[ id ] / 2 - 0.6, z1: p.z + L[ id ] / 2 + 0.6 } );
	const places = [ ...Object.keys( YARD ).map( ( id ) => [ id, B.yardOf( id ) ] ), ...Object.entries( SPARE_YARD ) ];
	for ( const id of Object.keys( SPARE_YARD ) ) {

		const s = B.spareYard( id, T ), box = yardBox( s, id );
		const clear = places.every( ( [ k, p ] ) => p === SPARE_YARD[ id ] || ! over( box, yardBox( p, k ) ) );
		ok( s && s.kind === 'yard' && clear && T.heightAt( s.x, s.z ) > 2 && Math.abs( s.rise ) < 1, `${ file }: ${ id }'s second cradle at ${ s.x }, ${ s.z }: clear of the yard's others, ${ T.heightAt( s.x, s.z ).toFixed( 1 ) } m up, ${ s.rise.toFixed( 2 ) } m off her own's level` );

	}

	ok( B.inTheYard( 'lobster', CRADLE.x + 1, CRADLE.z - 1 ) && ! B.inTheYard( 'lobster', CRADLE.x + 6, CRADLE.z ) && B.inTheYard( 'sportfisher', YARD.sportfisher.x, YARD.sportfisher.z ), `${ file }: on her cradle is on it, not beside it` );
	const g = B.cradleGeometry( 'console', sizeOf( 'console' ), 4, ( x, z ) => T.heightAt( YARD.console.x + x, YARD.console.z + z ) );
	g.computeBoundingBox();
	ok( triangleCount( g ) > 20 && triangleCount( g ) < 400 && g.attributes.aux !== undefined && g.boundingBox.min.y < T.heightAt( YARD.console.x, YARD.console.z ) - 4 + 0.05, `${ file }: her blocks and stands, ${ triangleCount( g ) } triangles in the props' program, down to the ground` );

}

// ---- (6) leaving the stem: out from it and round the head, never through it, and never a jump
{

	const S = sizeOf( 'lobster' ), ground = () => - 4, taken = [];
	for ( let b; taken.length < 4 && ( b = B.stemBerth( taken, S, ground ) ); ) taken.push( b );
	// (her owner's ways out from the head's east side: north, east, round its face to the west and along the beach, out to sea)
	const ways = [ [ [ 64.5, 80 ] ], [ [ 100, 36 ] ], [ [ 64.5, 48 ], [ 30, 48 ], [ 10, 36 ] ], [ [ 66, 50 ], [ 55, 90 ] ], [ [ 64.5, 47 ], [ 30, 60 ] ] ];
	const along = ( pts, f ) => {

		const L = pts.slice( 1 ).map( ( q, i ) => Math.hypot( q[ 0 ] - pts[ i ][ 0 ], q[ 1 ] - pts[ i ][ 1 ] ) ), all = L.reduce( ( a, b ) => a + b, 0 );
		let d = f * all, i = 0;
		while ( i < L.length - 1 && d > L[ i ] ) d -= L[ i ++ ];
		const t = Math.min( 1, d / L[ i ] );
		return new Vector3( pts[ i ][ 0 ] + ( pts[ i + 1 ][ 0 ] - pts[ i ][ 0 ] ) * t, 0, pts[ i ][ 1 ] + ( pts[ i + 1 ][ 1 ] - pts[ i ][ 1 ] ) * t );

	};

	let through = 0, jump = 0, worst = 0, deepest = 0;
	for ( const berth of taken ) for ( const way of ways ) {

		const from = { x: 64.5, z: 36.5 }, out = new Vector3(), at = new Vector3(), prev = new Vector3(), pts = [ [ from.x, from.z ], ...way ];
		const [ ex, ez ] = way.at( - 1 );
		for ( let i = 0; i <= 800; i ++ ) {

			const p = along( pts, i / 800 );
			const k = B.berthShare( Math.hypot( p.x - from.x, p.z - from.z ) );
			if ( k <= 0 ) break;
			B.laidAt( at, p, from, berth, 0, 1, B.SWING );
			B.leaving( out, at, p, berth, S, k );
			const h = { x0: out.x - S.beam / 2 + 0.05, x1: out.x + S.beam / 2 - 0.05, z0: out.z - S.length / 2 + 0.05, z1: out.z + S.length / 2 - 0.05 };
			const into = ( b ) => over( h, b ) ? Math.min( h.x1 - b.x0, b.x1 - h.x0, h.z1 - b.z0, b.z1 - h.z0 ) : 0;
			const pen = Math.max( into( HEAD ), into( STEM ) );
			if ( pen > 0 ) {

				through ++;
				deepest = Math.max( deepest, pen );
				if ( through < 4 ) console.log( '     into', berth.side, berth.z.toFixed( 1 ), ex, ez, i, k.toFixed( 3 ), out.x.toFixed( 2 ), out.z.toFixed( 2 ), pen.toFixed( 2 ) );

			}
			if ( i > 0 ) {

				const d = out.distanceTo( prev );
				worst = Math.max( worst, d );
				if ( d > 1.5 ) {

					jump ++;
					if ( jump < 6 ) console.log( '     jump', berth.side, berth.z.toFixed( 1 ), ex, ez, i, k.toFixed( 3 ), prev.x.toFixed( 2 ), prev.z.toFixed( 2 ), '->', out.x.toFixed( 2 ), out.z.toFixed( 2 ) );

				}

			}

			prev.copy( out );

		}

	}

	ok( through === 0 && jump === 0, `four lobster boats leaving the stem's berths for five places: never in the head or the stem (${ through }), no jump (most a step ${ worst.toFixed( 2 ) } m, her owner's about 0.1)` );
	const at = new Vector3( 1, 2, 3 ), out = new Vector3();
	B.leaving( out, at, new Vector3( 64.5, 0, 36.5 ), taken[ 0 ], S, 1 );
	ok( out.x === 1 && out.z === 3, 'at her berth, laid at it' );

}

// ---- (10) the console's ladder in her fit; what's walked stays as she's fitted
{

	const F = { twin: true, tTop: true, diveLadder: true, tankRack: false };
	const up = fitWire( 'console', F, 'red' ), down = fitWire( 'console', F, 'red', { ladderDown: true } );
	ok( up !== down && fitStats( 'console', down ).ladderDown === true && ! fitStats( 'console', up ).ladderDown, 'her ladder down is one more bit in her fit' );
	ok( fitPaint( up ) === fitPaint( down ) && fitPaint( up ) !== null, 'and her paint reads the same either way' );
	ok( fitWire( 'sportfisher', { tower: true }, null, { ladderDown: true } ) === fitWire( 'sportfisher', { tower: true }, null ), 'a boat without a folding ladder has no such bit' );
	ok( fitWire( 'console', { ...F, diveLadder: false }, null, { ladderDown: false } ) === fitWire( 'console', { ...F, diveLadder: false }, null ), 'with none fitted, none down' );
	const own = await loadBoat( 'lobster' ), scene = new Scene();
	const app = { tier: 'high', boat: own, scene, localLights: { add: () => ( {} ), remove() {} }, instruments: null };
	const c = new BoatCopies( app ), e = c.want( 'console' );
	for ( let i = 0; i < 400 && ! e.model; i ++ ) await new Promise( ( r ) => setTimeout( r, 5 ) );
	ok( c.walked( e.model, 'console', up ) === c.walked( e.model, 'console', down ), 'whoever\'s aboard walks the same of her, ladder up or down: her colliders keyed on her fit, not on it' );
	const b = c.make( 'console' ), fit = () => b.getObjectByName( 'boat-fittings' ).geometry;
	c.dress( b, up );
	const g1 = fit(), n1 = g1.drawRange.count;
	c.dress( b, down );
	const g2 = fit(), n2 = g2.drawRange.count;
	c.dress( b, up );
	ok( g1 !== g2 && n1 !== n2 && fit() === g1, `her copy folds her ladder down as her owner's game does (${ n1 } and ${ n2 } of her fittings' indices), each way made once` );
	const m = e.model;
	m.setLadder( true );
	ok( m.fitNow().ladderDown === true, 'her owner\'s game says so' );
	m.setLadder( false );
	ok( m.fitNow().ladderDown === false, 'and up again' );
	// (11) from the water, at her ladder: its own reach, its own words
	const w = c.walked( m, 'console', up ), from = w.boardFrom( 'swim' ), none = c.walked( m, 'console', fitWire( 'console', { ...F, diveLadder: false } ) ).boardFrom( 'swim' );
	ok( from.text === 'Climb the ladder' && from.reach < 4.2 && none.text !== from.text && w.boardFrom( 'walk' ) === null, `boarding her from the water: "${ from.text }" within ${ from.reach } m of it; with no ladder "${ none.text }"` );
	c.drop( b );
	own.dispose();

}

// ---- (8) a speck's height is her fit's
{

	const tower = fitWire( 'sportfisher', { tower: true, outriggers: true, chair: true } ), bare = fitWire( 'sportfisher', { tower: false, outriggers: true, chair: true } );
	ok( airOf( 'sportfisher', tower ) === 11 && airOf( 'sportfisher', bare ) === SIZE.sportfisher.bare && airOf( 'sportfisher', null ) === 11, `a sportfisher's ${ airOf( 'sportfisher', tower ) } m with her tower, ${ airOf( 'sportfisher', bare ) } without` );
	ok( airOf( 'console', fitWire( 'console', { tTop: false } ) ) === SIZE.console.bare && airOf( 'console', fitWire( 'console', { tTop: true } ) ) === SIZE.console.air && airOf( 'lobster', 0 ) === SIZE.lobster.air, 'a console\'s by her T-top; a lobster boat\'s her own' );
	const far = ( air ) => {

		let d = 0;
		for ( let x = 1000; x < 40000; x += 100 ) if ( seenHeight( x, 2.3, air ) > 0 ) d = x;
		return d;

	};

	ok( far( airOf( 'sportfisher', bare ) ) < far( airOf( 'sportfisher', tower ) ) - 3000, `over the horizon from a deck: ${ ( far( airOf( 'sportfisher', tower ) ) / 1000 ).toFixed( 1 ) } km with her tower, ${ ( far( airOf( 'sportfisher', bare ) ) / 1000 ).toFixed( 1 ) } without` );
	const top = ( g ) => ( g.computeBoundingBox(), g.boundingBox.max.y );
	ok( bareOf( 'sportfisher', bare ) && ! bareOf( 'sportfisher', tower ) && top( standInGeometry( 'sportfisher', true ) ) < SIZE.sportfisher.bare + 0.1 && top( standInGeometry( 'sportfisher' ) ) > 10, `and her stand-in, ${ top( standInGeometry( 'sportfisher', true ) ).toFixed( 1 ) } m high without it` );

}

// ---- (12) the chair's whoever's sat in it
{

	const m = await loadBoat( 'sportfisher' ), S = m.stations, at = new Vector3( S.chair.x, S.chair.y, S.chair.z );
	ok( jobAt( m, 'deck', at, null ) === null && jobAt( m, 'deck', at, m.chair ) === 'chair', 'standing at the chair isn\'t sitting in it; strapped in is' );
	ok( jobAt( m, 'deck', new Vector3( S.tower.x, S.tower.y, S.tower.z ), null ) === 'tower', 'the tower\'s still by where you stand' );
	m.dispose();

}

// ---- (4) a guest's catch in her box: main's v2.3.0 (together/SharedBox.js, test/shared-box.mjs), in place of M17's fish too
// big for a guest's own hold in hers. Here only that her box decides the room, riding along
{

	const st = new GameState();
	st.save = () => {};
	const cooler = st.stats.holdKg; // (a new game's: the kayak's)
	const her = ( others ) => () => ( { cap: 300, ice: 0, melt: 0, makes: 0, others, word: 'hold', whose: 'Robin', by: [] } );
	st.boxIs = her( 40 );
	const tuna = st.addFish( 'yellowfin', 42, 10 );
	ok( tuna && st.lastCatch.kept && st.holdKg === 42 && st.log.yellowfin, `a 42 kg tuna caught aboard Robin's boat, too big for your ${ cooler } kg cooler: in her hold, and still yours` );
	st.boxIs = her( 250 );
	ok( st.addFish( 'yellowfin', 30, 10 ) === null && ! st.lastCatch.kept, 'and when her hold\'s full, it\'s let go' );
	st.boxIs = null;
	ok( st.addFish( 'yellowfin', 35, 10 ) === null, 'off her, your own cooler again' );

}

// ---- (3) Marta's tray, from the group's save
{

	const t = Object.create( Together.prototype );
	t._setTray( { who: 'Robin', id: 'robin-1', day: 4, at: 1 } );
	ok( t.tray && t.tray.who === 'Robin' && t.tray.day === 4, 'the group\'s tray: whose set, laid out since when' );
	t._setTray( { who: 3 } );
	ok( t.tray === null, 'and nothing from a record that isn\'t one' );

}

// ---- (7) Pearl's berth: anyone's boat stopped in it
{

	const t = Object.create( Together.prototype ), at = new Vector3( 114, 0, - 880 );
	const o = { cur: { boat: { pos: at, quat: null }, drawn: null, mode: 'deck', bv: 0 }, boatSpeed: 0 };
	t.others = new Map( [ [ 'sam', o ] ] );
	t.away = new Map();
	ok( t.stoppedNear( 114.3, - 880, 7 ) === at, 'someone else\'s boat stopped in her berth is seen there' );
	o.cur.mode = 'helm';
	o.cur.bv = 6;
	ok( t.stoppedNear( 114.3, - 880, 7 ) === null, 'one going by isn\'t' );
	o.cur.bv = 0;
	o.cur.boat.pos = new Vector3( 140, 0, - 880 );
	ok( t.stoppedNear( 114.3, - 880, 7 ) === null, 'nor one elsewhere' );
	t.others = new Map();
	t.away = new Map( [ [ 'alex', { r: { a: [ 116, - 878 ], tow: null }, boat: null } ] ] );
	ok( !! t.stoppedNear( 114.3, - 880, 7 ), 'and one whose owner\'s away, anchored in it' );

}

// ---- (13) a slow game: her time kept with the water's
{

	const A = 0.6, period = 9, sea = ( x, z, t ) => A * Math.sin( 2 * Math.PI * t / period ) + 0.08 * Math.sin( 0.05 * x + 0.03 * z );
	const run = ( catchUp ) => {

		G.time.value = 0;
		G.seaLevel.value = 0;
		const query = new WaterQuery( { heightAt: sea } );
		const b = new BoatController( { model: models.lobster, query, terrain: { heightAt: () => - 50 }, colliders: null } );
		b.position.set( 0, 0, 0 );
		const frame = 1 / 3, ys = [];
		for ( let i = 0; i < 180; i ++ ) {

			G.time.value += frame; // (the waves by the wall clock, as in company)
			if ( catchUp ) b.catchUp( frame );
			else b.update( 0.1 );
			b.queueQueries();
			query.update();
			if ( i > 60 ) ys.push( [ b.position.y, sea( b.position.x, b.position.z, G.time.value ) ] );

		}

		const m = ( k ) => ys.reduce( ( s, y ) => s + y[ k ], 0 ) / ys.length, my = m( 0 ), mw = m( 1 );
		let c = 0, vy = 0, vw = 0;
		for ( const [ y, w ] of ys ) {

			c += ( y - my ) * ( w - mw );
			vy += ( y - my ) ** 2;
			vw += ( w - mw ) ** 2;

		}

		return { corr: c / Math.sqrt( vy * vw ), amp: Math.sqrt( vy / vw ) };

	};

	const models = { lobster: await loadBoat( 'lobster' ) };
	const kept = run( true ), capped = run( false );
	ok( kept.corr > 0.95 && Math.abs( kept.amp - 1 ) < 0.25 && kept.corr > capped.corr + 0.05, `at 3 fps on a ${ period } s swell, she rises and falls with it: ${ kept.corr.toFixed( 2 ) } with it, ${ kept.amp.toFixed( 2 ) } of its height (stopped at 0.1 s a frame: ${ capped.corr.toFixed( 2 ) }, ${ capped.amp.toFixed( 2 ) })` );
	models.lobster.dispose();

}

console.log( bad ? `\n${ bad } FAILED` : '\nall ok' );
process.exit( bad ? 1 : 0 );
