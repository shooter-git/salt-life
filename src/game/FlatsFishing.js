import { G } from '../core/Globals.js';
import { FLATS, flatsAt } from '../world/terrain/Flats.js';
import { flatsSchools, newFlatsState, spook, hook, forgetFlats } from './Flats.js';
import { islandTime } from './Weather.js';
import { FISH } from './FishTable.js';
import { seenTake } from './Bites.js';
import { seenOnFlats, scareOf, castScare, sightOf, knockOf, SIGHT } from './Sight.js';
import { slamDay, slamCatch, slamSlept, slamNote, slamsOf, slamToday } from './Trophies.js';

// (M17) Sight-fishing on the flats, as it's played (docs/m17/sight.md): the schools game/Flats.js has about you given to
// the fish (world/Fish.js' setSight); how plainly each shows to you (game/Sight.js: your eye's height over the water,
// the glasses, the sun, a cloud's shadow, the bottom, the wind and the rain); what tells them you're there (your speed,
// your height, your shadow, the push of water ahead of a hull, a paddle knocking it, an engine, a cast on their heads,
// the line over their backs), a school spooked bolting and the flat going quiet a while (Flats' spook); a seen fish's
// own take of a bait put to it (Bites.seenTake), beside the bites' roll; and the grand slam (Trophies.js).
// What changes is kept in Flats' small record (`state`: spooked, hooked), for the second wave to send to a guest.
//   flats.update( dt )        each frame (Game)
//   flats.landed( at, tip, bait )             a cast down on the water: what it spooked
//   flats.watch( bite, dt ) -> true while a seen fish has the bait's bite (Game.updateBite leaves it alone then)
//   flats.caught( info )      a fish landed: the slams it makes, if any (-> their note, or '')
//   flats.events              for the Guide: { on, seen, tailing, spooked (why), refused, slam }

const ACTIVE = 90; // m: schools this near you are given fish (past the farthest tier's drawing, 50 m)
const NEAR = 160; // m off the flats' window that it's all worked out at all
const EVERY = 0.5; // s between looks at where the schools are
const LOOK = 0.2; // s between a bait's looks for a fish that might see it
const CLOUD = { cell: 520, drift: 1.6 }; // a cloud's shadow over the flats: its size (m), its drift on the wind (x)
const SILT = 0.45; // the light a mud's silt sends back (stirred-up oolite and marl), half of it seen through
const _o = { x: 0, z: 0, vx: 0, vz: 0, eye: 1.6, tall: 1.8, knock: 0, engine: false, hull: false }, _school = { x: 0, z: 0, r: 2, depth: 0.5 };
const _q = { h: 1, d: 1, L: 0.5, depth: 0.5, bottom: 0.55, back: 0.15, glasses: false, sun: 1, behind: 1, shade: 0, overcast: 0, wind: 4, rain: 0, night: 0, tailUp: 0.1, sign: 1 };
const _seen = { body: 0, shadow: 0, tail: 0, sign: 0 };

// a smooth value noise in 0..1 (a cloud's shadow over the flat: no CPU copy of the sky's clouds exists)
const hash2 = ( i, j ) => {

	let h = ( Math.imul( i, 374761393 ) + Math.imul( j, 668265263 ) ) | 0;
	h = Math.imul( h ^ ( h >>> 13 ), 1274126177 );
	return ( ( h ^ ( h >>> 16 ) ) >>> 0 ) / 4294967296;

};
function vnoise( x, z ) {

	const i = Math.floor( x ), j = Math.floor( z ), fx = x - i, fz = z - j, u = fx * fx * ( 3 - 2 * fx ), v = fz * fz * ( 3 - 2 * fz );
	const a = hash2( i, j ), b = hash2( i + 1, j ), c = hash2( i, j + 1 ), d = hash2( i + 1, j + 1 );
	return a + ( b - a ) * u + ( c - a ) * v + ( a - b - c + d ) * u * v;

}

export class FlatsFishing {

