// Catchable fish: game data for the species the world already swims (world/fish/FishSpecies.js).
//
//   name      display name
//   sci       scientific name
//   lw        [ a, b ] length-weight relation W (g) = a * L (cm, total length) ^ b (FishBase-style values)
//   model     key in SPECIES (the swimming model / skin)
//   habitat   weights per water type (see Bites.habitatAt): shallows (sand, < 3 m), reef (over the
//             reef), pier (around the piles), bay (open water 3–20 m), deep (the shelf's, 20–150 m);
//             (M15) out past it: edge (the drop-off and the steep walls), ledge (a flat bottom 150–300
//             m down), blue (the open ocean), and by what's found out there: weed, debris, birds; and
//             about the island: wash (a sandy beach's surf zone, the north beach's best), creek (the
//             west's mangroves: their creek, their pool and their edge)
//   kg        [ min, max ] weight; sizes follow a skewed distribution (most fish are small)
//   price     $ per kg at the fish stand
//   fight     0..1 how hard it pulls (surge strength and frequency in the catch mini-game)
//   stamina   seconds of good pressure it takes to tire a typical one
//   time      activity by time of day: 'day', 'dawnDusk', 'night' or 'any'
//   rarity    0..1, scales how often it bites relative to the others in the same water
//   lights    (optional) after dark it gathers under the pier's lamps: its pier weight counts this
//             many times more while they're lit (Bites.pickSpecies)
//   flood     (optional) after dark it gathers under a boat's deck floodlights: its weight counts
//             this many times more in their pool (Bites.pickSpecies)
//   under     (optional, M16) and under her underwater lights, as flood (Game.underAt)
//   weather   (optional, M9) its own taste in weather, beside what the weather does to every fish
//             (Bites.weatherMood): for each of the mood's keys (front, grey, wind, rain, surf, heavy),
//             its weight counts ( 1 + this x how much of it there is ) times, so 1 doubles it in a full
//             blow and -1 keeps it away (Bites.pickSpecies)
// (Salt Life) and for the law and the speargun:
//   protected  never kept: one caught on a line is measured, logged and released (the island's
//              records count it); the speargun won't fire at one
//   spear      a fish spearfishers take (food fish, and the invasive lionfish); the others (the reef's
//              aquarium fish, the bait fish) are left alone
//   minCm      the smallest one a spearfisher may keep (total length): the speargun won't fire at a
//              smaller one
//   bounty     $ Joe pays for each one on top of its weight (the lionfish: every one taken helps the reef)
//   net        a fish a cast net may take (mullet and the bait fish); the others it brings up go back
//   cr         (with protected) a catch-and-release fish: a sport fish everyone lets go, rather than one
//              the law protects from the table (the card says so)
//   hand       taken by hand only, never speared or hooked (the spiny lobster: tickled out of its den
//              and netted; its minCm is the gauge's 3-inch carapace as a total length: CARAPACE)
//   bag        the most one person may keep in a day
// (M16) and for how it's fished and what it's worth let go (docs/m16/fish.md; Bites.hookWeight, Bait.baitWeight):
//   ways       { float, troll, kite, drop }: its bite weight fished each way. Missing: 1 on the float, 1 deep-dropped
//              for a bottom fish of the deep or the ledge, else 0: only what really takes one takes a towed bait or a kite's
//   at         { day: [ m, m ], night: [ m, m ] }: the depths under the surface it feeds at; a hook outside them
//              gets nothing from it. Missing: wherever the hook is (a bottom fish's water says a bait reaches it)
//   eats       bait or lure id -> its bite weight on that, ahead of Bait.js' likes; shrimp the frozen shrimp
//   teeth      it cuts mono (a rig's chance of a bite-off without wire is stream 7's: rigs/)
//   wake       its weight counts ( 1 + this x how much ) times under a hurricane's debris (habitat.wake)
//   release    (with protected, cr) a billfish: $ for letting one go, for a typical one (releaseBonus)
//   hint       Joe's hint, where its habitat and hour don't say it
export const FISH = {
	silverside: { name: 'Hardhead silverside', sci: 'Atherinomorus stipes', lw: [ 0.0074, 3.1 ], model: 'silverside', habitat: { shallows: 1, pier: 0.6, bay: 0.2 }, kg: [ 0.02, 0.08 ], price: 3, fight: 0.05, stamina: 1.5, time: 'any', rarity: 0.2, net: true },
	mullet: { name: 'Striped mullet', sci: 'Mugil cephalus', lw: [ 0.0112, 2.98 ], model: 'mullet', habitat: { shallows: 1, pier: 0.4 }, kg: [ 0.4, 2.2 ], price: 5, fight: 0.3, stamina: 5, time: 'day', rarity: 0.8, net: true },
	needlefish: { name: 'Houndfish', sci: 'Tylosurus crocodilus', lw: [ 0.0012, 3.1 ], model: 'needlefish', habitat: { shallows: 0.7, bay: 0.5, pier: 0.3 }, kg: [ 0.5, 2.5 ], price: 4, fight: 0.45, stamina: 5, time: 'day', rarity: 0.5, flood: 2, ways: { troll: 0.6 } },
	sergeant: { name: 'Sergeant major', sci: 'Abudefduf saxatilis', lw: [ 0.0234, 3.0 ], model: 'sergeant', habitat: { pier: 1, reef: 0.8 }, kg: [ 0.1, 0.35 ], price: 6, fight: 0.15, stamina: 2.5, time: 'day', rarity: 1, net: true },
	grunt: { name: 'Bluestriped grunt', sci: 'Haemulon sciurus', lw: [ 0.0145, 3.06 ], model: 'grunt', habitat: { pier: 1, reef: 0.8, bay: 0.2 }, kg: [ 0.3, 1.2 ], price: 7, fight: 0.25, stamina: 4, time: 'any', rarity: 1, spear: true, net: true },
	yellowtail: { name: 'Yellowtail snapper', sci: 'Ocyurus chrysurus', lw: [ 0.0137, 2.98 ], model: 'yellowtail', habitat: { reef: 1, pier: 0.4, bay: 0.4 }, kg: [ 0.4, 1.6 ], price: 12, fight: 0.4, stamina: 5, time: 'dawnDusk', rarity: 0.9, spear: true, minCm: 30, flood: 3 },
	chromis: { name: 'Blue chromis', sci: 'Chromis cyanea', lw: [ 0.0209, 3.0 ], model: 'chromis', habitat: { reef: 1 }, kg: [ 0.03, 0.1 ], price: 4, fight: 0.05, stamina: 1.5, time: 'day', rarity: 0.4 },
	tang: { name: 'Blue tang', sci: 'Acanthurus coeruleus', lw: [ 0.0282, 2.95 ], model: 'tang', habitat: { reef: 1 }, kg: [ 0.2, 0.6 ], price: 8, fight: 0.2, stamina: 3, time: 'day', rarity: 0.6 },
	// (the hogfish rarely takes a bait: it's the spearfisher's fish)
	wrasse: { name: 'Hogfish', sci: 'Lachnolaimus maximus', lw: [ 0.0151, 3.07 ], model: 'hogfish', habitat: { reef: 0.8, bay: 0.3 }, kg: [ 0.5, 4 ], price: 16, fight: 0.35, stamina: 6, time: 'day', rarity: 0.2, spear: true, minCm: 41 },
	// (they graze the algae off the coral: protected across much of the Caribbean)
	parrot: { name: 'Stoplight parrotfish', sci: 'Sparisoma viride', lw: [ 0.0151, 3.06 ], model: 'parrot', habitat: { reef: 1 }, kg: [ 0.8, 4 ], price: 9, fight: 0.35, stamina: 6, time: 'day', rarity: 0.5, protected: true },
	angel: { name: 'Queen angelfish', sci: 'Holacanthus ciliaris', lw: [ 0.0302, 2.94 ], model: 'angel', habitat: { reef: 1 }, kg: [ 0.4, 1.6 ], price: 14, fight: 0.25, stamina: 4, time: 'day', rarity: 0.3 },
	jack: { name: 'Crevalle jack', sci: 'Caranx hippos', lw: [ 0.02, 2.93 ], model: 'jack', habitat: { shallows: 0.5, pier: 0.7, bay: 0.8, creek: 0.3 }, kg: [ 1, 9 ], price: 6, fight: 0.75, stamina: 12, time: 'dawnDusk', rarity: 0.5, spear: true, flood: 2, ways: { troll: 1.2, kite: 0.3 } },
	barracuda: { name: 'Great barracuda', sci: 'Sphyraena barracuda', lw: [ 0.0051, 3.08 ], model: 'barracuda', habitat: { reef: 0.5, bay: 0.8, deep: 0.5, debris: 0.5, weed: 0.2, creek: 0.3 }, kg: [ 2, 16 ], price: 5, fight: 0.7, stamina: 11, time: 'any', rarity: 0.45, spear: true, ways: { troll: 1.5, kite: 0.4 } },
	// (critically endangered: no one may take one)
	grouper: { name: 'Nassau grouper', sci: 'Epinephelus striatus', lw: [ 0.0107, 3.07 ], model: 'grouper', habitat: { reef: 0.6, deep: 0.6 }, kg: [ 3, 14 ], price: 15, fight: 0.6, stamina: 12, time: 'any', rarity: 0.3, protected: true, ways: { troll: 0.2, drop: 1 } },
	// (a fish of the deep ledges offshore, never inshore)
	redSnapper: { name: 'Red snapper', sci: 'Lutjanus campechanus', lw: [ 0.0137, 2.98 ], model: 'redSnapper', habitat: { deep: 1, ledge: 0.3 }, kg: [ 1.5, 9 ], price: 18, fight: 0.5, stamina: 9, time: 'any', rarity: 0.7, spear: true, minCm: 41 },
	// (M9: the blackfin and the mahi hunt along the wind lines and the weed they gather: up in a blow.
	// (M15) Fish of the blue water: the blackfin on the drop-off and under the birds, busting the bait;
	// the mahi under the weedlines and the floating debris)
	// (M16: to 20.6 kg, FishBase's; the mahi from schoolies at 1.5 kg to bulls at 32, the record's 39.9, and under a
	// hurricane's debris above all (wake); FAO: fishers gather them under floating bundles of reeds and planks)
	tuna: { name: 'Blackfin tuna', sci: 'Thunnus atlanticus', lw: [ 0.0145, 3.0 ], model: 'tuna', habitat: { edge: 1, blue: 0.8, birds: 1.6, debris: 0.4, weed: 0.3 }, kg: [ 3, 20 ], price: 16, fight: 0.85, stamina: 16, time: 'dawnDusk', rarity: 0.5, spear: true, weather: { wind: 0.8 }, ways: { float: 1, troll: 1.4, kite: 0.35, drop: 0 }, at: { day: [ 0, 60 ], night: [ 0, 60 ] }, eats: { ballyhoo: 1.6, squid: 1.2, skirt: 1.5, jig: 2, plug: 1.4 } },
	mahi: { name: 'Mahi-mahi', sci: 'Coryphaena hippurus', lw: [ 0.0079, 3.0 ], model: 'mahi', habitat: { blue: 1, edge: 0.3, weed: 1.6, debris: 1.3, birds: 0.8 }, kg: [ 1.5, 32 ], price: 14, fight: 0.8, stamina: 15, time: 'day', rarity: 0.4, spear: true, minCm: 51, weather: { wind: 1.5 }, ways: { float: 1, troll: 1.4, kite: 0.5, drop: 0 }, at: { day: [ 0, 50 ], night: [ 0, 50 ] }, eats: { ballyhoo: 2.4, squid: 1.4, skirt: 1.8, jig: 1.4, plug: 1.2 }, wake: 3, bag: 10 },
	// (M16) Fish of the far water, each from its own published relation (docs/m16/fish.md has the sources):
	// the wahoo on the drop-off, fast, first light its best and trolled above all, its teeth through anything
	// but wire. W(kg) = 1.845e-6 TL^3.218, Hogarth's 795 off North Carolina; to 83.5 kg (the record), most 5 to 30
	wahoo: { name: 'Wahoo', sci: 'Acanthocybium solandri', lw: [ 0.001845, 3.218 ], model: 'wahoo', habitat: { edge: 1, blue: 0.5, debris: 0.4, weed: 0.25, birds: 0.3 }, kg: [ 5, 50 ], price: 12, fight: 0.9, stamina: 45, time: 'dawnDusk', rarity: 0.15, spear: true, bag: 2, teeth: true, ways: { float: 0.25, troll: 1.6, kite: 0.4, drop: 0 }, at: { day: [ 0, 100 ], night: [ 0, 100 ] }, eats: { shrimp: 0.15, silverside: 1.4, mullet: 1.5, ballyhoo: 2.5, skirt: 2, plug: 3, jig: 2 }, weather: { wind: 0.3 } },
	// the yellowfin about the drop-off and the bait, the big ones free of the debris (ICCAT: those under floating
	// things mostly small); W(kg) = 2.153e-5 FL^2.976 (Caverivière 1976, ICCAT's), FL 0.9 TL on these lobes; to 200
	yellowfin: { name: 'Yellowfin tuna', sci: 'Thunnus albacares', lw: [ 0.01574, 2.976 ], model: 'yellowfin', habitat: { edge: 0.8, blue: 0.7, birds: 1.4, debris: 0.3, weed: 0.15 }, kg: [ 8, 110 ], price: 17, fight: 0.95, stamina: 120, time: 'dawnDusk', rarity: 0.25, spear: true, bag: 3, ways: { float: 0.6, troll: 1.4, kite: 0.5, drop: 0 }, at: { day: [ 0, 110 ], night: [ 0, 110 ] }, eats: { shrimp: 0.4, silverside: 2.2, mullet: 1.6, ballyhoo: 2, squid: 1.6, skirt: 2, plug: 1.5, jig: 2 }, weather: { wind: 0.5 } },
	// the billfish, every one let go: the sailfish working the bait along the drop-off and now and then in over the
	// shelf's outer edge; the white marlin on the edges and the humps; the blue out in the open blue, rare and huge.
	// W(kg) = a LJFL^b and LJFL from TL, each Prager, Prince and Lee 1995 (ICCAT's), fitted here as W(g) = a TL^b
	sailfish: { name: 'Sailfish', sci: 'Istiophorus platypterus', lw: [ 0.002962, 2.932 ], model: 'sailfish', habitat: { edge: 0.7, blue: 0.5, birds: 0.9, deep: 0.12, weed: 0.15 }, kg: [ 12, 55 ], price: 0, fight: 0.95, stamina: 90, time: 'day', rarity: 0.16, protected: true, cr: true, release: 150, ways: { float: 0.5, troll: 1.3, kite: 5, drop: 0 }, at: { day: [ 0, 40 ], night: [ 0, 40 ] }, eats: { shrimp: 0.12, silverside: 1.6, mullet: 2, sergeant: 0.6, grunt: 0.6, ballyhoo: 3, skirt: 1.3, plug: 0.4 }, weather: { front: 1 } },
	whiteMarlin: { name: 'White marlin', sci: 'Kajikia albida', lw: [ 0.002102, 3.024 ], model: 'whiteMarlin', habitat: { edge: 0.8, blue: 0.4, birds: 0.3, weed: 0.2 }, kg: [ 14, 60 ], price: 0, fight: 0.9, stamina: 120, time: 'day', rarity: 0.08, protected: true, cr: true, release: 220, ways: { float: 0.4, troll: 1.5, kite: 1, drop: 0 }, at: { day: [ 0, 90 ], night: [ 0, 90 ] }, eats: { shrimp: 0.08, silverside: 1.4, mullet: 1.8, ballyhoo: 3, skirt: 1.6, squid: 1 } },
	blueMarlin: { name: 'Blue marlin', sci: 'Makaira nigricans', lw: [ 0.000572, 3.341 ], model: 'blueMarlin', habitat: { blue: 1, edge: 0.5, birds: 0.25, debris: 0.2 }, kg: [ 50, 450 ], price: 0, fight: 1, stamina: 300, time: 'day', rarity: 0.035, protected: true, cr: true, release: 600, ways: { float: 0.3, troll: 1.8, kite: 0.6, drop: 0 }, at: { day: [ 0, 120 ], night: [ 0, 120 ] }, eats: { shrimp: 0.03, silverside: 0.5, mullet: 2, grunt: 1, ballyhoo: 2.4, skirt: 3, squid: 0.6 } },
	// the swordfish feeds up near the surface at night and down past 300 m by day (Lerner et al. 2013, Dewar et al.
	// 2011: under 100 m at night, past 400 by day), moving between them at dusk and dawn: so at night on a float, by
	// day only deep-dropped, and over deep water; lights draw the squid and the squid draw it (flood). W(kg) =
	// 4.45373e-6 LJFL^3.2038 (ICCAT, North Atlantic), LJFL 0.68 TL (the sword's a third of it, measured off photographs).
	// ((M17) Deeper at night under a fuller moon (Lerner et al. 2013, eight fish in the Florida Straits: at new moon 82% of
	// their time above 75 m, most of it 25 to 50 m; at full 64% at 100 to 500 m, most 100 to 200, and 36% above 75; their
	// median depth 32 m + 53 m x the moon's lit share): `night` the new moon's, `full` the full moon's, between by how much
	// of it's lit, so a float 6 m down has about 36 / 82 of its new-moon chance under a full one. Dewar et al. 2011 and
	// Tracey et al. 2023, Pacific, the same way)
	swordfish: { name: 'Swordfish', sci: 'Xiphias gladius', lw: [ 0.001295, 3.204 ], model: 'swordfish', habitat: { blue: 1, edge: 0.8, ledge: 0.3 }, kg: [ 15, 230 ], price: 20, fight: 0.95, stamina: 240, time: 'any', rarity: 0.14, bag: 1, flood: 2, under: 5, hint: 'in the deep blue, near the top after dark, or deep-dropped by day and stopped 350 to 750 m down', ways: { float: 1, troll: 0, kite: 0, drop: 2 }, at: { day: [ 320, 750 ], night: [ 0, 75 ], full: [ 52, 300 ] }, eats: { shrimp: 0.1, squid: 5, mullet: 1.5, cutMullet: 1, ballyhoo: 1.5, silverside: 0.5 } },
	// (catch and release only; M9: they roll and feed in the rain)
	tarpon: { name: 'Tarpon', sci: 'Megalops atlanticus', lw: [ 0.0077, 3.02 ], model: 'tarpon', habitat: { pier: 0.35, bay: 0.5, shallows: 0.15, creek: 0.8 }, kg: [ 10, 45 ], price: 4, fight: 1, stamina: 24, time: 'night', rarity: 0.2, protected: true, cr: true, lights: 3, weather: { rain: 1.5 }, ways: { troll: 0.8, kite: 0.6 } },
	blackGrouper: { name: 'Black grouper', sci: 'Mycteroperca bonaci', lw: [ 0.0115, 3.03 ], model: 'blackGrouper', habitat: { reef: 0.4, deep: 0.7 }, kg: [ 3, 25 ], price: 16, fight: 0.75, stamina: 14, time: 'any', rarity: 0.35, spear: true, minCm: 61, ways: { troll: 0.4, drop: 1 } },
	muttonSnapper: { name: 'Mutton snapper', sci: 'Lutjanus analis', lw: [ 0.0157, 2.97 ], model: 'muttonSnapper', habitat: { reef: 0.6, bay: 0.4, deep: 0.3 }, kg: [ 1, 7 ], price: 14, fight: 0.55, stamina: 9, time: 'dawnDusk', rarity: 0.45, spear: true, minCm: 46, ways: { troll: 0.15, drop: 1 } },
	// (an invader from the Pacific with no predators here: every one taken helps the reef)
	lionfish: { name: 'Red lionfish', sci: 'Pterois volitans', lw: [ 0.0119, 3.1 ], model: 'lionfish', habitat: { reef: 0.7, pier: 0.25, deep: 0.3 }, kg: [ 0.15, 1.1 ], price: 10, fight: 0.1, stamina: 2, time: 'any', rarity: 0.12, spear: true, bounty: 6 },
	// (the snappers of the deep ledges: the silk offshore, (M15) deepest on the ledge, 90 to 240 m down; the
	// giant cubera on the drop-offs)
	silkSnapper: { name: 'Silk snapper', sci: 'Lutjanus vivanus', lw: [ 0.0158, 2.95 ], model: 'silkSnapper', habitat: { deep: 0.6, ledge: 1.4 }, kg: [ 0.5, 3.5 ], price: 15, fight: 0.45, stamina: 7, time: 'any', rarity: 0.5, spear: true, minCm: 30 },
	cuberaSnapper: { name: 'Cubera snapper', sci: 'Lutjanus cyanopterus', lw: [ 0.0135, 3.0 ], model: 'cuberaSnapper', habitat: { deep: 0.6, reef: 0.15 }, kg: [ 8, 45 ], price: 9, fight: 0.95, stamina: 22, time: 'dawnDusk', rarity: 0.12, spear: true, ways: { troll: 0.4, drop: 1 } },
	// (under the pier and over the reef; after dark they gather under the pier's lamps)
	graySnapper: { name: 'Mangrove snapper', sci: 'Lutjanus griseus', lw: [ 0.0148, 2.98 ], model: 'graySnapper', habitat: { pier: 1, reef: 0.6, bay: 0.4, shallows: 0.2, creek: 0.9 }, kg: [ 0.3, 3 ], price: 13, fight: 0.45, stamina: 6, time: 'dawnDusk', rarity: 0.6, spear: true, minCm: 25, lights: 1.5 },
	// (the grey ghost of the flats: everyone lets one go; M9: off the flats into deeper water in a blow)
	bonefish: { name: 'Bonefish', sci: 'Albula vulpes', lw: [ 0.0085, 3.1 ], model: 'bonefish', habitat: { shallows: 1 }, kg: [ 0.8, 5 ], price: 4, fight: 0.85, stamina: 14, time: 'day', rarity: 0.25, protected: true, cr: true, weather: { surf: - 0.9, wind: - 0.5 } },
	// (protected in US waters since 1990: no one may take one)
	goliathGrouper: { name: 'Goliath grouper', sci: 'Epinephelus itajara', lw: [ 0.0128, 3.05 ], model: 'goliathGrouper', habitat: { pier: 0.5, reef: 0.25, deep: 0.3 }, kg: [ 10, 100 ], price: 6, fight: 1, stamina: 30, time: 'any', rarity: 0.1, protected: true },
	whiteMullet: { name: 'White mullet', sci: 'Mugil curema', lw: [ 0.0123, 2.95 ], model: 'whiteMullet', habitat: { shallows: 1, pier: 0.3 }, kg: [ 0.1, 0.8 ], price: 5, fight: 0.25, stamina: 3.5, time: 'day', rarity: 0.7, net: true },
	// (M15) the surf's: the pompano and the permit feed in the troughs of a beach's surf on the mole crabs and
	// the clams it turns up, best on the windward north beach on a surf day; the snook hunt the wash at dawn
	// and dusk, and the mangroves' creek and edge most of all. The permit everyone lets go, as the bonefish;
	// one snook a day
	pompano: { name: 'Florida pompano', sci: 'Trachinotus carolinus', lw: [ 0.0174, 2.95 ], model: 'pompano', habitat: { wash: 1, shallows: 0.1 }, kg: [ 0.4, 2.8 ], price: 20, fight: 0.6, stamina: 7, time: 'any', rarity: 0.8 },
	permit: { name: 'Permit', sci: 'Trachinotus falcatus', lw: [ 0.0216, 2.96 ], model: 'permit', habitat: { wash: 0.45, shallows: 0.2 }, kg: [ 3, 18 ], price: 8, fight: 0.9, stamina: 18, time: 'day', rarity: 0.12, protected: true, cr: true },
	snook: { name: 'Common snook', sci: 'Centropomus undecimalis', lw: [ 0.0075, 3.04 ], model: 'snook', habitat: { creek: 1, wash: 0.6, shallows: 0.1 }, kg: [ 1.5, 12 ], price: 13, fight: 0.8, stamina: 13, time: 'dawnDusk', rarity: 0.35, bag: 1, ways: { troll: 0.8 } },
	// (M16) and the flats', the kayak's: the redfish rooting on the sand and along the mangroves' edge, tails up on
	// a calm morning; the spotted seatrout over the grass and in the channels, about any light at night. This is as
	// far south as either comes (FishBase: southern Florida). FishBase's relations; one redfish a day, four trout
	redfish: { name: 'Redfish', sci: 'Sciaenops ocellatus', lw: [ 0.00851, 3.07 ], model: 'redfish', habitat: { shallows: 0.45, creek: 0.42, wash: 0.25, bay: 0.04 }, kg: [ 1, 14 ], price: 13, fight: 0.7, stamina: 11, time: 'dawnDusk', rarity: 0.3, bag: 1, spear: true, minCm: 46, ways: { troll: 0.5 }, eats: { shrimp: 1.6, cutMullet: 2.2, mullet: 1.6, silverside: 1.1, jig: 1.2, plug: 0.8 }, weather: { surf: - 0.4 } },
	trout: { name: 'Spotted seatrout', sci: 'Cynoscion nebulosus', lw: [ 0.00832, 3.05 ], model: 'trout', habitat: { bay: 0.22, shallows: 0.35, creek: 0.25, pier: 0.08 }, kg: [ 0.3, 3.6 ], price: 11, fight: 0.4, stamina: 5, time: 'dawnDusk', rarity: 0.5, bag: 4, flood: 1.5, lights: 1.5, hint: 'over the bay\'s grass, at dawn and dusk', ways: { troll: 0.6 }, eats: { shrimp: 1.6, silverside: 1.8, jig: 1.3, plug: 1.2, mullet: 1 } },
	// (it never takes a bait or a spear: tickled out of its den in the reef and netted, after dark)
	lobster: { name: 'Spiny lobster', sci: 'Panulirus argus', lw: [ 0.0575, 2.9 ], model: 'lobster', habitat: {}, kg: [ 0.25, 3 ], price: 24, fight: 0, stamina: 1, time: 'night', rarity: 0, hand: true, minCm: 22.4, bag: 6 },
};

