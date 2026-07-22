import assert from "node:assert/strict";
import test from "node:test";

import {
  canonicalSubscriptionTypes,
  CanonicalSubscriptionTypeSchema,
  filterSubscriptionResponse,
  getActiveSubscriptionUsername,
  toLegacyWireType,
} from "../dist/subscriptions.js";

test("exposes only canonical subscription types", () => {
  assert.deepEqual(canonicalSubscriptionTypes, [
    "per_proxy_mobile",
    "per_gb_mobile",
    "per_gb_residential",
  ]);
  assert.equal(
    CanonicalSubscriptionTypeSchema.safeParse("per_proxy").success,
    false
  );
  assert.equal(
    CanonicalSubscriptionTypeSchema.safeParse("per_gb").success,
    false
  );
});

test("maps canonical types to the legacy wire filter values", () => {
  assert.equal(toLegacyWireType("per_proxy_mobile"), "per_proxy");
  assert.equal(toLegacyWireType("per_gb_mobile"), "per_gb");
  assert.equal(toLegacyWireType("per_gb_residential"), "per_gb");
});

test("keeps subscriptions matching the requested canonical type", () => {
  const response = {
    total: 1,
    data: [
      {
        status: "active",
        subscription_type_name: "per_proxy_mobile",
        meta_data: { username: "proxy-user" },
      },
    ],
  };

  assert.deepEqual(
    filterSubscriptionResponse(response, "per_proxy_mobile"),
    response
  );
  assert.equal(
    getActiveSubscriptionUsername(response, "per_proxy_mobile"),
    "proxy-user"
  );
});

test("drops the silent default-plan fallback and sibling per-GB plans", () => {
  const response = {
    total: 2,
    data: [
      {
        status: "active",
        subscription_type_name: "Free",
        meta_data: {},
      },
      {
        status: "active",
        subscription_type_name: "per_gb_mobile",
        meta_data: { username: "mobile-user" },
      },
    ],
  };

  const residential = filterSubscriptionResponse(
    response,
    "per_gb_residential"
  );
  assert.deepEqual(residential.data, []);
  assert.equal(residential.total, 0);

  const mobile = filterSubscriptionResponse(response, "per_gb_mobile");
  assert.equal(mobile.total, 1);
  assert.equal(mobile.data[0].meta_data.username, "mobile-user");
  assert.equal(
    getActiveSubscriptionUsername(response, "per_gb_residential"),
    null
  );
});

test("does not resolve inactive subscriptions or a different plan", () => {
  const response = {
    total: 1,
    data: [
      {
        status: "inactive",
        subscription_type_name: "per_gb_mobile",
        meta_data: { username: "inactive-user" },
      },
    ],
  };

  assert.equal(getActiveSubscriptionUsername(response, "per_gb_mobile"), null);
  assert.equal(
    getActiveSubscriptionUsername(response, "per_gb_residential"),
    null
  );
});
