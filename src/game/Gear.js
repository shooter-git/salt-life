import { BOATS } from '../world/boat/Boats.js';
import { ableOf, burnOf, BASE, DAYS_TRACKS } from './Seaworthy.js';

// Gear and upgrade data, sold by Marta at the chandlery by the boathouse; everything the game reads
// goes through gearStats( state.upgrades ), so buying a level is just state.upgrades[ key ]++ and the
// stats follow.
//
// Each track: levels[ 0 ] is what you start with; cost is the price of that level (0 for the first).
// (M16) on: the boat it belongs to (world/boat/Boats.js: it counts only while she's the boat you're in, and stays with her
// when you're in another); without it, it's your own gear, and goes with you onto any boat.
// (M17) a pound, in kg: a line breaks at its label (IGFA's line classes are 2 to 130 lb, a line breaking at or under its
// class; docs/m17/lines.md)
export const LB = 0.45359237;
// (M17) the line's and the drag's figures before M17, and those they are now: a kit sent by a game that's still on the old
// ones (Rigs.cleanKit) comes in as the same line and reel, not as a line twice as strong. (The new lines are never these;
// the 80-class reel's 24 kg is the old two-speed's, told from it by its spool: OLD_SPOOL_M, the old reels' own)
export const OLD_LINE_KG = [ 7, 13, 26, 50 ], OLD_DRAG_KG = [ 12, 24 ], OLD_SPOOL_M = [ 350, 600 ];
export function realTackle( lineKg, dragKg, spoolM ) {

	const l = OLD_LINE_KG.indexOf( lineKg ), d = OLD_DRAG_KG.indexOf( dragKg );
	const old = d >= 0 && ( spoolM === undefined || spoolM === OLD_SPOOL_M[ d ] );
	const drags = UPGRADES.reel.levels.filter( ( r ) => r.dragKg !== null );
	return { lineKg: l >= 0 ? UPGRADES.line.levels[ l ].lineKg : lineKg, dragKg: old ? drags[ d ].dragKg : dragKg };

}

