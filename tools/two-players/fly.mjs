// (M19) The fly rod with two real games (stream FLY: docs/m19/fly.md): Robin and Sam wading the west's flats, a school of bonefish
// near, Sam with the fly rod, his flats licence and a box of shrimp flies, the cast button held and let go as a player does it.
//  - loop: Sam false casts, his back to the school; on Robin's game his copy's rod goes back and forth and the loop unrolls from
//    its tip as long as Sam's line is in the air (his pose's fp and fl, the fly rod in his hands, fw), drawn in the fishing line's
//    program (no program built for it); let go, it's shot, and Robin sees his line out to where the fly came down
//  - spook: Sam, facing the school 12 m off, false casts on and on toward it: his line over it spooks it on his game
//    ('falsecast'), and on Robin's it bolts too, from the same island time
// Each game's frames are counted as its own updates (a CPU's two or three a second); its rate printed at the end.
//   a dev server, then   ALL_THE_SPACES=... node tools/two-players/fly.mjs [out] [port] [part: all | loop | spook]
import fs from 'node:fs';
import { OTHER as other, start } from './lib.mjs';
const [ out = 'qa-output/fly-together', PORT = '5239', PART = 'all' ] = process.argv.slice( 2 );
const doing = ( p ) => PART === 'all' || PART === p;
fs.mkdirSync( out, { recursive: true } );
const G = await start( { out, port: PORT } );
const { say, note, until, frames } = G;
const group = `fly-${ Date.now() }`;

const robin = await G.open( 'Robin', 'kayak', 20, { group } ), sam = await G.open( 'Sam', 'kayak', 20, { group } );
await until( sam.game, `${ other } && ${ other }.cur` );
await until( robin.game, `${ other } && ${ other }.cur` );
for ( const w of [ robin, sam ] ) await w.game.evaluate( () => {

	const g = window.__app.game, u = g.state.upgrades;
	u.glasses = 1;
	u.flyRod = 1;
	u.flies = 1;
	u.flatsLicence = 1;
	g.applyGear();
	window.__toasts = [];
	const was = g.toast;
	g.toast = function ( t, ms ) {

		window.__toasts.push( t );
		return was.call( this, t, ms );

	};

} );
// (the flats' fish brought forward, as flats.mjs does: a CPU has them past 25 minutes in)
for ( const w of [ robin, sam ] ) await w.game.evaluate( () => { const a = window.__app; if ( ! a._reefEarly ) { const p = a.reefGrows(); a._reefEarly = p; a.reefGrows = () => p; } } );
for ( const w of [ robin, sam ] ) await until( w.game, 'window.__app.fish && window.__app.fish.sightGroups && window.__app.fish.sightGroups.length > 0', 1500000 );
note( 'the flats\' fish are in on both games' );

// a time a school of bonefish is on the flat in water a wader stands in, by day
const pick = await robin.game.evaluate( async () => {

	const { flatsSchools } = await import( '/src/game/Flats.js' );
	const { tideAt } = await import( '/src/game/IslandClock.js' );
	const a = window.__app, td = a.terrainData;
	for ( let day = a.settings.day; day < a.settings.day + 40; day ++ ) for ( let h = 10.5; h <= 13.5; h += 0.25 ) {

		const T = ( day - 1 ) * 24 + h, sea = tideAt( T );
		const A = flatsSchools( T, { wind: 2, overcast: 0, hour: h } ).find( ( q ) => q.kind === 'bonefish' && q.life > 0.99 && q.n >= 4 && q.mode !== 'mill' && sea - td.heightAt( q.x, q.z ) > 0.35 && sea - td.heightAt( q.x, q.z ) < 1.0 );
		if ( A ) return { day, h, T, A };

	}

	return null;

} );
say( !! pick, pick ? `day ${ pick.day } ${ pick.h.toFixed( 2 ) } h: ${ pick.A.id } (${ pick.A.n }, ${ pick.A.mode }) on the flat` : 'no school found' );
if ( ! pick ) await G.end( 'fly' );
await robin.game.evaluate( ( [ h, day ] ) => window.__app.together.setClock( h, day, 0.0001 ), [ pick.h, pick.day ] );
const T = `( window.__app.settings.day - 1 ) * 24 + window.__app.settings.timeOfDay`;
for ( const w of [ robin, sam ] ) await until( w.game, `Math.abs( ${ T } - ${ pick.T } ) < 0.05`, 120000 );
const A = pick.A.id;

