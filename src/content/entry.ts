import { contentManager } from './content-manager';
import { createLogger } from '../shared/logger';

const logger = createLogger('ContentEntry');

logger.info('🔴 Content script loaded, initializing...');
contentManager.init();
logger.info('🔴 Content manager init() called');
