import { BoxGeometry, BufferGeometry, Float32BufferAttribute, Mesh } from '../engine/index.js';
import { BoatLamps } from '../world/boat/BoatLamps.js';
import { BOATS, loadBoat } from '../world/boat/Boats.js';
import { mat4, mergePrepared, prepare, triangleCount } from '../world/boat/GeoKit.js';
import { createPropMaterial } from '../game/GameMaterials.js';
import { releaseGeometries, releaseGeometry } from '../core/ReleaseAfterUpload.js';
import { PAINTS, paintOf } from '../game/fleet/Fleet.js';
import { dropView } from '../world/boat/Vessel.js';
import { namePlate } from '../game/fleet/BoatName.js';

// (M16) The others' boats, each the boat it is. A boat's meshes are made once per type (her Vessel, the template) and
// each boat of that type drawn is a clone of it: its meshes and materials shared, no new shaders. Yours is the template
// for your type (nothing new in memory). Another type's built the first time she's wanted, in the background, and let
// go a minute after the last of her has gone; a light stand-in shows meanwhile. On low only part of her is kept.
//   const c = new BoatCopies( app )
//   c.want( id ) -> { model, ... }   (model null until she's built; started if she's not)
//   c.make( id ) -> a copy, in the scene, or null if she's not there yet   c.drop( copy )
//   c.standIn( id ) -> a mesh of her size and shape, near enough from a way off   (not in the scene; drop with scene.remove)
//   c.tidy( dt )   (each second or so: lets go of those nobody's wanted)
//   c.boatChanged( old ) -> kept: you've got into another boat   (old: the Vessel you were in; true if copies still use it)
//   c.walked( model, id, f ) -> her, as she's fitted, for whoever's aboard   c.dress( copy, f )  how the copy shows it (f: fitWire's)
//   c.aboard( id ) -> whether all of her's here to walk on: on a phone she's built whole when someone's about to board   c.near( copy, on )

const TYPE_KEEP = 60; // s: a type nobody's wanted is let go after this
// the low tier's copy: without her gear. Or `lowCopy` on a Vessel; or with neither's meshes, her largest up to LOW_TRIS
export const LOW_BOAT = [ 'boat-hull', 'boat-gelcoat', 'boat-wood', 'boat-glass' ];
const LOW_TRIS = 9000;

// What's known of each without building her, m. air: her highest point over the water, for how far off she shows.
// The lobster boat's anchor light; a center console's T-top, about 2.8 m; a 48 ft sportfisher's tuna tower, about
// 11 m to its top; a kayak, the head of whoever's sitting in her
export const SIZE = {
	kayak: { length: 3.7, beam: 0.85, air: 1.0, free: 0.3, draft: 0.1, color: 0xc8732a },
	console: { length: 7, beam: 2.6, air: 2.8, free: 0.9, draft: 0.45, color: 0xe6e8e6 },
	lobster: { length: 8.2, beam: 2.9, air: 4.05, free: 1.05, draft: 0.55, color: 0xdfe3e2 },
	sportfisher: { length: 14.6, beam: 4.8, air: 11, free: 1.9, draft: 1.1, color: 0xeef0ee },
};
export const sizeOf = ( id ) => SIZE[ id ] || SIZE.lobster;

// What's fitted on her and her paint, in a number for the pose: the bits as each boat's fit reads them, the paint above them
// (PAINTS' place and one; 0: as she came). The lobster boat has nothing that comes and goes
const FITS = {
	kayak: { send: ( s ) => [ s.holdKg > 12, s.finder, s.anchorM > 0 || s.trolley ], stats: ( [ crate, finder, trolley ] ) => ( { holdKg: crate ? 13 : 12, finder, trolley } ) },
	console: { send: ( s ) => [ s.twin, s.tTop, s.diveLadder, s.tankRack ], stats: ( [ twin, tTop, diveLadder, tankRack ] ) => ( { twin, tTop, diveLadder, tankRack } ) },
	sportfisher: { send: ( s ) => [ s.tower ?? true, s.outriggers ?? true, s.chair ?? true ], stats: ( [ tower, outriggers, chair ] ) => ( { tower, outriggers, chair } ) },
};
const PAINT_SHIFT = 4;

export function fitWire( id, stats, paint ) {

	const bits = FITS[ id ] ? FITS[ id ].send( stats ).reduce( ( n, on, i ) => n | ( on ? 1 << i : 0 ), 0 ) : 0;
	return bits | ( ( paintOf( paint ) ? PAINTS.indexOf( paintOf( paint ) ) + 1 : 0 ) << PAINT_SHIFT );

}

