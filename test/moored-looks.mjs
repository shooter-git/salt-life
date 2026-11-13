// (M16) The boats you own and aren't in, as they look (public/boats/moored/, baked by tools/moored-bake.mjs): each file reads,
// each is her own size and few triangles, her fittings come and go as her model's do, and her paint goes on her topsides.
import { register } from 'node:module';
import { readFileSync } from 'node:fs';
register( 'data:text/javascript,' + encodeURIComponent( `
export async function resolve( specifier, context, next ) {
	if ( specifier === '@allthespaces/portal/three' ) return { url: 'data:text/javascript,export const gltfLoader = {};', shortCircuit: true };
	return next( specifier, context );
}` ) );
globalThis.window = globalThis.window || { devicePixelRatio: 1 };
const { BOATS, loadBoat } = await import( '../src/world/boat/Boats.js' );
const { LOOK_PARTS, lookGeometry, lookSign, readLook } = await import( '../src/game/fleet/MooredLooks.js' );
const { mooredGeometry } = await import( '../src/game/fleet/MooredModels.js' );
const { PAINTS } = await import( '../src/game/fleet/Fleet.js' );
const { gearStats, defaultUpgrades } = await import( '../src/game/Gear.js' );
const { Box3, Color, Matrix4, Vector3 } = await import( '../src/engine/index.js' );

let bad = 0;
const ok = ( c, what ) => {

	if ( ! c ) bad ++;
	console.log( `${ c ? 'ok  ' : 'FAIL' } ${ what }` );

};

// the most a boat's look is let have, every part of her fitted (tools/moored-bake.mjs TARGET), and a floor: she's more than her stand-in
const MOST = { kayak: 1500, console: 3800, lobster: 3800, sportfisher: 4800 };
// ((M19) and M19's: the console's trolling motor, Power-Poles and radar, the kayak's pedal drive and pole)
const ALL = { tTop: true, twin: true, diveLadder: true, tankRack: true, tower: true, outriggers: true, chair: true, holdKg: 99, finder: true, trolley: true, anchorM: 10, trollingN: 498, stakeM: 2.4, radar: true, pedal: true };
const NONE = { tTop: false, twin: false, diveLadder: false, tankRack: false, tower: false, outriggers: false, chair: false, holdKg: 12, finder: false, trolley: false, anchorM: 0, trollingN: 0, stakeM: 0, radar: false, pedal: false };
const tris = ( g ) => g.index.count / 3;

// what of a model's drawn: its meshes that show, as far as each one's drawn
function drawnBox( root ) {

	const box = new Box3(), v = new Vector3(), M = new Matrix4(), I = new Matrix4();
	root.traverseVisible( ( o ) => {

		if ( ! o.isMesh ) return;
		const g = o.geometry, P = g.attributes.position, index = g.index ? g.index.array : null;
		const end = Math.min( index ? index.length : P.count, g.drawRange.start + g.drawRange.count );
		for ( let k = 0; k < ( o.isInstancedMesh ? o.count : 1 ); k ++ ) {

			if ( o.isInstancedMesh ) o.getMatrixAt( k, I );
			M.copy( o.matrixWorld );
			if ( o.isInstancedMesh ) M.multiply( I );
			for ( let i = g.drawRange.start; i < end; i ++ ) box.expandByPoint( v.fromBufferAttribute( P, index ? index[ i ] : i ).applyMatrix4( M ) );

		}

	} );
	return box;

}

