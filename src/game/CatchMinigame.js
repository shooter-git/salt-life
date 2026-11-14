import { FISH } from './FishTable.js';

// (M10) a gale's gust on the line, as tension (1: the breaking point); and what of it gets through the
// reel's drag while you're not reeling (it gives line, as it does to the fish)
const GUST = 0.6;
const GUST_EASED = 0.2;
// (M16) a run past the drag, m/s for each time over it (a blue marlin's first run is ten or more); and the s of a heavy
// load your arms have in them, standing and in a chair
const RUN = 2.2, ARMS = 280, ARMS_CHAIR = 1500;
// (M17) the drag as anglers set it, a share of the line's breaking strength: prestrike for the first run, strike once it
// stops and you pump, full at the end with it circling under the boat (Caputi, Salt Water Sportsman: 25 to 30%, 35 to
// 40%, 50 to 55%). The prestrike run is the one a rod in its holder takes before you're to it (Rigs), so a fight in your
// hands starts at strike, and it's pushed up to full by the time the fish is half spent (spent: judgment, docs/m17/lines.md)
export const DRAG_SET = { prestrike: 0.275, strike: 0.375, full: 0.525, spent: 0.5 };
// (M17) how heavy a fish (of fight 1) pulls a line to its breaking point when it surges fresh, for each kg of the line's
// breaking strength: about its own class. It was half the line's figure while the lines held 1.9 times their labels, and
// it's that still on the 8 lb line, which had 7 kg, so every fight on it goes as it did (on the others the fish are
// under 3% weaker than they were: docs/m17/lines.md)
export const LINE_MATCH = 0.5 * 7 / ( 8 * 0.45359237 );
// (and a speargun's shaft, for each kg it holds before it tears out: as it always was)
export const SHAFT_MATCH = 0.5;

// Line-tension fight. Hold to reel: the line shortens and the tension climbs; let go and it eases
// off, but a running fish then takes line. Keep the tension in the green band: the fish tires there
// fastest. Too much tension (above the line's strength for about half a second) snaps it; too little
// for too long and the hook falls out. Every few seconds the fish surges: ease off or it breaks you.
//
// (Salt Life) A fish on a speargun's line is only a few metres off: it's landed once it's tired
// (tired: its stamina at most this) and within landAt metres.
//
// (M10) In a blow (wind: the wind past a fair day's as a share of a gale's, 0..1) it gusts on the line: a
// gust bows it and hauls on it, and the tension jumps; reel on through one and it snaps (let it be and
// the drag gives it line). None of it on a fair day, where nothing's drawn for it either: a fair fight
// goes exactly as it did.
//
// (M16) On a reel with a drag (dragKg: what the reel can hold; holdKg: what you can lean back against, standing or in a
// chair) the line isn't the fish's limit: a fish pulling past the drag strips line from the reel instead of breaking
// it, and the spool (spoolM of line) is what it can beat you with. So a fish far over the line can be fought as they
// are, for a long time, and it's lost when it spools you, or at the boat. A fish within the drag fights exactly as it
// did. You tire too (arms: 1 fresh .. 0 done, and then you hold less and reel slower), hardly at all in a chair
// (chair). (M17) The drag's set as a share of the line (DRAG_SET), up to what the reel can hold (dragKg). cut, wear: the
// chance at each run that teeth, or a bill, go through the leader (Presentation.leaderRisk).
// electric: the reel winds itself, and your arms aren't in it; twoSpeed: low gear gets line back from a heavy fish.
// hookM: how deep the fish was hooked (the rod draws the line down to it, shallower as it comes up). (M17) matchKg: the
// fish that pulls it to the breaking point on a surge (a line's own class, LINE_MATCH; a speargun's shaft, half its hold).
// (M19) tether: the most line it can take, towing what's on the end past that (a blue-water gun's float: Speargun.spearTerms).
//
//   const g = new CatchMinigame( { species, kg, lineKg, reelSpeed, distance, rng, landAt, tired, wind, dragKg, holdKg, spoolM, ... } )
//   g.update( dt, reeling, away ) -> 'fighting' | 'caught' | 'snapped' | 'escaped' | 'cut' | 'spooled'
//   (away: m/s the boat's going from the fish, as line it takes out)
//   g.tension (0..1+, 1 = breaking point), g.distance (m), g.stamina (0..1), g.surge (0..1),
//   g.band = [ lo, hi ] (the green band)
export class CatchMinigame {

