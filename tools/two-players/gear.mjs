// (M21) Stream GEAR with two real games (docs/m21/gear.md): the rod, reel and line in your hands drawn as themselves on the other
// player's game, and your spread's rods in your holders as yours.
//  - Robin (her sportfisher, her gear bought: the 9 ft surf rod and the conventional for what she casts, the stand-up rod and the
//    wide 80-class for the rest, 30 lb braid and 80 lb mono): her light rod in her hands, a line out; on Sam's game her copy holds
//    the surf rod with the conventional on top of it, its line on the water moss green;
//  - her spread out (two lines, a fish on one): on Sam's game, her holders' rods are the stand-up rod and the 80, its lines smoke
//    blue;
//  - and as an older game sends it (her pose without gr and sg): her copy's rod as before M21 (the graphite and a spinning reel,
//    clear mono), her holders' the stand-up rod and the two-speed.
//   a dev server, then   ALL_THE_SPACES=... node tools/two-players/gear.mjs [out] [port] [tier]
// (GearModels imported as the game imported it, by its own URL, so its models are the game's: a bare import is a module of its own)
// Shots: <out>/<tier>-robin-rod.png, -sam-rod.png, -robin-spread.png, -sam-spread.png, -sam-older.png
import fs from 'node:fs';
import { OTHER as other, start } from './lib.mjs';
const [ out = 'qa-output/gear-together', PORT = '5241', TIER = 'low' ] = process.argv.slice( 2 );
fs.mkdirSync( out, { recursive: true } );
const G = await start( { out, port: PORT, tier: TIER } );
const { say, note, until, frames } = G;
const group = `gear-${ Date.now() }`;
const SEA = { x: - 2600, z: 3000 };

const robin = await G.open( 'Robin', 'sportfisher', 20, { group } ), sam = await G.open( 'Sam', 'kayak', 20, { group } );
await until( sam.game, `${ other } && ${ other }.cur` );
await until( robin.game, `${ other } && ${ other }.cur` );

// each held where they're put each frame (window.__gear: { at: [ x, z ], deck: true (on her deck) | false (in his kayak) }), and the
// camera put just before the frame's drawn (look: 'rod' | 'copyRod' | 'spread' | 'copySpread', off: its offset from what it looks at)
const hold = ( w ) => w.game.evaluate( async () => {

	const a = window.__app, p = a.player, b = a.boatCtl, R = window.__draws;
	R.after.push( () => {

		const K = window.__gear;
		if ( ! K ) return;
		b.position.x = K.at[ 0 ];
		b.position.z = K.at[ 1 ];
		b.velocity.set( 0, 0, 0 );
		if ( K.deck ) {

			p.deckPos.set( 0.3, a.boat.lines.deckY ?? p.deckPos.y, - 2.6 );
			p.deckVel.set( 0, 0, 0 );
			p.deckYaw = Math.PI * 0.9;
			p.pitch = - 0.15;

		}

	} );
	const proto = Object.getPrototypeOf( a ), dw = proto.drawWorld, V = b.position.constructor, _p = new V(), _q = new V();
	proto.drawWorld = function ( ...args ) {

		const K = window.__gear;
		if ( K && K.look ) {

			const c = this.camera, o = this.together.others.values().next().value;
			let at = null;
			if ( K.look === 'rod' ) at = _p.set( 0, this.game.rod.fit.seatY, 0 ).applyMatrix4( this.game.rod.rodMesh.matrix );
			else if ( K.look === 'copyRod' && o ) at = _p.set( 0, o.tackle.rod.userData.model.fit.seatY, 0 ).applyMatrix4( o.tackle.rod.matrix );
			else {

				const H = K.look === 'spread' ? this.game.rigs.holders : this.together.spread.holders, M = H ? H.meshes.filter( ( m ) => m.visible ) : [];
				if ( M.length ) {

					at = _p.set( 0, 0, 0 );
					for ( const m of M ) at.add( _q.set( 0, m.userData.model.fit.seatY, 0 ).applyMatrix4( m.matrix ) );
					at.multiplyScalar( 1 / M.length );

				}

			}

			if ( at ) {

				c.position.set( at.x + K.off[ 0 ], at.y + K.off[ 1 ], at.z + K.off[ 2 ] );
				c.lookAt( at.x, at.y + 0.3, at.z );
				c.updateMatrixWorld();
				this.water.update( c );
				if ( this.terrain && this.terrain.update ) this.terrain.update( c );

			}

		}

		return dw.apply( this, args );

	};

} );
await hold( robin );
await hold( sam );

