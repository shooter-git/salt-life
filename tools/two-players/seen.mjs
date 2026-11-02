// (M16) What had never been run with two games: what's seen of someone's boat and what they do with her, read and shot from the other's game.
//   tools/render-slot.sh node tools/two-players/seen.mjs [dir] [port] <part>
//   parts: fights  kite  kayak  looks  flares  glasses  stern  north  orange
import { OTHER as other, start } from './lib.mjs';
const [ out = 'qa-output', PORT = '5221', PART = 'fights' ] = process.argv.slice( 2 );
const G = await start( { out, port: PORT, drawing: PART === 'north' } ); // (the north side's built only after what the game does in its rests)
const { say, note, until, frames, press, shot } = G;
const SEA = { x: - 2600, z: 3000 };
const ready = async ( owner, guest ) => {

	// (a clock set for a look isn't a rest, on either game)
	for ( const w of [ owner, guest ] ) await w.game.evaluate( () => { const d = window.__app.game.daysOut; if ( ! window.__noDrift ) { window.__noDrift = setInterval( () => { d._T = null; }, 200 ); } } );

	await until( guest.game, `${ other } && ${ other }.cur` );
	await until( owner.game, `${ other } && ${ other }.cur` );

};

// a look from where you like in her frame: the camera's put after the player's had it, so the sea and everything else follows it
const still = async ( who, name, from, at ) => {

	await who.game.evaluate( ( [ from, at ] ) => {

		const a = window.__app, R = window.__draws, P = a.camera.position.constructor;
		const q = () => a.together.others.values().next().value;
		const toW = ( v, base ) => base ? new P( v[ 0 ], v[ 1 ], v[ 2 ] ).applyQuaternion( base.quaternion ).add( base.position ) : new P( v[ 0 ], v[ 1 ], v[ 2 ] );
		window.__camHook = () => { const o = q(), base = o && o.boat && o.boat.visible ? o.boat : null; a.camera.position.copy( toW( from, base ) ); a.camera.lookAt( toW( at, base ) ); a.camera.updateMatrixWorld(); };
		R.after.push( window.__camHook );
		R.end.push( window.__camHook );

	}, [ from, at ] );
	const r = await shot( who, name );
	await who.game.evaluate( () => { const R = window.__draws; R.after.splice( R.after.indexOf( window.__camHook ), 1 ); R.end.splice( R.end.indexOf( window.__camHook ), 1 ); } );
	return r;

};

const stand = ( who, x, z, y = 0 ) => who.game.evaluate( ( [ x, y, z ] ) => { const a = window.__app, p = a.player; p.mode = 'swim'; p.position.set( x, y, z ); p.velocity.set( 0, 0, 0 ); }, [ x, y, z ] );
const atSea = async ( who, F = SEA, heading = 0 ) => {

	await who.game.evaluate( ( [ F, heading ] ) => { const a = window.__app, p = a.player, b = a.boatCtl; if ( p.mode !== 'boat' && p.mode !== 'deck' ) { if ( a.boat.seated ) p.enterBoat(); else p.boardBoat(); } b.moored = false; b.beached = false; b.anchor = null; a.boat.sliding = null; b.position.set( F.x, b.position.y, F.z ); b.velocity.set( 0, 0, 0 ); b.angular.set( 0, 0, 0 ); b.quaternion.setFromAxisAngle( a.camera.up.clone().set( 0, 1, 0 ), heading ); }, [ F, heading ] );

};

// a fish on the rod of a spread (as aboard.mjs: the spread's real, its bite's placed)
const spread = ( owner, species, kg ) => owner.game.evaluate( async ( [ species, kg ] ) => {

	const { BAIT_IDS, BAITS } = await import( '/src/game/Bait.js' );
	const a = window.__app, r = a.game.rigs, spots = r.spots(), V = a.camera.position.constructor, bait = BAIT_IDS.find( ( k ) => BAITS[ k ].tow );
	const mk = ( spot, on ) => ( { spot, bait, len: 30, p: new V(), tip: new V(), clip: null, butt: new V(), on, in: false, torn: 0, bend: 0 } );
	r.lines.length = 0;
	for ( const s of spots ) { const L = mk( s, null ); r._place( L ); L.p.copy( L.tip ); r.lines.push( L ); }
	if ( species ) r.lines[ 0 ].on = { species, kg, t: - 600, place: null, at: { x: a.boatCtl.position.x, z: a.boatCtl.position.z } };
	r._trollT = 1e9;
	return r.lines.length;

}, [ species, kg ] );

// the game's own fight, on real keys: F held to reel, let go past the top of the green band. The chair's as it comes
const fightIt = async ( guest, label, ms = 600000 ) => {

	const t0 = Date.now();
	let held = false, last = 0, maxT = 0;
	for ( ;; ) {

		const s = await guest.game.evaluate( () => { const a = window.__app, f = a.game.fight; return f ? { on: true, t: f.tension, hi: f.band[ 1 ], lo: f.band[ 0 ], d: f.distance, st: f.stamina, kg: f.kg, arms: f.arms, surge: f.surge, hold: f.holdKg, chair: f.chair } : { on: false, riding: a.player.riding, mode: a.player.mode }; } );
		if ( ! s.on ) {

			if ( held ) await guest.page.keyboard.up( 'KeyF' );
			note( `${ label }: the fight's over after ${ Math.round( ( Date.now() - t0 ) / 1000 ) } s, ${ JSON.stringify( s ) }` );
			return s;

		}

		maxT = Math.max( maxT, s.t );
		if ( Date.now() - last > 30000 ) { last = Date.now(); note( `${ label }: ${ Math.round( ( Date.now() - t0 ) / 1000 ) } s: tension ${ s.t.toFixed( 2 ) } of [ ${ s.lo.toFixed( 2 ) }, ${ s.hi.toFixed( 2 ) } ], line ${ s.d.toFixed( 1 ) } m, stamina ${ s.st.toFixed( 2 ) }, arms ${ s.arms.toFixed( 2 ) }, holds ${ s.hold } kg, chair ${ s.chair }` ); }
		const want = s.t < s.hi * 0.8 && s.surge < 0.6;
		if ( want !== held ) { held = want; if ( want ) await guest.page.keyboard.down( 'KeyF' ); else await guest.page.keyboard.up( 'KeyF' ); }
		if ( Date.now() - t0 > ms ) { if ( held ) await guest.page.keyboard.up( 'KeyF' ); note( `${ label }: gave up after ${ ms / 1000 } s` ); return s; }
		await guest.page.waitForTimeout( 80 );

	}

};

const hold = ( who ) => who.game.evaluate( () => { const g = window.__app.game, s = g.state; return { fish: ( s.hold || s.catch || s.fish || [] ).length, last: s.lastCatch ? { species: s.lastCatch.species, kg: s.lastCatch.kg, released: s.lastCatch.released } : null, money: s.money, log: Object.keys( s.log || {} ).length }; } );

