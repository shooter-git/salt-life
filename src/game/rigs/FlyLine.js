import { Mesh, Vector3, Color } from '../../engine/index.js';
import { G } from '../../core/Globals.js';
import { createLineMaterial } from '../GameMaterials.js';
import { buildLineGeometry } from '../FishingRod.js';
import { FLY_LINE_COLOR, FLY_LINE_GLOW } from './FlyRod.js';

// (M19) The fly line in the air (stream FLY: docs/m19/fly.md), as a cast loop unrolls: its shape worked out, not simulated.
// From the stop, the rod's leg of the line lies still from the tip along the cast while the fly's leg runs on at the line's
// speed; the loop between them travels at half that, so the fly goes from L behind the tip to L in front as the rod's leg
// grows from nothing to the whole line (r: 0 to L). Before the stop, r is nothing and the line trails from the tip the way
// the last stroke laid it. Laid down, it falls to the water from the far end, the line nearest the tip last.
//
// Drawn as six curves of the fishing line's own material (createLineMaterial: the program FishingRod's line has, so no new
// one, and nothing made before the start): the rod's leg in two, the loop's two quarters, the fly's leg in two.
//   loopShape( out, tip, u, L, r, D, rise, lay, water ) -> out: 13 points; curve i runs out[ 2i ] to out[ 2i + 2 ], bent
//   toward out[ 2i + 1 ]; out[ 12 ] is the fly
//   const line = new FlyLine( scene )   line.show( pts )   line.hide()
export const PIECES = 6;
export const FLY_LINE_W = 1.8; // drawn this many times the fishing line's width: a fly line's 1.1 to 1.5 mm, mono's a third of it
// (its own glow, FlyRod's FLY_LINE_GLOW, a share of its colour: fly lines are dyed bright, many fluorescent, to be seen against
// the sky and the water, where lit from behind a thin line's only a dark thread: the material's emissive colour, no program of
// its own)
const SEGS = 12;
const DROOP = 0.05; // the fly's leg falls this much for each metre of it, coming round
const LAID_M = 3; // the line laid down falls first this far out from the tip, then all the way

export function loopShape( out, tip, u, L, r, D, rise, lay = 0, water = 0 ) {

	L = Math.max( 0, L );
	r = Math.min( L, Math.max( 0, r ) );
	// the loop's no bigger than the line left to make it of; the fly's leg is what's left past it
	const R = Math.min( D, 2 * ( L - r ) / Math.PI ) / 2, f = Math.max( 0, L - r - Math.PI * R );
	const tx = tip.x + u.x * r, ty = tip.y + r * rise, tz = tip.z + u.z * r;
	const put = ( i, x, y, z ) => out[ i ].set( x, y, z );
	// the rod's leg, straight from the tip
	put( 0, tip.x, tip.y, tip.z );
	put( 2, ( tip.x + tx ) / 2, ( tip.y + ty ) / 2, ( tip.z + tz ) / 2 );
	put( 4, tx, ty, tz );
	out[ 1 ].lerpVectors( out[ 0 ], out[ 2 ], 0.5 );
	out[ 3 ].lerpVectors( out[ 2 ], out[ 4 ], 0.5 );
	// the loop, round its front: each quarter bent toward the corner its two ends' tangents meet at
	put( 5, tx + u.x * R, ty, tz + u.z * R );
	put( 6, tx + u.x * R, ty - R, tz + u.z * R );
	put( 7, tx + u.x * R, ty - 2 * R, tz + u.z * R );
	put( 8, tx, ty - 2 * R, tz );
	// the fly's leg, back the way it came, falling a little toward its end
	const by = ty - 2 * R, fy = by - f * DROOP;
	put( 12, tx - u.x * f, fy, tz - u.z * f );
	put( 10, tx - u.x * f / 2, ( by + fy ) / 2 - f * DROOP * 0.15, tz - u.z * f / 2 );
	out[ 9 ].lerpVectors( out[ 8 ], out[ 10 ], 0.5 );
	out[ 11 ].lerpVectors( out[ 10 ], out[ 12 ], 0.5 );
	// laid down on the water, the far line first
	if ( lay > 0 ) for ( let i = 1; i < out.length; i ++ ) {

		const p = out[ i ], d = Math.hypot( p.x - tip.x, p.z - tip.z ), k = lay * Math.min( 1, d / LAID_M );
		p.y += ( water + 0.01 - p.y ) * k;

	}

	return out;

}

// the length of the line as it's drawn (the curves' own lengths, each in a few steps): for the tests
export function drawnLength( pts ) {

	let s = 0;
	const a = new Vector3(), b = new Vector3();
	for ( let i = 0; i < PIECES; i ++ ) {

		const A = pts[ 2 * i ], C = pts[ 2 * i + 1 ], B = pts[ 2 * i + 2 ];
		a.copy( A );
		for ( let k = 1; k <= 16; k ++ ) {

			const t = k / 16, w = 1 - t;
			b.set( w * w * A.x + 2 * w * t * C.x + t * t * B.x, w * w * A.y + 2 * w * t * C.y + t * t * B.y, w * w * A.z + 2 * w * t * C.z + t * t * B.z );
			s += a.distanceTo( b );
			a.copy( b );

		}

	}

	return s;

}

// how much it glows: its share by day, none at night (fluorescence wants the daylight)
export const flyGlow = ( night ) => FLY_LINE_GLOW * ( 1 - Math.min( 1, Math.max( 0, night ) ) );

export const newPoints = () => Array.from( { length: 2 * PIECES + 1 }, () => new Vector3() );

export class FlyLine {

	constructor( scene, { color = FLY_LINE_COLOR, width = FLY_LINE_W } = {} ) {

		const geo = buildLineGeometry( SEGS );
		this.meshes = [];
		this.glow = new Color( color );
		this.scene = scene;
		for ( let i = 0; i < PIECES; i ++ ) {

			const m = new Mesh( geo, createLineMaterial( SEGS ) );
			m.material.color.setHex( color );
			m.material.uniforms.lineShow.value = width;
			m.name = 'FlyLine';
			m.frustumCulled = false;
			m.castShadow = false;
			m.visible = false;
			scene.add( m );
			this.meshes.push( m );

		}

	}

	show( pts ) {

		const day = flyGlow( G.night.value );
		for ( let i = 0; i < PIECES; i ++ ) {

			const m = this.meshes[ i ], U = m.material.uniforms;
			m.material.emissive.copy( this.glow ).multiplyScalar( day );
			U.lineA.value.copy( pts[ 2 * i ] );
			U.lineCtl.value.copy( pts[ 2 * i + 1 ] );
			U.lineB.value.copy( pts[ 2 * i + 2 ] );
			m.visible = true;

		}

	}

	hide() {

		for ( const m of this.meshes ) m.visible = false;

	}

	dispose() {

		for ( const m of this.meshes ) {

			this.scene.remove( m );
			m.material.dispose();

		}

		this.meshes[ 0 ].geometry.dispose();
		this.meshes.length = 0;

	}

}
