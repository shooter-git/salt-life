// (M17) Coming back, the lobster boat's way up and the small things (docs/m17/back.md), in plain Node with the real Player and boats:
// where you stood, through a save and a load, in each boat; in the water by her; aboard someone else's; the kayak at anchor with you
// in her; her side decks, her roof and her anchor at the bow; a twin's burn; the plotter's range; a sea coming aboard; trap bait.
//   node test/back.mjs
import { register } from 'node:module';
register( 'data:text/javascript,' + encodeURIComponent( `
export async function resolve( specifier, context, next ) {
	if ( specifier === '@allthespaces/portal/three' ) return { url: 'data:text/javascript,export const gltfLoader = {};', shortCircuit: true };
	return next( specifier, context );
}` ) );
globalThis.window = globalThis.window || { devicePixelRatio: 1, addEventListener() {} };
globalThis.document = globalThis.document || { createElement: () => ( { style: {}, getContext: () => null } ) };

const { PerspectiveCamera, Vector3 } = await import( '../src/engine/index.js' );
const { BoatModel } = await import( '../src/world/BoatModel.js' );
const { ConsoleModel } = await import( '../src/world/boat/console/ConsoleModel.js' );
const { SportfisherModel } = await import( '../src/world/boat/sportfisher/SportfisherModel.js' );
const { KayakModel } = await import( '../src/world/boat/kayak/KayakModel.js' );
const { SF } = await import( '../src/world/boat/sportfisher/SportfisherLines.js' );
const { WAY_UP } = await import( '../src/world/boat/DeckGear.js' );
const { BoatController } = await import( '../src/player/BoatController.js' );
const { Player } = await import( '../src/player/Player.js' );
const { BESIDE_M, SWIM_NEAR, besideHer, boatLeft, intoWater, leftOf, standBack, stoodOf, swimBy } = await import( '../src/game/Away.js' );
const { Game } = await import( '../src/game/Game.js' );
const { fuelBurn } = await import( '../src/game/Gear.js' );
const { fuelFor } = await import( '../src/game/Chart.js' );
const { burnOf } = await import( '../src/game/Seaworthy.js' );
const { PLOTTER_NM, nextRange, rangeSaid } = await import( '../src/world/boat/Instruments.js' );
const { offers } = await import( '../src/ui/Actions.js' );
const { ACTION_ICON, ICONS, promptIcon } = await import( '../src/ui/ActionIcons.js' );
const { BreakingSeas, seaAboardSaid } = await import( '../src/game/BreakingSeas.js' );
const { BAIT, SOAK, baitSaid, buyBait, cleanTraps, haulOf, meanCatch, newTraps, soakOf } = await import( '../src/game/Traps.js' );
const { TrapWork } = await import( '../src/game/TrapWork.js' );
const { stackedOn } = await import( '../src/game/TrapWork.js' );

let failed = 0;
const ok = ( c, what ) => {

	console.log( ( c ? 'ok   ' : 'FAIL ' ) + what );
	if ( ! c ) failed ++;

};

