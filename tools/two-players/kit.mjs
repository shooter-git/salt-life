// (M20) Stream KIT with two real games (docs/m20/kit.md):
//  - Robin's blue-water gun with a second float, a fish out on its float line: on her game, the two floats in a row on the water
//    and the line bowed up to them; on Sam's, her copy's gun is the blue-water gun (it was drawn as the railgun), its floats
//    where hers ride, two of them, the shaft's flopper open;
//  - Robin landing a netted fish from her kayak: her landing net under it on her game, and on her copy on Sam's.
//   a dev server, then   ALL_THE_SPACES=... node tools/two-players/kit.mjs [out] [port] [tier]
// Shots: <out>/<tier>-robin-floats.png, -sam-floats.png, -robin-net.png, -sam-net.png
import fs from 'node:fs';
import { OTHER as other, start } from './lib.mjs';
const [ out = 'qa-output/kit-together', PORT = '5241', TIER = 'low' ] = process.argv.slice( 2 );
fs.mkdirSync( out, { recursive: true } );
const G = await start( { out, port: PORT, tier: TIER } );
const { say, note, until, frames } = G;
const group = `kit-${ Date.now() }`;
// (out in the blue water off the west side, where the gun's for: tools/gear/look.mjs' SEA)
const SEA = { x: - 2600, z: 3000 };

const robin = await G.open( 'Robin', 'kayak', 20, { group } ), sam = await G.open( 'Sam', 'kayak', 20, { group } );
await until( sam.game, `${ other } && ${ other }.cur` );
await until( robin.game, `${ other } && ${ other }.cur` );
await frames( robin.game, 6 );

// each held where they're put each frame (after their own update), in the water, looking where they're told; window.__kit:
// { mode: 'swim', at: [ x, z ], depth, yaw, pitch; look: 'float' | 'net' | 'copyFloat' | 'copyNet', off: [ dx, dy, dz ] (the
// camera put that far off it as the frame's drawn, once the copies are placed, looking at it) }
const hold = ( w ) => w.game.evaluate( async () => {

	const a = window.__app, p = a.player, R = window.__draws;
	const url = performance.getEntriesByType( 'resource' ).map( ( e ) => e.name ).filter( ( u ) => /\/src\/core\/Globals\.js(\?|$)/.test( u ) ).pop() || '/src/core/Globals.js';
	const { G } = await import( url );
	window.__G = G;
	R.after.push( () => {

		const K = window.__kit;
		if ( ! K || K.mode !== 'swim' ) return;
		p.mode = 'swim';
		p.position.set( K.at[ 0 ], G.seaLevel.value - K.depth, K.at[ 1 ] );
		p.velocity.set( 0, 0, 0 );
		p.yaw = K.yaw;
		p.pitch = K.pitch;

	} );
	// (the camera put just before the frame's drawn, after everything that moves it: the harness turns drawing off and on by an
	// own drawWorld, so this is on the app's own)
	const proto = Object.getPrototypeOf( a ), dw = proto.drawWorld;
	proto.drawWorld = function ( ...args ) {

		const K = window.__kit;
		if ( K && K.look ) {

			// (looking at what's asked, wherever it is this frame: K.off its offset from it; the sea and the ground laid out again
			// about the camera's new place)
			const c = this.camera, o = this.together.others.values().next().value;
			const t = K.look === 'float' ? this.game.gun.floatMesh.position : K.look === 'net' ? this.game.rod.netMesh.position : K.look === 'copyFloat' ? o.spear.float.position : o.tackle.net.position;
			c.position.set( t.x + K.off[ 0 ], t.y + K.off[ 1 ], t.z + K.off[ 2 ] );
			c.lookAt( t.x, t.y - 0.1, t.z );
			c.updateMatrixWorld();
			this.water.update( c );
			if ( this.terrain && this.terrain.update ) this.terrain.update( c );

		}

		return dw.apply( this, args );

	};

} );
await hold( robin );
await hold( sam );

