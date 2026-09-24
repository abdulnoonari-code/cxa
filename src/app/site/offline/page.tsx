import OfflineSite from '@/components/OfflineSite'

/**
 * The page the service worker keeps on the phone.
 *
 * `force-static` is the whole point and not an optimisation: this page must
 * contain NO server-rendered project data, because it is cached on a phone
 * and served from there, possibly days later, possibly to somebody who has
 * since been taken off the project. Everything it shows is drawn at runtime
 * from that phone's own store, which holds only what that phone was given
 * while its own account was signed in.
 *
 * So there is nothing here but a shell. That is what makes it safe to cache.
 */
export const dynamic = 'force-static'

export const metadata = {
  title: 'On Site — no signal needed',
}

export default function OfflinePage() {
  return <OfflineSite />
}
