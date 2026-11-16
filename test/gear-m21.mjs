// (M21) Stream GEAR (docs/m21/gear.md), under Node: each rod and reel the game draws (rigs/GearModels.js) builds, at its real size
// (docs/m21/sources-rods.md, -reels.md), its moving parts tagged and on their axes, under the one model's size before M21; each built
// once and shared; the game's levels to the models (light and heavy tackle, the chair rod with the 130, the electric reel, the fly
// rods); the line's colours; the pose's numbers there and back, and an older game's; her kit's levels; the rod in your hands fitted
// as it's wanted and the fishing's tip as it was; the rods in her holders standing as real ones do; one program for them all.
import { Box3, Matrix4, PerspectiveCamera, Scene, Vector3 } from '../src/engine/index.js';
import { DEFAULT_GEAR, DEFAULT_SPREAD, FLY_LINE, LINES, REELS, RODS, gearCode, gearModel, hasModel, modelOf, modelsBuilt, readGear } from '../src/game/rigs/GearModels.js';
import { PART } from '../src/game/rigs/RodParts.js';
import { FLY_LINE_COLOR } from '../src/game/rigs/FlyRod.js';
import { FishingRod, createRodMaterial } from '../src/game/FishingRod.js';
import { HolderRods } from '../src/game/rigs/HolderRods.js';
import { Rigs } from '../src/game/rigs/Rigs.js';
import { LIGHT, UPGRADES, defaultUpgrades, tackleOf } from '../src/game/Gear.js';

let failed = 0;
const ok = ( c, s ) => {

	if ( ! c ) failed ++;
	console.log( ( c ? 'ok   ' : 'FAIL ' ) + s );

};
const near = ( a, b, e ) => Math.abs( a - b ) <= e;
globalThis.window = globalThis.window || {};
// (the one model before M21, a 7 ft spinning rod and its reel: docs/m21/before.md)
const BEFORE = { tris: 16352, MB: 1.317 };

// ---- before anything's wanted: the rod in your hands, what you start with, and nothing else
const query = { allocate: () => 0, setPoint() {}, cpuValid: true, cpu: new Float32Array( [ 0, 0, 0, - 5 ] ) };
const camera = new PerspectiveCamera();
camera.position.set( 0, 1.7, 0 );
camera.lookAt( 0, 1.7, 10 );
camera.updateMatrixWorld( true );
const rod = new FishingRod( { scene: new Scene(), camera, query, terrain: { heightAt: () => - 5 } } );
ok( modelsBuilt() === 1 && rod.gear.rod === 0 && rod.gear.reel === 0 && rod.gear.line === 0, `the load builds one model, what you start with (the hand-me-down and the old spinning reel): ${ modelsBuilt() } built` );
rod.setModel( { rod: 7, reel: 9, line: 6 } );
ok( rod.gear.rod === 0 && modelsBuilt() === 1, 'a model not yet built isn\'t built till the rod\'s taken up (the 12-weight wanted, the rod put away)' );

// ---- each model
const size = ( g ) => {

	let b = 0;
	for ( const a of Object.values( g.attributes ) ) b += a.array.byteLength;
	return { tris: g.index.count / 3, MB: ( b + g.index.array.byteLength ) / 1e6 };

};
const partsOf = ( g ) => {

	const aux = g.attributes.aux, pos = g.attributes.position, by = new Map();
	for ( let i = 0; i < aux.count; i ++ ) {

		const p = Math.round( aux.getW( i ) );
		if ( ! by.has( p ) ) by.set( p, [] );
		by.get( p ).push( i );

	}

	return { by, pos };

};
// every pair the game makes: light (rods 0-2, reels 0-2), heavy (rods 0-3, reels 0-5, the chair rod with the 130), the electric
// reel, the fly rods
const pairs = new Set();
for ( let rd = 0; rd < 4; rd ++ ) for ( let rl = 0; rl < 6; rl ++ ) for ( const electric of [ false, true ] ) {

	const m = modelOf( { rod: rd, reel: rl, line: 0, electric } );
	pairs.add( m.rod * 16 + m.reel );

}

