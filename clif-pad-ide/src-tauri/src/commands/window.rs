#[tauri::command]
pub async fn create_window(app: tauri::AppHandle) -> Result<String, String> {
    let label = format!("window-{}", &uuid::Uuid::new_v4().to_string()[..8]);

    tauri::WebviewWindowBuilder::new(
        &app,
        &label,
        tauri::WebviewUrl::App("index.html".into()),
    )
    .title("Clif")
    .inner_size(1400.0, 900.0)
    .build()
    .map_err(|e| format!("Failed to create window: {}", e))?;

    Ok(label)
}
