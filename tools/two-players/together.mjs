// (M17, stream 4) Aboard together, with two real games, part by part: what M16 left for a guest on someone else's boat.
//   tools/render-slot.sh node tools/two-players/together.mjs [dir] [port] <part>
//   parts: seat (5)  yard (2)  tray (3)  hold (4)  sand, stem (6; berths: both)  pearl (7)  specks (8)  horn (9)  ladder (10, 11)  chair (12)  slow (13)
import { OTHER as other, start } from './lib.mjs';
const [ out = 'qa-output', PORT = '5234', PART = 'seat' ] = process.argv.slice( 2 );
const G = await start( { out, port: PORT } );
const { say, note, until, frames, press, shot } = G;
const toasts = ( who ) => who.game.evaluate( () => { const g = window.__app.game, was = g.toast; window.__toasts = []; g.toast = function ( t, ms ) { window.__toasts.push( t ); return was.call( this, t, ms ); }; } );
const told = ( who ) => who.game.evaluate( () => window.__toasts.splice( 0 ) );
const r2 = ( v ) => Math.round( v * 100 ) / 100;
const ready = async ( a, b ) => {

	await until( b.game, `${ other } && ${ other }.cur` );
	await until( a.game, `${ other } && ${ other }.cur` );

};

// mouse look, as the pointer's lock gives it: x pixels a frame for n of the game's frames
const look = ( who, x, n ) => who.game.evaluate( ( [ x, n ] ) => new Promise( ( done ) => {

	const a = window.__app, R = window.__draws;
	let k = 0;
	const f = () => {

		if ( k ++ >= n ) {

			R.after.splice( R.after.indexOf( f ), 1 );
			done();
			return;

		}

		a.input.look.x += x;

	};

	R.after.push( f );
	a.input.look.x += x;

} ), [ x, n ] );

// where you look, against her bow (rad, about +y), and her heading
const view = ( who ) => who.game.evaluate( () => {

	const a = window.__app, p = a.player, d = a.camera.getWorldDirection( a.camera.position.clone() ), b = p.boat;
	const yaw = Math.atan2( d.x, d.z ), bow = b.getYaw();
	return { rel: +Math.atan2( Math.sin( yaw - bow ), Math.cos( yaw - bow ) ).toFixed( 3 ), deckYaw: +( p.deckYaw || 0 ).toFixed( 3 ), mode: p.mode, riding: p.riding, seated: !! b.model.seated, perch: !! b.model.boardPoint };

} );

if ( PART === 'seat' ) {

	// (5) a guest sat on her tank well looks about: her owner in her seat, him on her tank well, and the mouse turned
	const owner = await G.open( 'Robin', 'kayak', 20 ), guest = await G.open( 'Sam', process.env.GUEST_BOAT || 'kayak', 20 );
	await ready( owner, guest );
	say( await G.aboard( owner, guest ), 'Sam\'s on her tank well' );
	await frames( guest.game, 6 );
	const a = await view( guest );
	await look( guest, 40, 20 );
	await frames( guest.game, 2 );
	const b = await view( guest );
	note( 'before:', JSON.stringify( a ), ' after:', JSON.stringify( b ) );
	say( Math.abs( b.rel - a.rel ) > 0.5, `sat on her tank well, he looks about: ${ a.rel } to ${ b.rel } rad off her bow` );
	// and under way
	await owner.game.evaluate( () => { const a = window.__app; a.boatCtl.position.set( 30, a.boatCtl.position.y, - 20 ); } );
	await owner.page.keyboard.down( 'KeyW' );
	await frames( owner.game, 30 );
	const c = await view( guest );
	await look( guest, - 40, 20 );
	await frames( guest.game, 2 );
	const d = await view( guest );
	await owner.page.keyboard.up( 'KeyW' );
	note( 'under way, before:', JSON.stringify( c ), ' after:', JSON.stringify( d ) );
	say( Math.abs( d.rel - c.rel ) > 0.5, `under way, he looks about: ${ c.rel } to ${ d.rel } rad off her bow` );
	// her owner sees him turn
	const seen = await owner.game.evaluate( ( other ) => { const o = eval( other ), g = o.avatar.group, b = window.__app.boatCtl, e = new g.position.constructor( 0, 0, 1 ).applyQuaternion( g.quaternion ); return { fig: +Math.atan2( e.x, e.z ).toFixed( 3 ), bow: +b.getYaw().toFixed( 3 ), mode: o.cur.mode, ride: o.cur.ride }; }, other );
	note( 'Robin sees him:', JSON.stringify( seen ) );
	// by the real mouse, as the two-player page is played (dragging: the pointer isn't locked in a driven browser), his rod out
	await guest.game.evaluate( () => { const g = window.__app.game; if ( ! g.rod.equipped ) g.rod.equip( true ); } );
	await frames( guest.game, 3 );
	const e = await view( guest ), box = await guest.page.evaluate( () => { const r = document.querySelector( 'iframe' ).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; } );
	await guest.page.mouse.move( box.x, box.y );
	await guest.page.mouse.down( { button: 'right' } );
	for ( let i = 0; i < 12; i ++ ) {

		await guest.page.mouse.move( box.x + ( i + 1 ) * 20, box.y );
		await frames( guest.game, 1 );

	}

	await guest.page.mouse.up( { button: 'right' } );
	await frames( guest.game, 2 );
	const f = await view( guest );
	note( 'by the mouse, rod out:', JSON.stringify( e ), ' to ', JSON.stringify( f ) );
	say( Math.abs( f.rel - e.rel ) > 0.3, `by the mouse, his rod out, he looks about: ${ e.rel } to ${ f.rel } rad off her bow` );

}


