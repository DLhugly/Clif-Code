//! Regex patterns and filename classifiers used by the PR classifier.

use regex::Regex;
use std::path::Path;
use std::sync::OnceLock;

fn re(pattern: &str) -> Regex {
    Regex::new(pattern).expect("valid regex")
}

pub fn destructive_sql_re() -> &'static Regex {
    static R: OnceLock<Regex> = OnceLock::new();
    R.get_or_init(|| {
        re(r"(?i)\b(DROP\s+(TABLE|COLUMN|DATABASE|INDEX|VIEW|SCHEMA)|TRUNCATE\s+TABLE|DELETE\s+FROM\s+\w+\s*(;|$)|ALTER\s+TABLE\s+\w+\s+DROP)\b")
    })
}

pub fn schema_ddl_re() -> &'static Regex {
    static R: OnceLock<Regex> = OnceLock::new();
    R.get_or_init(|| {
        re(r"(?i)\b(CREATE\s+(TABLE|INDEX|VIEW|TYPE|FUNCTION|PROCEDURE|TRIGGER)|ALTER\s+(TABLE|COLUMN|INDEX))\b")
    })
}

pub fn auth_re() -> &'static Regex {
    static R: OnceLock<Regex> = OnceLock::new();
    R.get_or_init(|| {
        re(r"(?i)\b(bcrypt|scrypt|argon2|passport|jsonwebtoken|jwt\.(sign|verify|decode)|oauth2?|authorize|authenticate|getSession|setSession|cookie\.sign|csrf|csp|same-?site|sso|saml)\b")
    })
}

pub fn payment_re() -> &'static Regex {
    static R: OnceLock<Regex> = OnceLock::new();
    R.get_or_init(|| {
        re(r"(?i)\b(stripe|braintree|paypal|squareup|plaid|chargebee|adyen|checkout\.com|invoice|refund|charge\(|createPayment|subscription|billing|price_|line_items|webhook)\b")
    })
}

pub fn crypto_re() -> &'static Regex {
    static R: OnceLock<Regex> = OnceLock::new();
    R.get_or_init(|| {
        re(r"(?i)\b(createCipher|createDecipheriv|randomBytes|createHash|createHmac|pbkdf2|scrypt|ed25519|rsa|ecdsa|getRandomValues|crypto\.subtle)\b")
    })
}

pub fn removed_error_handling_re() -> &'static Regex {
    static R: OnceLock<Regex> = OnceLock::new();
    R.get_or_init(|| re(r"^\s*(}\s*catch\b|except\b|rescue\b|\.catch\(|throw\s|panic!|unwrap\()"))
}

pub fn exported_symbol_re() -> &'static Regex {
    static R: OnceLock<Regex> = OnceLock::new();
    R.get_or_init(|| {
        re(r"^\s*(export\s+(default\s+|async\s+)?(function|class|const|let|interface|type|enum)|pub\s+(async\s+)?(fn|struct|enum|trait|type|const)|public\s+(class|interface|enum)|module\.exports\.\w+\s*=)")
    })
}

pub fn risk_keyword_re() -> &'static Regex {
    static R: OnceLock<Regex> = OnceLock::new();
    R.get_or_init(|| {
        re(r"(?i)\b(hotfix|emergency|bypass|hack\b|XXX|temp\s*fix|quick\s*fix|workaround|YOLO)\b")
    })
}

pub fn breaking_change_re() -> &'static Regex {
    static R: OnceLock<Regex> = OnceLock::new();
    R.get_or_init(|| re(r"(?m)^(BREAKING CHANGE:|\w+(\(.+\))?!:\s)"))
}

// ============================================================================
// Filename classification
// ============================================================================

pub fn is_secrets_file(path: &str) -> bool {
    let name = Path::new(path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("");
    let lower = name.to_lowercase();
    lower.starts_with(".env")
        || lower.ends_with(".pem")
        || lower.ends_with(".key")
        || lower.starts_with("id_rsa")
        || lower.starts_with("id_ed25519")
        || lower.ends_with(".p12")
        || lower.ends_with(".pfx")
        || lower == ".npmrc"
        || lower == ".pypirc"
        || lower.starts_with("credentials")
        || lower.starts_with("secrets")
        || path.contains("/secrets/")
}

pub fn is_ci_config(path: &str) -> bool {
    path.starts_with(".github/workflows/")
        || path == ".gitlab-ci.yml"
        || path.starts_with(".circleci/")
        || path == "Jenkinsfile"
        || path == ".travis.yml"
        || path == "bitbucket-pipelines.yml"
        || path == "azure-pipelines.yml"
        || path == "cloudbuild.yaml"
        || path == "appveyor.yml"
}

pub fn is_infra_file(path: &str) -> bool {
    let lower = path.to_lowercase();
    lower.ends_with(".tf")
        || lower.ends_with(".tfvars")
        || lower.starts_with("dockerfile")
        || lower.ends_with("/dockerfile")
        || lower == "dockerfile"
        || lower.contains("docker-compose")
        || lower.starts_with("helm/")
        || lower.contains("/helm/")
        || lower.starts_with("k8s/")
        || lower.contains("/kubernetes/")
        || lower.starts_with("pulumi.")
        || lower.starts_with("ansible/")
}

pub fn is_dependency_manifest(path: &str) -> bool {
    let name = Path::new(path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("");
    matches!(
        name,
        "package.json"
            | "Cargo.toml"
            | "requirements.txt"
            | "go.mod"
            | "Gemfile"
            | "pyproject.toml"
            | "composer.json"
            | "pubspec.yaml"
            | "build.gradle"
            | "build.gradle.kts"
            | "Podfile"
            | "mix.exs"
    )
}

pub fn is_migration_file(path: &str) -> bool {
    let lower = path.to_lowercase();
    lower.contains("/migrations/")
        || lower.starts_with("migrations/")
        || lower.contains("/migration/")
        || lower.ends_with(".sql")
        || lower.ends_with("prisma/schema.prisma")
        || lower.contains("/alembic/versions/")
}

pub fn is_test_file(path: &str) -> bool {
    let lower = path.to_lowercase();
    lower.contains("/test/")
        || lower.contains("/tests/")
        || lower.contains("__tests__")
        || lower.contains(".test.")
        || lower.contains(".spec.")
        || lower.contains("_test.")
        || lower.ends_with("_test.go")
        || lower.ends_with(".tests.cs")
}

pub fn is_content_file(path: &str) -> bool {
    let lower = path.to_lowercase();
    lower.ends_with(".md")
        || lower.ends_with(".mdx")
        || lower.ends_with(".rst")
        || lower.ends_with(".txt")
        || lower.starts_with("docs/")
        || lower.contains("/docs/")
        || lower.starts_with("content/")
        || lower.contains("/content/")
        || lower.starts_with("copy/")
}

pub fn is_lock_or_generated(path: &str) -> bool {
    let name = Path::new(path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("");
    matches!(
        name,
        "package-lock.json"
            | "yarn.lock"
            | "pnpm-lock.yaml"
            | "Cargo.lock"
            | "Gemfile.lock"
            | "poetry.lock"
            | "composer.lock"
    )
}

pub fn is_k8s_yaml(path: &str, content: &str) -> bool {
    if !path.ends_with(".yaml") && !path.ends_with(".yml") {
        return false;
    }
    content.contains("apiVersion:") && content.contains("kind:")
}