export function fitStats( id, f ) {

	return FITS[ id ] ? FITS[ id ].stats( [ 0, 1, 2, 3 ].map( ( i ) => !! ( f & 1 << i ) ) ) : {};

}

export function fitPaint( f ) {

	const p = PAINTS[ ( f >> PAINT_SHIFT ) - 1 ];
	return p ? p.hex : null;

}

// the meshes (Mesh[]) of a boat a phone draws of someone else's
export function lowMeshes( model ) {

	const all = [], names = model.lowCopy || LOW_BOAT;
	model.group.traverse( ( c ) => c.isMesh && all.push( c ) );
	const named = all.filter( ( m ) => names.includes( m.name ) );
	if ( named.length ) return named;
	all.sort( ( a, b ) => triangleCount( b.geometry ) - triangleCount( a.geometry ) );
	let tris = 0;
	return all.filter( ( m, i ) => {

		tris += triangleCount( m.geometry );
		return i === 0 || tris <= LOW_TRIS;

	} );

}

// her shell, sheer to keel, and a deck (a loft of a few sections), bow toward +z
function standInHull( { length, beam, free, draft } ) {

	const sections = [ [ - 0.5, 0.8, 1 ], [ - 0.2, 1, 1 ], [ 0.1, 1, 1.05 ], [ 0.3, 0.8, 1.15 ], [ 0.43, 0.42, 1.25 ], [ 0.5, 0.02, 1.32 ] ];
	const pos = [], tri = ( a, b, c ) => pos.push( ...a, ...b, ...c );
	const ring = ( [ t, w, f ], s ) => {

		const z = t * length, hb = w * beam / 2 * s, top = free * f;
		return [ [ 0, - draft, z ], [ hb * 0.72, 0, z ], [ hb, top, z ] ];

	};
	for ( let i = 0; i < sections.length - 1; i ++ ) for ( const s of [ 1, - 1 ] ) {

		const a = ring( sections[ i ], s ), b = ring( sections[ i + 1 ], s );
		for ( let j = 0; j < 2; j ++ ) {

			if ( s > 0 ) { tri( a[ j ], a[ j + 1 ], b[ j + 1 ] ); tri( a[ j ], b[ j + 1 ], b[ j ] ); }
			else { tri( a[ j ], b[ j + 1 ], a[ j + 1 ] ); tri( a[ j ], b[ j ], b[ j + 1 ] ); }

		}

		const y = 0.9 * free;
		if ( s > 0 ) {

			const A = [ a[ 2 ][ 0 ], y, a[ 2 ][ 2 ] ], B = [ b[ 2 ][ 0 ], y, b[ 2 ][ 2 ] ];
			tri( A, [ - A[ 0 ], y, A[ 2 ] ], [ - B[ 0 ], y, B[ 2 ] ] );
			tri( A, [ - B[ 0 ], y, B[ 2 ] ], B );

		}

	}

	const st = ring( sections[ 0 ], 1 ), y = st[ 2 ][ 1 ], z = st[ 0 ][ 2 ], hb = st[ 2 ][ 0 ], cb = st[ 1 ][ 0 ];
	tri( [ hb, y, z ], [ cb, 0, z ], [ - cb, 0, z ] ); tri( [ hb, y, z ], [ - cb, 0, z ], [ - hb, y, z ] ); // (her transom)
	const g = new BufferGeometry();
	g.setAttribute( 'position', new Float32BufferAttribute( pos, 3 ) );
	g.computeVertexNormals();
	return g;

}

// (a box of her upperworks: x and z its middle, y its bottom)
const box = ( w, h, d, y, z, color ) => prepare( new BoxGeometry( w, h, d ), { color, rough: 0.6, matrix: mat4( 0, y + h / 2, z ) } );

