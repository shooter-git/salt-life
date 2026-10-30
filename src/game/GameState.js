import { FINDS, LIES } from './Beachcomb.js';
import { FISH, fishValue, fishLengthCm } from './FishTable.js';
import { defaultUpgrades, gearStats, nextLevel, UPGRADES, FUEL_PRICE } from './Gear.js';
import { ordersOf, orderPrice } from './Orders.js';
import { WEEK_MUL } from './WeekOrder.js';
import { BAITS, KEEPER_KG, baitOf, chunksOf } from './Bait.js';
import { PLACES } from './Places.js';
import { ChartLog } from './Chart.js';

const SAVE_KEY = 'tidewater.save.v1';

// Everything the player owns: wallet, the fish in the cooler / hold, the fish log and the gear
// levels. Saved to localStorage (per browser) after every change; storage can be missing or throw
// (private windows, blocked site data), so every access is guarded and the game runs without it.
export class GameState {

	constructor( storage = safeStorage() ) {

		this.storage = storage;
		this.money = 0;
		this.inventory = []; // { id, species, kg, cm, value, caughtAt (game hours), record, method }
		this.log = {}; // species -> { count, bestKg, bestCm }
		this.places = {}; // ((M15) Places.js) place -> { n, day, first: species } (the first catch there: the log)
		this.found = {}; // ((M15) Places.js' FAR_PLACES) place -> the day you first came to it (the log names it then)
		// the last addFish: { species, kg, cm, value, newSpecies, record, prevBestKg, prevBestCm, kept,
		// released, why, method, bag, at, day, place, firstAt } (the catch card; (M15) firstAt: the place, when
		// it's the first fish you've had there)
		this.lastCatch = null;
		this.bag = { day: null, n: {} }; // (Salt Life) how many of each bag-limited kind (FishTable bag) you've kept that day
		this.upgrades = defaultUpgrades();
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
		// ((M15) beachcombing (Beachcomb.js): what you've picked up off the sand, and which finds you've had (the
		// last few days': they'd have gone by now anyway), so they're not there again)
		this.finds = []; // { id, kind, day, seed }
		this.picked = [];
		this.chart = new ChartLog(); // ((M15) the chart you fill in: Chart.js)
		this._nextId = 1;
		this.listeners = new Set();
		this._chartBought();

	}

	get stats() {

		return gearStats( this.upgrades );

	}

	get holdKg() {

		let kg = 0;
		for ( const f of this.inventory ) kg += f.kg;
		return kg;

	}

	get holdValue() {

		let v = 0;
		for ( const f of this.inventory ) v += f.value;
		return v;

	}

	// room in the cooler / hold for a fish of `kg`?
	fits( kg ) {

		return this.holdKg + kg <= this.stats.holdKg + 1e-6;

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
		const { newSpecies, record, prevBestKg, prevBestCm } = this.logFish( species, kg, cm );
		const firstAt = this.logPlace( place, species, day );
		const value = fishValue( species, kg );
		const released = !! FISH[ species ].protected || !! release;
		const max = day !== null ? FISH[ species ].bag || 0 : 0;
		const full = max > 0 && ! released && this.bagged( species, day ) >= max;
		const kept = ! released && ! full && this.fits( kg );
		if ( kept && max ) this.bagOne( species, day );
		const bag = max ? { n: this.bagged( species, day ), max, full } : null;
		const why = release || ( FISH[ species ].protected ? 'protected' : null );
		this.lastCatch = { species, kg, cm, value, newSpecies, record, prevBestKg, prevBestCm, kept, released, why, method, bag, at: timeOfDay, day, place, firstAt };
		if ( ! kept ) {

			this.save();
			this.emit();
			return null;

		}

		const f = { id: this._nextId ++, species, kg, cm, value, caughtAt: timeOfDay, record, method };
		if ( place ) f.place = place;
		this.inventory.push( f );
		this.save();
		this.emit();
		return f;

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
		if ( info.place ) f.place = info.place;
		this.inventory.push( f );
		this.save();
		this.emit();
		return f;

	}

