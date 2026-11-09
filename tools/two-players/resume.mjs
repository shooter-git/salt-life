// (M16) Picking up where you left off, alone, in each boat: a real game in a driven browser (the SDK's stand-in keeps your save in the
// browser), a real load of the page each time. Her times are faked in the saved records between visits, never the state in the game.
// (M17) And where you were: each place on her deck (aboard), her upper helm, in the water by her far out (swim), the kayak at anchor
// with you sat in her (kayakanchor).
//   tools/render-slot.sh node tools/two-players/resume.mjs [dir for screenshots] [port] [boats: kayak,console,...] [scenarios: berth,anchor,...]
// Each's about a minute a load on the CPU: a run's capped at 25 minutes, so split them. Screenshots are <dir>/<boat>-<scenario>-seen.png (what you
// see) and -out.png (her from outside).
import { launch, say, note, tally, watch, toastWatch, started, frames, quiet, view, brief, shots, saveNow, swimTo, farSpot, BOAT_IDS, ANCHOR, SOCK } from './resume-lib.mjs';
const [ out = 'qa-output', PORT = '5222', BOATS = BOAT_IDS.join(), SCENS = '' ] = process.argv.slice( 2 );
const base = `http://127.0.0.1:${ PORT }`, plain = `${ base }/?tier=low`;
const browser = await launch();
const wanted = SCENS ? SCENS.split( ',' ) : null;
const readings = [];

async function session( boat ) {

	const ctx = await browser.newContext( { viewport: { width: 640, height: 360 } } );
	await ctx.addInitScript( toastWatch );
	await ctx.route( '**/__blank', ( r ) => r.fulfill( { contentType: 'text/html', body: '<!doctype html><title>away</title>' } ) );
	const page = await ctx.newPage();
	watch( page, boat );
	const S = {
		page, ctx, boat,
		// a real load, in her
		async load( url = plain, how = 'goto', label = '' ) {

			const go = how === 'reload' ? () => page.reload( { timeout: 180000 } ) : () => page.goto( url, { timeout: 180000 } );
			const t = Date.now();
			await go();
			const g = await started( page, { page, reload: go } );
			await quiet( g );
			const v = await view( g );
			readings.push( { boat, label, ready: v.ready, wall: Date.now() - t } );
			note( `load (${ label || how }): ready ${ v.ready } ms` );
			return v;

		},
		// a true reload of the page
		reload( label ) {

			// (a page with ?boat= in its address would pick her again: the first's to the plain address, a load like any other)
			return S.load( plain, page.url().includes( 'boat=' ) ? 'goto' : 'reload', label );

		},
		// gone from the page, and back to it with the records as they'd be: edit( { progress, clock, boat } ) changes them
		async gone( hours, edit = null, label = '' ) {

			await page.goto( `${ base }/__blank` );
			await page.evaluate( ( [ hours, edit ] ) => {

				const key = ( k ) => `ats-standalone:personal:${ k }`, get = ( k ) => JSON.parse( localStorage.getItem( key( k ) ) || 'null' ), put = ( k, e ) => localStorage.setItem( key( k ), JSON.stringify( e ) );
				const boat = get( 'boat' ), clock = get( 'clock' ), progress = get( 'progress' ), ms = hours * 3600e3;
				if ( boat && boat.value.at ) boat.value.at -= ms;
				if ( clock && clock.value.at ) clock.value.at -= ms;
				if ( edit ) new Function( 'boat', 'clock', 'progress', edit )( boat && boat.value, clock && clock.value, progress && progress.value );
				for ( const [ k, e ] of [ [ 'boat', boat ], [ 'clock', clock ], [ 'progress', progress ] ] ) if ( e ) put( k, e );

			}, [ hours, edit ] );
			return S.load( plain, 'goto', label || `gone ${ hours } h` );

		},
		records() {

			return page.evaluate( () => {

				const key = ( k ) => JSON.parse( localStorage.getItem( `ats-standalone:personal:${ k }` ) || 'null' );
				return { boat: key( 'boat' )?.value, clock: key( 'clock' )?.value };

			} );

		},
		get g() {

			return page.mainFrame();

		},
		// out there at the helm, at speed nil
		toSea( at ) {

			return S.g.evaluate( ( at ) => {

				const a = window.__app, b = a.boatCtl, p = a.player;
				if ( p.mode === 'walk' || p.mode === 'swim' ) {

					p.boardBoat();
					if ( p.mode !== 'boat' ) p.takeHelm();

				} else if ( p.mode === 'deck' ) p.takeHelm();

				b.moored = b.beached = false;
				if ( b.model.sliding !== undefined ) b.model.sliding = null;
				b.position.set( at.x, b.position.y < 0.5 ? b.position.y : 0, at.z );
				b.velocity.set( 0, 0, 0 );
				b.angular.set( 0, 0, 0 );
				b.throttle = 0;
				b.speed = 0;
				b.hasWater = false;
				a.player.camMode = 'third';

			}, at );

		},
		fitted( ...tracks ) {

			return S.g.evaluate( ( tracks ) => {

				const st = window.__app.game.state;
				for ( const t of tracks ) st.upgrades[ t ] = 1;
				st.save();
				st.emit();

			}, tracks );

		},
		// (fuel: of her tank)
		set( fields ) {

			return S.g.evaluate( ( f ) => {

				const st = window.__app.game.state;
				if ( f.fuel ) f.fuel = Math.round( f.fuel * st.stats.fuelL * 10 ) / 10;
				if ( ! st.stats.fuelL ) delete f.fuel;
				Object.assign( st, f );
				st.save();
				st.emit();

			}, fields );

		},
		async close() {

			await ctx.close();

		},
	};
	return S;

}

const near = ( a, b, m ) => Math.hypot( a.x - b.x, a.z - b.z ) <= m;
const good = ( v, what ) => {

	say( ! v.veil, `${ what }: no veil up` );
	say( v.inScene && v.shown, `${ what }: she's in the scene and shown` );
	say( Number.isFinite( v.x + v.y + v.z ), `${ what }: her pose is numbers` );

};
const sameBoat = ( v, boat, what ) => say( v.boat === boat && v.model === boat, `${ what }: in the ${ boat } (${ v.boat }/${ v.model })` );
const kept = ( v, was, what ) => {

	say( v.fuel === was.fuel, `${ what }: fuel kept ${ was.fuel } -> ${ v.fuel } (HUD ${ v.hud.fuel })` );
	say( Math.abs( v.hull - was.hull ) < 0.002, `${ what }: hull kept ${ was.hull } -> ${ v.hull } (HUD ${ v.hud.hull })` );
	say( v.money === was.money, `${ what }: money kept $${ was.money } -> $${ v.money } (HUD ${ v.hud.money })` );

};
const settled = async ( S, v0, what, m = 12 ) => {

	// (a while on: not flung, not sunk, nothing's gone wrong in the frames since)
	await S.page.waitForTimeout( 12000 );
	await frames( S.g, 4 );
	const v = await view( S.g );
	say( Math.hypot( v.x - v0.x, v.z - v0.z ) < m && Number.isFinite( v.y ) && Math.abs( v.y - v.sea ) < 3, `${ what }: a while on she's stayed (moved ${ Math.hypot( v.x - v0.x, v.z - v0.z ).toFixed( 1 ) } m, y ${ v.y }, sea ${ v.sea })` );
	return v;

};
// off her helm (out of a kayak, over her side), and her anchor down, as the game does it
const leaveHer = async ( g ) => {

	await g.evaluate( () => {

		const a = window.__app;
		if ( a.boat.seated ) a.player.exitBoat( null, 1 );
		else a.player.leaveHelm();

	} );
	await g.waitForFunction( () => !! window.__app.boatCtl.anchor, null, { timeout: 60000, polling: 300 } ).catch( () => note( 'no anchor came down' ) );

};
const hoursBetween = ( a, b ) => ( b.day - a.day ) * 24 + b.hour - a.hour;

