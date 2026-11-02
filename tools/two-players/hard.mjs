// (M16) A guest pushed harder than aboard.mjs: taking off from her berth with him on deck, her lever right up (W and Shift), hard over both
// ways, walking by keys between her areas and climbing her ladders as she goes, and all of it again in a gale. Every frame of his is read
// against her deck and against the copy he sees drawn. Legs are real keys; only where he's looking is steered.
//   tools/render-slot.sh node tools/two-players/hard.mjs [dir] [port] [boat] [owner's fps] [guest's fps]   HARD_STALE=6 keeps the game's own stale pose time
import { OTHER as other, start } from './lib.mjs';
const [ out = 'qa-output', PORT = '5221', BOAT = 'sportfisher', OWNER_FPS = '30', GUEST_FPS = '12' ] = process.argv.slice( 2 );
const G = await start( { out, port: PORT, stale: + ( process.env.HARD_STALE || 120 ) } );
const { say, note, until, frames, press } = G;
const FROM = process.env.HARD_FROM || 'takeoff';
const owner = await G.open( 'Robin', BOAT, + OWNER_FPS );
const guest = await G.open( 'Sam', BOAT === 'lobster' ? 'console' : 'lobster', + GUEST_FPS );
await until( guest.game, `${ other } && ${ other }.cur` );
await until( owner.game, `${ other } && ${ other }.cur` );
note( `${ BOAT }: Robin at ${ OWNER_FPS } fps, Sam at ${ GUEST_FPS }, stale ${ process.env.HARD_STALE || 120 } s` );
await G.buy( owner );
await G.memory( owner, 'in' );
await G.memory( guest, 'in' );
say( await G.aboard( owner, guest ), 'Sam\'s aboard' );

// (his legs are keys; only where he looks is steered)
const ROUTES = {
	console: [
		[ 'cockpit, starboard', 0.85, - 1.4 ], [ 'beside the console, starboard', 0.82, 0.3 ], [ 'the bow\'s sole', 0, 2 ], [ 'foredeck', 0, 3.7 ], [ 'the bow\'s sole', 0, 2 ],
		[ 'beside the console, port', - 0.82, 0.3 ], [ 'cockpit, port', - 0.85, - 1.4 ], [ 'through the door', - 0.74, - 2.6 ], [ 'platform', - 0.3, - 3.3 ], [ 'through the door', - 0.74, - 2.6 ], [ 'cockpit, starboard', 0.85, - 1.4 ],
	],
	lobster: [
		[ 'cockpit', 0, - 1.75 ], [ 'starboard quarter', 0.95, - 2.8 ], [ 'port quarter', - 0.95, - 2.8 ], [ 'cockpit', 0, - 1.6 ], [ 'the doorway', 0.1, - 0.5 ], [ 'in the house', 0.1, 0.45 ], [ 'the doorway', 0.1, - 0.5 ], [ 'cockpit', 0, - 1.75 ],
	],
	sportfisher: [
		[ 'cockpit', 0, - 3.75 ], [ 'starboard quarter', 1.5, - 5.2 ], [ 'port quarter', - 1.5, - 5.2 ], [ 'cockpit', 0, - 3.6 ], [ 'mezzanine', 0, - 2.9 ], [ 'the door', - 0.13, - 2.0 ], [ 'salon', - 0.13, - 0.5 ], [ 'the way down', 0, 1.2 ], [ 'cabin passage', 0, 2.5 ], [ 'forward cabin', 0, 3.7 ],
		[ 'cabin passage', 0, 2.5 ], [ 'the way up', 0, 1.2 ], [ 'salon', - 0.13, - 0.5 ], [ 'the door', - 0.13, - 2.0 ], [ 'mezzanine', 0, - 2.9 ], [ 'mezzanine\'s box', 1.6, - 2.9 ], [ 'side deck', 2.18, - 1.2 ], [ 'side deck', 2.18, 0.5 ], [ 'side deck, forward', 2, 2.8 ], [ 'foredeck', 1.0, 5 ], [ 'the bow', 0, 7.4 ],
		[ 'foredeck', - 1.0, 5 ], [ 'side deck, forward', - 2, 2.8 ], [ 'side deck, port', - 2.18, 0.5 ], [ 'side deck, port', - 2.18, - 1.2 ], [ 'mezzanine\'s box', - 1.6, - 2.9 ], [ 'the ladder\'s foot', - 0.84, - 3.4 ],
	],
};
const route = ROUTES[ BOAT ];

