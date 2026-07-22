import { z } from "zod";
import { CanonicalSubscriptionTypeSchema } from "./subscriptions.js";

/**
 * Proxy tag
 */
export const TagSchema = z.looseObject({
  id: z.number().int(),
  tag: z.string(),
});
export type Tag = z.infer<typeof TagSchema>;

/**
 * Per-proxy dedicated mobile proxy as returned by the API
 */
export const ApiProxySchema = z.looseObject({
  session_id: z.string(),
  proxy: z.string(),
  username: z.string(),
  password: z.string(),
  ip: z.string(),
  public_key: z.string(),
  rotate_url: z.string(),
  total_bytes: z.number(),
  bytes_used: z.number(),
  filter: z.record(z.string(), z.string()),
  tags: z.array(TagSchema),
  speed: z.number(),
  speed_test_timestamp: z.number(),
  interval: z.number().nullable(),
  http_port: z.string(),
  socks_port: z.string(),
});
export type ApiProxy = z.infer<typeof ApiProxySchema>;

/**
 * Proxy enriched with ready-to-use gateway connection URLs
 */
export const ProxySchema = ApiProxySchema.extend({
  http_url: z.string(),
  socks_url: z.string(),
});
export type Proxy = z.infer<typeof ProxySchema>;

/**
 * Available proxy location
 */
export const LocationSchema = z.looseObject({
  label: z.string(),
  value: z.string(),
  average_speed: z.number(),
  country: z.string(),
  state: z.string(),
  city: z.string(),
});
export type Location = z.infer<typeof LocationSchema>;

/**
 * Locations grouped by country
 */
export const LocationGroupSchema = z.looseObject({
  country: z.looseObject({
    name: z.string(),
    value: z.string(),
    locations: z.array(LocationSchema).nullable(),
  }),
});
export type LocationGroup = z.infer<typeof LocationGroupSchema>;

/**
 * Mobile carrier
 */
export const CarrierSchema = z.looseObject({
  name: z.string(),
  country: z.string(),
  value: z.string(),
  available: z.boolean(),
});
export type Carrier = z.infer<typeof CarrierSchema>;

/**
 * Country-level location summary (used when no country filter is provided)
 */
export const LocationSummaryGroupSchema = z.looseObject({
  country: z.looseObject({
    name: z.string(),
    value: z.string(),
    city_count: z.number().int(),
    average_speed: z.number(),
  }),
});

/**
 * Country-level carrier summary (used when no country filter is provided)
 */
export const CarrierSummarySchema = z.looseObject({
  country: z.string(),
  carrier_count: z.number().int(),
});

/**
 * Proxidize subscription
 */
export const SubscriptionSchema = z.looseObject({
  id: z.string(),
  status: z.string(),
  from_date: z.string(),
  to_date: z.string(),
  subscription_type_name: CanonicalSubscriptionTypeSchema,
  modem_count: z.number().int(),
  meta_data: z.looseObject({ username: z.string() }),
});
export type Subscription = z.infer<typeof SubscriptionSchema>;

/**
 * Per-GB proxy user or access point
 */
export const PerGbUserSchema = z.looseObject({
  id: z.number().int(),
  created_at: z.string(),
  updated_at: z.string(),
  username: z.string(),
  password: z.string(),
  enabled: z.boolean(),
  bytes_used: z.number(),
  bytes_available: z.number(),
  super_user: z.string().nullable(),
  is_sub_user: z.boolean(),
  type: z.string(),
  byte_sum: z.number(),
  is_kyc_verified: z.boolean(),
  is_crypto_payment: z.boolean(),
});
export type PerGbUser = z.infer<typeof PerGbUserSchema>;

/**
 * Per-GB access point routing settings
 */
export const AccessPointSettingsSchema = z.looseObject({
  access_point: z.string(),
  carrier: z.string().nullable(),
  city: z.string().nullable(),
  city_name: z.string().nullable(),
  country: z.string().nullable(),
  hostname: z.enum(["dns", "ip"]).nullable(),
  ip_mode: z.string().nullable(),
  proxy_type: z.enum(["socks", "http"]).nullable(),
});
export type AccessPointSettings = z.infer<typeof AccessPointSettingsSchema>;

/**
 * Generic success message
 */
export const MessageResponseSchema = z.looseObject({
  message: z.string(),
});

