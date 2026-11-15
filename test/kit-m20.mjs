// (M20) Stream KIT (docs/m20/kit.md), under Node: the blue-water gun's extra floats (each holds a fish to 35 kg; past what they hold
// together it drags them under and pulls free), bought with the blue-water gun only; the Pilot stood up (past 14 degrees of heel
// you go in and she stays upright; sat, as before); the trolling motor's batteries drawn down and charged; the poles refused on
// live coral and not staking on rock. The anchor's splash, shared between two games, is in test/flats-together.mjs.
import { gearStats, defaultUpgrades, UPGRADES } from '../src/game/Gear.js';
import { spearTerms, FLOAT, floatGeometry } from '../src/game/Speargun.js';
import { GameState } from '../src/game/GameState.js';
import { spearCell } from '../tools/fight-sweep.mjs';
import { KayakModel } from '../src/world/boat/kayak/KayakModel.js';
import { HEEL } from '../src/world/boat/kayak/Capsize.js';
import { BATTERY, trollDrawA, batteryStep, chargeHours, thrustLeft } from '../src/game/Trolling.js';
import { cleanDays } from '../src/game/Seaworthy.js';
import { Game } from '../src/game/Game.js';
import { Quaternion, Vector3 } from '../src/engine/index.js';

let failed = 0;
const ok = ( c, s ) => {

	if ( ! c ) failed ++;
	console.log( ( c ? 'ok   ' : 'FAIL ' ) + s );

};

// ---- the blue-water gun's floats
{

	const BLUE = UPGRADES.speargun.levels.length - 1;
	const gun = ( floats ) => gearStats( { ...defaultUpgrades(), speargun: BLUE, spearFloats: floats } );
	const one = spearTerms( gun( 0 ), { kg: 30 } ), over = spearTerms( gun( 0 ), { kg: 40 } ), two = spearTerms( gun( 1 ), { kg: 40 } );
	ok( one.floats === 1 && ! one.under && one.terms.tether === gun( 0 ).lineM + 30 && one.terms.dragKg === FLOAT.kg, `one float holds a 30 kg wahoo, ${ FLOAT.kg } kg of drag, out to its float line's end` );
	ok( over.under && over.terms.tether === Infinity && over.maxDistance === gun( 0 ).lineM + 30, `a 40 kg one's more than one float holds (${ FLOAT.holds } kg): it drags it under at the float line's end and pulls free` );
	ok( two.floats === 2 && ! two.under && two.terms.dragKg === 2 * FLOAT.kg, 'two floats hold it, twice the drag' );
	const k = UPGRADES.spearFloats.levels.map( ( l, i ) => spearTerms( gun( i ), { kg: 1000 } ).floats * FLOAT.holds );
	ok( k.join() === '35,70,105,140', `one to four floats hold ${ k.join( ', ' ) } kg` );
	ok( UPGRADES.spearFloats.levels.slice( 1 ).every( ( l ) => l.cost === 135 ), 'each extra float $135 (Rob Allen\'s 11 L)' );
	// (on the game's own terms, pulled with care, in the sweep's fights)
	const w1 = spearCell( BLUE, 'wahoo', 40, 20, 0 ), w2 = spearCell( BLUE, 'wahoo', 40, 20, 1 ), y2 = spearCell( BLUE, 'yellowfin', 90, 20, 1 ), y3 = spearCell( BLUE, 'yellowfin', 90, 20, 2 );
	ok( w1.caught < 0.5 && w2.caught === 1, `a 40 kg wahoo: landed ${ w1.caught * 100 }% on one float, ${ w2.caught * 100 }% on two (in ${ w2.t.toFixed( 0 ) } s)` );
	ok( y2.caught === 0 && y3.caught === 1, `a 90 kg yellowfin: ${ y2.caught * 100 }% on two, ${ y3.caught * 100 }% on three (in ${ y3.t.toFixed( 0 ) } s)` );
	// (bought with the blue-water gun fitted, and not before)
	const s = new GameState();
	s.money = 5000;
	ok( ! s.hasNeeds( 'spearFloats' ) && s.buy( 'spearFloats' ) === null, 'no extra floats without the blue-water gun' );
	s.upgrades.speargun = BLUE - 1;
	ok( ! s.hasNeeds( 'spearFloats' ), '  nor with the railgun' );
	s.upgrades.speargun = BLUE;
	const was = s.money, bought = s.buy( 'spearFloats' );
	ok( bought && s.upgrades.spearFloats === 1 && s.money === was - 135 && s.stats.extraFloats === 1, 'with it, a second float for $135' );
	ok( UPGRADES.spearFloats.needsName === 'blue-water speargun', `the shop says it needs the "${ UPGRADES.spearFloats.needsName }" first` );
	// (drawn: a row of them on the line)
	const g1 = floatGeometry( 1 ), g3 = floatGeometry( 3 );
	g3.computeBoundingBox();
	ok( g3.attributes.position.count === 3 * g1.attributes.position.count && g3.boundingBox.max.x > 2 * 2 * FLOAT.r, 'three floats drawn clipped together in a row along the line' );

}