	constructor( { species, kg, lineKg = 8 * 0.45359237 /* (the 8 lb line) */, reelSpeed = 1.1, distance = 15, rng = Math.random, landAt = 1.2, tired = 1, wind = 0, dragKg = null, holdKg = Infinity, spoolM = null, chair = false, electric = false, twoSpeed = false, cut = 0, wear = 0, hookM = 0, leaps = false, bow = 0, matchKg = lineKg * LINE_MATCH, tether = Infinity } ) {

		const f = FISH[ species ];
		this.species = species;
		this.kg = kg;
		this.rng = rng;
		this.reelSpeed = reelSpeed;
		// pull relative to the line: a fish near the line rating is hard, one far above it is a lottery
		const power = ( 0.25 + 0.75 * f.fight ) * Math.pow( kg / Math.max( matchKg, 0.2 ), 0.55 );
		this.drag = dragKg !== null;
		this.power = this.drag ? power : Math.min( 2.2, power ); // ((M16) with no drag past this it's a lottery anyway)
		this.lineKg = lineKg;
		this.dragKg = dragKg;
		this.holdKg = holdKg;
		this.chair = chair;
		this.electric = electric;
		this.twoSpeed = twoSpeed;
		this.cut = cut;
		this.wear = wear;
		this.hookStart = this.hookM = hookM;
		this.leaps = leaps;
		this.leap = 0; // (M16) s left of a leap, for what's drawn of it
		this.bow = bow; // ((M19) a fly's tippet: the chance a jump parts it, landing on a tight line: you bow, not reeling)
		this.tether = tether;
		this.jumped = false; // (and it did)
		this._leapTried = false;
		this.arms = 1;
		this.staminaMax = f.stamina * Math.pow( Math.max( kg / f.kg[ 1 ], 0.15 ), 0.35 );
		this.stamina = 1;
		this.distance = distance;
		this.maxDistance = spoolM !== null ? spoolM : Math.max( 60, distance + 40 ); // spooled: the fish takes all the line
		this.lineSpooled = spoolM !== null;
		this.tension = 0.3;
		this.surge = 0;
		this.slack = 0;
		this.time = 0;
		this.band = [ 0.3, 0.85 ];
		if ( this.drag ) this.band[ 0 ] = Math.min( 0.3, this._give( 1 ) * 0.9 ); // (it tires on what your drag can hold, set full)
		this.overload = 0; // seconds above the breaking point: the line snaps only if it's held there
		this._nextSurge = 1.2 + rng() * 2;
		this._surgeT = 0;
		this.state = 'fighting';
		this.landAt = landAt;
		this.tired = tired;
		this.wind = Math.min( 1, Math.max( 0, wind ) );
		this.gust = 0; // 0..1: a gust on the line
		this._gustNext = 1;
		this._gustOn = 0;

	}

	// what the drag slips at, as the share of the line's breaking strength: as it's set for how tired the fish is (0 fresh
	// .. 1 spent), up to the reel's most, and your back's, as you're tired
	_give( tired = 1 - this.stamina ) {

		const arms = this.arms < 0.25 ? 0.5 + 2 * this.arms : 1, D = DRAG_SET;
		const set = Math.min( D.full, D.strike + ( D.full - D.strike ) * tired / D.spent );
		return Math.min( this.dragKg, set * this.lineKg, this.holdKg * arms ) / this.lineKg;

	}