// (M17) The flats' fish, seen before they're cast to (game/Sight.js, Bites.seenTake; docs/m17/sight.md), each kind's
// sight: its own lines here so the table's rows stay as they are:
//   back    how its back shows from above against white sand (0..1, a contrast: the bonefish the grey ghost, the
//           permit's back and black fins darker, the tarpon's big blue-green back)
//   wary    how far it notices you coming, times a bonefish's (Sight.noticeRange)
//   lead    [ m, m ]: where a bait's put ahead of its nose, on its way, for it to see it and come to it (guides: a few
//           feet for a cruising bonefish, a crab right in front of a permit, two feet ahead of a laid-up tarpon's nose).
//           close: the same for one feeding head down (a tail up: it sees only what lands close) or lying still
//   head    m: a bait landing closer than this to it spooks it: on its head
//   eats    bait or lure id (shrimp: the frozen shrimp) -> the chance it eats one shown well; what it doesn't eat it
//           refuses, following and turning off (a tailing fish is the keenest: Bites.seenTake)
//   picky   of its refusals, the share that spook it as it turns away
//   speed   m/s it comes to a bait at
// Guides' lore, consistent between them but not measured (docs/m17/sources-tide-fish.md: no study of flats fish's
// takes or flight distances was found). No fly rod (the user's, M17): shrimp, jigs, plugs and live bait
export const SIGHT = {
	bonefish: { back: 0.14, wary: 1, lead: [ 0.6, 2.4 ], close: [ 0.25, 1 ], head: 0.45, speed: 0.9, picky: 0.25,
		eats: { shrimp: 0.62, jig: 0.38, plug: 0.01, silverside: 0.06, cutMullet: 0.12, mullet: 0.02 } },
	permit: { back: 0.18, wary: 1.25, lead: [ 0.5, 1.6 ], close: [ 0.25, 0.9 ], head: 0.7, speed: 0.8, picky: 0.4,
		eats: { shrimp: 0.16, jig: 0.1, plug: 0.01, silverside: 0.03, cutMullet: 0.05 } },
	tarpon: { back: 0.3, wary: 0.7, lead: [ 1.2, 4 ], close: [ 0.25, 0.9 ], head: 0.3, speed: 1, picky: 0.15,
		eats: { mullet: 0.5, silverside: 0.3, plug: 0.32, jig: 0.24, shrimp: 0.14, cutMullet: 0.08 } },
	snook: { back: 0.2, wary: 0.55, lead: [ 0.3, 1.6 ], close: [ 0.2, 1.2 ], head: 0.25, speed: 1.4, picky: 0.1,
		eats: { silverside: 0.5, mullet: 0.5, plug: 0.42, shrimp: 0.4, jig: 0.36, cutMullet: 0.2 } },
	barracuda: { back: 0.18, wary: 0.45, lead: [ 0.5, 6 ], close: [ 0.5, 4 ], head: 0.2, speed: 3, picky: 0.05,
		eats: { plug: 0.55, silverside: 0.6, mullet: 0.6, jig: 0.25, cutMullet: 0.2, shrimp: 0.04 } },
};
for ( const k in SIGHT ) FISH[ k ].sight = SIGHT[ k ];

