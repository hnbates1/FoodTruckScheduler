import Link from "next/link";

export const metadata = {
  title: "Privacy | Food Truck Admin",
};

export default function PrivacyPage() {
  return <main className="legal-page">
    <article>
      <p className="eyebrow">FOOD TRUCK ADMIN</p>
      <h1>Privacy</h1>
      <p>Food Truck Admin stores the truck, schedule, location, and account information entered by authorized users so the store can coordinate food-truck visits.</p>
      <h2>Google Business Information</h2>
      <p>When an administrator or manager requests an online rating, the truck name and store area are sent to Google Places to find the correct public business listing. Food Truck Admin permanently stores only the selected Google Place ID. Ratings, review counts, and summaries are requested live and are not saved in the Food Truck Admin database.</p>
      <h2>Account Information</h2>
      <p>Passwords are stored only as password hashes. Session cookies are used to keep signed-in users authenticated. Public schedule links omit truck contacts, compliance dates, and internal notes.</p>
      <h2>Google Terms</h2>
      <p>Google-sourced information is also governed by the <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">Google Privacy Policy</a>.</p>
      <Link className="secondary" href="/">← Return to Food Truck Admin</Link>
    </article>
  </main>;
}
