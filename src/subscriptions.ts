import { z } from "zod";

export const canonicalSubscriptionTypes = [
  "per_proxy_mobile",
  "per_gb_mobile",
  "per_gb_residential",
] as const;

export const CanonicalSubscriptionTypeSchema = z.enum(
  canonicalSubscriptionTypes
);

export type CanonicalSubscriptionType = z.infer<
  typeof CanonicalSubscriptionTypeSchema
>;

/**
 * The deployed backend only recognizes the legacy `type` filter values
 * (`per_proxy`, `per_gb`) and silently returns the account's default plan
 * for anything else, even though responses already use canonical names.
 * Send the legacy value on the wire and select the canonical plan
 * client-side via filterSubscriptionResponse.
 * TODO: pass the canonical type through once the backend accepts it.
 */
export function toLegacyWireType(type: CanonicalSubscriptionType): string {
  return type === "per_proxy_mobile" ? "per_proxy" : "per_gb";
}

type SubscriptionResponse = {
  total: number;
  data: Array<{
    status: string;
    subscription_type_name: string;
    meta_data?: { username?: string };
  }>;
};

/**
 * Keep only subscriptions of the requested canonical type. Guards against
 * the backend's silent default-plan fallback and against the shared legacy
 * `per_gb` filter returning the sibling per-GB plan.
 */
export function filterSubscriptionResponse<T extends SubscriptionResponse>(
  response: T,
  requestedType: CanonicalSubscriptionType
): T {
  const data = response.data.filter(
    (subscription) => subscription.subscription_type_name === requestedType
  );
  return Object.assign({}, response, { data, total: data.length });
}

export function getActiveSubscriptionUsername(
  response: SubscriptionResponse,
  requestedType: CanonicalSubscriptionType
): string | null {
  const subscription = response.data.find(
    (item) =>
      item.status === "active" &&
      item.subscription_type_name === requestedType
  );

  return subscription?.meta_data?.username ?? null;
}