// ---- a boat and someone aboard her, as the game has them
const held = new Set(), hits = new Set();
const input = { down: ( k ) => held.has( k ), hit: ( k ) => hits.delete( k ), consumeLook: () => ( { x: 0, y: 0 } ), consumeWheel: () => 0, move: null };
const query = () => ( { latency: 0.05, allocate: () => 0, setPoint() {}, cpuValid: true, version: 0, resultTime: 0, cpu: new Float32Array( 4096 ), resultInputs: new Float64Array( 4096 ) } );
const aboard = ( model ) => {

	const q = query(), boat = new BoatController( { model, query: q, terrain: { heightAt: () => - 50 }, colliders: null } );
	boat.position.set( 3000, 0, 3000 );
	const p = new Player( { camera: new PerspectiveCamera(), input, terrain: { heightAt: () => - 50 }, colliders: { groundHeightAt: () => - Infinity, resolveCapsule() {} }, query: q, boat } );
	return { boat, p };

};
const settle = ( p, n = 20, dt = 1 / 60 ) => {

	for ( let i = 0; i < n; i ++ ) p.update( dt );

};
// where on her you are, there: the save written and read back, then a new game's you put back there
const roundTrip = ( model, at, look = 0.7 ) => {

	const A = aboard( model );
	A.p.boardBoat();
	A.p.deckPos.set( ...at );
	A.p.deckYaw = look;
	settle( A.p );
	const was = A.p.deckPos.clone(), on = stoodOf( A.p );
	const text = JSON.stringify( boatLeft( { x: 3000, z: 3000, heading: 0, anchor: null, moored: false, aboard: 'deck', on, T: 50, at: 1 } ) );
	const left = leftOf( text ), B = aboard( model );
	B.p.boardBoat();
	const there = standBack( B.p, left.on, model );
	settle( B.p, 30 );
	return { was, now: B.p.deckPos.clone(), there, look: B.p.deckYaw, text, left };

};
const near = ( a, b, m = 0.08 ) => Math.hypot( a.x - b.x, a.y - b.y, a.z - b.z ) <= m;
const v3 = ( v ) => `(${ v.x.toFixed( 2 ) }, ${ v.y.toFixed( 2 ) }, ${ v.z.toFixed( 2 ) })`;

// ---- where you stood, through a save and a load
{

	const lobster = new BoatModel(), sf = new SportfisherModel( 'low' ), con = new ConsoleModel();
	const L = lobster.lines;
	const places = [
		[ lobster, 'the lobster boat\'s cockpit', [ 0.2, L.deckY, - 2.2 ] ],
		[ lobster, 'her wheelhouse, on the bench', [ 0.86, 0.82, 0.45 ] ],
		[ lobster, 'her port side deck, by the house', [ 1.31, 1.16, 0.3 ] ],
		[ lobster, 'her foredeck', [ 0.2, 1.45, 2.8 ] ],
		[ lobster, 'her bow, by the anchor', [ 0, 1.57, 3.75 ] ],
		[ lobster, 'her roof', [ - 0.4, 2.41, 0.5 ] ],
		[ sf, 'the sportfisher\'s cockpit', [ 0, SF.cockpit, - 3.75 ] ],
		[ sf, 'her salon', [ 0, SF.salon, - 0.5 ] ],
		[ sf, 'her guest cabin', [ sf.bunks[ 0 ].x, sf.bunks[ 0 ].y, sf.bunks[ 0 ].z ] ],
		[ sf, 'her bridge', [ 0, SF.bridge, - 2.6 ] ],
		[ sf, 'her tower', [ sf.stations.tower.x, sf.stations.tower.y, sf.stations.tower.z ] ],
		[ con, 'the console\'s deck', [ 0.3, con.lines.deckY, - 1.5 ] ],
	];
	for ( const [ model, name, at ] of places ) {

		const r = roundTrip( model, at );
		ok( r.there && near( r.now, r.was ) && Math.abs( r.look - 0.7 ) < 0.01, `${ name }: back where you stood, ${ v3( r.was ) } -> ${ v3( r.now ) }` );

	}

	const r = roundTrip( lobster, [ 0.2, L.deckY, - 2.2 ] );
	ok( /"on":\[0\.2,0\.35,-2\.2,0\.7\]/.test( r.text ), `the save keeps it: ${ r.text.match( /"on":\[[^\]]*\]/ )[ 0 ] }` );

	// part way up a ladder: at its foot or its head, whichever's nearer
	const A = aboard( sf );
	A.p.boardBoat();
	const ladder = sf.ladders[ 0 ];
	A.p.climbing = { ladder, s: 0.8 * ladder.foot.distanceTo( ladder.head ), len: ladder.foot.distanceTo( ladder.head ) };
	A.p.mode = 'deck';
	let on = stoodOf( A.p );
	ok( Math.abs( on[ 1 ] - ladder.off.y ) < 0.01, `most of the way up the bridge's ladder: at its head (y ${ on[ 1 ] })` );
	A.p.climbing.s = 0.2 * A.p.climbing.len;
	on = stoodOf( A.p );
	ok( Math.abs( on[ 1 ] - ladder.on.y ) < 0.01, `a little way up: at its foot (y ${ on[ 1 ] })` );
	A.p.climbing = null;

	// strapped in the chair: you come back standing at it (no fish on when you're back)
	A.p.chair = sf.chair;
	A.p.deckPos.set( sf.chair.eye.x, sf.chair.eye.y - 1.62, sf.chair.eye.z );
	on = stoodOf( A.p );
	A.p.chair = null;
	const B = aboard( sf );
	B.p.boardBoat();
	standBack( B.p, on, sf );
	settle( B.p, 30 );
	const c = sf.stations.chair, d = Math.hypot( B.p.deckPos.x - c.x, B.p.deckPos.z - c.z );
	ok( Math.abs( B.p.deckPos.y - SF.cockpit ) < 0.05 && d < 1.2 && ! B.p.chair, `strapped in the chair: back on her cockpit's sole by it (${ d.toFixed( 2 ) } m), not in it` );

	// somewhere she's not got any more: where she's boarded
	const C = aboard( lobster );
	C.p.boardBoat();
	ok( ! standBack( C.p, [ 0, 6, 9, 0 ], lobster ) && near( C.p.deckPos, lobster.boardPoint, 0.01 ), 'a place she hasn\'t: where she\'s boarded' );

	// her upper helm, and none of it from an old save
	const up = leftOf( JSON.stringify( boatLeft( { x: 1, z: 2, heading: 0, anchor: null, moored: false, aboard: 'helm', helm: 'upper', T: 3, at: 4 } ) ) );
	ok( up.aboard === 'helm' && up.helm === 'upper' && up.on === null, 'at her upper helm: so' );
	const old = leftOf( '{"v":1,"x":1,"z":2,"T":3,"aboard":"deck"}' );
	ok( old.aboard === 'deck' && old.on === null && old.swim === null && old.ride === null && old.helm === null, 'a save from before: aboard, put where she\'s boarded as before' );
	const bad = leftOf( '{"v":1,"x":1,"z":2,"T":3,"aboard":"deck","on":[1,"x",3,0],"swim":[1,2],"ride":{"o":"","b":"x","x":1,"z":2}}' );
	ok( bad.on === null && bad.swim === null && bad.ride === null, 'nonsense in it: none of it (and no swim while aboard)' );

}

