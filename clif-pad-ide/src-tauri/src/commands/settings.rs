use std::fs;
use std::path::PathBuf;

/// Get the path to the settings file
fn get_settings_path() -> Result<PathBuf, String> {
    let home = get_home_dir().ok_or_else(|| "Could not determine home directory".to_string())?;
    let config_dir = home.join(".clif");
    if !config_dir.exists() {
        fs::create_dir_all(&config_dir)
            .map_err(|e| format!("Failed to create config directory: {}", e))?;
    }
    Ok(config_dir.join("settings.json"))
}

/// Helper to get the home directory cross-platform
fn get_home_dir() -> Option<PathBuf> {
    #[cfg(target_os = "macos")]
    {
        std::env::var("HOME").ok().map(PathBuf::from)
    }
    #[cfg(target_os = "windows")]
    {
        std::env::var("USERPROFILE").ok().map(PathBuf::from)
    }
    #[cfg(target_os = "linux")]
    {
        std::env::var("HOME").ok().map(PathBuf::from)
    }
}

#[tauri::command]
pub fn get_settings() -> Result<serde_json::Value, String> {
    let settings_path = get_settings_path()?;

    if !settings_path.exists() {
        // Return default settings
        return Ok(serde_json::json!({
            "theme": "dark",
            "fontSize": 14,
            "fontFamily": "JetBrains Mono, Fira Code, monospace",
            "tabSize": 4,
            "wordWrap": false,
            "minimap": true,
            "lineNumbers": true,
            "aiProvider": "openrouter",
            "aiModel": "anthropic/claude-sonnet-4",
            "autoSave": true,
            "autoSaveDelay": 1000,
        }));
    }

    let content = fs::read_to_string(&settings_path)
        .map_err(|e| format!("Failed to read settings: {}", e))?;

    let settings: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse settings: {}", e))?;

    Ok(settings)
}

#[tauri::command]
pub fn set_settings(settings: serde_json::Value) -> Result<(), String> {
    let settings_path = get_settings_path()?;

    let content = serde_json::to_string_pretty(&settings)
        .map_err(|e| format!("Failed to serialize settings: {}", e))?;

    fs::write(&settings_path, content)
        .map_err(|e| format!("Failed to write settings: {}", e))?;

    Ok(())
}

/// Save agent chat history for a given workspace project
#[tauri::command]
pub fn save_agent_history(workspace_dir: String, data: serde_json::Value) -> Result<(), String> {
    let home = get_home_dir().ok_or("Could not determine home directory")?;
    let sessions_dir = home.join(".clif").join("agent_sessions");
    fs::create_dir_all(&sessions_dir)
        .map_err(|e| format!("Failed to create sessions dir: {}", e))?;

    // Use a hash of the workspace path as filename to avoid path separator issues
    let key = format!("{:x}", md5_hash(&workspace_dir));
    let path = sessions_dir.join(format!("{}.json", key));

    let content = serde_json::to_string(&data)
        .map_err(|e| format!("Failed to serialize: {}", e))?;
    fs::write(&path, content)
        .map_err(|e| format!("Failed to write session: {}", e))?;

    Ok(())
}

/// Load agent chat history for a given workspace project
#[tauri::command]
pub fn load_agent_history(workspace_dir: String) -> Option<serde_json::Value> {
    let home = get_home_dir()?;
    let key = format!("{:x}", md5_hash(&workspace_dir));
    let path = home.join(".clif").join("agent_sessions").join(format!("{}.json", key));
    let content = fs::read_to_string(path).ok()?;
    serde_json::from_str(&content).ok()
}

/// Simple deterministic hash for workspace path → filename
fn md5_hash(s: &str) -> u64 {
    let mut hash: u64 = 14695981039346656037;
    for byte in s.bytes() {
        hash ^= byte as u64;
        hash = hash.wrapping_mul(1099511628211);
    }
    hash
}
