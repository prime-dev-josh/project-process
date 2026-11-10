/*
  Offboarding group (`projectprocess.[Group].id = N'offboarding'`)
  — investigate assignment history and optionally restore group membership.

  Run against database [atg-requirements] in SSMS (read-only sections first).

  Notes:
  - The map API only returns Node rows where is_deleted = 0.
  - ChangeLog `action` holds the human label (e.g. "Moved 3 nodes into Offboarding").
  - ChangeLog `payload_json` lists node IDs in upsertNodes / deleteNodeIds, not group_id.
    Use action text + joining those IDs to projectprocess.Node for details.
  - Direct UPDATEs below do NOT bump projectprocess.Map.revision; clients may need a full
    browser refresh to see changes unless you run the optional revision bump block.
*/

SET NOCOUNT ON;

DECLARE @GroupId nvarchar(160) = N'offboarding';

/* ---------------------------------------------------------------------------
   1) Confirm the group row
--------------------------------------------------------------------------- */
SELECT id, title, parent_id, sort_order, is_deleted, version, updated_rev, updated_at, updated_by
FROM projectprocess.[Group]
WHERE id = @GroupId OR title = N'Offboarding';

/* ---------------------------------------------------------------------------
   2) All nodes ever tagged with this group (active + soft-deleted)
--------------------------------------------------------------------------- */
SELECT
    n.id,
    n.title,
    n.group_id,
    n.is_deleted,
    n.version,
    n.updated_rev,
    n.updated_at,
    n.updated_by
FROM projectprocess.Node AS n
WHERE n.group_id = @GroupId
ORDER BY n.is_deleted, n.updated_rev DESC, n.title;

SELECT
    CASE WHEN n.is_deleted = 0 THEN N'active' ELSE N'soft-deleted' END AS bucket,
    COUNT(*) AS node_count
FROM projectprocess.Node AS n
WHERE n.group_id = @GroupId
GROUP BY n.is_deleted;

/* ---------------------------------------------------------------------------
   3) ChangeLog — assignments & edits that mention Offboarding in the label
--------------------------------------------------------------------------- */
SELECT
    cl.revision,
    cl.changed_at,
    cl.changed_by,
    cl.action,
    cl.payload_json
FROM projectprocess.ChangeLog AS cl
WHERE cl.action LIKE N'%Offboarding%'
   OR cl.action LIKE N'%offboarding%'
ORDER BY cl.revision DESC;

/* Broader: any map edit whose label says nodes were moved into a group */
SELECT TOP 200
    cl.revision,
    cl.changed_at,
    cl.changed_by,
    cl.action
FROM projectprocess.ChangeLog AS cl
WHERE cl.action LIKE N'%into %'
ORDER BY cl.revision DESC;

/* ---------------------------------------------------------------------------
   4) ChangeLog — revisions whose JSON touches the offboarding group id
      (tree moves, group upserts; may NOT be node assignments)
--------------------------------------------------------------------------- */
SELECT
    cl.revision,
    cl.changed_at,
    cl.changed_by,
    cl.action,
    cl.payload_json
FROM projectprocess.ChangeLog AS cl
WHERE cl.payload_json LIKE N'%' + @GroupId + N'%'
ORDER BY cl.revision DESC;

/* ---------------------------------------------------------------------------
   5) Node IDs touched in those revisions (from upsertNodes / deleteNodeIds)
--------------------------------------------------------------------------- */
;WITH touches AS (
    SELECT cl.revision, cl.changed_at, cl.changed_by, cl.action, cl.payload_json
    FROM projectprocess.ChangeLog AS cl
    WHERE cl.action LIKE N'%Offboarding%'
       OR cl.action LIKE N'%offboarding%'
       OR cl.payload_json LIKE N'%' + @GroupId + N'%'
),
ids AS (
    SELECT t.revision, t.changed_at, t.changed_by, t.action, j.value AS node_id, N'upsert' AS kind
    FROM touches AS t
    CROSS APPLY OPENJSON(t.payload_json, '$.upsertNodes') AS j
    UNION ALL
    SELECT t.revision, t.changed_at, t.changed_by, t.action, j.value, N'delete'
    FROM touches AS t
    CROSS APPLY OPENJSON(t.payload_json, '$.deleteNodeIds') AS j
)
SELECT
    i.revision,
    i.changed_at,
    i.changed_by,
    i.action,
    i.kind,
    i.node_id,
    n.title,
    n.group_id AS current_group_id,
    n.is_deleted AS current_is_deleted
FROM ids AS i
LEFT JOIN projectprocess.Node AS n ON n.id = CAST(i.node_id AS nvarchar(160))
ORDER BY i.revision DESC, i.kind, i.node_id;

/* ---------------------------------------------------------------------------
   6) RESTORE — re-assign active nodes by id (edit the list)
      Preview first; then uncomment the UPDATE inside a transaction.
--------------------------------------------------------------------------- */
/*
DECLARE @NodeIds nvarchar(max) = N'["node-id-1","node-id-2"]';  -- JSON array of ids

SELECT n.id, n.title, n.group_id, n.is_deleted
FROM projectprocess.Node AS n
JOIN OPENJSON(@NodeIds) AS j ON n.id = CAST(j.value AS nvarchar(160));

BEGIN TRANSACTION;

UPDATE n
SET
    group_id = @GroupId,
    version = n.version + 1,
    updated_at = SYSUTCDATETIME(),
    updated_by = N'sql-offboarding-restore'
FROM projectprocess.Node AS n
JOIN OPENJSON(@NodeIds) AS j ON n.id = CAST(j.value AS nvarchar(160))
WHERE n.is_deleted = 0;

-- SELECT @@ROWCOUNT AS nodes_reassigned;

-- COMMIT TRANSACTION;
-- ROLLBACK TRANSACTION;
*/

/* ---------------------------------------------------------------------------
   7) RESTORE — soft-deleted nodes that still have group_id = offboarding
      (undelete + keep assignment). No rows today means nothing to restore here.
--------------------------------------------------------------------------- */
SELECT id, title, group_id, updated_rev
FROM projectprocess.Node
WHERE group_id = @GroupId AND is_deleted = 1;

/*
BEGIN TRANSACTION;

UPDATE projectprocess.Node
SET
    is_deleted = 0,
    version = version + 1,
    updated_at = SYSUTCDATETIME(),
    updated_by = N'sql-offboarding-restore'
WHERE group_id = @GroupId AND is_deleted = 1;

-- COMMIT TRANSACTION;
-- ROLLBACK TRANSACTION;
*/

/* ---------------------------------------------------------------------------
   8) Optional — bump Map.revision so Live sync picks up SQL edits
--------------------------------------------------------------------------- */
/*
DECLARE @next bigint;
SELECT @next = revision + 1 FROM projectprocess.Map WITH (UPDLOCK, HOLDLOCK) WHERE id = 1;

UPDATE projectprocess.Map
SET revision = @next, updated_at = SYSUTCDATETIME(), updated_by = N'sql-offboarding-restore'
WHERE id = 1;

UPDATE projectprocess.Node
SET updated_rev = @next
WHERE group_id = @GroupId AND is_deleted = 0
  AND updated_rev < @next;

SELECT @next AS new_map_revision;
*/
