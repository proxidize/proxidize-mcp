export interface Paginated<T> {
  perPage: number;
  page: number;
  total: number;
  data: T[];
}

export interface Subscription {
  id: string;
  status: string;
  from_date: string;
  to_date: string;
  subscription_type_name: string;
  modem_count: number;
  meta_data: { username: string };
}

export interface Proxy {
  session_id: string;
  proxy: string;
  username: string;
  password: string;
  ip: string;
  public_key: string;
  rotate_url: string;
  total_bytes: number;
  bytes_used: number;
  filter: Record<string, string>;
  tags: Array<{ id: number; tag: string }>;
  speed: number;
  speed_test_timestamp: number;
  interval: number | null;
  http_port: string;
  socks_port: string;
}

export interface Location {
  label: string;
  value: string;
  average_speed: number;
  country: string;
  state: string;
  city: string;
}

export interface LocationGroup {
  country: {
    name: string;
    value: string;
    locations: Location[];
  };
}

export interface Carrier {
  name: string;
  country: string;
  value: string;
  available: boolean;
}

export interface Tag {
  id: number;
  tag: string;
}

export interface PerGbUser {
  id: number;
  created_at: string;
  updated_at: string;
  username: string;
  password: string;
  enabled: boolean;
  bytes_used: number;
  bytes_available: number;
  super_user: string | null;
  is_sub_user: boolean;
  type: string;
  byte_sum: number;
  residential_bytes_used?: number;
  residential_bytes_available?: number;
  is_kyc_verified: boolean;
  is_crypto_payment: boolean;
  account_auth_type?: string;
}

export interface AccessPointSettings {
  access_point: string;
  carrier: string;
  city: string;
  city_name: string;
  country: string;
  hostname: "dns" | "ip";
  ip_mode: string;
  proxy_type: "socks" | "http";
}
