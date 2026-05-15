.PHONY: help install run build build-macos build-macos-arm build-macos-intel build-macos-universal clean check lint fetch-binaries
.DEFAULT_GOAL := help

NPM ?= npm
BIN_DIR := src-tauri/binaries
FFMPEG_ARM_URL := https://www.osxexperts.net/ffmpeg71arm.zip
FFMPEG_INTEL_URL := https://www.osxexperts.net/ffmpeg71intel.zip
FFPROBE_ARM_URL := https://www.osxexperts.net/ffprobe71arm.zip
FFPROBE_INTEL_URL := https://www.osxexperts.net/ffprobe71intel.zip

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[1m%-22s\033[0m %s\n", $$1, $$2}'

install: ## Install JS deps (node_modules)
	$(NPM) install

fetch-binaries: ## Download ffmpeg/ffprobe macOS binaries into src-tauri/binaries/
	@mkdir -p $(BIN_DIR)
	@TMP=$$(mktemp -d) && \
	echo "Fetching ffmpeg (arm64)…" && \
	curl -sSL -o $$TMP/ffmpeg-arm.zip $(FFMPEG_ARM_URL) && \
	unzip -o -q $$TMP/ffmpeg-arm.zip -d $$TMP/ffmpeg-arm && \
	cp $$TMP/ffmpeg-arm/ffmpeg $(BIN_DIR)/ffmpeg-aarch64-apple-darwin && \
	echo "Fetching ffmpeg (x86_64)…" && \
	curl -sSL -o $$TMP/ffmpeg-intel.zip $(FFMPEG_INTEL_URL) && \
	unzip -o -q $$TMP/ffmpeg-intel.zip -d $$TMP/ffmpeg-intel && \
	cp $$TMP/ffmpeg-intel/ffmpeg $(BIN_DIR)/ffmpeg-x86_64-apple-darwin && \
	echo "Fetching ffprobe (arm64)…" && \
	curl -sSL -o $$TMP/ffprobe-arm.zip $(FFPROBE_ARM_URL) && \
	unzip -o -q $$TMP/ffprobe-arm.zip -d $$TMP/ffprobe-arm && \
	cp $$TMP/ffprobe-arm/ffprobe $(BIN_DIR)/ffprobe-aarch64-apple-darwin && \
	echo "Fetching ffprobe (x86_64)…" && \
	curl -sSL -o $$TMP/ffprobe-intel.zip $(FFPROBE_INTEL_URL) && \
	unzip -o -q $$TMP/ffprobe-intel.zip -d $$TMP/ffprobe-intel && \
	cp $$TMP/ffprobe-intel/ffprobe $(BIN_DIR)/ffprobe-x86_64-apple-darwin && \
	chmod +x $(BIN_DIR)/* && \
	rm -rf $$TMP
	@echo "Done. Binaries in $(BIN_DIR):" && ls -lh $(BIN_DIR)

run: install fetch-binaries ## Run the app in dev mode (tauri dev)
	$(NPM) run tauri dev

build: install fetch-binaries ## Production build for the current host architecture
	$(NPM) run tauri build

# Build for whichever Mac architecture the build host is running on.
build-macos: install fetch-binaries ## Build .app + .dmg for macOS (current host arch)
	$(NPM) run tauri build

build-macos-arm: install fetch-binaries ## Build .app + .dmg for macOS Apple Silicon (aarch64)
	$(NPM) run tauri build -- --target aarch64-apple-darwin

build-macos-intel: install fetch-binaries ## Build .app + .dmg for macOS Intel (x86_64)
	$(NPM) run tauri build -- --target x86_64-apple-darwin

build-macos-universal: install fetch-binaries ## Build a universal macOS binary (both architectures)
	$(NPM) run tauri build -- --target universal-apple-darwin

check: ## Type-check frontend + cargo check backend
	$(NPM) exec -- tsc --noEmit
	cargo check --manifest-path src-tauri/Cargo.toml

clean: ## Remove build artifacts (node_modules and target stay)
	rm -rf dist
	rm -rf src-tauri/target/release/bundle