// ---- Robin's blue-water gun, a fish out on its two floats
await robin.game.evaluate( ( SEA ) => {

	const a = window.__app, g = a.game, gun = g.gun;
	g.state.upgrades.speargun = 3;
	g.state.upgrades.spearFloats = 1;
	g.applyGear();
	window.__kit = { mode: 'swim', at: [ SEA.x, SEA.z ], depth: 0.05, yaw: 0.6, pitch: - 0.1 };
	window.__draws.after.push( () => {

		const K = window.__kit;
		if ( ! K || ! K.gun ) return;
		if ( ! gun.equipped ) gun.equip( true );
		if ( gun.state !== 'fighting' ) {

			gun.setState( 'fighting' );
			const fw = a.camera.getWorldDirection( gun.fightDir );
			fw.set( fw.x, - 0.25, fw.z ).normalize();

		}

		gun.floats = 2;
		gun.fight( 14, 0.1, true );

	} );
	window.__kit.gun = true;

}, SEA );
await frames( robin.game, 30 );
const mine = await robin.game.evaluate( () => {

	const gun = window.__app.game.gun;
	return { state: gun.state, onFloat: gun.onFloat, floats: gun.floats, shown: gun.floatMesh.visible, at: gun.floatAt.toArray().map( ( v ) => + v.toFixed( 2 ) ), n: gun.floatMesh.geometry ? gun.floatMesh.geometry.attributes.position.count : 0 };

} );
note( `Robin's gun: ${ JSON.stringify( mine ) }` );
say( mine.state === 'fighting' && mine.onFloat && mine.shown && mine.floats === 2, 'Robin\'s blue-water gun: a fish out on its float line, her two floats drawn on the water' );
// (Sam in the water near her, his camera over the water looking at her floats)
const F = mine.at;
await sam.game.evaluate( ( [ SEA, F ] ) => {

	window.__kit = { mode: 'swim', at: [ SEA.x + 4, SEA.z - 4 ], depth: 0.05, yaw: 0, pitch: 0 };

}, [ SEA, F ] );
await frames( sam.game, 40 );
const copy = await sam.game.evaluate( ( other ) => {

	const o = eval( other ), S = o && o.spear, c = o && o.cur;
	return o ? { level: o.gunLevel, gun: c.gun, float: c.float ? { n: c.float.n, at: c.float.at.toArray().map( ( v ) => + v.toFixed( 2 ) ) } : null, shown: S.float.visible, floats: o.floats, flopper: S.shaft.material.uniforms.shaftFlopper.value, line: S.line.visible } : null;

}, other );
note( `Robin's copy on Sam's: ${ JSON.stringify( copy ) }` );
// (hers again now: it swings round as the fish runs, and the copy's a fraction of a second behind)
const F2 = await robin.game.evaluate( () => window.__app.game.gun.floatAt.toArray().map( ( v ) => + v.toFixed( 2 ) ) );
say( copy && copy.level === 3, `on Sam's game, Robin's copy has the blue-water gun (level ${ copy && copy.level }; it was held to the railgun's 2)` );
say( copy && copy.shown && copy.floats === 2 && copy.float && Math.hypot( copy.float.at[ 0 ] - F2[ 0 ], copy.float.at[ 2 ] - F2[ 2 ] ) < 1.5, `  her floats there, two of them, where hers ride (${ copy && copy.float && copy.float.at.join( ', ' ) } against ${ F2.join( ', ' ) })` );
say( copy && copy.flopper === 1 && copy.line, '  the line out to them, the shaft\'s flopper open with the fish on it' );
await robin.game.evaluate( () => Object.assign( window.__kit, { look: 'float', off: [ 2.6, 2.2, 1.6 ] } ) );
await sam.game.evaluate( () => Object.assign( window.__kit, { look: 'copyFloat', off: [ - 2.2, 2.4, - 1.8 ] } ) );
await G.shot( robin, `${ TIER }-robin-floats` );
await G.shot( sam, `${ TIER }-sam-floats` );

// ---- Robin landing a netted fish from her kayak: her net under it
await robin.game.evaluate( ( SEA ) => {

	const a = window.__app, g = a.game, gun = g.gun, p = a.player, b = a.boatCtl, rod = g.rod;
	window.__kit = null;
	gun.equip( false );
	b.moored = b.beached = false;
	b.position.set( SEA.x, b.position.y, SEA.z );
	b.velocity.set( 0, 0, 0 );
	if ( p.mode !== 'boat' ) p.boardBoat();
	window.__draws.after.push( () => {

		if ( ! window.__net ) return;
		if ( ! rod.equipped ) rod.equip( true );
		rod.netting = true;
		if ( rod.state !== 'landing' ) rod.land();
		rod.t = Math.min( rod.t, 0.3 ); // (held part-way up, the net under it)

	} );
	window.__net = true;

}, SEA );
await frames( robin.game, 30 );
const myNet = await robin.game.evaluate( () => {

	const rod = window.__app.game.rod;
	return { state: rod.state, netting: rod.netting, shown: rod.netMesh.visible, at: rod.netMesh.position.toArray().map( ( v ) => + v.toFixed( 2 ) ), bobber: rod.bobber.toArray().map( ( v ) => + v.toFixed( 2 ) ) };

} );
note( `Robin's rod: ${ JSON.stringify( myNet ) }` );
say( myNet.state === 'landing' && myNet.shown && Math.hypot( myNet.at[ 0 ] - myNet.bobber[ 0 ], myNet.at[ 2 ] - myNet.bobber[ 2 ] ) < 0.05, 'Robin landing a netted fish: her landing net drawn under it' );
await sam.game.evaluate( ( [ SEA, B ] ) => {

	const a = window.__app, b = a.boatCtl, p = a.player;
	window.__kit = null;
	b.moored = b.beached = false;
	b.position.set( SEA.x + 5, b.position.y, SEA.z - 3 );
	b.velocity.set( 0, 0, 0 );
	if ( p.mode !== 'boat' ) p.boardBoat();
	window.__kit = { mode: 'boat', at: [ SEA.x + 5, SEA.z - 3 ] };

}, [ SEA, myNet.bobber ] );
await frames( sam.game, 40 );
const theirNet = await sam.game.evaluate( ( other ) => {

	const o = eval( other ), c = o && o.cur;
	return o ? { rod: c.rod, netting: c.netting, shown: o.tackle.net.visible, at: o.tackle.net.position.toArray().map( ( v ) => + v.toFixed( 2 ) ), bobber: c.bobber ? c.bobber.toArray().map( ( v ) => + v.toFixed( 2 ) ) : null } : null;

}, other );
note( `Robin's copy's rod on Sam's: ${ JSON.stringify( theirNet ) }` );
say( theirNet && theirNet.netting && theirNet.shown && theirNet.bobber && Math.hypot( theirNet.at[ 0 ] - theirNet.bobber[ 0 ], theirNet.at[ 2 ] - theirNet.bobber[ 2 ] ) < 0.05, '  and on her copy on Sam\'s game, under the fish on her line' );
// (each camera beside the net, looking at it)
await robin.game.evaluate( () => window.__kit = { mode: 'boat', look: 'net', off: [ 1.0, 0.7, 1.0 ] } );
await sam.game.evaluate( () => window.__kit = { mode: 'boat', look: 'copyNet', off: [ 1.3, 0.8, 1.3 ] } );
await G.shot( robin, `${ TIER }-robin-net` );
await G.shot( sam, `${ TIER }-sam-net` );

await G.end();
