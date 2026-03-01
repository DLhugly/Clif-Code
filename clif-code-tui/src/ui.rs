//! Pretty printing, colors, diffs, interactive menus.

use crossterm::event::{self, Event, KeyCode, KeyEventKind};
use crossterm::terminal;
use similar::ChangeTag;
use std::io::{self, BufRead, Write};

pub const RESET: &str = "\x1b[0m";
pub const BOLD: &str = "\x1b[1m";
pub const DIM: &str = "\x1b[2m";
pub const ITALIC: &str = "\x1b[3m";
pub const UNDERLINE: &str = "\x1b[4m";
pub const CYAN: &str = "\x1b[36m";
pub const GREEN: &str = "\x1b[32m";
pub const YELLOW: &str = "\x1b[33m";
pub const RED: &str = "\x1b[31m";
pub const MAGENTA: &str = "\x1b[35m";
pub const BLUE: &str = "\x1b[34m";
pub const WHITE: &str = "\x1b[97m";

// Bright variants for more pop
pub const BRIGHT_CYAN: &str = "\x1b[96m";
pub const BRIGHT_GREEN: &str = "\x1b[92m";
pub const BRIGHT_MAGENTA: &str = "\x1b[95m";
pub const BRIGHT_YELLOW: &str = "\x1b[93m";
pub const BRIGHT_BLUE: &str = "\x1b[94m";

// 256-color for gradient effect
const C_BLUE: &str = "\x1b[38;5;39m";   // bright blue
const C_CYAN: &str = "\x1b[38;5;44m";   // teal
const C_TEAL: &str = "\x1b[38;5;43m";   // green-teal
const C_GREEN: &str = "\x1b[38;5;48m";  // bright green
const C_LIME: &str = "\x1b[38;5;83m";   // lime
const C_PURPLE: &str = "\x1b[38;5;141m"; // soft purple

pub fn print_logo() {
    println!();
    println!("  {BOLD}{C_BLUE}   _____ _ _  __ _____          _      {RESET}");
    println!("  {BOLD}{C_CYAN}  / ____| (_)/ _/ ____|        | |     {RESET}");
    println!("  {BOLD}{C_TEAL} | |    | |_| || |     ___   __| | ___ {RESET}");
    println!("  {BOLD}{C_GREEN} | |    | | |  _| |    / _ \\ / _` |/ _ \\{RESET}");
    println!("  {BOLD}{C_LIME} | |____| | | | | |___| (_) | (_| |  __/{RESET}");
    println!("  {BOLD}{C_GREEN}  \\_____|_|_|_|  \\_____\\___/ \\__,_|\\___|{RESET}");
    println!();
}

pub fn print_banner(workspace: &str, backend_name: &str, mode: &str) {
    println!("  {BOLD}{WHITE}AI coding assistant{RESET} {DIM}— works anywhere, ships fast{RESET}");
    println!();

    // Status pills
    let mode_color = match mode {
        "suggest" => YELLOW,
        "full-auto" => RED,
        _ => BRIGHT_GREEN,
    };
    println!(
        "  {BRIGHT_CYAN}\u{25c6}{RESET} {DIM}Model{RESET}  {BOLD}{WHITE}{backend_name}{RESET}    \
         {mode_color}\u{25c6}{RESET} {DIM}Mode{RESET}  {BOLD}{WHITE}{mode}{RESET}"
    );
    println!(
        "  {BRIGHT_MAGENTA}\u{25c6}{RESET} {DIM}Path{RESET}   {workspace}"
    );
    println!();
    println!(
        "  {DIM}Type a task to get started, or {RESET}{BOLD}{BRIGHT_CYAN}/help{RESET}{DIM} for commands{RESET}"
    );
    println!("  {DIM}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}{RESET}");
    println!();
}

pub fn print_prompt() {
    print!("{BOLD}{BRIGHT_GREEN}  \u{276f}{RESET} ");
    io::stdout().flush().unwrap();
}

pub fn print_thinking() {
    print!("{DIM}{ITALIC}\u{2022}\u{2022}\u{2022} thinking{RESET}");
    io::stdout().flush().unwrap();
}

pub fn clear_thinking() {
    print!("\r\x1b[K");
    io::stdout().flush().unwrap();
}