// every frame of his, whatever he's doing
await guest.game.evaluate( ( other ) => {

	const a = window.__app, p = a.player, V = p.deckPos.constructor, w = new V(), R = window.__draws, Q = a.camera.quaternion.constructor, q = new Q();
	const O = () => a.together.others.values().next().value;
	window.__aim = null;
	R.after.push( () => { const A = window.__aim; if ( A && p.mode === 'deck' && ! p.climbing ) p.deckYaw = Math.atan2( A.x - p.deckPos.x, A.z - p.deckPos.z ); } );
	window.__watch = ( walking ) => {

		const S = window.__seen = { n: 0, off: 0, first: null, gap: 0, cam: 0, drift: 0, sunk: 0, path: 0, copy: 0, copyDeg: 0, copyHidden: 0, pose: 0, top: 0, climbed: 0, falls: 0, last: p.deckPos.clone(), from: p.deckPos.clone(), run: true };
		S.look = () => {

			if ( ! S.run ) return;
			const b = p.boat, o = O();
			S.n ++;
			if ( p.mode !== 'deck' || ! p.riding ) {

				S.off ++;
				if ( ! S.first ) S.first = { mode: p.mode, riding: p.riding, at: p.position.toArray().map( ( v ) => +v.toFixed( 1 ) ), poseAge: o ? +( performance.now() / 1000 - o.last ).toFixed( 2 ) : null };

			} else {

				b.toWorld( p.deckPos, w );
				S.gap = Math.max( S.gap, w.distanceTo( p.position ) );
				S.cam = Math.max( S.cam, a.camera.position.distanceTo( w ) );
				if ( ! walking ) S.drift = Math.max( S.drift, Math.hypot( p.deckPos.x - S.from.x, p.deckPos.z - S.from.z ) );
				if ( ! p.climbing ) S.sunk = Math.max( S.sunk, p.deckGroundAt( p.deckPos.x, p.deckPos.z, p.deckPos.y + 0.36 ) - p.deckPos.y );
				else { S.climbed ++; if ( p.climbing.falling ) S.falls ++; }
				// (the deck he's on against the copy he sees)
				if ( o && o.boat ) {

					if ( ! o.boat.visible ) S.copyHidden ++;
					S.copy = Math.max( S.copy, o.boat.position.distanceTo( b.position ) );
					S.copyDeg = Math.max( S.copyDeg, q.copy( o.boat.quaternion ).angleTo( b.quaternion ) * 180 / Math.PI );

				}

			}

			if ( o ) S.pose = Math.max( S.pose, performance.now() / 1000 - o.last );
			S.path += Math.hypot( p.deckPos.x - S.last.x, p.deckPos.z - S.last.z );
			S.last.copy( p.deckPos );
			if ( o ) S.top = Math.max( S.top, o.boatSpeed || 0 );

		};

		R.end.push( S.look );

	};

	window.__watched = () => {

		const S = window.__seen, r = ( v, d = 3 ) => +v.toFixed( d );
		S.run = false;
		R.end.splice( R.end.indexOf( S.look ), 1 );
		return { frames: S.n, off: S.off, first: S.first, gap: r( S.gap ), cam: r( S.cam, 2 ), drift: r( S.drift ), sunk: r( S.sunk ), copy: r( S.copy ), copyDeg: r( S.copyDeg, 2 ), hidden: S.copyHidden, poseAge: r( S.pose, 2 ), top: r( S.top, 1 ), path: r( S.path, 2 ), falls: S.falls };

	};

}, other );
// her owner's every frame: how she goes, and whether they stay at her helm
await owner.game.evaluate( () => {

	const a = window.__app, b = a.boatCtl, V = a.camera.position.constructor, u = new V(), R = window.__draws;
	window.__m = { top: 0, heel: 0, trim: 0, off: 0, n: 0 };
	R.after.push( () => { const m = window.__m; m.n ++; m.top = Math.max( m.top, b.speed ); u.set( 1, 0, 0 ).applyQuaternion( b.quaternion ); m.heel = Math.max( m.heel, Math.abs( Math.asin( u.y ) ) * 57.3 ); u.set( 0, 0, 1 ).applyQuaternion( b.quaternion ); m.trim = Math.max( m.trim, Math.abs( Math.asin( u.y ) ) * 57.3 ); if ( a.player.mode !== 'boat' ) m.off ++; } );

} );
const her = () => owner.game.evaluate( () => { const m = window.__m, r = { top: +m.top.toFixed( 1 ), heel: +m.heel.toFixed( 1 ), trim: +m.trim.toFixed( 1 ), off: m.off, n: m.n }; window.__m = { top: 0, heel: 0, trim: 0, off: 0, n: 0 }; return r; } );
const watch = ( walking ) => guest.game.evaluate( ( w ) => window.__watch( w ), walking );
const watched = () => guest.game.evaluate( () => window.__watched() );
const stateOf = `( () => { const p = window.__app.player, d = p.deckPos; return { f: window.__draws.frames, mode: p.mode, riding: p.riding, x: +d.x.toFixed( 2 ), y: +d.y.toFixed( 2 ), z: +d.z.toFixed( 2 ), floor: +p.deckGroundAt( d.x, d.z, d.y + 0.36 ).toFixed( 2 ), climbing: !! p.climbing }; } )()`;
const put = ( x, z, y = null ) => guest.game.evaluate( ( [ x, y, z ] ) => { const p = window.__app.player; p.deckPos.set( x, y ?? p.boat.model.soleY( x, z, 9 ), z ); p.deckVel.set( 0, 0, 0 ); p.deckGrounded = false; if ( p.climbing ) p.climbing = null; }, [ x, y, z ] );
const steady = ( s ) => s.off === 0 && s.gap < 0.01 && s.cam < 2.6 && s.sunk < 0.03;
const line = ( s ) => `${ s.frames } frames, ${ s.off } off her${ s.first ? ' ' + JSON.stringify( s.first ) : '' }, feet ${ s.gap } m off her deck, ${ s.sunk } m under her floor, camera within ${ s.cam } m, the copy drawn ${ s.copy } m / ${ s.copyDeg } deg from the deck he walks (${ s.hidden } frames hidden), oldest pose ${ s.poseAge } s`;

