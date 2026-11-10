import { FINDS, LIES } from './Beachcomb.js';
import { readShells, keepShell } from './Shells.js';
import { FISH, fishValue, fishLengthCm } from './FishTable.js';
import { defaultUpgrades, gearStats, nextLevel, UPGRADES, fuelPrice, unlockProgress } from './Gear.js';
import { repairFee } from './Hull.js';
import { FLEET, TRADE, SALE, MONTH, MOST_MONTHS, DUES_LEAVE, gearWorth, monthly, cleanName, paintOf, kindOf } from './fleet/Fleet.js';
import { cleanTrophies } from './Trophies.js';
import { cleanLog } from './LifeList.js';
import { ordersOf, orderPrice } from './Orders.js';
import { WEEK_MUL } from './WeekOrder.js';
import { BAITS, KEEPER_KG, baitOf, chunksOf } from './Bait.js';
import { LEADERS } from './rigs/Presentation.js';
import { PLACES } from './Places.js';
import { ChartLog } from './Chart.js';
import { BOATS, START_BOAT } from '../world/boat/Boats.js';
import { cleanDays } from './Seaworthy.js';
import { newTraps, cleanTraps } from './Traps.js';

const SAVE_KEY = 'tidewater.save.v1';

// (M16) a boat you own, as the save keeps her while you're in another
// (paid: what she cost you; null: she came with the game, and is worth what Marta could sell her for, a kayak nothing)
const newBoat = ( b = {} ) => ( {
	fuel: Number.isFinite( b.fuel ) ? b.fuel : null,
	hull: Number.isFinite( b.hull ) ? Math.min( 1, Math.max( 0, b.hull ) ) : 0,
	hauled: b.hauled === true,
	name: typeof b.name === 'string' ? cleanName( b.name ) || null : null,
	paint: paintOf( b.paint ) ? b.paint : null,
	paid: Number.isFinite( b.paid ) ? b.paid : null,
} );

// Everything the player owns: wallet, the fish in the cooler / hold, the fish log and the gear
// levels. Saved to localStorage (per browser) after every change; storage can be missing or throw
// (private windows, blocked site data), so every access is guarded and the game runs without it.
export class GameState {

	constructor( storage = safeStorage() ) {

		this.storage = storage;
		this.money = 0;
		this.inventory = []; // { id, species, kg, cm, value, caughtAt (game hours), record, method } ((M17) aboard, boat: in someone else's hold, hers)
		// ((M17) not saved: riding with her owner, the room in her hold for a fish too big for yours ({ owner, name, room }), and kg of
		// someone else's in yours (together/))
		this.aboardHold = null;
		this.lent = 0;
		// species -> { count, bestKg, bestCm, ((M17) the life list: docs/m17/life-list.md) bestDay, bestAt: your best's island day and
		// place (Places.js), first: [ day, place ] of the first one (each null when it wasn't known: a save from before M17) }
		this.log = {};
		this.places = {}; // ((M15) Places.js) place -> { n, day, first: species } (the first catch there: the log)
		this.trophies = {}; // ((M16) Trophies.js) a billfish let go: species -> { n, kg, cm, day, place, tagged } (your best)
		this.found = {}; // ((M15) Places.js' FAR_PLACES) place -> the day you first came to it (the log names it then)
		// the last addFish: { species, kg, cm, value, newSpecies, record, prevBestKg, prevBestCm, kept,
		// released, why, method, bag, at, day, place, firstAt } (the catch card; (M15) firstAt: the place, when
		// it's the first fish you've had there)
		this.lastCatch = null;
		this.bag = { day: null, n: {} }; // (Salt Life) how many of each bag-limited kind (FishTable bag) you've kept that day
		this.upgrades = defaultUpgrades(); // ((M16) your own gear's and all your boats': Gear.js, each track says whose)
		// (M16) the boat you're in (world/boat/Boats.js), and the others you own: { fuel, hull, hauled, name, paint } of each
		// (fuel, hull and hauled below are hers, the one you're in)
		this.boat = START_BOAT;
		this.fleet = { [ START_BOAT ]: newBoat() };
		this.earned = false; // (M16) the sportfisher's unlocked (kept: selling the lobster boat doesn't lock her again)
		this.dues = { day: null, owed: 0 }; // (M16) the day your slips and upkeep are paid to, and what's on Marta's tab
		this.fuel = null; // litres left (null = full tank)
		this.hull = 0; // (M10) the boat's wear, 0..1 (game/Hull.js), until Marta repairs it
		this.hauled = false; // (M13) Marta's hauled her out ahead of a hurricane (on her cradle ashore)
		this.look = null; // (Salt Life) how the others see you: one of together/Avatar.js LOOKS (null: not chosen)
		this.orders = { day: null, filled: {} }; // (Salt Life) the wanted lists (Orders.js): how many of each you've filled that day
		this.weekPaid = null; // (Salt Life) the last week's order (WeekOrder.js) Joe paid you your share of
		// (Salt Life) the bait bucket: kind (Bait.js) -> how many; the one you bait the hook with (null:
		// the frozen shrimp)
		this.bait = {};
		this.baitPick = null;
		this.leaderPick = null; // ((M16) the leader you've tied on, any rig: Presentation.leaderOn; null: the sensible one)
		// ((M15) beachcombing (Beachcomb.js): what you've picked up off the sand, and which finds you've had (the
		// last few days': they'd have gone by now anyway), so they're not there again)
		this.finds = []; // { id, kind, day, seed }
		this.picked = [];
		this.shells = readShells(); // ((M16) the shell collection: Shells.js)
		this.chart = new ChartLog(); // ((M15) the chart you fill in: Chart.js)
		this.days = cleanDays(); // ((M16) ice, stores, how long you've been out: DaysOut.js)
		this.traps = newTraps(); // ((M16) your lobster traps out on the sea: Traps.js)
		this._nextId = 1;
		this.listeners = new Set();
		this._chartBought();

	}