for ( const w of [ 8, 10, 12 ] ) {

	const m = modelOf( { fly: w } );
	pairs.add( m.rod * 16 + m.reel );

}

const LEN = [ 2.0, 2.13, 2.74, 1.68, 2.32, 2.74, 2.74, 2.74 ];
let most = { tris: 0, MB: 0 }, all = true, onAxes = true, sides = true, tags = true;
const rows = [];
for ( const k of [ ...pairs ].sort( ( a, b ) => a - b ) ) {

	const rd = Math.floor( k / 16 ), rl = k % 16, m = gearModel( rd, rl ), g = m.geometry, f = m.fit, s = size( g );
	const box = new Box3().setFromBufferAttribute( g.attributes.position );
	most = { tris: Math.max( most.tris, s.tris ), MB: Math.max( most.MB, s.MB ) };
	rows.push( `${ RODS[ rd ].label } / ${ REELS[ rl ].label }: ${ s.tris } triangles, ${ s.MB.toFixed( 2 ) } MB, ${ f.L } m` );
	if ( ! near( box.max.y, LEN[ rd ], 0.012 ) || ! near( f.L, LEN[ rd ], 1e-9 ) ) all = false;
	// its moving parts: a spinning reel's rotor, bail, crank, spool and the line on it; a drum's crank (a fly reel's knob's on its
	// spool), spool and line; the line along the rod
	const { by, pos } = partsOf( g ), want = f.kind === 'spin' ? [ 1, 2, 3, 4, 5, 8 ] : f.kind === 'fly' ? [ 6, 7, 8 ] : [ 3, 6, 7, 8 ];
	if ( ! want.every( ( p ) => by.has( p ) ) || [ ...by.keys() ].some( ( p ) => p && ! want.includes( p ) ) ) tags = false;
	// each on its axis: a spinning reel's turns about its spool's axis (along the rod at reelAxis' z); a drum's about its axis
	// across the rod (reelAxis' y, z), its line no further out than a full spool
	const [ sy, sz, cy, cz ] = f.reelAxis, v = new Vector3();
	for ( const [ p, list ] of by ) for ( const i of list ) {

		v.fromBufferAttribute( pos, i );
		if ( ( p === 4 || p === 5 ) && Math.hypot( v.x, v.z - sz ) > 0.04 ) onAxes = false;
		if ( p === 7 && Math.hypot( v.y - sy, v.z - sz ) > f.lineR + 1e-4 ) onAxes = false;
		if ( p === 3 && Math.hypot( v.y - cy, v.z - cz ) > 0.13 ) onAxes = false;

	}

	// the reel on the reel's side (-Z: a spinning or a fly reel hangs there; the frame's turned over for one that rides on top)
	if ( ! ( sz < - 0.04 ) || f.top !== REELS[ rl ].top ) sides = false;

}

console.log( rows.map( ( r ) => '     ' + r ).join( '\n' ) );
ok( pairs.size >= 13, `every pair the game makes builds: ${ pairs.size } of them` );
ok( all, 'each at its own length: the hand-me-down 2.0 m, the graphite 2.13, the surf rod 2.74, the stand-up rod 1.68 (it was drawn 2.13), the chair rod 2.32 along its blank, the fly rods 2.74' );
ok( tags, 'their moving parts tagged for the shader: a spinning reel\'s rotor, bail, crank, spool and line; a drum\'s crank, spool and line; a fly reel\'s spool and its line; the line along the rod' );
ok( onAxes, 'each on its own axis: a spinning reel\'s spool about its axis along the rod, a drum\'s line about its axis across it, within a full spool' );
ok( sides, 'each reel on the reel\'s side of its rod, the frame turned over for one that rides on top' );
ok( most.tris < BEFORE.tris && most.MB < BEFORE.MB, `the biggest no bigger than the one model before M21: ${ most.tris } triangles (${ BEFORE.tris }), ${ most.MB.toFixed( 2 ) } MB (${ BEFORE.MB })` );
ok( gearModel( 2, 2 ) === gearModel( 2, 2 ) && hasModel( 2, 2 ) && ! hasModel( 7, 0 ), 'each built once and kept: the same geometry for every mesh drawing it' );

