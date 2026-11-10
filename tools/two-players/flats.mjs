// (M17) The flats together with two real games (docs/m17/flats-together.md): Robin and Sam wading the west's flats, the same
// schools of bonefish about them on both games (game/Flats.js, from the clock and the tide), their glasses on.
//  - spook: Robin's cast lands on a school's heads (FlatsFishing.landed, the game's own landing); on Sam's game it bolts and
//    stays gone, every one of his frames till its quiet's over, from the same island time; then back on both
//  - hook: Sam's real cast, and one of a school comes to his bait and eats it (a seen fish's follow, staged to end in a take);
//    F strikes it. On Robin's game the school bolts, Sam's rod's bent on his line to where it was, and the school's one fewer
//    back from its fright; Sam lands it, his
//  - spot: Robin looks at a school he sees, a second; Sam, on its far side looking away, hears it called by the clock from
//    where he is ("Robin: ..., 6 o'clock, 80 ft"), and told where to look sees it plainer than he would have
//  - late: Ann joins, and has the flat as it stands from the room
// Each game's frames are counted as its own updates (a CPU's two or three a second); its rate printed at the end.
//   a dev server, then   ALL_THE_SPACES=... node tools/two-players/flats.mjs [out] [port] [part: all | spook | hook | spot | late]
import fs from 'node:fs';
import { OTHER as other, start } from './lib.mjs';
const [ out = 'qa-output/flats-together', PORT = '5239', PART = 'all' ] = process.argv.slice( 2 );
const doing = ( p ) => PART === 'all' || PART === p;
fs.mkdirSync( out, { recursive: true } );
const G = await start( { out, port: PORT } );
const { say, note, until, frames } = G;
const group = `flats-${ Date.now() }`;
const toasts = ( who ) => who.game.evaluate( () => { const g = window.__app.game, was = g.toast; window.__toasts = []; g.toast = function ( t, ms ) { window.__toasts.push( t ); return was.call( this, t, ms ); }; } );

const robin = await G.open( 'Robin', 'kayak', 20, { group } ), sam = await G.open( 'Sam', 'kayak', 20, { group } );
await until( sam.game, `${ other } && ${ other }.cur` );
await until( robin.game, `${ other } && ${ other }.cur` );
for ( const w of [ robin, sam ] ) {

	await toasts( w );
	await w.game.evaluate( () => { const g = window.__app.game; g.state.upgrades.glasses = 1; g.applyGear(); } );

}

// the flats' fish come with the reef's, the last of a CPU's late stages (at one or two frames a second, past 25 minutes): brought
// forward here, as a device with a graphics card has them at the load (App.lifeAndDebris), the chain's own call later the same
for ( const w of [ robin, sam ] ) await w.game.evaluate( () => { const a = window.__app; if ( ! a._reefEarly ) { const p = a.reefGrows(); a._reefEarly = p; a.reefGrows = () => p; } } );
for ( const w of [ robin, sam ] ) await until( w.game, 'window.__app.fish && window.__app.fish.sightGroups && window.__app.fish.sightGroups.length > 0', 1500000 );
note( 'the flats\' fish are in on both games' );

