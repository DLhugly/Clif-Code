use std::process::Command;

#[derive(serde::Serialize)]
pub struct GitFileStatus {
    pub path: String,
    pub status: String,
    pub staged: bool,
}

#[derive(serde::Serialize)]
pub struct GitBranch {
    pub name: String,
    pub is_current: bool,
}

/// Parse a git status porcelain line into one or two GitFileStatus entries.
///
/// When a file has BOTH staged changes (index column) and unstaged changes
/// (worktree column) — e.g. `MM`, `MD`, `AD` — we return two entries:
/// one with `staged: true` and one with `staged: false`.  This lets the UI
/// show the file correctly in both the "Staged" and "Changes" sections, and
/// ensures that `git commit` only commits the already-staged portion.
fn parse_status_line(line: &str) -> Vec<GitFileStatus> {
    if line.len() < 4 {
        return vec![];
    }

    let index_status = match line.chars().nth(0) {
        Some(c) => c,
        None => return vec![],
    };
    let worktree_status = match line.chars().nth(1) {
        Some(c) => c,
        None => return vec![],
    };
    let file_path = line[3..].to_string();

    // Files that are both staged AND have additional unstaged changes:
    // emit two entries so both UI sections show the file.
    let both_staged_and_unstaged = matches!(
        (index_status, worktree_status),
        ('M', 'M')
            | ('M', 'D')
            | ('A', 'M')
            | ('A', 'D')
            | ('R', 'M')
            | ('R', 'D')
            | ('C', 'M')
            | ('C', 'D')
    );

    if both_staged_and_unstaged {
        let staged_status = match index_status {
            'A' => "added",
            'R' => "renamed",
            'C' => "copied",
            _ => "modified",
        };
        let unstaged_status = match worktree_status {
            'D' => "deleted",
            _ => "modified",
        };
        return vec![
            GitFileStatus { path: file_path.clone(), status: staged_status.to_string(), staged: true },
            GitFileStatus { path: file_path, status: unstaged_status.to_string(), staged: false },
        ];
    }

    let (status, staged) = match (index_status, worktree_status) {
        ('?', '?') => ("untracked".to_string(), false),
        ('A', _) => ("added".to_string(), true),
        ('M', ' ') => ("modified".to_string(), true),
        (' ', 'M') => ("modified".to_string(), false),
        ('D', ' ') => ("deleted".to_string(), true),
        (' ', 'D') => ("deleted".to_string(), false),
        ('D', _) => ("deleted".to_string(), true),
        ('R', _) => ("renamed".to_string(), true),
        ('C', _) => ("copied".to_string(), true),
        ('U', _) | (_, 'U') => ("unmerged".to_string(), false),
        ('!', '!') => ("ignored".to_string(), false),
        _ => ("unknown".to_string(), false),
    };

    vec![GitFileStatus {
        path: file_path,
        status,
        staged,
    }]
}