if ( PART === 'chair' ) {

	// (12) standing beside the chair isn't sitting in it: by the seat, strapped in, not by nearness
	const owner = await G.open( 'Robin', 'sportfisher', 20 ), guest = await G.open( 'Sam', 'lobster', 20 );
	await ready( owner, guest );
	await G.buy( owner );
	// ((M17) and her tackle as a boat with a fighting chair has it, her best reel and line: on her first, the lines at their
	// labels since M17, the 30 kg yellowfin had her 180 m or her 8 lb before the slow game's E had him in the chair)
	await owner.game.evaluate( async () => { const { UPGRADES } = await import( '/src/game/Gear.js' ); const g = window.__app.game, u = g.state.upgrades; u.reel = UPGRADES.reel.levels.length - 1; u.line = UPGRADES.line.levels.length - 1; g.applyGear(); } );
	say( await G.aboard( owner, guest ), 'Sam\'s aboard the sportfisher' );
	// (beside it, where M16's nearness had him in it: within its station's reach)
	await guest.game.evaluate( () => { const p = window.__app.player, S = p.boat.model.stations.chair; p.deckPos.set( S.x + 0.45, S.y, S.z ); p.deckVel.set( 0, 0, 0 ); } );
	await frames( guest.game, 6 );
	await frames( owner.game, 6 );
	const beside = await guest.game.evaluate( () => { const a = window.__app, p = a.player, S = p.boat.model.stations.chair; return { job: a.together.crew.job, d: Math.hypot( p.deckPos.x - S.x, p.deckPos.z - S.z ), r: S.r, chair: !! p.chair }; } );
	const seenBeside = await owner.game.evaluate( ( other ) => eval( other ).cur.job, other );
	say( beside.job === null && seenBeside === null && beside.d < beside.r, `beside the chair (${ beside.d.toFixed( 2 ) } m from it, within its ${ beside.r } m): his job ${ beside.job }, Robin sees ${ seenBeside }` );
	// (sat in it as a crew does: a fish on one of her rods, taken off her holder, and E at the chair: Rigs.updateChair. Without a fish
	// the chair lets you go at once)
	await G.helm( owner );
	await G.toSea( owner );
	await until( guest.game, `Math.hypot( window.__app.player.boat.position.x + 2600, window.__app.player.boat.position.z - 3000 ) < 300`, 240000 ).catch( () => {} );
	await owner.game.evaluate( () => { const a = window.__app; a.player.leaveHelm(); a.boatCtl.throttle = 0; } );
	await until( guest.game, '!! window.__app.game.rigs.boatKit', 60000 ).catch( () => {} );
	await owner.game.evaluate( () => {

		const a = window.__app, r = a.game.rigs, V = a.camera.position.constructor, sp = r.spots()[ 0 ];
		const L = { spot: sp, bait: 'ballyhoo', len: 30, p: new V(), tip: new V(), clip: null, butt: new V(), on: { species: 'yellowfin', kg: 30, t: - 600, place: null, at: { x: a.boatCtl.position.x, z: a.boatCtl.position.z } }, in: false, torn: 0, bend: 0 };
		r.lines.length = 0;
		r._place( L );
		L.p.copy( L.tip );
		r.lines.push( L );
		r._trollT = 1e9;

	} );
	await until( guest.game, `${ other }.cur.spread && ${ other }.cur.spread.some( ( x ) => x.on )`, 60000 ).catch( () => {} );
	await guest.game.evaluate( `( async () => { const { rodOf } = await import( '/src/together/Spread.js' ); const p = window.__app.player, V = p.deckPos.constructor, at = { butt: new V(), tip: new V(), clip: new V() }, L = ${ other }.cur.spread.find( ( x ) => x.on ); rodOf( p.boat.model, L, at ); const y = p.deckGroundAt( at.butt.x * 0.8, at.butt.z + 0.5, at.butt.y ); p.deckPos.set( at.butt.x * 0.8, y, at.butt.z + 0.5 ); p.deckVel.set( 0, 0, 0 ); } )()` );
	await frames( guest.game, 4 );
	await press( guest, 'KeyR', 3 );
	await until( guest.game, '!! window.__app.game.fight', 60000 ).catch( () => {} );
	// (a fish on, standing by the chair: still not in it)
	await guest.game.evaluate( () => { const p = window.__app.player, S = p.boat.model.stations.chair; p.deckPos.set( S.x + 0.6, S.y, S.z + 0.4 ); p.deckVel.set( 0, 0, 0 ); } );
	await frames( guest.game, 6 );
	await frames( owner.game, 6 );
	const by = await guest.game.evaluate( () => { const a = window.__app; return { fight: !! a.game.fight, job: a.together.crew.job, said: a.player.prompt && a.player.prompt.text }; } );
	say( by.fight && by.job === null && await owner.game.evaluate( ( other ) => eval( other ).cur.job === null, other ), `a fish on, by the chair: his job ${ by.job }, offered "${ by.said }"` );
	await press( guest, 'KeyE', 3 );
	// ((M17) his side read at once: on a slow game his fish can be over, and the chair let him go, by the time Robin's has him)
	await frames( guest.game, 2 );
	const his = await guest.game.evaluate( () => { const a = window.__app; return { job: a.together.crew.job, chair: !! a.player.chair, hold: a.game.fight && a.game.fight.holdKg }; } );
	await until( owner.game, `${ other }.cur.job === 'chair'`, 60000 ).catch( () => {} );
	// (and drawn there: on a CPU's game the figures are placed once its late shaders are in, Together.ready)
	await until( owner.game, `( () => { const a = window.__app, S = a.boat.stations.chair, g = ${ other }.avatar.group, w = g.position.clone().set( S.x, S.y, S.z ).applyQuaternion( a.boatCtl.quaternion ).add( a.boatCtl.position ); return a.together.ready && g.position.distanceTo( w ) < 0.3; } )()`, 120000 ).catch( () => {} );
	const inIt = await owner.game.evaluate( ( other ) => { const o = eval( other ), a = window.__app, M = a.boat, S = M.stations.chair, g = o.avatar.group, w = new g.position.constructor( S.x, S.y, S.z ).applyQuaternion( a.boatCtl.quaternion ).add( a.boatCtl.position ); return { job: o.cur.job, from: +g.position.distanceTo( w ).toFixed( 2 ) }; }, other );
	say( his.job === 'chair' && his.chair && inIt.job === 'chair' && inIt.from < 0.3, `E sits him in it: his job ${ his.job }, his fight held at ${ his.hold } kg; Robin sees him in the chair, ${ inIt.from } m from its seat` );
	await guest.game.evaluate( () => { const g = window.__app.game; g.cancelLine( true ); g.stowRod(); } );
	await until( owner.game, `${ other }.cur.job === null`, 60000 ).catch( () => {} );
	say( await owner.game.evaluate( ( other ) => eval( other ).cur.job === null, other ), 'the fish gone, out of it: not' );

}