	get stats() {

		return gearStats( this.upgrades, this.boat );

	}

	// (M16) what another of your boats is, with her own gear
	statsOf( id ) {

		return gearStats( this.upgrades, id );

	}

	// (M16) your boats: whether she's yours, making her yours, and getting into another of them (App.setBoat does the rest)
	owns( id ) {

		return !! this.fleet[ id ];

	}

	addBoat( id ) {

		if ( ! BOATS[ id ] ) return false;
		if ( ! this.fleet[ id ] ) this.fleet[ id ] = newBoat();
		this.save();
		return true;

	}

	selectBoat( id ) {

		if ( ! this.fleet[ id ] ) return false;
		this._boatAway();
		this.boat = id;
		const b = this.fleet[ id ];
		this.fuel = b.fuel;
		this.hull = b.hull;
		this.hauled = b.hauled;
		this.save();
		return true;

	}

	// what she'd pay for a boat you own: of what you paid for her and her upgrades, less her repair (terms: TRADE, SALE)
	boatWorth( id, terms = TRADE ) {

		const b = this.fleet[ id ];
		if ( ! b ) return 0;
		const paid = b.paid ?? ( id === 'kayak' ? 0 : FLEET[ id ].price );
		const wear = id === this.boat ? this.hull : b.hull;
		return Math.max( 0, Math.round( paid * terms.boat + gearWorth( this.upgrades, id ) * terms.gear ) - repairFee( wear, id ) );

	}

	// (M16) whether the sportfisher's shown yet, and how far you are (Gear.unlockProgress)
	get unlock() {

		return unlockProgress( this.upgrades );

	}

	unlocked( id ) {

		return id !== 'sportfisher' || this.earned || this.unlock.met;

	}

	// what buying a boat comes to, trading in another (id) or none: { price, trade, net, can, why }
	quoteBoat( id, trade = null ) {

		const price = FLEET[ id ] ? FLEET[ id ].price : 0, t = trade && trade !== id ? this.boatWorth( trade ) : 0, net = price - t;
		const why = ! BOATS[ id ] || ! FLEET[ id ] ? 'none' : this.fleet[ id ] ? 'owned' : ! this.unlocked( id ) ? 'locked' : trade && ! this.fleet[ trade ] ? 'none' : this.dues.owed > 0 ? 'owed' : net > this.money ? 'money' : null;
		return { price, trade: t, net, can: ! why, why };

	}

	// She's yours: paid for, less what she gave for `trade`, which goes (unless you're in her: get out, then dropBoat).
	// -> { paid: what it cost you (less than nothing when she's paid you), trade: what she gave } or null
	buyBoat( id, trade = null ) {

		const q = this.quoteBoat( id, trade );
		if ( ! q.can ) return null;
		this.money -= q.net;
		this.fleet[ id ] = newBoat( { paid: q.price } );
		if ( trade && trade !== this.boat ) this.dropBoat( trade );
		this.save();
		this.emit();
		return { paid: q.net, trade: q.trade };

	}

	// gone: her record, and her upgrades with her (never the boat you're in)
	dropBoat( id ) {

		if ( id === this.boat || ! this.fleet[ id ] ) return false;
		delete this.fleet[ id ];
		for ( const [ k, t ] of Object.entries( UPGRADES ) ) if ( t.on === id ) this.upgrades[ k ] = 0;
		this.save();
		this.emit();
		return true;

	}

	// sold to Marta for cash -> what she paid, or null: you'd need to be in another, and to have one left
	sellBoat( id ) {

		if ( ! this.fleet[ id ] || id === this.boat || Object.keys( this.fleet ).length < 2 ) return null;
		const paid = this.boatWorth( id, SALE );
		this.money += paid;
		this.dropBoat( id );
		return paid;

	}

	// her name (blank: none), free; her paint, for the yard's price -> whether it's done
	nameBoat( id, name ) {

		if ( ! this.fleet[ id ] ) return false;
		this.fleet[ id ].name = cleanName( name ) || null;
		this.save();
		this.emit();
		return true;

	}

	paintBoat( id, paint ) {

		const b = this.fleet[ id ];
		if ( ! b || ! paintOf( paint ) || b.paint === paint || ! this.spend( FLEET[ id ].paintJob ) ) return false;
		b.paint = paint;
		this.save();
		this.emit();
		return true;

	}

	// as you'd call her: 'Miss Behavin', or the lobster boat
	boatName( id = this.boat ) {

		const b = this.fleet[ id ];
		return ( b && b.name ) || `the ${ kindOf( id ) }`;

	}

	// A boat you're not in hauled out, or back in. Her fee's paid first -> whether she is now
	haulBoat( id, fee ) {

		const b = this.fleet[ id ];
		if ( ! b || id === this.boat || b.hauled || ! this.spend( fee ) ) return false;
		b.hauled = true;
		this.save();
		this.emit();
		return true;

	}

	// and her repair: as far as your money goes, as payRepair -> what was paid
	repairBoat( id ) {

		const b = this.fleet[ id ];
		if ( ! b || id === this.boat ) return 0;
		const fee = repairFee( b.hull, id ), paid = Math.min( fee, this.money );
		if ( paid <= 0 ) return 0;
		this.money -= paid;
		b.hull = paid >= fee ? 0 : b.hull * ( 1 - paid / fee );
		this.save();
		this.emit();
		return paid;

	}