// walks the route by keys
const walk = async ( list, label ) => {

	const legs = [];
	await guest.page.keyboard.down( 'KeyW' );
	let lost = null;
	for ( const [ name, x, z ] of list ) {

		await guest.game.evaluate( ( A ) => { window.__aim = A; }, { x, z } );
		let best = Infinity, since = null, jumps = 0, f0 = null;
		for ( ;; ) {

			const s = await guest.game.evaluate( stateOf );
			if ( s.mode !== 'deck' || ! s.riding ) { lost = s; break; }
			const d = Math.hypot( s.x - x, s.z - z );
			if ( f0 === null ) { f0 = s.f; since = s.f; }
			if ( d < 0.35 ) { legs.push( `${ name } (${ s.y })` ); break; }
			if ( d < best - 0.05 ) { best = d; since = s.f; }
			else if ( s.f - since > 25 && jumps < 4 ) { jumps ++; since = s.f; await press( guest, 'Space', 1 ); }
			if ( s.f - since > 120 || s.f - f0 > 900 ) {

				legs.push( `STUCK going to ${ name } at ${ s.x }, ${ s.y }, ${ s.z }` );
				lost = lost || { stuck: name, ...s };
				// (put there by hand, to carry on with the rest of her)
				await guest.page.keyboard.up( 'KeyW' );
				await put( x, z );
				await frames( guest.game, 3 );
				await guest.page.keyboard.down( 'KeyW' );
				break;

			}

			await guest.page.waitForTimeout( 60 );

		}

		if ( lost && lost.mode ) break;

	}

	await guest.game.evaluate( () => { window.__aim = null; } );
	await guest.page.keyboard.up( 'KeyW' );
	await frames( guest.game, 4 );
	note( `${ label }: ${ legs.join( ' > ' ) }` );
	return { legs, lost, stuck: legs.filter( ( l ) => l.startsWith( 'STUCK' ) ) };

};

