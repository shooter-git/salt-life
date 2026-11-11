// (guest work) A guest as her crew, with two real games: her rods worked on her owner's tackle and bait (her spread let out and
// brought in, a rod taken off her holder, her kite, her electric reel, her chum, her searchlight at her helm, her lights over his
// fish), a flashlight seen on the other's game, her traps set and hauled by her deckhand with what's in them in his own hold and
// the work seen from both games, and a boat taken out showing her hold at once. (v2.3.0) One fish box aboard: his catch in her
// hold, on her ice, and his. ((v2.4.1) Its two bars: room for fish, and how long the ice keeps them.)
//   tools/render-slot.sh node tools/two-players/crew.mjs [dir] [port] <part>
//   parts: rods  lights  traps  hold  box
import { OTHER as other, start } from './lib.mjs';
import { boxBars, iceSaid } from '../../src/game/Seaworthy.js';
import { LB } from '../../src/game/Units.js';
const [ out = 'qa-output', PORT = '5223', PART = 'rods' ] = process.argv.slice( 2 );
const G = await start( { out, port: PORT } );
const { say, note, until, frames, press, shot } = G;
// ((v2.4.1) a bar's pounds, "1,287" as well as "13")
const num = ( t ) => parseFloat( String( t ).replace( /,/g, '' ) );

const toasts = ( who ) => who.game.evaluate( () => { const g = window.__app.game, was = g.toast; window.__toasts = []; g.toast = function ( t, ms ) { window.__toasts.push( t ); return was.call( this, t, ms ); }; } );
const told = ( who ) => who.game.evaluate( () => window.__toasts.splice( 0 ) );
const bait = ( who ) => who.game.evaluate( () => ( { ...window.__app.game.state.bait } ) );
const ready = async ( owner, guest ) => {

	await until( guest.game, `${ other } && ${ other }.cur` );
	await until( owner.game, `${ other } && ${ other }.cur` );

};

// his rod out, a rig picked, her bait picked, and the cast key: what her owner's game is asked
const pressHers = async ( guest, rig, b ) => {

	await guest.game.evaluate( ( [ rig, b ] ) => { const g = window.__app.game; if ( ! g.rod.equipped ) g.rod.equip( true ); g.rigs.pick = rig; g.rigs.boatPick = b; }, [ rig, b ] );
	await frames( guest.game, 2 );
	const prompt = await guest.game.evaluate( () => { const r = window.__app.game.rigs; return { boat: r.boatRig(), said: r.prompt() && r.prompt().text, chip: r.chip().text }; } );
	await press( guest, 'KeyF', 2 );
	return prompt;

};

