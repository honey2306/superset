# Router contracts

The temporary compiled `dist-types` pipeline has been replaced by
`@superset/host-contract` and `@superset/host-client`.

See [Host application and client boundaries](./architecture-boundaries.md) for
the dependency direction, contract regeneration command, compatibility behavior
and verification strategy. Clients no longer typecheck Host implementation or
need a declaration build before their own typecheck.
