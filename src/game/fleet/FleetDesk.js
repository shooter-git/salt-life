import { stormWear, STORM_FROM } from '../Hull.js';
import { YARD, yardPose } from '../../world/village/StormPlaces.js';
import { FLEET, paintOf } from './Fleet.js';
import { berthOf } from './Berths.js';
import { MooredBoats } from './MooredBoats.js';
import { SHAPES } from './MooredModels.js';
import { namePlate } from './BoatName.js';

// (M16) Your fleet, as the game runs it: taking one out, buying, trading in and selling at Marta's, the month's dues,
// the weather on the boats you're not in, what's drawn of them, the look of the one you are. The figures are Fleet.js',
// the save's GameState's; GameHUD's Boats tab (FleetPanel.js) and a word at her berth are how you get at it.
const WEAR_SAVE = 0.01;
const FIRST_LOOK = 1; // s (the weather on the others: not every frame)

export class FleetDesk {

	constructor( game ) {

		this.game = game;
		this.app = game.app;
		this.state = game.state;
		this.moored = null;
		this.plate = null;
		this.plateSign = null;
		this._switching = false;
		this._t = FIRST_LOOK;
		this._dirty = true;
		this._worn = {};
		this.state.onChange( () => this._dirty = true );

	}

	toast( text, ms ) {

		this.game.toast( text, ms );

	}

	// the spot she sits on in Marta's yard: { position, heading }
	cradleOf( id ) {

		const v = this.app.village;
		if ( id === 'lobster' ) return ( v && v.cradle ) || YARD.lobster;
		const draft = this.app.boat && this.app.boat.id === id && this.app.boat.dimensions ? this.app.boat.dimensions.draft : SHAPES[ id ].draft;
		return yardPose( id, this.app.terrainData, draft, SHAPES[ id ].length );

	}

	// into another: the one you're in comes home for Marta's tow fee if she's out -> whether you're in her
	async takeOut( id ) {

		const { app, game, state } = this, p = app.player;
		if ( this._switching || ! state.owns( id ) ) return false;
		if ( id === state.boat ) return true;
		if ( p.mode === 'deck' || p.mode === 'boat' || p.riding ) {

			this.toast( 'Step ashore first' );
			return false;

		}

		const job = game.towJob(), from = state.boatName();
		this._switching = true;
		let ok = false;
		try {

			ok = await app.setBoat( id );

		} catch ( e ) {

			console.warn( 'FleetDesk: couldn\'t get into her', e );

		}

		this._switching = false;
		if ( ! ok ) return false;
		const paid = job ? state.payTow( job.fee ) : 0;
		app.saveBoat();
		this.toast( job ? `Marta towed ${ from } home · $${ paid } · ${ state.boatName() }'s yours to take out` : `${ cap( state.boatName() ) }'s ready at her berth`, 3600 );
		return true;

	}

	// Marta's list: bought, trading in another or none. Her at her berth; into her only if you've traded in the one you're
	// in, which comes home first
	async buy( id, trade = null ) {

		const { state } = this, intoHer = trade && trade === state.boat;
		const was = trade ? state.boatName( trade ) : null;
		const r = state.buyBoat( id, trade );
		if ( ! r ) return false;
		if ( intoHer ) {

			await this.takeOut( id );
			state.dropBoat( trade );

		}

		this.toast( trade ? `${ cap( state.boatName( id ) ) }'s yours · Marta took ${ was } for $${ r.trade.toLocaleString() }` : `${ cap( state.boatName( id ) ) }'s yours · she's at her berth`, 4200 );
		return true;

	}

	sell( id ) {

		const name = this.state.boatName( id ), paid = this.state.sellBoat( id );
		if ( paid === null ) return false;
		this.toast( `Sold ${ name } to Marta · $${ paid.toLocaleString() }`, 3600 );
		return true;

	}

	haul( id ) {

		if ( id === this.state.boat ) return this.game.haul();
		const news = this.app.weather && this.app.weather.news;
		if ( ! news || news.stage === 'outlook' ) return false;
		if ( ! this.state.haulBoat( id, FLEET[ id ].haul ) ) return false;
		this.toast( `Marta's hauled ${ this.state.boatName( id ) } out · $${ FLEET[ id ].haul } · back in once it's gone by`, 3600 );
		return true;

	}

	relaunch( id ) {

		const b = this.state.fleet[ id ];
		if ( id === this.state.boat ) return this.game.relaunch();
		if ( ! b || ! b.hauled ) return false;
		b.hauled = false;
		this.state.save();
		this.state.emit();
		return true;

	}

