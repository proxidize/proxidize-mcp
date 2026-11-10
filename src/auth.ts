import { createHash } from "node:crypto";
import { createRemoteJWKSet, jwtVerify, errors as joseErrors } from "jose";

/**
 * OAuth for the hosted server.
 *
 * 1. The AI app (ChatGPT, Claude, ...) signs the user in at Auth0 and sends us
 *    an access token whose audience is THIS server (the MCP resource URL).
 *    verifyAccessToken() checks it. Per the MCP authorization spec we must
 *    reject any token not issued for us, and must not forward it upstream.
 * 2. To call api.proxidize.com we swap it at Auth0 (RFC 8693 on-behalf-of
 *    token exchange) for a token whose audience is the Proxidize API, which
 *    the API already accepts. exchangeForApiToken() does that, with a cache.
 */

export interface AuthConfig {
  /** Auth0 issuer, with trailing slash, e.g. https://auth.proxidize.com/ */
  issuer: string;
  /** This server's resource identifier = the Auth0 API identifier for the MCP. */
  resource: string;
  /** Auth0 client registered with app_type resource_server for the MCP API. */
  clientId: string;
  clientSecret: string;
  /** Audience of the Proxidize API (the backend's AUTH0_AUDIENCE). */
  apiAudience: string;
  /** Optional scope to request in the exchange. */
  exchangeScope?: string;
}

export class AuthError extends Error {
  constructor(
    message: string,
    /** "invalid_token" = client should sign in again; "server_error" = our side. */
    readonly kind: "invalid_token" | "server_error"
  ) {
    super(message);
  }
}

export interface VerifiedToken {
  token: string;
  sub: string;
  exp: number;
}

const CLOCK_TOLERANCE_SECONDS = 5;
const EXCHANGE_CACHE_MAX = 10_000;
const EXCHANGE_SAFETY_SECONDS = 60;

const TOKEN_EXCHANGE_GRANT = "urn:ietf:params:oauth:grant-type:token-exchange";
const ACCESS_TOKEN_TYPE = "urn:ietf:params:oauth:token-type:access_token";

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function createAuth(cfg: AuthConfig, fetchImpl: typeof fetch = fetch) {
  const jwks = createRemoteJWKSet(new URL(".well-known/jwks.json", cfg.issuer));
  const tokenUrl = new URL("oauth/token", cfg.issuer).toString();
  const exchangeCache = new Map<string, { token: string; expiresAt: number }>();

  async function verifyAccessToken(token: string): Promise<VerifiedToken> {
    try {
      const { payload } = await jwtVerify(token, jwks, {
        issuer: cfg.issuer,
        audience: cfg.resource,
        algorithms: ["RS256"],
        clockTolerance: CLOCK_TOLERANCE_SECONDS,
        requiredClaims: ["sub", "exp"],
      });
      return { token, sub: String(payload.sub), exp: Number(payload.exp) };
    } catch (err) {
      if (err instanceof joseErrors.JOSEError) {
        // Covers bad signature, wrong issuer/audience, expired, malformed.
        throw new AuthError(`access token rejected (${err.code})`, "invalid_token");
      }
      throw new AuthError("could not verify access token", "server_error");
    }
  }

  function pruneCache(now: number) {
    for (const [key, value] of exchangeCache) {
      if (value.expiresAt <= now) exchangeCache.delete(key);
    }
    // Still too big: drop oldest entries (Map keeps insertion order).
    while (exchangeCache.size >= EXCHANGE_CACHE_MAX) {
      const oldest = exchangeCache.keys().next().value;
      if (oldest === undefined) break;
      exchangeCache.delete(oldest);
    }
  }

  async function exchangeForApiToken(verified: VerifiedToken): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    const key = hashToken(verified.token);
    const cached = exchangeCache.get(key);
    if (cached && cached.expiresAt > now) return cached.token;

    const body = new URLSearchParams({
      grant_type: TOKEN_EXCHANGE_GRANT,
      subject_token: verified.token,
      subject_token_type: ACCESS_TOKEN_TYPE,
      requested_token_type: ACCESS_TOKEN_TYPE,
      audience: cfg.apiAudience,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
    });
    if (cfg.exchangeScope) body.set("scope", cfg.exchangeScope);

    let res: Response;
    try {
      res = await fetchImpl(tokenUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new AuthError("token exchange request failed", "server_error");
    }

    const data = (await res.json().catch(() => ({}))) as {
      access_token?: string;
      expires_in?: number;
      error?: string;
      error_description?: string;
    };
    if (!res.ok || !data.access_token) {
      // invalid_grant = Auth0 refused the user's token (revoked, consent
      // missing, ...): the client should sign in again. Anything else is ours.
      const kind = data.error === "invalid_grant" ? "invalid_token" : "server_error";
      // Auth0's error_description names the cause (client auth, grant, policy); it
      // never contains the tokens or the secret.
      const why = data.error_description ? `: ${String(data.error_description).slice(0, 300)}` : "";
      throw new AuthError(`token exchange refused (${res.status} ${data.error ?? "no error code"}${why})`, kind);
    }

    const lifetime = Number(data.expires_in) > 0 ? Number(data.expires_in) : 300;
    const expiresAt = Math.min(now + lifetime, verified.exp) - EXCHANGE_SAFETY_SECONDS;
    if (expiresAt > now) {
      pruneCache(now);
      exchangeCache.set(key, { token: data.access_token, expiresAt });
    }
    return data.access_token;
  }

  return { verifyAccessToken, exchangeForApiToken, _exchangeCache: exchangeCache };
}
