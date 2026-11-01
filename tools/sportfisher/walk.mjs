#!/usr/bin/env node
// (M16) Going about her in the real game by the real keys: the stairs to the cabins, the side deck to the foredeck, up the
// tower's ladder to its helm, and down. Set only at the start of each walk; after that it's W, A, S, D and E. Small and on low:
// a CPU render on a loaded machine gets few frames, and the walks need them; two looks at the helms, larger.
//   [WALKS=stairs,ladder,side,up,down,bridge] tools/render-slot.sh node tools/sportfisher/walk.mjs <out dir>
const { chromium } = await import( '/home/shooter/Documents/VS Code/all-the-spaces/node_modules/playwright/index.mjs' );
const [ , , out = '.' ] = process.argv, PORT = process.env.PORT || 5203;
const walks = ( process.env.WALKS || 'stairs,ladder,side,up,down,bridge' ).split( ',' );
const b = await chromium.launch( { args: [ '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist' ] } );
const page = await b.newPage( { viewport: { width: 320, height: 180 } } );
page.setDefaultTimeout( 300000 );
const errs = [];
page.on( 'pageerror', ( e ) => errs.push( 'pageerror ' + e.message ) );
page.on( 'console', ( m ) => {

	if ( m.type() === 'error' && ! /GL Driver|GPU stall|WebGL: |swiftshader|Automatic fallback/i.test( m.text() ) ) errs.push( m.text().slice( 0, 300 ) );

} );
let tries = 0;
page.on( 'pageerror', ( e ) => {

	if ( /Failed to fetch dynamically imported module/.test( e.message ) && tries ++ < 6 ) setTimeout( () => page.reload( { waitUntil: 'domcontentloaded' } ).catch( () => {} ), 3000 );

} );
await page.goto( `http://127.0.0.1:${ PORT }/?boat=sportfisher&tier=low&hour=11`, { waitUntil: 'domcontentloaded' } );
await page.waitForFunction( () => window.__app && window.__app._started && window.__app.game, null, { timeout: 15 * 60000 } );
const sleep = ( ms ) => new Promise( ( r ) => setTimeout( r, ms ) );
await page.evaluate( () => {

	window.__frames = 0;
	const tick = () => {

		window.__frames ++;
		requestAnimationFrame( tick );

	};

	tick();

} );

const read = () => page.evaluate( () => {

	const a = window.__app, p = a.player, c = a.boatCtl, d = p.deckPos;
	return { mode: p.mode, climbing: !! p.climbing, x: + d.x.toFixed( 2 ), y: + d.y.toFixed( 2 ), z: + d.z.toFixed( 2 ), prompt: p.prompt && p.prompt.text, upper: !! p.atHelm?.upper, eyeUp: + ( a.camera.position.y - c.position.y ).toFixed( 2 ), driven: c.driven, steer: + c.steer.toFixed( 2 ), throttle: + c.throttle.toFixed( 2 ), frames: window.__frames };

} );
const say = ( name, r ) => console.log( name, JSON.stringify( r ) );
const set = ( x, y, z, yaw = 0, pitch = - 0.05 ) => page.evaluate( ( [ x, y, z, yaw, pitch ] ) => {

	const p = window.__app.player;
	p.climbing = null;
	p.mode = 'deck';
	p.deckPos.set( x, y, z );
	p.deckVel.set( 0, 0, 0 );
	p.deckYaw = yaw;
	p.pitch = pitch;
	const g = window.__app.game.guide;
	if ( g && g.open ) g.close();

}, [ x, y, z, yaw, pitch ] );
// hold these keys until it's true of where you are, or it's been too long; say how it went
const hold = async ( name, keys, until, s = 240 ) => {

	for ( const k of keys ) await page.keyboard.down( k );
	const t0 = Date.now(), f0 = ( await read() ).frames;
	let r = await read(), best = r;
	while ( ! until( r ) && Date.now() - t0 < s * 1000 ) {

		await sleep( 400 );
		r = await read();

	}

	for ( const k of keys ) await page.keyboard.up( k );
	best = r;
	console.log( until( r ) ? 'ok  ' : 'FAIL', name, JSON.stringify( best ), `${ ( ( r.frames - f0 ) / ( ( Date.now() - t0 ) / 1000 ) ).toFixed( 1 ) } fps, ${ ( ( Date.now() - t0 ) / 1000 ).toFixed( 0 ) } s` );
	return until( r );

};

// E, and wait for what it does (a key takes some frames to arrive, on a CPU render)
const press = async ( k, did ) => {

	await page.keyboard.down( k );
	await sleep( 600 );
	await page.keyboard.up( k );
	const t0 = Date.now();
	let r = await read();
	while ( ! did( r ) && Date.now() - t0 < 90000 ) {

		await sleep( 300 );
		r = await read();

	}

	return r;

};

const settle = async () => {

	const f = ( await read() ).frames;
	while ( ( await read() ).frames < f + 3 ) await sleep( 100 );

};

const shot = async ( name ) => {

	await page.setViewportSize( { width: 960, height: 540 } );
	await settle();
	await page.screenshot( { path: `${ out }/walk-${ name }.png` } );
	await page.setViewportSize( { width: 320, height: 180 } );
	await settle();

};

