use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};

/// spike 阶段的最小文件访问层：列目录 / 读文本 / 写文本。
/// 7.2 FileVault 会在此之上实现 Repository 契约；这里先验证 Tauri IPC + 文件读写可行。

#[derive(Serialize, Debug, PartialEq)]
pub struct DirEntryInfo {
    pub name: String,
    pub is_dir: bool,
    pub size: u64,
}

fn list_dir_impl(path: &Path) -> Result<Vec<DirEntryInfo>, String> {
    let mut out = Vec::new();
    let entries = fs::read_dir(path).map_err(|e| format!("读取目录失败 {}: {e}", path.display()))?;
    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let meta = entry.metadata().map_err(|e| e.to_string())?;
        out.push(DirEntryInfo {
            name: entry.file_name().to_string_lossy().into_owned(),
            is_dir: meta.is_dir(),
            size: if meta.is_dir() { 0 } else { meta.len() },
        });
    }
    out.sort_by(|a, b| (b.is_dir, a.name.to_lowercase()).cmp(&(a.is_dir, b.name.to_lowercase())));
    Ok(out)
}

fn read_text_impl(path: &Path) -> Result<String, String> {
    fs::read_to_string(path).map_err(|e| format!("读取文件失败 {}: {e}", path.display()))
}

fn write_text_impl(path: &Path, content: &str) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("创建目录失败 {}: {e}", parent.display()))?;
    }
    // 先写临时文件再改名，避免写一半断电留下残缺文件
    let tmp = path.with_extension("ste-tmp");
    fs::write(&tmp, content).map_err(|e| format!("写入失败 {}: {e}", tmp.display()))?;
    fs::rename(&tmp, path).map_err(|e| format!("替换失败 {}: {e}", path.display()))?;
    Ok(())
}

#[tauri::command]
fn vault_list_dir(path: String) -> Result<Vec<DirEntryInfo>, String> {
    list_dir_impl(&PathBuf::from(path))
}

#[tauri::command]
fn vault_read_text(path: String) -> Result<String, String> {
    read_text_impl(&PathBuf::from(path))
}

#[tauri::command]
fn vault_write_text(path: String, content: String) -> Result<(), String> {
    write_text_impl(&PathBuf::from(path), &content)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
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
            vault_write_text
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
        write_text_impl(&file, "{\"名字\":\"赫敏\"}").unwrap();
        assert_eq!(read_text_impl(&file).unwrap(), "{\"名字\":\"赫敏\"}");
        // 覆盖写不留临时文件
        write_text_impl(&file, "v2").unwrap();
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
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn read_missing_file_reports_path() {
        let err = read_text_impl(Path::new("Z:/不存在/x.txt")).unwrap_err();
        assert!(err.contains("不存在"));
    }
}