// up her ladders by keys, E and W, and down by E and S
const climb = async ( label, down = true ) => {

	const ladders = await guest.game.evaluate( () => ( window.__app.player.boat.model.ladders || [] ).map( ( l ) => ( { on: l.on, off: l.off, text: l.text, downText: l.downText } ) ) );
	for ( const l of ladders ) {

		await put( l.on.x, l.on.z, l.on.y + 0.02 );
		await frames( guest.game, 3 );
		await watch( true );
		const near = await guest.game.evaluate( () => { const p = window.__app.player; return !! p.boat.model.ladderAt( p.deckPos ); } );
		await press( guest, 'KeyE', 2 );
		const on = await guest.game.evaluate( () => !! window.__app.player.climbing );
		await guest.page.keyboard.down( 'KeyW' );
		await until( guest.game, '! window.__app.player.climbing', 120000 ).catch( () => {} );
		await guest.page.keyboard.up( 'KeyW' );
		await frames( guest.game, 4 );
		const at = await guest.game.evaluate( stateOf ), s = await watched();
		const top = Math.abs( at.y - l.off.y ) < 0.6;
		say( near && on && s.off === 0 && top, `${ label }: ${ l.text }: on it by E ${ on }, up to ${ at.y } (its head ${ l.off.y }) by W, ${ s.falls } falling frames; ${ line( s ) }` );
		if ( down ) {

			await watch( true );
			await guest.game.evaluate( ( l ) => { const p = window.__app.player; p.deckPos.set( l.off.x, l.off.y, l.off.z ); p.deckVel.set( 0, 0, 0 ); }, l );
			await frames( guest.game, 3 );
			await press( guest, 'KeyE', 2 );
			const on2 = await guest.game.evaluate( () => !! window.__app.player.climbing );
			await guest.page.keyboard.down( 'KeyS' );
			await until( guest.game, '! window.__app.player.climbing', 120000 ).catch( () => {} );
			await guest.page.keyboard.up( 'KeyS' );
			await frames( guest.game, 4 );
			const d = await guest.game.evaluate( stateOf ), s2 = await watched();
			say( on2 && s2.off === 0 && Math.abs( d.y - l.on.y ) < 0.6, `${ label }: back down it, by E and S: at ${ d.y } (its foot ${ l.on.y }), ${ s2.off } of ${ s2.frames } frames off her` );

		}

	}

};

const lever = async ( on ) => {

	if ( on ) { await owner.page.keyboard.down( 'ShiftLeft' ); await owner.page.keyboard.down( 'KeyW' ); } else { await owner.page.keyboard.up( 'KeyW' ); await owner.page.keyboard.up( 'ShiftLeft' ); }

};

// right up, till she's stopped gaining: her top speed
const upToSpeed = async () => {

	await lever( true );
	let last = - 1, same = 0, sp = 0;
	const t0 = Date.now();
	while ( same < 6 && Date.now() - t0 < 300000 ) {

		await frames( owner.game, 30 );
		sp = await owner.game.evaluate( () => window.__app.boatCtl.speed );
		same = sp < last + 0.03 ? same + 1 : 0;
		last = Math.max( last, sp );

	}

	return +last.toFixed( 1 );

};

// hard over, half way round, and the other way
const turns = async () => {

	const yaw = () => owner.game.evaluate( () => window.__app.boatCtl.getYaw() );
	const out = [];
	for ( const key of [ 'KeyA', 'KeyD' ] ) {

		const y0 = await yaw(), s0 = await owner.game.evaluate( () => window.__app.boatCtl.speed );
		await owner.page.keyboard.down( key );
		await until( owner.game, `Math.abs( Math.sin( ( window.__app.boatCtl.getYaw() - ${ y0 } ) / 2 ) ) > 0.92`, 120000 ).catch( () => note( '(not all the way round in time)' ) );
		await owner.page.keyboard.up( key );
		const y1 = await yaw(), s1 = await owner.game.evaluate( () => window.__app.boatCtl.speed );
		out.push( `${ key === 'KeyA' ? 'to port' : 'to starboard' } ${ Math.round( Math.abs( Math.atan2( Math.sin( y1 - y0 ), Math.cos( y1 - y0 ) ) ) * 57.3 ) } deg, ${ s0.toFixed( 1 ) } to ${ s1.toFixed( 1 ) } m/s` );

	}

	return out.join( '; ' );

};

