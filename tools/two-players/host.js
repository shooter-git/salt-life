// Playing together on one machine, without All the Spaces: this page stands in for the app around one
// player's game (in the iframe, as the app's sealed frame holds it), and the pages open in the same
// browser share a room over a BroadcastChannel, as the app's realtime room does: who's here and who
// hosts (whoever came first), the shared values (newcomers get them on arrival; two set at once: the
// later stands for everyone, as the app's room orders them), and the messages.
// Each player's own save is kept in memory, one per page (a page opened again starts with a fresh
// save); the group's (the 'shared' scope) is the browser's (IndexedDB), so every page in the group sees
// it and it lasts. A save made on a stale read is refused, as the app's server does (each check and
// write is one transaction, so two pages saving at once can't both win). Plain script, no build: the
// dev server serves it as it is.
//   pnpm dev, then  http://127.0.0.1:5189/tools/two-players/?name=Robin  and  ?name=Sam  in a second window
//   ?id=  ?name=  ?color=  ?tier=low|mid|high  ?locale=en-GB  ?src= (the game: / by default)
//   ?group= (whose shared save: 'island' by default; a new name starts the group afresh)
//   window.__host.leave()  (from the console: this player leaves the room, as closing the window does)

const params = new URLSearchParams( location.search );
const frame = document.querySelector( 'iframe' );
const name = params.get( 'name' ) || 'Player';
const me = { id: params.get( 'id' ) || `${ name.toLowerCase() }-${ Math.random().toString( 36 ).slice( 2, 6 ) }`, name, color: params.get( 'color' ) || '#3f5b7c' };
const joinedAt = Date.now();
const room = new BroadcastChannel( 'salt-life-two-players' );
const people = new Map( [ [ me.id, { person: me, at: joinedAt } ] ] ); // id -> { person, at (joined) }
const shared = new Map(); // the room's shared values
const stamps = new Map(); // key -> [ ms, id ]: when each value was set, and by whom
const later = ( a, b ) => ! b || a[ 0 ] > b[ 0 ] || ( a[ 0 ] === b[ 0 ] && a[ 1 ] > b[ 1 ] );
const saved = new Map(); // this player's saves: 'personal/key' -> { value, schemaVersion, version }
const group = params.get( 'group' ) || 'island';
// the group's saves: '<group>/key' -> { value, schemaVersion, version }, in the browser's IndexedDB
const db = new Promise( ( done, fail ) => {

	const r = indexedDB.open( 'salt-life-two-players', 1 );
	r.onupgradeneeded = () => r.result.createObjectStore( 'shared' );
	r.onsuccess = () => done( r.result );
	r.onerror = () => fail( r.error );

} );
// a save: this player's (in memory) or the group's -> { value, schemaVersion, version } | undefined
const read = async ( scope, key ) => {

	if ( scope !== 'shared' ) return saved.get( `${ scope }/${ key }` );
	const get = ( await db ).transaction( 'shared' ).objectStore( 'shared' ).get( `${ group }/${ key }` );
	return new Promise( ( done ) => {

		get.onsuccess = () => done( get.result );
		get.onerror = () => done( undefined );

	} );

};
// the app's rule: a save based on a version that isn't the current one is stale -> the new version, or
// null (stale)
const next = ( row, basedOn ) => ( basedOn != null && basedOn !== ( row ? row.version : null ) ? null : ( row ? row.version : 0 ) + 1 );
const write = async ( scope, key, value, schemaVersion, basedOn ) => {

	if ( scope !== 'shared' ) {

		const version = next( saved.get( `${ scope }/${ key }` ), basedOn );
		if ( version ) saved.set( `${ scope }/${ key }`, { value, schemaVersion, version } );
		return version;

	}

	const tx = ( await db ).transaction( 'shared', 'readwrite' ), st = tx.objectStore( 'shared' ), k = `${ group }/${ key }`;
	return new Promise( ( done ) => {

		let version = null;
		const get = st.get( k );
		get.onsuccess = () => {

			version = next( get.result, basedOn );
			if ( version ) st.put( { value, schemaVersion, version }, k );

		};
		tx.oncomplete = () => done( version );
		tx.onerror = tx.onabort = () => done( null );

	} );

};
let inited = false;
document.title = `${ name } · Salt Life`;

const send = ( msg ) => frame.contentWindow && frame.contentWindow.postMessage( { ats: 'bridge', v: 1, msg }, '*' );
const order = () => [ ...people.values() ].sort( ( a, b ) => a.at - b.at );
const tellPlayers = () => inited && send( { type: 'players', data: { players: order().map( ( p ) => p.person ), hostId: order()[ 0 ].person.id } } );
window.__host = { me, people, shared, leave: () => room.postMessage( { t: 'leave', id: me.id } ) };