// wading, d m off the school (the sun behind you, turned about it), looking at it or away
const wade = ( who, d, turn = 0, look = true ) => who.game.evaluate( async ( [ id, d, turn, look ] ) => {

	const { G } = await import( '/src/core/Globals.js' );
	const { flatsSchools } = await import( '/src/game/Flats.js' );
	const a = window.__app, p = a.player, F = a.game.flats, sea = G.seaLevel.value, sun = G.sunDir.value, sl = Math.hypot( sun.x, sun.z ) || 1;
	const g = a.fish.sightGroups.find( ( h ) => h.sight && h.sight.id === id && h.active );
	const q = g ? { x: g.center.x, z: g.center.z } : flatsSchools( F.T, { wind: G.windSpeed.value, overcast: 0, hour: a.settings.timeOfDay } ).find( ( s ) => s.id === id );
	if ( ! q ) return null;
	const ang = Math.atan2( sun.z / sl, sun.x / sl ) + turn, x = q.x + Math.cos( ang ) * d, z = q.z + Math.sin( ang ) * d;
	const ground = a.terrainData.heightAt( x, z );
	p.position.set( x, Math.max( ground, sea - 1.2 ), z );
	p.velocity.set( 0, 0, 0 );
	// (stood up where you're put: the water level the player goes by is smoothed over seconds, and its first reading here is
	// the last place's)
	p.mode = 'walk';
	p.waterMean = p.waterH = sea;
	const fx = look ? q.x - x : x - q.x, fz = look ? q.z - z : z - q.z;
	p.yaw = Math.atan2( - fx, - fz );
	p.pitch = - 0.12;
	F._was.has = false;
	return { x: +x.toFixed( 1 ), z: +z.toFixed( 1 ), depth: +( sea - ground ).toFixed( 2 ) };

}, [ A, d, turn, look ] );
const active = `window.__app.fish.sightGroups.some( ( g ) => g.sight && g.sight.id === '${ A }' && g.active )`;
// Sam's fly rod out, the fly rig on, as a player has it: R, then the rig picked (C steps through them)
const flyOut = async () => {

	await G.press( sam, 'KeyR', 2 );
	await frames( sam.game, 4 );
	await sam.game.evaluate( () => {

		const g = window.__app.game;
		g.rigs.pick = 'fly';
		g.state.pickBait( 'flyShrimp' );
		g.rod.setGear( g.rigs.rodGear( 'fly' ) );

	} );
	await frames( sam.game, 4 );

};

