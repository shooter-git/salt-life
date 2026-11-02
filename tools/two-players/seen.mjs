// (M16) What had never been run with two games: what's seen of someone's boat and what they do with her, read and shot from the other's game.
//   tools/render-slot.sh node tools/two-players/seen.mjs [dir] [port] <part>
//   parts: fights  kite  kayak  looks  flares  glasses  stern  north  orange  kayakname  ladder  decks  sternfish  kitefish  drop  ashore
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

// by keys to a place on her
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

// R, and F held and let go, looking astern
const castFrom = async ( who ) => {

	await who.game.evaluate( ( ) => { const p = window.__app.player; p.deckYaw = Math.PI; p.pitch = 0; } );
	await press( who, 'KeyR', 2 );
	await frames( who.game, 6 );
	const eq = await who.game.evaluate( () => { const g = window.__app.game; return { equipped: g.rod.equipped, can: g.canFish, state: g.rod.state, why: window.__app.player.prompt && window.__app.player.prompt.text }; } );
	// (held for frames of theirs, not the clock: at a frame or two a second the clock can let go before it's been seen)
	await who.page.keyboard.down( 'KeyF' );
	await who.game.waitForFunction( () => window.__app.game.rod.state === 'windup', null, { timeout: 120000, polling: 100 } ).catch( () => {} );
	await frames( who.game, 10 );
	await who.page.keyboard.up( 'KeyF' );
	await who.game.waitForFunction( () => window.__app.game.rod.state !== 'windup', null, { timeout: 120000, polling: 100 } ).catch( () => {} );
	await who.game.waitForFunction( () => { const r = window.__app.game.rod; return r.state === 'floating' || r.state === 'idle'; }, null, { timeout: 120000, polling: 300 } ).catch( () => {} );
	const c = await who.game.evaluate( () => { const g = window.__app.game, r = g.rod; return { state: r.state, line: +( r.lineOut || 0 ).toFixed( 1 ), inWater: !! r.lineInWater, bobber: r.bobber ? r.bobber.toArray().map( ( v ) => +v.toFixed( 1 ) ) : null, boat: window.__app.player.boat.position.toArray().map( ( v ) => +v.toFixed( 1 ) ), told: g.hud && g.hud._toast ? g.hud._toast.textContent : null }; } );
	return { eq, c };

};


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
			await guest.page.screenshot( { path: `${ out }/seen-flare-${ name }.png`, timeout: 300000 } );
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

// a fish at the hook of the rod in your hands, and F to strike it: the bite's placed, the strike and the fight are keys
const hookIt = async ( who, species, kg ) => {

	await who.game.evaluate( ( [ species, kg ] ) => { const g = window.__app.game, r = g.rod; g.bite = { phase: 'take', t: 3000, species, kg, place: null, at: { x: r.bobber.x, z: r.bobber.z } }; }, [ species, kg ] );
	await frames( who.game, 2 );
	await press( who, 'KeyF', 2 );
	return who.game.evaluate( () => { const g = window.__app.game, f = g.fight; return f ? { on: true, species: f.species, kg: f.kg, line: +f.distance.toFixed( 1 ), spool: f.maxDistance, hookM: f.hookM ?? null, rod: g.rod.state } : { on: false, rod: g.rod.state, rig: g.rod.rig, bite: g.bite && g.bite.phase }; } );

};

// where they are through a fight, every frame of theirs, on the boat they're on
const holdStill = ( who ) => who.game.evaluate( () => {

	const a = window.__app, p = a.player, S = window.__still = { n: 0, off: 0, moved: 0, sunk: 0, from: p.deckPos.clone(), run: true, modes: {} };
	window.__draws.after.push( () => { if ( ! S.run ) return; S.n ++; S.modes[ p.mode ] = ( S.modes[ p.mode ] || 0 ) + 1; if ( p.mode !== 'deck' ) { S.off ++; return; } S.moved = Math.max( S.moved, Math.hypot( p.deckPos.x - S.from.x, p.deckPos.z - S.from.z ) ); S.sunk = Math.max( S.sunk, p.deckGroundAt( p.deckPos.x, p.deckPos.z, p.deckPos.y + 0.36 ) - p.deckPos.y ); } );

} );
const stillRead = ( who ) => who.game.evaluate( () => { const S = window.__still; S.run = false; return { frames: S.n, off: S.off, moved: +S.moved.toFixed( 3 ), sunk: +S.sunk.toFixed( 3 ), modes: S.modes }; } );
const rateOf = async ( ...who ) => note( `frames a second, really: ${ ( await Promise.all( who.map( async ( w ) => `${ w.name } ${ await G.rate( w.game ) }` ) ) ).join( ', ' ) }` );
const toasts = ( who ) => who.game.evaluate( () => { const g = window.__app.game, was = g.toast; window.__toasts = []; g.toast = function ( t, ms ) { window.__toasts.push( t ); return was.call( this, t, ms ); }; } );
const told = ( who ) => who.game.evaluate( () => window.__toasts.splice( 0 ) );
const myTackle = ( who ) => who.game.evaluate( async () => { const { UPGRADES } = await import( '/src/game/Gear.js' ); const g = window.__app.game, u = g.state.upgrades; for ( const [ k, t ] of Object.entries( UPGRADES ) ) if ( ! t.on ) u[ k ] = t.levels.length - 1; g.applyGear(); } );

