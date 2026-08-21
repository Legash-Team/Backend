# Legash Sprint 3 Source Of Truth

This document describes the full user-facing flow for all three actors — Hospital, Donor,
Super Admin — as decided for Sprint 3. It reflects the flow exactly as specified, with all
corrections applied.

---

## Hospital Flow

1. Hospitals start at the landing page, then click Register/Login.
2. Clicking Register takes them to the registration page.
3. The registration page contains these fields: name, email, license number, password,
   confirm password, contact/phone, a location-sharing button, and a checkbox for Terms &
   Policy.
4. After filling this and clicking Register, they're redirected to a "Verify your email" page.
   A 6-digit OTP is sent to their email. This page also has a resend-code link, which
   activates every 60 seconds until the email is verified.
5. The hospital enters the OTP from their email. Entering it correctly verifies the email and
   takes them to the login page.
6. The hospital goes to the login page, enters email and password, and clicks Login. Hospitals
   always need to log in with email and password to use the website — there is no persistent
   multi-month session that skips this. They can save their email and password in their
   browser (e.g. Chrome/Google's saved-password feature) for convenience, but the login step
   itself always happens. Right now, it tells them their account is not yet approved by Super
   Admin, in a popup window, and they need to wait until approved.
7. When a hospital registers, Super Admin also receives that hospital's info from the
   database — every field they entered, except password — shown on the admin dashboard.
8. Super Admin can approve or reject each hospital:
   - **If approved**, the hospital receives an approval email saying they can now log in.
   - **If rejected**, the hospital receives a rejection email with a reason — when Super Admin
     rejects a hospital, they fill in a reason, and that reason is included in the email.
9. If a hospital receives a rejection email, they can send feedback to Super Admin — there's a
   place for this in the email. This is a genuine, working feedback feature: the feedback
   Super Admin receives appears in a dedicated **Feedbacks** section on their dashboard.
10. If the hospital gets accepted, they can log in.
11. After logging in, hospitals are taken to a dashboard welcome page showing their info.
12. Their sidebar contains these pages: Profile, Blood Stock, Blood Request, All Requests.

### Hospital — Profile page
- **Editable:** name; email (requires re-verification when changed); contact/phone (editable
  directly, **no verification needed** for phone changes); password (see "Change password"
  below).
- **Uneditable:** license number, and **location — uneditable, cannot be changed at all.**
- **Change password:** sits next to the password field. If the hospital remembers their
  current password, they enter it along with the new password and confirm it. If they don't
  remember it, they verify their email first, then enter and confirm the new password. This
  is a separate flow from the existing forgot-password flow (which applies when they're
  logged out) — this one runs from inside the logged-in profile page.
- **Delete account and Log out:** the profile page includes a Delete Account option (permanently
  deletes all of the hospital's data) and a Log Out option (logs them out, their data stays).

### Hospital — Blood Stock page
- Lets hospitals update their stock/number of kits for every blood type, via increment and
  decrement controls per type on the frontend.
- No password re-entry is needed to edit here — since hospitals already log in with email and
  password every time they use the website (see Hospital Flow step 6), the increment/decrement
  controls are directly editable as soon as the hospital is logged in, with no extra popup or
  gate on this page.

### Hospital — Blood Request page
- A form to request blood, with fields: blood type needed, how many kits, whether it's an
  emergency or not urgent request, a description field for any notes, and a set time/day for
  when the request should close. **The hospital sets this closing time themselves** — it's not
  a fixed system default.
- When the request is created, it notifies all donors with a **compatible** blood type who are
  near the hospital's location — not just an exact blood-type match. Compatibility follows
  standard blood donation rules: for example, a request for A+ notifies donors with A+, A-,
  O+, and O- (every type that can donate to A+), following the full compatibility chart (O- is
  a universal donor to everyone; AB+ can receive from everyone; each other type has its own
  specific list of compatible donor types).
- Hospitals can create multiple requests at the same time.
- Clicking "Send Request" doesn't send it immediately — a confirmation popup appears first,
  showing the quantity and blood type ("You are requesting [quantity] units of [blood type].
  Are you sure you want to send this request?"), with Send and Cancel options. Clicking Send
  sends the request (triggering the donor notifications above). Clicking Cancel takes the
  hospital back to the form exactly as they filled it, so they can still edit it before
  deciding again.

### Hospital — All Requests page
- Where hospitals manage their requests. For each request, they can see who accepted it,
  along with that donor's profile and contact info.
- Requests are filtered by three toggles at the top: **All**, **Emergency**, and **Not
  Urgent**.

---

## Donor Flow

1. Donors are taken to an onboarding page when the app opens, then can choose to create an
   account.
2. Clicking Create Account takes them to the registration page, with fields: name, phone,
   Fayda National ID (FIN), gender, blood type, a location-sharing button, and a checkbox for
   Terms & Policy. **No password or confirm password field** — donors don't set a password at
   registration at all (see step 4 below for how they authenticate instead). Below the blood
   type field is a checkbox: "I don't know my blood type." Checking it lets the donor continue
   registration without picking a blood type — but until they later fill in a real blood type
   from their profile, they won't receive any blood-request notifications, since matching
   depends on knowing their type.
3. After clicking Register, they're taken to a "Verify your phone" page with OTP entry. This
   page lets them enter the 6-digit OTP received by SMS, and includes a resend-code link that
   activates after 60 seconds to resend the SMS OTP.
4. After verifying their phone via OTP, they're redirected to a "Set PIN" page, where they
   choose and confirm a 4-digit PIN. Once set, they're taken straight into the app — no
   separate login step is needed right after registration, since verifying the phone and
   setting the PIN together are what establish the account. From then on, every time they open
   the app, they're asked only for their 4-digit PIN to get back in — no phone number and no
   password, the same pattern as a banking app's PIN unlock.
   - **How the PIN actually identifies the right donor:** the PIN itself is never looked up
     against every donor in the database — two donors can have the same PIN with no conflict.
     Instead, the app installed on the donor's phone is tied to their specific account (via a
     secure session/token stored on that device once they verify their phone and set the PIN).
     Entering the PIN just unlocks *that device's* already-known account — it's the device
     that identifies the donor, the PIN just proves it's really them holding it, the same way
     a bank card identifies the account and the PIN just proves it's the right person using it.
   - **New phone or app reinstall:** since the device is what ties the PIN to the account, a
     donor moving to a new phone (or reinstalling the app) has no PIN-only way back in — the
     app no longer has that stored link on the new device. They'll need to verify their phone
     number by SMS OTP again first (proving it's really their number), and then either
     re-enter their existing PIN or set a new one, the same way "forgot PIN" already works.
5. After logging in, donors are taken to their dashboard. The dashboard shows a welcome-to-
   Legash message, along with an **Events section** showing events posted by Super Admin — if
   none have been posted, it says so. (Events is not a separate tab this sprint — it lives
   directly inside the Dashboard.)
6. From the dashboard, donors can also navigate to: Profile, Requests, and Donation History.

### Donor — Profile page
Fields: name, contact/phone, PIN, FIN number, date of birth, gender, blood type, weight,
health condition/notes.
- **Editable:** name; phone (requires OTP verification for the new number — clicking "change
  phone" takes them to a verify-phone-by-OTP page); PIN (see "Change PIN" below); date of
  birth; blood type (including filling it in for the first time if "I don't know my blood
  type" was checked at registration — see below); weight; height; health condition (a
  free-text bio/description field).
- **Uneditable:** gender, FIN number.
- **Change PIN:** if the donor remembers their current PIN, they enter it along with the new
  PIN and confirm it. If they don't remember it, they verify their phone by OTP first, then
  enter and confirm the new PIN. This is a separate flow from the forgot-PIN flow (which
  applies when logged out, and now uses the same phone-OTP verification since donors no
  longer have a password) — this one runs from inside the logged-in profile page.
- No fields on this page are hidden or gated behind re-entering the PIN or a password — every
  field (name, phone, DOB, gender, blood type, FIN number, weight, height, health condition)
  is visible as soon as the donor opens their profile, the same as any other page, once they've
  logged in with their PIN.
- **Blood type note:** if the donor checked "I don't know my blood type" at registration, this
  field instead shows a note: "Enter your blood type to receive donation requests. You can
  find out your blood type at the nearest blood donation center, or check with the nearest
  hospital." — replacing the blood type value until they fill it in themselves.
- **Delete account and Log out:** the profile page includes a Delete Account option
  (permanently deletes all of the donor's data) and a Log Out option (logs them out, their
  data stays).

### Donor — Requests page
- Shows the status of the donor's requests, updating each day based on whatever requests they
  receive that day.
- Requests that haven't been responded to yet also appear here, alongside ones already
  accepted or denied.
- Three toggles: **Accepted**, **Denied**, and **Ongoing** — switching a toggle lists that
  day's requests under that category.
- When a donor accepts a request, their contact info is shared with the hospital, and the
  hospital can contact them. Alternatively, the donor can see the hospital's location and go
  there, or contact the hospital themselves. These are presented to the donor as suggestions —
  a popup shown right when they tap Accept, listing these three options as things they can do
  next. The donor chooses freely; they aren't required to report back which option they took.

### Donor — Donation History page
- Shows the donor's donation history. For now, since this data would need to come from
  hospitals and that data doesn't exist yet, this page is empty — there's no donation history
  to show yet.

### Donor — Nearby Blood Centers page
- A page for donors to search for nearby blood centers. Since Super Admin hasn't registered
  any centers yet, this page shows real empty data — a message saying no blood centers are
  registered yet, not an error.

---

## Super Admin Flow

1. The Super Admin account is hardcoded — they're directed straight to a login page and enter
   using their email and password.
2. After logging in, they're taken to their dashboard, where they can see every hospital that's
   requested approval, and can approve or reject each one (with a reason required for
   rejection).
3. The dashboard also links to a **Feedbacks** section, where feedback submitted by rejected
   hospitals (via the link in their rejection email) appears.
4. The dashboard also links to two other pages: the Event Posting page and the Admin Creation
   page.

### Super Admin — Event Posting page
- A form with fields: image or video, description, an applying link (if any), and a time/date
  limit — the event shows as Closed once that time passes, and Open while it hasn't yet passed.

### Super Admin — Admin Creation page
- Super Admin creates new Admins by filling a form: name, email, and role (chosen from "can
  approve hospitals," "can post events," or both).
- Clicking Create sends that email an Admin verification email. Clicking the link in that
  email takes them to an "email verified" page telling them they can set up their password.

---

## Notes carried over from earlier discussion, still accurate

- Hospital-to-hospital search by blood type (with an optional "how many kits" filter that
  doesn't have to be matched exactly — nearby hospitals with less stock than requested can
  still appear in results) remains part of the plan, as previously discussed.

*(The earlier note about hospitals and donors staying logged in for ~3 months without
re-entering credentials has been superseded — see the updated Hospital Flow step 6 and Donor
Flow steps 3–4 above: hospitals now always log in with email/password, and donors now unlock
the app with their 4-digit PIN instead.)*
