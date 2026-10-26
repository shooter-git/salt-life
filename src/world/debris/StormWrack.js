import { Mesh } from '../../engine/index.js';
import { Builder } from '../village/GeoBuilder.js';
import { mulberry32 } from '../../util/Noise.js';
import { weedMat, seagrassWrack, frond, branch, plank, coconut } from './DebrisShapes.js';

// (M13) A hurricane's line of wrack up the beach: where its sea reached (the surge and its surf: game/
// StormDamage's wrackH), a heavy line of what it threw up, heaped in banks with gaps between: mats of
// sargassum, seagrass, the fronds it tore off the palms, branches, a board or two off the pier, coconuts.
// Made with the beach debris's shapes (DebrisShapes) on the page, once a hurricane's left one, and drawn
// with its materials (the nature material, the village's wood); in GROUPS meshes each, which go one by one
// as it dries and is cleared or buried over the week after (the terrain paints the band beneath it:
// TerrainSurface's terrainStorm), and in SEGMENTS along the beach, each drawn only within `range` m.
// (On high about 60k triangles in all, half of it drawn at most; lite, two rows' worth, no fringes.)
//   const w = new StormWrack( { terrain, nature, wood, parent } );
//   w.set( D )   (StormDamage's damageAt, now and again)
//   w.update( camera )   (each frame)

const GROUPS = 4, SEGMENTS = 6;
const BEACH = [ - 140, 150 ]; // x: the bay's beach
const PIER_X = 55;

export class StormWrack {

	// terrain: TerrainData; nature, wood: the debris's materials
	constructor( { terrain, nature, wood, parent, lite = false } ) {

		this.terrain = terrain;
		// (on the beach's gentle sand: its slope, its sand map while there is one, 0..1, as the debris's
		// placement reads it: the page lets it go once the island's made)
		this.sandAt = ( x, z ) => {

			const t = terrain, e = 0.6;
			if ( Math.hypot( t.heightAt( x + e, z ) - t.heightAt( x - e, z ), t.heightAt( x, z + e ) - t.heightAt( x, z - e ) ) / ( 2 * e ) > 0.22 ) return 0;
			if ( ! t.sand ) return 1;
			const i = Math.max( 0, Math.min( t.res - 1, Math.round( ( x - t.origin ) / t.texel - 0.5 ) ) );
			const j = Math.max( 0, Math.min( t.res - 1, Math.round( ( z - t.origin ) / t.texel - 0.5 ) ) );
			return t.sand[ j * t.res + i ] / 255;

		};
		this.materials = { nature, wood };
		this.parent = parent;
		this.lite = lite;
		this.range = lite ? 80 : 120;
		this.key = null;
		this.meshes = [];
		this.shown = 0;

	}

	set( D ) {

		const has = !! D.storm && D.wrack > 0.01 && D.wrackH > 1.6;
		if ( has ) {

			const key = `${ D.storm.key }:${ D.wrackH.toFixed( 2 ) }`;
			if ( key !== this.key ) this.build( key, D.wrackH );

		}

		// (its groups go one by one as it's cleared: StormDamage's wrack falls from its first to none)
		this.shown = has ? Math.ceil( GROUPS * Math.min( 1, D.wrack / 0.85 ) - 1e-6 ) : 0;

	}

	update( camera ) {

		const c = camera.position;
		for ( const m of this.meshes ) m.visible = m.userData.group < this.shown && Math.hypot( m.userData.x - c.x, m.userData.z - c.z ) < this.range + m.userData.r;

	}