export const UPGRADES = {
	// rod and reel ((M17) lineLb: the label's pounds; lineKg: its breaking strength. Before M17 these held 7, 13, 26 and 50 kg,
	// about 1.9 times their labels: OLD_LINE_KG. 80 lb is IGFA's 37 kg class, the big-game chair's: its full drag, 19 kg, is
	// past what you hold standing in the harness, so the biggest fish are the chair's)
	line: { name: 'Fishing line', levels: [
		{ cost: 0, label: '8 lb mono', lineLb: 8, lineKg: 8 * LB },
		{ cost: 60, label: '15 lb mono', lineLb: 15, lineKg: 15 * LB },
		{ cost: 180, label: '30 lb braid', lineLb: 30, lineKg: 30 * LB },
		{ cost: 450, label: '60 lb braid', lineLb: 60, lineKg: 60 * LB },
		{ cost: 750, label: '80 lb mono', lineLb: 80, lineKg: 80 * LB },
		// ((M19) IGFA's 60 kg class, the chair's for the biggest blue marlin: docs/m19/sources-big-game.md. Priced on the line's
		// own ladder, past 80 lb's: docs/m19/big.md)
		{ cost: 1000, label: '130 lb mono', lineLb: 130, lineKg: 130 * LB },
	] },
	// ((M16) spoolM: the line it holds; dragKg: the most its drag holds (CatchMinigame), none to speak of on a spinning
	// reel, whose fight's as it always was; twoSpeed: a low gear. (M17) Real reels' most: a 30-class lever drag's 33 lb, as
	// Penn's Fathom II Lever Drag 30; a 50-class two-speed's 20 kg, as Shimano's Tiagra 50W LRSA (most listings; one US one
	// has 40 lb), which holds full drag on the 80 lb line. The drag's set at a share of the line under that:
	// CatchMinigame.DRAG_SET. And an 80-class two-speed, as Shimano's Tiagra 80W: 24 kg of drag (most listings), 868 m of
	// 80 lb mono (36 kg / 868 m, 80 lb / 950 yd) against the 50-class's 600 here, and the same 94 cm a turn in its high
	// gear. It's the spool the biggest blue marlin need: they run the 50-class out of line, they don't break 80 lb)
	reel: { name: 'Reel', levels: [
		{ cost: 0, label: 'Old spinning reel', reelSpeed: 1.1, spoolM: 180, dragKg: null },
		{ cost: 90, label: 'Smooth spinning reel', reelSpeed: 1.6, spoolM: 220, dragKg: null },
		{ cost: 320, label: 'Conventional reel', reelSpeed: 2.2, spoolM: 350, dragKg: 33 * LB },
		{ cost: 900, label: 'Two-speed big-game reel (its low gear comes in by itself on a heavy fish)', reelSpeed: 2.6, spoolM: 600, dragKg: 20, twoSpeed: true },
		{ cost: 1200, label: 'Wide 80-class two-speed reel (870 m of 80 lb line, for the biggest fish\'s runs)', reelSpeed: 2.6, spoolM: 868, dragKg: 24, twoSpeed: true },
		// ((M19) a 130-class two-speed (Shimano's Tiagra 130, Penn's International 130: 914 m of 130 lb, 40 kg and more of
		// drag, $1,470 to $1,520) with its bent-butt chair rod ($470 to $800): docs/m19/sources-big-game.md, docs/m19/big.md)
		{ cost: 2000, label: '130-class two-speed reel and a bent-butt chair rod (914 m of 130 lb line)', reelSpeed: 2.6, spoolM: 914, dragKg: 40, twoSpeed: true },
	] },
	rod: { name: 'Rod', levels: [
		{ cost: 0, label: 'Hand-me-down rod', castM: 22 },
		{ cost: 75, label: '7 ft graphite rod', castM: 32 },
		{ cost: 260, label: '9 ft surf rod', castM: 45 },
		{ cost: 600, label: 'Stand-up trolling rod, roller guides and a gimbal butt', castM: 30, standUp: true },
	] },
	// (M16) your own gear for the big fish (game/rigs/Presentation.js, docs/m16/tackle.md). The leader: of those you've
	// bought, the one you tie on, or the sensible one for what you're doing (Presentation.leaderOn). landKg: the heaviest
	// you lift aboard for sure (past it, more and more shake off at the boat); dehooker: one that's let go comes off in the
	// water, sooner and unhurt (Rigs.fightTerms, releaseHurt); tagKit: the billfish fund's half as much again (Trophies);
	// polarized: fish seen under the water; swimMul, breathS, airS (Player.setDive)
	leader: { name: 'Leader', levels: [
		{ cost: 0, label: 'Light mono leader', leader: 0 },
		{ cost: 40, label: 'Fluorocarbon leader', leader: 1 },
		{ cost: 60, label: 'Wire leader, for wahoo and barracuda', leader: 2 },
		{ cost: 90, label: '200 lb mono leader, for billfish', leader: 3 },
	] },
	lures: { name: 'Lures', levels: [
		{ cost: 0, label: 'None', lures: 0 },
		{ cost: 50, label: 'Jigs', lures: 1 },
		{ cost: 90, label: 'Plugs', lures: 2 },
		{ cost: 180, label: 'Trolling skirts', lures: 3 },
	] },
	landing: { name: 'Landing', levels: [
		{ cost: 0, label: 'Your hands', landKg: 12 },
		{ cost: 60, label: 'A gaff', landKg: 250 },
		{ cost: 80, label: 'Release dehooker and billfish tag kit', landKg: 250, dehooker: true, tagKit: true },
	] },
	glasses: { name: 'Polarized glasses', levels: [
		{ cost: 0, label: 'None', polarized: false, lens: null },
		{ cost: 120, label: 'Polarized glasses (fish seen under the water, from the tower above all)', polarized: true, lens: 'grey' },
		// ((M19) glass lenses in copper, as flats guides wear them for the contrast over sand (no measurement found: its
		// gain is judgement, docs/m19/sources-fly.md). Stream SEE's, its price a placeholder)
		{ cost: 250, label: 'Glass polarized lenses, copper, for the flats (fish seen further over sand)', polarized: true, lens: 'copper' },
	] },
	diveKit: { name: 'Dive kit', levels: [
		{ cost: 0, label: 'None', swimMul: 1, breathS: 50, airS: 0 },
		{ cost: 80, label: 'Mask and fins (faster swimming)', swimMul: 1.45, breathS: 50, airS: 0 },
		{ cost: 220, label: 'Long fins and a wetsuit (a longer breath)', swimMul: 1.65, breathS: 80, airS: 0 },
		{ cost: 600, label: 'Scuba tanks (one dive\'s air, filled at the dock or at Marta\'s)', swimMul: 1.65, breathS: 80, airS: 6800 },
	] },
	// (the life jacket for the kayak's capsize, the flares and EPIRB for DaysOut: Seaworthy's, shown here with your gear)
	safety: DAYS_TRACKS.safety,
	// (Salt Life) the speargun, for a fish you've swum down to: a band gun (gunStyle: an aluminium tube,
	// a teak stock, a railgun), its barrel from the grip to the muzzle (gunCm) and rubber bands
	// (bands), the steel shaft it fires (shaftM long, at spearV m/s), the reach it kills at (spearM),
	// the shooting line (lineM), and how hard a big fish can pull before the shaft tears out of it
	// (spearHold, kg; with a reel the line pays out instead of the fish tearing free)
	speargun: { name: 'Speargun', levels: [
		{ cost: 0, label: 'Hand-me-down 30-inch speargun', gunStyle: 'tube', gunCm: 75, bands: 1, shaftM: 1.15, spearV: 16, spearM: 3, lineM: 4.5, spearHold: 7, spearReel: false },
		{ cost: 180, label: '40-inch teak speargun, two bands', gunStyle: 'teak', gunCm: 100, bands: 2, shaftM: 1.4, spearV: 20, spearM: 4, lineM: 6, spearHold: 11, spearReel: false },
		{ cost: 480, label: '48-inch railgun with a reel', gunStyle: 'rail', gunCm: 120, bands: 2, shaftM: 1.6, spearV: 23, spearM: 5, lineM: 7.5, spearHold: 16, spearReel: true },
		// ((M19) a blue-water gun for wahoo, tuna and big mahi: about 150 cm, four bands, the shaft on a breakaway rig to a
		// 30 m float line and an 11 L float (docs/m19/sources-big-game.md; the Bahamas ban spearguns: kept, the user's call).
		// Stream GEAR's figures, these placeholders)
		{ cost: 1300, label: 'Blue-water speargun, 60 inch, a breakaway rig on 30 m of float line', gunStyle: 'blue', gunCm: 150, bands: 4, shaftM: 1.9, spearV: 25, spearM: 6, lineM: 7.5, spearHold: 23, spearReel: false, floatLineM: 30, breakaway: true },
	] },
	// (Salt Life) the cast net, for bait and mullet (CastNet.js): its size is its radius (netM, from the
	// horn to the lead line, as nets are sold), its mesh (meshCm, the square), the lead line's weight
	// (leadKgM) and how fast that sinks it (sinkMs), how far it's thrown (throwM), how wide the moment
	// is that spins it fully open (spreadWin, of the wind-up), the longest fish it holds (holdCm: a
	// bigger one bursts out), its twine (netTwine: 'nylon' braided, or clear 'mono')
	castNet: { name: 'Cast net', levels: [
		{ cost: 0, label: 'Hand-me-down 4 ft cast net', netM: 1.22, meshCm: 1.0, leadKgM: 0.7, sinkMs: 0.95, throwM: 6, spreadWin: 0.3, holdCm: 45, netTwine: 'nylon' },
		{ cost: 70, label: '6 ft monofilament cast net', netM: 1.83, meshCm: 1.0, leadKgM: 0.9, sinkMs: 1.2, throwM: 7, spreadWin: 0.25, holdCm: 50, netTwine: 'mono' },
		{ cost: 210, label: '8 ft bait net, heavy lead', netM: 2.44, meshCm: 1.0, leadKgM: 1.2, sinkMs: 1.5, throwM: 8, spreadWin: 0.21, holdCm: 55, netTwine: 'mono' },
		{ cost: 520, label: '10 ft pro net, 1½ lb a foot', netM: 3.05, meshCm: 1.27, leadKgM: 2.2, sinkMs: 1.95, throwM: 9, spreadWin: 0.18, holdCm: 62, netTwine: 'mono' },
	] },
	// (M19) Your own new gear (docs/M19.md). Prices are placeholders until each stream sets its own with tools/earnings.mjs.
	// The fly rods (stream FLY: docs/m19/fly.md): each level adds a rod, so flyRods is the weights you have (FLY_RODS below has
	// each one's figures, kept apart from the line's and the reel's so they don't take their place in gearStats). Priced as an
	// outfit at the shops' middle: an Orvis Clearwater 8-weight $449 to $646, a mid-range rod $400, reel $150, line $100 to $130
	// (docs/m19/sources-fly.md, section 10)
	flyRod: { name: 'Fly rod', levels: [
		{ cost: 0, label: 'None', flyRods: [] },
		{ cost: 500, label: '9 ft 8-weight fly rod and reel, for bonefish', flyRods: [ 8 ] },
		{ cost: 750, label: '9 ft 10-weight, for permit (and the 8-weight)', flyRods: [ 8, 10 ] },
		{ cost: 1000, label: '9 ft 12-weight, for tarpon (and the 8 and 10)', flyRods: [ 8, 10, 12 ] },
	] },
	// (stream FLY) the flies: Bait.js has each, tied for a rod's weight; a box of each, yours for good as the lures are, at the
	// shops' $4 a Gotcha, $10 a Merkin, $6 a Toad (docs/m19/sources-fly.md, section 7)
	flies: { name: 'Flies', levels: [
		{ cost: 0, label: 'None', flies: 0 },
		{ cost: 30, label: 'A box of shrimp flies: Gotchas and Crazy Charlies', flies: 1 },
		{ cost: 60, label: 'A box of crab flies: Merkins, for permit', flies: 2 },
		{ cost: 50, label: 'A box of tarpon flies: Toads, on a bite tippet', flies: 3 },
	] },
	// (stream SEE) quieter wading on the flats
	booties: { name: 'Flats booties', levels: [
		{ cost: 0, label: 'Bare feet', booties: false },
		{ cost: 90, label: 'Flats booties (less noise and push wading)', booties: true },
	] },
	// (stream GEAR) a rubber-meshed net: small and middling fish aboard sooner, and one let go in better shape (Barthel et
	// al. 2003). Its own track: a level put into Landing would move every saved level after it
	landingNet: { name: 'Landing net', levels: [
		{ cost: 0, label: 'None', landingNet: false },
		{ cost: 90, label: 'Rubber landing net', landingNet: true },
	] },
	// (stream FLY) the Bahamas' flats fishing licence: free to a Bahamian or a resident, as she is (a visitor pays $15 a day
	// to $600 a year: docs/m19/sources-boats-bait.md). Nothing on the flats takes a bait or a fly without it
	flatsLicence: { name: 'Flats licence', levels: [
		{ cost: 0, label: 'None', flatsLicence: false },
		{ cost: 0, label: 'Bahamas flats fishing licence (free to a resident)', flatsLicence: true },
	] },
	// (stream BOATS) a crawfish trap permit, $50: the Bahamas' traps are a Bahamian's, with one
	trapPermit: { name: 'Crawfish trap permit', levels: [
		{ cost: 0, label: 'None', trapPermit: false },
		{ cost: 50, label: 'Crawfish trap permit (the Department of Marine Resources\')', trapPermit: true },
	] },
	// (Salt Life) where the bait you net is kept alive (Bait.js): how many it holds
	baitWell: { name: 'Bait well', on: 'lobster', levels: [
		{ cost: 0, label: '5-gallon bait bucket', baitMax: 24 },
		{ cost: 90, label: 'Aerated bait bucket', baitMax: 50 },
		{ cost: 300, label: 'Livewell with a pump (live bait stays lively: bites come sooner)', baitMax: 120, livewell: true },
	] },
	// (Salt Life) for the spiny lobster, by hand on a dive: a tickle stick to coax it out of its den
	// (tickleM: how far it reaches; coaxS: seconds of tickling a lobster takes to walk out) and a hand
	// net to clap over it, with a gauge for its carapace
	lobster: { name: 'Lobster gear', levels: [
		{ cost: 0, label: 'None', lobster: 0, tickleM: 0, coaxS: 0 },
		{ cost: 45, label: 'Tickle stick, hand net and a lobster gauge', lobster: 1, tickleM: 0.9, coaxS: 2.5 },
		{ cost: 160, label: 'Long aluminium tickle stick and a wide net', lobster: 2, tickleM: 1.3, coaxS: 1.6 },
	] },
	// boat
	hold: { name: 'Fish hold', on: 'lobster', levels: [
		{ cost: 0, label: 'Cooler', holdKg: 30 },
		{ cost: 120, label: 'Ice chest', holdKg: 70 },
		{ cost: 400, label: 'Insulated fish hold', holdKg: 160 },
	] },
	fuel: { name: 'Fuel tank', on: 'lobster', levels: [
		{ cost: 0, label: '11-gallon tank', fuelL: 40 },
		{ cost: 150, label: '21-gallon tank', fuelL: 80 },
		{ cost: 380, label: '40-gallon tank', fuelL: 150 },
	] },
	engine: { name: 'Engine', on: 'lobster', levels: [
		{ cost: 0, label: 'Tired diesel', speedMul: 1 },
		{ cost: 300, label: 'Rebuilt diesel', speedMul: 1.15 },
		{ cost: 700, label: 'Turbo diesel', speedMul: 1.3 },
	] },
	fishFinder: { name: 'Fish finder', on: 'lobster', levels: [
		{ cost: 0, label: 'None', finder: false },
		{ cost: 250, label: 'Fish finder (depth and fish on the HUD)', finder: true },
	] },
	// (Salt Life) the deck floodlights: after dark yellowtail, jacks and houndfish gather in their pool
	// astern (FishTable flood, Game.floodAt)
	lights: { name: 'Boat lights', on: 'lobster', levels: [
		{ cost: 0, label: 'Nav lights only', deckLights: false },
		{ cost: 140, label: 'Deck floodlights (fish gather under them after dark)', deckLights: true },
	] },
	// (Salt Life) the anchor: it goes down when you leave the helm out on the water and comes up when
	// you take it again (Game.updateAnchor); anchorM: the deepest water its rode holds in (at three
	// times the depth, as rode is let out: 200 ft holds in 66)
	anchor: { name: 'Anchor', on: 'lobster', levels: [
		{ cost: 0, label: 'None', anchorM: 0 },
		{ cost: 100, label: 'Danforth anchor, 200 ft of rode', anchorM: 20 },
	] },
	// (M10) what takes the water out of her bilge (Hull.js) besides you with the bucket: an electric pump
	// that clears it slowly by itself (pumpLs, litres a second: more than the rain brings in)
	bilgePump: { name: 'Bilge pump', on: 'lobster', levels: [
		{ cost: 0, label: 'A bucket', pumpLs: 0 },
		{ cost: 120, label: 'Electric bilge pump', pumpLs: 0.3 },
	] },
	// (M16) lobster traps, each with its warp and buoy (Traps.js): for the hauler and davit only she has, so they're hers.
	// About $70 each, as a wire trap, 120 ft of warp and a buoy cost. unlock: false, what the sportfisher's unlock doesn't
	// ask for
	traps: { name: 'Lobster traps', on: 'lobster', unlock: false, levels: [
		{ cost: 0, label: 'None', traps: 0 },
		{ cost: 140, label: '2 wire traps, warp and buoys', traps: 2 },
		{ cost: 140, label: '4 wire traps, warp and buoys', traps: 4 },
		{ cost: 280, label: '8 wire traps, warp and buoys', traps: 8 },
	] },
	// ((M19) stream BOATS: her hauler as she has it (Traps.HAULER_MS), and a bigger head on a bigger pump: Hydro-Slave's 12 in
	// on 11 gpm, about 380 ft a minute (derived, docs/m19/sources-boats-bait.md). The price a placeholder)
	hauler: { name: 'Trap hauler', on: 'lobster', levels: [
		{ cost: 0, label: 'Hydraulic hauler, 236 ft a minute', haulerMs: 1.2 },
		{ cost: 600, label: 'Bigger hauler head and pump, 380 ft a minute', haulerMs: 1.9 },
	] },
	// (M15) a chart of the island and its waters out to the drop-off, for those who'd rather not chart it
	// themselves (Chart.js: the island's sheet and its names, the far sheet within SOLD.r); a waterproof one,
	// as a chandlery sells them, at what one costs
	chart: { name: 'Chart', levels: [
		{ cost: 0, label: 'Your own, as you go', chart: false },
		{ cost: 30, label: 'Waterproof chart of the island, to the drop-off', chart: true },
	] },
	// (M16) days out: navigation, the deep finder, the deep anchor and the sock on each boat, and your flares (Seaworthy.js)
	...DAYS_TRACKS,
	// (M16) the kayak's own (Boats.js' stats: what she is before them; game/fleet/Fleet.js: what's bought and sold)
	kayakCrate: { name: 'Crate cooler', on: 'kayak', levels: [
		{ cost: 0, label: 'A soft bag behind the seat' },
		{ cost: 40, label: 'Milk crate and a small cooler, strapped in the tankwell', holdKg: 25 },
	] },
	kayakPaddle: { name: 'Paddle', on: 'kayak', levels: [
		{ cost: 0, label: 'Plastic-bladed paddle', speedMul: 1, pedal: false },
		{ cost: 90, label: 'Carbon-shaft paddle', speedMul: 1.12, pedal: false },
		// ((M19) the pedal drive makes her the Pescador Pilot 12: a drive well and a frame seat, stood in to pole and cast,
		// hands free to fish as she goes (docs/m19/sources-boats-bait.md: 3 knots cruising, 3.6 flat out). Stream BOATS'
		// figures, these and the price placeholders)
		{ cost: 450, label: 'Pedal drive (she\'s the Pescador Pilot 12: hands free to fish, and stood in)', speedMul: 1.12, pedal: true },
	] },
	// (a line along her side that lets the anchor hold her bow, stern or beam to the sea, as a kayak has to)
	kayakAnchor: { name: 'Anchor trolley', on: 'kayak', levels: [
		{ cost: 0, label: 'None', anchorM: 0, trolley: false },
		{ cost: 50, label: 'Anchor trolley and a 3 lb grapnel', anchorM: 10, trolley: true },
	] },
	kayakFinder: { name: 'Fish finder puck', on: 'kayak', levels: [
		{ cost: 0, label: 'None', finder: false },
		{ cost: 150, label: 'Castable fish finder puck (depth and fish on the HUD)', finder: true },
	] },
	// (kept under a lid and bungees, half as much goes when she turns over: kayak/Capsize.js)
	kayakHatch: { name: 'Dry hatch', on: 'kayak', levels: [
		{ cost: 0, label: 'Nothing strapped down', dryHatch: false },
		{ cost: 30, label: 'Dry hatch and deck bungees: less of your catch goes if she turns over', dryHatch: true },
	] },
	// ((M19) stream BOATS: an 8 ft pole that runs out to 12 (YakAttack's ParkNPole), to pole her quietly over the flats stood
	// in her, and to stake her out where an anchor's no use: stakeM, the deepest water it holds her in (derived))
	kayakPole: { name: 'Push and stake-out pole', on: 'kayak', levels: [
		{ cost: 0, label: 'None', stakeM: 0 },
		{ cost: 110, label: 'Push and stake-out pole, 8 to 12 ft', stakeM: 2.9 },
	] },
	// (M16) the center console's own
	consoleEngine: { name: 'Outboards', on: 'console', levels: [
		{ cost: 0, label: 'A single 150 outboard', speedMul: 1, twin: false },
		{ cost: 900, label: 'Twin 150 outboards', speedMul: 1.25, twin: true },
	] },
	consoleTop: { name: 'T-top', on: 'console', levels: [
		{ cost: 0, label: 'Open to the sky', tTop: false },
		{ cost: 350, label: 'T-top and its rain cover', tTop: true },
	] },
	consoleWell: { name: 'Livewell', on: 'console', levels: [
		{ cost: 0, label: 'A bait bucket', livewell: false },
		{ cost: 200, label: 'Livewell with a pump (live bait stays lively: bites come sooner)', baitMax: 80, livewell: true },
	] },
	consoleLadder: { name: 'Dive ladder', on: 'console', levels: [
		{ cost: 0, label: 'Over the side and hope', diveLadder: false },
		{ cost: 120, label: 'Dive ladder at the stern', diveLadder: true },
	] },
	consoleTanks: { name: 'Tank rack', on: 'console', levels: [
		{ cost: 0, label: 'None', tankRack: false },
		{ cost: 150, label: 'Tanks racked behind the leaning post (a fresh one each time you\'re back aboard)', tankRack: true },
	] },
	// ((M19) stream BOATS, docs/m19/sources-boats-bait.md: a bow-mount trolling motor, 112 lb (498 N) at 36 V, about 4 knots
	// flat out and quiet; a pair of Power-Pole Blades, 8 ft, holding her in up to 2.4 m at a press; a radar dome on her
	// T-top (needs: bought only with the T-top fitted). Prices placeholders)
	consoleTrolling: { name: 'Trolling motor', on: 'console', levels: [
		{ cost: 0, label: 'None', trollingN: 0 },
		{ cost: 1200, label: 'Bow trolling motor, 112 lb thrust, 36 V', trollingN: 498 },
	] },
	consolePole: { name: 'Shallow-water anchor', on: 'console', levels: [
		{ cost: 0, label: 'None', stakeM: 0 },
		{ cost: 900, label: 'Power-Pole Blades, a pair, 8 ft (holds her in 2.4 m at a press)', stakeM: 2.4 },
	] },
	consoleRadar: { name: 'Radar', on: 'console', needs: 'consoleTop', levels: [
		{ cost: 0, label: 'None', radar: false },
		{ cost: 700, label: '18 in radar dome on the T-top, shown on her plotter', radar: true },
	] },
	// (M16) the sportfisher's own
	sfOutriggers: { name: 'Outriggers', on: 'sportfisher', levels: [
		{ cost: 0, label: 'None', outriggers: false },
		{ cost: 1200, label: 'Outriggers, for a spread of baits', outriggers: true },
	] },
	sfTower: { name: 'Tuna tower', on: 'sportfisher', levels: [
		{ cost: 0, label: 'None: the flybridge is as high as she goes', tower: false },
		{ cost: 4000, label: 'Tuna tower with a second helm', tower: true },
	] },
	sfElectricReel: { name: 'Electric reel', on: 'sportfisher', levels: [
		{ cost: 0, label: 'None', electricReel: false },
		{ cost: 900, label: 'Electric reel, for deep-dropping', electricReel: true },
	] },
	sfFishBox: { name: 'Fish box', on: 'sportfisher', levels: [
		{ cost: 0, label: 'Her cockpit box' },
		{ cost: 800, label: 'Big insulated fish box', holdKg: 600 },
	] },
	sfIcemaker: { name: 'Icemaker', on: 'sportfisher', levels: [
		{ cost: 0, label: 'None', icemaker: false },
		{ cost: 1000, label: 'Icemaker (shore power at her berth: at sea it runs off the generator)', icemaker: true, iceMakesKgH: 5 },
	] },
	sfGenerator: { name: 'Generator', on: 'sportfisher', levels: [
		{ cost: 0, label: 'None', generator: false },
		{ cost: 1500, label: 'Diesel generator: runs the icemaker at sea, about a gallon an hour from her tank', generator: true },
	] },
	sfChair: { name: 'Fighting chair', on: 'sportfisher', levels: [
		{ cost: 0, label: 'None: stand up and take it', chair: false },
		{ cost: 2000, label: 'Fighting chair in the cockpit', chair: true },
	] },
	sfUnderwaterLights: { name: 'Underwater lights', on: 'sportfisher', levels: [
		{ cost: 0, label: 'None', underwaterLights: false },
		{ cost: 600, label: 'Underwater lights, for swordfish at night', underwaterLights: true },
	] },
	// ((M19) stream BIG, docs/m19/sources-big-game.md and docs/m19/big.md: a mate, paid $200 for each day out (mateDay), who
	// takes her helm and backs her down on a fish while you're in the chair (rigs/Mate.js); teasers in her spread, raising more
	// billfish (Presentation's TEASE); a gyro stabilizer (a Seakeeper 6 on a 48 ft boat), which runs on her generator (needs).
	// Her fittings priced at about a tenth to a fortieth of real ones, as she is: real teasers about $1,000, a gyro fitted $92,000)
	sfMate: { name: 'Mate', on: 'sportfisher', levels: [
		{ cost: 0, label: 'None', mate: false, mateDay: 0 },
		{ cost: 0, label: 'A mate, $200 a day out (he backs her down on a big fish)', mate: true, mateDay: 200 },
	] },
	sfTeasers: { name: 'Teasers', on: 'sportfisher', levels: [
		{ cost: 0, label: 'None', teasers: false },
		{ cost: 500, label: 'Teasers: daisy chains and dredges, to raise billfish', teasers: true },
	] },
	sfGyro: { name: 'Gyro stabilizer', on: 'sportfisher', needs: 'sfGenerator', levels: [
		{ cost: 0, label: 'None', gyro: false },
		{ cost: 3000, label: 'Gyro stabilizer (most of her roll gone at rest; runs on the generator)', gyro: true },
	] },
};

