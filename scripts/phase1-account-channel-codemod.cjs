const fs = require('node:fs');

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function write(file, content) {
  fs.writeFileSync(file, content, 'utf8');
}

function replaceExact(content, before, after, label) {
  const first = content.indexOf(before);
  const last = content.lastIndexOf(before);

  if (first < 0) {
    throw new Error(`${label}: no se encontro el contrato esperado`);
  }

  if (first !== last) {
    throw new Error(`${label}: el contrato esperado aparece mas de una vez`);
  }

  return content.slice(0, first) + after + content.slice(first + before.length);
}

function replaceRegex(content, regex, replacement, label) {
  const matches = [...content.matchAll(regex)];

  if (matches.length !== 1) {
    throw new Error(`${label}: se esperaban 1 coincidencia y se encontraron ${matches.length}`);
  }

  return content.replace(regex, replacement);
}

function patch(file, transform) {
  const before = read(file);
  const after = transform(before);

  if (after === before) {
    throw new Error(`${file}: el codemod no produjo cambios`);
  }

  write(file, after);
  console.log(`patched ${file}`);
}

patch('backend/src/modules/auth/routes.js', (source) => {
  let next = replaceExact(
    source,
`    metadata: {
      canAccessMobile: authContext?.canAccessMobile ?? null,
      email: user?.email || null,
      mobileBlockReason: authContext?.mobileBlockReason || null,
      source,
      subscriptionIsActive: authContext?.subscription?.isActive ?? null,
      subscriptionStatus: authContext?.subscription?.status || null,
      tenantStatus: authContext?.tenant?.status || null
    },
    module: "Auth",
    organizationId: user?.organizationId,
    status: authContext?.canAccessMobile ? "allowed" : "blocked",`,
`    metadata: {
      accountChannel: authContext?.accountChannel || null,
      accountChannelReason: authContext?.accountChannelReason || null,
      canAccessMobile: authContext?.canAccessMobile ?? null,
      canAccessPortal: authContext?.canAccessPortal ?? null,
      canUseOperations: authContext?.canUseOperations ?? null,
      email: user?.email || null,
      mobileBlockReason: authContext?.mobileBlockReason || null,
      operationalBlockReason: authContext?.operationalBlockReason || null,
      productRoute: authContext?.productRoute || authContext?.route || null,
      source,
      subscriptionIsActive: authContext?.subscription?.isActive ?? null,
      subscriptionStatus: authContext?.subscription?.status || null,
      tenantStatus: authContext?.tenant?.status || null
    },
    module: "Auth",
    organizationId: user?.organizationId,
    status: authContext?.accountChannel === "blocked" ? "blocked" : "resolved",`,
    'auth log decision'
  );

  next = replaceExact(
    next,
`function buildAuthContextPayload(authContext) {
  return {
    authContext,
    canAccessMobile: authContext.canAccessMobile,
    mobileBlockReason: authContext.mobileBlockReason,
    tenant: authContext.tenant,
    subscription: authContext.subscription,
    onboarding: authContext.onboarding,
    postLoginRoute: authContext.route
  };
}`,
`function buildAuthContextPayload(authContext) {
  return {
    authContext,
    accountChannel: authContext.accountChannel,
    accountChannelReason: authContext.accountChannelReason,
    canAccessMobile: authContext.canAccessMobile,
    canAccessPortal: authContext.canAccessPortal,
    canUseOperations: authContext.canUseOperations,
    mobileBlockReason: authContext.mobileBlockReason,
    operationalBlockReason: authContext.operationalBlockReason,
    tenant: authContext.tenant,
    subscription: authContext.subscription,
    onboarding: authContext.onboarding,
    postLoginDestination: authContext.productDestination || authContext.destination,
    postLoginRoute: authContext.productRoute || authContext.route,
    productDestination: authContext.productDestination || authContext.destination,
    productRoute: authContext.productRoute || authContext.route
  };
}`,
    'auth response payload'
  );

  return next;
});

