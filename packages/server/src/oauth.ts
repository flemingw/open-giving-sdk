import { createHash } from "node:crypto";
import {
  createRemoteJWKSet,
  jwtVerify,
  type JWTVerifyGetKey,
  type JWTPayload,
} from "jose";
import { SCOPES, type Principal, type Scope } from "./service.js";

interface OAuthOptions {
  issuer: string;
  audience: string;
  jwksUrl: string;
  /** Host supplies token/grant revocation checks. No identity provider,
   * donor account or durable store is prescribed by this verifier. */
  isRevoked?: (claims: JWTPayload) => Promise<boolean>;
  /** Inject a local public JWKS for offline tests. Never use request-supplied keys. */
  keySet?: JWTVerifyGetKey;
}
export function createJwtAuthenticator(options: OAuthOptions) {
  for (const value of [options.issuer, options.audience, options.jwksUrl]) {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.hash ||
      url.search
    )
      throw new Error("Configure trusted HTTPS OAuth endpoints");
  }
  const keySet =
    options.keySet ??
    createRemoteJWKSet(new URL(options.jwksUrl), {
      timeoutDuration: 3000,
      cooldownDuration: 30000,
      cacheMaxAge: 300000,
    });
  return async (request: Request): Promise<Principal | null> => {
    const header = request.headers.get("authorization");
    if (!header || header.length > 8192) return null;
    const token = /^Bearer ([^\s]+)$/i.exec(header)?.[1];
    if (!token) return null;
    try {
      const { payload } = await jwtVerify(token, keySet, {
        issuer: options.issuer,
        audience: options.audience,
        algorithms: ["RS256", "ES256"],
        typ: "at+jwt",
        requiredClaims: ["iss", "aud", "sub", "iat", "exp"],
        maxTokenAge: "1h",
        clockTolerance: 5,
      });
      if (
        typeof payload.sub !== "string" ||
        !payload.sub ||
        payload.sub.length > 512 ||
        typeof payload.scope !== "string" ||
        payload.scope.length > 2048
      )
        return null;
      const clientId = payload.client_id ?? payload.azp;
      if (
        typeof clientId !== "string" ||
        !/^[A-Za-z0-9._:/-]{1,128}$/.test(clientId) ||
        (payload.client_id && payload.azp && payload.client_id !== payload.azp)
      )
        return null;
      if (await options.isRevoked?.(payload)) return null;
      const claimed = new Set(payload.scope.split(" "));
      const scopes: Scope[] = SCOPES.filter((scope) => claimed.has(scope));
      if (!scopes.length) return null;
      const id = `p-${createHash("sha256")
        .update(JSON.stringify([options.issuer, options.audience, payload.sub]))
        .digest("hex")}`;
      return { id, clientId, scopes };
    } catch {
      return null;
    }
  };
}