if ( PART === 'rods' || PART === 'lights' ) {

	const owner = await G.open( 'Robin', 'sportfisher', 30 ), guest = await G.open( 'Sam', 'lobster', 30 );
	await ready( owner, guest );
	await G.buy( owner );
	// (her owner's tackle: the top of each track that isn't a boat's; his, as he started. Her bait: some of each)
	await owner.game.evaluate( async () => { const { UPGRADES } = await import( '/src/game/Gear.js' ); const g = window.__app.game, s = g.state, u = s.upgrades; for ( const [ k, t ] of Object.entries( UPGRADES ) ) if ( ! t.on ) u[ k ] = t.levels.length - 1; Object.assign( s.bait, { ballyhoo: 12, squid: 6, chum: 2, silverside: 4 } ); g.applyGear(); } );
	const hers = await owner.game.evaluate( () => { const s = window.__app.game.state.stats; return { lineKg: s.lineKg, dragKg: s.dragKg, reelSpeed: s.reelSpeed, spoolM: s.spoolM, standUp: s.standUp, electricReel: s.electricReel }; } );
	const his = await guest.game.evaluate( () => { const s = window.__app.game.state.stats; return { lineKg: s.lineKg, dragKg: s.dragKg, reelSpeed: s.reelSpeed, spoolM: s.spoolM, standUp: s.standUp }; } );
	note( 'her tackle:', JSON.stringify( hers ), ' his:', JSON.stringify( his ) );
	say( await G.aboard( owner, guest ), 'Sam\'s aboard the sportfisher' );
	await G.helm( owner );
	await G.toSea( owner );
	await until( guest.game, `Math.hypot( window.__app.player.boat.position.x + 2600, window.__app.player.boat.position.z - 3000 ) < 300` );
	await toasts( owner );
	await toasts( guest );
	await until( guest.game, '!! window.__app.game.rigs.boatKit', 30000 ).catch( () => {} );
	const kit = await guest.game.evaluate( () => window.__app.game.rigs.boatKit );
	say( kit && kit.t.lineKg === hers.lineKg && kit.b.ballyhoo === 12 && kit.sp === 5, `her tackle and bait reach him: ${ JSON.stringify( kit ) }` );

	if ( PART === 'rods' ) {

		// her spread: a line let out with her ballyhoo, and another; then brought in by the right button
		const p1 = await pressHers( guest, 'troll', 'ballyhoo' );
		await until( owner.game, 'window.__app.game.rigs.lines.length === 1', 30000 ).catch( () => {} );
		await until( guest.game, `${ other }.cur.spread && ${ other }.cur.spread.length === 1`, 30000 ).catch( () => {} );
		const b1 = await bait( owner );
		say( b1.ballyhoo === 11, `a line out on her spread by F: prompt "${ p1.said }", chip "${ p1.chip }"; her ballyhoo ${ b1.ballyhoo } of 12` );
		await press( guest, 'KeyF', 2 );
		await until( owner.game, 'window.__app.game.rigs.lines.length === 2', 30000 ).catch( () => {} );
		note( 'her toasts:', JSON.stringify( await told( owner ) ), ' his:', JSON.stringify( await told( guest ) ) );
		await press( guest, 'KeyG', 2 );
		await until( owner.game, 'window.__app.game.rigs.lines.every( ( L ) => L.in ) || ! window.__app.game.rigs.lines.length', 30000 ).catch( () => {} );
		await until( owner.game, '! window.__app.game.rigs.lines.length', 60000 ).catch( () => {} );
		const b2 = await bait( owner );
		say( b2.ballyhoo === 12, `brought in by G (the right button): her lines ${ await owner.game.evaluate( () => window.__app.game.rigs.lines.length ) }, her ballyhoo back to ${ b2.ballyhoo }` );

		// a rod off her holder, on her tackle
		await guest.game.evaluate( () => { const g = window.__app.game; g.stowRod(); } );
		await owner.game.evaluate( async () => {

			const { BAIT_IDS, BAITS } = await import( '/src/game/Bait.js' );
			const a = window.__app, r = a.game.rigs, V = a.camera.position.constructor, s = r.spots()[ 0 ];
			const L = { spot: s, bait: 'ballyhoo', len: 30, p: new V(), tip: new V(), clip: null, butt: new V(), on: { species: 'yellowfin', kg: 30, t: - 600, place: null, at: { x: a.boatCtl.position.x, z: a.boatCtl.position.z } }, in: false, torn: 0, bend: 0 };
			r.lines.length = 0;
			r._place( L );
			L.p.copy( L.tip );
			r.lines.push( L );
			r._trollT = 1e9;

		} );
		await until( guest.game, `${ other }.cur.spread && ${ other }.cur.spread.some( ( x ) => x.on )`, 60000 );
		await guest.game.evaluate( `( async () => { const { rodOf } = await import( '/src/together/Spread.js' ); const p = window.__app.player, V = p.deckPos.constructor, at = { butt: new V(), tip: new V(), clip: new V() }, L = ${ other }.cur.spread.find( ( x ) => x.on ); rodOf( p.boat.model, L, at ); const y = p.deckGroundAt( at.butt.x * 0.8, at.butt.z + 0.5, at.butt.y ); p.deckPos.set( at.butt.x * 0.8, y, at.butt.z + 0.5 ); p.deckVel.set( 0, 0, 0 ); } )()` );
		await frames( guest.game, 4 );
		await press( guest, 'KeyR', 3 );
		await until( guest.game, '!! window.__app.game.fight', 60000 ).catch( () => {} );
		const f = await guest.game.evaluate( () => { const g = window.__app.game, f = g.fight, r = g.rigs; return f ? { lineKg: f.lineKg, dragKg: f.dragKg, reelSpeed: f.reelSpeed, holdKg: f.holdKg, spoolM: f.spoolM, kit: !! r.kit } : null; } );
		say( f && f.lineKg === hers.lineKg && f.dragKg === hers.dragKg && f.holdKg === 18 && f.kit, `a rod taken off her holder is fought on her tackle, not his: ${ JSON.stringify( f ) }` );
		note( 'his toasts:', JSON.stringify( await told( guest ) ) );
		await guest.game.evaluate( () => { const g = window.__app.game; g.cancelLine( true ); g.stowRod(); } );
		await frames( guest.game, 3 );

		// her kite, on her stand-up rod (his own rod has none), with her live bait; and her bait back as the rod goes away
		await owner.game.evaluate( () => window.__app.together.setWeather( 'breezy', 0 ) );
		await frames( owner.game, 30 );
		const wind = await guest.game.evaluate( async () => { const { G } = await import( '/src/core/Globals.js' ); return +G.windSpeed.value.toFixed( 1 ); } );
		const pk = await pressHers( guest, 'kite', 'silverside' );
		await until( guest.game, '!! window.__app.game.rigs.kite', 30000 ).catch( () => {} );
		const k = await guest.game.evaluate( () => { const g = window.__app.game, r = g.rigs; return { kite: !! r.kite, kit: !! r.kit, hook: g.hookBait, lent: r._lent, spool: g.rod.spoolM }; } );
		const b3 = await bait( owner );
		say( k.kite && k.kit && k.hook === 'silverside' && b3.silverside === 3, `her kite up off her stern (wind ${ wind } m/s): prompt "${ pk.said }", ${ JSON.stringify( k ) }, her silversides ${ b3.silverside } of 4` );
		await frames( guest.game, 60 );
		await until( owner.game, `!! ${ other }.cur.kite`, 30000 ).catch( () => {} );
		const sees = await owner.game.evaluate( `( () => { const o = ${ other }, T = window.__app.together, k = T.spread._kiteBoat( o, T.others ); return { kite: o.cur.kite, off: k ? ( k.f ? 'a copy' : 'her own' ) : null }; } )()` );
		say( sees.kite && sees.off === 'her own', `Robin sees his kite flown off her own stern: ${ JSON.stringify( sees ) }` );
		await guest.game.evaluate( () => window.__app.game.stowRod() );
		await until( owner.game, '( window.__app.game.state.bait.silverside | 0 ) === 4', 20000 ).catch( () => {} );
		const b4 = await bait( owner );
		say( b4.silverside === 4, `the rod away, her silverside's back with her: ${ b4.silverside }` );

		// her electric reel
		await frames( guest.game, 3 );
		await pressHers( guest, 'drop', 'squid' );
		await until( guest.game, 'window.__app.game.rod.rig === "drop"', 30000 ).catch( () => {} );
		const d = await guest.game.evaluate( () => { const g = window.__app.game; return { rig: g.rod.rig, reach: g.rod.dropReach, electric: g.rod.electric, kit: !! g.rigs.kit, hook: g.hookBait }; } );
		say( d.reach === 900 && d.electric && d.kit, `down on her electric reel (his own has none): ${ JSON.stringify( d ) }` );
		await guest.game.evaluate( () => window.__app.game.stowRod() );
		await frames( guest.game, 6 );

		// her chum: her slick, and his fish come up it too
		await pressHers( guest, 'troll', 'chum' );
		await until( owner.game, '!! window.__app.game.rigs.slick', 30000 ).catch( () => {} );
		await until( guest.game, 'window.__app.game.rigs.theirSlicks.length > 0', 30000 ).catch( () => {} );
		const c = await guest.game.evaluate( () => { const r = window.__app.game.rigs, S = r.theirSlicks[ 0 ]; return S ? { slicks: r.theirSlicks.length, at: +r.slickAt( S.x, S.z ).toFixed( 2 ) } : null; } );
		const b5 = await bait( owner );
		say( c && c.at > 0.5 && b5.chum === 1, `her chum over the side: her slick's in his game too, ${ JSON.stringify( c ) }; her chum ${ b5.chum } of 2` );
		note( 'her toasts:', JSON.stringify( await told( owner ) ), ' his:', JSON.stringify( await told( guest ) ) );
		await guest.game.evaluate( () => window.__app.game.stowRod() );
		await shot( guest, 'crew-rods-guest' );

	}

	if ( PART === 'lights' ) {

		// at night
		await owner.game.evaluate( () => { const a = window.__app; a.together.setClock( 22, a.settings.day, 0.0001 ); } );
		await frames( owner.game, 20 );
		await frames( guest.game, 20 );
		// her searchlight, from her helm: she leaves it and he takes it
		await owner.game.evaluate( () => { const p = window.__app.player; p.leaveHelm(); } );
		await frames( owner.game, 6 );
		await until( guest.game, `${ other }.cur.mode === 'deck'`, 30000 ).catch( () => {} );
		await guest.game.evaluate( () => { const p = window.__app.player, M = p.boat.model; p.deckPos.set( M.helm.x + 0.05, M.helm.y ?? M.lines.deckY, M.helm.z - 0.45 ); p.deckVel.set( 0, 0, 0 ); } );
		await frames( guest.game, 6 );
		await press( guest, 'KeyE', 3 );
		await until( guest.game, 'window.__app.player.mode === "boat"', 20000 ).catch( () => {} );
		const atHelm = await guest.game.evaluate( () => ( { mode: window.__app.player.mode, theirs: window.__app.together.theirSearchlight() } ) );
		say( atHelm.mode === 'boat' && atHelm.theirs, `Sam at her helm, her searchlight his to switch: ${ JSON.stringify( atHelm ) }` );
		await press( guest, 'KeyL', 2 );
		await until( owner.game, 'window.__app.searchlight === true', 20000 ).catch( () => {} );
		await until( guest.game, `${ other }.cur.spot === true`, 20000 ).catch( () => {} );
		const spot = { hers: await owner.game.evaluate( () => window.__app.searchlight ), seen: await guest.game.evaluate( `${ other }.cur.spot` ), his: await guest.game.evaluate( () => window.__app.searchlight ) };
		say( spot.hers && spot.seen && ! spot.his, `L at her helm switched her searchlight on, on her game: ${ JSON.stringify( spot ) }` );
		await shot( guest, 'crew-lights-searchlight' );
		// his flashlight, seen on hers: off her helm and on her deck
		await guest.game.evaluate( () => window.__app.player.leaveHelm() );
		await frames( guest.game, 6 );
		await press( guest, 'KeyL', 2 );
		await until( owner.game, `${ other }.cur.torch === true`, 20000 ).catch( () => {} );
		await frames( owner.game, 10 );
		const torch = await owner.game.evaluate( `( () => { const o = ${ other }, t = o.torch, L = window.__app.localLights; return t ? { on: t.spot, beam: t.beam.visible, light: !! t.light && t.light.enabled && L.sources.includes( t.light ), at: t.group.position.toArray().map( ( v ) => +v.toFixed( 1 ) ), him: o.avatar.group.position.toArray().map( ( v ) => +v.toFixed( 1 ) ) } : null; } )()` );
		say( torch && torch.on && torch.beam && torch.light, `his flashlight seen on her game, at his hand: ${ JSON.stringify( torch ) }` );
		await owner.game.evaluate( () => { const a = window.__app, p = a.player; p.camMode = 'third'; p.orbitDist = 9; p.orbitYaw = a.boatCtl.getYaw() + 2.4; p.orbitPitch = 0.25; } );
		await frames( owner.game, 6 );
		await shot( owner, 'crew-lights-torch' );
		// her underwater lights over his fish: his bites see them, from her stern, not his own boat's
		const under = await guest.game.evaluate( () => { const a = window.__app, g = a.game, r = g._litBy(); return r ? { under: +r.under.toFixed( 2 ), at: +g.underAt( r.stern.x + 4, r.stern.z + 4 ).toFixed( 2 ), own: +g.underOn.toFixed( 2 ) } : null; } );
		say( under && under.under > 0.5 && under.at > 0.3, `her underwater lights in his bites: ${ JSON.stringify( under ) }` );

	}

	await G.end( `crew ${ PART }` );

}

