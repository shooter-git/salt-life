// (M17) A boat's wake seen and ridden by another player's kayak: Robin's console run past Sam's kayak, lying still 30 m off
// her way, at 25 kn. On Sam's game her wake's followed from where she's drawn (WakeWaves.followDrawn), and Sam's kayak rides it
// (her own BoatController on Sam's CPU sea, through Sam's water query); a look from Sam's seat as it reaches her. Each game's
// frames a second as they came: what's asked is only a ceiling on a CPU.
//   Robin's console is driven along her line by the sea's clock (in company, everyone's, from the wall's): at a frame a second
// a game's own steps (0.1 s at most) fall ten times behind it, she'd creep, and on her own she wandered off her line. Both seas
// are flat, so the wake's not lost in the swell.
//   tools/render-slot.sh node tools/two-players/wakes.mjs [dir] [port] [tier]
import { mkdirSync, writeFileSync } from 'node:fs';
import { OTHER as other, start } from './lib.mjs';

// (mid by default: on low a console's crests are left out, drawn and ridden alike (docs/m17/wakes.md, On low), so there's none to reach her)
const [ out = 'qa-output/two-players/wakes', PORT = '5237', TIER = 'mid' ] = process.argv.slice( 2 );
mkdirSync( out, { recursive: true } );
const G = await start( { out, port: PORT, tier: TIER } );
const { say, note, until, frames } = G;
const SEA = { x: - 2600, z: 3000 }, OFF = 30, FROM = 300, ON = 500, KN = 25;
const robin = await G.open( 'Robin', 'console', 30 );
const sam = await G.open( 'Sam', 'kayak', 30 );
await until( sam.game, `${ other } && ${ other }.cur` );
await until( robin.game, `${ other } && ${ other }.cur` );
note( 'both in, each seeing the other' );
// (the late building after the start stalls a game for minutes at a time on a busy CPU, and in company the sea's clock runs on,
// so a wake can go by unseen; and with nothing drawn it never ends, waiting on first draws. So Robin passes again and again,
// below, till a pass's wake reaches Sam while her game runs)
const steady = async ( w ) => {

	for ( let i = 0; i < 60; i ++ ) {

		const gaps = await w.game.evaluate( () => new Promise( ( done ) => {

			const R = window.__draws, t = [ performance.now() ], each = () => t.push( performance.now() );
			R.after.push( each );
			setTimeout( () => { R.after.splice( R.after.indexOf( each ), 1 ); t.push( performance.now() ); let most = 0; for ( let j = 1; j < t.length; j ++ ) most = Math.max( most, t[ j ] - t[ j - 1 ] ); done( most ); }, 20000 );

		} ) );
		if ( gaps < 4000 ) return gaps;

	}

	return - 1;

};
note( `the late building over; the longest gap between frames over 20 s: Robin ${ ( await steady( robin ) / 1000 ).toFixed( 1 ) } s, Sam ${ ( await steady( sam ) / 1000 ).toFixed( 1 ) } s` );

// Sam in her kayak, still, her bow toward the console's way 30 m off; Robin at her helm 700 m back along it, heading past
await sam.game.evaluate( ( SEA ) => {

	const a = window.__app, p = a.player, b = a.boatCtl;
	if ( p.mode !== 'boat' ) p.enterBoat();
	b.moored = false; b.beached = false; b.anchor = null; a.boat.sliding = null;
	b.position.set( SEA.x, b.position.y, SEA.z );
	b.velocity.set( 0, 0, 0 ); b.angular.set( 0, 0, 0 );
	b.quaternion.set( 0, 0, 0, 1 );

}, SEA );
await robin.game.evaluate( ( [ SEA, OFF, FROM ] ) => {

	const a = window.__app, p = a.player, b = a.boatCtl;
	b.moored = false; b.beached = false; b.anchor = null; a.boat.sliding = null;
	b.position.set( SEA.x - FROM, b.position.y, SEA.z + OFF );
	b.velocity.set( 0, 0, 0 ); b.angular.set( 0, 0, 0 );
	b.quaternion.set( 0, Math.sin( Math.PI / 4 ), 0, Math.cos( Math.PI / 4 ) ); // (her bow to +x)
	p.boardBoat();

}, [ SEA, OFF, FROM ] );
await G.helm( robin );
for ( const w of [ robin, sam ] ) await w.game.evaluate( () => { const v = window.__app.waves; v.setSea( 0, 0 ); v.setSea = () => {}; } );
say( await robin.game.evaluate( () => window.__app.player.mode === 'boat' ), 'Robin at her console\'s helm' );
say( await sam.game.evaluate( () => window.__app.player.mode === 'boat' && window.__app.boat.id === 'kayak' ), 'Sam in her kayak' );

