use base64::Engine;
use serde::Serialize;
use std::collections::HashSet;
use std::fs;
use std::io::Write;
use std::path::{Component, Path, PathBuf};
use std::sync::Mutex;
use tauri::Manager;
use tauri_plugin_dialog::DialogExt;

mod st_backup_import;

/// 文件库(FileVault)的 Rust 侧原语：列目录/读写文本与二进制/删除/改名 + 应用配置读写。
/// 策略与映射逻辑全部在 TS 层（src/lib/vault/），这里保持薄且可单测。
/// 铁律：删除类命令只删调用方点名的单个文件/空目录，绝不递归删——"不认识的文件永不删改"。

#[derive(Default)]
struct AuthorizedRootSet {
    roots: HashSet<PathBuf>,
    persistent: HashSet<PathBuf>,
    temporary: HashSet<PathBuf>,
}

#[derive(Default)]
struct AuthorizedRoots {
    state: Mutex<AuthorizedRootSet>,
}

impl AuthorizedRoots {
    fn authorize_inner(&self, root: &Path, persistent: bool) -> Result<PathBuf, String> {
        let metadata = fs::metadata(root)
            .map_err(|e| format!("授权目录不存在或无法访问 {}: {e}", root.display()))?;
        if !metadata.is_dir() {
            return Err(format!("授权路径不是文件夹: {}", root.display()));
        }
        let canonical = fs::canonicalize(root)
            .map_err(|e| format!("解析授权目录失败 {}: {e}", root.display()))?;
        let mut state = self
            .state
            .lock()
            .map_err(|_| "文件访问授权状态已损坏".to_string())?;
        state.roots.insert(canonical.clone());
        if persistent {
            state.persistent.insert(canonical.clone());
        }
        Ok(canonical)
    }

    fn authorize(&self, root: &Path) -> Result<PathBuf, String> {
        self.authorize_inner(root, false)
    }

    fn authorize_temporary(&self, root: &Path) -> Result<PathBuf, String> {
        let canonical = self.authorize_inner(root, false)?;
        let mut state = self
            .state
            .lock()
            .map_err(|_| "文件访问授权状态已损坏".to_string())?;
        state.temporary.insert(canonical.clone());
        Ok(canonical)
    }

    fn revoke_temporary(&self, root: &Path) -> Result<PathBuf, String> {
        let canonical = fs::canonicalize(root)
            .map_err(|e| format!("解析临时导入目录失败 {}: {e}", root.display()))?;
        let mut state = self
            .state
            .lock()
            .map_err(|_| "文件访问授权状态已损坏".to_string())?;
        if !state.temporary.remove(&canonical) {
            return Err(format!("拒绝清理非本次导入的临时目录: {}", root.display()));
        }
        state.roots.remove(&canonical);
        Ok(canonical)
    }

    fn authorize_persistent(&self, root: &Path) -> Result<PathBuf, String> {
        self.authorize_inner(root, true)
    }

    fn persistent_roots(&self) -> Result<Vec<PathBuf>, String> {
        let state = self
            .state
            .lock()
            .map_err(|_| "文件访问授权状态已损坏".to_string())?;
        let mut roots = state.persistent.iter().cloned().collect::<Vec<_>>();
        roots.sort();
        Ok(roots)
    }

    fn resolve_root(&self, root: &str) -> Result<PathBuf, String> {
        let canonical =
            fs::canonicalize(root).map_err(|e| format!("读取根目录失败 {root}: {e}"))?;
        let state = self
            .state
            .lock()
            .map_err(|_| "文件访问授权状态已损坏".to_string())?;
        if state.roots.contains(&canonical) {
            Ok(canonical)
        } else {
            Err(format!("拒绝访问未授权目录: {root}"))
        }
    }

    fn ensure_contains(&self, path: &Path) -> Result<(), String> {
        let state = self
            .state
            .lock()
            .map_err(|_| "文件访问授权状态已损坏".to_string())?;
        if state.roots.iter().any(|root| path.starts_with(root)) {
            Ok(())
        } else {
            Err(format!("拒绝访问未授权路径: {}", path.display()))
        }
    }
}

#[derive(Serialize, Debug, PartialEq)]
pub struct DirEntryInfo {
    pub name: String,
    pub is_dir: bool,
    pub is_symlink: bool,
    pub size: u64,
    pub modified_at: Option<u64>,
}

fn list_dir_impl(path: &Path) -> Result<Vec<DirEntryInfo>, String> {
    let mut out = Vec::new();
    let entries =
        fs::read_dir(path).map_err(|e| format!("读取目录失败 {}: {e}", path.display()))?;
    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let meta = fs::symlink_metadata(entry.path()).map_err(|e| e.to_string())?;
        let is_symlink = meta.file_type().is_symlink();
        let modified_at = meta
            .modified()
            .ok()
            .and_then(|value| value.duration_since(std::time::UNIX_EPOCH).ok())
            .and_then(|duration| u64::try_from(duration.as_millis()).ok());
        out.push(DirEntryInfo {
            name: entry.file_name().to_string_lossy().into_owned(),
            is_dir: !is_symlink && meta.is_dir(),
            is_symlink,
            size: if is_symlink || meta.is_dir() {
                0
            } else {
                meta.len()
            },
            modified_at,
        });
    }
    out.sort_by(|a, b| (b.is_dir, a.name.to_lowercase()).cmp(&(a.is_dir, b.name.to_lowercase())));
    Ok(out)
}

fn read_text_impl(path: &Path) -> Result<String, String> {
    fs::read_to_string(path).map_err(|e| format!("读取文件失败 {}: {e}", path.display()))
}

fn write_bytes_atomic(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| format!("目标路径没有父目录: {}", path.display()))?;
    fs::create_dir_all(parent).map_err(|e| format!("创建目录失败 {}: {e}", parent.display()))?;
    let file_name = path
        .file_name()
        .ok_or_else(|| format!("目标路径没有文件名: {}", path.display()))?
        .to_string_lossy();
    let nonce = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| format!("生成临时文件名失败: {e}"))?
        .as_nanos();

    for attempt in 0..32 {
        let tmp = parent.join(format!(
            ".{file_name}.ste-tmp-{}-{nonce}-{attempt}",
            std::process::id()
        ));
        let mut file = match fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&tmp)
        {
            Ok(file) => file,
            Err(err) if err.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(err) => return Err(format!("创建临时文件失败 {}: {err}", tmp.display())),
        };
        if let Err(err) = file.write_all(bytes).and_then(|_| file.sync_all()) {
            drop(file);
            let _ = fs::remove_file(&tmp);
            return Err(format!("写入失败 {}: {err}", tmp.display()));
        }
        drop(file);
        if let Err(err) = fs::rename(&tmp, path) {
            let _ = fs::remove_file(&tmp);
            return Err(format!("替换失败 {}: {err}", path.display()));
        }
        return Ok(());
    }
    Err(format!("无法创建唯一临时文件: {}", path.display()))
}

