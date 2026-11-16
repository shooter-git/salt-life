// (M19) The fly line in the air and the fly rod (stream FLY: docs/m19/fly.md), in plain Node.
//   - the loop's shape: the fly from the line's length behind the tip to as far in front as the rod's leg grows, the line as
//     drawn as long as the line, the loop no bigger than the line left, laid down on the water from its far end;
//   - drawn in the fishing line's own program (no new one), the fly rod drawn in the spinning rod's: (M21) at its own 9 ft, a
//     model for each weight (rigs/GearModels.js).
//   node test/fly-line.mjs
import { Vector3, Box3, Scene } from '../src/engine/index.js';
import { loopShape, drawnLength, newPoints, FlyLine, PIECES } from '../src/game/rigs/FlyLine.js';
import { FLY_L } from '../src/game/rigs/FlyRod.js';
import { gearModel, modelOf } from '../src/game/rigs/GearModels.js';
import { FishingRod, buildLineGeometry } from '../src/game/FishingRod.js';
import { createLineMaterial } from '../src/game/GameMaterials.js';
import { G } from '../src/core/Globals.js';

let fails = 0;
const ok = ( c, msg ) => {

	if ( ! c ) {

		fails ++;
		console.log( 'FAIL', msg );

	} else console.log( 'ok  ', msg );

};

// ---- the loop
{

	const tip = new Vector3( 1, 2.6, - 3 ), u = new Vector3( 0.6, 0, 0.8 ), L = 12, pts = newPoints();
	const ahead = ( p ) => ( p.x - tip.x ) * u.x + ( p.z - tip.z ) * u.z;
	loopShape( pts, tip, u, L, 0, 0.7, 0.06 );
	ok( pts.length === 2 * PIECES + 1 && pts[ 0 ].equals( tip ), `13 points, the first the rod's tip (${ pts.length })` );
	ok( Math.abs( ahead( pts[ 12 ] ) + L - Math.PI * 0.35 ) < 0.05, `before the stop, the fly's the line behind the tip: ${ ahead( pts[ 12 ] ).toFixed( 2 ) } m` );
	let worst = 0, lo = Infinity;
	for ( let r = 0; r <= L; r += 0.5 ) {

		loopShape( pts, tip, u, L, r, 0.7, 0.06 );
		const d = drawnLength( pts );
		worst = Math.max( worst, Math.abs( d - L ) / L );
		lo = Math.min( lo, pts[ 6 ].y );
		ok( pts.every( ( p ) => Number.isFinite( p.x + p.y + p.z ) ), `r ${ r } m: every point a number` );

	}

	ok( worst < 0.03, `the line as drawn is as long as the line, through the unrolling, to within ${ ( worst * 100 ).toFixed( 1 ) }%` );
	loopShape( pts, tip, u, L, L, 0.7, 0.06 );
	ok( Math.abs( ahead( pts[ 12 ] ) - L ) < 1e-6 && Math.abs( pts[ 12 ].y - ( tip.y + L * 0.06 ) ) < 1e-6, `unrolled, it's straight out: the fly ${ ahead( pts[ 12 ] ).toFixed( 2 ) } m ahead, on the rod's leg's slope` );
	loopShape( pts, tip, u, L, L - 0.5, 0.7, 0.06 );
	ok( tip.y + ( L - 0.5 ) * 0.06 - pts[ 8 ].y < 2 * 0.5 / Math.PI + 1e-6, 'the loop no bigger than the line left to make it' );
	loopShape( pts, tip, u, L, 30, 0.7, 0.06 );
	ok( Math.abs( ahead( pts[ 12 ] ) - L ) < 1e-6, 'r past the line: as unrolled' );
	loopShape( pts, tip, u, 0, 0, 0.7, 0.06 );
	ok( pts.every( ( p ) => p.distanceTo( tip ) < 1e-6 ), 'no line: every point at the tip' );
	// laid down
	loopShape( pts, tip, u, L, L, 0.7, 0.06, 1, - 0.2 );
	ok( Math.abs( pts[ 12 ].y - ( - 0.19 ) ) < 1e-6 && pts[ 0 ].y === tip.y, `laid down, the fly's on the water (${ pts[ 12 ].y.toFixed( 2 ) }), the tip where it is` );
	loopShape( pts, tip, u, L, L, 0.7, 0.06, 0.5, - 0.2 );
	ok( pts[ 12 ].y > - 0.19 && pts[ 12 ].y < tip.y + L * 0.06, `half way down, half way (${ pts[ 12 ].y.toFixed( 2 ) })` );

}

