//! Configuration persistence and interactive setup.

use crate::ui;
use std::path::PathBuf;

pub struct ProviderInfo {
    pub name: &'static str,
    pub url: &'static str,
    pub default_model: &'static str,
    pub needs_key: bool,
}

pub const PROVIDERS: &[ProviderInfo] = &[
    ProviderInfo {
        name: "OpenRouter",
        url: "https://openrouter.ai/api/v1",
        default_model: "anthropic/claude-sonnet-4",
        needs_key: true,
    },
    ProviderInfo {
        name: "OpenAI",
        url: "https://api.openai.com/v1",
        default_model: "gpt-4o",
        needs_key: true,
    },
    ProviderInfo {
        name: "Anthropic",
        url: "https://api.anthropic.com/v1",
        default_model: "claude-sonnet-4-20250514",
        needs_key: true,
    },
    ProviderInfo {
        name: "Ollama (local)",
        url: "http://localhost:11434/v1",
        default_model: "qwen2.5-coder:7b",
        needs_key: false,
    },
    ProviderInfo {
        name: "Custom endpoint",
        url: "",
        default_model: "",
        needs_key: true,
    },
];

pub fn config_dir() -> PathBuf {
    let home = std::env::var("HOME").unwrap_or_else(|_| ".".into());
    PathBuf::from(home).join(".clifcode")
}

pub fn config_path() -> PathBuf {
    config_dir().join("config.json")
}

pub fn load_config() -> serde_json::Value {
    let path = config_path();
    if path.exists() {
        let text = std::fs::read_to_string(&path).unwrap_or_default();
        serde_json::from_str(&text).unwrap_or_else(|_| serde_json::json!({}))
    } else {
        serde_json::json!({})
    }
}

pub fn save_config(config: &serde_json::Value) {
    let dir = config_dir();
    let _ = std::fs::create_dir_all(&dir);
    let text = serde_json::to_string_pretty(config).unwrap_or_default();
    let _ = std::fs::write(config_path(), text);
}

pub fn saved_api_key() -> Option<String> {
    load_config()
        .get("api_key")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
}

pub fn saved_api_model() -> Option<String> {
    load_config()
        .get("api_model")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
}

pub fn saved_api_url() -> Option<String> {
    load_config()
        .get("api_url")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
}

/// Interactive first-run setup. Returns (key, url, model) or None on cancel.
pub fn interactive_setup() -> Option<(String, String, String)> {
    println!();
    println!("  {}{}Setup{}", ui::BOLD, ui::YELLOW, ui::RESET);
    println!(
        "  {}─────────────────────────────────────────{}",
        ui::DIM, ui::RESET
    );
    println!();

    let names: Vec<&str> = PROVIDERS.iter().map(|p| p.name).collect();
    let choice = ui::select_menu("Choose a provider:", &names)?;

    let provider = &PROVIDERS[choice];

    let url = if provider.url.is_empty() {
        let u = ui::prompt_input("  API base URL:");
        if u.is_empty() {
            println!("  {}No URL — skipping.{}", ui::DIM, ui::RESET);
            return None;
        }
        u
    } else {
        provider.url.to_string()
    };

    let key = if provider.needs_key {
        let k = ui::prompt_input("  API key:");
        if k.is_empty() {
            println!("  {}No key — skipping.{}", ui::DIM, ui::RESET);
            return None;
        }
        k
    } else {
        String::new()
    };

    let model = if provider.default_model.is_empty() {
        ui::prompt_input("  Model name:")
    } else {
        ui::prompt_input_default("  Model:", provider.default_model)
    };

    if model.is_empty() {
        println!("  {}No model — skipping.{}", ui::DIM, ui::RESET);
        return None;
    }

    let mut config = load_config();
    config["provider"] = serde_json::json!(provider.name);
    config["api_key"] = serde_json::json!(key);
    config["api_url"] = serde_json::json!(url);
    config["api_model"] = serde_json::json!(model);
    save_config(&config);

    println!();
    println!(
        "  {}Saved to ~/.clifcode/config.json{}",
        ui::GREEN, ui::RESET
    );

    Some((key, url, model))
}