fn read_binary_impl(path: &Path) -> Result<String, String> {
    let bytes = fs::read(path).map_err(|e| format!("读取文件失败 {}: {e}", path.display()))?;
    Ok(base64::engine::general_purpose::STANDARD.encode(bytes))
}

fn write_binary_impl(path: &Path, b64: &str) -> Result<(), String> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(b64)
        .map_err(|e| format!("base64 解码失败: {e}"))?;
    write_bytes_atomic(path, &bytes)
}

/// 只删单个文件；目录走 remove_empty_dir_impl，永不递归删。
fn remove_file_impl(path: &Path) -> Result<(), String> {
    fs::remove_file(path).map_err(|e| format!("删除文件失败 {}: {e}", path.display()))
}

/// 只删空目录；非空时静默保留（返回 false）——里面可能有用户自己放的文件。
/// 目录本来就不存在同样返回 false：删除要幂等，否则调用方「顺手清理可能存在的子目录」
/// 会在子目录从未创建时炸掉整个删除流程（明明文件已经删干净了却报失败）。
fn remove_empty_dir_impl(path: &Path) -> Result<bool, String> {
    match fs::remove_dir(path) {
        Ok(()) => Ok(true),
        Err(e) => {
            let already_done = e.kind() == std::io::ErrorKind::NotFound
                || e.raw_os_error() == Some(145) // Windows: ERROR_DIR_NOT_EMPTY
                || e.kind() == std::io::ErrorKind::DirectoryNotEmpty;
            if already_done {
                Ok(false)
            } else {
                Err(format!("删除目录失败 {}: {e}", path.display()))
            }
        }
    }
}

fn rename_impl(from: &Path, to: &Path) -> Result<(), String> {
    if to.exists() {
        return Err(format!("目标已存在，拒绝覆盖: {}", to.display()));
    }
    if let Some(parent) = to.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("创建目录失败 {}: {e}", parent.display()))?;
    }
    fs::rename(from, to).map_err(|e| format!("改名失败 {} → {}: {e}", from.display(), to.display()))
}

#[derive(Serialize, Debug, PartialEq)]
pub struct StatInfo {
    pub exists: bool,
    pub is_dir: bool,
}

fn stat_impl(path: &Path) -> StatInfo {
    match fs::metadata(path) {
        Ok(m) => StatInfo {
            exists: true,
            is_dir: m.is_dir(),
        },
        Err(_) => StatInfo {
            exists: false,
            is_dir: false,
        },
    }
}

// ---- 应用配置（系统配置目录，不进库文件夹；7.6 的 API Key 也走这里）----

fn config_file(config_dir: &Path) -> PathBuf {
    config_dir.join("config.json")
}

const CONFIG_INVALID_PREFIX: &str = "STE_CONFIG_INVALID:";

fn read_config_text(path: &Path) -> Result<String, String> {
    let bytes = fs::read(path).map_err(|e| format!("读取配置文件失败 {}: {e}", path.display()))?;
    String::from_utf8(bytes)
        .map_err(|e| format!("{CONFIG_INVALID_PREFIX}配置文件不是有效 UTF-8: {e}"))
}

fn parse_config_object(text: &str) -> Result<serde_json::Value, String> {
    let value = serde_json::from_str::<serde_json::Value>(text)
        .map_err(|e| format!("{CONFIG_INVALID_PREFIX}配置文件损坏: {e}"))?;
    if !value.is_object() {
        return Err(format!("{CONFIG_INVALID_PREFIX}配置文件根不是对象"));
    }
    Ok(value)
}

fn config_get_impl(config_dir: &Path, key: &str) -> Result<Option<serde_json::Value>, String> {
    let file = config_file(config_dir);
    if !file.exists() {
        return Ok(None);
    }
    let text = read_config_text(&file)?;
    let map = parse_config_object(&text)?;
    Ok(map.get(key).cloned())
}

/// 前端实际会写的全部配置键。白名单之外一律拒绝。
///
/// 理由是纵深防御：配置派生的根目录每次启动都参与授权（见 restore_authorized_roots），
/// 所以能任意写 config.json 就等于能写 `vaultRoot: "C:\\"`，重启后拿到持久全盘读写。
/// 目前 webview 里没有已知注入点（全仓无 dangerouslySetInnerHTML），这条是备而不用。
/// 新增配置项时要同步加到这里，否则写入会在客户端上直接失败。
const CONFIG_WRITABLE_KEYS: [&str; 7] = [
    "stRoot",             // ST 根目录
    "vaultRoot",          // 当前库根目录
    "vaultRegistry",      // 多库注册表
    "apiProfiles",        // API 提供商配置（镜像自 localStorage）：共享槽
    "apiActiveProfile",   // 当前启用的配置档 id：共享槽
    "apiProfilesByVault", // 按库独立的 API 配置槽 { 库id: { profiles, active } }
    "apiScopeByVault",    // 每个库用共享还是独立配置 { 库id: "shared" | "vault" }
];

fn config_set_impl(config_dir: &Path, key: &str, value: serde_json::Value) -> Result<(), String> {
    if !CONFIG_WRITABLE_KEYS.contains(&key) {
        return Err(format!("拒绝写入未知配置项: {key}"));
    }
    let file = config_file(config_dir);
    let mut map = if file.exists() {
        parse_config_object(&read_config_text(&file)?)?
    } else {
        serde_json::json!({})
    };
    map.as_object_mut()
        .ok_or_else(|| format!("{CONFIG_INVALID_PREFIX}配置文件根不是对象"))?
        .insert(key.to_string(), value);
    let text = serde_json::to_string_pretty(&map).map_err(|e| e.to_string())?;
    write_bytes_atomic(&file, text.as_bytes())
}