patch('backend/src/modules/activation-keys/routes.js', (source) => replaceExact(
  source,
`    user,
    authContext,
    canAccessMobile: authContext.canAccessMobile,
    mobileBlockReason: authContext.mobileBlockReason,
    tenant: authContext.tenant,
    subscription: authContext.subscription,
    onboarding: authContext.onboarding,
    postLoginRoute: authContext.route,`,
`    user,
    authContext,
    accountChannel: authContext.accountChannel,
    accountChannelReason: authContext.accountChannelReason,
    canAccessMobile: authContext.canAccessMobile,
    canAccessPortal: authContext.canAccessPortal,
    canUseOperations: authContext.canUseOperations,
    mobileBlockReason: authContext.mobileBlockReason,
    operationalBlockReason: authContext.operationalBlockReason,
    tenant: authContext.tenant,
    subscription: authContext.subscription,
    onboarding: authContext.onboarding,
    postLoginDestination: authContext.productDestination || authContext.destination,
    postLoginRoute: authContext.productRoute || authContext.route,
    productDestination: authContext.productDestination || authContext.destination,
    productRoute: authContext.productRoute || authContext.route,`,
  'driver activation auth response'
));

patch('mobile/src/store/root-store.ts', (source) => replaceExact(
  source,
`function getAuthContextFromPayload(
  payload: Partial<LoginResult & SessionResult> | null | undefined
): AuthRoutingContext | null {
  if (!payload) {
    return null;
  }

  if (payload.authContext) {
    const canAccessMobile = payload.canAccessMobile ?? payload.authContext.canAccessMobile;
    const mobileBlockReason: AuthRoutingContext['mobileBlockReason'] =
      payload.mobileBlockReason ??
      payload.authContext.mobileBlockReason ??
      (canAccessMobile === false ? 'sync_error' : null);

    return {
      ...payload.authContext,
      canAccessMobile,
      canUseOperations: canAccessMobile === true,
      destination: canAccessMobile === true
        ? 'HomeOperativo'
        : canAccessMobile === false
          ? 'PlanBlocked'
          : 'SyncError',
      mobileBlockReason,
      route: canAccessMobile === true
        ? '/mapa'
        : canAccessMobile === false
          ? '/plan-blocked'
          : '/sync-error',
    };
  }

  if (typeof payload.canAccessMobile === 'boolean') {
    const canAccessMobile = payload.canAccessMobile === true;
    const mobileBlockReason: AuthRoutingContext['mobileBlockReason'] =
      payload.mobileBlockReason ?? (canAccessMobile ? null : 'sync_error');

    return {
      canAccessMobile,
      canUseOperations: canAccessMobile,
      destination: canAccessMobile ? 'HomeOperativo' : 'PlanBlocked',
      mobileBlockReason,
      onboarding: payload.onboarding || null,
      route: canAccessMobile ? '/mapa' : '/plan-blocked',
      subscription: payload.subscription || null,
      tenant: payload.tenant || null,
    };
  }

  return null;
}

function shouldRefreshOperationalData(
  authContext: AuthRoutingContext | null | undefined,
  user: User | null | undefined
) {
  if (!user) {
    return false;
  }

  if (authContext) {
    return authContext.canAccessMobile === true;
  }

  return false;
}`,
`function getAuthContextFromPayload(
  payload: Partial<LoginResult & SessionResult> | null | undefined
): AuthRoutingContext | null {
  if (!payload) {
    return null;
  }

  if (payload.authContext) {
    const canAccessMobile = payload.authContext.canAccessMobile ?? payload.canAccessMobile;
    const mobileBlockReason: AuthRoutingContext['mobileBlockReason'] =
      payload.authContext.mobileBlockReason ??
      payload.mobileBlockReason ??
      (canAccessMobile === false ? 'sync_error' : null);

    return {
      ...payload.authContext,
      accountChannel:
        payload.authContext.accountChannel ??
        payload.accountChannel ??
        payload.user?.accountChannel ??
        payload.profile?.user?.accountChannel,
      accountChannelReason:
        payload.authContext.accountChannelReason ??
        payload.accountChannelReason ??
        payload.user?.accountChannelReason ??
        payload.profile?.user?.accountChannelReason ??
        null,
      canAccessMobile,
      canAccessPortal:
        payload.authContext.canAccessPortal ?? payload.canAccessPortal ?? false,
      canUseOperations:
        payload.authContext.canUseOperations ?? payload.canUseOperations ?? false,
      mobileBlockReason,
      operationalBlockReason:
        payload.authContext.operationalBlockReason ??
        payload.operationalBlockReason ??
        null,
      productDestination:
        payload.authContext.productDestination ??
        payload.productDestination ??
        payload.authContext.destination,
      productRoute:
        payload.authContext.productRoute ??
        payload.productRoute ??
        payload.postLoginRoute ??
        payload.authContext.route,
    };
  }

  if (typeof payload.canAccessMobile === 'boolean') {
    const canAccessMobile = payload.canAccessMobile === true;
    const accountChannel =
      payload.accountChannel ??
      payload.user?.accountChannel ??
      payload.profile?.user?.accountChannel ??
      (canAccessMobile ? 'mobile_operations' : undefined);
    const mobileBlockReason: AuthRoutingContext['mobileBlockReason'] =
      payload.mobileBlockReason ?? (canAccessMobile ? null : 'sync_error');

    return {
      accountChannel,
      accountChannelReason: payload.accountChannelReason ?? null,
      canAccessMobile,
      canAccessPortal: payload.canAccessPortal ?? accountChannel === 'company_portal',
      canUseOperations: payload.canUseOperations ?? canAccessMobile,
      destination: canAccessMobile ? 'HomeOperativo' : 'PlanBlocked',
      mobileBlockReason,
      onboarding: payload.onboarding || null,
      operationalBlockReason: payload.operationalBlockReason ?? null,
      productDestination: payload.productDestination ?? (canAccessMobile ? 'HomeOperativo' : 'PlanBlocked'),
      productRoute: payload.productRoute ?? payload.postLoginRoute ?? (canAccessMobile ? '/mapa' : '/plan-blocked'),
      route: canAccessMobile ? '/mapa' : '/plan-blocked',
      subscription: payload.subscription || null,
      tenant: payload.tenant || null,
    };
  }

  return null;
}

function shouldRefreshOperationalData(
  authContext: AuthRoutingContext | null | undefined,
  user: User | null | undefined
) {
  if (!user || !authContext) {
    return false;
  }

  const accountChannel = authContext.accountChannel ?? user.accountChannel;

  if (accountChannel) {
    return accountChannel === 'mobile_operations' && authContext.canAccessMobile === true;
  }

  return user.accountType === 'operations' && authContext.canAccessMobile === true;
}`,
  'mobile auth normalization'
));