	// a fish in the log: one more of its kind, and its best -> { newSpecies, record, prevBestKg, prevBestCm }
	logFish( species, kg, cm ) {

		const logEntry = this.log[ species ] || ( this.log[ species ] = { count: 0, bestKg: 0 } );
		const newSpecies = logEntry.count === 0;
		const prevBestKg = logEntry.bestKg, prevBestCm = logEntry.bestCm ?? ( prevBestKg > 0 ? Math.round( fishLengthCm( species, prevBestKg ) ) : 0 );
		const record = ! newSpecies && kg > prevBestKg;
		logEntry.count ++;
		if ( kg > prevBestKg ) {

			logEntry.bestKg = kg;
			logEntry.bestCm = cm;

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
			const log = this.logFish( f.species, kg, cm );
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

		if ( ! ( this.bait[ kind ] > 0 ) ) return false;
		if ( -- this.bait[ kind ] === 0 ) delete this.bait[ kind ];
		this.save();
		this.emit();
		return true;

	}

	// back in the bucket (off the hook as the rod goes away): it goes in even when the bucket's full
	returnBait( kind ) {

		if ( ! BAITS[ kind ] ) return;
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
		this.finds.push( { id: f.id, kind: f.kind, day: f.day, seed: f.seed } );
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

		if ( ! UPGRADES[ key ] ) return null;
		const next = nextLevel( this.upgrades, key );
		if ( ! next || next.cost > this.money ) return null;
		this.money -= next.cost;
		this.upgrades[ key ] = next.index;
		if ( key === 'fuel' ) this.fuel = null; // a new tank comes full
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

	refuelCost( price = FUEL_PRICE ) {

		return Math.ceil( ( this.stats.fuelL - this.fuelL ) * price );

	}

	// fill up as far as the money goes, at `price` a litre (Marta's; (M15) or Pearl's); returns litres bought
	refuel( price = FUEL_PRICE ) {

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

		return { v: 1, money: this.money, inventory: this.inventory, log: this.log, places: this.places, found: this.found, upgrades: this.upgrades, fuel: this.fuel, hull: this.hull, hauled: this.hauled, look: this.look, orders: this.orders, weekPaid: this.weekPaid, bait: this.bait, baitPick: this.baitPick, bag: this.bag, finds: this.finds, picked: this.picked, chart: this.chart.toJSON(), nextId: this._nextId };

	}

	fromJSON( d ) {

		if ( ! d || d.v !== 1 ) return false;
		this.money = Number.isFinite( d.money ) ? d.money : 0;
		this.inventory = Array.isArray( d.inventory ) ? d.inventory.filter( ( f ) => f && FISH[ f.species ] && Number.isFinite( f.kg ) ) : [];
		// saves from before lengths were recorded
		for ( const f of this.inventory ) if ( ! Number.isFinite( f.cm ) ) f.cm = Math.round( fishLengthCm( f.species, f.kg ) );
		this.log = d.log && typeof d.log === 'object' ? d.log : {};
		for ( const [ k, v ] of Object.entries( this.log ) ) if ( FISH[ k ] && v && v.bestKg > 0 && ! Number.isFinite( v.bestCm ) ) v.bestCm = Math.round( fishLengthCm( k, v.bestKg ) );
		// ((M15) the places you've fished: saves from before had none)
		this.places = {};
		for ( const [ k, v ] of Object.entries( d.places && typeof d.places === 'object' ? d.places : {} ) ) if ( PLACES[ k ] && v && Number.isInteger( v.n ) && v.n > 0 ) this.places[ k ] = { n: v.n, day: Number.isFinite( v.day ) ? v.day : null, first: FISH[ v.first ] ? v.first : null };
		// ((M15) the far places you've found: and any you'd fished before it was kept)
		this.found = {};
		for ( const [ k, v ] of Object.entries( d.found && typeof d.found === 'object' ? d.found : {} ) ) if ( PLACES[ k ] && PLACES[ k ].far ) this.found[ k ] = Number.isFinite( v ) ? v : null;
		for ( const k of Object.keys( this.places ) ) if ( PLACES[ k ].far && this.found[ k ] === undefined ) this.found[ k ] = this.places[ k ].day;
		this.upgrades = { ...defaultUpgrades(), ...( d.upgrades || {} ) };
		this.fuel = Number.isFinite( d.fuel ) ? d.fuel : null;
		this.hull = Number.isFinite( d.hull ) ? Math.min( 1, Math.max( 0, d.hull ) ) : 0;
		this.hauled = d.hauled === true;
		this.look = typeof d.look === 'string' ? d.look : null;
		const o = d.orders;
		this.orders = o && Number.isFinite( o.day ) && o.filled && typeof o.filled === 'object' ? { day: o.day, filled: { ...o.filled } } : { day: null, filled: {} };
		this.weekPaid = Number.isFinite( d.weekPaid ) ? d.weekPaid : null;
		this.bait = {};
		for ( const [ k, n ] of Object.entries( d.bait && typeof d.bait === 'object' ? d.bait : {} ) ) if ( BAITS[ k ] && Number.isInteger( n ) && n > 0 ) this.bait[ k ] = n;
		this.baitPick = BAITS[ d.baitPick ] ? d.baitPick : null;
		const b = d.bag;
		this.bag = b && Number.isFinite( b.day ) && b.n && typeof b.n === 'object' ? { day: b.day, n: { ...b.n } } : { day: null, n: {} };
		// ((M15) beachcombing: saves from before had none)
		this.finds = Array.isArray( d.finds ) ? d.finds.filter( ( f ) => f && FINDS[ f.kind ] && typeof f.id === 'string' ).map( ( f ) => ( { id: f.id, kind: f.kind, day: f.day | 0, seed: f.seed | 0 } ) ) : [];
		this.picked = Array.isArray( d.picked ) ? d.picked.filter( ( id ) => typeof id === 'string' ).slice( - 200 ) : [];
		// ((M15) the chart: saves from before had the bay alone)
		this.chart.fromJSON( d.chart );
		this._chartBought();
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
		this.places = {};
		this.found = {};
		this.upgrades = defaultUpgrades();
		this.fuel = null;
		this.hull = 0;
		this.hauled = false;
		this.orders = { day: null, filled: {} };
		this.weekPaid = null;
		this.bait = {};
		this.baitPick = null;
		this.bag = { day: null, n: {} };
		this.finds = [];
		this.picked = [];
		this.chart.reset();
		this._chartBought();
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