	constructor( game ) {

		this.game = game;
		this.app = game.app;
		this.state = newFlatsState();
		this.schools = [];
		this.events = { on: false, seen: false, tailing: false, spooked: null, refused: false, slam: null };
		this._t = 0;
		this._lookT = 0;
		this._was = { x: 0, z: 0, has: false, vx: 0, vz: 0 };
		this._wet = false;
		this._T = null;
		this.cast = null; // { at, tried: Set of school ids, t }
		this.follow = null; // { g, k, id, kind, act, t, L, bite }
		this.bottoms = new Map(); // school id -> the bottom's albedo under it, worked out once a while
		this._seenAt = ( x, z, kind ) => this.seenAt( x, z, kind );

	}

	get fish() {

		return this.app.fish;

	}

	// the island's time now (hours since day 1 began)
	get T() {

		const s = this.app.settings;
		return islandTime( s.day, s.timeOfDay );

	}

	// a cloud's shadow at ( x, z ), 0..1: the sky's cover, drifting on the wind (as the clouds' own shadows on high)
	shadeAt( x, z ) {

		const sky = this.app.sky, cover = sky && sky.clouds && sky.clouds.coverage ? sky.clouds.coverage.value : 0.3;
		if ( cover <= 0.02 ) return 0;
		const w = G.windDir.value, t = G.time.value * Math.max( 2, G.windSpeed.value ) * CLOUD.drift;
		const n = vnoise( ( x - w.x * t ) / CLOUD.cell, ( z - w.y * t ) / CLOUD.cell ) * 0.7 + vnoise( ( x - w.x * t ) / ( CLOUD.cell * 0.37 ) + 17, ( z - w.y * t ) / ( CLOUD.cell * 0.37 ) ) * 0.3;
		const edge = 1 - Math.min( 0.98, cover );
		const k = Math.min( 1, Math.max( 0, ( n - edge + 0.06 ) / 0.12 ) );
		return k * k * ( 3 - 2 * k );

	}

	// the bottom's albedo at ( x, z ): white sand, turtle grass, the creeks' darker water
	bottomAt( x, z ) {

		const f = flatsAt( x, z ), B = SIGHT.bottom;
		if ( f.on < 0.2 ) return B.sand * 0.7;
		return ( B.sand + ( B.grass - B.sand ) * f.grass ) * ( 1 - 0.45 * f.creek );

	}

	// the conditions of seeing: _q filled for a look from the camera at ( x, z ) at a fish `L` long of this kind
	_look( x, z, L, kind, depth, bottom ) {

		const c = this.app.camera.position, sun = G.sunDir.value, w = this.game.weatherNow;
		const dx = x - c.x, dz = z - c.z, d = Math.hypot( dx, dz ) || 1, sf = Math.hypot( sun.x, sun.z ) || 1;
		const S = sightOf( kind );
		_q.h = c.y - G.seaLevel.value;
		_q.d = d;
		_q.L = L;
		_q.depth = depth;
		_q.bottom = bottom;
		_q.back = S ? S.back : 0.15;
		_q.glasses = !! this.game.state.stats.polarized;
		_q.sun = sun.y;
		_q.behind = ( dx * - sun.x + dz * - sun.z ) / ( d * sf );
		_q.shade = this.shadeAt( x, z );
		_q.overcast = w ? w.overcast || 0 : 0;
		_q.wind = G.windSpeed.value;
		_q.rain = G.rain.value;
		_q.night = G.night.value;
		return _q;

	}

	// how plainly a mark at ( x, z ) shows: a mud (a few metres of milky silt), or a ring on the water (as a tail)
	seenAt( x, z, kind ) {

		if ( G.cameraUnderwater.value > 0.5 ) return 0.6;
		const q = this._look( x, z, kind === 'mud' ? 2.5 : 0.5, 'bonefish', 0.5, this.bottomAt( x, z ) );
		// (a mud's milky silt against the bottom it's over: plain over dark grass, hardly there over white sand)
		q.back = kind === 'mud' ? Math.min( 2, Math.abs( SILT - q.bottom ) / q.bottom * 0.5 ) : 0.3;
		q.tailUp = 0.1;
		const v = seenOnFlats( q, _seen );
		return kind === 'mud' ? v.body : v.tail;

	}

	// on or near the flats (their window and a margin)
	near( x, z ) {

		const [ x0, z0, x1, z1 ] = FLATS.window;
		return x > x0 - NEAR && x < x1 + NEAR && z > z0 - NEAR && z < z1 + NEAR;

	}