// ---- a guest fights a fish from her chair through to the catch; a rider takes a rod off her spread and fights it through
if ( PART === 'fights' ) {

	const owner = await G.open( 'Robin', 'sportfisher', 30 ), guest = await G.open( 'Sam', 'lobster', 30 );
	await ready( owner, guest );
	await G.buy( owner );
	// (his own tackle: the top of each track that isn't a boat's)
	await guest.game.evaluate( async () => { const { UPGRADES } = await import( '/src/game/Gear.js' ); const g = window.__app.game, u = g.state.upgrades; for ( const [ k, t ] of Object.entries( UPGRADES ) ) if ( ! t.on ) u[ k ] = t.levels.length - 1; g.applyGear(); } );
	note( 'his tackle:', JSON.stringify( await guest.game.evaluate( () => { const s = window.__app.game.state.stats; return { lineKg: s.lineKg, dragKg: s.dragKg, reelSpeed: s.reelSpeed, spoolM: s.spoolM, landKg: s.landKg, standUp: s.standUp }; } ) ) );
	say( await G.aboard( owner, guest ), 'Sam\'s aboard the sportfisher' );
	await G.helm( owner );
	await G.toSea( owner );
	await until( guest.game, `Math.hypot( window.__app.player.boat.position.x + 2600, window.__app.player.boat.position.z - 3000 ) < 300` );
	const sawn = {};
	await owner.game.evaluate( () => { const g = window.__app.game, was = g.toast; window.__toasts = []; g.toast = function ( t, ms ) { window.__toasts.push( t ); return was.call( this, t, ms ); }; } );
	await guest.game.evaluate( () => { const g = window.__app.game, was = g.toast; window.__toasts = []; g.toast = function ( t, ms ) { window.__toasts.push( t ); return was.call( this, t, ms ); }; } );

	const takeRod = async () => {

		await until( guest.game, `${ other }.cur.spread && ${ other }.cur.spread.some( ( x ) => x.on )`, 90000 );
		await guest.game.evaluate( `( async () => { const { rodOf } = await import( '/src/together/Spread.js' ); const p = window.__app.player, V = p.deckPos.constructor, at = { butt: new V(), tip: new V(), clip: new V() }, L = ${ other }.cur.spread.find( ( x ) => x.on ); rodOf( p.boat.model, L, at ); const y = p.deckGroundAt( at.butt.x * 0.8, at.butt.z + 0.5, at.butt.y ); p.deckPos.set( at.butt.x * 0.8, y, at.butt.z + 0.5 ); p.deckVel.set( 0, 0, 0 ); } )()` );
		await frames( guest.game, 4 );
		const told = await guest.game.evaluate( () => { const r = window.__app.game.rigs; return r.alert ? r.alert.text : null; } );
		await press( guest, 'KeyR', 3 );
		await until( guest.game, '!! window.__app.game.fight', 60000 ).catch( () => {} );
		return { told, fight: await guest.game.evaluate( () => !! window.__app.game.fight ) };

	};

	// the rider's, standing: a schoolie mahi
	await spread( owner, 'mahi', 6 );
	const before = await hold( guest ), hers = await hold( owner );
	const r1 = await takeRod();
	say( r1.fight, `a rod goes off: told "${ r1.told }"; R and he has it` );
	const end1 = await fightIt( guest, 'mahi, standing' );
	await frames( guest.game, 6 );
	const after = await hold( guest ), hers2 = await hold( owner );
	note( 'his hold, before and after:', JSON.stringify( before ), JSON.stringify( after ), 'hers:', JSON.stringify( hers ), JSON.stringify( hers2 ) );
	note( 'his toasts:', JSON.stringify( await guest.game.evaluate( () => window.__toasts.splice( 0 ) ) ) );
	note( 'her toasts:', JSON.stringify( await owner.game.evaluate( () => window.__toasts.splice( 0 ) ) ) );
	say( after.last && after.last.species === 'mahi' && end1.riding && ( ! hers2.last || hers2.last.species !== 'mahi' ), `taken off her spread and fought through by keys: ${ JSON.stringify( after.last ) } is his, and he's still riding (${ end1.mode })` );
	await guest.game.evaluate( () => { const g = window.__app.game, h = g.hud; if ( h && h.catchOpen && h.closeCatch ) h.closeCatch(); } );
	await frames( guest.game, 4 );
	await shot( guest, 'seen-fights-after-mahi' );

	// from her chair: a tuna past the rod's arms, as far as the hook's in it. Up to three: one can throw the hook, as they do
	await owner.game.evaluate( () => { const r = window.__app.game.rigs; r.clearLines(); r._trollT = null; } );
	let got = null;
	for ( let i = 0; i < 3 && ! got; i ++ ) {

		await guest.game.evaluate( () => { const g = window.__app.game; g.cancelLine && g.cancelLine( true ); if ( g.hud && g.hud.catchOpen && g.hud.closeCatch ) g.hud.closeCatch(); } );
		await frames( guest.game, 3 );
		await spread( owner, 'yellowfin', 42 );
		const r2 = await takeRod();
		if ( ! r2.fight ) { say( false, 'the tuna\'s rod didn\'t come to him' ); break; }
		// to the chair, on foot, by put, and E
		await guest.game.evaluate( () => { const p = window.__app.player, s = p.boat.model.chair; p.deckPos.set( s.eye.x + 0.6, 0.5, s.eye.z + 0.6 ); p.deckVel.set( 0, 0, 0 ); } );
		await frames( guest.game, 3 );
		await press( guest, 'KeyE', 3 );
		await frames( guest.game, 3 );
		const c = await guest.game.evaluate( () => { const a = window.__app, g = a.game, f = g.fight; return { inChair: g.rigs.inChair, hold: f && f.holdKg, chair: f && f.chair, y: +a.player.deckPos.y.toFixed( 2 ) }; } );
		say( c.inChair && c.hold === 40, `in her chair by E, with the tuna on: ${ JSON.stringify( c ) }` );
		await until( owner.game, `${ other }.job === 'chair'`, 60000 ).catch( () => {} );
		const sees = await owner.game.evaluate( `( () => { const o = ${ other }; return { job: o.job, tag: o.tagName && o.tagName.nodeValue, sit: +( o.avatar._sit || 0 ).toFixed( 2 ) }; } )()` );
		say( sees.job === 'chair', `Robin sees him in it: ${ JSON.stringify( sees ) }` );
		if ( i === 0 ) {

			await guest.game.evaluate( () => { window.__keepDrawing = false; } );
			await shot( guest, 'seen-fights-chair-guest' );
			await owner.game.evaluate( () => { const a = window.__app, p = a.player; p.camMode = 'third'; p.orbitDist = 11; p.orbitYaw = a.boatCtl.getYaw() + 2.6; p.orbitPitch = 0.3; } );
			await frames( owner.game, 6 );
			await shot( owner, 'seen-fights-chair-owner' );
			await owner.game.evaluate( () => { window.__app.player.camMode = 'first'; } );

		}

		const end2 = await fightIt( guest, `tuna ${ i + 1 }, the chair` );
		await frames( guest.game, 6 );
		const l = await hold( guest );
		note( 'his last catch:', JSON.stringify( l ), 'toasts:', JSON.stringify( await guest.game.evaluate( () => window.__toasts.splice( 0 ) ) ) );
		if ( l.last && l.last.species === 'yellowfin' ) got = { ...l.last, riding: end2.riding, mode: end2.mode };
		const inC = await guest.game.evaluate( () => ( { inChair: window.__app.game.rigs.inChair, y: +window.__app.player.deckPos.y.toFixed( 2 ) } ) );
		note( 'after it:', JSON.stringify( inC ) );

	}

	say( !! got, `a guest fought a fish from her chair through to the catch: ${ JSON.stringify( got ) }` );
	await guest.game.evaluate( () => { const h = window.__app.game.hud; if ( h && h.catchOpen && h.closeCatch ) h.closeCatch(); } );
	note( 'her toasts:', JSON.stringify( await owner.game.evaluate( () => window.__toasts.splice( 0 ) ) ) );
	await frames( guest.game, 4 );
	await shot( guest, 'seen-fights-after-tuna' );

}

// ---- her spread and kite, seen on his game
if ( PART === 'kite' ) {

	const owner = await G.open( 'Robin', 'sportfisher', 30 ), guest = await G.open( 'Sam', 'lobster', 30 );
	await ready( owner, guest );
	await G.buy( owner );
	await owner.game.evaluate( async () => { const { UPGRADES } = await import( '/src/game/Gear.js' ); const g = window.__app.game, u = g.state.upgrades; for ( const [ k, t ] of Object.entries( UPGRADES ) ) if ( ! t.on ) u[ k ] = t.levels.length - 1; g.applyGear(); } );
	await owner.game.evaluate( () => { const a = window.__app; a.together.setWeather( 'breezy', 0 ); a.player.boardBoat(); a.player.takeHelm(); } );
	await G.toSea( owner );
	const n = await spread( owner, null, 0 );
	// (her kite, by the rig's own call: a live bait on the hook)
	const k = await owner.game.evaluate( async () => { const { G: GL } = await import( '/src/core/Globals.js' ); const a = window.__app, g = a.game, r = g.rigs; const p = a.player; p.leaveHelm(); await new Promise( ( d ) => setTimeout( d, 500 ) ); p.deckPos.set( 0, 0.5, - 4.8 ); g.state.bait.mullet = 6; g.state.baitPick = 'mullet'; r.pick = 'kite'; g.rod.equip( true ); try { r._flyKite(); } catch ( e ) { return { error: e.message }; } return { kite: !! r.kite, wind: +GL.windSpeed.value.toFixed( 1 ), up: r.kite && r.kite.up, down: r.kite && r.kite.down, avail: r.available( 'kite' ) }; } );
	note( 'her kite:', JSON.stringify( k ) );
	await owner.page.waitForTimeout( 20000 );
	const ku = await owner.game.evaluate( () => { const K = window.__app.game.rigs.kite; return K ? { up: +K.up.toFixed( 2 ), at: K.at.toArray().map( ( v ) => +v.toFixed( 1 ) ), down: K.down } : null; } );
	note( 'her kite up:', JSON.stringify( ku ) );
	// Sam's boat off her quarter, his game drawing
	await atSea( guest, { x: SEA.x + 14, z: SEA.z - 26 }, 0.4 );
	await until( guest.game, `( () => { const o = ${ other }; return o.boat && o.boat.visible && o.cur.spread && o.cur.spread.length === ${ n }; } )()`, 240000 );
	const seen = await guest.game.evaluate( `( () => { const o = ${ other }, D = window.__app.together.spread.draw; return { lines: o.cur.spread.length, kite: o.cur.kite, mesh: !! D, shown: !! ( D && D.mesh.visible ) }; } )()` );
	say( seen.lines === n && seen.shown, `her spread on his game, ${ n } lines: ${ JSON.stringify( seen ) }` );
	say( !! seen.kite, `and her kite: ${ JSON.stringify( seen.kite ) }` );
	await still( guest, 'seen-kite-quarter', [ 16, 3.5, - 30 ], [ 0, 3, - 10 ] );
	await still( guest, 'seen-kite-astern', [ 2, 6, - 22 ], [ 0, 8, 30 ] );
	if ( seen.kite ) await guest.game.evaluate( `( () => { window.__kt = ${ other }.cur.kite; } )()` );
	await still( guest, 'seen-kite-up', [ 30, 5, - 30 ], [ 0, 20, - 30 ] );
	await shot( guest, 'seen-kite-his-eyes' );

}