patch('mobile/src/types/app.ts', (source) => {
  let next = replaceExact(
    source,
    "export type AccountType = 'operations' | 'company_owner';\n",
    "export type AccountType = 'operations' | 'company_owner';\nexport type AccountChannel = 'blocked' | 'company_portal' | 'mobile_operations' | 'platform_admin';\n",
    'mobile AccountChannel type'
  );

  next = replaceExact(
    next,
`  role: Role;
  accountType: AccountType;
  organizationId?: string;`,
`  role: Role;
  accountType: AccountType;
  accountChannel?: AccountChannel;
  accountChannelReason?: string | null;
  organizationId?: string;`,
    'mobile User account channel'
  );

  next = replaceExact(
    next,
`export type PostLoginDestination =
  | 'Login'
  | 'HomeConductor'
  | 'PlanRequired'
  | 'PaymentPending'
  | 'PlanBlocked'
  | 'SyncError'
  | 'OperationalOnboarding'
  | 'HomeOperativo';`,
`export type PostLoginDestination =
  | 'Login'
  | 'AccessBlocked'
  | 'CompanyPortal'
  | 'HomeConductor'
  | 'PlanRequired'
  | 'PaymentPending'
  | 'PlanBlocked'
  | 'PlatformAdmin'
  | 'SyncError'
  | 'OperationalOnboarding'
  | 'HomeOperativo';`,
    'mobile destinations'
  );

  next = replaceExact(
    next,
`export type AuthRoutingContext = {
  canAccessMobile?: boolean;
  canUseOperations?: boolean;
  destination: PostLoginDestination;
  mobileBlockReason?: MobileBlockReason | null;
  onboarding?: PortalOnboarding | null;
  postLoginRoute?: string;
  reason?: string;
  route: string;
  source?: string | null;
  subscription?: PortalSubscription | null;
  tenant?: AuthTenantContext | null;
};

export type MobileBlockReason =
  | 'inactive_plan'
  | 'missing_tenant'
  | 'no_plan'
  | 'payment_pending'
  | 'sync_error';`,
`export type AccessBlockReason =
  | 'account_blocked'
  | 'inactive_plan'
  | 'missing_tenant'
  | 'missing_user'
  | 'no_plan'
  | 'payment_pending'
  | 'sync_error'
  | 'wrong_channel';

export type MobileBlockReason = Exclude<AccessBlockReason, 'missing_user'>;
export type OperationalBlockReason = AccessBlockReason;

export type AuthRoutingContext = {
  accountChannel?: AccountChannel;
  accountChannelReason?: string | null;
  canAccessMobile?: boolean;
  canAccessPortal?: boolean;
  canUseOperations?: boolean;
  destination: PostLoginDestination;
  mobileBlockReason?: MobileBlockReason | null;
  onboarding?: PortalOnboarding | null;
  operationalBlockReason?: OperationalBlockReason | null;
  postLoginRoute?: string;
  productDestination?: PostLoginDestination;
  productRoute?: string;
  reason?: string;
  route: string;
  source?: string | null;
  subscription?: PortalSubscription | null;
  tenant?: AuthTenantContext | null;
};`,
    'mobile auth context types'
  );

  next = replaceExact(
    next,
`  user: User;
  authContext?: AuthRoutingContext | null;
  canAccessMobile?: boolean;
  mobileBlockReason?: MobileBlockReason | null;`,
`  user: User;
  authContext?: AuthRoutingContext | null;
  accountChannel?: AccountChannel;
  accountChannelReason?: string | null;
  canAccessMobile?: boolean;
  canAccessPortal?: boolean;
  canUseOperations?: boolean;
  mobileBlockReason?: MobileBlockReason | null;
  operationalBlockReason?: OperationalBlockReason | null;
  postLoginDestination?: PostLoginDestination;
  productDestination?: PostLoginDestination;
  productRoute?: string;`,
    'mobile LoginResult contract'
  );

  next = replaceExact(
    next,
`  };
  authContext?: AuthRoutingContext | null;
  canAccessMobile?: boolean;
  mobileBlockReason?: MobileBlockReason | null;`,
`  };
  authContext?: AuthRoutingContext | null;
  accountChannel?: AccountChannel;
  accountChannelReason?: string | null;
  canAccessMobile?: boolean;
  canAccessPortal?: boolean;
  canUseOperations?: boolean;
  mobileBlockReason?: MobileBlockReason | null;
  operationalBlockReason?: OperationalBlockReason | null;
  postLoginDestination?: PostLoginDestination;
  productDestination?: PostLoginDestination;
  productRoute?: string;`,
    'mobile SessionResult contract'
  );

  return next;
});