// ---- a kayak's name on someone else's copy of her
if ( PART === 'kayakname' ) {

	const owner = await G.open( 'Robin', 'kayak', 30 ), guest = await G.open( 'Sam', 'lobster', 30 );
	await ready( owner, guest );
	await owner.game.evaluate( () => { window.__app.player.enterBoat(); } );
	await G.toSea( owner );
	await atSea( guest, { x: SEA.x + 12, z: SEA.z - 12 }, 0 );
	await until( guest.game, `( () => { const o = ${ other }; return o.boat && o.boat.visible && o.boat.userData.type === 'kayak'; } )()`, 240000 );
	const own = await owner.game.evaluate( () => { const a = window.__app, g = a.game, r = g.state.fleet[ a.boat.id ]; if ( ! r ) return null; r.paint = 'red'; r.name = 'Salty Dog'; g.fleet._dirty = true; g.fleet.plateSign = null; return { id: a.boat.id, record: true, mode: a.player.mode }; } );
	note( 'her own game:', JSON.stringify( own ) );
	await frames( owner.game, 8 );
	const hers = await owner.game.evaluate( () => { const a = window.__app, n = a.boat.group.getObjectByName( 'boat-name' ); return { plate: !! n, shown: !! ( n && n.visible ), at: n ? n.position.toArray().map( ( v ) => +v.toFixed( 2 ) ) : null }; } );
	const came = await until( guest.game, `( () => { const o = ${ other }; return o.boatName === 'Salty Dog' && o.boat.getObjectByName( 'boat-name' ); } )()`, 300000 ).then( () => true, () => false );
	const r = await guest.game.evaluate( `( () => { const o = ${ other }, n = o.boat.getObjectByName( 'boat-name' ); return { id: o.boat.userData.type, name: o.boatName, plate: !! n, shown: !! ( n && n.visible ), at: n ? n.position.toArray().map( ( v ) => +v.toFixed( 2 ) ) : null, d: +o.boat.position.distanceTo( window.__app.camera.position ).toFixed( 1 ), poseAge: +( performance.now() / 1000 - o.last ).toFixed( 1 ) }; } )()` );
	say( came && r.plate && r.shown && hers.plate && JSON.stringify( r.at ) === JSON.stringify( hers.at ), `her name on his copy of the kayak, where it is on hers: his ${ JSON.stringify( r ) }, hers ${ JSON.stringify( hers ) }` );
	await still( guest, 'seen-kayakname-guest', [ 0.8, 1.1, - 3.4 ], [ 0, 0.3, - 1.6 ] );
	await still( guest, 'seen-kayakname-close', [ 0.25, 0.75, - 3.0 ], [ 0, 0.22, - 1.9 ] );
	await owner.game.evaluate( () => { const a = window.__app, p = a.player; p.camMode = 'third'; p.orbitDist = 2.2; p.orbitPitch = 0.3; p.orbitYaw = a.boatCtl.getYaw() + Math.PI; } );
	await frames( owner.game, 4 );
	await shot( owner, 'seen-kayakname-her-own' );
	// past 40 m, not drawn
	await atSea( guest, { x: SEA.x + 45, z: SEA.z - 45 }, 0 );
	await until( guest.game, `( () => { const o = ${ other }, n = o.boat.getObjectByName( 'boat-name' ); return n && ! n.visible; } )()`, 120000 ).catch( () => {} );
	const far = await guest.game.evaluate( `( () => { const o = ${ other }, n = o.boat.getObjectByName( 'boat-name' ); return { plate: !! n, shown: !! ( n && n.visible ), d: +o.boat.position.distanceTo( window.__app.camera.position ).toFixed( 1 ) }; } )()` );
	say( ! far.shown, `and from ${ far.d } m it's not drawn: ${ JSON.stringify( far ) }` );
	await rateOf( owner, guest );

}