// ---- her anchor, crate and puck on another's copy; her paddle and capsize as others see them
if ( PART === 'kayak' ) {

	const owner = await G.open( 'Robin', 'kayak', 30 ), guest = await G.open( 'Sam', 'lobster', 30 );
	await ready( owner, guest );
	await owner.game.evaluate( () => { const p = window.__app.player; p.enterBoat(); } );
	await G.toSea( owner );
	await atSea( guest, { x: SEA.x + 9, z: SEA.z }, 0 );
	await until( guest.game, `( () => { const o = ${ other }; return o.boat && o.boat.visible && o.boat.userData.type === 'kayak'; } )()`, 240000 );
	const hullId = `( () => { const m = ${ other }.boat.getObjectByName( 'boat-hull' ); return { uuid: m.geometry.uuid, fit: ${ other }.cur.fit }; } )()`;
	const bare = await guest.game.evaluate( hullId );
	await still( guest, 'seen-kayak-bare', [ 2.6, 2.2, - 1.6 ], [ 0, 0.2, 0.2 ] );
	await G.buy( owner );
	await until( guest.game, `${ other }.cur.fit !== ${ bare.fit }`, 60000 );
	await frames( guest.game, 6 );
	const fitted = await guest.game.evaluate( hullId );
	say( fitted.uuid !== bare.uuid, `what's fitted changes her copy's own vertices: fit ${ bare.fit } to ${ fitted.fit }` );
	await still( guest, 'seen-kayak-fitted', [ 2.6, 2.2, - 1.6 ], [ 0, 0.2, 0.2 ] );
	// at anchor
	const shoal = await owner.game.evaluate( () => { const a = window.__app, T = a.terrainData; for ( let r = 150; r < 1500; r += 10 ) for ( let k = 0; k < 64; k ++ ) { const x = 60 + Math.cos( k / 64 * 6.283 ) * r, z = 40 + Math.sin( k / 64 * 6.283 ) * r, d = - T.heightAt( x, z ); if ( d > 4 && d < 8 && - T.heightAt( x + 12, z ) > 3 && - T.heightAt( x - 12, z ) > 3 ) return { x, z, d }; } return null; } );
	note( 'a shoal to anchor her on:', JSON.stringify( shoal ) );
	await G.toSea( owner, shoal );
	await atSea( guest, { x: shoal.x + 9, z: shoal.z }, 0 );
	await until( guest.game, `Math.hypot( ${ other }.cur.boat.pos.x - ${ shoal.x }, ${ other }.cur.boat.pos.z - ${ shoal.z } ) < 30`, 120000 );
	await frames( owner.game, 6 );
	const anc = await owner.game.evaluate( () => { const a = window.__app, b = a.boatCtl; a.game.dropAnchor(); return { anchorM: a.game.state.stats.anchorM, set: !! b.anchor }; } );
	await until( guest.game, `${ other }.cur.anchored`, 60000 ).catch( () => {} );
	await frames( guest.game, 8 );
	const anch = await guest.game.evaluate( `( () => { const o = ${ other }; const names = []; o.boat.traverse( ( m ) => { if ( m.isMesh && m.visible ) names.push( m.name ); } ); return { anchored: o.cur.anchored, names }; } )()` );
	say( anc.set && anch.anchored, `her anchor: down on her game ${ JSON.stringify( anc ) }, said to his: ${ JSON.stringify( anch ) }` );
	await still( guest, 'seen-kayak-anchored', [ 3, 1.6, 3.5 ], [ 0, 0.1, 1.4 ] );
	await owner.game.evaluate( () => { const b = window.__app.boatCtl; b.anchor = null; } );
	await G.toSea( owner );
	await atSea( guest, { x: SEA.x + 9, z: SEA.z }, 0 );
	await until( guest.game, `Math.hypot( ${ other }.cur.boat.pos.x + 2600, ${ other }.cur.boat.pos.z - 3000 ) < 30`, 120000 );
	// her stroke
	await owner.page.keyboard.down( 'KeyW' );
	await frames( owner.game, 12 );
	await until( guest.game, `${ other }.cur.kw && ${ other }.cur.kw[ 3 ] < 0.5`, 60000 ).catch( () => {} );
	const pose = `( () => { const o = ${ other }, b = o.boat, m = b.getObjectByName( 'boat-paddle' ), s = b.userData.model.seat.clone().applyQuaternion( b.quaternion ).add( b.position ); return { kw: o.cur.kw, paddle: m ? m.matrix.elements.slice( 12, 15 ).map( ( v ) => +v.toFixed( 3 ) ) : null, rot: m ? m.matrix.elements.slice( 0, 3 ).map( ( v ) => +v.toFixed( 3 ) ) : null, seat: +o.avatar.group.position.distanceTo( s ).toFixed( 3 ), shown: o.shown }; } )()`;
	const p0 = await guest.game.evaluate( pose );
	await frames( guest.game, 8 );
	await frames( owner.game, 8 );
	const p1 = await guest.game.evaluate( pose );
	say( p0.paddle && p1.rot.join() !== p0.rot.join() && p1.seat < 0.25, `her stroke on his copy: ${ JSON.stringify( p0.rot ) } to ${ JSON.stringify( p1.rot ) }, her figure ${ p1.seat } m from her seat, shown ${ p1.shown }` );
	await still( guest, 'seen-kayak-paddle', [ 2.2, 2.0, 2.2 ], [ 0, 0.4, 0 ] );
	await owner.page.keyboard.up( 'KeyW' );
	// with him on her tank well, then her capsize
	await guest.game.evaluate( () => { const p = window.__app.player; p.exitBoat ? p.exitBoat( null, 1 ) : 0; } );
	await frames( guest.game, 4 );
	const beside = `( () => { const a = window.__app, o = ${ other }, c = o.cur, f = c.drawn || c.boat, M = o.boat.userData.model, P = a.together.crew && M.perch ? M.perch : M.boardPoint, bp = M.boardPoint.clone().applyQuaternion( f.quat ).add( f.pos ); a.player.mode = 'swim'; a.player.position.set( bp.x + 1, bp.y, bp.z ); a.player.velocity.set( 0, 0, 0 ); return !! a.player.rideOffer; } )()`;
	const offered = await until( guest.game, beside, 60000 ).then( () => true, () => false );
	if ( offered ) {

		await guest.game.evaluate( () => { const p = window.__app.player; p.ride( p.rideOffer.boat ); } );
		await frames( guest.game, 4 );
		const r = await guest.game.evaluate( () => { const p = window.__app.player; return { riding: p.riding, mode: p.mode, deck: p.deckPos.toArray().map( ( v ) => +v.toFixed( 2 ) ) }; } );
		say( r.riding && r.mode === 'deck', `he's on her tank well: ${ JSON.stringify( r ) }` );

	} else say( false, 'no offer of her tank well' );

	await frames( owner.game, 4 );
	const roll = `( () => { const o = ${ other }, body = o.boat.getObjectByName( 'kayak-body' ); return { w: o.cur.kw && o.cur.kw[ 4 ], rot: body ? +body.rotation.z.toFixed( 2 ) : null, shown: o.shown, seen: o.boat.visible }; } )()`;
	await owner.game.evaluate( () => { const a = window.__app, p = a.player, g = a.game; a.boat.capsize( g, a.boatCtl, p, 1 ); } );
	await until( guest.game, `${ other }.cur.kw && ${ other }.cur.kw[ 4 ] === 1`, 60000 ).catch( () => {} );
	await until( guest.game, `Math.abs( ${ other }.boat.getObjectByName( 'kayak-body' ).rotation.z ) > 2.8`, 180000 ).catch( () => note( '(not over on his copy in time)' ) );
	const r2 = await guest.game.evaluate( roll );
	const who = await guest.game.evaluate( () => { const p = window.__app.player; return { riding: p.riding, mode: p.mode, y: +p.position.y.toFixed( 2 ), hadOwner: p.boat.owner || null }; } );
	note( 'the kayak over, on his game:', JSON.stringify( r2 ), 'the rider:', JSON.stringify( who ), 'her owner:', JSON.stringify( await owner.game.evaluate( () => { const a = window.__app; return { mode: a.player.mode, capsized: a.boat.capsized }; } ) ) );
	say( r2.w === 1 && r2.rot !== null && Math.abs( r2.rot ) > 2.2, `her capsize on his copy: she's over, ${ r2.rot } rad of pi` );
	if ( who.riding ) await guest.game.evaluate( () => { const p = window.__app.player; p.exitBoat( null, 1 ); } );
	await frames( guest.game, 3 );
	await atSea( guest, { x: SEA.x + 9, z: SEA.z }, 0 );
	await frames( guest.game, 6 );
	await still( guest, 'seen-kayak-capsized', [ 3.5, 2.4, - 2.5 ], [ 0, 0.2, 0.2 ] );
	// righted
	await owner.page.waitForTimeout( 1000 );
	await owner.game.evaluate( () => { const a = window.__app; a.boat.board( a.boatCtl, a.player ); } );
	await until( guest.game, `${ other }.cur.kw && ${ other }.cur.kw[ 4 ] === 0 && Math.abs( ${ other }.boat.getObjectByName( 'kayak-body' ).rotation.z ) < 0.3`, 240000 ).catch( () => note( '(not righted on his copy in time)' ) );
	const r3 = await guest.game.evaluate( roll );
	say( r3.w === 0 && Math.abs( r3.rot ) < 0.6, `righted, on his copy too: ${ JSON.stringify( r3 ) }` );

}