// ---- in the water by her
{

	const A = aboard( new BoatModel() ), p = A.p, b = A.boat;
	b.moored = b.beached = false; // (out on the sea)
	p.mode = 'swim';
	p.position.set( 3010, - 0.2, 2992 );
	const s = swimBy( p, b );
	ok( s && Math.abs( s[ 0 ] - 10 ) < 1e-9 && Math.abs( s[ 1 ] + 8 ) < 1e-9, `in the water 12.8 m off her: kept (${ s })` );
	const rec = leftOf( JSON.stringify( boatLeft( { x: 3000, z: 3000, heading: 0.4, anchor: { x: 3002, z: 3001 }, moored: false, aboard: null, swim: s, T: 3, at: 4 } ) ) );
	ok( rec.swim && rec.swim[ 0 ] === 10 && rec.swim[ 1 ] === - 8, 'through the save' );
	let at = besideHer( 3100, 3050, 0.4, rec.swim );
	ok( Math.abs( at.x - 3110 ) < 1e-9 && Math.abs( at.z - 3042 ) < 1e-9, 'back where you were by her, wherever she\'s drifted to' );
	at = besideHer( 3100, 3050, 0, [ 120, 40 ] );
	ok( Math.hypot( at.x - 3100, at.z - 3050 ) < 4 && Math.hypot( at.x - 3100, at.z - 3050 ) > 2, `further off than ${ BESIDE_M } m: at her side (${ Math.hypot( at.x - 3100, at.z - 3050 ).toFixed( 1 ) } m)` );
	intoWater( p, at, - 8, 0.3 );
	ok( p.mode === 'swim' && Math.abs( p.position.y - 0.1 ) < 1e-9, 'in the water, at the sea\'s level' );
	intoWater( p, at, 1.2, 0.3 );
	ok( p.mode === 'walk' && p.position.y === 1.2, 'she\'s gone ashore: on the shore by her' );
	p.mode = 'swim';
	p.position.set( 3000 + SWIM_NEAR + 5, 0, 3000 );
	ok( swimBy( p, b ) === null, `further than ${ SWIM_NEAR } m from her: you'd left her (ashore, as before)` );
	p.position.set( 3005, 0, 3000 );
	b.moored = true;
	ok( swimBy( p, b ) === null, 'she\'s at her berth: ashore, as before' );

}

