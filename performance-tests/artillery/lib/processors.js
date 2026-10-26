// performance-tests/artillery/lib/processors.js
//
// Custom functions available to every scenario as {{ fnName() }}.
// Loaded through `config.processor`. CommonJS module.
//
// Nothing here holds a secret: every value is either derived at runtime or
// read from the environment by the caller.

const crypto = require('crypto');

module.exports = {
  // 64 hex characters, shaped exactly like a real reset token but with zero
  // chance of matching one. Used to probe the confirm endpoint.
  invalidResetToken() {
    return crypto.randomBytes(32).toString('hex');
  },

  // Unique title for the write scenarios so created pastes are identifiable.
  uniqueTitle() {
    return `artillery-loadtest-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  },

  // Throwaway address on the RFC 6761 `.invalid` TLD - guaranteed not to
  // resolve, so no real mailbox can ever receive a reset mail.
  throwawayEmail() {
    return `artillery-probe-${Math.floor(Math.random() * 1e9)}@example.invalid`;
  },

  // Random page index for discovery scraping.
  randomPage(max) {
    return String(Math.floor(Math.random() * (Number(max) || 1)));
  },

  // Reports how far the view counter moved between the before/after probes.
  // Called as {{ viewDelta() }} from the `after:` section.
  viewDelta(args, requestParams, context, ee, next) {
    const ctx =
      (context && context.vars)
        ? context
        : (requestParams && requestParams.context) || {};
    const vars = ctx.vars || {};
    const initial = Number(vars.initial_views || 0);
    const final = Number(vars.final_views || 0);
    return String(final - initial);
  },
};