// ---- her pool of light, name and paint, by eye
if ( PART === 'looks' ) {

	const owner = await G.open( 'Robin', 'sportfisher', 30 ), guest = await G.open( 'Sam', 'lobster', 30 );
	await ready( owner, guest );
	await G.buy( owner );
	await owner.game.evaluate( () => { const a = window.__app, p = a.player; p.boardBoat(); p.takeHelm(); } );
	await G.toSea( owner );
	await atSea( guest, { x: SEA.x + 18, z: SEA.z - 18 }, 0 );
	await until( guest.game, `( () => { const o = ${ other }; return o.boat && o.boat.visible && o.boat.userData.type === 'sportfisher'; } )()`, 240000 );
	// dark: her lights come on of themselves
	await owner.game.evaluate( () => { const a = window.__app; a.game.daysOut._T = null; a.together.setClock( 22, a.settings.day, 0.0001 ); a.game.daysOut._T = null; } );
	await until( owner.game, 'window.__app.game.underOn > 0.5', 120000 ).catch( () => note( '(her lights not on)' ) );
	await until( guest.game, `${ other }.cur.under > 0.5`, 60000 ).catch( () => {} );
	await frames( guest.game, 6 );
	const u = await guest.game.evaluate( `( () => { const m = ${ other }.boat.getObjectByName( 'boat-underGlow' ); return { under: ${ other }.cur.under, glow: !! m, shown: !! m && m.visible, opacity: m ? +m.material.opacity.toFixed( 2 ) : 0 }; } )()` );
	say( u.shown && u.opacity > 0.3, `her pool of light on his copy: ${ JSON.stringify( u ) }` );
	await still( guest, 'seen-pool-astern', [ 6, 7, - 20 ], [ 0, 0, - 5 ] );
	await still( guest, 'seen-pool-beam', [ 18, 3, - 6 ], [ 0, 0, - 3 ] );
	await owner.game.evaluate( () => { const a = window.__app; a.game.daysOut._T = null; a.together.setClock( 10, a.settings.day, 0.0001 ); a.game.daysOut._T = null; } );
	await until( guest.game, `! ${ other }.cur.under`, 120000 ).catch( () => {} );
	// her paint, by day, on each boat she has; and her name
	for ( const [ id, paint, name ] of [ [ 'sportfisher', 'red', 'Salty Dog' ], [ 'console', 'red', 'Salty Dog' ], [ 'lobster', 'red', 'Salty Dog' ], [ 'kayak', 'red', 'Salty Dog' ] ] ) {

		if ( id !== 'sportfisher' ) {

			const ok = await owner.game.evaluate( async ( id ) => { const a = window.__app; a.player.mode === 'boat' && ! a.boat.seated && a.player.leaveHelm(); if ( a.player.mode === 'deck' ) a.player.exitBoat( null, 1 ); a.state.addBoat( id ); const r = await a.setBoat( id ); const p = a.player; if ( a.boat.seated ) p.enterBoat(); else { p.boardBoat(); p.takeHelm(); } return r; }, id );
			note( `Robin's in the ${ id }: ${ ok }` );
			await G.toSea( owner );

		}

		await owner.game.evaluate( ( [ paint, name ] ) => { const a = window.__app, r = a.game.state.fleet[ a.boat.id ]; if ( r ) { r.paint = paint; r.name = name; } }, [ paint, name ] );
		await until( guest.game, `( () => { const o = ${ other }; return o.boat && o.boat.visible && o.boat.userData.type === '${ id }' && o.boat.userData.model && ( o.cur.fit >> 4 ) === 8; } )()`, 240000 ).catch( () => note( `(her ${ id } not painted on his in time)` ) );
		await until( guest.game, `${ other }.boatName === '${ name }'`, 120000 ).catch( () => note( '(her name not come)' ) );
		await frames( guest.game, 6 );
		const pl = await guest.game.evaluate( `( () => { const o = ${ other }, b = o.boat, u = b.userData, M = u.model, hull = M.materials && M.materials.hull; let painted = 0, plain = 0; b.traverse( ( m ) => { if ( m.isMesh && m.userData.painted ) painted ++; else if ( m.isMesh && hull && m.material === hull ) plain ++; } ); return { type: u.type, name: o.boatName, plate: !! u.plate, shown: !! ( u.plate && u.plate.visible ), transom: !! M.transom, painted, plain, d: +b.position.distanceTo( window.__app.camera.position ).toFixed( 1 ) }; } )()` );
		say( pl.painted > 0 && ( ! pl.transom || pl.shown ), `the ${ id }, painted red and named on his copy: ${ JSON.stringify( pl ) }` );
		const len = { kayak: 3.7, console: 7, lobster: 8.2, sportfisher: 14.6 }[ id ];
		await still( guest, `seen-paint-${ id }-stern`, [ len * 0.3, 2 + len * 0.1, - len * 1.2 ], [ 0, 1, - len * 0.3 ] );
		await still( guest, `seen-paint-${ id }-side`, [ len * 1.0, 2.5, len * 0.2 ], [ 0, 1, 0 ] );

	}

}

// ---- her paint, her own game against his: both sides, close to, in a pale colour and a dark one; and her name
if ( PART === 'looks2' ) {

	const owner = await G.open( 'Robin', 'console', 30 ), guest = await G.open( 'Sam', 'kayak', 30 );
	await ready( owner, guest );
	await owner.game.evaluate( () => { const a = window.__app, p = a.player; p.boardBoat(); p.takeHelm(); } );
	await G.toSea( owner );
	await atSea( guest, { x: SEA.x + 18, z: SEA.z - 18 }, 0 );
	const lookOwn = ( side, name ) => owner.game.evaluate( ( side ) => { const a = window.__app, p = a.player; p.camMode = 'third'; p.orbitDist = 10; p.orbitPitch = 0.12; p.orbitYaw = a.boatCtl.getYaw() + side; }, side ).then( () => frames( owner.game, 4 ) ).then( () => shot( owner, name ) );
	for ( const id of [ 'console', 'lobster', 'sportfisher' ] ) {

		if ( id !== 'console' ) {

			await owner.game.evaluate( async ( id ) => { const a = window.__app; a.player.mode === 'boat' && a.player.leaveHelm(); if ( a.player.mode === 'deck' ) a.player.exitBoat( null, 1 ); a.state.addBoat( id ); await a.setBoat( id ); const p = a.player; p.boardBoat(); p.takeHelm(); }, id );
			await G.toSea( owner );

		}

		for ( const paint of [ 'seafoam', 'red' ] ) {

			await owner.game.evaluate( ( paint ) => { const a = window.__app, g = a.game, r = g.state.fleet[ a.boat.id ]; r.paint = paint; r.name = 'Salty Dog'; g.fleet._dirty = true; g.fleet.plateSign = null; }, paint );
			const code = await owner.game.evaluate( () => window.__app.together._fitted() );
			await until( guest.game, `( () => { const o = ${ other }; return o.boat && o.boat.visible && o.boat.userData.type === '${ id }' && o.cur.fit === ${ code }; } )()`, 240000 ).catch( () => note( `(her ${ id } not ${ paint } on his in time)` ) );
			await frames( guest.game, 6 );
			const len = { console: 7, lobster: 8.2, sportfisher: 14.6 }[ id ];
			await still( guest, `seen2-${ id }-${ paint }-his-port`, [ len * 0.9, 1.5, - len * 0.2 ], [ 0, 1, 0 ] );
			await still( guest, `seen2-${ id }-${ paint }-his-star`, [ - len * 0.9, 1.5, - len * 0.2 ], [ 0, 1, 0 ] );
			await still( guest, `seen2-${ id }-${ paint }-his-stern`, [ 1, 1.8, - len * 1.0 ], [ 0, 0.9, - len * 0.4 ] );
			await lookOwn( - Math.PI / 2, `seen2-${ id }-${ paint }-her-side` );
			await lookOwn( Math.PI, `seen2-${ id }-${ paint }-her-stern` );

		}

	}

}

