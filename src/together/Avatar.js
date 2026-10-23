import { Group, Vector3, Quaternion, MathUtils } from '../engine/index.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { Character } from '../game/Character.js';
import { Figure } from './Figure.js';

// (Salt Life) Another player on the island: one of four islanders (Microsoft Rocketbox, as Joe and
// Marta: tools/characters/players.sh), the one they chose (in the cooler; it comes with their poses),
// or until they have, one picked from their id (lookOf: the same on every screen).
// Their clips: standing (idle), walking and running (matched to their speed), the rod held up in
// front (an umbrella's handle in Rocketbox), both hands on the wheel at the helm (a trolley's), a cheer
// and a wave. Swimming has no clip: the arms turn over and the legs kick, posed here on the idle, the
// body lying face down. Until their look has loaded (or if it doesn't) a stand-in figure (Figure.js).
//   const a = new Avatar( person );  scene.add( a.group );  a.look = name;  a.setLook( gltf )  (again to change)
//   a.pose( { mode, speed, rod, gun }, dt )   mode 'walk' | 'swim' | 'deck' | 'helm'; rod: holding one;
//                                        gun (Salt Life): swimming with a speargun
//   a.hand( out )                        the right hand (world): the rod's grip
//   a.once( 'wave_01' | 'cheer_01' )     a gesture, when standing
// Feet at the group's origin facing +Z.

export const LOOKS = [ 'player-m1', 'player-m2', 'player-f1', 'player-f2' ];
// (what each is, for choosing)
export const LOOK_NAMES = {
	'player-m1': 'Man · polo shirt and shorts', 'player-m2': 'Man · vest and shorts',
	'player-f1': 'Woman · vest top and denim shorts', 'player-f2': 'Woman · T-shirt and jeans',
};
// m/s the walk and run clips cover (Rocketbox's: ~1.2 m in 1.2 s, ~1.85 m in 0.83 s), and where one
// gives way to the other (the island's walking pace, 3 m/s, is a jog)
const WALK = 1.0, RUN = 2.2, JOG = 1.8;
const LIE = Math.PI * 0.46; // face down in the water
const CHEST = 1.3; // m above the feet: at the float point when swimming

export function lookOf( person ) {

	let h = 2166136261;
	for ( const ch of String( person.id ) ) h = Math.imul( h ^ ch.charCodeAt( 0 ), 16777619 );
	return LOOKS[ ( h >>> 0 ) % LOOKS.length ];

}

const _q1 = new Quaternion(), _q2 = new Quaternion(), _q3 = new Quaternion(), _axis = new Vector3(), _left = new Vector3();

// turn a bone by `angle` about a world axis (after the clip has posed it)
function turnBone( bone, axis, angle ) {

	bone.parent.getWorldQuaternion( _q1 );
	bone.getWorldQuaternion( _q2 );
	_q3.setFromAxisAngle( axis, angle ).multiply( _q2 );
	bone.quaternion.copy( _q1.invert().multiply( _q3 ) );
	bone.updateMatrixWorld( true );

}

export class Avatar {

	constructor( person ) {

		this.person = person;
		this.look = lookOf( person );
		this.group = new Group();
		this.group.name = 'Player:' + person.id;
		this.body = new Group(); // lies down in the water
		this.group.add( this.body );
		this.figure = new Figure( person );
		this.body.add( this.figure.group );
		this.character = null;
		this.bones = null;
		this._swim = 0;
		this._phase = 0;
		this._gesture = null;

	}

	// their look's glTF (shared by everyone with that look: the skin is cloned, the clips shared); again
	// when they choose another
	setLook( gltf, { shadows = false } = {} ) {

		if ( this.character ) {

			this.character.mixer.stopAllAction();
			this.body.remove( this.character.group );
			this.character = null;
			this._gesture = null;

		}

		const scene = cloneSkinned( gltf.scene );
		const c = this.character = new Character( { scene, animations: gltf.animations } );
		scene.traverse( ( o ) => {

			if ( o.isMesh ) {

				o.castShadow = shadows;
				o.frustumCulled = false; // (skinned: its bounds are the rest pose's)

			}

		} );
		const bone = ( re ) => {

			let found = null;
			scene.traverse( ( o ) => {

				if ( ! found && o.isBone && re.test( o.name ) ) found = o;

			} );
			return found;

		};

		this.bones = {
			hand: bone( /R_?Hand$/ ), handL: bone( /L_?Hand$/ ), armL: bone( /L_?UpperArm$/ ), armR: bone( /R_?UpperArm$/ ),
			thighL: bone( /L_?Thigh$/ ), thighR: bone( /R_?Thigh$/ ),
		};
		if ( this.figure ) {

			this.body.remove( this.figure.group );
			this.figure.dispose();
			this.figure = null;

		}

		this.body.add( scene );
		c.play( 'idle_neutral_01', { fade: 0, from: Math.random() * c.clipDuration( 'idle_neutral_01' ) } );
		c.onClipEnd = () => {

			this._gesture = null;

		};

	}

