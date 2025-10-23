import { BackgroundManager } from './background-manager';
import '../shared/benchmark-debug';

const backgroundManager = new BackgroundManager();
backgroundManager.init();

// Expose background manager globally for debugging
const global = globalThis as { backgroundManager?: BackgroundManager };
global.backgroundManager = backgroundManager;
