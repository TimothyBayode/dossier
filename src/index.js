/**
 * Entry points the manifest points at.
 *
 * `resolver` answers the Custom UI over the Forge bridge. `rovo` is the handler
 * behind every `action` module, which is also exactly what the Rovo agent and
 * the MCP server call. Both funnel into the same service functions, so the MCP
 * tool, the agent and the panel can never drift into three different answers.
 *
 * The `rovo` handlers return markdown strings: that is what an MCP client wants
 * to read, and what the agent can quote.
 */

import * as service from './service/dossier.js';

export async function resolver(req) {
  const { payload = {}, context = {} } = req || {};
  try {
    switch (payload.action) {
      case 'compile':
        return { ok: true, ...(await service.compile({ context, input: payload.input || {} })) };
      case 'related':
        return { ok: true, ...(await service.related({ context, input: payload.input || {} })) };
      case 'owners':
        return { ok: true, ...(await service.owners({ context, input: payload.input || {} })) };
      case 'changes':
        return { ok: true, ...(await service.changes({ context, input: payload.input || {} })) };
      case 'publish':
        return { ok: true, ...(await service.publish({ context, input: payload.input || {} })) };
      default:
        return { ok: false, error: `unknown action: ${payload.action || '(none)'}` };
    }
  } catch (error) {
    // The iframe gets a readable sentence, not a stack trace.
    return { ok: false, error: error.message || 'something went wrong' };
  }
}

export async function rovo(payload = {}, context = {}) {
  try {
    switch (payload.__actionKey) {
      case 'compile-dossier': {
        const result = await service.compile({ context, input: payload });
        return result.markdown;
      }
      case 'find-related': {
        const result = await service.related({ context, input: payload });
        return result.markdown;
      }
      case 'find-owners': {
        const result = await service.owners({ context, input: payload });
        return result.markdown;
      }
      case 'what-changed': {
        const result = await service.changes({ context, input: payload });
        return result.markdown;
      }
      case 'publish-dossier': {
        const result = await service.publish({ context, input: payload });
        return `Posted to ${result.issueKey} (comment ${result.commentId ?? 'unconfirmed'}). ${
          result.droppedCount ? `${result.droppedCount} facts were left out for budget.` : 'Nothing was left out.'
        }`;
      }
      default:
        return `Unknown action ${payload.__actionKey || '(none)'}.`;
    }
  } catch (error) {
    return `That failed and changed nothing: ${error.message || 'something went wrong'}`;
  }
}