// ---- aboard someone else's
{

	const r = { o: 'robin-1', b: 'lobster', x: 1234.567, z: - 88.12, on: [ 1.31, 1.16, 0.3, 0.2 ], helm: false };
	const rec = leftOf( JSON.stringify( boatLeft( { x: 1, z: 2, heading: 0, anchor: null, moored: true, aboard: null, ride: r, T: 3, at: 4 } ) ) );
	ok( rec.ride && rec.ride.o === 'robin-1' && rec.ride.b === 'lobster' && rec.ride.x === 1234.6 && rec.ride.on[ 0 ] === 1.31 && ! rec.ride.swim, `aboard Robin's lobster boat, on her side deck: through the save (${ JSON.stringify( rec.ride ) })` );
	const sw = leftOf( JSON.stringify( boatLeft( { x: 1, z: 2, heading: 0, anchor: null, moored: true, aboard: null, ride: { o: 'sam-1', b: 'console', x: 5, z: 6, swim: [ 3, - 4 ] }, T: 3, at: 4 } ) ) );
	ok( sw.ride && sw.ride.swim && sw.ride.swim[ 1 ] === - 4 && ! sw.ride.on, 'in the water by Sam\'s console: through the save' );

}

// (its methods each once in Together: a second ridden() of the same name, the boat you're riding, had replaced the first)
{

	const { readFileSync } = await import( 'node:fs' );
	const src = readFileSync( new URL( '../src/together/Together.js', import.meta.url ), 'utf8' );
	const once = ( name ) => ( src.match( new RegExp( `\\n\\t${ name }\\(`, 'g' ) ) || [] ).length;
	ok( once( 'rideLeft' ) === 1 && once( 'rejoin' ) === 1 && once( '_rejoinStep' ) === 1 && once( '_boardable' ) === 1 && once( 'ridden' ) === 1, 'Together: rideLeft, rejoin and theirs each defined once, beside ridden() (the boat you ride, for her dash)' );

}

// ---- the kayak at anchor with you in her: put back in her seat isn't taking her helm (App.pickUp, Game.updateAnchor)
{

	const kayak = new KayakModel(), A = aboard( kayak ), b = A.boat;
	b.anchor = new Vector3( 3001, - 3, 3000 );
	const toasts = [];
	const g = {
		app: { boatCtl: b, boat: kayak }, state: { stats: { anchorM: 10 } }, rigs: { linesOut: false }, toast: ( t ) => toasts.push( t ),
		rode: { visible: false, material: { uniforms: { lineA: { value: new Vector3() } } } }, layRode() {}, daysOut: { sockPoint: ( v ) => v },
	};
	A.p.boardBoat();
	ok( A.p.mode === 'boat' && b.driven, 'back in her seat' );
	g._wasDriven = b.driven; // (as App.pickUp has it)
	Game.prototype.updateAnchor.call( g, b.driven && ! g._wasDriven, ! b.driven && g._wasDriven );
	ok( !! b.anchor && ! toasts.length, 'her anchor\'s still down' );
	g._wasDriven = false; // (as it was: a fresh game's)
	Game.prototype.updateAnchor.call( g, b.driven && ! g._wasDriven, ! b.driven && g._wasDriven );
	ok( ! b.anchor && toasts[ 0 ] === 'Anchor up', 'without it, it was taken for taking her helm: anchor up' );

}