	update( dt ) {

		const fish = this.fish, app = this.app, c = app.camera.position;
		if ( ! fish || ! fish.sightGroups || ! fish.sightGroups.length ) return;
		fish.sightSeenAt = this._seenAt;
		const T = this.T;
		// (a jump of the clock: a rest or a sleep, which ends the island day for the slams)
		if ( this._T !== null && T - this._T > 1.5 ) slamSlept( this.game.state );
		this._T = T;
		const near = this.near( c.x, c.z );
		if ( ( this._t -= dt ) <= 0 ) {

			this._t = EVERY;
			this.events.on = near && flatsAt( c.x, c.z ).on > 0.5 && G.night.value < 0.5;
			this.schools.length = 0;
			if ( near ) {

				const w = this.game.weatherNow;
				for ( const q of flatsSchools( T, { wind: G.windSpeed.value, overcast: w ? w.overcast || 0 : 0, hour: app.settings.timeOfDay }, this.state ) ) {

					const d = Math.hypot( q.x - c.x, q.z - c.z );
					if ( d < ACTIVE ) this.schools.push( { ...q, d } );

				}

				this.schools.sort( ( a, b ) => a.d - b.d );

			}

			fish.setSight( this.schools );
			if ( Math.random() < 0.02 ) forgetFlats( this.state, T );

		}

		if ( ! near ) return;
		this._observer( dt );
		const sun = G.sunDir.value, sea = G.seaLevel.value;
		const cond = { wind: G.windSpeed.value, shade: this.shadeAt( c.x, c.z ) };
		for ( const g of fish.sightGroups ) {

			const S = g.sight;
			if ( ! S || ! g.active ) continue;
			const x = g.center.x, z = g.center.z, L = ( g.sp.length[ 0 ] + g.sp.length[ 1 ] ) / 2;
			const depth = Math.max( 0, sea - app.terrainData.heightAt( x, z ) );
			let bottom = this.bottoms.get( S.id );
			if ( bottom === undefined || Math.random() < dt / 2 ) this.bottoms.set( S.id, bottom = this.bottomAt( x, z ) );
			// how plainly it shows
			const v = seenOnFlats( this._look( x, z, L, S.kind, depth, bottom ), _seen ), o = S.seen;
			o.body = v.body;
			o.shadow = v.shadow;
			o.tail = v.tail;
			o.sign = v.sign;
			if ( ! this.events.seen && S.life > 0.5 && Math.max( v.body, v.shadow ) > 0.5 && Math.hypot( x - c.x, z - c.z ) < fish.sightRange ) this.events.seen = S.kind;
			if ( ! this.events.tailing && S.mode === 'tail' && v.tail > 0.5 && Math.hypot( x - c.x, z - c.z ) < fish.sightRange ) this.events.tailing = true;
			// what tells it you're there
			if ( S.bolt > 0 ) continue;
			_school.x = x;
			_school.z = z;
			_school.r = Math.max( 0.5, g.radius - 2 );
			_school.depth = depth;
			const why = scareOf( S.kind, _school, _o, sun.y > 0 ? sun : null, cond );
			if ( why ) this.spooked( g, why, c.x, c.z );

		}

	}

	// who's looking, as the fish take them: where, how fast over the ground, how high, a hull or not, a paddle's knock,
	// an engine running
	_observer( dt ) {

		const app = this.app, p = app.player, c = app.camera.position, W = this._was, b = app.boatCtl;
		if ( W.has && dt > 0 ) {

			const k = 1 - Math.exp( - dt * 4 );
			W.vx += ( Math.max( - 8, Math.min( 8, ( c.x - W.x ) / dt ) ) - W.vx ) * k;
			W.vz += ( Math.max( - 8, Math.min( 8, ( c.z - W.z ) / dt ) ) - W.vz ) * k;

		}

		W.x = c.x;
		W.z = c.z;
		W.has = true;
		const aboard = p.mode === 'boat' || p.mode === 'deck';
		_o.x = c.x;
		_o.z = c.z;
		_o.vx = W.vx;
		_o.vz = W.vz;
		_o.eye = c.y - G.seaLevel.value;
		_o.tall = Math.max( 0.3, _o.eye + 0.15 );
		_o.hull = aboard;
		_o.knock = 0;
		_o.engine = false;
		if ( aboard && b ) {

			const m = b.model, st = m && m.stroke;
			if ( st ) {

				// (a paddle stroke's catch: now and then the shaft knocks the gunwale, the harder the stroke the oftener)
				if ( st.wet && ! this._wet && Math.random() < knockOf( Math.min( 1, Math.max( 0, ( 1.75 - st.T ) / 1.01 ) ) ) ) _o.knock = 1;
				this._wet = st.wet;

			} else _o.engine = !! ( b.engineOn && b.driven && b.rpm > 0.03 );

		}

	}