pub fn print_tool_action(action: &str, detail: &str) {
    let icon = match action {
        "read" => "\u{25b6}",   // play triangle
        "write" => "\u{270e}",  // pencil
        "edit" => "\u{270e}",
        "find" => "\u{25c7}",   // diamond outline
        "search" => "\u{2315}", // search
        "list" => "\u{2630}",   // trigram / hamburger
        "run" => "\u{25b8}",    // small play
        "cd" => "\u{2192}",     // arrow
        _ => "\u{2022}",        // bullet
    };
    println!("    {BRIGHT_YELLOW}{icon} {BOLD}{action}{RESET} {DIM}{detail}{RESET}");
}

pub fn print_dim(text: &str) {
    println!("{DIM}{text}{RESET}");
}

pub fn print_success(text: &str) {
    println!("  {BRIGHT_GREEN}\u{2713}{RESET} {GREEN}{text}{RESET}");
}

pub fn print_error(text: &str) {
    println!("  {RED}\u{2717} {BOLD}{text}{RESET}");
}

pub fn print_assistant(text: &str) {
    println!();
    print!("  {BOLD}{BRIGHT_MAGENTA}\u{2726} ClifCode{RESET}  ");
    let rendered = render_markdown(text);
    for (i, line) in rendered.lines().enumerate() {
        if i == 0 {
            println!("{line}");
        } else {
            println!("  {line}");
        }
    }
    println!();
}

/// Convert markdown to ANSI terminal formatting.
fn render_markdown(text: &str) -> String {
    let mut out = String::new();
    let mut in_code_block = false;

    for line in text.lines() {
        if line.trim_start().starts_with("```") {
            in_code_block = !in_code_block;
            if in_code_block {
                // Extract language hint if present
                let lang = line.trim_start().trim_start_matches('`');
                if lang.is_empty() {
                    out.push_str(&format!("{DIM}\u{256d}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}{RESET}\n"));
                } else {
                    out.push_str(&format!("{DIM}\u{256d}\u{2500}\u{2500} {RESET}{BRIGHT_CYAN}{BOLD}{lang}{RESET}{DIM} \u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}{RESET}\n"));
                }
            } else {
                out.push_str(&format!("{DIM}\u{2570}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}{RESET}\n"));
            }
            continue;
        }

        if in_code_block {
            out.push_str(&format!("{DIM}\u{2502}{RESET} {line}\n"));
            continue;
        }

        let trimmed = line.trim_start();

        // Headers: # ## ###
        if trimmed.starts_with("### ") {
            let content = &trimmed[4..];
            out.push_str(&format!("{BOLD}{content}{RESET}\n"));
            continue;
        }
        if trimmed.starts_with("## ") {
            let content = &trimmed[3..];
            out.push_str(&format!("{BOLD}{content}{RESET}\n"));
            continue;
        }
        if trimmed.starts_with("# ") {
            let content = &trimmed[2..];
            out.push_str(&format!("{BOLD}{CYAN}{content}{RESET}\n"));
            continue;
        }

        // Bullet points: - or *
        if trimmed.starts_with("- ") || trimmed.starts_with("* ") {
            let content = &trimmed[2..];
            let rendered_content = render_inline(content);
            out.push_str(&format!("  {CYAN}•{RESET} {rendered_content}\n"));
            continue;
        }

        // Numbered lists: 1. 2. etc
        if trimmed.len() > 2 {
            let first_char = trimmed.chars().next().unwrap_or(' ');
            if first_char.is_ascii_digit() {
                if let Some(dot_pos) = trimmed.find(". ") {
                    if dot_pos <= 2 {
                        let num = &trimmed[..dot_pos + 1];
                        let content = &trimmed[dot_pos + 2..];
                        let rendered_content = render_inline(content);
                        out.push_str(&format!("  {CYAN}{num}{RESET} {rendered_content}\n"));
                        continue;
                    }
                }
            }
        }

        // Regular line — process inline formatting
        let rendered_line = render_inline(line);
        out.push_str(&rendered_line);
        out.push('\n');
    }

    // Remove trailing newline
    if out.ends_with('\n') {
        out.pop();
    }
    out
}

