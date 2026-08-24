use crate::AuthorizedRoots;
use serde::Serialize;
use std::fs::{self, File, OpenOptions};
use std::io::{self, Read, Seek, Write};
use std::path::{Component, Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri_plugin_dialog::DialogExt;
use zip::ZipArchive;

const MAX_FILES: usize = 20_000;
const MAX_ENTRY_BYTES: u64 = 128 * 1024 * 1024;
const MAX_TOTAL_BYTES: u64 = 512 * 1024 * 1024;
const MAX_DEPTH: usize = 32;
const MAX_PATH_BYTES: usize = 512;
const TEMP_PREFIX: &str = "ste-st-import-";

#[derive(Serialize, Debug, PartialEq)]
pub struct PreparedSTBackup {
    pub root: String,
    pub display_name: String,
}

fn nonce() -> Result<u128, String> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .map_err(|error| format!("生成临时导入目录名失败: {error}"))
}

fn safe_entry_path(name: &str) -> Result<PathBuf, String> {
    if name.is_empty() || name.len() > MAX_PATH_BYTES {
        return Err(format!("压缩包路径过长或为空: {name:?}"));
    }
    if name.contains('\\') || name.starts_with('/') || name.contains(':') || name.contains('\0') {
        return Err(format!("压缩包包含不安全路径: {name}"));
    }
    let path = Path::new(name);
    let mut depth = 0usize;
    for part in path.components() {
        match part {
            Component::Normal(_) => depth += 1,
            _ => return Err(format!("压缩包包含不安全路径: {name}")),
        }
    }
    if depth == 0 || depth > MAX_DEPTH {
        return Err(format!("压缩包路径层级超限: {name}"));
    }
    Ok(path.to_path_buf())
}

fn is_sensitive_path(path: &Path) -> bool {
    path.file_name()
        .and_then(|name| name.to_str())
        .is_some_and(|name| name.eq_ignore_ascii_case("secrets.json"))
}

fn is_supported_path(path: &Path) -> bool {
    let normalized = path.to_string_lossy().replace('\\', "/");
    normalized.starts_with("characters/")
        || normalized.starts_with("chats/")
        || normalized.starts_with("worlds/")
        || normalized.starts_with("OpenAI Settings/")
        || normalized == "settings.json"
}

fn ensure_parent(path: &Path) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("创建临时导入目录失败 {}: {error}", parent.display()))?;
    }
    Ok(())
}

fn copy_entry<R: Read>(mut input: R, destination: &Path) -> Result<(), String> {
    ensure_parent(destination)?;
    let mut output = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(destination)
        .map_err(|error| format!("写入临时导入文件失败 {}: {error}", destination.display()))?;
    io::copy(&mut input, &mut output)
        .map_err(|error| format!("解压临时导入文件失败 {}: {error}", destination.display()))?;
    output
        .flush()
        .map_err(|error| format!("刷新临时导入文件失败 {}: {error}", destination.display()))
}

fn validate_archive<R: Read + Seek>(archive: &mut ZipArchive<R>) -> Result<(), String> {
    let mut total = 0u64;
    let mut supported = false;
    for index in 0..archive.len() {
        if index >= MAX_FILES {
            return Err(format!("压缩包文件数量超过上限 {MAX_FILES}"));
        }
        let file = archive
            .by_index(index)
            .map_err(|error| format!("读取压缩包目录失败: {error}"))?;
        let path = safe_entry_path(file.name())?;
        if file.is_symlink() {
            return Err(format!("压缩包包含符号链接: {}", file.name()));
        }
        if is_sensitive_path(&path) {
            return Err("压缩包包含禁止导入的 secrets.json".to_string());
        }
        if !file.is_dir() {
            if file.size() > MAX_ENTRY_BYTES {
                return Err(format!("单个压缩包文件超过上限: {}", file.name()));
            }
            total = total
                .checked_add(file.size())
                .ok_or_else(|| "压缩包解压大小溢出".to_string())?;
            if total > MAX_TOTAL_BYTES {
                return Err(format!(
                    "压缩包解压总大小超过上限 {} MiB",
                    MAX_TOTAL_BYTES / 1024 / 1024
                ));
            }
            supported |= is_supported_path(&path);
        }
    }
    if !supported {
        return Err(
            "不是有效的 SillyTavern 数据包：未发现 characters、chats、worlds 或支持的预设"
                .to_string(),
        );
    }
    Ok(())
}