// boarded, and before the tower's bought there's no second helm
say( 'boat', await page.evaluate( () => {

	const a = window.__app, s = a.game.state;
	a.player.boardBoat();
	s.boat = 'sportfisher';
	s.upgrades.sfTower = 0;
	a.game.applyGear();
	return { id: a.boat.id, fitted: a.boat.fitted, wheels: a.boat.wheelMesh.count };

} ) );
await set( 0, 7, - 0.65 );
await settle();
say( 'no tower bought, at the pod', await read() );

if ( walks.includes( 'stairs' ) ) {

	await set( 0.03, 1.02, - 1.9 );
	await hold( 'W, salon down the stairs to the cabins', [ 'KeyW' ], ( r ) => r.y < 0.2 && r.z > 2.2 );
	await hold( 'S, back up them', [ 'KeyS' ], ( r ) => r.y > 1.0 && r.z < 0.7 );

}

// the bridge's ladder: from the cockpit up the steps to its foot on the mezzanine, up it, and down
if ( walks.includes( 'ladder' ) ) {

	await set( - 0.84, 0.5, - 5 );
	await hold( 'W, cockpit up the steps to the ladder\'s foot', [ 'KeyW' ], ( r ) => /Climb up to the bridge/.test( r.prompt || '' ) );
	say( 'at its foot', await read() );
	say( 'E', await press( 'KeyE', ( r ) => r.climbing ) );
	await hold( 'W, up it to the bridge', [ 'KeyW' ], ( r ) => ! r.climbing && r.y > 3.05, 300 );
	say( 'at its head', await read() );
	say( 'E', await press( 'KeyE', ( r ) => r.climbing ) );
	await hold( 'S, down it to the mezzanine', [ 'KeyS' ], ( r ) => ! r.climbing && r.y < 1, 300 );
	say( 'at its foot', await read() );

}

// from the cockpit, over the mezzanine, up on its box, along the side deck to the foredeck
if ( walks.includes( 'side' ) ) {

	await set( 0.9, 0.5, - 5 );
	await hold( 'W, cockpit up the step to the mezzanine', [ 'KeyW' ], ( r ) => r.z > - 3 && r.y > 0.85 );
	await hold( 'A, up on the box', [ 'KeyA' ], ( r ) => r.x > 1.6 && r.y > 1.2, 120 );
	await hold( 'A, to its outboard edge', [ 'KeyA' ], ( r ) => r.x > 2.05, 60 );
	await hold( 'W, along the side deck to the foredeck', [ 'KeyW' ], ( r ) => r.z > 6.5 && r.y > 1.2, 300 );

}

// the tower, bought; up its ladder, to its helm, and back down
await page.evaluate( () => {

	const a = window.__app;
	a.game.state.upgrades.sfTower = 1;
	a.game.applyGear();

} );
if ( walks.includes( 'up' ) ) {

	await set( 0, 3.1, - 2.9 );
	await settle();
	say( 'at the ladder\'s foot', await read() );
	say( 'E', await press( 'KeyE', ( r ) => r.climbing ) );
	await hold( 'W, up the ladder to the platform', [ 'KeyW' ], ( r ) => ! r.climbing && r.y > 6.95, 500 );
	await settle();
	say( 'at its head', await read() );
	await hold( 'W, to the pod', [ 'KeyW' ], ( r ) => r.prompt === 'Take the helm', 60 );
	say( 'E takes the tower\'s helm', await press( 'KeyE', ( r ) => r.mode === 'boat' ) );
	await page.evaluate( () => {

		const p = window.__app.player;
		p.camMode = 'first';
		p.helmPitch = - 1.15;

	} );
	await page.keyboard.down( 'KeyA' );
	await page.keyboard.down( 'KeyW' );
	for ( let i = 0; i < 200 && ( await read() ).steer < 0.3; i ++ ) await sleep( 200 );
	say( 'A and W at it', await read() );
	await shot( 'tower-helm' );
	await page.keyboard.up( 'KeyA' );
	await page.keyboard.up( 'KeyW' );
	say( 'E leaves it', await press( 'KeyE', ( r ) => r.mode === 'deck' ) );

}

if ( walks.includes( 'down' ) ) {

	if ( ! walks.includes( 'up' ) ) await set( 0, 7, - 0.62 );
	await hold( 'S, back to the ladder\'s head', [ 'KeyS' ], ( r ) => /Climb down/.test( r.prompt || '' ), 60 );
	say( 'E', await press( 'KeyE', ( r ) => r.climbing ) );
	await hold( 'S, down the ladder to the bridge', [ 'KeyS' ], ( r ) => ! r.climbing && Math.abs( r.y - 3.1 ) < 0.1, 500 );

}

// the bridge's helm, as it was
if ( walks.includes( 'bridge' ) ) {

	const rise = await page.evaluate( () => window.__app.boat.helm.rise );
	await set( rise[ 0 ], 3.1, rise[ 1 ] );
	await settle();
	say( 'at the bridge\'s helm', await read() );
	say( 'E takes it', await press( 'KeyE', ( r ) => r.mode === 'boat' ) );
	await page.evaluate( () => {

		const p = window.__app.player;
		p.camMode = 'first';
		p.helmPitch = - 0.35;

	} );
	await settle();
	await shot( 'bridge-helm' );
	say( 'E leaves it', await press( 'KeyE', ( r ) => r.mode === 'deck' ) );

}

console.log( 'errors:', errs.filter( ( e ) => ! /ERR_NETWORK_CHANGED|Failed to fetch dynamically|KHR_parallel/.test( e ) ).slice( 0, 12 ).join( '\n' ) || 'none' );
await b.close();
