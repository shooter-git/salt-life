#!/usr/bin/env node
// (M21) Another player at each boat's helm, their hands reached to its wheel (game/ArmReach.js; docs/m21/deckhand.md): the
// lobster boat's, the console's, the sportfisher's bridge's and her tower's, in each of the four looks, as your game draws them.
// One game: a second player ("Sam") is made up on it, riding your boat at her helm (his poses put in as the room would bring
// them: Together._pose), so Together places him as it places anyone at someone's helm (Crew.helmStand). For each helm and
// look: how far each wrist is from its grip on the rim, and how far leaned in; two of the looks drawn from beside, from behind
// and low from beside (the feet against her console and seat). And (low) the sportfisher's
// fighting chair near the camera, unbought and bought. Drawn on the CPU (Chromium on SwiftShader, from All the Spaces'
// Playwright), into <out>/<tier>/.
//
//   a dev server on LOOK_PORT (5241), then
//   tools/render-slot.sh node tools/deckhand/helms.mjs <out> [tier]
//   (ALL_THE_SPACES: its checkout, if it isn't ../all-the-spaces. Don't edit src while it runs.)
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath( new URL( '../..', import.meta.url ) );
const ATS = process.env.ALL_THE_SPACES || join( ROOT, '../all-the-spaces' );
const [ OUTDIR = join( ROOT, 'qa-output/helms' ), TIER = 'low' ] = process.argv.slice( 2 );
const PORT = process.env.LOOK_PORT || 5241;
const OUT = join( OUTDIR, TIER );
mkdirSync( OUT, { recursive: true } );
const T0 = Date.now();
const log = ( ...a ) => console.log( `[${ ( ( Date.now() - T0 ) / 1000 ).toFixed( 0 ) } s]`, ...a );
const SEA = { x: - 2600, z: 3000 };
const LOOKS = [ 'player-m1', 'player-m2', 'player-f1', 'player-f2' ];
const DRAWN = [ 'player-m2', 'player-f1' ]; // (the looks drawn: a man and a woman, the other islander and one of the women)
const HELMS = [ { boat: 'lobster', upper: false }, { boat: 'console', upper: false }, { boat: 'sportfisher', upper: false }, { boat: 'sportfisher', upper: true } ];

const { chromium } = await import( join( ATS, 'node_modules/playwright/index.mjs' ) );
const browser = await chromium.launch( { args: [ '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist' ] } );
const page = await browser.newPage( { viewport: { width: 960, height: 540 } } );
page.setDefaultTimeout( 900000 );
const errors = [];
page.on( 'pageerror', ( e ) => errors.push( e.message ) );
page.on( 'console', ( m ) => m.type() === 'error' && ! /GL Driver|GPU stall|WebGL: |swiftshader|Automatic fallback/i.test( m.text() ) && errors.push( m.text() ) );
await page.goto( `http://127.0.0.1:${ PORT }/?tier=${ TIER }&weather=calm&hour=11&boat=lobster&fullsea` );
await page.waitForFunction( () => window.__app && window.__app._started && window.__app.game, null, { timeout: 900000 } );
log( 'started' );
await page.waitForFunction( () => window.__app._peopleIn, null, { timeout: 1500000, polling: 1000 } );
log( 'the traders\' looks in' );