// ---- Robin's gear, her light rod out with a line on the water
await G.toSea( robin, SEA );
await robin.game.evaluate( ( SEA ) => {

	const a = window.__app, g = a.game, u = g.state.upgrades, p = a.player;
	Object.assign( u, { rod: 3, reel: 4, line: 4 } );
	g.applyGear();
	if ( p.mode !== 'deck' ) p.boardBoat();
	window.__gear = { at: [ SEA.x, SEA.z ], deck: true };
	g.rigs.pick = 'float';
	const rod = g.rod;
	rod.equip( true );
	window.__draws.after.push( () => {

		if ( ! window.__gear || ! window.__gear.line ) return;
		if ( rod.state !== 'floating' ) {

			rod.setRig( 'float' );
			rod.setState( 'floating' );
			rod.bobber.set( rod.tip.x + 9, rod.waterY, rod.tip.z - 6 );
			rod.landedAt.copy( rod.bobber );

		}

	} );
	window.__gear.line = true;

}, SEA );
await G.toSea( sam, { x: SEA.x + 7, z: SEA.z - 9 } );
await sam.game.evaluate( ( SEA ) => {

	const p = window.__app.player;
	if ( p.mode !== 'boat' ) p.boardBoat(); // (in his kayak's seat, out by her)
	window.__gear = { at: [ SEA.x + 7, SEA.z - 9 ], deck: false };

}, SEA );
await frames( robin.game, 20 );
const mine = await robin.game.evaluate( async () => {

	const rod = window.__app.game.rod, body = window.__app.together._mine();
	return { gear: rod.gear, state: rod.state, top: rod.big, gr: body.gr, sg: body.sg ?? null, line: '#' + rod.lineMat.color.getHexString() };

} );
note( `Robin's rod: ${ JSON.stringify( mine ) }` );
say( mine.gear.rod === 2 && mine.gear.reel === 2 && mine.gear.line === 2 && mine.top && mine.gr === 222 && mine.state === 'floating', 'Robin casting on her light tackle: the surf rod with the conventional on top, 30 lb braid; her pose says so (gr 222)' );
await until( sam.game, `${ other }.cur.gear && ${ other }.cur.rod >= 3`, 120000 ).catch( () => {} );
await frames( sam.game, 20 );
const copyOf = `( async () => {

	const GEAR_URL = () => performance.getEntriesByType( 'resource' ).map( ( e ) => e.name ).filter( ( u ) => /\\/src\\/game\\/rigs\\/GearModels\\.js(\\?|$)/.test( u ) ).pop() || '/src/game/rigs/GearModels.js';

	const { LINES, gearModel } = await import( GEAR_URL() );
	const o = ${ other }, T = o.tackle, r = T.rod, g = r.userData.gear, m = r.userData.model, f = m.fit, M = r.matrix;
	const seat = new T.bobber.position.constructor( 0, f.seatY, 0 ).applyMatrix4( M ), reel = new T.bobber.position.constructor( 0, f.reelAxis[ 0 ], f.reelAxis[ 1 ] ).applyMatrix4( M );
	return { gear: g, shown: r.visible, same: r.geometry === gearModel( g.rod, g.reel ).geometry, above: +( reel.y - seat.y ).toFixed( 3 ), line: '#' + T.line.material.color.getHexString(), want: '#' + LINES[ g.line ].color.toString( 16 ).padStart( 6, '0' ), lineShown: T.line.visible, L: f.L };

} )()`;
const copy = await sam.game.evaluate( copyOf );
note( `Robin's copy on Sam's: ${ JSON.stringify( copy ) }` );
say( copy.gear.rod === 2 && copy.gear.reel === 2 && copy.same && copy.shown, 'on Sam\'s game Robin\'s copy holds the surf rod and the conventional, the same model (built once on his game, shared)' );
say( copy.above > 0.02, `  its reel on top of the rod (${ copy.above } m over the seat)` );
say( copy.lineShown && copy.line === copy.want && copy.want === '#6f8a4c', `  her line on the water moss green, 30 lb braid's (${ copy.line })` );
await robin.game.evaluate( () => Object.assign( window.__gear, { look: 'rod', off: [ - 0.45, 0.25, 0.35 ] } ) );
await sam.game.evaluate( () => Object.assign( window.__gear, { look: 'copyRod', off: [ - 0.5, 0.3, 0.4 ] } ) );
await G.shot( robin, `${ TIER }-robin-rod` );
await G.shot( sam, `${ TIER }-sam-rod` );

