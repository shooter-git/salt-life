// (M21) Hands on a wheel, and her fit near the camera (docs/m21/deckhand.md, the user's calls of 2026-11-16).
// - The reach (game/ArmReach.js): an arm's two bones turned so the wrist comes to a point, shy of it, the elbow out and down; out
//   of reach, the arm straight toward it. Both hands to a wheel's rim (gripWheel), as the sportfisher's mate's and every player's
//   at a helm are.
// - Each boat's wheel and where its grips are (Vessel.wheelGrips): on its rim at ten to two, the right hand to starboard. Where
//   a player at each helm is drawn standing (Crew.helmStand, Together's), and how far their shoulders are from the grips.
// - Her fit near the camera: what a boat's fit hides stays hidden where a phone draws her detail only near the camera (her
//   nearDetail, App.updateNearDetail: userData.shown), and a copy of her on a phone draws what's past her low meshes only near,
//   and only what's fitted (BoatCopies.dress, near).
//   node test/helm-reach.mjs
import { register } from 'node:module';
import { readFileSync } from 'node:fs';
register( 'data:text/javascript,' + encodeURIComponent( `
export async function resolve( specifier, context, next ) {
	if ( specifier === '@allthespaces/portal/three' ) return { url: 'data:text/javascript,export const gltfLoader = {};', shortCircuit: true };
	return next( specifier, context );
}` ) );
globalThis.window = globalThis.window || { devicePixelRatio: 1 };
const { Bone, Group, Scene, Vector3 } = await import( '../src/engine/index.js' );
const { reachTo, gripWheel, armsOf } = await import( '../src/game/ArmReach.js' );
const { loadBoat } = await import( '../src/world/boat/Boats.js' );
const { helmStand } = await import( '../src/together/Crew.js' );
const { BoatCopies, fitWire } = await import( '../src/together/BoatCopies.js' );
const { gearStats, defaultUpgrades } = await import( '../src/game/Gear.js' );

let fails = 0;
const ok = ( c, msg ) => {

	if ( ! c ) fails ++;
	console.log( ( c ? 'ok   ' : 'FAIL ' ) + msg );

};

const note = ( ...a ) => console.log( '    ', ...a );

// ---- the reach: a figure facing +z, its arms hanging from its shoulders, which hang from its lowest spine bone (a Rocketbox
// skeleton's names: armsOf finds them). The looks' own, measured on trolley_idle in the game and off their skeletons: the men's
// shoulders 1.444 m up, the women's 1.367 and 8 cm nearer each other; their arms 0.557 and 0.493 m to the wrist
const UPPER = 0.29, FORE = 0.27, SHOULDER = 1.42;
const LOOK = {
	men: { H: 1.444, sz: - 0.04, sx: 0.21, upper: 0.286, fore: 0.271, spine: 1.015 },
	women: { H: 1.367, sz: - 0.053, sx: 0.172, upper: 0.253, fore: 0.24, spine: 1.044 },
};
function figure( L = { H: SHOULDER, sz: 0, sx: 0.19, upper: UPPER, fore: FORE, spine: 1.0 } ) {

	const g = new Group(), body = new Bone();
	body.name = 'Bip01_Spine';
	body.position.set( 0, L.spine, 0 );
	g.add( body );
	for ( const [ s, side ] of [ [ - 1, 'R' ], [ 1, 'L' ] ] ) {

		const arm = new Bone(), fore = new Bone(), hand = new Bone();
		arm.name = `Bip01_${ side }_UpperArm`;
		fore.name = `Bip01_${ side }_Forearm`;
		hand.name = `Bip01_${ side }_Hand`;
		arm.position.set( s * L.sx, L.H - L.spine, L.sz );
		fore.position.set( 0, - L.upper, 0 );
		hand.position.set( 0, - L.fore, 0 );
		body.add( arm );
		arm.add( fore );
		fore.add( hand );

	}

	// (and the thighs from the spine, as a Biped's: leaning it in mustn't swing the legs)
	for ( const [ s, side ] of [ [ - 1, 'R' ], [ 1, 'L' ] ] ) {

		const thigh = new Bone(), calf = new Bone(), foot = new Bone();
		thigh.name = `Bip01_${ side }_Thigh`;
		calf.name = `Bip01_${ side }_Calf`;
		foot.name = `Bip01_${ side }_Foot`;
		thigh.position.set( s * 0.088, L.spine - 0.12 - L.spine, 0 );
		calf.position.set( 0, - 0.42, 0 );
		foot.position.set( 0, - 0.4, 0 );
		body.add( thigh );
		thigh.add( calf );
		calf.add( foot );

	}

	g.updateMatrixWorld( true );
	return g;

}

