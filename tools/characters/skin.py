# skin.py <body colour map> <donor's body colour map> <out> : the body's skin made the donor's (for an avatar
# with another's head: build.sh's donor). The skin's found by its colour in each map (warm hue, some
# saturation, not too dark; clothes in greys, blacks and denims fall outside it), softened at its edges, and
# moved in Lab to the donor's skin's mean and spread (Reinhard's colour transfer): its texture and shading
# kept, its tone the donor's. Needs Pillow and numpy.
import sys
import numpy as np
from PIL import Image, ImageFilter


def srgb_to_lab( rgb ):

	c = rgb / 255.0
	c = np.where( c <= 0.04045, c / 12.92, ( ( c + 0.055 ) / 1.055 ) ** 2.4 )
	M = np.array( [ [ 0.4124, 0.3576, 0.1805 ], [ 0.2126, 0.7152, 0.0722 ], [ 0.0193, 0.1192, 0.9505 ] ] )
	xyz = c @ M.T / np.array( [ 0.95047, 1.0, 1.08883 ] )
	f = np.where( xyz > 0.008856, np.cbrt( xyz ), 7.787 * xyz + 16 / 116 )
	return np.stack( [ 116 * f[ ..., 1 ] - 16, 500 * ( f[ ..., 0 ] - f[ ..., 1 ] ), 200 * ( f[ ..., 1 ] - f[ ..., 2 ] ) ], -1 )


def lab_to_srgb( lab ):

	fy = ( lab[ ..., 0 ] + 16 ) / 116
	fx = fy + lab[ ..., 1 ] / 500
	fz = fy - lab[ ..., 2 ] / 200
	f = np.stack( [ fx, fy, fz ], -1 )
	xyz = np.where( f ** 3 > 0.008856, f ** 3, ( f - 16 / 116 ) / 7.787 ) * np.array( [ 0.95047, 1.0, 1.08883 ] )
	M = np.array( [ [ 3.2406, -1.5372, -0.4986 ], [ -0.9689, 1.8758, 0.0415 ], [ 0.0557, -0.2040, 1.0570 ] ] )
	c = np.clip( xyz @ M.T, 0, 1 )
	c = np.where( c <= 0.0031308, 12.92 * c, 1.055 * c ** ( 1 / 2.4 ) - 0.055 )
	return np.clip( c * 255, 0, 255 )


def skin_mask( rgb ):

	r, g, b = rgb[ ..., 0 ] / 255.0, rgb[ ..., 1 ] / 255.0, rgb[ ..., 2 ] / 255.0
	mx, mn = np.maximum( np.maximum( r, g ), b ), np.minimum( np.minimum( r, g ), b )
	sat = np.where( mx > 0, ( mx - mn ) / np.maximum( mx, 1e-6 ), 0 )
	# (skin: red over green over blue, a warm hue between red and yellow)
	warm = ( r >= g ) & ( g >= b * 0.9 ) & ( r - b > 0.08 )
	# (the palms and the backs of the hands paler and less saturated than the arms: less saturation asked of the
	# lighter skin)
	need = np.clip( 0.14 - ( mx - 0.45 ) * 0.2, 0.06, 0.14 )
	k = warm * np.clip( ( sat - need ) / 0.06, 0, 1 ) * np.clip( ( mx - 0.3 ) / 0.1, 0, 1 ) * np.clip( ( 0.85 - sat ) / 0.1, 0, 1 )
	return k


body = np.asarray( Image.open( sys.argv[ 1 ] ).convert( 'RGB' ), dtype = np.float64 )
donor = np.asarray( Image.open( sys.argv[ 2 ] ).convert( 'RGB' ), dtype = np.float64 )
mb, md = skin_mask( body ), skin_mask( donor )
lb, ld = srgb_to_lab( body ), srgb_to_lab( donor )
sel_b, sel_d = mb > 0.9, md > 0.9
mu_b, sd_b = lb[ sel_b ].mean( 0 ), lb[ sel_b ].std( 0 ) + 1e-6
mu_d, sd_d = ld[ sel_d ].mean( 0 ), ld[ sel_d ].std( 0 ) + 1e-6
moved = ( lb - mu_b ) / sd_b * sd_d + mu_d
soft = np.asarray( Image.fromarray( ( mb * 255 ).astype( np.uint8 ) ).filter( ImageFilter.GaussianBlur( 1.5 ) ), dtype = np.float64 )[ ..., None ] / 255.0
out = body * ( 1 - soft ) + lab_to_srgb( moved ) * soft
Image.fromarray( out.astype( np.uint8 ) ).save( sys.argv[ 3 ], quality = 90 )
print( 'skin: body L a b %.1f %.1f %.1f -> donor %.1f %.1f %.1f (%d%% of the map)' % ( *mu_b, *mu_d, round( sel_b.mean() * 100 ) ) )