for ( const id of Object.keys( BOATS ) ) {

	const bytes = readFileSync( new URL( `../public/boats/moored/${ id }.bin`, import.meta.url ) );
	const look = readLook( bytes.buffer.slice( bytes.byteOffset, bytes.byteOffset + bytes.byteLength ) );
	ok( look.id === id && look.vertices > 0 && look.index.every( ( i ) => i < look.vertices ), `${ id }: her file reads (${ look.vertices } vertices, ${ ( bytes.length / 1024 ).toFixed( 1 ) } KB)` );

	// her size, against her model's as it's drawn, all her gear on her
	const model = await loadBoat( id, 'high' );
	model.fit( ALL );
	model.group.updateMatrixWorld( true );
	const real = drawnBox( model.group );
	const all = lookGeometry( look, { stats: ALL } ), none = lookGeometry( look, { stats: NONE } ), as = lookGeometry( look, { stats: gearStats( defaultUpgrades(), id ) } );
	all.computeBoundingBox();
	const B = all.boundingBox, near = ( a, b ) => Math.abs( a - b ) < 0.05;
	ok( near( B.min.z, real.min.z ) && near( B.max.z, real.max.z ) && near( B.min.y, real.min.y ), `${ id }: her length and her keel her model's (${ B.min.z.toFixed( 2 ) } to ${ B.max.z.toFixed( 2 ) } m, keel ${ B.min.y.toFixed( 2 ) }; her model ${ real.min.z.toFixed( 2 ) } to ${ real.max.z.toFixed( 2 ) }, ${ real.min.y.toFixed( 2 ) })` );
	ok( all.attributes.position.array.every( Number.isFinite ) && all.attributes.normal.array.some( ( n ) => n !== 0 ), `${ id }: well-formed` );

	// few triangles, but more than the stand-in
	const stand = mooredGeometry( id, { stats: ALL } ).attributes.position.count / 3;
	ok( tris( all ) <= MOST[ id ] && tris( none ) > stand * 1.5, `${ id }: ${ tris( none ) } triangles as she's bought, ${ tris( as ) } as she comes, ${ tris( all ) } with all her gear (most ${ MOST[ id ] }; her stand-in ${ Math.round( stand ) }, her model ${ model.triangleCount })` );

	// each of her fittings is in it, and comes and goes with her stats as her model's does
	const parts = LOOK_PARTS[ id ];
	for ( const k of Object.keys( parts ) ) ok( look.parts[ k ] && look.parts[ k ][ 1 ] > 0, `${ id }: her ${ k } is baked (${ look.parts[ k ] ? look.parts[ k ][ 1 ] / 3 : 0 } triangles)` );
	const fittedOf = ( s ) => {

		model.fit( s );
		// ((M19) and M19's: the kayak's pedal drive and pole (staked: never, as she's left), the console's three and her anchor)
		if ( id === 'kayak' ) return Object.fromEntries( model._fitKey.split( ',' ).map( ( v, i ) => [ [ 'cooler', 'crate', 'puck', 'trolley', 'pedal', 'pole', 'staked' ][ i ], v === 'true' ] ) );
		if ( id === 'console' ) return { tTop: model.fitted.tTop, tankRack: model.fitted.tankRack, twin: model.fitted.twin, single: ! model.fitted.twin, ladderUp: model.fitted.diveLadder, trolling: model.fitted.trolling, powerPole: model.fitted.powerPole, radar: model.fitted.radar, anchorStowed: true };
		return { ...model.fitted };

	};

	for ( const [ name, s ] of [ [ 'bought', NONE ], [ 'all', ALL ], [ 'as she comes', gearStats( defaultUpgrades(), id ) ], [ 'no stats', {} ], [ 'half', { twin: true, tTop: false, tower: false, chair: true, holdKg: 60, finder: false, trolley: true } ] ] ) {

		const want = fittedOf( s ), shown = Object.fromEntries( Object.keys( parts ).map( ( k ) => [ k, parts[ k ].when( s ) ] ) );
		const same = Object.keys( parts ).every( ( k ) => want[ k ] === shown[ k ] );
		const count = tris( lookGeometry( look, { stats: s } ) ), expect = ( look.parts.base[ 1 ] + Object.keys( parts ).reduce( ( n, k ) => n + ( shown[ k ] ? look.parts[ k ][ 1 ] : 0 ), 0 ) ) / 3;
		if ( Object.keys( parts ).length ) ok( same && count === expect, `${ id }, ${ name }: what's fitted shows as on her model (${ Object.keys( parts ).filter( ( k ) => shown[ k ] ).join( ', ' ) || 'nothing' }; ${ count } triangles)` );

	}

	ok( Object.keys( parts ).filter( ( k ) => ! parts[ k ].always ).every( ( k ) => lookSign( id, { ...NONE, [ k === 'single' ? 'twin' : k === 'cooler' || k === 'crate' ? 'holdKg' : k === 'puck' ? 'finder' : k === 'ladderUp' ? 'diveLadder' : k ]: k === 'crate' || k === 'cooler' ? 99 : true } ) !== lookSign( id, NONE ) ), `${ id }: a change in any of them is a new look` );
	// her paint: on her topsides alone (the kayak's all tinted by it, as her model's material is), the colour her model makes
	// of it, and as she came without one
	const paintOn = ( hex ) => {

		model.setPaint( hex );
		return ( model.paintSlot ? model.paintSlot.uniform.value : model.materials.hull.color ).clone();

	};
	const red = PAINTS.find( ( p ) => p.id === 'red' ).hex, R = paintOn( red ), asCame = paintOn( null );
	model.dispose();
	const plain = lookGeometry( look, { stats: ALL } ).attributes.color.array, painted = lookGeometry( look, { stats: ALL, paint: red } ).attributes.color.array;
	let topsides = 0, tinted = 0, kept = 0, wrong = 0, unlike = 0;
	for ( let v = 0; v < look.vertices; v ++ ) {

		const how = look.col[ v * 4 + 3 ], c = [ 0, 1, 2 ].map( ( k ) => painted[ v * 3 + k ] ), was = [ 0, 1, 2 ].map( ( k ) => plain[ v * 3 + k ] );
		const want = how === 1 ? [ R.r, R.g, R.b ] : how === 2 ? [ was[ 0 ] * R.r, was[ 1 ] * R.g, was[ 2 ] * R.b ] : was;
		if ( c.some( ( x, k ) => Math.abs( x - want[ k ] ) > 1e-6 ) ) wrong ++;
		// (unpainted, her topsides are as her model's: to the file's 8 bits)
		if ( how === 1 && [ asCame.r, asCame.g, asCame.b ].some( ( x, k ) => Math.abs( x - was[ k ] ) > 0.01 + x * 0.02 ) ) unlike ++;
		if ( how === 1 ) topsides ++;
		else if ( how === 2 ) tinted ++;
		else kept ++;

	}

	ok( ! wrong && ( id === 'kayak' ? tinted > look.vertices / 2 : topsides > 30 && kept > topsides ), `${ id }: her paint goes on as on her model (${ topsides } vertices her topsides, ${ tinted } tinted, ${ kept } as they are)` );
	ok( ! unlike, `${ id }: and without one, she's as she came (${ unlike } of her topsides' vertices otherwise)` );

}

console.log( bad ? `\n${ bad } failed` : '\nmoored looks: all passed' );
process.exit( bad ? 1 : 0 );
