mod commands;
mod services;
mod state;

use commands::pty::PtyState;
use services::file_watcher::WatcherState;
use tauri::Manager;

fn build_menu(app: &tauri::AppHandle) -> Result<tauri::menu::Menu<tauri::Wry>, tauri::Error> {
    use tauri::menu::{MenuBuilder, SubmenuBuilder, PredefinedMenuItem, MenuItemBuilder};

    let new_window = MenuItemBuilder::with_id("new_window", "New Window")
        .accelerator("CmdOrCtrl+Shift+N")
        .build(app)?;

    let file_menu = SubmenuBuilder::new(app, "File")
        .item(&new_window)
        .separator()
        .item(&PredefinedMenuItem::close_window(app, None)?)
        .item(&PredefinedMenuItem::quit(app, None)?)
        .build()?;

    let edit_menu = SubmenuBuilder::new(app, "Edit")
        .item(&PredefinedMenuItem::undo(app, None)?)
        .item(&PredefinedMenuItem::redo(app, None)?)
        .separator()
        .item(&PredefinedMenuItem::cut(app, None)?)
        .item(&PredefinedMenuItem::copy(app, None)?)
        .item(&PredefinedMenuItem::paste(app, None)?)
        .item(&PredefinedMenuItem::select_all(app, None)?)
        .build()?;

    let window_menu = SubmenuBuilder::new(app, "Window")
        .item(&PredefinedMenuItem::minimize(app, None)?)
        .item(&PredefinedMenuItem::maximize(app, None)?)
        .build()?;

    MenuBuilder::new(app)
        .item(&file_menu)
        .item(&edit_menu)
        .item(&window_menu)
        .build()
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(PtyState::new())
        .manage(WatcherState::new())
        .setup(|app| {
            let menu = build_menu(app.handle())?;
            app.set_menu(menu)?;
            Ok(())
        })
        .on_menu_event(|app, event| {
            if event.id().as_ref() == "new_window" {
                let app = app.clone();
                tauri::async_runtime::spawn(async move {
                    let _ = commands::window::create_window(app).await;
                });
            }
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                let label = window.label().to_string();
                let app = window.app_handle();

                // Clean up PTY sessions for this window
                if let Some(pty_state) = app.try_state::<PtyState>() {
                    pty_state.kill_all_for_window(&label);
                }

                // Clean up file watchers for this window
                if let Some(watcher_state) = app.try_state::<WatcherState>() {
                    services::file_watcher::stop_all_for_window(&watcher_state, &label);
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::fs::read_dir,
            commands::fs::read_file,
            commands::fs::write_file,
            commands::fs::create_file,
            commands::fs::create_dir,
            commands::fs::rename_entry,
            commands::fs::delete_entry,
            commands::fs::watch_dir,
            commands::ai::ai_chat,
            commands::ai::ai_complete,
            commands::ai::get_models,
            commands::ai::set_api_key,
            commands::ai::get_api_key,
            commands::git::git_status,
            commands::git::git_diff,
            commands::git::git_commit,
            commands::git::git_branches,
            commands::git::git_checkout,
            commands::git::git_stage,
            commands::git::git_unstage,
            commands::git::git_diff_stat,
            commands::git::git_diff_numstat,
            commands::git::git_init,
            commands::git::git_log,
            commands::search::search_files,
            commands::claude_code::claude_code_start,
            commands::claude_code::claude_code_send,
            commands::claude_code::claude_code_stop,
            commands::settings::get_settings,
            commands::settings::set_settings,
            commands::pty::pty_spawn,
            commands::pty::pty_write,
            commands::pty::pty_resize,
            commands::pty::pty_kill,
            commands::window::create_window,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