	// The month's slips and upkeep on the island's `day`, every MONTH days from the day you first came to them (a clock
	// running behind, in a room on an earlier day, owes nothing). She takes what you have, down to DUES_LEAVE, and the rest
	// goes on her tab: you can't buy another boat until it's settled. She never takes a boat for it
	// -> { months, due, paid, owed } when a bill's come, else null
	chargeDues( day ) {

		const d = this.dues;
		if ( ! Number.isFinite( day ) ) return null;
		if ( d.day === null ) {

			d.day = day;
			return null;

		}

		const months = Math.floor( ( day - d.day ) / MONTH );
		if ( months < 1 ) return null;
		d.day += months * MONTH;
		const bill = Math.min( months, MOST_MONTHS ) * monthly( this.fleet );
		const due = bill + d.owed, paid = Math.min( due, Math.max( 0, this.money - DUES_LEAVE ) );
		this.money -= paid;
		d.owed = due - paid;
		this.save();
		this.emit();
		return bill > 0 ? { months: Math.min( months, MOST_MONTHS ), due, paid, owed: d.owed } : null;

	}

	// what's on the tab, paid as far as your money goes -> what was paid
	settleDues() {

		const paid = Math.min( this.dues.owed, this.money );
		if ( paid <= 0 ) return 0;
		this.money -= paid;
		this.dues.owed -= paid;
		this.save();
		this.emit();
		return paid;

	}

	// what's on the boat you're in, into the fleet's record of her
	_boatAway() {

		const b = this.fleet[ this.boat ] || ( this.fleet[ this.boat ] = newBoat() );
		b.fuel = this.fuel;
		b.hull = this.hull;
		b.hauled = this.hauled;

	}

	// ((M17) not counting one of yours in someone else's hold: aboard, as stowFor puts it there)
	get holdKg() {

		let kg = 0;
		for ( const f of this.inventory ) if ( ! f.aboard ) kg += f.kg;
		return kg;

	}

	// (M17) what of yours is in someone else's hold (their id): fish too big for yours, caught aboard her (together/)
	stowedIn( owner ) {

		let kg = 0;
		for ( const f of this.inventory ) if ( f.aboard === owner ) kg += f.kg;
		return kg;

	}

	// (M17) riding with her owner aboard: a fish too big for your own hold goes in hers, if there's room in it (aboardHold:
	// { owner, name, room }, Together's from her owner's game). It's still yours: your log, your hold's list, yours to sell.
	// -> her owner's name, or null
	stowFor( kg ) {

		const H = this.aboardHold;
		if ( ! H || kg <= this.stats.holdKg + 1e-6 ) return null;
		return kg <= H.room - this.stowedIn( H.owner ) + 1e-6 ? H.name : null;

	}

	get holdValue() {

		let v = 0;
		for ( const f of this.inventory ) v += f.value;
		return v;

	}

	// room in the cooler / hold for a fish of `kg`?
	// ((M17) less what someone riding with you has in it: lent, Together's, not saved)
	fits( kg ) {

		return this.holdKg + ( this.lent || 0 ) + kg <= this.stats.holdKg + 1e-6;

	}

	// store a caught fish; returns the entry, or null when the hold is full or the fish is protected
	// (released: it is logged either way). A record beats an earlier catch of the species; the first
	// one of a species is a new species. method: 'rod', 'spear' or (Salt Life) 'hand' (a spiny lobster);
	// cm: its length when it was measured (a speared fish: the size it swam at), else from its weight;
	// day: the island's day, for a kind with a bag limit (one over it is let go: lastCatch.bag); release:
	// why one that may be kept is let go all the same ('short', 'berried': lastCatch.why)
	// (M15) place: where it was caught (Places.js), or null; the first fish there is noted (firstAt)
	addFish( species, kg, timeOfDay = 12, { method = 'rod', cm = null, day = null, release = null, place = null } = {} ) {

		kg = Math.round( kg * 100 ) / 100;
		cm = Math.round( cm ?? fishLengthCm( species, kg ) );
		const { newSpecies, record, prevBestKg, prevBestCm } = this.logFish( species, kg, cm, day, place );
		const firstAt = this.logPlace( place, species, day );
		const value = fishValue( species, kg );
		const released = !! FISH[ species ].protected || !! release;
		const max = day !== null ? FISH[ species ].bag || 0 : 0;
		const full = max > 0 && ! released && this.bagged( species, day ) >= max;
		const stowed = ! released && ! full && ! this.fits( kg ) ? this.stowFor( kg ) : null; // ((M17) in the hold of the boat you're aboard)
		const kept = ! released && ! full && ( this.fits( kg ) || !! stowed );
		if ( kept && max ) this.bagOne( species, day );
		const bag = max ? { n: this.bagged( species, day ), max, full } : null;
		const why = release || ( FISH[ species ].protected ? 'protected' : null );
		this.lastCatch = { species, kg, cm, value, newSpecies, record, prevBestKg, prevBestCm, kept, released, why, method, bag, at: timeOfDay, day, place, firstAt, stowed };
		if ( ! kept ) {

			this.save();
			this.emit();
			return null;

		}

		const f = { id: this._nextId ++, species, kg, cm, value, caughtAt: timeOfDay, record, method };
		if ( place ) f.place = place;
		if ( stowed ) {

			f.aboard = this.aboardHold.owner;
			f.boat = stowed;

		}

		this.lastCatch.id = f.id;
		this.inventory.push( f );
		this.save();
		this.emit();
		return f;

	}

	// (v2.1.6) whether the catch just kept may be let go off its card, at once and alive: not a speared one (it's
	// dead), nor one let go already, and only while it's still in the cooler
	canFree( info = this.lastCatch ) {

		return !! info && info.kept && ! info.released && info.method !== 'spear' && info.id !== undefined && this.inventory.some( ( f ) => f.id === info.id );

	}