// (what each game sees, frame by frame: Sam's kayak, the wake under her and Robin's console as Sam has her; Robin's own speed)
await sam.game.evaluate( async () => {

	window.__G = ( await import( '/src/core/Globals.js' ) ).G;
	const a = window.__app, R = window.__draws, rec = window.__rec = [], P = a.camera.position.constructor;
	const e = { x: 0, z: 0 }, f = new P();
	R.after.push( () => {

		const b = a.boatCtl, [ id, o ] = a.together.others.entries().next().value || [], c = o && o.cur, bp = c && c.boat && ( c.drawn || c.boat ).pos;
		const w = a.waves.wakes, tr = id && w.tracks.get( id );
		f.set( 0, 0, 1 ).applyQuaternion( b.quaternion );
		e.x = Math.asin( Math.max( - 1, Math.min( 1, f.y ) ) ) * 57.3;
		f.set( 1, 0, 0 ).applyQuaternion( b.quaternion );
		e.z = Math.asin( Math.max( - 1, Math.min( 1, f.y ) ) ) * 57.3;
		rec.push( [ performance.now() / 1000, b.position.y, e.z, e.x, a.waves.wakeAt( b.position.x, b.position.z ), bp ? bp.x : null, bp ? bp.z : null, w.count, tr ? tr.head.U : 0, b.position.x, b.position.z, a.query.heightAt( b.position.x, b.position.z, window.__G.time.value ) - window.__G.seaLevel.value ] );

	} );

} );
await robin.game.evaluate( async ( [ SEA, OFF, FROM, KN, ON ] ) => {

	const { G: Gl } = await import( '/src/core/Globals.js' );
	const a = window.__app, R = window.__draws, rec = window.__rec = [], b = a.boatCtl, U = KN * 0.5144, t0 = Gl.time.value + 2, y = b.position.y;
	R.after.push( () => {

		// (a pass from FROM m back to ON m on, then back to the start for the next: her track starts again there, on both games)
		const P = ( FROM + ON ) / U, run = Gl.time.value - t0, d = run > 0 ? U * ( run % P ) : 0;
		window.__pass = run > 0 ? Math.floor( run / P ) : - 1;
		b.position.set( SEA.x - FROM + d, y, SEA.z + OFF );
		b.velocity.set( run > 0 ? U : 0, 0, 0 );
		b.quaternion.set( 0, Math.sin( Math.PI / 4 ), 0, Math.cos( Math.PI / 4 ) );
		rec.push( [ performance.now() / 1000, b.position.x, b.velocity.x, a.waves.wakes.count, a.waves.wakes.n ] );

	} );

}, [ SEA, OFF, FROM, KN, ON ] );
note( 'Robin under way' );
// (till she's past Sam and well on, and her wake's gone by Sam: the arm's angle on the plane, and some)
await until( robin.game, `window.__app.boatCtl.position.x > ${ SEA.x }`, 1200000 );
const passed = await sam.game.evaluate( () => performance.now() / 1000 );
note( 'Robin past Sam' );
let shotTaken = false, shotAt = 0;
for ( let i = 0; i < 1500; i ++ ) {

	const now = await sam.game.evaluate( () => {

		const r = window.__rec, last = r[ r.length - 1 ];
		return { t: performance.now() / 1000, h: last ? last[ 4 ] : 0 };

	} );
	if ( ! shotTaken && Math.abs( now.h ) > 0.01 ) {

		await G.shot( sam, 'sam-in-robins-wake' );
		shotTaken = true;
		shotAt = await sam.game.evaluate( () => performance.now() / 1000 );

	}

	if ( shotTaken ? now.t - shotAt > 40 : now.t - passed > 1200 ) break;
	await sam.page.waitForTimeout( 1000 );

}

