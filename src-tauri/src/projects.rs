use crate::{err, AppState};
use rusqlite::{params, Connection, OptionalExtension};
use serde_json::{json, Value};
pub fn migrate(db: &Connection) -> Result<(), String> {
    db.execute_batch("CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', archived INTEGER NOT NULL DEFAULT 0, data TEXT); CREATE TABLE IF NOT EXISTS project_history (id INTEGER PRIMARY KEY, project_id TEXT NOT NULL, data TEXT NOT NULL);").map_err(err)?;
    // The original tables remain intact as a migration backup. This transaction runs once.
    let tx = db.unchecked_transaction().map_err(err)?;
    let exists: bool = tx
        .query_row("SELECT EXISTS(SELECT 1 FROM projects)", [], |r| r.get(0))
        .map_err(err)?;
    if !exists {
        let old: Option<String> = tx
            .query_row("SELECT data FROM workspace WHERE id=1", [], |r| r.get(0))
            .optional()
            .map_err(err)?;
        tx.execute("INSERT INTO projects (id,name,description,data) VALUES ('default','My first project','Your existing APIs, environments, and examples.',?1)",params![old]).map_err(err)?;
        tx.execute(
            "INSERT INTO project_history (project_id,data) SELECT 'default',data FROM history",
            [],
        )
        .map_err(err)?;
    }
    tx.commit().map_err(err)
}
pub fn read(db: &Connection, id: &str) -> Result<Option<Value>, String> {
    let data: Option<String> = db
        .query_row(
            "SELECT data FROM projects WHERE id=?1 AND archived=0",
            [id],
            |r| r.get(0),
        )
        .map_err(|_| "Project unavailable".to_string())?;
    data.map(|s| serde_json::from_str(&s).map_err(err))
        .transpose()
}
pub fn write(db: &Connection, id: &str, value: &Value) -> Result<(), String> {
    let changed = db
        .execute(
            "UPDATE projects SET data=?1 WHERE id=?2 AND archived=0",
            params![value.to_string(), id],
        )
        .map_err(err)?;
    if changed != 1 {
        return Err("Project unavailable; changes were not saved".into());
    }
    Ok(())
}
pub fn append_history(db: &Connection, id: &str, value: &Value) -> Result<(), String> {
    let tx = db.unchecked_transaction().map_err(err)?;
    tx.execute(
        "INSERT INTO project_history(project_id,data) VALUES (?1,?2)",
        params![id, value.to_string()],
    )
    .map_err(err)?;
    tx.execute("DELETE FROM project_history WHERE project_id=?1 AND id NOT IN (SELECT id FROM project_history WHERE project_id=?1 ORDER BY id DESC LIMIT 100)",[id]).map_err(err)?;
    tx.commit().map_err(err)
}
pub fn history(db: &Connection, id: &str) -> Result<Vec<Value>, String> {
    let mut stmt = db
        .prepare("SELECT data FROM project_history WHERE project_id=?1 ORDER BY id DESC LIMIT 100")
        .map_err(err)?;
    let rows = stmt
        .query_map([id], |r| r.get::<_, String>(0))
        .map_err(err)?;
    rows.map(|r| serde_json::from_str(&r.map_err(err)?).map_err(err))
        .collect()
}
#[tauri::command]
pub fn list_projects(state: tauri::State<AppState>) -> Result<Vec<Value>, String> {
    let db = state.db.lock().map_err(err)?;
    let mut stmt=db.prepare("SELECT id,name,description,archived,data FROM projects ORDER BY archived,name COLLATE NOCASE").map_err(err)?;
    let rows = stmt
        .query_map([], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, bool>(3)?,
                r.get::<_, Option<String>>(4)?,
            ))
        })
        .map_err(err)?;
    rows.map(|r|{let(id,name,description,archived,data)=r.map_err(err)?;let w:Value=data.map(|s|serde_json::from_str(&s)).transpose().map_err(err)?.unwrap_or(Value::Null);Ok(json!({"id":id,"name":name,"description":description,"archived":archived,"requestCount":w["requests"].as_array().map_or(0,|a|a.len()),"environmentCount":w["environments"].as_array().map_or(0,|a|a.len()),"fixtureCount":w["fixtures"].as_array().map_or(0,|a|a.len())}))}).collect()
}
fn validate(name: &str, description: &str) -> Result<(), String> {
    if name.trim().is_empty() || name.len() > 120 || description.len() > 2000 {
        return Err(
            "Use a project name of 1–120 characters and description under 2,000 characters".into(),
        );
    }
    Ok(())
}
#[tauri::command]
pub fn create_project(
    id: String,
    name: String,
    description: String,
    state: tauri::State<AppState>,
) -> Result<(), String> {
    validate(&name, &description)?;
    if id.is_empty() || id.len() > 100 || !id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
    {
        return Err("Invalid project ID".into());
    }
    let db = state.db.lock().map_err(err)?;
    let empty =
        json!({"format":"requestbench","version":1,"requests":[],"environments":[],"fixtures":[]});
    db.execute(
        "INSERT INTO projects (id,name,description,data) VALUES (?1,?2,?3,?4)",
        params![id, name.trim(), description.trim(), empty.to_string()],
    )
    .map_err(err)?;
    Ok(())
}
#[tauri::command]
pub fn update_project(
    id: String,
    name: String,
    description: String,
    archived: bool,
    state: tauri::State<AppState>,
) -> Result<(), String> {
    validate(&name, &description)?;
    let db = state.db.lock().map_err(err)?;
    if db
        .execute(
            "UPDATE projects SET name=?1,description=?2,archived=?3 WHERE id=?4",
            params![name.trim(), description.trim(), archived, id],
        )
        .map_err(err)?
        != 1
    {
        return Err("Project not found".into());
    }
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    fn database() -> Connection {
        let db = Connection::open_in_memory().unwrap();
        crate::init_db(&db).unwrap();
        db
    }
    #[test]
    fn migration_preserves_existing_workspace_and_history_exactly_once() {
        let db = database();
        let old = json!({"requests":[{"id":"r"}],"environments":[{"id":"e","variables":[{"key":"token","value":"","hasSecret":true}]}]});
        crate::persist_workspace(&db, &old).unwrap();
        db.execute("INSERT INTO history(data) VALUES ('{}')", [])
            .unwrap();
        migrate(&db).unwrap();
        assert_eq!(read(&db, "default").unwrap(), Some(old.clone()));
        write(&db, "default", &json!({"updated":true})).unwrap();
        migrate(&db).unwrap();
        assert_eq!(read(&db, "default").unwrap(), Some(json!({"updated":true})));
        assert_eq!(
            db.query_row("SELECT COUNT(*) FROM project_history", [], |r| r
                .get::<_, i64>(0))
                .unwrap(),
            1
        );
        assert_eq!(
            db.query_row("SELECT data FROM workspace", [], |r| r.get::<_, String>(0))
                .unwrap(),
            old.to_string()
        );
    }
    #[test]
    fn writes_and_history_are_project_scoped_and_archived_data_is_retained() {
        let db = database();
        migrate(&db).unwrap();
        db.execute(
            "INSERT INTO projects(id,name) VALUES ('second','Second')",
            [],
        )
        .unwrap();
        write(&db, "default", &json!({"requests":[1]})).unwrap();
        write(&db, "second", &json!({"requests":[2]})).unwrap();
        assert_eq!(read(&db, "default").unwrap(), Some(json!({"requests":[1]})));
        db.execute("UPDATE projects SET archived=1 WHERE id='second'", [])
            .unwrap();
        assert!(write(&db, "second", &json!({})).is_err());
        assert!(read(&db, "second").is_err());
        db.execute("UPDATE projects SET archived=0 WHERE id='second'", [])
            .unwrap();
        assert_eq!(read(&db, "second").unwrap(), Some(json!({"requests":[2]})));
        assert!(write(&db, "missing", &json!({})).is_err());
    }
    #[test]
    fn history_does_not_leak_or_prune_other_projects() {
        let db = database();
        migrate(&db).unwrap();
        append_history(&db, "second", &json!({"name":"other"})).unwrap();
        for i in 0..105 {
            append_history(&db, "default", &json!({"name":i})).unwrap();
        }
        assert_eq!(history(&db, "default").unwrap().len(), 100);
        assert_eq!(
            history(&db, "second").unwrap(),
            vec![json!({"name":"other"})]
        );
        assert_eq!(history(&db, "default").unwrap()[0], json!({"name":104}));
    }
}
