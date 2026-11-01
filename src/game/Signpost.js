import { Group, Mesh, BoxGeometry, PlaneGeometry, Shape, ExtrudeGeometry, CanvasTexture, MeshStandardMaterial, SRGBColorSpace, Color, BufferAttribute, mergeGeometries } from '../engine/index.js';

// (M15) A fingerpost by the boardwalk, just ahead of where everyone starts: the way to the north beach and the
// fish camp (up to the square, where the trail over starts: world/terrain/NorthTrail.js) and to the mangrove
// creek and the windward reef (by boat, round the west). Hand-painted arrow planks, turquoise with cream
// letters, on a weathered post; each arm points the way, the boats' side-on to the start's view down the
// pier, so they're read from there. Each plank's letters are a row of one canvas (both its faces), in the HUD's
// hand font once that's loaded.
// (M15) And the way over's fingerposts (TRAIL_POSTS): at the square, where it leaves the valley's trail, and at
// its foot on the north beach by Pearl's camp.
// (M16) And along it at the turns you could miss, each saying how far on and how far back. Two draws a post (the
// wood and the planks one mesh, their letters another), and none out of reading range: there are a dozen now.
//   const s = new Signpost( { terrain, colliders, spec } );  scene.add( s.group )   (colliders: its post, solid;
//   spec: another post's { x, z, height, arms }, SIGNPOST's without)
//   s.update( x, z ): drawn only within spec.see m of ( x, z )