	// a gesture, when they're standing still on their feet
	once( name ) {

		const c = this.character;
		if ( ! c || this._still === false || ! c.clips.has( name ) ) return;
		this._gesture = name;
		c.play( name, { fade: 0.3, loop: false } );

	}

	// (Salt Life) gun: swimming with a speargun, held out ahead in the right hand
	pose( { mode, speed = 0, rod = false, gun = false }, dt ) {

		// lying face down in the water (the chest at the float point), upright otherwise
		this._swim += ( ( mode === 'swim' ? 1 : 0 ) - this._swim ) * ( 1 - Math.exp( - dt * 6 ) );
		const tilt = this._swim * LIE;
		this.body.rotation.x = tilt;
		this.body.position.set( 0, - CHEST * Math.cos( tilt ) * this._swim, - CHEST * Math.sin( tilt ) * this._swim );
		if ( ! this.character ) {

			this.figure.pose( { mode, speed, rod }, dt );
			return;

		}

		const c = this.character;
		let clip = 'idle_neutral_01', scale = 1, loop = true;
		this._still = mode !== 'swim' && mode !== 'helm' && speed < 0.25;
		if ( mode === 'helm' ) {

			clip = 'trolley_idle';
			loop = 'pingpong';

		} else if ( mode === 'swim' ) clip = 'idle_neutral_01';
		else if ( speed > JOG ) {

			clip = 'run_slow_01';
			scale = MathUtils.clamp( speed / RUN, 0.8, 2.2 );

		} else if ( speed >= 0.25 ) {

			clip = 'walk_neutral_01';
			scale = MathUtils.clamp( speed / WALK, 0.5, 1.9 );

		} else if ( rod ) {

			clip = 'umbrella_idle_01';
			loop = 'pingpong';

		}

		if ( this._gesture && ! this._still ) this._gesture = null;
		if ( ! this._gesture && c.current !== clip ) c.play( clip, { fade: 0.3, loop } );
		if ( c._action ) c._action.timeScale = this._gesture ? 1 : scale;
		c.update( dt );

		// the crawl: the arms turn over about the shoulders (the body's left-right axis), half a turn
		// apart; the legs flutter
		if ( this._swim > 0.5 && this.bones.armL ) {

			this._phase += dt * ( 2.2 + speed * 1.2 );
			this.group.updateMatrixWorld( true );
			_axis.set( 1, 0, 0 ).applyQuaternion( this.body.getWorldQuaternion( _q1 ) );
			const p = this._phase, B = this.bones;
			turnBone( B.armL, _axis, - ( p % ( Math.PI * 2 ) ) );
			// (with a speargun the right arm stays reached out ahead, the gun in its hand)
			turnBone( B.armR, _axis, gun ? - Math.PI : - ( ( p + Math.PI ) % ( Math.PI * 2 ) ) );
			if ( B.thighL ) turnBone( B.thighL, _axis, Math.sin( p * 2.6 ) * 0.3 );
			if ( B.thighR ) turnBone( B.thighR, _axis, - Math.sin( p * 2.6 ) * 0.3 );

		}

	}

	// the hand that holds the rod: the right, or standing with it held up (the umbrella's hold), the
	// raised one
	hand( out ) {

		if ( ! this.character || ! this.bones.hand ) return this.figure ? this.figure.hand( out ) : out.copy( this.group.position );
		this.group.updateMatrixWorld( true );
		const B = this.bones;
		B.hand.getWorldPosition( out );
		if ( B.handL && this.character.current === 'umbrella_idle_01' && B.handL.getWorldPosition( _left ).y > out.y ) out.copy( _left );
		return out;

	}

	dispose() {

		if ( this.figure ) this.figure.dispose();
		if ( this.character ) this.character.mixer.stopAllAction();

	}

}
