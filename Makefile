APP_NAME := grabbit-desktop
HELPER := native/helper/.build/release/grabbit-helper

.PHONY: install dev build helper dist clean typecheck run stop

install:
	npm install

helper:
	swift build -c release --package-path native/helper

dev: helper
	npm run dev

build: helper
	npm run build

typecheck:
	npm run typecheck

dist: helper
	npm run dist

run: build
	npx electron .

stop:
	@pkill -f 'Electron.*grabbit-desktop' 2>/dev/null || true
	@pkill -f 'electron-vite' 2>/dev/null || true
	@osascript -e 'tell application id "ewew.design.grabbit-desktop" to quit' >/dev/null 2>&1 || true

clean:
	rm -rf out dist node_modules native/helper/.build

# SwiftUI archive lives at archive/swiftui and git branch/tag archive/swiftui + swiftui-archive
