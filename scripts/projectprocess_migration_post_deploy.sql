/*
  Post-deploy cleanup — run ONLY AFTER every App Service slot runs a build that no
  longer reads Map.settings_json or Node.fx / Node.fy (see mapStore / local view settings).

  Equivalent: npm run sql:setup -- --drop-legacy   (or python scripts/projectprocess_sql.py --drop-legacy)
*/
IF COL_LENGTH(N'projectprocess.Map', N'settings_json') IS NOT NULL
    ALTER TABLE projectprocess.Map DROP COLUMN settings_json;
GO
IF COL_LENGTH(N'projectprocess.Node', N'fx') IS NOT NULL
    ALTER TABLE projectprocess.Node DROP COLUMN fx;
GO
IF COL_LENGTH(N'projectprocess.Node', N'fy') IS NOT NULL
    ALTER TABLE projectprocess.Node DROP COLUMN fy;
GO