	// (v2.1.6) let it go off its card: out of the cooler and out of the day's bag, as the rules have it (they count the
	// fish kept, and one put straight back alive never was). One let go from the cooler later still counts (bagged).
	// It stays in the log: it was caught. -> true, or false when it can't be (canFree)
	freeLast( info = this.lastCatch ) {

		if ( ! this.canFree( info ) ) return false;
		this.inventory = this.inventory.filter( ( f ) => f.id !== info.id );
		const max = info.day !== null && info.day !== undefined ? FISH[ info.species ].bag || 0 : 0;
		if ( max && this.bag.day === info.day && this.bag.n[ info.species ] > 0 ) this.bag.n[ info.species ] --;
		info.kept = false;
		info.released = true;
		info.why = 'freed';
		info.bag = max ? { n: this.bagged( info.species, info.day ), max, full: false } : null;
		this.save();
		this.emit();
		return true;

	}

	// (M15) one more fish caught at a place (Places.js) -> the place, when it's the first there, else null
	logPlace( place, species, day = null ) {

		if ( ! place || ! PLACES[ place ] ) return null;
		const first = ! this.places[ place ];
		const p = this.places[ place ] || ( this.places[ place ] = { n: 0, day, first: species } );
		p.n ++;
		this.findPlace( place, day );
		return first ? place : null;

	}

	// (M15) you've come to a far place (Places' FAR_PLACES): true the first time (saved, and the log names it)
	findPlace( place, day = null ) {

		if ( ! PLACES[ place ] || ! PLACES[ place ].far || this.found[ place ] !== undefined ) return false;
		this.found[ place ] = day;
		this.save();
		this.emit();
		return true;

	}

	// (M15) whether room could be made for a catch there was none for, by letting fish go from the cooler:
	// one not let go for its own sake (protected, short, over the bag) and no heavier than the cooler holds
	roomFor( info = this.lastCatch ) {

		return !! info && ! info.kept && ! info.released && ! ( info.bag && info.bag.full ) && info.kg <= this.stats.holdKg + 1e-6;

	}

	// (M15) that catch kept after all, once there's room for it (it's in the log already: addFish) -> its
	// entry, or null while it still doesn't fit
	keepLast( info = this.lastCatch ) {

		if ( ! this.roomFor( info ) || ! this.fits( info.kg ) ) return null;
		const max = info.day !== null && info.day !== undefined ? FISH[ info.species ].bag || 0 : 0;
		if ( max ) {

			this.bagOne( info.species, info.day );
			info.bag = { n: this.bagged( info.species, info.day ), max, full: false };

		}

		info.kept = true;
		const f = { id: this._nextId ++, species: info.species, kg: info.kg, cm: info.cm, value: info.value, caughtAt: info.at, record: info.record, method: info.method };
		info.id = f.id;
		if ( info.place ) f.place = info.place;
		this.inventory.push( f );
		this.save();
		this.emit();
		return f;

	}

	// a fish in the log: one more of its kind, and its best -> { newSpecies, record, prevBestKg, prevBestCm }
	// ((M17) day, place: when and where, the island's day and Places.js', kept with the first of its kind and with your best)
	logFish( species, kg, cm, day = null, place = null ) {

		const logEntry = this.log[ species ] || ( this.log[ species ] = { count: 0, bestKg: 0 } );
		const newSpecies = logEntry.count === 0;
		const prevBestKg = logEntry.bestKg, prevBestCm = logEntry.bestCm ?? ( prevBestKg > 0 ? Math.round( fishLengthCm( species, prevBestKg ) ) : 0 );
		const record = ! newSpecies && kg > prevBestKg;
		const when = Number.isInteger( day ) && day >= 0 ? day : null, where = PLACES[ place ] ? place : null;
		if ( newSpecies ) logEntry.first = [ when, where ];
		logEntry.count ++;
		if ( kg > prevBestKg ) {

			logEntry.bestKg = kg;
			logEntry.bestCm = cm;
			logEntry.bestDay = when;
			logEntry.bestAt = where;

		}

		return { newSpecies, record, prevBestKg, prevBestCm };

	}

	// ---- (Salt Life) the cast net's haul and the bait bucket (Bait.js)

	// the live bait in the bucket (what its size limits: cut bait keeps in the cooler)
	get baitCount() {

		let n = 0;
		for ( const k in this.bait ) if ( BAITS[ k ].live ) n += this.bait[ k ];
		return n;

	}

	// a cast net's haul: [ { species (the catch table's, or null: not one of its fish), label, kg, cm } ].
	// Each catch-table fish is logged; a keeper mullet goes in the cooler, the bait fish in the bucket
	// while there's room; the rest go back (why: 'protected', 'notNet': not a fish a net may take,
	// 'full': no room in the cooler, 'bucket': the bucket's full). Each of `fish` is marked kept (true:
	// in the cooler or the bucket) or not
	// (M15) place: where it was thrown (Places.js; the first catch there noted: firstAt)
	// -> { cooler: [ entries ], bait: { kind: n }, back: [ { species, label, why } ], news: [ species ], records: [ species ], firstAt }
	addHaul( fish, timeOfDay = 12, place = null, day = null ) {

		const r = { cooler: [], bait: {}, back: [], news: [], records: [], firstAt: null };
		const room = this.stats.baitMax;
		for ( const f of fish ) {

			f.kept = false;
			const F = f.species && FISH[ f.species ];
			if ( ! F ) {

				r.back.push( { species: null, label: f.label, why: 'notNet' } );
				continue;

			}

			const kg = Math.round( f.kg * 100 ) / 100, cm = Math.round( f.cm ?? fishLengthCm( f.species, kg ) );
			const log = this.logFish( f.species, kg, cm, day, place );
			r.firstAt = this.logPlace( place, f.species, day ) || r.firstAt;
			if ( log.newSpecies ) r.news.push( f.species );
			else if ( log.record && ! r.records.includes( f.species ) ) r.records.push( f.species );
			const back = ( why ) => r.back.push( { species: f.species, label: F.name, why } );
			if ( F.protected ) back( 'protected' );
			else if ( ! F.net ) back( 'notNet' );
			else if ( f.species === 'mullet' && kg >= KEEPER_KG ) {

				if ( ! this.fits( kg ) ) back( 'full' );
				else {

					const e = { id: this._nextId ++, species: f.species, kg, cm, value: fishValue( f.species, kg ), caughtAt: timeOfDay, record: log.record, method: 'net' };
					if ( place ) e.place = place;
					this.inventory.push( e );
					r.cooler.push( e );
					f.kept = true;

				}

			} else {

				const kind = baitOf( f.species );
				if ( ! kind ) back( 'notNet' );
				else if ( this.baitCount >= room ) back( 'bucket' );
				else {

					this.bait[ kind ] = ( this.bait[ kind ] | 0 ) + 1;
					r.bait[ kind ] = ( r.bait[ kind ] | 0 ) + 1;
					f.kept = true;

				}

			}

		}

		this.save();
		this.emit();
		return r;

	}

