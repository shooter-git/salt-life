import { Mesh, PlaneGeometry, CanvasTexture, MeshStandardMaterial, SRGBColorSpace, Matrix4 } from '../engine/index.js';
import { STAND } from './FishStand.js';
import { WEATHER_NAMES, MURKY, surfText, swellFrom, sideText } from './Weather.js';
import { timeText } from './IslandClock.js';
import { knots } from './Units.js';
import { wxWind, wxRain } from './TimeHUD.js';

// (M9) The forecast, chalked on a small slate hung on the front of Joe's counter, left of his wanted
// list: the weather now (and its rain), the wind in knots and where it's from, the surf as a report
// gives it, and what's coming (Weather.forecast). When a blow's on its way and the fish are feeding
// hard ahead of it (Weather's front), Joe says so at the bottom; (M10) or, after one, that the water's
// still murky (Weather's murk: the spearfishing's poor); (M13) a hurricane on its way first (Weather's
// hurricaneNews: on the outlook, watched for, warned of; and in its eye, that there's more to come);
// (M14) or, last, a big surf on the north shore (Weather's north, past NORTH.big); (M15) which side of the
// island fishes (Weather.sideText: the bay in a big one, the north beach's surf, or the north side when it's
// flat).
// One plane, its frame painted into the
// canvas; the same program as the records board's slate (together/RecordsBoard.js), as the wanted
// list's. Drawn again only when what it says changes.
//   const s = new ForecastSlate( { terrain } );  scene.add( s.mesh );  s.draw( weather, next, locale, news )

const W = 448, H = 384; // the slate's canvas (0.5 × 0.43 m)
const SPOT = { x: - 0.36, y: 0.6, z: 0.86 }; // in the stand's frame: on the counter front, left of centre
// the front (0..1) from which Joe chalks that the fish are feeding ((M10) and that the water's murky:
// Weather.MURKY)
export const FEEDING = 0.4;

// what the slate says: [ [ label, value ], … ] and the note at the bottom ('' for none). weather:
// Weather.weatherAt's (null: not yet known); next: Weather.forecast's ({ id, at }, or null: settled);
// (M13) news: Weather.hurricaneNews's (null: none)
export function slateText( weather, next, locale = undefined, news = null ) {

	if ( ! weather ) return { rows: [], note: '' };
	const wet = wxRain( weather );
	const later = next ? `${ WEATHER_NAMES[ next.id ] } from ${ timeText( next.at % 24, locale, 30 ) }` : 'Settled';
	return {
		rows: [
			[ 'Now', `${ WEATHER_NAMES[ weather.id ] }${ wet ? `, ${ wet }` : '' }` ],
			[ 'Wind', `${ wxWind( weather ) } ${ knots( weather.wind ) }` ],
			[ 'Surf', `${ surfText( weather.surf ) } ${ swellFrom( weather.west || 0 ) }, ${ Math.round( weather.period ) } s` ],
			[ 'Later', later ],
		],
		note: news ? hurricaneNote( news, weather ) : weather.front >= FEEDING ? 'Fish feeding: a blow\'s coming' : weather.murk >= MURKY ? 'The water\'s murky after the blow'
			: upper( sideText( weather.north ) ),
	};

}

const upper = ( t ) => t.charAt( 0 ).toUpperCase() + t.slice( 1 );

// (M13) what Joe chalks of a hurricane on its way
function hurricaneNote( news, weather ) {

	// ((M14) its category: 'Cat 3 hurricane warning')
	const cat = news.cat ? `Cat ${ news.cat } ` : '';
	if ( news.stage === 'outlook' ) return `A ${ cat }hurricane out to the ${ news.from }`;
	if ( news.stage === 'watch' ) return `${ cat }hurricane watch`.replace( /^./, ( c ) => c.toUpperCase() );
	return weather.eye >= 0.5 ? 'The eye: more to come' : `${ cat }hurricane warning`.replace( /^./, ( c ) => c.toUpperCase() );

}

export class ForecastSlate {

