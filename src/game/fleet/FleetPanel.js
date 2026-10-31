import { BOATS } from '../../world/boat/Boats.js';
import { fuelOf, UPGRADES } from '../Gear.js';
import { repairFee } from '../Hull.js';
import { gallons } from '../Units.js';
import { FLEET, SALE, PAINTS, MONTH, NAME_MAX, monthly, gearWorth, kindOf, paintOf } from './Fleet.js';

// (M16) Marta's list of boats: GameHUD's Boats tab. The sportfisher's a silhouette with her name until she's earned.
//   FLEET_CSS   fleetRows( hud ) -> html   bindFleet( hud )
export const FLEET_CSS = /* css */`
.gm-boat { padding: var(--tw-2) 0; border-bottom: 1px solid var(--tw-line); }
.gm-boat-head { display: flex; gap: var(--tw-3); align-items: center; }
.gm-boat-pic { flex: 0 0 calc(150 * var(--tw-u)); height: calc(66 * var(--tw-u)); border-radius: calc(6 * var(--tw-u)); overflow: hidden;
	background: linear-gradient(180deg, #cfe2ea 0%, #e6e6d8 62%, #6d9fb0 62.5%, #3d7388 100%); display: flex; align-items: flex-end; justify-content: center; }
.gm-boat-pic img { display: block; width: 100%; height: 100%; object-fit: contain; object-position: center bottom; }
.gm-boat.is-shadow .gm-boat-pic img { filter: brightness(0) contrast(1); opacity: 0.92; }
.gm-boat-body { flex: 1 1 auto; min-width: 0; }
.gm-boat-body b { display: block; font-weight: 600; }
.gm-boat-body small { display: block; color: var(--tw-ink-3); font-size: var(--tw-fs-sm); margin-top: 2px; }
.gm-boat-progress { height: 4px; margin-top: var(--tw-1); border-radius: 2px; background: var(--tw-fill); overflow: hidden; }
.gm-boat-progress > span { display: block; height: 100%; background: var(--tw-sun); }
.gm-boat-acts { display: flex; flex-wrap: wrap; gap: var(--tw-1); justify-content: flex-end; margin-top: var(--tw-2); }
.gm-boat-looks { margin-top: var(--tw-2); padding: var(--tw-2); border-radius: calc(6 * var(--tw-u)); background: var(--tw-fill); }
.gm-boat-looks label { display: block; color: var(--tw-ink-3); font-size: var(--tw-fs-sm); margin-bottom: var(--tw-1); }
.gm-boat-looks input { width: 100%; box-sizing: border-box; padding: var(--tw-1) var(--tw-2); border-radius: calc(5 * var(--tw-u)); border: 1px solid var(--tw-line); background: rgba(0, 0, 0, 0.25); color: inherit; font: inherit; }
.gm-boat-swatches { display: flex; flex-wrap: wrap; gap: var(--tw-1); margin-top: var(--tw-1); }
.gm-boat-swatch { width: calc(30 * var(--tw-u)); height: calc(30 * var(--tw-u)); padding: 0; border-radius: 50%; border: 2px solid var(--tw-line); cursor: pointer; }
.gm-boat-swatch.is-on { border-color: var(--tw-aqua); box-shadow: 0 0 0 2px var(--tw-aqua); }
.gm-boat-swatch:disabled { opacity: 0.4; cursor: default; }
.gm-boat-section { display: block; margin: var(--tw-3) 0 var(--tw-1); color: var(--tw-ink-3); font-size: var(--tw-fs-xs); font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; }
.gm-boat-section:first-child { margin-top: 0; }
`;