	// one off the bucket for the hook -> whether there was one
	takeBait( kind ) {

		if ( BAITS[ kind ] && BAITS[ kind ].lure ) return true; // ((M16) yours for good)
		if ( ! ( this.bait[ kind ] > 0 ) ) return false;
		if ( -- this.bait[ kind ] === 0 ) delete this.bait[ kind ];
		this.save();
		this.emit();
		return true;

	}

	// (M16) frozen bait or chum from Marta, by the trip's lot -> whether you could
	buyBait( kind ) {

		const b = BAITS[ kind ];
		if ( ! b || ! b.price || b.price > this.money ) return false;
		this.money -= b.price;
		this.bait[ kind ] = ( this.bait[ kind ] | 0 ) + b.per;
		this.save();
		this.emit();
		return true;

	}

	// back in the bucket (off the hook as the rod goes away): it goes in even when the bucket's full
	returnBait( kind ) {

		if ( ! BAITS[ kind ] || BAITS[ kind ].lure ) return;
		this.bait[ kind ] = ( this.bait[ kind ] | 0 ) + 1;
		this.save();
		this.emit();

	}

	// let a kind go (the cooler's bait tab)
	dumpBait( kind ) {

		delete this.bait[ kind ];
		if ( this.baitPick === kind ) this.baitPick = null;
		this.save();
		this.emit();

	}

	// what the hook is baited with from now on (null: the frozen shrimp)
	pickBait( kind ) {

		this.baitPick = BAITS[ kind ] ? kind : null;
		this.save();
		this.emit();

	}

	// (M16) the leader on the line from now on (null: the sensible one for the rig)
	pickLeader( id ) {

		this.leaderPick = id;
		this.save();
		this.emit();

	}

	// a mullet from the cooler cut into chunks of bait -> how many (0: no such fish)
	cutBait( id ) {

		const f = this.inventory.find( ( x ) => x.id === id && x.species === 'mullet' );
		if ( ! f ) return 0;
		const n = chunksOf( f.kg );
		this.inventory = this.inventory.filter( ( x ) => x !== f );
		this.bait.cutMullet = ( this.bait.cutMullet | 0 ) + n;
		this.save();
		this.emit();
		return n;

	}

	// Marta's order from the bucket, on `terms` (quote's): how many of today's bait kind she'd take
	// -> { species, n, each, total, order } or null
	quoteBait( terms ) {

		const o = terms && terms.who === 'marta' ? ( terms.orders || [] ).find( ( x ) => x.who === 'marta' ) : null;
		if ( ! o ) return null;
		const n = Math.min( this.bait[ o.species ] | 0, Math.max( 0, o.max - ( this.orders.day === terms.day ? this.orders.filled[ o.id ] | 0 : 0 ) ) );
		return { species: o.species, n, each: o.each, total: n * o.each, order: o };

	}

	sellBait( terms ) {

		const q = this.quoteBait( terms );
		if ( ! q || ! q.n ) return { total: 0, count: 0 };
		this.bait[ q.species ] -= q.n;
		if ( this.bait[ q.species ] <= 0 ) delete this.bait[ q.species ];
		const filled = this.orders.day === terms.day ? { ...this.orders.filled } : {};
		filled[ q.order.id ] = ( filled[ q.order.id ] | 0 ) + q.n;
		this.orders = { day: terms.day, filled };
		this.money += q.total;
		this.save();
		this.emit();
		return { total: q.total, count: q.n };

	}

