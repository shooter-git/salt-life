import { Vector3 } from '../engine/index.js';
import { RigMesh } from '../game/rigs/RigMesh.js';
import { G } from '../core/Globals.js';
import { fitStats } from './BoatCopies.js';

// (M16) What someone's got out of their boat, on everyone else's game: their spread of rods and lines, their kite, and for someone
// riding along, the rod that's gone off, to take. In the pose: a few numbers a line (spreadWire), the kite's place (kiteWire). The
// fish, its bait and how much line's on the rod come when you take it ('rod', 'rodIs': Together). One draw for all of it,
// nothing until someone's lines are out, and drawn only with her copy.
//   spreadWire( lines ) -> [ code, len, on, ... ]   kiteWire( kite ) -> [ x, y, z ] | undefined
//   const s = new Spread( app );  s.update( others )   s.alert( reachKey ) -> a prompt   s.take() -> whether you've asked for the rod
const KINDS = [ 'flat', 'rigger', 'shotgun' ], ROD_LONG = 2.2, REACH = 3.6, MOST = 8;

export const lineCode = ( spot ) => KINDS.indexOf( spot.kind ) * 3 + ( spot.side || 0 ) + 1;
export const spreadWire = ( lines ) => lines.length ? lines.filter( ( L ) => ! L.in ).slice( 0, MOST ).flatMap( ( L ) => [ lineCode( L.spot ), Math.round( L.len ), L.on ? 1 : 0 ] ) : undefined;
// (and coming down, a fish on or the wind gone, till it's in: it doesn't vanish on everyone else's as it starts)
export const kiteWire = ( K ) => K && ( ! K.down || K.up > 0 ) ? [ K.at.x, K.at.y, K.at.z ].map( ( v ) => Math.round( v * 10 ) / 10 ) : undefined;
export function readSpread( rl ) {

	if ( ! Array.isArray( rl ) || rl.length % 3 || rl.length > MOST * 3 || ! rl.every( Number.isFinite ) ) return null;
	const out = [];
	for ( let i = 0; i < rl.length; i += 3 ) {

		const code = rl[ i ] | 0, kind = KINDS[ Math.floor( code / 3 ) ];
		if ( kind ) out.push( { code, kind, side: code % 3 - 1, len: Math.max( 0, Math.min( 2000, rl[ i + 1 ] ) ), on: rl[ i + 2 ] === 1 } );

	}

	return out;

}

// a rod's butt, tip and any outrigger's clip, boat frame
const _lean = new Vector3();
export function rodOf( M, line, out ) {

	const S = M.lines, side = line.side || 1, kind = line.kind;
	const mine = M.rodHolders ? M.rodHolders.filter( ( h ) => Math.sign( h.x ) === side ).sort( ( x, y ) => x.z - y.z ) : [];
	const held = mine[ Math.min( mine.length - 1, kind === 'flat' ? 0 : kind === 'rigger' ? 1 : 2 ) ];
	if ( held ) out.butt.copy( held );
	else if ( kind === 'shotgun' ) out.butt.set( 0, S.sheerY( 0 ) + 2.2, S.zAft + 2 );
	else {

		const z = S.zAft + ( kind === 'rigger' ? 1.5 : 0.4 ), t = S.tAtSheerZ( z );
		out.butt.set( side * ( S.sheerX( t ) - 0.12 ), S.sheerY( t ), z );

	}

	_lean.set( ( kind === 'shotgun' ? 0 : side ) * 0.45, 0.72, - 0.53 ).normalize();
	out.tip.copy( out.butt ).addScaledVector( _lean, ROD_LONG );
	out.hasClip = false;
	const tips = M.outriggerTips;
	if ( kind === 'rigger' && ! line.on && tips && M.fitted && M.fitted.outriggers !== false ) {

		out.clip.copy( tips.find( ( t ) => Math.sign( t.x ) === side ) || tips[ 0 ] );
		out.hasClip = true;

	}

	return out;

}

const R = { butt: new Vector3(), tip: new Vector3(), clip: new Vector3(), hasClip: false };
const _b = new Vector3(), _t = new Vector3(), _c = new Vector3(), _p = new Vector3(), _m = new Vector3(), _a = new Vector3(), _d = new Vector3(), _up = new Vector3( 0, 1, 0 );

export class Spread {

	constructor( app, together ) {

		this.app = app;
		this.together = together;
		this.draw = null;

	}

	// the boat a kite's flown off: theirs, or (guest work) the one they're riding, yours among them -> { M, f } (f: its frame,
	// an Object3D or your boat's controller), or null if she's not drawn here
	_kiteBoat( o, others ) {

		const c = o.cur, T = this.together;
		if ( c.ride === T.me.id ) {

			const app = this.app;
			return app.boat && app.boat.lines ? { M: app.boat, f: null } : null;

		}

		const r = c.ride ? others.get( c.ride ) : o;
		if ( ! r || ! r.cur || ! r.boat || ! r.boat.visible ) return null;
		return { M: T.copies.walked( r.boat.userData.model, r.cur.boatId, r.cur.fit ), f: r.boat };

	}

