PROJECT        := grabbit-swiftui.xcodeproj
SCHEME         := grabbit-swiftui
CONFIG         ?= Debug
DERIVED        := .build
DESTINATION    := platform=macOS,arch=arm64
APP            := $(DERIVED)/Build/Products/$(CONFIG)/grabbit-swiftui.app
BUNDLE_ID      := ewew.design.grabbit-swiftui

# Release packaging (Developer ID–signed, notarized, stapled .app)
RELEASE_APP    ?= grabbit-swiftui.app
DIST           := dist
DMG_ROOT       := $(DIST)/dmg-root
DMG            := $(DIST)/grabbit-swiftui.dmg
NOTARY_PROFILE ?= AC_PASSWORD
CREATE_DMG     := $(shell \
	if command -v create-dmg >/dev/null 2>&1; then command -v create-dmg; \
	elif [ -x tools/create-dmg/create-dmg ]; then echo tools/create-dmg/create-dmg; \
	else echo create-dmg; fi)

# Always use full Xcode.app toolchain (not bare Command Line Tools).
export DEVELOPER_DIR ?= /Applications/Xcode.app/Contents/Developer

XCODEBUILD     := xcodebuild \
	-project $(PROJECT) \
	-scheme $(SCHEME) \
	-configuration $(CONFIG) \
	-destination '$(DESTINATION)' \
	-derivedDataPath $(DERIVED)

.PHONY: ensure-xcode build run stop clean ensure-create-dmg dmg release

# Verify xcode-select / DEVELOPER_DIR point at Xcode.app before building.
ensure-xcode:
	@if [ ! -d "$(DEVELOPER_DIR)" ]; then \
		echo "error: Xcode not found at $(DEVELOPER_DIR)"; \
		echo "Install Xcode, then: sudo xcode-select -s /Applications/Xcode.app/Contents/Developer"; \
		exit 1; \
	fi
	@active="$$(xcode-select -p 2>/dev/null || true)"; \
	if [ "$$active" != "$(DEVELOPER_DIR)" ]; then \
		echo "note: xcode-select is '$$active'; using DEVELOPER_DIR=$(DEVELOPER_DIR) for this build"; \
	fi
	@xcrun --find xcodebuild >/dev/null
	@xcodebuild -version

# Stop every running grabbit-swiftui (Cursor .build + Xcode DerivedData copies).
# Also releases instances held by Xcode's debugserver (normal killall can't).
stop:
	@osascript -e 'tell application id "$(BUNDLE_ID)" to quit' >/dev/null 2>&1 || true
	@killall grabbit-swiftui 2>/dev/null || true
	@killall Grabbit 2>/dev/null || true
	@sleep 0.3
	@pids="$$(pgrep -f '/grabbit-swiftui\.app/Contents/MacOS/grabbit-swiftui' 2>/dev/null || true)"; \
	for pid in $$pids; do \
		ppid="$$(ps -o ppid= -p "$$pid" 2>/dev/null | tr -d ' ')"; \
		if [ -n "$$ppid" ] && [ "$$ppid" != "1" ]; then \
			pcmd="$$(ps -o command= -p "$$ppid" 2>/dev/null || true)"; \
			case "$$pcmd" in \
				*debugserver*) /bin/kill -9 "$$ppid" 2>/dev/null || true ;; \
			esac; \
		fi; \
		/bin/kill -9 "$$pid" 2>/dev/null || true; \
	done
	@killall -9 grabbit-swiftui 2>/dev/null || true
	@killall -9 Grabbit 2>/dev/null || true
	@sleep 0.2

build: ensure-xcode
	$(XCODEBUILD) build

run: build stop
	open "$(APP)"

clean: stop
	$(XCODEBUILD) clean
	rm -rf "$(DERIVED)"

ensure-create-dmg:
	@if ! command -v "$(CREATE_DMG)" >/dev/null 2>&1 && [ ! -x "$(CREATE_DMG)" ]; then \
		echo "error: create-dmg not found"; \
		echo "Install: brew install create-dmg"; \
		echo "Or clone into tools/: git clone --depth 1 https://github.com/create-dmg/create-dmg.git tools/create-dmg"; \
		exit 1; \
	fi

# Stage RELEASE_APP and build an installer-window DMG (does not notarize).
# Example: make dmg RELEASE_APP=/path/to/stapled/grabbit-swiftui.app
dmg: ensure-create-dmg
	@test -d "$(RELEASE_APP)" || { \
		echo "error: RELEASE_APP not found: $(RELEASE_APP)"; \
		echo "Pass a Developer ID–signed, notarized, stapled .app, e.g."; \
		echo "  make dmg RELEASE_APP=/path/to/grabbit-swiftui.app"; \
		exit 1; \
	}
	@mkdir -p "$(DMG_ROOT)"
	@rm -rf "$(DMG_ROOT)"/*
	@cp -R "$(RELEASE_APP)" "$(DMG_ROOT)/grabbit-swiftui.app"
	@rm -f "$(DMG)"
	"$(CREATE_DMG)" \
		--volname "grabbit-swiftui" \
		--window-pos 200 120 \
		--window-size 600 400 \
		--icon-size 100 \
		--icon "grabbit-swiftui.app" 150 190 \
		--app-drop-link 450 190 \
		--hide-extension "grabbit-swiftui.app" \
		"$(DMG)" \
		"$(DMG_ROOT)"
	@echo ""
	@echo "Created $(DMG)"
	@echo "Next — notarize and staple the DMG (not auto-run):"
	@echo "  xcrun notarytool submit $(DMG) --keychain-profile \"$(NOTARY_PROFILE)\" --wait"
	@echo "  xcrun stapler staple $(DMG)"
	@echo "  spctl --assess --type open --context context:primary-signature -v $(DMG)"
	@echo "Then publish: make release TAG=v0.1.0"

# Publish stapled dist/grabbit-swiftui.dmg to GitHub Releases (stable asset name).
# Requires: gh auth login, public repo, TAG=vX.Y.Z
release:
	@test -f "$(DMG)" || { echo "error: missing $(DMG) — run make dmg first"; exit 1; }
	@test -n "$(TAG)" || { echo "error: set TAG=v0.1.0 (or similar)"; exit 1; }
	@GH=$$(command -v gh 2>/dev/null || true); \
	if [ -z "$$GH" ] && [ -x tools/gh/gh ]; then GH=tools/gh/gh; fi; \
	if [ -z "$$GH" ]; then echo "error: gh not found — brew install gh && gh auth login"; exit 1; fi; \
	"$$GH" release create "$(TAG)" "$(DMG)" \
		--title "grabbit-swiftui $$(echo '$(TAG)' | sed 's/^v//')" \
		--notes "Notarized macOS build."
	@echo ""
	@echo "Download URL:"
	@echo "  https://github.com/ethanwatsonj/grabbit-swiftui/releases/latest/download/grabbit-swiftui.dmg"