{

	const g = figure(), B = armsOf( g ), w = ( b ) => b.getWorldPosition( new Vector3() );
	ok( B.armR && B.foreR && B.handR && B.armL && B.foreL && B.handL && w( B.armR ).x < 0, 'a Rocketbox skeleton\'s arms found by their names, the right to -x' );
	const to = new Vector3( - 0.2, 1.05, 0.38 ), pole = new Vector3( - 0.7, - 0.7, 0 ).normalize();
	const left = reachTo( B.armR, B.foreR, B.handR, to, pole, 0.05 );
	const s = w( B.armR ), e = w( B.foreR ), h = w( B.handR );
	ok( left === 0 && Math.abs( h.distanceTo( to ) - 0.05 ) < 1e-4 && Math.abs( s.distanceTo( h ) + 0.05 - s.distanceTo( to ) ) < 1e-4, `within reach: the wrist 5 cm shy of the point, on the line from the shoulder (${ h.distanceTo( to ).toFixed( 3 ) } m off it)` );
	ok( Math.abs( s.distanceTo( e ) - UPPER ) < 1e-5 && Math.abs( e.distanceTo( h ) - FORE ) < 1e-5, 'the arm\'s bones their own lengths still' );
	// (the elbow out of the shoulder-wrist line, toward the pole)
	const mid = s.clone().lerp( h, UPPER / ( UPPER + FORE ) ), bent = e.clone().sub( mid );
	ok( bent.length() > 0.02 && bent.dot( pole ) > 0, `the elbow bent out and down (${ ( bent.length() * 100 ).toFixed( 0 ) } cm off the line, toward the pole)` );
	const far = new Vector3( - 0.19, SHOULDER, 1.2 ), short = reachTo( B.armR, B.foreR, B.handR, far, pole, 0.05 );
	const h2 = w( B.handR ), want = far.distanceTo( s ) - 0.05 - ( UPPER + FORE );
	ok( Math.abs( short - want ) < 2e-3 && h2.distanceTo( s ) > UPPER + FORE - 2e-3 && h2.clone().sub( s ).normalize().dot( far.clone().sub( s ).normalize() ) > 0.9999, `out of reach: the arm straight toward it, ${ ( short * 100 ).toFixed( 0 ) } cm short, said so` );
	const g2 = figure(), B2 = armsOf( g2 ), r = new Vector3( - 0.17, 1.12, 0.4 ), l = new Vector3( 0.17, 1.12, 0.4 );
	const most = gripWheel( B2, g2, r, l, 0.05 );
	ok( most === 0 && Math.abs( w( B2.handR ).distanceTo( r ) - 0.05 ) < 1e-4 && Math.abs( w( B2.handL ).distanceTo( l ) - 0.05 ) < 1e-4 && w( B2.foreR ).x < w( B2.armR ).x + 0.05 && w( B2.foreL ).x > w( B2.armL ).x - 0.05, 'both hands to a wheel\'s rim, the elbows out either side' );
	ok( gripWheel( { armR: B2.armR }, g2, r, l ) === Infinity, 'a skeleton without its arms is left as it is' );

}

