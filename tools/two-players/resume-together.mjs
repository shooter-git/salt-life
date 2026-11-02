// (M16) Coming back, together: two real games (tools/two-players) in each boat, the players' saves kept in the browser so a page can really be
// loaded again (host.js patched as it's fetched, as away.mjs does). Leaving's the app covering the game, then the page closed.
//   tools/render-slot.sh node tools/two-players/resume-together.mjs [dir for screenshots] [port] [boats: kayak,console,...] [scenarios: dock,far,...]
// A pair of games is minutes on the CPU: a run's capped at 25 minutes, so split them.
import { launch, say, note, tally, watch, toastWatch, started, frames, quiet, view, brief, shots, farSpot, BOAT_IDS, ANCHOR, SOCK } from './resume-lib.mjs';
const [ out = 'qa-output', PORT = '5222', BOATS = BOAT_IDS.join(), SCENS = '' ] = process.argv.slice( 2 );
const browser = await launch();
const wanted = SCENS ? SCENS.split( ',' ) : null;

async function room( tag ) {

	const ctx = await browser.newContext( { viewport: { width: 640, height: 360 } } );
	await ctx.addInitScript( toastWatch );
	await ctx.route( '**/tools/two-players/host.js*', async ( route ) => {

		const res = await route.fetch(); let body = await res.text();
		const a = 'const saved = new Map(); // this player\'s saves: \'personal/key\' -> { value, schemaVersion, version }';
		if ( ! body.includes( a ) ) throw new Error( 'host changed' );
		body = body.replace( a, 'const saved = new Map( JSON.parse( localStorage.getItem( \'tp-\' + me.id ) || \'[]\' ) ); saved.set = function ( k, v ) { Map.prototype.set.call( this, k, v ); localStorage.setItem( \'tp-\' + me.id, JSON.stringify( [ ...this ] ) ); return this; };' );
		await route.fulfill( { response: res, body } );

	} );
	const group = `${ tag }-${ Date.now() }`;
	const R = {
		ctx, group,
		// a game in a page: in that boat (only the first time: after that, what's saved)
		async open( name, boat = null ) {

			const page = await ctx.newPage();
			watch( page, name );
			const src = boat ? `&src=${ encodeURIComponent( `/?boat=${ boat }` ) }` : '';
			const url = `http://127.0.0.1:${ PORT }/tools/two-players/?name=${ name }&id=${ name.toLowerCase() }-1&tier=low&group=${ group }${ src }`;
			const t = Date.now();
			const go = () => page.goto( url, { timeout: 180000 } );
			await go();
			const f = () => page.frames().find( ( x ) => x !== page.mainFrame() );
			const g = await started( f, { page, reload: go } );
			await quiet( g );
			note( `${ name } in (${ Date.now() - t } ms)` );
			return { name, page, game: g, id: `${ name.toLowerCase() }-1` };

		},
		// the app covering the game (Portal's 'pause': App saves all of it), a moment for it to go, then the page closed
		async leave( P, { abrupt = false } = {} ) {

			if ( ! abrupt ) {

				await P.page.evaluate( () => document.querySelector( 'iframe' ).contentWindow.postMessage( { ats: 'bridge', v: 1, msg: { type: 'pause' } }, '*' ) );
				await P.page.waitForTimeout( 1800 );

			}

			await P.page.close();
			note( `${ P.name } ${ abrupt ? 'gone, at a stroke' : 'gone' }` );

		},
		// her saved records, moved back
		ago( id, hours ) {

			const page = ctx.pages()[ 0 ];
			return page.evaluate( ( [ id, hours ] ) => {

				const raw = JSON.parse( localStorage.getItem( `tp-${ id }` ) || '[]' ), ms = hours * 3600e3;
				for ( const e of raw ) if ( e[ 0 ] === 'personal/boat' || e[ 0 ] === 'personal/clock' ) {

					const asText = typeof e[ 1 ].value === 'string', r = asText ? JSON.parse( e[ 1 ].value ) : e[ 1 ].value;
					if ( r.at ) r.at -= ms;
					e[ 1 ].value = asText ? JSON.stringify( r ) : r;

				}

				localStorage.setItem( `tp-${ id }`, JSON.stringify( raw ) );
				return raw.map( ( e ) => e[ 0 ] );

			}, [ id, hours ] );

		},
		close: () => ctx.close(),
	};
	return R;

}