await page.evaluate( () => {

	const a = window.__app, g = a.game, st = g.state;
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
	for ( const id of [ 'console', 'sportfisher' ] ) st.addBoat( id );
	st.money = Math.max( st.money, 50000 );
	// the camera put where a shot wants it just before the world's drawn (window.__cam: [ from, to ], her frame, from where Sam
	// stands at her helm)
	const draw = a.drawWorld.bind( a ), cam = a.camera, V = cam.position.constructor;
	a.drawWorld = ( ...args ) => {

		const c = window.__cam, o = a.together.others.get( 'sam-1' );
		if ( c && o ) {

			const G = a.boat.group;
			G.updateMatrixWorld( true );
			const at = G.worldToLocal( o.avatar.group.position.clone() );
			cam.position.copy( G.localToWorld( new V( ...c[ 0 ] ).add( at ) ) );
			cam.lookAt( G.localToWorld( new V( ...c[ 1 ] ).add( at ) ) );
			cam.updateMatrixWorld();
			// (the sea's nodes chosen for this camera: it chose them for the player's, before the world's drawn, and those outside
			// the player's view were missing from this one's, the sea black there: WaterSurface.update)
			a.water.update( cam );

		}

		window.__frames = ( window.__frames || 0 ) + 1;
		return draw( ...args );

	};

	// Sam, riding your boat at her helm (her tower's: J 1), in the look asked for (window.__sam: { l, up }), his poses ten a second
	const T = a.together, person = { id: 'sam-1', name: 'Sam', color: '#c8553d' };
	window.__sam = null;
	setInterval( () => {

		const s = window.__sam;
		if ( ! s ) return;
		if ( ! T.others.has( person.id ) ) T.others.set( person.id, T._remote( person ) );
		const b = a.boatCtl, p = b.position;
		T._pose( { m: 'h', p: [ p.x, p.y + 2, p.z ], a: b.getYaw() + Math.PI, v: 0, l: s.l, R: T.me.id, ...( s.up ? { J: 1 } : {} ) }, person.id );

	}, 100 );

} );

const frames = async ( n ) => {

	const from = await page.evaluate( () => window.__frames || 0 );
	await page.waitForFunction( ( to ) => ( window.__frames || 0 ) >= to, from + n, { timeout: 600000 } );

};
const shot = async ( name, cam ) => {

	await page.evaluate( ( c ) => ( window.__cam = c ), cam );
	await frames( 4 );
	writeFileSync( join( OUT, `${ name }.png` ), await page.screenshot() );
	log( name );

};

// into her, out at sea, stopped; you on her deck aft, out of the way
const into = ( id ) => page.evaluate( async ( [ id, SEA ] ) => {

	const a = window.__app, p = a.player, b = a.boatCtl;
	if ( a.boat.id !== id ) {

		window.__sam = null;
		p.mode = 'walk';
		if ( ! await a.setBoat( id ) ) return false;

	}

	if ( p.mode !== 'deck' ) p.boardBoat();
	b.moored = false;
	b.beached = false;
	b.anchor = null;
	b.position.set( SEA.x, b.position.y, SEA.z );
	b.velocity.set( 0, 0, 0 );
	b.angular.set( 0, 0, 0 );
	const M = a.boat, back = M.boardPoint || M.helm;
	p.deckPos.set( back.x, back.y ?? p.deckPos.y, ( back.z ?? 0 ) - 0.5 );
	p.deckVel.set( 0, 0, 0 );
	if ( id === 'sportfisher' ) {

		const u = a.game.state.upgrades;
		u.sfTower = 1;
		u.sfOutriggers = 1;
		u.sfChair = 1;
		a.game.applyGear();

	}

	return true;

}, [ id, SEA ] );

// Sam at her helm in a look: once he's in it and posed, how far each wrist is from its grip (m), and the further one's shortfall
const sam = async ( look, up ) => {

	await page.evaluate( ( [ l, up ] ) => ( window.__sam = { l, up } ), [ LOOKS.indexOf( look ), up ] );
	await page.waitForFunction( ( look ) => {

		const o = window.__app.together.others.get( 'sam-1' );
		return o && o.wearing === look && o.avatar.character && o.avatar.look === look && o.shown && o.cur && o.cur.mode === 'helm' && o.wheel;

	}, look, { timeout: 600000, polling: 300 } );
	await frames( 6 );
	return page.evaluate( () => {

		const a = window.__app, o = a.together.others.get( 'sam-1' ), A = o.avatar, B = A.arms, V = a.camera.position.constructor;
		const w = ( b ) => b.getWorldPosition( new V() ), G = a.boat.group, at = G.worldToLocal( A.group.position.clone() );
		A.group.updateMatrixWorld( true );
		// (where the clip's ankles and toes are, her frame, from where he stands: z ahead of it, y up)
		const bone = ( re ) => { let f = null; A.character.group.traverse( ( b ) => { if ( ! f && b.isBone && re.test( b.name ) ) f = b; } ); return f; };
		const feet = [ /R_?Foot$/, /L_?Foot$/, /R_?Toe0$/, /L_?Toe0$/ ].map( ( re ) => { const b = bone( re ); return b ? G.worldToLocal( w( b ) ).sub( at ).toArray().map( ( v ) => +v.toFixed( 2 ) ) : null; } );
		// (how far forward the shoulders are over the waist, degrees: leaned in to reach, or as the clip stands)
		const sp = A.group.worldToLocal( w( B.spine ) ), sh = A.group.worldToLocal( w( B.armR ).add( w( B.armL ) ).multiplyScalar( 0.5 ) );
		return { short: A.short === null ? null : +A.short.toFixed( 3 ), right: +w( B.handR ).distanceTo( o.wheel.r ).toFixed( 3 ), left: +w( B.handL ).distanceTo( o.wheel.l ).toFixed( 3 ), lean: +( Math.atan2( sh.z - sp.z, sh.y - sp.y ) * 180 / Math.PI ).toFixed( 0 ), shoulder: +( w( B.armR ).y - A.group.position.y ).toFixed( 3 ), feet, stand: at.toArray().map( ( v ) => +v.toFixed( 2 ) ), clip: A.character.current };

	} );

};