// ---- the sizes the sources give (docs/m21/sources-*.md)
{

	const spread = ( m ) => {

		const b = new Box3().setFromBufferAttribute( m.geometry.attributes.position );
		return b;

	};
	const up = gearModel( 3, 3 ), w80 = gearModel( 3, 4 ), b130 = gearModel( 4, 5 ), conv = gearModel( 2, 2 ), f8 = gearModel( 5, 7 ), f12 = gearModel( 7, 9 );
	ok( near( w80.fit.lineR * 2, 0.121, 0.002 ) && near( b130.fit.lineR * 2, 0.148, 0.002 ) && near( conv.fit.lineR * 2, 0.055, 0.002 ), `the spools: the 80's ${ ( w80.fit.lineR * 2000 ).toFixed( 0 ) } mm (121), the 130's ${ ( b130.fit.lineR * 2000 ).toFixed( 0 ) } (148), the conventional's ${ ( conv.fit.lineR * 2000 ).toFixed( 0 ) } (55)` );
	ok( near( f8.fit.lineR / 0.8 * 2, 0.105, 0.001 ) && near( f12.fit.lineR / 0.8 * 2, 0.121, 0.001 ), 'the fly reels: 105 mm on the 8, 121 on the 12' );
	ok( spread( b130 ).min.z < spread( w80 ).min.z && spread( w80 ).min.z < spread( up ).min.z, 'the 130 taller than the 80, the 80 than the 50' );
	ok( b130.fit.tilt > 0.5 && b130.fit.tilt < 0.55 && b130.fit.butt.z > 0.15, `the chair rod's butt bent ${ ( b130.fit.tilt * 180 / Math.PI ).toFixed( 0 ) } degrees, its gimbal ${ b130.fit.butt.z.toFixed( 2 ) } m off the blank's line, away from the reel` );

}

// ---- the game's levels to the models
{

	const M = ( u, heavy, electric = false ) => {

		const t = tackleOf( { ...defaultUpgrades(), ...u }, heavy );
		return modelOf( { rod: t.rod, reel: t.reel, line: t.line, electric } );

	};
	const start = M( {}, false );
	ok( start.rod === 0 && start.reel === 0 && start.line === 0, 'what you start with: the hand-me-down, the old spinning reel, 8 lb mono' );
	const top = { rod: 3, reel: 5, line: 5 }, light = M( top, false ), heavy = M( top, true ), drop = M( top, true, true );
	ok( light.rod === LIGHT.rod && light.reel === LIGHT.reel && light.line === 2, 'your light tackle at most the surf rod, the conventional and 30 lb braid' );
	ok( heavy.rod === 4 && heavy.reel === 5 && heavy.line === 5, 'your heavy tackle with the 130-class reel: the bent-butt chair rod it comes with, 130 lb mono' );
	ok( drop.reel === 6 && drop.rod === 3, 'the electric reel for a deep drop, on your stand-up rod' );
	const conv = M( { rod: 2, reel: 2, line: 2 }, false );
	ok( conv.rod === 2 && conv.reel === 2 && gearModel( conv.rod, conv.reel ).fit.top, 'the pair the game makes drawn as it is: the conventional on the surf rod, on top' );
	ok( [ 8, 10, 12 ].every( ( w, i ) => modelOf( { fly: w } ).rod === 5 + i && modelOf( { fly: w } ).reel === 7 + i && modelOf( { fly: w } ).line === FLY_LINE ), 'a fly rod and its reel by its weight, the fly line on it' );

}

// ---- the lines
{

	ok( LINES.length === UPGRADES.line.levels.length + 1 && LINES[ FLY_LINE ].color === FLY_LINE_COLOR, 'a look for each of the six lines, and the fly line as it is' );
	ok( LINES.map( ( L ) => L.braid ).join() === 'false,false,true,true,false,false,false' && LINES[ 2 ].color !== LINES[ 3 ].color, 'the two braids matt, and told apart (moss green, hi-vis yellow)' );
	ok( LINES[ 0 ].color === 0xd8dde0, 'clear mono as the line\'s always been drawn' );

}