// (M19) each fly rod's own figures (stream FLY's), apart from the line's and reel's in gearStats: the tippet's breaking
// strength (lineKg: 12, 16 and 20 lb, IGFA's most), the reel's most drag (dragKg: between makers' figures and Trident's
// measurements; the drag as it's set, half the tippet, never reaches it), backing and fly line (spoolM: the fly line and 200
// to 300 yd of backing), the line got back a second (reelSpeed: a 1:1 reel's 0.28 m a turn, two or three turns a second;
// the 12-weight's bigger arbor), the most line a good caster keeps in the air (carryM: a weight-forward head and a little
// running line) and the farthest cast with the shoot (castM: 8 m shot past it, the Keys' 75 ft). A heavier line carries no
// further. docs/m19/sources-fly.md, sections 2 to 4
export const FLY_RODS = {
	8: { wt: 8, lineKg: 12 * LB, dragKg: 4.0, spoolM: 210, reelSpeed: 0.7, carryM: 14, castM: 22 },
	10: { wt: 10, lineKg: 16 * LB, dragKg: 6.8, spoolM: 240, reelSpeed: 0.7, carryM: 14, castM: 22 },
	12: { wt: 12, lineKg: 20 * LB, dragKg: 9.0, spoolM: 300, reelSpeed: 0.8, carryM: 14, castM: 22 },
};
// (M19) the rod a fly's cast on: the one it's tied for, if you have it, else the heaviest you have (the rods come in order,
// so it's the nearest under it). null: no fly rod
export function flyRodFor( flyRods, wt ) {

	if ( ! flyRods || ! flyRods.length ) return null;
	return flyRods.includes( wt ) ? wt : flyRods[ flyRods.length - 1 ];

}