// a boat you'd take for her from a way off, a hundred triangles or so in one mesh
export function standInGeometry( id ) {

	const S = sizeOf( id ), L = S.length, B = S.beam, top = S.free * 0.9, parts = [ prepare( standInHull( S ), { color: S.color, rough: 0.5 } ) ];
	const dark = 0x46525a, white = 0xe8eae8;
	if ( id === 'console' ) parts.push( box( 0.9, 1.05, 0.8, top, 0.02 * L, white ), box( 1.5, 0.08, 2, S.air - 0.08, 0, white ) );
	else if ( id === 'lobster' ) parts.push( box( 1.9, S.air * 0.42, 2.1, top, 0.07 * L, white ), box( 0.08, S.air - top - S.air * 0.42, 0.08, top + S.air * 0.42, 0, dark ) );
	else if ( id === 'sportfisher' ) parts.push( box( 3.6, 1.5, 5, top, 0.08 * L, white ), box( 3, 1.15, 2.6, top + 1.5, 0.05 * L, dark ), box( 1.5, S.air - top - 2.65 - 0.5, 1.5, top + 2.65, 0.05 * L, dark ), box( 2.1, 0.08, 2.2, S.air - 0.5, 0.05 * L, white ) );
	return mergePrepared( parts );

}

export class BoatCopies {

	constructor( app ) {

		this.app = app;
		this.types = new Map(); // id -> { id, model, template, own, gen, copies, idle, full, walks, views, paints }
		this._stands = new Map(); // id -> geometry
		this._standMaterial = null;

	}

	// her entry (built if she's not, or for your own type, your boat), wanted now
	want( id ) {

		let e = this.types.get( id );
		if ( ! e ) {

			e = { id, model: null, template: null, own: false, gen: 0, copies: new Set(), idle: 0, full: false, walks: new Map(), views: new Map(), paints: new Map() };
			this.types.set( id, e );
			if ( this.app.boat.id === id ) {

				e.model = this.app.boat;
				e.own = true;

			} else this._build( e );

		}

		e.idle = 0;
		return e;

	}

	// what there is of her on this device, or null
	model( id ) {

		return this.want( id ).model;

	}

	// All of her, for someone about to walk on her. On a phone a copy's only what's seen of her from a way off, so she's built again
	// whole (false till she's here: nobody's put on a deck that's not drawn). Her copies are made again from it, with
	// what isn't seen from a way off shown only near her (near)
	aboard( id ) {

		const e = this.want( id );
		if ( this.app.tier !== 'low' || e.own || e.full ) return !! e.model;
		if ( ! e.fulling ) {

			e.fulling = true;
			this._build( e, true );

		}

		return false;

	}

	near( b, on ) {

		const u = b.userData;
		if ( ! u.extras || u.nearOn === on ) return;
		u.nearOn = on;
		for ( const m of u.extras ) m.visible = on && m.userData.fits !== false;

	}

	// her, as she's fitted (f null: as she came)
	walked( model, id, f ) {

		const e = this.types.get( id );
		if ( ! Number.isInteger( f ) || ! e || e.model !== model ) return model;
		let w = e.walks.get( f );
		if ( ! w ) e.walks.set( f, w = model.walkedAs( fitStats( id, f ) ) );
		return w;

	}

	dress( b, f ) {

		const u = b.userData, e = this.types.get( u.type );
		if ( ! Number.isInteger( f ) || u.dressed === f || ! e ) return;
		u.dressed = f;
		u.model.dressCopy( b, fitStats( u.type, f ), ( key, make ) => {

			let v = e.views.get( key );
			if ( ! v ) {

				e.views.set( key, v = make() );
				releaseGeometry( v );

			}

			return v;

		} );
		const hex = fitPaint( f );
		let p = hex === null ? null : e.paints.get( hex );
		if ( hex !== null && ! p ) {

			p = u.model.paintedHull( hex );
			if ( p ) {

				e.paints.set( hex, p );
				if ( this.app._lit ) this.app._lit.add( p.material ); // (its shader's hers, lit as she is)

			}

		}

		const hull = u.model.materials && u.model.materials.hull, want = p ? p.material : hull;
		if ( hull ) b.traverse( ( m ) => {

			if ( ! m.isMesh ) return;
			if ( m.material === hull || m.userData.painted ) {

				m.userData.painted = !! p;
				m.material = want;

			}

		} );
		this._nearAgain( b );

	}

	_nearAgain( b ) {

		const u = b.userData, on = u.nearOn;
		u.nearOn = undefined;
		if ( u.extras ) this.near( b, !! on );

	}

	// what was made for how they're fitted
	_letGo( e ) {

		for ( const v of e.views.values() ) dropView( v );
		for ( const p of e.paints.values() ) p.material.dispose();
		e.views.clear();
		e.paints.clear();
		e.walks.clear();

	}

