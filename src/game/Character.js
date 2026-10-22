import { AnimationMixer, LoopOnce, LoopPingPong, LoopRepeat } from '../engine/index.js';

// A skinned, animated character from a glTF (the Rocketbox vendors: tools/characters), behind the
// interface Tidewater's engine gave it (its SkinnedModel): play a clip with a crossfade, a clip's
// length, update, hold (the pose stays), onClipEnd when a one-shot clip has played.
//   const c = new Character( gltf );  parent.add( c.group );  c.play( 'idle_neutral_01' );  c.update( dt )
export class Character {

	// clips: the names of the clips to keep (all if null; the others' keyframes are let go)
	constructor( gltf, { clips = null } = {} ) {

		this.group = gltf.scene;
		this.mixer = new AnimationMixer( this.group );
		this.clips = new Map( gltf.animations.filter( ( c ) => ! clips || clips.includes( c.name ) ).map( ( c ) => [ c.name, c ] ) );
		this.current = null;
		this.onClipEnd = null;
		this._action = null;
		this.materials = [];
		this.group.traverse( ( o ) => {

			if ( ! o.isMesh ) return;
			o.castShadow = true;
			for ( const m of [ o.material ].flat() ) {

				// (the hair and lashes: see-through and two-sided, drawn once rather than back then front)
				if ( m.transparent ) m.forceSinglePass = true;
				if ( ! this.materials.includes( m ) ) this.materials.push( m );

			}

		} );
		this.mixer.addEventListener( 'finished', ( e ) => {

			if ( e.action === this._action && this.onClipEnd ) this.onClipEnd( this.current );

		} );

	}

	clipDuration( name ) {

		const clip = this.clips.get( name );
		return clip ? clip.duration : 0;

	}

	// fade: seconds to blend from the clip playing; loop: false plays it once and holds its last pose
	// (then onClipEnd), 'pingpong' back and forth (a hold cut from a longer take: no seam); from: where
	// in the clip to start (seconds)
	play( name, { fade = 0.3, loop = true, from = 0 } = {} ) {

		const clip = this.clips.get( name );
		if ( ! clip ) return;
		const next = this.mixer.clipAction( clip ), prev = this._action;
		next.reset();
		next.setLoop( loop === 'pingpong' ? LoopPingPong : loop ? LoopRepeat : LoopOnce, Infinity );
		next.clampWhenFinished = ! loop;
		next.time = from;
		next.play();
		if ( prev && prev !== next ) {

			if ( fade > 0 ) prev.crossFadeTo( next, fade, false );
			else prev.stop();

		}

		this._action = next;
		this.current = name;

	}

	// (far away: not updated, so the pose holds)
	hold() {}

	update( dt ) {

		this.mixer.update( dt );

	}

	// the textures, to upload before the first draw
	textures() {

		const out = new Set();
		for ( const m of this.materials ) for ( const k of [ 'map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'alphaMap', 'emissiveMap' ] ) if ( m[ k ] ) out.add( m[ k ] );
		return [ ...out ];

	}

}