// ---- the console's dive ladder, for a guest: in the water, up it by E, down it by E, and with her fitted without one
if ( PART === 'ladder' ) {

	const owner = await G.open( 'Robin', 'console', 30 ), guest = await G.open( 'Sam', 'lobster', 30 );
	await ready( owner, guest );
	await G.buy( owner );
	await owner.game.evaluate( () => window.__app.player.boardBoat() );
	await G.toSea( owner );
	await until( guest.game, `( () => { const o = ${ other }; return o.boat && o.boat.visible && o.cur.boat && Math.hypot( o.cur.boat.pos.x + 2600, o.cur.boat.pos.z - 3000 ) < 30; } )()`, 240000 ).catch( () => {} );
	// (the fit said, and her deck all there on his phone: as before an offer)
	const ladderOf = `( async () => { const { LADDER } = await import( '/src/world/boat/console/ConsoleStern.js' ); return { x: LADDER.x, z: LADDER.z, top: LADDER.top }; } )()`;
	const L = await guest.game.evaluate( ladderOf );
	const offWater = `( () => { const a = window.__app, o = ${ other }, c = o.cur, f = c.drawn || c.boat, P = a.camera.position.constructor, q = new P( ${ L.x }, 0, ${ L.z } - 1.0 ).applyQuaternion( f.quat ).add( f.pos ), p = a.player; if ( p.mode === 'deck' ) return true; p.mode = 'swim'; p.position.set( q.x, f.pos.y - 0.2, q.z ); p.velocity.set( 0, 0, 0 ); return !! p.rideOffer; } )()`;
	await stand( guest, SEA.x, SEA.z - 6 );
	await until( guest.game, offWater, 240000 );
	const swim = await guest.game.evaluate( () => { const p = window.__app.player; return { mode: p.mode, prompt: p.prompt && p.prompt.text, offer: p.rideOffer && p.rideOffer.name, from: ( ( f ) => f && { text: f.text, at: f.at.toArray(), reach: f.reach } )( p.rideOffer.boat.model.boardFrom( 'swim' ) ), fitted: p.rideOffer.boat.model.fitted }; } );
	note( 'in the water by her ladder:', JSON.stringify( swim ) );
	const holdHere = await guest.game.evaluate( ( q ) => { window.__hold = true; return true; }, null );
	await press( guest, 'KeyE', 3 );
	const up = await guest.game.evaluate( () => { const p = window.__app.player, d = p.deckPos; return { mode: p.mode, riding: p.riding, at: d.toArray().map( ( v ) => +v.toFixed( 3 ) ), floor: +p.deckGroundAt( d.x, d.z, d.y + 0.36 ).toFixed( 3 ), inRailZone: p.prompt && p.prompt.text, own: p.boat === window.__app.boatCtl }; } );
	say( up.mode === 'deck' && up.riding && Math.abs( up.at[ 0 ] - L.x ) < 0.5 && Math.abs( up.at[ 1 ] - up.floor ) < 0.05, `up her ladder by E, from the water: ${ JSON.stringify( up ) }; offered as "${ swim.prompt }"` );
	await frames( guest.game, 6 );
	const up2 = await guest.game.evaluate( () => { const p = window.__app.player, d = p.deckPos; return { at: d.toArray().map( ( v ) => +v.toFixed( 3 ) ), floor: +p.deckGroundAt( d.x, d.z, d.y + 0.36 ).toFixed( 3 ), prompt: p.prompt && p.prompt.text }; } );
	say( Math.abs( up2.at[ 1 ] - up2.floor ) < 0.05, `and he stands on her platform: ${ JSON.stringify( up2 ) }` );
	await until( owner.game, `${ other }.cur.mode === 'deck' && ${ other }.cur.ride`, 60000 ).catch( () => {} );
	note( 'Robin sees:', JSON.stringify( await owner.game.evaluate( `( () => { const o = ${ other }, c = o.cur; return { mode: c.mode, ride: c.ride, deck: c.deck && c.deck.toArray().map( ( v ) => +v.toFixed( 2 ) ), shown: o.shown }; } )()` ) ) );
	// the ladder as each has it, stopped with nobody at her helm
	const looks = await owner.game.evaluate( () => { const a = window.__app; return { hers: a.boat._ladderDown, driven: a.boatCtl.driven }; } );
	note( 'her ladder on her game (down?):', JSON.stringify( looks ), '(his copy is dressed ladderUp whenever fitted: BoatCopies dressCopy)' );
	await still( guest, 'seen-ladder-guest-from-water', [ 0.9, 1.0, - 6.2 ], [ 0.6, 0.3, - 3.4 ] );
	await owner.game.evaluate( () => { const a = window.__app, p = a.player; p.camMode = 'third'; p.orbitDist = 5; p.orbitPitch = 0.1; p.orbitYaw = a.boatCtl.getYaw(); } );
	await frames( owner.game, 4 );
	await shot( owner, 'seen-ladder-owner-sees' );
	await owner.game.evaluate( () => { window.__app.player.camMode = 'first'; } );
	// through her door by keys and back to the ladder
	const inTo = await walkTo( guest, - 0.74, - 2.6 );
	const inTo2 = await walkTo( guest, 0.85, - 1.4 );
	const back1 = await walkTo( guest, - 0.74, - 2.6 );
	const back2 = await walkTo( guest, L.x, L.z + 0.3 );
	say( inTo.got && inTo2.got && back1.got && back2.got, `by keys through her door to the cockpit and back to the ladder: ${ JSON.stringify( back2 ) }` );
	await frames( guest.game, 6 );
	const atL = await guest.game.evaluate( () => { const p = window.__app.player; return { prompt: p.prompt && p.prompt.text, at: p.deckPos.toArray().map( ( v ) => +v.toFixed( 2 ) ) }; } );
	note( 'at the ladder:', JSON.stringify( atL ) );
	await press( guest, 'KeyE', 3 );
	const down = await guest.game.evaluate( ( L ) => { const a = window.__app, p = a.player, o = a.together.others.values().next().value, c = o.cur, f = c.drawn || c.boat, P = a.camera.position.constructor, q = new P( L.x, 0, L.z - 0.45 ).applyQuaternion( f.quat ).add( f.pos ); return { mode: p.mode, riding: p.riding, y: +p.position.y.toFixed( 2 ), fromFoot: +Math.hypot( p.position.x - q.x, p.position.z - q.z ).toFixed( 2 ), own: p.boat === a.boatCtl }; }, L );
	say( /ladder/i.test( atL.prompt || '' ) && down.mode === 'swim' && ! down.riding && down.fromFoot < 1 && down.own, `down her ladder by E: told "${ atL.prompt }", ${ JSON.stringify( down ) }` );
	await until( owner.game, `${ other }.cur.mode === 'swim'`, 60000 ).catch( () => {} );
	note( 'Robin sees:', JSON.stringify( await owner.game.evaluate( `( () => { const o = ${ other }, c = o.cur; return { mode: c.mode, ride: c.ride, shown: o.shown }; } )()` ) ) );
	// and up again, as she lies: E
	await until( guest.game, offWater, 120000 ).catch( () => {} );
	await press( guest, 'KeyE', 3 );
	say( await guest.game.evaluate( () => window.__app.player.riding && window.__app.player.mode === 'deck' ), 'and up again by E' );
	// her fitted without one
	const was = await guest.game.evaluate( `${ other }.cur.fit` );
	await owner.game.evaluate( async () => { const { UPGRADES } = await import( '/src/game/Gear.js' ); const a = window.__app, g = a.game, u = g.state.upgrades; for ( const [ k, t ] of Object.entries( UPGRADES ) ) if ( t.on === a.boat.id && t.levels.some( ( l ) => l.diveLadder ) ) u[ k ] = 0; g.applyGear(); } );
	await until( guest.game, `${ other }.cur.fit !== ${ was }`, 60000 ).catch( () => {} );
	await frames( guest.game, 4 );
	await walkTo( guest, L.x, L.z + 0.3 );
	await frames( guest.game, 6 );
	const bare = await guest.game.evaluate( () => { const p = window.__app.player, M = p.boat.model; return { fitted: M.fitted.diveLadder, prompt: p.prompt && p.prompt.text, from: M.boardFrom( 'swim' ).text, over: M.overboard( p.deckPos, 1 ).text }; } );
	say( bare.fitted === false && bare.over === 'Jump overboard' && bare.from === 'Haul yourself aboard', `no ladder on hers: none for him: ${ JSON.stringify( bare ) }` );
	await rateOf( owner, guest );

}