if ( PART === 'ladder' ) {

	// (10) her ladder on a copy folds down as on her owner's game; (11) boarding from the water by it, at its own reach
	const owner = await G.open( 'Robin', 'console', 20 ), guest = await G.open( 'Sam', 'lobster', 20 );
	await ready( owner, guest );
	await G.buy( owner );
	await owner.game.evaluate( () => window.__app.player.boardBoat() );
	await G.toSea( owner, { x: - 400, z: 400 } );
	// (Sam out there in the water beside her, so her copy's near and whole)
	const swimTo = ( d ) => guest.game.evaluate( ( [ other, d ] ) => { const a = window.__app, p = a.player, o = eval( other ), f = o.cur.drawn || o.cur.boat, M = a.together.copies.model( o.cur.boatId ); const w = a.together.copies.walked( M, o.cur.boatId, o.cur.fit ), at = w.boardFrom( 'swim' ).at.clone().applyQuaternion( f.quat ).add( f.pos ), back = new at.constructor( 0, 0, - 1 ).applyQuaternion( f.quat ).setY( 0 ).normalize(); p.mode = 'swim'; p.position.set( at.x + back.x * d, a.waves.heightAt( at.x, at.z ) - 0.3, at.z + back.z * d ); p.velocity.set( 0, 0, 0 ); }, [ other, d ] );
	await until( guest.game, `${ other }.cur.boat && Math.hypot( ${ other }.cur.boat.pos.x + 400, ${ other }.cur.boat.pos.z - 400 ) < 50` );
	await swimTo( 6 );
	await until( guest.game, `window.__app.together.copies.aboard( 'console' ) && ${ other }.boat && ${ other }.boat.visible`, 300000 );
	await frames( owner.game, 10 );
	const read = async () => {

		const mine = await owner.game.evaluate( () => { const a = window.__app; return { down: a.boat.fitNow().ladderDown, n: a.boat.meshes.fittings.geometry.drawRange.count }; } );
		await frames( guest.game, 8 );
		const theirs = await guest.game.evaluate( ( other ) => { const o = eval( other ), b = o.boat, f = b && b.getObjectByName( 'boat-fittings' ); return { n: f ? f.geometry.drawRange.count : null, dressed: b && b.userData.dressed }; }, other );
		return { mine, theirs };

	};

	await until( owner.game, 'window.__app.boat.fitNow().ladderDown', 60000 ).catch( () => {} );
	await frames( guest.game, 20 );
	const down = await read();
	say( down.mine.down && down.theirs.n === down.mine.n, `stopped, her ladder's down on her owner's game, and on Sam's copy: ${ down.mine.n } and ${ down.theirs.n } of her fittings' indices` );
	await G.helm( owner );
	await owner.page.keyboard.down( 'KeyW' );
	await until( owner.game, '! window.__app.boat.fitNow().ladderDown', 60000 ).catch( () => {} );
	await frames( guest.game, 20 );
	const up = await read();
	await owner.page.keyboard.up( 'KeyW' );
	say( ! up.mine.down && up.theirs.n === up.mine.n && up.theirs.n !== down.theirs.n, `under way it's folded up, on both: ${ up.mine.n } and ${ up.theirs.n }` );
	// (11) from the water: stopped again, her owner on deck, Sam at her ladder
	await owner.game.evaluate( () => { const a = window.__app, b = a.boatCtl; a.player.leaveHelm(); b.velocity.set( 0, 0, 0 ); b.angular.set( 0, 0, 0 ); b.throttle = 0; } );
	await until( owner.game, 'window.__app.boat.fitNow().ladderDown && window.__app.boatCtl.speed < 0.3', 120000 ).catch( () => {} );
	// (what the player's offered the frame he's put there: held there, as she drifts, and read as his update ends)
	const offer = async ( d ) => {

		await guest.game.evaluate( () => { window.__said = null; } );
		await swimTo( d );
		await guest.game.evaluate( ( [ other, d ] ) => new Promise( ( done ) => { const R = window.__draws, p = window.__app.player; const f = () => { const o = p.rideOffer; window.__said = { offer: !! o, text: o && o.text, prompt: p.prompt && p.prompt.text, d }; R.after.splice( R.after.indexOf( f ), 1 ); done(); }; R.after.push( f ); } ), [ other, d ] );
		return guest.game.evaluate( () => window.__said );

	};

	const near = await offer( 1.2 ), far = await offer( 3.4 );
	say( near.offer && near.text === 'Climb the ladder' && near.prompt === 'Climb the ladder' && ! far.offer, `in the water 1.2 m from her ladder: "${ near.prompt }"; 3.4 m off (M16 offered it to 4.2): ${ far.offer ? `"${ far.prompt }"` : 'nothing' }` );
	await offer( 1.2 );
	await press( guest, 'KeyE', 3 );
	await frames( guest.game, 4 );
	const on = await guest.game.evaluate( () => { const p = window.__app.player, B = p.boat.model.boardFrom( 'swim' ); return { riding: p.riding, mode: p.mode, from: r2( p.deckPos.distanceTo( B.at ) ) }; function r2( v ) { return Math.round( v * 100 ) / 100; } } );
	say( on.riding && on.mode === 'deck' && on.from < 0.6, `E climbs it: aboard on her platform, ${ on.from } m from the ladder's head` );

}

