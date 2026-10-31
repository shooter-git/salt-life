import * as THREE from '../engine/index.js';
import { G } from '../core/Globals.js';
import { WORLD } from './WorldLayout.js';
import { Glare, seen, lightsOn } from './Glare.js';

// (M15) The bay's harbour lights, as the Caribbean's are (IALA region B: red right returning). Coming in from
// the sea, northward: on the east headland, to starboard, a red light (Fl R 4s) over a red triangle; on the west
// headland, to port, a green one (Fl G 4s) over a green square; between them, on the pier head's south-west
// corner, a white one (Iso W 4s: as long lit as dark). Steer between the red and the green, the pier's white
// light ahead: the way home at night from the south grounds, where the mountain hides the lighthouse.
// Each headland's a white concrete pillar on the rocks, its daymark near the top and a solar lantern on it;
// the pier's a post on its deck. Lit from dusk to dawn; far off, a point of light (world/Glare.js), seen about
// 9 km on a clear night (the pier's 5).
//   const h = new HarbourLights( { scene, terrain, colliders } )   h.footprints: [ { x, z, r } ]
//   h.update( camera, visibility, heightPx )

export const HARBOUR_LIGHTS = [
	{ id: 'east', x: 290, z: 196, colour: 0xff3a2a, paint: 0xb3322a, mark: 'triangle', char: { period: 4, on: 0.5, phase: 0 }, range: 9000, tower: 5.2 },
	{ id: 'west', x: - 256, z: 176, colour: 0x3dff7a, paint: 0x2f7a3e, mark: 'square', char: { period: 4, on: 0.5, phase: 2 }, range: 9000, tower: 5.2 },
	{ id: 'pier', x: WORLD.pier.x - WORLD.pier.headWidth / 2 + 0.4, z: WORLD.pier.zEnd - 0.4, deck: WORLD.pier.deckHeight, colour: 0xfff1d8, paint: 0xe9e4d8, mark: null, char: { period: 4, on: 2, phase: 0.7 }, range: 5000, tower: 2.6 },
];

// how lit a light of character `ch` ({ period, on, phase } s) is at time t (s), 0..1: on for `on` s of each
// period (at half its brightness, as a flash's length is reckoned), its lamp coming up and going down in a few
// hundredths of a second about its start and its end
export function lightAt( t, ch ) {

	const e = 0.05, c = ( v ) => Math.min( 1, Math.max( 0, v ) );
	let u = ( ( ( t + ch.phase ) % ch.period ) + ch.period ) % ch.period;
	if ( u > ch.period - e ) u -= ch.period;
	return c( ( u + e / 2 ) / e ) * c( ( ch.on - u + e / 2 ) / e );

}

function coloured( g, colour ) {

	const c = new THREE.Color( colour ), n = g.attributes.position.count, a = new Float32Array( n * 3 );
	for ( let i = 0; i < n; i ++ ) a.set( [ c.r, c.g, c.b ], i * 3 );
	g.setAttribute( 'color', new THREE.BufferAttribute( a, 3 ) );
	return g.index ? g.toNonIndexed() : g;

}

function merge( list ) {

	let n = 0;
	for ( const g of list ) n += g.attributes.position.count;
	const out = new THREE.BufferGeometry();
	for ( const k of [ 'position', 'normal', 'color' ] ) {

		const a = new Float32Array( n * 3 );
		let o = 0;
		for ( const g of list ) {

			a.set( g.attributes[ k ].array, o * 3 );
			o += g.attributes[ k ].count;

		}

		out.setAttribute( k, new THREE.BufferAttribute( a, 3 ) );

	}

	return out;

}

export class HarbourLights {

