import { useEffect, useState } from 'react'
import { LibraryPage } from './windows/LibraryPage'
import { SettingsPage } from './windows/SettingsPage'
import { OnboardingPage } from './windows/OnboardingPage'
import { AnnotatePage } from './windows/AnnotatePage'
import { VideoAnnotatePage } from './windows/VideoAnnotatePage'
import { CaptureBarPage } from './windows/CaptureBarPage'
import { RegionPage } from './windows/RegionPage'
import { WindowPickPage } from './windows/WindowPickPage'
import { ToastPage } from './windows/ToastPage'
import { KitchenSinkPage } from './windows/KitchenSinkPage'

function currentRoute(): string {
  const hash = window.location.hash.replace(/^#\/?/, '')
  return hash || 'library'
}

export function App() {
  const [route, setRoute] = useState(currentRoute)

  useEffect(() => {
    const onHash = () => setRoute(currentRoute())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  switch (route) {
    case 'settings':
      return <SettingsPage />
    case 'onboarding':
      return <OnboardingPage />
    case 'annotate':
      return <AnnotatePage />
    case 'video-annotate':
      return <VideoAnnotatePage />
    case 'capture-bar':
      return <CaptureBarPage />
    case 'region':
      return <RegionPage />
    case 'window-pick':
      return <WindowPickPage />
    case 'toast':
      return <ToastPage />
    case 'kitchen-sink':
      return <KitchenSinkPage />
    case 'library':
    default:
      return <LibraryPage />
  }
}
