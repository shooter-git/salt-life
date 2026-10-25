import { Mesh, PlaneGeometry, CanvasTexture, MeshStandardMaterial, SRGBColorSpace, Matrix4 } from '../engine/index.js';

// (Salt Life) A trader's "Closed" board, out while they've gone home (Vendor.setOpen shows it): an old
// plank painted by hand, with when they're back and what's left out for you. One plane drawn on a
// canvas, in the records board's program (as the wanted slate: no new shader). Propped on Joe's
// counter; leaning on the front of Marta's table. (M9) Shut for the weather, it says so instead of
// when they're back (weatherLines; forWeather paints it again only when that changes).
//   const s = new ClosedSign( { terrain, at: STAND, spot: { x, y, z, tilt }, width, lines: [ 'Back at 5 AM', … ], weatherLines } )
//   scene.add( s.mesh );  vendor.sign = s.mesh;  s.forWeather( shut )

const W = 512, H = 288;

export class ClosedSign {

	constructor( { terrain, at, spot, width = 0.6, lines = [], weatherLines = null } ) {

		this.canvas = document.createElement( 'canvas' );
		this.canvas.width = W;
		this.canvas.height = H;
		this.texture = new CanvasTexture( this.canvas );
		this.texture.colorSpace = SRGBColorSpace;
		this.texture.anisotropy = 4;
		this.mesh = new Mesh( new PlaneGeometry( width, width * H / W ), new MeshStandardMaterial( { map: this.texture, roughness: 0.95 } ) );
		this.mesh.name = 'ClosedSign';
		this.mesh.visible = false;
		const y = terrain.heightAt( at.x, at.z );
		// tilted back (tilt, rad) from its bottom edge, which stands at spot.y
		const h = width * H / W;
		this.mesh.applyMatrix4( new Matrix4().makeRotationY( at.yaw ).setPosition( at.x, y, at.z )
			.multiply( new Matrix4().makeTranslation( spot.x, spot.y, spot.z ) )
			.multiply( new Matrix4().makeRotationX( - spot.tilt ) )
			.multiply( new Matrix4().makeRotationZ( spot.roll || 0 ).setPosition( 0, h / 2, 0 ) ) );
		this.lines = lines;
		// (M9) what it says while they're shut for the weather
		this.hourLines = lines;
		this.weatherLines = weatherLines || lines;
		this.draw();

	}

	// (M9) shut for the weather, or for the hour: painted again when that changes
	forWeather( shut ) {

		const lines = shut ? this.weatherLines : this.hourLines;
		if ( lines === this.lines ) return;
		this.lines = lines;
		this.draw();

	}

	draw() {

		const font = '"Caveat Brush", "Comic Sans MS", cursive';
		// (the painted letters are the HUD's font: drawn again once it has loaded)
		if ( ! this._font && document.fonts && document.fonts.load ) {

			this._font = 'pending';
			document.fonts.load( `40px ${ font }` ).then( () => this.draw() ).catch( () => {} );

		}

		const g = this.canvas.getContext( '2d' );
		// three sun-bleached planks, the gaps between them dark
		const tones = [ '#b9a888', '#aa9878', '#c2b294' ];
		for ( let i = 0; i < 3; i ++ ) {

			g.fillStyle = tones[ i ];
			g.fillRect( 0, i * H / 3, W, H / 3 );
			g.fillStyle = 'rgba(70, 50, 30, 0.12)';
			for ( let k = 0; k < 7; k ++ ) g.fillRect( 0, i * H / 3 + 8 + ( ( k * 37 + i * 11 ) % ( H / 3 - 12 ) ), W, 1 + ( k % 2 ) );

		}

		g.fillStyle = 'rgba(40, 28, 18, 0.55)';
		for ( let i = 1; i < 3; i ++ ) g.fillRect( 0, i * H / 3 - 2, W, 4 );
		// a nail at each end of the middle plank
		g.fillStyle = '#4a4038';
		for ( const x of [ 22, W - 22 ] ) g.fillRect( x - 4, H / 2 - 4, 8, 8 );
		// the word in red paint, a little uneven, and what's below in black
		g.textAlign = 'center';
		g.fillStyle = '#a3261c';
		g.font = `112px ${ font }`;
		g.save();
		g.translate( W / 2, 132 );
		g.rotate( - 0.03 );
		g.fillText( 'Closed', 0, 0 );
		g.restore();
		g.fillStyle = '#2a211a';
		g.font = `40px ${ font }`;
		this.lines.forEach( ( t, i ) => g.fillText( t, W / 2, 196 + i * 44, W - 60 ) );
		this.texture.needsUpdate = true;

	}

}