patch('ventas/src/types/app.ts', (source) => {
  let next = replaceExact(
    source,
    "export type AccountType = 'operations' | 'company_owner';\n",
    "export type AccountType = 'operations' | 'company_owner';\nexport type AccountChannel = 'blocked' | 'company_portal' | 'mobile_operations' | 'platform_admin';\n",
    'ventas AccountChannel type'
  );

  next = replaceExact(
    next,
`  role: Role;
  accountType: AccountType;
  organizationId?: string;`,
`  role: Role;
  accountType: AccountType;
  accountChannel?: AccountChannel;
  accountChannelReason?: string | null;
  organizationId?: string;`,
    'ventas User account channel'
  );

  return next;
});

patch('backend/test/app-smoke.test.js', (source) => {
  let next = replaceExact(
    source,
`    assert.equal(registerResponse.payload.user.accountType, "company_owner");
    assert.equal(registerResponse.payload.dashboard, null);
    assert.equal(registerResponse.payload.authContext.destination, "PlanRequired");
    assert.equal(registerResponse.payload.canAccessMobile, false);
    assert.equal(registerResponse.payload.mobileBlockReason, "no_plan");
    assert.equal(registerResponse.payload.postLoginRoute, "/portal/plan");`,
`    assert.equal(registerResponse.payload.user.accountType, "company_owner");
    assert.equal(registerResponse.payload.user.accountChannel, "company_portal");
    assert.equal(registerResponse.payload.accountChannel, "company_portal");
    assert.equal(registerResponse.payload.canAccessPortal, true);
    assert.equal(registerResponse.payload.canUseOperations, false);
    assert.equal(registerResponse.payload.dashboard, null);
    assert.equal(registerResponse.payload.authContext.destination, "PlanRequired");
    assert.equal(registerResponse.payload.canAccessMobile, false);
    assert.equal(registerResponse.payload.mobileBlockReason, "wrong_channel");
    assert.equal(registerResponse.payload.operationalBlockReason, "no_plan");
    assert.equal(registerResponse.payload.postLoginRoute, "/portal/plan");`,
    'smoke register contract'
  );

  next = replaceExact(
    next,
`    assert.equal(loginResponse.payload.authContext.destination, "PlanRequired");
    assert.equal(loginResponse.payload.canAccessMobile, false);
    assert.equal(loginResponse.payload.mobileBlockReason, "no_plan");
    assert.equal(loginResponse.payload.postLoginRoute, "/portal/plan");`,
`    assert.equal(loginResponse.payload.authContext.destination, "PlanRequired");
    assert.equal(loginResponse.payload.accountChannel, "company_portal");
    assert.equal(loginResponse.payload.canAccessMobile, false);
    assert.equal(loginResponse.payload.canAccessPortal, true);
    assert.equal(loginResponse.payload.canUseOperations, false);
    assert.equal(loginResponse.payload.mobileBlockReason, "wrong_channel");
    assert.equal(loginResponse.payload.operationalBlockReason, "no_plan");
    assert.equal(loginResponse.payload.postLoginRoute, "/portal/plan");`,
    'smoke login contract'
  );

  next = replaceExact(
    next,
`    assert.equal(blockedLocationsResponse.status, 403);
    assert.equal(blockedLocationsResponse.payload.code, "PLAN_REQUIRED");`,
`    assert.equal(blockedLocationsResponse.status, 403);
    assert.equal(blockedLocationsResponse.payload.code, "PLAN_REQUIRED");
    assert.equal(blockedLocationsResponse.payload.reason, "no_plan");`,
    'smoke operational block reason'
  );

  next = replaceExact(
    next,
`    assert.equal(activeSessionResponse.status, 200);
    assert.equal(activeSessionResponse.payload.authContext.destination, "HomeOperativo");
    assert.equal(activeSessionResponse.payload.canAccessMobile, true);
    assert.equal(activeSessionResponse.payload.mobileBlockReason, null);
    assert.equal(activeSessionResponse.payload.postLoginRoute, "/mapa");
    assert.equal(activeSessionResponse.payload.subscription.isActive, true);`,
`    assert.equal(activeSessionResponse.status, 200);
    assert.equal(activeSessionResponse.payload.profile.user.accountChannel, "company_portal");
    assert.equal(activeSessionResponse.payload.authContext.destination, "CompanyPortal");
    assert.equal(activeSessionResponse.payload.accountChannel, "company_portal");
    assert.equal(activeSessionResponse.payload.canAccessMobile, false);
    assert.equal(activeSessionResponse.payload.canAccessPortal, true);
    assert.equal(activeSessionResponse.payload.canUseOperations, true);
    assert.equal(activeSessionResponse.payload.mobileBlockReason, "wrong_channel");
    assert.equal(activeSessionResponse.payload.operationalBlockReason, null);
    assert.equal(activeSessionResponse.payload.postLoginRoute, "/portal");
    assert.equal(activeSessionResponse.payload.subscription.isActive, true);`,
    'smoke active portal session'
  );

  next = replaceExact(
    next,
`    assert.equal(activeWithPendingUsersResponse.payload.subscription.status, "active");
    assert.equal(activeWithPendingUsersResponse.payload.tenant.status, "active");
    assert.equal(activeWithPendingUsersResponse.payload.canAccessMobile, true);
    assert.equal(activeWithPendingUsersResponse.payload.mobileBlockReason, null);`,
`    assert.equal(activeWithPendingUsersResponse.payload.subscription.status, "active");
    assert.equal(activeWithPendingUsersResponse.payload.tenant.status, "active");
    assert.equal(activeWithPendingUsersResponse.payload.accountChannel, "company_portal");
    assert.equal(activeWithPendingUsersResponse.payload.canAccessMobile, false);
    assert.equal(activeWithPendingUsersResponse.payload.canUseOperations, true);
    assert.equal(activeWithPendingUsersResponse.payload.mobileBlockReason, "wrong_channel");
    assert.equal(activeWithPendingUsersResponse.payload.operationalBlockReason, null);`,
    'smoke active portal with pending users'
  );

  return next;
});