// ---- the lobster boat's bench, foredeck and roof, by keys: W, and Space where it wants a hop. As a guest, on her copy, stopped
if ( PART === 'decks' ) {

	const owner = await G.open( 'Robin', 'lobster', 30 ), guest = await G.open( 'Sam', 'console', 30 );
	await ready( owner, guest );
	await owner.game.evaluate( () => window.__app.player.boardBoat() );
	await G.toSea( owner );
	await stand( guest, SEA.x + 8, SEA.z );
	say( await G.aboard( owner, guest ), 'Sam\'s aboard her' );
	await G.helm( owner );
	await guest.game.evaluate( () => {

		const a = window.__app, p = a.player, S = window.__decks = { n: 0, off: 0, sunk: 0, top: 0, run: true };
		window.__draws.after.push( () => { if ( ! S.run ) return; S.n ++; if ( p.mode !== 'deck' || ! p.riding ) { S.off ++; return; } if ( p.deckGrounded ) S.sunk = Math.max( S.sunk, p.deckGroundAt( p.deckPos.x, p.deckPos.z, p.deckPos.y + 0.36 ) - p.deckPos.y ); S.top = Math.max( S.top, p.deckPos.y ); } );

	} );
	// holding W toward a point, with a hop every so often, till he's near it at the height asked; up to tries hops
	const hopTo = async ( name, x, z, y, tries = 8 ) => {

		await guest.game.evaluate( ( A ) => { window.__aim = A; if ( ! window.__aimOn ) { window.__aimOn = true; window.__draws.after.push( () => { const A = window.__aim, p = window.__app.player; if ( A && p.mode === 'deck' ) p.deckYaw = Math.atan2( A.x - p.deckPos.x, A.z - p.deckPos.z ); } ); } }, { x, z } );
		await guest.page.keyboard.down( 'KeyW' );
		let s, hops = 0;
		const f0 = await guest.game.evaluate( () => window.__draws.frames );
		for ( ;; ) {

			s = await guest.game.evaluate( () => { const p = window.__app.player, d = p.deckPos; return { f: window.__draws.frames, x: +d.x.toFixed( 2 ), y: +d.y.toFixed( 2 ), z: +d.z.toFixed( 2 ), grounded: p.deckGrounded, mode: p.mode, riding: p.riding }; } );
			if ( s.mode !== 'deck' || ! s.riding ) break;
			const here = Math.hypot( s.x - x, s.z - z ) < 0.35 && Math.abs( s.y - y ) < 0.12;
			if ( here && s.grounded ) break;
			if ( s.grounded && hops < tries && s.f - f0 > ( hops + 1 ) * 14 ) { hops ++; await press( guest, 'Space', 1 ); }
			if ( s.f - f0 > ( tries + 1 ) * 26 ) break;
			await guest.page.waitForTimeout( 50 );

		}

		await guest.page.keyboard.up( 'KeyW' );
		await guest.game.evaluate( () => { window.__aim = null; } );
		await frames( guest.game, 4 );
		const at = await guest.game.evaluate( () => { const p = window.__app.player, d = p.deckPos; return { x: +d.x.toFixed( 2 ), y: +d.y.toFixed( 2 ), z: +d.z.toFixed( 2 ), floor: +p.deckGroundAt( d.x, d.z, d.y + 0.36 ).toFixed( 2 ), mode: p.mode, riding: p.riding, fell: p.mode !== 'deck' }; } );
		const got = Math.hypot( at.x - x, at.z - z ) < 0.45 && Math.abs( at.y - y ) < 0.15;
		note( `${ name }: asked ${ x }, ${ y }, ${ z }; at ${ at.x }, ${ at.y }, ${ at.z }, floor ${ at.floor }, ${ hops } hops, ${ s.f - f0 } frames` );
		return { ...at, got, hops };

	};

	await guest.game.evaluate( () => { const p = window.__app.player; p.deckPos.set( 0, 0.35, - 1.75 ); p.deckVel.set( 0, 0, 0 ); } );
	await frames( guest.game, 3 );
	// into the house, and onto her bench
	await hopTo( 'in the house', 0.1, 0.0, 0.35, 0 );
	const bench = await hopTo( 'the bench', 0.86, 0.45, 0.82 );
	say( bench.got, `the house's bench, by keys: ${ JSON.stringify( bench ) }` );
	await shot( guest, 'seen-decks-bench' );
	// off the bench, over her dash: the only way forward there is
	const fore = await hopTo( 'foredeck, aft', 0.5, 1.9, 1.33 );
	say( fore.got, `her foredeck, by keys, from the bench: ${ JSON.stringify( fore ) }` );
	const fore2 = await hopTo( 'foredeck', 0, 2.8, 1.45 );
	const bow = await hopTo( 'the bow', 0, 3.7, 1.57 );
	say( fore2.got && bow.got, `on up her foredeck to the bow, by keys: ${ JSON.stringify( bow ) }` );
	await shot( guest, 'seen-decks-bow' );
	await until( owner.game, `( () => { const d = ${ other }.cur.deck; return d && d.y > 1.4; } )()`, 60000 ).catch( () => {} );
	note( 'Robin sees him:', JSON.stringify( await owner.game.evaluate( `( () => { const c = ${ other }.cur, o = ${ other }; return { deck: c.deck && c.deck.toArray().map( ( v ) => +v.toFixed( 2 ) ), shown: o.shown, mode: c.mode }; } )()` ) ) );
	// the roof: from the top of her foredeck, hop aft at it
	const edge = await hopTo( 'foredeck, by the windshield', 0.3, 1.6, 1.33, 2 );
	const roof = await hopTo( 'the roof', 0, 0.2, 2.41, 8 );
	say( roof.got, `her roof, by keys, from the foredeck: ${ JSON.stringify( roof ) } (from ${ JSON.stringify( edge ) })` );
	const offerUp = await guest.game.evaluate( () => { const p = window.__app.player, d = p.deckPos, M = p.boat.model; return { prompt: p.prompt && p.prompt.text, at: d.toArray().map( ( v ) => +v.toFixed( 2 ) ), rails: M.exitPoints.map( ( e ) => +Math.hypot( d.x - e.x, d.z - e.z ).toFixed( 2 ) ) }; } );
	note( 'what\'s offered on her foredeck:', JSON.stringify( offerUp ) );
	const S = await guest.game.evaluate( () => { const S = window.__decks; S.run = false; return { frames: S.n, off: S.off, sunk: +S.sunk.toFixed( 3 ), highest: +S.top.toFixed( 2 ) }; } );
	say( S.off === 0 && S.sunk < 0.03, `all of it: ${ S.off } of ${ S.frames } frames off her, ${ S.sunk } m under her floor, highest ${ S.highest } m` );
	// back to her cockpit, by keys
	const home = await hopTo( 'back in her cockpit', 0, - 1.75, 0.35, 4 );
	say( home.got, `back to her cockpit from there, by keys: ${ JSON.stringify( home ) }` );
	if ( ! home.got ) {

		// the way off, from about the middle of her foredeck
		await hopTo( 'the middle of her foredeck', 0.9, 2.6, 1.45, 0 );
		const off = await guest.game.evaluate( () => { const p = window.__app.player; return p.prompt && p.prompt.text; } );
		await press( guest, 'KeyE', 3 );
		const went = await guest.game.evaluate( () => { const p = window.__app.player; return { mode: p.mode, riding: p.riding }; } );
		say( off && went.mode === 'swim', `over her side from her foredeck by E: offered "${ off }", ${ JSON.stringify( went ) }` );

	}

	await rateOf( owner, guest );

}

