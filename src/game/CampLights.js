import { BufferAttribute, BufferGeometry, Color, DoubleSide, Mesh, MeshBasicMaterial, Vector3 } from '../engine/index.js';
import { G } from '../core/Globals.js';
import { Glare, seen } from '../world/Glare.js';
import { LAMPS, lightsAt } from './PearlsDay.js';

// (M16) The fish camp's lights at night, kerosene, warm and dim, when game/PearlsDay.js says they're lit: the hurricane
// lantern under the lean-to, a lamp in the shed showing at its window and through the gaps in its boards, the fire pit
// some nights. On the shared local lights (materials/LocalLights.js, its 8 slots, 4 on low): a lamp that's out has a
// scale of 0, and is passed over before anything's reckoned for it. What you see of them is one small mesh, drawn only
// while one's lit and you're within CLOSE of it; past that, the lantern's a point of light seen from the sea (world/Glare).
//   const l = new CampLights( { scene, lights: app.localLights, at: { lantern: [ x, y, z ], window: { x, y, z, w, h }, gaps: [ { x, y0, y1, z, w } ], fire: [ x, y, z ] } } )
//   l.update( dt, camera, hour, day, pick, since, visibility, heightPx, hidden )

const CLOSE = 90; // m
const FAR_SEEN = 2600; // m: how far a clear night lets a hurricane lantern be seen (a dim point, past that lost in the air)
// colours: over 1, as the lit glass in the village's materials is, for the sea's exposure at night
const FLAME = [ 7, 4.2, 1.5 ], GLASS = [ 2.6, 1.45, 0.5 ], ROOM = [ 2.2, 1.15, 0.42 ], GAP = [ 1.5, 0.78, 0.28 ], EMBER = [ 3.2, 0.9, 0.15 ], FIRE = [ 6, 2.5, 0.55 ];

export class CampLights {