patch('backend/test/mercado-pago.test.js', (source) => {
  let next = replaceExact(
    source,
`  assert.equal(approved.confirmation.paymentStatus, "paid");
  assert.equal(approved.confirmation.activationStatus, "active");
  assert.equal(approved.session.canAccessMobile, true);
  assert.equal(approved.session.subscription.status, "active");`,
`  assert.equal(approved.confirmation.paymentStatus, "paid");
  assert.equal(approved.confirmation.activationStatus, "active");
  assert.equal(approved.session.accountChannel, "company_portal");
  assert.equal(approved.session.canAccessMobile, false);
  assert.equal(approved.session.canAccessPortal, true);
  assert.equal(approved.session.canUseOperations, true);
  assert.equal(approved.session.mobileBlockReason, "wrong_channel");
  assert.equal(approved.session.operationalBlockReason, null);
  assert.equal(approved.session.postLoginRoute, "/portal");
  assert.equal(approved.session.subscription.status, "active");`,
    'mercado pago approved session'
  );

  next = replaceExact(
    next,
`        assert.equal(session.payload.canAccessMobile, true);
        assert.equal(session.payload.subscription.status, "active");
        assert.equal(session.payload.tenant.status, "active");`,
`        assert.equal(session.payload.accountChannel, "company_portal");
        assert.equal(session.payload.canAccessMobile, false);
        assert.equal(session.payload.canAccessPortal, true);
        assert.equal(session.payload.canUseOperations, true);
        assert.equal(session.payload.mobileBlockReason, "wrong_channel");
        assert.equal(session.payload.operationalBlockReason, null);
        assert.equal(session.payload.postLoginRoute, "/portal");
        assert.equal(session.payload.subscription.status, "active");
        assert.equal(session.payload.tenant.status, "active");`,
    'mercado pago active subscription session'
  );

  return next;
});