export const SIGNPOST = {
	x: 57.6, z: - 71.4, // m: east of the boardwalk, a few steps ahead of the start
	height: 2.75, // the post (m)
	see: 220, // m: drawn within this (it's read from about 30)
	arms: [
		// (toward: rad from east, + to the north. (M15) The north beach up to the square, where the trail starts: (M16)
		// about that way, turned across the start's view (true, 1.83, it was edge on from where you stand))
		{ text: 'North beach', sub: 'fish camp · the trail from the square', toward: 2.45, y: 2.36 },
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

const ON = ( text, sub, toward, y = 2.06 ) => ( { text, sub, toward, y } );
const BACK = ( text, sub, toward ) => ON( text, sub, toward, 1.72 );

// (M15) the way over's (world/terrain/NorthTrail.js): at the square, where the valley's trail starts up; at the
// fork, where the way over leaves it; and at its foot by the camp. (M16) And where a walker could miss it: the
// boardwalk's top, on the way to the square; partway
// up the valley; the hairpin in the east, where it stops heading away from the village and comes back north; the
// plateau's top; the turns on the plateau that double back; where it goes over the edge into the gully; and
// halfway down its zigzags. An arm pointing straight on is edge on to whoever's walking up to it (the square's two
// were, and went unread): each leans across the way you come, its tip over the path, near enough the way to go.
export const TRAIL_POSTS = [
	{ x: 58.2, z: - 89.5, arms: [
		ON( 'North beach', 'fish camp · through the square', 2.2 ),
	] },
	{ x: 45.2, z: - 118.2, arms: [
		ON( 'North beach', 'fish camp · 1.5 km by the trail', 2.2 ),
		BACK( 'The spur', 'up the valley', 2.2 ),
	] },
	{ x: 51.6, z: - 163.5, arms: [
		ON( 'North beach', 'fish camp · 1.5 km', 2.5 ),
		BACK( 'The square', 'down the valley', - 2.4 ),
	] },
	{ x: 24.5, z: - 235, arms: [
		ON( 'North beach', 'fish camp · 1.4 km', 0.3 ),
		BACK( 'The square', 'down the valley', - 1.04 ),
		{ text: 'The spur', sub: 'up the valley', toward: 2.7, y: 1.38 },
	] },
	{ x: 252.7, z: - 147.5, arms: [
		ON( 'North beach', 'fish camp · 1.1 km', 0.32 ),
		BACK( 'The village', 'by the trail · 700 m', 1.87 ),
	] },
	{ x: 398.6, z: - 410, arms: [
		ON( 'North beach', 'fish camp · 800 m', 2.4 ),
		BACK( 'The village', 'by the trail · 1 km', - 2.4 ),
	] },
	{ x: 354, z: - 542, arms: [
		ON( 'North beach', 'fish camp · 650 m', 0 ),
		BACK( 'The village', 'by the trail · 1.1 km', - 1.57 ),
	] },
	{ x: 380.6, z: - 527.3, arms: [
		ON( 'North beach', 'fish camp · 630 m', 1.25 ),
		BACK( 'The village', 'by the trail · 1.2 km', 2.36 ),
	] },
	{ x: 182, z: - 798.8, arms: [
		ON( 'Fish camp', 'down the gully · 260 m', - 2.79 ),
		BACK( 'The village', 'by the trail · 1.5 km', - 0.32 ),
	] },
	{ x: 122.7, z: - 775.5, arms: [
		ON( 'Fish camp', 'down the zigzags · 100 m', 1.89 ),
		BACK( 'The village', 'by the trail · 1.7 km', 0.32 ),
	] },
	{ x: 121, z: - 829.5, arms: [
		ON( 'Fish camp', 'Pearl\'s', 2.45 ),
		BACK( 'The village', 'by the trail · 1.8 km', - 2.05 ),
	] },
].map( ( p ) => ( { height: 2.45, see: 110, blaze: 0xf2ead2, fill: 12, glow: 0.3, arm: { length: 1.35, height: 0.3, thick: 0.03, tip: 0.16 }, ...p } ) );

const PX = 512; // a plank's canvas, pixels along it (and in proportion across)

export class Signpost {

	// (spec: another post's place and arms, the rest as SIGNPOST's)
	constructor( { terrain, colliders = null, spec = null } ) {

		const S = this.spec = spec ? { ...SIGNPOST, ...spec } : SIGNPOST, A = S.arm;
		this.group = new Group();
		this.group.name = 'Signpost';
		const y0 = terrain.heightAt( S.x, S.z );
		this.group.position.set( S.x, y0, S.z );
		if ( colliders ) colliders.addCylinder( S.x, S.z, 0.1, y0 - 0.4, y0 + S.height, { tag: 'signpost' } );
		// the wood and the paint one mesh, by their vertices' colours
		const painted = ( geo, hex ) => {

			const c = new Color( hex ), n = geo.attributes.position.count, a = new Float32Array( n * 3 );
			for ( let i = 0; i < n; i ++ ) a.set( [ c.r, c.g, c.b ], i * 3 );
			geo.setAttribute( 'color', new BufferAttribute( a, 3 ) );
			geo.deleteAttribute( 'uv' );
			return geo.index ? geo.toNonIndexed() : geo;

		};
		// a plank: an arrow, its root at the post, its tip `tip` long
		const shape = new Shape();
		shape.moveTo( 0, - A.height / 2 );
		shape.lineTo( A.length - A.tip, - A.height / 2 );
		shape.lineTo( A.length, 0 );
		shape.lineTo( A.length - A.tip, A.height / 2 );
		shape.lineTo( 0, A.height / 2 );
		shape.closePath();
		const parts = [
			painted( new BoxGeometry( 0.12, S.height + 0.4, 0.12 ).translate( 0, ( S.height - 0.4 ) / 2, 0 ), S.wood ), // (0.4 m of it in the ground)
			painted( new BoxGeometry( 0.16, 0.04, 0.16 ).translate( 0, S.height + 0.02, 0 ), S.wood ),
		];
		// (a walker's blaze: its top painted, which catches the eye under the trees as a post's bare wood doesn't)
		if ( S.blaze ) parts.push( painted( new BoxGeometry( 0.125, 0.3, 0.125 ).translate( 0, S.height - 0.16, 0 ), S.blaze ) );
		// each plank's letters a row of one canvas, on both faces (each read the right way round from its side)
		const rowH = Math.round( PX * A.height / A.length ), rows = S.arms.length, faces = [];
		S.arms.forEach( ( arm, n ) => {

			const body = new ExtrudeGeometry( shape, { depth: A.thick, bevelEnabled: false } );
			parts.push( painted( body.translate( 0, 0, - A.thick / 2 ).rotateY( arm.toward ).translate( 0, arm.y, 0 ), S.paint ) );
			for ( const side of [ 1, - 1 ] ) {

				const face = new PlaneGeometry( A.length - A.tip, A.height );
				const uv = face.attributes.uv;
				for ( let i = 0; i < uv.count; i ++ ) uv.setY( i, 1 - ( n + 1 - uv.getY( i ) ) / rows );
				if ( side < 0 ) face.rotateY( Math.PI );
				face.translate( ( A.length - A.tip ) / 2, 0, side * ( A.thick / 2 + 0.002 ) );
				faces.push( face.rotateY( arm.toward ).translate( 0, arm.y, 0 ) );

			}

		} );
		const canvas = this.canvas = document.createElement( 'canvas' );
		canvas.width = PX;
		canvas.height = rowH * rows;
		this.rowH = rowH;
		const map = this.map = new CanvasTexture( canvas );
		map.colorSpace = SRGBColorSpace;
		map.anisotropy = 4;
		const wood = new MeshStandardMaterial( { vertexColors: true, roughness: 0.9 } );
		const mat = new MeshStandardMaterial( { map, transparent: true, roughness: 0.85, depthWrite: false } );
		this.materials = [ wood, mat ];
		// (the scene's environment, and as much again as `fill` says, in step with it at each render)
		const sync = ( renderer, scene ) => {

			for ( const m of this.materials ) {

				if ( m.envMap !== scene.environment ) {

					if ( ! m.envMap !== ! scene.environment ) m.needsUpdate = true;
					m.envMap = scene.environment;

				}

				m.envMapIntensity = scene.environmentIntensity * S.fill;

			}

			// (deep shade under the trees: a glow of its own, with the daylight, or they come out near black)
			if ( S.glow ) wood.emissiveIntensity = mat.emissiveIntensity = scene.environmentIntensity * S.glow;

		};
		if ( S.glow ) {

			wood.emissive.set( S.paint );
			mat.emissive.set( S.letters );

		}

		const solid = new Mesh( mergeGeometries( parts ), wood ), letters = new Mesh( mergeGeometries( faces ), mat );
		letters.renderOrder = 2;
		solid.onBeforeRender = letters.onBeforeRender = sync;
		this.group.add( solid, letters );
		this.draw();
		// (the hand font: drawn again once it's loaded)
		const font = '40px "Caveat Brush"';
		if ( document.fonts && document.fonts.load ) document.fonts.load( font ).then( () => this.draw() ).catch( () => {} );

	}

	update( x, z ) {

		const S = this.spec;
		this.group.visible = Math.hypot( x - S.x, z - S.z ) < S.see;

	}

	draw() {

		const S = this.spec, canvas = this.canvas, h = this.rowH, w = canvas.width;
		const g = canvas.getContext( '2d' );
		g.clearRect( 0, 0, w, canvas.height );
		S.arms.forEach( ( arm, n ) => {

			g.save();
			g.translate( 0, n * h );
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

			g.restore();

		} );
		this.map.needsUpdate = true;

	}

}

// (M15) a hand-painted board, as the fingerposts' arms are: `lines` [ big, small ] in the hand font on both
// faces, paint and letters SIGNPOST's or its own, lit as they are (the scene's environment, `fill` times over:
// it's read in the shade). Its middle at the group's origin, its faces along x, out along +z and -z
//   const b = paintedBoard( { width, height, lines, paint, letters } ); scene.add( b )
export function paintedBoard( { width = 1.6, height = 0.4, thick = 0.035, lines = [ '', '' ], paint = SIGNPOST.paint, letters = SIGNPOST.letters, fill = SIGNPOST.fill } = {} ) {

	const group = new Group();
	group.name = 'PaintedBoard';
	const body = new MeshStandardMaterial( { color: new Color( paint ), roughness: 0.85 } );
	// (no page to paint on: under Node, the board alone)
	if ( typeof document === 'undefined' ) {

		group.add( new Mesh( new BoxGeometry( width, height, thick ), body ) );
		return group;

	}

	const canvas = document.createElement( 'canvas' );
	canvas.width = PX;
	canvas.height = Math.round( PX * height / width );
	const map = new CanvasTexture( canvas );
	map.colorSpace = SRGBColorSpace;
	map.anisotropy = 4;
	const face = new MeshStandardMaterial( { map, transparent: true, roughness: 0.85, depthWrite: false } );
	const materials = [ body, face ];
	const sync = ( renderer, scene ) => {

		for ( const m of materials ) {

			if ( m.envMap !== scene.environment ) {

				if ( ! m.envMap !== ! scene.environment ) m.needsUpdate = true;
				m.envMap = scene.environment;

			}

			m.envMapIntensity = scene.environmentIntensity * fill;

		}

	};
	group.add( new Mesh( new BoxGeometry( width, height, thick ), body ) );
	for ( const side of [ 1, - 1 ] ) {

		const m = new Mesh( new PlaneGeometry( width * 0.96, height * 0.92 ), face );
		m.position.z = side * ( thick / 2 + 0.002 );
		if ( side < 0 ) m.rotation.y = Math.PI;
		m.renderOrder = 2;
		group.add( m );

	}

	group.traverse( ( o ) => {

		if ( o.isMesh ) o.onBeforeRender = sync;

	} );
	const draw = () => {

		const g = canvas.getContext( '2d' ), w = canvas.width, h = canvas.height;
		g.clearRect( 0, 0, w, h );
		g.fillStyle = letters;
		g.textBaseline = 'middle';
		g.textAlign = 'center';
		g.font = `${ Math.round( h * 0.5 ) }px "Caveat Brush", "Comic Sans MS", cursive`;
		g.fillText( lines[ 0 ], w / 2, h * 0.36, w * 0.94 );
		g.globalAlpha = 0.9;
		g.font = `${ Math.round( h * 0.3 ) }px "Caveat Brush", "Comic Sans MS", cursive`;
		g.fillText( lines[ 1 ] || '', w / 2, h * 0.78, w * 0.92 );
		g.globalAlpha = 1;
		g.globalCompositeOperation = 'destination-out';
		for ( let i = 0; i < 50; i ++ ) {

			g.globalAlpha = 0.15 + ( i % 5 ) * 0.08;
			g.fillRect( ( i * 97 ) % w, ( i * 53 ) % h, 3 + ( i % 7 ), 2 + ( i % 3 ) );

		}

		g.globalCompositeOperation = 'source-over';
		g.globalAlpha = 1;
		map.needsUpdate = true;

	};
	draw();
	if ( document.fonts && document.fonts.load ) document.fonts.load( '40px "Caveat Brush"' ).then( draw ).catch( () => {} );
	return group;

}

