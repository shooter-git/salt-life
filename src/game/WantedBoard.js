import { Mesh, PlaneGeometry, CanvasTexture, MeshStandardMaterial, SRGBColorSpace, Matrix4 } from '../engine/index.js';
import { STAND } from './FishStand.js';
import { FISH } from './FishTable.js';
import { orderTerms, biteHint } from './Orders.js';

// (Salt Life) The day's wanted list, chalked on a slate hung on the front of Joe's counter: his two
// fish, where and when they bite, what he pays, and Marta's bait; ticked off as you fill them (each
// player sees their own ticks). One plane, its frame painted into the canvas; the same program as the
// records board's slate (together/RecordsBoard.js). Drawn again when the list or your progress changes.
//   const b = new WantedBoard( { terrain } );  scene.add( b.mesh );  b.draw( orders, filled )

const W = 512, H = 352; // the slate's canvas (0.64 × 0.44 m)
const SPOT = { x: 0.42, y: 0.6, z: 0.86 }; // in the stand's frame: on the counter front, right of centre

export class WantedBoard {

	constructor( { terrain } ) {

		this.canvas = document.createElement( 'canvas' );
		this.canvas.width = W;
		this.canvas.height = H;
		this.texture = new CanvasTexture( this.canvas );
		this.texture.colorSpace = SRGBColorSpace;
		this.texture.anisotropy = 4;
		this.mesh = new Mesh( new PlaneGeometry( 0.64, 0.44 ), new MeshStandardMaterial( { map: this.texture, roughness: 0.95 } ) );
		this.mesh.name = 'WantedSlate';
		const y = terrain.heightAt( STAND.x, STAND.z );
		// hung a little off true on the boards
		this.mesh.applyMatrix4( new Matrix4().makeRotationY( STAND.yaw ).setPosition( STAND.x, y, STAND.z )
			.multiply( new Matrix4().makeRotationZ( - 0.025 ).setPosition( SPOT.x, SPOT.y, SPOT.z ) ) );
		this._font = null;
		this._last = null;

	}

	// orders: the day's (Orders.ordersFor); filled: order id -> how many you've filled
	draw( orders = [], filled = {} ) {

		const key = JSON.stringify( [ orders, filled ] );
		if ( key === this._key ) return;
		this._key = key;
		this._last = [ orders, filled ];
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
		for ( let i = 0; i < 9; i ++ ) g.fillRect( 0, ( i * 41 ) % H, W, 2 );
		const F = 18;
		g.fillStyle = '#262d2d';
		g.fillRect( F, F, W - 2 * F, H - 2 * F );
		for ( let i = 0; i < 18; i ++ ) {

			g.fillStyle = `rgba(220, 225, 220, ${ 0.02 + ( i % 5 ) * 0.008 })`;
			g.beginPath();
			g.ellipse( F + ( i * 89 ) % ( W - 2 * F ), F + ( i * 151 ) % ( H - 2 * F ), 50 + ( i * 37 ) % 70, 14 + ( i * 13 ) % 22, ( i * 0.7 ) % 3, 0, Math.PI * 2 );
			g.fill();

		}

		g.fillStyle = '#f2efe4';
		g.textAlign = 'center';
		g.font = `54px ${ font }`;
		g.fillText( 'Wanted', W / 2, 74 );
		g.fillRect( 150, 88, W - 300, 3 );
		let y = 136;
		for ( const o of orders ) {

			const done = ( filled[ o.id ] | 0 ) >= o.max;
			const name = FISH[ o.species ].name, who = o.who === 'marta' ? 'Marta: ' : '';
			g.textAlign = 'left';
			g.font = `36px ${ font }`;
			g.fillStyle = done ? 'rgba(242, 239, 228, 0.45)' : '#f2efe4';
			g.fillText( `${ who }${ name }`, 40, y, 300 );
			if ( done ) g.fillRect( 38, y - 12, Math.min( 300, g.measureText( `${ who }${ name }` ).width ) + 4, 3 );
			g.textAlign = 'right';
			g.fillStyle = done ? 'rgba(245, 217, 138, 0.45)' : '#f5d98a';
			g.fillText( done ? '✓' : orderTerms( o ).replace( 'pays ', '' ), W - 40, y );
			g.textAlign = 'left';
			g.font = `24px ${ font }`;
			g.fillStyle = 'rgba(242, 239, 228, 0.62)';
			g.fillText( o.who === 'marta' ? 'bait, at the chandlery' : biteHint( o.species ), 56, y + 28, 400 );
			y += 74;

		}

		this.texture.needsUpdate = true;

	}

}