// (M16) what the sportfisher asks before she's shown: each of these tracks to this level (docs/M16.md: every upgrade on
// the lobster boat, and the rod, reel and line as they were before M16's big-game levels). A track added later, or a
// level above these, doesn't count
export const UNLOCK = { hold: 2, fuel: 2, engine: 2, baitWell: 2, fishFinder: 1, lights: 1, anchor: 1, bilgePump: 1, rod: 2, reel: 2, line: 3 };

// -> { done, of, met, left: [ what's next on each track that isn't there yet, by its label ] }
export function unlockProgress( upgrades ) {

	let done = 0, of = 0;
	const left = [];
	for ( const [ k, n ] of Object.entries( UNLOCK ) ) {

		const at = Math.min( n, upgrades[ k ] | 0 );
		done += at;
		of += n;
		if ( at < n ) left.push( UPGRADES[ k ].levels[ at + 1 ].label );

	}

	return { done, of, met: done >= of, left };

}

// (M16) what a boat's engine burns, at the chandlery ($ a litre: a fuel dock's, gasoline about 6% over diesel: docs/m16/fleet.md)
export const FUELS = {
	diesel: { name: 'Diesel', price: 1.5 },
	gasoline: { name: 'Gasoline', price: 1.6 },
};
export const FUEL_PRICE = FUELS.diesel.price; // $ per litre of diesel at the chandlery
// (M16) her fuel, { name, price }, or null with no engine; and at another's price, a seller who charges more for diesel
export const fuelOf = ( boat ) => FUELS[ BOATS[ boat ] && BOATS[ boat ].fuel ] || null;
export const fuelPrice = ( boat, dieselAt = FUEL_PRICE ) => ( fuelOf( boat ) ? fuelOf( boat ).price * dieselAt / FUEL_PRICE : dieselAt );
// (Salt Life) Marta's tow: she fetches your boat back to the dock when it's drifted off (the wind pushes
// a boat left without its anchor), and (M15) when you call her on the radio, out of fuel far out. A call-out
// and a little for every 100 m, as far as it is (it had a cap of $90: 1.4 km). It's her time she's paid
// for, as a towing firm bills it: out to you at `out` m/s (18 knots) and back with you in tow at `back` (6
// knots), so a 10 km tow is an hour and ten minutes of it and $520, about $435 an hour (Sea Tow gives $250 to
// $500 for those who aren't members, dock to dock). Nothing to tow within `from` metres of the dock (walk or
// swim to her)
export const TOW = { base: 20, per100m: 5, from: 30, out: 9.3, back: 3.1 };
export const towFee = ( metres ) => Math.round( TOW.base + TOW.per100m * Math.max( 0, metres ) / 100 );
// (M15) and for one that happens while you're away (Away.js), no more than from the far grounds' edge (24 km): a boat
// left adrift can lie 200 km off in a week, and that's too hard on someone who wasn't there
export const AWAY_TOW_MAX = towFee( 24000 );
export const awayTowFee = ( metres ) => Math.min( AWAY_TOW_MAX, towFee( metres ) );
// (M15) how long she's out on it (s: the real world's, as the boat runs)
export const towTime = ( metres ) => Math.max( 0, metres ) * ( 1 / TOW.out + 1 / TOW.back );
// (M13) Marta's haul-out ahead of a hurricane ($: less than the repair a hurricane leaves to do); the lobster boat's
// (M16: each boat's by her length, game/fleet/Fleet.js)
export const HAUL_FEE = 40;
// litres per second at the helm: idle plus a lot more at full rpm (40 L lasts ~25 min flat out; (M16) each boat's: Seaworthy)
// ((M17) twin: a second engine fitted, stats.twin: Seaworthy.burnOf)
export function fuelBurn( rpm, boat = 'lobster', twin = false ) {

	const [ idle, k ] = burnOf( boat, twin );
	return idle + k * rpm * rpm;

}