fn extract_archive<R: Read + Seek>(mut archive: ZipArchive<R>, root: &Path) -> Result<(), String> {
    for index in 0..archive.len() {
        let mut file = archive
            .by_index(index)
            .map_err(|error| format!("读取压缩包条目失败: {error}"))?;
        let relative = safe_entry_path(file.name())?;
        let target = root.join(relative);
        if file.is_dir() {
            fs::create_dir_all(&target)
                .map_err(|error| format!("创建临时导入目录失败 {}: {error}", target.display()))?;
        } else {
            copy_entry(&mut file, &target)?;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn prepare_st_backup_import(
    app: tauri::AppHandle,
    roots: tauri::State<'_, AuthorizedRoots>,
) -> Result<Option<PreparedSTBackup>, String> {
    let Some(selected) = app
        .dialog()
        .file()
        .set_title("选择 SillyTavern 导出包")
        .add_filter("SillyTavern ZIP", &["zip"])
        .blocking_pick_file()
    else {
        return Ok(None);
    };
    let zip_path = selected
        .into_path()
        .map_err(|error| format!("选择结果不是本机文件: {error}"))?;
    let display_name = zip_path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("SillyTavern 导出包")
        .to_string();
    let file = File::open(&zip_path)
        .map_err(|error| format!("打开导出包失败 {}: {error}", zip_path.display()))?;
    let mut archive =
        ZipArchive::new(file).map_err(|error| format!("不是有效的 ZIP 文件: {error}"))?;
    validate_archive(&mut archive)?;

    let temp_root =
        std::env::temp_dir().join(format!("{TEMP_PREFIX}{}-{}", std::process::id(), nonce()?));
    fs::create_dir_all(&temp_root)
        .map_err(|error| format!("创建临时导入目录失败 {}: {error}", temp_root.display()))?;
    let result = (|| {
        let file = File::open(&zip_path)
            .map_err(|error| format!("重新打开导出包失败 {}: {error}", zip_path.display()))?;
        let archive = ZipArchive::new(file).map_err(|error| format!("读取导出包失败: {error}"))?;
        extract_archive(archive, &temp_root)?;
        let canonical = roots.authorize_temporary(&temp_root)?;
        Ok(PreparedSTBackup {
            root: canonical.to_string_lossy().into_owned(),
            display_name,
        })
    })();
    if result.is_err() {
        let _ = fs::remove_dir_all(&temp_root);
    }
    result.map(Some)
}

#[tauri::command]
pub fn cleanup_st_backup_import(
    roots: tauri::State<'_, AuthorizedRoots>,
    root: String,
) -> Result<(), String> {
    let canonical = roots.revoke_temporary(Path::new(&root))?;
    fs::remove_dir_all(&canonical)
        .map_err(|error| format!("清理临时导入目录失败 {}: {error}", canonical.display()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;
    use zip::write::{SimpleFileOptions, ZipWriter};

    fn zip_with(entries: &[(&str, &[u8])]) -> ZipArchive<Cursor<Vec<u8>>> {
        let mut bytes = Cursor::new(Vec::new());
        {
            let mut writer = ZipWriter::new(&mut bytes);
            for (name, content) in entries {
                writer
                    .start_file(*name, SimpleFileOptions::default())
                    .unwrap();
                writer.write_all(content).unwrap();
            }
            writer.finish().unwrap();
        }
        ZipArchive::new(Cursor::new(bytes.into_inner())).unwrap()
    }

    #[test]
    fn rejects_traversal_and_absolute_zip_paths() {
        for path in [
            "../outside.txt",
            "/outside.txt",
            "C:outside.txt",
            "dir\\file.txt",
        ] {
            assert!(
                safe_entry_path(path).is_err(),
                "path should be rejected: {path}"
            );
        }
        assert_eq!(
            safe_entry_path("characters/A.png").unwrap(),
            PathBuf::from("characters/A.png")
        );
    }

    #[test]
    fn rejects_secrets_and_requires_supported_content() {
        let mut secrets = zip_with(&[("secrets.json", b"{}"), ("characters/A.png", b"png")]);
        assert!(validate_archive(&mut secrets).is_err());

        let mut unsupported = zip_with(&[("notes/readme.txt", b"no ST data")]);
        assert!(validate_archive(&mut unsupported).is_err());
    }

    #[test]
    fn accepts_supported_package_with_safe_limits() {
        let mut archive = zip_with(&[
            ("characters/A.png", b"png"),
            ("chats/A/main.jsonl", b"{}\n"),
            ("settings.json", b"{\"extensions\":{\"regex\":[]}}"),
        ]);
        assert!(validate_archive(&mut archive).is_ok());
    }
}