// a time two schools of bonefish are on the flat in water a wader stands in, 25 to 70 m apart, by day
const pick = await robin.game.evaluate( async () => {

	const { flatsSchools } = await import( '/src/game/Flats.js' );
	const { tideAt } = await import( '/src/game/IslandClock.js' );
	const a = window.__app, td = a.terrainData;
	for ( let day = a.settings.day; day < a.settings.day + 40; day ++ ) for ( let h = 10.5; h <= 13.5; h += 0.25 ) {

		const T = ( day - 1 ) * 24 + h, sea = tideAt( T );
		const bones = flatsSchools( T, { wind: 2, overcast: 0, hour: h } ).filter( ( q ) => q.kind === 'bonefish' && q.life > 0.99 && q.n >= 4 && q.mode !== 'mill' && sea - td.heightAt( q.x, q.z ) > 0.35 && sea - td.heightAt( q.x, q.z ) < 1.0 );
		for ( const A of bones ) for ( const B of bones ) {

			const d = Math.hypot( A.x - B.x, A.z - B.z );
			if ( A !== B && d > 25 && d < 70 ) return { day, h, T, A, B };

		}

	}

	return null;

} );
say( !! pick, pick ? `day ${ pick.day } ${ pick.h.toFixed( 2 ) } h: ${ pick.A.id } (${ pick.A.n }, ${ pick.A.mode }) and ${ pick.B.id } (${ pick.B.n }, ${ pick.B.mode }) on the flat` : 'no two schools found' );
if ( ! pick ) await G.end( 'flats' );
await robin.game.evaluate( ( [ h, day ] ) => window.__app.together.setClock( h, day, 0.0001 ), [ pick.h, pick.day ] );
const T = `( window.__app.settings.day - 1 ) * 24 + window.__app.settings.timeOfDay`;
for ( const w of [ robin, sam ] ) await until( w.game, `Math.abs( ${ T } - ${ pick.T } ) < 0.05`, 120000 );

// wading, d m off a school (the sun behind you, turned about it), looking at it
const wade = ( who, id, d, turn = 0, look = true ) => who.game.evaluate( async ( [ id, d, turn, look ] ) => {

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
	const fx = look ? q.x - x : x - q.x, fz = look ? q.z - z : z - q.z;
	p.yaw = Math.atan2( - fx, - fz );
	p.pitch = - 0.3;
	F._was.has = false;
	return { x: +x.toFixed( 1 ), z: +z.toFixed( 1 ), depth: +( sea - ground ).toFixed( 2 ) };

}, [ id, d, turn, look ] );
const active = ( id ) => `window.__app.fish.sightGroups.some( ( g ) => g.sight && g.sight.id === '${ id }' && g.active )`;
const listed = ( who, id, t = null ) => who.game.evaluate( async ( [ id, t ] ) => {

	const { flatsSchools } = await import( '/src/game/Flats.js' );
	const { G } = await import( '/src/core/Globals.js' );
	const a = window.__app, F = a.game.flats, at = t ?? F.T, c = { wind: G.windSpeed.value, overcast: 0, hour: at % 24 };
	const mine = flatsSchools( at, c, F.state ).find( ( q ) => q.id === id ), bare = flatsSchools( at, c ).find( ( q ) => q.id === id );
	return { n: mine ? mine.n : 0, of: bare ? bare.n : 0 };

}, [ id, t ] );
const A = pick.A.id, B = pick.B.id;

