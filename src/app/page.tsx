import { redirect } from 'next/navigation'

// There is no landing page any more.
//
// What used to be here was a title, a paragraph of description and four
// buttons — Equipment, Plan, Milestones, Issues — each opening a screen
// scoped to whatever project happened to be in a cookie. So the first thing
// somebody saw after logging in was a project screen, possibly for a project
// that was not theirs, possibly the worked example, with no indication that a
// choice had been made on their behalf.
//
// The register is the right first screen: it says what exists and what this
// person has access to, and opening one is a deliberate act. Everything the
// old page described is one click further on, and describing an application
// to somebody who has already logged into it was never worth a screen.

export default function Home() {
  redirect('/projects')
}
