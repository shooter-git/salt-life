// (M19) The sportfisher's mate (game/rigs/Mate.js, docs/m19/big.md), backing her down on a fish, on the real sportfisher and
// her handling in plain Node: from a fish ahead, abeam or astern of her, he brings her stern round to it and backs down at the
// closing speed he wants for the sea, easing off as she comes up on it; less in a big sea. And how fast he wants it.
//   node test/mate.mjs
import { register } from 'node:module';
register( 'data:text/javascript,' + encodeURIComponent( `
export async function resolve( specifier, context, next ) {
	if ( specifier === '@allthespaces/portal/three' ) return { url: 'data:text/javascript,export const gltfLoader = {};', shortCircuit: true };
	return next( specifier, context );
}` ) );
globalThis.window = globalThis.window || { devicePixelRatio: 1 };
const { loadBoat } = await import( '../src/world/boat/Boats.js' );
const { BoatController } = await import( '../src/player/BoatController.js' );
const { Vector3 } = await import( '../src/engine/index.js' );
const { MATE, mateTarget, mateHelm } = await import( '../src/game/rigs/Mate.js' );

let fails = 0;
const ok = ( c, msg ) => {

	if ( ! c ) {

		fails ++;
		console.log( 'FAIL', msg );

	} else console.log( 'ok  ', msg );

};

// how fast he wants it
ok( mateTarget( 200, 1, 0 ) === MATE.most && mateTarget( 200, 1, 4 ) === MATE.least && mateTarget( 10, 1, 0 ) === 0 && mateTarget( 37, 1, 0 ) > 0 && mateTarget( 37, 1, 0 ) < MATE.most, `${ MATE.most } m/s astern in a calm sea, ${ MATE.least } in a rough one, easing off as she comes up on it, none on top of it` );

const m = await loadBoat( 'sportfisher', 'low' );
const query = { latency: 0.05, allocate: () => 0, setPoint() {}, cpuValid: true, version: 0, resultTime: 0, cpu: new Float32Array( 4096 ), resultInputs: new Float64Array( 4096 ) };
const FPS = 30, dt = 1 / FPS;
// she lies heading north (+z), the fish `bearing` radians off her bow `d` m away, holding there (it's running as fast as it's
// come up on: the line stays out) for `secs`; each second, how far her stern's off it and how fast she's closing
const back = ( bearing, { d = 80, Hs = 0, secs = 90 } = {} ) => {

	const ctl = new BoatController( { model: m, query, terrain: { heightAt: () => - 50 }, colliders: null } );
	ctl.position.set( 0, 0, 0 );
	ctl.moored = false;
	ctl.driven = true;
	const yaw = ctl.getYaw(), fish = new Vector3(), helm = { th: 0, st: 0, err: 0 };
	fish.set( Math.sin( yaw + bearing ) * d, 0, Math.cos( yaw + bearing ) * d );
	let t = 0, onIt = null;
	const errs = [], closing = [];
	for ( let f = 0; f < secs * FPS; f ++ ) {

		t += dt;
		query.version ++;
		query.resultTime = t;
		// (the fish keeps its distance: it takes line as she comes)
		const dx = fish.x - ctl.position.x, dz = fish.z - ctl.position.z, len = Math.hypot( dx, dz );
		fish.set( ctl.position.x + dx / len * d, 0, ctl.position.z + dz / len * d );
		mateHelm( ctl, fish, d, 1, Hs, helm );
		ctl.setInput( helm.th, helm.st, dt );
		ctl.update( dt );
		if ( onIt === null && Math.abs( helm.err ) < 0.35 ) onIt = t;
		if ( f % FPS === 0 && t > 30 ) {

			errs.push( Math.abs( helm.err ) );
			closing.push( ( ctl.velocity.x * dx + ctl.velocity.z * dz ) / len );

		}

	}

	const mean = ( a ) => a.reduce( ( s, x ) => s + x, 0 ) / a.length;
	return { onIt, err: Math.max( ...errs ), closing: mean( closing ), finite: ctl.isFinite() };

};