if ( PART === 'horn' ) {

	// (9) the horn's heard from the boat it's sounded on: a rider at her helm sounds hers, on his game and hers
	const owner = await G.open( 'Robin', 'lobster', 20 ), guest = await G.open( 'Sam', 'kayak', 20 );
	await ready( owner, guest );
	const hear = ( who ) => who.game.evaluate( () => { const A = window.__app.audio, was = A.hornStart; window.__horns = []; A.hornStart = function ( p ) { const a = window.__app, her = a.player.boat && a.player.boat.position, own = a.boatCtl.position; window.__horns.push( p && { at: [ p.x, p.y, p.z ], her: her && [ her.x, her.z ], own: [ own.x, own.z ] } ); return was.call( this, p ); }; } );
	await hear( owner );
	await hear( guest );
	say( await G.aboard( owner, guest ), 'Sam\'s aboard her' );
	await G.toSea( owner, { x: - 600, z: 500 } );
	await until( guest.game, 'window.__app.player.boat.helmFree', 120000 ).catch( () => {} );
	await guest.game.evaluate( () => { const p = window.__app.player; p.takeHelm(); } );
	await frames( guest.game, 4 );
	await until( owner.game, `${ other }.cur.mode === 'helm' && ${ other }.cur.ride`, 60000 );
	await guest.page.keyboard.down( 'KeyH' );
	await frames( guest.game, 6 );
	await until( owner.game, 'window.__horns.length > 0', 60000 ).catch( () => {} );
	await guest.page.keyboard.up( 'KeyH' );
	// ((M17) against where she and his own kayak were as it sounded: at 0.7 fps she's moved on a way by the time it's read)
	const his = await guest.game.evaluate( () => { const a = window.__app, h = window.__horns[ 0 ]; return h && h.her && { fromHer: Math.hypot( h.at[ 0 ] - h.her[ 0 ], h.at[ 2 ] - h.her[ 1 ] ), fromHis: Math.hypot( h.at[ 0 ] - h.own[ 0 ], h.at[ 2 ] - h.own[ 1 ] ), mode: a.player.mode, riding: a.player.riding }; } );
	const hers = await owner.game.evaluate( () => { const h = window.__horns[ 0 ]; return h && { fromHer: Math.hypot( h.at[ 0 ] - h.own[ 0 ], h.at[ 2 ] - h.own[ 1 ] ) }; } );
	note( 'his:', JSON.stringify( his ), ' hers:', JSON.stringify( hers ) );
	say( his && his.riding && his.fromHer < 4 && his.fromHis > 100, `at her helm Sam hears it from her, ${ his && his.fromHer.toFixed( 1 ) } m from her middle (his own kayak ${ his && his.fromHis.toFixed( 0 ) } m off)` );
	say( hers && hers.fromHer < 4, `and Robin hears it from her own boat, ${ hers && hers.fromHer.toFixed( 1 ) } m from her middle` );

}

if ( PART === 'specks' ) {

	// (8) a speck's height is her fit's: a sportfisher 16 km out shows over the horizon with her tower, and not without it
	const owner = await G.open( 'Robin', 'sportfisher', 20 ), guest = await G.open( 'Sam', 'kayak', 20 );
	await ready( owner, guest );
	await G.buy( owner );
	await owner.game.evaluate( () => window.__app.player.boardBoat() );
	await G.toSea( owner, { x: 55, z: 16040 } );
	// (Sam on the pier head, looking out)
	await guest.game.evaluate( () => { const a = window.__app, p = a.player; p.position.set( 55, a.player.groundAt( 55, 39, 10 ), 39 ); p.velocity.set( 0, 0, 0 ); p.yaw = Math.PI; } );
	const count = async () => {

		await frames( guest.game, 8 );
		return guest.game.evaluate( ( other ) => { const a = window.__app, T = a.together, o = eval( other ); return { n: T.specks ? T.specks.count : 0, d: o.cur && o.cur.boat ? Math.round( Math.hypot( o.cur.boat.pos.x - a.camera.position.x, o.cur.boat.pos.z - a.camera.position.z ) ) : null, eye: +( a.camera.position.y ).toFixed( 1 ), fit: o.cur && o.cur.fit }; }, other );

	};

	await until( guest.game, `${ other }.cur.boat && ${ other }.cur.boat.pos.z > 15000`, 120000 );
	const air = () => guest.game.evaluate( async ( other ) => { const { airOf } = await import( '/src/together/BoatCopies.js' ); const o = eval( other ); return o.cur ? airOf( o.cur.boatId, o.cur.fit ) : null; }, other );
	const tower = await count(), towerAir = await air();
	await owner.game.evaluate( () => { const g = window.__app.game; g.state.upgrades.sfTower = 0; g.applyGear(); } );
	for ( let i = 0; i < 120 && ( await air() ) > 6; i ++ ) await frames( guest.game, 1 );
	const bare = await count(), bareAir = await air();
	say( tower.n > 0 && bare.n === 0 && towerAir === 11 && bareAir < 6, `from the pier head, ${ tower.d } m off: with her tower (${ towerAir } m), ${ tower.n } speck; without it (${ bareAir } m), ${ bare.n } (eye ${ tower.eye } m)` );

}