if ( PART === 'traps' ) {

	const owner = await G.open( 'Robin', 'lobster', 30 ), guest = await G.open( 'Sam', 'console', 30 );
	await ready( owner, guest );
	await G.buy( owner );
	const owned = await owner.game.evaluate( async () => { const { ownedTraps } = await import( '/src/game/Traps.js' ); return ownedTraps( window.__app.game.state.upgrades ); } );
	note( 'her traps:', owned );
	say( await G.aboard( owner, guest ), 'Sam\'s aboard the lobster boat' );
	await G.helm( owner );
	// somewhere a trap can be set: 8 to 25 m of good bottom, away from the dock
	const F = await owner.game.evaluate( async () => {

		const { BOTTOMS } = await import( '/src/game/Traps.js' );
		const w = window.__app.game.traps;
		for ( let r = 300; r < 2500; r += 60 ) for ( let a = 0; a < 6.28; a += 0.2 ) {

			const x = Math.cos( a ) * r, z = Math.sin( a ) * r + 200, d = w.depthAt( x, z );
			if ( d > 9 && d < 22 && BOTTOMS[ w.bottom( x, z ) ].q >= 0.45 ) return { x, z, d: +d.toFixed( 1 ), b: w.bottom( x, z ) };

		}

		return null;

	} );
	note( 'set her traps at', JSON.stringify( F ) );
	await G.toSea( owner, F );
	await until( guest.game, `Math.hypot( window.__app.player.boat.position.x - ${ F.x }, window.__app.player.boat.position.z - ${ F.z } ) < 40` );
	await toasts( owner );
	await toasts( guest );
	await until( guest.game, `${ other }.cur.ts === ${ owned }`, 30000 ).catch( () => {} );
	await until( guest.game, 'window.__app.player.boat.flat < 1', 60000 ).catch( () => {} );
	say( await guest.game.evaluate( `${ other }.cur.ts` ) === owned, `her stack seen from his game: ${ await guest.game.evaluate( `${ other }.cur.ts` ) } on her deck` );
	await frames( guest.game, 10 );
	const drawn = await guest.game.evaluate( () => { const w = window.__app.game.traps; return { theirs: w._theirs.length, stacked: w._theirs[ 0 ] && w._theirs[ 0 ].stacked, drawn: w.meshes ? w.meshes.traps.count : 0, colliders: window.__app.player.boat.model.colliders.filter( ( c ) => c.tag === 'trap' ).length }; } );
	say( drawn.stacked === owned && drawn.drawn >= owned && drawn.colliders > 0, `her stack drawn on her copy and walked round: ${ JSON.stringify( drawn ) }` );

	// to her hauler, and E: one of hers over the side
	const stand = async () => {

		// (looking at her rail, where the work's done)
		await guest.game.evaluate( async () => { const { stationsOf } = await import( '/src/game/TrapWork.js' ); const p = window.__app.player, A = stationsOf( p.boat.model.lines ); p.deckPos.set( A.stand.x, p.deckGroundAt( A.stand.x, A.stand.z, 3 ), A.stand.z ); p.deckVel.set( 0, 0, 0 ); p.deckYaw = Math.atan2( A.rail.x - A.stand.x, A.rail.z - A.stand.z ) + 0.5; p.pitch = - 0.3; window.__app.game.rod.equipped && window.__app.game.stowRod(); } );
		await frames( guest.game, 4 );
		return guest.game.evaluate( () => window.__app.player.prompt && window.__app.player.prompt.text );

	};

	const s1 = await stand();
	const way = { hers: await owner.game.evaluate( () => +window.__app.boatCtl.speed.toFixed( 2 ) ), seen: await guest.game.evaluate( () => { const b = window.__app.player.boat; return { speed: +b.speed.toFixed( 2 ), flat: +b.flat.toFixed( 2 ) }; } ) };
	say( /Set one of Robin's traps/.test( s1 || '' ), `at her hauler: "${ s1 }" (her way: ${ JSON.stringify( way ) })` );
	await press( guest, 'KeyE', 2 );
	await until( owner.game, 'window.__app.game.traps.traps.set.length === 1', 30000 ).catch( () => {} );
	await until( guest.game, `!! ${ other }.cur.tj`, 10000 ).catch( () => {} );
	const set = await owner.game.evaluate( () => { const w = window.__app.game.traps, j = w.job; return { set: w.traps.set.length, by: j && j.by, mark: w.traps.set[ 0 ] && w.traps.set[ 0 ].mark }; } );
	const mirror = await guest.game.evaluate( () => { const w = window.__app.game.traps, e = w._theirs[ 0 ]; return e && e.job ? { kind: e.job.kind, t: +e.job.t.toFixed( 2 ) } : null; } );
	say( set.set === 1 && set.by === 'sam-1' && mirror && mirror.kind === 'set', `E set one of hers: on her save and her chart (${ JSON.stringify( set ) }), and he sees it go over: ${ JSON.stringify( mirror ) }` );
	await shot( guest, 'crew-traps-set' );
	note( 'her toasts:', JSON.stringify( await told( owner ) ), ' his:', JSON.stringify( await told( guest ) ) );
	await until( owner.game, '! window.__app.game.traps.job', 60000 ).catch( () => {} );

	// some nights down, on the reef's edge; her buoy to his gaff
	await until( guest.game, `( window.__app.game.traps.others[ 'robin-1' ] || { b: [] } ).b.length === 1`, 30000 ).catch( () => {} );
	say( await guest.game.evaluate( `( window.__app.game.traps.others[ 'robin-1' ] || { b: [] } ).b.length` ) === 1, 'her buoy reaches his game' );
	await owner.game.evaluate( async () => {

		const { buoyOffset } = await import( '/src/game/Traps.js' );
		const { stationsOf } = await import( '/src/game/TrapWork.js' );
		const a = window.__app, w = a.game.traps, t = w.traps.set[ 0 ], b = a.boatCtl, A = stationsOf( a.boat.lines );
		t.T -= 72; t.at -= 72 * 3600e3; t.q = 1; t.size = 1.5; // (three nights down, on the best of it)
		const o = buoyOffset( t.x, t.z, w.depthAt( t.x, t.z ) ), r = A.reach.clone().applyQuaternion( b.quaternion );
		b.position.x = t.x + o.x - r.x;
		b.position.z = t.z + o.z - r.z;
		b.velocity.set( 0, 0, 0 );

	} );
	await frames( owner.game, 10 );
	await frames( guest.game, 10 );
	const s2 = await stand();
	say( /Gaff Robin's buoy/.test( s2 || '' ), `alongside her buoy: "${ s2 }"` );
	const before = await guest.game.evaluate( () => window.__app.game.state.holdKg );
	await press( guest, 'KeyE', 2 );
	await until( owner.game, 'window.__app.game.traps.job && window.__app.game.traps.job.by === "sam-1"', 20000 ).catch( () => {} );
	await until( guest.game, `${ other }.cur.tj && ${ other }.cur.tj[ 0 ] === 2`, 120000 ).catch( () => {} );
	await frames( guest.game, 6 );
	await shot( guest, 'crew-traps-hauling' );
	await until( guest.game, '!! window.__app.game.traps.helping', 400000 ).catch( () => {} );
	const help = await guest.game.evaluate( () => { const H = window.__app.game.traps.helping; return H ? { n: H.q.length, lobsters: H.q.filter( ( x ) => x.lobster ).length } : null; } );
	say( help, `up on her rail, his to take out: ${ JSON.stringify( help ) }` );
	await frames( guest.game, 6 );
	await shot( guest, 'crew-traps-rail' );
	let n = 0;
	for ( ; n < 30; n ++ ) {

		const s = await guest.game.evaluate( () => { const w = window.__app.game.traps, H = w.helping; return H ? { q: H.q.length, card: !! H.card, prompt: window.__app.player.prompt && window.__app.player.prompt.text } : null; } );
		if ( ! s ) break;
		if ( s.card ) await press( guest, 'KeyE', 2 );
		else await press( guest, 'KeyE', 2 );
		await frames( guest.game, 4 );

	}

	await until( owner.game, '! window.__app.game.traps.job', 30000 ).catch( () => {} );
	const after = await guest.game.evaluate( () => window.__app.game.state.holdKg );
	const herEnd = await owner.game.evaluate( async () => { const { aboardTraps } = await import( '/src/game/Traps.js' ); const w = window.__app.game.traps, s = window.__app.game.state; return { set: w.traps.set.length, aboard: aboardTraps( w.traps, s.upgrades ), job: !! w.job, hold: s.holdKg }; } );
	say( ! herEnd.job && herEnd.set === 0 && herEnd.aboard === owned, `taken out by E and stacked: her trap's back on her deck (${ JSON.stringify( herEnd ) }), his hold ${ before.toFixed( 2 ) } -> ${ after.toFixed( 2 ) } kg after ${ n } presses` );
	say( help && ( ! help.lobsters || after > before ), 'what came up is his: in his save, not hers (in her box while he\'s aboard: v2.3.0)' );
	note( 'her toasts:', JSON.stringify( await told( owner ) ), ' his:', JSON.stringify( await told( guest ) ) );
	await G.end( 'crew traps' );

}

if ( PART === 'hold' ) {

	// a boat bought and taken out: the bar at the top shows her hold at once (it kept the boat you'd left)
	const one = await G.open( 'Sam', 'kayak', 30 );
	const r = await one.game.evaluate( async () => {

		const a = window.__app, g = a.game, s = g.state, p = a.player;
		s.money = 1e6;
		const bought = s.owns( 'console' ) || !! s.buyBoat( 'console' );
		// (ashore: a boat's only taken out from the land)
		const start = { mode: p.mode, riding: p.riding };
		if ( p.mode === 'boat' && a.boat.seated ) p.leaveHelm ? p.leaveHelm() : null;
		if ( p.mode === 'boat' || p.mode === 'deck' ) p.exitBoat( null, 1 );
		if ( p.mode === 'swim' || p.mode === 'boat' || p.mode === 'deck' ) { p.mode = 'walk'; p.position.set( 60, 2, - 70 ); }
		const was = g.hud.coolerKg.textContent, from = s.boat;
		const ok = await a.setBoat( 'console' );
		return { bought, start, mode: p.mode, from, ok, was, now: g.hud.coolerKg.textContent, kg: s.stats.holdKg, boat: s.boat };

	} );
	note( JSON.stringify( r ) );
	const lbs = r.now.split( '/' )[ 1 ];
	// ((v2.4.1) her room for fish: all of her hold, with no ice in it yet)
	say( r.ok && r.was !== r.now && Math.abs( num( lbs ) - r.kg * 2.20462 ) < 1.5, `the console taken out: the bar reads "${ r.now }" at once (was "${ r.was }"; her hold ${ r.kg } kg)` );
	await G.end( 'crew hold' );

}

if ( PART === 'box' ) {

	// (v2.3.0) one fish box aboard: Sam's catch in her hold, kept on her ice and his to keep; her ice chilling it, once; both
	// bars drawn from the box as it changes; her icemaker stopping when the box is full; his fish with him when he's off her
	const owner = await G.open( 'Robin', 'sportfisher', 30 ), guest = await G.open( 'Sam', 'lobster', 30 );
	await ready( owner, guest );
	await G.buy( owner );
	// (her big box, and her icemaker off for now: what her ice does is the catch's alone)
	await owner.game.evaluate( () => { const g = window.__app.game; g.state.upgrades.sfIcemaker = 0; g.applyGear(); g.daysOut.box.ice = 100; g.state.emit(); } );
	// ((v2.4.1) both bars: the hold's room for fish and the ice's time, with whether each is coral)
	const bar = ( who ) => who.game.evaluate( () => { const a = window.__app, s = a.game.state, b = s.box(), h = a.game.hud; return { bar: h.coolerKg.textContent, label: h.coolerLabel.textContent, full: h.coolerEl.classList.contains( 'is-full' ), iceT: h.iceEl.classList.contains( 'is-on' ) ? h.iceT.textContent : null, low: h.iceEl.classList.contains( 'is-low' ), cap: b.cap, ice: +b.ice.toFixed( 2 ), melt: b.melt, makes: b.makes, others: +b.others.toFixed( 2 ), mine: +s.holdKg.toFixed( 2 ), whose: b.whose, by: b.by, fish: s.inventory.length }; } );
	const lbs = ( kg ) => String( Math.round( kg * 2.20462 ) );
	// the bars as Seaworthy's boxBars has that box, to a pound (and the ice's time a moment either way: it's drawn every 20 frames)
	const drawn = ( r ) => {

		const k = boxBars( r, r.mine ), [ f, room ] = r.bar.split( '/' ).map( num );
		const times = [ 0.97, 1, 1.03 ].map( ( m ) => iceSaid( k.hours * m ) );
		return Math.abs( f - k.fish * LB ) <= 1 && Math.abs( room - k.room * LB ) <= 1 && r.full === k.full && times.includes( r.iceT ) && r.low === k.low;

	};
	const clock = ( speed ) => owner.game.evaluate( ( v ) => { const a = window.__app; a.together.setClock( a.settings.timeOfDay, a.settings.day, v ); }, speed );
	say( await G.aboard( owner, guest ), 'Sam\'s aboard the sportfisher' );
	await G.helm( owner );
	await G.toSea( owner );
	await until( guest.game, '!! window.__app.together.box.herBox()', 30000 ).catch( () => {} );
	await frames( guest.game, 25 );
	const g0 = await bar( guest );
	// ((v2.4.1) her room for fish, the box less the day's ice the catch must keep; her ice's time)
	say( g0.cap === 600 && g0.whose === 'Robin' && g0.label === 'Hold' && drawn( g0 ) && num( g0.bar ) === 0 && Math.round( num( g0.bar.split( '/' )[ 1 ] ) ) === 1287 && g0.iceT === '6 days' && ! g0.full && ! g0.low, `aboard her, Sam's bars are her hold's room and her ice: "${ g0.bar }", "${ g0.iceT }" ${ JSON.stringify( g0 ) }` );

	// his tuna, in her hold (his own cooler holds 30 kg)
	const kept = await guest.game.evaluate( () => { const g = window.__app.game, f = g.state.addFish( 'yellowfin', 40, g.hour, { day: g.tradeDay } ); return f ? f.kg : null; } );
	say( kept === 40, 'a 40 kg tuna kept, in her hold: his own cooler holds 30 kg' );
	await until( owner.game, 'Math.abs( window.__app.game.daysOut.guestsKg - 40 ) < 0.01', 30000 ).catch( () => {} );
	await frames( owner.game, 25 );
	const o1 = await bar( owner );
	say( Math.abs( o1.ice - ( 100 - 0.285 * 40 ) ) < 0.3 && o1.others === 40 && o1.by.length === 1 && o1.by[ 0 ].name === 'Sam' && Math.abs( num( o1.bar ) - lbs( 40 ) ) <= 1 && drawn( o1 ), `Robin's game: his tuna in her box, chilled on her ice, and on her bars ("${ o1.bar }", ice "${ o1.iceT }"): ${ JSON.stringify( o1 ) }` );
	await frames( owner.game, 90 );
	const o1b = await bar( owner );
	say( Math.abs( o1b.ice - o1.ice ) < 0.05, `chilled once, though he says what's his each few seconds (${ o1.ice } -> ${ o1b.ice } kg)` );
	await frames( guest.game, 40 );
	const g1 = await bar( guest );
	say( g1.mine === 40 && Math.abs( g1.ice - o1.ice ) < 0.3 && g1.bar === o1.bar && g1.iceT === o1.iceT && drawn( g1 ), `and Sam's bars the same box: "${ g1.bar }", ice "${ g1.iceT }" ${ JSON.stringify( g1 ) }` );
	const panel = ( who ) => who.game.evaluate( () => { const i = window.__app.game.hud.inv; return `${ i.querySelector( 'h2' ).textContent } | ${ i.querySelector( '.gm-sub' ).textContent }`; } );
	await guest.game.evaluate( () => window.__app.game.hud.toggleInventory( true ) );
	const gp = await panel( guest );
	note( 'Sam\'s panel:', gp );
	await shot( guest, 'crew-box-guest' );
	await guest.game.evaluate( () => window.__app.game.hud.toggleInventory( false ) );
	await owner.game.evaluate( () => window.__app.game.hud.toggleInventory( true ) );
	const op = await panel( owner );
	note( 'Robin\'s panel:', op );
	await shot( owner, 'crew-box-owner' );
	await owner.game.evaluate( () => window.__app.game.hud.toggleInventory( false ) );
	say( gp.startsWith( 'Robin\'s hold' ) && gp.includes( 'Yours: 1 fish' ) && op.includes( 'Sam\'s 1 fish' ), 'each panel says whose is whose' );
	say( [ gp, op ].every( ( p ) => p.includes( `${ g1.bar.split( '/' )[ 0 ].trim() } of ${ g1.bar.split( '/' )[ 1 ].replace( ' lb', '' ).trim() } lb of room for fish` ) && p.includes( `ice for ${ g1.iceT }` ) ), 'and both panels the same two figures as the bars' );

	// thirteen island hours: his tuna on her ice
	const t0 = await guest.game.evaluate( () => window.__app.settings.timeOfDay ), T0 = await guest.game.evaluate( () => window.__app.settings.day * 24 + window.__app.settings.timeOfDay );
	await clock( 0.4 );
	await until( guest.game, `( ( window.__app.settings.timeOfDay - ${ t0 } + 24 ) % 24 ) > 13`, 300000 ).catch( () => {} );
	await clock( 0.0001 );
	await frames( guest.game, 40 );
	const aged = await guest.game.evaluate( () => { const a = window.__app, f = a.game.state.inventory[ 0 ]; return f ? { w: +( f.w || 0 ).toFixed( 2 ), value: f.value, v0: f.v0, T: a.settings.day * 24 + a.settings.timeOfDay } : null; } );
	const o2 = await bar( owner ), hours = aged ? aged.T - T0 : 0;
	// (iced, a fish ages a twenty-fourth as fast: what it's aged past that is the hours it was warm. A slow game's clock can run on past 13)
	say( aged && hours >= 13 && aged.w - hours / 24 < 0.3 && aged.value === aged.v0 && o2.ice < o1.ice, `${ hours.toFixed( 1 ) } hours on: his tuna iced all of them and fresh (aged ${ aged && aged.w } hours, ${ ( hours / 24 ).toFixed( 2 ) } of them for its hours on ice); her ice ${ o1.ice } -> ${ o2.ice } kg` );

	await toasts( guest );
	const watch = setInterval( () => guest.game.evaluate( () => { const a = window.__app, f = a.game.state.inventory[ 0 ], h = a.together.box.herBox(); return { t: +a.settings.timeOfDay.toFixed( 2 ), d: a.settings.day, fish: a.game.state.inventory.length, w: f ? +( f.w || 0 ).toFixed( 2 ) : null, her: !! h, ice: h ? h.ice : null, mode: a.player.mode, riding: a.player.riding }; } ).then( ( r ) => note( 'Sam:', JSON.stringify( r ) ) ).catch( () => {} ), 4000 );
	// her icemaker on, under way on her generator: the bars follow the ice as it's made (no change to anyone's save), and it
	// stops when the box is full
	await owner.game.evaluate( () => { const g = window.__app.game; g.state.upgrades.sfIcemaker = 1; g.applyGear(); } );
	await clock( 0.4 );
	await frames( owner.game, 150 );
	await clock( 0.0001 );
	await frames( owner.game, 40 );
	await frames( guest.game, 60 );
	clearInterval( watch );
	note( 'Sam\'s toasts:', JSON.stringify( await told( guest ) ) );
	const o3 = await bar( owner ), g3 = await bar( guest );
	// ((v2.4.1) the ice made isn't fish: the hold bar holds still, and the ice bar says it's being made, on both games)
	say( o3.ice > o2.ice + 1 && drawn( o3 ) && drawn( g3 ) && o3.iceT === 'Making' && g3.iceT === 'Making' && g3.bar === o3.bar && Math.abs( num( o3.bar ) - lbs( o3.mine + o3.others ) ) <= 1, `her icemaker making ice: ${ o2.ice } -> ${ o3.ice } kg; both hold bars still the fish ("${ o3.bar }", "${ g3.bar }"), both ice bars "${ o3.iceT }", "${ g3.iceT }"` );
	await owner.game.evaluate( () => { const g = window.__app.game; g.daysOut.box.ice = 600 - 40 - 3; } );
	await clock( 0.4 );
	await frames( owner.game, 150 );
	await clock( 0.0001 );
	await frames( owner.game, 40 );
	const o4 = await bar( owner );
	// ((v2.4.1) a box full of ice isn't a full hold: the bar's his tuna against the room fish have, not coral)
	say( o4.ice <= 560 + 0.01 && o4.ice > 559 && drawn( o4 ) && Math.abs( num( o4.bar ) - lbs( 40 ) ) <= 1 && ! o4.full && o4.iceT === 'Making', `and the box full, it stops: ${ o4.ice } kg of ice beside his 40 kg tuna, and the bars "${ o4.bar }" (not coral), ice "${ o4.iceT }"` );
	const big = await guest.game.evaluate( () => { const s = window.__app.game.state; return { fits60: s.fits( 60 ), short60: +s.shortOf( 60 ).toFixed( 1 ) }; } );
	say( big.fits60, `a box full of ice still takes a fish: the ice past the catch's day is let go for it (${ JSON.stringify( big ) })` );

	// he goes over her side: his tuna's still his, her box hers alone
	await guest.game.evaluate( () => window.__app.player.exitBoat( null, 1 ) );
	await frames( guest.game, 40 );
	await until( owner.game, 'window.__app.game.daysOut.guestsKg === 0', 30000 ).catch( () => {} );
	await frames( owner.game, 25 );
	const g5 = await bar( guest ), o5 = await bar( owner );
	say( g5.fish === 1 && g5.cap === 30 && g5.whose === null && o5.others === 0 && o5.by.length === 0, `off her: his tuna's his, in his own cooler's count (${ JSON.stringify( g5 ) }); hers alone (${ JSON.stringify( o5 ) })` );
	// ((v2.4.1) his own bars again: his tuna in his cooler, over its room and coral, and no ice in it, coral)
	say( drawn( g5 ) && g5.full && g5.iceT === 'No ice' && g5.low && drawn( o5 ), `and his bars his own cooler's: "${ g5.bar }" and "${ g5.iceT }", both coral; hers "${ o5.bar }", "${ o5.iceT }"` );
	await G.end( 'crew box' );

}