// ---- a name, alone on her own game: is it on her transom for her, on each boat?
if ( PART === 'names' ) {

	const me = await G.open( 'Robin', 'lobster', 30 );
	await me.game.evaluate( () => { window.__keepDrawing = true; window.__go(); const a = window.__app, p = a.player; p.boardBoat(); p.takeHelm(); } );
	await G.toSea( me );
	for ( const id of [ 'lobster', 'sportfisher', 'kayak', 'console' ] ) {

		if ( id !== 'lobster' ) await me.game.evaluate( async ( id ) => { const a = window.__app; if ( a.player.mode === 'boat' && ! a.boat.seated ) a.player.leaveHelm(); if ( a.player.mode === 'deck' ) a.player.exitBoat( null, 1 ); a.state.addBoat( id ); await a.setBoat( id ); const p = a.player; if ( a.boat.seated ) p.enterBoat(); else { p.boardBoat(); p.takeHelm(); } }, id );
		await G.toSea( me );
		await me.game.evaluate( () => { const a = window.__app, g = a.game, r = g.state.fleet[ a.boat.id ]; r.paint = 'seafoam'; r.name = 'Salty Dog'; g.fleet._dirty = true; g.fleet.plateSign = null; } );
		await me.game.evaluate( () => { const a = window.__app, p = a.player; p.camMode = 'third'; p.orbitDist = a.boat.dimensions.length * 1.1; p.orbitPitch = 0.1; p.orbitYaw = a.boatCtl.getYaw() + Math.PI; } );
		await frames( me.game, 8 );
		const has = await me.game.evaluate( () => { const a = window.__app, n = a.boat.group.getObjectByName( 'boat-name' ); return { id: a.boat.id, plate: !! n, shown: !! ( n && n.visible ), at: n ? n.position.toArray().map( ( v ) => +v.toFixed( 2 ) ) : null, transom: a.boat.transom || null }; } );
		note( 'her name on her own game:', JSON.stringify( has ) );
		await shot( me, `seen-names-${ id }` ).catch( () => note( `(no shot of her ${ id })` ) );

	}

}

// ---- her name on his copy, each boat that has a stern to put it on, by eye
if ( PART === 'names2' ) {

	const owner = await G.open( 'Robin', 'lobster', 30 ), guest = await G.open( 'Sam', 'kayak', 30 );
	await ready( owner, guest );
	await owner.game.evaluate( () => { const a = window.__app, p = a.player; p.boardBoat(); p.takeHelm(); } );
	await G.toSea( owner );
	await atSea( guest, { x: SEA.x + 18, z: SEA.z - 18 }, 0 );
	for ( const id of [ 'lobster', 'sportfisher' ] ) {

		if ( id !== 'lobster' ) {

			await owner.game.evaluate( async ( id ) => { const a = window.__app; a.player.mode === 'boat' && a.player.leaveHelm(); if ( a.player.mode === 'deck' ) a.player.exitBoat( null, 1 ); a.state.addBoat( id ); await a.setBoat( id ); const p = a.player; p.boardBoat(); p.takeHelm(); }, id );
			await G.toSea( owner );

		}

		await owner.game.evaluate( () => { const a = window.__app, g = a.game, r = g.state.fleet[ a.boat.id ]; r.paint = 'seafoam'; r.name = 'Salty Dog'; g.fleet._dirty = true; g.fleet.plateSign = null; } );
		const code = await owner.game.evaluate( () => window.__app.together._fitted() );
		await until( guest.game, `( () => { const o = ${ other }; return o.boat && o.boat.visible && o.boat.userData.type === '${ id }' && o.cur.fit === ${ code } && o.boatName === 'Salty Dog' && o.boat.getObjectByName( 'boat-name' ); } )()`, 240000 ).catch( () => note( `(no name on her ${ id } on his copy in time)` ) );
		const r = await guest.game.evaluate( `( () => { const o = ${ other }, n = o.boat.getObjectByName( 'boat-name' ); return { id: o.boat.userData.type, name: o.boatName, plate: !! n, shown: !! ( n && n.visible ), at: n ? n.position.toArray().map( ( v ) => +v.toFixed( 2 ) ) : null, d: +o.boat.position.distanceTo( window.__app.camera.position ).toFixed( 1 ) }; } )()` );
		say( r.plate && r.shown, `her name on his copy of the ${ id }: ${ JSON.stringify( r ) }` );
		const len = { lobster: 8.2, sportfisher: 14.6 }[ id ];
		await still( guest, `seen-names2-${ id }`, [ 0.5, 1.6, - len * 0.75 ], [ 0, 0.8, - len * 0.4 ] );

	}

}

// ---- flares
if ( PART === 'flares' ) {

	const owner = await G.open( 'Robin', 'lobster', 30 ), guest = await G.open( 'Sam', 'console', 30 );
	await ready( owner, guest );
	await owner.game.evaluate( async () => { const { UPGRADES } = await import( '/src/game/Gear.js' ); const g = window.__app.game, u = g.state.upgrades; for ( const [ k, t ] of Object.entries( UPGRADES ) ) if ( ! t.on ) u[ k ] = t.levels.length - 1; g.applyGear(); } );
	await owner.game.evaluate( () => { const a = window.__app, p = a.player; p.boardBoat(); p.takeHelm(); } );
	await G.toSea( owner );
	await guest.game.evaluate( () => { const g = window.__app.game, was = g.toast; window.__toasts = []; g.toast = function ( t, ms ) { window.__toasts.push( t ); return was.call( this, t, ms ); }; } );
	for ( const [ m, hour, name ] of [ [ 1500, 10, 'day-1500m' ], [ 4000, 22, 'night-4km' ], [ 26000, 10, 'day-26km' ] ] ) {

		await owner.game.evaluate( ( hour ) => { const a = window.__app; a.together.setClock( hour, a.settings.day, 0.0001 ); a.game.daysOut._T = null; a.game.state.days.flares = 3; }, hour );
		await atSea( guest, { x: SEA.x + m, z: SEA.z }, - Math.PI / 2 );
		await until( guest.game, `Math.hypot( ${ other }.cur.boat.pos.x + 2600, ${ other }.cur.boat.pos.z - 3000 ) < 300`, 120000 ).catch( () => {} );
		await frames( guest.game, 6 );
		await guest.game.evaluate( ( [ x, z ] ) => { const a = window.__app, p = a.player; p.pitch = 0.1; }, [ 0, 0 ] );
		const fired = await owner.game.evaluate( () => window.__app.game.daysOut.fire( 'flare' ) );
		await guest.page.waitForTimeout( 2600 );
		const seen = await guest.game.evaluate( () => { const d = window.__app.game.daysOut, f = d.flare; return { sprite: !! f, shown: !! f && f.sprite.visible, y: f ? +f.sprite.position.y.toFixed( 0 ) : null, toasts: window.__toasts.splice( 0 ) }; } );
		note( `${ name }: fired (someone saw) ${ fired }; on his game ${ JSON.stringify( seen ) }` );
		if ( m < 20000 ) {

			say( seen.shown && seen.toasts.some( ( t ) => /flare/.test( t ) ), `her flare on his game, ${ name }: ${ JSON.stringify( seen ) }` );
			// (looking at it, the camera put after the player's had it; another flare if that one's burnt out by the time it's drawn)
			await guest.game.evaluate( () => { const a = window.__app, R = window.__draws; window.__camHook = () => { const f = a.game.daysOut.flare; if ( f ) { a.camera.lookAt( f.sprite.position.x, f.sprite.position.y + 8, f.sprite.position.z ); a.camera.updateMatrixWorld(); } }; R.after.push( window.__camHook ); R.end.push( window.__camHook ); window.__go(); } );
			await until( guest.game, 'window.__draws.peak.calls > 2', 120000 ).catch( () => {} );
			await owner.game.evaluate( () => { const a = window.__app; a.game.state.days.flares = 3; a.game.daysOut.fire( 'flare' ); } );
			await until( guest.game, 'window.__app.game.daysOut.flare.sprite.visible && window.__app.game.daysOut.flare.t < 6.5', 120000 ).catch( () => {} );
			await guest.page.screenshot( { path: `${ out }/seen-flare-${ name }.png` } );
			const at = await guest.game.evaluate( () => { const a = window.__app, s = a.game.daysOut.flare.sprite; return { shown: s.visible, y: +s.position.y.toFixed( 0 ), size: +s.scale.x.toFixed( 1 ), d: +s.position.distanceTo( a.camera.position ).toFixed( 0 ), left: +a.game.daysOut.flare.t.toFixed( 1 ) }; } );
			note( `the flare on his screen, ${ name }:`, JSON.stringify( at ) );
			await guest.game.evaluate( () => { const R = window.__draws; R.after.splice( R.after.indexOf( window.__camHook ), 1 ); R.end.splice( R.end.indexOf( window.__camHook ), 1 ); window.__stop(); } );

		} else say( ! seen.shown || seen.toasts.length === 0, `past the reach of the eye, 26 km: nothing told: ${ JSON.stringify( seen ) }` );
		await owner.page.waitForTimeout( 8000 );

	}

}