	constructor( { scene, lights = null, at } ) {

		this.lights = lights;
		const pos = [], col = [], idx = [];
		const part = () => ( { v: pos.length / 3, i: idx.length, vn: 0, in: 0 } );
		const end = ( p ) => {

			p.vn = pos.length / 3 - p.v;
			p.in = idx.length - p.i;
			return p;

		};
		const tri = ( a, b, c, k ) => {

			const n = pos.length / 3;
			pos.push( ...a, ...b, ...c );
			for ( let q = 0; q < 3; q ++ ) col.push( ...k );
			idx.push( n, n + 1, n + 2 );

		};
		const quad = ( a, b, c, d, k ) => {

			tri( a, b, c, k );
			tri( a, c, d, k );

		};

		// ---- the lantern: its globe, and the flame in it
		const lp = at.lantern, lantern = part();
		for ( let k = 0; k < 6; k ++ ) {

			const a0 = k / 6 * Math.PI * 2, a1 = ( k + 1 ) / 6 * Math.PI * 2, r0 = 0.083, r1 = 0.09, h = 0.1;
			quad( [ lp[ 0 ] + Math.cos( a0 ) * r0, lp[ 1 ] + h, lp[ 2 ] + Math.sin( a0 ) * r0 ], [ lp[ 0 ] + Math.cos( a1 ) * r0, lp[ 1 ] + h, lp[ 2 ] + Math.sin( a1 ) * r0 ], [ lp[ 0 ] + Math.cos( a1 ) * r1, lp[ 1 ] - h, lp[ 2 ] + Math.sin( a1 ) * r1 ], [ lp[ 0 ] + Math.cos( a0 ) * r1, lp[ 1 ] - h, lp[ 2 ] + Math.sin( a0 ) * r1 ], GLASS );

		}

		tri( [ lp[ 0 ] - 0.03, lp[ 1 ] - 0.06, lp[ 2 ] ], [ lp[ 0 ] + 0.03, lp[ 1 ] - 0.06, lp[ 2 ] ], [ lp[ 0 ], lp[ 1 ] + 0.06, lp[ 2 ] ], FLAME );
		tri( [ lp[ 0 ], lp[ 1 ] - 0.06, lp[ 2 ] - 0.03 ], [ lp[ 0 ], lp[ 1 ] - 0.06, lp[ 2 ] + 0.03 ], [ lp[ 0 ], lp[ 1 ] + 0.06, lp[ 2 ] ], FLAME );
		end( lantern );

		// ---- the shed: its window (four panes in a rough frame), and the gaps in its boards, each its own
		const W = at.window, window = part();
		const pane = ( x0, x1, y0, y1, k ) => quad( [ x0, y0, W.z ], [ x1, y0, W.z ], [ x1, y1, W.z ], [ x0, y1, W.z ], k );
		const bar = 0.022;
		for ( const [ sx, sy ] of [ [ - 1, - 1 ], [ 1, - 1 ], [ 1, 1 ], [ - 1, 1 ] ] ) {

			const x0 = sx < 0 ? W.x - W.w / 2 : W.x + bar, x1 = sx < 0 ? W.x - bar : W.x + W.w / 2, y0 = sy < 0 ? W.y - W.h / 2 : W.y + bar, y1 = sy < 0 ? W.y - bar : W.y + W.h / 2;
			// (the lamp's low and to one side: some panes brighter)
			const b = sy < 0 ? 1.15 : 0.75, s = sx < 0 ? 1.1 : 0.9;
			pane( x0, x1, y0, y1, [ ROOM[ 0 ] * b * s, ROOM[ 1 ] * b * s, ROOM[ 2 ] * b * s ] );

		}

		for ( const g of at.gaps ) {

			if ( g.side ) quad( [ g.x, g.y0, g.z - g.w ], [ g.x, g.y0, g.z + g.w ], [ g.x, g.y1, g.z + g.w * 0.6 ], [ g.x, g.y1, g.z - g.w * 0.6 ], GAP.map( ( c ) => c * g.b ) );
			else quad( [ g.x - g.w, g.y0, g.z ], [ g.x + g.w, g.y0, g.z ], [ g.x + g.w * 0.6, g.y1, g.z ], [ g.x - g.w * 0.6, g.y1, g.z ], GAP.map( ( c ) => c * g.b ) );

		}

		end( window );

		// ---- the fire: its embers, and three tongues of flame, made anew each frame (a few vertices)
		const fp = at.fire, fire = part();
		for ( let k = 0; k < 7; k ++ ) {

			const a0 = k / 7 * Math.PI * 2, a1 = ( k + 1 ) / 7 * Math.PI * 2, r = 0.31 + ( k % 3 ) * 0.03;
			tri( [ fp[ 0 ], fp[ 1 ] + 0.06, fp[ 2 ] ], [ fp[ 0 ] + Math.cos( a1 ) * r, fp[ 1 ] + 0.015, fp[ 2 ] + Math.sin( a1 ) * r ], [ fp[ 0 ] + Math.cos( a0 ) * r, fp[ 1 ] + 0.015, fp[ 2 ] + Math.sin( a0 ) * r ], EMBER );

		}

		const tongueV = pos.length / 3;
		for ( let k = 0; k < 6; k ++ ) {

			tri( [ 0, 0, 0 ], [ 0, 0, 0 ], [ 0, 0, 0 ], FIRE );
			tri( [ 0, 0, 0 ], [ 0, 0, 0 ], [ 0, 0, 0 ], FIRE );

		}

		end( fire );
		this.fp = fp;
		this.tongueV = tongueV;
		this.parts = { lantern, window, fire };

		const g = this.geometry = new BufferGeometry();
		this.base = new Float32Array( col );
		g.setAttribute( 'position', new BufferAttribute( new Float32Array( pos ), 3 ) );
		g.setAttribute( 'color', new BufferAttribute( new Float32Array( col ), 3 ) );
		this.allIdx = new Uint16Array( idx );
		g.setIndex( new BufferAttribute( new Uint16Array( idx.length ), 1 ) );
		g.setDrawRange( 0, 0 );
		g.computeBoundingSphere();
		g.boundingSphere.radius += 2;
		this.mesh = new Mesh( g, new MeshBasicMaterial( { vertexColors: true, side: DoubleSide } ) );
		this.mesh.name = 'CampGlow';
		this.mesh.visible = false;
		scene.add( this.mesh );
		this._set = - 1;

		// ---- the lantern seen from the sea
		// (made the first time it's seen)
		this.glare = null;
		this.scene = scene;
		this.glarePos = new Vector3( ...lp );

		// ---- on the shared lights
		this.sources = {};
		const warm = new Color( 1.0, 0.66, 0.34 );
		if ( lights ) {

			this.sources.lantern = lights.add( { position: new Vector3( ...lp ), color: warm, intensity: 3, range: 9, kind: 'campLantern', flicker: 0.1, scale: 0 } );
			this.sources.window = lights.add( { position: new Vector3( W.x, W.y, W.z - 0.35 ), color: new Color( 1.0, 0.6, 0.3 ), intensity: 1.1, range: 5, kind: 'campWindow', dir: new Vector3( 0, - 0.1, - 1 ).normalize(), cosInner: 0.35, cosOuter: - 0.15, scale: 0 } );
			this.sources.fire = lights.add( { position: new Vector3( fp[ 0 ], fp[ 1 ] + 0.5, fp[ 2 ] ), color: new Color( 1.0, 0.5, 0.2 ), intensity: 4.5, range: 10, kind: 'campFire', flicker: 0.22, scale: 0 } );

		}

		this.lit = LAMPS.map( ( l ) => ( { ...l, on: 0 } ) );
		this.t = 0;

	}