// ---- spook: Robin's cast on a school's heads; on Sam's game it bolts and stays gone, from the same island time
if ( doing( 'spook' ) ) {

	note( `Robin ${ JSON.stringify( await wade( robin, A, 12 ) ) }, Sam ${ JSON.stringify( await wade( sam, A, 18, 1.4 ) ) }, ${ A }` );
	await until( robin.game, active( A ), 180000 ).catch( () => {} );
	await until( sam.game, active( A ), 180000 ).catch( () => {} );
	say( await robin.game.evaluate( active( A ) ) && await sam.game.evaluate( active( A ) ), `${ A } in sight on both games` );
	// (Sam's frames from here on: was it ever back in his game's schools before its quiet was over?)
	// (each frame of his once the spook's reached him: its fish drawn there and not bolting, or the next look's schools having it, is it back)
	await sam.game.evaluate( async ( id ) => {

		const { flatsSchools } = await import( '/src/game/Flats.js' );
		const a = window.__app, F = a.game.flats;
		window.__backA = { drawn: 0, listed: 0 };
		window.__framesA = 0;
		window.__draws.after.push( () => {

			if ( ! window.__watchA ) return;
			window.__framesA ++;
			if ( a.fish.sightGroups.some( ( g ) => g.sight && g.sight.id === id && g.active && ! ( g.sight.bolt > 0 ) ) ) window.__backA.drawn ++;
			if ( flatsSchools( F.T, { hour: a.settings.timeOfDay }, F.state ).some( ( q ) => q.id === id ) ) window.__backA.listed ++;

		} );

	}, A );
	const cast = await robin.game.evaluate( ( id ) => {

		const a = window.__app, F = a.game.flats, fish = a.fish, g = fish.sightGroups.find( ( h ) => h.sight && h.sight.id === id && h.active );
		let lead = null;
		fish.sightFish( g, ( i ) => { if ( lead === null ) lead = i; } );
		const at = a.game.rod.bobber.clone().set( fish.pos[ lead * 3 ], fish.pos[ lead * 3 + 1 ], fish.pos[ lead * 3 + 2 ] );
		F.landed( at, a.camera.position.clone(), null );
		return { until: F.mine.spooked[ id ], why: F.events.spooked, bolt: g.sight.bolt > 0, at: [ +at.x.toFixed( 1 ), +at.z.toFixed( 1 ) ], t: performance.now() };

	}, A );
	say( cast.until && cast.bolt, `Robin's cast lands on its heads at ${ cast.at.join( ', ' ) }: it bolts on his game (${ cast.why }), gone till island hour ${ cast.until && cast.until.toFixed( 3 ) }` );
	const t0 = Date.now();
	await until( sam.game, `window.__app.game.flats.state.spooked[ '${ A }' ] !== undefined`, 120000 ).catch( () => {} );
	const seen = await sam.game.evaluate( ( id ) => { window.__watchA = true; const F = window.__app.game.flats; return { until: F.state.spooked[ id ], at: F.state.at[ id ], bolt: window.__app.fish.sightGroups.some( ( g ) => g.sight && g.sight.id === id && g.sight.bolt > 0 ), mine: !! F.mine.spooked[ id ], why: F.events.spooked }; }, A );
	say( seen.until !== undefined && seen.until === cast.until && seen.bolt && ! seen.mine, `on Sam's game ${ ( ( Date.now() - t0 ) / 1000 ).toFixed( 1 ) } s later it bolts from where Robin's bait landed (${ seen.at && seen.at.join( ', ' ) }), gone till ${ seen.until && seen.until.toFixed( 3 ) }, none of it his (the Guide's "${ seen.why }")` );
	await frames( sam.game, 60 );
	await frames( robin.game, 40 );
	const gone = { sam: await sam.game.evaluate( ( id ) => ( { act: window.__app.fish.sightGroups.some( ( g ) => g.sight && g.sight.id === id && g.active ), back: window.__backA, frames: window.__framesA, T: window.__app.game.flats.T } ), A ), robin: await robin.game.evaluate( active( A ) ) };
	say( ! gone.sam.act && ! gone.robin && gone.sam.back.drawn === 0 && gone.sam.back.listed === 0 && gone.sam.T < cast.until, `stays gone: back in none of Sam's ${ gone.sam.frames } frames since (drawn there not bolting ${ gone.sam.back.drawn }, in his schools ${ gone.sam.back.listed }), its group let go on his (${ ! gone.sam.act }) and on Robin's (${ ! gone.robin }), island hour ${ gone.sam.T.toFixed( 3 ) }, its quiet till ${ cast.until.toFixed( 3 ) }` );
	await sam.game.evaluate( () => { window.__watchA = false; } );
	pick.untilA = cast.until;

}