// ---- the lobster boat's way forward and up, walked by the real Player
{

	const model = new BoatModel();
	for ( const fps of [ 60, 10 ] ) {

		const { p } = aboard( model ), dt = 1 / fps;
		p.boardBoat();
		const walkTo = ( x, z, secs = 5 ) => {

			held.add( 'KeyW' );
			for ( let i = 0; i < secs * fps; i ++ ) {

				p.deckYaw = Math.atan2( x - p.deckPos.x, z - p.deckPos.z );
				p.update( dt );
				if ( Math.hypot( x - p.deckPos.x, z - p.deckPos.z ) < 0.06 ) break;

			}

			held.clear();
			for ( let i = 0; i < fps / 4; i ++ ) p.update( dt );
			return p.deckPos.clone();

		};

		p.deckPos.set( 0.3, model.lines.deckY, - 1.6 );
		walkTo( 0.9, - 0.6 );
		walkTo( 1.15, - 0.6 );
		const wash = walkTo( 1.33, - 0.6 );
		ok( wash.y > 1.08, `${ fps } fps: up her steps to her washboard (y ${ wash.y.toFixed( 2 ) })` );
		const side = walkTo( 1.3, 0.6 );
		ok( side.x > 1.2 && side.y > 1.1 && side.y < 1.25, `along her side deck past the house ${ v3( side ) }` );
		walkTo( 1.2, 1.4 );
		walkTo( 0.9, 1.9 );
		const bow = walkTo( 0, 3.7 );
		ok( bow.z > 3.5 && bow.y > 1.5, `to her bow ${ v3( bow ) }` );
		walkTo( 1.1, 1.8 );
		walkTo( 1.25, 1.2 );
		const foot = walkTo( 1.31, 0.1 );
		const at = model.ladderAt( foot );
		ok( at && ! at.top && p.prompt && p.prompt.text === 'Climb onto her roof', `back along her side deck, at the fold-down steps: "${ p.prompt && p.prompt.text }"` );
		hits.add( 'KeyE' );
		p.update( dt );
		held.add( 'KeyW' );
		for ( let i = 0; i < 8 * fps && p.climbing; i ++ ) p.update( dt );
		held.clear();
		settle( p, fps / 2, dt );
		const eye = p.camera.position.y - p.boat.position.y;
		ok( Math.abs( p.deckPos.y - 2.41 ) < 0.02 && eye > 3.8 && eye < 4.2, `up on her roof, your eye ${ eye.toFixed( 2 ) } m over her waterline (her roofEye ${ model.roofEye.toFixed( 2 ) }; Sight's guide for a roof, 3.8)` );
		const across = walkTo( - 0.9, 0.4 );
		ok( Math.abs( across.y - 2.41 ) < 0.02, `about her roof ${ v3( across ) }` );
		walkTo( 0.95, - 0.1 );
		ok( p.prompt && p.prompt.text === 'Climb down to her side deck', 'and down again' );
		hits.add( 'KeyE' );
		p.update( dt );
		held.add( 'KeyS' );
		for ( let i = 0; i < 8 * fps && p.climbing; i ++ ) p.update( dt );
		held.clear();
		settle( p, fps / 2, dt );
		walkTo( 1.33, - 0.6 );
		walkTo( 0.9, - 0.6 );
		const home = walkTo( 0.3, - 1.6 );
		ok( Math.abs( home.y - model.lines.deckY ) < 0.01, `back down the steps to her cockpit ${ v3( home ) }` );

	}

	// a guest walks her as her copy has her: her side decks and her climb are theirs too, her traps stacked or not
	const view = model.walkedAs(), stacked = stackedOn( view, 4 );
	ok( view.colliders.some( ( c ) => c.tag === 'sideDeck' ) && stacked.colliders.some( ( c ) => c.tag === 'sideDeck' ) && stacked.colliders.some( ( c ) => c.tag === 'trap' ) && stacked.ladderAt === model.ladderAt, 'on her copy: her side decks and her climb, with her traps stacked too' );

	// her stowed anchor off her roller while it's down
	const g = model.meshes.fittings.geometry, all = g.index.count;
	model.setAnchorStowed( false );
	const down = g.drawRange.count;
	model.setAnchorStowed( true );
	ok( down < all && down > all - 2000 && g.drawRange.count === Infinity, `her stowed anchor's ${ all - down } indices, not drawn while it's down` );

}