/// Render inline markdown: **bold**, *italic*, `code`, [links](url)
pub fn render_inline(text: &str) -> String {
    let mut out = String::new();
    let chars: Vec<char> = text.chars().collect();
    let len = chars.len();
    let mut i = 0;

    while i < len {
        // **bold**
        if i + 1 < len && chars[i] == '*' && chars[i + 1] == '*' {
            if let Some(end) = find_closing(&chars, i + 2, &['*', '*']) {
                let content: String = chars[i + 2..end].iter().collect();
                out.push_str(&format!("{BOLD}{content}{RESET}"));
                i = end + 2;
                continue;
            }
        }

        // `code`
        if chars[i] == '`' {
            if let Some(end) = find_single_closing(&chars, i + 1, '`') {
                let content: String = chars[i + 1..end].iter().collect();
                out.push_str(&format!("{CYAN}{content}{RESET}"));
                i = end + 1;
                continue;
            }
        }

        // *italic* (single star, not **)
        if chars[i] == '*' && (i + 1 >= len || chars[i + 1] != '*') {
            if let Some(end) = find_single_closing(&chars, i + 1, '*') {
                let content: String = chars[i + 1..end].iter().collect();
                out.push_str(&format!("{DIM}{content}{RESET}"));
                i = end + 1;
                continue;
            }
        }

        out.push(chars[i]);
        i += 1;
    }

    out
}

/// Find closing ** pair
fn find_closing(chars: &[char], start: usize, pattern: &[char; 2]) -> Option<usize> {
    let len = chars.len();
    let mut i = start;
    while i + 1 < len {
        if chars[i] == pattern[0] && chars[i + 1] == pattern[1] {
            return Some(i);
        }
        i += 1;
    }
    None
}

/// Find closing single char
fn find_single_closing(chars: &[char], start: usize, ch: char) -> Option<usize> {
    for i in start..chars.len() {
        if chars[i] == ch {
            return Some(i);
        }
    }
    None
}

/// Print token usage and estimated cost for a turn
pub fn print_usage(prompt_tokens: usize, completion_tokens: usize) {
    let total = prompt_tokens + completion_tokens;
    let cost = (prompt_tokens as f64 * 3.0 + completion_tokens as f64 * 15.0) / 1_000_000.0;

    let total_str = if total >= 1000 {
        format!("{:.1}k", total as f64 / 1000.0)
    } else {
        format!("{total}")
    };

    println!(
        "  {DIM}\u{2219} {total_str} tokens  \u{2219} ~${cost:.4}{RESET}"
    );
}

/// Print cumulative session cost summary
pub fn print_session_cost(prompt_tokens: usize, completion_tokens: usize) {
    let total = prompt_tokens + completion_tokens;
    let cost = (prompt_tokens as f64 * 3.0 + completion_tokens as f64 * 15.0) / 1_000_000.0;

    let total_str = if total >= 1000 {
        format!("{:.1}k", total as f64 / 1000.0)
    } else {
        format!("{total}")
    };

    println!();
    println!("  {BOLD}{WHITE}\u{2261} Session Usage{RESET}");
    println!("  {DIM}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}{RESET}");
    println!("  {BRIGHT_CYAN}\u{25b8}{RESET} {DIM}Prompt:{RESET}     {BOLD}{prompt_tokens}{RESET}");
    println!("  {BRIGHT_MAGENTA}\u{25b8}{RESET} {DIM}Completion:{RESET} {BOLD}{completion_tokens}{RESET}");
    println!("  {BRIGHT_GREEN}\u{25b8}{RESET} {DIM}Total:{RESET}      {BOLD}{total_str}{RESET}");
    println!("  {BRIGHT_YELLOW}\u{25b8}{RESET} {DIM}Cost:{RESET}       {BOLD}${cost:.4}{RESET}");
    println!();
}

pub fn print_turn_indicator(turn: usize, max: usize) {
    // Color the turn number: green early, yellow mid, red near limit
    let color = if turn <= max / 3 {
        BRIGHT_GREEN
    } else if turn <= 2 * max / 3 {
        BRIGHT_YELLOW
    } else {
        RED
    };
    print!("  {DIM}[{RESET}{color}{BOLD}{turn}{RESET}{DIM}/{max}]{RESET} ");
    io::stdout().flush().unwrap();
}

