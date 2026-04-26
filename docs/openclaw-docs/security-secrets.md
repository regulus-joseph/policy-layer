# Secrets Management

Secure storage for sensitive data like API keys and tokens.

## Commands

```bash
openclaw secrets list                          # List all secrets
openclaw secrets get <name>                    # Get secret value
openclaw secrets set <name> --value <val>      # Set secret
openclaw secrets set <name> --from-file <path> # Set from file
openclaw secrets set <name> --from-env <var>   # Set from env var
openclaw secrets rm <name>                    # Delete secret
openclaw secrets rotate <name> --value <val>  # Rotate secret
openclaw secrets export                        # Export all (warning)
openclaw secrets audit                         # Audit access logs
```

## Secret Providers

| Provider | Backend |
| `env` | Environment variables |
| `keychain` | OS keychain (macOS Keychain, Linux Secret Service, Windows Credential Manager) |
| `vault` | HashiCorp Vault |
| `aws-secrets-manager` | AWS Secrets Manager |
| `gcp-secret-manager` | GCP Secret Manager |
| `azure-keyvault` | Azure Key Vault |

## Configuration

```json5
{
  secrets: {
    provider: "keychain",
    vault: {
      url: "https://vault.example.com",
      auth: { method: "token", token: "${VAULT_TOKEN}" },
    },
    aws: {
      region: "us-east-1",
      profile: "default",
    },
  },
}
```

## In Config Files

```json5
{
  plugins: {
    entries: {
      "my-plugin": {
        config: {
          apiKey: { source: "env", id: "MY_API_KEY" },
        },
      },
    },
  },
}
```

The secret is referenced by source and id — the actual value is never stored in config.