	constructor( { terrain } ) {

		this.canvas = document.createElement( 'canvas' );
		this.canvas.width = W;
		this.canvas.height = H;
		this.texture = new CanvasTexture( this.canvas );
		this.texture.colorSpace = SRGBColorSpace;
		this.texture.anisotropy = 4;
		this.mesh = new Mesh( new PlaneGeometry( 0.5, 0.5 * H / W ), new MeshStandardMaterial( { map: this.texture, roughness: 0.95 } ) );
		this.mesh.name = 'ForecastSlate';
		const y = terrain.heightAt( STAND.x, STAND.z );
		// hung a little off true the other way from the wanted list
		this.mesh.applyMatrix4( new Matrix4().makeRotationY( STAND.yaw ).setPosition( STAND.x, y, STAND.z )
			.multiply( new Matrix4().makeRotationZ( 0.02 ).setPosition( SPOT.x, SPOT.y, SPOT.z ) ) );
		this._font = null;
		this._key = null;
		this._last = [ null, null, undefined ];
		this.draw();

	}

	// weather: the weather now (WeatherDriver.target); next: what's coming (Weather.forecast); (M13) news:
	// what's said of a hurricane (WeatherDriver.news)
	draw( weather = null, next = null, locale = undefined, news = null ) {

		const text = slateText( weather, next, locale, news );
		const key = JSON.stringify( text );
		if ( key === this._key ) return;
		this._key = key;
		this._last = [ weather, next, locale, news ];
		const font = '"Caveat Brush", "Comic Sans MS", cursive';
		// (the chalk font is the HUD's: drawn again once it has loaded)
		if ( ! this._font && document.fonts && document.fonts.load ) {

			this._font = 'pending';
			document.fonts.load( `40px ${ font }` ).then( () => {

				this._font = 'ready';
				this._key = '';
				this.draw( ...this._last );

			} ).catch( () => {} );

		}

		const g = this.canvas.getContext( '2d' );
		// the frame: weathered wood, then the slate inside it, smudged with old chalk
		g.fillStyle = '#7d6a50';
		g.fillRect( 0, 0, W, H );
		g.fillStyle = 'rgba(0, 0, 0, 0.18)';
		for ( let i = 0; i < 8; i ++ ) g.fillRect( 0, ( i * 47 ) % H, W, 2 );
		const F = 16;
		g.fillStyle = '#262d2d';
		g.fillRect( F, F, W - 2 * F, H - 2 * F );
		for ( let i = 0; i < 14; i ++ ) {

			g.fillStyle = `rgba(220, 225, 220, ${ 0.02 + ( i % 5 ) * 0.008 })`;
			g.beginPath();
			g.ellipse( F + ( i * 97 ) % ( W - 2 * F ), F + ( i * 139 ) % ( H - 2 * F ), 44 + ( i * 31 ) % 60, 12 + ( i * 11 ) % 20, ( i * 0.9 ) % 3, 0, Math.PI * 2 );
			g.fill();

		}

		g.fillStyle = '#f2efe4';
		g.textAlign = 'center';
		g.font = `48px ${ font }`;
		g.fillText( 'Weather', W / 2, 66 );
		g.fillRect( 130, 78, W - 260, 3 );
		// each row: what it is in dim chalk, then the chalked value
		let y = 128;
		for ( const [ label, value ] of text.rows ) {

			g.textAlign = 'left';
			g.font = `26px ${ font }`;
			g.fillStyle = 'rgba(242, 239, 228, 0.62)';
			g.fillText( label, 38, y, 90 );
			g.font = `34px ${ font }`;
			g.fillStyle = '#f2efe4';
			g.fillText( value, 132, y, W - 132 - 34 );
			y += 48;

		}

		// what Joe makes of it: a chalk line across, and the note in yellow
		if ( text.note ) {

			g.fillStyle = 'rgba(242, 239, 228, 0.5)';
			for ( let x = 38; x < W - 38; x += 18 ) g.fillRect( x, 304, 10, 2 );
			g.textAlign = 'center';
			g.font = `30px ${ font }`;
			g.fillStyle = '#f5d98a';
			g.fillText( text.note, W / 2, 342, W - 76 );

		}

		this.texture.needsUpdate = true;

	}

}