// ---- hook: Sam's cast, a fish of a school comes to it and eats it, F; on Robin's game the school bolts, Sam's on, one fewer
if ( doing( 'hook' ) ) {

	note( `Sam ${ JSON.stringify( await wade( sam, B, 13, 0.3 ) ) }, Robin ${ JSON.stringify( await wade( robin, B, 18, - 0.6 ) ) }, ${ B }` );
	await until( sam.game, active( B ), 180000 ).catch( () => {} );
	await until( robin.game, active( B ), 180000 ).catch( () => {} );
	say( await robin.game.evaluate( active( B ) ) && await sam.game.evaluate( active( B ) ), `${ B } in sight on both games` );
	// (his real cast, turned away from it so it lands nowhere near its heads: R, F held and let go)
	await sam.game.evaluate( () => { const p = window.__app.player; p.yaw += Math.PI; } );
	await G.press( sam, 'KeyR', 2 );
	await frames( sam.game, 4 );
	await sam.page.keyboard.down( 'KeyF' );
	await sam.game.waitForFunction( () => window.__app.game.rod.state === 'windup', null, { timeout: 120000, polling: 100 } ).catch( () => {} );
	await frames( sam.game, 6 );
	await sam.page.keyboard.up( 'KeyF' );
	await sam.game.waitForFunction( () => window.__app.game.rod.state === 'floating', null, { timeout: 180000, polling: 200 } ).catch( () => {} );
	const rod = await sam.game.evaluate( ( id ) => ( { state: window.__app.game.rod.state, still: window.__app.fish.sightGroups.some( ( g ) => g.sight && g.sight.id === id && g.active ) } ), B );
	say( rod.state === 'floating' && rod.still, `Sam's cast is in the water (${ rod.state }), ${ B } still there` );
	// (one of the school sees it and comes to it, as Bites.seenTake has a follow: staged to end in a take, the bait on its nose)
	await sam.game.evaluate( ( id ) => {

		const a = window.__app, g = a.game, F = g.flats, fish = a.fish, grp = fish.sightGroups.find( ( h ) => h.sight && h.sight.id === id && h.active );
		let fi = null, fk = null;
		fish.sightFish( grp, ( i, k ) => { if ( fi === null ) { fi = i; fk = k; } } );
		g.rod.bobber.x = fish.pos[ fi * 3 ];
		g.rod.bobber.z = fish.pos[ fi * 3 + 2 ];
		const bite = g.bite || ( g.bite = { phase: 'wait', t: 1e9 } );
		bite.t = 1e9;
		F.follow = { g: grp, k: fk, id, kind: 'bonefish', act: 'eat', t: 0, L: fish.size[ fi ], speed: 1, bite };

	}, B );
	await until( sam.game, 'window.__app.game.bite && window.__app.game.bite.phase === \'take\'', 120000 ).catch( () => {} );
	const take = await sam.game.evaluate( ( id ) => { const g = window.__app.game; return { bite: g.bite && { phase: g.bite.phase, species: g.bite.species, kg: g.bite.kg, seen: g.bite.seen }, mine: g.flats.mine.hooked[ id ] }; }, B );
	await G.press( sam, 'KeyF', 2 );
	const on = await sam.game.evaluate( () => { const g = window.__app.game; return { fight: !! g.fight, rod: g.rod.state, kg: g.fight && g.fight.kg }; } );
	say( take.bite && take.bite.phase === 'take' && take.bite.seen && take.mine === 1 && on.fight, `one eats it: a ${ take.bite && take.bite.kg.toFixed( 2 ) } kg bonefish, a seen fish's take; F, and Sam's on (${ on.rod }); in his record` );
	const t0 = Date.now();
	await until( robin.game, `window.__app.game.flats.state.hooked[ '${ B }' ] === 1`, 120000 ).catch( () => {} );
	await until( robin.game, `${ other }.cur && ${ other }.cur.rod === 5`, 120000 ).catch( () => {} );
	const R = await robin.game.evaluate( ( id ) => {

		const a = window.__app, o = a.together.others.values().next().value, c = o.cur, F = a.game.flats, grp = a.fish.sightGroups.find( ( h ) => h.sight && h.sight.id === id );
		const where = grp ? grp.center : null, b = c.bobber;
		return { hooked: F.state.hooked[ id ], mine: F.mine.hooked[ id ] || 0, bolt: ( grp && grp.sight.bolt > 0 ) || ! grp || ! grp.active, rod: c.rod, tension: c.tension, line: b && where ? +Math.hypot( b.x - where.x, b.z - where.z ).toFixed( 1 ) : null, from: b ? +Math.hypot( b.x - c.pos.x, b.z - c.pos.z ).toFixed( 1 ) : null };

	}, B );
	say( R.hooked === 1 && R.mine === 0 && R.bolt, `on Robin's game ${ ( ( Date.now() - t0 ) / 1000 ).toFixed( 1 ) } s later: ${ B } bolts, one hooked from it, none of it his` );
	say( R.rod === 5 && R.from !== null && R.from < 40, `and he sees Sam on: his rod bent (pose ${ R.rod }, tension ${ R.tension }), his line ${ R.from } m out to the fish, ${ R.line } m from where the school was` );
	// (the shot's long on a CPU: Sam's fight held as it is meanwhile, or his fish, with nobody reeling, is off before it's done)
	await sam.game.evaluate( () => { const g = window.__app.game; g.__fight = g.updateFight; g.updateFight = () => {}; } );
	// (Robin looking at Sam, a tip closed if one's up)
	await robin.game.evaluate( () => { const a = window.__app, o = a.together.others.values().next().value, p = a.player, gd = a.game.guide; if ( gd && gd.open ) gd.close(); if ( o.cur ) { p.yaw = Math.atan2( - ( o.cur.pos.x - p.position.x ), - ( o.cur.pos.z - p.position.z ) ); p.pitch = - 0.12; } } );
	await frames( robin.game, 2 );
	await G.shot( robin, 'flats-robin-sees-sam-on' );
	await sam.game.evaluate( () => { const g = window.__app.game; g.updateFight = g.__fight; } );
	// (Sam brings it in: tired, at his feet, the fight's end as the game has it)
	const still = await sam.game.evaluate( () => { const f = window.__app.game.fight; if ( f ) { f.stamina = 0; f.distance = 0.4; } return !! f; } );
	if ( ! still ) note( 'Sam\'s fish was off before he could bring it in' );
	await until( sam.game, '! window.__app.game.fight', 120000 ).catch( () => {} );
	const landed = await sam.game.evaluate( () => { const s = window.__app.game.state; return { log: s.log.bonefish ? s.log.bonefish.count : 0, last: s.lastCatch && s.lastCatch.species }; } );
	const robinLog = await robin.game.evaluate( () => window.__app.game.state.log.bonefish ? window.__app.game.state.log.bonefish.count : 0 );
	say( landed.log === 1 && robinLog === 0, `Sam lands it: a bonefish in his log, none in Robin's` );
	pick.untilB = await sam.game.evaluate( ( id ) => window.__app.game.flats.state.spooked[ id ], B );
	const back = await listed( robin, B, pick.untilB + 0.01 );
	say( back.n === back.of - 1, `back from its fright on Robin's game, ${ B } is ${ back.n } of ${ back.of }` );

}

