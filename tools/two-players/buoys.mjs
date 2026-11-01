// Two real games (tools/two-players): the lobster traps' buoys everyone sees. Robin sets one before Sam comes (read from the group's save) and
// another once he's here (told as it happens); Sam sees them on his sea, in Robin's colours, can't gaff them; Robin hauls one and it's gone from
// Sam's sea; Robin leaves and the other's still there.
//   pnpm dev, then   node tools/two-players/buoys.mjs [dir for screenshots] [port]   (some minutes: two games on the CPU; tools/render-slot.sh)
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join( dirname( fileURLToPath( import.meta.url ) ), '../..' );
const PW = process.env.PLAYWRIGHT || join( ROOT, '../all-the-spaces/node_modules/playwright/index.mjs' );
const { chromium } = await import( PW );
const [ out = 'qa-output', PORT = '5189' ] = process.argv.slice( 2 );
const browser = await chromium.launch( { args: [ '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist' ] } );
const ctx = await browser.newContext( { viewport: { width: 560, height: 315 } } );
let problems = 0;
const say = ( ok, what ) => {

	console.log( ( ok ? 'ok   ' : 'FAIL ' ) + what );
	if ( ! ok ) problems ++;

};

const group = `buoys-${ Date.now() }`;
const open = async ( name ) => {

	const page = await ctx.newPage();
	page.on( 'pageerror', ( e ) => {

		problems ++;
		console.log( name, 'PAGEERROR', e.message.slice( 0, 300 ) );

	} );
	page.on( 'console', ( m ) => {

		if ( m.type() === 'error' && ! /ERR_NETWORK|Failed to load resource|dynamically imported/.test( m.text() ) ) {

			problems ++;
			console.log( name, 'CONSOLE', m.text().slice( 0, 300 ) );

		} else if ( m.type() === 'warning' && /^buoys/.test( m.text() ) ) {

			problems ++;
			console.log( name, 'WARN', m.text().slice( 0, 300 ) );

		}

	} );
	await page.goto( `http://127.0.0.1:${ PORT }/tools/two-players/?name=${ name }&id=${ name.toLowerCase() }-1&tier=low&group=${ group }` );
	const f = () => page.frames().find( ( x ) => x !== page.mainFrame() );
	await page.waitForFunction( () => true );
	for ( let i = 0; i < 500; i ++ ) {

		if ( await f().evaluate( () => !! ( window.__app && window.__app._started ) ).catch( () => false ) ) break;
		await page.waitForTimeout( 1000 );

	}

	await f().evaluate( () => {

		const g = window.__app.game;
		if ( g.guide ) {

			g.guide.seen.intro = true;
			if ( g.guide.open ) g.guide.close();
			g.guide._wait = - 1;

		}

	} );
	return { page, game: f() };

};

const SPOT = [ { x: - 78, z: 145 }, { x: - 40, z: 150 } ];
// a trap set from Robin's boat at this spot, as her hauler's prompt does it (the keys were played through separately)
const setOne = ( g, at ) => g.evaluate( ( at ) => {

	const a = window.__app, w = a.game.traps, st = a.game.state;
	st.upgrades.traps = 3;
	const depth = w.depthAt( at.x, at.z );
	w._fit();
	w._startSet( at.x, at.z, depth, w.bottom( at.x, at.z ), 8 - st.traps.set.length );

}, at );
const robin = await open( 'Robin' );
await setOne( robin.game, SPOT[ 0 ] );
await robin.game.waitForFunction( () => window.__app.game.traps._dirty === false, null, { timeout: 200000, polling: 500 } );
await robin.page.waitForTimeout( 3000 );
const sam = await open( 'Sam' );
await sam.game.waitForFunction( () => Object.values( window.__app.game.traps.others ).some( ( r ) => r.b.length === 1 ), null, { timeout: 200000, polling: 1000 } );
say( true, 'Sam reads the buoy Robin set before he came, from the group\'s save' );
say( await sam.game.evaluate( () => Object.values( window.__app.game.traps.others )[ 0 ].n === 'Robin' ), 'it\'s named as hers' );
await setOne( robin.game, SPOT[ 1 ] );
await sam.game.waitForFunction( () => Object.values( window.__app.game.traps.others ).some( ( r ) => r.b.length === 2 ), null, { timeout: 200000, polling: 1000 } );
say( true, 'Sam\'s told of the one she sets while he\'s here' );
// Sam on his own deck by his hauler, the boat right on her buoy
await sam.game.evaluate( ( at ) => {

	const a = window.__app, b = a.boatCtl, p = a.player;
	if ( p.mode !== 'deck' ) p.boardBoat();
	b.moored = false;
	b.position.set( at.x + 3, b.position.y, at.z );
	b.velocity.set( 0, 0, 0 );
	p.deckPos.set( - 0.55, 0.35, - 1.2 );
	p.deckYaw = - 1.5;
	p.pitch = - 0.4;
	a.game.state.upgrades.traps = 1;
	setInterval( () => {

		b.velocity.set( 0, 0, 0 );
		b.angular.set( 0, 0, 0 );

	}, 50 );

}, SPOT[ 0 ] );
await sam.game.waitForFunction( () => {

	const w = window.__app.game.traps;
	return w.meshes && w.meshes.buoys.count >= 1 && w._near.some( ( n ) => ! n.mine );

}, null, { timeout: 300000, polling: 1000 } );
say( true, 'her buoys are drawn on Sam\'s sea' );
const colours = await sam.game.evaluate( () => {

	const a = window.__app, w = a.game.traps, n = w._near.find( ( x ) => ! x.mine );
	return { theirs: n.colours.join(), name: n.name };

} );
const hers = await robin.game.evaluate( () => window.__app.together.me.id );
say( !! colours.theirs && colours.name === 'Robin', `in her own colours (${ colours.theirs }), and told as hers (${ hers })` );
await sam.page.waitForTimeout( 6000 );
const offered = await sam.game.evaluate( () => window.__app.player.prompt && window.__app.player.prompt.text );
say( ! /Gaff/.test( offered || '' ), `no gaffing someone else's buoy (the prompt there: ${ offered })` );
await sam.page.screenshot( { path: join( out, 'buoys-sam.png' ) } );
// Robin hauls one: it's gone from Sam's sea
await robin.game.evaluate( () => {

	const a = window.__app, w = a.game.traps, st = a.game.state;
	w.job = null;
	st.traps.set.shift();
	w._dirty = true;

} );
await sam.game.waitForFunction( () => Object.values( window.__app.game.traps.others ).some( ( r ) => r.b.length === 1 ), null, { timeout: 200000, polling: 1000 } );
say( true, 'the one she hauls goes from his sea' );
await robin.page.close();
await sam.page.waitForTimeout( 8000 );
const stays = await sam.game.evaluate( () => window.__app.game.traps.others );
say( Object.values( stays ).some( ( r ) => r.b.length === 1 ), 'she\'s gone: the other\'s still out there' );
const saved = await sam.game.evaluate( () => window.__app.together.portal.save.shared.get( 'buoys' ) );
say( Object.values( saved || {} ).some( ( r ) => r.b && r.b.length === 1 ), 'and in the group\'s save for whoever comes next' );
await browser.close();
console.log( problems ? `${ problems } problem(s)` : 'all passed' );
process.exit( problems ? 1 : 0 );