	// (Salt Life) what selling the given fish ids (all when null) would pay, on `terms`: { who: 'joe' |
	// 'marta', orders (Orders.ordersFor), day (the list's), rate (what Joe's night box pays of his price;
	// the wanted list in full), week (Joe's: the week's order, { species, left: kg }, until it's filled) }.
	// Without terms, Joe's price. Marta takes only the fish she's after. The biggest fill an order first;
	// each of the week's kind goes toward it (the one that fills it whole) and fetches WEEK_MUL, or the
	// day's list's price if that's on it too.
	// -> { total, count, wanted, prices (id -> $), ids, filled, week (kg toward it), weekN (how many) }
	quote( ids = null, terms = null ) {

		const filled = terms && this.orders.day === terms.day ? { ...this.orders.filled } : {};
		const prices = new Map(), sold = [];
		let total = 0, wanted = 0, left = terms && terms.week ? terms.week.left : 0, week = 0, weekN = 0;
		const pick = this.inventory.filter( ( f ) => ids === null || ids.includes( f.id ) ).sort( ( a, b ) => b.value - a.value );
		for ( const f of pick ) {

			// (the first order it fills that still wants one: (M15) its place's first)
			const o = terms ? ordersOf( terms.orders, terms.who, f.species, f.place ).find( ( q ) => ( filled[ q.id ] | 0 ) < q.max ) : null;
			const toWeek = left > 0 && f.species === terms.week.species;
			let price;
			if ( o ) {

				price = orderPrice( o, f.value );
				filled[ o.id ] = ( filled[ o.id ] | 0 ) + 1;
				wanted ++;

			} else if ( toWeek ) price = Math.round( f.value * WEEK_MUL );
			else if ( terms && terms.who === 'marta' ) continue;
			else price = Math.max( 1, Math.round( f.value * ( terms && terms.rate !== undefined ? terms.rate : 1 ) ) );
			if ( toWeek ) {

				left -= f.kg;
				week += f.kg;
				weekN ++;

			}

			prices.set( f.id, price );
			total += price;
			sold.push( f.id );

		}

		return { total, count: sold.length, wanted, prices, ids: sold, filled, week, weekN };

	}

	// sell the given fish ids (all when omitted), on `terms` (quote); returns the money made
	sell( ids = null, terms = null ) {

		const q = this.quote( ids, terms );
		this.inventory = this.inventory.filter( ( f ) => ! q.ids.includes( f.id ) );
		this.money += q.total;
		if ( terms ) this.orders = { day: terms.day, filled: q.filled };
		this.save();
		this.emit();
		return { total: q.total, count: q.count, wanted: q.wanted, week: q.week, weekN: q.weekN };

	}

	// (Salt Life) Joe pays your share of a filled week's order (WeekOrder.owed)
	collect( amount, week ) {

		this.money += amount;
		this.weekPaid = week;
		this.save();
		this.emit();

	}

	// (M15) a fish let go for Marta's tag-and-release ask (Orders.tagFor) on `day`: paid there and then, as many
	// as it wants -> what it paid (0: it's had its fill)
	tag( order, day ) {

		if ( this.filledOf( order, day ) >= order.max ) return 0;
		const filled = this.orders.day === day ? { ...this.orders.filled } : {};
		filled[ order.id ] = ( filled[ order.id ] | 0 ) + 1;
		this.orders = { day, filled };
		this.money += order.each;
		this.save();
		this.emit();
		return order.each;

	}

	// (Salt Life) how many of an order you've filled on `day`
	filledOf( order, day ) {

		return this.orders.day === day ? this.orders.filled[ order.id ] | 0 : 0;

	}

	// the fish in the cooler the list would take: the biggest of each kind, as many as each order still
	// wants; and the week's order's ({ species, left: kg }), as many as it still wants
	wantedIds( list, day, week = null ) {

		const ids = new Set();
		const biggest = ( species ) => this.inventory.filter( ( f ) => f.species === species ).sort( ( a, b ) => b.value - a.value );
		for ( const o of list || [] ) {

			// ((M15) a place's ask: only its place's fish; a tag-and-release one, none in the cooler)
			if ( o.tag ) continue;
			const left = o.max - this.filledOf( o, day );
			for ( const f of biggest( o.species ).filter( ( q ) => ! o.place || q.place === o.place ).slice( 0, Math.max( 0, left ) ) ) ids.add( f.id );

		}

		let left = week ? week.left : 0;
		if ( left > 0 ) for ( const f of biggest( week.species ) ) {

			if ( left <= 0 ) break;
			ids.add( f.id );
			left -= f.kg;

		}

		return ids;

	}

	release( id ) {

		this.inventory = this.inventory.filter( ( f ) => f.id !== id );
		this.save();
		this.emit();

	}

	// (Salt Life) how many of a bag-limited kind you've kept on `day` (one let go from the cooler after
	// still counts: it was in your bag)
	bagged( species, day ) {

		return this.bag.day === day ? this.bag.n[ species ] | 0 : 0;

	}

	bagOne( species, day ) {

		if ( this.bag.day !== day ) this.bag = { day, n: {} };
		this.bag.n[ species ] = ( this.bag.n[ species ] | 0 ) + 1;

	}

	// spend money (upgrade shop); false when it can't be afforded
	// (M15) a find picked up off the sand (Beachcomb.findsOf's): into your bag, and not on the sand again
	pickFind( f ) {

		if ( ! FINDS[ f.kind ] || this.picked.includes( f.id ) ) return false;
		this.picked = this.picked.filter( ( id ) => parseInt( id, 10 ) > f.day - LIES - 1 );
		this.picked.push( f.id );
		// ((M16) the first of a shell into your set; a spare with your finds)
		if ( ! keepShell( this.shells, f ) ) this.finds.push( { id: f.id, kind: f.kind, day: f.day, seed: f.seed } );
		this.save();
		this.emit();
		return true;

	}

	// (M15) what `who` ('marta' | 'joe') buys of your finds, and for how much: { items, total }
	quoteFinds( who ) {

		const items = this.finds.filter( ( f ) => FINDS[ f.kind ].who === who );
		return { items, total: items.reduce( ( s, f ) => s + FINDS[ f.kind ].price, 0 ) };

	}

	// (M15) sold to `who`: the finds with these ids (all they buy, with none): { count, total }
	sellFinds( who, ids = null ) {

		const sold = this.finds.filter( ( f ) => FINDS[ f.kind ].who === who && ( ! ids || ids.includes( f.id ) ) );
		if ( ! sold.length ) return { count: 0, total: 0 };
		const total = sold.reduce( ( s, f ) => s + FINDS[ f.kind ].price, 0 );
		this.finds = this.finds.filter( ( f ) => ! sold.includes( f ) );
		this.money += total;
		this.save();
		this.emit();
		return { count: sold.length, total };

	}