/// Print a colored unified diff. Returns false if old == new.
pub fn print_diff(path: &str, old: &str, new: &str) -> bool {
    let diff = similar::TextDiff::from_lines(old, new);
    let has_changes = diff
        .iter_all_changes()
        .any(|c| c.tag() != ChangeTag::Equal);
    if !has_changes {
        return false;
    }
    println!("    {DIM}--- {path}{RESET}");
    println!("    {DIM}+++ {path}{RESET}");
    for change in diff.iter_all_changes() {
        match change.tag() {
            ChangeTag::Delete => print!("    {RED}-{change}{RESET}"),
            ChangeTag::Insert => print!("    {GREEN}+{change}{RESET}"),
            ChangeTag::Equal => print!("     {change}"),
        }
    }
    true
}

/// Show a collapsed diff summary in auto-edit mode.
/// User can press Ctrl+O to expand the full diff before it auto-applies.
/// Returns false if old == new (no changes).
pub fn print_diff_collapsible(path: &str, old: &str, new: &str) -> bool {
    let diff = similar::TextDiff::from_lines(old, new);
    let mut adds: usize = 0;
    let mut dels: usize = 0;
    let changes: Vec<_> = diff.iter_all_changes().collect();
    for c in &changes {
        match c.tag() {
            ChangeTag::Insert => adds += 1,
            ChangeTag::Delete => dels += 1,
            _ => {}
        }
    }
    if adds == 0 && dels == 0 {
        return false;
    }

    // Show compact summary with expand hint
    print!(
        "    {DIM}{path}:{RESET} {GREEN}+{adds}{RESET} {RED}-{dels}{RESET}  {DIM}[{RESET}{CYAN}Ctrl+O{RESET}{DIM} to expand diff]{RESET}"
    );
    io::stdout().flush().unwrap();

    // Brief poll for Ctrl+O (1.5 seconds)
    let expanded = poll_for_ctrl_o(std::time::Duration::from_millis(1500));

    // Clear the hint line
    print!("\r\x1b[2K");
    io::stdout().flush().unwrap();

    if expanded {
        // Show full diff
        println!("    {DIM}--- {path}{RESET}");
        println!("    {DIM}+++ {path}{RESET}");
        for change in &changes {
            match change.tag() {
                ChangeTag::Delete => print!("    {RED}-{change}{RESET}"),
                ChangeTag::Insert => print!("    {GREEN}+{change}{RESET}"),
                ChangeTag::Equal => print!("     {change}"),
            }
        }
    } else {
        // Just reprint compact summary without the hint
        println!(
            "    {DIM}{path}:{RESET} {GREEN}+{adds}{RESET} {RED}-{dels}{RESET}"
        );
    }
    true
}

/// Poll for Ctrl+O keypress within a timeout. Returns true if pressed.
fn poll_for_ctrl_o(timeout: std::time::Duration) -> bool {
    if terminal::enable_raw_mode().is_err() {
        return false;
    }

    let result = if event::poll(timeout).unwrap_or(false) {
        if let Ok(Event::Key(key)) = event::read() {
            // Ctrl+O = KeyCode::Char('o') with ctrl modifier
            key.kind == KeyEventKind::Press
                && key.code == KeyCode::Char('o')
                && key.modifiers.contains(crossterm::event::KeyModifiers::CONTROL)
        } else {
            false
        }
    } else {
        false
    };

    terminal::disable_raw_mode().ok();
    result
}

/// Prompt for text input
pub fn prompt_input(label: &str) -> String {
    print!("{BOLD}{CYAN}{label}{RESET} ");
    io::stdout().flush().unwrap();
    let mut input = String::new();
    io::stdin().lock().read_line(&mut input).unwrap_or(0);
    input.trim().to_string()
}

/// Prompt with a default value
pub fn prompt_input_default(label: &str, default: &str) -> String {
    print!("{BOLD}{CYAN}{label}{RESET} {DIM}({default}){RESET} ");
    io::stdout().flush().unwrap();
    let mut input = String::new();
    io::stdin().lock().read_line(&mut input).unwrap_or(0);
    let input = input.trim();
    if input.is_empty() {
        default.to_string()
    } else {
        input.to_string()
    }
}

/// Confirm yes/no (default yes)
pub fn confirm(prompt: &str) -> bool {
    print!("  {BOLD}{prompt}{RESET} {DIM}[Y/n]{RESET} ");
    io::stdout().flush().unwrap();
    let mut input = String::new();
    io::stdin().lock().read_line(&mut input).unwrap_or(0);
    let input = input.trim().to_lowercase();
    input.is_empty() || input == "y" || input == "yes"
}