fn config_repair_impl(config_dir: &Path) -> Result<Option<PathBuf>, String> {
    let file = config_file(config_dir);
    if !file.exists() {
        return Ok(None);
    }
    let original =
        fs::read(&file).map_err(|e| format!("读取配置文件失败 {}: {e}", file.display()))?;
    if std::str::from_utf8(&original)
        .ok()
        .and_then(|text| parse_config_object(text).ok())
        .is_some()
    {
        return Ok(None);
    }

    fs::create_dir_all(config_dir)
        .map_err(|e| format!("创建配置目录失败 {}: {e}", config_dir.display()))?;
    let nonce = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| format!("生成配置备份名失败: {e}"))?
        .as_millis();
    let mut backup = None;
    for attempt in 0..32 {
        let candidate = config_dir.join(format!("config.invalid-{nonce}-{attempt}.json"));
        let mut output = match fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&candidate)
        {
            Ok(file) => file,
            Err(err) if err.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(err) => return Err(format!("创建配置备份失败 {}: {err}", candidate.display())),
        };
        output
            .write_all(&original)
            .and_then(|_| output.sync_all())
            .map_err(|e| format!("写入配置备份失败 {}: {e}", candidate.display()))?;
        backup = Some(candidate);
        break;
    }
    let backup = backup.ok_or_else(|| "无法创建唯一的配置备份文件".to_string())?;
    write_bytes_atomic(&file, b"{}")?;
    Ok(Some(backup))
}

// ---- Tauri 命令层（薄封装）----

fn rooted_path_from_canonical(mut resolved: PathBuf, relative: &str) -> Result<PathBuf, String> {
    if relative.contains('\\') {
        return Err(format!("相对路径含非法分隔符: {relative}"));
    }
    let rel = Path::new(relative);
    if rel.is_absolute()
        || rel
            .components()
            .any(|part| !matches!(part, Component::Normal(_)))
    {
        return Err(format!("拒绝越出根目录的路径: {relative}"));
    }

    for part in rel.components() {
        let Component::Normal(name) = part else {
            return Err(format!("拒绝越出根目录的路径: {relative}"));
        };
        resolved.push(name);
        match fs::symlink_metadata(&resolved) {
            Ok(meta) if meta.file_type().is_symlink() => {
                return Err(format!(
                    "拒绝访问根目录内的符号链接: {}",
                    resolved.display()
                ));
            }
            Ok(_) => {}
            Err(err) if err.kind() == std::io::ErrorKind::NotFound => {}
            Err(err) => return Err(format!("检查路径失败 {}: {err}", resolved.display())),
        }
    }
    Ok(resolved)
}

#[cfg(test)]
fn rooted_path(root: &str, relative: &str) -> Result<PathBuf, String> {
    let canonical = fs::canonicalize(root).map_err(|e| format!("读取根目录失败 {root}: {e}"))?;
    rooted_path_from_canonical(canonical, relative)
}

fn authorized_rooted_path(
    roots: &AuthorizedRoots,
    root: &str,
    relative: &str,
) -> Result<PathBuf, String> {
    rooted_path_from_canonical(roots.resolve_root(root)?, relative)
}

fn authorized_read_absolute_path(roots: &AuthorizedRoots, path: &str) -> Result<PathBuf, String> {
    let requested = Path::new(path);
    if !requested.is_absolute() {
        return Err(format!("绝对路径无效: {path}"));
    }
    let metadata =
        fs::symlink_metadata(requested).map_err(|e| format!("读取文件路径失败 {path}: {e}"))?;
    if metadata.file_type().is_symlink() {
        return Err(format!("拒绝访问符号链接: {path}"));
    }
    let canonical =
        fs::canonicalize(requested).map_err(|e| format!("解析文件路径失败 {path}: {e}"))?;
    roots.ensure_contains(&canonical)?;
    Ok(canonical)
}

fn authorized_write_absolute_path(roots: &AuthorizedRoots, path: &str) -> Result<PathBuf, String> {
    let requested = Path::new(path);
    if !requested.is_absolute() {
        return Err(format!("绝对路径无效: {path}"));
    }
    if let Ok(metadata) = fs::symlink_metadata(requested) {
        if metadata.file_type().is_symlink() {
            return Err(format!("拒绝写入符号链接: {path}"));
        }
    }
    let parent = requested
        .parent()
        .ok_or_else(|| format!("目标路径没有父目录: {path}"))?;
    let file_name = requested
        .file_name()
        .ok_or_else(|| format!("目标路径没有文件名: {path}"))?;
    let canonical_parent = fs::canonicalize(parent)
        .map_err(|e| format!("解析目标父目录失败 {}: {e}", parent.display()))?;
    roots.ensure_contains(&canonical_parent)?;
    Ok(canonical_parent.join(file_name))
}

fn configured_root_values(config_dir: &Path) -> Result<Vec<PathBuf>, String> {
    let file = config_file(config_dir);
    if !file.exists() {
        return Ok(Vec::new());
    }
    let config = parse_config_object(&read_config_text(&file)?)?;
    let mut paths = Vec::new();
    for key in ["vaultRoot", "stRoot"] {
        if let Some(path) = config.get(key).and_then(serde_json::Value::as_str) {
            paths.push(PathBuf::from(path));
        }
    }
    if let Some(vaults) = config
        .get("vaultRegistry")
        .and_then(|registry| registry.get("vaults"))
        .and_then(serde_json::Value::as_array)
    {
        paths.extend(vaults.iter().filter_map(|item| {
            item.get("path")
                .and_then(serde_json::Value::as_str)
                .map(PathBuf::from)
        }));
    }
    Ok(paths)
}

fn restore_configured_roots(roots: &AuthorizedRoots, config_dir: &Path) -> Result<(), String> {
    for path in configured_root_values(config_dir)? {
        if path.is_dir() {
            roots.authorize_persistent(&path)?;
        }
    }
    Ok(())
}

fn authorization_file(config_dir: &Path) -> PathBuf {
    config_dir.join("authorized-roots.json")
}

fn persist_authorized_roots(roots: &AuthorizedRoots, config_dir: &Path) -> Result<(), String> {
    let paths = roots
        .persistent_roots()?
        .into_iter()
        .map(|path| path.to_string_lossy().into_owned())
        .collect::<Vec<_>>();
    let text = serde_json::to_string_pretty(&serde_json::json!({
        "version": 1,
        "roots": paths,
    }))
    .map_err(|e| format!("序列化文件访问授权失败: {e}"))?;
    write_bytes_atomic(&authorization_file(config_dir), text.as_bytes())
}