	// (M15) a find thrown back (or a read bottle kept: left on the sand)
	dropFind( id ) {

		const n = this.finds.length;
		this.finds = this.finds.filter( ( f ) => f.id !== id );
		if ( this.finds.length === n ) return false;
		this.save();
		this.emit();
		return true;

	}

	spend( amount ) {

		if ( amount > this.money ) return false;
		this.money -= amount;
		this.save();
		this.emit();
		return true;

	}

	// (Salt Life) Marta's tow: her fee, or all you have when it's less (she never leaves you without a
	// boat); returns what was paid
	payTow( fee ) {

		const paid = Math.max( 0, Math.min( fee, this.money ) );
		this.money -= paid;
		this.save();
		this.emit();
		return paid;

	}

	// (M15) the catch gone off while you were away (Away.js): over the side; returns how many
	spoil() {

		const n = this.inventory.length;
		if ( n ) {

			this.inventory = [];
			this.save();
			this.emit();

		}

		return n;

	}

	// (M10) Marta's repair of the hull: her fee for all of it, or as much of it as what you have pays for;
	// returns what was paid
	payRepair( fee ) {

		const paid = Math.max( 0, Math.min( fee, this.money ) );
		if ( fee <= 0 || paid <= 0 ) return 0;
		this.money -= paid;
		this.hull = paid >= fee ? 0 : this.hull * ( 1 - paid / fee );
		this.save();
		this.emit();
		return paid;

	}

	// buy the next level of an upgrade track; returns the new level entry or null
	buy( key ) {

		// ((M16) the boat's own, while she's the boat you're in)
		if ( ! UPGRADES[ key ] || ( UPGRADES[ key ].on && UPGRADES[ key ].on !== this.boat ) ) return null;
		const next = nextLevel( this.upgrades, key );
		if ( ! next || next.cost > this.money ) return null;
		this.money -= next.cost;
		this.upgrades[ key ] = next.index;
		if ( key === 'fuel' ) this.fuel = null; // a new tank comes full
		if ( this.unlock.met ) this.earned = true;
		this._chartBought();
		this.save();
		this.emit();
		return next;

	}

	get fuelL() {

		return this.fuel === null ? this.stats.fuelL : Math.min( this.fuel, this.stats.fuelL );

	}

	// burn litres (no save: that happens when the boat stops or at the next sale / purchase)
	burn( litres ) {

		this.fuel = Math.max( 0, this.fuelL - litres );
		return this.fuel;

	}

	// (M16) price: a litre of the fuel she burns, at Marta's (Gear.fuelPrice)
	refuelCost( price = fuelPrice( this.boat ) ) {

		return Math.ceil( ( this.stats.fuelL - this.fuelL ) * price );

	}

	// fill up as far as the money goes, at `price` a litre (Marta's; (M15) or Pearl's); returns litres bought
	refuel( price = fuelPrice( this.boat ) ) {

		const missing = this.stats.fuelL - this.fuelL;
		const litres = Math.min( missing, Math.floor( this.money / price ) );
		if ( litres <= 0 ) return 0;
		this.money -= Math.ceil( litres * price );
		this.fuel = this.fuelL + litres;
		if ( this.fuel >= this.stats.fuelL - 1e-3 ) this.fuel = null;
		this.save();
		this.emit();
		return litres;

	}

	onChange( fn ) {

		this.listeners.add( fn );
		return () => this.listeners.delete( fn );

	}

	emit() {

		for ( const fn of this.listeners ) fn( this );

	}

	// (Salt Life) the islander the others see you as
	setLook( look ) {

		this.look = look;
		this.save();
		this.emit();

	}

	toJSON() {

		this._boatAway();
		return { v: 2, boat: this.boat, fleet: this.fleet, earned: this.earned, dues: this.dues, money: this.money, inventory: this.inventory, log: this.log, places: this.places, trophies: this.trophies, found: this.found, upgrades: this.upgrades, fuel: this.fuel, hull: this.hull, hauled: this.hauled, look: this.look, orders: this.orders, weekPaid: this.weekPaid, bait: this.bait, baitPick: this.baitPick, leaderPick: this.leaderPick, bag: this.bag, finds: this.finds, picked: this.picked, shells: this.shells, chart: this.chart.toJSON(), days: this.days, traps: this.traps, nextId: this._nextId };

	}

