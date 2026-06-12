import { describe, expect, it, vi } from 'vitest';
import { MessageHandler } from '../../src/background/message-handler';

const TEST_IMAGE_BYTES = [97, 100];
const TEST_IMAGE_URL = 'https://example.com/ad.png';
const TEST_FILE_IMAGE_URL = 'file:///tmp/ad.png';
const TEST_FILE_PAGE_URL = 'file:///tmp/page.html';
const TEST_MIME_TYPE = 'image/png';
const TEST_BASE64 = 'YWQ=';
const TEST_CONTENT_TYPE_HEADER = 'content-type';
const TEST_LARGE_IMAGE_BYTE_LENGTH = 10000;
const TEST_TEXT_MIME_TYPE = 'text/html';

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

    it('should reject unsupported image URL protocols before fetching', async () => {
        const fetch = vi.fn();
        vi.stubGlobal('fetch', fetch);

        const result = await MessageHandler.fetchImageAsDataUrl(
            TEST_FILE_IMAGE_URL,
        );

        expect(result).toEqual({
            error: 'Unsupported image URL protocol',
            success: false,
        });
        expect(fetch).not.toHaveBeenCalled();
    });

    it('should allow file image URLs for file pages', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => ({
            arrayBuffer: async () => Uint8Array.from(TEST_IMAGE_BYTES).buffer,
            headers: new Headers({ [TEST_CONTENT_TYPE_HEADER]: TEST_MIME_TYPE }),
            ok: true,
        })));

        const result = await MessageHandler.fetchImageAsDataUrl(
            TEST_FILE_IMAGE_URL,
            TEST_FILE_PAGE_URL,
        );

        expect(result).toEqual({
            dataUrl: `data:${TEST_MIME_TYPE};base64,${TEST_BASE64}`,
            success: true,
        });
    });

    it('should reject fetched resources that advertise non-image content', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => ({
            arrayBuffer: async () => Uint8Array.from(TEST_IMAGE_BYTES).buffer,
            headers: new Headers({
                [TEST_CONTENT_TYPE_HEADER]: TEST_TEXT_MIME_TYPE,
            }),
            ok: true,
        })));

        const result = await MessageHandler.fetchImageAsDataUrl(TEST_IMAGE_URL);

        expect(result).toEqual({
            error: `Unsupported image type: ${TEST_TEXT_MIME_TYPE}`,
            success: false,
        });
    });

    it('should encode large images in chunks', async () => {
        const bytes = Uint8Array.from(
            { length: TEST_LARGE_IMAGE_BYTE_LENGTH },
            (_value, index) => index % 256,
        );
        vi.stubGlobal('fetch', vi.fn(async () => ({
            arrayBuffer: async () => bytes.buffer,
            headers: new Headers({ [TEST_CONTENT_TYPE_HEADER]: TEST_MIME_TYPE }),
            ok: true,
        })));
        const expectedBase64 = Buffer.from(bytes).toString('base64');

        const result = await MessageHandler.fetchImageAsDataUrl(TEST_IMAGE_URL);

        expect(result).toEqual({
            dataUrl: `data:${TEST_MIME_TYPE};base64,${expectedBase64}`,
            success: true,
        });
    });
});
