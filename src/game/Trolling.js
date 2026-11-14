// (M20) The console's trolling motor's batteries (stream KIT: docs/m20/kit.md; the sources, docs/m20/sources-boats.md's 1). Pure,
// for the tests under Node.
//
// Three 12 V deep-cycle AGMs in series, the 36 V her 112 lb motor runs on: 80 Ah of the bank used, of their 100 (a lead-acid
// battery's run no lower). The motor draws drawA at full thrust (Minn Kota's 52 A), as the lever to the 1.5 (Garmin's table:
// a third of the thrust at a fifth of the current), so 1.5 h flat out, 4.3 h at half. Charged at chargeA a battery, the bank 10
// Ah an hour: at the dock on the charger (8 h from flat, a night's rest), or from her outboards' alternators under way. As her
// fuel is, it goes in real time (a day's poling on the flats at a third of the lever is 9 h); the dock's charger by the
// island's clock, so a rest charges it.
//
//   trollDrawA( lever ) -> A       batteryStep( used, s, { lever, charging } ) -> Ah used, after s seconds
//   chargeHours( used, hours ) -> Ah used after that long on the dock's charger       thrustLeft( used ) -> 0..1 of her thrust

export const BATTERY = { ah: 80, drawA: 52, chargeA: 10, low: 0.15, sag: 0.05 };

export const trollDrawA = ( lever ) => BATTERY.drawA * Math.pow( Math.min( 1, Math.abs( lever ) || 0 ), 1.5 );

// Ah used (0 full .. BATTERY.ah flat) after s seconds with the lever at `lever` (0 with the motor up), charging from her
// outboards meanwhile or not
export function batteryStep( used, s, { lever = 0, charging = false } = {} ) {

	const a = trollDrawA( lever ) - ( charging ? BATTERY.chargeA : 0 );
	return Math.min( BATTERY.ah, Math.max( 0, ( Number.isFinite( used ) ? used : 0 ) + a * s / 3600 ) );

}

export const chargeHours = ( used, hours ) => Math.max( 0, ( Number.isFinite( used ) ? used : 0 ) - BATTERY.chargeA * Math.max( 0, hours ) );

// her thrust by the charge left: all of it until the last BATTERY.sag of the bank, then falling away to nothing, the voltage with it
export const thrustLeft = ( used ) => Math.min( 1, Math.max( 0, ( BATTERY.ah - ( used || 0 ) ) / ( BATTERY.ah * BATTERY.sag ) ) );