	async _build( e, full = false ) {

		const app = this.app;
		let model = null;
		try {

			model = await loadBoat( e.id, app.tier );
			if ( app.tier === 'low' && ! full ) this._trim( model );
			releaseGeometries( model.group ); // (once she's on the GPU, her arrays go from script memory)
			model.group.traverse( ( o ) => {

				if ( o.isMesh ) o.castShadow = o.castShadow && app.tier === 'high';

			} );
			model.group.userData.boatCopy = true;
			if ( app.lightUp ) app.lightUp( model.group );
			if ( app.renderer ) {

				await app.renderer.compileAsync( model.group, app.camera, app.scene );
				await app.useNewPrograms();

			}

		} catch ( err ) {

			console.warn( `${ e.id }: not built; her stand-in stays`, err );
			if ( full ) e.full = true; // (what there is of her: better than never being let aboard)
			return;

		}

		// (not wanted any more, or by now she's the boat you're in)
		if ( this.types.get( e.id ) !== e || e.own ) model.dispose();
		else if ( full ) {

			const old = e.model;
			this._letGo( e );
			e.model = model;
			e.template = null;
			e.full = true;
			e.gen ++; // (their copies are made again: Together._showBoat)
			if ( old ) setTimeout( () => old.dispose(), 5000 ); // (once they have been)

		} else if ( ! e.full ) e.model = model;
		else model.dispose();

	}

	// a phone's copy of her: only what it draws is kept in memory
	_trim( model ) {

		const keep = new Set( lowMeshes( model ) ), gone = [];
		model.group.traverse( ( c ) => c.isMesh && ! keep.has( c ) && gone.push( c ) );
		for ( const m of gone ) {

			m.removeFromParent();
			m.geometry.dispose();
			for ( const [ k, v ] of Object.entries( model.meshes ) ) if ( v === m ) delete model.meshes[ k ];
			for ( const k of Object.keys( model ) ) if ( model[ k ] === m ) model[ k ] = null;

		}

	}

	_template( e ) {

		const app = this.app;
		if ( e.template ) return e.template;
		const t = e.template = e.model.group.clone( true );
		// (what's yours or hers alone: her lamps, her name on her transom, her pool of light)
		for ( const name of [ 'BoatLamps', 'boat-name', 'boat-underGlowOwn' ] ) {

			const own = t.getObjectByName( name );
			if ( own ) own.removeFromParent();

		}

		// (on a phone, what's seen of her from a way off; all of her if she's here whole, for someone to walk on)
		if ( app.tier === 'low' && ! e.own && ! e.full ) {

			const keep = [];
			const named = new Set( lowMeshes( e.model ).map( ( m ) => m.name ) );
			t.traverse( ( c ) => c.isMesh && named.has( c.name ) && keep.push( c ) );
			t.clear();
			for ( const m of keep ) {

				m.removeFromParent();
				t.add( m );

			}

		}

		t.traverse( ( c ) => {

			if ( c.isMesh ) c.castShadow = c.castShadow && app.tier === 'high';
			// (M11) their dash on standby: the readings drawn are yours
			if ( ( c.name === 'boat-display' || ( ! e.own && c.name === 'boat-compass' ) ) && app.instruments ) c.material = app.instruments.standby;
			// (the wheel, the rudder and the lever amidships: as yours were when copied, they stayed)
			if ( c.name === 'boat-wheel' ) c.rotation.z = 0;
			if ( c.name === 'boat-rudder' ) c.rotation.y = 0;
			if ( c.name === 'boat-throttle' ) c.rotation.x = 0;

		} );
		return t;

	}

