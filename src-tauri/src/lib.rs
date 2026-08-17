use base64::Engine;
use serde::Serialize;
use std::fs;
use std::io::Write;
use std::path::{Component, Path, PathBuf};

/// 文件库(FileVault)的 Rust 侧原语：列目录/读写文本与二进制/删除/改名 + 应用配置读写。
/// 策略与映射逻辑全部在 TS 层（src/lib/vault/），这里保持薄且可单测。
/// 铁律：删除类命令只删调用方点名的单个文件/空目录，绝不递归删——"不认识的文件永不删改"。

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
    let entries = fs::read_dir(path).map_err(|e| format!("读取目录失败 {}: {e}", path.display()))?;
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
fn remove_empty_dir_impl(path: &Path) -> Result<bool, String> {
    match fs::remove_dir(path) {
        Ok(()) => Ok(true),
        Err(e) => {
            let not_empty = e.raw_os_error() == Some(145) // Windows: ERROR_DIR_NOT_EMPTY
                || e.kind() == std::io::ErrorKind::DirectoryNotEmpty;
            if not_empty {
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
        fs::create_dir_all(parent).map_err(|e| format!("创建目录失败 {}: {e}", parent.display()))?;
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
        Ok(m) => StatInfo { exists: true, is_dir: m.is_dir() },
        Err(_) => StatInfo { exists: false, is_dir: false },
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

fn config_set_impl(config_dir: &Path, key: &str, value: serde_json::Value) -> Result<(), String> {
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
    let original = fs::read(&file).map_err(|e| format!("读取配置文件失败 {}: {e}", file.display()))?;
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
        let mut output = match fs::OpenOptions::new().write(true).create_new(true).open(&candidate) {
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

fn rooted_path(root: &str, relative: &str) -> Result<PathBuf, String> {
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

    let mut resolved = fs::canonicalize(root).map_err(|e| format!("读取根目录失败 {root}: {e}"))?;
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

#[tauri::command]
fn vault_list_dir(root: String, path: String) -> Result<Vec<DirEntryInfo>, String> {
    let path = rooted_path(&root, &path)?;
    if !path.exists() {
        return Ok(Vec::new());
    }
    list_dir_impl(&path)
}

#[tauri::command]
fn vault_read_text(root: String, path: String) -> Result<String, String> {
    read_text_impl(&rooted_path(&root, &path)?)
}

#[tauri::command]
fn vault_write_text(root: String, path: String, content: String) -> Result<(), String> {
    write_bytes_atomic(&rooted_path(&root, &path)?, content.as_bytes())
}

#[tauri::command]
fn vault_read_binary(root: String, path: String) -> Result<String, String> {
    read_binary_impl(&rooted_path(&root, &path)?)
}

#[tauri::command]
fn vault_write_binary(root: String, path: String, base64: String) -> Result<(), String> {
    write_binary_impl(&rooted_path(&root, &path)?, &base64)
}

#[tauri::command]
fn vault_remove_file(root: String, path: String) -> Result<(), String> {
    remove_file_impl(&rooted_path(&root, &path)?)
}

#[tauri::command]
fn vault_remove_empty_dir(root: String, path: String) -> Result<bool, String> {
    remove_empty_dir_impl(&rooted_path(&root, &path)?)
}

#[tauri::command]
fn vault_rename(root: String, from: String, to: String) -> Result<(), String> {
    rename_impl(&rooted_path(&root, &from)?, &rooted_path(&root, &to)?)
}

#[tauri::command]
fn vault_mkdir(root: String, path: String) -> Result<(), String> {
    let path = rooted_path(&root, &path)?;
    fs::create_dir_all(&path).map_err(|e| format!("创建目录失败 {}: {e}", path.display()))
}

#[tauri::command]
fn vault_stat(root: String, path: String) -> Result<StatInfo, String> {
    Ok(stat_impl(&rooted_path(&root, &path)?))
}

#[tauri::command]
fn vault_read_abs_text(path: String) -> Result<String, String> {
    read_text_impl(&PathBuf::from(path))
}

#[tauri::command]
fn vault_write_abs_text(path: String, content: String) -> Result<(), String> {
    write_bytes_atomic(&PathBuf::from(path), content.as_bytes())
}

fn app_config_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    use tauri::Manager;
    app.path().app_config_dir().map_err(|e| format!("取配置目录失败: {e}"))
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
        .setup(|app| {
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
            vault_remove_empty_dir,
            vault_rename,
            vault_mkdir,
            vault_stat,
            vault_read_abs_text,
            vault_write_abs_text,
            config_get,
            config_set,
            config_repair
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
        config_set_impl(&root, "other", serde_json::json!(42)).unwrap();
        assert_eq!(
            config_get_impl(&root, "vaultRoot").unwrap(),
            Some(serde_json::json!("D:/我的STE库"))
        );
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn config_set_refuses_to_overwrite_corrupt_config() {
        let root = temp_root("cfg-corrupt");
        let file = config_file(&root);
        fs::write(&file, "{ not valid json").unwrap();

        let result = config_set_impl(&root, "vaultRegistry", serde_json::json!({
            "version": 1,
        }));

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
}