fn restore_authorized_roots(roots: &AuthorizedRoots, config_dir: &Path) -> Result<(), String> {
    let file = authorization_file(config_dir);
    let mut should_persist = !file.exists();

    // 持久清单是历史授权，配置是当前意图。两者取并集，保证库盘暂时离线
    // 后重新连接时能自愈；清单损坏时也不能让整个应用失去文件访问能力。
    if file.exists() {
        match read_config_text(&file).and_then(|text| parse_config_object(&text)) {
            Ok(value) => {
                if let Some(paths) = value.get("roots").and_then(serde_json::Value::as_array) {
                    for path in paths
                        .iter()
                        .filter_map(serde_json::Value::as_str)
                        .map(PathBuf::from)
                    {
                        if path.is_dir() {
                            roots.authorize_persistent(&path)?;
                        }
                    }
                } else {
                    should_persist = true;
                }
            }
            Err(_) => {
                should_persist = true;
            }
        }
    }

    let before_configured = roots.persistent_roots()?;
    restore_configured_roots(roots, config_dir)?;
    should_persist |= roots.persistent_roots()? != before_configured;
    if should_persist {
        persist_authorized_roots(roots, config_dir)?;
    }
    Ok(())
}

#[tauri::command]
fn vault_list_dir(
    roots: tauri::State<'_, AuthorizedRoots>,
    root: String,
    path: String,
) -> Result<Vec<DirEntryInfo>, String> {
    let path = authorized_rooted_path(&roots, &root, &path)?;
    if !path.exists() {
        return Ok(Vec::new());
    }
    list_dir_impl(&path)
}

#[tauri::command]
fn vault_read_text(
    roots: tauri::State<'_, AuthorizedRoots>,
    root: String,
    path: String,
) -> Result<String, String> {
    read_text_impl(&authorized_rooted_path(&roots, &root, &path)?)
}

#[tauri::command]
fn vault_write_text(
    roots: tauri::State<'_, AuthorizedRoots>,
    root: String,
    path: String,
    content: String,
) -> Result<(), String> {
    write_bytes_atomic(
        &authorized_rooted_path(&roots, &root, &path)?,
        content.as_bytes(),
    )
}

#[tauri::command]
fn vault_read_binary(
    roots: tauri::State<'_, AuthorizedRoots>,
    root: String,
    path: String,
) -> Result<String, String> {
    read_binary_impl(&authorized_rooted_path(&roots, &root, &path)?)
}

#[tauri::command]
fn vault_write_binary(
    roots: tauri::State<'_, AuthorizedRoots>,
    root: String,
    path: String,
    base64: String,
) -> Result<(), String> {
    write_binary_impl(&authorized_rooted_path(&roots, &root, &path)?, &base64)
}

#[tauri::command]
fn vault_remove_file(
    roots: tauri::State<'_, AuthorizedRoots>,
    root: String,
    path: String,
) -> Result<(), String> {
    remove_file_impl(&authorized_rooted_path(&roots, &root, &path)?)
}

/// 送进系统回收站而不是抹掉。给用户主动删自己文件的场景用（立绘等），
/// 删错了还能从回收站捞回来；程序自己维护的中间文件仍走 vault_remove_file。
#[tauri::command]
fn vault_trash_file(
    roots: tauri::State<'_, AuthorizedRoots>,
    root: String,
    path: String,
) -> Result<(), String> {
    let target = authorized_rooted_path(&roots, &root, &path)?;
    trash::delete(&target).map_err(|e| format!("移入回收站失败 {}: {e}", target.display()))
}

/// 把库内文件交给系统默认程序（reveal=true 则在文件管理器里定位）。
/// 0830 反馈条目 6：关联文件里的 html、视频这些，客户端内预览不了就得能外部打开。
///
/// 授权走 authorized_rooted_path，和读写删同一条闸——插件的静态 scope 在这里没用，
/// 库根是用户运行时选的，写不进 capabilities 白名单。
#[tauri::command]
fn vault_open_path(
    app: tauri::AppHandle,
    roots: tauri::State<'_, AuthorizedRoots>,
    root: String,
    path: String,
    reveal: bool,
) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    let target = authorized_rooted_path(&roots, &root, &path)?;
    if !target.is_file() {
        return Err(format!("文件不存在: {}", target.display()));
    }
    if reveal {
        app.opener()
            .reveal_item_in_dir(&target)
            .map_err(|e| format!("在文件管理器中显示失败 {}: {e}", target.display()))
    } else {
        // with 传 None = 系统默认关联程序；不指定程序名，免得替用户挑
        app.opener()
            .open_path(target.to_string_lossy(), None::<&str>)
            .map_err(|e| format!("调用外部程序失败 {}: {e}", target.display()))
    }
}

#[tauri::command]
fn vault_remove_empty_dir(
    roots: tauri::State<'_, AuthorizedRoots>,
    root: String,
    path: String,
) -> Result<bool, String> {
    remove_empty_dir_impl(&authorized_rooted_path(&roots, &root, &path)?)
}

#[tauri::command]
fn vault_rename(
    roots: tauri::State<'_, AuthorizedRoots>,
    root: String,
    from: String,
    to: String,
) -> Result<(), String> {
    rename_impl(
        &authorized_rooted_path(&roots, &root, &from)?,
        &authorized_rooted_path(&roots, &root, &to)?,
    )
}

#[tauri::command]
fn vault_mkdir(
    roots: tauri::State<'_, AuthorizedRoots>,
    root: String,
    path: String,
) -> Result<(), String> {
    let path = authorized_rooted_path(&roots, &root, &path)?;
    fs::create_dir_all(&path).map_err(|e| format!("创建目录失败 {}: {e}", path.display()))
}

#[tauri::command]
fn vault_stat(
    roots: tauri::State<'_, AuthorizedRoots>,
    root: String,
    path: String,
) -> Result<StatInfo, String> {
    Ok(stat_impl(&authorized_rooted_path(&roots, &root, &path)?))
}

#[tauri::command]
fn vault_read_abs_text(
    roots: tauri::State<'_, AuthorizedRoots>,
    path: String,
) -> Result<String, String> {
    read_text_impl(&authorized_read_absolute_path(&roots, &path)?)
}

