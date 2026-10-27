// (M13) How the island's animals take the weather: one rule for them all, from the weather as it is
// (WeatherDriver.live), what's said of a hurricane (Weather.hurricaneNews), the island's time and how wet
// it's left everything (G.wet). On a fair day, and a breezy one, every factor is 1 (or false): they do
// as they always have. Pure, for the tests under Node (test/wildlife-weather.mjs).
//
// What real animals do, and what each factor says:
//   - gull (0..1): how much gulls go about their day. They ride a breeze, but sit out heavy rain and a
//     gale hunched on the beach and the pier, facing the wind (a few still fly low).
//   - tern, pelican (0..1): fishing. Terns hunt by sight, hovering and plunging: rain and a chop hide the
//     fish, and they stop; pelicans plunge-dive and skim the swell, and sit out a downpour and a gale.
//     Both roost at night.
//   - frigate (0..1): aloft. A frigatebird's feathers aren't waterproof and it can't land on the sea: it
//     leaves the sky to rain, and roosts at night and in a gale.
//   - shore (0..1): how huddled the sanderlings are, above the tide line facing the wind (a light shower
//     doesn't stop them working the swash; a downpour or a gale does).
//   - ghost (0..1): ghost crabs out of their burrows (none in rain or blowing sand: they plug them).
//   - hermit (0..1.6): land hermit crabs out (more in light rain and the damp after it, as the islands'
//     Caribbean hermit crabs are; none in a downpour or a gale).
//   - song (0..1.4): songbirds singing (quiet in heavy rain and a strong wind; a burst as a shower
//     clears, while everything's still wet).
//   - whaleSurface (1..2.5): how often the humpback slaps and breaches. As the wind and the sea's noise
//     rise, humpbacks shift from song to surface signals (Dunlop, Cato & Noad 2010).
//   - whaleAway: gone offshore, out of a hurricane's way, from when it's watched for until a day after.
//   - sharksAway: blacktips leaving the shallows for deeper water as the pressure falls ahead of a blow,
//     back once it's eased (Heupel, Simpfendorfer & Hueter 2003); and from a hurricane's warning on.
//   - gone: the island's seabirds gone ahead of a hurricane (from its warning until half a day after its
//     winds), but for eyeBirds: seabirds caught up in its eye, circling in the calm.

import { hurricaneNews } from './Weather.js';

const ss = ( a, b, x ) => {

	const t = Math.min( 1, Math.max( 0, ( x - a ) / ( b - a ) ) );
	return t * t * ( 3 - 2 * t );

};
const clamp01 = ( x ) => Math.min( 1, Math.max( 0, x ) );

// m/s: a breezy day's trade wind, the strongest of it (Weather.CONDITIONS.breezy): ordinary weather here,
// that nothing changes its ways for. What a wind does starts past it
const TRADES = 11.5;

// game hours: the seabirds back after a hurricane's winds; the whale back after them
const BIRDS_BACK = 12, WHALE_BACK = 24;

// what's said of a hurricane for the wildlife: Weather.hurricaneNews's, and still the last one's for a
// day after its winds have gone (when the news has none: the animals aren't back yet). (Hurricanes are
// days apart: the one a day ago, if any, is the one now.)
export function wildlifeNews( T, pick = null, since = 0 ) {

	return hurricaneNews( T, pick, since ) || hurricaneNews( T - WHALE_BACK, pick, since );

}

// w: the weather (wind m/s, rain 0..1, thunder, front, murk, eye); news: wildlifeNews's (or null);
// T: island time (game hours); wet: G.wet (0..1); out: filled and returned
export function wildlifeMood( w, news = null, T = 0, wet = 0, out = {} ) {

	const wind = w ? w.wind : 7, rain = w ? w.rain : 0, murk = w ? w.murk || 0 : 0;
	const heavy = ss( 0.35, 0.8, rain ), gale = ss( 14, 21, wind );
	out.gull = clamp01( 1 - 0.8 * heavy - 0.75 * gale );
	out.tern = clamp01( 1 - ss( 0.25, 0.6, rain ) - ss( 12, 18, wind ) ) * ( 1 - 0.5 * murk );
	out.pelican = clamp01( 1 - ss( 0.4, 0.8, rain ) - ss( 15, 21, wind ) );
	out.frigate = clamp01( 1 - ss( 0.05, 0.22, rain ) - ss( 17, 23, wind ) );
	out.shore = Math.max( ss( 0.45, 0.85, rain ), ss( 15, 21, wind ) );
	out.ghost = ( 1 - ss( 0.04, 0.3, rain ) ) * ( 1 - ss( TRADES, 15, wind ) );
	const light = ss( 0.02, 0.2, rain ) * ( 1 - ss( 0.4, 0.8, rain ) );
	out.hermit = ( 1 + 0.6 * Math.max( light, ss( 0.4, 0.9, wet ) * ( 1 - ss( 0.05, 0.3, rain ) ) ) ) * ( 1 - ss( 0.6, 0.9, rain ) ) * ( 1 - ss( 15, 20, wind ) );
	const quiet = clamp01( 1 - 0.9 * ss( 0.3, 0.7, rain ) ) * ( 1 - ss( TRADES, 24, wind ) );
	out.song = quiet * ( 1 + 0.4 * ss( 0.5, 0.9, wet ) * ( 1 - ss( 0.02, 0.1, rain ) ) );
	out.whaleSurface = 1 + 1.5 * ss( TRADES, 20, wind );
	// (a blow on its way: the pressure falling; still away through a gale)
	const front = w ? w.front || 0 : 0;
	out.sharksAway = front > 0.35 || wind > 17;
	// a hurricane: from its watch, its warning; until after its winds
	const h = news && news.stage !== 'outlook' ? news : null;
	out.whaleAway = !! h && T < h.ends + WHALE_BACK;
	out.gone = !! h && h.stage === 'warning' && T < h.ends + BIRDS_BACK;
	out.sharksAway = out.sharksAway || ( !! h && h.stage === 'warning' );
	out.eyeBirds = out.gone && !! w && w.eye > 0.5;
	return out;

}

// (each kind of seabird: whether it's about at all, by night and in the weather (gulls sit it out where
// they are: always about, but for a hurricane's); `about`: whether it is now, so that it doesn't come and
// go as the weather wavers about the line)
export function seabirdAbout( kind, mood, night, about = true ) {

	if ( kind === 'frigate' && mood.eyeBirds ) return true;
	if ( mood.gone ) return false;
	if ( kind === 'gull' ) return true;
	if ( night > ( about ? 0.65 : 0.5 ) ) return false;
	const k = kind === 'tern' ? mood.tern : kind === 'pelican' ? mood.pelican : mood.frigate;
	return k > ( about ? 0.3 : 0.45 );

}
