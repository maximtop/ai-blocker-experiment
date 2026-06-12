import { describe, expect, it, vi } from 'vitest';
import { MessageHandler } from '../../src/background/message-handler';

const TEST_IMAGE_BYTES = [97, 100];
const TEST_IMAGE_URL = 'file:///tmp/ad.png';
const TEST_MIME_TYPE = 'image/png';
const TEST_BASE64 = 'YWQ=';
const TEST_CONTENT_TYPE_HEADER = 'content-type';

describe('MessageHandler image resource fetch', () => {
    it('should fetch an image URL and return a data URL', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => ({
            arrayBuffer: async () => Uint8Array.from(TEST_IMAGE_BYTES).buffer,
            headers: new Headers({ [TEST_CONTENT_TYPE_HEADER]: TEST_MIME_TYPE }),
            ok: true,
        })));

        const result = await MessageHandler.fetchImageAsDataUrl(TEST_IMAGE_URL);

        expect(result).toEqual({
            dataUrl: `data:${TEST_MIME_TYPE};base64,${TEST_BASE64}`,
            success: true,
        });
    });
});
