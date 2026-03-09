# Carbo Core API — Architecture & Split Readiness

## Overview

The Carbo ecosystem runs on **1 Supabase backend** ("Carbo Core") that will eventually serve **3 separate front-end applications**:

| App | Domain | Tenant Type | Users |
|-----|--------|-------------|-------|
| **OPS** | Internal operations | `ops` | Squads (Command, OPS, Growth, Expansão, B2B, Finance) |
| **Licenciados** | Partner portal | `licensee` | Licensed operators |
| **Produtos/PDV** | Point of sale | `pdv` | PDV operators |

## Database RPCs (Essential)

| RPC | Purpose | Auth Required |
|-----|---------|---------------|
| `get_user_email_by_username(p_username)` | Resolve login handle → email | No (public) |
| `record_user_login()` | Update last_login_at | Yes |
| `is_admin(user_id)` | Check admin role | Security Definer |
| `is_ceo(user_id)` | Check CEO role | Security Definer |
| `is_gestor(user_id)` | Check any gestor role | Security Definer |
| `has_carbo_role(user_id, role)` | Check specific Carbo role | Security Definer |
| `can_access_os(user_id, os_id)` | OS-level access check | Security Definer |
| `can_validate_stage(user_id, stage)` | Stage validation permission | Security Definer |
| `get_last_login_summary()` | Admin dashboard data | CEO/Admin only |

## Edge Functions

| Function | Purpose | Auth |
|----------|---------|------|
| `ai-chat` | AI assistant conversations | JWT |
| `check-password-hibp` | Password breach check | JWT + Rate limit |
| `text-enhancer` | AI text improvement | JWT + Rate limit |
| `create-master-admin` | Bootstrap admin accounts | JWT + MasterAdmin RBAC |
| `create-team-member` | Add team members | JWT |
| `cnpj-lookup` | CNPJ data lookup | JWT |
| `send-welcome-email` | Welcome emails via Resend | Internal |
| `resolve-password-reset` | Password reset approval flow | JWT |

## Security Model

### RLS Layers
1. **Profiles**: Self-access + manager hierarchy + admin override
2. **Orders**: Masked PII by default, full data via admin RPC
3. **Machines**: Geo-coordinates restricted to admin/manager level
4. **Audit Logs**: Insert-only, read by admin/CEO only

### Role Hierarchy
```
MasterAdmin (admin + ceo + requested_role=MasterAdmin)
  └── CEO (carbo_user_roles.role = 'ceo')
      ├── Gestor ADM
      ├── Gestor FIN
      └── Gestor Compras
          ├── Operador Fiscal
          └── Operador
```

## Feature Flags

Located at `src/lib/featureFlags.ts`. Toggle areas on/off without code removal.

## Tenant Boundaries (Future)

Tables with tenant-sensitive data should include:
- `tenant_type`: 'ops' | 'licensee' | 'pdv'
- `tenant_id`: UUID reference to the tenant entity

Currently segmented via:
- `licensee_users` table (licensee tenant)
- `pdv_users` table (PDV tenant)
- `profiles.department` (OPS tenant / squad assignment)

## Email Domain

Transactional emails sent from `noreply@grupocarbo.com.br` via Resend.
