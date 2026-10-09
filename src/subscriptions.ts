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

export function toLegacyWireType(type: CanonicalSubscriptionType): string {
  switch (type) {
    case "per_proxy_mobile":
      return "per_proxy";
    case "per_gb_residential":
      return "residential_per_gb";
    case "per_gb_mobile":
      return "per_gb";
  }
}

type SubscriptionResponse = {
  total: number;
  data: Array<{
    status: string;
    subscription_type_name: string;
    meta_data?: { username?: string };
  }>;
};

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