const money = ( n ) => `$${ Math.abs( n ).toLocaleString() }`;
const esc = ( s ) => String( s ).replace( /[&<>"]/g, ( c ) => ( { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ c ] ) );

const picture = ( id ) => `<div class="gm-boat-pic"><img src="boats/${ id }.webp" alt="" draggable="false"></div>`;
const row = ( id, title, sub, shadow, more = '' ) => `<div class="gm-boat${ shadow ? ' is-shadow' : '' }" data-boat="${ id }"><div class="gm-boat-head">${ picture( id ) }<div class="gm-boat-body"><b>${ title }</b>${ sub }</div></div>${ more }</div>`;

// the sportfisher as she is until she's earned
function lockedRow( s ) {

	const u = s.unlock, id = 'sportfisher', left = u.left.slice( 0, 3 ).join( ', ' ) + ( u.left.length > 3 ? `, and ${ u.left.length - 3 } more` : '' );
	return row( id, BOATS[ id ].name, `<small>Finish your upgrades to unlock it · ${ u.done } of ${ u.of }</small><div class="gm-boat-progress"><span style="width:${ u.done / u.of * 100 }%"></span></div><small>Still to get: ${ esc( left ) }</small>`, true );

}

// one you could buy: her price, and each you could trade in for her
function forSaleRow( s, id ) {

	const F = FLEET[ id ], q = s.quoteBoat( id ), others = Object.keys( s.fleet );
	const fuel = fuelOf( id );
	const acts = [ `<button class="gm-btn" data-buyboat="${ id }" ${ q.can ? '' : 'disabled' }>Buy · ${ money( F.price ) }</button>` ];
	for ( const t of others ) {

		const Q = s.quoteBoat( id, t );
		if ( Q.trade <= 0 ) continue;
		acts.push( `<button class="gm-btn is-ghost" data-buyboat="${ id }" data-trade="${ t }" ${ Q.can ? '' : 'disabled' }>Trade ${ esc( s.boatName( t ) ) } (${ money( Q.trade ) }) · ${ Q.net >= 0 ? money( Q.net ) : `she pays you ${ money( Q.net ) }` }</button>` );

	}

	const keep = F.slip + F.upkeep;
	return row( id, `${ BOATS[ id ].name } · ${ money( F.price ) }`, `<small>${ BOATS[ id ].feet } ft · ${ fuel ? fuel.name.toLowerCase() : 'paddle' }${ keep ? ` · ${ money( keep ) } a month to keep` : ' · nothing to keep' }</small><small>${ F.what }</small>`, false, `<div class="gm-boat-acts">${ acts.join( '' ) }</div>` );

}

// one of yours: where she is, what she's like, what can be done with her
function ownRow( hud, id ) {

	const g = hud.game, s = g.state, b = s.fleet[ id ], you = id === s.boat, F = FLEET[ id ], fuel = fuelOf( id );
	const hauled = you ? s.hauled : b.hauled, wear = you ? s.hull : b.hull, news = g.app.weather && g.app.weather.news;
	const job = you ? g.towJob() : null;
	const bits = [ you ? ( job ? 'You\'re in her · she\'s out on the water' : 'You\'re in her' ) : 'At her berth' ];
	if ( hauled ) bits[ 0 ] = 'On blocks in Marta\'s yard';
	if ( fuel ) {

		const tank = s.statsOf( id ).fuelL, l = you ? s.fuelL : b.fuel === null ? tank : Math.min( b.fuel, tank );
		bits.push( `${ gallons( l ) } of ${ gallons( tank ) } gal of ${ fuel.name.toLowerCase() }` );

	}

	if ( wear > 0.005 ) bits.push( `${ Math.round( wear * 100 ) }% worn` );
	const keep = F.slip + F.upkeep;
	const acts = [];
	if ( ! you ) acts.push( `<button class="gm-btn" data-takeout="${ id }">Take her out${ g.towJob() ? ` · ${ esc( s.boatName() ) } towed home, ${ money( g.towJob().fee ) }` : '' }</button>` );
	if ( ! you && Object.keys( s.fleet ).length > 1 ) acts.push( `<button class="gm-btn is-ghost" data-sellboat="${ id }">Sell · ${ money( s.boatWorth( id, SALE ) ) }</button>` );
	if ( ! you && ! hauled && news && news.stage !== 'outlook' ) acts.push( `<button class="gm-btn is-ghost" data-haulboat="${ id }" ${ s.money < F.haul ? 'disabled' : '' }>Haul out · ${ money( F.haul ) }</button>` );
	if ( ! you && hauled ) acts.push( `<button class="gm-btn is-ghost" data-relaunchboat="${ id }">Back in</button>` );
	const fix = you ? 0 : repairFee( wear, id );
	if ( fix ) acts.push( `<button class="gm-btn is-ghost" data-repairboat="${ id }" ${ s.money < 1 ? 'disabled' : '' }>Repair · ${ money( Math.min( fix, s.money ) ) }</button>` );
	const open = hud._fleetOpen === id;
	acts.push( `<button class="gm-btn is-ghost" data-looks="${ id }">${ open ? 'Done' : 'Name and paint' }</button>` );
	const swatches = PAINTS.map( ( p ) => `<button class="gm-boat-swatch${ b.paint === p.id ? ' is-on' : '' }" data-paint="${ p.id }" data-boatid="${ id }" title="${ p.name } · ${ money( F.paintJob ) }" aria-label="${ p.name }" style="background:#${ p.hex.toString( 16 ).padStart( 6, '0' ) }" ${ b.paint !== p.id && s.money < F.paintJob ? 'disabled' : '' }></button>` ).join( '' );
	const looks = open ? `<div class="gm-boat-looks"><label>Her name, on her transom<input data-boatname="${ id }" maxlength="${ NAME_MAX }" value="${ esc( b.name || '' ) }" placeholder="${ esc( kindOf( id ) ) }" autocomplete="off" spellcheck="false"></label><label>Her paint · ${ money( F.paintJob ) } at the yard${ b.paint ? ` · now ${ paintOf( b.paint ).name.toLowerCase() }` : '' }</label><div class="gm-boat-swatches">${ swatches }</div></div>` : '';
	const gear = gearWorth( s.upgrades, id );
	return row( id, b.name ? `${ esc( b.name ) } <small style="display:inline">${ BOATS[ id ].name.toLowerCase() }</small>` : BOATS[ id ].name, `<small>${ bits.join( ' · ' ) }</small><small>${ keep ? `${ money( F.slip ) } slip, ${ money( F.upkeep ) } upkeep a month` : 'Nothing to keep' }${ gear ? ` · ${ money( gear ) } of gear on her` : '' }</small>`, false, `<div class="gm-boat-acts">${ acts.join( '' ) }</div>${ looks }` );

}

export function fleetRows( hud ) {

	const s = hud.game.state, ids = Object.keys( BOATS ), M = monthly( s.fleet ), day = s.dues.day;
	const owned = ids.filter( ( id ) => s.fleet[ id ] ), sale = ids.filter( ( id ) => ! s.fleet[ id ] );
	const tab = s.dues.owed > 0 ? `<div class="gm-shop-row"><span>You owe Marta ${ money( s.dues.owed ) }<small>Your slips and upkeep · no more boats till it's settled</small></span><button class="gm-btn" data-settle ${ s.money < 1 ? 'disabled' : '' }>Settle · ${ money( Math.min( s.dues.owed, s.money ) ) }</button></div>` : '';
	const bill = M ? `<small>${ money( M ) } a month in slips and upkeep${ day !== null ? `, next on day ${ day + MONTH }` : '' }</small>` : '';
	return `${ tab }<span class="gm-boat-section">Your boats</span>${ bill }${ owned.map( ( id ) => ownRow( hud, id ) ).join( '' ) }${ sale.length ? '<span class="gm-boat-section">On Marta\'s list</span>' : '' }${ sale.map( ( id ) => ( s.unlocked( id ) ? forSaleRow( s, id ) : lockedRow( s ) ) ).join( '' ) }`;

}

// the buttons; each draws the panel again itself (those that change the state do so through its change)
export function bindFleet( hud ) {

	const root = hud.stand, F = hud.game.fleet;
	const on = ( attr, fn ) => {

		for ( const b of root.querySelectorAll( `[data-${ attr }]` ) ) b.onclick = () => fn( b.dataset[ attr.replace( /-./g, ( m ) => m[ 1 ].toUpperCase() ) ], b );

	};

	const again = () => hud.renderTrader();
	on( 'buyboat', async ( id, b ) => {

		await F.buy( id, b.dataset.trade || null );
		again();

	} );
	on( 'takeout', async ( id ) => {

		await F.takeOut( id );
		again();

	} );
	on( 'sellboat', ( id ) => {

		F.sell( id );
		again();

	} );
	on( 'haulboat', ( id ) => {

		F.haul( id );
		again();

	} );
	on( 'relaunchboat', ( id ) => {

		F.relaunch( id );
		again();

	} );
	on( 'repairboat', ( id ) => {

		F.repair( id );
		again();

	} );
	on( 'settle', () => {

		F.settle();
		again();

	} );
	on( 'looks', ( id ) => {

		hud._fleetOpen = hud._fleetOpen === id ? null : id;
		again();

	} );
	on( 'paint', ( p, b ) => {

		hud.game.state.paintBoat( b.dataset.boatid, p );
		again();

	} );
	// her name: kept as you leave the box. The keys are yours while you type (the game's listen on the window), and it isn't
	// drawn again under you
	for ( const inp of root.querySelectorAll( '[data-boatname]' ) ) {

		const stop = ( e ) => e.stopPropagation();
		inp.onkeydown = ( e ) => {

			e.stopPropagation();
			if ( e.key === 'Enter' || e.key === 'Escape' ) inp.blur();

		};

		inp.onkeyup = stop;
		inp.onkeypress = stop;
		inp.onfocus = () => hud._fleetTyping = true;
		inp.onblur = () => {

			hud._fleetTyping = false;
			// (a moment on: a click that took the focus lands first, on the button it was meant for)
			setTimeout( () => hud.game.state.nameBoat( inp.dataset.boatname, inp.value ), 200 );

		};

	}

}