	constructor( { scene, terrain, colliders = null } ) {

		this.group = new THREE.Group();
		this.group.name = 'HarbourLights';
		scene.add( this.group );
		const body = new THREE.MeshStandardMaterial( { vertexColors: true, roughness: 0.75 } );
		body.name = 'HarbourLight';
		this.lights = [];
		this.footprints = [];
		for ( const L of HARBOUR_LIGHTS ) {

			// (on the rocks: the lowest of the ground under its foot, so it never floats; on the pier: its deck)
			let y0 = L.deck ?? Infinity;
			if ( L.deck === undefined ) for ( let a = 0; a < 8; a ++ ) y0 = Math.min( y0, terrain.heightAt( L.x + Math.cos( a ) * 0.9, L.z + Math.sin( a ) * 0.9 ) );
			const parts = [], H = L.tower, white = 0xe9e6dc, dark = 0x2a2a28;
			if ( L.deck === undefined ) {

				// a concrete pillar on a footing, painted white, its top band the light's colour
				parts.push( coloured( new THREE.CylinderGeometry( 0.95, 1.1, 0.8, 10 ).translate( 0, - 0.2, 0 ), 0x8b867c ) );
				parts.push( coloured( new THREE.CylinderGeometry( 0.42, 0.55, H * 0.75, 12 ).translate( 0, H * 0.375, 0 ), white ) );
				parts.push( coloured( new THREE.CylinderGeometry( 0.4, 0.42, H * 0.25, 12 ).translate( 0, H * 0.875, 0 ), L.paint ) );
				// its daymark: a green square or a red triangle, a board on two arms facing the sea
				const board = L.mark === 'square' ? new THREE.BoxGeometry( 1.3, 1.3, 0.06 ) : ( () => {

					const s = new THREE.Shape();
					s.moveTo( - 0.75, - 0.6 );
					s.lineTo( 0.75, - 0.6 );
					s.lineTo( 0, 0.7 );
					s.closePath();
					return new THREE.ExtrudeGeometry( s, { depth: 0.06, bevelEnabled: false } ).translate( 0, 0, - 0.03 );

				} )();
				parts.push( coloured( board.translate( 0, H * 0.72, 0.62 ), L.paint ) );
				parts.push( coloured( new THREE.BoxGeometry( 0.08, 0.08, 0.6 ).translate( 0, H * 0.72, 0.32 ), dark ) );

			} else {

				// a steel post on the deck, white
				parts.push( coloured( new THREE.CylinderGeometry( 0.07, 0.08, H, 8 ).translate( 0, H / 2, 0 ), white ) );
				parts.push( coloured( new THREE.BoxGeometry( 0.5, 0.06, 0.5 ).translate( 0, 0.03, 0 ), dark ) );

			}

			// the lantern: a dark base, its lens (lit), a cap, and a small solar panel on an arm
			parts.push( coloured( new THREE.CylinderGeometry( 0.22, 0.26, 0.18, 10 ).translate( 0, H + 0.09, 0 ), dark ) );
			parts.push( coloured( new THREE.CylinderGeometry( 0.2, 0.2, 0.1, 10 ).translate( 0, H + 0.58, 0 ), dark ) );
			parts.push( coloured( new THREE.BoxGeometry( 0.55, 0.03, 0.4 ).rotateX( - 0.6 ).translate( 0, H - 0.25, - 0.38 ), 0x1b2433 ) );
			const g = new THREE.Group();
			g.name = `HarbourLight ${ L.id }`;
			g.position.set( L.x, y0, L.z );
			// (its daymark facing out to sea, south-ish: away from the bay's middle)
			g.rotation.y = Math.atan2( L.x - 20, L.z - 60 );
			const mesh = new THREE.Mesh( merge( parts ), body );
			mesh.castShadow = mesh.receiveShadow = true;
			g.add( mesh );
			for ( const p of parts ) p.dispose();
			const lensMat = new THREE.MeshBasicMaterial( { color: L.colour } );
			const lens = new THREE.Mesh( new THREE.CylinderGeometry( 0.15, 0.15, 0.3, 12 ), lensMat );
			lens.position.y = H + 0.33;
			g.add( lens );
			this.group.add( g );
			const glare = new Glare( L.colour, `HarbourGlare ${ L.id }`, L.deck === undefined ? 2.2 : 1 );
			scene.add( glare.sprite );
			this.lights.push( { L, y: y0 + H + 0.33, lensMat, glare, base: new THREE.Color( L.colour ) } );
			if ( L.deck === undefined ) {

				this.footprints.push( { x: L.x, z: L.z, r: 2.2 } );
				if ( colliders ) colliders.addCylinder( L.x, L.z, 0.6, y0 - 0.6, y0 + H + 0.7, { tag: 'harbourLight' } );

			} else if ( colliders ) colliders.addCylinder( L.x, L.z, 0.1, y0, y0 + H + 0.7, { tag: 'harbourLight' } );

		}

	}

	update( camera, visibility = 1, heightPx = 720 ) {

		const lit = lightsOn(), t = G.time.value, c = camera.position, sea = G.seaLevel.value;
		for ( const o of this.lights ) {

			const k = lit * lightAt( t, o.L.char );
			// (the lens: dim by day, its colour lit at night as it flashes)
			o.lensMat.color.copy( o.base ).multiplyScalar( 0.25 + 2.5 * k );
			if ( lit <= 0 ) {

				o.glare.sprite.visible = false;
				continue;

			}

			const d = Math.hypot( c.x - o.L.x, c.y - o.y, c.z - o.L.z );
			o.glare.place( camera, o.L.x, o.y, o.L.z, k * seen( d, o.y - sea, c.y - sea, o.L.range, visibility ), 0.9, heightPx, 7 );

		}

	}

}
