import { Group, Mesh, PlaneGeometry, CanvasTexture, MeshStandardMaterial, SRGBColorSpace, Matrix4 } from '../engine/index.js';
import { prepare, mergePrepared, box, mat4 } from '../world/boat/GeoKit.js';
import { createPropMaterial, PAT } from '../game/GameMaterials.js';
import { STAND } from '../game/FishStand.js';
import { FISH } from '../game/FishTable.js';
import { pounds } from '../game/Units.js';

// (Salt Life) The island's records, chalked on an A-frame board beside Joe's stand (across the
// counter from his price board): each species' heaviest fish anyone in the group has landed, its
// weight and who caught it (together/Together.js keeps them, in the group's shared save). The slate is
// a canvas, redrawn when a record falls.
//   const b = new RecordsBoard( { terrain } );  scene.add( b.group );  b.draw( records )

const W = 512, H = 726; // the slate's canvas (0.55 × 0.78 m)
const SPOT = { x: - 2.05, z: 1.55, yaw: 0.4 }; // in the stand's frame (its front toward +z)

export class RecordsBoard {

	constructor( { terrain } ) {

		this.group = new Group();
		this.group.name = 'RecordsBoard';
		const m = new Matrix4().makeRotationY( STAND.yaw ).setPosition( STAND.x, 0, STAND.z ).multiply( new Matrix4().makeRotationY( SPOT.yaw ).setPosition( SPOT.x, 0, SPOT.z ) );
		this.group.applyMatrix4( m );
		this.group.position.y = terrain.heightAt( this.group.position.x, this.group.position.z );

		// the A-frame: two panels leaning together, meeting at the top (their feet 2 × 0.9 sin 0.24 m
		// apart), weathered wood; the slate's chalk on the front one
		const P = [];
		const WOOD = { color: 0x8a7458, rough: 0.85, pattern: PAT.wood };
		const panel = ( front ) => new Matrix4().makeRotationY( front ? 0 : Math.PI )
			.multiply( new Matrix4().makeTranslation( 0, 0, 0.9 * Math.sin( 0.24 ) ) ).multiply( new Matrix4().makeRotationX( - 0.24 ) );
		for ( const front of [ true, false ] ) {

			const base = panel( front ), at = ( x, y ) => base.clone().multiply( mat4( x, y, 0 ) );
			P.push( prepare( box( 0.62, 0.035, 0.025 ), { ...WOOD, matrix: at( 0, 0.86 ) } ) );
			P.push( prepare( box( 0.62, 0.035, 0.025 ), { ...WOOD, matrix: at( 0, 0.05 ) } ) );
			for ( const s of [ - 1, 1 ] ) P.push( prepare( box( 0.035, 0.9, 0.025 ), { ...WOOD, matrix: at( s * 0.29, 0.45 ) } ) );
			P.push( prepare( box( 0.55, 0.78, 0.01 ), { color: 0x23292a, rough: 0.95, matrix: at( 0, 0.455 ) } ) );

		}

		this.frame = new Mesh( mergePrepared( P ), createPropMaterial( 'recordsBoard' ) );
		this.frame.castShadow = true;
		this.group.add( this.frame );

		this.canvas = document.createElement( 'canvas' );
		this.canvas.width = W;
		this.canvas.height = H;
		this.texture = new CanvasTexture( this.canvas );
		this.texture.colorSpace = SRGBColorSpace;
		this.texture.anisotropy = 4;
		this.slate = new Mesh( new PlaneGeometry( 0.55, 0.78 ), new MeshStandardMaterial( { map: this.texture, roughness: 0.95 } ) );
		this.slate.name = 'RecordsSlate';
		this.slate.applyMatrix4( panel( true ).multiply( new Matrix4().makeTranslation( 0, 0.455, 0.008 ) ) );
		this.group.add( this.slate );
		this._font = null;
		this.draw( {} );

	}

	// records: species -> { kg, cm, who, m ('s': speared, 'h': by hand) }
	draw( records ) {

		this._last = records;
		const font = '"Caveat Brush", "Comic Sans MS", cursive';
		// (the chalk font is the HUD's: drawn again once it has loaded)
		if ( ! this._font && document.fonts && document.fonts.load ) {

			this._font = document.fonts.load( `40px ${ font }` ).then( () => this.draw( this._last ) ).catch( () => {} );

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
		g.font = `62px ${ font }`;
		g.fillText( 'Island records', W / 2, 78 );
		g.fillRect( 60, 98, W - 120, 3 );
		const list = Object.entries( records ).filter( ( [ k, r ] ) => FISH[ k ] && r && r.kg > 0 ).sort( ( a, b ) => b[ 1 ].kg - a[ 1 ].kg ).slice( 0, 8 ); // (all of them: in the cooler)
		if ( ! list.length ) {

			g.font = `44px ${ font }`;
			g.fillText( 'None yet:', W / 2, 210 );
			g.fillText( 'be the first!', W / 2, 266 );

		}

		let y = 162;
		for ( const [ k, r ] of list ) {

			g.textAlign = 'left';
			g.font = `40px ${ font }`;
			g.fillStyle = '#f2efe4';
			g.fillText( FISH[ k ].name, 28, y, 320 );
			g.textAlign = 'right';
			g.fillStyle = '#f5d98a';
			g.fillText( `${ pounds( r.kg ) } lb`, W - 28, y );
			g.textAlign = 'left';
			g.font = `28px ${ font }`;
			g.fillStyle = 'rgba(242, 239, 228, 0.7)';
			g.fillText( `${ r.who || '' }${ { s: ' · speared', n: ' · netted', h: ' · by hand' }[ r.m ] || '' }`, 46, y + 30, 320 );
			y += 70;

		}

		this.texture.needsUpdate = true;

	}

}
