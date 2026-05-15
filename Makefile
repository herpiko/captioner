.PHONY: help install run build build-macos build-macos-arm build-macos-intel build-macos-universal clean check lint fetch-binaries refetch-binaries version set-version release
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

# File targets: each binary is only fetched when missing. Make's own
# dependency tracking handles caching — touch / rm a file to re-fetch one.
$(BIN_DIR)/ffmpeg-aarch64-apple-darwin:
	@mkdir -p $(BIN_DIR) && TMP=$$(mktemp -d) && \
	echo "Fetching ffmpeg (arm64)…" && \
	curl -sSL -o $$TMP/a.zip $(FFMPEG_ARM_URL) && \
	unzip -o -q $$TMP/a.zip -d $$TMP/x && \
	cp $$TMP/x/ffmpeg $@ && chmod +x $@ && rm -rf $$TMP

$(BIN_DIR)/ffmpeg-x86_64-apple-darwin:
	@mkdir -p $(BIN_DIR) && TMP=$$(mktemp -d) && \
	echo "Fetching ffmpeg (x86_64)…" && \
	curl -sSL -o $$TMP/a.zip $(FFMPEG_INTEL_URL) && \
	unzip -o -q $$TMP/a.zip -d $$TMP/x && \
	cp $$TMP/x/ffmpeg $@ && chmod +x $@ && rm -rf $$TMP

$(BIN_DIR)/ffprobe-aarch64-apple-darwin:
	@mkdir -p $(BIN_DIR) && TMP=$$(mktemp -d) && \
	echo "Fetching ffprobe (arm64)…" && \
	curl -sSL -o $$TMP/a.zip $(FFPROBE_ARM_URL) && \
	unzip -o -q $$TMP/a.zip -d $$TMP/x && \
	cp $$TMP/x/ffprobe $@ && chmod +x $@ && rm -rf $$TMP

$(BIN_DIR)/ffprobe-x86_64-apple-darwin:
	@mkdir -p $(BIN_DIR) && TMP=$$(mktemp -d) && \
	echo "Fetching ffprobe (x86_64)…" && \
	curl -sSL -o $$TMP/a.zip $(FFPROBE_INTEL_URL) && \
	unzip -o -q $$TMP/a.zip -d $$TMP/x && \
	cp $$TMP/x/ffprobe $@ && chmod +x $@ && rm -rf $$TMP

fetch-binaries: $(BIN_DIR)/ffmpeg-aarch64-apple-darwin $(BIN_DIR)/ffmpeg-x86_64-apple-darwin $(BIN_DIR)/ffprobe-aarch64-apple-darwin $(BIN_DIR)/ffprobe-x86_64-apple-darwin ## Download ffmpeg/ffprobe macOS binaries (cached — only fetches missing ones)

refetch-binaries: ## Force re-download of all ffmpeg/ffprobe binaries
	rm -f $(BIN_DIR)/ffmpeg-* $(BIN_DIR)/ffprobe-*
	$(MAKE) fetch-binaries

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

version: ## Print current version
	@grep -E '^version' src-tauri/Cargo.toml | head -1 | sed -E 's/version = "(.+)"/\1/'

# Bump version atomically across package.json, Cargo.toml, and tauri.conf.json.
# Usage: make set-version VERSION=0.2.0
set-version: ## Update version in package.json, package-lock.json, Cargo.toml, Cargo.lock, and tauri.conf.json
	@if [ -z "$(VERSION)" ]; then echo "Usage: make set-version VERSION=x.y.z"; exit 1; fi
	@sed -i.bak -E 's/"version": "[^"]+"/"version": "$(VERSION)"/' package.json && rm package.json.bak
	@sed -i.bak -E '1,/^version = "[^"]+"/{ s/^version = "[^"]+"/version = "$(VERSION)"/; }' src-tauri/Cargo.toml && rm src-tauri/Cargo.toml.bak
	@sed -i.bak -E 's/"version": "[^"]+"/"version": "$(VERSION)"/' src-tauri/tauri.conf.json && rm src-tauri/tauri.conf.json.bak
	@$(NPM) install --package-lock-only --silent
	@cargo check --manifest-path src-tauri/Cargo.toml --offline --quiet 2>/dev/null || \
		cargo check --manifest-path src-tauri/Cargo.toml --quiet
	@echo "Set version to $(VERSION) in package.json, package-lock.json, Cargo.toml, Cargo.lock, tauri.conf.json"
	@echo "Next: git add -A && git commit -m 'Release v$(VERSION)' && git tag v$(VERSION) && git push --follow-tags"

# Convenience: bump, commit, tag, push in one command.
# Usage: make release VERSION=0.2.0
release: ## Bump version, commit, tag v<VERSION>, and push (run on a clean tree)
	@if [ -z "$(VERSION)" ]; then echo "Usage: make release VERSION=x.y.z"; exit 1; fi
	@if [ -n "$$(git status --porcelain)" ]; then \
		echo "Working tree is dirty — commit or stash first."; exit 1; \
	fi
	@$(MAKE) set-version VERSION=$(VERSION)
	@git add package.json package-lock.json src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/tauri.conf.json
	@git commit -m "Release v$(VERSION)"
	@git tag -a v$(VERSION) -m "Release v$(VERSION)"
	@git push --follow-tags
	@echo ""
	@echo "Tagged v$(VERSION) and pushed."
	@echo "Build the dmg with: make build-macos"