// ---- the schools back on both games once their quiet's over, from the same island time
if ( doing( 'spook' ) || doing( 'hook' ) ) {

	const to = Math.max( pick.untilA || 0, pick.untilB || 0 ) + 0.03;
	await robin.game.evaluate( ( t ) => window.__app.together.setClock( t % 24, Math.floor( t / 24 ) + 1, 0.0001 ), to );
	for ( const w of [ robin, sam ] ) await until( w.game, `Math.abs( ${ T } - ${ to } ) < 0.02`, 120000 ).catch( () => {} );
	const bothA = pick.untilA ? [ await listed( robin, A ), await listed( sam, A ) ] : null, bothB = pick.untilB ? [ await listed( robin, B ), await listed( sam, B ) ] : null;
	say( ( ! bothA || ( bothA[ 0 ].n === bothA[ 0 ].of && bothA[ 1 ].n === bothA[ 0 ].n && bothA[ 0 ].n > 0 ) ) && ( ! bothB || ( bothB[ 0 ].n === bothB[ 0 ].of - 1 && bothB[ 1 ].n === bothB[ 0 ].n ) ), `their quiet over (island hour ${ to.toFixed( 3 ) }): ${ bothA ? `${ A } back on both, ${ bothA[ 0 ].n } and ${ bothA[ 1 ].n }` : '' }${ bothB ? `; ${ B } back on both one fewer, ${ bothB[ 0 ].n } and ${ bothB[ 1 ].n } of ${ bothB[ 0 ].of }` : '' }` );

}