#[derive(Serialize, Debug)]
struct PickedChatFile {
    name: String,
    base64: String,
}

/// 原生选择器读入上限。这条路径要同时驻留原始字节、base64 文本、IPC 副本与前端
/// atob 结果，峰值内存约为文件体积的四到五倍，所以先按体积挡住再读盘。
/// 需要支持更大的档案时应改成分片/流式读取，而不是抬高这个常量。
const MAX_PICKED_FILE_BYTES: u64 = 64 * 1024 * 1024;

fn read_picked_file_impl(path: &Path, max_bytes: u64) -> Result<PickedChatFile, String> {
    let size = fs::metadata(path)
        .map_err(|e| format!("读取文件信息失败 {}: {e}", path.display()))?
        .len();
    if size > max_bytes {
        return Err(format!(
            "文件过大：{:.1} MB，上限 {} MB。请先在 SillyTavern 侧拆分或精简后再导入。",
            size as f64 / (1024.0 * 1024.0),
            max_bytes / (1024 * 1024)
        ));
    }
    let name = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("导入文件")
        .to_string();
    let bytes = fs::read(path).map_err(|e| format!("读取文件失败 {}: {e}", path.display()))?;
    Ok(PickedChatFile {
        name,
        base64: base64::engine::general_purpose::STANDARD.encode(bytes),
    })
}

/// 给系统文件对话框挂上主窗口做属主：对话框随主窗口模态、定位跟着主窗口走，
/// 不再作为孤立顶层窗口弹在屏幕上（0826 反馈 2）。
/// 注意：对话框的**尺寸**由 Windows 自己按 ComDlg32 的历史记录还原，
/// 应用侧无法指定，这里只能保证属主关系正确。
///
/// 调用方必须是 `async fn` command：同步 command 跑在主线程，而 `blocking_pick_*`
/// 要靠事件循环转起来才能等到对话框关闭，在主线程上调用会直接互锁成"未响应"。
/// 交给前端的路径去掉 `\\?\` verbatim 前缀。`fs::canonicalize` 一定带这个前缀，
/// 原样传出去前端会显示成 `//?/D:/...`，还会让同一文件夹算出两个库 id。
/// 授权集合内部仍存 canonical 形式，回传的路径进来时会重新 canonicalize，能对上。
///
/// 只处理盘符形式；`\\?\UNC\server\share` 剥掉前缀就不合法了，保持原样。
pub fn simplified_for_frontend(path: &Path) -> String {
    let text = path.to_string_lossy();
    match text.strip_prefix(r"\\?\") {
        Some(rest) if rest.as_bytes().get(1) == Some(&b':') => rest.to_string(),
        _ => text.into_owned(),
    }
}

fn dialog_for(app: &tauri::AppHandle) -> tauri_plugin_dialog::FileDialogBuilder<tauri::Wry> {
    let builder = app.dialog().file();
    match app.get_webview_window("main") {
        Some(window) => builder.set_parent(&window),
        None => builder,
    }
}

#[tauri::command]
async fn pick_chat_file(app: tauri::AppHandle) -> Result<Option<PickedChatFile>, String> {
    let Some(selected) = dialog_for(&app)
        .set_title("选择聊天或角色卡文件")
        .add_filter("聊天与角色卡", &["jsonl", "json", "txt", "png"])
        .blocking_pick_file()
    else {
        return Ok(None);
    };
    let path = selected.into_path().map_err(|e| format!("选择结果不是本机文件: {e}"))?;
    read_picked_file_impl(&path, MAX_PICKED_FILE_BYTES).map(Some)
}

#[tauri::command]
fn vault_write_abs_text(
    roots: tauri::State<'_, AuthorizedRoots>,
    path: String,
    content: String,
) -> Result<(), String> {
    write_bytes_atomic(
        &authorized_write_absolute_path(&roots, &path)?,
        content.as_bytes(),
    )
}

#[tauri::command]
async fn vault_pick_authorized_directory(
    app: tauri::AppHandle,
    roots: tauri::State<'_, AuthorizedRoots>,
    title: String,
    persistent: bool,
) -> Result<Option<String>, String> {
    let Some(selected) = dialog_for(&app).set_title(title).blocking_pick_folder() else {
        return Ok(None);
    };
    let selected = selected
        .into_path()
        .map_err(|e| format!("目录选择结果不是本机路径: {e}"))?;
    let canonical = if persistent {
        let canonical = roots.authorize_persistent(&selected)?;
        persist_authorized_roots(&roots, &app_config_dir(&app)?)?;
        canonical
    } else {
        roots.authorize(&selected)?
    };
    Ok(Some(simplified_for_frontend(&canonical)))
}

fn app_config_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map_err(|e| format!("取配置目录失败: {e}"))
}

#[tauri::command]
fn config_get(app: tauri::AppHandle, key: String) -> Result<Option<serde_json::Value>, String> {
    config_get_impl(&app_config_dir(&app)?, &key)
}

#[tauri::command]
fn config_set(app: tauri::AppHandle, key: String, value: serde_json::Value) -> Result<(), String> {
    config_set_impl(&app_config_dir(&app)?, &key, value)
}