// ---- her anchor worked at her bow (Game.updateBow)
{

	const model = new BoatModel(), { boat, p } = aboard( model ), toasts = [], dropped = [];
	boat.moored = false;
	const g = { app: { boatCtl: boat }, state: { stats: { anchorM: 20 } }, toast: ( t ) => toasts.push( t ), dropAnchor: () => {

		dropped.push( 1 );
		boat.anchor = new Vector3( 3000, - 8, 3004 );

	} };
	p.boardBoat();
	const bow = ( x, z ) => {

		p.prompt = null;
		p.deckPos.set( x, 1.57, z );
		Game.prototype.updateBow.call( g, input, p );
		return p.prompt && p.prompt.text;

	};
	ok( bow( 0, WAY_UP.bow ) === 'Let go the anchor' && p.anchorWork, 'at her bow: "Let go the anchor" (and the rail\'s "Jump overboard" makes way)' );
	hits.add( 'KeyE' );
	bow( 0, WAY_UP.bow );
	ok( dropped.length === 1 && boat.anchor, 'E: it\'s let go' );
	ok( bow( 0.2, WAY_UP.bow + 0.1 ) === 'Get the anchor up', 'with it down: "Get the anchor up"' );
	hits.add( 'KeyE' );
	bow( 0.2, WAY_UP.bow );
	ok( ! boat.anchor && /Anchor up/.test( toasts.at( - 1 ) ), `E: up, and she's adrift ("${ toasts.at( - 1 ) }")` );
	ok( ! bow( 0, 1.0 ) && ! p.anchorWork, 'aft of her foredeck: nothing' );
	boat.speed = 4;
	ok( /slow down/.test( bow( 0, WAY_UP.bow ) ), 'under way: she\'s to slow down' );
	boat.speed = 0;
	g.state.stats.anchorM = 0;
	ok( /No anchor/.test( bow( 0, WAY_UP.bow ) ), 'with no anchor bought: Marta sells one' );
	p.riding = true;
	ok( ! bow( 0, WAY_UP.bow ), 'aboard someone else\'s: hers to anchor, not yours' );
	ok( promptIcon( 'Let go the anchor' ) === 'anchor' && promptIcon( 'Get the anchor up' ) === 'anchor' && promptIcon( 'Climb onto her roof' ) === 'ladder', 'their pictures: the anchor, and the ladder up' );

}

// ---- a twin console burns as twins do (Yamaha's bulletins: a 21 ft boat on one F150, the Regulator 23 on two)
{

	const gph = ( l ) => l * 3600 / 3.78541, at = ( rpm ) => rpm / 6000;
	const single = { 1000: 0.8, 4000: 6.5, 5900: 16.1 }, twin = { 1000: 1.6, 4000: 13.9, 5900: 31.4 };
	for ( const [ rpm, want ] of Object.entries( single ) ) {

		const got = gph( fuelBurn( at( rpm ), 'console' ) );
		ok( Math.abs( got - want ) / want < ( rpm === '1000' ? 0.6 : 0.15 ), `one 150 at ${ rpm } rpm: ${ got.toFixed( 1 ) } gal an hour (Yamaha's ${ want })` );

	}

	for ( const [ rpm, want ] of Object.entries( twin ) ) {

		const got = gph( fuelBurn( at( rpm ), 'console', true ) );
		ok( Math.abs( got - want ) / want < ( rpm === '1000' ? 0.6 : 0.15 ), `two at ${ rpm } rpm: ${ got.toFixed( 1 ) } gal an hour (Yamaha's ${ want })` );

	}

	const r = fuelBurn( 0.7, 'console', true ) / fuelBurn( 0.7, 'console' );
	ok( r > 1.9 && r < 2.1, `two burn ${ r.toFixed( 2 ) } times one at the same revs` );
	ok( fuelBurn( 0.7, 'lobster', true ) === fuelBurn( 0.7, 'lobster' ) && burnOf( 'sportfisher', true ) === burnOf( 'sportfisher' ), 'a boat with no twin to fit burns as she does' );
	const one = fuelFor( 10000, 100, { boat: 'console' } ).litres, two = fuelFor( 10000, 100, { boat: 'console', speedMul: 1.25, twin: true } ).litres;
	ok( two / one > 1.5 && two / one < 1.7, `home 10 km off at her cruise: ${ one.toFixed( 1 ) } L on one, ${ two.toFixed( 1 ) } L on two (quicker, at twice the burn)` );

}

