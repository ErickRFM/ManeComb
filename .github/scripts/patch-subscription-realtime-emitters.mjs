import { readFileSync, writeFileSync } from 'node:fs';

function replaceExactlyOnce(source, filePath, label, before, after) {
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`${filePath} ${label}: source snippet not found`);
  if (source.indexOf(before, first + before.length) >= 0) {
    throw new Error(`${filePath} ${label}: source snippet appears more than once`);
  }
  return source.slice(0, first) + after + source.slice(first + before.length);
}

function patchFile(filePath, replacements) {
  let source = readFileSync(filePath, 'utf8');
  for (const [label, before, after] of replacements) {
    source = replaceExactlyOnce(source, filePath, label, before, after);
  }
  writeFileSync(filePath, source);
}

const accountPath = 'backend/src/modules/account/routes.js';
let accountSource = readFileSync(accountPath, 'utf8');
accountSource = replaceExactlyOnce(
  accountSource,
  accountPath,
  'subscription realtime import',
  `const {\n  buildInvoices,\n  buildSubscription,\n  enrichOrdersForUser,\n  getOrganizationId,\n  pickActiveOrder\n} = require("../../services/portal-account");\n`,
  `const {\n  buildInvoices,\n  buildSubscription,\n  enrichOrdersForUser,\n  getOrganizationId,\n  pickActiveOrder\n} = require("../../services/portal-account");\nconst {\n  SUBSCRIPTION_UPDATE_REASONS,\n  emitSubscriptionUpdated\n} = require("../../services/subscription-realtime");\n`
);
accountSource = replaceExactlyOnce(
  accountSource,
  accountPath,
  'remove duplicate account emitter',
  `function emitAccountEvent(req, eventName, payload) {\n  const organizationId = getOrganizationId(req.user);\n\n  if (organizationId) {\n    req.app.locals.io?.to(\`org:\${organizationId}\`).emit(eventName, payload);\n  }\n\n  req.app.locals.io?.to(\`user:\${req.user.id}\`).emit(eventName, payload);\n}\n\n`,
  ``
);
const accountSubscriptionBlock = `  emitAccountEvent(req, "subscription:updated", {\n    subscription,\n    organizationId: getOrganizationId(req.user),\n    updatedAt: new Date().toISOString()\n  });`;
const firstAccountEvent = accountSource.indexOf(accountSubscriptionBlock);
const secondAccountEvent = accountSource.indexOf(
  accountSubscriptionBlock,
  firstAccountEvent + accountSubscriptionBlock.length
);
const thirdAccountEvent = secondAccountEvent >= 0
  ? accountSource.indexOf(accountSubscriptionBlock, secondAccountEvent + accountSubscriptionBlock.length)
  : -1;
if (firstAccountEvent < 0 || secondAccountEvent < 0 || thirdAccountEvent >= 0) {
  throw new Error(`${accountPath} expected exactly two account subscription updates`);
}
const planChangeReplacement = `  emitSubscriptionUpdated({\n    io: req.app.locals.io,\n    organizationId: getOrganizationId(req.user),\n    reason: SUBSCRIPTION_UPDATE_REASONS.PLAN_CHANGED\n  });`;
accountSource =
  accountSource.slice(0, firstAccountEvent) +
  planChangeReplacement +
  accountSource.slice(firstAccountEvent + accountSubscriptionBlock.length);
const cancellationIndex = accountSource.indexOf(accountSubscriptionBlock);
if (cancellationIndex < 0 || accountSource.indexOf(accountSubscriptionBlock, cancellationIndex + accountSubscriptionBlock.length) >= 0) {
  throw new Error(`${accountPath} cancellation subscription update is not unique after plan replacement`);
}
const cancellationReplacement = `  emitSubscriptionUpdated({\n    io: req.app.locals.io,\n    organizationId: getOrganizationId(req.user),\n    reason: SUBSCRIPTION_UPDATE_REASONS.SUBSCRIPTION_CANCELLED\n  });`;
accountSource =
  accountSource.slice(0, cancellationIndex) +
  cancellationReplacement +
  accountSource.slice(cancellationIndex + accountSubscriptionBlock.length);
writeFileSync(accountPath, accountSource);

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