	// one boat of this type, in the scene (hidden); null until she's built
	make( id ) {

		const app = this.app, e = this.want( id );
		if ( ! e.model ) return null;
		const model = e.model, b = this._template( e ).clone( true );
		b.name = 'PlayerBoat';
		b.visible = false;
		const u = b.userData;
		// ((v2.1.2) on a phone whatever the template has past her low meshes waits till you're near, whoever's she is now: a
		// template made while she was yours keeps all of her, and once you'd taken another out her copies (towed home in a
		// hurricane, say) drew her fittings at any distance, over low's triangles)
		if ( app.tier === 'low' ) {

			const named = new Set( lowMeshes( model ).map( ( m ) => m.name ) );
			u.extras = [];
			b.traverse( ( m ) => {

				if ( m.isMesh && ! named.has( m.name ) ) {

					u.extras.push( m );
					m.visible = false;

				}

			} );
			u.nearOn = false;

		}

		u.type = id;
		u.gen = e.gen;
		u.model = model;
		u.boatCopy = true;
		// ((M14) her own lenses, lit as her floodlights are, not as yours: a glow of her own, the same shader)
		const mats = model.materials, floodOn = u.floodOn = { value: 0 };
		if ( mats && mats.glow ) {

			const glow = u.glow = mats.createGlow.call( { navOn: mats.navOn, floodOn } );
			b.traverse( ( m ) => {

				if ( m.isMesh && m.material === mats.glow ) m.material = glow;

			} );

		}

		if ( app.lightUp ) app.lightUp( b );
		// (her radar turning and her propeller as her engine runs, as yours do: Together._spin)
		u.radar = b.getObjectByName( 'boat-radar' );
		u.prop = b.getObjectByName( 'boat-propeller' );
		u.compass = b.getObjectByName( 'boat-compass' ); // ((M15) its card to the north as she turns)
		// its own lamps (their state is theirs), its searchlight's light among the island's
		const lamps = u.lamps = new BoatLamps( model );
		lamps.addLight( app.localLights );
		b.add( lamps.group );
		app.scene.add( b );
		e.copies.add( b );
		return b;

	}

	// her name on her transom, near enough to read
	named( b, name, near ) {

		const u = b.userData, hex = fitPaint( u.dressed | 0 );
		const sign = name ? `${ name }|${ hex }` : '';
		if ( near && sign !== u.plateSign ) {

			u.plateSign = sign;
			this._plateGone( u, b );
			if ( name && u.model.lines && typeof document !== 'undefined' ) {

				u.plate = namePlate( name, u.model, hex );
				if ( u.plate ) {

					b.add( u.plate );
					if ( this.app.lightUp ) this.app.lightUp( u.plate );

				}

			}

		}

		if ( u.plate ) u.plate.visible = near;

	}

	_plateGone( u, b ) {

		if ( ! u.plate ) return;
		b.remove( u.plate );
		u.plate.geometry.dispose();
		u.plate.material.map.dispose();
		u.plate.material.dispose();
		u.plate = null;

	}

	drop( b ) {

		const app = this.app, u = b.userData, e = this.types.get( u.type );
		app.scene.remove( b );
		this._plateGone( u, b );
		const glow = b.getObjectByName( 'boat-underGlow' );
		if ( glow ) glow.material.dispose();
		u.lamps.removeLight( app.localLights );
		u.lamps.dispose();
		if ( u.glow ) u.glow.dispose();
		if ( e ) e.copies.delete( b );

	}

	// which of her this copy is out of date with (she's been swapped under it: boatChanged)
	gen( id ) {

		const e = this.types.get( id );
		return e ? e.gen : - 1;

	}

	standIn( id ) {

		let g = this._stands.get( id );
		if ( ! g ) this._stands.set( id, g = standInGeometry( id ) );
		// (the props' own program, nothing new)
		const m = this._standMaterial || ( this._standMaterial = createPropMaterial( 'boatStandIn' ) );
		if ( ! this._standLit ) {

			this._standLit = true;
			if ( this.app.lightUp ) this.app.lightUp( new Mesh( g, m ) );

		}

		const mesh = new Mesh( g, m );
		mesh.name = 'BoatStandIn';
		return mesh;

	}

	tidy( dt ) {

		for ( const [ id, e ] of this.types ) {

			if ( e.copies.size ) {

				e.idle = 0;
				continue;

			}

			e.idle += dt;
			if ( e.idle < TYPE_KEEP ) continue;
			this.types.delete( id );
			this._letGo( e );
			if ( e.model && ! e.own ) e.model.dispose();

		}

		// (nothing more of the stand-ins than a few hundred numbers; they stay)

	}

	// You've got into another boat. Copies of the one you were in keep her (true: she's not to be disposed of), and if
	// there's a built one of your new type, her copies go over to your boat and it's let go
	boatChanged( old ) {

		const was = this.types.get( old.id ), now = this.types.get( this.app.boat.id );
		let kept = false;
		if ( was && was.own ) {

			if ( was.copies.size ) {

				was.own = false;
				kept = true;

			} else {

				this._letGo( was );
				this.types.delete( old.id );

			}

		}

		if ( now && ! now.own ) {

			this._letGo( now );
			if ( now.model ) now.model.dispose();
			now.model = this.app.boat;
			now.own = true;
			now.template = null;
			now.gen ++; // (their copies are made again: Together._showBoat)

		}

		return kept;

	}

}

export const isBoat = ( id ) => typeof id === 'string' && !! BOATS[ id ];
