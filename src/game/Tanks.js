import { CHANDLERY } from './Chandlery.js';

// (M16) A scuba tank's one dive's air (Gear's diveKit), and it doesn't fill up by itself. A fresh one's from a tank rack aboard
// (consoleTanks, on the center console), and otherwise you fill it back at the dock or at Marta's.

const DOCK_M = 40, STALL_M = 15, BERTH_M = 14;
// (m of air used before it's worth a word)
const WORTH_S = 60;

// where you are gets you a fresh tank: 'rack', 'dock', or null
export function tankFill( { mode, riding, tankRack, atBerth, toBerth, toStall } ) {

	if ( mode === 'swim' ) return null;
	if ( mode === 'walk' ) return toBerth < DOCK_M || toStall < STALL_M ? 'dock' : null;
	// (someone else's boat: her rack and her dock aren't yours)
	if ( riding ) return null;
	if ( tankRack ) return 'rack';
	return atBerth ? 'dock' : null;

}

export function tankStep( game ) {

	const P = game.app.player, b = game.app.boatCtl;
	if ( ! P || ! b || ! ( P.airS > 0 ) || P.breath >= P.breathMax ) return;
	const used = P.breathMax - P.breath, dock = b.berth.position;
	const fill = tankFill( {
		mode: P.mode, riding: P.riding, tankRack: game.state.stats.tankRack,
		atBerth: b.moored || Math.hypot( b.position.x - dock.x, b.position.z - dock.z ) < BERTH_M,
		toBerth: Math.hypot( P.position.x - dock.x, P.position.z - dock.z ),
		toStall: Math.hypot( P.position.x - CHANDLERY.x, P.position.z - CHANDLERY.z ),
	} );
	if ( ! fill ) {

		if ( P.mode !== 'swim' && used > WORTH_S && game.guide ) game.guide.tip( 'tankLeft' );
		return;

	}

	P.breath = P.breathMax;
	if ( used > WORTH_S ) game.toast( fill === 'rack' ? 'A fresh tank from the rack' : 'Your tank\'s filled', 2600 );

}