// ---- the plotter's range, by its key and the actions wheel
{

	let s = - 1;
	const seen = [];
	for ( let i = 0; i <= PLOTTER_NM.length; i ++ ) seen.push( s = nextRange( s ) );
	ok( seen.join() === [ ...PLOTTER_NM.keys(), - 1 ].join(), `Z steps it out, a range at a time, then back to its own pick (${ seen.join( ' ' ) })` );
	ok( rangeSaid( - 1 ) === 'Plotter range: auto' && rangeSaid( 2 ) === 'Plotter range: 1.5 NM across' && /ft across/.test( rangeSaid( 0 ) ), `said: "${ rangeSaid( 0 ) }", "${ rangeSaid( 2 ) }"` );
	const pl = ( extra ) => ( { mode: 'boat', prompt: null, riding: false, boat: { model: { seated: false } }, ...extra } );
	const gm = ( plotter ) => ( { rod: { equipped: false, state: 'idle' }, gun: { equipped: false }, tools: { equipped: false }, net: { equipped: false, busy: false }, canFish: true, rigs: { linesOut: false, rodOn: false }, state: { stats: { plotter, leader: 0 } }, hud: {}, radio: { offer: null }, guide: { open: false }, app: { localLights: { flashlight: { on: false } } } } );
	ok( offers( pl(), gm( true ) ).plotter === 'Plotter range' && ACTION_ICON[ 'Plotter range' ] === 'plotter' && ICONS.plotter, 'at her helm, with a plotter: in the actions wheel, with its picture' );
	ok( ! offers( pl(), gm( false ) ).plotter && ! offers( pl( { riding: true } ), gm( true ) ).plotter && ! offers( pl( { mode: 'deck' } ), gm( true ) ).plotter, 'not without one, not at someone else\'s, not off her helm' );

}

// ---- a sea comes aboard: said
{

	ok( seaAboardSaid( 'lobster', 64, 64 ) === 'A sea came over her rail · 17 gal of it in her bilge', `the lobster boat: "${ seaAboardSaid( 'lobster', 64, 64 ) }"` );
	ok( /, 53 now$/.test( seaAboardSaid( 'lobster', 64, 200 ) ), `and what's in her now: "${ seaAboardSaid( 'lobster', 64, 200 ) }"` );
	ok( seaAboardSaid( 'console', 0.2, 0 ) === 'A sea came over her bow · her scuppers cleared it', `the console, her deck draining: "${ seaAboardSaid( 'console', 0.2, 0 ) }"` );
	ok( seaAboardSaid( 'kayak', 0, 0 ) === 'A sea broke over you' && /into her cockpit/.test( seaAboardSaid( 'sportfisher', 30, 30 ) ), 'the kayak, and the sportfisher' );
	// and it's told as it comes (BreakingSeas.update)
	const said = [], hull = { boat: 'lobster', bilge: 0, figures: { bilgeMax: 900, knock: 0.5 }, slam() {} };
	const seas = new BreakingSeas( { waves: { leeAt: () => [ 1 ] }, caps: null, hull } );
	seas.step = function () {

		hull.bilge += 40;
		this.lastLitres = 40;
		return 1;

	};
	const app = { weather: { live: { swell: 4, windSea: 2, blow: 1 } }, boatCtl: { hauled: false, moored: false, position: { x: 0, z: 0 } }, player: { mode: 'deck' }, game: { toast: ( t ) => said.push( t ) } };
	seas.update( 1 / 60, app );
	ok( said.length === 1 && /over her rail · 11 gal/.test( said[ 0 ] ), `a sea aboard in a gale, told: "${ said[ 0 ] }"` );

}