// ---- the pose: three numbers in one, there and back
{

	let round = true;
	for ( let rd = 0; rd < RODS.length; rd ++ ) for ( let rl = 0; rl < REELS.length; rl ++ ) for ( let ln = 0; ln < LINES.length; ln ++ ) {

		const back = readGear( JSON.parse( JSON.stringify( { gr: gearCode( { rod: rd, reel: rl, line: ln } ) } ) ).gr );
		if ( ! back || back.rod !== rd || back.reel !== rl || back.line !== ln ) round = false;

	}

	ok( round, 'every rod, reel and line there and back through the pose (gr: rod x 100 + reel x 10 + line)' );
	ok( [ undefined, null, - 1, 1000, 1.5, '123', 990, 109 ].every( ( x ) => readGear( x ) === null ), 'and nothing from a number that isn\'t one: an older game\'s pose has none' );
	ok( JSON.stringify( { gr: 455 } ).length <= 10, 'a few bytes a pose' );
	ok( DEFAULT_GEAR.rod === 1 && DEFAULT_GEAR.reel === 1 && DEFAULT_SPREAD.rod === 3 && DEFAULT_SPREAD.reel === 3, 'an older game\'s drawn as before: the graphite and a spinning reel in its hands, the stand-up rod and the two-speed in its holders' );

}

// ---- her kit: her tackle's levels, for the rod off her holder in a guest's hands
{

	const k = Rigs.cleanKit( { t: { lineKg: 36, reelSpeed: 2.6, dragKg: 24, spoolM: 868, rd: 3, rl: 4, ln: 4 }, b: {} } );
	const old = Rigs.cleanKit( { t: { lineKg: 36, reelSpeed: 2.6, dragKg: 24, spoolM: 868 }, b: {} } );
	const bad = Rigs.cleanKit( { t: { lineKg: 36, reelSpeed: 2.6, dragKg: 24, spoolM: 868, rd: 9, rl: 4, ln: 4 }, b: {} } );
	ok( k.t.rd === 3 && k.t.rl === 4 && k.t.ln === 4 && old.t.rd === undefined && bad.t.rd === undefined, 'her kit\'s levels kept as they come, an older game\'s none, nonsense dropped' );

}

// ---- the rod in your hands
{

	rod.equip( true );
	ok( rod.gear.rod === 7 && rod.flyRod && ! rod.big, 'taken up, the 12-weight\'s fitted' );
	const U = rod.rodMat.uniforms, f = rod.fit;
	ok( U.rodFit.value.y === f.L && U.reelAxis.value.x === f.reelAxis[ 0 ] && near( U.reelLine.value.x, rod.lineMat.color.r, 1e-6 ), 'its figures on the rod\'s material: its length, its reel\'s axes, its line\'s colour' );
	// (the tip the fishing goes by is the same for every rod drawn: the one model's before M21)
	const tips = [];
	for ( const g of [ { rod: 0, reel: 0, line: 0 }, { rod: 2, reel: 1, line: 2 }, { rod: 2, reel: 2, line: 2 }, { rod: 3, reel: 4, line: 4 } ] ) {

		rod.setGear( { castM: 22, reelSpeed: 1.1, spoolM: 180, model: g } );
		rod.pose.elev = 0.46;
		rod.pose.side = 0.22;
		rod.pose.hand.set( 0.15, - 0.05, - 0.45 );
		rod.t = 0;
		rod.bend = rod.bendVel = 0;
		rod.update( 0, { visible: true } );
		tips.push( { tip: rod.tip.clone(), line: rod.lineTip.clone(), top: rod.big } );

	}

	ok( tips.every( ( t ) => t.tip.distanceTo( tips[ 0 ].tip ) < 1e-6 ), 'the tip the cast and the fight go by is where it was before M21, whatever rod\'s drawn' );
	ok( tips[ 1 ].line.distanceTo( camera.position ) > tips[ 0 ].line.distanceTo( camera.position ) + 0.4 && tips[ 2 ].top && ! tips[ 1 ].top, 'the line\'s drawn from the drawn rod\'s own tip (the surf rod\'s further out), a conventional on top' );
	rod.setRig( 'float' );
	rod.setGear( { castM: 45, reelSpeed: 2.2, spoolM: 302, model: { rod: 2, reel: 2, line: 2 } } );
	ok( rod.lineMat.color.getHex() === LINES[ 2 ].color && rod.lineMat.roughness > 0.6, 'the line in the air as the line in use: 30 lb braid, moss green and matt' );
	rod.setRig( 'fly' );
	ok( rod.lineMat.color.getHex() === FLY_LINE_COLOR, 'a fly\'s the fly line' );
	rod.setRig( 'float' );
	ok( rod.lineMat.color.getHex() === LINES[ 2 ].color, 'and back' );

}

