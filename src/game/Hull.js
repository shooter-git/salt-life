// (M10) What the weather costs the boat: her hull's wear, the water in her bilge and her engine.
//
// The wear (0..1, saved: it lasts until Marta repairs it) comes from slamming into a sea (past what a
// fair day's hardest slams do), from hitting the piles or dropping onto the ground, and from being
// driven along the bottom. A worn hull is slower (less of her thrust gets her anywhere) and it leaks.
// The water in the bilge (litres, for the voyage: not saved) comes from that leak, the rain into her
// open cockpit and green water shipped over the bow in a big slam; the bucket and Marta's pump take it
// out. When it reaches the engine she stalls, and she won't start again until it's bailed down; a hard
// slam in a worn boat can stall her too. Taking the helm cranks her: a sound engine catches first time,
// one that's stalled takes a try or two. Mild: she always runs, and bailing always beats the leak.
//
// Pure (no three.js), for the tests under Node. Game feeds it each frame and does what it says:
//   const hull = new Hull( { store: state } )   (store.hull: the wear, saved with the game)
//   hull.slam( strength ); hull.step( dt, { driven, throttle, fuel, rain, bailing, pumpLs, pile, ground, slide, aground } )
//   hull.engine: 'off' | 'cranking' | 'running' | 'stalled'   hull.drain() -> [ { kind, ... } ]: crank
//   ( catches ), caught, failed ( why ), stall ( why ), knock ( speed, ground ), scoop
//   slamWear( 0.8 )  hitWear( m/s )  thrustMul( wear )  leakLs( wear )  rainLs( rain )  repairFee( wear )

const clamp = ( x, a, b ) => ( x < a ? a : x > b ? b : x );
const clamp01 = ( x ) => clamp( x, 0, 1 );

// a slam wears her past this strength (a fair day's hardest, flat out, are under it), as the square of
// how far past it (a gale flat out: about a quarter in five minutes; at half throttle, a little)
export const SLAM_FROM = 0.5;
const SLAM_K = 0.04;
// a knock on a pile, or a drop onto the ground: heard from this closing speed (m/s), and wearing her from
// this one (a pile at full speed: about a tenth)
export const KNOCK_FROM = 0.6;
export const HIT_FROM = 1.5;
const HIT_K = 0.0042;
// driven along the bottom: the sliding speed it scrapes her from (m/s), and how fast (a beaching at full
// speed: a tenth or so); and under power on the ground, a slow grind (per second, at full throttle and
// sliding at 1 m/s or more)
const SCRAPE_FROM = 1;
const SCRAPE_K = 0.002;
const GRIND = 0.004;
// fully worn: the share of her thrust that still gets her anywhere (flat out she's about 30% slower;
// at the usual throttle, more), and her leak (L/s)
const WORN_THRUST = 0.35;
const WORN_LEAK = 0.5;
// the rain into her open cockpit, aft of the wheelhouse (L/s in a full downpour: 7.4 m^2 at 50 mm an hour)
const RAIN_LS = 0.1;
// green water: a slam past this ships some over the bow (litres for each unit of strength past it)
const GREEN_FROM = 0.85;
const GREEN_L = 25;
// the bucket: a scoop every SCOOP_S seconds, BAIL_LS on the whole
export const BAIL_LS = 3;
export const SCOOP_S = 1.6;
// the water reaches the engine at FLOOD_L (litres in the bilge), and she won't start until it's back
// under RESTART of that; she coughs from COUGH of it. The bilge holds BILGE_MAX before she'd be awash
// (she never is: it stops filling there)
export const FLOOD_L = 500;
export const RESTART = 0.8;
const COUGH = 0.8;
const BILGE_MAX = 1200;
// a hard slam in a worn boat can stall her: from this strength and wear, this often
const STALL_SLAM = 0.95;
const STALL_WEAR = 0.3;
const STALL_CHANCE = 0.15;
// cranking: how long the starter turns her over (s), and the pause before the next try while the
// throttle's held open
export const CRANK_S = 1.1;
const CRANK_GAP = 0.7;
// Marta's full repair ($: a tow tops out at $90, the engine upgrades are $300 and $700)
export const REPAIR_FULL = 150;
// (M13) left in the water in a storm, unattended (at the dock, at anchor, adrift), she's battered by it: the
// wind and the sea it raises work her against her lines, the piles and her anchor. From a gale's wind
// (STORM_FROM m/s), as the square of how far past it in STORM_SPAN (per second): a hurricane passing over
// leaves her about half worn, its weak side less. Hauled out (Marta's, before it comes), none of it
export const STORM_FROM = 20;
const STORM_SPAN = 15, STORM_K = 0.002;
export const stormWear = ( U ) => ( U > STORM_FROM ? STORM_K * ( ( U - STORM_FROM ) / STORM_SPAN ) ** 2 : 0 );

