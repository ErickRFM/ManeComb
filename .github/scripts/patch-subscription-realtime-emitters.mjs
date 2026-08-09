import { readFileSync, writeFileSync } from 'node:fs';

function patchFile(filePath, replacements) {
  let source = readFileSync(filePath, 'utf8');
  for (const [label, before, after] of replacements) {
    const first = source.indexOf(before);
    if (first < 0) throw new Error(`${filePath} ${label}: source snippet not found`);
    if (source.indexOf(before, first + before.length) >= 0) {
      throw new Error(`${filePath} ${label}: source snippet appears more than once`);
    }
    source = source.slice(0, first) + after + source.slice(first + before.length);
  }
  writeFileSync(filePath, source);
}

patchFile('backend/src/modules/account/routes.js', [
  [
    'subscription realtime import',
    `const {\n  buildInvoices,\n  buildSubscription,\n  enrichOrdersForUser,\n  getOrganizationId,\n  pickActiveOrder\n} = require("../../services/portal-account");\n`,
    `const {\n  buildInvoices,\n  buildSubscription,\n  enrichOrdersForUser,\n  getOrganizationId,\n  pickActiveOrder\n} = require("../../services/portal-account");\nconst {\n  SUBSCRIPTION_UPDATE_REASONS,\n  emitSubscriptionUpdated\n} = require("../../services/subscription-realtime");\n`
  ],
  [
    'remove duplicate account emitter',
    `function emitAccountEvent(req, eventName, payload) {\n  const organizationId = getOrganizationId(req.user);\n\n  if (organizationId) {\n    req.app.locals.io?.to(\`org:\${organizationId}\`).emit(eventName, payload);\n  }\n\n  req.app.locals.io?.to(\`user:\${req.user.id}\`).emit(eventName, payload);\n}\n\n`,
    ``
  ],
  [
    'plan change invalidation',
    `  emitAccountEvent(req, "subscription:updated", {\n    subscription,\n    organizationId: getOrganizationId(req.user),\n    updatedAt: new Date().toISOString()\n  });`,
    `  emitSubscriptionUpdated({\n    io: req.app.locals.io,\n    organizationId: getOrganizationId(req.user),\n    reason: SUBSCRIPTION_UPDATE_REASONS.PLAN_CHANGED\n  });`
  ],
  [
    'cancellation invalidation',
    `  emitAccountEvent(req, "subscription:updated", {\n    subscription,\n    organizationId: getOrganizationId(req.user),\n    updatedAt: new Date().toISOString()\n  });`,
    `  emitSubscriptionUpdated({\n    io: req.app.locals.io,\n    organizationId: getOrganizationId(req.user),\n    reason: SUBSCRIPTION_UPDATE_REASONS.SUBSCRIPTION_CANCELLED\n  });`
  ]
]);

patchFile('backend/src/modules/commercial/routes.js', [
  [
    'replace portal subscription import',
    `const { buildSubscription } = require("../../services/portal-account");`,
    `const {\n  SUBSCRIPTION_UPDATE_REASONS,\n  emitSubscriptionUpdated\n} = require("../../services/subscription-realtime");`
  ],
  [
    'commercial subscription helper',
    `function emitSubscriptionUpdate(req, order) {\n  const organizationId = String(order?.organizationId || order?.organizationSlug || "").trim();\n\n  if (!organizationId) {\n    return;\n  }\n\n  req.app.locals.io?.to(\`org:\${organizationId}\`).emit("subscription:updated", {\n    organizationId,\n    subscription: buildSubscription(order),\n    updatedAt: new Date().toISOString()\n  });\n}\n`,
    `function emitSubscriptionUpdate(req, order) {\n  const organizationId = String(order?.organizationId || order?.organizationSlug || "").trim();\n\n  if (!organizationId) {\n    return;\n  }\n\n  emitSubscriptionUpdated({\n    io: req.app.locals.io,\n    organizationId,\n    reason: SUBSCRIPTION_UPDATE_REASONS.PAYMENT_CONFIRMED\n  });\n}\n`
  ]
]);

patchFile('backend/src/modules/platform/manual-payment-routes.js', [
  [
    'replace buildSubscription import',
    `const { buildSubscription } = require("../../services/portal-account");`,
    `const {\n  SUBSCRIPTION_UPDATE_REASONS,\n  emitSubscriptionUpdated\n} = require("../../services/subscription-realtime");`
  ],
  [
    'remove broad subscription from detailed manual payment event',
    `    req.app.locals.io?.to(\`org:\${organizationId}\`).emit("subscription:updated", {\n      organizationId,\n      subscription: buildSubscription(order),\n      updatedAt\n    });\n`,
    ``
  ],
  [
    'emit invalidation only after approval',
    `      emitManualPaymentUpdate(req, order, evidence);\n      return res.json({`,
    `      emitManualPaymentUpdate(req, order, evidence);\n      if (decision === "approve") {\n        emitSubscriptionUpdated({\n          io: req.app.locals.io,\n          organizationId: order.organizationId,\n          reason: SUBSCRIPTION_UPDATE_REASONS.MANUAL_PAYMENT_APPROVED\n        });\n      }\n      return res.json({`
  ]
]);

console.log('ok - subscription realtime emitters migrated to minimal invalidation service');