// ---- the lobster boat's stern, her traps stowed: a fish cast for, struck and played to the boat from there, her owner and a guest
if ( PART === 'sternfish' ) {

	const owner = await G.open( 'Robin', 'lobster', 30 ), guest = await G.open( 'Sam', 'console', 30 );
	await ready( owner, guest );
	await owner.game.evaluate( () => { const a = window.__app, g = a.game; g.state.upgrades.traps = 3; g.applyGear(); a.player.boardBoat(); } );
	await myTackle( owner );
	await myTackle( guest );
	await G.toSea( owner );
	await owner.page.waitForTimeout( 2000 );
	await frames( owner.game, 6 );
	note( 'her traps:', JSON.stringify( await owner.game.evaluate( () => { const a = window.__app, w = a.game.traps; return { drawn: w.meshes ? w.meshes.traps.count : null, solid: a.boat.colliders.filter( ( c ) => c.tag === 'trap' ).length }; } ) ) );
	await toasts( owner );
	await toasts( guest );
	const play = async ( who, label, shots ) => {

		await walkTo( who, 0, - 1.75 );
		await walkTo( who, 0, - 2.6 );
		const at = await walkTo( who, 0, - 3.5 );
		say( at.got, `${ label }: to her stern by keys, down the aisle between her stacks: ${ JSON.stringify( at ) }` );
		const c = await castFrom( who );
		say( c.c.state === 'floating' && c.c.inWater, `${ label }: a cast from it: rod ${ c.c.state }, line ${ c.c.line } m` );
		await holdStill( who );
		const hooked = await hookIt( who, 'mahi', 4 );
		say( hooked.on, `${ label }: struck by F: ${ JSON.stringify( hooked ) }` );
		if ( hooked.on && shots ) { await frames( who.game, 6 ); await shot( who, `seen-sternfish-${ shots }-fighting` ); }
		const end = hooked.on ? await fightIt( who, `${ label }, the mahi` ) : null;
		await frames( who.game, 6 );
		const l = await hold( who ), s = await stillRead( who );
		note( `${ label }: told:`, JSON.stringify( await told( who ) ) );
		say( l.last && l.last.species === 'mahi' && s.off === 0 && s.moved < 0.3 && s.sunk < 0.03, `${ label }: played to the boat from her stern and landed: ${ JSON.stringify( l.last ) }, ${ JSON.stringify( s ) }, ended ${ JSON.stringify( end ) }` );
		await who.game.evaluate( () => { const h = window.__app.game.hud; if ( h && h.catchOpen && h.closeCatch ) h.closeCatch(); } );
		await frames( who.game, 3 );
		await who.game.evaluate( () => { const g = window.__app.game; g.cancelLine( true ); if ( g.rod.equipped ) g.rod.equip( false ); } );

	};

	await owner.game.evaluate( () => { const p = window.__app.player; p.deckPos.set( 0, 0.35, - 1.2 ); p.deckVel.set( 0, 0, 0 ); } );
	await frames( owner.game, 3 );
	await play( owner, 'Robin, her own', 'owner' );
	await stand( guest, SEA.x + 8, SEA.z );
	say( await G.aboard( owner, guest ), 'Sam\'s aboard her' );
	await guest.game.evaluate( () => { const p = window.__app.player; p.deckPos.set( 0, 0.35, - 1.75 ); p.deckVel.set( 0, 0, 0 ); } );
	await frames( guest.game, 3 );
	await play( guest, 'Sam, a guest', 'guest' );
	say( await guest.game.evaluate( () => window.__app.player.riding ), 'and he\'s still riding' );
	await rateOf( owner, guest );

}