if ( PART === 'sand' || PART === 'berths' ) {

	// (6) a visitor's kayak on the sand where yours lies: beside it, up past the high-water mark
	const owner = await G.open( 'Robin', 'kayak', 20 ), guest = await G.open( 'Sam', 'kayak', 20 );
	await ready( owner, guest );
	await until( owner.game, `${ other }.cur.boat && ${ other }.spot`, 120000 ).catch( () => {} );
	const sand = await owner.game.evaluate( async ( other ) => { const { TIDE_HIGHEST } = await import( '/src/game/IslandClock.js' ); const a = window.__app, o = eval( other ), f = o.cur.drawn || o.cur.boat, mine = a.boatCtl.position; return { kind: o.spot && o.spot.kind, apart: +Math.hypot( f.pos.x - mine.x, f.pos.z - mine.z ).toFixed( 2 ), ground: +a.terrainData.heightAt( f.pos.x, f.pos.z ).toFixed( 2 ), mark: TIDE_HIGHEST + 0.5, true: +Math.hypot( o.cur.boat.pos.x - mine.x, o.cur.boat.pos.z - mine.z ).toFixed( 2 ) }; }, other );
	say( sand.kind === 'sand' && sand.apart > 1.2 && sand.ground >= sand.mark - 0.01, `Sam's kayak on the sand, where Robin's lies too (${ sand.true } m from hers on his own game): on Robin's, beside hers, ${ sand.apart } m off, ${ sand.ground } m up (the mark ${ sand.mark })` );

}

if ( PART === 'stem' || PART === 'berths' ) {

	// (6) a boat at the pier head at a spare along the stem, and leaving it round the head, not through it
	if ( PART === 'berths' ) await Promise.all( G.ctx.pages().map( ( pg ) => pg.close() ) );
	const owner = await G.open( 'Robin', 'lobster', 20 ), con = await G.open( 'Sam', 'console', 20 );
	await ready( owner, con );
	await until( owner.game, `( () => { const o = ${ other }; return o && o.cur && o.cur.boatId === 'console' && o.spot; } )()`, 180000 ).catch( () => {} );
	const stem = await owner.game.evaluate( ( other ) => { const o = eval( other ); return o.spot && { kind: o.spot.kind, side: o.spot.side, x: o.spot.x, z: o.spot.z }; }, other );
	say( stem && stem.kind === 'stem', `his console at the pier head: on Robin's screen at a spare along the stem, ${ JSON.stringify( stem ) }` );
	await owner.game.evaluate( ( other ) => {

		const R = window.__draws;
		window.__path = [];
		R.end.push( () => { const o = eval( other ), c = o.cur; if ( c && c.boat ) { const f = c.drawn || c.boat; window.__path.push( [ f.pos.x, f.pos.z, o.spot ? 1 : 0, c.boat.pos.x, c.boat.pos.z ] ); } } );

	}, other );
	// (at her helm, and away north: her lever up, by her owner's game)
	await con.game.evaluate( () => { const p = window.__app.player; p.boardBoat(); p.takeHelm(); } );
	await frames( con.game, 2 );
	await con.page.keyboard.down( 'KeyW' );
	await until( owner.game, `( () => { const o = ${ other }; return o.cur && o.cur.boat && o.cur.boat.pos.z > 110; } )()`, 600000 ).catch( () => {} );
	await con.page.keyboard.up( 'KeyW' );
	const path = await owner.game.evaluate( () => window.__path );
	const P = { x: 55, half: 1.3, hx: 7, z0: 33, z1: 40 }, S = { beam: 2.6, length: 7 };
	let into = 0, step = 0, lay = 0;
	for ( let i = 0; i < path.length; i ++ ) {

		const [ x, z ] = path[ i ], h = { x0: x - S.beam / 2, x1: x + S.beam / 2, z0: z - S.length / 2, z1: z + S.length / 2 };
		const head = h.x0 < P.x + P.hx && h.x1 > P.x - P.hx && h.z0 < P.z1 && h.z1 > P.z0, stemIn = h.x0 < P.x + P.half && h.x1 > P.x - P.half && h.z0 < P.z0 && h.z1 > - 64;
		if ( head || stemIn ) into ++;
		if ( i ) step = Math.max( step, Math.hypot( x - path[ i - 1 ][ 0 ], z - path[ i - 1 ][ 1 ] ) );
		if ( path[ i ][ 2 ] ) lay ++;

	}

	const moving = path.filter( ( q, i ) => i === 0 || Math.hypot( q[ 0 ] - path[ i - 1 ][ 0 ], q[ 1 ] - path[ i - 1 ][ 1 ] ) > 0.05 );
	note( 'her way on Robin\'s screen as she moved, every 5th frame [ x, z, at her spare ]:', JSON.stringify( moving.filter( ( _, i ) => i % 5 === 0 ).map( ( q ) => q.slice( 0, 3 ).map( ( v ) => Math.round( v * 10 ) / 10 ) ) ) );
	const rate = await G.rate( owner.game ), last = path.at( - 1 );
	say( path.length > 20 && into === 0 && last && last[ 2 ] === 0, `leaving the stem for the open water, ${ path.length } frames on Robin's screen (${ lay } at her spare or on her way from it): never in the pier head or its stem (${ into }); the largest step ${ step.toFixed( 2 ) } m at ${ rate } fps` );

}

