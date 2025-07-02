use anyhow::{bail, Context, Result};
use flate2::{write::GzEncoder, Compression};
use std::{
    env, fs,
    io::Write,
    path::{Path, PathBuf},
    process::{Command, Stdio},
};

const PACKAGE_NAME: &str = env!("CARGO_PKG_NAME"); // <- replaces the old literal

fn find_workspace_root(mut dir: PathBuf) -> Result<PathBuf> {
    loop {
        if dir.join("Cargo.toml").exists() {
            return Ok(dir);
        }
        dir = dir
            .parent()
            .context("reached filesystem root without finding Cargo.toml")?
            .to_path_buf();
    }
}

fn print_rerun_triggers() -> Result<()> {
    // Change to taste — add source files, env vars, etc.
    println!("cargo:rerun-if-changed=src/lib.rs");
    Ok(())
}

fn compress(data: &[u8]) -> Result<Vec<u8>> {
    let mut enc = GzEncoder::new(Vec::with_capacity(data.len()), Compression::best());
    enc.write_all(data)?;
    Ok(enc.finish()?)
}

fn build_wasm(target_dir: &Path) -> Result<()> {
    let workspace_root = find_workspace_root(PathBuf::from(env::var("CARGO_MANIFEST_DIR")?))?;

    let status = Command::new("cargo")
        .env("CARGO_TARGET_DIR", target_dir) // artefacts go here
        .arg("build")
        .arg("--release")
        .arg("--target")
        .arg("wasm32-unknown-unknown")
        .arg("--package")
        .arg(PACKAGE_NAME)
        .arg("--manifest-path")
        .arg(workspace_root.join("Cargo.toml"))
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .status()
        .context("failed to spawn cargo")?;

    if !status.success() {
        bail!("cargo build exited with {}", status);
    }
    Ok(())
}

fn main() -> Result<()> {
    if std::env::var_os("RA_SKIP_WASM_BUILD").is_some() {
        // Tell Cargo when to re-run the script (so release builds still work)
        println!("cargo:rerun-if-changed=build.rs");
        println!("cargo:rerun-if-env-changed=RA_SKIP_WASM_BUILD");
        return Ok(()); // ← nothing else, so rust-analyzer’s
    }
    // ── 0. Abort early if we’re already running (prevents recursion) ─────────
    if env::var_os("ALKANE_BUILD_IN_PROGRESS").is_some() {
        eprintln!("build.rs: build already in progress – skipping to avoid recursion");
        return Ok(());
    }
    env::set_var("ALKANE_BUILD_IN_PROGRESS", "1");

    print_rerun_triggers()?;

    let out_dir = PathBuf::from(env::var("OUT_DIR")?);
    let alkane_target_dir = out_dir
        .ancestors()
        .nth(5) // climb to <workspace>/target
        .context("couldn’t determine target dir from OUT_DIR")?
        .join("alkanes"); // e.g. <workspace>/target/alkanes

    fs::create_dir_all(&alkane_target_dir)?;

    build_wasm(&alkane_target_dir)?;

    let artefact = alkane_target_dir
        .join("wasm32-unknown-unknown")
        .join("release")
        .join(format!("{PACKAGE_NAME}.wasm"));

    let wasm = fs::read(&artefact).with_context(|| format!("reading {}", artefact.display()))?;
    let gzip = compress(&wasm)?;

    fs::write(artefact.with_extension("wasm.gz"), &gzip)
        .with_context(|| "writing gzipped artefact")?;

    println!(
        "cargo:warning=WASM contract: {} ({} bytes, {} bytes gzipped)",
        artefact.display(),
        wasm.len(),
        gzip.len()
    );

    Ok(())
}
