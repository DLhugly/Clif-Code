use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};
use std::sync::Mutex;

use serde_json::Value;
use tauri::{AppHandle, Emitter, State};

// ─── Types ───────────────────────────────────────────────────────────────────

#[derive(Debug)]
struct LspProcess {
    child: Child,
    stdin: ChildStdin,
}

#[derive(Default)]
pub struct LspState {
    processes: Mutex<HashMap<String, LspProcess>>,
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/// Detect which language server binary to use for a given language ID.
fn server_command(language: &str) -> Option<(&'static str, Vec<&'static str>)> {
    match language {
        "typescript" | "javascript" | "typescriptreact" | "javascriptreact" => {
            Some(("typescript-language-server", vec!["--stdio"]))
        }
        "rust" => Some(("rust-analyzer", vec![])),
        "python" => Some(("pylsp", vec![])),
        "go" => Some(("gopls", vec!["serve"])),
        "css" | "scss" | "less" => Some(("vscode-css-language-server", vec!["--stdio"])),
        "html" => Some(("vscode-html-language-server", vec!["--stdio"])),
        "json" => Some(("vscode-json-language-server", vec!["--stdio"])),
        _ => None,
    }
}

/// Check whether a language server binary is available on PATH.
fn server_available(bin: &str) -> bool {
    which::which(bin).is_ok()
}

/// Encode a JSON-RPC message as LSP framed bytes.
fn encode_message(msg: &Value) -> Vec<u8> {
    let body = msg.to_string();
    let header = format!("Content-Length: {}\r\n\r\n", body.len());
    let mut out = header.into_bytes();
    out.extend_from_slice(body.as_bytes());
    out
}

/// Spawn a reader thread that forwards server → client messages as Tauri events.
fn spawn_reader(language: String, stdout: ChildStdout, app: AppHandle) {
    std::thread::spawn(move || {
        let mut reader = BufReader::new(stdout);
        loop {
            // Read Content-Length header
            let mut header = String::new();
            if reader.read_line(&mut header).unwrap_or(0) == 0 {
                break; // EOF
            }
            let header = header.trim().to_string();
            if header.is_empty() {
                continue;
            }

            // Parse content length
            let len: usize = if let Some(rest) = header.strip_prefix("Content-Length: ") {
                rest.parse().unwrap_or(0)
            } else {
                continue;
            };

            // Consume the blank line between header and body
            let mut blank = String::new();
            if reader.read_line(&mut blank).unwrap_or(0) == 0 {
                break;
            }

            // Read exactly `len` bytes of JSON body
            let mut body = vec![0u8; len];
            use std::io::Read;
            if reader.read_exact(&mut body).is_err() {
                break;
            }

            if let Ok(text) = String::from_utf8(body) {
                // Emit to frontend as "lsp-message" with the language as prefix
                let event = format!("lsp-message-{}", language);
                let _ = app.emit(&event, text);
            }
        }
    });
}

// ─── Tauri Commands ──────────────────────────────────────────────────────────

/// Start a language server for the given language and workspace root.
/// Returns the list of capabilities reported by the server after initialize.
#[tauri::command]
pub async fn lsp_start(
    language: String,
    workspace_root: String,
    app: AppHandle,
    state: State<'_, LspState>,
) -> Result<String, String> {
    let mut processes = state.processes.lock().unwrap();

    // Already running?
    if processes.contains_key(&language) {
        return Ok("already_running".to_string());
    }

    let (bin, args) = server_command(&language)
        .ok_or_else(|| format!("No language server configured for '{}'", language))?;

    if !server_available(bin) {
        return Err(format!(
            "Language server '{}' not found. Install it to enable LSP for {}.",
            bin, language
        ));
    }

    let mut child = Command::new(bin)
        .args(&args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("Failed to spawn '{}': {}", bin, e))?;

    let stdout = child.stdout.take().unwrap();
    let stdin = child.stdin.take().unwrap();

    // Spawn background reader thread
    spawn_reader(language.clone(), stdout, app.clone());

    // Send LSP initialize request
    let init_msg = serde_json::json!({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "initialize",
        "params": {
            "processId": std::process::id(),
            "rootUri": format!("file://{}", workspace_root),
            "capabilities": {
                "textDocument": {
                    "completion": {
                        "completionItem": {
                            "snippetSupport": true,
                            "documentationFormat": ["plaintext", "markdown"]
                        }
                    },
                    "hover": {
                        "contentFormat": ["plaintext", "markdown"]
                    },
                    "definition": {},
                    "references": {},
                    "documentSymbol": {},
                    "publishDiagnostics": {
                        "relatedInformation": true
                    },
                    "signatureHelp": {
                        "signatureInformation": {
                            "documentationFormat": ["plaintext", "markdown"]
                        }
                    },
                    "rename": {},
                    "codeAction": {}
                },
                "workspace": {
                    "workspaceFolders": true,
                    "symbol": {}
                }
            },
            "workspaceFolders": [{
                "uri": format!("file://{}", workspace_root),
                "name": std::path::Path::new(&workspace_root)
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("workspace")
            }]
        }
    });

    let mut process = LspProcess { child, stdin };
    let encoded = encode_message(&init_msg);
    process
        .stdin
        .write_all(&encoded)
        .map_err(|e| format!("Failed to write to LSP stdin: {}", e))?;

    processes.insert(language.clone(), process);
    Ok("started".to_string())
}

/// Send a JSON-RPC message to the language server for the given language.
#[tauri::command]
pub async fn lsp_send(
    language: String,
    message: String,
    state: State<'_, LspState>,
) -> Result<(), String> {
    let mut processes = state.processes.lock().unwrap();
    let process = processes
        .get_mut(&language)
        .ok_or_else(|| format!("No LSP running for '{}'", language))?;

    let msg: Value = serde_json::from_str(&message)
        .map_err(|e| format!("Invalid JSON-RPC message: {}", e))?;

    let encoded = encode_message(&msg);
    process
        .stdin
        .write_all(&encoded)
        .map_err(|e| format!("LSP write error: {}", e))?;

    Ok(())
}

/// Stop the language server for the given language.
#[tauri::command]
pub async fn lsp_stop(
    language: String,
    state: State<'_, LspState>,
) -> Result<(), String> {
    let mut processes = state.processes.lock().unwrap();
    if let Some(mut process) = processes.remove(&language) {
        let _ = process.child.kill();
    }
    Ok(())
}

/// Check which language servers are installed on this machine.
#[tauri::command]
pub async fn lsp_check_servers() -> Result<HashMap<String, bool>, String> {
    let servers = vec![
        ("typescript", "typescript-language-server"),
        ("rust", "rust-analyzer"),
        ("python", "pylsp"),
        ("go", "gopls"),
        ("css", "vscode-css-language-server"),
        ("html", "vscode-html-language-server"),
        ("json", "vscode-json-language-server"),
    ];

    let mut result = HashMap::new();
    for (lang, bin) in servers {
        result.insert(lang.to_string(), server_available(bin));
    }
    Ok(result)
}
