#!/usr/bin/env node
// (M21) Stream GEAR's rods and reels, seen (docs/m21/gear.md): each rod and reel the game draws (rigs/GearModels.js), in your
// hands and standing in the sportfisher's holders, out in the blue water off the west side, drawn on the CPU (Chromium on
// SwiftShader, from All the Spaces' Playwright) into <out>/<tier>/:
//   <model>-hand.png   in first person, as you hold it
//   <model>-reel.png   its reel close, from the side its handle's on (the crank turned, a spinning reel's bail open)
//   <model>-rod.png    the whole rod from the side, a fish on it (bent toward the line)
//   <model>-holder.png the big outfits and two light ones standing in her aft holders, close; <model>-spread.png, both sides
// and a figures.json: each model's triangles, the draw calls of a frame with it, the program count.
//
//   a dev server on LOOK_PORT (5241), then
//   node tools/gear/rods.mjs <out> [tier] [only: model names, comma separated] [shots: hand,reel,rod,holder,spread]
//   (ALL_THE_SPACES: its checkout, if it isn't ../all-the-spaces. Don't edit src while it runs.)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath( new URL( '../..', import.meta.url ) );
const ATS = process.env.ALL_THE_SPACES || join( ROOT, '../all-the-spaces' );
const [ OUTDIR = join( ROOT, 'qa-output/rods' ), TIER = 'mid', ONLY = '', SHOTS = '' ] = process.argv.slice( 2 );
const PORT = process.env.LOOK_PORT || 5241;
const OUT = join( OUTDIR, TIER );
mkdirSync( OUT, { recursive: true } );
const T0 = Date.now();
const log = ( ...a ) => console.log( `[${ ( ( Date.now() - T0 ) / 1000 ).toFixed( 0 ) } s]`, ...a );
const SEA = { x: - 2600, z: 3000 };
// the models: a name, the rod, reel and line (GearModels' ids), and whether it's shown in a holder
const MODELS = [
	[ 'glass-old', 0, 0, 0, true ], [ 'graphite-smooth', 1, 1, 1, true ], [ 'surf-smooth', 2, 1, 2 ], [ 'surf-conv', 2, 2, 2, true ],
	[ 'glass-conv', 0, 2, 1 ], [ 'standup-50', 3, 3, 3, true ], [ 'standup-80', 3, 4, 4, true ], [ 'chair-130', 4, 5, 5, true ],
	[ 'standup-electric', 3, 6, 3 ], [ 'fly-8', 5, 7, 6 ], [ 'fly-10', 6, 8, 6 ], [ 'fly-12', 7, 9, 6 ], [ 'standup-smooth', 3, 1, 2 ],
].filter( ( m ) => ! ONLY || ONLY.split( ',' ).includes( m[ 0 ] ) );

const { chromium } = await import( join( ATS, 'node_modules/playwright/index.mjs' ) );
const browser = await chromium.launch( { args: [ '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist' ] } );
const page = await browser.newPage( { viewport: { width: 960, height: 540 } } );
page.setDefaultTimeout( 900000 );
const errors = [];
page.on( 'pageerror', ( e ) => errors.push( e.message ) );
page.on( 'console', ( m ) => m.type() === 'error' && errors.push( m.text() ) );
await page.addInitScript( () => {

	const R = window.__draws = { calls: 0 }, P = WebGL2RenderingContext.prototype;
	for ( const k of [ 'drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced', 'drawRangeElements' ] ) {

		const f = P[ k ];
		P[ k ] = function ( ...a ) {

			R.calls ++;
			return f.apply( this, a );

		};

	}

} );
await page.goto( `http://127.0.0.1:${ PORT }/?tier=${ TIER }&weather=calm&hour=11&boat=sportfisher&fullsea` );
await page.waitForFunction( () => window.__app && window.__app._started && window.__app.game, null, { timeout: 900000 } );
// (on a device that draws on its CPU the rod waits out of the scene till its program's made after the start: App.prepareLate)
await page.waitForFunction( () => ! window.__app.game.rod.holdBack, null, { timeout: 900000 } );
log( 'started' );
const programs0 = await page.evaluate( () => window.__app.renderer.info.programs.length );