// ---- spot: Robin looks at a school he sees, a second; Sam hears it called from where he is, and sees it better
if ( doing( 'spot' ) ) {

	// (whichever bonefish school is on the flat in sight of them now: A, or B)
	let C = null, at = null;
	for ( const id of [ A, B ] ) {

		// (not so near that he spooks it as he comes: a school's fish spread metres either side of its middle)
		for ( const d of [ 9, 11, 13, 15 ] ) {

			if ( ! await wade( robin, id, d ) ) break;
			await wade( sam, id, 26, Math.PI * 0.85, false );
			await until( robin.game, active( id ), 60000 ).catch( () => {} );
			await frames( robin.game, 4 );
			await wade( robin, id, d );
			await frames( robin.game, 3 );
			const s = await robin.game.evaluate( ( id ) => { const g = window.__app.fish.sightGroups.find( ( h ) => h.sight && h.sight.id === id && h.active ); return g ? Math.max( g.sight.seen.body, g.sight.seen.shadow, g.sight.seen.tail, g.sight.seen.sign ) : 0; }, id );
			const spooked = await robin.game.evaluate( ( id ) => window.__app.game.flats.state.spooked[ id ] !== undefined, id );
			if ( spooked ) break;
			if ( s > 0.5 ) {

				C = id;
				at = d;
				break;

			}

		}

		if ( C ) break;

	}

	say( !! C, C ? `${ C } seen by Robin ${ at } m off, the sun behind him; Sam on its far side, looking away` : 'Robin sees neither school' );
	if ( C ) {

		await until( sam.game, active( C ), 60000 ).catch( () => {} );
		const before = await robin.game.evaluate( () => window.__app.together.flats.calls );
		// (Robin keeps looking at it)
		await robin.game.evaluate( ( id ) => { const a = window.__app; window.__draws.after.push( () => { const g = a.fish.sightGroups.find( ( h ) => h.sight && h.sight.id === id && h.active ); if ( g ) a.player.yaw = Math.atan2( - ( g.center.x - a.player.position.x ), - ( g.center.z - a.player.position.z ) ); } ); }, C );
		await until( robin.game, `window.__app.together.flats.calls > ${ before }`, 180000 ).catch( () => {} );
		const call = await robin.game.evaluate( ( id ) => ( { calls: window.__app.together.flats.calls, said: window.__toasts.filter( ( t ) => /^You call it/.test( t ) ).at( - 1 ), it: window.__app.together.flats._calledAt.has( id ), spooked: window.__app.game.flats.state.spooked[ id ] !== undefined } ), C );
		await until( sam.game, 'window.__toasts.some( ( t ) => /^Robin: / .test( t ) )', 120000 ).catch( () => {} );
		const heard = await sam.game.evaluate( async ( id ) => {

			const { seenOnFlats } = await import( '/src/game/Sight.js' );
			const { G } = await import( '/src/core/Globals.js' );
			const a = window.__app, F = a.game.flats, g = a.fish.sightGroups.find( ( h ) => h.sight && h.sight.id === id && h.active );
			const said = window.__toasts.filter( ( t ) => /^Robin: /.test( t ) ).at( - 1 );
			if ( ! g ) return { said, told: F.toldOf( id ), missing: { spooked: F.state.spooked[ id ] !== undefined, listed: F.schools.some( ( q ) => q.id === id ) } };
			const L = ( g.sp.length[ 0 ] + g.sp.length[ 1 ] ) / 2, depth = Math.max( 0, G.seaLevel.value - a.terrainData.heightAt( g.center.x, g.center.z ) );
			const q = { ...F._look( g.center.x, g.center.z, L, 'bonefish', depth, F.bottomAt( g.center.x, g.center.z ) ), tailUp: 0, sign: 0 };
			const c = a.camera.position, dir = a.camera.getWorldDirection( c.clone() );
			const facing = Math.atan2( dir.x, dir.z ), to = Math.atan2( g.center.x - c.x, g.center.z - c.z );
			return { said, told: F.toldOf( id ), searched: +seenOnFlats( { ...q, told: 0 }, {} ).body.toFixed( 2 ), knowing: +seenOnFlats( { ...q, told: 1 }, {} ).body.toFixed( 2 ), drawn: +g.sight.seen.body.toFixed( 2 ), ft: Math.round( Math.hypot( g.center.x - c.x, g.center.z - c.z ) / 0.3048 ), behind: Math.round( Math.abs( Math.atan2( Math.sin( to - facing ), Math.cos( to - facing ) ) ) * 180 / Math.PI ), guide: F.events.called };

		}, C );
		say( call.calls >= before + 1 && call.it && call.said && ! call.spooked, `Robin, looking at it a second, calls it: "${ call.said }" (${ call.calls - before } call(s); it ${ call.it ? 'is' : 'isn\'t' } the school he's looking at${ call.spooked ? ', which he\'d spooked' : '' })` );
		if ( heard.missing ) note( `Sam's game hasn't got ${ C } in sight: ${ JSON.stringify( heard.missing ) }` );
		const m = heard.said && /, (\d+) o'clock, (\d+) ft/.exec( heard.said );
		say( m && Math.abs( + m[ 2 ] - heard.ft ) <= 6 && ( heard.behind > 120 ? [ 4, 5, 6, 7, 8 ].includes( + m[ 1 ] ) : true ), `Sam hears "${ heard.said }" (from where he is: it's ${ heard.ft } ft off, ${ heard.behind } degrees off where he's looking)` );
		say( heard.told === 1 && heard.knowing >= heard.searched, `and he's told where to look: its body ${ heard.searched } searched for, ${ heard.knowing } knowing where (drawn ${ heard.drawn })` );
		const back = await sam.game.evaluate( () => window.__app.together.flats.calls );
		say( back === 0, 'Sam doesn\'t call it back' );

	}

}