// ---- a fish on her kite, seen on a guest's game: the real flight, by keys; the bite placed; the strike and the fight keys
if ( PART === 'kitefish' ) {

	const owner = await G.open( 'Robin', 'sportfisher', 30 ), guest = await G.open( 'Sam', 'lobster', 30 );
	await ready( owner, guest );
	await G.buy( owner );
	await myTackle( owner );
	await owner.game.evaluate( () => { const a = window.__app; a.together.setWeather( 'breezy', 0 ); a.weather.live = null; a.player.boardBoat(); } );
	await G.toSea( owner );
	await guest.game.waitForFunction( () => window.__app.weatherPick() === 'breezy', null, { timeout: 60000, polling: 500 } ).catch( () => note( '(the breeze didn\'t reach Sam)' ) );
	await stand( guest, SEA.x + 8, SEA.z );
	say( await G.aboard( owner, guest ), 'Sam\'s aboard her' );
	await guest.game.evaluate( () => { const p = window.__app.player; p.deckPos.set( 0, 0.5, - 3.75 ); p.deckVel.set( 0, 0, 0 ); } );
	await toasts( owner );
	// her rod, her rig, her bait, by keys
	await until( owner.game, `( () => { const a = window.__app; return a.weather.live && a.weather.live.wind > 3; } )()`, 180000 ).catch( () => {} );
	await owner.game.evaluate( async () => { const { G: GL } = await import( '/src/core/Globals.js' ); const a = window.__app, g = a.game, p = a.player; g.state.bait.mullet = 6; p.deckPos.set( 0, 0.5, - 4.8 ); p.deckVel.set( 0, 0, 0 ); window.__wind = () => +GL.windSpeed.value.toFixed( 1 ); } );
	await frames( owner.game, 3 );
	await press( owner, 'KeyR', 2 );
	await frames( owner.game, 3 );
	for ( let i = 0; i < 8 && await owner.game.evaluate( () => window.__app.game.rigs.pick !== 'kite' ); i ++ ) await press( owner, 'KeyC', 2 );
	const rig = await owner.game.evaluate( () => { const g = window.__app.game; return { pick: g.rigs.pick, bait: g.state.baitPick, equipped: g.rod.equipped, wind: window.__wind(), standUp: g.state.stats.standUp, avail: g.rigs.available( 'kite' ) }; } );
	note( 'her rig by keys:', JSON.stringify( rig ) );
	await press( owner, 'KeyF', 2 );
	await frames( owner.game, 3 );
	let k = await owner.game.evaluate( () => { const r = window.__app.game.rigs; return { kite: !! r.kite, told: window.__toasts.slice( - 3 ) }; } );
	say( k.kite, `her kite up by F: ${ JSON.stringify( k ) }` );
	await until( owner.game, 'window.__app.game.rigs.kite && window.__app.game.rigs.kite.up >= 1', 400000 ).catch( () => note( '(her kite\'s not all the way up in time)' ) );
	await until( guest.game, `${ other }.cur.kite`, 90000 ).catch( () => {} );
	await frames( guest.game, 3 );
	// up there: his game against hers
	const kiteAt = ( who, what ) => who.game.evaluate( what );
	const herK = await owner.game.evaluate( () => { const a = window.__app, r = a.game.rigs, K = r.kite; return K ? { at: K.at.toArray().map( ( v ) => +v.toFixed( 1 ) ), up: K.up, rod: a.game.rod.state, bobber: a.game.rod.bobber.toArray().map( ( v ) => +v.toFixed( 1 ) ) } : null; } );
	const hisK = await guest.game.evaluate( `( () => { const o = ${ other }, c = o.cur, D = window.__app.together.spread.draw, T = o.tackle; return { kite: c.kite, rod: c.rod, bobber: c.bobber && c.bobber.toArray().map( ( v ) => +v.toFixed( 1 ) ), mesh: !! D && D.mesh.visible, line: T.line.visible, float: T.bobber.visible }; } )()` );
	const gap = hisK.kite && herK ? Math.hypot( hisK.kite[ 0 ] - herK.at[ 0 ], hisK.kite[ 1 ] - herK.at[ 1 ], hisK.kite[ 2 ] - herK.at[ 2 ] ) : null;
	say( hisK.kite && hisK.mesh, `her kite up, on his game: ${ JSON.stringify( hisK ) }; on hers ${ JSON.stringify( herK ) }; ${ gap === null ? '?' : gap.toFixed( 1 ) } m apart` );
	await guest.game.evaluate( `( () => { const a = window.__app, p = a.player, k = ${ other }.cur.kite, b = p.boat; p.deckYaw = Math.atan2( k[ 0 ] - b.position.x, k[ 2 ] - b.position.z ) - b.getYaw(); p.pitch = 0.3; } )()` );
	await frames( guest.game, 3 );
	await shot( guest, 'seen-kitefish-up-guest' );
	// a fish on it
	const hooked = await hookIt( owner, 'mahi', 7 );
	say( hooked.on, `a fish on her kite, struck by F: ${ JSON.stringify( hooked ) }` );
	const herF = await owner.game.evaluate( () => { const a = window.__app, r = a.game.rigs, K = r.kite; return { kiteDown: K ? K.down : null, up: K ? +K.up.toFixed( 2 ) : null, hung: !! a.game.rod.hung, rod: a.game.rod.state, bobber: a.game.rod.bobber.toArray().map( ( v ) => +v.toFixed( 1 ) ) }; } );
	note( 'on her game, the fish on:', JSON.stringify( herF ) );
	await until( guest.game, `${ other }.cur.rod === 5`, 120000 ).catch( () => note( '(the fish on not said to his game in time)' ) );
	await frames( guest.game, 3 );
	const seen = await guest.game.evaluate( `( () => { const o = ${ other }, c = o.cur, T = o.tackle; return { rod: c.rod, tension: c.tension, kite: c.kite, bobber: c.bobber && c.bobber.toArray().map( ( v ) => +v.toFixed( 1 ) ), rodShown: T.rod.visible, line: T.line.visible, float: T.bobber.visible, job: o.job }; } )()` );
	const hers2 = await owner.game.evaluate( () => { const a = window.__app, r = a.game.rigs, K = r.kite; return { kiteLeft: K ? +K.up.toFixed( 2 ) : null, bobber: a.game.rod.bobber.toArray().map( ( v ) => +v.toFixed( 1 ) ) }; } );
	const off = seen.bobber ? Math.hypot( seen.bobber[ 0 ] - hers2.bobber[ 0 ], seen.bobber[ 2 ] - hers2.bobber[ 2 ] ) : null;
	say( seen.rod === 5 && seen.line && seen.rodShown && off !== null && off < 25, `on his game: she's a fish on: ${ JSON.stringify( seen ) }; where it's fighting ${ off === null ? '?' : off.toFixed( 1 ) } m from where it is on hers ${ JSON.stringify( hers2 ) }` );
	note( seen.kite ? 'his kite\'s still up with the fish on' : `his kite's gone the moment the fish is on; hers has ${ hers2.kiteLeft } of its way to come down` );
	await guest.game.evaluate( `( () => { const a = window.__app, p = a.player, k = ${ other }.cur.bobber, b = p.boat; if ( k ) { p.deckYaw = Math.atan2( k.x - b.position.x, k.z - b.position.z ) - b.getYaw(); p.pitch = - 0.05; } } )()` );
	await frames( guest.game, 3 );
	await shot( guest, 'seen-kitefish-on-guest' );
	await owner.game.evaluate( ( ) => { const a = window.__app, p = a.player; p.camMode = 'first'; } );
	await shot( owner, 'seen-kitefish-on-owner' );
	// fought through, and his game told
	const end = await fightIt( owner, 'the mahi on the kite' );
	await frames( owner.game, 6 );
	const l = await hold( owner );
	await until( guest.game, `${ other }.cur.rod !== 5`, 90000 ).catch( () => {} );
	await frames( guest.game, 3 );
	const after = await guest.game.evaluate( `( () => { const o = ${ other }, c = o.cur; return { rod: c.rod, fish: o.fish && o.fish.visible, kite: c.kite, cheer: o.cheer || null }; } )()` );
	note( 'her toasts:', JSON.stringify( await told( owner ) ) );
	const gone = await owner.game.evaluate( () => { const r = window.__app.game.rigs; return { kite: !! r.kite, inChair: r.inChair }; } );
	say( l.last && l.last.species === 'mahi', `fought through on hers: ${ JSON.stringify( l.last ) }, ended ${ JSON.stringify( end ) }; his game ${ JSON.stringify( after ) }; her kite after: ${ JSON.stringify( gone ) }` );
	await rateOf( owner, guest );

}