	update( dt, reeling, away = 0 ) {

		if ( this.state !== 'fighting' ) return this.state;
		this.time += dt;
		const tired = 1 - this.stamina; // 0 fresh .. 1 exhausted

		// surges: sudden runs, rarer and weaker as the fish tires
		this._nextSurge -= dt;
		if ( this._nextSurge <= 0 && this._surgeT <= 0 ) {

			this._surgeT = 0.8 + this.rng() * 1.2 * ( 1 - tired * 0.6 );
			this._nextSurge = ( 2 + this.rng() * 3 ) * ( 1 + tired );
			// (M16) and at each the leader may go, and it may come out of the water
			if ( this.cut > 0 && this.rng() < this.cut ) this.state = 'cut';
			else if ( this.wear > 0 && this.rng() < this.wear * Math.min( 1, this.time / 60 ) ) this.state = 'cut';
			else if ( this.leaps && this.rng() < 0.6 * ( 1 - tired * 0.7 ) && this.distance > 6 && this.hookM < 5 ) {

				this.leap = 1.1;
				this._leapTried = false;

			}
			if ( this.state === 'cut' ) return this.state;

		}

		this.leap = Math.max( 0, this.leap - dt );
		// ((M19) on a fly's tippet, falling back from a jump on a tight line: it may part. Bowed to it (not reeling), it holds)
		if ( this.bow > 0 && this.leap > 0 && this.leap < 0.6 && reeling && ! this._leapTried ) {

			this._leapTried = true;
			if ( this.rng() < this.bow ) {

				this.jumped = true;
				this.state = 'snapped';
				return this.state;

			}

		}

		this._surgeT -= dt;
		const surgeTarget = this._surgeT > 0 ? 1 : 0;
		this.surge += ( surgeTarget - this.surge ) * ( 1 - Math.exp( - dt * 6 ) );

		// (M10) gusts on the line in a blow: one every few seconds, for a second or so
		if ( this.wind > 0 ) {

			this._gustNext -= dt;
			if ( this._gustNext <= 0 ) {

				this._gustOn = 0.4 + this.rng() * 1.1;
				this._gustNext = this._gustOn + 1.5 + this.rng() * 4.5;

			}

			this._gustOn -= dt;
			this.gust += ( ( this._gustOn > 0 ? 1 : 0 ) - this.gust ) * ( 1 - Math.exp( - dt * 5 ) );

		}

		// the fish's pull (0..~1.6) and the tension it and the reel make (and a gust's haul on the line)
		const pull = this.power * ( 0.35 + 0.65 * this.surge ) * ( 1 - 0.65 * tired );
		let target = reeling ? 0.25 + pull * 0.95 + 0.25 + GUST * this.wind * this.gust : ( pull + GUST_EASED * this.wind * this.gust ) * 0.72;
		// (M16) the drag slips before the line goes: it gets nowhere near it unless you lean into a run on the reel. What
		// the fish pulls past the drag is its way of taking line (over: how far past it)
		let over = 0;
		if ( this.drag ) {

			const give = this._give();
			over = Math.max( 0, pull * 0.72 / give - 1 );
			// (an electric reel's motor stalls at its drag: there's no leaning into a run with it)
			target = Math.min( target, reeling ? give + ( this.electric ? 0.3 : 0.75 ) : give );
			// (you tire against what you're holding; a chair and its harness take it on your legs and back, an electric reel the winding)
			const held = Math.min( this.tension * this.lineKg, this.holdKg ) / Math.max( this.holdKg, 1 );
			this.arms = Math.max( 0, this.arms - dt * held * held / ( this.chair ? ARMS_CHAIR : ARMS ) * ( reeling && ! this.electric ? 1 : 0.5 ) );

		}

		const rate = reeling ? 2.2 : 3.0;
		this.tension += ( target - this.tension ) * ( 1 - Math.exp( - dt * rate ) );

		// line in / out
		if ( reeling ) {

			// ((M16) low gear still gets line back from a heavy fish; past that the spool just slips)
			const gain = Math.max( this.twoSpeed ? 0.35 : 0, 1 - over );
			const worn = this.drag && ! this.electric && this.arms < 0.25 ? 0.5 + 2 * this.arms : 1;
			this.distance -= this.reelSpeed * dt * ( 1.15 - 0.6 * this.surge * ( 1 - tired ) ) * gain * worn;

		} else this.distance += pull * 1.4 * dt;
		if ( over > 0 ) this.distance += Math.min( over, 4 ) * RUN * dt;
		this.distance += Math.max( - 3, away ) * dt;
		if ( this.hookM > 0 ) this.hookM = Math.min( this.hookM, Math.max( 0, this.distance ) ) * ( this.hookStart > 5 ? 1 : Math.exp( - dt * 0.3 ) );
		this.distance = Math.max( this.stamina > this.tired ? this.landAt * 0.8 : 0, Math.min( this.tether, this.distance ) );

		// tiring: fastest in the band, slowly otherwise
		const inBand = this.tension >= this.band[ 0 ] && this.tension <= this.band[ 1 ];
		this.stamina = Math.max( 0, this.stamina - dt / this.staminaMax * ( inBand ? 1 : 0.3 ) );

		// outcomes
		this.overload = this.tension > 1 ? this.overload + dt : Math.max( 0, this.overload - dt * 2 );
		if ( this.overload > 0.45 ) this.state = 'snapped';
		else {

			this.slack = this.tension < 0.12 ? this.slack + dt : Math.max( 0, this.slack - dt * 2 );
			if ( this.distance > this.maxDistance ) this.state = this.lineSpooled ? 'spooled' : 'escaped';
			else if ( this.slack > 4 ) this.state = 'escaped';
			else if ( this.distance < this.landAt && this.stamina <= this.tired ) this.state = 'caught';

		}

		return this.state;

	}

}
