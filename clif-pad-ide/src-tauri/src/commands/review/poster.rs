use super::driver::{GhCliDriver, PostedAction, ReviewDriver};

pub fn post_review(
    workspace_dir: &str,
    pr_number: i64,
    action: PostedAction,
    body: &str,
) -> Result<(), String> {
    let driver = GhCliDriver::new(workspace_dir.to_string());
    driver.post_review(pr_number, action, body)
}

pub fn parse_action(raw: &str) -> Result<PostedAction, String> {
    match raw {
        "comment" => Ok(PostedAction::Comment),
        "approve" => Ok(PostedAction::Approve),
        "request_changes" => Ok(PostedAction::RequestChanges),
        other => Err(format!("unknown review action: {}", other)),
    }
}
