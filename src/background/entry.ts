import { BackgroundManager } from './background-manager';
import '../shared/benchmark-debug';
import { createLogger, setDebugLogging } from '../shared/logger';

// Enable debug logging for background script (always on for debugging)
setDebugLogging(true);

const logger = createLogger('BackgroundEntry');

// Create background manager instance
logger.info('🟢 Service worker starting...');
const backgroundManager = new BackgroundManager();
logger.info('🟢 Background manager instance created');

// Synchronous initialization - register listeners immediately
backgroundManager.syncInit();

// Asynchronous initialization - initialize services
backgroundManager.init().catch((error) => {
    logger.error('🟢 Background manager initialization failed', error);
});

// Expose background manager globally for debugging
const global = globalThis as { backgroundManager?: BackgroundManager };
global.backgroundManager = backgroundManager;
logger.info('🟢 Background manager exposed globally');