// ---- polarized glasses, a guest on her bridge and tower
if ( PART === 'glasses' ) {

	const owner = await G.open( 'Robin', 'sportfisher', 30 ), guest = await G.open( 'Sam', 'lobster', 30 );
	await ready( owner, guest );
	await G.buy( owner );
	await guest.game.evaluate( async () => { const { UPGRADES } = await import( '/src/game/Gear.js' ); const g = window.__app.game, u = g.state.upgrades; for ( const [ k, t ] of Object.entries( UPGRADES ) ) if ( t.levels.some( ( l ) => l.polarized ) ) u[ k ] = t.levels.findIndex( ( l ) => l.polarized ); g.applyGear(); } );
	say( await guest.game.evaluate( () => !! window.__app.game.state.stats.polarized ), 'Sam wears polarized glasses' );
	say( await G.aboard( owner, guest ), 'Sam\'s aboard the sportfisher' );
	await G.helm( owner );
	// (a place with something floating about: what the finds are by the clock, on her course)
	const F = await guest.game.evaluate( async () => { const { findsAbout } = await import( '/src/game/Finds.js' ); const { islandTime } = await import( '/src/game/Weather.js' ); const a = window.__app, s = a.settings, T = islandTime( s.day, s.timeOfDay ); const f = findsAbout( T, - 2600, 3000, 3000, { weed: [], debris: [], bait: [] }, ( x, z ) => - a.terrainData.heightAt( x, z ) ); const q = f.debris[ 0 ] || f.bait[ 0 ] || f.weed[ 0 ]; return { n: [ f.debris.length, f.bait.length, f.weed.length ], x: q ? q.x ?? q.x0 : - 2600, z: q ? q.z ?? q.z0 : 3000 }; } );
	note( 'finds thereabouts:', JSON.stringify( F ) );
	await G.toSea( owner, { x: F.x + 70, z: F.z + 40 } );
	await until( guest.game, `Math.hypot( window.__app.player.boat.position.x - ${ F.x + 70 }, window.__app.player.boat.position.z - ${ F.z + 40 } ) < 300` );
	const put = async ( x, y, z, yaw, pitch ) => guest.game.evaluate( ( [ x, y, z, yaw, pitch ] ) => { const p = window.__app.player; p.deckPos.set( x, y, z ); p.deckVel.set( 0, 0, 0 ); p.deckYaw = yaw; p.pitch = pitch; }, [ x, y, z, yaw, pitch ] );
	// aimed at the find from her frame
	const yawTo = () => guest.game.evaluate( ( F ) => { const a = window.__app, b = a.player.boat; return Math.atan2( F.x - b.position.x, F.z - b.position.z ) - b.getYaw(); }, F );
	const read = () => guest.game.evaluate( () => { const a = window.__app, g = a.game.rigs.glasses; return { worn: g.worn, shapes: g.shapes ? g.shapes.count : 0, shown: !! ( g.shapes && g.shapes.visible ), env: +a.water.material.envMapIntensity.toFixed( 3 ), base: +( g._base ?? 0 ).toFixed( 3 ), y: +a.camera.position.y.toFixed( 1 ) }; } );
	const yaw = await yawTo();
	await put( 0, 3.1, - 2.6, yaw, - 0.35 );
	await frames( guest.game, 8 );
	const bridge = await read();
	note( 'on her bridge, with them on:', JSON.stringify( bridge ) );
	await shot( guest, 'seen-glasses-bridge-on' );
	await put( 0, 7, - 0.53, yaw, - 0.45 );
	await frames( guest.game, 8 );
	const tower = await read();
	note( 'up her tower, with them on:', JSON.stringify( tower ) );
	await shot( guest, 'seen-glasses-tower-on' );
	say( tower.worn && tower.env < tower.base, `up her tower the glare's cut (${ tower.env } of ${ tower.base }), fish shapes drawn ${ tower.shapes } (shown ${ tower.shown }), on the bridge ${ bridge.shapes } (shown ${ bridge.shown })` );
	// and without them, as a look to set beside it
	await guest.game.evaluate( async () => { const { UPGRADES } = await import( '/src/game/Gear.js' ); const g = window.__app.game, u = g.state.upgrades; for ( const [ k, t ] of Object.entries( UPGRADES ) ) if ( t.levels.some( ( l ) => l.polarized ) ) u[ k ] = 0; g.applyGear(); } );
	await frames( guest.game, 6 );
	note( 'up her tower, without:', JSON.stringify( await read() ) );
	await shot( guest, 'seen-glasses-tower-off' );
	await put( 0, 3.1, - 2.6, yaw, - 0.35 );
	await frames( guest.game, 6 );
	await shot( guest, 'seen-glasses-bridge-off' );

}

// ---- the lobster boat's stern with her traps stowed: walked and fished from, alone and as a guest
if ( PART === 'stern' ) {

	const owner = await G.open( 'Robin', 'lobster', 30 ), guest = await G.open( 'Sam', 'console', 30 );
	await ready( owner, guest );
	await owner.game.evaluate( () => { const a = window.__app, g = a.game, st = g.state; st.upgrades.traps = 3; g.applyGear(); a.player.boardBoat(); } );
	await G.toSea( owner );
	await owner.page.waitForTimeout( 2000 );
	const stowed = await owner.game.evaluate( () => { const a = window.__app, w = a.game.traps, M = a.boat; if ( w._fit ) w._fit(); return { aboard: w.aboard ?? null, drawn: w.meshes ? w.meshes.traps.count : null, colliders: M.colliders.filter( ( c ) => c.trap || c.name === 'trap' ).length, all: M.colliders.length }; } );
	note( 'her traps:', JSON.stringify( stowed ) );
	await G.frames( owner.game, 6 );
	const aim = async ( who, x, z ) => who.game.evaluate( ( A ) => { const p = window.__app.player; p.deckYaw = Math.atan2( A.x - p.deckPos.x, A.z - p.deckPos.z ); }, { x, z } );
	const walkTo = async ( who, x, z, ms = 20000 ) => {

		await who.game.evaluate( ( A ) => { window.__aim = A; if ( ! window.__aimOn ) { window.__aimOn = true; window.__draws.after.push( () => { const A = window.__aim, p = window.__app.player; if ( A && p.mode === 'deck' ) p.deckYaw = Math.atan2( A.x - p.deckPos.x, A.z - p.deckPos.z ); } ); } }, { x, z } );
		await who.page.keyboard.down( 'KeyW' );
		const t0 = Date.now();
		let s;
		do {

			s = await who.game.evaluate( () => { const p = window.__app.player, d = p.deckPos; return { x: +d.x.toFixed( 2 ), y: +d.y.toFixed( 2 ), z: +d.z.toFixed( 2 ), mode: p.mode, floor: +p.deckGroundAt( d.x, d.z, d.y + 0.36 ).toFixed( 2 ) }; } );
			await who.page.waitForTimeout( 60 );

		} while ( Math.hypot( s.x - x, s.z - z ) > 0.3 && Date.now() - t0 < ms );
		await who.page.keyboard.up( 'KeyW' );
		await who.game.evaluate( () => { window.__aim = null; } );
		await frames( who.game, 3 );
		return { ...s, got: Math.hypot( s.x - x, s.z - z ) <= 0.35 };

	};

	const castFrom = async ( who ) => {

		await who.game.evaluate( ( ) => { const p = window.__app.player; p.deckYaw = Math.PI; p.pitch = 0; } );
		await press( who, 'KeyR', 2 );
		await frames( who.game, 6 );
		const eq = await who.game.evaluate( () => { const g = window.__app.game; return { equipped: g.rod.equipped, can: g.canFish, state: g.rod.state, why: window.__app.player.prompt && window.__app.player.prompt.text }; } );
		await who.page.keyboard.down( 'KeyF' );
		await who.page.waitForTimeout( 1500 );
		await who.page.keyboard.up( 'KeyF' );
		await who.game.waitForFunction( () => { const r = window.__app.game.rod; return r.state === 'floating' || r.state === 'idle'; }, null, { timeout: 120000, polling: 300 } ).catch( () => {} );
		const c = await who.game.evaluate( () => { const g = window.__app.game, r = g.rod; return { state: r.state, line: +( r.lineOut || 0 ).toFixed( 1 ), inWater: !! r.lineInWater, bobber: r.bobber ? r.bobber.toArray().map( ( v ) => +v.toFixed( 1 ) ) : null, boat: window.__app.player.boat.position.toArray().map( ( v ) => +v.toFixed( 1 ) ), told: g.hud && g.hud._toast ? g.hud._toast.textContent : null }; } );
		return { eq, c };

	};

	// alone, her own: from her cockpit to her stern, down the aisle between the stacks
	const spots = [ [ 'cockpit', 0, - 1.75 ], [ 'the aisle', 0, - 2.6 ], [ 'the stern, on her centreline', 0, - 3.5 ], [ 'starboard quarter (where her traps are)', 0.95, - 2.8 ], [ 'port quarter (where her traps are)', - 0.95, - 2.8 ], [ 'the stern again', 0, - 3.5 ] ];
	const alone = [];
	for ( const [ name, x, z ] of spots ) { const r = await walkTo( owner, x, z ); alone.push( r ); note( `Robin, her own, to ${ name }: at ${ r.x }, ${ r.y }, ${ r.z }, floor ${ r.floor }, got there ${ r.got }` ); }
	await owner.game.evaluate( () => { const p = window.__app.player; p.deckPos.set( 0, 0.35, - 1.2 ); p.deckVel.set( 0, 0, 0 ); p.deckYaw = 0; p.pitch = - 0.45; p.camMode = 'first'; } );
	await frames( owner.game, 3 );
	await owner.game.evaluate( () => { const p = window.__app.player; p.deckYaw = Math.PI; } );
	await frames( owner.game, 3 );
	await shot( owner, 'seen-stern-owner' );
	await owner.game.evaluate( () => { const p = window.__app.player; p.deckPos.set( 0, 0.35, - 3.5 ); p.deckVel.set( 0, 0, 0 ); } );
	await frames( owner.game, 3 );
	say( alone[ 2 ].got, 'her own stern with 8 traps stowed: walked by keys down the aisle to it' );
	const c1 = await castFrom( owner );
	note( 'Robin casts from it:', JSON.stringify( c1 ) );
	say( c1.c.state === 'floating' && c1.c.inWater, `and she fishes from it: rod ${ c1.c.state }, line ${ c1.c.line } m` );
	await shot( owner, 'seen-stern-owner-cast' );
	// (a fish on, played to the boat from there: the fight's the fight wherever you stand, so only that it can start)
	await owner.game.evaluate( () => { const g = window.__app.game; g.cancelLine( true ); g.rod.equip( false ); } );

	// as a guest, on her copy
	await stand( guest, SEA.x + 8, SEA.z );
	const riding = await G.aboard( owner, guest );
	say( riding, 'Sam\'s aboard her' );
	await guest.game.evaluate( () => { const p = window.__app.player; p.deckPos.set( 0, 0.35, - 1.75 ); p.deckVel.set( 0, 0, 0 ); } );
	await frames( guest.game, 4 );
	const asG = [];
	for ( const [ name, x, z ] of spots ) { const r = await walkTo( guest, x, z ); asG.push( r ); note( `Sam, a guest, to ${ name }: at ${ r.x }, ${ r.y }, ${ r.z }, floor ${ r.floor }, got there ${ r.got }` ); }
	const copyTraps = await guest.game.evaluate( () => { const a = window.__app, w = a.game.traps; return { colliders: a.player.boat.model.colliders.length, ownMeshes: w.meshes ? w.meshes.traps.count : null }; } );
	note( 'on his game:', JSON.stringify( copyTraps ) );
	await shot( guest, 'seen-stern-guest' );
	say( asG[ 2 ].got, 'on her copy as a guest: walked by keys to her stern' );
	await guest.game.evaluate( () => { const p = window.__app.player; p.deckPos.set( 0, 0.35, - 3.5 ); p.deckVel.set( 0, 0, 0 ); } );
	await frames( guest.game, 3 );
	const c2 = await castFrom( guest );
	note( 'Sam casts from it:', JSON.stringify( c2 ) );
	say( c2.c.state === 'floating' && c2.c.inWater, `and he fishes from it as a guest: rod ${ c2.c.state }, line ${ c2.c.line } m` );
	await shot( guest, 'seen-stern-guest-cast' );
	await owner.game.evaluate( () => { const a = window.__app, p = a.player; p.camMode = 'third'; p.deckPos.set( 0, 0.35, - 1.0 ); } );
	await shot( owner, 'seen-stern-owner-sees-guest' );

}