// ---- a rider's own lead, over the side of her: rod and rig by keys, F to drop it, F to stop it, a fish struck by F and played
if ( PART === 'drop' ) {

	const DEEP = 'redSnapper';

	const owner = await G.open( 'Robin', 'sportfisher', 30 ), guest = await G.open( 'Sam', 'lobster', 30 );
	await ready( owner, guest );
	await G.buy( owner );
	await owner.game.evaluate( () => window.__app.player.boardBoat() );
	await G.toSea( owner, { x: - 2600, z: 3000 } );
	if ( process.env.DROP_TACKLE ) await myTackle( guest ); // (as he comes, he has the stock reel)
	await stand( guest, SEA.x + 8, SEA.z );
	say( await G.aboard( owner, guest ), 'Sam\'s aboard her' );
	await G.helm( owner );
	await guest.game.evaluate( () => { const a = window.__app, p = a.player, g = a.game; p.deckPos.set( 1.5, 0.5, - 5.0 ); p.deckVel.set( 0, 0, 0 ); p.deckYaw = Math.PI / 2; g.state.bait.squid = 6; } );
	await toasts( guest );
	await frames( guest.game, 3 );
	const before = await guest.game.evaluate( () => { const a = window.__app, g = a.game, s = g.state.stats; return { own: a.boat.id, electric: !! s.electricReel, spool: s.spoolM, avail: g.rigs.available( 'drop' ), aboard: g.rigs.aboard, depth: +( - a.terrainData.heightAt( a.player.position.x, a.player.position.z ) ).toFixed( 0 ) }; } );
	note( 'before:', JSON.stringify( before ) );
	await press( guest, 'KeyR', 2 );
	await frames( guest.game, 3 );
	for ( let i = 0; i < 8 && await guest.game.evaluate( () => window.__app.game.rigs.pick !== 'drop' ); i ++ ) await press( guest, 'KeyC', 2 );
	const rig = await guest.game.evaluate( () => { const g = window.__app.game; return { pick: g.rigs.pick, bait: g.state.baitPick, equipped: g.rod.equipped, state: g.rod.state }; } );
	say( rig.pick === 'drop', `C comes round to the deep drop, riding: ${ JSON.stringify( rig ) }` );
	await press( guest, 'KeyF', 2 );
	await frames( guest.game, 6 );
	const going = await guest.game.evaluate( () => { const g = window.__app.game, r = g.rod; return { rig: r.rig, state: r.state, hookM: +r.hookM.toFixed( 1 ), reach: r.dropReach, spool: r.spoolM, depth: +r.depth.toFixed( 0 ), waiting: g.rigs._waiting, bait: g.hookBait, inWater: !! r.lineInWater, tip: r.tip.toArray().map( ( v ) => +v.toFixed( 1 ) ), bobber: r.bobber.toArray().map( ( v ) => +v.toFixed( 1 ) ) }; } );
	say( going.rig === 'drop' && going.state === 'floating' && going.waiting && going.bait, `his lead away by F: ${ JSON.stringify( going ) }` );
	// down a way, as far as his own line and past it
	const deep = Math.min( going.depth - 2, before.spool + 40 );
	note( `letting it go to ${ deep } m (his own spool's ${ before.spool } m, the bottom ${ going.depth } m)` );
	await until( guest.game, `window.__app.game.rod.hookM >= ${ Math.min( deep, 60 ) } || window.__app.game.rod.settled`, 400000 ).catch( () => note( '(not that far down in time)' ) );
	const firstStop = await guest.game.evaluate( () => { const r = window.__app.game.rod; return { hookM: +r.hookM.toFixed( 1 ), settled: r.settled, line: +r.lineOut.toFixed( 1 ) }; } );
	await until( owner.game, `${ other }.cur.rod >= 3`, 60000 ).catch( () => {} );
	const seenO = await owner.game.evaluate( `( () => { const o = ${ other }, c = o.cur, T = o.tackle; return { rod: c.rod, bobber: c.bobber && c.bobber.toArray().map( ( v ) => +v.toFixed( 1 ) ), line: T.line.visible, rodShown: T.rod.visible, mode: c.mode }; } )()` );
	note( 'at', JSON.stringify( firstStop ), '; Robin sees:', JSON.stringify( seenO ) );
	await press( guest, 'KeyF', 2 );
	await frames( guest.game, 6 );
	await until( guest.game, 'window.__app.game.rod.settled && ! window.__app.game.rigs._waiting', 120000 ).catch( () => {} );
	const stopped = await guest.game.evaluate( () => { const g = window.__app.game, r = g.rod; return { hookM: +r.hookM.toFixed( 1 ), stopM: r.stopM, settled: r.settled, waiting: g.rigs._waiting, bite: g.bite && g.bite.phase, told: window.__toasts.slice( - 2 ) }; } );
	say( stopped.settled && stopped.stopM !== null && stopped.bite === 'wait', `F stops it there: ${ JSON.stringify( stopped ) }` );
	await shot( guest, 'seen-drop-guest' );
	await owner.game.evaluate( () => { const a = window.__app, p = a.player; p.camMode = 'third'; p.orbitDist = 14; p.orbitYaw = a.boatCtl.getYaw() + 2.4; p.orbitPitch = 0.3; } );
	await frames( owner.game, 4 );
	await shot( owner, 'seen-drop-owner-sees' );
	await owner.game.evaluate( () => { window.__app.player.camMode = 'first'; } );
	await holdStill( guest );
	const hooked = await hookIt( guest, DEEP, 3 );
	say( hooked.on, `a fish on his lead, struck by F: ${ JSON.stringify( hooked ) }` );
	const hisMoney = await hold( guest ), herHold = await hold( owner );
	const end = hooked.on ? await fightIt( guest, 'on his lead' ) : null;
	await frames( guest.game, 6 );
	const after = await hold( guest ), herAfter = await hold( owner ), s = await stillRead( guest );
	note( 'his toasts:', JSON.stringify( await told( guest ) ) );
	say( after.last && after.last.species === DEEP && end && end.riding && ( ! herAfter.last || herAfter.last.species !== DEEP ), `played up by keys and in his own hold: ${ JSON.stringify( after.last ) }, ended ${ JSON.stringify( end ) }; frames ${ JSON.stringify( s ) }` );
	// now past his own spool: what a rider without the electric reel is let do
	await guest.game.evaluate( () => { const h = window.__app.game.hud; if ( h && h.catchOpen && h.closeCatch ) h.closeCatch(); const g = window.__app.game; g.state.bait.squid = 6; } );
	await frames( guest.game, 6 );
	await until( guest.game, `window.__app.game.rod.state === 'idle'`, 120000 ).catch( () => note( '(his rod not idle in time: its line in)' ) );
	await guest.game.evaluate( () => { const g = window.__app.game; if ( g.rod.state !== 'idle' ) g.cancelLine( true ); if ( ! g.rod.equipped ) g.rod.equip( true ); g.rigs.pick = 'drop'; g.rigs.fitBait(); } );
	await frames( guest.game, 4 );
	const ready2 = await guest.game.evaluate( () => { const g = window.__app.game, r = g.rod; return { state: r.state, equipped: r.equipped, pick: g.rigs.pick, spool: g.state.stats.spoolM }; } );
	note( 'ready again:', JSON.stringify( ready2 ) );
	if ( ready2.state === 'idle' ) {

		await press( guest, 'KeyF', 2 );
		await frames( guest.game, 4 );
		const d0 = await guest.game.evaluate( () => { const g = window.__app.game, r = g.rod; return { reach: r.dropReach, spoolOnRod: r.spoolM, depth: +r.depth.toFixed( 0 ) }; } );
		// (the sink's slow to wait for: told how far it'd go)
		await guest.game.evaluate( ( m ) => { const r = window.__app.game.rod; r.hookM = m; }, Math.min( d0.depth - 3, before.spool + 20 ) );
		await frames( guest.game, 8 );
		const d1 = await guest.game.evaluate( () => { const g = window.__app.game, r = g.rod; return { hookM: +r.hookM.toFixed( 1 ), line: +r.lineOut.toFixed( 1 ), fill: +r.lineFill.toFixed( 2 ) }; } );
		const d2 = await guest.game.evaluate( () => { const g = window.__app.game, r = g.rod; return { hookM: +r.hookM.toFixed( 1 ), settled: r.settled, waiting: g.rigs._waiting, told: window.__toasts.slice( - 1 ) }; } );
		note( 'left to itself:', JSON.stringify( d2 ) );
		await guest.game.evaluate( () => { const g = window.__app.game; g.rigs._waiting = false; } );
		const h2 = await hookIt( guest, DEEP, 3 );
		await frames( guest.game, 12 );
		const f2 = await guest.game.evaluate( () => { const g = window.__app.game, f = g.fight; return f ? { line: +f.distance.toFixed( 1 ), max: f.maxDistance, st: f.state, hookM: f.hookM } : { none: true, last: window.__toasts.slice( - 2 ) }; } );
		say( f2.none ? ! /Spooled/.test( f2.last.join() ) : f2.st !== 'spooled', `a fish on his lead down there isn't spooled at once: ${ JSON.stringify( f2 ) }` );
		note( `past his own spool, ${ before.electric ? 'with' : 'without' } the electric reel: ${ JSON.stringify( d0 ) }, ${ JSON.stringify( d1 ) }, struck ${ JSON.stringify( h2 ) }, then ${ JSON.stringify( f2 ) }` );
		await guest.game.evaluate( () => { const g = window.__app.game; g.cancelLine( true ); g.fight = null; } );

	}

	await rateOf( owner, guest );

}

