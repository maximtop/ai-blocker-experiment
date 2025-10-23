import type { MessageMap } from '../background/message-handler';

/**
 * Helper type to extract response type from message
 */
type ResponseForMessage<M> = M extends { action: infer A }
    ? A extends keyof MessageMap
        ? MessageMap[A]['response']
        : never
    : never;

/**
 * Messaging class for chrome extension communication
 */
export class Messaging {
    /**
     * Send message to runtime and return promise with type-safe response
     * @param message Message object to send
     * @returns Promise that resolves with typed response based on action
     */
    static sendMessage<M extends MessageMap[keyof MessageMap]['message']>(
        message: M,
    ): Promise<ResponseForMessage<M>> {
        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage(message, (response) => {
                if (chrome.runtime.lastError) {
                    const error = chrome.runtime.lastError.message;
                    reject(new Error(error));
                    return;
                }
                resolve(response);
            });
        }) as Promise<ResponseForMessage<M>>;
    }
}