// ---- trap bait, bought from Marta and used up in a soak
{

	const at = ( nights, baited ) => meanCatch( 1, { days: nights, nights }, baited );
	ok( at( 3, true ) > 2.5 * at( 3, false ) && Math.abs( at( 3, false ) / at( 3, true ) - BAIT.bare ) < 1e-9, `baited, ${ at( 3, true ).toFixed( 2 ) } lobsters in three nights; unbaited ${ at( 3, false ).toFixed( 2 ) }: ${ BAIT.bare } of it` );
	const gain = ( n ) => at( n + 1, true ) - at( n, true );
	ok( gain( BAIT.nights + 1 ) < 0.6 * gain( BAIT.nights - 1 ) && Math.abs( gain( BAIT.nights + 2 ) - ( at( BAIT.nights + 3, false ) - at( BAIT.nights + 2, false ) ) ) < 1e-9, `its bait used up after ${ BAIT.nights } nights: from then it fishes as an unbaited trap` );
	ok( at( 14, true ) < SOAK.most && at( 14, true ) > 0.8 * SOAK.most, `a fortnight's soak baited: ${ at( 14, true ).toFixed( 2 ) } of M16's ${ SOAK.most }` );
	// over many traps, the same bottom and soak
	let withB = 0, without = 0;
	for ( let seed = 1; seed <= 400; seed ++ ) {

		withB += haulOf( { T: 12, at: null, seed }, 1, 0, 8, 12 + 4 * 24, 0 ).lobsters.length;
		without += haulOf( { T: 12, at: null, seed, bait: false }, 1, 0, 8, 12 + 4 * 24, 0 ).lobsters.length;

	}

	ok( without < 0.5 * withB && without > 0.2 * withB, `400 traps soaked 4 nights: ${ withB } lobsters baited, ${ without } not` );
	ok( baitSaid( { bait: false }, { nights: 2 } ) === 'no bait in it' && /long gone/.test( baitSaid( {}, { nights: 6 } ) ) && baitSaid( {}, { nights: 2 } ) === '', 'said as it comes up: none in it, or used up' );
	// bought, kept in the save, used as one's set
	const traps = newTraps();
	ok( buyBait( traps, 5 ) === 0 && traps.bait === 0, `$${ BAIT.price } a bag: not with $5` );
	ok( buyBait( traps, 100 ) === BAIT.price && traps.bait === BAIT.per, `a bag: bait for ${ BAIT.per } traps` );
	const W = Object.create( TrapWork.prototype ), toasts = [];
	Object.assign( W, {
		_T: () => 100, _stowed() {}, app: { terrainData: { heightAt: () => - 6 }, audio: null },
		game: { tradeDay: 1, toast: ( t ) => toasts.push( t ), state: { traps, chart: { mark: () => ( { id: 3 } ) }, save() {}, emit() {} } },
	} );
	for ( let i = 0; i < BAIT.per + 1; i ++ ) W._startSet( 100 + i, 200, 6, 'hard', 8 - i );
	ok( traps.bait === 0 && traps.set.slice( 0, BAIT.per ).every( ( t ) => t.bait !== false ) && traps.set[ BAIT.per ].bait === false, `${ BAIT.per } set baited, the next with none` );
	ok( /no bait in it/.test( toasts.at( - 1 ) ) && ! /no bait/.test( toasts[ 0 ] ), `and said: "${ toasts.at( - 1 ) }"` );
	const back = cleanTraps( JSON.parse( JSON.stringify( { ...traps, bait: 7 } ) ) );
	ok( back.bait === 7 && back.set[ BAIT.per ].bait === false && back.set[ 0 ].bait === undefined, 'through the save: the bait you have, and which went down without' );
	const m16 = cleanTraps( { set: [ { x: 1, z: 2, T: 3, seed: 4 } ], lost: 0 } );
	ok( m16.bait === 0 && m16.set[ 0 ].bait === undefined && haulOf( m16.set[ 0 ], 1, 0, 8, 3 + 96, 0 ).soak, 'a save from before: no bait aboard, its traps out baited, as M16 reckoned them' );
	ok( soakOf( traps.set[ 0 ], 100 + 24 ).hours === 24, '(its soak, as before)' );

}

if ( failed ) {

	console.log( `${ failed } failed` );
	process.exit( 1 );

}

console.log( 'all passed' );
