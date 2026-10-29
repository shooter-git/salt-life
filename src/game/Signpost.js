import { Group, Mesh, BoxGeometry, PlaneGeometry, Shape, ExtrudeGeometry, CanvasTexture, MeshStandardMaterial, SRGBColorSpace, Color } from '../engine/index.js';

// (M15) A fingerpost by the boardwalk, just ahead of where everyone starts: the way to the north beach (east
// round the village, then over the ridge: M15.md's walk) and to the mangrove creek and the windward reef (by
// boat, round the west). Hand-painted arrow planks, turquoise with cream letters, on a weathered post; each
// arm points the real way, side-on to the start's view down the pier, so it's read from there. Each plank's
// letters are a canvas (both its faces), in the HUD's hand font once that's loaded.
//   const s = new Signpost( { terrain, colliders } );  scene.add( s.group )   (colliders: its post, solid)

export const SIGNPOST = {
	x: 57.6, z: - 71.4, // m: east of the boardwalk, a few steps ahead of the start
	height: 2.75, // the post (m)
	arms: [
		{ text: 'North beach', sub: 'over the ridge', toward: 0, y: 2.36 }, // (toward: rad from east, + to the north)
		{ text: 'Mangrove creek', sub: 'by boat', toward: Math.PI, y: 2.02 },
		{ text: 'Windward reef', sub: 'by boat', toward: Math.PI, y: 1.68 },
	],
	arm: { length: 1.15, height: 0.26, thick: 0.03, tip: 0.15 },
	paint: 0x2f8f8a, letters: '#fbf6e8', wood: 0x8a8378,
	// the sky's and the white sand's light on its shaded faces (the world's fill is for the ground: a sign on
	// a beach in the sun takes far more off the sand round it): the scene's environment light, this many times
	// over (its materials hold the environment's map themselves for it: three puts the scene's own intensity
	// in place of a material's that reads the scene's)
	fill: 7,
};

const PX = 512; // a plank's canvas, pixels along it (and in proportion across)

export class Signpost {

	constructor( { terrain, colliders = null } ) {

		const S = SIGNPOST, A = S.arm;
		this.group = new Group();
		this.group.name = 'Signpost';
		const y0 = terrain.heightAt( S.x, S.z );
		this.group.position.set( S.x, y0, S.z );
		if ( colliders ) colliders.addCylinder( S.x, S.z, 0.1, y0 - 0.4, y0 + S.height, { tag: 'signpost' } );
		const wood = new MeshStandardMaterial( { color: new Color( S.wood ), roughness: 0.95 } );
		this.materials = [ wood ];
		// (the scene's environment, and as much again as `fill` says, in step with it at each render)
		const sync = ( renderer, scene ) => {

			for ( const m of this.materials ) {

				if ( m.envMap !== scene.environment ) {

					if ( ! m.envMap !== ! scene.environment ) m.needsUpdate = true;
					m.envMap = scene.environment;

				}

				m.envMapIntensity = scene.environmentIntensity * S.fill;

			}

		};
		const post = new Mesh( new BoxGeometry( 0.12, S.height + 0.4, 0.12 ), wood );
		post.position.y = ( S.height - 0.4 ) / 2; // (0.4 m of it in the ground)
		const cap = new Mesh( new BoxGeometry( 0.16, 0.04, 0.16 ), wood );
		cap.position.y = S.height + 0.02;
		this.group.add( post, cap );
		// a plank: an arrow, its root at the post, its tip `tip` long
		const shape = new Shape();
		shape.moveTo( 0, - A.height / 2 );
		shape.lineTo( A.length - A.tip, - A.height / 2 );
		shape.lineTo( A.length, 0 );
		shape.lineTo( A.length - A.tip, A.height / 2 );
		shape.lineTo( 0, A.height / 2 );
		shape.closePath();
		const body = new ExtrudeGeometry( shape, { depth: A.thick, bevelEnabled: false } );
		body.translate( 0, 0, - A.thick / 2 );
		const paint = new MeshStandardMaterial( { color: new Color( S.paint ), roughness: 0.8 } );
		this.materials.push( paint );
		this.planks = [];
		for ( const arm of S.arms ) {

			const g = new Group();
			g.position.y = arm.y;
			g.rotation.y = arm.toward;
			g.add( new Mesh( body, paint ) );
			// its letters, on both faces (each read the right way round from its side)
			const canvas = document.createElement( 'canvas' );
			canvas.width = PX;
			canvas.height = Math.round( PX * A.height / A.length );
			const map = new CanvasTexture( canvas );
			map.colorSpace = SRGBColorSpace;
			map.anisotropy = 4;
			const mat = new MeshStandardMaterial( { map, transparent: true, roughness: 0.85, depthWrite: false } );
			this.materials.push( mat );
			for ( const side of [ 1, - 1 ] ) {

				const face = new Mesh( new PlaneGeometry( A.length - A.tip, A.height ), mat );
				face.position.set( ( A.length - A.tip ) / 2, 0, side * ( A.thick / 2 + 0.002 ) );
				if ( side < 0 ) face.rotation.y = Math.PI;
				face.renderOrder = 2;
				g.add( face );

			}

			this.group.add( g );
			this.planks.push( { arm, canvas, map } );

		}

		this.group.traverse( ( o ) => {

			if ( o.isMesh ) o.onBeforeRender = sync;

		} );
		this.draw();
		// (the hand font: drawn again once it's loaded)
		const font = '40px "Caveat Brush"';
		if ( document.fonts && document.fonts.load ) document.fonts.load( font ).then( () => this.draw() ).catch( () => {} );

	}

	draw() {

		const S = SIGNPOST;
		for ( const { arm, canvas, map } of this.planks ) {

			const g = canvas.getContext( '2d' ), w = canvas.width, h = canvas.height;
			g.clearRect( 0, 0, w, h );
			g.fillStyle = S.letters;
			g.textBaseline = 'middle';
			g.textAlign = 'center';
			g.font = `${ Math.round( h * 0.62 ) }px "Caveat Brush", "Comic Sans MS", cursive`;
			g.fillText( arm.text, w / 2, h * 0.42, w * 0.94 );
			g.globalAlpha = 0.85;
			g.font = `${ Math.round( h * 0.28 ) }px "Caveat Brush", "Comic Sans MS", cursive`;
			g.fillText( arm.sub, w / 2, h * 0.84, w * 0.9 );
			g.globalAlpha = 1;
			// (the paint worn through here and there)
			g.globalCompositeOperation = 'destination-out';
			for ( let i = 0; i < 40; i ++ ) {

				g.globalAlpha = 0.15 + ( i % 5 ) * 0.08;
				g.fillRect( ( i * 97 ) % w, ( i * 53 ) % h, 3 + ( i % 7 ), 2 + ( i % 3 ) );

			}

			g.globalCompositeOperation = 'source-over';
			g.globalAlpha = 1;
			map.needsUpdate = true;

		}

	}

}