// ---- a guest stepping ashore at her berth, as each boat lies on his game: what's beside each rail
if ( PART === 'ashore' ) {

	const BOAT = process.env.ASHORE_BOAT || 'sportfisher';
	const owner = await G.open( 'Robin', BOAT, 30 ), guest = await G.open( 'Sam', BOAT === 'lobster' ? 'console' : 'lobster', 30 );
	await ready( owner, guest );
	await G.buy( owner );
	say( await G.aboard( owner, guest ), 'Sam\'s aboard her' );
	await G.helm( owner );
	await G.toSea( owner );
	await until( guest.game, `Math.hypot( window.__app.player.boat.position.x + 2600, window.__app.player.boat.position.z - 3000 ) < 300`, 240000 ).catch( () => note( '(not out in time)' ) );
	await owner.game.evaluate( () => { const a = window.__app, p = a.player, b = a.boatCtl; b.reset(); if ( ! a.boat.seated && p.mode === 'boat' ) { p.leaveHelm(); b.moored = true; } } );
	await until( guest.game, `( () => { const p = window.__app.player, o = ${ other }, b = p.boat.position; return o.berth > 0 && p.boat.speed < 0.4 && Math.hypot( b.x - 55, b.z - 15 ) < 45; } )()`, 240000 ).catch( () => note( '(her copy not settled at a berth in time)' ) );
	await frames( guest.game, 20 );
	const read = () => guest.game.evaluate( async () => {

		const { spareBerth } = await import( '/src/together/Berths.js' );
		const { sizeOf } = await import( '/src/together/BoatCopies.js' );
		const a = window.__app, p = a.player, o = a.together.others.values().next().value, b = p.boat, M = b.model, P = a.camera.position.constructor, r = ( v ) => +v.toFixed( 2 );
		const sx = new P( 1, 0, 0 ).applyQuaternion( b.quaternion ).setY( 0 ).normalize();
		const water = p.query.cpuValid ? p.query.cpu[ 0 ] : 0;
		const rails = M.exitPoints.map( ( ep ) => { const w = b.toWorld( ep, new P() ), s = Math.sign( ep.x ) || 1; return { ep: [ r( ep.x ), r( ep.y ), r( ep.z ) ], w: [ r( w.x ), r( w.y ), r( w.z ) ], out: [ 0.9, 1.4, 2 ].map( ( d ) => { const x = w.x + sx.x * s * d, z = w.z + sx.z * s * d, g = p.groundAt( x, z, w.y + 2.5 ); return [ r( x ), r( z ), r( g ), r( g - w.y ) ]; } ) }; } );
		return { boat: b.position.toArray().map( r ), yaw: r( b.getYaw() ), berth: o.berth, truePose: o.cur.boat.pos.toArray().map( r ), spare: o.berth ? spareBerth( o.berth - 1, sizeOf( o.cur.boatId ).beam ) : null, size: sizeOf( o.cur.boatId ), speed: r( b.speed ), water: r( water ), rails, target: ( ( t ) => t && { ep: [ r( t.ep.x ), r( t.ep.y ), r( t.ep.z ) ], g: r( t.g ), out: t.out.toArray().map( r ) } )( p.ashoreTarget() ) };

	} );
	const s = await read();
	note( 'lying:', JSON.stringify( { ...s, rails: undefined } ) );
	for ( const R of s.rails ) note( 'rail', JSON.stringify( R ) );
	await until( guest.game, `( () => window.__app.player.ashoreTarget() )()`, 60000 ).then( () => note( '(a rail with ground by it)' ), () => note( '(no rail with ground by it in 60 s)' ) );
	const again = await read();
	note( 'and now:', JSON.stringify( { ...again, rails: undefined } ) );
	const t = again.target;
	if ( t ) {

		await guest.game.evaluate( ( ep ) => { const p = window.__app.player; p.deckPos.set( ep[ 0 ] * 0.82, Math.max( ep[ 1 ] - 0.8, 0 ), ep[ 2 ] ); p.deckVel.set( 0, 0, 0 ); p._ashoreT = 0; }, t.ep );
		await frames( guest.game, 6 );
		const prompt = await guest.game.evaluate( () => { const p = window.__app.player; return { text: p.prompt && p.prompt.text, at: p.deckPos.toArray().map( ( v ) => +v.toFixed( 2 ) ), ashore: !! p._ashore, near: p._ashore && p._ashore.ep.toArray().map( ( v ) => +v.toFixed( 2 ) ) }; } );
		note( 'at that rail:', JSON.stringify( prompt ) );
		await press( guest, 'KeyE', 3 );

	}

	const off = await guest.game.evaluate( () => { const p = window.__app.player; return { mode: p.mode, riding: p.riding, at: p.position.toArray().map( ( v ) => +v.toFixed( 2 ) ) }; } );
	say( off.mode === 'walk' && ! off.riding, `he steps ashore from her at his game's berth: ${ JSON.stringify( off ) }` );
	await rateOf( owner, guest );

}

note( `frames a second: see above; memory at the end` );
for ( const pg of G.ctx.pages() ) { const f = pg.frames().find( ( x ) => x !== pg.mainFrame() ); if ( f ) await G.memory( { game: f, name: pg.url().match( /name=(\w+)/ )?.[ 1 ] }, 'at the end' ).catch( () => {} ); }
await G.end( `seen ${ PART }` );