await page.evaluate( async ( SEA ) => {

	const a = window.__app, g = a.game, p = a.player, b = a.boatCtl, rod = g.rod, rigs = g.rigs;
	const url = performance.getEntriesByType( 'resource' ).map( ( e ) => e.name ).filter( ( u ) => /\/src\/core\/Globals\.js(\?|$)/.test( u ) ).pop() || '/src/core/Globals.js';
	const { G } = await import( url );
	if ( a.together ) a.together.syncClock = () => {};
	setInterval( () => {

		a.settings.timeSpeed = 0;
		a.settings.timeOfDay = 11;

	}, 300 );
	if ( g.guide ) {

		g.guide.seen.intro = true;
		if ( g.guide.open ) g.guide.close();
		g.guide._wait = - 1;

	}

	const css = document.createElement( 'style' );
	css.textContent = 'body * { visibility: hidden !important; } canvas { visibility: visible !important; }';
	document.head.appendChild( css );
	// out at sea on her deck, by her aft holders, still
	b.moored = b.beached = false;
	b.anchor = null;
	if ( a.boat.sliding ) a.boat.sliding = null;
	b.position.set( SEA.x, b.position.y, SEA.z );
	b.velocity.set( 0, 0, 0 );
	if ( p.mode !== 'deck' ) p.boardBoat();
	// (the tool says what's in your hands, not the game's tackle)
	rigs._gearNow = () => {};
	const L = window.__look = { gear: null, shot: null, spread: false };
	const M = a.boat;
	window.__R = { rod, rigs, G };
	// each frame, after the game's own: her deck, your rod, her lines
	const up = p.update.bind( p );
	p.update = function ( dt, ...r ) {

		const out = up( dt, ...r );
		p.deckPos.set( 0.2, M.lines.deckY ?? p.deckPos.y, - 3.2 );
		p.deckVel.set( 0, 0, 0 );
		p.deckYaw = Math.PI * 0.85;
		p.pitch = - 0.12;
		b.velocity.set( 0, 0, 0 );
		b.position.x = SEA.x;
		b.position.z = SEA.z;
		return out;

	};

	// (and the game's own gear, put on the rod as its state changes, doesn't take the asked model off it)
	const sg = rod.setGear.bind( rod );
	rod.setGear = ( o ) => sg( L.gear && ! L.spread ? { ...o, model: L.gear } : o );
	const ru = rod.update.bind( rod );
	rod.update = function ( dt, o ) {

		if ( L.gear && L.shot !== 'holder' && L.shot !== 'spread' ) {

			if ( ! rod.equipped ) rod.equip( true );
			rod.setModel( L.gear );
			o = { ...o, visible: true };

		}

		const r = ru( dt, o );
		if ( L.gear && ( L.shot === 'reel' || L.shot === 'rod' ) ) {

			// the crank turned, a spinning reel's bail open and its spool out, the line half off; a fish on, for the whole rod
			const U = rod.rodMat.uniforms;
			U.reelAnim.value.set( 0.9, L.shot === 'reel' ? 1 : 0, 1.3, rod.fit.kind === 'spin' ? 0.3 : - 1.1 );
			U.reelAnim2.value.set( 0.003, L.shot === 'reel' ? 0.75 : 1, 0, 0 );
			U.rodBend.value.set( 0, 0, rod.big ? 1 : - 1, L.shot === 'rod' ? 0.22 : 0 );
			U.rodShape.value.x = 2;

		}

		return r;

	};

	// her spread: a line out on each aft holder, the port one with a fish on
	const lines = () => {

		const spots = rigs.spots();
		if ( rigs.lines.length ) return;
		for ( const s of spots.slice( 0, 2 ) ) {

			const V = rod.tip.constructor, Ln = { spot: s, bait: null, leader: 0, len: 30, p: new V(), tip: new V(), clip: null, butt: new V(), on: null, in: false, torn: 0, bend: 0 };
			rigs._place( Ln );
			Ln.p.copy( Ln.tip );
			Ln.p.x += ( s.side || 0 ) * 6;
			rigs.lines.push( Ln );

		}

	};

	const ru2 = rigs.update.bind( rigs ), rl = rigs.updateLines.bind( rigs );
	rigs.update = function ( dt, o ) {

		if ( L.spread ) {

			lines();
			rigs.spreadGear = L.gear;

		}

		return ru2( dt, o );

	};

	rigs.updateLines = function ( dt ) {

		const r = rl( dt );
		if ( L.spread ) for ( const Ln of rigs.lines ) {

			Ln.len = 30;
			if ( Ln.spot.side === 1 ) {

				Ln.on = Ln.on || { species: 'wahoo', kg: 20, t: 0, place: 'blue', at: { x: 0, z: 0 } };
				Ln.on.t = 0;
				Ln.bend = 0.26;

			}

		}

		return r;

	};

	rigs._onRod = () => {};
	// the camera, put just before the frame's drawn
	const proto = Object.getPrototypeOf( a ), dw = proto.drawWorld;
	const V = rod.tip.constructor, _p = new V(), _q = new V(), _x = new V(), _y = new V(), _z = new V();
	proto.drawWorld = function ( ...args ) {

		const c = this.camera, S = L.shot;
		if ( S === 'reel' || S === 'rod' ) {

			const m = rod.rodMesh.matrix, f = rod.fit;
			_x.setFromMatrixColumn( m, 0 ).normalize();
			_y.setFromMatrixColumn( m, 1 ).normalize();
			_z.setFromMatrixColumn( m, 2 ).normalize();
			if ( S === 'reel' ) {

				// (from the handle's side: a spinning or fly reel's on the left, -X; a drum's on +X, which the turned-over frame puts
				// on the left too)
				const ax = f.reelAxis, side = f.kind === 'drum' ? 1 : - 1, R = Math.abs( ax[ 1 ] ) + 0.03;
				_p.set( 0, ax[ 0 ] - 0.02, ax[ 1 ] * 0.75 ).applyMatrix4( m );
				c.position.copy( _p ).addScaledVector( _x, side * ( 0.1 + R * 1.05 ) ).addScaledVector( _y, 0.04 + R * 0.35 ).addScaledVector( _z, ( rod.big ? - 1 : 1 ) * ( 0.03 + R * 0.2 ) );
				c.up.copy( _z ).multiplyScalar( rod.big ? - 1 : 1 );
				c.lookAt( _p );

			} else {

				_p.set( 0, f.L * 0.5, 0 ).applyMatrix4( m );
				c.position.copy( _p ).addScaledVector( _x, - f.L * 0.62 ).addScaledVector( _z, ( rod.big ? - 1 : 1 ) * 0.2 );
				c.up.set( 0, 1, 0 );
				c.lookAt( _p );

			}

			c.updateMatrixWorld();

		} else if ( S === 'holder' || S === 'spread' ) {

			// (close: the rod with a fish on, from inboard of it; the spread: both aft holders from over her stern)
			const H = rigs.holders ? rigs.holders.meshes.filter( ( h ) => h.visible ) : [];
			if ( H.length ) {

				const one = H[ H.length - 1 ], f = one.userData.model.fit, aft = _y.set( 0, 0, - 1 ).applyQuaternion( b.quaternion );
				_p.set( 0, f.seatY + 0.2, 0 ).applyMatrix4( one.matrix );
				b.toWorld( _q.set( 0, 0, - 4 ), _q );
				_q.sub( _p ).setY( 0 ).normalize(); // (toward her middle)
				if ( S === 'holder' ) {

					c.position.copy( _p ).addScaledVector( _q, 0.95 ).addScaledVector( aft, - 0.35 ).add( _x.set( 0, 0.3, 0 ) );
					c.lookAt( _p.clone().add( _x.set( 0, 0.25, 0 ) ) );

				} else {

					_p.set( 0, 0, 0 );
					for ( const h of H ) _p.add( _x.set( 0, h.userData.model.fit.seatY, 0 ).applyMatrix4( h.matrix ) );
					_p.multiplyScalar( 1 / H.length );
					c.position.copy( _p ).addScaledVector( aft, 3.4 ).add( _x.set( 0, 1.9, 0 ) );
					c.lookAt( _p.clone().add( _x.set( 0, 0.5, 0 ) ) );

				}

				c.up.set( 0, 1, 0 );
				c.updateMatrixWorld();

			}

		}

		if ( S && S !== 'hand' ) {

			this.water.update( c );
			if ( this.terrain && this.terrain.update ) this.terrain.update( c );

		}

		// (the draw calls of this frame's world)
		const c0 = window.__draws.calls, r = dw.apply( this, args );
		window.__draws.frame = window.__draws.calls - c0;
		window.__draws.n = ( window.__draws.n || 0 ) + 1;
		return r;

	};

}, SEA );
await page.waitForTimeout( 3000 );