	fromJSON( d ) {

		if ( ! d || ( d.v !== 1 && d.v !== 2 ) ) return false;
		this.money = Number.isFinite( d.money ) ? d.money : 0;
		this.inventory = Array.isArray( d.inventory ) ? d.inventory.filter( ( f ) => f && FISH[ f.species ] && Number.isFinite( f.kg ) ) : [];
		// saves from before lengths were recorded
		for ( const f of this.inventory ) if ( ! Number.isFinite( f.cm ) ) f.cm = Math.round( fishLengthCm( f.species, f.kg ) );
		// ((M17) one in someone else's hold: whose, and her owner's name)
		for ( const f of this.inventory ) if ( typeof f.aboard !== 'string' || ! f.aboard ) {

			delete f.aboard;
			delete f.boat;

		} else f.boat = typeof f.boat === 'string' ? f.boat.slice( 0, 40 ) : '';
		this.log = cleanLog( d.log );
		// ((M15) the places you've fished: saves from before had none)
		this.places = {};
		for ( const [ k, v ] of Object.entries( d.places && typeof d.places === 'object' ? d.places : {} ) ) if ( PLACES[ k ] && v && Number.isInteger( v.n ) && v.n > 0 ) this.places[ k ] = { n: v.n, day: Number.isFinite( v.day ) ? v.day : null, first: FISH[ v.first ] ? v.first : null };
		this.trophies = cleanTrophies( d.trophies ); // ((M16) saves from before had none)
		// ((M15) the far places you've found: and any you'd fished before it was kept)
		this.found = {};
		for ( const [ k, v ] of Object.entries( d.found && typeof d.found === 'object' ? d.found : {} ) ) if ( PLACES[ k ] && PLACES[ k ].far ) this.found[ k ] = Number.isFinite( v ) ? v : null;
		for ( const k of Object.keys( this.places ) ) if ( PLACES[ k ].far && this.found[ k ] === undefined ) this.found[ k ] = this.places[ k ].day;
		this.upgrades = { ...defaultUpgrades(), ...( d.upgrades || {} ) };
		this.fuel = Number.isFinite( d.fuel ) ? d.fuel : null;
		this.hull = Number.isFinite( d.hull ) ? Math.min( 1, Math.max( 0, d.hull ) ) : 0;
		this.hauled = d.hauled === true;
		// ((M16) a save from before the fleet: the lobster boat you had, and the kayak's yours as well)
		this.fleet = {};
		for ( const [ k, b ] of Object.entries( d.v === 2 && d.fleet && typeof d.fleet === 'object' ? d.fleet : { lobster: {}, kayak: {} } ) ) if ( BOATS[ k ] ) this.fleet[ k ] = newBoat( b );
		this.boat = BOATS[ d.boat ] && this.fleet[ d.boat ] ? d.boat : d.v === 1 ? 'lobster' : Object.keys( this.fleet )[ 0 ] || START_BOAT;
		if ( ! this.fleet[ this.boat ] ) this.fleet[ this.boat ] = newBoat();
		this.earned = d.earned === true || this.unlock.met;
		const du = d.dues;
		this.dues = du && typeof du === 'object' ? { day: Number.isFinite( du.day ) ? du.day : null, owed: Number.isFinite( du.owed ) ? Math.max( 0, du.owed ) : 0 } : { day: null, owed: 0 };
		this.look = typeof d.look === 'string' ? d.look : null;
		const o = d.orders;
		this.orders = o && Number.isFinite( o.day ) && o.filled && typeof o.filled === 'object' ? { day: o.day, filled: { ...o.filled } } : { day: null, filled: {} };
		this.weekPaid = Number.isFinite( d.weekPaid ) ? d.weekPaid : null;
		this.bait = {};
		for ( const [ k, n ] of Object.entries( d.bait && typeof d.bait === 'object' ? d.bait : {} ) ) if ( BAITS[ k ] && Number.isInteger( n ) && n > 0 ) this.bait[ k ] = n;
		this.baitPick = BAITS[ d.baitPick ] ? d.baitPick : null;
		this.leaderPick = LEADERS[ d.leaderPick ] ? d.leaderPick : null;
		const b = d.bag;
		this.bag = b && Number.isFinite( b.day ) && b.n && typeof b.n === 'object' ? { day: b.day, n: { ...b.n } } : { day: null, n: {} };
		// ((M15) beachcombing: saves from before had none)
		this.finds = Array.isArray( d.finds ) ? d.finds.filter( ( f ) => f && FINDS[ f.kind ] && typeof f.id === 'string' ).map( ( f ) => ( { id: f.id, kind: f.kind, day: f.day | 0, seed: f.seed | 0 } ) ) : [];
		this.picked = Array.isArray( d.picked ) ? d.picked.filter( ( id ) => typeof id === 'string' ).slice( - 200 ) : [];
		this.shells = readShells( d.shells ); // ((M16) saves from before had none)
		// ((M15) the chart: saves from before had the bay alone)
		this.chart.fromJSON( d.chart );
		this._chartBought();
		this.days = cleanDays( d.days );
		this.traps = cleanTraps( d.traps );
		this._nextId = Math.max( d.nextId | 0, ...this.inventory.map( ( f ) => f.id + 1 ), 1 );
		return true;

	}

	save() {

		if ( ! this.storage ) return;
		try {

			this.storage.setItem( SAVE_KEY, JSON.stringify( this.toJSON() ) );

		} catch ( e ) { /* storage full or blocked: keep playing */ }

	}

	load() {

		if ( ! this.storage ) return false;
		try {

			const raw = this.storage.getItem( SAVE_KEY );
			return raw ? this.fromJSON( JSON.parse( raw ) ) : false;

		} catch ( e ) {

			return false;

		}

	}

	reset() {

		this.money = 0;
		this.inventory = [];
		this.log = {};
		this.trophies = {};
		this.places = {};
		this.found = {};
		this.upgrades = defaultUpgrades();
		this.boat = START_BOAT;
		this.fleet = { [ START_BOAT ]: newBoat() };
		this.earned = false;
		this.dues = { day: null, owed: 0 };
		this.fuel = null;
		this.hull = 0;
		this.hauled = false;
		this.orders = { day: null, filled: {} };
		this.weekPaid = null;
		this.bait = {};
		this.baitPick = null;
		this.leaderPick = null;
		this.bag = { day: null, n: {} };
		this.finds = [];
		this.picked = [];
		this.shells = readShells();
		this.chart.reset();
		this._chartBought();
		this.days = cleanDays();
		this.traps = newTraps();
		this.save();
		this.emit();

	}

	// (M15) Marta's chart bought (Gear's chart): the chart has the island's sheet
	_chartBought() {

		const b = !! this.stats.chart;
		if ( this.chart.bought === b ) return;
		this.chart.bought = b;
		this.chart.version ++;

	}

}

function safeStorage() {

	try {

		return typeof localStorage !== 'undefined' ? localStorage : null;

	} catch ( e ) {

		return null;

	}

}