	update( others ) {

		let any = false;
		for ( const o of others.values() ) if ( o.cur && ( ( o.boat && o.boat.visible && o.cur.spread ) || ( o.cur.kite && this._kiteBoat( o, others ) ) ) ) any = true;
		if ( ! any ) {

			if ( this.draw ) this.draw.hide();
			return;

		}

		const D = this.draw = this.draw || new RigMesh( this.app.scene ), waves = this.app.waves;
		D.begin( this.app.camera );
		for ( const o of others.values() ) {

			const c = o.cur;
			if ( ! c ) continue;
			const k = c.kite ? this._kiteBoat( o, others ) : null;
			if ( k && k.M.lines ) {

				const S = k.M.lines;
				_b.set( 0, S.sheerY( 0 ) + 1.8, S.zAft );
				if ( k.f ) {

					k.f.updateWorldMatrix( false, false );
					k.f.localToWorld( _b );

				} else this.app.boatCtl.toWorld( _b.clone(), _b );
				this._kite( D, c.kite );

			}

			if ( ! o.boat || ! o.boat.visible || ! c.spread ) continue;
			const M = this.together.copies.walked( o.boat.userData.model, c.boatId, c.fit ), f = o.boat;
			f.updateWorldMatrix( false, false );
			if ( M.lines ) for ( const L of c.spread ) {

				rodOf( M, L, R );
				f.localToWorld( _b.copy( R.butt ) );
				f.localToWorld( _t.copy( R.tip ) );
				D.tube( [ _b.clone(), _t.clone() ], [ 0.016, 0.004 ], 0x20242a, 0.4, 0.1 );
				const from = R.hasClip ? f.localToWorld( _c.copy( R.clip ) ) : _t;
				if ( R.hasClip ) D.line( _t, _m.copy( _t ).lerp( from, 0.5 ), from, 4 );
				// (astern of her by what's out, a little to its side, on the water)
				f.localToWorld( _p.set( from === _t ? R.tip.x : R.clip.x, 0, ( from === _t ? R.tip.z : R.clip.z ) - L.len ) );
				_p.y = waves ? waves.heightAt( _p.x, _p.z ) : G.seaLevel.value;
				D.line( from, _m.copy( from ).lerp( _p, 0.5 ).setY( ( from.y + _p.y ) / 2 - ( L.on ? 0 : 0.015 * L.len ) ), _p, 12 );

			}

			// ((M19) her teasers, if she has them: her fit's fourth bit)
			if ( c.spread.length && c.boatId === 'sportfisher' && fitStats( 'sportfisher', c.fit | 0 ).teasers ) D.teasers( M, ( l, out ) => f.localToWorld( out.copy( l ) ), ( x, z ) => ( waves ? waves.heightAt( x, z ) : G.seaLevel.value ) );

		}

		D.end();

	}

	// a kite on its line from _b (world, her stern), at kt: [ x, y, z ]
	_kite( D, kt ) {

		_a.set( kt[ 0 ], kt[ 1 ], kt[ 2 ] );
		D.line( _b, _m.copy( _b ).lerp( _a, 0.5 ).setY( ( _b.y + _a.y ) * 0.5 - 2.5 ), _a, 12, 0xe7e7e0 );
		const s = 0.55 * Math.max( 1, _a.distanceTo( D.eye ) / 60 );
		_d.set( s, 0, 0 );
		const T = _a.clone().add( _m.set( 0, s, 0 ) ), Bt = _a.clone().sub( _m ), Rt = _a.clone().add( _d ), Lf = _a.clone().sub( _d );
		D.fan( [ _a.clone(), T, Lf ], _up, 0xeeece2, 0.75, true );
		D.fan( [ _a.clone(), Lf, Bt ], _up, 0xdedcd0, 0.75, true );
		D.fan( [ _a.clone(), Bt, Rt ], _up, 0xeeece2, 0.75, true );
		D.fan( [ _a.clone(), Rt, T ], _up, 0xdedcd0, 0.75, true );

	}

	// the rod that's gone off on the boat you're riding, and whether it's in reach
	_theirs() {

		const p = this.app.player, o = p.riding ? this.together.others.get( p.boat.owner ) : null;
		const L = o && o.cur && o.cur.spread && o.cur.spread.find( ( x ) => x.on );
		if ( ! L || p.mode !== 'deck' || this.app.game.fight ) return null;
		rodOf( p.boat.model, L, R );
		return { o, L, near: p.deckPos.distanceTo( R.butt ) < REACH };

	}

	alert( far ) {

		const t = this._theirs();
		if ( ! t ) return null;
		return t.near ? { key: 'R', text: `Take ${ t.o.person.name }'s rod` } : { key: far, text: 'A rod\'s gone off! Get to it' };

	}

	take() {

		const t = this._theirs();
		if ( ! t || ! t.near ) return false;
		this.together.session.send( 'rod', { to: t.o.person.id, c: t.L.code } );
		return true;

	}

}