// next level of a track, or null when maxed
export function nextLevel( upgrades, key ) {

	const lv = UPGRADES[ key ].levels;
	const i = ( upgrades[ key ] | 0 ) + 1;
	return i < lv.length ? { index: i, ...lv[ i ] } : null;

}

export function defaultUpgrades() {

	const u = {};
	for ( const k in UPGRADES ) u[ k ] = 0;
	return u;

}

// (M19) A reel holds a volume of line: the metres it takes go as one over the line's diameter squared (every maker's chart:
// metres x diameter^2 the same for one spool to within 1% on the big reels, docs/m19/sources-big-game.md). SPOOL_V, each
// reel's (m mm^2, by the reel track's level: two spinning reels', a Penn Fathom II 30's, a Shimano Tiagra 50W's, 80W's and
// 130's); LINE_D, each line's diameter as spooled (mm, by the line track's level), Penn's for mono of its strength. Braid
// is counted as mono of its strength, not at its own thinness (a third of mono's, which would put two kilometres of 60 lb
// on a 50-class reel, and a 370 kg blue marlin landed on it from the chair every time): a big-game reel is filled with mono,
// or mono over braid backing, for the stretch and the bill. Judgement, docs/m19/big.md. So the 50-class two-speed holds
// 684 m of 60 lb and 499 of 80 (it had 600 of each), the conventional 302 m of 30 lb (350); the rest as they were (180,
// 220, 869, and the 130-class's 914 m of 130 lb)
export const SPOOL_V = [ 11.2, 28.5, 88, 395, 688, 1126 ];
export const LINE_D = [ 0.25, 0.36, 0.54, 0.76, 0.89, 1.11 ];
export const spoolOf = ( reel, line ) => Math.min( 2000, Math.round( SPOOL_V[ reel ] / LINE_D[ line ] ** 2 ) );