// ---- Robin's spread: two lines out, a fish on the port one
await robin.game.evaluate( () => {

	const a = window.__app, g = a.game, rigs = g.rigs, rod = g.rod;
	window.__gear.line = false;
	window.__gear.look = null;
	g.cancelLine( true );
	rod.equip( false );
	rigs._onRod = () => {};
	window.__draws.after.push( () => {

		if ( ! window.__gear || ! window.__gear.spread ) return;
		if ( ! rigs.lines.length ) for ( const s of rigs.spots().slice( 0, 2 ) ) {

			const V = rod.tip.constructor, L = { spot: s, bait: null, leader: 0, len: 30, p: new V(), tip: new V(), clip: null, butt: new V(), on: null, in: false, torn: 0, bend: 0 };
			rigs._place( L );
			L.p.copy( L.tip );
			L.p.x += ( s.side || 0 ) * 6;
			rigs.lines.push( L );

		}

		for ( const L of rigs.lines ) {

			L.len = 30;
			if ( L.spot.side === 1 ) L.on = L.on || { species: 'wahoo', kg: 20, t: 0, place: 'blue', at: { x: 0, z: 0 } };
			if ( L.on ) L.on.t = 0;

		}

	} );
	window.__gear.spread = true;

} );
await frames( robin.game, 20 );
const hers = await robin.game.evaluate( () => {

	const rigs = window.__app.game.rigs, H = rigs.holders, body = window.__app.together._mine();
	return { lines: rigs.lines.length, gear: rigs.spreadGear, sg: body.sg, rods: H ? H.meshes.filter( ( m ) => m.visible ).map( ( m ) => m.userData.gear ) : [] };

} );
note( `Robin's spread: ${ JSON.stringify( hers ) }` );
say( hers.lines === 2 && hers.rods.length === 2 && hers.rods.every( ( g ) => g.rod === 3 && g.reel === 4 && g.line === 4 ) && hers.sg === 344, 'Robin\'s spread out: her stand-up rods with the wide 80-class in her holders, 80 lb mono, and her pose says so (sg 344)' );
await until( sam.game, `${ other }.cur.spread && ${ other }.cur.spread.length === 2 && ${ other }.cur.spreadGear`, 120000 ).catch( () => {} );
await frames( sam.game, 20 );
const spreadOf = `( async () => {

	const GEAR_URL = () => performance.getEntriesByType( 'resource' ).map( ( e ) => e.name ).filter( ( u ) => /\\/src\\/game\\/rigs\\/GearModels\\.js(\\?|$)/.test( u ) ).pop() || '/src/game/rigs/GearModels.js';

	const { LINES, gearModel } = await import( GEAR_URL() );
	const S = window.__app.together.spread, H = S.holders, o = ${ other };
	const rods = H ? H.meshes.filter( ( m ) => m.visible ) : [];
	const up = rods.map( ( m ) => { const f = m.userData.model.fit, V = o.tackle.bobber.position.constructor, seat = new V( 0, f.seatY, 0 ).applyMatrix4( m.matrix ), reel = new V( 0, f.reelAxis[ 0 ], f.reelAxis[ 1 ] ).applyMatrix4( m.matrix ); return +( reel.y - seat.y ).toFixed( 3 ); } );
	return { gear: o.cur.spreadGear, n: rods.length, rods: rods.map( ( m ) => m.userData.gear ), same: rods.every( ( m ) => m.geometry === gearModel( m.userData.gear.rod, m.userData.gear.reel ).geometry ), up, line: LINES[ ( o.cur.spreadGear || {} ).line ]?.color.toString( 16 ) };

} )()`;
const theirs = await sam.game.evaluate( spreadOf );
note( `her spread on Sam's: ${ JSON.stringify( theirs ) }` );
say( theirs.n === 2 && theirs.rods.every( ( g ) => g.rod === 3 && g.reel === 4 && g.line === 4 ) && theirs.same, 'on Sam\'s game her holders hold her stand-up rods and her 80s' );
say( theirs.up.length === 2 && theirs.up.every( ( u ) => u > 0.02 ), `  each reel on top of its rod (${ theirs.up.join( ', ' ) } m over the seat), its lines smoke blue (#${ theirs.line })` );
await robin.game.evaluate( () => Object.assign( window.__gear, { look: 'spread', off: [ 1.2, 1.6, - 2.6 ] } ) );
await sam.game.evaluate( () => Object.assign( window.__gear, { look: 'copySpread', off: [ 1.2, 1.6, - 2.6 ] } ) );
await G.shot( robin, `${ TIER }-robin-spread` );
await G.shot( sam, `${ TIER }-sam-spread` );

// ---- as an older game sends it: no gr, no sg
await robin.game.evaluate( () => {

	const T = window.__app.together, mine = T._mine.bind( T ), rod = window.__app.game.rod;
	T._mine = () => {

		const b = mine();
		delete b.gr;
		delete b.sg;
		return b;

	};
	rod.equip( true );
	window.__gear.line = true;

} );
await frames( robin.game, 20 );
await until( sam.game, `${ other }.cur.rod >= 3 && ! ${ other }.cur.gear`, 120000 ).catch( () => {} );
await frames( sam.game, 20 );
const older = await sam.game.evaluate( copyOf );
const olderSpread = await sam.game.evaluate( spreadOf );
note( `older: ${ JSON.stringify( older ) } ${ JSON.stringify( olderSpread ) }` );
say( older.gear.rod === 1 && older.gear.reel === 1 && older.line === '#d8dde0', 'from an older game, her copy\'s rod as before M21: the graphite with a spinning reel, clear mono' );
say( olderSpread.n === 2 && olderSpread.rods.every( ( g ) => g.rod === 3 && g.reel === 3 ), '  her holders\' rods the stand-up rod and the two-speed' );
await sam.game.evaluate( () => Object.assign( window.__gear, { look: 'copyRod', off: [ - 0.5, 0.3, 0.4 ] } ) );
await G.shot( sam, `${ TIER }-sam-older` );

await G.end( `gear ${ TIER }` );