// (Salt Life) a spiny lobster's carapace length, of its total length (the gauge measures the
// carapace: 3 inches, 7.62 cm, to keep one)
export const CARAPACE = 0.34;

export const FISH_IDS = Object.keys( FISH );

// $ value of a fish; trophy-sized ones fetch a bit more per kg. Nothing for a protected one: it's
// let go
export function fishValue( id, kg ) {

	const f = FISH[ id ];
	if ( f.protected ) return 0;
	const t = ( kg - f.kg[ 0 ] ) / Math.max( f.kg[ 1 ] - f.kg[ 0 ], 1e-6 );
	return Math.max( 1, Math.round( f.price * kg * ( 1 + 0.25 * Math.max( 0, t - 0.7 ) / 0.3 ) ) + ( f.bounty || 0 ) );

}

// (M16) what letting a billfish go pays, from the island's billfish fund: its `release` for a typical one, up to half
// as much again for the biggest, and half as much again with the tag kit (the `landing` track: stream 7's) on it
export function releaseBonus( id, kg, tagged = false ) {

	const f = FISH[ id ];
	if ( ! f.release ) return 0;
	const [ a, b ] = f.kg, t = Math.min( 1, Math.max( 0, ( kg - a ) / Math.max( b - a, 1e-6 ) ) );
	return Math.round( f.release * ( 1 + 0.5 * t ) * ( tagged ? 1.5 : 1 ) / 5 ) * 5;

}