// ---- each boat's wheel, where a player at its helm stands (Crew.helmStand: nearer it, the user's call), and every look's hands on it
const lean = ( g ) => 2 * Math.acos( Math.min( 1, Math.abs( armsOf( g ).spine.quaternion.w ) ) );
for ( const id of [ 'lobster', 'console', 'sportfisher', 'kayak' ] ) for ( const tier of [ 'low', 'high' ] ) {

	const M = await loadBoat( id, tier );
	for ( const upper of [ false, true ] ) {

		if ( upper && ! M.towerHelm ) continue;
		const H = upper ? M.towerHelm : M.helm, eye = ( upper ? M.towerHelm.eye : M.helmEye ).clone(), at = helmStand( M, upper ), name = `${ id }${ upper ? '\'s tower' : '' }`;
		if ( id === 'kayak' ) {

			if ( tier === 'low' ) ok( ! H.grips && ! at.grips, 'the kayak: no wheel, nothing to reach (sat in, with a paddle)' );
			continue;

		}

		const G = H.grips;
		// (the wheel's centre: between the grips, down its face by half the rim; the rim's radius from either)
		const mid = G[ 0 ].clone().add( G[ 1 ] ).multiplyScalar( 0.5 ), half = G[ 0 ].distanceTo( G[ 1 ] ) / 2, r = half / Math.cos( Math.PI / 6 );
		const pivot = id === 'sportfisher' ? new Vector3().setFromMatrixPosition( M._wheels[ upper ? 1 : 0 ] ) : M.wheelPivot.position;
		const onRim = G.every( ( g ) => Math.abs( g.distanceTo( pivot ) - r ) < 1e-6 ) && Math.abs( mid.distanceTo( pivot ) - r / 2 ) < 1e-6;
		if ( tier === 'low' ) ok( onRim && G[ 0 ].x < G[ 1 ].x && mid.y > pivot.y, `${ name }: her grips on her wheel's rim (${ r.toFixed( 2 ) } m) at ten to two, the right to starboard` );
		ok( at.grips === G && ( upper ? M.towerHelm.eye : M.helmEye ).equals( eye ) && ( upper || M.helm.eye === M.helmEye ), `${ name } (${ tier }): Crew.helmStand gives her helm's grips, and the eye you look from at her helm is where it was` );
		// (feet: 0.2 m to the toes, 0.1 m back to the heels, 0.15 m either side: clear of whatever's solid there, by 3 cm. Behind and
		// ahead: her seat and its pedestal, her dash, her console, its leaning post)
		const hits = M.colliders.filter( ( c ) => c.solid !== false && Math.abs( at.x - c.center.x ) < c.half.x + 0.15 && at.y + 0.05 < c.center.y + c.half.y && at.y + 0.4 > c.center.y - c.half.y && at.z + 0.2 + 0.029 > c.center.z - c.half.z && at.z - 0.1 - 0.029 < c.center.z + c.half.z );
		const ahead = M.colliders.filter( ( c ) => c.solid !== false && Math.abs( at.x - c.center.x ) < c.half.x + 0.15 && at.y + 0.05 < c.center.y + c.half.y && at.y + 0.4 > c.center.y - c.half.y && c.center.z - c.half.z > at.z ).map( ( c ) => c.center.z - c.half.z - at.z );
		ok( ! hits.length, `${ name } (${ tier }): stood at ( ${ at.x.toFixed( 2 ) }, ${ at.y.toFixed( 2 ) }, ${ at.z.toFixed( 2 ) } ), the feet clear of her${ ahead.length ? `, ${ ( Math.min( ...ahead ) - 0.2 ).toFixed( 2 ) } m from the toes to what's ahead` : '' }${ hits.length ? ': in her ' + hits.map( ( c ) => c.tag ).join( ', ' ) : '' }` );
		// (every look's hands on the rim: the women's reach and the men's)
		const said = [];
		for ( const [ k, L ] of Object.entries( LOOK ) ) {

			const g = figure( L );
			g.position.set( at.x, at.y, at.z );
			g.updateMatrixWorld( true );
			const feet0 = g.getObjectByName( 'Bip01_R_Foot' ).getWorldPosition( new Vector3() );
			const short = gripWheel( armsOf( g ), g, G[ 0 ], G[ 1 ], 0.05 ), a = lean( g );
			const feet = g.getObjectByName( 'Bip01_R_Foot' ).getWorldPosition( new Vector3() ), moved = feet.distanceTo( feet0 );
			if ( moved > 0.07 ) said.push( `FAIL: the feet moved ${ moved.toFixed( 2 ) } m` );
			said.push( `${ k } ${ short < 1e-3 ? 'on it' : ( short * 100 ).toFixed( 0 ) + ' cm short' }${ a > 0.01 ? `, leaning in ${ ( a * 180 / Math.PI ).toFixed( 0 ) } degrees` : '' }` );
			if ( short > 1e-3 || a > 0.6 ) said.push( 'FAIL' );

		}

		ok( ! said.some( ( x ) => x.startsWith( 'FAIL' ) ), `${ name } (${ tier }): every look's hands on her wheel's rim, the feet where they stood (${ said.filter( ( x ) => x !== 'FAIL' ).join( '; ' ) })` );

	}

	M.dispose();

}

// ---- her fit near the camera: whatever her fit hides, what's drawn only near the camera on a phone keeps hidden
const app = readFileSync( new URL( '../src/App.js', import.meta.url ), 'utf8' ), nd = app.slice( app.indexOf( '	updateNearDetail() {' ), app.indexOf( '	drawWorld() {' ) );
ok( /o\.visible = o\.userData\.shown !== false && /.test( nd ), 'App.updateNearDetail draws a near mesh only if it isn\'t to be hidden (userData.shown)' );
for ( const id of [ 'lobster', 'console', 'sportfisher', 'kayak' ] ) {

	const M = await loadBoat( id, 'low' ), bare = gearStats( defaultUpgrades(), id ), all = { ...bare, tower: true, outriggers: true, chair: true, tTop: true, twin: true, diveLadder: true, tankRack: true };
	M.fit( bare );
	const near = ( M.nearDetail || [] ).map( ( k ) => M.meshes[ k ] ).filter( Boolean );
	const hid = near.filter( ( m ) => ! m.visible ), wrong = hid.filter( ( m ) => m.userData.shown !== false );
	ok( ! wrong.length, `${ id } on low, nothing bought: ${ hid.length ? hid.map( ( m ) => m.name ).join( ', ' ) + ' hidden by her fit, and kept hidden near the camera' : 'nothing her fit hides is drawn only near the camera' }${ wrong.length ? ': not ' + wrong.map( ( m ) => m.name ).join( ', ' ) : '' }` );
	M.fit( all );
	const back = near.filter( ( m ) => ! m.visible || m.userData.shown === false );
	ok( ! back.length, `${ id }: all of it bought, all of it shown near${ back.length ? ': not ' + back.map( ( m ) => m.name ).join( ', ' ) : '' }` );
	if ( id === 'sportfisher' ) ok( hid.includes( M.meshes.chair ), 'the sportfisher\'s chair, unbought, among them' );
	M.dispose();

}

// ---- and a copy of her on a phone: past her low meshes, only when near, and only what's fitted (a copy made from your own
// sportfisher has all of her: one built for someone else's has only her low meshes, till someone's about to board her)
{

	const own = await loadBoat( 'sportfisher', 'low' ), scene = new Scene();
	const app = { tier: 'low', boat: own, scene, localLights: { add: () => ( {} ), remove() {} }, instruments: null };
	const c = new BoatCopies( app );
	const b = c.make( 'sportfisher' ), part = ( n ) => b.getObjectByName( `boat-${ n }` );
	const seen = () => [ 'tower', 'outriggers', 'chair' ].map( ( n ) => part( n ) && part( n ).visible );
	c.dress( b, fitWire( 'sportfisher', { tower: true, outriggers: true, chair: false } ) );
	const far = seen();
	c.near( b, true );
	const near = seen();
	c.near( b, false );
	const gone = seen();
	c.near( b, true );
	c.dress( b, fitWire( 'sportfisher', { tower: true, outriggers: true, chair: true } ) );
	const bought = seen();
	ok( part( 'tower' ) && part( 'chair' ) && far.every( ( v ) => ! v ), `a phone's copy of her, tower and outriggers fitted, no chair: far off, none of them drawn (${ far })` );
	ok( near[ 0 ] && near[ 1 ] && ! near[ 2 ], `near: her tower and outriggers, not the chair she hasn't (${ near })` );
	ok( gone.every( ( v ) => ! v ) && bought.every( Boolean ), `away again, none; near with the chair bought, it too (${ gone } / ${ bought })` );
	c.drop( b );
	own.dispose();

}

if ( fails ) {

	console.log( `${ fails } failed` );
	process.exit( 1 );

}

console.log( 'all passed' );