const SIDE = [ [ 1.35, 1.5, 0.35 ], [ 0, 1.05, 0.35 ] ];
const BEHIND = [ [ 0.55, 1.8, - 1.15 ], [ 0, 1.1, 0.45 ] ];
const FEET = [ [ 0.9, 1.3, 0.55 ], [ 0, 0.15, - 0.1 ] ]; // (from ahead and above, to port: the feet and legs against her console and seat)
const report = { tier: TIER, helms: {} };
for ( const H of HELMS ) {

	const name = `${ H.boat }${ H.upper ? '-tower' : '' }`;
	if ( ! await into( H.boat ) ) {

		log( name, 'not got into' );
		continue;

	}

	await frames( 4 );
	const per = report.helms[ name ] = {};
	for ( const look of LOOKS ) {

		per[ look ] = await sam( look, H.upper );
		log( name, look, JSON.stringify( per[ look ] ) );
		if ( DRAWN.includes( look ) ) {

			await shot( `${ name }-${ look }-side`, SIDE );
			await shot( `${ name }-${ look }-behind`, BEHIND );
			await shot( `${ name }-${ look }-feet`, FEET );

		}

	}

}

// (low) the sportfisher's fighting chair near the camera: bought, then not
if ( TIER === 'low' ) {

	await page.evaluate( () => ( window.__sam = null ) );
	await into( 'sportfisher' );
	const chair = async ( on ) => {

		await page.evaluate( ( on ) => {

			const a = window.__app;
			a.game.state.upgrades.sfChair = on ? 1 : 0;
			a.game.applyGear();
			window.__cam = null;
			// (looking aft over her cockpit from its forward end: the chair's 1 m off, well inside her near detail's 70 m)
			const G = a.boat.group, cam = a.camera, V = cam.position.constructor, draw = a.drawWorld;
			if ( ! window.__chairCam ) {

				window.__chairCam = true;
				a.drawWorld = ( ...args ) => {

					if ( window.__aft ) {

						G.updateMatrixWorld( true );
						cam.position.copy( G.localToWorld( new V( 0.9, 2.3, - 3.2 ) ) );
						cam.lookAt( G.localToWorld( new V( 0, 0.7, - 5.2 ) ) );
						cam.updateMatrixWorld();
						a.water.update( cam );

					}

					return draw( ...args );

				};

			}

			window.__aft = true;

		}, on );
		await frames( 6 );
		const r = await page.evaluate( () => {

			const c = window.__app.boat.meshes.chair;
			return { visible: c.visible, shown: c.userData.shown, fitted: window.__app.boat.fitted.chair };

		} );
		writeFileSync( join( OUT, `chair-${ on ? 'bought' : 'unbought' }.png` ), await page.screenshot() );
		log( `chair ${ on ? 'bought' : 'unbought' }`, JSON.stringify( r ) );
		return r;

	};

	report.chair = { unbought: await chair( false ), bought: await chair( true ) };

}

report.errors = errors.slice( 0, 12 );
writeFileSync( join( OUT, 'report.json' ), JSON.stringify( report, null, '\t' ) );
log( JSON.stringify( report ) );
await browser.close();