const S = await sam.game.evaluate( () => window.__rec ), Rb = await robin.game.evaluate( () => window.__rec );
const rate = { robin: await G.rate( robin.game ), sam: await G.rate( sam.game ) };
writeFileSync( `${ out }/wakes.json`, JSON.stringify( { rate, sam: S, robin: Rb } ) );
const span = ( rows, i ) => rows.length ? Math.max( ...rows.map( ( r ) => r[ i ] ) ) - Math.min( ...rows.map( ( r ) => r[ i ] ) ) : 0;
const before = S.filter( ( r ) => r[ 0 ] < passed - 5 ), after = S.filter( ( r ) => r[ 0 ] > passed );
const top = Math.max( ...Rb.map( ( r ) => r[ 2 ] ) );
note( `Robin's console at ${ ( top / 0.5144 ).toFixed( 1 ) } kn at most; her own wake ${ Math.max( ...Rb.map( ( r ) => r[ 4 ] ) ) } samples on her game` );
note( `on Sam's game: her wake followed at ${ ( Math.max( ...S.map( ( r ) => r[ 8 ] ) ) / 0.5144 ).toFixed( 1 ) } kn, ${ Math.max( ...S.map( ( r ) => r[ 7 ] ) ) } wake(s) sent` );
const settled = before.filter( ( r ) => r[ 0 ] > before[ 0 ][ 0 ] + 20 ), reach = after.find( ( r ) => Math.abs( r[ 4 ] ) > 0.005 );
const passes = await robin.game.evaluate( () => window.__pass + 1 );
// (the pass whose wake reached her: from 10 s before to 40 s after)
const inIt = reach ? S.filter( ( r ) => r[ 0 ] > reach[ 0 ] - 10 && r[ 0 ] < reach[ 0 ] + 40 ) : after;
note( `Sam's kayak: still before ${ ( span( settled, 1 ) * 100 ).toFixed( 1 ) } cm, ${ span( settled, 2 ).toFixed( 1 ) } deg; in it heave ${ ( span( inIt, 1 ) * 100 ).toFixed( 1 ) } cm, roll ${ span( inIt, 2 ).toFixed( 1 ) }, pitch ${ span( inIt, 3 ).toFixed( 1 ) } deg; the wake ${ ( span( inIt, 4 ) * 100 ).toFixed( 1 ) } cm crest to trough under her, ${ ( span( inIt, 11 ) * 100 ).toFixed( 1 ) } in her own water query; ${ reach ? `reached her` : 'never reached her' } in ${ passes } pass(es) of Robin's, ${ inIt.length } of Sam's frames in it` );
note( `frames a second: Robin ${ rate.robin }, Sam ${ rate.sam } (30 asked)` );
say( Math.max( ...S.map( ( r ) => r[ 7 ] ) ) >= 1 && Math.max( ...S.map( ( r ) => r[ 8 ] ) ) > 5, 'Sam\'s game follows Robin\'s console\'s wake from where she\'s drawn' );
say( span( inIt, 4 ) > 0.02 && Math.abs( span( inIt, 11 ) - span( inIt, 4 ) ) < 0.01, 'it reaches Sam\'s kayak, in her own water query' );
say( reach && span( inIt, 1 ) > 0.5 * span( inIt, 4 ), 'and her kayak rises and falls on it' );
say( shotTaken, 'a look from her seat as it reaches her' );
await G.end( 'wakes' );