export const slamWear = ( s ) => ( s > SLAM_FROM ? SLAM_K * ( s - SLAM_FROM ) * ( s - SLAM_FROM ) : 0 );
export const hitWear = ( v ) => ( v > HIT_FROM ? HIT_K * Math.pow( v - HIT_FROM, 1.5 ) : 0 );
export const scrapeWear = ( v, dt ) => ( v > SCRAPE_FROM ? SCRAPE_K * ( v - SCRAPE_FROM ) * ( v - SCRAPE_FROM ) * dt : 0 );
export const thrustMul = ( wear ) => 1 - ( 1 - WORN_THRUST ) * clamp01( wear );
export const leakLs = ( wear ) => WORN_LEAK * clamp01( wear );
export const rainLs = ( rain ) => RAIN_LS * clamp01( rain );
export const greenWaterL = ( s ) => ( s > GREEN_FROM ? GREEN_L * ( s - GREEN_FROM ) : 0 );
export const repairFee = ( wear ) => ( wear > 0.005 ? Math.max( 5, Math.round( REPAIR_FULL * clamp01( wear ) ) ) : 0 );
// the chance a crank catches: a sound engine first time; after a stall a try or two, more in a worn boat
export const crankChance = ( wear, troubled ) => clamp( ( troubled ? 0.55 : 1 ) - 0.4 * clamp01( wear ), 0.15, 1 );

export class Hull {

	constructor( { store = { hull: 0 }, random = Math.random } = {} ) {

		this.store = store;
		this.random = random;
		this.bilge = 0;
		this.engine = 'off';
		this.why = null; // why she last stalled: 'flooded', 'slam' or 'fuel'
		this.troubled = false; // stalled since she last ran: the next cranks take a try or two
		this.cough = 1; // what the engine's revs are held to this frame (it stutters as the water nears it)
		this.pumping = false;
		this.events = [];
		this._t = 0; // the crank's time left, or the pause before the next
		this._catch = false; // whether this crank catches (known at its start: the starter's sound is cut for it)
		this._cough = 0;
		this._hitT = 0;
		this._hitV = 0;
		this._scoop = 0;
		this._aground = false;

	}

	get wear() {

		return this.store.hull || 0;

	}

	set wear( w ) {

		this.store.hull = clamp01( w );

	}

	// the starter turning her over, for the others aboard: 0 not, 1 a crank that won't catch, 2 one that will
	get crank() {

		return this.engine === 'cranking' ? ( this._catch ? 2 : 1 ) : 0;

	}

	// the water's near the engine (it coughs), or over it (it won't start)
	get flooded() {

		return this.bilge >= FLOOD_L * RESTART;

	}

	drain() {

		const e = this.events;
		this.events = [];
		return e;

	}

	// a slam into a sea (BoatSpray's onSlam: strength 0..1, at most every 0.4 s, only with way on)
	slam( s ) {

		this.wear += slamWear( s );
		this.bilge = Math.min( BILGE_MAX, this.bilge + greenWaterL( s ) );
		if ( this.engine === 'running' && s >= STALL_SLAM && this.wear >= STALL_WEAR && this.random() < STALL_CHANCE ) this._stall( 'slam' );

	}

	// a knock (m/s closing): one in a moment counts once, the hardest of it
	_knock( v, ground ) {

		if ( v < KNOCK_FROM ) return;
		if ( this._hitT > 0 && v <= this._hitV ) return;
		this.wear += Math.max( 0, hitWear( v ) - ( this._hitT > 0 ? hitWear( this._hitV ) : 0 ) );
		this._hitT = 0.4;
		this._hitV = v;
		this.events.push( { kind: 'knock', speed: v, ground } );

	}