	repair( id ) {

		if ( id === this.state.boat ) return this.game.repair();
		const paid = this.state.repairBoat( id );
		if ( paid ) this.toast( `Marta repaired ${ this.state.boatName( id ) } · $${ paid }` );
		return paid;

	}

	settle() {

		const paid = this.state.settleDues();
		if ( paid ) this.toast( `Settled up with Marta · $${ paid }` );
		return paid;

	}

	// per frame
	update( dt ) {

		const { app, state } = this;
		if ( ! app._started ) return;
		if ( ! this.moored ) {

			this.moored = new MooredBoats( { scene: app.scene, waves: app.waves, colliders: app.colliders, terrain: app.terrainData, shadows: app.tier !== 'low', light: ( o ) => app.lightUp( o ) } );
			this._dirty = true;

		}

		if ( this._dirty && ! this._switching ) {

			this._dirty = false;
			this.moored.sync( state, ( id ) => this.cradleOf( id ) );
			this.look();

		}

		this.moored.update( dt, app.camera );
		this._t -= dt;
		if ( this._t > 0 ) return;
		const step = FIRST_LOOK - this._t;
		this._t = FIRST_LOOK;
		this._dues();
		this._weather( step );

	}

	// the month's bill, as it comes
	_dues() {

		const bill = this.state.chargeDues( this.app.settings.day );
		if ( ! bill ) return;
		this.toast( bill.owed > 0 ? `Marta's bill for your slips and upkeep · $${ bill.due }, you'd $${ bill.paid } to spare · $${ bill.owed } on her tab` : `Marta's bill for your slips and upkeep · $${ bill.paid }`, 5200 );

	}

	// a storm on the boats you're not in, at their berths; those on her cradle back in once it's gone by
	_weather( step ) {

		const { app, state, game } = this, w = app.weather;
		if ( ! w ) return;
		const marta = game.chandlery && game.chandlery.vendor, news = w.news;
		let changed = false;
		for ( const [ id, b ] of Object.entries( state.fleet ) ) {

			if ( id === state.boat ) continue;
			if ( b.hauled ) {

				if ( ! news && marta && marta.open && game.martaIn ) {

					b.hauled = false;
					changed = true;

				}

				continue;

			}

			const P = berthOf( id ).position, U = w.windAt( P.x, P.z );
			if ( U <= STORM_FROM ) continue;
			b.hull = Math.min( 1, b.hull + stormWear( U, id ) * step );
			if ( b.hull - ( this._worn[ id ] || 0 ) > WEAR_SAVE ) {

				this._worn[ id ] = b.hull;
				state.save();

			}

		}

		if ( changed ) {

			state.save();
			state.emit();
			this.toast( 'Marta\'s put your boats back in at their berths', 3200 );

		}

	}

	// at the berth of one you're not in, ashore or wading: E gets you into her (saying what it'd cost to fetch the other)
	updatePrompt( inp, p ) {

		if ( ! this.moored || p.prompt || p.busy || p.riding || this._switching || ( p.mode !== 'walk' && p.mode !== 'swim' ) ) return;
		const id = this.moored.near( p.position.x, p.position.y, p.position.z );
		if ( ! id || ( this.game.hud && this.game.hud.standOpen ) ) return;
		const job = this.game.towJob();
		p.prompt = { key: 'E', text: `Take ${ this.state.boatName( id ) } out${ job ? ` · Marta tows ${ this.state.boatName() } home, $${ job.fee }` : '' }` };
		if ( inp.hit( 'KeyE' ) ) this.takeOut( id );

	}

	// the boat you're in, as you've had her done: her paint, her name on her transom
	look() {

		const app = this.app, boat = app.boat, rec = this.state.fleet[ boat.id ];
		if ( ! rec ) return;
		const paint = rec.paint ? paintOf( rec.paint ).hex : null;
		if ( boat.setPaint ) boat.setPaint( paint );
		const sign = `${ boat.id }|${ rec.name }|${ paint }`;
		if ( sign === this.plateSign && ( ! this.plate || this.plate.parent === boat.group ) ) return;
		this.plateSign = sign;
		if ( this.plate ) {

			this.plate.removeFromParent();
			this.plate.geometry.dispose();
			this.plate.material.map.dispose();
			this.plate.material.dispose();
			this.plate = null;

		}

		if ( rec.name && typeof document !== 'undefined' ) {

			this.plate = namePlate( rec.name, boat, paint );
			if ( this.plate ) {

				boat.group.add( this.plate );
				app.lightUp( this.plate );

			}

		}

	}

	// she's another boat now
	boatChanged() {

		this.plateSign = null;
		this._dirty = true;

	}

}

const cap = ( s ) => `${ s[ 0 ].toUpperCase() }${ s.slice( 1 ) }`;
