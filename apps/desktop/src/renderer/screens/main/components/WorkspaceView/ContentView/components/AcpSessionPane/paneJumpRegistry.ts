/**
 * Cross-slot bridge for "jump to last user message" between the pane's
 * toolbar (rendered by the pane system as a header slot) and its body
 * (`AcpSessionPane`, which owns the timeline ref).
 *
 * The toolbar and the body are rendered as sibling slots by the pane system,
 * so they cannot share a React ref directly. This tiny module-level registry
 * lets the body publish its jump handler keyed by session id, and lets the
 * toolbar look it up.
 */

type JumpHandler = () => void;

const handlers = new Map<string, JumpHandler>();

export function registerJumpHandler(
	sessionId: string,
	handler: JumpHandler,
): () => void {
	handlers.set(sessionId, handler);
	return () => {
		if (handlers.get(sessionId) === handler) {
			handlers.delete(sessionId);
		}
	};
}

export function invokeJumpHandler(sessionId: string): boolean {
	const handler = handlers.get(sessionId);
	if (!handler) return false;
	handler();
	return true;
}
