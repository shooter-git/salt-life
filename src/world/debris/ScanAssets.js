// The photoscanned debris (ScannedDebris), on its own for the placement (DebrisPlacement), which
// also runs in a worker.
export const SCAN_ASSETS = [ 'dead_quiver_trunk', 'dead_quiver_branch_02', 'dead_quiver_branch_01', 'lambis_shell' ];
export const SCAN = { TRUNK: 0, BRANCH_A: 1, BRANCH_B: 2, SHELL: 3 };
// size (m) of each asset after orientation (long axis x, up y), from the Blender export
export const SCAN_SIZE = [ [ 1.994, 0.306, 0.268 ], [ 0.526, 0.287, 0.201 ], [ 0.439, 0.255, 0.227 ], [ 0.139, 0.047, 0.075 ] ];