// ---- the Pilot stood up
{

	const heelBy = ( deg ) => new Quaternion().setFromAxisAngle( new Vector3( 0, 0, 1 ), deg * Math.PI / 180 );
	const run = ( standing, deg ) => {

		const m = new KayakModel(), toasts = [];
		m.standing = standing;
		m._settle = 0;
		const p = { breath: 30, breathMax: 30, handsFull: false, busy: false, out: 0, exitBoat( t, side ) {

			this.out = side;

		} };
		const game = { state: { stats: {}, inventory: [ { kg: 1 } ], save() {}, emit() {} }, toast: ( t ) => toasts.push( t ) };
		const ctl = { quaternion: heelBy( deg ), query: {}, position: new Vector3() };
		for ( let i = 0; i < 20; i ++ ) m.playCapsize( 1 / 30, game, ctl, p );
		const r = { capsized: !! m.capsized, out: p.out !== 0, standing: m.standing, cooler: game.state.inventory.length, toast: toasts.at( - 1 ) };
		m.dispose && m.dispose();
		return r;

	};
	const st12 = run( true, 12 ), st16 = run( true, 16 ), sat16 = run( false, 16 ), sat36 = run( false, 36 );
	ok( Math.abs( HEEL.stand * 180 / Math.PI - 14 ) < 1e-9, 'stood up, your footing goes at 14 degrees of heel' );
	ok( ! st12.out && ! st12.capsized && st12.standing, 'stood up at 12 degrees: still on your feet' );
	ok( st16.out && ! st16.capsized && ! st16.standing && st16.cooler === 1, `stood up at 16 degrees: you go in, and she stays upright, the cooler with her ("${ st16.toast }")` );
	ok( ! sat16.out && ! sat16.capsized, 'sat at 16 degrees: nothing, as before' );
	ok( sat36.capsized && sat36.out, `sat at 36 degrees, past her ${ ( HEEL.idle * 180 / Math.PI ).toFixed( 0 ) }: over she goes, as before` );

}

// ---- the trolling motor's batteries
{

	ok( trollDrawA( 1 ) === 52 && Math.abs( trollDrawA( 0.5 ) - 18.4 ) < 0.1 && trollDrawA( - 1 ) === 52, `52 A flat out, ${ trollDrawA( 0.5 ).toFixed( 1 ) } at half the lever (as it to the 1.5), astern the same` );
	const hoursTo = ( lever ) => {

		let u = 0, h = 0;
		while ( u < BATTERY.ah && h < 50 ) {

			u = batteryStep( u, 60, { lever } );
			h += 1 / 60;

		}

		return h;

	};
	const full = hoursTo( 1 ), half = hoursTo( 0.5 );
	ok( Math.abs( full - 1.54 ) < 0.05 && Math.abs( half - 4.35 ) < 0.1, `80 Ah of the bank: ${ full.toFixed( 2 ) } h flat out, ${ half.toFixed( 2 ) } h at half (the sources: 1.5 and 4.3)` );
	ok( Math.abs( chargeHours( 80, 8 ) ) < 1e-9 && chargeHours( 80, 4 ) === 40 && chargeHours( 10, 4 ) === 0, 'the dock\'s charger: 10 Ah an hour, full from flat in 8 h, never past full' );
	let u = 40;
	for ( let i = 0; i < 3600; i ++ ) u = batteryStep( u, 1, { lever: 0, charging: true } );
	ok( Math.abs( u - 30 ) < 1e-6, 'her outboards running an hour: 10 Ah back' );
	ok( thrustLeft( 0 ) === 1 && thrustLeft( 75 ) === 1 && thrustLeft( 78 ) === 0.5 && thrustLeft( 80 ) === 0, 'her thrust all there until the last 5% of it, then going with the voltage' );
	const d = cleanDays( { boats: { console: { ice: 2, stores: 1, troll: 33.3 }, lobster: { ice: 1, troll: 900 } } } );
	ok( d.boats.console.troll === 33.3 && d.boats.lobster.troll === 80 && cleanDays( { boats: { console: { ice: 1 } } } ).boats.console.troll === 0, 'kept in her days\' record, read back within the bank' );

}

// ---- the poles on coral and rock
{

	const tried = ( bottom, both ) => {

		const toasts = [], g = Object.create( Game.prototype );
		g.toast = ( t ) => toasts.push( t );
		g.traps = { bottom: () => bottom };
		g.flats = { splash() {} };
		g.app = { terrainData: { heightAt: () => - 1 } };
		const b = { model: { stakeAt: new Vector3() }, toWorld: ( v, out ) => out.set( 10, 0, 10 ), getYaw: () => 0, stake: null };
		g._stakeHer( b, 3, both );
		return { held: !! b.stake, toast: toasts.at( - 1 ) };

	};
	for ( const both of [ true, false ] ) {

		const who = both ? 'her Power-Poles' : 'the kayak\'s pole', [ hold, are, wont ] = both ? [ 'hold', 'aren\'t', 'won\'t' ] : [ 'holds', 'isn\'t', 'won\'t' ];
		const sand = tried( 'sand', both ), mud = tried( 'mud', both ), grass = tried( 'grass', both ), coral = tried( 'coral', both ), rock = tried( 'hard', both ), edge = tried( 'edge', both );
		ok( sand.held && mud.held && grass.held, `${ who } ${ hold } on sand, mud and grass` );
		ok( ! coral.held && /coral/.test( coral.toast ), `${ who } ${ are } put down on live coral ("${ coral.toast }")` );
		ok( ! rock.held && ! edge.held && /won't|Hard bottom/.test( rock.toast ), `${ who } ${ wont } stake on rock or the reef's edge ("${ rock.toast }")` );

	}

}

if ( failed ) {

	console.log( failed + ' failed' );
	process.exit( 1 );

}
