import Store from 'electron-store'
import fs from 'fs'
import type { AppSettings, OrganizeProvider } from '../../shared/types'
import { destinationMirrorPath } from './paths'

const store = new Store<AppSettings>({
  name: 'settings',
  defaults: {
    destinationFolder: null,
    onboardingComplete: false,
    libraryIntroSeen: false,
    organizeProvider: 'gemini',
    libraryWidth: 1024,
    libraryHeight: 720,
    recordingBackground: 'none',
    micEnabledDefault: false
  }
})

export function getSettings(): AppSettings {
  // Migrate destination from Swift mirror file if store empty.
  if (!store.get('destinationFolder')) {
    const mirror = destinationMirrorPath()
    if (fs.existsSync(mirror)) {
      const p = fs.readFileSync(mirror, 'utf8').trim()
      if (p && fs.existsSync(p)) {
        store.set('destinationFolder', p)
      }
    }
  }
  return {
    destinationFolder: store.get('destinationFolder'),
    onboardingComplete: store.get('onboardingComplete'),
    libraryIntroSeen: store.get('libraryIntroSeen'),
    organizeProvider: store.get('organizeProvider'),
    libraryWidth: store.get('libraryWidth'),
    libraryHeight: store.get('libraryHeight'),
    recordingBackground: store.get('recordingBackground'),
    micEnabledDefault: store.get('micEnabledDefault')
  }
}

export function setSettings(partial: Partial<AppSettings>): AppSettings {
  for (const [key, value] of Object.entries(partial)) {
    if (value !== undefined) {
      store.set(key as keyof AppSettings, value as never)
    }
  }
  if (partial.destinationFolder) {
    fs.writeFileSync(destinationMirrorPath(), partial.destinationFolder, 'utf8')
  }
  return getSettings()
}

export function setOrganizeProvider(provider: OrganizeProvider): void {
  store.set('organizeProvider', provider)
}
