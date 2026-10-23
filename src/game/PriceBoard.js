import { Mesh, PlaneGeometry, CanvasTexture, MeshStandardMaterial, SRGBColorSpace } from '../engine/index.js';
import { FISH } from './FishTable.js';

// (Salt Life) Joe's prices, chalked on the A-frame board by his stand (FishStand.js stands the plane
// over the board's slate): what he pays a kilo for the fish he buys most, from the catch table. One
// plane drawn on a canvas, lettered like the records board across the counter (together/RecordsBoard.js)
// and in its program (no new shader).
//   const b = new PriceBoard();  b.mesh.applyMatrix4( slate );  stand.group.add( b.mesh )

const W = 512, H = 726; // the slate's canvas (0.55 × 0.78 m), as the records board's
// the board's rows: the name chalked, the fish in the catch table
const ROWS = [ [ 'Red snapper', 'redSnapper' ], [ 'Hogfish', 'wrasse' ], [ 'Yellowtail', 'yellowtail' ], [ 'Grunt', 'grunt' ], [ 'Jack', 'jack' ] ];

export class PriceBoard {

	constructor() {

		this.canvas = document.createElement( 'canvas' );
		this.canvas.width = W;
		this.canvas.height = H;
		this.texture = new CanvasTexture( this.canvas );
		this.texture.colorSpace = SRGBColorSpace;
		this.texture.anisotropy = 4;
		this.mesh = new Mesh( new PlaneGeometry( 0.55, 0.78 ), new MeshStandardMaterial( { map: this.texture, roughness: 0.95 } ) );
		this.mesh.name = 'PriceSlate';
		this.draw();

	}

	draw() {

		const font = '"Caveat Brush", "Comic Sans MS", cursive';
		// (the chalk font is the HUD's: drawn again once it has loaded)
		if ( ! this._font && document.fonts && document.fonts.load ) {

			this._font = 'pending';
			document.fonts.load( `40px ${ font }` ).then( () => this.draw() ).catch( () => {} );

		}

		const g = this.canvas.getContext( '2d' );
		// slate: dark, smudged with old chalk
		g.fillStyle = '#262d2d';
		g.fillRect( 0, 0, W, H );
		for ( let i = 0; i < 26; i ++ ) {

			g.fillStyle = `rgba(220, 225, 220, ${ 0.02 + ( i % 5 ) * 0.008 })`;
			g.beginPath();
			g.ellipse( ( i * 97 ) % W, ( i * 173 ) % H, 60 + ( i * 37 ) % 90, 18 + ( i * 13 ) % 30, ( i * 0.7 ) % 3, 0, Math.PI * 2 );
			g.fill();

		}

		g.fillStyle = '#f2efe4';
		g.textAlign = 'center';
		g.font = `66px ${ font }`;
		g.fillText( 'Today we buy', W / 2, 88 );
		g.fillRect( 60, 108, W - 120, 3 );
		let y = 200;
		for ( const [ name, k ] of ROWS ) {

			const price = `$${ FISH[ k ].price }/kg`;
			g.font = `52px ${ font }`;
			g.textAlign = 'left';
			g.fillStyle = '#f2efe4';
			g.fillText( name, 36, y, 290 );
			g.textAlign = 'right';
			g.fillStyle = '#f5d98a';
			g.fillText( price, W - 36, y );
			// dots from the name to its price
			const a = 36 + Math.min( 290, g.measureText( name ).width ) + 14, b = W - 36 - g.measureText( price ).width - 14;
			g.fillStyle = 'rgba(242, 239, 228, 0.45)';
			for ( let x = a; x < b; x += 14 ) g.fillRect( x, y - 5, 4, 4 );
			y += 86;

		}

		g.fillStyle = '#f2efe4';
		g.textAlign = 'center';
		g.font = `50px ${ font }`;
		g.fillText( 'Tuna, mahi: ask Joe', W / 2, 660 );
		this.texture.needsUpdate = true;

	}

}
