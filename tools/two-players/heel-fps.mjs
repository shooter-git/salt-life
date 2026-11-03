// (M16) One game, her real sea, the boat's own update and water query driven in a loop in the page at a device's frame rate, and at the
// 0.1 s a frame the CPU's games run at: is a heel the two-game scripts read her handling, or their frame rate? Hard over one way and straight
// into the other, flat out, as hard.mjs's owner does it. No drawing: the page's own frames are stopped while it runs.
//   tools/render-slot.sh node tools/two-players/heel-fps.mjs [dir] [port] [boats, comma separated] [weathers, comma separated]   HEEL_LEVER=0.5  HEEL_RIGHT=28 (her rightFrom, degrees)  HEEL_FPS=30,2
import { start } from './lib.mjs';
const [ out = 'qa-output', PORT = '5221', BOATS = 'console,lobster,sportfisher', WEATHERS = 'calm,gale' ] = process.argv.slice( 2 );
const G = await start( { out, port: PORT } );
const { note, until, frames } = G;
const LEVER = + ( process.env.HEEL_LEVER || 1 ), RIGHT = process.env.HEEL_RIGHT ? + process.env.HEEL_RIGHT * Math.PI / 180 : null, RATES = ( process.env.HEEL_FPS || '60,30,15,8,2' ).split( ',' ).map( Number );
for ( const id of BOATS.split( ',' ) ) {

	const me = await G.open( 'Robin', id, 60, { group: `heelfps-${ id }` } );
	await G.buy( me );
	await me.game.evaluate( () => window.__app.player.boardBoat() );
	await G.helm( me );
	await G.toSea( me );
	for ( const weather of WEATHERS.split( ',' ) ) {

		await me.game.evaluate( ( w ) => { const a = window.__app; delete a.frame; a.together.setWeather( w, 0 ); a.weather.live = null; }, weather );
		await frames( me.game, 30 );
		for ( const fps of RATES ) {

			const r = await me.game.evaluate( async ( [ fps, runs, lever, right ] ) => {

				const { G: GL } = await import( '/src/core/Globals.js' );
				const a = window.__app, b = a.boatCtl, q = a.query, V = a.camera.position.constructor, u = new V(), Y = new V( 0, 1, 0 ), dt = Math.min( 1 / fps, 0.1 );
				a.frame = function () {}; // (her frames are this loop's)
				if ( right !== null ) b.handling.rightFrom = right;
				const heelOf = () => { u.set( 1, 0, 0 ).applyQuaternion( b.quaternion ); return Math.asin( u.y ) * 57.3; };
				const trimOf = () => { u.set( 0, 0, 1 ).applyQuaternion( b.quaternion ); return Math.asin( u.y ) * 57.3; };
				const tick = ( th, st ) => { GL.time.value += dt; b.setInput( th, st, dt ); b.update( dt ); b.queueQueries(); q.update(); };
				const heels = [], trims = [], straight = [], tops = [];
				for ( let i = 0; i < runs; i ++ ) {

					b.position.set( - 2600, 0, 3000 );
					b.velocity.set( 0, 0, 0 );
					b.angular.set( 0, 0, 0 );
					b.quaternion.setFromAxisAngle( Y, 2.4 + i );
					b.driven = true;
					b.moored = false;
					b.anchor = null;
					let sf = 0;
					for ( let k = 0; k * dt < 25 + i * 1.7; k ++ ) { tick( lever, 0 ); if ( k * dt > 15 ) sf = Math.max( sf, Math.abs( heelOf() ) ); }
					straight.push( sf );
					tops.push( b.speed );
					let h = 0, t = 0;
					for ( const st of [ 1, - 1 ] ) {

						const y0 = b.getYaw();
						for ( let k = 0; k * dt < 45; k ++ ) { tick( lever, st ); h = Math.max( h, Math.abs( heelOf() ) ); t = Math.max( t, Math.abs( trimOf() ) ); if ( Math.abs( Math.sin( ( b.getYaw() - y0 ) / 2 ) ) > 0.92 ) break; }

					}

					heels.push( h );
					trims.push( t );

				}

				const mean = ( l ) => +( l.reduce( ( s, v ) => s + v, 0 ) / l.length ).toFixed( 1 ), most = ( l ) => +Math.max( ...l ).toFixed( 1 );
				return { top: mean( tops ), heel: mean( heels ), heelMost: most( heels ), trim: mean( trims ), trimMost: most( trims ), straight: mean( straight ), every: heels.map( ( v ) => +v.toFixed( 0 ) ) };

			}, [ fps, 6, LEVER, RIGHT ] );
			console.log( `${ id }, ${ weather }, lever ${ LEVER }${ RIGHT === null ? '' : `, rightFrom ${ process.env.HEEL_RIGHT }` }, ${ fps } fps${ fps < 10 ? ' (dt capped at 0.1 s)' : '' }: flat out ${ r.top } m/s, leaning ${ r.straight } deg going straight; hard over both ways: heel ${ r.heel } deg on average, ${ r.heelMost } at most ${ JSON.stringify( r.every ) }; trim ${ r.trim } on average, ${ r.trimMost } at most` );

		}

	}

	await me.page.close();

}

await G.end( 'heel-fps' );
