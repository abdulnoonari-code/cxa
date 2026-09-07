'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { PANEL_COOKIE, PANELS, STANDARD_PANELS, encodePanels } from '@/lib/dashboard-panels'

const ONE_YEAR = 60 * 60 * 24 * 365

/**
 * Save which panels this browser shows.
 *
 * Every panel is a checkbox, so a box that is UNTICKED sends nothing at all
 * — which is how an HTML form says false. The list of ids is therefore taken
 * from the form, not from what is missing from it, and an empty result is a
 * real answer meaning "hide everything" rather than an error.
 */
export async function saveDashboardPanels(formData: FormData) {
  const ticked = PANELS.filter((p) => formData.get(`panel_${p.id}`) === 'on').map((p) => p.id)

  const store = await cookies()
  store.set(PANEL_COOKIE, encodePanels(ticked), {
    maxAge: ONE_YEAR,
    sameSite: 'lax',
    path: '/',
  })

  revalidatePath('/dashboard')
}

/** Back to the four a new person gets. */
export async function resetDashboardPanels() {
  const store = await cookies()
  store.set(PANEL_COOKIE, encodePanels(STANDARD_PANELS), {
    maxAge: ONE_YEAR,
    sameSite: 'lax',
    path: '/',
  })
  revalidatePath('/dashboard')
}