// ---- drawn in the fishing line's program
{

	const scene = new Scene(), line = new FlyLine( scene ), mono = createLineMaterial( 48 );
	const m = line.meshes[ 0 ].material;
	ok( line.meshes.length === PIECES && scene.children.length === PIECES, `six curves (${ line.meshes.length })` );
	ok( m.onBeforeCompile.toString() === mono.onBeforeCompile.toString() && m.customProgramCacheKey() === mono.customProgramCacheKey() && m.type === mono.type, 'each in the fishing line\'s own program: the same shader code, the same cache key, the same kind of material' );
	ok( m.uniforms.lineShow.value > 1 && m.color.getHex() !== mono.color.getHex(), 'a fly line: wider, and its own colour' );
	const pts = newPoints();
	loopShape( pts, new Vector3(), new Vector3( 0, 0, 1 ), 8, 3, 0.7, 0.06 );
	G.night.value = 0;
	line.show( pts );
	const day = m.emissive.r;
	G.night.value = 1;
	line.show( pts );
	ok( day > 0.2 && m.emissive.r === 0 && mono.emissive.r === 0, `it glows by day, as a dyed line does lit from behind (${ day.toFixed( 2 ) }); not at night; mono doesn't` );
	G.night.value = 0;
	line.show( pts );
	ok( line.meshes.every( ( x ) => x.visible ) && line.meshes[ 5 ].material.uniforms.lineB.value.equals( pts[ 12 ] ), 'shown: each curve its points, the last ending at the fly' );
	line.hide();
	ok( line.meshes.every( ( x ) => ! x.visible ), 'and hidden' );
	line.dispose();
	ok( scene.children.length === 0, 'and gone' );
	ok( buildLineGeometry( 12 ).index.count === 12 * 6, 'its geometry the fishing line\'s, in 12 steps' );

}

// ---- the fly rod
{

	const F = modelOf( { fly: 8 } ), m = gearModel( F.rod, F.reel ), g = m.geometry, box = new Box3().setFromBufferAttribute( g.attributes.position );
	ok( Math.abs( box.max.y - FLY_L ) < 0.005 && m.fit.L === FLY_L, `(M21) built at its own length: ${ box.max.y.toFixed( 3 ) } m, 9 ft (M19's was drawn the spinning rod's and stretched)` );
	ok( box.min.z < - 0.1 && box.min.z > - 0.14, `its reel hangs under the seat (${ box.min.z.toFixed( 3 ) } m)` );
	ok( g.attributes.position.count < 30000, `a few thousand points (${ g.attributes.position.count })` );
	// in the hand: the real rod, its tip 9 ft out from the butt and the hand on the cork
	const query = { allocate: () => 0, setPoint() {}, cpuValid: true, cpu: new Float32Array( [ 0, 0, 0, - 1 ] ) };
	const camera = new ( await import( '../src/engine/index.js' ) ).PerspectiveCamera();
	camera.position.set( 0, 1.7, 0 );
	camera.lookAt( 0, 1.7, 10 );
	camera.updateMatrixWorld( true );
	const rod = new FishingRod( { scene: new Scene(), camera, query, terrain: { heightAt: () => - 1 } } );
	rod.equip( true );
	for ( let i = 0; i < 60; i ++ ) rod.update( 1 / 60, { visible: true } );
	const short = rod.tip.clone();
	rod.setGear( { castM: 22, reelSpeed: 0.7, spoolM: 210, fly: 8 } );
	for ( let i = 0; i < 60; i ++ ) rod.update( 1 / 60, { visible: true } );
	const butt = new Vector3( 0, 0, 0 ).applyMatrix4( rod.rodMesh.matrix ), tip = rod.lineTip;
	ok( rod.flyRod && rod.rodMesh.geometry === g, 'the fly rod fitted in your hands' );
	ok( Math.abs( butt.distanceTo( tip ) - FLY_L ) < 0.05, `butt to tip ${ butt.distanceTo( tip ).toFixed( 2 ) } m` );
	ok( tip.distanceTo( camera.position ) > short.distanceTo( camera.position ) + 0.4, `its tip further out than the spinning rod's (${ tip.distanceTo( camera.position ).toFixed( 2 ) } m, ${ short.distanceTo( camera.position ).toFixed( 2 ) })` );
	ok( rod.fit.hold > 0.17 && rod.fit.hold < 0.45 && rod.tip.distanceTo( rod.lineTip ) < 0.02, `held by its cork, its tip where M19's was (${ rod.tip.distanceTo( rod.lineTip ).toFixed( 3 ) } m off): the fly line's loop's drawn from it` );
	rod.setGear( { castM: 22, reelSpeed: 1.1, spoolM: 180 } );
	ok( ! rod.flyRod && rod.rodMesh.geometry !== g, 'and the spinning rod back' );

}

console.log( fails ? `${ fails } FAILED` : 'all passed' );
process.exit( fails ? 1 : 0 );