// (M19) A line for each rod (M18: one line went on every rod, so with 80 lb bought a bonefish was fought on it). What you
// cast (the float and the sinker) is your light tackle: your best casting rod, a reel up to the conventional and the
// heaviest line you have up to 30 lb braid. What you troll, fly a kite on or drop deep, and fight from a holder or the
// chair, is your heavy tackle: the best of everything you have (gearStats'). Each spooled with what that reel holds of it
export const LIGHT = { rod: 2, reel: 2, line: 2 };
// (and on each reel the heaviest line you have up to its class, as anglers match them: a 50-class reel takes the 60 lb, not
// the 80, which it holds only 499 m of; the spinning reels to 15 and 30 lb, the conventional 30)
export const REEL_LB = [ 15, 30, 30, 60, 80, 130 ];
export function tackleOf( upgrades, heavy = true ) {

	const at = ( k, most ) => Math.max( 0, Math.min( most, UPGRADES[ k ].levels.length - 1, upgrades[ k ] | 0 ) );
	const rod = at( 'rod', heavy ? Infinity : LIGHT.rod ), reel = at( 'reel', heavy ? Infinity : LIGHT.reel );
	let line = at( 'line', heavy ? Infinity : LIGHT.line );
	while ( line > 0 && UPGRADES.line.levels[ line ].lineLb > REEL_LB[ reel ] ) line --;
	const R = UPGRADES.reel.levels[ reel ], N = UPGRADES.line.levels[ line ], D = UPGRADES.rod.levels[ rod ];
	return {
		rod, reel, line, lineLb: N.lineLb, lineKg: N.lineKg, reelSpeed: R.reelSpeed, dragKg: R.dragKg, twoSpeed: !! R.twoSpeed,
		spoolM: spoolOf( reel, line ), castM: D.castM, standUp: !! D.standUp,
	};

}

// merged stats of the current levels: your own gear's and the boat's you're in, over what she is without them
export function gearStats( upgrades, boat = 'lobster' ) {

	const s = { ...BOATS[ boat ].stats, ...BASE[ boat ] };
	for ( const k in UPGRADES ) {

		if ( UPGRADES[ k ].on && UPGRADES[ k ].on !== boat ) continue;
		const lv = UPGRADES[ k ].levels;
		const i = Math.max( 0, Math.min( lv.length - 1, upgrades[ k ] | 0 ) );
		for ( const [ key, v ] of Object.entries( lv[ i ] ) ) if ( key !== 'cost' && key !== 'label' ) s[ key ] = v;

	}

	// ((M19) your heavy tackle: its reel's line and spool by that line; and your light tackle for what you cast: tackleOf)
	const heavy = tackleOf( upgrades, true );
	s.lineKg = heavy.lineKg;
	s.lineLb = heavy.lineLb;
	s.spoolM = heavy.spoolM;
	s.light = { ...tackleOf( upgrades, false ), electricReel: false, leader: s.leader };
	return s;

}
