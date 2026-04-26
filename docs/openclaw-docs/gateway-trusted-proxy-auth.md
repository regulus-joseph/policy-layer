# Trusted Proxy Auth

Delegates authentication to a reverse proxy that handles user identity.

## When to Use

- Identity-aware proxy (Pomerium, Caddy + OAuth, nginx + oauth2-proxy)
- Proxy passes user identity via headers
- Kubernetes/container environment
- Browser WS clients that can't pass tokens

## When NOT to Use

- Simple TLS terminator without auth
- Personal single-user (use Tailscale Serve + loopback)
- Untrusted proxy setup

## Config

```json5
{
  gateway: {
    bind: "lan",
    trustedProxies: ["10.0.0.1"],
    auth: {
      mode: "trusted-proxy",
      trustedProxy: {
        userHeader: "x-forwarded-user",
        requiredHeaders: ["x-forwarded-proto", "x-forwarded-host"],
        allowUsers: ["nick@example.com"],
      },
    },
  },
}
```

## Key Rules

- Only add proxy IPs to `trustedProxies`
- Proxy must strip/overwrite (not append) `X-Forwarded-*` headers
- Loopback proxy → use token/password auth instead
- Control UI origin check: set `allowedOrigins` explicitly
- `allowUsers` recommended to restrict access

## Proxy Examples

- **Pomerium**: `x-pomerium-claim-email` header
- **Caddy + oauth2-proxy**: `x-forwarded-user`
- **nginx + oauth2-proxy**: `x-auth-request-email`
- **Traefik Forward Auth**: `x-forwarded-user`

## TLS/HSTS

Set HSTS at the TLS termination point (proxy or gateway).

## Security Checklist

- [ ] Proxy is only path to Gateway
- [ ] `trustedProxies` is minimal
- [ ] Proxy strips headers
- [ ] TLS termination
- [ ] `allowedOrigins` explicit
- [ ] `allowUsers` set
- [ ] No mixed token config