	update( dt, camera, hour, day, pick, since, visibility = 1, heightPx = 720, hidden = false ) {

		const lit = lightsAt( hour, day, pick, since, this.lit ), c = camera.position;
		const on = { lantern: lit[ 0 ].on, window: lit[ 1 ].on, fire: lit[ 2 ].on };
		for ( const k in this.sources ) this.sources[ k ].scale = on[ k ];
		const night = Math.min( 1, Math.max( 0, ( G.night.value - 0.15 ) / 0.5 ) );
		const P = this.glarePos, d = Math.hypot( c.x - P.x, c.y - P.y, c.z - P.z ), any = ( on.lantern + on.window + on.fire ) > 0 && night > 0;
		this.t += dt;
		const close = any && d < CLOSE && ! hidden;
		this.mesh.visible = close;
		// (far off, a point; it needs to be dark, and a lamp under a lean-to is shut in from most of the land)
		const sea = G.seaLevel.value;
		if ( any && d >= CLOSE && ! hidden && on.lantern > 0 ) {

			if ( ! this.glare ) {

				this.glare = new Glare( 0xffb56a, 'CampGlare' );
				this.scene.add( this.glare.sprite );

			}

			this.glare.place( camera, P.x, P.y, P.z, 0.7 * on.lantern * night * seen( d, P.y - sea, c.y - sea, FAR_SEEN, visibility ), 0.35, heightPx, 3 );

		} else if ( this.glare ) this.glare.sprite.visible = false;
		if ( close ) this._draw( on, night );

	}

	// what's lit into the mesh: only they're in its index, each flickering as it does
	_draw( on, night ) {

		const g = this.geometry, set = ( on.lantern > 0 ? 1 : 0 ) | ( on.window > 0 ? 2 : 0 ) | ( on.fire > 0 ? 4 : 0 );
		if ( set !== this._set ) {

			this._set = set;
			let n = 0;
			const out = g.index.array;
			for ( const [ k, bit ] of [ [ 'lantern', 1 ], [ 'window', 2 ], [ 'fire', 4 ] ] ) {

				if ( ! ( set & bit ) ) continue;
				const p = this.parts[ k ];
				out.set( this.allIdx.subarray( p.i, p.i + p.in ), n );
				n += p.in;

			}

			g.index.needsUpdate = true;
			g.setDrawRange( 0, n );

		}

		const t = this.t, col = g.attributes.color.array, base = this.base;
		const k = { lantern: on.lantern * ( 0.92 + 0.1 * Math.sin( t * 9 ) * Math.sin( t * 5.3 ) ), window: on.window * ( 0.94 + 0.08 * Math.sin( t * 7 + 1 ) * Math.sin( t * 4.1 ) ), fire: on.fire * ( 0.82 + 0.25 * Math.sin( t * 11 ) * Math.sin( t * 6.7 + 2 ) ) };
		for ( const name in this.parts ) {

			const p = this.parts[ name ], f = k[ name ] * night;
			for ( let i = p.v * 3; i < ( p.v + p.vn ) * 3; i ++ ) col[ i ] = base[ i ] * f;

		}

		g.attributes.color.needsUpdate = true;
		if ( on.fire > 0 ) this._tongues();

	}

	// three tongues, each a pair of crossed blades, leaping as flame does
	_tongues() {

		const pos = this.geometry.attributes.position, a = pos.array, [ fx, fy, fz ] = this.fp, t = this.t;
		let v = this.tongueV * 3;
		const put = ( x, y, z ) => {

			a[ v ++ ] = x;
			a[ v ++ ] = y;
			a[ v ++ ] = z;

		};
		for ( let k = 0; k < 6; k ++ ) {

			const q = k >> 1, along = k % 2, ph = q * 2.1;
			const ox = ( q - 1 ) * 0.1, oz = ( ( q * 7 ) % 3 - 1 ) * 0.07;
			const h = 0.36 + 0.26 * Math.abs( Math.sin( t * ( 6.1 + q ) + ph ) * Math.sin( t * 3.3 + ph * 2 ) ) + 0.08 * Math.sin( t * 13 + ph );
			const sway = 0.05 * Math.sin( t * 4.3 + ph ), w = 0.1 - q * 0.012;
			const bx = fx + ox, bz = fz + oz, y0 = fy + 0.03;
			const wx = along ? 0 : w, wz = along ? w : 0;
			// (each blade: a belly low down, a point at the top)
			put( bx - wx, y0, bz - wz );
			put( bx + wx, y0, bz + wz );
			put( bx + wx * 1.1 + sway * 0.4, y0 + h * 0.4, bz + wz * 1.1 );
			put( bx - wx, y0, bz - wz );
			put( bx + wx * 1.1 + sway * 0.4, y0 + h * 0.4, bz + wz * 1.1 );
			put( bx + sway, y0 + h, bz + sway * 0.5 );

		}

		pos.needsUpdate = true;

	}

}