// ---- loop: Sam's false casts seen on Robin's game, the loop from his copy's rod, and the shot
if ( doing( 'loop' ) ) {

	note( `Sam ${ JSON.stringify( await wade( sam, 30, 1.2, false ) ) }, his back to ${ A }` );
	// (Robin wading 9 m off Sam, looking at him: stood up where he's put, as in wade)
	const at = await sam.game.evaluate( () => { const p = window.__app.player.position; return [ p.x, p.z ]; } );
	await robin.game.evaluate( async ( at ) => {

		const { G } = await import( '/src/core/Globals.js' );
		const a = window.__app, p = a.player, x = at[ 0 ] + 9, z = at[ 1 ] + 3, sea = G.seaLevel.value;
		p.position.set( x, Math.max( a.terrainData.heightAt( x, z ), sea - 1.2 ), z );
		p.velocity.set( 0, 0, 0 );
		p.mode = 'walk';
		p.waterMean = p.waterH = sea;
		p.yaw = Math.atan2( 9, 3 );
		p.pitch = 0.1;

	}, at );
	await flyOut();
	await sam.page.keyboard.down( 'KeyF' );
	await sam.game.waitForFunction( () => window.__app.game.rod.state === 'falsecast' && window.__app.game.flyCast.casts >= 1, null, { timeout: 300000, polling: 100 } ).catch( () => {} );
	const mine = await sam.game.evaluate( () => { const g = window.__app.game; return { state: g.rod.state, fly: g.rod.flyRod, L: g.flyCast.L, casts: g.flyCast.casts }; } );
	say( mine.state === 'falsecast' && mine.fly, `Sam, F held: false casting with the fly rod (${ mine.casts } so far, ${ mine.L } m in the air)` );
	await until( robin.game, `${ other }.cur && ${ other }.cur.rod === 7 && ${ other }.cur.fl > 5`, 180000 ).catch( () => {} );
	const seen = await robin.game.evaluate( () => {

		const o = window.__app.together.others.values().next().value, c = o.cur, L = o.flyLine, P = o.flyPts;
		const vis = !! L && L.meshes.every( ( m ) => m.visible ), tip = P && P[ 0 ], end = P && P[ 12 ];
		return { rod: c.rod, fp: c.fp, fl: c.fl, fw: c.fw, vis, span: tip ? +Math.hypot( end.x - tip.x, end.z - tip.z ).toFixed( 1 ) : null, rodGeo: o.tackle.flyFit };

	} );
	say( seen.rod === 7 && seen.fw === 8 && seen.rodGeo && seen.vis, `on Robin's game Sam's copy false casts: his pose's ${ seen.rod }, stroke ${ seen.fp }, ${ seen.fl } m in the air, the 8-weight in his hands, the loop drawn` );
	say( seen.span !== null && seen.span <= seen.fl + 0.5, `the loop no longer than his line (${ seen.span } m between its ends, ${ seen.fl } m of line)` );
	await G.shot( robin, 'loop' );
	// (its program the fishing line's: the one program of that name, the loop's curves drawn in it)
	const prog = await robin.game.evaluate( () => {

		const a = window.__app, o = a.together.others.values().next().value, r = a.renderer;
		const used = o.flyLine ? o.flyLine.meshes.map( ( m ) => r.properties.get( m.material ).currentProgram ).filter( Boolean ) : [];
		return { named: r.info.programs.filter( ( p ) => p.name === 'fishingLine' ).length, used: used.length, same: used.every( ( p ) => p === used[ 0 ] && p.name === 'fishingLine' ) };

	} );
	say( prog.named === 1 && prog.used > 0 && prog.same, `drawn in the fishing line's own program (${ prog.named } of that name on Robin's game, the loop's ${ prog.used } curves all in it)` );
	// let go on the forward stroke
	await sam.game.waitForFunction( () => { const f = window.__app.game.flyCast; return f.stroke > 0 && f.t > 0.3 && f.t < 0.6; }, null, { timeout: 300000, polling: 'raf' } ).catch( () => {} );
	await sam.page.keyboard.up( 'KeyF' );
	await sam.game.waitForFunction( () => window.__app.game.rod.state === 'floating', null, { timeout: 180000, polling: 200 } ).catch( () => {} );
	const shot = await sam.game.evaluate( () => { const g = window.__app.game, r = g.rod; return { state: r.state, kind: g.flyCast.landing && g.flyCast.landing.hard, at: [ r.bobber.x, r.bobber.z ], out: +Math.hypot( r.bobber.x - r.tip.x, r.bobber.z - r.tip.z ).toFixed( 1 ) }; } );
	say( shot.state === 'floating', `let go: shot, and down ${ shot.out } m out (${ ( await sam.game.evaluate( () => window.__toasts.slice( - 1 )[ 0 ] || 'well timed' ) ) })` );
	await until( robin.game, `${ other }.cur && ${ other }.cur.rod === 4 && ${ other }.cur.bobber`, 120000 ).catch( () => {} );
	const R = await robin.game.evaluate( ( at ) => { const o = window.__app.together.others.values().next().value, c = o.cur; return { rod: c.rod, off: c.bobber ? +Math.hypot( c.bobber.x - at[ 0 ], c.bobber.z - at[ 1 ] ).toFixed( 2 ) : null, loop: !! o.flyLine && o.flyLine.meshes.some( ( m ) => m.visible ) }; }, shot.at );
	say( R.rod === 4 && R.off !== null && R.off < 0.5 && ! R.loop, `Robin sees his line out to where the fly came down (${ R.off } m off it), the loop gone` );
	await G.shot( robin, 'laid' );

}