	_crank() {

		this.engine = 'cranking';
		this._t = CRANK_S;
		this._catch = this.random() < crankChance( this.wear, this.troubled );
		this.events.push( { kind: 'crank', catches: this._catch } );

	}

	_stall( why ) {

		this.engine = 'stalled';
		this.why = why;
		this.troubled = true;
		this._t = CRANK_GAP;
		this.events.push( { kind: 'stall', why } );

	}

	// i: driven (someone at her helm), throttle (the lever asked for, 0..1), fuel (any in the tank), rain
	// (0..1), bailing (the bucket's going), pumpLs (Marta's pump, L/s; 0 without), and what the boat felt
	// since the last frame (BoatController.contact): pile and ground (the hardest closing speeds, m/s),
	// slide (the fastest sliding along the bottom) and aground (touching it)
	step( dt, i ) {

		this._hitT = Math.max( 0, this._hitT - dt );
		// ((M13) battered at her lines in a storm, while nobody's at her helm: i.storm, the wind at her)
		if ( ! i.driven && i.storm > STORM_FROM ) this.wear = Math.min( 1, this.wear + stormWear( i.storm ) * dt );
		this._knock( i.pile || 0, false );
		this._knock( i.ground || 0, true );
		// on the bottom: scraped by the sliding, ground away under power; a beaching's first touch knocks
		const aground = !! i.aground, running = this.engine === 'running';
		if ( aground ) {

			// (the grind as she's driven along it: pushing at the sand, stuck, does nothing)
			this.wear += scrapeWear( i.slide || 0, dt ) + ( i.driven && running ? GRIND * clamp01( i.throttle || 0 ) * clamp01( i.slide || 0 ) * dt : 0 );
			if ( ! this._aground && ( i.slide || 0 ) > HIT_FROM ) this.events.push( { kind: 'knock', speed: i.slide, ground: true } );

		}

		this.scrape = aground ? i.slide || 0 : 0;
		this._aground = aground;

		// the water: in by the leak and the rain, out by the bucket and the pump
		const pump = this.bilge > 0.5 ? i.pumpLs || 0 : 0;
		const bailing = !! i.bailing && this.bilge > 0;
		const into = leakLs( this.wear ) + rainLs( i.rain || 0 );
		this.bilge = clamp( this.bilge + ( into - pump - ( bailing ? BAIL_LS : 0 ) ) * dt, 0, BILGE_MAX );
		this.pumping = pump > 0;
		if ( bailing ) {

			this._scoop -= dt;
			if ( this._scoop <= 0 ) {

				this._scoop += SCOOP_S;
				this.events.push( { kind: 'scoop' } );

			}

		} else this._scoop = 0;

		// the engine: taking the helm cranks her, leaving it stops her; stalled, the throttle cranks her again
		if ( ! i.driven ) {

			this.engine = 'off';
			this._t = 0;

		} else if ( this.engine === 'off' ) this._crank();
		else if ( this.engine === 'cranking' ) {

			this._t -= dt;
			if ( this._t <= 0 ) {

				if ( this._catch && i.fuel && ! this.flooded ) {

					this.engine = 'running';
					this.troubled = false;
					this.why = null;
					this.events.push( { kind: 'caught' } );

				} else {

					this.engine = 'stalled';
					this.troubled = true;
					this.why = ! i.fuel ? 'fuel' : this.flooded ? 'flooded' : this.why;
					this._t = CRANK_GAP;
					this.events.push( { kind: 'failed', why: this.why } );

				}

			}

		} else if ( this.engine === 'stalled' ) {

			this._t = Math.max( 0, this._t - dt );
			if ( this._t === 0 && ( i.throttle || 0 ) > 0.3 ) this._crank();

		} else if ( ! i.fuel ) this._stall( 'fuel' );
		else if ( this.bilge >= FLOOD_L ) this._stall( 'flooded' );

		// she coughs as the water nears the engine: a dip in her revs every second or few
		this.cough = 1;
		if ( this.engine === 'running' && this.bilge >= FLOOD_L * COUGH ) {

			this._cough -= dt;
			if ( this._cough <= 0 ) this._cough = 1.2 + this.random() * 2.5;
			if ( this._cough < 0.25 ) this.cough = 0.35;

		}

	}

}
