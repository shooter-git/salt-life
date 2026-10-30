// (M15) Is the ground in the way? For what's behind the island's mountain: the village from the north shore is more than
// half of what a phone would draw there, for nothing. No three.js, for the tests under Node.
//   sightBlocked( heightAt, ex, ey, ez, tx, ty, tz, margin, step ) -> true if the ground stands over the line from the
//     eye to the target by `margin` m somewhere along it (sampled every `step` m, near the eye and the target left out)
//   hiddenBox( heightAt, ex, ey, ez, box, margin, step ) -> true if it is for all of a box's top: its corners, its edges'
//     middles and its middle (box: { min: { x, z }, max: { x, y, z } }). Its top's the last of it to go.

const END = 12; // m: not counted at either end of the line (what's close by isn't the mountain)

export function sightBlocked( heightAt, ex, ey, ez, tx, ty, tz, margin = 3, step = 24 ) {

	const dx = tx - ex, dy = ty - ey, dz = tz - ez, L = Math.hypot( dx, dz );
	if ( L < END * 2 ) return false;
	const n = Math.ceil( ( L - END * 2 ) / step );
	for ( let i = 0; i <= n; i ++ ) {

		const f = ( END + ( L - END * 2 ) * i / n ) / L;
		if ( heightAt( ex + dx * f, ez + dz * f ) > ey + dy * f + margin ) return true;

	}

	return false;

}

export function hiddenBox( heightAt, ex, ey, ez, box, margin = 3, step = 24 ) {

	const { min, max } = box;
	for ( let i = 0; i < 3; i ++ ) for ( let j = 0; j < 3; j ++ ) {

		const x = min.x + ( max.x - min.x ) * i / 2, z = min.z + ( max.z - min.z ) * j / 2;
		if ( ! sightBlocked( heightAt, ex, ey, ez, x, max.y, z, margin, step ) ) return false;

	}

	return true;

}