// ---- spook: Sam's false casts over the school; it bolts on his game and on Robin's
if ( doing( 'spook' ) ) {

	if ( ! doing( 'loop' ) ) await flyOut();
	// (the line in: picked up and stopped, if the loop's part left it out)
	await sam.game.evaluate( () => { const g = window.__app.game; g.flyCast.stop(); g.bite = null; } );
	note( `Sam ${ JSON.stringify( await wade( sam, 12, 0.3 ) ) }, Robin ${ JSON.stringify( await wade( robin, 25, - 1.2 ) ) }, ${ A }` );
	await until( sam.game, active, 180000 ).catch( () => {} );
	await until( robin.game, active, 180000 ).catch( () => {} );
	say( await robin.game.evaluate( active ) && await sam.game.evaluate( active ), `${ A } in sight on both games` );
	// (why each school's spooked, as it is: the Guide takes the flats' events as it shows their tips)
	await sam.game.evaluate( () => {

		const F = window.__app.game.flats, was = F.spooked.bind( F );
		window.__whys = [];
		F.spooked = ( g, why, x, z ) => {

			window.__whys.push( [ g.sight && g.sight.id, why, window.__app.game.rod.state, window.__app.game.flyCast.casts ] );
			return was( g, why, x, z );

		};

	} );
	await sam.page.keyboard.down( 'KeyF' );
	await until( sam.game, `window.__app.game.flats.mine.spooked[ '${ A }' ] !== undefined`, 400000 ).catch( () => {} );
	const S = await sam.game.evaluate( ( id ) => { const g = window.__app.game, F = g.flats, w = window.__whys.find( ( x ) => x[ 0 ] === id ); return { until: F.mine.spooked[ id ], why: w && w[ 1 ], during: w && w[ 2 ], L: g.flyCast.L, casts: g.flyCast.casts }; }, A );
	await sam.page.keyboard.up( 'KeyF' );
	say( S.until !== undefined && S.why === 'falsecast' && S.during === 'falsecast', `Sam's false casts toward it spook it on his game ('${ S.why }', false casting: ${ S.casts } false casts, ${ S.L } m in the air), gone till island hour ${ S.until && S.until.toFixed( 3 ) }` );
	const t0 = Date.now();
	await until( robin.game, `window.__app.game.flats.state.spooked[ '${ A }' ] !== undefined`, 120000 ).catch( () => {} );
	const Rb = await robin.game.evaluate( ( id ) => { const F = window.__app.game.flats; return { until: F.state.spooked[ id ], mine: !! F.mine.spooked[ id ], gone: ! window.__app.fish.sightGroups.some( ( g ) => g.sight && g.sight.id === id && g.active && ! ( g.sight.bolt > 0 ) ) }; }, A );
	say( Rb.until === S.until && ! Rb.mine && Rb.gone, `on Robin's game ${ ( ( Date.now() - t0 ) / 1000 ).toFixed( 1 ) } s later it bolts too, gone till the same hour, none of it his` );

}

await G.end( 'fly' );