for ( const [ name, b ] of [ [ 'astern', Math.PI ], [ 'abeam', Math.PI / 2 ], [ 'ahead', 0 ], [ 'on her other quarter', - 2.4 ] ] ) {

	const r = back( b );
	ok( r.finite && r.onIt !== null && r.onIt < 30 && r.err < 35 * Math.PI / 180 && r.closing > 0.75 * MATE.most && r.closing < 1.2 * MATE.most, `a fish ${ name }: her stern on it in ${ r.onIt === null ? 'never' : r.onIt.toFixed( 0 ) + ' s' }, held within ${ ( r.err * 180 / Math.PI ).toFixed( 0 ) } degrees after, closing at ${ r.closing.toFixed( 2 ) } m/s (he wants ${ MATE.most })` );

}

const rough = back( Math.PI, { Hs: 3 } );
ok( rough.closing > 0.6 * MATE.least && rough.closing < 1.4 * MATE.least, `in 3 m of sea, slower: ${ rough.closing.toFixed( 2 ) } m/s (he wants ${ MATE.least })` );

// ((M20) taking her helm in the game (Mate.update): you've left her helm for the chair, so her engines are off (Hull stops them
// as you leave it), and a fish is on. M19 asked for them running, so he never took her: tools/two-players/crew.mjs' mate part)
{

	const { Mate } = await import( '../src/game/rigs/Mate.js' );
	const ctl = new BoatController( { model: m, query, terrain: { heightAt: () => - 50 }, colliders: null } );
	ctl.moored = false;
	ctl.driven = false;
	ctl.engineOn = false;
	const toasts = [], state = { stats: { mate: true, mateDay: 200 }, days: { out: 1, mate: 1 }, fuelL: 500, money: 0, dues: { owed: 0 }, save() {}, emit() {} };
	const game = { state, fight: { distance: 90, landAt: 3 }, rod: { lineInWater: true, bobber: new Vector3( 0, 0, - 90 ) }, toast: ( t ) => toasts.push( t ) };
	game.app = { boatCtl: ctl, boat: { id: 'sportfisher' }, player: { mode: 'deck', riding: null }, together: null, weather: null };
	const mate = new Mate( game );
	mate.update( dt );
	ok( ctl.helmsman === 'mate' && ctl.driven && toasts.some( ( t ) => /mate has her helm/.test( t ) ), `you off her helm, her engines stopped, a fish on: he takes her helm and starts her (${ ctl.helmsman }, driven ${ ctl.driven })` );
	game.fight = null;
	game.rod.lineInWater = false;
	mate.update( dt );
	ok( ctl.helmsman === null && ! ctl.driven, 'the fish off: hers again, stopped' );

}