// (headed off the land)
const offshore = async () => { await G.toSea( owner ); await owner.game.evaluate( () => { const a = window.__app, b = a.boatCtl; b.quaternion.setFromAxisAngle( a.camera.up.clone().set( 0, 1, 0 ), Math.atan2( - 0.65, 0.76 ) ); b.angular.set( 0, 0, 0 ); } ); await until( guest.game, `Math.hypot( window.__app.player.boat.position.x + 2600, window.__app.player.boat.position.z - 3000 ) < 300`, 120000 ).catch( () => {} ); };
const stop = async () => { await lever( false ); await owner.page.keyboard.down( 'KeyS' ); await until( owner.game, 'Math.abs( window.__app.boatCtl.speed ) < 1.2', 120000 ).catch( () => {} ); await owner.page.keyboard.up( 'KeyS' ); };

// ---- taking off from her berth, on the keys, with him on deck
if ( FROM === 'takeoff' ) {

	await put( route[ 0 ][ 1 ], route[ 0 ][ 2 ] );
	await frames( guest.game, 4 );
	await G.helm( owner );
	const berth = await owner.game.evaluate( () => { const b = window.__app.boatCtl; return { moored: b.moored, x: b.position.x, z: b.position.z }; } );
	await watch( false );
	await her();
	await lever( true );
	await until( owner.game, `Math.hypot( window.__app.boatCtl.position.x - ${ berth.x }, window.__app.boatCtl.position.z - ${ berth.z } ) > 90`, 90000 ).catch( () => note( '(not 90 m off in time)' ) );
	await lever( false );
	const went = await owner.game.evaluate( ( B ) => { const b = window.__app.boatCtl; return { m: +Math.hypot( b.position.x - B.x, b.position.z - B.z ).toFixed( 1 ), speed: +b.speed.toFixed( 1 ), moored: b.moored }; }, berth );
	const s = await watched();
	say( steady( s ) && went.m > 10, `taking off from her berth on the keys (moored ${ berth.moored }), ${ went.m } m at ${ went.speed } m/s: ${ line( s ) }` );
	await G.shot( guest, `hard-${ BOAT }-takeoff-guest` );

}

if ( process.env.HARD_ONLY === 'takeoff' ) await G.end( `hard ${ BOAT }, her take-off` );

// ---- open water, stopped: by keys between her areas
if ( FROM !== 'takeoff' ) await G.helm( owner );
await offshore();
await frames( guest.game, 6 );
if ( FROM === 'takeoff' || FROM === 'walk' ) {

	await put( route[ 0 ][ 1 ], route[ 0 ][ 2 ] );
	await frames( guest.game, 4 );
	await watch( true );
	const w = await walk( route, 'stopped' );
	const s = await watched();
	say( steady( s ) && ! w.stuck.length && w.lost === null, `walking between her areas by keys, stopped: ${ w.legs.length } of ${ route.length } legs, ${ s.path } m; ${ line( s ) }` );
	await climb( 'stopped' );

}