const them = ( g ) => g.evaluate( () => {

	const t = window.__app.together, r = ( v ) => Math.round( v * 10 ) / 10;
	const out = { others: t.others.size, host: t.session.isHost, boats: Object.keys( t.boats ), list: [] };
	for ( const o of t.others.values() ) out.list.push( { name: o.person.name, id: o.person.id, boat: o.cur && o.cur.boatId, mode: o.cur && o.cur.mode, at: o.cur && o.cur.boat ? [ r( o.cur.boat.pos.x ), r( o.cur.boat.pos.z ) ] : null, drawn: !! ( o.boat && o.boat.visible ), drawnAt: o.boat ? [ r( o.boat.position.x ), r( o.boat.position.z ) ] : null, drawnType: o.boat && o.boat.userData && o.boat.userData.type, shown: !! o.shown } );
	return out;

} );
const awayOf = ( g, id ) => g.evaluate( ( id ) => {

	const t = window.__app.together, a = t.away.get( id ), rec = t.boats[ id ], r = ( v ) => Math.round( v * 10 ) / 10;
	return { rec: rec || null, entry: !! a, drawn: !! ( a && a.boat && a.boat.visible ), type: a && a.boat && a.boat.userData && a.boat.userData.type, at: a && a.boat ? [ r( a.boat.position.x ), r( a.boat.position.z ) ] : null, frame: a && a.y !== null ? [ r( a.frame.pos.x ), r( a.frame.pos.z ) ] : null, rode: !! ( a && a.rode && a.rode.visible ), story: a && a.story ? { x: r( a.story.x ), z: r( a.story.z ), where: a.story.where } : null };

}, id );
const atSea = ( g, spot ) => g.evaluate( ( at ) => {

	const a = window.__app, b = a.boatCtl, p = a.player;
	if ( p.mode === 'walk' || p.mode === 'swim' ) {

		p.boardBoat();
		if ( p.mode !== 'boat' ) p.takeHelm();

	} else if ( p.mode === 'deck' ) p.takeHelm();

	b.moored = b.beached = false;
	if ( b.model.sliding !== undefined ) b.model.sliding = null;
	b.position.set( at.x, 0, at.z );
	b.velocity.set( 0, 0, 0 );
	b.angular.set( 0, 0, 0 );
	b.throttle = 0;
	b.speed = 0;
	b.hasWater = false;

}, spot );
const anchored = async ( g, boat, spot ) => {

	await g.evaluate( ( t ) => {

		const st = window.__app.game.state;
		st.upgrades[ t ] = 1;
		st.emit();

	}, ANCHOR[ boat ] );
	await atSea( g, spot );
	await frames( g, 2 );
	await g.evaluate( () => {

		const a = window.__app;
		if ( a.boat.seated ) a.player.exitBoat( null, 1 );
		else a.player.leaveHelm();

	} );
	await g.waitForFunction( () => !! window.__app.boatCtl.anchor, null, { timeout: 60000, polling: 300 } ).catch( () => note( 'no anchor came down' ) );
	await frames( g, 2 );
	return view( g );

};
// to a swim beside her, so what's drawn is drawn about her
const swimBy = ( g, x, z ) => g.evaluate( ( [ x, z ] ) => {

	const a = window.__app, p = a.player;
	if ( p.mode === 'boat' && ! a.boat.seated ) p.leaveHelm();
	if ( p.mode === 'boat' || p.mode === 'deck' ) p.exitBoat( null, 1 );
	p.position.set( x + 14, a.waves.heightAt( x + 14, z - 14 ) - 0.2, z - 14 );
	p.mode = 'swim';
	p.velocity.set( 0, 0, 0 );
	p.floating = true;
	p.yaw = Math.atan2( 14, - 14 ) ;

}, [ x, z ] );