// ---- a guest whose own boat's a lobster boat too, with his traps stowed, on hers with none: are his traps in her way?
if ( PART === 'stern2' ) {

	const owner = await G.open( 'Robin', 'lobster', 30 ), guest = await G.open( 'Sam', 'lobster', 30 );
	await ready( owner, guest );
	await guest.game.evaluate( () => { const g = window.__app.game; g.state.upgrades.traps = 3; g.applyGear(); } );
	await owner.game.evaluate( () => { window.__app.player.boardBoat(); } );
	await G.toSea( owner );
	await stand( guest, SEA.x + 8, SEA.z );
	say( await G.aboard( owner, guest ), 'Sam\'s aboard hers, his own 8 traps stowed on his own' );
	const facts = await guest.game.evaluate( () => { const a = window.__app, p = a.player, solid = ( M ) => M.colliders.filter( ( c ) => c.solid ).length; return { walked: solid( p.boat.model ), mine: solid( a.boat ), same: p.boat.model === a.boat, drawnOnHisOwn: a.game.traps.meshes ? a.game.traps.meshes.traps.count : null }; } );
	note( 'his colliders on hers, and on his own:', JSON.stringify( facts ) );
	await guest.game.evaluate( () => { const p = window.__app.player; p.deckPos.set( 0, 0.35, - 2.6 ); p.deckVel.set( 0, 0, 0 ); p.deckYaw = Math.atan2( 0.95, - 0.2 ); } );
	await frames( guest.game, 3 );
	await guest.page.keyboard.down( 'KeyW' );
	await guest.game.evaluate( () => { window.__draws.after.push( () => { const p = window.__app.player; p.deckYaw = Math.atan2( 0.95 - p.deckPos.x, - 2.8 - p.deckPos.z ); } ); } );
	await frames( guest.game, 30 );
	await guest.page.keyboard.up( 'KeyW' );
	const at = await guest.game.evaluate( () => { const d = window.__app.player.deckPos; return { x: +d.x.toFixed( 2 ), z: +d.z.toFixed( 2 ) }; } );
	say( Math.hypot( at.x - 0.95, at.z + 2.8 ) < 0.4, `to her starboard quarter by keys, where his own traps would be on his own boat: at ${ at.x }, ${ at.z }` );
	await guest.game.evaluate( () => { const p = window.__app.player; p.deckYaw = Math.PI; p.pitch = - 0.45; p.deckPos.set( 0, 0.35, - 1.2 ); } );
	await frames( guest.game, 3 );
	await shot( guest, 'seen-stern2-guest' );

}