if ( PART === 'yard' ) {

	// (2) a second cradle in Marta's yard: both their lobster boats hauled out, each on the cradle on her own game; on each screen,
	// the other's on the second, on blocks of her own
	const owner = await G.open( 'Robin', 'lobster', 20 ), guest = await G.open( 'Sam', 'lobster', 20 );
	await ready( owner, guest );
	// (as Marta hauls her ahead of a hurricane: held there, as she would be till it's gone by, Game.relaunch kept for after)
	const haul = ( who ) => who.game.evaluate( () => { const g = window.__app.game; window.__relaunch = g.relaunch; g.relaunch = function () {}; g.state.hauled = true; window.__app.boatCtl.setHauled( g.cradle ); } );
	await haul( owner );
	await haul( guest );
	// (looking at the yard from its edge)
	for ( const [ who, x ] of [ [ owner, 99 ], [ guest, 92 ] ] ) await who.game.evaluate( ( x ) => { const a = window.__app, p = a.player; p.position.set( x, p.groundAt( x, - 84, 20 ), - 84 ); p.velocity.set( 0, 0, 0 ); p.yaw = - 0.12; p.pitch = - 0.12; }, x );
	const look = ( who ) => who.game.evaluate( async ( other ) => { const { SPARE_YARD } = await import( '/src/world/village/StormPlaces.js' ); const a = window.__app, o = eval( other ), f = o.cur && ( o.cur.drawn || o.cur.boat ), s = SPARE_YARD.lobster; return { kind: o.spot && o.spot.kind, at: f && +Math.hypot( f.pos.x - s.x, f.pos.z - s.z ).toFixed( 2 ), mine: +a.boatCtl.position.distanceTo( a.game.cradle.position ).toFixed( 2 ), shown: !! ( ( o.boat && o.boat.visible ) || ( o.stand && o.stand.visible ) ), blocks: !! ( o.blocks && o.blocks.visible ) }; }, other );
	await until( owner.game, `${ other }.spot && ${ other }.spot.kind === 'yard'`, 120000 ).catch( () => {} );
	await until( guest.game, `${ other }.spot && ${ other }.spot.kind === 'yard'`, 120000 ).catch( () => {} );
	await frames( owner.game, 10 );
	await frames( guest.game, 10 );
	const a = await look( owner ), b = await look( guest );
	say( a.kind === 'yard' && a.at < 0.5 && a.mine < 0.1 && a.shown && a.blocks, `Robin's on the cradle on her game; Sam's on the yard's second, ${ a.at } m from it, on blocks of her own: ${ JSON.stringify( a ) }` );
	say( b.kind === 'yard' && b.at < 0.5 && b.mine < 0.1 && b.shown && b.blocks, `and the same on Sam's: ${ JSON.stringify( b ) }` );
	await shot( owner, 'together-yard' );
	await guest.game.evaluate( () => { const g = window.__app.game; g.relaunch = window.__relaunch; g.relaunch(); } );
	await until( owner.game, `! ${ other }.spot || ${ other }.spot.kind !== 'yard'`, 120000 ).catch( () => {} );
	await frames( owner.game, 6 );
	const c = await owner.game.evaluate( ( other ) => { const o = eval( other ); return { spot: o.spot && o.spot.kind, blocks: !! ( o.blocks && o.blocks.visible ), z: o.cur && o.cur.boat && Math.round( o.cur.boat.pos.z ) }; }, other );
	say( c.spot !== 'yard' && ! c.blocks && c.z > 0, `Sam's put back in: his copy's off the yard and its blocks gone, ${ JSON.stringify( c ) }` );

}

if ( PART === 'tray' ) {

	// (3) Marta's shell tray from the group's save: Robin gives her a whole set; Sam, who has none, sees it laid out
	const owner = await G.open( 'Robin', 'kayak', 20, { group: `tray-${ Date.now() }` } );
	const group = await owner.page.evaluate( () => new URLSearchParams( location.search ).get( 'group' ) );
	const guest = await G.open( 'Sam', 'kayak', 20, { group } );
	await ready( owner, guest );
	await owner.game.evaluate( async () => { const { SHELL_KINDS } = await import( '/src/game/Shells.js' ); const g = window.__app.game, S = g.state.shells; for ( const k of SHELL_KINDS ) S.have[ k ] = { day: 1, id: k }; g.giveShells(); } );
	await until( guest.game, `window.__app.together.tray && window.__app.together.tray.who === 'Robin'`, 60000 ).catch( () => {} );
	await until( guest.game, '!! window.__app.beachcomb', 2400000 ).catch( () => {} ); // (after the debris: a CPU's last late stage)
	await frames( guest.game, 6 );
	const s = await guest.game.evaluate( () => { const a = window.__app; return { tray: a.together.tray, wall: !! ( a.beachcomb && a.beachcomb.wall ), mine: a.game.state.shells.wall }; } );
	say( s.tray && s.tray.who === 'Robin' && s.wall && s.mine === null, `Sam, with no set of his own (${ s.mine }), sees Robin's in Marta's tray: ${ JSON.stringify( s ) }` );
	// (and someone joining later reads it from the group's save)
	await guest.page.close();
	const late = await G.open( 'Alex', 'kayak', 20, { group } );
	await until( late.game, `window.__app.together.tray && window.__app.together.tray.who === 'Robin'`, 60000 ).catch( () => {} );
	say( await late.game.evaluate( () => !! ( window.__app.together.tray && window.__app.together.tray.who === 'Robin' ) ), 'and Alex, coming later, reads it from the group\'s save' );

}