// a trophy: in the top fifth of its kind's size range (about one fish in ten: Bites.rollWeight)
export function isTrophy( id, kg ) {

	const [ a, b ] = FISH[ id ].kg;
	return ( kg - a ) / Math.max( b - a, 1e-6 ) >= 0.8;

}

// total length (cm) of a fish of `kg`, from its species' length-weight relation
export function fishLengthCm( id, kg ) {

	const [ a, b ] = FISH[ id ].lw;
	return Math.pow( Math.max( kg, 0.001 ) * 1000 / a, 1 / b );

}

// weight (kg) of a fish `cm` long (total length): the length-weight relation the other way, for a
// speared fish, weighed by the size it swam at
export function fishWeightKg( id, cm ) {

	const [ a, b ] = FISH[ id ].lw;
	return a * Math.pow( Math.max( cm, 0.1 ), b ) / 1000;

}

// may a spearfisher take this one? 'ok', or why not: 'byHand' (a spiny lobster: never speared),
// 'protected', 'notTarget' (not a fish anyone spears) or 'small' (under its minimum size)
export function spearRule( id, cm ) {

	const f = FISH[ id ];
	if ( ! f ) return 'notTarget';
	if ( f.hand ) return 'byHand';
	if ( f.protected ) return 'protected';
	if ( ! f.spear ) return 'notTarget';
	if ( f.minCm && cm < f.minCm ) return 'small';
	return 'ok';

}