// ---- the north side, on both games: the turtles and Pearl's boat with Winston
if ( PART === 'north' ) {

	const owner = await G.open( 'Robin', 'lobster', 30 ), guest = await G.open( 'Sam', 'lobster', 30 );
	await ready( owner, guest );
	for ( const w of [ owner, guest ] ) await w.game.evaluate( () => { window.__keepDrawing = true; } );
	const put = ( who, x, z, yaw, pitch = - 0.05 ) => who.game.evaluate( ( [ x, z, yaw, pitch ] ) => { const a = window.__app, p = a.player; p.mode = 'walk'; p.position.set( x, Math.max( a.terrainData.heightAt( x, z ), a.colliders.groundHeightAt( x, z, 200 ) ) + 0.05, z ); p.velocity.set( 0, 0, 0 ); p.yaw = yaw; p.pitch = pitch; }, [ x, z, yaw, pitch ] );
	// the turtles: a night with one of them ashore, as each game works it out for itself. Both standing well clear, so neither game's Minding turns her
	const night = await guest.game.evaluate( async () => { const { femalesOf, femaleAt } = await import( '/src/game/Turtles.js' ); const a = window.__app, t = a.turtles, s = a.settings; for ( let d = s.day; d < s.day + 30; d ++ ) for ( const f of femalesOf( d ) ) { const P = t.plan( f ); for ( let i = 0; i < 80; i ++ ) { const h = f.arrive + i * 0.05, st = femaleAt( f, P, h % 24, d + Math.floor( h / 24 ), P.line ); if ( st && h - f.arrive > 0.3 ) return { d: d + Math.floor( h / 24 ), h: h % 24, id: f.id, x: f.x, phase: st.phase, nest: P.nest, up: P.up[ Math.floor( P.up.length / 2 ) ] }; } } return null; } );
	note( 'her night:', JSON.stringify( night ) );
	if ( night ) {

		await owner.game.evaluate( ( [ h, d ] ) => { const a = window.__app; a.together.setClock( h, d, 0.0001 ); a.game.daysOut._T = null; }, [ night.h, night.d ] );
		await guest.game.waitForFunction( ( [ h, d ] ) => window.__app.settings.day === d && Math.abs( window.__app.settings.timeOfDay - h ) < 0.2, [ night.h, night.d ], { timeout: 60000, polling: 500 } );
		const bx = night.up[ 0 ], bz = night.up[ 1 ];
		await put( owner, bx + 26, bz - 3, Math.atan2( 26, 3 ) );
		await put( guest, bx - 26, bz - 3, Math.atan2( - 26, 3 ) );
		await owner.page.waitForTimeout( 6000 );
		const tur = ( who ) => who.game.evaluate( () => { const t = window.__app.turtles, a = window.__app, list = []; for ( const [ id, F ] of t.females ) list.push( { id, x: +F.mesh.position.x.toFixed( 2 ), z: +F.mesh.position.z.toFixed( 2 ), shown: F.mesh.visible } ); return { list, turned: [ ...t.minding.turned.keys() ], hatchings: t.hatchings.size, tracks: t.tracks.size, near: t.group.visible, people: t.people.length, h: +a.settings.timeOfDay.toFixed( 3 ), d: a.settings.day }; } );
		const [ a1, b1 ] = await Promise.all( [ tur( owner ), tur( guest ) ] );
		note( 'Robin\'s turtles:', JSON.stringify( a1 ) );
		note( 'Sam\'s turtles:  ', JSON.stringify( b1 ) );
		const her = a1.list.find( ( q ) => q.id === night.id ), his = b1.list.find( ( q ) => q.id === night.id );
		say( her && his && Math.hypot( her.x - his.x, her.z - his.z ) < 1.5 && her.shown && his.shown, `the same turtle in the same place on both games: ${ night.id }, ${ her && his ? Math.hypot( her.x - his.x, her.z - his.z ).toFixed( 2 ) : '?' } m apart` );
		say( a1.tracks === b1.tracks && a1.hatchings === b1.hatchings, `and the same tracks (${ a1.tracks }, ${ b1.tracks }) and hatchings (${ a1.hatchings }, ${ b1.hatchings })` );
		await shot( owner, 'seen-north-turtles-robin' );
		await shot( guest, 'seen-north-turtles-sam' );

	}

	// Pearl's boat, out at 4 to 5, back 11 to 12: her coming in, Winston at her tiller, from the jetty
	const when = await guest.game.evaluate( async () => { const { boatAt, planOf } = await import( '/src/game/PearlsDay.js' ); const a = window.__app, s = a.settings, out = []; for ( let d = s.day; d < s.day + 8; d ++ ) { const P = planOf( d, 'calm', 0 ); out.push( P ); if ( P.stays ) continue; for ( let h = 0; h < 24; h += 0.005 ) { const B = boatAt( h, d, 'calm', 0, {} ); if ( B.kind === 'coming' && Math.hypot( B.x - 114, B.z + 880 ) > 90 && Math.hypot( B.x - 114, B.z + 880 ) < 200 ) return { d, h, plan: P, B: { kind: B.kind, x: B.x, z: B.z, speed: B.speed } }; } } return { none: out.slice( 0, 3 ) }; } );
	note( 'her coming in:', JSON.stringify( when ) );
	if ( when && ! when.none ) {

		await owner.game.evaluate( ( [ h, d ] ) => { const a = window.__app; a.together.setClock( h, d, 0.0001 ); a.game.daysOut._T = null; }, [ when.h, when.d ] );
		await guest.game.waitForFunction( ( d ) => window.__app.settings.day === d, when.d, { timeout: 60000, polling: 500 } ).catch( () => note( '(the day not on his game)' ) );
		const sit = ( who, x, z ) => who.game.evaluate( ( [ x, z ] ) => { const a = window.__app, p = a.player; p.mode = 'swim'; p.position.set( x, 0, z ); p.velocity.set( 0, 0, 0 ); }, [ x, z ] );
		await sit( owner, when.B.x + 30, when.B.z );
		await sit( guest, when.B.x - 30, when.B.z + 10 );
		await until( owner.game, 'window.__app.game.camp.built && window.__app.game.camp.boat', 400000 ).catch( async () => note( 'Robin\'s camp not built:', JSON.stringify( await owner.game.evaluate( () => { const a = window.__app; return { debris: !! a.debris, built: a.game.camp.built, mats: !! ( a.village && a.village.materials ) }; } ) ) ) );
		await until( guest.game, 'window.__app.game.camp.built && window.__app.game.camp.boat', 200000 ).catch( async () => note( 'Sam\'s camp not built:', JSON.stringify( await guest.game.evaluate( () => { const a = window.__app; return { debris: !! a.debris, built: a.game.camp.built, mats: !! ( a.village && a.village.materials ) }; } ) ) ) );
		const peek = ( who ) => who.game.evaluate( () => { const a = window.__app, cam = a.game.camp || a.game.fishCamp, b = cam && cam.boat; return b ? { built: true, x: +b.x.toFixed( 2 ), z: +b.z.toFixed( 2 ), kind: b.kind, seen: b.mesh.visible, hand: !! b.hand, handShown: !! ( b.hand && b.hand.group.visible ), h: +a.settings.timeOfDay.toFixed( 3 ), wall: Date.now() } : { built: false, keys: Object.keys( a.game ).filter( ( k ) => /camp|pearl/i.test( k ) ) }; } );
		// the two read as near together as can be
		const [ pa, pb ] = await Promise.all( [ peek( owner ), peek( guest ) ] );
		note( 'her boat, Robin:', JSON.stringify( pa ) );
		note( 'her boat, Sam:  ', JSON.stringify( pb ) );
		if ( pa.built && pb.built ) {

			const d = Math.hypot( pa.x - pb.x, pa.z - pb.z ), v = Math.max( 1, when.B.speed || 1 );
			say( pa.kind === pb.kind && pa.seen && pb.seen, `Pearl's boat on both games: ${ pa.kind }; ${ d.toFixed( 1 ) } m apart between the two readings, at about ${ v.toFixed( 1 ) } m/s` );
			await until( guest.game, `( () => { const c = window.__app.game.camp || window.__app.game.fishCamp; return c && c.boat && c.boat.hand && c.boat.hand.group.visible; } )()`, 120000 ).catch( () => note( '(Winston not shown on Sam\'s in time)' ) );
			await until( owner.game, `( () => { const c = window.__app.game.camp || window.__app.game.fishCamp; return c && c.boat && c.boat.hand && c.boat.hand.group.visible; } )()`, 60000 ).catch( () => note( '(Winston not shown on Robin\'s in time)' ) );
			const [ pa2, pb2 ] = await Promise.all( [ peek( owner ), peek( guest ) ] );
			say( pa2.handShown && pb2.handShown, `Winston at her tiller on both: Robin ${ pa2.handShown }, Sam ${ pb2.handShown }` );
			// looking at her, each from his own side
			const look = ( who ) => who.game.evaluate( () => { const a = window.__app, c = a.game.camp || a.game.fishCamp, b = c.boat, p = a.player; window.__look = setInterval( () => { const P = a.camera.position.constructor; a.camera.lookAt( new P( b.x, 1, b.z ) ); a.camera.updateMatrixWorld(); }, 8 ); } );
			await look( guest );
			await shot( guest, 'seen-north-pearl-sam' );
			await guest.game.evaluate( () => clearInterval( window.__look ) );
			await look( owner );
			await shot( owner, 'seen-north-pearl-robin' );

		} else say( false, 'her boat isn\'t built on one of the games' );

	} else say( false, 'no day of hers found to watch' );

}

// ---- the second orange kayak at the pier: whose is it?
if ( PART === 'orange' ) {

	const owner = await G.open( 'Robin', 'kayak', 30 ), guest = await G.open( 'Sam', process.env.ORANGE_OWN || 'lobster', 30 );
	await ready( owner, guest );
	await until( guest.game, `( () => { const o = ${ other }; return o.boat && o.boat.visible && o.boat.userData.type === 'kayak'; } )()`, 240000 );
	await frames( guest.game, 8 );
	const scene = await guest.game.evaluate( async () => {

		const a = window.__app, o = a.together.others.values().next().value, r = ( v ) => +v.toFixed( 1 );
		const { berthOf } = await import( '/src/game/fleet/Berths.js' );
		const P = a.camera.position.constructor;
		const list = [];
		a.scene.traverse( ( m ) => { if ( m.isMesh && m.visible && /kayak|moored/i.test( m.name || '' ) ) { const w = m.getWorldPosition( new P() ); list.push( { name: m.name, at: [ r( w.x ), r( w.y ), r( w.z ) ] } ); } } );
		const moored = a.game.moored || a.game.mooredBoats || a.moored || a.mooredBoats || null;
		return { own: a.boat.id, fleet: Object.keys( a.game.state.fleet ), kayakBerth: berthOf( 'kayak' ).position.toArray().map( r ), lobsterBerth: berthOf( 'lobster' ).position.toArray().map( r ), copy: o.boat.position.toArray().map( r ), berthIndex: o.berth, truePose: o.cur.boat.pos.toArray().map( r ), meshes: list, moored: moored ? Object.keys( moored ).slice( 0, 12 ) : null };

	} );
	note( 'Sam\'s scene:', JSON.stringify( scene ) );
	await guest.game.evaluate( () => { const a = window.__app, p = a.player; p.mode = 'walk'; p.position.set( 56, a.colliders.groundHeightAt( 56, 34, 50 ), 34 ); p.yaw = 0.08; p.pitch = - 0.05; } );
	await frames( guest.game, 6 );
	await shot( guest, 'seen-orange-pier' );
	await still( guest, 'seen-orange-above', [ 30, 25, - 25 ], [ 0, 0, 0 ] );

}

note( `frames a second: see above; memory at the end` );
for ( const pg of G.ctx.pages() ) { const f = pg.frames().find( ( x ) => x !== pg.mainFrame() ); if ( f ) await G.memory( { game: f, name: pg.url().match( /name=(\w+)/ )?.[ 1 ] }, 'at the end' ).catch( () => {} ); }
await G.end( `seen ${ PART }` );