const pushed = async ( label ) => {

	// standing, up to her top speed and hard over
	await put( route[ 0 ][ 1 ], route[ 0 ][ 2 ] );
	await frames( guest.game, 4 );
	await offshore();
	await watch( false );
	await her();
	const top = await upToSpeed();
	const t = await turns();
	const m = await her(), s = await watched();
	say( steady( s ) && s.drift < 0.15 && m.off === 0, `${ label }: standing on her ${ route[ 0 ][ 0 ] }, lever right up, ${ top } m/s, hard over: ${ t }; she heeled ${ m.heel } deg, trimmed ${ m.trim }; ${ line( s ) }, ${ s.drift } m from where he stood` );
	if ( BOAT === 'sportfisher' ) {

		for ( const [ x, y, z, name ] of [ [ 0, 7, - 0.53, 'tower' ], [ 0, 3.1, - 2.6, 'bridge' ], [ - 0.13, 1.02, - 0.5, 'salon' ], [ 0, 2.21, 7.6, 'bow' ] ] ) {

			await put( x, z, y );
			await frames( guest.game, 4 );
			await watch( false );
			const tt = await turns();
			const ss = await watched();
			say( steady( ss ) && ss.drift < 0.15, `${ label }: on her ${ name }, flat out and hard over: ${ tt }; ${ line( ss ) }, ${ ss.drift } m from where he stood` );

		}

	}

	// flat out still, by keys
	await put( route[ 0 ][ 1 ], route[ 0 ][ 2 ] );
	await frames( guest.game, 4 );
	await offshore();
	await lever( true );
	await watch( true );
	const w = await walk( route, label );
	const s2 = await watched();
	const sp = await owner.game.evaluate( () => +window.__app.boatCtl.speed.toFixed( 1 ) );
	say( steady( s2 ) && ! w.stuck.length && w.lost === null, `${ label }: walking between her areas by keys, lever right up (${ sp } m/s at the end): ${ w.legs.length } of ${ route.length } legs, ${ s2.path } m; ${ line( s2 ) }` );
	await climb( label );
	// and walking through a hard turn
	await put( route[ 0 ][ 1 ], route[ 0 ][ 2 ] );
	await frames( guest.game, 4 );
	await watch( true );
	const walking = walk( route.slice( 0, 6 ), `${ label }, turning` );
	const t3 = await turns();
	const w3 = await walking;
	const s3 = await watched();
	say( steady( s3 ) && w3.lost === null, `${ label }: walking by keys as she goes hard over (${ t3 }): ${ w3.legs.length } legs; ${ line( s3 ) }` );
	await stop();

};

// ---- flat out, calm
if ( FROM !== 'gale' ) await pushed( 'calm' );
await G.memory( owner, 'after calm' );
await G.memory( guest, 'after calm' );

// ---- a gale
await owner.game.evaluate( () => { const a = window.__app; a.together.setWeather( 'gale', 0 ); } );
await guest.game.waitForFunction( () => window.__app.weatherPick() === 'gale', null, { timeout: 60000, polling: 500 } ).catch( () => note( '(the gale didn\'t reach Sam)' ) );
// (no easing into it: it's the gale that's wanted)
await owner.game.evaluate( () => { window.__app.weather.live = null; } );
await guest.game.evaluate( () => { window.__app.weather.live = null; } );
await until( owner.game, 'window.__app.weather.live && window.__app.weather.live.wind > 15', 120000 ).catch( () => note( '(no gale on her game)' ) );
await offshore();
await frames( owner.game, 30 );
const sea = await owner.game.evaluate( async () => { const { G: GL } = await import( '/src/core/Globals.js' ); const a = window.__app, b = a.boatCtl; let lo = 9, hi = - 9; for ( let i = 0; i < 40; i ++ ) { const h = a.waves.heightAt( b.position.x + i * 7, b.position.z - i * 5 ); lo = Math.min( lo, h ); hi = Math.max( hi, h ); } return { wind: +GL.windSpeed.value.toFixed( 1 ), span: +( hi - lo ).toFixed( 2 ), pick: a.weatherPick() }; } );
note( 'the gale on Robin\'s sea:', JSON.stringify( sea ) );
await pushed( 'gale' );
const hull = await owner.game.evaluate( () => { const g = window.__app.game; return { flood: g.hull && g.hull.flood, mode: window.__app.player.mode, health: g.state.hull }; } );
note( 'her hull after it:', JSON.stringify( hull ) );
await G.memory( owner, 'after gale' );
await G.memory( guest, 'after gale' );
note( `frames a second, really: Robin ${ await G.rate( owner.game ) }, Sam ${ await G.rate( guest.game ) }` );
await G.end( `hard ${ BOAT }` );