patch('backend/scripts/diagnose-auth-account.js', (source) => {
  let next = replaceExact(
    source,
`  const activeSubscription = Boolean(authContext?.subscription?.isActive);
  const canAccessMobile = authContext?.canAccessMobile === true;`,
`  const activeSubscription = Boolean(authContext?.subscription?.isActive);
  const canUseOperations = authContext?.canUseOperations === true;`,
    'diagnose access variable'
  );

  next = replaceExact(
    next,
`  if (
    user?.accountType === "company_owner" &&
    activeSubscription &&
    tenant?.id &&
    !canAccessMobile
  ) {
    issues.push({
      code: "ACTIVE_SALES_ACCOUNT_WRONG_ROUTE",
      severity: "error",
      message: `Cuenta company_owner con plan activo no obtuvo acceso movil (${authContext?.mobileBlockReason || "sin razon"}).`
    });
  }`,
`  if (
    user?.accountType === "company_owner" &&
    activeSubscription &&
    tenant?.id &&
    !canUseOperations
  ) {
    issues.push({
      code: "ACTIVE_COMPANY_WITHOUT_OPERATIONAL_ACCESS",
      severity: "error",
      message: `Cuenta company_owner con plan activo no obtuvo acceso operativo (${authContext?.operationalBlockReason || "sin razon"}).`
    });
  }`,
    'diagnose company operational access'
  );

  next = replaceExact(
    next,
`    authDecision: {
      canAccessMobile: authContext.canAccessMobile,
      destination: authContext.destination,
      mobileBlockReason: authContext.mobileBlockReason,
      route: authContext.route,
      reason: authContext.reason,
      canUseOperations: authContext.canUseOperations
    },`,
`    authDecision: {
      accountChannel: authContext.accountChannel,
      accountChannelReason: authContext.accountChannelReason,
      canAccessMobile: authContext.canAccessMobile,
      canAccessPortal: authContext.canAccessPortal,
      canUseOperations: authContext.canUseOperations,
      destination: authContext.destination,
      mobileBlockReason: authContext.mobileBlockReason,
      operationalBlockReason: authContext.operationalBlockReason,
      productDestination: authContext.productDestination,
      productRoute: authContext.productRoute,
      reason: authContext.reason,
      route: authContext.route
    },`,
    'diagnose auth decision output'
  );

  return next;
});

console.log('Phase 1 account-channel codemod completed successfully.');