	// a school frightened: it bolts, and it's gone from the flat a while (Flats' spook, kept for a guest)
	spooked( g, why, x, z ) {

		const S = g.sight;
		if ( ! S || S.bolt > 0 ) return;
		spook( this.state, S.id, this.T );
		this.fish.sightBolt( g, x, z );
		if ( why !== 'hooked' ) this.events.spooked = why;
		if ( this.follow && this.follow.g === g ) this._endFollow( 'spook' );
		if ( this.app.audio && this.app.audio.fishSplash && S.n > 0 ) this.app.audio.fishSplash( { x: g.center.x, y: G.seaLevel.value, z: g.center.z }, 0.25 );

	}

	// a cast down on the water at `at`, the line laid from the rod's tip: on any fish's head, or over its back, its
	// school bolts. Then the bait's looked at by the fish as they come on (watch)
	landed( at, tip, bait ) {

		const fish = this.fish;
		this.cast = null;
		if ( ! fish || ! this.near( at.x, at.z ) ) return;
		for ( const g of fish.sightGroups ) {

			const S = g.sight;
			if ( ! S || ! g.active || S.bolt > 0 || Math.hypot( g.center.x - at.x, g.center.z - at.z ) > 14 + g.radius ) continue;
			let why = null;
			fish.sightFish( g, ( i ) => {

				why = why || castScare( S.kind, fish.pos[ i * 3 ], fish.pos[ i * 3 + 2 ], at, tip, bait );

			} );
			if ( why ) this.spooked( g, why, at.x, at.z );

		}

		this.cast = { at: { x: at.x, z: at.z }, bait, tried: new Set(), t: 0 };

	}

	// the bait in the water: a seen fish that sees it turns to it, follows, and eats it, refuses it or spooks. While one's
	// on its way to it the bite's its (true); its take turns the bite to one that's struck as any other
	watch( bite, dt ) {

		const fish = this.fish, rod = this.game.rod;
		if ( this.follow ) {

			const F = this.follow;
			if ( F.bite !== bite || rod.state !== 'floating' ) {

				this._endFollow( 'refuse' );
				return false;

			}

			fish.sightFollow( F.g, F.k, rod.bobber.x, rod.bobber.z, F.speed, F.act === 'eat' );
			if ( ( F.t -= dt ) > 0 ) return true;
			// (not there yet, it's a little longer coming; one that can't get to it, over sand too shallow, gives it up)
			const i = F.g.offset + F.k, off = Math.hypot( fish.pos[ i * 3 ] - rod.bobber.x, fish.pos[ i * 3 + 2 ] - rod.bobber.z );
			if ( F.act === 'eat' && off > F.L * 1.2 ) {

				if ( ( F.late = ( F.late || 0 ) + dt ) < 3 ) return true;
				F.act = 'refuse';

			}

			return this._take( bite );

		}

		if ( ! this.cast || ! fish || ! bite || bite.phase !== 'wait' || rod.state !== 'floating' ) return false;
		if ( ( this._lookT -= dt ) > 0 ) return false;
		this._lookT = LOOK;
		const bx = rod.bobber.x, bz = rod.bobber.z;
		if ( ! this.near( bx, bz ) ) return false;
		for ( const g of fish.sightGroups ) {

			const S = g.sight;
			if ( ! S || ! g.active || S.bolt > 0 || this.cast.tried.has( S.id ) || Math.hypot( g.center.x - bx, g.center.z - bz ) > 9 + g.radius ) continue;
			// (the first of the school whose way it's in)
			let best = null;
			fish.sightFish( g, ( i, k ) => {

				if ( best ) return;
				const L = fish.size[ i ], hx = fish.head[ i * 3 ], hz = fish.head[ i * 3 + 2 ], hl = Math.hypot( hx, hz ) || 1;
				const nx = fish.pos[ i * 3 ] + hx / hl * L * 0.5, nz = fish.pos[ i * 3 + 2 ] + hz / hl * L * 0.5;
				const ex = bx - nx, ez = bz - nz, ahead = ( ex * hx + ez * hz ) / hl, side = ( ex * hz - ez * hx ) / hl;
				const r = seenTake( S.kind, this.cast.bait, { ahead, side, mode: S.mode } );
				if ( r.unseen ) return;
				best = { i, k, L, r };

			} );
			if ( ! best ) continue;
			this.cast.tried.add( S.id );
			const r = best.r;
			if ( r.act === 'none' ) continue;
			if ( r.act === 'spook' && ! r.after ) {

				this.spooked( g, 'cast', bx, bz );
				continue;

			}

			// it turns to it and comes on
			const sp = sightOf( S.kind ).speed;
			this.follow = { g, k: best.k, id: S.id, kind: S.kind, act: r.act, t: r.t, L: best.L, speed: sp, bite };
			fish.sightFollow( g, best.k, bx, bz, sp, r.act === 'eat' );
			return true;

		}

		return false;

	}