// ---- the rods in her holders
{

	const scene = new Scene(), H = new HolderRods( scene ), tip = new Vector3(), up = new Vector3( 0, 1, 0 );
	const mouth = new Vector3( 1, 1.2, - 4 ), axis = new Vector3( 0.45, 0.72, - 0.53 ).normalize(), to = new Vector3( 8, 0, - 40 );
	const stand = ( gear, bend = 0 ) => {

		H.begin();
		H.rod( gear, mouth, axis, to, bend, 1, 30, 1 / 60, tip );
		H.end();
		const m = H.meshes[ 0 ], f = m.userData.model.fit, M = m.matrix;
		const butt = f.butt.clone().applyMatrix4( M ), seat = new Vector3( 0, f.seatY, 0 ).applyMatrix4( M ), reel = new Vector3( 0, f.reelAxis[ 0 ], f.reelAxis[ 1 ] ).applyMatrix4( M );
		return { butt, seat, reel, tip: tip.clone(), f, m, above: reel.clone().sub( seat ).dot( up ) };

	};
	const big = stand( { rod: 3, reel: 4, line: 4 } ), spin = stand( { rod: 1, reel: 1, line: 1 } ), chair = stand( { rod: 4, reel: 5, line: 5 } );
	const bottom = mouth.clone().addScaledVector( axis, - 0.25 );
	ok( big.butt.distanceTo( bottom ) < 1e-6 && spin.butt.distanceTo( bottom ) < 1e-6, 'a rod\'s butt down its holder\'s tube to the pin, 25 cm in' );
	ok( big.above > 0.03 && spin.above < - 0.03, `a conventional reel on top (${ big.above.toFixed( 3 ) } m over the rod), a spinning reel underneath (${ spin.above.toFixed( 3 ) })` );
	const legDir = chair.seat.clone().sub( chair.butt ).normalize(), rodDir = new Vector3().setFromMatrixColumn( chair.m.matrix, 1 ).normalize();
	ok( chair.butt.distanceTo( bottom ) < 1e-6 && legDir.angleTo( axis ) < 0.55 && rodDir.angleTo( axis ) > 0.5 && rodDir.y < axis.y, 'a bent butt\'s lower leg in the tube, the rod above it lying lower, 30 degrees out' );
	const straight = big.tip.clone(), bowed = stand( { rod: 3, reel: 4, line: 4 }, 0.26 ).tip;
	const toLine = to.clone().sub( straight ).normalize();
	ok( bowed.clone().sub( straight ).dot( toLine ) > 0.2, 'bowed toward its line with a fish on' );
	ok( H.meshes.length === 1 && scene.children.length === 1, 'one mesh a holder, kept and re-fitted' );
	ok( H.meshes[ 0 ].material.customProgramCacheKey() === rod.rodMat.customProgramCacheKey() && createRodMaterial().customProgramCacheKey() === rod.rodMat.customProgramCacheKey(), 'and the same program as the rod in your hands: one for every rod and reel' );

}

if ( failed ) {

	console.log( `${ failed } FAILED` );
	process.exit( 1 );

}

console.log( 'all passed' );