// n of the game's own frames drawn (on the CPU they're far fewer than the browser's)
const frames = ( n ) => page.evaluate( ( n ) => new Promise( ( done ) => {

	const D = window.__draws, to = ( D.n || 0 ) + n;
	const step = () => ( ( D.n || 0 ) >= to ? done() : requestAnimationFrame( step ) );
	requestAnimationFrame( step );

} ), n );
// (added to what's there from a run of other models)
const had = existsSync( join( OUT, 'figures.json' ) ) ? JSON.parse( readFileSync( join( OUT, 'figures.json' ), 'utf8' ) ) : null;
const figures = { tier: TIER, programsAtStart: programs0, models: { ...( had && had.models ) } };
for ( const [ name, rodId, reelId, line, holder ] of MODELS ) {

	const gear = { rod: rodId, reel: reelId, line };
	for ( const shot of [ 'hand', 'reel', 'rod', ...( holder ? [ 'holder', 'spread' ] : [] ) ].filter( ( s ) => ! SHOTS || SHOTS.split( ',' ).includes( s ) ) ) {

		await page.evaluate( ( [ gear, shot ] ) => {

			const L = window.__look, R = window.__R;
			L.gear = gear;
			L.shot = shot;
			L.spread = shot === 'holder' || shot === 'spread';
			if ( ! L.spread ) {

				R.rigs.lines.length = 0;
				if ( R.rigs.holders ) R.rigs.holders.hide();

			} else if ( R.rod.equipped ) R.rod.equip( false );

		}, [ gear, shot ] );
		await frames( 3 );
		// (till what's asked is what's drawn: the model in your hands, or in her holders)
		await page.waitForFunction( ( [ gear, shot ] ) => {

			const R = window.__R, same = ( g ) => g && g.rod === gear.rod && g.reel === gear.reel && g.line === gear.line;
			if ( shot === 'holder' || shot === 'spread' ) return R.rigs.holders && R.rigs.holders.meshes.filter( ( m ) => m.visible && same( m.userData.gear ) ).length >= 2;
			return same( R.rod.gear ) && R.rod.rodMesh.visible;

		}, [ gear, shot ], { timeout: 120000 } ).catch( () => log( 'not drawn as asked', name, shot ) );
		await frames( 4 );
		const f = await page.evaluate( () => {

			const R = window.__R, a = window.__app, D = window.__draws, H = R.rigs.holders ? R.rigs.holders.meshes.filter( ( m ) => m.visible ) : [];
			return { calls: D.frame, programs: a.renderer.info.programs.length, tris: R.rod.model ? R.rod.model.geometry.index.count / 3 : null, gear: R.rod.gear, holders: H.length, holderGear: H.map( ( m ) => m.userData.gear ) };

		} );
		figures.models[ name ] = figures.models[ name ] || {};
		figures.models[ name ][ shot ] = f;
		await page.screenshot( { path: join( OUT, `${ name }-${ shot }.png` ) } );
		log( name, shot, JSON.stringify( f ) );

	}

}

figures.programsAtEnd = await page.evaluate( () => window.__app.renderer.info.programs.length );
figures.errors = errors;
writeFileSync( join( OUT, 'figures.json' ), JSON.stringify( figures, null, '\t' ) );
log( 'programs', programs0, '->', figures.programsAtEnd, errors.length ? `errors: ${ errors.join( ' | ' ) }` : 'no errors' );
await browser.close();