	// the follow over: eaten (the bite's its, to strike), refused, or spooked at the last
	_take( bite ) {

		const F = this.follow, game = this.game, rod = game.rod;
		if ( F.act !== 'eat' ) {

			this._endFollow( F.act );
			return false;

		}

		this.follow = null;
		const S = sightOf( F.kind );
		this.fish.sightFollowEnd( F.g, 'eat' );
		hook( this.state, F.id );
		this.spooked( F.g, 'hooked', rod.bobber.x, rod.bobber.z );
		if ( S.bites ) {

			// (a shark: it takes the bait and the line's through its teeth)
			game.toast( `A ${ F.kind === 'lemonShark' ? 'lemon shark' : 'blacktip' } took it and bit through the line · tying on a new hook`, 3200 );
			if ( this.app.audio && this.app.audio.lineSnap ) this.app.audio.lineSnap();
			rod.snap();
			game.bite = null;
			game.hookBait = null;
			return true;

		}

		// the fish you saw, on: its weight from its length (its kind's relation), as the speargun's are
		const f = FISH[ F.kind ], cm = F.L * 100, kg = Math.min( f.kg[ 1 ], Math.max( f.kg[ 0 ], f.lw[ 0 ] * cm ** f.lw[ 1 ] / 1000 ) );
		bite.species = F.kind;
		bite.kg = kg;
		bite.place = game.placeAt( rod.bobber.x, rod.bobber.z );
		bite.at = { x: rod.bobber.x, z: rod.bobber.z };
		bite.phase = 'take';
		bite.seen = true;
		bite.t = 2.4 - f.fight * 0.5;
		if ( this.app.audio && this.app.audio.fishSplash ) this.app.audio.fishSplash( rod.bobber, 0.35 );
		this.cast = null;
		return true;

	}

	_endFollow( act ) {

		const F = this.follow;
		if ( ! F ) return;
		this.follow = null;
		this.fish.sightFollowEnd( F.g, act, this.game.rod.bobber.x, this.game.rod.bobber.z );
		if ( act === 'spook' ) {

			spook( this.state, F.id, this.T );
			this.events.spooked = 'refused';

		} else this.events.refused = F.kind;

	}

	// a fish caught or let go: the slams it makes today, kept as trophies (-> what's told of them, or '')
	caught( info ) {

		if ( ! slamsOf( info.species ).length ) return '';
		const s = this.app.settings, done = slamCatch( this.game.state, info, slamDay( s.day, s.timeOfDay ) );
		this.events.slam = done.length ? done : slamToday( this.game.state, slamDay( s.day, s.timeOfDay ) ).grand;
		return done.length ? slamNote( done ) : '';

	}

}