#[tauri::command]
fn config_repair(app: tauri::AppHandle) -> Result<Option<String>, String> {
    config_repair_impl(&app_config_dir(&app)?)
        .map(|backup| backup.map(|path| path.to_string_lossy().into_owned()))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let roots = AuthorizedRoots::default();
            if let Ok(config_dir) = app.path().app_config_dir() {
                if let Err(error) = restore_authorized_roots(&roots, &config_dir) {
                    log::warn!("恢复文件访问授权失败: {error}");
                }
            }
            app.manage(roots);
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            vault_list_dir,
            vault_read_text,
            vault_write_text,
            vault_read_binary,
            vault_write_binary,
            vault_remove_file,
            vault_trash_file,
            vault_open_path,
            vault_remove_empty_dir,
            vault_rename,
            vault_mkdir,
            vault_stat,
            vault_read_abs_text,
            pick_chat_file,
            vault_write_abs_text,
            vault_pick_authorized_directory,
            config_get,
            config_set,
            config_repair,
            st_backup_import::prepare_st_backup_import,
            st_backup_import::cleanup_st_backup_import
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_root(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("ste-vault-test-{}-{tag}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn write_then_read_roundtrip() {
        let root = temp_root("rw");
        let file = root.join("角色").join("档案.json");
        write_bytes_atomic(&file, "{\"名字\":\"赫敏\"}".as_bytes()).unwrap();
        assert_eq!(read_text_impl(&file).unwrap(), "{\"名字\":\"赫敏\"}");
        write_bytes_atomic(&file, b"v2").unwrap();
        assert_eq!(read_text_impl(&file).unwrap(), "v2");
        assert!(!file.with_extension("ste-tmp").exists());
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn list_dir_dirs_first_with_size() {
        let root = temp_root("ls");
        fs::create_dir_all(root.join("故事")).unwrap();
        fs::write(root.join("聊天.jsonl"), "abc").unwrap();
        let entries = list_dir_impl(&root).unwrap();
        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0].name, "故事");
        assert!(entries[0].is_dir);
        assert_eq!(entries[1].name, "聊天.jsonl");
        assert_eq!(entries[1].size, 3);
        assert!(entries[1].modified_at.is_some());
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn list_dir_marks_symlink_without_following_it() {
        let root = temp_root("symlink");
        let outside = temp_root("symlink-outside");
        fs::write(outside.join("secret.txt"), "outside").unwrap();
        let link = root.join("outside-link");

        #[cfg(unix)]
        std::os::unix::fs::symlink(&outside, &link).unwrap();
        #[cfg(windows)]
        if std::os::windows::fs::symlink_dir(&outside, &link).is_err() {
            let _ = fs::remove_dir_all(&root);
            let _ = fs::remove_dir_all(&outside);
            return;
        }

        let entries = list_dir_impl(&root).unwrap();
        assert_eq!(entries.len(), 1);
        assert!(entries[0].is_symlink);
        assert!(!entries[0].is_dir);
        assert_eq!(entries[0].size, 0);
        let _ = fs::remove_file(&link);
        let _ = fs::remove_dir_all(&root);
        let _ = fs::remove_dir_all(&outside);
    }

    #[test]
    fn rooted_path_rejects_traversal_and_backslash() {
        let root = temp_root("rooted-traversal");
        assert!(rooted_path(root.to_str().unwrap(), "../outside.txt").is_err());
        assert!(rooted_path(root.to_str().unwrap(), "safe\\..\\outside.txt").is_err());
        assert_eq!(
            rooted_path(root.to_str().unwrap(), "safe/file.txt").unwrap(),
            fs::canonicalize(&root)
                .unwrap()
                .join("safe")
                .join("file.txt")
        );
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn rooted_path_rechecks_symlink_after_scan() {
        let root = temp_root("rooted-symlink");
        let outside = temp_root("rooted-symlink-outside");
        let outside_file = outside.join("secret.txt");
        fs::write(&outside_file, "outside").unwrap();
        let link = root.join("selected.txt");

        #[cfg(unix)]
        std::os::unix::fs::symlink(&outside_file, &link).unwrap();
        #[cfg(windows)]
        if std::os::windows::fs::symlink_file(&outside_file, &link).is_err() {
            let _ = fs::remove_dir_all(&root);
            let _ = fs::remove_dir_all(&outside);
            return;
        }

        assert!(rooted_path(root.to_str().unwrap(), "selected.txt").is_err());
        let _ = fs::remove_file(&link);
        let _ = fs::remove_dir_all(&root);
        let _ = fs::remove_dir_all(&outside);
    }

    #[test]
    fn atomic_write_does_not_follow_precreated_temp_link() {
        let root = temp_root("atomic-temp-link");
        let outside = temp_root("atomic-temp-link-outside");
        let outside_file = outside.join("secret.txt");
        fs::write(&outside_file, "outside").unwrap();
        let target = root.join("item.json");
        let legacy_temp = target.with_extension("ste-tmp");

        fs::hard_link(&outside_file, &legacy_temp).unwrap();

        write_bytes_atomic(&target, b"inside").unwrap();
        assert_eq!(fs::read_to_string(&outside_file).unwrap(), "outside");
        assert_eq!(fs::read_to_string(&target).unwrap(), "inside");
        let _ = fs::remove_file(&legacy_temp);
        let _ = fs::remove_dir_all(&root);
        let _ = fs::remove_dir_all(&outside);
    }

    #[test]
    fn read_missing_file_reports_path() {
        let err = read_text_impl(Path::new("Z:/不存在/x.txt")).unwrap_err();
        assert!(err.contains("不存在"));
    }

    #[test]
    fn binary_roundtrip_base64() {
        let root = temp_root("bin");
        let file = root.join("卡片.png");
        let payload = base64::engine::general_purpose::STANDARD.encode([0x89, 0x50, 0x4e, 0x47]);
        write_binary_impl(&file, &payload).unwrap();
        assert_eq!(read_binary_impl(&file).unwrap(), payload);
        assert!(write_binary_impl(&file, "not-base64!!!").is_err());
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn picked_file_guards_size_before_reading() {
        let root = temp_root("pick");
        let file = root.join("聊天.jsonl");
        fs::write(&file, b"{\"mes\":\"hi\"}").unwrap();

        let picked = read_picked_file_impl(&file, MAX_PICKED_FILE_BYTES).unwrap();
        assert_eq!(picked.name, "聊天.jsonl");
        assert_eq!(
            base64::engine::general_purpose::STANDARD
                .decode(picked.base64)
                .unwrap(),
            b"{\"mes\":\"hi\"}"
        );

        // 超限在读盘前就返回错误，且提示里带上体积
        let err = read_picked_file_impl(&file, 4).unwrap_err();
        assert!(err.contains("文件过大"), "实际错误: {err}");

        assert!(read_picked_file_impl(&root.join("不存在.jsonl"), MAX_PICKED_FILE_BYTES).is_err());
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn remove_dir_keeps_non_empty() {
        let root = temp_root("rm");
        let dir = root.join("赫敏");
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("用户自己放的.txt"), "x").unwrap();
        // 非空目录：不删、不报错，返回 false
        assert_eq!(remove_empty_dir_impl(&dir).unwrap(), false);
        assert!(dir.join("用户自己放的.txt").exists());
        remove_file_impl(&dir.join("用户自己放的.txt")).unwrap();
        assert_eq!(remove_empty_dir_impl(&dir).unwrap(), true);
        assert!(!dir.exists());
        // 不存在的目录：幂等，不报错（删角色卡时「故事」子目录可能从未创建过）
        assert_eq!(remove_empty_dir_impl(&dir).unwrap(), false);
        assert_eq!(remove_empty_dir_impl(&root.join("从未存在")).unwrap(), false);
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn rename_refuses_overwrite() {
        let root = temp_root("mv");
        fs::write(root.join("a.txt"), "a").unwrap();
        fs::write(root.join("b.txt"), "b").unwrap();
        assert!(rename_impl(&root.join("a.txt"), &root.join("b.txt")).is_err());
        rename_impl(&root.join("a.txt"), &root.join("c.txt")).unwrap();
        assert_eq!(read_text_impl(&root.join("c.txt")).unwrap(), "a");
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn config_get_set_roundtrip() {
        let root = temp_root("cfg");
        assert_eq!(config_get_impl(&root, "vaultRoot").unwrap(), None);
        config_set_impl(&root, "vaultRoot", serde_json::json!("D:/我的STE库")).unwrap();
        config_set_impl(&root, "stRoot", serde_json::json!("D:/SillyTavern")).unwrap();
        assert_eq!(
            config_get_impl(&root, "vaultRoot").unwrap(),
            Some(serde_json::json!("D:/我的STE库"))
        );
        assert_eq!(
            config_get_impl(&root, "stRoot").unwrap(),
            Some(serde_json::json!("D:/SillyTavern"))
        );
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn config_set_accepts_exactly_the_keys_the_frontend_writes() {
        let root = temp_root("cfg-allowlist");
        // 这几个键在前端各有唯一写入点；少一个就是某个功能在客户端上静默失效。
        // 故意重复列一遍而不是遍历 CONFIG_WRITABLE_KEYS：遍历常量只能证明它自己一致，
        // 这里要钉的是「前端真的会写这些」——加了新键就必须回来同步这份清单。
        for key in [
            "stRoot",
            "vaultRoot",
            "vaultRegistry",
            "apiProfiles",
            "apiActiveProfile",
            "apiProfilesByVault",
            "apiScopeByVault",
        ] {
            config_set_impl(&root, key, serde_json::json!("v"))
                .unwrap_or_else(|e| panic!("{key} 应当可写: {e}"));
            assert_eq!(
                config_get_impl(&root, key).unwrap(),
                Some(serde_json::json!("v"))
            );
            assert!(
                CONFIG_WRITABLE_KEYS.contains(&key),
                "{key} 不在白名单里，上面那句本该失败"
            );
        }
        // 「恰好」是双向的：白名单里也不该有前端根本不写、白放开的键。
        assert_eq!(CONFIG_WRITABLE_KEYS.len(), 7, "白名单增删后请同步上面的清单");
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn config_set_rejects_keys_outside_the_allowlist() {
        let root = temp_root("cfg-unknown-key");
        config_set_impl(&root, "vaultRoot", serde_json::json!("D:/库")).unwrap();
        let before = fs::read_to_string(config_file(&root)).unwrap();

        // 注入脚本写任意键 → 拒绝；配置文件一个字节都不动，已有的库根不受影响
        assert!(config_set_impl(&root, "other", serde_json::json!(42)).is_err());
        assert!(config_set_impl(&root, "VaultRoot", serde_json::json!("C:/")).is_err());
        assert!(config_set_impl(&root, "", serde_json::json!("C:/")).is_err());

        assert_eq!(fs::read_to_string(config_file(&root)).unwrap(), before);
        assert_eq!(config_get_impl(&root, "other").unwrap(), None);
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn config_set_refuses_to_overwrite_corrupt_config() {
        let root = temp_root("cfg-corrupt");
        let file = config_file(&root);
        fs::write(&file, "{ not valid json").unwrap();

        let result = config_set_impl(
            &root,
            "vaultRegistry",
            serde_json::json!({
                "version": 1,
            }),
        );

        assert!(result.is_err());
        assert_eq!(fs::read_to_string(&file).unwrap(), "{ not valid json");
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn config_get_rejects_non_object_root() {
        let root = temp_root("cfg-non-object");
        let file = config_file(&root);
        fs::write(&file, "[]").unwrap();

        let result = config_get_impl(&root, "vaultRoot");

        assert!(result.is_err());
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn config_get_rejects_non_utf8_config_as_invalid_config() {
        let root = temp_root("cfg-non-utf8");
        let file = config_file(&root);
        fs::write(&file, [0xff_u8, 0xfe_u8, 0x00_u8]).unwrap();

        let result = config_get_impl(&root, "vaultRoot").unwrap_err();

        assert!(result.starts_with(CONFIG_INVALID_PREFIX));
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn config_repair_backs_up_and_resets_invalid_file() {
        let root = temp_root("cfg-repair");
        let file = config_file(&root);
        fs::write(&file, "{ broken json").unwrap();

        let backup = config_repair_impl(&root).unwrap().unwrap();

        assert_eq!(fs::read_to_string(&backup).unwrap(), "{ broken json");
        assert_eq!(fs::read_to_string(&file).unwrap(), "{}");
        assert_eq!(config_get_impl(&root, "vaultRoot").unwrap(), None);
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn config_repair_handles_non_object_root_and_leaves_valid_config_alone() {
        let root = temp_root("cfg-repair-root");
        let file = config_file(&root);
        fs::write(&file, "[]").unwrap();

        let backup = config_repair_impl(&root).unwrap().unwrap();
        assert_eq!(fs::read_to_string(&backup).unwrap(), "[]");
        assert_eq!(fs::read_to_string(&file).unwrap(), "{}");

        config_set_impl(&root, "vaultRoot", serde_json::json!("D:/vault")).unwrap();
        let valid = fs::read_to_string(&file).unwrap();
        assert_eq!(config_repair_impl(&root).unwrap(), None);
        assert_eq!(fs::read_to_string(&file).unwrap(), valid);
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn authorized_roots_reject_unregistered_relative_roots() {
        let allowed = temp_root("authorized-relative");
        let denied = temp_root("unauthorized-relative");
        let roots = AuthorizedRoots::default();

        roots.authorize(&allowed).unwrap();

        assert_eq!(
            authorized_rooted_path(&roots, allowed.to_str().unwrap(), "故事/item.json").unwrap(),
            fs::canonicalize(&allowed)
                .unwrap()
                .join("故事")
                .join("item.json")
        );
        let error =
            authorized_rooted_path(&roots, denied.to_str().unwrap(), "secret.txt").unwrap_err();
        assert!(error.contains("未授权"));
        let _ = fs::remove_dir_all(&allowed);
        let _ = fs::remove_dir_all(&denied);
    }

    #[test]
    fn absolute_text_paths_must_stay_under_an_authorized_root() {
        let allowed = temp_root("authorized-absolute");
        let denied = temp_root("unauthorized-absolute");
        let roots = AuthorizedRoots::default();
        roots.authorize(&allowed).unwrap();
        let allowed_file = allowed.join("chat.jsonl");
        let denied_file = denied.join("secret.txt");
        fs::write(&allowed_file, "allowed").unwrap();
        fs::write(&denied_file, "denied").unwrap();

        assert_eq!(
            authorized_read_absolute_path(&roots, allowed_file.to_str().unwrap()).unwrap(),
            fs::canonicalize(&allowed_file).unwrap()
        );
        assert!(authorized_read_absolute_path(&roots, denied_file.to_str().unwrap()).is_err());
        assert_eq!(
            authorized_write_absolute_path(&roots, allowed.join("new.jsonl").to_str().unwrap())
                .unwrap(),
            fs::canonicalize(&allowed).unwrap().join("new.jsonl")
        );
        assert!(
            authorized_write_absolute_path(&roots, denied.join("new.txt").to_str().unwrap())
                .is_err()
        );
        let _ = fs::remove_dir_all(&allowed);
        let _ = fs::remove_dir_all(&denied);
    }

    #[test]
    fn configured_vault_and_st_roots_are_restored_without_authorizing_missing_paths() {
        let config_dir = temp_root("authorized-config");
        let active_vault = temp_root("authorized-config-vault");
        let registered_vault = temp_root("authorized-config-registered");
        let st_root = temp_root("authorized-config-st");
        let missing = config_dir.join("missing");
        config_set_impl(&config_dir, "vaultRoot", serde_json::json!(active_vault)).unwrap();
        config_set_impl(&config_dir, "stRoot", serde_json::json!(st_root)).unwrap();
        config_set_impl(
            &config_dir,
            "vaultRegistry",
            serde_json::json!({
                "version": 1,
                "activeId": "registered",
                "vaults": [
                    { "id": "registered", "path": registered_vault },
                    { "id": "missing", "path": missing }
                ]
            }),
        )
        .unwrap();
        let roots = AuthorizedRoots::default();

        restore_configured_roots(&roots, &config_dir).unwrap();

        assert!(authorized_rooted_path(&roots, active_vault.to_str().unwrap(), "").is_ok());
        assert!(authorized_rooted_path(&roots, registered_vault.to_str().unwrap(), "").is_ok());
        assert!(authorized_rooted_path(&roots, st_root.to_str().unwrap(), "").is_ok());
        assert!(authorized_rooted_path(&roots, missing.to_str().unwrap(), "").is_err());
        let _ = fs::remove_dir_all(&config_dir);
        let _ = fs::remove_dir_all(&active_vault);
        let _ = fs::remove_dir_all(&registered_vault);
        let _ = fs::remove_dir_all(&st_root);
    }

    #[test]
    fn persisted_and_configured_roots_are_merged_on_every_start() {
        let config_dir = temp_root("authorized-migration");
        let migrated = temp_root("authorized-migration-original");
        let injected_later = temp_root("authorized-migration-injected");
        config_set_impl(&config_dir, "vaultRoot", serde_json::json!(migrated)).unwrap();
        let first_boot = AuthorizedRoots::default();

        restore_authorized_roots(&first_boot, &config_dir).unwrap();

        assert!(authorized_rooted_path(&first_boot, migrated.to_str().unwrap(), "").is_ok());
        assert!(authorization_file(&config_dir).exists());

        config_set_impl(&config_dir, "vaultRoot", serde_json::json!(injected_later)).unwrap();
        let second_boot = AuthorizedRoots::default();
        restore_authorized_roots(&second_boot, &config_dir).unwrap();

        assert!(authorized_rooted_path(&second_boot, migrated.to_str().unwrap(), "").is_ok());
        assert!(authorized_rooted_path(&second_boot, injected_later.to_str().unwrap(), "").is_ok());
        let _ = fs::remove_dir_all(&config_dir);
        let _ = fs::remove_dir_all(&migrated);
        let _ = fs::remove_dir_all(&injected_later);
    }

    #[test]
    fn corrupted_authorization_file_falls_back_to_configured_roots() {
        let config_dir = temp_root("authorized-corrupt");
        let configured = temp_root("authorized-corrupt-configured");
        fs::write(authorization_file(&config_dir), "{not valid json").unwrap();
        config_set_impl(&config_dir, "vaultRoot", serde_json::json!(configured)).unwrap();

        let roots = AuthorizedRoots::default();
        restore_authorized_roots(&roots, &config_dir).unwrap();

        assert!(authorized_rooted_path(&roots, configured.to_str().unwrap(), "").is_ok());
        let persisted = fs::read_to_string(authorization_file(&config_dir)).unwrap();
        let escaped_configured = configured.to_string_lossy().replace('\\', "\\\\");
        assert!(persisted.contains(&escaped_configured));
        let _ = fs::remove_dir_all(&config_dir);
        let _ = fs::remove_dir_all(&configured);
    }

    #[test]
    fn configured_root_that_returns_after_startup_is_authorized_and_persisted() {
        let config_dir = temp_root("authorized-reconnect");
        let reconnecting = config_dir.join("offline-vault");
        config_set_impl(&config_dir, "vaultRoot", serde_json::json!(reconnecting)).unwrap();

        let first_boot = AuthorizedRoots::default();
        restore_authorized_roots(&first_boot, &config_dir).unwrap();
        assert!(authorized_rooted_path(&first_boot, reconnecting.to_str().unwrap(), "").is_err());

        fs::create_dir_all(&reconnecting).unwrap();
        let second_boot = AuthorizedRoots::default();
        restore_authorized_roots(&second_boot, &config_dir).unwrap();
        assert!(authorized_rooted_path(&second_boot, reconnecting.to_str().unwrap(), "").is_ok());
        let persisted = fs::read_to_string(authorization_file(&config_dir)).unwrap();
        let escaped_reconnecting = reconnecting.to_string_lossy().replace('\\', "\\\\");
        assert!(persisted.contains(&escaped_reconnecting));
        let _ = fs::remove_dir_all(&config_dir);
    }
}