if ( PART === 'hold' ) {

	// (4) a fish too big for a guest's own hold goes in hers: still his, his to sell; her owner's room is less by it
	const owner = await G.open( 'Robin', 'sportfisher', 20 ), guest = await G.open( 'Sam', 'kayak', 20 );
	await ready( owner, guest );
	await G.buy( owner );
	await toasts( owner );
	say( await G.aboard( owner, guest ), 'Sam\'s aboard the sportfisher' );
	await G.toSea( owner, { x: - 900, z: 900 } );
	await until( guest.game, 'window.__app.game.state.aboardHold && window.__app.game.state.aboardHold.room > 100', 60000 ).catch( () => {} );
	const before = await guest.game.evaluate( () => { const st = window.__app.game.state; return { hold: st.aboardHold && { ...st.aboardHold }, cooler: st.stats.holdKg }; } );
	const roomBefore = await owner.game.evaluate( () => { const st = window.__app.game.state; return st.stats.holdKg - st.holdKg - st.lent; } );
	const caught = await guest.game.evaluate( () => { const g = window.__app.game, f = g.state.addFish( 'yellowfin', 42, g.hour, { day: g.tradeDay } ), L = g.state.lastCatch; return { kept: L.kept, stowed: L.stowed, aboard: f && f.aboard, inCooler: g.state.holdKg, worth: g.state.holdValue, log: !! g.state.log.yellowfin }; } );
	say( caught.kept && caught.stowed === 'Robin' && caught.aboard === 'robin-1' && caught.inCooler === 0 && caught.worth > 0 && caught.log, `a 42 kg yellowfin, his cooler ${ before.cooler } kg, her hold's room ${ before.hold && before.hold.room } kg: in her hold, still his: ${ JSON.stringify( caught ) }` );
	await until( owner.game, 'window.__app.game.state.lent > 40', 60000 ).catch( () => {} );
	const after = await owner.game.evaluate( () => { const st = window.__app.game.state; return { lent: st.lent, room: st.stats.holdKg - st.holdKg - st.lent, toasts: window.__toasts.filter( ( t ) => /hold/.test( t ) ) }; } );
	say( after.lent === 42 && Math.abs( roomBefore - after.room - 42 ) < 0.01, `on Robin's game her hold has 42 kg of his in it: room ${ roomBefore } to ${ after.room } kg; ${ JSON.stringify( after.toasts ) }` );
	const small = await guest.game.evaluate( () => { const g = window.__app.game, f = g.state.addFish( 'muttonSnapper', 3, g.hour, { day: g.tradeDay } ); return { aboard: f && f.aboard, inCooler: g.state.holdKg }; } );
	say( ! small.aboard && small.inCooler === 3, 'one that fits his cooler goes in it, as the user had it' );
	// (his to sell: off her and ashore, Joe buys it of him)
	const sold = await guest.game.evaluate( () => { const st = window.__app.game.state, was = st.money, n = st.inventory.length; const r = st.sell(); return { n, count: r.count, total: r.total, money: st.money - was, left: st.inventory.length }; } );
	say( sold.count === 2 && sold.money > 0 && sold.left === 0, `his to sell: ${ sold.count } fish to Joe for $${ sold.money }, the tuna among them` );
	await until( owner.game, 'window.__app.game.state.lent === 0', 60000 ).catch( () => {} );
	say( await owner.game.evaluate( () => window.__app.game.state.lent === 0 ), 'and her hold\'s room is hers again' );

}