/**
 * Rotation result with observed before/after IPs
 */
export const RotateResultSchema = z.looseObject({
  message: z.string(),
  old_ip: z.string().nullable(),
  new_ip: z.string().nullable(),
});

/**
 * IP whitelist creation result
 */
export const IpWhitelistResponseSchema = z.looseObject({
  message: z.string(),
  count: z.number().int(),
});

/**
 * Tag creation result
 */
export const CreateTagResponseSchema = z.looseObject({
  id: z.number().int(),
  tag: z.string(),
  username: z.string(),
});

/**
 * Tag deletion result
 */
export const DeleteTagResponseSchema = z.looseObject({
  tag_id: z.number().int(),
  username: z.string(),
});

/**
 * Tag-proxy assignment or removal result
 */
export const TagSessionResponseSchema = z.looseObject({
  tag_id: z.number().int(),
  username: z.string(),
  session: z.string(),
});

/**
 * Analytics time window (ISO 8601)
 */
const AnalyticsWindowSchema = z.looseObject({
  from: z.string(),
  to: z.string(),
});

/**
 * Traffic analytics: usage and request timeseries per plan
 */
export const TrafficAnalyticsSchema = z.looseObject({
  window: AnalyticsWindowSchema,
  bucket_seconds: z.number().int(),
  plans: z.array(
    z.looseObject({
      plan: z.string(),
      total_bytes: z.number(),
      total_requests: z.number().int(),
      failed_requests: z.number().int(),
      usage: z.array(
        z.looseObject({
          key: z.string(),
          points: z.array(
            z.looseObject({ timestamp: z.string(), bytes: z.number() })
          ),
        })
      ),
      requests: z.array(
        z.looseObject({
          timestamp: z.string(),
          total: z.number().int(),
          failed: z.number().int(),
        })
      ),
    })
  ),
});

/**
 * Top domains by data volume and request count per plan
 */
export const TopDomainsSchema = z.looseObject({
  window: AnalyticsWindowSchema,
  plans: z.array(
    z.looseObject({
      plan: z.string(),
      by_bytes: z.array(
        z.looseObject({ domain: z.string(), bytes: z.number() })
      ),
      by_requests: z.array(
        z.looseObject({ domain: z.string(), requests: z.number().int() })
      ),
    })
  ),
});

/**
 * Per-request connection log
 */
export const ConnectionHistorySchema = z.looseObject({
  window: AnalyticsWindowSchema,
  total: z.number().int(),
  returned: z.number().int(),
  entries: z.array(z.looseObject({ timestamp: z.string() })),
});

/**
 * Paginated API response wrapper
 */
export type Paginated<T> = {
  perPage: number;
  page: number;
  total: number;
  data: T[];
};

function paginated<T extends z.ZodTypeAny>(itemSchema: T) {
  return z.looseObject({
    perPage: z.number().int(),
    page: z.number().int(),
    total: z.number().int(),
    data: z.array(itemSchema),
  });
}

export const outputSchemas = {
  paginatedSubscriptions: paginated(SubscriptionSchema),
  paginatedProxies: paginated(ProxySchema),
  proxy: ProxySchema,
  locations: z.looseObject({ locations: z.array(LocationGroupSchema) }),
  carriers: z.looseObject({ carriers: z.array(CarrierSchema) }),
  tags: z.looseObject({ tags: z.array(TagSchema) }),
  createTag: CreateTagResponseSchema,
  deleteTag: DeleteTagResponseSchema,
  tagSession: TagSessionResponseSchema,
  message: MessageResponseSchema,
  rotateResult: RotateResultSchema,
  ipWhitelist: IpWhitelistResponseSchema,
  locationSummary: z.looseObject({ locations: z.array(LocationSummaryGroupSchema) }),
  carrierSummary: z.looseObject({ carriers: z.array(CarrierSummarySchema) }),
  perGbUser: PerGbUserSchema,
  perGbUsers: z.looseObject({ access_points: z.array(PerGbUserSchema) }),
  accessPointSettings: z.looseObject({ settings: z.array(AccessPointSettingsSchema) }),
  trafficAnalytics: TrafficAnalyticsSchema,
  topDomains: TopDomainsSchema,
  connectionHistory: ConnectionHistorySchema,
} as const;