	build( key, H ) {

		this.dispose();
		this.key = key;
		let hs = 0x9e3779b9;
		for ( let i = 0; i < key.length; i ++ ) hs = Math.imul( hs ^ key.charCodeAt( i ), 0x01000193 );
		const rand = mulberry32( hs >>> 0 );
		const T = this.terrain, ground = ( x, z ) => T.heightAt( x, z );
		const Bs = Array.from( { length: GROUPS * SEGMENTS }, () => new Builder() ), span = ( BEACH[ 1 ] - BEACH[ 0 ] ) / SEGMENTS;
		const step = this.lite ? 0.9 : 0.7, rows = this.lite ? 2 : 3;
		for ( let x = BEACH[ 0 ]; x < BEACH[ 1 ]; x += step * ( 0.6 + rand() * 0.8 ) ) {

			if ( Math.abs( x - PIER_X ) < 2.2 ) continue;
			// where the sea reached: walking down the beach from the top, the first ground under H
			let z = - 120;
			for ( ; z < - 20; z += 0.25 ) if ( T.heightAt( x, z ) < H ) break;
			if ( z >= - 20 ) continue;
			// heaped in banks along it, two or three deep, with gaps between
			const bank = Math.sin( x * 0.21 + Math.sin( x * 0.057 ) * 2.3 ) * 0.5 + 0.5;
			for ( let row = 0; row < rows; row ++ ) {

				if ( rand() > 0.15 + 0.85 * bank * bank * ( row === 2 ? 0.5 : 1 ) ) continue;
				const wx = x + ( rand() - 0.5 ) * step, wz = z + ( row - 0.8 ) * 0.7 + ( rand() - 0.5 ) * 0.5;
				if ( this.sandAt( wx, wz ) < 0.4 ) continue;
				const seg = Math.min( SEGMENTS - 1, Math.floor( ( wx - BEACH[ 0 ] ) / span ) );
				const B = Bs[ Math.floor( rand() * GROUPS ) * SEGMENTS + seg ], r = rand();
				if ( r < 0.72 ) weedMat( B, ground, wx, wz, 0.25 + rand() * 0.45 * ( 0.5 + bank * 0.7 ), 0.06 + rand() * 0.12 * bank, rand, { dry: rand() * 0.3, aspect: 1.3 + rand() * 0.9, rot: rand() * 0.6 - 0.3, strands: this.lite ? 0 : Math.floor( rand() * 2 ), fringe: ! this.lite } );
				else if ( r < 0.87 ) seagrassWrack( B, ground, wx, wz, 0.25 + rand() * 0.3, rand, { dry: 0.3 + rand() * 0.3, dir: Math.PI / 2 + ( rand() - 0.5 ) * 0.6 } );
				else if ( r < 0.93 ) frond( B, ground, wx, wz, Math.PI / 2 + ( rand() - 0.5 ) * 1.2, 2.5 + rand() * 2, rand, { dry: rand() * 0.4 } );
				else if ( r < 0.96 ) branch( B, ground, wx, wz, rand() * Math.PI * 2, 0.8 + rand() * 1.4, 0.03 + rand() * 0.03, rand );
				else if ( r < 0.98 ) plank( B, ground, wx, wz, Math.PI / 2 + ( rand() - 0.5 ) * 0.8, 1.4 + rand() * 1.4, 0.2, 0.05, rand, { weather: 0.9 } );
				else coconut( B, ground, wx, wz, rand );

			}

		}

		Bs.forEach( ( B, i ) => {

			for ( const k of [ 'nature', 'wood' ] ) {

				const b = B.batches[ k ];
				if ( ! b || b.vcount === 0 ) continue;
				const geo = b.build();
				geo.computeBoundingSphere();
				const m = new Mesh( geo, this.materials[ k ] );
				m.name = 'storm_wrack_' + k;
				m.matrixAutoUpdate = false;
				m.receiveShadow = true;
				m.castShadow = false;
				const sp = geo.boundingSphere;
				m.userData = { group: Math.floor( i / SEGMENTS ), x: sp.center.x, z: sp.center.z, r: sp.radius };
				m.visible = false;
				this.parent.add( m );
				this.meshes.push( m );

			}

		} );

	}

	dispose() {

		for ( const m of this.meshes ) {

			m.removeFromParent();
			m.geometry.dispose();

		}

		this.meshes = [];
		this.key = null;

	}

}