if ( PART === 'pearl' ) {

	// (7) Pearl's berth looks at a guest's boat at her jetty too: Robin's boat stopped in it, Sam at the camp; she lies off on both
	const owner = await G.open( 'Robin', 'lobster', 20 ), guest = await G.open( 'Sam', 'kayak', 20 );
	await ready( owner, guest );
	const day = await owner.game.evaluate( () => { const a = window.__app; let d = a.settings.day; if ( d % 7 === 0 ) d ++; a.together.setClock( 13, d, 0.0001 ); return d; } );
	for ( const who of [ owner, guest ] ) await who.game.evaluate( () => { const a = window.__app, p = a.player; p.position.set( 106, p.groundAt( 106, - 836, 30 ), - 836 ); p.velocity.set( 0, 0, 0 ); p.yaw = 0; } );
	// (the camp's built once the debris is placed, the last of a CPU's late stages: minutes in, many on a busy machine)
	const built = ( who, ms ) => until( who.game, '!! ( window.__app.game.camp && window.__app.game.camp.boat )', ms ).catch( async ( e ) => { note( `${ who.name }'s camp not built:`, JSON.stringify( await who.game.evaluate( () => { const a = window.__app; return { debris: !! a.debris, built: a.game.camp.built, mats: !! ( a.village && a.village.materials ), at: [ Math.round( a.camera.position.x ), Math.round( a.camera.position.z ) ] }; } ) ) ); throw e; } );
	await built( guest, 2400000 );
	await built( owner, 600000 );
	await frames( guest.game, 20 );
	const was = await guest.game.evaluate( () => { const b = window.__app.game.camp.boat; return { off: b.off, kind: b.kind }; } );
	await owner.game.evaluate( () => { const a = window.__app, b = a.boatCtl; b.moored = false; b.beached = false; b.anchor = null; b.driven = false; b.position.set( 114.3, b.position.y, - 880 ); b.velocity.set( 0, 0, 0 ); b.angular.set( 0, 0, 0 ); } );
	await until( guest.game, `${ other }.cur.boat && Math.hypot( ${ other }.cur.boat.pos.x - 114.3, ${ other }.cur.boat.pos.z + 880 ) < 5`, 120000 ).catch( () => {} );
	await until( guest.game, 'window.__app.game.camp.boat.off', 120000 ).catch( () => {} );
	const off = await guest.game.evaluate( () => { const b = window.__app.game.camp.boat; return { off: b.off, kind: b.kind, at: [ Math.round( b.mesh.position.x ), Math.round( b.mesh.position.z ) ] }; } );
	const hers = await owner.game.evaluate( () => window.__app.game.camp.boat.off );
	say( ! was.off && off.off && hers, `at 13:00 on day ${ day } she's alongside (${ was.kind }); with Robin's boat stopped in her berth she lies off on Sam's game too (${ JSON.stringify( off ) }), as on Robin's (${ hers })` );
	await owner.game.evaluate( () => { const b = window.__app.boatCtl; b.position.set( 300, b.position.y, - 1100 ); } );
	await until( guest.game, '! window.__app.game.camp.boat.off', 120000 ).catch( () => {} );
	say( await guest.game.evaluate( () => ! window.__app.game.camp.boat.off ), 'and comes in once she\'s gone' );

}

if ( PART === 'slow' ) {

	// (13) a slow game in company: her owner's game at 2 fps, the waves by the wall clock, and her worked out over all of it
	const owner = await G.open( 'Robin', 'lobster', 2 ), guest = await G.open( 'Sam', 'kayak', 20 );
	await ready( owner, guest );
	await owner.game.evaluate( () => window.__app.player.boardBoat() );
	await G.helm( owner );
	await G.toSea( owner, { x: - 900, z: 900 } );
	await owner.game.evaluate( () => window.__app.together.setWeather( 'breezy', 0 ) );
	await frames( owner.game, 6 );
	const r = await owner.game.evaluate( async () => {

		const { G: GL } = await import( '/src/core/Globals.js' );
		const a = window.__app, b = a.boatCtl, up = b.update, R = window.__draws;
		// (each frame: the water's time it went by, and the boat's worked out over)
		let boat = 0, n = 0, t = GL.time.value;
		const rows = [];
		b.update = function ( dt ) { boat += dt; return up.call( this, dt ); };
		const f0 = R.frames, w0 = performance.now(), heave = [];
		await new Promise( ( done ) => { const f = () => { rows.push( [ GL.time.value - t, boat ] ); t = GL.time.value; boat = 0; heave.push( [ b.position.y, a.waves.heightAt( b.position.x, b.position.z ) ] ); if ( ++ n >= 40 ) { R.after.splice( R.after.indexOf( f ), 1 ); done(); } }; R.after.push( f ); } );
		b.update = up;
		const frames = R.frames - f0, sea = rows.reduce( ( s, q ) => s + q[ 0 ], 0 ), worked = rows.reduce( ( s, q ) => s + q[ 1 ], 0 );
		const m = ( k ) => heave.reduce( ( s, v ) => s + v[ k ], 0 ) / heave.length, my = m( 0 ), mw = m( 1 );
		let c = 0, vy = 0, vw = 0;
		for ( const [ y, w ] of heave ) { c += ( y - my ) * ( w - mw ); vy += ( y - my ) ** 2; vw += ( w - mw ) ** 2; }
		const kept = rows.filter( ( q ) => q[ 0 ] > 0.1 && Math.abs( q[ 1 ] - q[ 0 ] ) < 0.01 * q[ 0 ] + 1e-3 ).length, slow = rows.filter( ( q ) => q[ 0 ] > 0.1 ).length;
		return { sea: +sea.toFixed( 2 ), boat: +worked.toFixed( 2 ), frames, fps: +( frames / ( performance.now() - w0 ) * 1000 ).toFixed( 1 ), corr: +( c / Math.sqrt( vy * vw ) ).toFixed( 2 ), kept, slow, longest: +Math.max( ...rows.map( ( q ) => q[ 0 ] ) ).toFixed( 2 ) };

	} );
	say( r.fps < 10 && r.kept === r.slow && Math.abs( r.boat / r.sea - 1 ) < 0.02, `her owner's game at ${ r.fps } fps: of ${ r.frames } frames, ${ r.slow } over 0.1 s (the longest ${ r.longest } s), each worked out over all the water's time it went by (${ r.kept }); the sea's gone ${ r.sea } s by and she's been worked out over ${ r.boat } s of it (M16: 0.1 s a frame, ${ ( r.frames * 0.1 ).toFixed( 1 ) }); her heave with the water under her ${ r.corr }` );

}

await G.end( `together ${ PART }` );