// ((M21) him, seen (docs/m21/deckhand.md): where he stands on her, whether he's aboard as she's hired, out, backing down and handed
// back, her pose's Mt both ways (an older game's Mt: 1 too), and his figure put there on her model
{

	const { Mate, Deckhand, DECKHAND, mateSpot, mateWire, mateRead } = await import( '../src/game/rigs/Mate.js' );
	const { CHAIR_Z } = await import( '../src/world/boat/sportfisher/SportfisherHull.js' );
	const { SF } = await import( '../src/world/boat/sportfisher/SportfisherLines.js' );
	const hi = await loadBoat( 'sportfisher', 'high' );
	// (a body about him: 0.22 m round, from his shins to his head. In a solid box of hers?)
	const inBox = ( M, s, r = 0.22 ) => M.colliders.filter( ( c ) => c.solid !== false ).find( ( c ) => {

		for ( let y = s.y + 0.15; y < s.y + 1.7; y += 0.1 ) if ( Math.abs( y - c.center.y ) < c.half.y && Math.abs( s.x - c.center.x ) < c.half.x + r && Math.abs( s.z - c.center.z ) < c.half.z + r ) return true;
		return false;

	} );
	for ( const M of [ m, hi ] ) {

		const s = mateSpot( M, 'cockpit' ), q = M.lines, H = M.rodHolders, flat = ( a, b ) => Math.hypot( a.x - b.x, a.z - b.z );
		const side = q.sheerX( q.tAtSheerZ( s.z ) ) - SF.gunwale, near = Math.min( ...H.map( ( h ) => flat( h, s ) ) );
		const box = inBox( M, s );
		ok( s && M.soleY( s.x, s.z, s.y + 0.3 ) === s.y && s.y === SF.cockpit && s.z < SF.mezzZ - 0.26 - 0.2, `${ M.low ? 'low' : 'high' }: in her cockpit, his feet on its sole (${ s.y } m) and his back clear of the mezzanine's box (${ ( SF.mezzZ - 0.26 - s.z ).toFixed( 2 ) } m)` );
		ok( ! box && side - Math.abs( s.x ) > 0.4, `   clear of her sides (${ ( side - Math.abs( s.x ) ).toFixed( 2 ) } m in from the cockpit's side) and of every solid part of her${ box ? ': in her ' + box.tag : '' }` );
		ok( flat( s, { x: 0, z: CHAIR_Z } ) > 1.5 && flat( s, M.boardPoint ) > 1.5 && Math.abs( s.x ) > 1.12 + 0.3, `   clear of the chair (${ flat( s, { x: 0, z: CHAIR_Z } ).toFixed( 2 ) } m), where you're put aboard (${ flat( s, M.boardPoint ).toFixed( 2 ) } m) and the step down into her (${ ( Math.abs( s.x ) - 1.12 ).toFixed( 2 ) } m outside it)` );
		ok( near > 0.5 && H.every( ( h ) => Math.sign( h.x ) !== Math.sign( s.x ) || Math.abs( h.x ) > Math.abs( s.x ) + 0.5 ), `   and of her rod holders (the nearest ${ near.toFixed( 2 ) } m, outboard of him: their rods lean out from there)` );
		ok( Math.cos( s.yaw ) < - 0.7, `   facing aft over her cockpit (${ ( s.yaw * 180 / Math.PI ).toFixed( 0 ) } degrees off her bow)` );
		const h = mateSpot( M, 'helm' ), hb = inBox( M, h, 0.25 ), ahead = h.z - M.helm.stand[ 1 ];
		ok( h.x === M.helm.stand[ 0 ] && ahead > 0 && ahead < 0.2 && h.y === SF.bridge && M.soleY( h.x, h.z, h.y + 0.3 ) === h.y && h.yaw === 0 && ! hb, `   at her helm: ${ ahead.toFixed( 2 ) } m ahead of its stand (${ h.x }, ${ h.z }), his feet on the bridge (${ h.y } m), facing her bow, his toes clear of her console${ hb ? ': in her ' + hb.tag : '' }` );
		// (his hands on her wheel's rim, either side of it, within an arm's reach of his shoulders: about 0.56 m to the wrist, here)
		const wc = new Vector3().setFromMatrixPosition( M._wheels[ 0 ] ), G = h.grips, sh = ( k ) => new Vector3( k ? 0.19 : - 0.19, h.y + 1.42, h.z );
		const arm = G.map( ( g, k ) => g.distanceTo( sh( k ) ) );
		ok( G.length === 2 && G.every( ( g ) => Math.abs( g.distanceTo( wc ) - 0.2 ) < 1e-6 ) && G[ 0 ].x < 0 && G[ 1 ].x > 0 && arm.every( ( d ) => d < 0.56 + 0.05 && d > 0.35 ), `   his hands on her wheel's rim at ten to two, right and left (${ arm.map( ( d ) => d.toFixed( 2 ) ).join( ' and ' ) } m from his shoulders)` );

	}

	ok( mateSpot( null, 'cockpit' ) === null && mateSpot( m, null ) === null && mateSpot( { helm: m.helm }, 'cockpit' ) === null, 'no spot for him off her, or on a boat without one' );

	// where he is as she's hired, out, backing down and handed back
	const ctl = new BoatController( { model: m, query, terrain: { heightAt: () => - 50 }, colliders: null } );
	const state = { stats: { mate: false, mateDay: 200 }, days: { out: 1, mate: 1 }, fuelL: 500, money: 1e4, dues: { owed: 0 }, save() {}, emit() {} };
	const game = { state, fight: null, rod: { lineInWater: false, bobber: new Vector3( 0, 0, - 90 ) }, toast() {} };
	game.app = { boatCtl: ctl, boat: { id: 'sportfisher' }, player: { mode: 'deck', riding: null }, together: null, weather: null };
	const mate = new Mate( game );
	const is = () => {

		mate.update( dt );
		return [ mate.where, mate.wire() ];

	};

	ctl.moored = true;
	let w = is();
	ok( w[ 0 ] === null && w[ 1 ] === 0, `not hired: not aboard (${ w })` );
	state.stats.mate = true;
	w = is();
	ok( w[ 0 ] === null && w[ 1 ] === 0, `hired, at her berth: ashore (${ w })` );
	ctl.moored = false;
	w = is();
	ok( w[ 0 ] === 'cockpit' && w[ 1 ] === 2, `out with him: in her cockpit, Mt ${ w[ 1 ] } (${ w })` );
	game.fight = { distance: 90, landAt: 3 };
	game.rod.lineInWater = true;
	w = is();
	ok( w[ 0 ] === 'helm' && w[ 1 ] === 1 && ctl.helmsman === 'mate', `a fish on, you on her deck: at her helm backing her down, Mt ${ w[ 1 ] } (${ w })` );
	game.fight = null;
	game.rod.lineInWater = false;
	w = is();
	ok( w[ 0 ] === 'cockpit' && w[ 1 ] === 2 && ctl.helmsman === null, `the fish off, she's handed back: in her cockpit again (${ w })` );
	ctl.hauled = { x: 0, z: 0 };
	w = is();
	ctl.hauled = null;
	ok( w[ 0 ] === null, `hauled out: not aboard (${ w })` );
	game.app.boat = { id: 'console' };
	w = is();
	game.app.boat = { id: 'sportfisher' };
	ok( w[ 0 ] === null, `in another boat: not aboard her (${ w })` );

	// her pose's Mt, both ways; an older game's Mt: 1 is him at her helm; anything else is nothing
	ok( [ 'helm', 'cockpit', null ].every( ( x ) => mateRead( mateWire( x ) ) === x ) && mateRead( 1 ) === 'helm' && [ undefined, 0, 3, true, '1', 2.5 ].every( ( x ) => mateRead( x ) === null ), `the pose's Mt round trip: helm ${ mateWire( 'helm' ) }, cockpit ${ mateWire( 'cockpit' ) }, ashore ${ mateWire( null ) } (no field); an older game's Mt: 1 at her helm` );
	ok( JSON.stringify( { Mt: mateWire( 'cockpit' ) } ).length - 2 <= 6, 'and at most 6 bytes more in her pose while he\'s aboard' );

	// his figure on her model: nothing before the game's ready; then the stand-in at each spot, its arms on the wheel at her helm
	// (no look to load here); not drawn past low's 60 m
	const camera = { position: new Vector3( 0, 3, - 12 ) };
	const app = { _started: false, together: null, tier: 'low', camera, lightUp() {} };
	const d = new Deckhand( app );
	// (her group where the controllers above left it: put back about the origin)
	m.group.position.set( 0, 0, 0 );
	m.group.quaternion.identity();
	m.group.updateMatrixWorld( true );
	d.update( 'cockpit', m, m.group, dt );
	app._started = true;
	d.update( 'cockpit', m, m.group, dt );
	ok( ! d.root.parent && ! d.standIn, 'before the game\'s ready, and after it till Joe\'s and Marta\'s looks are in: nothing of him' );
	app._peopleIn = true;
	d.update( 'cockpit', m, m.group, dt );
	const cs = m.mateSpot, arms = () => d.standIn.material.uniforms.avLimbs.value;
	ok( d.root.parent === m.group && d.root.visible && d.root.position.x === cs.x && d.root.position.y === cs.y && d.root.position.z === cs.z && d.root.rotation.y === cs.yaw && d.standIn && arms().z < 0.2, `aboard: in her group at her cockpit's spot, the stand-in standing (${ d.root.position.toArray() })` );
	d.update( 'helm', m, m.group, dt );
	ok( d.root.position.z === m.mateSpot.helm.z && d.root.position.y === SF.bridge && d.root.rotation.y === 0 && arms().z > 0.7 && arms().w > 0.7, `at her helm: both arms out to her wheel (${ d.root.position.toArray() })` );
	d.update( 'cockpit', m, m.group, dt );
	ok( d.root.position.x === cs.x && arms().z < 0.2, 'handed back: in her cockpit again, a cut' );
	ok( d.root.name === 'Deckhand' && m.group.clone( true ).getObjectByName( 'Deckhand' ), 'named, so a copy made from your boat can leave him out (BoatCopies._template)' );
	camera.position.set( 0, 3, - 90 );
	d.update( 'cockpit', m, m.group, dt );
	const far = d.root.visible;
	camera.position.set( 0, 3, - 12 );
	d.update( null, m, m.group, dt );
	ok( ! far && ! d.root.visible && ! d.root.parent && DECKHAND.far.low === 60, `not drawn ${ 90 } m off on low (as the traders), nor when he isn't aboard, and then out of her (a boat you've left is let go)` );
	d.dispose();

}

if ( fails ) {

	console.log( `${ fails } failed` );
	process.exit( 1 );

}

console.log( 'all passed' );