/// Render a single completed line during streaming with markdown formatting.
/// Returns the ANSI-formatted string ready for printing.
pub fn render_streaming_line(line: &str, in_code_block: bool) -> String {
    if in_code_block {
        return format!("{DIM}\u{2502}{RESET} {line}");
    }

    let trimmed = line.trim_start();

    // Code block fences
    if trimmed.starts_with("```") {
        let lang = trimmed.trim_start_matches('`');
        if !lang.is_empty() {
            return format!("{DIM}\u{256d}\u{2500}\u{2500} {RESET}{BRIGHT_CYAN}{BOLD}{lang}{RESET}{DIM} \u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}{RESET}");
        }
        return format!("{DIM}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}{RESET}");
    }

    // Headers
    if trimmed.starts_with("### ") {
        let content = &trimmed[4..];
        return format!("  {BOLD}{content}{RESET}");
    }
    if trimmed.starts_with("## ") {
        let content = &trimmed[3..];
        return format!("  {BOLD}{content}{RESET}");
    }
    if trimmed.starts_with("# ") {
        let content = &trimmed[2..];
        return format!("  {BOLD}{CYAN}{content}{RESET}");
    }

    // Bullet points
    if trimmed.starts_with("- ") || trimmed.starts_with("* ") {
        let content = &trimmed[2..];
        let rendered = render_inline(content);
        return format!("    {CYAN}•{RESET} {rendered}");
    }

    // Numbered lists
    if trimmed.len() > 2 {
        let first_char = trimmed.chars().next().unwrap_or(' ');
        if first_char.is_ascii_digit() {
            if let Some(dot_pos) = trimmed.find(". ") {
                if dot_pos <= 2 {
                    let num = &trimmed[..dot_pos + 1];
                    let content = &trimmed[dot_pos + 2..];
                    let rendered = render_inline(content);
                    return format!("    {CYAN}{num}{RESET} {rendered}");
                }
            }
        }
    }

    // Regular text with inline formatting
    format!("  {}", render_inline(line))
}

/// Arrow-key interactive selector. Returns chosen index, or None on Escape.
pub fn select_menu(title: &str, items: &[&str]) -> Option<usize> {
    let mut selected: usize = 0;

    println!("  {BOLD}{WHITE}{title}{RESET}");
    println!("  {DIM}\u{2191}\u{2193} navigate  \u{21b5} select  esc cancel{RESET}");
    println!();

    fn draw_items(items: &[&str], selected: usize) {
        for (i, item) in items.iter().enumerate() {
            if i == selected {
                println!("  {BRIGHT_CYAN}{BOLD}\u{276f} {item}{RESET}");
            } else {
                println!("    {DIM}{item}{RESET}");
            }
        }
    }

    draw_items(items, selected);
    terminal::enable_raw_mode().ok()?;

    loop {
        if let Ok(Event::Key(key)) = event::read() {
            if key.kind != KeyEventKind::Press {
                continue;
            }
            match key.code {
                KeyCode::Up | KeyCode::Char('k') => {
                    if selected > 0 {
                        selected -= 1;
                    }
                }
                KeyCode::Down | KeyCode::Char('j') => {
                    if selected < items.len() - 1 {
                        selected += 1;
                    }
                }
                KeyCode::Enter => {
                    terminal::disable_raw_mode().ok();
                    let lines_to_clear = items.len() + 3;
                    for _ in 0..lines_to_clear {
                        print!("\x1b[A\x1b[2K");
                    }
                    io::stdout().flush().unwrap();
                    println!("  {BRIGHT_CYAN}\u{2713}{RESET} {BOLD}{}{RESET}", items[selected]);
                    println!();
                    return Some(selected);
                }
                KeyCode::Esc | KeyCode::Char('q') => {
                    terminal::disable_raw_mode().ok();
                    return None;
                }
                _ => {}
            }

            for _ in 0..items.len() {
                print!("\x1b[A\x1b[2K");
            }
            io::stdout().flush().unwrap();
            draw_items(items, selected);
            io::stdout().flush().unwrap();
        }
    }
}