const SC = {

	// left at her berth
	async berth( S ) {

		const { boat, g, page } = S, F = `${ out }/${ boat }-berth`;
		await S.load( `${ plain }&boat=${ boat }`, 'goto', 'first, ?boat' );
		await S.set( { fuel: 0.61, hull: 0.123, money: 777 } );
		await frames( g, 2 );
		const was = await view( g );
		await saveNow( g );
		const v = await S.load( plain, 'goto', 'at home' );
		note( brief( v ) );
		sameBoat( v, boat, 'berth' );
		good( v, 'berth' );
		kept( v, was, 'berth' );
		say( near( v, was, 3 ) && ( v.moored || v.beached ), `berth: at her berth ${ boat === 'kayak' ? 'on the sand' : 'moored' }, where she was (${ v.x }, ${ v.z })` );
		say( v.mode === 'walk' && ! v.note, `berth: you ashore, no note (${ v.mode })` );
		await settled( S, v, 'berth' );
		await shots( page, g, F, { from: boat === 'kayak' ? [ 5, 3, - 7 ] : [ 16, 8, - 16 ] } );
		const v2 = await S.reload( 'at home, again' );
		say( v2.boat === boat && near( v2, was, 3 ), 'berth: and again, by a real reload' );

	},

	// far out at anchor: on her deck; a while later; at her helm she's adrift; left adrift; on her sock
	async anchor( S ) {

		const { boat, g, page } = S, F = `${ out }/${ boat }-anchor`;
		await S.load( `${ plain }&boat=${ boat }`, 'goto', 'first, ?boat' );
		await S.fitted( ANCHOR[ boat ] );
		await S.set( { fuel: 0.72, hull: 0.05, money: 555 } );
		const at = await farSpot( g, { max: boat === 'kayak' ? 9 : 18 } );
		note( `the spot ${ JSON.stringify( at ) }` );
		await S.toSea( at );
		await frames( g, 3 );
		// (out of a kayak over her side, her anchor goes down as a deck boat's does as you leave her helm: Game.updateAnchor)
		await g.evaluate( () => {

			const a = window.__app;
			if ( a.boat.seated ) a.player.exitBoat( null, 1 );
			else a.player.leaveHelm();

		} );
		await g.waitForFunction( () => !! window.__app.boatCtl.anchor, null, { timeout: 60000, polling: 300 } ).catch( () => {} );
		await frames( g, 3 );
		const was = await view( g );
		say( !! was.anchor, `anchor: down (${ JSON.stringify( was.anchor ) }) in ${ was.depth } m, mode ${ was.mode }` );
		await saveNow( g );
		let v = await S.reload( 'far out, just gone' );
		note( brief( v ) );
		sameBoat( v, boat, 'anchor' );
		good( v, 'anchor' );
		kept( v, was, 'anchor' );
		say( near( v, was, 2 ), `anchor: she's where she was, ${ Math.hypot( v.x - was.x, v.z - was.z ).toFixed( 2 ) } m off` );
		say( v.anchor && Math.hypot( v.anchor[ 0 ] - was.anchor[ 0 ], v.anchor[ 1 ] - was.anchor[ 1 ] ) < 0.2, 'anchor: her anchor where it was' );
		say( v.mode === was.mode, `anchor: ${ boat === 'kayak' ? '(M17) in the water when you left, in the water by her now' : 'aboard as you were' } (${ was.mode } -> ${ v.mode })` );
		say( ! v.note, `anchor: no note (a reload's not being away): ${ v.note || '' }` );
		await settled( S, v, 'anchor', boat === 'kayak' ? 16 : 40 );
		await shots( page, g, F );
		await saveNow( g );
		const clock = await view( g );
		// ---- three hours gone
		v = await S.gone( 3, null, 'far out, 3 h gone' );
		note( brief( v ) );
		say( near( v, was, 45 ) && v.anchor, `anchor 3 h: still at her anchor, ${ Math.hypot( v.x - was.x, v.z - was.z ).toFixed( 1 ) } m from where she was` );
		say( Math.abs( hoursBetween( clock, v ) - 3 ) < 0.5, `anchor 3 h: the clock's gone on (${ hoursBetween( clock, v ).toFixed( 2 ) } h: day ${ clock.day } ${ clock.hour } -> day ${ v.day } ${ v.hour })` );
		say( v.mode === was.mode, `anchor 3 h: where you were (${ v.mode })` );
		good( v, 'anchor 3 h' );
		await shots( page, g, `${ F }-3h` );
		// ---- at her helm: the anchor comes up, she's adrift
		await g.evaluate( () => {

			const a = window.__app, p = a.player;
			if ( p.mode === 'walk' || p.mode === 'swim' ) p.boardBoat();
			if ( p.mode === 'deck' ) p.takeHelm();

		} );
		await g.waitForFunction( () => ! window.__app.boatCtl.anchor, null, { timeout: 60000, polling: 300 } ).catch( () => {} );
		await frames( g, 2 );
		const helm = await view( g );
		await saveNow( g );
		v = await S.reload( 'far out at the helm' );
		note( brief( v ) );
		sameBoat( v, boat, 'helm' );
		good( v, 'helm' );
		say( v.mode === 'boat' && v.driven, `helm: at her helm again (${ v.mode })` );
		say( near( v, helm, 3 ), `helm: where she was, ${ Math.hypot( v.x - helm.x, v.z - helm.z ).toFixed( 2 ) } m off` );
		say( ! v.anchor, 'helm: no anchor out' );
		await frames( g, 3 );
		await shots( page, g, `${ F }-helm` );
		await saveNow( g );
		const h0 = await view( g );
		v = await S.gone( 3, null, 'far out at the helm, 3 h gone' );
		note( brief( v ) );
		const d3 = Math.hypot( v.x - h0.x, v.z - h0.z );
		say( d3 > 20 && v.mode === 'boat', `helm 3 h: she drifted ${ d3.toFixed( 0 ) } m with you at her helm (${ v.mode })` );
		note( `toasts ${ JSON.stringify( v.toasts ) } note ${ v.note }` );
		// ---- nobody aboard, adrift: over the side and home
		await g.evaluate( ( t ) => {

			const a = window.__app, p = a.player, b = a.boatCtl, st = a.game.state;
			// (with no anchor aboard, or it'd go down as she's left)
			st.upgrades[ t ] = 0;
			st.save();
			if ( p.mode === 'boat' && ! a.boat.seated ) p.leaveHelm();
			p.exitBoat( null, 1 );
			b.driven = false;

		}, ANCHOR[ boat ] );
		await frames( g, 2 );
		const adrift = await view( g );
		say( adrift.mode === 'swim', `adrift: you're in the water (${ adrift.mode }), she's ${ adrift.anchor ? 'anchored?' : 'adrift' }` );
		await saveNow( g );
		const rec = await S.records();
		note( `her record ${ JSON.stringify( rec.boat ) }` );
		v = await S.gone( 3, null, 'adrift, 3 h gone' );
		note( brief( v ) );
		const dA = Math.hypot( v.x - adrift.x, v.z - adrift.z );
		sameBoat( v, boat, 'adrift' );
		say( dA > 20 && ! v.anchor && ! v.moored, `adrift 3 h: she drifted ${ dA.toFixed( 0 ) } m (${ JSON.stringify( v.toasts ) })` );
		say( v.mode === 'swim' && Math.hypot( v.you[ 0 ] - v.x, v.you[ 2 ] - v.z ) < 30, `adrift 3 h: (M17) in the water by her still, where she's drifted (${ v.mode } at ${ v.you }, ${ Math.hypot( v.you[ 0 ] - v.x, v.you[ 2 ] - v.z ).toFixed( 1 ) } m from her)` );
		good( v, 'adrift 3 h' );
		await shots( page, g, `${ F }-adrift-you`, { outside: false } );
		await swimTo( g );
		await frames( g, 6 );
		await shots( page, g, `${ F }-adrift-her`, { outside: false } );
		// ---- her drift sock, too deep to anchor
		await S.fitted( SOCK[ boat ] );
		const deep = { x: adrift.x, z: adrift.z };
		await S.toSea( deep );
		await frames( g, 3 );
		await g.evaluate( () => {

			const a = window.__app;
			if ( a.boat.seated ) a.player.exitBoat( null, 1 );
			else a.player.leaveHelm();

		} );
		const gotSock = await g.waitForFunction( () => window.__app.boatCtl.sock, null, { timeout: 60000, polling: 300 } ).then( () => true ).catch( () => false );
		const sock = await view( g );
		say( gotSock && sock.sock, `sock: out, too deep to anchor (${ sock.depth } m) ${ JSON.stringify( sock.toasts.slice( - 1 ) ) } mode ${ sock.mode }` );
		await saveNow( g );
		v = await S.reload( 'on her sock' );
		note( brief( v ) );
		say( v.sock && near( v, sock, 5 ), `sock: still out after a reload, ${ Math.hypot( v.x - sock.x, v.z - sock.z ).toFixed( 1 ) } m off` );
		say( v.mode === sock.mode, `sock: where you were (${ sock.mode } -> ${ v.mode })` );
		await frames( g, 3 );
		const s0 = await view( g );
		await shots( page, g, `${ F }-sock` );
		await saveNow( g );
		v = await S.gone( 3, null, 'on her sock, 3 h gone' );
		note( brief( v ) );
		const dS = Math.hypot( v.x - s0.x, v.z - s0.z );
		say( v.sock && dS > 1 && dS < dA, `sock 3 h: drifted ${ dS.toFixed( 0 ) } m, less than her ${ dA.toFixed( 0 ) } m adrift (the weather's the day's: a guide only)` );
		await S.g.evaluate( () => {} );

	},

	// aboard: the helm and deck are above; the sportfisher's bridge, tower, cabin; the kayak on the sand and in her at sea
	async aboard( S ) {

		const { boat, g, page } = S, F = `${ out }/${ boat }-aboard`;
		await S.load( `${ plain }&boat=${ boat }`, 'goto', 'first, ?boat' );
		await S.set( { fuel: 0.55, hull: 0.02, money: 300 } );
		// at the dock, aboard
		const home = await view( g );
		await g.evaluate( () => window.__app.player.boardBoat() );
		await frames( g, 3 );
		const dockDeck = await view( g );
		await saveNow( g );
		let v = await S.reload( 'aboard at home' );
		note( brief( v ) );
		sameBoat( v, boat, 'aboard at home' );
		say( v.mode === dockDeck.mode && near( v, home, 12 ), `aboard at home: ${ v.mode } (was ${ dockDeck.mode }), ${ Math.hypot( v.x - home.x, v.z - home.z ).toFixed( 1 ) } m from her start` );
		good( v, 'aboard at home' );
		await shots( page, g, `${ F }-home`, { from: [ 16, 8, - 16 ] } );
		if ( boat === 'kayak' ) {

			// ---- sat in her at sea, close in and past the reef
			const at = { x: 44, z: 120 };
			await S.toSea( at );
			await frames( g, 3 );
			await saveNow( g );
			const was = await view( g );
			v = await S.reload( 'sat in her at sea' );
			note( brief( v ) );
			say( v.mode === 'boat' && near( v, was, 4 ) && ! v.beached && ! v.moored, `kayak at sea: sat in her still (${ v.mode }), ${ Math.hypot( v.x - was.x, v.z - was.z ).toFixed( 1 ) } m off` );
			good( v, 'kayak at sea' );
			await settled( S, v, 'kayak at sea', 60 );
			await shots( page, g, `${ F }-at-sea`, { from: [ 4, 3, - 7 ] } );
			// ---- out of her on the sand, by what the game does
			await g.evaluate( () => {

				// (paddled in to the water's edge, and out of her as the game does it: she's pulled up the sand)
				const a = window.__app, b = a.boatCtl, p = a.player, M = a.boat;
				b.position.x = 44;
				b.position.z = - 37;
				b.velocity.set( 0, 0, 0 );
				b.apply();
				M.leave( b, p, p.ashoreTarget() || { out: { x: 46, z: - 45 }, g: 1 } );

			} );
			await page.waitForTimeout( 1500 );
			await frames( g, 4 );
			const sand = await view( g );
			await saveNow( g );
			note( `drawn up: ${ brief( sand ) } ${ JSON.stringify( ( await S.records() ).boat ) }` );
			v = await S.reload( 'drawn up on the sand' );
			note( brief( v ) );
			say( v.beached && near( v, sand, 1 ) && v.mode === 'walk', `kayak on the sand: there still, on the sand, you beside her (beached ${ v.beached }, ${ Math.hypot( v.x - sand.x, v.z - sand.z ).toFixed( 2 ) } m off, y ${ v.y }, ${ v.mode })` );
			good( v, 'kayak on the sand' );
			await shots( page, g, `${ F }-sand`, { from: [ 5, 3, - 7 ] } );
			v = await S.gone( 8, null, 'on the sand, 8 h gone' );
			note( brief( v ) );
			say( v.beached && near( v, sand, 1 ) && ! v.note, `kayak on the sand 8 h: still there, no note (${ v.note || '' }) fee none: $${ v.money }` );
			// ---- somewhere else on the sand, far from her berth
			await g.evaluate( () => {

				const a = window.__app, b = a.boatCtl, p = a.player, M = a.boat;
				M.lie( b, 200, - 30, 1.1 );
				M.setDown( b, p );

			} );
			await frames( g, 3 );
			const other = await view( g );
			await saveNow( g );
			note( `elsewhere ${ brief( other ) }` );
			v = await S.reload( 'elsewhere on the sand' );
			note( brief( v ) );
			say( near( v, other, 2 ) && v.beached === other.beached, `kayak elsewhere: as she was left (beached ${ other.beached } -> ${ v.beached }, ${ Math.hypot( v.x - other.x, v.z - other.z ).toFixed( 1 ) } m off)` );
			await shots( page, g, `${ F }-sand2`, { from: [ 5, 3, - 7 ] } );
			return;

		}

		// ---- far out, each place aboard
		const at = await farSpot( g );
		await S.toSea( at );
		await frames( g, 3 );
		await g.evaluate( () => window.__app.player.leaveHelm() );
		await frames( g, 2 );
		const AREAS = ( await import( './areas.mjs' ) ).AREAS;
		const places = await g.evaluate( () => {

			const M = window.__app.boat;
			return { id: M.id, bunks: M.bunks, stations: M.stations && M.stations.tower, helm: M.helm, lines: null };

		} );
		// ((M17) and the lobster boat's side deck, her bow and her roof; the console's foredeck)
		const named = ( ...names ) => AREAS[ boat ]( {} ).filter( ( a ) => names.includes( a.name ) );
		const list = boat === 'sportfisher' ? [ { name: 'cockpit', x: 0, y: 0.5, z: - 3.75 }, { name: 'salon', x: 0, y: 1.02, z: - 0.5 }, { name: 'guest cabin', x: places.bunks[ 0 ].x, y: places.bunks[ 0 ].y, z: places.bunks[ 0 ].z }, { name: 'bridge, aft', x: 0, y: 3.1, z: - 2.6 }, { name: 'tower', x: places.stations.x, y: places.stations.y, z: places.stations.z } ]
			: boat === 'lobster' ? [ ...named( 'cockpit', 'the house\'s bench' ), { name: 'side deck', x: 1.31, y: 1.16, z: 0.3 }, ...named( 'the bow', 'the house\'s roof' ) ]
				: [ ...AREAS[ boat ]( {} ).slice( 0, 2 ), ...named( 'foredeck' ) ];
		for ( const P of list ) {

			await g.evaluate( ( P ) => {

				const a = window.__app, p = a.player;
				if ( p.mode !== 'deck' ) return;
				p.deckPos.set( P.x, P.y, P.z );
				p.deckVel.set( 0, 0, 0 );
				p.deckGrounded = true;
				p.deckToWorld();

			}, P );
			await frames( g, 2 );
			const was = await view( g );
			await saveNow( g );
			v = await S.reload( `far out, ${ P.name }` );
			note( `${ P.name }: ${ brief( v ) }` );
			say( v.mode === 'deck' && near( v, was, 4 ), `aboard (${ P.name }): on deck where she was, ${ Math.hypot( v.x - was.x, v.z - was.z ).toFixed( 1 ) } m off` );
			// ((M17) where you stood on her: not her cockpit)
			const off = v.deck && was.deck ? Math.hypot( v.deck[ 0 ] - was.deck[ 0 ], v.deck[ 1 ] - was.deck[ 1 ], v.deck[ 2 ] - was.deck[ 2 ] ) : Infinity;
			say( off < 0.25, `aboard (${ P.name }): (M17) where you stood on her, ${ was.deck } -> ${ v.deck } (${ off.toFixed( 2 ) } m)` );
			good( v, P.name );
			await shots( page, g, `${ F }-${ P.name.replace( /[ ,]+/g, '-' ) }`, { outside: P === list[ 0 ] } );

		}

		// at the helm (the bridge's, on the sportfisher)
		await g.evaluate( () => window.__app.player.takeHelm() );
		await frames( g, 2 );
		await saveNow( g );
		v = await S.reload( 'far out, helm' );
		note( `helm: ${ brief( v ) }` );
		say( v.mode === 'boat', 'aboard: at her helm' );
		// ((M17) her upper helm, the tower's: there again)
		if ( boat === 'sportfisher' ) {

			await g.evaluate( () => {

				const a = window.__app, p = a.player;
				p.leaveHelm();
				p.takeHelm( a.boat.towerHelm );

			} );
			await frames( g, 2 );
			await saveNow( g );
			v = await S.reload( 'far out, the tower\'s helm' );
			const upper = await g.evaluate( () => !! ( window.__app.player.atHelm && window.__app.player.atHelm.upper ) );
			say( v.mode === 'boat' && upper, `aboard: (M17) at her upper helm, the tower's, again (${ v.mode }, upper ${ upper })` );
			await g.evaluate( () => window.__app.player.camMode = 'first' );
			await frames( g, 2 );
			await shots( page, g, `${ F }-tower-helm`, { outside: false } );
			await g.evaluate( () => {

				const a = window.__app, p = a.player;
				p.leaveHelm();
				p.takeHelm();

			} );

		}
		await frames( g, 2 );
		await g.evaluate( () => window.__app.player.camMode = 'first' );
		await frames( g, 2 );
		await shots( page, g, `${ F }-helm`, { from: [ 12, 8, - 16 ] } );

	},

	// long enough to go aground, or to be fetched
	async long( S ) {

		const { boat, g, page } = S, F = `${ out }/${ boat }-long`;
		await S.load( `${ plain }&boat=${ boat }`, 'goto', 'first, ?boat' );
		await S.fitted( ANCHOR[ boat ] );
		await S.set( { fuel: 0.5, hull: 0.01, money: 2000 } );
		const prep = ( x, z ) => S.g.evaluate( ( at ) => {

			const a = window.__app, p = a.player, b = a.boatCtl;
			if ( p.mode === 'boat' ) {

				if ( a.boat.seated ) p.exitBoat( null, 1 );
				else {

					p.leaveHelm();
					p.exitBoat( null, 1 );

				}

			} else if ( p.mode === 'deck' ) p.exitBoat( null, 1 );
			b.driven = false;
			b.moored = b.beached = false;
			b.anchor = null;
			b.sock = false;
			a.game._anchorDue = false;
			b.position.x = at.x;
			b.position.z = at.z;
			b.velocity.set( 0, 0, 0 );
			b.hasWater = false;

		}, { x, z } );
		// ---- adrift within sight, a day: Marta sees her and tows her in
		await prep( 1200, 1400 );
		await frames( g, 2 );
		await saveNow( g );
		const a0 = await view( g );
		let v = await S.gone( 26, null, 'adrift in sight, a day gone' );
		note( brief( v ) );
		note( `note: ${ v.note }` );
		sameBoat( v, boat, 'found adrift' );
		say( !! v.note && /adrift|ashore/.test( v.note ) && v.money < a0.money && ( v.moored || v.beached ), `found adrift: towed in, fee $${ a0.money - v.money }, at her berth, note says so` );
		good( v, 'found adrift' );
		await shots( page, g, `${ F }-found`, { from: [ 16, 8, - 16 ] } );
		await g.evaluate( () => { const h = window.__app.game.hud; if ( h.noteOpen ) h.closeNote(); } );
		// ---- a week, far out at anchor
		await S.set( { money: 2000 } );
		const at = await farSpot( g, { max: boat === 'kayak' ? 9 : 18 } );
		await S.toSea( at );
		await frames( g, 2 );
		await leaveHer( g );
		await frames( g, 2 );
		await saveNow( g );
		const a1 = await view( g );
		say( !! a1.anchor, `week: anchored at ${ a1.x }, ${ a1.z }` );
		v = await S.gone( 8 * 24, null, 'at anchor, a week gone' );
		note( brief( v ) );
		note( `note: ${ v.note }` );
		say( !! v.note && /week|hurricane/.test( v.note ) && ( v.moored || v.beached || v.hauled ) && v.money < 2000, `week: towed in, fee $${ 2000 - v.money }, note says so` );
		say( v.mode === 'walk', `week: you're ashore (${ v.mode })` );
		good( v, 'week' );
		await shots( page, g, `${ F }-week`, { from: [ 16, 8, - 16 ] } );
		await g.evaluate( () => { const h = window.__app.game.hud; if ( h.noteOpen ) h.closeNote(); } );
		// ---- adrift, onto the shore overnight: found by reckoning the spot with the game's own sums, in the night so Marta's not seen her
		const aground = await g.evaluate( async ( boat ) => {

			const a = window.__app;
			const { awayOf } = await import( '/src/game/Away.js' );
			const { ableEnv } = await import( '/src/game/Seaworthy.js' );
			const { islandTime } = await import( '/src/game/Weather.js' );
			const s = a.settings, dock = a.boatCtl.berth.position;
			const T0 = islandTime( s.day, 21 ), depth = ( x, z ) => Math.max( 0, - a.terrainData.heightAt( x, z ) );
			for ( let r = 150; r < 1500; r += 50 ) for ( let k = 0; k < 16; k ++ ) {

				const x = 30 + ( r + 400 ) * Math.cos( k / 16 * 6.283 ), z = - 320 + ( r + 400 ) * Math.sin( k / 16 * 6.283 );
				if ( depth( x, z ) < 4 ) continue;
				const st = awayOf( { x, z, heading: 0, anchor: null, moored: false, hauled: false, T: T0 }, T0 + 7, { dock, pick: a.weatherPick(), since: s.weatherSince, depth, ...ableEnv( boat ) } );
				if ( st.where === 'aground' && ! st.tows.length ) return { x, z, T0, ground: [ st.x, st.z ] };

			}

			return null;

		}, boat );
		note( `a spot to go aground from: ${ JSON.stringify( aground ) }` );
		if ( aground ) {

			await prep( aground.x, aground.z );
			await frames( g, 2 );
			await saveNow( g );
			v = await S.gone( 7, `boat.T = ${ aground.T0 }; clock.hour = 21;`, 'adrift, gone aground in the night' );
			note( brief( v ) );
			note( `note: ${ v.note } toasts: ${ JSON.stringify( v.toasts ) }` );
			say( v.depth < 3 && ! v.moored && ! v.hauled, `aground: she's come ashore at ${ v.x }, ${ v.z } in ${ v.depth } m of water (night: nobody saw) ${ JSON.stringify( v.toasts ) }` );
			good( v, 'aground' );
			await g.evaluate( () => { const h = window.__app.game.hud; if ( h.noteOpen ) h.closeNote(); } );
			const series = [];
			for ( let i = 0; i < 5; i ++ ) {

				await page.waitForTimeout( 5000 );
				await frames( g, 2 );
				series.push( await g.evaluate( () => { const b = window.__app.boatCtl, T = window.__app.terrainData, r = ( x ) => Math.round( x * 100 ) / 100; return { x: r( b.position.x ), y: r( b.position.y ), z: r( b.position.z ), vy: r( b.velocity.y ), ground: r( T.heightAt( b.position.x, b.position.z ) ), aground: b.contact && b.contact.aground, frame: window.__app.renderer.info.render.frame }; } ) );

			}

			note( `aground, over 25 s: ${ JSON.stringify( series ) }` );
			const top = Math.max( ...series.map( ( e ) => e.y - Math.max( e.ground, 0 ) ) );
			say( top < 3, `aground: she's sitting on what's there, not in the air (at most ${ top.toFixed( 1 ) } m over the ground or the sea)` );
			await shots( page, g, `${ F }-aground`, { from: [ 12, 7, - 14 ] } );

		} else say( false, 'aground: no spot found for her to go ashore overnight (not run)' );

	},

	// hauled out ahead of a hurricane: with money and with none, far out and at her berth
	async hurricane( S ) {

		const { boat, g, page } = S, F = `${ out }/${ boat }-hurricane`;
		await S.load( `${ plain }&boat=${ boat }`, 'goto', 'first, ?boat' );
		await S.fitted( ANCHOR[ boat ] );
		const weather = async () => {

			const r = await g.evaluate( () => {

				const a = window.__app, s = a.settings;
				return { T: s.day * 24 - 24 + s.timeOfDay };

			} );
			// (picked, and its warning's up within the hour)
			return `clock.weather = 'hurricane'; clock.since = ${ r.T + 1 };`;

		};
		for ( const [ label, money ] of [ [ 'with money', 3000 ], [ 'no money', 0 ] ] ) {

			await S.set( { money, hauled: false } );
			await g.evaluate( () => { const b = window.__app.boatCtl; if ( b.hauled ) b.setHauled( null ); } );
			const at = await farSpot( g, { max: boat === 'kayak' ? 9 : 18 } );
			await S.toSea( at );
			await frames( g, 2 );
			await g.evaluate( () => {

				const a = window.__app;
				if ( ! a.boat.seated ) a.player.leaveHelm();

			} );
			await g.evaluate( () => window.__app.game.dropAnchor() );
			await frames( g, 2 );
			await saveNow( g );
			const v = await S.gone( 4, await weather(), `hurricane, ${ label }` );
			note( brief( v ) );
			note( `note: ${ v.note }` );
			sameBoat( v, boat, `hurricane ${ label }` );
			say( v.hauled && v.stHauled && ! v.anchor, `hurricane ${ label }: on her cradle ashore (${ v.x }, ${ v.y }, ${ v.z })` );
			say( !! v.note && /hurricane/.test( v.note ), `hurricane ${ label }: Marta's note there` );
			if ( money ) say( v.money < money && v.money > 0 && /out of what you had/.test( v.note || '' ), `hurricane with money: paid $${ money - v.money }` );
			else say( v.money === 0 && /you'd nothing to take it from/.test( v.note || '' ), `hurricane no money: $0, "you'd nothing to take it from"` );
			say( v.mode === 'walk', `hurricane ${ label }: you're ashore (${ v.mode } at ${ v.you })` );
			good( v, `hurricane ${ label }` );
			await shots( page, g, `${ F }-${ money ? 'money' : 'none' }-seen`, { outside: false } );
			// (her on her cradle, you beside her, the note closed)
			await g.evaluate( () => {

				const a = window.__app, h = a.game.hud, b = a.boatCtl.position, p = a.player;
				if ( h.noteOpen ) h.closeNote();
				p.position.set( b.x + 8, a.terrainData.heightAt( b.x + 8, b.z - 8 ) + 2, b.z - 8 );
				p.yaw = Math.atan2( 8, - 8 );
				p.velocity.set( 0, 0, 0 );

			} );
			await frames( g, 6 );
			await shots( page, g, `${ F }-${ money ? 'money' : 'none' }`, { from: [ 9, 5, - 12 ] } );
			// a reload on her cradle: no second fee
			await saveNow( g );
			const again = await S.reload( 'on her cradle' );
			note( brief( again ) );
			say( again.hauled && again.money === v.money && ! again.note, `hurricane ${ label }: reloaded on her cradle, no second fee ($${ again.money }), no second note` );
			await frames( g, 2 );

		}

	},

	// the same from her berth, for no money: hauled (nothing to tow); and the hurricane gone by, you back: she's put back in
	async hurberth( S ) {

		const { boat, g, page } = S, F = `${ out }/${ boat }-hurberth`;
		await S.load( `${ plain }&boat=${ boat }`, 'goto', 'first, ?boat' );
		await S.set( { money: 0 } );
		await frames( g, 2 );
		await saveNow( g );
		const home = await view( g );
		const T = ( home.day - 1 ) * 24 + home.hour;
		let v = await S.gone( 4, `clock.weather = 'hurricane'; clock.since = ${ T + 1 };`, 'at her berth, a hurricane, no money' );
		note( brief( v ) );
		note( `note: ${ v.note }` );
		sameBoat( v, boat, 'hurricane at her berth' );
		say( v.hauled && v.stHauled, `hurricane at her berth: on her cradle (${ v.x }, ${ v.y }, ${ v.z })` );
		say( v.money === 0 && /you'd nothing to take it from/.test( v.note || '' ) && /Hauled your boat out/.test( v.note || '' ), 'hurricane at her berth: "Hauled your boat out" for nothing: "you\'d nothing to take it from"' );
		good( v, 'hurricane at her berth' );
		await g.evaluate( () => { const h = window.__app.game.hud; if ( h.noteOpen ) h.closeNote(); } );
		await shots( page, g, `${ F }`, { from: [ 7, 5, - 9 ] } );
		// (it's gone by, long since; the middle of the day, Marta's in)
		await saveNow( g );
		v = await S.gone( 0, `clock.weather = null; delete clock.since; clock.hour = 11; clock.day = ${ home.day + 8 }; boat.T = 11 + ${ home.day + 7 } * 24;`, 'it gone by' );
		note( brief( v ) );
		note( `note: ${ v.note } toasts: ${ JSON.stringify( v.toasts ) }` );
		await page.waitForTimeout( 3000 );
		await frames( g, 4 );
		v = await view( g );
		note( brief( v ) );
		say( ! v.hauled && ! v.stHauled && ( v.moored || v.beached ), `hurricane gone by: she's back in at her berth (${ v.x }, ${ v.z }) ${ JSON.stringify( v.toasts ) }` );
		await saveNow( g );
		v = await S.reload( 'back in, reloaded' );
		note( brief( v ) );
		say( ! v.hauled && ( v.moored || v.beached ) && v.boat === boat, `hurricane gone by, reloaded: at her berth` );

	},

	// a gale blowing as you come back
	async gale( S ) {

		const { boat, g, page } = S, F = `${ out }/${ boat }-gale`;
		await S.load( `${ plain }&boat=${ boat }`, 'goto', 'first, ?boat' );
		await S.fitted( ANCHOR[ boat ], SOCK[ boat ] );
		await S.set( { fuel: 0.55, hull: 0, money: 400 } );
		const at = await farSpot( g, { max: boat === 'kayak' ? 9 : 18 } );
		await S.toSea( at );
		await frames( g, 2 );
		await leaveHer( g );
		await frames( g, 2 );
		await saveNow( g );
		const was = await view( g );
		const v = await S.gone( 6, 'clock.weather = \'gale\';', 'in a gale' );
		note( brief( v ) );
		note( `note: ${ v.note } toasts: ${ JSON.stringify( v.toasts ) }` );
		sameBoat( v, boat, 'gale' );
		say( v.weather === 'gale', `gale: it's blowing (${ v.weather })` );
		say( near( v, was, 50 ) && !! v.anchor, `gale: at her anchor, ${ Math.hypot( v.x - was.x, v.z - was.z ).toFixed( 1 ) } m off` );
		say( v.hull > was.hull, `gale: the hull's taken some, ${ was.hull } -> ${ v.hull } (HUD ${ v.hud.hull })` );
		good( v, 'gale' );
		await frames( g, 4 );
		await shots( page, g, `${ F }-seen`, { outside: true, from: [ 12, 7, - 14 ] } );
		const later = await settled( S, v, 'gale', 70 );
		note( brief( later ) );
		await shots( page, g, `${ F }-later`, { outside: false } );

	},

	// one left out at sea comes home for Marta's fee when you take out another; then you pick up in the right one
	async takeout( S ) {

		const { boat, g, page } = S, F = `${ out }/${ boat }-takeout`;
		const other = BOAT_IDS[ ( BOAT_IDS.indexOf( boat ) + 1 ) % 4 ];
		await S.load( `${ plain }&boat=${ boat }`, 'goto', 'first, ?boat' );
		await S.fitted( ANCHOR[ boat ] );
		await g.evaluate( ( other ) => window.__app.game.state.addBoat( other ), other );
		await S.set( { fuel: 0.66, hull: 0.03, money: 5000 } );
		const at = await farSpot( g, { max: boat === 'kayak' ? 9 : 18 } );
		await S.toSea( at );
		await frames( g, 2 );
		await leaveHer( g );
		await frames( g, 2 );
		// ashore, she's out there
		await g.evaluate( () => {

			const p = window.__app.player;
			if ( p.mode === 'swim' ) {

				p.position.set( 55, 2.5, 20 );
				p.mode = 'walk';

			} else p.exitBoat( { out: { x: 55, z: 20 }, g: 2.5 } );

		} );
		await frames( g, 3 );
		const was = await view( g ), job = await g.evaluate( () => window.__app.game.towJob() );
		say( !! job && job.fee > 0, `take out: she's out there, the job ${ JSON.stringify( job ) }` );
		const ok = await g.evaluate( ( other ) => window.__app.game.fleet.takeOut( other ), other );
		await frames( g, 3 );
		const v = await view( g );
		note( brief( v ) );
		say( ok && v.boat === other && v.model === other, `take out: into the ${ other } (${ v.boat }/${ v.model })` );
		say( v.money === was.money - job.fee, `take out: paid Marta's $${ job.fee }: $${ was.money } -> $${ v.money }; ${ JSON.stringify( v.toasts.slice( - 1 ) ) }` );
		say( !! v.mooredBoats[ boat ], `take out: the ${ boat } drawn at her berth ${ JSON.stringify( v.mooredBoats[ boat ] ) }` );
		await saveNow( g );
		const r = await S.reload( 'after taking out another' );
		note( brief( r ) );
		sameBoat( r, other, 'take out, reloaded' );
		good( r, 'take out, reloaded' );
		say( r.money === v.money && ! r.note, `take out, reloaded: no second fee ($${ r.money }), no note (${ r.note || '' })` );
		say( ( r.moored || r.beached ) && near( r, v, 2 ), `take out, reloaded: at her berth, ${ r.x }, ${ r.z }` );
		say( !! r.mooredBoats[ boat ], `take out, reloaded: the ${ boat } at her berth ${ JSON.stringify( r.mooredBoats[ boat ] ) }` );
		await shots( page, g, F, { from: [ 16, 9, - 18 ] } );
		// and a while gone, in the new one
		await saveNow( g );
		const r2 = await S.gone( 3, null, 'in the other, 3 h gone' );
		note( brief( r2 ) );
		sameBoat( r2, other, 'take out, 3 h' );
		say( r2.money === r.money && ( r2.moored || r2.beached ) && ! r2.note, `take out, 3 h: at her berth, no fee ($${ r2.money }) note ${ r2.note || 'none' }` );
		// back into the first: no fee, her own fuel and hull
		const back = await g.evaluate( ( boat ) => window.__app.game.fleet.takeOut( boat ), boat );
		await frames( g, 3 );
		const b = await view( g );
		note( brief( b ) );
		say( back && b.boat === boat && b.money === r2.money && b.fuel === was.fuel && Math.abs( b.hull - was.hull ) < 0.002, `take out, back: in the ${ boat } again, no fee, her own fuel ${ b.fuel } and hull ${ b.hull }` );
		say( ( b.moored || b.beached ) && Math.hypot( b.x - at.x, b.z - at.z ) > 500, `take out, back: at her berth (${ b.x }, ${ b.z })` );
		await saveNow( g );
		const b2 = await S.reload( 'back in the first' );
		note( brief( b2 ) );
		sameBoat( b2, boat, 'take out, back, reloaded' );

	},

	// buying and trading in, then reloading; selling
	async buy( S ) {

		const { boat, g, page } = S, F = `${ out }/${ boat }-buy`;
		await S.load( `${ plain }&boat=${ boat }`, 'goto', 'first, ?boat' );
		await S.set( { money: 60000, earned: true } );
		const owned = ( v ) => v.fleet.split( ',' ), start = owned( await view( g ) );
		// (the new one, and the one traded for: those she doesn't own; ?boat= comes with the kayak)
		const [ X, Y ] = BOAT_IDS.filter( ( b ) => b !== boat && ! start.includes( b ) );
		// ---- bought outright, stay in yours
		const q = await g.evaluate( ( id ) => window.__app.game.state.quoteBoat( id, null ), X );
		note( `quote ${ JSON.stringify( q ) }` );
		const did = await g.evaluate( ( id ) => window.__app.game.fleet.buy( id ), X );
		await frames( g, 4 );
		const v0 = await view( g );
		say( did && owned( v0 ).includes( X ) && v0.boat === boat && v0.money === 60000 - q.net, `buy: the ${ X } for $${ q.net }, still in the ${ boat }, $${ v0.money } ${ JSON.stringify( v0.toasts.slice( - 1 ) ) }` );
		await saveNow( g );
		let v = await S.reload( 'bought one' );
		note( brief( v ) );
		sameBoat( v, boat, 'buy, reloaded' );
		say( owned( v ).includes( X ) && v.money === v0.money && !! v.mooredBoats[ X ], `buy, reloaded: she's yours and at her berth ${ JSON.stringify( v.mooredBoats[ X ] ) }, $${ v.money }` );
		// ---- the one you're in, traded in for another
		const q2 = await g.evaluate( ( [ id, t ] ) => window.__app.game.state.quoteBoat( id, t ), [ Y, boat ] );
		note( `trade-in quote ${ JSON.stringify( q2 ) }` );
		const did2 = await g.evaluate( ( [ id, t ] ) => window.__app.game.fleet.buy( id, t ), [ Y, boat ] );
		await frames( g, 4 );
		const v1 = await view( g );
		note( brief( v1 ) );
		say( did2 && v1.boat === Y && v1.model === Y && ! owned( v1 ).includes( boat ), `trade in: in the ${ Y }, the ${ boat } gone (${ v1.fleet }), $${ v.money } -> $${ v1.money }` );
		say( v1.money === v.money - q2.net, `trade in: paid the difference $${ q2.net }` );
		await saveNow( g );
		v = await S.reload( 'traded in the one you were in' );
		note( brief( v ) );
		sameBoat( v, Y, 'trade in, reloaded' );
		good( v, 'trade in, reloaded' );
		say( ! owned( v ).includes( boat ) && v.money === v1.money && ( v.moored || v.beached ) && ! v.note, `trade in, reloaded: at her berth, the old one gone, $${ v.money }` );
		await shots( page, g, `${ F }-traded`, { from: [ 16, 9, - 18 ] } );
		// ---- trade in one you're not in
		const q3 = await g.evaluate( ( [ id, t ] ) => window.__app.game.state.quoteBoat( id, t ), [ boat, X ] );
		const did3 = await g.evaluate( ( [ id, t ] ) => window.__app.game.fleet.buy( id, t ), [ boat, X ] );
		await frames( g, 4 );
		const v2 = await view( g );
		say( did3 && v2.boat === Y && owned( v2 ).includes( boat ) && ! owned( v2 ).includes( X ), `trade in another: the ${ X } for the ${ boat }, net $${ q3.net }, you're in the ${ v2.boat } (${ v2.fleet })` );
		await saveNow( g );
		v = await S.reload( 'traded in another' );
		note( brief( v ) );
		sameBoat( v, Y, 'trade in another, reloaded' );
		say( v.fleet === v2.fleet && ! v.mooredBoats[ X ] && !! v.mooredBoats[ boat ], `trade in another, reloaded: fleet ${ v.fleet }; drawn ${ JSON.stringify( v.mooredBoats ) }` );
		// ---- selling the one you're in: she won't; selling the other: she does
		const before = v.money;
		const refused = await g.evaluate( ( id ) => window.__app.game.fleet.sell( id ), Y );
		await frames( g, 2 );
		v = await view( g );
		say( refused === false && v.money === before && owned( v ).includes( Y ), `sell the one you're in: refused, $${ v.money }, still in her` );
		await saveNow( g );
		v = await S.reload( 'tried to sell the one you are in' );
		sameBoat( v, Y, 'sell refused, reloaded' );
		const sold = await g.evaluate( ( id ) => window.__app.game.fleet.sell( id ), boat );
		await frames( g, 3 );
		const v3 = await view( g );
		say( sold && v3.money > before && ! owned( v3 ).includes( boat ), `sell the other: $${ before } -> $${ v3.money }, fleet ${ v3.fleet } ${ JSON.stringify( v3.toasts.slice( - 1 ) ) }` );
		await saveNow( g );
		v = await S.reload( 'sold the other' );
		note( brief( v ) );
		sameBoat( v, Y, 'sold, reloaded' );
		say( v.fleet === v3.fleet && v.money === v3.money && ! v.mooredBoats[ boat ], `sold, reloaded: fleet ${ v.fleet }, $${ v.money }, she's gone from the dock` );
		if ( owned( v ).length === 1 ) say( await g.evaluate( ( id ) => window.__app.game.fleet.sell( id ), Y ) === false, 'sell your only boat: refused' );


	},

	// a save from before the fleet
	async v1( S ) {

		const { g, page } = S, F = `${ out }/v1`;
		await S.load( plain, 'goto', 'fresh, for the spot' );
		const at = await farSpot( g );
		const T = await g.evaluate( () => ( window.__app.settings.day - 1 ) * 24 + window.__app.settings.timeOfDay );
		const hour = T % 24, day = Math.floor( T / 24 ) + 1;
		const progress = { v: 1, money: 1234, inventory: [], log: {}, places: {}, found: {}, upgrades: { anchor: 1 }, fuel: 30, hull: 0.2, hauled: false, look: null, orders: { day: null, filled: {} }, weekPaid: null, bait: {}, baitPick: null, bag: { day: null, n: {} }, finds: [], picked: [], nextId: 1 };
		const seed = async ( { boat, clock, prog = progress } ) => {

			await page.goto( `${ base }/__blank` );
			await page.evaluate( ( [ boat, clock, prog ] ) => {

				localStorage.clear();
				const put = ( k, v ) => v && localStorage.setItem( `ats-standalone:personal:${ k }`, JSON.stringify( { value: v, schemaVersion: 1, version: 1 } ) );
				put( 'boat', boat );
				put( 'clock', clock );
				put( 'progress', prog );

			}, [ boat, clock, prog ] );

		};

		const now = Date.now();
		// ---- far out at anchor, aboard, just gone
		await seed( { boat: { v: 1, x: at.x, z: at.z, h: 1, anchor: [ at.x + 3, at.z + 3 ], moored: false, aboard: 'deck', T, at: now }, clock: { hour, day, held: false, at: now } } );
		let v = await S.load( plain, 'goto', 'v1, far out' );
		note( brief( v ) );
		sameBoat( v, 'lobster', 'v1 far' );
		good( v, 'v1 far' );
		say( near( v, at, 3 ) && !! v.anchor, `v1 far: the lobster boat at the right place (${ v.x }, ${ v.z } vs ${ at.x.toFixed( 1 ) }, ${ at.z.toFixed( 1 ) }), anchored` );
		say( v.fleet.split( ',' ).includes( 'kayak' ) && v.fleet.split( ',' ).includes( 'lobster' ), `v1 far: and the kayak's yours (${ v.fleet })` );
		say( v.money === 1234 && v.fuel === 30 && Math.abs( v.hull - 0.2 ) < 0.001, `v1 far: money, fuel, hull kept ($${ v.money }, ${ v.fuel }, ${ v.hull }) HUD ${ JSON.stringify( v.hud ) }` );
		say( v.mode === 'deck', `v1 far: aboard (${ v.mode })` );
		await frames( g, 3 );
		await shots( page, g, `${ F }-far` );
		// ---- a while gone
		await seed( { boat: { v: 1, x: at.x, z: at.z, h: 1, anchor: [ at.x + 3, at.z + 3 ], moored: false, aboard: null, T, at: now - 3 * 3600e3 }, clock: { hour, day, held: false, at: now - 3 * 3600e3 } } );
		v = await S.load( plain, 'goto', 'v1, far out, 3 h' );
		note( brief( v ) );
		sameBoat( v, 'lobster', 'v1 far 3 h' );
		say( near( v, at, 40 ) && !! v.anchor && v.mode === 'walk', `v1 far 3 h: at her anchor out there, you ashore (${ v.mode })` );
		say( !! v.mooredBoats.kayak, `v1: the kayak drawn on the sand ${ JSON.stringify( v.mooredBoats.kayak ) }` );
		await shots( page, g, `${ F }-ashore`, { outside: false } );
		// ---- at the dock
		await seed( { boat: null, clock: null } );
		v = await S.load( plain, 'goto', 'v1, no boat record' );
		note( brief( v ) );
		sameBoat( v, 'lobster', 'v1 home' );
		say( v.moored && v.mode === 'walk' && v.fleet.split( ',' ).includes( 'kayak' ), 'v1 home: the lobster boat at her dock' );
		// ---- on the cradle, a hurricane gone, in the night with Marta home (by day she puts her back in at once: Game.updateHurricane)
		await seed( { boat: { v: 1, x: 90, z: - 20, h: 0, anchor: null, moored: false, aboard: null, T: 22, at: now - 600e3 }, clock: { hour: 22, day: 1, held: false, at: now - 600e3 }, prog: { ...progress, hauled: true } } );
		v = await S.load( plain, 'goto', 'v1, on the cradle' );
		note( brief( v ) );
		sameBoat( v, 'lobster', 'v1 cradle' );
		say( v.hauled && v.stHauled, `v1 cradle: on her cradle at night (${ v.x }, ${ v.z }) ${ JSON.stringify( v.toasts ) } note ${ v.note }` );
		// ---- takes the kayak, the lobster boat fetched for a fee
		await seed( { boat: { v: 1, x: at.x, z: at.z, h: 1, anchor: null, moored: false, aboard: null, T, at: now }, clock: { hour, day, held: false, at: now } } );
		v = await S.load( plain, 'goto', 'v1, adrift' );
		const job = await g.evaluate( () => window.__app.game.towJob() );
		const did = await g.evaluate( () => window.__app.game.fleet.takeOut( 'kayak' ) );
		await frames( g, 3 );
		const k = await view( g );
		note( brief( k ) );
		say( did && k.boat === 'kayak' && k.money === 1234 - Math.min( 1234, job ? job.fee : 0 ), `v1 into the kayak: Marta's fee $${ job && job.fee } for the one out there, ${ JSON.stringify( k.toasts.slice( - 1 ) ) }` );
		await saveNow( g );
		const k2 = await S.reload( 'v1, in the kayak' );
		note( brief( k2 ) );
		sameBoat( k2, 'kayak', 'v1 kayak, reloaded' );
		say( ( k2.beached || k2.moored ) && !! k2.mooredBoats.lobster, `v1 kayak, reloaded: on the sand, the lobster boat at her berth ${ JSON.stringify( k2.mooredBoats.lobster ) }` );

	},

	// no pause and no flush by us: only the save's own turn (every 30 s of game time), then a plain reload of the page (its pagehide flushes what's waiting)
	async natural( S ) {

		const { boat, g } = S;
		await S.load( `${ plain }&boat=${ boat }`, 'goto', 'first, ?boat' );
		await S.fitted( ANCHOR[ boat ] );
		await S.load( plain, 'goto', 'plain address' );
		const at = await farSpot( g, { max: boat === 'kayak' ? 9 : 18 } );
		await S.toSea( at );
		await frames( g, 2 );
		await leaveHer( g );
		await frames( g, 2 );
		await g.evaluate( () => window.__app._clockSaveT = 0.01 );
		await frames( g, 2 );
		const was = await view( g );
		let v = await S.load( plain, 'reload', 'plain reload, far out, after the save\'s turn' );
		note( brief( v ) );
		say( near( v, was, 5 ) && !! v.anchor && v.boat === boat, `plain reload: where she was, ${ Math.hypot( v.x - was.x, v.z - was.z ).toFixed( 1 ) } m off, her anchor down, no help from us` );
		// and moved since the save's last turn: what's lost is what's since then, at most
		await g.evaluate( () => {

			const a = window.__app, b = a.boatCtl;
			a._clockSaveT = 9999;
			b.position.x += 300;
			b.anchor = null;
			b.hasWater = false;

		} );
		await frames( g, 2 );
		const moved = await view( g );
		v = await S.load( plain, 'reload', 'plain reload, moved since the last save' );
		note( brief( v ) );
		note( `moved ${ Math.hypot( moved.x - was.x, moved.z - was.z ).toFixed( 0 ) } m since her last save's turn, then a plain reload: she's ${ Math.hypot( v.x - moved.x, v.z - moved.z ).toFixed( 0 ) } m from where she'd got to (the last 30 s of game time aren't kept without a pause)` );

	},

	// (M17) in the water far out: by her when you come back, still at anchor and hours on; drifted, by her where she's got to; too far
	// from her, ashore
	async swim( S ) {

		const { boat, g, page } = S, F = `${ out }/${ boat }-swim`;
		await S.load( `${ plain }&boat=${ boat }`, 'goto', 'first, ?boat' );
		await S.fitted( ANCHOR[ boat ] );
		const at = await farSpot( g, { max: boat === 'kayak' ? 9 : 18 } );
		await S.toSea( at );
		await frames( g, 3 );
		await leaveHer( g );
		await frames( g, 2 );
		await swimTo( g, 9, - 7 );
		await frames( g, 4 );
		const was = await view( g );
		say( was.mode === 'swim' && !! was.anchor, `swim: in the water ${ Math.hypot( was.you[ 0 ] - was.x, was.you[ 2 ] - was.z ).toFixed( 1 ) } m off her, her anchor down` );
		await saveNow( g );
		note( `her record ${ JSON.stringify( ( await S.records() ).boat ) }` );
		let v = await S.reload( 'in the water by her' );
		note( brief( v ) );
		good( v, 'swim' );
		const by = ( v ) => Math.hypot( v.you[ 0 ] - v.x, v.you[ 2 ] - v.z );
		const offAt = ( v ) => Math.hypot( v.you[ 0 ] - v.x - ( was.you[ 0 ] - was.x ), v.you[ 2 ] - v.z - ( was.you[ 2 ] - was.z ) );
		say( v.mode === 'swim' && near( v, was, 3 ) && offAt( v ) < 2, `swim: in the water by her again, ${ by( v ).toFixed( 1 ) } m off, where you were (${ offAt( v ).toFixed( 2 ) } m)` );
		await settled( S, v, 'swim', 12 );
		await shots( page, g, F, { outside: false } );
		await saveNow( g );
		v = await S.gone( 3, null, 'in the water by her, 3 h gone' );
		note( brief( v ) );
		say( v.mode === 'swim' && v.anchor && by( v ) < 30, `swim 3 h: by her still, at her anchor (${ v.mode }, ${ by( v ).toFixed( 1 ) } m)` );
		// too far from her: you'd left her, ashore
		await g.evaluate( () => {

			const a = window.__app, p = a.player, b = a.boatCtl.position;
			p.position.set( b.x + 420, a.waves.heightAt( b.x + 420, b.z ) - 0.2, b.z );
			p.mode = 'swim';

		} );
		await frames( g, 2 );
		await saveNow( g );
		v = await S.reload( 'far from her in the water' );
		note( brief( v ) );
		say( v.mode === 'walk' && !! v.anchor, `swim, 420 m off: ashore, as before, she at her anchor (${ v.mode })` );

	},

	// (M17) the kayak at anchor with you sat in her: being put back in her seat isn't taking her helm
	async kayakanchor( S ) {

		const { boat, g, page } = S, F = `${ out }/${ boat }-kayakanchor`;
		if ( boat !== 'kayak' ) return note( 'the kayak\'s alone' );
		await S.load( `${ plain }&boat=${ boat }`, 'goto', 'first, ?boat' );
		await S.fitted( ANCHOR[ boat ] );
		const at = await farSpot( g, { max: 9 } );
		await S.toSea( at );
		await frames( g, 3 );
		await g.evaluate( () => window.__app.game.dropAnchor() );
		await frames( g, 4 );
		const was = await view( g );
		say( was.mode === 'boat' && !! was.anchor, `kayak at anchor: sat in her, her anchor down (${ was.mode }, ${ JSON.stringify( was.anchor ) }) ${ JSON.stringify( was.toasts.slice( - 1 ) ) }` );
		await saveNow( g );
		let v = await S.reload( 'sat in her at anchor' );
		note( brief( v ) );
		good( v, 'kayak at anchor' );
		await frames( g, 6 );
		v = await view( g );
		say( v.mode === 'boat' && !! v.anchor && near( v, was, 5 ) && ! v.toasts.includes( 'Anchor up' ), `kayak at anchor: sat in her again, her anchor still down (${ v.mode }, ${ JSON.stringify( v.anchor ) }, toasts ${ JSON.stringify( v.toasts ) })` );
		await settled( S, v, 'kayak at anchor', 16 );
		await shots( page, g, F, { from: [ 4, 3, - 7 ] } );
		await saveNow( g );
		v = await S.gone( 3, null, 'sat in her at anchor, 3 h gone' );
		await frames( g, 6 );
		v = await view( g );
		note( brief( v ) );
		say( v.mode === 'boat' && !! v.anchor && near( v, was, 45 ), `kayak at anchor 3 h: sat in her, still at her anchor (${ Math.hypot( v.x - was.x, v.z - was.z ).toFixed( 1 ) } m from where she was)` );

	},

	// a new game
	async fresh( S ) {

		const { g, page } = S, F = `${ out }/fresh`;
		await S.load( plain, 'goto', 'a new game' );
		const v = await view( g );
		note( brief( v ) );
		sameBoat( v, 'kayak', 'new game' );
		good( v, 'new game' );
		say( v.beached && ! v.moored && v.mode === 'walk' && v.money >= 0 && ! v.note, `new game: the kayak on the sand, you ashore, no note ($${ v.money })` );
		say( v.fleet === 'kayak', `new game: she's all you own (${ v.fleet })` );
		await page.waitForTimeout( 10000 );
		await shots( page, g, F, { from: [ 5, 3, - 7 ] } );
		const v2 = await S.reload( 'new game, reloaded' );
		note( brief( v2 ) );
		sameBoat( v2, 'kayak', 'new game, reloaded' );
		say( v2.beached && near( v2, v, 1 ), 'new game, reloaded: as she was' );

	},

};

const list = BOATS.split( ',' );
const ONCE = [ 'v1', 'fresh' ];
for ( const boat of list ) for ( const name of Object.keys( SC ) ) {

	if ( wanted && ! wanted.includes( name ) ) continue;
	if ( ONCE.includes( name ) && boat !== list[ 0 ] ) continue;
	console.log( `---- ${ boat }: ${ name }` );
	const S = await session( boat );
	try {

		await SC[ name ]( S );

	} catch ( e ) {

		say( false, `${ boat } ${ name } ABORTED: ${ e.message.slice( 0, 400 ) }` );
		await S.page.screenshot( { path: `${ out }/${ boat }-${ name }-aborted.png` } ).catch( () => {} );

	}

	await S.close();

}

console.log( 'readings', JSON.stringify( readings ) );
const { oks, problems } = tally();
console.log( problems ? `${ problems } PROBLEM(S), ${ oks } ok` : `no problems, ${ oks } ok` );
await browser.close();
