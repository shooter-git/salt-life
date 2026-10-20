import { defineConfig } from 'vite';

// For `pnpm dev` and a local `pnpm build` only: All the Spaces ignores this file and builds the
// creation with its own fixed settings, linking its own copy of the SDK. These match them, so a
// local build behaves like the published one.
export default defineConfig( {
	base: './',
	resolve: {
		// The SDK is linked from a sibling All the Spaces checkout: use this project's three.
		dedupe: [ 'three', '@allthespaces/portal', '@allthespaces/bridge-protocol' ],
	},
	server: {
		host: '127.0.0.1',
		port: 5189,
		fs: { allow: [ '.', '../all-the-spaces/packages' ] },
	},
	build: {
		target: 'es2022',
		modulePreload: { polyfill: false },
		assetsInlineLimit: 0,
		chunkSizeWarningLimit: 8000,
	},
} );