#[tauri::command]
pub fn git_status(path: String) -> Result<Vec<GitFileStatus>, String> {
    let output = Command::new("git")
        .args(["status", "--porcelain"])
        .current_dir(&path)
        .output()
        .map_err(|e| format!("Failed to run git status: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("git status failed: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let statuses: Vec<GitFileStatus> = stdout
        .lines()
        .filter(|line| !line.is_empty())
        .flat_map(|line| parse_status_line(line))
        .collect();

    Ok(statuses)
}

#[tauri::command]
pub fn git_diff(path: String, file: Option<String>) -> Result<String, String> {
    let mut args = vec!["diff".to_string()];

    if let Some(ref file_path) = file {
        args.push("--".to_string());
        args.push(file_path.clone());
    }

    let output = Command::new("git")
        .args(&args)
        .current_dir(&path)
        .output()
        .map_err(|e| format!("Failed to run git diff: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("git diff failed: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    Ok(stdout)
}

#[tauri::command]
pub fn git_diff_cached(path: String) -> Result<String, String> {
    let output = Command::new("git")
        .args(["diff", "--cached"])
        .current_dir(&path)
        .output()
        .map_err(|e| format!("Failed to run git diff --cached: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("git diff --cached failed: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    Ok(stdout)
}

#[tauri::command]
pub fn git_commit(path: String, message: String) -> Result<String, String> {
    // Commit only what is already staged — do NOT run `git add -A`.
    // The caller is responsible for staging files explicitly via git_stage_file.
    let commit_output = Command::new("git")
        .args(["commit", "-m", &message])
        .current_dir(&path)
        .output()
        .map_err(|e| format!("Failed to run git commit: {}", e))?;

    if !commit_output.status.success() {
        let stderr = String::from_utf8_lossy(&commit_output.stderr);
        return Err(format!("git commit failed: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&commit_output.stdout).to_string();
    Ok(stdout)
}

#[tauri::command]
pub fn git_branches(path: String) -> Result<Vec<GitBranch>, String> {
    let output = Command::new("git")
        .args(["branch", "--list"])
        .current_dir(&path)
        .output()
        .map_err(|e| format!("Failed to run git branch: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("git branch failed: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let branches: Vec<GitBranch> = stdout
        .lines()
        .filter(|line| !line.is_empty())
        .map(|line| {
            let is_current = line.starts_with('*');
            let name = line
                .trim_start_matches('*')
                .trim()
                .to_string();
            GitBranch { name, is_current }
        })
        .collect();

    Ok(branches)
}

#[tauri::command]
pub fn git_checkout(path: String, branch: String) -> Result<(), String> {
    let output = Command::new("git")
        .args(["checkout", &branch])
        .current_dir(&path)
        .output()
        .map_err(|e| format!("Failed to run git checkout: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("git checkout failed: {}", stderr));
    }

    Ok(())
}

#[tauri::command]
pub fn git_fetch(path: String) -> Result<String, String> {
    let output = Command::new("git")
        .args(["fetch", "--all"])
        .current_dir(&path)
        .output()
        .map_err(|e| format!("Failed to run git fetch: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("git fetch failed: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    // git fetch writes progress to stderr
    Ok(if stdout.is_empty() { stderr } else { stdout })
}

#[tauri::command]
pub async fn git_pull(path: String) -> Result<String, String> {
    let output = tokio::time::timeout(
        std::time::Duration::from_secs(60),
        tokio::process::Command::new("git")
            .args(["pull"])
            .current_dir(&path)
            .output(),
    )
    .await
    .map_err(|_| "git pull timed out after 60s".to_string())?
    .map_err(|e| format!("Failed to run git pull: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("git pull failed: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    Ok(stdout)
}

#[tauri::command]
pub async fn git_push(path: String) -> Result<String, String> {
    let output = tokio::time::timeout(
        std::time::Duration::from_secs(60),
        tokio::process::Command::new("git")
            .args(["push"])
            .current_dir(&path)
            .output(),
    )
    .await
    .map_err(|_| "git push timed out after 60s".to_string())?
    .map_err(|e| format!("Failed to run git push: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("git push failed: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    Ok(if stdout.is_empty() { stderr } else { stdout })
}

#[tauri::command]
pub fn git_create_branch(path: String, branch: String) -> Result<(), String> {
    let output = Command::new("git")
        .args(["checkout", "-b", &branch])
        .current_dir(&path)
        .output()
        .map_err(|e| format!("Failed to run git checkout -b: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("git checkout -b failed: {}", stderr));
    }

    Ok(())
}

#[tauri::command]
pub fn git_ahead_behind(path: String) -> Result<(usize, usize), String> {
    let output = Command::new("git")
        .args(["rev-list", "--count", "--left-right", "@{upstream}...HEAD"])
        .current_dir(&path)
        .output()
        .map_err(|e| format!("Failed to run git rev-list: {}", e))?;

    if !output.status.success() {
        // No upstream configured — return (0, 0)
        return Ok((0, 0));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let parts: Vec<&str> = stdout.trim().split('\t').collect();
    if parts.len() == 2 {
        let behind = parts[0].parse::<usize>().unwrap_or(0);
        let ahead = parts[1].parse::<usize>().unwrap_or(0);
        Ok((ahead, behind))
    } else {
        Ok((0, 0))
    }
}

#[derive(serde::Serialize)]
pub struct GitDiffStat {
    pub files_changed: usize,
    pub insertions: usize,
    pub deletions: usize,
}

#[tauri::command]
pub fn git_diff_stat(path: String) -> Result<GitDiffStat, String> {
    // Unstaged changes
    let unstaged = Command::new("git")
        .args(["diff", "--shortstat"])
        .current_dir(&path)
        .output()
        .map_err(|e| format!("Failed to run git diff: {}", e))?;

    // Staged changes
    let staged = Command::new("git")
        .args(["diff", "--cached", "--shortstat"])
        .current_dir(&path)
        .output()
        .map_err(|e| format!("Failed to run git diff --cached: {}", e))?;

    let mut files_changed = 0usize;
    let mut insertions = 0usize;
    let mut deletions = 0usize;

    for output in [&unstaged, &staged] {
        let text = String::from_utf8_lossy(&output.stdout);
        let text = text.trim();
        if text.is_empty() {
            continue;
        }
        // Parse: " 3 files changed, 10 insertions(+), 2 deletions(-)"
        for part in text.split(',') {
            let part = part.trim();
            if let Some(num_str) = part.split_whitespace().next() {
                if let Ok(num) = num_str.parse::<usize>() {
                    if part.contains("file") {
                        files_changed += num;
                    } else if part.contains("insertion") {
                        insertions += num;
                    } else if part.contains("deletion") {
                        deletions += num;
                    }
                }
            }
        }
    }

    Ok(GitDiffStat {
        files_changed,
        insertions,
        deletions,
    })
}

#[tauri::command]
pub fn git_unstage(path: String, files: Vec<String>) -> Result<(), String> {
    if files.is_empty() {
        return Ok(());
    }

    let mut args = vec!["reset".to_string(), "HEAD".to_string(), "--".to_string()];
    args.extend(files);

    let output = Command::new("git")
        .args(&args)
        .current_dir(&path)
        .output()
        .map_err(|e| format!("Failed to run git reset: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("git reset failed: {}", stderr));
    }

    Ok(())
}

#[derive(serde::Serialize)]
pub struct GitLogEntry {
    pub hash: String,
    pub short_hash: String,
    pub message: String,
    pub author: String,
    pub date: String,
    pub refs: Vec<String>,
    pub is_head: bool,
    pub parents: Vec<String>,
}

#[tauri::command]
pub fn git_log(path: String, count: Option<usize>) -> Result<Vec<GitLogEntry>, String> {
    let n = count.unwrap_or(50);
    let output = Command::new("git")
        .args([
            "log",
            &format!("--max-count={}", n),
            "--format=%H\x1f%h\x1f%s\x1f%an\x1f%ar\x1f%D\x1f%P",
        ])
        .current_dir(&path)
        .output()
        .map_err(|e| format!("Failed to run git log: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("git log failed: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let entries: Vec<GitLogEntry> = stdout
        .lines()
        .filter(|line| !line.is_empty())
        .map(|line| {
            let parts: Vec<&str> = line.split('\x1f').collect();
            let refs_str = parts.get(5).unwrap_or(&"");
            let refs: Vec<String> = if refs_str.is_empty() {
                vec![]
            } else {
                refs_str.split(", ").map(|s| s.trim().to_string()).collect()
            };
            let is_head = refs.iter().any(|r| r.contains("HEAD"));
            let parents_str = parts.get(6).unwrap_or(&"");
            let parents: Vec<String> = if parents_str.is_empty() {
                vec![]
            } else {
                parents_str.split(' ').map(|s| s.to_string()).collect()
            };

            GitLogEntry {
                hash: parts.first().unwrap_or(&"").to_string(),
                short_hash: parts.get(1).unwrap_or(&"").to_string(),
                message: parts.get(2).unwrap_or(&"").to_string(),
                author: parts.get(3).unwrap_or(&"").to_string(),
                date: parts.get(4).unwrap_or(&"").to_string(),
                refs,
                is_head,
                parents,
            }
        })
        .collect();

    Ok(entries)
}

#[derive(serde::Serialize)]
pub struct GitFileNumstat {
    pub path: String,
    pub insertions: i64,
    pub deletions: i64,
}

#[tauri::command]
pub fn git_diff_numstat(path: String) -> Result<Vec<GitFileNumstat>, String> {
    let mut stats: std::collections::HashMap<String, (i64, i64)> = std::collections::HashMap::new();

    // Unstaged changes
    let unstaged = Command::new("git")
        .args(["diff", "--numstat"])
        .current_dir(&path)
        .output()
        .map_err(|e| format!("Failed to run git diff --numstat: {}", e))?;

    if unstaged.status.success() {
        let stdout = String::from_utf8_lossy(&unstaged.stdout);
        for line in stdout.lines() {
            if let Some(stat) = parse_numstat_line(line) {
                let entry = stats.entry(stat.path.clone()).or_insert((0, 0));
                entry.0 += stat.insertions;
                entry.1 += stat.deletions;
            }
        }
    }

    // Staged changes
    let staged = Command::new("git")
        .args(["diff", "--cached", "--numstat"])
        .current_dir(&path)
        .output()
        .map_err(|e| format!("Failed to run git diff --cached --numstat: {}", e))?;

    if staged.status.success() {
        let stdout = String::from_utf8_lossy(&staged.stdout);
        for line in stdout.lines() {
            if let Some(stat) = parse_numstat_line(line) {
                let entry = stats.entry(stat.path.clone()).or_insert((0, 0));
                entry.0 += stat.insertions;
                entry.1 += stat.deletions;
            }
        }
    }

    let result: Vec<GitFileNumstat> = stats
        .into_iter()
        .map(|(path, (ins, del))| GitFileNumstat {
            path,
            insertions: ins,
            deletions: del,
        })
        .collect();

    Ok(result)
}

fn parse_numstat_line(line: &str) -> Option<GitFileNumstat> {
    let parts: Vec<&str> = line.split('\t').collect();
    if parts.len() < 3 {
        return None;
    }
    // Binary files show "-" for insertions/deletions
    let insertions = parts[0].parse::<i64>().unwrap_or(-1);
    let deletions = parts[1].parse::<i64>().unwrap_or(-1);
    let path = parts[2].to_string();
    Some(GitFileNumstat {
        path,
        insertions,
        deletions,
    })
}

#[tauri::command]
pub fn git_show(path: String, file: String, revision: Option<String>) -> Result<String, String> {
    let rev = revision.unwrap_or_else(|| "HEAD".to_string());
    let spec = format!("{}:{}", rev, file);
    let output = Command::new("git")
        .args(["show", &spec])
        .current_dir(&path)
        .output()
        .map_err(|e| format!("Failed to run git show: {}", e))?;

    if !output.status.success() {
        // File doesn't exist in this revision (new/untracked file)
        return Err("File not found in revision".to_string());
    }

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    Ok(stdout)
}

#[tauri::command]
pub fn git_init(path: String) -> Result<String, String> {
    let output = Command::new("git")
        .args(["init"])
        .current_dir(&path)
        .output()
        .map_err(|e| format!("Failed to run git init: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("git init failed: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    Ok(stdout)
}

#[tauri::command]
pub fn git_remote_url(path: String) -> Result<Option<String>, String> {
    let output = Command::new("git")
        .args(["remote", "get-url", "origin"])
        .current_dir(&path)
        .output()
        .map_err(|e| format!("Failed to run git remote get-url: {}", e))?;

    if !output.status.success() {
        // No remote configured
        return Ok(None);
    }

    let url = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if url.is_empty() {
        return Ok(None);
    }

    // Normalize SSH URLs to HTTPS: git@github.com:user/repo.git -> https://github.com/user/repo
    let normalized = if url.starts_with("git@") {
        url.trim_start_matches("git@")
            .replacen(':', "/", 1)
            .trim_end_matches(".git")
            .to_string()
            .replace("//", "/")
    } else {
        url.trim_end_matches(".git").to_string()
    };

    let https_url = if normalized.starts_with("https://") || normalized.starts_with("http://") {
        normalized
    } else {
        format!("https://{}", normalized)
    };

    Ok(Some(https_url))
}

#[tauri::command]
pub fn git_stage(path: String, files: Vec<String>) -> Result<(), String> {
    if files.is_empty() {
        return Ok(());
    }

    let mut args = vec!["add".to_string()];
    args.extend(files);

    let output = Command::new("git")
        .args(&args)
        .current_dir(&path)
        .output()
        .map_err(|e| format!("Failed to run git add: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("git add failed: {}", stderr));
    }

    Ok(())
}

/// Gather git context for AI agent system prompt
/// Returns: current branch, modified/untracked files, and recent commits
pub fn get_git_context(workspace_dir: &str) -> String {
    let mut context = String::new();

    // Get current branch
    let branch_output = Command::new("git")
        .args(["branch", "--show-current"])
        .current_dir(workspace_dir)
        .output();

    if let Ok(output) = branch_output {
        if output.status.success() {
            let branch = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !branch.is_empty() {
                context.push_str(&format!("Current branch: {}\n", branch));
            }
        }
    }

    // Get modified/untracked files (last 10)
    let status_output = Command::new("git")
        .args(["status", "--porcelain"])
        .current_dir(workspace_dir)
        .output();

    if let Ok(output) = status_output {
        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let files: Vec<&str> = stdout.lines().filter(|l| !l.is_empty()).take(10).collect();
            if !files.is_empty() {
                context.push_str("\nModified/untracked files:\n");
                for file in files {
                    // Parse porcelain format: "XY filename"
                    let file_path = if file.len() > 3 { &file[3..] } else { file };
                    let status_char = file.chars().next().unwrap_or(' ');
                    let status_label = match status_char {
                        'M' => "modified",
                        'A' => "added",
                        'D' => "deleted",
                        '?' => "untracked",
                        'R' => "renamed",
                        _ => "changed",
                    };
                    context.push_str(&format!("  [{}] {}\n", status_label, file_path));
                }
                if stdout.lines().count() > 10 {
                    context.push_str(&format!("  ... and {} more files\n", stdout.lines().count() - 10));
                }
            }
        }
    }

    // Get recent commits (last 5)
    let log_output = Command::new("git")
        .args(["log", "--oneline", "-5"])
        .current_dir(workspace_dir)
        .output();

    if let Ok(output) = log_output {
        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let commits: Vec<&str> = stdout.lines().filter(|l| !l.is_empty()).collect();
            if !commits.is_empty() {
                context.push_str("\nRecent commits:\n");
                for commit in commits {
                    context.push_str(&format!("  {}\n", commit));
                }
            }
        }
    }

    if context.is_empty() {
        "No git repository found or no changes.".to_string()
    } else {
        context
    }
}
