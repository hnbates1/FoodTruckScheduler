# Production data safety

This repository is connected to a live Food Truck Admin installation. Records entered through the production site are real user data and must survive every code change and deployment.

## Mandatory rules

1. Never delete, truncate, reseed, replace, or reset the production `trucks`, `visits`, `truck_comments`, `users`, `sessions`, `app_settings`, or traffic snapshot tables as part of startup, deployment, testing, repair, or migration logic.
2. Never automatically delete a truck. Truck deletion may occur only after an authenticated administrator deliberately uses the application's explicit delete-truck confirmation flow.
3. Do not treat `localSeed` or any sample/demo data in the frontend as authoritative production data. It is fallback UI data only and must never be written over production records.
4. Preserve the existing Cloudflare storage bindings unless the owner explicitly directs a migration:
   - D1 database ID: `ef9a2f0f-cd45-4895-8aca-f389a324b4ec`
   - D1 database name: `food-truck-admin`
   - R2 bucket: `food-truck-admin-logos`
5. Database migrations must be additive and forward-compatible by default. Do not use `DROP TABLE`, `TRUNCATE`, mass `DELETE`, destructive table recreation, or a database replacement to implement a feature.
6. Never remove or overwrite uploaded truck logos during a deployment or ordinary record update. Delete logo objects only as part of an explicit administrator-confirmed truck deletion or explicit logo removal.
7. Preserve truck comment history and its visibility metadata. A comment may be edited or deleted only through the authenticated comments controls and their server-side role checks.
8. Before any intentionally destructive data operation, stop and obtain an explicit instruction from the owner that identifies exactly what should be deleted. Create or verify a backup/export first when supported.
9. Keep `tests/data-preservation.test.mjs` passing. Update its protected storage identifiers only when the owner has explicitly approved a real storage migration.

## Safe implementation pattern

- Read existing production records from the configured D1 database.
- Apply narrowly scoped `INSERT` or `UPDATE` operations.
- Use additive migrations such as `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, and carefully reviewed `ALTER TABLE ... ADD COLUMN` operations.
- Preserve unknown records and fields rather than replacing the full dataset from frontend state.