// the room: someone arrives (and is told who's here, and the values), leaves, sets a value, sends a message
room.onmessage = ( { data: m } ) => {

	if ( m.t === 'join' || m.t === 'here' ) {

		const fresh = ! people.has( m.who.id );
		people.set( m.who.id, { person: m.who, at: m.at } );
		if ( m.t === 'join' ) room.postMessage( { t: 'here', who: me, at: joinedAt, shared: [ ...shared ].map( ( [ k, v ] ) => [ k, v, stamps.get( k ) ] ) } );
		for ( const [ k, v, stamp ] of m.shared || [] ) {

			if ( shared.has( k ) && ! ( stamp && later( stamp, stamps.get( k ) ) ) ) continue;
			shared.set( k, v );
			if ( stamp ) stamps.set( k, stamp );

		}

		if ( fresh ) tellPlayers();

	} else if ( m.t === 'leave' ) {

		people.delete( m.id );
		tellPlayers();

	} else if ( m.t === 'shared' ) {

		// (set here too in the meantime, and later: that one stands, on every page)
		if ( m.stamp && ! later( m.stamp, stamps.get( m.key ) ) ) return;
		shared.set( m.key, m.value );
		if ( m.stamp ) stamps.set( m.key, m.stamp );
		if ( inited ) send( { type: 'mp:shared', data: { key: m.key, value: m.value, by: m.by } } );

	} else if ( m.t === 'send' ) {

		if ( ! m.to || m.to === me.id ) send( { type: 'mp:message', data: { from: m.from, kind: m.kind, body: m.body } } );

	}

};
addEventListener( 'pagehide', () => window.__host.leave() );

// the game: what the app answers
addEventListener( 'message', ( e ) => {

	if ( e.source !== frame.contentWindow || ! e.data || e.data.ats !== 'bridge' ) return;
	const msg = e.data.msg;
	switch ( msg.type ) {

		case 'hello':
			if ( inited ) break;
			inited = true;
			// as the app does: the game starts as if alone; who's here and the room's values come with
			// joining, a moment later
			send( { type: 'init', data: {
				protocolVersion: 1,
				creation: { id: 'salt-life', version: 1, title: 'Salt Life' },
				me,
				players: [ me ],
				session: { id: 'two-players', mode: 'shared', hostId: null },
				tier: params.get( 'tier' ) || 'mid',
				reducedMotion: matchMedia( '(prefers-reduced-motion: reduce)' ).matches,
				locale: params.get( 'locale' ) || navigator.language,
				viewport: { width: innerWidth, height: innerHeight, orientation: innerWidth >= innerHeight ? 'landscape' : 'portrait', safeArea: { top: 0, right: 0, bottom: 0, left: 0 }, dpr: devicePixelRatio, touch: matchMedia( '(pointer: coarse)' ).matches },
			} } );
			setTimeout( () => {

				room.postMessage( { t: 'join', who: me, at: joinedAt } );
				// (the others answer: then who's here and the values go to the game together)
				setTimeout( () => {

					for ( const [ k, v ] of shared ) send( { type: 'mp:shared', data: { key: k, value: v, by: null } } );
					tellPlayers();

				}, 400 );

			}, 1500 );
			break;
		case 'save:get':
			read( msg.scope, msg.key ).then( ( r ) => send( { type: 'result', re: msg.id, ok: true, data: r ? { value: r.value, schemaVersion: r.schemaVersion, version: r.version } : { value: null, schemaVersion: null, version: null } } ) );
			break;
		case 'save:set':
			// (saved by someone else since it was read: refused, as the app does)
			write( msg.scope, msg.key, msg.value, msg.schemaVersion, msg.basedOn ).then( ( version ) => send( version
				? { type: 'result', re: msg.id, ok: true, data: { version } }
				: { type: 'result', re: msg.id, ok: false, error: 'Saved by someone else in the meantime.', code: 'stale' } ) );
			break;
		case 'mp:shared': {

			// (after anything this page has seen set)
			const seen = stamps.get( msg.key ), stamp = [ Math.max( Date.now(), seen ? seen[ 0 ] + 1 : 0 ), me.id ];
			shared.set( msg.key, msg.value );
			stamps.set( msg.key, stamp );
			send( { type: 'result', re: msg.id, ok: true } );
			send( { type: 'mp:shared', data: { key: msg.key, value: msg.value, by: me.id } } );
			room.postMessage( { t: 'shared', key: msg.key, value: msg.value, by: me.id, stamp } );
			break;

		}
		case 'mp:send':
			room.postMessage( { t: 'send', kind: msg.kind, body: msg.body, from: me.id, to: msg.to } );
			break;
		case 'ui:toast':
			console.info( `[${ name }] toast:`, msg.text );
			break;
		default:
			// (anything else that wants an answer: none here)
			if ( msg.id !== undefined ) send( { type: 'result', re: msg.id, ok: false, error: 'Not in this stand-in.', code: 'not-approved' } );

	}

} );
setInterval( () => send( { type: 'ping', n: 0 } ), 500 );
addEventListener( 'resize', () => send( { type: 'viewport', data: { width: innerWidth, height: innerHeight, orientation: innerWidth >= innerHeight ? 'landscape' : 'portrait', safeArea: { top: 0, right: 0, bottom: 0, left: 0 }, dpr: devicePixelRatio, touch: matchMedia( '(pointer: coarse)' ).matches } } ) );
frame.src = params.get( 'src' ) || '/';