const SC = {

	// joining with each at the dock: each sees the other's boat as she is, at her own berth or a spare
	async dock( boat ) {

		const other = BOAT_IDS[ ( BOAT_IDS.indexOf( boat ) + 1 ) % 4 ];
		const R = await room( `dock-${ boat }` );
		const robin = await R.open( 'Robin', boat ), sam = await R.open( 'Sam', other );
		await sam.game.waitForFunction( () => window.__app.together.others.size > 0, null, { timeout: 200000, polling: 1000 } );
		await robin.game.waitForFunction( () => window.__app.together.others.size > 0, null, { timeout: 200000, polling: 1000 } );
		for ( const [ P, me, you ] of [ [ robin, boat, other ], [ sam, other, boat ] ] ) {

			await P.game.waitForFunction( () => { const o = [ ...window.__app.together.others.values() ][ 0 ]; return o.cur && o.cur.boat; }, null, { timeout: 200000, polling: 1000 } ).catch( () => {} );
			// (on the pier, where what's at the dock's drawn)
			await P.game.evaluate( () => {

				const p = window.__app.player;
				p.position.set( 55, 3, 20 );
				p.velocity.set( 0, 0, 0 );
				p.yaw = 3.14;

			} );

		}

		await robin.game.waitForFunction( () => { const o = [ ...window.__app.together.others.values() ][ 0 ]; return o.boat && o.boat.visible; }, null, { timeout: 200000, polling: 1000 } ).catch( () => note( 'Robin: not drawn yet' ) );
		await sam.game.waitForFunction( () => { const o = [ ...window.__app.together.others.values() ][ 0 ]; return o.boat && o.boat.visible; }, null, { timeout: 200000, polling: 1000 } ).catch( () => note( 'Sam: not drawn yet' ) );
		await frames( robin.game, 3 );
		await frames( sam.game, 3 );
		for ( const [ P, me, you ] of [ [ robin, boat, other ], [ sam, other, boat ] ] ) {

			const v = await view( P.game ), t = await them( P.game );
			note( `${ P.name } ${ brief( v ) }` );
			note( `${ P.name } sees ${ JSON.stringify( t ) }` );
			say( v.boat === me && v.model === me && ( v.moored || v.beached ), `dock (${ boat }/${ other }): ${ P.name } in the ${ me } at her berth (${ v.x }, ${ v.z })` );
			const o = t.list[ 0 ];
			say( o && o.boat === you && o.drawn, `dock (${ boat }/${ other }): ${ P.name } sees the other's ${ you } (${ o && o.boat }, drawn ${ o && o.drawn } type ${ o && o.drawnType } at ${ o && o.drawnAt })` );
			await shots( P.page, P.game, `${ out }/tog-dock-${ boat }-${ P.name }`, { from: [ 18, 12, - 26 ] } );

		}

		// reloaded in a room: back in the same boat, at her berth
		await R.leave( sam );
		const sam2 = await R.open( 'Sam' );
		await sam2.game.waitForFunction( () => window.__app.together.others.size > 0, null, { timeout: 200000, polling: 1000 } );
		const v2 = await view( sam2.game );
		note( `Sam back ${ brief( v2 ) }` );
		say( v2.boat === other && ( v2.moored || v2.beached ) && ! v2.veil, `dock (${ boat }/${ other }): Sam loads again, in the ${ other } at her berth, no veil` );
		await R.close();

	},

	// joining with the other far out, at her helm and at anchor: the same place on both
	async far( boat ) {

		const R = await room( `far-${ boat }` );
		const robin = await R.open( 'Robin', boat );
		const spot = await farSpot( robin.game, { max: boat === 'kayak' ? 9 : 18 } );
		const mine = await anchored( robin.game, boat, spot );
		note( `Robin far out ${ brief( mine ) }` );
		say( !! mine.anchor, `far (${ boat }): Robin at anchor at ${ mine.x }, ${ mine.z }` );
		const sam = await R.open( 'Sam', 'lobster' );
		await sam.game.waitForFunction( () => { const o = [ ...window.__app.together.others.values() ][ 0 ]; return o && o.cur && o.cur.boat; }, null, { timeout: 200000, polling: 1000 } );
		await frames( sam.game, 2 );
		const live = await view( robin.game ), t = await them( sam.game );
		note( `Sam sees ${ JSON.stringify( t ) }` );
		const o = t.list[ 0 ];
		say( o.boat === boat && Math.hypot( o.at[ 0 ] - live.x, o.at[ 1 ] - live.z ) < 25, `far (${ boat }): Sam joined, sees the ${ o.boat } ${ Math.hypot( o.at[ 0 ] - live.x, o.at[ 1 ] - live.z ).toFixed( 1 ) } m from where Robin has her` );
		// Sam goes out to her: drawn, in the water
		await swimBy( sam.game, live.x, live.z );
		await sam.game.waitForFunction( () => { const o = [ ...window.__app.together.others.values() ][ 0 ]; return o.boat && o.boat.visible; }, null, { timeout: 200000, polling: 500 } ).catch( () => note( 'not drawn' ) );
		await frames( sam.game, 4 );
		const t2 = await them( sam.game );
		say( t2.list[ 0 ].drawn && t2.list[ 0 ].drawnType === boat, `far (${ boat }): swum to her, Sam draws her as she is (${ t2.list[ 0 ].drawnType } at ${ t2.list[ 0 ].drawnAt })` );
		await sam.page.screenshot( { path: `${ out }/tog-far-${ boat }-sam-beside.png` } );
		// Robin reloads out there, with Sam by her
		await R.leave( robin );
		await sam.game.waitForFunction( () => window.__app.together.others.size === 0, null, { timeout: 200000, polling: 500 } );
		await sam.game.waitForFunction( ( id ) => window.__app.together.boats[ id ], 'robin-1', { timeout: 60000, polling: 500 } ).catch( () => {} );
		const a = await awayOf( sam.game, 'robin-1' );
		note( `Sam's view, Robin gone ${ JSON.stringify( a ) }` );
		const robin2 = await R.open( 'Robin' );
		await robin2.game.waitForFunction( () => window.__app.together.others.size > 0, null, { timeout: 200000, polling: 1000 } );
		const v = await view( robin2.game );
		note( `Robin back ${ brief( v ) }` );
		say( v.boat === boat && !! v.anchor && Math.hypot( v.x - live.x, v.z - live.z ) < 6, `far (${ boat }): Robin back in a room: same boat, her anchor, ${ Math.hypot( v.x - live.x, v.z - live.z ).toFixed( 1 ) } m off` );
		say( v.mode === ( boat === 'kayak' ? 'walk' : mine.mode ), `far (${ boat }): Robin ${ boat === 'kayak' ? 'out of her, in the water, when she left, ashore now' : 'aboard as she was' } (${ mine.mode } -> ${ v.mode })` );
		say( ! v.veil && v.inScene, `far (${ boat }): no veil, she's in the scene` );
		await frames( robin2.game, 3 );
		await shots( robin2.page, robin2.game, `${ out }/tog-far-${ boat }-robin-back`, { from: [ 12, 8, - 16 ] } );
		await sam.game.waitForFunction( () => { const o = [ ...window.__app.together.others.values() ][ 0 ]; return o && o.cur && o.cur.boat; }, null, { timeout: 200000, polling: 1000 } );
		await frames( sam.game, 3 );
		const t3 = await them( sam.game ), v3 = await view( robin2.game );
		note( `Sam sees her back ${ JSON.stringify( t3 ) }` );
		say( Math.hypot( t3.list[ 0 ].at[ 0 ] - v3.x, t3.list[ 0 ].at[ 1 ] - v3.z ) < 25, `far (${ boat }): and both have her in one place: ${ Math.hypot( t3.list[ 0 ].at[ 0 ] - v3.x, t3.list[ 0 ].at[ 1 ] - v3.z ).toFixed( 1 ) } m apart` );
		await R.close();

	},

	// out at sea and away: what the other sees, her anchor, her drift, her tow, the owner's record; and the owner back
	async away( boat ) {

		const R = await room( `away-${ boat }` );
		const robin = await R.open( 'Robin', boat );
		const sam = await R.open( 'Sam', 'lobster' );
		await sam.game.waitForFunction( () => window.__app.together.others.size > 0, null, { timeout: 200000, polling: 1000 } );
		await robin.game.evaluate( () => { const st = window.__app.game.state; st.money = 900; st.save(); st.emit(); } );
		const spot = await farSpot( robin.game, { max: boat === 'kayak' ? 9 : 18 } );
		// ---- at anchor, the owner gone
		const mine = await anchored( robin.game, boat, spot );
		say( !! mine.anchor, `away (${ boat }): Robin's anchor down at ${ mine.x }, ${ mine.z } (${ mine.mode })` );
		await R.leave( robin );
		await sam.game.waitForFunction( () => window.__app.together.others.size === 0 && window.__app.together.session.isHost, null, { timeout: 200000, polling: 500 } );
		await sam.game.waitForFunction( ( id ) => window.__app.together.boats[ id ], 'robin-1', { timeout: 60000, polling: 500 } ).catch( () => note( 'no record' ) );
		await swimBy( sam.game, mine.x, mine.z );
		await sam.game.waitForFunction( () => { const a = window.__app.together.away.get( 'robin-1' ); return a && a.boat && a.boat.visible; }, null, { timeout: 120000, polling: 500 } ).catch( () => note( 'away boat not drawn' ) );
		await frames( sam.game, 4 );
		let a = await awayOf( sam.game, 'robin-1' );
		note( `Sam's view ${ JSON.stringify( a ) }` );
		say( !! a.rec && !! a.rec.a && a.rec.b === boat && a.rec.n === 'Robin', `away (${ boat }): her record: ${ a.rec && a.rec.b }, Robin's, anchored at ${ a.rec && a.rec.a }` );
		say( a.drawn && a.rode && a.type === boat, `away (${ boat }): Sam draws her (${ a.type }), rode out` );
		say( a.frame && Math.hypot( a.frame[ 0 ] - mine.x, a.frame[ 1 ] - mine.z ) < 45, `away (${ boat }): where she was left: ${ a.frame && Math.hypot( a.frame[ 0 ] - mine.x, a.frame[ 1 ] - mine.z ).toFixed( 1 ) } m from Robin's last` );
		await sam.page.screenshot( { path: `${ out }/tog-away-${ boat }-sam-anchored.png` } );
		// ---- the owner back, she's hers
		const robin2 = await R.open( 'Robin' );
		await robin2.game.waitForFunction( () => window.__app.together.others.size > 0, null, { timeout: 200000, polling: 1000 } );
		await frames( robin2.game, 3 );
		let v = await view( robin2.game );
		note( `Robin back ${ brief( v ) }` );
		say( v.boat === boat && !! v.anchor && Math.hypot( v.x - mine.x, v.z - mine.z ) < 12 && v.mode === ( boat === 'kayak' ? 'walk' : mine.mode ), `away (${ boat }): Robin back: the ${ v.boat } at her anchor, ${ v.mode }, ${ Math.hypot( v.x - mine.x, v.z - mine.z ).toFixed( 1 ) } m off` );
		// (who's host: the one who stayed)
		const hosts = [ await sam.game.evaluate( () => window.__app.together.session.isHost ), await robin2.game.evaluate( () => window.__app.together.session.isHost ) ];
		say( hosts[ 0 ] && ! hosts[ 1 ], `away (${ boat }): Sam hosts still, Robin doesn't (${ hosts })` );
		await frames( sam.game, 6 );
		a = await awayOf( sam.game, 'robin-1' );
		note( `Sam's view, her back ${ JSON.stringify( a ) }` );
		say( ! a.entry || ! a.drawn, `away (${ boat }): not drawn twice on Sam's sea` );
		// ---- adrift, the owner gone
		await robin2.game.evaluate( () => {

			const a = window.__app, p = a.player;
			if ( p.mode === 'walk' || p.mode === 'swim' ) p.boardBoat();
			if ( p.mode === 'deck' ) p.takeHelm();

		} );
		await robin2.game.waitForFunction( () => ! window.__app.boatCtl.anchor, null, { timeout: 60000, polling: 300 } ).catch( () => {} );
		await frames( robin2.game, 3 );
		const left = await view( robin2.game );
		await R.leave( robin2 );
		await sam.game.waitForFunction( () => window.__app.together.others.size === 0, null, { timeout: 200000, polling: 500 } );
		await sam.game.waitForFunction( () => { const r = window.__app.together.boats[ 'robin-1' ]; return r && ! r.a; }, null, { timeout: 60000, polling: 500 } ).catch( () => note( 'no adrift record' ) );
		await sam.game.waitForFunction( () => { const a = window.__app.together.away.get( 'robin-1' ); return a && a.boat && a.boat.visible; }, null, { timeout: 120000, polling: 500 } ).catch( () => note( 'adrift not drawn' ) );
		await frames( sam.game, 3 );
		a = await awayOf( sam.game, 'robin-1' );
		note( `Sam's view, adrift ${ JSON.stringify( a ) }` );
		say( !! a.rec && a.rec.a === null && a.drawn && ! a.rode, `away (${ boat }): adrift on Sam's sea, no rode, ${ a.type }` );
		// (three hours on, the room's clock)
		await sam.game.evaluate( () => { const a = window.__app, s = a.settings; a.together.setClock( s.timeOfDay + 3, s.day, s.timeSpeed ); } );
		await sam.page.waitForTimeout( 4000 );
		await frames( sam.game, 12 );
		a = await awayOf( sam.game, 'robin-1' );
		note( `Sam's view, 3 h on ${ JSON.stringify( a ) }` );
		const d3 = a.story ? Math.hypot( a.story.x - left.x, a.story.z - left.z ) : 0;
		say( d3 > 10, `away (${ boat }): three hours on Sam has her ${ d3.toFixed( 0 ) } m downwind (${ a.story && a.story.where })` );
		await sam.page.screenshot( { path: `${ out }/tog-away-${ boat }-sam-adrift.png` } );
		// ---- the owner back, 3 h by her save too: both have her in one place
		await R.ago( 'robin-1', 3 );
		const robin3 = await R.open( 'Robin' );
		await robin3.game.waitForFunction( () => window.__app.together.others.size > 0, null, { timeout: 200000, polling: 1000 } );
		await frames( robin3.game, 3 );
		v = await view( robin3.game );
		note( `Robin back ${ brief( v ) } toasts ${ JSON.stringify( v.toasts ) }` );
		const dOwn = Math.hypot( v.x - left.x, v.z - left.z );
		say( dOwn > 10, `away (${ boat }): Robin back: she's drifted ${ dOwn.toFixed( 0 ) } m by her own reckoning` );
		note( `Sam had her at ${ a.story && [ a.story.x, a.story.z ] }, Robin has her at ${ v.x }, ${ v.z }` );
		say( a.story && Math.hypot( a.story.x - v.x, a.story.z - v.z ) < 150, `away (${ boat }): owner and other agree within a margin: ${ a.story && Math.hypot( a.story.x - v.x, a.story.z - v.z ).toFixed( 0 ) } m apart (150 allowed)` );
		await shots( robin3.page, robin3.game, `${ out }/tog-away-${ boat }-robin-adrift`, { from: [ 12, 8, - 16 ] } );
		// ---- gone again, and a hurricane's warning: Marta tows her; the owner back, on the cradle, her note
		await robin3.game.evaluate( () => {

			const a = window.__app, st = a.game.state;
			st.money = 900;
			st.save();

		} );
		await R.leave( robin3 );
		await sam.game.waitForFunction( () => window.__app.together.others.size === 0, null, { timeout: 200000, polling: 500 } );
		await sam.game.waitForFunction( () => window.__app.together.boats[ 'robin-1' ], null, { timeout: 60000, polling: 500 } ).catch( () => {} );
		await sam.game.evaluate( async () => {

			const app = window.__app;
			await app.together._saveBoats( ( cur ) => {

				cur[ 'robin-1' ].at -= 6 * 60e3;
				return cur;

			} );
			app.together.setWeather( 'hurricane', app.settings.weatherSince || 0 );

		} );
		await sam.game.waitForFunction( () => { const t = window.__app.together, r = t.boats[ 'robin-1' ]; if ( ! r || ! r.tow ) t._keepT = 9.9; return r && r.tow; }, null, { timeout: 240000, polling: 1000 } ).catch( () => note( 'no tow' ) );
		a = await awayOf( sam.game, 'robin-1' );
		note( `Sam's view, towed ${ JSON.stringify( a.rec ) }` );
		const tow = a.rec && a.rec.tow;
		say( tow && tow.why === 'hurricane' && tow.where === 'cradle', `away (${ boat }): a hurricane's warning, Marta fetched her: $${ tow && tow.fee } over ${ tow && Math.round( tow.metres ) } m` );
		await frames( sam.game, 6 );
		a = await awayOf( sam.game, 'robin-1' );
		say( ! a.drawn, `away (${ boat }): gone from Sam's sea` );
		await R.ago( 'robin-1', 0.2 );
		const robin4 = await R.open( 'Robin' );
		await robin4.game.waitForFunction( () => window.__app.together.others.size > 0, null, { timeout: 200000, polling: 1000 } );
		await robin4.game.waitForFunction( () => !! window.__app.boatCtl.hauled, null, { timeout: 200000, polling: 1000 } ).catch( () => note( 'not on the cradle' ) );
		await robin4.game.waitForFunction( () => window.__app.game.hud && window.__app.game.hud.noteOpen, null, { timeout: 120000, polling: 500 } ).catch( () => note( 'no note' ) );
		v = await view( robin4.game );
		note( `Robin back ${ brief( v ) }` );
		note( `note: ${ v.note }` );
		say( v.boat === boat && v.hauled && !! v.note && /hurricane/.test( v.note ), `away (${ boat }): Robin back: on her cradle, the note there` );
		// (and any she has at their berths: the kayak that came free with the fleet: Hauled ... as well: $5)
		const also = [ ...( v.note || '' ).matchAll( /as well: \$(\d+)/g ) ].reduce( ( n, m ) => n + Number( m[ 1 ] ), 0 );
		say( tow && v.money === Math.max( 0, 900 - tow.fee - also ), `away (${ boat }): she paid the $${ tow && tow.fee } and $${ also } for those at their berths: $${ v.money } left` );
		await frames( robin4.game, 6 );
		const gone = await awayOf( sam.game, 'robin-1' );
		say( ! gone.rec, `away (${ boat }): her record's gone from the group's save (${ JSON.stringify( gone.rec ) })` );
		await shots( robin4.page, robin4.game, `${ out }/tog-away-${ boat }-robin-cradle`, { outside: false } );
		await R.close();

	},

	// a guest aboard: the owner goes (and the guest's own coming back); a guest's come back to one who's no longer there
	async guest( boat ) {

		const R = await room( `guest-${ boat }` );
		const robin = await R.open( 'Robin', boat );
		const sam = await R.open( 'Sam', 'console' );
		await sam.game.waitForFunction( () => { const o = [ ...window.__app.together.others.values() ][ 0 ]; return o && o.cur && o.cur.boat; }, null, { timeout: 200000, polling: 1000 } );
		const spot = await farSpot( robin.game, { max: boat === 'kayak' ? 9 : 18 } );
		const mine = boat === 'kayak' ? await atSea( robin.game, spot ).then( () => frames( robin.game, 3 ) ).then( () => view( robin.game ) ) : await anchored( robin.game, boat, spot );
		await sam.game.waitForFunction( ( s ) => { const o = [ ...window.__app.together.others.values() ][ 0 ]; return o.cur && o.cur.boat && Math.hypot( o.cur.boat.pos.x - s.x, o.cur.boat.pos.z - s.z ) < 60; }, spot, { timeout: 200000, polling: 500 } );
		const boardAt = async () => {

			await sam.game.evaluate( ( [ x, z ] ) => {

				const a = window.__app, p = a.player;
				p.position.set( x + 3, a.waves.heightAt( x + 3, z + 3 ) - 0.2, z + 3 );
				p.mode = 'swim';
				p.velocity.set( 0, 0, 0 );
				p.floating = true;

			}, [ mine.x, mine.z ] );
			await sam.game.waitForFunction( () => { const o = [ ...window.__app.together.others.values() ][ 0 ]; return o && o.boat && o.boat.visible; }, null, { timeout: 200000, polling: 500 } ).catch( () => note( 'her copy not drawn' ) );
			await sam.game.evaluate( ( [ x, z ] ) => {

				// (at her board point)
				const a = window.__app, t = a.together, o = [ ...t.others.values() ][ 0 ], p = a.player, M = o && o.boat && o.boat.userData.model;
				if ( ! M ) return;
				const bp = M.boardPoint.clone().applyQuaternion( o.boat.quaternion ).add( o.boat.position );
				p.position.set( bp.x, bp.y + 0.1, bp.z );

			}, [ mine.x, mine.z ] );
			await sam.game.waitForFunction( () => !! window.__app.player.rideOffer, null, { timeout: 120000, polling: 300 } ).catch( () => note( 'no ride offered' ) );
			return sam.game.evaluate( () => {

				const p = window.__app.player;
				if ( ! p.rideOffer ) return false;
				p.ride( p.rideOffer.boat );
				return true;

			} );

		};

		let rode = await boardAt();
		await frames( sam.game, 4 );
		let v = await view( sam.game );
		note( `Sam aboard ${ brief( v ) }` );
		say( rode && v.riding, `guest (${ boat }): Sam's aboard Robin's, riding (${ v.mode }, you at ${ v.you })` );
		await sam.page.screenshot( { path: `${ out }/tog-guest-${ boat }-riding.png` } );
		// ---- the owner goes at anchor: Sam's still aboard her (she's on everyone's sea); the guest's own boat's where it was
		await R.leave( robin );
		await sam.game.waitForFunction( () => window.__app.together.others.size === 0, null, { timeout: 200000, polling: 500 } );
		await sam.page.waitForTimeout( 5000 );
		await frames( sam.game, 6 );
		v = await view( sam.game );
		const a = await awayOf( sam.game, 'robin-1' );
		note( `Sam, her owner gone ${ brief( v ) } toasts ${ JSON.stringify( v.toasts ) } ${ JSON.stringify( a ) }` );
		say( Number.isFinite( v.you[ 0 ] ) && ( v.riding ? Math.hypot( v.you[ 0 ] - mine.x, v.you[ 2 ] - mine.z ) < 30 : v.mode === 'swim' ), `guest (${ boat }): her owner's gone, she's at anchor: Sam ${ v.riding ? 'rides on' : 'is in the water' } (${ v.mode } at ${ v.you })` );
		await sam.page.screenshot( { path: `${ out }/tog-guest-${ boat }-owner-gone.png` } );
		// ---- the guest goes too, comes back: on their own, ashore or in their own boat
		const ownBefore = v;
		await R.leave( sam );
		const sam2 = await R.open( 'Sam' );
		await frames( sam2.game, 4 );
		v = await view( sam2.game );
		note( `Sam back ${ brief( v ) }` );
		say( ! v.riding && v.boat === 'console' && ( v.moored || v.beached ) && Math.hypot( v.x - ownBefore.x, v.z - ownBefore.z ) < 5, `guest (${ boat }): Sam's come back: not riding, his own console at her berth (${ v.x }, ${ v.z })` );
		say( v.mode === 'walk', `guest (${ boat }): Sam's ashore (${ v.mode } at ${ v.you })` );
		say( ! v.veil && v.inScene, `guest (${ boat }): no veil, his boat's in the scene` );
		await shots( sam2.page, sam2.game, `${ out }/tog-guest-${ boat }-sam-back`, { outside: false } );
		// ---- Robin back, Sam rides again; Sam goes; Robin takes her home so she's no longer there; Sam comes back
		const robin2 = await R.open( 'Robin' );
		await robin2.game.waitForFunction( () => window.__app.together.others.size > 0, null, { timeout: 200000, polling: 1000 } );
		await robin2.game.evaluate( () => {

			const a = window.__app, b = a.boatCtl, p = a.player;
			if ( p.mode === 'boat' && ! a.boat.seated ) p.leaveHelm();
			if ( p.mode === 'boat' || p.mode === 'deck' ) p.exitBoat( { out: { x: 55, z: 20 }, g: 2.5 } );
			b.reset();
			a.saveBoat();

		} );
		await robin2.game.evaluate( () => window.__app.together.mineBoat( true ) );
		await frames( robin2.game, 2 );
		await R.leave( robin2 );
		await sam2.game.waitForFunction( () => window.__app.together.others.size === 0, null, { timeout: 200000, polling: 500 } );
		await frames( sam2.game, 2 );
		const gone = await awayOf( sam2.game, 'robin-1' );
		say( ! gone.drawn, `guest (${ boat }): Robin's taken her home and gone: nothing left drawn out there on Sam's sea (${ JSON.stringify( gone.rec ) })` );
		await R.close();

	},

	// a guest gone while aboard, the boat gone before they come back
	async vanish( boat ) {

		const R = await room( `vanish-${ boat }` );
		const robin = await R.open( 'Robin', boat );
		const sam = await R.open( 'Sam', 'console' );
		await sam.game.waitForFunction( () => { const o = [ ...window.__app.together.others.values() ][ 0 ]; return o && o.cur && o.cur.boat; }, null, { timeout: 200000, polling: 1000 } );
		const spot = await farSpot( robin.game, { max: boat === 'kayak' ? 9 : 18 } );
		const mine = boat === 'kayak' ? await atSea( robin.game, spot ).then( () => frames( robin.game, 3 ) ).then( () => view( robin.game ) ) : await anchored( robin.game, boat, spot );
		await sam.game.waitForFunction( ( s ) => { const o = [ ...window.__app.together.others.values() ][ 0 ]; return o.cur && o.cur.boat && Math.hypot( o.cur.boat.pos.x - s.x, o.cur.boat.pos.z - s.z ) < 60; }, spot, { timeout: 200000, polling: 500 } );
		await sam.game.evaluate( ( [ x, z ] ) => {

			const a = window.__app, p = a.player;
			p.position.set( x + 3, a.waves.heightAt( x + 3, z + 3 ) - 0.2, z + 3 );
			p.mode = 'swim';
			p.velocity.set( 0, 0, 0 );
			p.floating = true;

		}, [ mine.x, mine.z ] );
		await sam.game.waitForFunction( () => { const o = [ ...window.__app.together.others.values() ][ 0 ]; return o && o.boat && o.boat.visible; }, null, { timeout: 200000, polling: 500 } ).catch( () => note( 'her copy not drawn' ) );
		await sam.game.evaluate( () => {

			const a = window.__app, o = [ ...a.together.others.values() ][ 0 ], p = a.player, M = o && o.boat && o.boat.userData.model;
			if ( ! M ) return;
			const bp = M.boardPoint.clone().applyQuaternion( o.boat.quaternion ).add( o.boat.position );
			p.position.set( bp.x, bp.y + 0.1, bp.z );

		} );
		await sam.game.waitForFunction( () => !! window.__app.player.rideOffer, null, { timeout: 120000, polling: 300 } ).catch( () => note( 'no ride offered' ) );
		const rode = await sam.game.evaluate( () => { const p = window.__app.player; if ( ! p.rideOffer ) return false; p.ride( p.rideOffer.boat ); return true; } );
		await frames( sam.game, 3 );
		const v0 = await view( sam.game );
		say( rode && v0.riding, `vanish (${ boat }): Sam's aboard far out (${ v0.mode } at ${ v0.you })` );
		// the guest goes, as he rides
		await R.leave( sam );
		// Robin brings her home and goes too
		await robin.game.evaluate( () => {

			const a = window.__app, b = a.boatCtl, p = a.player;
			if ( p.mode === 'boat' && ! a.boat.seated ) p.leaveHelm();
			if ( p.mode === 'boat' || p.mode === 'deck' ) p.exitBoat( { out: { x: 55, z: 20 }, g: 2.5 } );
			b.reset();
			a.saveBoat();

		} );
		await robin.game.evaluate( () => window.__app.together.mineBoat( true ) );
		await frames( robin.game, 2 );
		await R.leave( robin );
		// the guest back to an empty room
		const sam2 = await R.open( 'Sam' );
		await frames( sam2.game, 4 );
		const v = await view( sam2.game );
		note( `Sam back ${ brief( v ) }` );
		say( ! v.riding && v.mode === 'walk' && v.boat === 'console' && ( v.moored || v.beached ), `vanish (${ boat }): Sam back, the boat he rode no longer there: ashore (${ v.you }), his own console at her berth` );
		say( ! v.veil && v.inScene, `vanish (${ boat }): no veil` );
		const g = await sam2.game.evaluate( () => Object.keys( window.__app.together.boats ) );
		say( ! g.includes( 'robin-1' ), `vanish (${ boat }): no record of her left (${ g })` );
		await shots( sam2.page, sam2.game, `${ out }/tog-vanish-${ boat }-sam-back`, { outside: false } );
		await R.close();

	},

	// a room days on from your own clock: she left her boat adrift on day 1, the host's on day 5 (or one on, inside what's taken for a rest)
	async clocks( boat ) {

		for ( const days of [ 4, 1 ] ) {

			const R = await room( `clocks-${ boat }-${ days }` );
			const robin = await R.open( 'Robin', boat );
			await robin.game.evaluate( () => { const st = window.__app.game.state; st.money = 900; st.save(); st.emit(); } );
			const spot = await farSpot( robin.game, { max: 18 } );
			await atSea( robin.game, spot );
			await frames( robin.game, 3 );
			const left = await view( robin.game );
			note( `Robin, adrift at the helm, day ${ left.day } ${ left.hour }: ${ left.x }, ${ left.z }` );
			await R.leave( robin );
			const sam = await R.open( 'Sam', 'lobster' );
			await sam.game.evaluate( ( days ) => { const a = window.__app, s = a.settings; a.together.setClock( s.timeOfDay, s.day + days, s.timeSpeed ); }, days );
			await sam.game.waitForFunction( () => window.__app.together.boats[ 'robin-1' ], null, { timeout: 60000, polling: 500 } ).catch( () => note( 'no record' ) );
			await sam.page.waitForTimeout( 4000 );
			await frames( sam.game, 6 );
			let a = await awayOf( sam.game, 'robin-1' );
			note( `Sam's view, the room ${ days } days on ${ JSON.stringify( a ) }` );
			const robin2 = await R.open( 'Robin' );
			await robin2.game.waitForFunction( () => window.__app.together.others.size > 0, null, { timeout: 200000, polling: 1000 } );
			await robin2.page.waitForTimeout( 12000 );
			await frames( robin2.game, 4 );
			await sam.game.waitForFunction( () => { const o = [ ...window.__app.together.others.values() ][ 0 ]; return o && o.cur && o.cur.boat; }, null, { timeout: 200000, polling: 1000 } ).catch( () => note( 'no pose' ) );
			const v = await view( robin2.game ), t = await them( sam.game ), v2 = await view( sam.game );
			note( `Robin back ${ brief( v ) } toasts ${ JSON.stringify( v.toasts ) } note ${ v.note }` );
			note( `Sam sees ${ JSON.stringify( t ) } (day ${ v2.day } ${ v2.hour })` );
			say( v.day === v2.day && Math.abs( v.hour - v2.hour ) < 0.5, `clocks ${ days } d (${ boat }): one clock in the room: day ${ v.day } ${ v.hour }, day ${ v2.day } ${ v2.hour }` );
			say( v.boat === boat && ! v.veil && v.inScene, `clocks ${ days } d (${ boat }): Robin's back in her ${ boat }, no veil` );
			say( Math.hypot( v.x - left.x, v.z - left.z ) < 30, `clocks ${ days } d (${ boat }): a reload's not being away: she's ${ Math.hypot( v.x - left.x, v.z - left.z ).toFixed( 0 ) } m from where she left her` );
			say( v.mode === left.mode, `clocks ${ days } d (${ boat }): at her helm as she was (${ left.mode } -> ${ v.mode })` );
			const o = t.list[ 0 ];
			say( o && o.at && Math.hypot( o.at[ 0 ] - v.x, o.at[ 1 ] - v.z ) < 25, `clocks ${ days } d (${ boat }): both have her in one place: ${ o && o.at && Math.hypot( o.at[ 0 ] - v.x, o.at[ 1 ] - v.z ).toFixed( 1 ) } m apart` );
			await R.close();

		}

	},

	// the host leaving, a guest rides on, hosts on; the host's own boat
	async host( boat ) {

		const R = await room( `host-${ boat }` );
		const robin = await R.open( 'Robin', boat );
		const sam = await R.open( 'Sam', 'lobster' );
		await sam.game.waitForFunction( () => window.__app.together.others.size > 0, null, { timeout: 200000, polling: 1000 } );
		await robin.game.waitForFunction( () => window.__app.together.others.size > 0, null, { timeout: 200000, polling: 1000 } );
		say( await robin.game.evaluate( () => window.__app.together.session.isHost ) && ! await sam.game.evaluate( () => window.__app.together.session.isHost ), `host (${ boat }): Robin hosts, having come first` );
		const spot = await farSpot( robin.game, { max: boat === 'kayak' ? 9 : 18 } );
		const mine = await anchored( robin.game, boat, spot );
		const clock0 = await view( sam.game );
		// (the save's every 30 s of the game's time, on a CPU's few frames some minutes: its turn brought on, a moment for it to go)
		await robin.game.evaluate( () => window.__app._clockSaveT = 0.01 );
		await robin.game.waitForFunction( () => window.__app._clockSaveT > 1, null, { timeout: 120000, polling: 200 } );
		await robin.page.waitForTimeout( 5000 );
		// at a stroke: no pause, the page gone
		await R.leave( robin, { abrupt: true } );
		await sam.game.waitForFunction( () => window.__app.together.others.size === 0 && window.__app.together.session.isHost, null, { timeout: 200000, polling: 500 } ).catch( () => note( 'Sam did not take over' ) );
		const hostNow = await sam.game.evaluate( () => window.__app.together.session.isHost );
		say( hostNow, `host (${ boat }): she went at a stroke, Sam hosts` );
		await sam.page.waitForTimeout( 4000 );
		const a = await awayOf( sam.game, 'robin-1' );
		note( `Sam's view ${ JSON.stringify( a ) }` );
		say( !! a.rec, `host (${ boat }): her record there all the same (anchored ${ a.rec && a.rec.a })` );
		const v = await view( sam.game );
		say( Math.abs( ( v.day - clock0.day ) * 24 + v.hour - clock0.hour ) < 2, `host (${ boat }): Sam's clock goes on (${ clock0.day } ${ clock0.hour } -> ${ v.day } ${ v.hour })` );
		// she comes back to what she'd saved last
		const robin2 = await R.open( 'Robin' );
		await robin2.game.waitForFunction( () => window.__app.together.others.size > 0, null, { timeout: 200000, polling: 1000 } );
		await frames( robin2.game, 2 );
		const b = await view( robin2.game );
		note( `Robin back ${ brief( b ) }` );
		say( b.boat === boat && ! b.veil && b.inScene, `host (${ boat }): Robin's back in the ${ b.boat }, no veil` );
		say( Math.hypot( b.x - mine.x, b.z - mine.z ) < 30, `host (${ boat }): where she was left (${ Math.hypot( b.x - mine.x, b.z - mine.z ).toFixed( 1 ) } m off)` );
		note( `(with no pause, her save's the last it had: every 30 s, so her mode ${ b.mode }, anchor ${ JSON.stringify( b.anchor ) })` );
		await R.close();

	},

};

for ( const boat of BOATS.split( ',' ) ) for ( const name of Object.keys( SC ) ) {

	if ( wanted && ! wanted.includes( name ) ) continue;
	console.log( `---- ${ boat }: ${ name }` );
	try {

		await SC[ name ]( boat );

	} catch ( e ) {

		say( false, `${ boat } ${ name } ABORTED: ${ e.message.slice( 0, 400 ) }` );

	}

}

const { oks, problems } = tally();
console.log( problems ? `${ problems } PROBLEM(S), ${ oks } ok` : `no problems, ${ oks } ok` );
await browser.close();