// ---- late: Ann joins, and has the flat as it stands from the room
if ( doing( 'late' ) || PART === 'all' ) {

	const ann = await G.open( 'Ann', 'kayak', 20, { group } );
	await until( ann.game, `Object.keys( window.__app.game.flats.state.spooked ).length + Object.keys( window.__app.game.flats.state.hooked ).length > 0`, 120000 ).catch( () => {} );
	const st = ( w ) => w.game.evaluate( () => { const F = window.__app.game.flats, T = F.T; return JSON.stringify( { s: Object.keys( F.state.spooked ).filter( ( id ) => F.state.spooked[ id ] > T ).sort(), h: F.state.hooked } ); } );
	const a = await st( ann ), r = await st( robin );
	const mine = await ann.game.evaluate( () => Object.keys( window.__app.game.flats.mine.hooked ).length + Object.keys( window.__app.game.flats.mine.spooked ).length );
	say( a === r && mine === 0, `Ann, joining, has the flat as Robin's game has it, from the room: ${ a }, none of it hers` );
	const room = await robin.game.evaluate( () => Object.fromEntries( window.__app.together.session.entries( 'flats.' ).map( ( [ k, v ] ) => [ k, JSON.stringify( v ).length ] ) ) );
	note( `the room's records, characters of JSON: ${ JSON.stringify( room ) }` );

}

await G.end( 'flats' );
