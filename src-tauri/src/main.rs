#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod ai;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    sync::Mutex,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tauri::Manager;
use tokio_util::sync::CancellationToken;

struct AppState {
    db: Mutex<Connection>,
    pending: Mutex<HashMap<String, CancellationToken>>,
}
fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}
fn timestamp() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}
fn secret_key(env: &str, key: &str) -> String {
    format!("{}:{}:{}", env.len(), env, key)
}
fn entry(env: &str, key: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new("com.requestbench.desktop", &secret_key(env, key)).map_err(err)
}
fn read_secret(env: &str, key: &str) -> Result<String, String> {
    match entry(env, key)?.get_password() {
        Ok(s) => Ok(s),
        Err(keyring::Error::NoEntry) => Ok(String::new()),
        Err(e) => Err(format!("Could not read credential store: {e}")),
    }
}
fn init_db(conn: &Connection) -> Result<(), String> {
    conn.execute_batch("PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS workspace (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS history (id INTEGER PRIMARY KEY, data TEXT NOT NULL);").map_err(err)
}
fn persist_workspace(conn: &Connection, value: &Value) -> Result<(), String> {
    conn.execute("INSERT INTO workspace (id,data) VALUES (1,?1) ON CONFLICT(id) DO UPDATE SET data=excluded.data",params![value.to_string()]).map_err(err)?;
    Ok(())
}
fn protect_secrets(
    value: &mut Value,
    mut store: impl FnMut(&str, &str, &str) -> Result<(), String>,
) -> Result<(), String> {
    if let Some(envs) = value["environments"].as_array_mut() {
        for env in envs {
            let id = env["id"]
                .as_str()
                .ok_or("Environment ID is missing")?
                .to_owned();
            if let Some(vars) = env["variables"].as_array_mut() {
                for var in vars {
                    if var["secret"] == true {
                        let key = var["key"]
                            .as_str()
                            .ok_or("Variable key is missing")?
                            .to_owned();
                        let value = var["value"].as_str().unwrap_or("").to_owned();
                        if !value.is_empty() {
                            store(&id, &key, &value)?;
                            var["hasSecret"] = json!(true);
                        }
                        var["value"] = json!("");
                    }
                }
            }
        }
    }
    Ok(())
}
#[tauri::command]
fn load_workspace(state: tauri::State<AppState>) -> Result<Option<Value>, String> {
    let db = state.db.lock().map_err(err)?;
    let result = db.query_row("SELECT data FROM workspace WHERE id=1", [], |r| {
        r.get::<_, String>(0)
    });
    match result {
        Ok(data) => serde_json::from_str(&data).map(Some).map_err(err),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(err(e)),
    }
}
#[tauri::command]
fn save_workspace(mut workspace: Value, state: tauri::State<AppState>) -> Result<Value, String> {
    protect_secrets(&mut workspace, |env, key, value| {
        entry(env, key)?.set_password(value).map_err(err)
    })?;
    let db = state.db.lock().map_err(err)?;
    persist_workspace(&db, &workspace)?;
    Ok(workspace)
}
#[tauri::command]
fn clear_secret(environment_id: String, key: String) -> Result<(), String> {
    match entry(&environment_id, &key)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(err(e)),
    }
}
#[derive(Clone, Deserialize)]
struct Row {
    key: String,
    value: String,
    #[serde(default = "yes")]
    enabled: bool,
    #[serde(default)]
    secret: bool,
}
fn yes() -> bool {
    true
}
#[derive(Clone, Deserialize)]
struct Environment {
    id: String,
    variables: Vec<Row>,
}
#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ApiRequest {
    name: String,
    method: String,
    url: String,
    headers: Vec<Row>,
    body: String,
    #[serde(default)]
    bearer: String,
    #[serde(default)]
    basic_user: String,
    #[serde(default)]
    basic_password: String,
    #[serde(default)]
    auth_type: String,
    #[serde(default)]
    import_issues: Vec<String>,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ApiResponse {
    status: u16,
    status_text: String,
    headers: Vec<(String, String)>,
    body: String,
    size: usize,
    duration: u128,
}
fn interpolate(text: &str, vars: &HashMap<String, String>) -> Result<String, String> {
    let mut rest = text;
    let mut out = String::new();
    while let Some(start) = rest.find("{{") {
        out.push_str(&rest[..start]);
        rest = &rest[start + 2..];
        let end = rest.find("}}").ok_or("Unclosed environment variable")?;
        let key = rest[..end].trim();
        out.push_str(
            vars.get(key)
                .ok_or_else(|| format!("Missing environment variable: {key}"))?,
        );
        rest = &rest[end + 2..];
    }
    out.push_str(rest);
    Ok(out)
}
fn variables(env: Option<Environment>) -> Result<HashMap<String, String>, String> {
    let mut map = HashMap::new();
    if let Some(env) = env {
        for row in env.variables {
            if row.enabled {
                let value = if row.secret && row.value.is_empty() {
                    read_secret(&env.id, &row.key)?
                } else {
                    row.value
                };
                map.insert(row.key, value);
            }
        }
    }
    Ok(map)
}
async fn execute(input: ApiRequest, vars: HashMap<String, String>) -> Result<ApiResponse, String> {
    if !input.import_issues.is_empty() {
        return Err("Review imported Postman features before sending this request".into());
    }
    let started = Instant::now();
    let url = interpolate(&input.url, &vars)?;
    if url == "requestbench://demo" {
        let body = serde_json::to_string_pretty(
            &json!({"message":"Hello from Requestbench","engine":"Rust","ready":true}),
        )
        .map_err(err)?;
        return Ok(ApiResponse {
            status: 200,
            status_text: "OK".into(),
            headers: vec![("content-type".into(), "application/json".into())],
            size: body.len(),
            body,
            duration: started.elapsed().as_millis(),
        });
    }
    let parsed = reqwest::Url::parse(&url).map_err(|_| "Enter a valid HTTP or HTTPS URL")?;
    if !["http", "https"].contains(&parsed.scheme())
        || !parsed.username().is_empty()
        || parsed.password().is_some()
    {
        return Err("Use an HTTP(S) URL without embedded credentials".into());
    }
    if !["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]
        .contains(&input.method.as_str())
    {
        return Err("Unsupported HTTP method".into());
    }
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(err)?;
    let method = reqwest::Method::from_bytes(input.method.as_bytes()).map_err(err)?;
    let mut request = client.request(method.clone(), parsed);
    let mut has_content_type = false;
    for row in input.headers {
        if row.enabled && !row.key.trim().is_empty() {
            let key = interpolate(&row.key, &vars)?;
            if [
                "host",
                "connection",
                "content-length",
                "transfer-encoding",
                "upgrade",
            ]
            .contains(&key.to_lowercase().as_str())
            {
                return Err(format!("Header {key} is managed automatically"));
            }
            if key.eq_ignore_ascii_case("authorization")
                && ["bearer", "basic"].contains(&input.auth_type.as_str())
            {
                continue;
            }
            if key.eq_ignore_ascii_case("content-type") {
                has_content_type = true;
            }
            request = request.header(key, interpolate(&row.value, &vars)?);
        }
    }
    if input.auth_type == "bearer" {
        request = request.bearer_auth(interpolate(&input.bearer, &vars)?);
    }
    if input.auth_type == "basic" {
        request = request.basic_auth(
            interpolate(&input.basic_user, &vars)?,
            Some(interpolate(&input.basic_password, &vars)?),
        );
    }
    if method != reqwest::Method::GET && method != reqwest::Method::HEAD {
        let body = interpolate(&input.body, &vars)?;
        if body.len() > 2_000_000 {
            return Err("Request body exceeds 2 MB".into());
        }
        if !has_content_type && serde_json::from_str::<Value>(&body).is_ok() {
            request = request.header("Content-Type", "application/json");
        }
        request = request.body(body);
    }
    let mut response = request
        .send()
        .await
        .map_err(|e| format!("Request failed: {e}"))?;
    let status = response.status();
    let headers = response
        .headers()
        .iter()
        .map(|(k, v)| {
            (
                k.to_string(),
                v.to_str().unwrap_or("(non-text header)").to_owned(),
            )
        })
        .collect();
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(err)? {
        if bytes.len() + chunk.len() > 5_000_000 {
            return Err("Response exceeds the 5 MB display limit".into());
        }
        bytes.extend_from_slice(&chunk);
    }
    Ok(ApiResponse {
        status: status.as_u16(),
        status_text: status.canonical_reason().unwrap_or("").into(),
        headers,
        body: String::from_utf8_lossy(&bytes).into_owned(),
        size: bytes.len(),
        duration: started.elapsed().as_millis(),
    })
}
async fn execute_cancellable(
    request: ApiRequest,
    vars: HashMap<String, String>,
    token: CancellationToken,
) -> Result<ApiResponse, String> {
    tokio::select! {
        biased;
        _ = token.cancelled() => Err("Request cancelled".into()),
        result = execute(request,vars) => result,
    }
}
#[tauri::command]
async fn send_request(
    call_id: String,
    request: ApiRequest,
    environment: Option<Environment>,
    state: tauri::State<'_, AppState>,
) -> Result<ApiResponse, String> {
    let token = CancellationToken::new();
    state
        .pending
        .lock()
        .map_err(err)?
        .insert(call_id.clone(), token.clone());
    let name = request.name.clone();
    let method = request.method.clone();
    let outcome = async {
        let vars = variables(environment)?;
        execute_cancellable(request, vars, token).await
    }
    .await;
    state.pending.lock().map_err(err)?.remove(&call_id);
    if let Ok(ref r) = outcome {
        let history = json!({"id":call_id,"name":name,"method":method,"status":r.status,"duration":r.duration,"at":timestamp()});
        let db = state.db.lock().map_err(err)?;
        db.execute(
            "INSERT INTO history (data) VALUES (?1)",
            params![history.to_string()],
        )
        .map_err(err)?;
        db.execute("DELETE FROM history WHERE id NOT IN (SELECT id FROM history ORDER BY id DESC LIMIT 100)",[]).map_err(err)?;
    }
    outcome
}
#[tauri::command]
fn cancel_request(call_id: String, state: tauri::State<AppState>) -> Result<(), String> {
    if let Some(token) = state.pending.lock().map_err(err)?.get(&call_id) {
        token.cancel();
    }
    Ok(())
}
#[tauri::command]
fn load_history(state: tauri::State<AppState>) -> Result<Vec<Value>, String> {
    let db = state.db.lock().map_err(err)?;
    let mut stmt = db
        .prepare("SELECT data FROM history ORDER BY id DESC LIMIT 100")
        .map_err(err)?;
    let rows = stmt.query_map([], |r| r.get::<_, String>(0)).map_err(err)?;
    rows.map(|r| serde_json::from_str(&r.map_err(err)?).map_err(err))
        .collect()
}
fn read_import_file(path: &std::path::Path) -> Result<String, String> {
    std::fs::read_to_string(path).map_err(|e| format!("Could not read collection: {e}"))
}
#[tauri::command]
async fn import_file() -> Result<Option<String>, String> {
    let file = rfd::AsyncFileDialog::new()
        .add_filter("JSON workspace", &["json"])
        .pick_file()
        .await;
    match file {
        None => Ok(None),
        Some(file) => {
            let path = file.path().to_owned();
            tauri::async_runtime::spawn_blocking(move || read_import_file(&path))
                .await
                .map_err(err)?
                .map(Some)
        }
    }
}
#[tauri::command]
async fn export_file(mut workspace: Value, include_secrets: bool) -> Result<bool, String> {
    if let Some(envs) = workspace["environments"].as_array_mut() {
        for env in envs {
            let id = env["id"].as_str().unwrap_or("").to_owned();
            if let Some(vars) = env["variables"].as_array_mut() {
                for var in vars {
                    if var["secret"] == true {
                        var["value"] = if include_secrets {
                            let existing = var["value"].as_str().unwrap_or("");
                            json!(if existing.is_empty() {
                                read_secret(&id, var["key"].as_str().unwrap_or(""))?
                            } else {
                                existing.to_owned()
                            })
                        } else {
                            json!("")
                        };
                    }
                    if let Some(obj) = var.as_object_mut() {
                        obj.remove("hasSecret");
                    }
                }
            }
        }
    }
    let file = rfd::AsyncFileDialog::new()
        .add_filter("JSON workspace", &["json"])
        .set_file_name("requestbench-workspace.json")
        .save_file()
        .await;
    if let Some(file) = file {
        std::fs::write(
            file.path(),
            serde_json::to_string_pretty(&workspace).map_err(err)?,
        )
        .map_err(err)?;
        Ok(true)
    } else {
        Ok(false)
    }
}
fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&dir)?;
            let conn = Connection::open(dir.join("workspace.sqlite3"))?;
            init_db(&conn).map_err(std::io::Error::other)?;
            app.manage(AppState {
                db: Mutex::new(conn),
                pending: Mutex::new(HashMap::new()),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            ai::ai_status,
            ai::save_ai_key,
            ai::delete_ai_key,
            ai::generate_ai_workflow,
            ai::save_generated_file,
            load_workspace,
            save_workspace,
            send_request,
            cancel_request,
            load_history,
            import_file,
            export_file,
            clear_secret
        ])
        .run(tauri::generate_context!())
        .expect("Could not run Requestbench");
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn substitution() {
        let vars = HashMap::from([("base".into(), "http://localhost".into())]);
        assert_eq!(
            interpolate("{{ base }}/users", &vars).unwrap(),
            "http://localhost/users"
        );
        assert!(interpolate("{{missing}}", &vars).is_err());
    }
    #[test]
    fn secrets_never_reach_sqlite() {
        let mut data = json!({"environments":[{"id":"local","variables":[{"key":"token","value":"fake-test-secret","secret":true}]}]});
        let mut seen = Vec::new();
        protect_secrets(&mut data, |e, k, v| {
            seen.push((e.to_owned(), k.to_owned(), v.to_owned()));
            Ok(())
        })
        .unwrap();
        assert_eq!(seen[0].2, "fake-test-secret");
        let db = Connection::open_in_memory().unwrap();
        init_db(&db).unwrap();
        persist_workspace(&db, &data).unwrap();
        let stored: String = db
            .query_row("SELECT data FROM workspace", [], |r| r.get(0))
            .unwrap();
        assert!(!stored.contains("fake-test-secret"));
        assert!(stored.contains("hasSecret"));
    }
    #[test]
    fn credential_failure_does_not_persist_plaintext() {
        let mut data = json!({"environments":[{"id":"e","variables":[{"key":"token","value":"secret","secret":true}]}]});
        assert!(protect_secrets(&mut data, |_, _, _| Err("locked".into())).is_err());
    }
    #[test]
    fn workspace_replace_is_atomic() {
        let db = Connection::open_in_memory().unwrap();
        init_db(&db).unwrap();
        persist_workspace(&db, &json!({"version":1})).unwrap();
        persist_workspace(&db, &json!({"version":2})).unwrap();
        let count: i64 = db
            .query_row("SELECT COUNT(*) FROM workspace", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 1);
    }
    fn request(url: String) -> ApiRequest {
        ApiRequest {
            name: "Test".into(),
            method: "GET".into(),
            url,
            headers: vec![],
            body: String::new(),
            bearer: String::new(),
            basic_user: String::new(),
            basic_password: String::new(),
            auth_type: String::new(),
            import_issues: Vec::new(),
        }
    }
    #[tokio::test]
    async fn rejects_file_urls() {
        assert!(
            execute(request("file:///etc/passwd".into()), HashMap::new())
                .await
                .unwrap_err()
                .contains("HTTP")
        );
    }
    #[tokio::test]
    async fn actual_http_and_redirects() {
        use std::io::{Read, Write};
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();
        let server = std::thread::spawn(move || {
            let (mut socket, _) = listener.accept().unwrap();
            let mut buffer = [0; 4096];
            socket.read(&mut buffer).unwrap();
            socket.write_all(b"HTTP/1.1 302 Found\r\nLocation: /other\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{}").unwrap();
        });
        let response = execute(request(format!("http://{addr}/")), HashMap::new())
            .await
            .unwrap();
        assert_eq!(response.status, 302);
        assert_eq!(response.body, "{}");
        server.join().unwrap();
    }
    #[tokio::test]
    async fn cancellation_stops_pending_request() {
        let token = CancellationToken::new();
        token.cancel();
        let result =
            execute_cancellable(request("http://127.0.0.1:1".into()), HashMap::new(), token).await;
        assert_eq!(result.unwrap_err(), "Request cancelled");
    }
    #[tokio::test]
    async fn sends_json_body_and_resolved_bearer_token() {
        use std::io::{Read, Write};
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();
        let server = std::thread::spawn(move || {
            let (mut socket, _) = listener.accept().unwrap();
            socket
                .set_read_timeout(Some(Duration::from_secs(3)))
                .unwrap();
            let mut bytes = Vec::new();
            let mut buffer = [0; 4096];
            loop {
                let n = socket.read(&mut buffer).unwrap();
                if n == 0 {
                    break;
                }
                bytes.extend_from_slice(&buffer[..n]);
                if String::from_utf8_lossy(&bytes).contains("{\"name\":\"Alex\"}") {
                    break;
                }
            }
            socket
                .write_all(
                    b"HTTP/1.1 201 Created\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{}",
                )
                .unwrap();
            String::from_utf8(bytes).unwrap()
        });
        let mut input = request(format!("http://{addr}/users"));
        input.method = "POST".into();
        input.body = "{\"name\":\"{{name}}\"}".into();
        input.auth_type = "bearer".into();
        input.bearer = "{{token}}".into();
        let response = execute(
            input,
            HashMap::from([
                ("name".into(), "Alex".into()),
                ("token".into(), "fake-test-token".into()),
            ]),
        )
        .await
        .unwrap();
        assert_eq!(response.status, 201);
        let received = server.join().unwrap();
        assert!(received
            .to_lowercase()
            .contains("authorization: bearer fake-test-token"));
        assert!(received
            .to_lowercase()
            .contains("content-type: application/json"));
        assert!(received.ends_with("{\"name\":\"Alex\"}"));
    }
    #[test]
    fn reads_collection_larger_than_five_megabytes() {
        let path = std::env::temp_dir().join(format!(
            "requestbench-large-import-{}-{}.json",
            std::process::id(),
            timestamp()
        ));
        let input = format!("{{\"data\":\"{}\"}}", "x".repeat(8_000_000));
        std::fs::write(&path, &input).unwrap();
        let result = read_import_file(&path);
        std::fs::remove_file(&path).unwrap();
        assert_eq!(result.unwrap(), input);
    }
    #[tokio::test]
    async fn imported_feature_warnings_block_execution() {
        let mut input = request("requestbench://demo".into());
        input.import_issues.push("Unsupported script".into());
        assert!(execute(input, HashMap::new())
            .await
            .unwrap_err()
            .contains("Review imported"));
    }
}
